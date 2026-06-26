// apps/web/src/routes/api/onto/projects/[id]/suggestions/[suggestion_id]/chat-session/server.test.ts
import { describe, expect, it, vi } from 'vitest';

const USER_ID = 'user-1';
const PROJECT_ID = 'project-1';
const SUGGESTION_ID = 'suggestion-1';
const RUN_ID = 'run-1';
const SESSION_ID = 'session-1';

const mocks = vi.hoisted(() => ({
	requireProjectMemberAccess: vi.fn()
}));

vi.mock('$lib/server/ontology-project-access', () => ({
	requireProjectMemberAccess: mocks.requireProjectMemberAccess
}));

vi.mock('$lib/config/project-loops', () => ({
	PROJECT_LOOPS_ENABLED: true
}));

import { POST } from './+server';

type Operation = {
	table: string;
	action: 'select' | 'insert' | 'update' | 'delete' | null;
	payload: unknown;
	filters: Array<{ column: string; value: unknown }>;
};

function createSupabaseMock(
	options: {
		existingChatSessionId?: string | null;
		projectLinkError?: unknown;
		messageInsertError?: unknown;
		suggestionUpdateError?: unknown;
	} = {}
) {
	const operations: Operation[] = [];
	const suggestion = {
		id: SUGGESTION_ID,
		run_id: RUN_ID,
		project_id: PROJECT_ID,
		kind: 'drift',
		risk_tier: 2,
		title: 'Clarify project direction',
		rationale: 'The latest tasks point in two directions.',
		why_now: 'Recent changes created drift.',
		confidence: 0.82,
		evidence_refs: [{ entity_type: 'task', title: 'Launch task', reason: 'Changed scope' }],
		preview: { summary: 'Flag the drift and review the next action.' },
		operations: [
			{
				tool: 'update_onto_task',
				args: { task_id: 'task-1', props: { loop_flagged_conflict: true } },
				label: 'Flag conflicting task'
			}
		],
		status: 'pending',
		reversible: true,
		freshness_state: 'fresh',
		created_at: '2026-06-26T10:00:00.000Z',
		chat_session_id: options.existingChatSessionId ?? null
	};
	const session = {
		id: SESSION_ID,
		user_id: USER_ID,
		context_type: 'project',
		entity_id: PROJECT_ID,
		status: 'active',
		chat_type: 'project_suggestion',
		title: 'Discuss: Clarify project direction'
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

			if (this.table === 'project_suggestions' && this.action === 'select') {
				return Promise.resolve({ data: suggestion, error: null });
			}
			if (this.table === 'chat_sessions' && this.action === 'select') {
				return Promise.resolve({
					data: options.existingChatSessionId ? session : null,
					error: null
				});
			}
			if (this.table === 'onto_projects' && this.action === 'select') {
				return Promise.resolve({
					data: { id: PROJECT_ID, name: 'Launch Project' },
					error: null
				});
			}
			if (this.table === 'project_loop_runs' && this.action === 'select') {
				return Promise.resolve({
					data: {
						id: RUN_ID,
						trigger_reason: 'manual',
						summary: 'Manual project review completed.',
						created_at: '2026-06-26T10:00:00.000Z',
						finished_at: '2026-06-26T10:02:00.000Z'
					},
					error: null
				});
			}
			if (this.table === 'chat_sessions' && this.action === 'insert') {
				return Promise.resolve({ data: session, error: null });
			}
			if (this.table === 'chat_sessions_projects' && this.action === 'insert') {
				return Promise.resolve({ data: null, error: options.projectLinkError ?? null });
			}
			if (this.table === 'chat_messages' && this.action === 'insert') {
				return Promise.resolve({ data: null, error: options.messageInsertError ?? null });
			}
			if (this.table === 'project_suggestions' && this.action === 'update') {
				return Promise.resolve({
					data: options.suggestionUpdateError
						? null
						: { ...suggestion, chat_session_id: SESSION_ID },
					error: options.suggestionUpdateError ?? null
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

function expectDiscussionCleanup(operations: Operation[]) {
	expect(findOperation(operations, 'chat_messages', 'delete')?.filters).toEqual(
		expect.arrayContaining([
			{ column: 'session_id', value: SESSION_ID },
			{ column: 'user_id', value: USER_ID }
		])
	);
	expect(findOperation(operations, 'chat_sessions_projects', 'delete')?.filters).toEqual(
		expect.arrayContaining([
			{ column: 'chat_session_id', value: SESSION_ID },
			{ column: 'project_id', value: PROJECT_ID }
		])
	);
	expect(findOperation(operations, 'chat_sessions', 'delete')?.filters).toEqual(
		expect.arrayContaining([
			{ column: 'id', value: SESSION_ID },
			{ column: 'user_id', value: USER_ID }
		])
	);
}

async function callPost(supabase: unknown) {
	mocks.requireProjectMemberAccess.mockResolvedValue({
		ok: true,
		projectId: PROJECT_ID,
		userId: USER_ID,
		actorId: 'actor-1'
	});
	return POST({
		params: { id: PROJECT_ID, suggestion_id: SUGGESTION_ID },
		locals: {
			supabase,
			safeGetSession: vi.fn().mockResolvedValue({ user: { id: USER_ID } })
		}
	} as any);
}

describe('POST /api/onto/projects/[id]/suggestions/[suggestion_id]/chat-session', () => {
	it('reuses an existing linked discussion session', async () => {
		const { supabase, operations } = createSupabaseMock({
			existingChatSessionId: SESSION_ID
		});

		const response = await callPost(supabase);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.data).toMatchObject({ created: false, chat_session_id: SESSION_ID });
		expect(findOperation(operations, 'chat_messages', 'insert')).toBeUndefined();
	});

	it('creates, seeds, project-links, and stores a suggestion discussion session', async () => {
		const { supabase, operations } = createSupabaseMock();

		const response = await callPost(supabase);
		const payload = await response.json();

		expect(response.status).toBe(201);
		expect(payload.data).toMatchObject({ created: true, chat_session_id: SESSION_ID });

		const sessionInsert = findOperation(operations, 'chat_sessions', 'insert');
		expect(sessionInsert?.payload).toMatchObject({
			user_id: USER_ID,
			context_type: 'project',
			entity_id: PROJECT_ID,
			chat_type: 'project_suggestion',
			message_count: 1,
			agent_metadata: expect.objectContaining({
				source: 'project_suggestion',
				suggestion_id: SUGGESTION_ID,
				project_id: PROJECT_ID
			})
		});

		expect(
			findOperation(operations, 'chat_sessions_projects', 'insert')?.payload
		).toMatchObject({
			chat_session_id: SESSION_ID,
			project_id: PROJECT_ID
		});

		const messageInsert = findOperation(operations, 'chat_messages', 'insert');
		expect(messageInsert?.payload).toMatchObject({
			session_id: SESSION_ID,
			user_id: USER_ID,
			role: 'assistant',
			message_type: 'text',
			metadata: expect.objectContaining({
				source: 'project_suggestion',
				suggestion_id: SUGGESTION_ID,
				seed_message: true
			})
		});
		expect((messageInsert?.payload as { content?: string }).content).toContain(
			'Clarify project direction'
		);

		expect(findOperation(operations, 'project_suggestions', 'update')?.payload).toMatchObject({
			chat_session_id: SESSION_ID
		});
	});

	it('cleans up the created session when suggestion link update fails', async () => {
		const { supabase, operations } = createSupabaseMock({
			suggestionUpdateError: { message: 'update failed', code: 'XX002' }
		});

		const response = await callPost(supabase);
		const payload = await response.json();

		expect(response.status).toBe(500);
		expect(payload.success).toBe(false);
		expect(payload.code).toBe('DATABASE_ERROR');
		expectDiscussionCleanup(operations);
	});
});
