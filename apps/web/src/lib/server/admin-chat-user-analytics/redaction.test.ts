// apps/web/src/lib/server/admin-chat-user-analytics/redaction.test.ts
import { describe, expect, it } from 'vitest';
import { assertAdminChatUserAnalyticsRedacted } from './redaction';

describe('admin chat user analytics redaction', () => {
	it('allows safe aggregate payloads', () => {
		expect(() =>
			assertAdminChatUserAnalyticsRedacted({
				users: [{ user_id: 'user-1', preview: 'Topics: planning.' }],
				privacy: { raw_message_content_returned: false }
			})
		).not.toThrow();
	});

	it('rejects nested raw payload keys with a useful path', () => {
		expect(() =>
			assertAdminChatUserAnalyticsRedacted({
				session: {
					turns: [{ request_message: 'raw prompt' }]
				}
			})
		).toThrow('$.session.turns[0].request_message');
	});

	it('rejects raw tool payload keys inside arrays', () => {
		expect(() =>
			assertAdminChatUserAnalyticsRedacted([{ tool_call: { result: 'raw tool output' } }])
		).toThrow('$[0].tool_call.result');
	});
});
