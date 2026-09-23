// apps/worker/src/workers/agentic-chat/provider/forced-synthesis.ts

import {
	NO_TOOL_SYNTHESIS_EMPTY_RETRY_MESSAGE,
	NO_TOOL_SYNTHESIS_TOOL_RETRY_MESSAGE,
	sanitizeAssistantFinalText
} from '@buildos/agentic-chat-runtime/loop';
import {
	AgenticChatProviderExecutionError,
	type AgenticChatProviderStepV1,
	type AgenticChatProviderUsageV1,
	type AgenticChatTurnProviderClientEventV1,
	type AgenticChatTurnProviderClientPortV1,
	type AgenticChatTurnProviderRequestV1 as ClientRequest
} from './contracts';
import type { AgenticChatProviderCapacity } from './provider-capacity';
import {
	canonicalError,
	canonicalFinishedReason,
	normalizeUsage,
	providerError,
	throwIfAborted
} from './protocol';
import { appendSystemInstruction, combineUsage, forceToolFreeRequest } from './request-builders';
import {
	type ClarificationRender,
	clarificationRenderSatisfied,
	renderClarificationText
} from './review/decision-handling';
import type { ToolRoundStreamState } from './turn-state';

const MAX_FORCED_SYNTHESIS_RETRIES = 1;

/**
 * The coordinator's single counted entry to the model. Every lane that talks
 * to a model goes through it so the turn's pass budget is counted once.
 */
export type ProviderPass = (
	request: ClientRequest,
	state: ToolRoundStreamState,
	client?: AgenticChatTurnProviderClientPortV1
) => AsyncGenerator<AgenticChatTurnProviderClientEventV1>;

/** What a lane outside the coordinator needs from it. */
export type ProviderLaneContext = {
	/** The coordinator's ports object itself, read at the moment of use. */
	readonly ports: { readonly capacity: AgenticChatProviderCapacity };
	readonly retryableFailureCooldownMs: number;
	readonly providerPass: ProviderPass;
};

/**
 * Whether a partial answer from a dead synthesis attempt is worth showing. The
 * floor sits just above a disposable lead-in ("Here are", "Let me check"), which
 * is worse than an honest failure because it reads as a complete answer.
 */
function isUsableSynthesisPartial(text: string): boolean {
	const normalized = text.replace(/\s+/g, ' ').trim();
	if (normalized.length < 20) return false;
	return normalized.split(' ').filter(Boolean).length >= 3;
}

/**
 * The tool-free answer that closes a turn: after a pass-budget or validation
 * cap, a required control pass that answered in prose, a forced read-loop
 * stop, or a clarification. One bounded retry; a dead attempt that still
 * wrote a usable answer is kept; otherwise saved-work receipts are the answer.
 */
export async function* streamForcedSynthesis(
	context: ProviderLaneContext,
	request: ClientRequest,
	priorUsage: AgenticChatProviderUsageV1 | null,
	state: ToolRoundStreamState,
	options: { clarification?: ClarificationRender | null } = {}
): AsyncGenerator<AgenticChatProviderStepV1> {
	const clarification = options.clarification ?? null;
	let currentRequest = forceToolFreeRequest(request);
	let accumulatedUsage = priorUsage;
	try {
		const requestFallback = state.getRequestCompletionFallback();
		if (!clarification && requestFallback) {
			yield state.textDelta(requestFallback, false);
			context.ports.capacity.markAvailable(request.turnRunId);
			state.advance({ type: 'finish' });
			yield {
				type: 'finish',
				finishedReason: 'mutation_unfulfilled',
				usage: accumulatedUsage
			};
			return;
		}
		for (let retryCount = 0; retryCount <= MAX_FORCED_SYNTHESIS_RETRIES; retryCount += 1) {
			let finished = false;
			let requestedTools = false;
			let assistantCandidate = '';
			let finishedReason = 'stop';
			let passUsage: AgenticChatProviderUsageV1 | null = null;

			for await (const event of context.providerPass(currentRequest, state)) {
				throwIfAborted(currentRequest.signal);
				if (finished) throw providerError('provider_event_after_done', 'unknown');
				if (event.type === 'text') {
					if (!event.content) throw providerError('provider_empty_text', 'unknown');
					assistantCandidate += event.content;
					continue;
				}
				if (event.type === 'tool_call') {
					// This pass advertises no tools. The stray call is never
					// executed or replayed, but any prose already accumulated is a
					// real answer and is emitted below rather than discarded.
					requestedTools = true;
					continue;
				}
				if (event.type === 'error') {
					if (event.retryable) {
						context.ports.capacity.markTemporarilyUnavailable(
							request.turnRunId,
							context.retryableFailureCooldownMs
						);
					}
					// Everything this turn executed is already durable, and this
					// pass could execute nothing. When the dead attempt still wrote
					// a usable answer, the user gets it and the turn ends degraded
					// rather than failing and discarding work they paid for
					// (people-synthesis timeout, 2026-07-22).
					const recovered = sanitizeAssistantFinalText(assistantCandidate);
					if (isUsableSynthesisPartial(recovered)) {
						yield state.textDelta(
							clarification && !clarificationRenderSatisfied(recovered, clarification)
								? renderClarificationText(clarification)
								: recovered,
							false
						);
						state.advance({ type: 'finish' });
						yield {
							type: 'finish',
							finishedReason: 'synthesis_recovered',
							usage: accumulatedUsage
						};
						return;
					}
					throw new AgenticChatProviderExecutionError(
						'provider_stream_error',
						event.retryable ? 'provider_throttle' : 'unknown',
						canonicalError(event.error)
					);
				}

				finishedReason = canonicalFinishedReason(event.finishedReason);
				requestedTools ||=
					finishedReason === 'tool_calls' || finishedReason === 'function_call';
				passUsage = normalizeUsage(event.usage);
				finished = true;
			}
			if (!finished) throw providerError('provider_missing_done', 'unknown');

			accumulatedUsage = combineUsage(accumulatedUsage, passUsage);
			const finalText = sanitizeAssistantFinalText(assistantCandidate);
			// A clarification pass owes the user the question, not a promise.
			// When the prose dropped it, the structured question is emitted
			// verbatim instead of failing or burning a retry on the same model.
			const emittedText =
				clarification && !clarificationRenderSatisfied(finalText, clarification)
					? renderClarificationText(clarification)
					: finalText;
			if (emittedText) {
				context.ports.capacity.markAvailable(request.turnRunId);
				yield state.textDelta(emittedText, false);
				state.advance({ type: 'finish' });
				yield {
					type: 'finish',
					// The stray call is dropped, so the turn really did end in
					// prose; reporting `tool_calls` here would misname it.
					finishedReason: requestedTools ? 'stop' : finishedReason,
					usage: accumulatedUsage
				};
				return;
			}

			if (retryCount >= MAX_FORCED_SYNTHESIS_RETRIES) {
				throw providerError('provider_forced_synthesis_failed', 'permanent');
			}
			currentRequest = appendSystemInstruction(
				{
					...currentRequest,
					logicalProviderRound: currentRequest.logicalProviderRound + 1,
					providerAttempt: undefined
				},
				requestedTools
					? NO_TOOL_SYNTHESIS_TOOL_RETRY_MESSAGE
					: NO_TOOL_SYNTHESIS_EMPTY_RETRY_MESSAGE
			);
		}
	} catch (error) {
		throwIfAborted(request.signal);
		const receipt = state.renderWriteReceiptFallback();
		if (!receipt || !(error instanceof AgenticChatProviderExecutionError)) throw error;
		yield state.textDelta(receipt, false);
		state.advance({ type: 'finish' });
		yield {
			type: 'finish',
			finishedReason: 'synthesis_receipt_fallback',
			usage: accumulatedUsage
		};
	} finally {
		state.release();
	}
}
