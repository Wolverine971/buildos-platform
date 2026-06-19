// apps/worker/tests/agentOpExecution.test.ts
//
// Phase 1b foundation: the worker-safe op executor's policy + dispatch logic.
// Verifies scope/op enforcement short-circuits before any DB handler runs.
import { describe, expect, it } from 'vitest';
import {
	executeAgentOp,
	AGENT_OP_READ_CATALOG,
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

	it('rejects a write op as UNSUPPORTED (read-first cut)', async () => {
		const r = await executeAgentOp(
			{ ...ctx(), scope: { mode: 'read_write' } },
			'onto.task.create'
		);
		expect(r.ok).toBe(false);
		expect(r.error?.code).toBe('UNSUPPORTED');
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
