// apps/worker/tests/agentOpExecution.test.ts
//
// Phase 1b foundation: the worker-safe op executor's policy + dispatch logic.
// Verifies scope/op enforcement short-circuits before any DB handler runs.
import { describe, expect, it } from 'vitest';
import {
	AGENT_OP_WEB_READ_CATALOG,
	executeAgentOp,
	AGENT_OP_READ_CATALOG,
	AGENT_OP_WRITE_CATALOG,
	buildAgentRunOpCatalog,
	type AgentOpContext,
	type WebResearchPort
} from '@buildos/shared-agent-ops';
import { runGatewayWriteOp } from '@buildos/shared-agent-ops/gateway/op-execution-gateway';

// A supabase stub that throws if any handler actually touches the DB — the policy
// paths under test must short-circuit before reaching a handler.
const throwingAdmin = new Proxy(
	{},
	{
		get() {
			throw new Error('handler should not have been reached for a policy-rejected op');
		}
	}
) as AgentOpContext['admin'];

function ctx(overrides: Partial<AgentOpContext['scope']> = {}): AgentOpContext {
	return {
		admin: throwingAdmin,
		userId: '00000000-0000-4000-8000-000000000000',
		scope: { mode: 'read_only', allowed_ops: null, ...overrides }
	};
}

function accessDeniedCtx(): {
	context: AgentOpContext;
	calls: Array<{ fn: string; args: unknown }>;
} {
	const calls: Array<{ fn: string; args: unknown }> = [];
	const admin = {
		rpc: async (fn: string, args: unknown) => {
			calls.push({ fn, args });
			if (fn === 'ensure_actor_for_user') return { data: 'actor-1', error: null };
			if (fn === 'get_onto_project_summaries_v1') return { data: [], error: null };
			throw new Error(`unexpected rpc: ${fn}`);
		}
	} as AgentOpContext['admin'];

	return {
		calls,
		context: {
			admin,
			userId: '00000000-0000-4000-8000-000000000000',
			scope: { mode: 'read_only', allowed_ops: null }
		}
	};
}

function emptyProjectReadCtx(): AgentOpContext {
	const admin = {
		rpc: async (fn: string) => {
			if (fn === 'ensure_actor_for_user') return { data: 'actor-1', error: null };
			if (fn === 'get_onto_project_summaries_v1') return { data: [], error: null };
			throw new Error(`unexpected rpc: ${fn}`);
		}
	} as AgentOpContext['admin'];

	return {
		admin,
		userId: '00000000-0000-4000-8000-000000000000',
		scope: { mode: 'read_only', allowed_ops: ['onto.goal.list'] }
	};
}

const PROJECT_A_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_B_ID = '22222222-2222-4222-8222-222222222222';
const TASK_ID = '33333333-3333-4333-8333-333333333333';

function projectSummaryRow(
	id: string,
	overrides: Partial<Record<string, unknown>> = {}
): Record<string, unknown> {
	return {
		id,
		name: id === PROJECT_A_ID ? 'Allowed project' : 'Other project',
		description: null,
		icon_svg: null,
		icon_concept: null,
		icon_generated_at: null,
		icon_generation_source: null,
		icon_generation_prompt: null,
		type_key: 'project.default',
		state_key: 'active',
		props: {},
		facet_context: null,
		facet_scale: null,
		facet_stage: null,
		created_at: '2026-06-01T00:00:00Z',
		updated_at: '2026-06-01T00:00:00Z',
		task_count: 0,
		goal_count: 0,
		plan_count: 0,
		document_count: 0,
		owner_actor_id: 'actor-owner',
		access_role: 'owner',
		access_level: 'write',
		is_shared: false,
		next_step_short: null,
		next_step_long: null,
		next_step_source: null,
		next_step_updated_at: null,
		...overrides
	};
}

function stageUpdateCtx(params: {
	projects: Array<Record<string, unknown>>;
	task: Record<string, unknown> | null;
}): {
	context: AgentOpContext;
	calls: Array<{ kind: string; table?: string; column?: string; value?: unknown }>;
} {
	const calls: Array<{ kind: string; table?: string; column?: string; value?: unknown }> = [];

	class Query {
		private id: unknown;
		private projectIds: unknown[] | null = null;
		private archivedIsNull = false;

		constructor(private readonly table: string) {}

		select() {
			calls.push({ kind: 'select', table: this.table });
			return this;
		}

		eq(column: string, value: unknown) {
			calls.push({ kind: 'eq', table: this.table, column, value });
			if (column === 'id') this.id = value;
			return this;
		}

		in(column: string, value: unknown[]) {
			calls.push({ kind: 'in', table: this.table, column, value });
			if (column === 'project_id') this.projectIds = value;
			return this;
		}

		is(column: string, value: unknown) {
			calls.push({ kind: 'is', table: this.table, column, value });
			if (column === 'archived_at' && value === null) this.archivedIsNull = true;
			return this;
		}

		async maybeSingle() {
			if (this.table !== 'onto_tasks' || !params.task) {
				return { data: null, error: null };
			}
			if (this.id !== params.task.id) {
				return { data: null, error: null };
			}
			if (this.projectIds && !this.projectIds.includes(params.task.project_id)) {
				return { data: null, error: null };
			}
			if (this.archivedIsNull && params.task.archived_at !== null) {
				return { data: null, error: null };
			}
			return { data: params.task, error: null };
		}
	}

	const admin = {
		rpc: async (fn: string) => {
			calls.push({ kind: 'rpc', value: fn });
			if (fn === 'ensure_actor_for_user') return { data: 'actor-1', error: null };
			if (fn === 'get_onto_project_summaries_v1') {
				return { data: params.projects, error: null };
			}
			throw new Error(`unexpected rpc: ${fn}`);
		},
		from: (table: string) => new Query(table)
	} as AgentOpContext['admin'];

	return {
		calls,
		context: {
			admin,
			userId: '00000000-0000-4000-8000-000000000000',
			scope: { mode: 'read_write', allowed_ops: ['onto.task.update'] },
			mutationMode: 'stage'
		}
	};
}

function projectRestoreCtx(params: {
	projects: Array<Record<string, unknown>>;
	project: Record<string, unknown> | null;
}): {
	admin: AgentOpContext['admin'];
	calls: Array<{ kind: string; table?: string; column?: string; value?: unknown }>;
} {
	const calls: Array<{ kind: string; table?: string; column?: string; value?: unknown }> = [];

	class Query {
		private id: unknown;
		private deletedIsNull = false;

		constructor(private readonly table: string) {}

		select() {
			calls.push({ kind: 'select', table: this.table });
			return this;
		}

		update(value: unknown) {
			calls.push({ kind: 'update', table: this.table, value });
			return this;
		}

		eq(column: string, value: unknown) {
			calls.push({ kind: 'eq', table: this.table, column, value });
			if (column === 'id') this.id = value;
			return this;
		}

		is(column: string, value: unknown) {
			calls.push({ kind: 'is', table: this.table, column, value });
			if (column === 'deleted_at' && value === null) this.deletedIsNull = true;
			return this;
		}

		async maybeSingle() {
			if (this.table !== 'onto_projects' || !params.project) {
				return { data: null, error: null };
			}
			if (this.id !== params.project.id) {
				return { data: null, error: null };
			}
			if (this.deletedIsNull && params.project.deleted_at !== null) {
				return { data: null, error: null };
			}
			return { data: params.project, error: null };
		}

		async single() {
			return { data: params.project, error: null };
		}
	}

	const admin = {
		rpc: async (fn: string) => {
			calls.push({ kind: 'rpc', value: fn });
			if (fn === 'ensure_actor_for_user') return { data: 'actor-1', error: null };
			if (fn === 'get_onto_project_summaries_v1') {
				return { data: params.projects, error: null };
			}
			throw new Error(`unexpected rpc: ${fn}`);
		},
		from: (table: string) => new Query(table)
	} as AgentOpContext['admin'];

	return { admin, calls };
}

describe('executeAgentOp policy + dispatch', () => {
	it('exposes a non-empty read catalog including onto.project.list', () => {
		expect(AGENT_OP_READ_CATALOG.length).toBeGreaterThan(0);
		expect(AGENT_OP_READ_CATALOG).toContain('onto.project.list');
	});

	it('rejects an empty op', async () => {
		const r = await executeAgentOp(ctx(), '   ');
		expect(r.ok).toBe(false);
		expect(r.error?.code).toBe('VALIDATION_ERROR');
	});

	it('rejects an unknown op as NOT_FOUND', async () => {
		const r = await executeAgentOp(ctx(), 'onto.nonsense.frobnicate');
		expect(r.ok).toBe(false);
		expect(r.error?.code).toBe('NOT_FOUND');
	});

	it('exposes a write catalog including onto.task.create (non-calendar writes)', () => {
		expect(AGENT_OP_WRITE_CATALOG.length).toBeGreaterThan(0);
		expect(AGENT_OP_WRITE_CATALOG).toContain('onto.task.create');
		expect(AGENT_OP_WRITE_CATALOG.every((op) => !op.startsWith('cal.'))).toBe(true);
	});

	it('builds a runtime catalog from granted ops and available calendar capability', () => {
		const scope: AgentOpContext['scope'] = {
			mode: 'read_write',
			allowed_ops: [
				'onto.project.list',
				'onto.task.create',
				'cal.event.list',
				'cal.event.create'
			]
		};

		expect(buildAgentRunOpCatalog({ scope, mutationMode: 'commit' })).toEqual([
			'onto.project.list',
			'onto.task.create'
		]);

		const calendar = {} as NonNullable<AgentOpContext['calendar']>;
		expect(buildAgentRunOpCatalog({ scope, mutationMode: 'commit', calendar })).toEqual([
			'onto.project.list',
			'onto.task.create',
			'cal.event.list',
			'cal.event.create'
		]);

		expect(buildAgentRunOpCatalog({ scope, mutationMode: 'stage', calendar })).toEqual([
			'onto.project.list',
			'onto.task.create',
			'cal.event.list'
		]);
	});

	it('adds configured web reads to the default catalog without bypassing explicit allowlists', () => {
		const web: WebResearchPort = {
			search: async () => ({}),
			visit: async () => ({})
		};

		const defaultCatalog = buildAgentRunOpCatalog({
			scope: { mode: 'read_only', allowed_ops: null },
			web
		});
		expect(defaultCatalog).toEqual(expect.arrayContaining([...AGENT_OP_WEB_READ_CATALOG]));

		expect(
			buildAgentRunOpCatalog({
				scope: { mode: 'read_only', allowed_ops: ['onto.project.list'] },
				web
			})
		).toEqual(['onto.project.list']);

		expect(
			buildAgentRunOpCatalog({
				scope: { mode: 'read_only', allowed_ops: ['util.web.visit'] },
				web
			})
		).toEqual(['util.web.visit']);
	});

	it('only advertises web methods that are configured', () => {
		const web: WebResearchPort = { visit: async () => ({}) };
		const catalog = buildAgentRunOpCatalog({
			scope: { mode: 'read_only', allowed_ops: null },
			web
		});
		expect(catalog).toContain('util.web.visit');
		expect(catalog).not.toContain('util.web.search');
	});

	it('dispatches worker web reads through the runtime port', async () => {
		const calls: Array<{ kind: string; args: Record<string, unknown> }> = [];
		const web: WebResearchPort = {
			search: async (args) => {
				calls.push({ kind: 'search', args });
				return { results: [{ url: 'https://example.com' }] };
			},
			visit: async (args) => {
				calls.push({ kind: 'visit', args });
				return { content: 'Example' };
			}
		};

		const search = await executeAgentOp({ ...ctx(), web }, 'util.web.search', {
			query: 'example'
		});
		const visit = await executeAgentOp({ ...ctx(), web }, 'util.web.visit', {
			url: 'https://example.com'
		});

		expect(search).toMatchObject({ ok: true, op: 'util.web.search' });
		expect(visit).toMatchObject({ ok: true, op: 'util.web.visit' });
		expect(calls).toEqual([
			{ kind: 'search', args: { query: 'example' } },
			{ kind: 'visit', args: { url: 'https://example.com' } }
		]);
	});

	it('keeps an explicit Agent Run allowlist as a hard fence for web reads', async () => {
		const r = await executeAgentOp(
			{
				...ctx({ allowed_ops: ['onto.project.list'] }),
				web: { visit: async () => ({ content: 'should not run' }) }
			},
			'util.web.visit',
			{ url: 'https://example.com' }
		);
		expect(r.ok).toBe(false);
		expect(r.error?.code).toBe('FORBIDDEN');
	});

	it('rejects a write op in a read_only run as FORBIDDEN (before any DB handler)', async () => {
		const r = await executeAgentOp(
			{ ...ctx(), scope: { mode: 'read_only' } },
			'onto.task.create'
		);
		expect(r.ok).toBe(false);
		expect(r.error?.code).toBe('FORBIDDEN');
	});

	it('rejects calendar writes in stage mode instead of producing unappliable proposals', async () => {
		const r = await executeAgentOp(
			{
				...ctx(),
				scope: { mode: 'read_write', allowed_ops: ['cal.event.create'] },
				mutationMode: 'stage'
			},
			'cal.event.create',
			{ title: 'Launch sync', start_at: '2026-07-01T10:00:00Z' }
		);
		expect(r.ok).toBe(false);
		expect(r.error?.code).toBe('UNSUPPORTED');
		expect(r.proposedChange).toBeUndefined();
	});

	it('rejects direct calendar writes when no CalendarPort is wired', async () => {
		const r = await executeAgentOp(
			{
				...ctx(),
				scope: { mode: 'read_write', allowed_ops: ['cal.event.create'] },
				mutationMode: 'commit'
			},
			'cal.event.create',
			{ title: 'Launch sync', start_at: '2026-07-01T10:00:00Z' }
		);
		expect(r.ok).toBe(false);
		expect(r.error?.code).toBe('UNSUPPORTED');
		expect(r.error?.message).toContain('CalendarPort');
	});

	it('validates a write op’s args before reaching the DB handler', async () => {
		// read_write scope allows the op; the gateway write path validates required
		// args against the external write schema and short-circuits with the
		// throwing admin untouched.
		const r = await executeAgentOp(
			{ ...ctx(), scope: { mode: 'read_write' } },
			'onto.task.create',
			{}
		);
		expect(r.ok).toBe(false);
		expect(r.error?.code).toBe('VALIDATION_ERROR');
	});

	it('normalizes legacy edge-link aliases before direct write validation', async () => {
		const r = await executeAgentOp(
			{ ...ctx(), scope: { mode: 'read_write' } },
			'onto.edge.link',
			{
				from_kind: 'task',
				from_id: 'not-a-uuid',
				tgt_kind: 'task',
				to_id: 'also-not-a-uuid',
				type: 'blocks'
			}
		);

		expect(r.ok).toBe(false);
		expect(r.error?.code).toBe('VALIDATION_ERROR');
		expect(r.error?.message).toContain('task_id must be a valid UUID');
		expect(r.error?.message).not.toContain('src_kind must be a string');
		expect(r.error?.message).not.toContain('dst_kind must be a string');
	});

	it('stages a write op (mutationMode=stage) instead of committing, without mutating', async () => {
		// throwingAdmin proves no create handler ran; staging a create does no DB read.
		const r = await executeAgentOp(
			{ ...ctx(), scope: { mode: 'read_write' }, mutationMode: 'stage' },
			'onto.task.create',
			{ project_id: 'project-1', title: 'Draft task' }
		);
		expect(r.ok).toBe(true);
		expect(r.proposedChange).toBeDefined();
		expect(r.proposedChange?.action).toBe('create');
		expect(r.proposedChange?.entity_type).toBe('task');
		expect(r.proposedChange?.after).toMatchObject({
			project_id: 'project-1',
			title: 'Draft task'
		});
		expect((r.data as { staged?: boolean }).staged).toBe(true);
	});

	it('normalizes legacy edge-link aliases in staged proposals', async () => {
		const r = await executeAgentOp(
			{ ...ctx(), scope: { mode: 'read_write' }, mutationMode: 'stage' },
			'onto.edge.link',
			{
				from_kind: 'task',
				from_id: 'source-task-id',
				tgt_kind: 'task',
				to_id: 'target-task-id',
				type: 'blocks',
				metadata: { origin: 'test' }
			}
		);

		expect(r.ok).toBe(true);
		expect(r.proposedChange?.after).toMatchObject({
			src_kind: 'task',
			src_id: 'source-task-id',
			dst_kind: 'task',
			dst_id: 'target-task-id',
			rel: 'blocks',
			props: { origin: 'test' }
		});
		expect(r.proposedChange?.after).not.toHaveProperty('from_kind');
		expect(r.proposedChange?.after).not.toHaveProperty('tgt_kind');
		expect(r.proposedChange?.after).not.toHaveProperty('type');
	});

	it('still validates args when staging a write op', async () => {
		const r = await executeAgentOp(
			{ ...ctx(), scope: { mode: 'read_write' }, mutationMode: 'stage' },
			'onto.task.create',
			{}
		);
		expect(r.ok).toBe(false);
		expect(r.error?.code).toBe('VALIDATION_ERROR');
		expect(r.proposedChange).toBeUndefined();
	});

	it('still enforces the project fence when staging', async () => {
		const r = await executeAgentOp(
			{
				...ctx(),
				scope: { mode: 'read_write' },
				mutationMode: 'stage',
				runContext: { context_type: 'project', project_id: 'project-1' }
			},
			'onto.task.create',
			{ project_id: 'project-2', title: 'x' }
		);
		expect(r.ok).toBe(false);
		expect(r.error?.code).toBe('FORBIDDEN');
	});

	it('does not stage a before snapshot for an update outside a project-scoped run', async () => {
		const { context, calls } = stageUpdateCtx({
			projects: [projectSummaryRow(PROJECT_A_ID), projectSummaryRow(PROJECT_B_ID)],
			task: {
				id: TASK_ID,
				project_id: PROJECT_B_ID,
				title: 'Out of scope task',
				description: null,
				type_key: null,
				state_key: 'todo',
				priority: null,
				start_at: null,
				due_at: null,
				completed_at: null,
				props: {},
				created_at: '2026-06-01T00:00:00Z',
				updated_at: '2026-06-01T00:00:00Z',
				archived_at: null,
				deleted_at: null
			}
		});

		const r = await executeAgentOp(
			{ ...context, runContext: { context_type: 'project', project_id: PROJECT_A_ID } },
			'onto.task.update',
			{ task_id: TASK_ID, title: 'Leaked title?' }
		);

		expect(r.ok).toBe(false);
		expect(r.error?.code).toBe('NOT_FOUND');
		expect(r.proposedChange).toBeUndefined();
		expect(calls).toContainEqual({
			kind: 'in',
			table: 'onto_tasks',
			column: 'project_id',
			value: [PROJECT_A_ID]
		});
	});

	it('rejects staged update snapshots when the visible project is not writable', async () => {
		const { context } = stageUpdateCtx({
			projects: [projectSummaryRow(PROJECT_A_ID, { access_level: 'read' })],
			task: {
				id: TASK_ID,
				project_id: PROJECT_A_ID,
				title: 'Read only task',
				description: null,
				type_key: null,
				state_key: 'todo',
				priority: null,
				start_at: null,
				due_at: null,
				completed_at: null,
				props: {},
				created_at: '2026-06-01T00:00:00Z',
				updated_at: '2026-06-01T00:00:00Z',
				archived_at: null,
				deleted_at: null
			}
		});

		const r = await executeAgentOp(context, 'onto.task.update', {
			task_id: TASK_ID,
			title: 'Should not stage'
		});

		expect(r.ok).toBe(false);
		expect(r.error?.code).toBe('FORBIDDEN');
		expect(r.proposedChange).toBeUndefined();
	});

	it('stages an authorized update with a scoped before snapshot', async () => {
		const task = {
			id: TASK_ID,
			project_id: PROJECT_A_ID,
			title: 'Original task',
			description: null,
			type_key: null,
			state_key: 'todo',
			priority: null,
			start_at: null,
			due_at: null,
			completed_at: null,
			props: {},
			created_at: '2026-06-01T00:00:00Z',
			updated_at: '2026-06-01T00:00:00Z',
			archived_at: null,
			deleted_at: null
		};
		const { context } = stageUpdateCtx({
			projects: [projectSummaryRow(PROJECT_A_ID, { access_level: 'write' })],
			task
		});

		const r = await executeAgentOp(context, 'onto.task.update', {
			task_id: TASK_ID,
			title: 'Updated task'
		});

		expect(r.ok).toBe(true);
		expect(r.proposedChange?.entity_id).toBe(TASK_ID);
		expect(r.proposedChange?.before).toMatchObject({
			id: TASK_ID,
			project_id: PROJECT_A_ID,
			title: 'Original task'
		});
		expect(r.proposedChange?.after).toMatchObject({
			task_id: TASK_ID,
			title: 'Updated task'
		});
	});

	it('rejects restoring an archived project outside an explicit gateway project scope', async () => {
		const { admin, calls } = projectRestoreCtx({
			projects: [projectSummaryRow(PROJECT_A_ID, { access_level: 'write' })],
			project: {
				id: PROJECT_B_ID,
				name: 'Archived out-of-scope project',
				description: null,
				type_key: 'project.default',
				state_key: 'active',
				props: {},
				start_at: null,
				end_at: null,
				created_by: 'actor-1',
				created_at: '2026-06-01T00:00:00Z',
				updated_at: '2026-06-01T00:00:00Z',
				archived_at: '2026-06-02T00:00:00Z',
				deleted_at: null
			}
		});

		const r = await runGatewayWriteOp({
			admin,
			userId: '00000000-0000-4000-8000-000000000000',
			scope: {
				mode: 'read_write',
				project_ids: [PROJECT_A_ID],
				allowed_ops: ['onto.project.update']
			},
			op: 'onto.project.update',
			args: {
				project_id: PROJECT_B_ID,
				archived: false
			}
		});

		expect(r.ok).toBe(false);
		expect(r.error?.code).toBe('FORBIDDEN');
		expect(calls).toContainEqual({
			kind: 'is',
			table: 'onto_projects',
			column: 'deleted_at',
			value: null
		});
		expect(calls.some((call) => call.kind === 'update')).toBe(false);
	});

	it('fences a write op to its project-scoped run before any DB handler', async () => {
		const r = await executeAgentOp(
			{
				...ctx(),
				scope: { mode: 'read_write' },
				runContext: { context_type: 'project', project_id: 'project-1' }
			},
			'onto.task.create',
			{ project_id: 'project-2', title: 'x' }
		);
		expect(r.ok).toBe(false);
		expect(r.error?.code).toBe('FORBIDDEN');
	});

	it('rejects a read op outside granted allowed_ops as FORBIDDEN', async () => {
		const r = await executeAgentOp(
			ctx({ allowed_ops: ['onto.task.list'] }),
			'onto.project.list'
		);
		expect(r.ok).toBe(false);
		expect(r.error?.code).toBe('FORBIDDEN');
	});

	it('routes allowed non-calendar reads through the shared gateway handlers', async () => {
		const r = await executeAgentOp(emptyProjectReadCtx(), 'onto.goal.list');
		expect(r.ok).toBe(true);
		expect(r.data).toMatchObject({
			goals: [],
			total: 0
		});
	});

	it('rejects a project op outside a project-scoped run before DB access', async () => {
		const r = await executeAgentOp(
			{
				...ctx(),
				runContext: { context_type: 'project', project_id: 'project-1' }
			},
			'onto.project.graph.get',
			{ project_id: 'project-2' }
		);

		expect(r.ok).toBe(false);
		expect(r.error?.code).toBe('FORBIDDEN');
	});

	it('checks actor-specific project access before loading project data', async () => {
		const { context, calls } = accessDeniedCtx();
		const r = await executeAgentOp(context, 'onto.document.tree.get', {
			project_id: PROJECT_A_ID
		});

		expect(r.ok).toBe(false);
		expect(r.error?.code).toBe('FORBIDDEN');
		expect(calls).toEqual([
			{
				fn: 'ensure_actor_for_user',
				args: { p_user_id: '00000000-0000-4000-8000-000000000000' }
			},
			{
				fn: 'get_onto_project_summaries_v1',
				args: { p_actor_id: 'actor-1' }
			}
		]);
	});
});
