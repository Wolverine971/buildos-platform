// apps/web/src/lib/services/agentic-chat-v2/turn-outcome.ts
import type { FastToolExecution } from './stream-orchestrator/shared';
import {
	classifyToolExecution,
	didGatewayExecSucceed
} from './stream-orchestrator/tool-classification';
import { getWriteToolNamesForTurnIntent, type FastChatTurnIntent } from './turn-intent';

export type FastChatTurnOutcomeStatus = 'fulfilled' | 'blocked' | 'unfulfilled' | 'failed';

export type FastChatTurnOutcome = {
	status: FastChatTurnOutcomeStatus;
	fulfilled: boolean;
	expectedWriteToolNames: string[];
};

export function resolveFastChatTurnOutcome(params: {
	intent: FastChatTurnIntent;
	toolExecutions?: FastToolExecution[] | null;
	finishedReason?: string | null;
}): FastChatTurnOutcome {
	const toolExecutions = params.toolExecutions ?? [];
	const expectedWriteToolNames = getWriteToolNamesForTurnIntent(params.intent);
	const successfulWriteToolNames = new Set(
		toolExecutions
			.filter((execution) => didGatewayExecSucceed(execution))
			.map((execution) => execution.toolCall.function?.name ?? '')
			.filter(Boolean)
	);
	const fulfilled = !params.intent.requiresWrite
		? true
		: expectedWriteToolNames.length > 0
			? expectedWriteToolNames.every((toolName) => successfulWriteToolNames.has(toolName))
			: toolExecutions.some(
					(execution) =>
						classifyToolExecution(execution) === 'write' &&
						didGatewayExecSucceed(execution)
				);
	const status: FastChatTurnOutcomeStatus = params.intent.requiresWrite
		? fulfilled
			? 'fulfilled'
			: params.finishedReason === 'supervisor_question'
				? 'blocked'
				: 'unfulfilled'
		: params.finishedReason === 'synthesis_failed'
			? 'failed'
			: 'fulfilled';

	return { status, fulfilled, expectedWriteToolNames };
}
