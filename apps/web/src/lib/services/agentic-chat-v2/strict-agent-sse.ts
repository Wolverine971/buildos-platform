// apps/web/src/lib/services/agentic-chat-v2/strict-agent-sse.ts
import { SSEProcessor } from '$lib/utils/sse-processor';
import { AgentStreamProtocolError, StrictAgentStreamValidator } from './stream-protocol';

export async function collectStrictAgentSse(
	response: Response,
	params: {
		streamRunId: string;
		clientTurnId: string;
		timeoutMs?: number;
		onEvent?: (event: Record<string, unknown>) => void;
	}
): Promise<Record<string, unknown>[]> {
	const validator = new StrictAgentStreamValidator({
		streamRunId: params.streamRunId,
		clientTurnId: params.clientTurnId
	});
	const events: Record<string, unknown>[] = [];

	await SSEProcessor.processStream(
		response,
		{
			onProgress: (value) => {
				const event = validator.accept(value);
				events.push(event);
				params.onEvent?.(event);
			}
		},
		{
			timeout: params.timeoutMs ?? 120_000,
			treatErrorEventsAsProgress: true,
			onParseError: (error, payload) => {
				if (error instanceof AgentStreamProtocolError) throw error;
				throw new AgentStreamProtocolError(
					`malformed JSON data frame (${error.message}): ${payload.slice(0, 160)}`
				);
			}
		}
	);

	validator.assertComplete();
	return events;
}
