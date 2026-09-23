// apps/worker/src/workers/chat/checkpoint/checkpointLlm.ts
// The model port for chat checkpoint capture: the fast JSON profile, one parse retry.
import type { JSONUsageEvent } from '@buildos/smart-llm';
import { SmartLLMService } from '../../../lib/services/smart-llm-service';
import type { CheckpointCapturePorts } from './checkpointCapture';

export function createCheckpointCompleteJson(options?: {
	sessionId?: string;
	projectId?: string;
	onUsage?: (event: JSONUsageEvent & { operation: string }) => void;
}): CheckpointCapturePorts['completeJson'] {
	const llm = new SmartLLMService({
		httpReferer: (process.env.PUBLIC_APP_URL || 'https://build-os.com').trim(),
		appName: 'BuildOS Chat Checkpoint Capture'
	});
	return ({ systemPrompt, userPrompt, userId, operation }) =>
		llm.getJSONResponse<unknown>({
			systemPrompt,
			userPrompt,
			userId,
			profile: 'fast',
			temperature: 0.1,
			// Extraction and small edits: hidden reasoning only slows these calls down
			// (DeepSeek V4 Flash spent ~850 reasoning tokens to return one passage).
			reasoning: { enabled: false },
			validation: { retryOnParseError: true, maxRetries: 1 },
			operationType: `chat_checkpoint_${operation}`,
			chatSessionId: options?.sessionId,
			projectId: options?.projectId,
			onUsage: options?.onUsage
				? (event) => options.onUsage?.({ ...event, operation })
				: undefined
		});
}
