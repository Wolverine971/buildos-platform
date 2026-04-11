// apps/web/src/lib/services/admin/dashboard-analytics.service.test.ts
import { describe, expect, it } from 'vitest';
import { buildAgentChatUsage } from './dashboard-analytics.service';

describe('buildAgentChatUsage', () => {
	it('counts sessions with current message activity even when the session row is outside the window', () => {
		const usage = buildAgentChatUsage({
			sessions: [],
			messages: [
				{
					session_id: 'older-session',
					user_id: 'user-1',
					total_tokens: 120,
					error_message: null
				},
				{
					session_id: 'older-session',
					user_id: 'user-1',
					total_tokens: 180,
					error_message: null
				}
			],
			usageLogs: [],
			toolExecutions: []
		});

		expect(usage.totalSessions).toBe(1);
		expect(usage.totalMessages).toBe(2);
		expect(usage.totalTokens).toBe(300);
		expect(usage.uniqueUsers).toBe(1);
		expect(usage.avgMessagesPerSession).toBe(2);
	});

	it('uses llm usage rows as the token source and marks tool/error sessions', () => {
		const usage = buildAgentChatUsage({
			sessions: [
				{
					id: 'session-1',
					user_id: 'user-1',
					status: 'active',
					message_count: 99,
					total_tokens_used: 999_999,
					tool_call_count: 0
				}
			],
			messages: [
				{
					session_id: 'session-1',
					user_id: 'user-1',
					total_tokens: 10,
					error_message: null
				}
			],
			usageLogs: [
				{
					chat_session_id: 'session-1',
					user_id: 'user-1',
					total_tokens: 1_000,
					status: 'success',
					error_message: null,
					operation_type: 'simple_response'
				},
				{
					chat_session_id: 'session-2',
					user_id: 'user-2',
					total_tokens: 500,
					status: 'error',
					error_message: 'Tool call failed',
					operation_type: 'gateway_execution'
				}
			],
			toolExecutions: [{ session_id: 'session-2', success: false }]
		});

		expect(usage.totalSessions).toBe(2);
		expect(usage.totalMessages).toBe(1);
		expect(usage.totalTokens).toBe(1_500);
		expect(usage.uniqueUsers).toBe(2);
		expect(usage.toolSessions).toBe(1);
		expect(usage.executorSessions).toBe(1);
		expect(usage.failedSessions).toBe(1);
		expect(usage.failureRate).toBe(50);
	});
});
