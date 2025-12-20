// apps/web/src/lib/services/agentic-chat/shared/error-utils.ts
/**
 * Shared error normalization helpers for agentic chat.
 */

export function normalizeToolError(error: unknown, toolName?: string): string {
	const baseMessage =
		error instanceof Error ? error.message : error ? String(error) : 'Unknown error';

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
