// apps/worker/tests/agentOpExecution.test.ts
//
// Phase 1b foundation: the worker-safe op executor's policy + dispatch logic.
// Verifies scope/op enforcement short-circuits before any DB handler runs.
import { describe, expect, it } from 'vitest';
import {
	executeAgentOp,
	AGENT_OP_READ_CATALOG,
	AGENT_OP_WRITE_CATALOG,
	buildAgentRunOpCatalog,
	type AgentOpContext
} from '@buildos/shared-agent-ops';

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
			if (fn === 'actor_has_project_member_access') return { data: false, error: null };
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

	it('returns NOT_IMPLEMENTED for an allowed read op with no worker handler yet', async () => {
		const r = await executeAgentOp(ctx({ allowed_ops: ['onto.goal.list'] }), 'onto.goal.list');
		expect(r.ok).toBe(false);
		expect(r.error?.code).toBe('NOT_IMPLEMENTED');
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
			project_id: 'project-1'
		});

		expect(r.ok).toBe(false);
		expect(r.error?.code).toBe('FORBIDDEN');
		expect(calls).toEqual([
			{
				fn: 'ensure_actor_for_user',
				args: { p_user_id: '00000000-0000-4000-8000-000000000000' }
			},
			{
				fn: 'actor_has_project_member_access',
				args: {
					p_actor_id: 'actor-1',
					p_project_id: 'project-1',
					p_required_access: 'read'
				}
			}
		]);
	});
});
