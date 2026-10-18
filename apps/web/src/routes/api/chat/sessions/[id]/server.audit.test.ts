// apps/web/src/routes/api/chat/sessions/[id]/server.audit.test.ts
// Audit reproductions, 2026-10-18. `it.fails` records an unmet contract, not a fix.
// Remove the `.fails` modifier as each corresponding bug is repaired.
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
				writes.push({ table, patch });
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
	return { from, reads, writes };
}

function event(db: ReturnType<typeof database>, body?: unknown, userId: string | null = USER) {
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

describe('session route audit — unmet restore contracts', () => {
	beforeEach(() => vi.clearAllMocks());

	it.fails('returns owned turn state for an ordinary non-admin user', async () => {
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

	it.fails(
		'includes the reply when a turn finishes between the message and status reads',
		async () => {
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
			expect(body.data.turnRuns[0].status).toBe('completed');
			expect(body.data.messages).toContainEqual(expect.objectContaining({ id: 'message-2' }));
		}
	);

	it.fails('does not mix old tool activity into a truncated message window', async () => {
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

	it.fails('does not announce truncation when exactly 400 messages exist', async () => {
		const db = database({
			chat_sessions: [session()],
			chat_messages: Array.from({ length: 400 }, (_, i) => message(i))
		});
		const body = await (await GET(event(db))).json();
		expect(body.data.truncated).toBe(false);
	});

	it.fails(
		'reports a database outage as a server error, not a missing conversation',
		async () => {
			const db = database(
				{},
				{ errors: { chat_sessions: { code: '57014', message: 'statement timeout' } } }
			);
			expect((await GET(event(db))).status).toBe(500);
		}
	);

	it.fails('keeps a queued worker turn active in the restored client snapshot', () => {
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
