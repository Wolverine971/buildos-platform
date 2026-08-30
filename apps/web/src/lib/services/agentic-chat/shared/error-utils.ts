// apps/web/src/lib/services/agentic-chat/shared/error-utils.ts
/**
 * Shared error normalization helpers for agentic chat.
 */

function extractErrorMessage(error: unknown): string {
	if (typeof error === 'string') {
		return error;
	}

	if (error && typeof error === 'object') {
		const typed = error as {
			message?: unknown;
			code?: unknown;
			status?: unknown;
		};

		const parts: string[] = [];
		if (typeof typed.code === 'string' && typed.code.trim()) {
			parts.push(`database error ${typed.code.trim()}`);
		}
		if (
			(typeof typed.status === 'string' && typed.status.trim()) ||
			(typeof typed.status === 'number' && Number.isFinite(typed.status))
		) {
			parts.push(`status ${String(typed.status).trim()}`);
		}

		if (parts.length > 0) {
			return parts.join(' - ');
		}

		if (typeof typed.message === 'string' && typed.message.trim().length > 0) {
			return typed.message;
		}

		return 'Unknown error';
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
