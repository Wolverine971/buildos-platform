// apps/web/src/lib/services/agentic-chat-v2/worker-prompt-surface.ts
import type { ChatToolDefinition } from '@buildos/shared-types';
import {
	AGENTIC_CHAT_WORKER_OMITTED_TOOL_NAMES_V1,
	findAgenticChatWorkerUnavailableToolNamesV1
} from '@buildos/agentic-chat-runtime';
import {
	CANCEL_TURN_CONTRACT_TOOL_NAME,
	DECLARE_TURN_CONTRACT_TOOL_NAME
} from '@buildos/agentic-chat-runtime/catalog';
import type { LitePromptScaffoldOptions } from '$lib/services/agentic-chat-lite/prompt';

// The turn-contract controls are retired: complex writes go through the
// SHA-bound mutation batch review, and the worker never mounts them.
const WORKER_OMITTED_TOOL_NAMES = new Set<string>([
	...AGENTIC_CHAT_WORKER_OMITTED_TOOL_NAMES_V1,
	DECLARE_TURN_CONTRACT_TOOL_NAME,
	CANCEL_TURN_CONTRACT_TOOL_NAME
]);

export function buildWorkerPromptScaffold(
	scaffold: LitePromptScaffoldOptions
): LitePromptScaffoldOptions {
	return { ...scaffold, dynamicSkillTools: false };
}

export function resolveWorkerPromptTools(tools: ChatToolDefinition[]): {
	tools: ChatToolDefinition[];
	unavailableToolNames: string[];
} {
	const workerTools = tools.filter(
		(tool) => !WORKER_OMITTED_TOOL_NAMES.has(tool.function?.name ?? '')
	);
	return {
		tools: workerTools,
		unavailableToolNames: findAgenticChatWorkerUnavailableToolNamesV1(
			workerTools.map((tool) => tool.function?.name ?? '').filter(Boolean)
		)
	};
}
