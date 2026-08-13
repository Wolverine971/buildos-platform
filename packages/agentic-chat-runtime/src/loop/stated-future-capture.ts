// packages/agentic-chat-runtime/src/loop/stated-future-capture.ts
export const STATED_FUTURE_SOURCE = 'stated_future_capture';
export const STATED_FUTURE_TASK_TYPE_KEY = 'task.default';

const TITLE_MAX_CHARS = 120;
const EXCERPT_MAX_CHARS = 280;

/** Verbatim clause → task title: collapsed whitespace, no trailing punctuation, first letter up. */
export function buildStatedFutureTaskTitle(clause: string): string | null {
	const normalized = clip(clause, TITLE_MAX_CHARS).replace(/[.!?,;:\s]+$/g, '');
	if (!normalized) return null;
	return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function buildStatedFutureTaskDescription(params: {
	clause: string;
	userMessage: string;
}): string {
	const lines = [
		`Captured automatically from your words: "${clip(params.clause, EXCERPT_MAX_CHARS)}".`,
		'The chat turn acted on your message but recorded nothing for this follow-up, so BuildOS saved it.'
	];
	const fullMessage = clip(params.userMessage, EXCERPT_MAX_CHARS);
	if (fullMessage && fullMessage !== clip(params.clause, EXCERPT_MAX_CHARS)) {
		lines.push(`Full message: "${fullMessage}"`);
	}
	return lines.join('\n');
}

function clip(value: string, max: number): string {
	const normalized = value.replace(/\s+/g, ' ').trim();
	if (normalized.length <= max) return normalized;
	return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}
