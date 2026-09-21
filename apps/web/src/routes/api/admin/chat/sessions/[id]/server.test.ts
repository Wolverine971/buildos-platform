// apps/web/src/routes/api/admin/chat/sessions/[id]/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createAdminSupabaseClientMock, loadPromptEvalResultsMock } = vi.hoisted(() => ({
	createAdminSupabaseClientMock: vi.fn(),
	loadPromptEvalResultsMock: vi.fn()
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: createAdminSupabaseClientMock
}));
vi.mock('$lib/services/agentic-chat-v2/prompt-eval-runner', () => ({
	loadPromptEvalResultsForTurnRuns: loadPromptEvalResultsMock
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

function createAdminSupabase(resultsByTable: Record<string, QueryResult>) {
	const queriesByTable = new Map<string, any[]>();
	return {
		from: vi.fn((table: string) => {
			const query = createQuery(resultsByTable[table] ?? { data: [], error: null });
			queriesByTable.set(table, [...(queriesByTable.get(table) ?? []), query]);
			return query;
		}),
		queriesByTable
	};
}

const SESSION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TURN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OTHER_TURN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const baseTables = (): Record<string, QueryResult> => ({
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
		const admin = createAdminSupabase(baseTables());
		createAdminSupabaseClientMock.mockReturnValue(admin);
		const response = await call(
			`http://localhost/api/admin/chat/sessions/${SESSION}?turn_run_id=${OTHER_TURN}`,
			{ id: 'admin', is_admin: true }
		);
		expect(response.status).toBe(404);
		expect(admin.from).not.toHaveBeenCalledWith('chat_turn_workflow_runs');
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
