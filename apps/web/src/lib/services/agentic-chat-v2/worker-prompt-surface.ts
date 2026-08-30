// apps/web/src/lib/services/agentic-chat-v2/worker-prompt-surface.ts
import type { ChatToolDefinition } from '@buildos/shared-types';
import {
	AGENTIC_CHAT_WORKER_EXECUTABLE_MUTATION_TOOL_NAMES_V1,
	AGENTIC_CHAT_WORKER_OMITTED_TOOL_NAMES_V1,
	findAgenticChatWorkerUnavailableToolNamesV1
} from '@buildos/agentic-chat-runtime';
import { DECLARE_TURN_CONTRACT_TOOL_NAME } from '@buildos/agentic-chat-runtime/catalog';
import type { LitePromptScaffoldOptions } from '$lib/services/agentic-chat-lite/prompt';

const WORKER_OMITTED_TOOL_NAMES = new Set<string>(AGENTIC_CHAT_WORKER_OMITTED_TOOL_NAMES_V1);
const WORKER_MUTATION_TOOL_NAMES = new Set<string>(
	AGENTIC_CHAT_WORKER_EXECUTABLE_MUTATION_TOOL_NAMES_V1
);

export function buildWorkerPromptScaffold(
	scaffold: LitePromptScaffoldOptions
): LitePromptScaffoldOptions {
	return { ...scaffold, dynamicSkillTools: false };
}

export function resolveWorkerPromptTools(tools: ChatToolDefinition[]): {
	tools: ChatToolDefinition[];
	unavailableToolNames: string[];
} {
	const candidates = tools.filter(
		(tool) => !WORKER_OMITTED_TOOL_NAMES.has(tool.function?.name ?? '')
	);
	const hasWorkerMutation = candidates.some((tool) =>
		WORKER_MUTATION_TOOL_NAMES.has(tool.function?.name ?? '')
	);
	const workerTools = hasWorkerMutation
		? candidates
		: candidates.filter((tool) => tool.function?.name !== DECLARE_TURN_CONTRACT_TOOL_NAME);
	return {
		tools: workerTools,
		unavailableToolNames: findAgenticChatWorkerUnavailableToolNamesV1(
			workerTools.map((tool) => tool.function?.name ?? '').filter(Boolean)
		)
	};
}
