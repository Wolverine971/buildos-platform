// apps/web/src/lib/server/agent-run-chat-session.service.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	buildAgentRunChatContext,
	createAgentRunChatSession
} from './agent-run-chat-session.service';

type Row = Record<string, any>;

type Operation = {
	table: string;
	action: 'insert' | 'update' | 'delete';
	payload?: Row;
	filters: Array<[string, unknown]>;
	containsFilters: Array<[string, Row]>;
};

type MockState = {
	tables: Record<string, Row[]>;
	operations: Operation[];
};

function matchesContains(row: Row, column: string, expected: Row): boolean {
	const actual = row[column];
	if (!actual || typeof actual !== 'object' || Array.isArray(actual)) return false;
	return Object.entries(expected).every(([key, value]) => actual[key] === value);
}

function matchesFilters(
	row: Row,
	filters: Array<[string, unknown]>,
	containsFilters: Array<[string, Row]>
): boolean {
	return (
		filters.every(([field, value]) => row[field] === value) &&
		containsFilters.every(([field, value]) => matchesContains(row, field, value))
	);
}

class QueryBuilderMock {
	private action: 'select' | 'insert' | 'update' | 'delete' = 'select';
	private filters: Array<[string, unknown]> = [];
	private containsFilters: Array<[string, Row]> = [];
	private insertPayload: Row | null = null;
	private updatePayload: Row | null = null;

	constructor(
		private readonly state: MockState,
		private readonly table: string
	) {}

	select() {
		this.action = this.action === 'insert' ? 'insert' : 'select';
		return this;
	}

	insert(payload: Row) {
		this.action = 'insert';
		this.insertPayload = payload;
		return this;
	}

	update(payload: Row) {
		this.action = 'update';
		this.updatePayload = payload;
		return this;
	}

	delete() {
		this.action = 'delete';
		return this;
	}

	eq(field: string, value: unknown) {
		this.filters.push([field, value]);
		return this;
	}

	contains(field: string, value: Row) {
		this.containsFilters.push([field, value]);
		return this;
	}

	order() {
		return this;
	}

	limit() {
		return this;
	}

	async maybeSingle() {
		const rows = this.state.tables[this.table] ?? [];
		const row =
			rows.find((entry) => matchesFilters(entry, this.filters, this.containsFilters)) ?? null;
		return { data: row, error: null };
	}

	async single() {
		if (this.action === 'insert' && this.insertPayload) {
			const row = {
				id:
					this.insertPayload.id ??
					`${this.table}-${this.state.tables[this.table]?.length ?? 0}`,
				...this.insertPayload
			};
			this.state.tables[this.table] = [...(this.state.tables[this.table] ?? []), row];
			this.state.operations.push({
				table: this.table,
				action: 'insert',
				payload: this.insertPayload,
				filters: [...this.filters],
				containsFilters: [...this.containsFilters]
			});
			return { data: row, error: null };
		}
		return this.maybeSingle();
	}

	then(resolve: (value: { data: unknown; error: null }) => unknown) {
		if (this.action === 'insert' && this.insertPayload) {
			this.state.tables[this.table] = [
				...(this.state.tables[this.table] ?? []),
				{
					id:
						this.insertPayload.id ??
						`${this.table}-${this.state.tables[this.table]?.length ?? 0}`,
					...this.insertPayload
				}
			];
			this.state.operations.push({
				table: this.table,
				action: 'insert',
				payload: this.insertPayload,
				filters: [...this.filters],
				containsFilters: [...this.containsFilters]
			});
			return Promise.resolve(resolve({ data: null, error: null }));
		}

		if (this.action === 'update' && this.updatePayload) {
			const rows = this.state.tables[this.table] ?? [];
			for (const row of rows) {
				if (matchesFilters(row, this.filters, this.containsFilters)) {
					Object.assign(row, this.updatePayload);
				}
			}
			this.state.operations.push({
				table: this.table,
				action: 'update',
				payload: this.updatePayload,
				filters: [...this.filters],
				containsFilters: [...this.containsFilters]
			});
			return Promise.resolve(resolve({ data: null, error: null }));
		}

		if (this.action === 'delete') {
			this.state.tables[this.table] = (this.state.tables[this.table] ?? []).filter(
				(row) => !matchesFilters(row, this.filters, this.containsFilters)
			);
			this.state.operations.push({
				table: this.table,
				action: 'delete',
				filters: [...this.filters],
				containsFilters: [...this.containsFilters]
			});
			return Promise.resolve(resolve({ data: null, error: null }));
		}

		return Promise.resolve(resolve({ data: null, error: null }));
	}
}

function createSupabaseMock(tables: Record<string, Row[]>) {
	const state: MockState = { tables, operations: [] };
	return {
		state,
		supabase: {
			from: vi.fn((table: string) => new QueryBuilderMock(state, table))
		}
	};
}

function agentRun(overrides: Row = {}): Row {
	return {
		id: 'run-1',
		user_id: 'user-1',
		status: 'proposal_ready',
		label: 'Update project START HERE',
		goal: 'Review proposed Start Here updates captured from the completed chat.',
		instructions:
			'This run was created by chat follow-up processing. Review the staged document update before applying it.',
		expected_output: 'A reviewed update to the project Start Here document.',
		context_type: 'project',
		project_id: 'project-1',
		parent_session_id: null,
		scope_mode: 'read_write',
		allowed_ops: ['onto.document.update'],
		change_set: {
			run_id: 'run-1',
			status: 'pending',
			changes: [
				{
					id: 'change-1',
					op: 'onto.document.update',
					entity_type: 'document',
					entity_id: 'doc-1',
					action: 'update',
					before: { content: 'Old START HERE' },
					after: { content: 'New START HERE', title: 'START HERE' },
					rationale: 'Captured durable project orientation from chat.',
					decision: 'pending'
				}
			],
			created_at: '2026-06-29T12:00:00.000Z'
		},
		result: {
			summary: 'Review proposed Start Here updates captured from the completed chat.',
			answer: 'A Start Here document update is staged for review.',
			proposed_changes: null,
			metrics: { tokens: 0, cost_usd: 0, tool_calls: 0, duration_ms: 0 }
		},
		metrics: { tokens: 0, cost_usd: 0, tool_calls: 0, duration_ms: 0 },
		...overrides
	};
}

describe('agent-run chat session service', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-06-29T15:00:00.000Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('builds visible context with Start Here-style change details', () => {
		const context = buildAgentRunChatContext({ run: agentRun() });

		expect(context.humanText).toContain('Update project START HERE');
		expect(context.humanText).toContain('Run status: proposal_ready');
		expect(context.humanText).toContain('Change-set status: pending');
		expect(context.humanText).toContain('onto.document.update');
		expect(context.humanText).toContain('content: Old START HERE -> New START HERE');
		expect(context.llmText).toContain(context.humanText);
	});

	it('reuses the parent session, inserts a seed without agent_run_id, and bumps counters', async () => {
		const { supabase, state } = createSupabaseMock({
			chat_sessions: [
				{
					id: 'parent-session',
					user_id: 'user-1',
					status: 'active',
					context_type: 'project',
					entity_id: 'project-1',
					message_count: 3,
					agent_metadata: {
						focus: { projectId: 'project-1', projectName: 'Launch Project' }
					}
				}
			],
			chat_messages: [],
			onto_projects: [{ id: 'project-1', name: 'Launch Project' }]
		});

		const result = await createAgentRunChatSession({
			supabase,
			run: agentRun({ parent_session_id: 'parent-session' }),
			userId: 'user-1'
		});

		expect(result).toMatchObject({
			created: false,
			seeded: true,
			chat_session_id: 'parent-session',
			context_type: 'project',
			entity_id: 'project-1',
			project_id: 'project-1'
		});
		expect(state.tables.chat_messages).toHaveLength(1);
		expect(state.tables.chat_messages[0].metadata).toMatchObject({
			source: 'agent_run_context',
			run_id: 'run-1',
			idempotency_key: 'agent-run-context:run-1'
		});
		expect(state.tables.chat_messages[0].metadata).not.toHaveProperty('agent_run_id');
		expect(state.tables.chat_sessions[0]).toMatchObject({
			message_count: 4,
			last_message_at: '2026-06-29T15:00:00.000Z'
		});
	});

	it('reuses an existing AI Inbox session before creating a bridge session', async () => {
		const { supabase, state } = createSupabaseMock({
			chat_sessions: [
				{
					id: 'inbox-session',
					user_id: 'user-1',
					status: 'active',
					context_type: 'project',
					entity_id: 'project-1',
					message_count: 1,
					agent_metadata: {
						source: 'ai_inbox',
						source_type: 'agent_run',
						source_ref_id: 'run-1',
						focus: { projectId: 'project-1', projectName: 'Launch Project' }
					}
				}
			],
			chat_messages: [],
			onto_projects: [{ id: 'project-1', name: 'Launch Project' }]
		});

		const result = await createAgentRunChatSession({
			supabase,
			run: agentRun(),
			userId: 'user-1'
		});

		expect(result.created).toBe(false);
		expect(result.chat_session_id).toBe('inbox-session');
		expect(
			state.operations.some((op) => op.table === 'chat_sessions' && op.action === 'insert')
		).toBe(false);
		expect(state.tables.chat_messages).toHaveLength(1);
	});

	it('creates a project-scoped session when no reusable session exists', async () => {
		const { supabase, state } = createSupabaseMock({
			chat_sessions: [],
			chat_messages: [],
			chat_sessions_projects: [],
			onto_projects: [{ id: 'project-1', name: 'Launch Project' }]
		});

		const result = await createAgentRunChatSession({
			supabase,
			run: agentRun(),
			userId: 'user-1'
		});

		expect(result).toMatchObject({
			created: true,
			seeded: true,
			context_type: 'project',
			entity_id: 'project-1',
			project_id: 'project-1'
		});
		expect(state.tables.chat_sessions[0].agent_metadata).toMatchObject({
			source: 'agent_run_context',
			agent_run_id: 'run-1',
			focus: {
				focusType: 'project-wide',
				projectId: 'project-1',
				projectName: 'Launch Project'
			}
		});
		expect(state.tables.chat_sessions_projects[0]).toMatchObject({
			chat_session_id: result.chat_session_id,
			project_id: 'project-1'
		});
		expect(state.tables.chat_messages[0].metadata).not.toHaveProperty('agent_run_id');
	});

	it('uses project_id to scope a project run even when context_type is stale', async () => {
		const { supabase, state } = createSupabaseMock({
			chat_sessions: [],
			chat_messages: [],
			chat_sessions_projects: [],
			onto_projects: [{ id: 'project-1', name: 'Launch Project' }]
		});

		const result = await createAgentRunChatSession({
			supabase,
			run: agentRun({ context_type: 'global' }),
			userId: 'user-1'
		});

		expect(result).toMatchObject({
			created: true,
			context_type: 'project',
			entity_id: 'project-1',
			project_id: 'project-1'
		});
		expect(state.tables.chat_sessions[0]).toMatchObject({
			context_type: 'project',
			entity_id: 'project-1'
		});
		expect(state.tables.chat_sessions[0].agent_metadata.focus).toMatchObject({
			projectId: 'project-1',
			projectName: 'Launch Project'
		});
	});

	it('does not reuse a global parent session for a project-scoped run', async () => {
		const { supabase, state } = createSupabaseMock({
			chat_sessions: [
				{
					id: 'parent-session',
					user_id: 'user-1',
					status: 'active',
					context_type: 'global',
					entity_id: null,
					message_count: 2,
					agent_metadata: {}
				}
			],
			chat_messages: [],
			chat_sessions_projects: [],
			onto_projects: [{ id: 'project-1', name: 'Launch Project' }]
		});

		const result = await createAgentRunChatSession({
			supabase,
			run: agentRun({ parent_session_id: 'parent-session' }),
			userId: 'user-1'
		});

		expect(result).toMatchObject({
			created: true,
			context_type: 'project',
			entity_id: 'project-1',
			project_id: 'project-1'
		});
		expect(result.chat_session_id).not.toBe('parent-session');
		expect(state.tables.chat_sessions).toHaveLength(2);
		expect(state.tables.chat_sessions[1]).toMatchObject({
			context_type: 'project',
			entity_id: 'project-1'
		});
	});

	it('does not insert a duplicate seed message when the idempotency key already exists', async () => {
		const { supabase, state } = createSupabaseMock({
			chat_sessions: [
				{
					id: 'parent-session',
					user_id: 'user-1',
					status: 'active',
					context_type: 'project',
					entity_id: 'project-1',
					message_count: 2,
					agent_metadata: {}
				}
			],
			chat_messages: [
				{
					id: 'message-1',
					session_id: 'parent-session',
					user_id: 'user-1',
					role: 'assistant',
					metadata: { idempotency_key: 'agent-run-context:run-1' },
					content: 'Existing seed'
				}
			]
		});

		const result = await createAgentRunChatSession({
			supabase,
			run: agentRun({ parent_session_id: 'parent-session' }),
			userId: 'user-1'
		});

		expect(result.seeded).toBe(false);
		expect(state.tables.chat_messages).toHaveLength(1);
		expect(
			state.operations.some((op) => op.table === 'chat_sessions' && op.action === 'update')
		).toBe(false);
	});
});
