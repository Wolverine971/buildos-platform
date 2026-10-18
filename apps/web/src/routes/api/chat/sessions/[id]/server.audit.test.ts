// apps/web/src/routes/api/chat/sessions/[id]/server.audit.test.ts
// Regression contracts from the 2026-10-18 audit. SQL semantics also run in the migration rehearsal.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAgentChatSessionSnapshot } from '$lib/components/agent/agent-chat-session';

const adminMocks = vi.hoisted(() => ({ createAdmin: vi.fn() }));
vi.mock('$lib/supabase/admin', () => ({ createAdminSupabaseClient: adminMocks.createAdmin }));
import { GET, PATCH } from './+server';

const SESSION = 'a1000000-0000-4000-8000-000000000001';
const USER = 'a2000000-0000-4000-8000-000000000001';
const TURN = 'a3000000-0000-4000-8000-000000000001';
type Row = Record<string, any>;
type QueryError = { code: string; message: string };

function session() {
	return {
		id: SESSION,
		user_id: USER,
		context_type: 'global',
		entity_id: null,
		agent_metadata: null
	};
}

function message(index: number, role = 'user'): Row {
	return {
		id: `message-${index}`,
		session_id: SESSION,
		user_id: USER,
		role,
		content: `Message ${index}`,
		created_at: new Date(Date.UTC(2026, 9, 18, 0, 0, index)).toISOString(),
		metadata: {}
	};
}

// A query fake that actually filters, orders, limits and snapshots rows, unlike
// fixed result mocks. No network, credentials, model calls, or production writes.
function database(
	tables: Record<string, Row[]>,
	options: { errors?: Record<string, QueryError>; afterRead?: (table: string) => void } = {}
) {
	const reads: string[] = [];
	const writes: Array<{ table: string; patch: Row }> = [];
	const from = vi.fn((table: string) => {
		const filters: Array<(row: Row) => boolean> = [];
		const ordering: Array<{ key: string; ascending: boolean }> = [];
		let cap = Infinity;
		let patch: Row | null = null;
		function execute(single = false) {
			reads.push(table);
			const error = options.errors?.[table];
			if (error) return { data: null, error };
			let rows = (tables[table] ?? []).filter((row) => filters.every((fn) => fn(row)));
			if (patch) {
				if (rows.length) writes.push({ table, patch });
				for (const row of rows) Object.assign(row, patch);
			}
			rows = [...rows]
				.sort((a, b) => {
					for (const { key, ascending } of ordering) {
						const comparison = a[key] === b[key] ? 0 : a[key] < b[key] ? -1 : 1;
						if (comparison) return ascending ? comparison : -comparison;
					}
					return 0;
				})
				.slice(0, cap);
			const data = structuredClone(single ? (rows[0] ?? null) : rows);
			if (single && data && !Array.isArray(data) && table === 'chat_sessions') {
				data.focus = data.agent_metadata?.focus;
				data.pending_turn_contract = data.agent_metadata?.fastchat_pending_turn_contract;
			}
			options.afterRead?.(table);
			return { data, error: null };
		}
		const query = {
			select: vi.fn().mockReturnThis(),
			eq(key: string, value: unknown) {
				filters.push((row) => row[key] === value);
				return query;
			},
			in(key: string, values: unknown[]) {
				filters.push((row) => values.includes(row[key]));
				return query;
			},
			is(key: string, value: unknown) {
				filters.push((row) => row[key] === value);
				return query;
			},
			order(key: string, opts: { ascending: boolean }) {
				ordering.push({ key, ...opts });
				return query;
			},
			limit(count: number) {
				cap = count;
				return query;
			},
			update(value: Row) {
				patch = value;
				return query;
			},
			maybeSingle() {
				return Promise.resolve(execute(true));
			},
			single() {
				return Promise.resolve(execute(true));
			},
			then(
				resolve: (value: ReturnType<typeof execute>) => unknown,
				reject?: (reason: unknown) => unknown
			) {
				return Promise.resolve(execute()).then(resolve, reject);
			}
		};
		return query;
	});
	const rpc = vi.fn(async (name: string, args: any) => {
		if (name === 'get_chat_restore_attachments_v1')
			return { data: tables.chat_message_attachments ?? [], error: null };
		expect(name).toBe('get_chat_session_restore_v1');
		expect(args).toEqual({ p_session_id: SESSION, p_user_id: USER });
		const snapshot = structuredClone(tables);
		const messages = (snapshot.chat_messages ?? [])
			.filter((m) => m.session_id === SESSION && ['user', 'assistant'].includes(m.role))
			.sort((a, b) => b.created_at.localeCompare(a.created_at));
		const visible = messages.slice(0, 400).reverse();
		const ids = new Set(visible.map((m) => m.id));
		const data = {
			messages: visible,
			turnRuns: (snapshot.chat_turn_runs ?? []).filter(
				(r) => r.user_id === USER && r.session_id === SESSION
			),
			toolExecutions: (snapshot.chat_tool_executions ?? []).filter(
				(t) => !t.message_id || ids.has(t.message_id)
			),
			turnEvents: snapshot.chat_turn_events ?? [],
			workflows: [],
			truncated: messages.length > 400,
			historyWindow: { toolsTruncated: false, eventsTruncated: false }
		};
		options.afterRead?.('chat_messages');
		return { data, error: null };
	});
	return { from, rpc, reads, writes };
}

function event(db: ReturnType<typeof database>, body?: unknown, userId: string | null = USER) {
	if (!adminMocks.createAdmin.getMockImplementation()) adminMocks.createAdmin.mockReturnValue(db);
	return {
		params: { id: SESSION },
		url: new URL(`https://example.test/api/chat/sessions/${SESSION}`),
		request: new Request(`https://example.test/api/chat/sessions/${SESSION}`, {
			method: body === undefined ? 'GET' : 'PATCH',
			headers: { 'content-type': 'application/json' },
			...(body === undefined ? {} : { body: JSON.stringify(body) })
		}),
		locals: {
			supabase: db,
			safeGetSession: async () => ({ user: userId ? { id: userId } : null })
		}
	} as any;
}

describe('session route audit — restore regressions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		adminMocks.createAdmin.mockReset();
	});

	it('returns owned turn state for an ordinary non-admin user', async () => {
		// Production pg_policies on 2026-10-18: SELECT on both turn tables is
		// authenticated + is_admin(). The user client sees [], with no error.
		const turn = { id: TURN, session_id: SESSION, user_id: USER, status: 'running' };
		const userDb = database({ chat_sessions: [session()], chat_messages: [message(1)] });
		adminMocks.createAdmin.mockReturnValue(database({ chat_turn_runs: [turn] }));
		const response = await GET(event(userDb));
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.data.turnRuns).toContainEqual(expect.objectContaining({ id: TURN }));
	});

	it('keeps polling when a completion commits after the restore snapshot', async () => {
		const turn = {
			id: TURN,
			session_id: SESSION,
			user_id: USER,
			status: 'running',
			started_at: message(1).created_at,
			assistant_message_id: null as string | null
		};
		const tables = {
			chat_sessions: [session()],
			chat_messages: [message(1)],
			chat_turn_runs: [turn]
		};
		const db = database(tables, {
			afterRead(table) {
				if (table !== 'chat_messages' || turn.status !== 'running') return;
				// Model the worker's atomic commit immediately after the old message
				// snapshot was read. The later turn query sees the terminal row.
				tables.chat_messages.push(message(2, 'assistant'));
				turn.status = 'completed';
				turn.assistant_message_id = 'message-2';
			}
		});
		const body = await (await GET(event(db))).json();
		expect(body.data.turnRuns[0].status).toBe('running');
		expect(buildAgentChatSessionSnapshot(body.data).activeTurnRun?.id).toBe(TURN);
		const refreshed = await (await GET(event(db))).json();
		expect(refreshed.data.turnRuns[0].status).toBe('completed');
		expect(refreshed.data.messages).toContainEqual(
			expect.objectContaining({ id: 'message-2' })
		);
	});

	it('does not mix old tool activity into a truncated message window', async () => {
		const messages = Array.from({ length: 401 }, (_, i) => message(i));
		const db = database({
			chat_sessions: [session()],
			chat_messages: messages,
			chat_tool_executions: [
				{
					id: 'old-tool',
					session_id: SESSION,
					message_id: 'message-0',
					tool_name: 'list_onto_tasks',
					success: true,
					result: { tasks: [] },
					created_at: messages[0]!.created_at
				}
			]
		});
		const body = await (await GET(event(db))).json();
		expect(body.data.messages).toHaveLength(400);
		expect(body.data.messages[0].id).toBe('message-1');
		expect(body.data.timelineItems.some((item: Row) => item.messageId === 'message-0')).toBe(
			false
		);
	});

	it('does not announce truncation when exactly 400 messages exist', async () => {
		const db = database({
			chat_sessions: [session()],
			chat_messages: Array.from({ length: 400 }, (_, i) => message(i))
		});
		const body = await (await GET(event(db))).json();
		expect(body.data.truncated).toBe(false);
	});

	it('reports a database outage as a server error, not a missing conversation', async () => {
		const db = database(
			{},
			{ errors: { chat_sessions: { code: '57014', message: 'statement timeout' } } }
		);
		expect((await GET(event(db))).status).toBe(500);
	});

	it('keeps a queued worker turn active in the restored client snapshot', () => {
		const snapshot = buildAgentChatSessionSnapshot({
			session: session() as any,
			messages: [message(1)] as any,
			turnRuns: [{ id: TURN, status: 'queued', session_id: SESSION }]
		});
		expect(snapshot.activeTurnRun?.id).toBe(TURN);
	});
});

describe('session route audit — rename and ownership controls', () => {
	it('trims a valid title and only updates the owned session', async () => {
		const owned = session();
		const db = database({ chat_sessions: [owned] });
		const response = await PATCH(event(db, { title: '  Renamed chat  ' }));
		expect(response.status).toBe(200);
		expect((await response.json()).data.session.title).toBe('Renamed chat');
		expect(db.writes).toHaveLength(1);
	});

	it.each([
		{ title: ' ' },
		{ title: 'x'.repeat(121) },
		{ title: 12 },
		{ title: 'ok', user_id: 'foreign' }
	])('rejects invalid rename payload %j before reading the database', async (payload) => {
		const db = database({ chat_sessions: [session()] });
		expect((await PATCH(event(db, payload))).status).toBe(422);
		expect(db.from).not.toHaveBeenCalled();
	});

	it('does not read or update a foreign session', async () => {
		const db = database({ chat_sessions: [{ ...session(), user_id: 'foreign' }] });
		expect((await GET(event(db))).status).toBe(404);
		expect((await PATCH(event(db, { title: 'Renamed' }))).status).toBe(404);
		expect(db.writes).toEqual([]);
	});

	it('rejects signed-out GET and PATCH before querying', async () => {
		const db = database({ chat_sessions: [session()] });
		expect((await GET(event(db, undefined, null))).status).toBe(401);
		expect((await PATCH(event(db, { title: 'Renamed' }, null))).status).toBe(401);
		expect(db.from).not.toHaveBeenCalled();
	});
});

describe('restore error and active-state boundaries', () => {
	it.each(['queued', 'running', 'completed', 'failed', 'cancelled'])(
		'restores the correct active state for %s',
		(status) => {
			const snapshot = buildAgentChatSessionSnapshot({
				session: session() as any,
				messages: [message(1)] as any,
				turnRuns: [{ id: TURN, status }]
			});
			expect(Boolean(snapshot.activeTurnRun)).toBe(['queued', 'running'].includes(status));
		}
	);
	it('reports activity caps even when every message fits', () => {
		const snapshot = buildAgentChatSessionSnapshot({
			session: session() as any,
			messages: [message(1)] as any,
			truncated: false,
			historyWindow: { toolsTruncated: true }
		});
		expect(snapshot.messages[0]?.content).toContain('older activity details');
		expect(snapshot.messages[0]?.content).not.toContain('most recent messages');
	});
	it('preserves database errors in rename and pending-change probes', async () => {
		const db = database(
			{},
			{ errors: { chat_sessions: { code: '57014', message: 'timeout' } } }
		);
		expect((await PATCH(event(db, { title: 'Rename' }))).status).toBe(500);
		const probe = event(db);
		probe.url.searchParams.set('probe', 'pending-change');
		expect((await GET(probe)).status).toBe(500);
	});
	it('rejects malformed ids before any database query', async () => {
		const db = database({});
		const request = event(db);
		request.params.id = 'bad-id';
		expect((await GET(request)).status).toBe(404);
		expect(db.from).not.toHaveBeenCalled();
		expect(db.rpc).not.toHaveBeenCalled();
	});
});

describe('restore query and payload budget', () => {
	it('uses three core calls and excludes the runtime context cache', async () => {
		const db = database({
			chat_sessions: [
				{ ...session(), agent_metadata: { runtime_cache: 'cache-sentinel'.repeat(6000) } }
			],
			chat_messages: [message(1)]
		});
		adminMocks.createAdmin.mockReturnValue(db);
		const body = await (await GET(event(db))).json();
		expect(db.from.mock.calls).toEqual([['chat_sessions']]);
		expect(db.rpc.mock.calls.map(([name]) => name)).toEqual([
			'get_chat_session_restore_v1',
			'get_chat_restore_attachments_v1'
		]);
		expect(JSON.stringify(body)).not.toContain('cache-sentinel');
		const selection = db.from.mock.results[0]!.value.select.mock.calls[0]?.[0];
		expect(selection).toContain('focus:agent_metadata->focus');
		expect(selection).not.toContain('*');
	});
	it('uses the server reader for the legacy active probe and excludes foreign rows', async () => {
		const userDb = database({});
		const admin = database({
			chat_turn_runs: [
				{ id: TURN, session_id: SESSION, user_id: USER, status: 'queued' },
				{ id: 'foreign', session_id: SESSION, user_id: 'foreign', status: 'running' }
			]
		});
		adminMocks.createAdmin.mockReturnValue(admin);
		const request = event(userDb);
		request.url.searchParams.set('probe', 'active-turn');
		const body = await (await GET(request)).json();
		expect(body.data.turnRuns.map((row: Row) => row.id)).toEqual([TURN]);
		expect(userDb.from).not.toHaveBeenCalled();
	});
});
