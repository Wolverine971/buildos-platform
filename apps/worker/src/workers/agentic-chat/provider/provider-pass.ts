// apps/worker/src/workers/agentic-chat/provider/provider-pass.ts

import { AGENTIC_CHAT_LIVE_TEXT_PREVIEW_MAX_BYTES } from '@buildos/shared-types';
import type { AgenticChatProviderCapacity } from './provider-capacity';
import type {
	AgenticChatLiveTextPreviewPortV1,
	AgenticChatProviderPassRoleV1,
	AgenticChatTurnProviderClientEventV1,
	AgenticChatTurnProviderClientPortV1,
	AgenticChatTurnProviderRequestV1
} from './contracts';
import { throwIfAborted } from '../shared/abortable-deadline';
import { canonicalFinishedReason, providerError } from './protocol';
import { providerClientRequest } from './request-builders';
import {
	ACTING_OUTPUT_TOKENS,
	isActingOutputPass,
	outputBudgetInstruction,
	outputBudgetSignal
} from './output-budget';
import {
	appendToolCallDelta,
	createToolCallAccumulator,
	detectToolCallPassTruncation
} from './stream-tool-calls';

const MAX_RETRYABLE_PROVIDER_PASS_RETRIES = 1;
const MAX_BUFFERED_PROVIDER_PASS_BYTES = 512 * 1024;

/** At most one live-preview broadcast per this interval for one pass (and so one turn). */
export const LIVE_TEXT_PREVIEW_INTERVAL_MS = 100;

/**
 * Passes whose prose can become the user's answer: the acting loop (opening
 * pass, continuations, repairs) and forced synthesis. Reviewer lanes and
 * other internal passes carry their own roles and never preview.
 */
const LIVE_TEXT_PREVIEW_PASS_ROLES: ReadonlySet<AgenticChatProviderPassRoleV1> =
	new Set<AgenticChatProviderPassRoleV1>(['acting', 'repair', 'final_response']);

/**
 * The preview port for this pass, or null. Decided only from structured pass
 * state: the client must carry a port (only the acting client does), the role
 * must be user-facing, and a `required` pass is excluded because it must call
 * a tool — any prose it writes is withheld or re-asked, never the answer.
 */
export function livePreviewPortFor(
	request: AgenticChatTurnProviderRequestV1,
	client: AgenticChatTurnProviderClientPortV1
): AgenticChatLiveTextPreviewPortV1 | null {
	const port = client.livePreview;
	if (!port) return null;
	if (request.toolChoice === 'required') return null;
	return LIVE_TEXT_PREVIEW_PASS_ROLES.has(request.passRole ?? 'acting') ? port : null;
}

/**
 * Holds one complete provider pass behind an atomic boundary. Once a stream
 * opens, partial assistant output cannot be retracted, so a retryable failure
 * is discarded and retried once with a distinct physical attempt identity.
 *
 * A pass whose streamed tool calls are truncated (arguments cut off, or a
 * finish reason that contradicts the calls) is treated the same way: nothing
 * from the buffered pass has reached the executor, so it is discarded and
 * retried once. The production client already marks the truncating route as
 * failed for the turn, so the retry lands on the next model/provider. Actor
 * output-budget exhaustion is separate: one reasoning-off recovery on the
 * healthy endpoint, with no partial text or calls released.
 *
 * When the client carries a live-preview port, a user-facing pass also
 * forwards its visible text to that port as it arrives, before buffering.
 * The preview is display-only: it never changes what this generator yields,
 * a retried or failed attempt sends `discard`, and a completed attempt
 * flushes its final text before any buffered event is released.
 */
export async function* streamBufferedProviderPass(
	request: AgenticChatTurnProviderRequestV1,
	client: AgenticChatTurnProviderClientPortV1,
	capacity: Pick<AgenticChatProviderCapacity, 'markTemporarilyUnavailable'>,
	retryableFailureCooldownMs: number,
	outputPolicy?: { pressure(): void; claimRecovery(): boolean }
): AsyncGenerator<AgenticChatTurnProviderClientEventV1> {
	const firstAttempt = request.providerAttempt ?? 1;
	let attemptRequest = request;
	const previewPort = livePreviewPortFor(request, client);
	for (let retryCount = 0; retryCount <= MAX_RETRYABLE_PROVIDER_PASS_RETRIES; retryCount += 1) {
		const providerAttempt = firstAttempt + retryCount;
		const preview = previewPort
			? new LiveTextPreviewEmitter(previewPort, request, providerAttempt)
			: null;
		try {
			const buffered: AgenticChatTurnProviderClientEventV1[] = [];
			let bufferedBytes = 0;
			let retry = false;
			let terminal = false;
			let terminalError = false;
			const retriesRemain = retryCount < MAX_RETRYABLE_PROVIDER_PASS_RETRIES;
			// Shadow of the consumer's accumulator, used only to recognise a
			// truncated pass before it is released. Protocol violations are left for
			// the consumer to name; they make the pass unobservable here.
			const shadowToolCalls = createToolCallAccumulator();
			let shadowObservable = true;

			for await (const received of client.stream({
				...providerClientRequest({ ...attemptRequest, providerAttempt }),
				allowSlowStreamRecovery: retriesRemain && !attemptRequest.outputBudgetRecovery,
				finalBufferedAttempt: !retriesRemain || attemptRequest.outputBudgetRecovery === true
			})) {
				throwIfAborted(request.signal);
				let event = received;
				// Also cover compatible clients/fixtures which return length as done.
				if (event.type === 'done' && isActingOutputPass(request)) {
					const signal =
						event.outputBudget ??
						outputBudgetSignal(
							request.maxOutputTokens ?? ACTING_OUTPUT_TOKENS,
							canonicalFinishedReason(event.finishedReason),
							null
						);
					if (signal?.kind === 'exhausted')
						event = {
							type: 'error',
							error: 'Actor output budget exhausted',
							retryable: true,
							cause: 'output_budget_exhausted',
							outputBudget: signal
						};
					else if (signal) outputPolicy?.pressure();
				}
				if (event.type === 'error') {
					const exhausted = event.cause === 'output_budget_exhausted';
					if (exhausted) outputPolicy?.pressure();
					// Leave at least five seconds for a viable attempt and five for finalization.
					const recoveryTimeAvailable =
						!request.budget || request.budget.deadlineAtMs - Date.now() >= 10_000;
					const budgetRetry =
						exhausted &&
						isActingOutputPass(request) &&
						recoveryTimeAvailable &&
						retriesRemain &&
						!attemptRequest.outputBudgetRecovery &&
						(outputPolicy?.claimRecovery() ?? true);
					if (budgetRetry) {
						attemptRequest = {
							...request,
							reasoningEffort: 'none',
							outputBudgetRecovery: true,
							messages: [
								...request.messages,
								{
									role: 'system',
									content: `The previous pass exhausted its output budget and none of its calls executed. Emit only the next correct stage from existing evidence. Never repeat successful writes. ${outputBudgetInstruction(event.outputBudget?.limit ?? ACTING_OUTPUT_TOKENS)}`
								}
							]
						};
						retry = true;
						break;
					}
					if (
						!exhausted &&
						!attemptRequest.outputBudgetRecovery &&
						event.retryable &&
						retriesRemain
					) {
						if (!event.cause) {
							capacity.markTemporarilyUnavailable(
								request.turnRunId,
								retryableFailureCooldownMs
							);
						}
						retry = true;
						break;
					}
					// A tool-free pass has nothing half-executed to retract: it can
					// emit no tool call, and no later round replays it. Its prose is
					// the honest partial answer the user is owed when the last attempt
					// dies, so it is released ahead of the error and the consumer
					// decides whether it is usable (people-synthesis timeout,
					// 2026-07-22). Every tool-enabled pass keeps the atomic boundary.
					const recoverablePartial =
						request.toolChoice === 'none' &&
						!exhausted &&
						!attemptRequest.outputBudgetRecovery
							? buffered.filter((candidate) => candidate.type === 'text')
							: [];
					buffered.length = 0;
					buffered.push(
						...recoverablePartial,
						exhausted || attemptRequest.outputBudgetRecovery
							? { ...event, cause: 'output_budget_exhausted', retryable: false }
							: event
					);
					terminal = true;
					terminalError = true;
					break;
				}

				if (event.type === 'text') preview?.append(event.content);
				bufferedBytes += Buffer.byteLength(JSON.stringify(event), 'utf8');
				if (bufferedBytes > MAX_BUFFERED_PROVIDER_PASS_BYTES) {
					throw providerError('provider_pass_buffer_exceeded', 'permanent');
				}
				buffered.push(event);
				if (event.type === 'tool_call' && shadowObservable) {
					try {
						appendToolCallDelta(shadowToolCalls, event.toolCall);
					} catch {
						shadowObservable = false;
					}
				}
				if (event.type === 'done') {
					if (
						attemptRequest.outputBudgetRecovery &&
						!buffered.some(
							(candidate) =>
								candidate.type === 'tool_call' ||
								(candidate.type === 'text' && candidate.content.trim())
						)
					) {
						buffered.length = 0;
						buffered.push({
							type: 'error',
							error: 'Output budget recovery returned no output',
							retryable: false,
							cause: 'output_budget_exhausted'
						});
						terminalError = true;
					}
					terminal = true;
					if (
						shadowObservable &&
						detectToolCallPassTruncation(
							shadowToolCalls,
							canonicalFinishedReason(event.finishedReason),
							request.toolChoice
						)
					) {
						if (attemptRequest.outputBudgetRecovery) {
							buffered.length = 0;
							buffered.push({
								type: 'error',
								error: 'Output budget recovery returned incomplete calls',
								retryable: false,
								cause: 'output_budget_exhausted'
							});
							terminalError = true;
						} else if (retriesRemain) retry = true;
					}
					break;
				}
			}

			if (retry) {
				preview?.discard();
				if (attemptRequest.outputBudgetRecovery && isActingOutputPass(request))
					yield { type: 'output_budget_recovery', providerAttempt: providerAttempt + 1 };
				continue;
			}
			if (!terminal) {
				const incompleteToolCall = buffered.find((event) => event.type === 'tool_call');
				if (incompleteToolCall && !attemptRequest.outputBudgetRecovery) {
					preview?.discard();
					yield incompleteToolCall;
					return;
				}
				throw providerError('provider_missing_done', 'unknown');
			}
			// The final flush is sent before any buffered event is released, so its
			// durable floor predates this pass's own durable text.
			if (terminalError) preview?.discard();
			else preview?.finish();
			for (const event of buffered) yield event;
			return;
		} catch (error) {
			throwIfAborted(request.signal);
			if (!attemptRequest.outputBudgetRecovery) throw error;
			preview?.discard();
			yield {
				type: 'error',
				error: 'Output budget recovery could not finish',
				retryable: false,
				cause: 'output_budget_exhausted'
			};
			return;
		} finally {
			// Retried, thrown, aborted, or abandoned: the attempt's preview is void.
			// A no-op once the attempt already flushed or discarded.
			preview?.discard();
		}
	}
}

let livePreviewPassCounter = 0;

/**
 * Throttled, cumulative, fire-and-forget preview of one physical pass attempt.
 * The first delta is sent immediately; later ones at most once per interval
 * (a trailing timer sends the latest text); `finish` flushes at pass end.
 */
class LiveTextPreviewEmitter {
	private readonly passKey: string;
	private text = '';
	private textBytes = 0;
	private capped = false;
	private sentText: string | null = null;
	private lastSentAtMs: number | null = null;
	private timer: NodeJS.Timeout | null = null;
	private closed = false;

	constructor(
		private readonly port: AgenticChatLiveTextPreviewPortV1,
		private readonly request: AgenticChatTurnProviderRequestV1,
		providerAttempt: number
	) {
		livePreviewPassCounter += 1;
		this.passKey = [
			request.logicalProviderRound,
			request.passRole ?? 'acting',
			providerAttempt,
			livePreviewPassCounter
		].join('.');
	}

	append(delta: string): void {
		if (this.closed || this.capped || !delta) return;
		const room = AGENTIC_CHAT_LIVE_TEXT_PREVIEW_MAX_BYTES - this.textBytes;
		const deltaBytes = Buffer.byteLength(delta, 'utf8');
		if (deltaBytes > room) {
			const fitted = utf8Prefix(delta, room);
			this.text += fitted;
			this.textBytes += Buffer.byteLength(fitted, 'utf8');
			this.capped = true;
		} else {
			this.text += delta;
			this.textBytes += deltaBytes;
		}
		this.schedule();
	}

	/** Pass completed: send the final text now and close. */
	finish(): void {
		if (this.closed) return;
		this.send();
		this.close();
	}

	/** Attempt void (retry, error, abort): retract anything already shown. */
	discard(): void {
		if (this.closed) return;
		this.close();
		if (this.sentText === null) return;
		this.publish('discard', '');
	}

	private schedule(): void {
		const now = Date.now();
		if (
			this.lastSentAtMs === null ||
			now - this.lastSentAtMs >= LIVE_TEXT_PREVIEW_INTERVAL_MS
		) {
			this.send();
			return;
		}
		if (this.timer) return;
		this.timer = setTimeout(
			() => {
				this.timer = null;
				if (!this.closed) this.send();
			},
			LIVE_TEXT_PREVIEW_INTERVAL_MS - (now - this.lastSentAtMs)
		);
		this.timer.unref?.();
	}

	private send(): void {
		this.clearTimer();
		if (!this.text || this.text === this.sentText) return;
		this.sentText = this.text;
		this.lastSentAtMs = Date.now();
		this.publish('streaming', this.text);
	}

	private publish(state: 'streaming' | 'discard', text: string): void {
		try {
			this.port.publish({
				turnRunId: this.request.turnRunId,
				executionGeneration: this.request.executionGeneration,
				passKey: this.passKey,
				text,
				state
			});
		} catch {
			// Display-only: a preview failure can never touch the pass.
		}
	}

	private close(): void {
		this.closed = true;
		this.clearTimer();
	}

	private clearTimer(): void {
		if (!this.timer) return;
		clearTimeout(this.timer);
		this.timer = null;
	}
}

/** Longest prefix of `text` within `maxBytes` UTF-8 bytes, never splitting a code point. */
function utf8Prefix(text: string, maxBytes: number): string {
	let bytes = 0;
	let end = 0;
	for (const char of text) {
		const charBytes = Buffer.byteLength(char, 'utf8');
		if (bytes + charBytes > maxBytes) break;
		bytes += charBytes;
		end += char.length;
	}
	return text.slice(0, end);
}
