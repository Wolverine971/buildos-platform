// apps/web/src/routes/api/onto/braindumps/[id]/chat-session/server.test.ts
import { describe, expect, it, vi } from 'vitest';

import { POST } from './+server';

const USER_ID = 'user-1';
const BRAINDUMP_ID = 'braindump-1';
const SESSION_ID = 'session-1';

type Operation = {
	table: string;
	action: 'select' | 'insert' | 'update' | 'delete' | null;
	payload: unknown;
	filters: Array<{ column: string; value: unknown }>;
};

function createSupabaseMock(
	options: {
		messageInsertError?: unknown;
		braindumpUpdateError?: unknown;
	} = {}
) {
	const operations: Operation[] = [];
	const braindump = {
		id: BRAINDUMP_ID,
		user_id: USER_ID,
		content: 'Launch notes and next steps',
		title: 'Launch Brain Dump',
		topics: [],
		summary: 'Launch summary',
		status: 'processed',
		error_message: null,
		metadata: {},
		processed_at: '2026-06-20T00:00:00.000Z',
		chat_session_id: null,
		created_at: '2026-06-19T00:00:00.000Z',
		updated_at: '2026-06-19T00:00:00.000Z'
	};
	const session = {
		id: SESSION_ID,
		user_id: USER_ID,
		context_type: 'global',
		status: 'active',
		chat_type: 'braindump',
		title: 'Brain Dump: Launch Brain Dump'
	};

	class QueryBuilderMock {
		private action: Operation['action'] = null;
		private payload: unknown = null;
		private filters: Array<{ column: string; value: unknown }> = [];

		constructor(private readonly table: string) {}

		select() {
			if (!this.action) this.action = 'select';
			return this;
		}

		insert(payload: unknown) {
			this.action = 'insert';
			this.payload = payload;
			return this;
		}

		update(payload: unknown) {
			this.action = 'update';
			this.payload = payload;
			return this;
		}

		delete() {
			this.action = 'delete';
			return this;
		}

		eq(column: string, value: unknown) {
			this.filters.push({ column, value });
			return this;
		}

		private recordOperation() {
			operations.push({
				table: this.table,
				action: this.action,
				payload: this.payload,
				filters: [...this.filters]
			});
		}

		private resolve() {
			this.recordOperation();

			if (this.table === 'onto_braindumps' && this.action === 'select') {
				return Promise.resolve({ data: braindump, error: null });
			}
			if (this.table === 'chat_sessions' && this.action === 'insert') {
				return Promise.resolve({ data: session, error: null });
			}
			if (this.table === 'chat_messages' && this.action === 'insert') {
				return Promise.resolve({
					data: null,
					error: options.messageInsertError ?? null
				});
			}
			if (this.table === 'onto_braindumps' && this.action === 'update') {
				return Promise.resolve({
					data: options.braindumpUpdateError
						? null
						: { ...braindump, chat_session_id: SESSION_ID },
					error: options.braindumpUpdateError ?? null
				});
			}
			if (this.action === 'delete') {
				return Promise.resolve({ data: null, error: null });
			}

			return Promise.resolve({ data: null, error: null });
		}

		single() {
			return this.resolve();
		}

		maybeSingle() {
			return this.resolve();
		}

		then<TResult1 = any, TResult2 = never>(
			onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
			onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
		) {
			return this.resolve().then(onfulfilled, onrejected);
		}
	}

	const supabase = {
		from: vi.fn((table: string) => new QueryBuilderMock(table))
	};

	return { supabase, operations };
}

function findOperation(
	operations: Operation[],
	table: string,
	action: Operation['action']
): Operation | undefined {
	return operations.find((operation) => operation.table === table && operation.action === action);
}

function expectUserScopedCleanup(operations: Operation[]) {
	const messageDelete = findOperation(operations, 'chat_messages', 'delete');
	expect(messageDelete?.filters).toEqual(
		expect.arrayContaining([
			{ column: 'session_id', value: SESSION_ID },
			{ column: 'user_id', value: USER_ID }
		])
	);

	const sessionDelete = findOperation(operations, 'chat_sessions', 'delete');
	expect(sessionDelete?.filters).toEqual(
		expect.arrayContaining([
			{ column: 'id', value: SESSION_ID },
			{ column: 'user_id', value: USER_ID }
		])
	);
}

async function callPost(supabase: unknown) {
	return POST({
		params: { id: BRAINDUMP_ID },
		locals: {
			supabase,
			safeGetSession: vi.fn().mockResolvedValue({ user: { id: USER_ID } })
		}
	} as any);
}

describe('POST /api/onto/braindumps/[id]/chat-session', () => {
	it('cleans up the created session when seed message insert fails', async () => {
		const { supabase, operations } = createSupabaseMock({
			messageInsertError: { message: 'message insert failed', code: 'XX001' }
		});

		const response = await callPost(supabase);
		const payload = await response.json();

		expect(response.status).toBe(500);
		expect(payload.success).toBe(false);
		expect(payload.code).toBe('DATABASE_ERROR');
		expectUserScopedCleanup(operations);
	});

	it('cleans up the created session when braindump link update fails', async () => {
		const { supabase, operations } = createSupabaseMock({
			braindumpUpdateError: { message: 'update failed', code: 'XX002' }
		});

		const response = await callPost(supabase);
		const payload = await response.json();

		expect(response.status).toBe(500);
		expect(payload.success).toBe(false);
		expect(payload.code).toBe('DATABASE_ERROR');
		expect(findOperation(operations, 'chat_messages', 'insert')).toBeDefined();
		expectUserScopedCleanup(operations);
	});
});
