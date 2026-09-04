// apps/worker/src/workers/agentic-chat/provider/provider-pass.ts

import type { AgenticChatProviderCapacity } from '../providerCapacity';
import type {
	AgenticChatTurnProviderClientEventV1,
	AgenticChatTurnProviderClientPortV1,
	AgenticChatTurnProviderRequestV1
} from './contracts';
import { canonicalFinishedReason, providerError, throwIfAborted } from './protocol';
import { providerClientRequest } from './request-builders';
import {
	appendToolCallDelta,
	createToolCallAccumulator,
	detectToolCallPassTruncation
} from './stream-tool-calls';

const MAX_RETRYABLE_PROVIDER_PASS_RETRIES = 1;
const MAX_BUFFERED_PROVIDER_PASS_BYTES = 512 * 1024;

/**
 * Holds one complete provider pass behind an atomic boundary. Once a stream
 * opens, partial assistant output cannot be retracted, so a retryable failure
 * is discarded and retried once with a distinct physical attempt identity.
 *
 * A pass whose streamed tool calls are truncated (arguments cut off, or a
 * finish reason that contradicts the calls) is treated the same way: nothing
 * from the buffered pass has reached the executor, so it is discarded and
 * retried once. The production client already marks the truncating route as
 * failed for the turn, so the retry lands on the next model/provider.
 */
export async function* streamBufferedProviderPass(
	request: AgenticChatTurnProviderRequestV1,
	client: AgenticChatTurnProviderClientPortV1,
	capacity: Pick<AgenticChatProviderCapacity, 'markTemporarilyUnavailable'>,
	retryableFailureCooldownMs: number
): AsyncGenerator<AgenticChatTurnProviderClientEventV1> {
	const firstAttempt = request.providerAttempt ?? 1;
	for (let retryCount = 0; retryCount <= MAX_RETRYABLE_PROVIDER_PASS_RETRIES; retryCount += 1) {
		const providerAttempt = firstAttempt + retryCount;
		const buffered: AgenticChatTurnProviderClientEventV1[] = [];
		let bufferedBytes = 0;
		let retry = false;
		let terminal = false;
		const retriesRemain = retryCount < MAX_RETRYABLE_PROVIDER_PASS_RETRIES;
		// Shadow of the consumer's accumulator, used only to recognise a
		// truncated pass before it is released. Protocol violations are left for
		// the consumer to name; they make the pass unobservable here.
		const shadowToolCalls = createToolCallAccumulator();
		let shadowObservable = true;

		for await (const event of client.stream(
			providerClientRequest({ ...request, providerAttempt })
		)) {
			throwIfAborted(request.signal);
			if (event.type === 'reasoning') continue;
			if (event.type === 'error') {
				if (event.retryable && retriesRemain) {
					if (event.cause !== 'tool_arguments_truncated') {
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
					request.toolChoice === 'none'
						? buffered.filter((candidate) => candidate.type === 'text')
						: [];
				buffered.length = 0;
				buffered.push(...recoverablePartial, event);
				terminal = true;
				break;
			}

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
				terminal = true;
				if (
					shadowObservable &&
					retriesRemain &&
					detectToolCallPassTruncation(
						shadowToolCalls,
						canonicalFinishedReason(event.finishedReason),
						request.toolChoice
					)
				) {
					retry = true;
				}
				break;
			}
		}

		if (retry) continue;
		if (!terminal) {
			const incompleteToolCall = buffered.find((event) => event.type === 'tool_call');
			if (incompleteToolCall) {
				yield incompleteToolCall;
				return;
			}
			throw providerError('provider_missing_done', 'unknown');
		}
		for (const event of buffered) yield event;
		return;
	}
}
