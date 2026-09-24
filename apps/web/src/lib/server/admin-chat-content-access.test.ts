// apps/web/src/lib/server/admin-chat-content-access.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { logSecurityEventBlockingMock } = vi.hoisted(() => ({
	logSecurityEventBlockingMock: vi.fn()
}));

vi.mock('$lib/server/security-event-logger', () => ({
	logSecurityEventBlocking: logSecurityEventBlockingMock,
	getSecurityRequestContext: (request: Request) => ({
		requestId: request.headers.get('x-request-id'),
		ipAddress: null,
		userAgent: request.headers.get('user-agent')
	})
}));

import {
	assertAdminChatPassThroughContentProjected,
	logAdminChatContentAccess,
	projectAdminChatMessageRows,
	projectAdminToolExecutionRows,
	projectAdminTurnEventRows
} from './admin-chat-content-access';

const webVisit = {
	url: 'https://clinic.example/intake',
	title: 'Intake',
	content: 'Patient intake form for Dr. Reyes'
};

describe('admin chat content projection', () => {
	it('projects pass-through tool results and keeps workspace rows', () => {
		const workspace = {
			id: 'x2',
			tool_name: 'get_onto_task_details',
			result: { title: 'Pitch' }
		};
		const [web, kept] = projectAdminToolExecutionRows([
			{
				id: 'x1',
				tool_name: 'web_visit',
				arguments: { url: webVisit.url },
				result: webVisit
			},
			workspace
		]);
		expect(web).toMatchObject({
			id: 'x1',
			arguments: { url: webVisit.url },
			result: { url: webVisit.url, title: 'Intake', content_redacted: true }
		});
		expect(JSON.stringify(web)).not.toContain('Dr. Reyes');
		expect(kept).toBe(workspace);
	});

	it('projects tool_result and web_navigate progress events', () => {
		const call = { id: 'e0', event_type: 'tool_call', payload: { tool_call: { id: 'c1' } } };
		const [result, progress, kept] = projectAdminTurnEventRows([
			{
				id: 'e1',
				event_type: 'tool_result',
				payload: {
					type: 'tool_result',
					result: { tool_call_id: 'c1', tool_name: 'web_visit', result: webVisit }
				}
			},
			{
				id: 'e2',
				event_type: 'tool_progress',
				payload: {
					tool_name: 'web_navigate',
					message: 'Backtracking → "Patient portal login"',
					data: { kind: 'backtracking', label: 'Patient portal login', probability: 0.4 }
				}
			},
			call
		]);
		expect((result!.payload as any).result).toMatchObject({
			tool_call_id: 'c1',
			result: { content_redacted: true }
		});
		expect(JSON.stringify([result, progress])).not.toContain('Reyes');
		expect(JSON.stringify(progress)).not.toContain('Patient portal');
		expect((progress!.payload as any).message).toBe('Dead end, backtracking (40%)');
		expect(kept).toBe(call);
	});

	it('replaces legacy tool-role message content for pass-through tools only', () => {
		const assistant = { role: 'assistant', tool_name: null, content: 'Sarah sent it.' };
		const [tool, kept] = projectAdminChatMessageRows([
			{
				role: 'tool',
				tool_name: 'search_email_messages',
				content: '{"summary":"Sarah: signed contract attached"}',
				tool_result: { messages: [{ message_id: 'm1', subject: 'Signed contract' }] }
			},
			assistant
		]);
		expect(tool!.content).toMatch(/Email content is not stored/);
		expect(tool!.tool_result).toMatchObject({
			content_redacted: true,
			messages: [{ message_id: 'm1' }]
		});
		expect(JSON.stringify(tool)).not.toContain('Signed contract');
		expect(kept).toBe(assistant);
	});

	it('fails closed on an unprojected pass-through result', () => {
		expect(() =>
			assertAdminChatPassThroughContentProjected({
				toolExecutions: [{ tool_name: 'list_calendar_events', result: { events: [] } }]
			})
		).toThrow(/unprojected list_calendar_events/);
		expect(() =>
			assertAdminChatPassThroughContentProjected({
				turnEvents: [
					{
						event_type: 'tool_result',
						payload: { result: { tool_name: 'web_search', result: { results: [] } } }
					}
				]
			})
		).toThrow(/unprojected web_search/);
		expect(() =>
			assertAdminChatPassThroughContentProjected({
				toolExecutions: projectAdminToolExecutionRows([
					{ tool_name: 'web_visit', result: webVisit },
					{ tool_name: 'get_calendar_event_details', result: { source: 'ontology' } },
					{ tool_name: 'web_search', result: null }
				])
			})
		).not.toThrow();
	});
});

describe('admin chat content access log', () => {
	beforeEach(() => logSecurityEventBlockingMock.mockReset());

	it('records who read whose chat with row counts and no content', async () => {
		await logAdminChatContentAccess({
			adminUserId: 'admin-1',
			action: 'read',
			route: '/api/admin/chat/sessions/[id]',
			targetType: 'chat_session',
			targetId: 'session-1',
			targetUserIds: ['user-1', 'user-1'],
			rowCounts: { messages: 12, tool_executions: 3 },
			request: new Request('https://build-os.com/api/admin/chat/sessions/session-1', {
				headers: { 'x-request-id': 'req-1', 'user-agent': 'vitest' }
			})
		});
		expect(logSecurityEventBlockingMock).toHaveBeenCalledWith({
			eventType: 'admin.chat_content.read',
			category: 'admin',
			outcome: 'success',
			severity: 'low',
			actorType: 'admin',
			actorUserId: 'admin-1',
			targetType: 'chat_session',
			targetId: 'session-1',
			requestId: 'req-1',
			ipAddress: null,
			userAgent: 'vitest',
			metadata: {
				route: '/api/admin/chat/sessions/[id]',
				target_user_ids: ['user-1'],
				target_user_count: 1,
				rows: { messages: 12, tool_executions: 3 }
			}
		});
	});

	it('skips an admin reading their own chat but always records exports', async () => {
		await logAdminChatContentAccess({
			adminUserId: 'admin-1',
			action: 'read',
			route: '/api/admin/chat/sessions/[id]',
			targetType: 'chat_session',
			targetId: 'session-1',
			targetUserIds: ['admin-1'],
			rowCounts: { messages: 2 }
		});
		expect(logSecurityEventBlockingMock).not.toHaveBeenCalled();
		await logAdminChatContentAccess({
			adminUserId: 'admin-1',
			action: 'export',
			route: '/api/admin/chat/export',
			targetType: 'chat_export',
			targetId: null,
			targetUserIds: ['admin-1', 'user-2'],
			rowCounts: { sessions: 2 },
			details: { format: 'json', timeframe: '7d' }
		});
		expect(logSecurityEventBlockingMock).toHaveBeenCalledWith(
			expect.objectContaining({
				eventType: 'admin.chat_content.exported',
				severity: 'medium',
				requestId: null,
				metadata: expect.objectContaining({
					target_user_count: 2,
					format: 'json',
					timeframe: '7d'
				})
			})
		);
	});
});
