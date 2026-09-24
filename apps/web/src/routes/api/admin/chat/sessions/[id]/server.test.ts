// apps/web/src/routes/api/admin/chat/sessions/[id]/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createAdminSupabaseClientMock, loadPromptEvalResultsMock, logSecurityEventMock } =
	vi.hoisted(() => ({
		createAdminSupabaseClientMock: vi.fn(),
		loadPromptEvalResultsMock: vi.fn(),
		logSecurityEventMock: vi.fn()
	}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: createAdminSupabaseClientMock
}));
vi.mock('$lib/services/agentic-chat-v2/prompt-eval-runner', () => ({
	loadPromptEvalResultsForTurnRuns: loadPromptEvalResultsMock
}));
vi.mock('$lib/server/security-event-logger', () => ({
	logSecurityEventBlocking: logSecurityEventMock,
	getSecurityRequestContext: () => ({ requestId: null, ipAddress: null, userAgent: null })
}));

import { GET } from './+server';

type QueryResult = { data: unknown; error: unknown };

function createQuery(result: QueryResult) {
	const query: any = {
		select: vi.fn(() => query),
		eq: vi.fn(() => query),
		in: vi.fn(() => query),
		order: vi.fn(() => query),
		limit: vi.fn(() => query),
		single: vi.fn(() => Promise.resolve(result)),
		maybeSingle: vi.fn(() => Promise.resolve(result)),
		then: (onFulfilled: any, onRejected: any) =>
			Promise.resolve(result).then(onFulfilled, onRejected)
	};
	return query;
}

// A table may answer with one result for every query, or with one result per query in call
// order (the last one repeats), for routes that query the same table more than once.
type TableResults = QueryResult | QueryResult[];

function createAdminSupabase(resultsByTable: Record<string, TableResults>) {
	const queriesByTable = new Map<string, any[]>();
	return {
		from: vi.fn((table: string) => {
			const configured = resultsByTable[table] ?? { data: [], error: null };
			const priorCalls = queriesByTable.get(table)?.length ?? 0;
			const result = Array.isArray(configured)
				? (configured[priorCalls] ?? configured[configured.length - 1]!)
				: configured;
			const query = createQuery(result);
			queriesByTable.set(table, [...(queriesByTable.get(table) ?? []), query]);
			return query;
		}),
		queriesByTable
	};
}

const SESSION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TURN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OTHER_TURN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const baseTables = (): Record<string, TableResults> => ({
	chat_sessions: {
		data: {
			id: SESSION,
			user_id: 'user-1',
			title: 'Workflow session',
			status: 'active',
			context_type: 'project',
			entity_id: 'project-1',
			created_at: '2026-09-20T12:00:00.000Z',
			updated_at: '2026-09-20T12:05:00.000Z',
			users: { id: 'user-1', email: 'dj@example.com', name: 'DJ' }
		},
		error: null
	},
	chat_messages: { data: [], error: null },
	chat_tool_executions: { data: [], error: null },
	llm_usage_logs: { data: [], error: null },
	chat_operations: { data: [], error: null },
	timing_metrics: { data: null, error: null },
	chat_turn_runs: {
		data: [
			{
				id: TURN,
				status: 'completed',
				request_message: 'Review',
				started_at: '2026-09-20T12:00:01.000Z',
				finished_at: '2026-09-20T12:01:00.000Z'
			}
		],
		error: null
	},
	chat_prompt_snapshots: { data: [], error: null },
	chat_turn_events: { data: [], error: null },
	chat_turn_workflow_runs: {
		data: [
			{
				turn_run_id: TURN,
				session_id: SESSION,
				user_id: 'user-1',
				request_artifact_id: 'artifact-1',
				project_id: 'project-1',
				workflow_version: 'agentic_chat_workflow_v1',
				policy_ref: 'internal-project-review:v1',
				policy: {},
				request_hash: 'a'.repeat(64),
				phase: 'finished',
				terminal_outcome: 'complete',
				synthesis_status: 'accepted',
				synthesis_quality: 'complete',
				answer_text: 'done',
				created_at: '2026-09-20T12:00:02.000Z',
				finished_at: '2026-09-20T12:01:00.000Z'
			}
		],
		error: null
	},
	chat_turn_workflow_steps: { data: [], error: null },
	chat_turn_workflow_dispatches: { data: [], error: null },
	chat_turn_specialist_snapshots: { data: [], error: null },
	chat_turn_document_read_batches: { data: [], error: null },
	chat_turn_specialist_selection_shadows: {
		data: null,
		error: {
			code: '42P01',
			message: 'relation "chat_turn_specialist_selection_shadows" does not exist'
		}
	},
	chat_turn_input_artifacts: { data: [], error: null }
});

const call = (url: string, user: unknown) =>
	GET({
		params: { id: SESSION },
		url: new URL(url),
		locals: { safeGetSession: vi.fn().mockResolvedValue({ user }) }
	} as any);

describe('GET /api/admin/chat/sessions/[id] — workflow audit', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		loadPromptEvalResultsMock.mockResolvedValue({ evalRuns: [], assertions: [] });
	});

	it('rejects anonymous callers before touching the service-role client', async () => {
		const response = await call(`http://localhost/api/admin/chat/sessions/${SESSION}`, null);
		expect(response.status).toBe(401);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(createAdminSupabaseClientMock).not.toHaveBeenCalled();
	});

	it('rejects non-admin users even when they are in a pilot cohort', async () => {
		const response = await call(`http://localhost/api/admin/chat/sessions/${SESSION}?debug=1`, {
			id: 'pilot-user',
			is_admin: false
		});
		expect(response.status).toBe(403);
		expect(createAdminSupabaseClientMock).not.toHaveBeenCalled();
	});

	it('rejects a turn_run_id that is not a UUID', async () => {
		const response = await call(
			`http://localhost/api/admin/chat/sessions/${SESSION}?turn_run_id=not-a-uuid`,
			{ id: 'admin', is_admin: true }
		);
		expect(response.status).toBe(400);
		expect(createAdminSupabaseClientMock).not.toHaveBeenCalled();
	});

	it('rejects a turn_run_id that belongs to another session', async () => {
		const tables = baseTables();
		// First query: the session's turn page. Second: the explicit id lookup, scoped to the
		// session, which finds nothing.
		tables.chat_turn_runs = [tables.chat_turn_runs as QueryResult, { data: null, error: null }];
		const admin = createAdminSupabase(tables);
		createAdminSupabaseClientMock.mockReturnValue(admin);
		const response = await call(
			`http://localhost/api/admin/chat/sessions/${SESSION}?turn_run_id=${OTHER_TURN}`,
			{ id: 'admin', is_admin: true }
		);
		expect(response.status).toBe(404);
		const lookup = admin.queriesByTable.get('chat_turn_runs')?.[1];
		expect(lookup.eq).toHaveBeenCalledWith('id', OTHER_TURN);
		expect(lookup.eq).toHaveBeenCalledWith('session_id', SESSION);
		expect(admin.from).not.toHaveBeenCalledWith('chat_turn_workflow_runs');
	});

	it('resolves a deep-linked turn that falls past the first page of turns', async () => {
		const tables = baseTables();
		const lateTurn = {
			id: OTHER_TURN,
			status: 'completed',
			request_message: 'Later review',
			started_at: '2026-09-20T13:00:01.000Z',
			finished_at: '2026-09-20T13:01:00.000Z'
		};
		tables.chat_turn_runs = [
			tables.chat_turn_runs as QueryResult,
			{ data: lateTurn, error: null }
		];
		const admin = createAdminSupabase(tables);
		createAdminSupabaseClientMock.mockReturnValue(admin);
		const response = await call(
			`http://localhost/api/admin/chat/sessions/${SESSION}?turn_run_id=${OTHER_TURN}`,
			{ id: 'admin', is_admin: true }
		);
		const body = await response.json();
		expect(response.status).toBe(200);
		expect(body.data.turn_runs.map((turn: { id: string }) => turn.id)).toEqual([
			TURN,
			OTHER_TURN
		]);
		// The late turn joins the workflow lookup too.
		expect(admin.queriesByTable.get('chat_turn_workflow_runs')?.[0].in).toHaveBeenCalledWith(
			'turn_run_id',
			[TURN, OTHER_TURN]
		);
	});

	it('selects the execution generation on turn events so recoveries can be audited', async () => {
		const admin = createAdminSupabase(baseTables());
		createAdminSupabaseClientMock.mockReturnValue(admin);
		await call(`http://localhost/api/admin/chat/sessions/${SESSION}`, {
			id: 'admin',
			is_admin: true
		});
		const eventColumns = admin.queriesByTable.get('chat_turn_events')?.[0].select.mock
			.calls[0][0] as string;
		expect(eventColumns).toContain('execution_generation');
	});

	it('reports child tables as unavailable when the runs table itself is missing', async () => {
		const tables = baseTables();
		tables.chat_turn_workflow_runs = {
			data: null,
			error: { code: '42P01', message: 'relation "chat_turn_workflow_runs" does not exist' }
		};
		const admin = createAdminSupabase(tables);
		createAdminSupabaseClientMock.mockReturnValue(admin);
		const response = await call(`http://localhost/api/admin/chat/sessions/${SESSION}`, {
			id: 'admin',
			is_admin: true
		});
		const body = await response.json();
		expect(response.status).toBe(200);
		const coverage = body.data.workflows.tables;
		expect(coverage.chat_turn_workflow_runs.status).toBe('unavailable');
		expect(coverage.chat_turn_workflow_steps.status).toBe('unavailable');
		expect(coverage.chat_turn_workflow_steps.detail).toContain('Not queried');
		expect(coverage.chat_turn_workflow_dispatches.status).toBe('unavailable');
		expect(admin.from).not.toHaveBeenCalledWith('chat_turn_workflow_steps');
	});

	it('joins workflow tables through the session turn ids and reports table coverage', async () => {
		const admin = createAdminSupabase(baseTables());
		createAdminSupabaseClientMock.mockReturnValue(admin);
		const response = await call(
			`http://localhost/api/admin/chat/sessions/${SESSION}?turn_run_id=${TURN}`,
			{ id: 'admin', is_admin: true }
		);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(body.success).toBe(true);
		expect(body.data.workflows.version).toBe('chat_workflow_audit_v1');
		expect(body.data.workflows.runs).toHaveLength(1);
		expect(body.data.workflows.runs[0].turn_run_id).toBe(TURN);
		expect(body.data.workflows.runs[0].turn_index).toBe(1);
		expect(body.data.workflows.ordinary_turn_ids).toEqual([]);
		expect(body.data.workflows.tables.chat_turn_specialist_selection_shadows.status).toBe(
			'unavailable'
		);
		expect(body.data.workflows.tables.chat_turn_workflow_steps.status).toBe('available');
		expect(
			body.data.workflows.notes.some((note: string) =>
				note.includes('chat_turn_specialist_selection_shadows')
			)
		).toBe(true);

		const runsQuery = admin.queriesByTable.get('chat_turn_workflow_runs')?.[0];
		expect(runsQuery.in).toHaveBeenCalledWith('turn_run_id', [TURN]);
		expect(
			admin.queriesByTable.get('chat_turn_workflow_dispatches')?.[0].in
		).toHaveBeenCalledWith('turn_run_id', [TURN]);
		const dispatchColumns = admin.queriesByTable.get('chat_turn_workflow_dispatches')?.[0]
			.select.mock.calls[0][0] as string;
		expect(dispatchColumns).not.toContain('settlement_token');
		const shadowColumns = admin.queriesByTable.get(
			'chat_turn_specialist_selection_shadows'
		)?.[0].select.mock.calls[0][0] as string;
		expect(shadowColumns).not.toContain('attempt_token');
		expect(admin.queriesByTable.get('chat_turn_input_artifacts')?.[0].in).toHaveBeenCalledWith(
			'id',
			['artifact-1']
		);
	});

	it('shows stored traces of pass-through tool results and records the admin read', async () => {
		const tables = baseTables();
		const page = {
			url: 'https://clinic.example/intake',
			title: 'Intake',
			content: 'Patient intake form for Dr. Reyes'
		};
		tables.chat_tool_executions = {
			data: [
				{
					id: 'tool-1',
					session_id: SESSION,
					turn_run_id: TURN,
					tool_name: 'web_visit',
					arguments: { url: page.url },
					result: page,
					success: true,
					created_at: '2026-09-20T12:00:05.000Z'
				}
			],
			error: null
		};
		tables.chat_turn_events = {
			data: [
				{
					id: 'event-1',
					turn_run_id: TURN,
					sequence_index: 3,
					phase: 'tool',
					event_type: 'tool_result',
					execution_generation: 1,
					payload: {
						type: 'tool_result',
						result: {
							tool_call_id: 'call-1',
							tool_name: 'web_visit',
							success: true,
							result: page
						}
					},
					created_at: '2026-09-20T12:00:06.000Z'
				}
			],
			error: null
		};
		createAdminSupabaseClientMock.mockReturnValue(createAdminSupabase(tables));
		const response = await call(`http://localhost/api/admin/chat/sessions/${SESSION}`, {
			id: 'admin',
			is_admin: true
		});
		const body = await response.json();
		expect(response.status).toBe(200);
		const serialized = JSON.stringify(body.data);
		expect(serialized).not.toContain('Dr. Reyes');
		expect(body.data.tool_executions[0].result).toMatchObject({
			url: page.url,
			title: 'Intake',
			content_redacted: true
		});
		expect(logSecurityEventMock).toHaveBeenCalledOnce();
		expect(logSecurityEventMock.mock.calls[0][0]).toMatchObject({
			eventType: 'admin.chat_content.read',
			actorUserId: 'admin',
			targetType: 'chat_session',
			targetId: SESSION,
			metadata: {
				route: '/api/admin/chat/sessions/[id]',
				target_user_ids: ['user-1'],
				rows: { tool_executions: 1, turn_events: 1, messages: 0 }
			}
		});
		expect(JSON.stringify(logSecurityEventMock.mock.calls)).not.toContain('Intake');
	});

	it('still returns ordinary sessions when no workflow rows exist', async () => {
		const tables = baseTables();
		tables.chat_turn_workflow_runs = { data: [], error: null };
		const admin = createAdminSupabase(tables);
		createAdminSupabaseClientMock.mockReturnValue(admin);
		const response = await call(`http://localhost/api/admin/chat/sessions/${SESSION}`, {
			id: 'admin',
			is_admin: true
		});
		const body = await response.json();
		expect(response.status).toBe(200);
		expect(body.data.workflows.runs).toEqual([]);
		expect(body.data.workflows.ordinary_turn_ids).toEqual([TURN]);
		expect(admin.from).not.toHaveBeenCalledWith('chat_turn_workflow_steps');
	});
});
