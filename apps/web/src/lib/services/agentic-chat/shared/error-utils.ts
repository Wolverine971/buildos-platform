// apps/web/src/lib/services/agentic-chat/shared/error-utils.ts
/**
 * Shared error normalization helpers for agentic chat.
 */

function extractErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message) {
		return error.message;
	}

	if (typeof error === 'string') {
		return error;
	}

	if (error && typeof error === 'object') {
		const typed = error as {
			message?: unknown;
			details?: unknown;
			hint?: unknown;
			code?: unknown;
			status?: unknown;
		};

		if (typeof typed.message === 'string' && typed.message.trim().length > 0) {
			return typed.message;
		}

		const parts: string[] = [];
		if (typed.code) parts.push(String(typed.code));
		if (typed.status) parts.push(String(typed.status));
		if (typed.details) parts.push(String(typed.details));
		if (typed.hint) parts.push(String(typed.hint));

		if (parts.length > 0) {
			return parts.join(' - ');
		}

		try {
			return JSON.stringify(error);
		} catch {
			return String(error);
		}
	}

	return error ? String(error) : 'Unknown error';
}

export function normalizeToolError(error: unknown, toolName?: string): string {
	const baseMessage = extractErrorMessage(error);

	if (!toolName) {
		return baseMessage;
	}

	let message = baseMessage.includes(toolName)
		? baseMessage
		: `Tool '${toolName}' failed: ${baseMessage}`;

	if (message.includes('401')) {
		message += ' (authentication required)';
	} else if (message.includes('404')) {
		message += ' (resource not found)';
	}

	return message;
}
