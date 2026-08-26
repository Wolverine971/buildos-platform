// apps/worker/src/workers/agentic-chat/provider/provider-pass.ts

import type { AgenticChatProviderCapacity } from '../providerCapacity';
import type {
	AgenticChatTurnProviderClientEventV1,
	AgenticChatTurnProviderClientPortV1,
	AgenticChatTurnProviderRequestV1
} from './contracts';
import { providerError, throwIfAborted } from './protocol';
import { providerClientRequest } from './request-builders';

const MAX_RETRYABLE_PROVIDER_PASS_RETRIES = 1;
const MAX_BUFFERED_PROVIDER_PASS_BYTES = 512 * 1024;

/**
 * Holds one complete provider pass behind an atomic boundary. Once a stream
 * opens, partial assistant output cannot be retracted, so a retryable failure
 * is discarded and retried once with a distinct physical attempt identity.
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

		for await (const event of client.stream(
			providerClientRequest({ ...request, providerAttempt })
		)) {
			throwIfAborted(request.signal);
			if (event.type === 'reasoning') continue;
			if (event.type === 'error') {
				if (event.retryable && retryCount < MAX_RETRYABLE_PROVIDER_PASS_RETRIES) {
					capacity.markTemporarilyUnavailable(
						request.turnRunId,
						retryableFailureCooldownMs
					);
					retry = true;
					break;
				}
				buffered.length = 0;
				buffered.push(event);
				terminal = true;
				break;
			}

			bufferedBytes += Buffer.byteLength(JSON.stringify(event), 'utf8');
			if (bufferedBytes > MAX_BUFFERED_PROVIDER_PASS_BYTES) {
				throw providerError('provider_pass_buffer_exceeded', 'permanent');
			}
			buffered.push(event);
			if (event.type === 'done') {
				terminal = true;
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
