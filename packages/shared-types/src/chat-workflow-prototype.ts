// packages/shared-types/src/chat-workflow-prototype.ts
// Internal pilot contract. No browser value grants workflow access or tool authority.
export const CHAT_WORKFLOW_PROTOTYPE_VERSION = 'chat_workflow_prototype_v1' as const;
export const CHAT_WORKFLOW_PROTOTYPE_COMMAND = '/workflow';

export type ChatWorkflowStep = {
	id: 'context' | 'plan' | 'analyst' | 'reviewer' | 'answer';
	label: string;
	status: 'pending' | 'running' | 'completed' | 'failed';
	objective?: string;
	result?: string;
};

export type ChatWorkflowProgress = {
	version: typeof CHAT_WORKFLOW_PROTOTYPE_VERSION;
	steps: ChatWorkflowStep[];
	contextHash?: string;
};

export function parseChatWorkflowPrototypeUsers(value: string | undefined): string[] {
	return [
		...new Set(
			(value ?? '')
				.split(',')
				.map((id) => id.trim().toLowerCase())
				.filter((id) =>
					/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
						id
					)
				)
		)
	];
}

export function isChatWorkflowCommand(value: unknown): value is string {
	return typeof value === 'string' && /^\s*\/workflow(?:\s|$)/i.test(value);
}

export function readChatWorkflowProgress(value: unknown): ChatWorkflowProgress | null {
	if (!value || typeof value !== 'object') return null;
	const data = value as ChatWorkflowProgress;
	if (
		data.version !== CHAT_WORKFLOW_PROTOTYPE_VERSION ||
		!Array.isArray(data.steps) ||
		data.steps.length !== 5
	)
		return null;
	const ids = ['context', 'plan', 'analyst', 'reviewer', 'answer'];
	if (
		!data.steps.every(
			(step, index) =>
				step &&
				step.id === ids[index] &&
				typeof step.label === 'string' &&
				step.label.length <= 100 &&
				['pending', 'running', 'completed', 'failed'].includes(step.status) &&
				(step.objective === undefined ||
					(typeof step.objective === 'string' && step.objective.length <= 1200)) &&
				(step.result === undefined ||
					(typeof step.result === 'string' && step.result.length <= 6000))
		)
	)
		return null;
	return data;
}
