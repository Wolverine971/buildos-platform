// apps/web/src/lib/server/admin-chat-user-analytics/redaction.ts
const FORBIDDEN_PAYLOAD_KEYS = new Set([
	'content',
	'request_message',
	'system_prompt',
	'model_messages',
	'rendered_dump_text',
	'arguments',
	'result',
	'tool_result',
	'before_data',
	'after_data',
	'operation_payload',
	'data'
]);

function assertNoForbiddenKeys(value: unknown, path = '$'): void {
	if (Array.isArray(value)) {
		value.forEach((item, index) => assertNoForbiddenKeys(item, `${path}[${index}]`));
		return;
	}
	if (!value || typeof value !== 'object') return;
	for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
		if (FORBIDDEN_PAYLOAD_KEYS.has(key)) {
			throw new Error(
				`Admin chat user analytics payload contains forbidden key at ${path}.${key}`
			);
		}
		assertNoForbiddenKeys(child, `${path}.${key}`);
	}
}

export function assertAdminChatUserAnalyticsRedacted(value: unknown): void {
	assertNoForbiddenKeys(value);
}
