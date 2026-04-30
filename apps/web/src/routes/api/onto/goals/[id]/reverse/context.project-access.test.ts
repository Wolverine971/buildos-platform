// apps/web/src/routes/api/onto/goals/[id]/reverse/context.project-access.test.ts
import { describe, expect, it, vi } from 'vitest';
import { loadGoalReverseContext } from './context';

const GOAL_ID = '33333333-3333-4333-8333-333333333333';
const PROJECT_ID = '44444444-4444-4444-8444-444444444444';

class QueryMock {
	constructor(private table: string) {}

	select() {
		return this;
	}

	eq() {
		return this;
	}

	is() {
		return this;
	}

	order() {
		return this;
	}

	limit() {
		return this;
	}

	maybeSingle() {
		if (this.table === 'onto_goals') {
			return Promise.resolve({
				data: {
					id: GOAL_ID,
					project_id: PROJECT_ID,
					name: 'Shared goal',
					type_key: 'goal.outcome.project',
					props: {}
				},
				error: null
			});
		}
		if (this.table === 'onto_projects') {
			return Promise.resolve({
				data: {
					id: PROJECT_ID,
					name: 'Shared project',
					description: null,
					state_key: 'active',
					type_key: 'project',
					props: {},
					created_by: 'owner-actor'
				},
				error: null
			});
		}
		return Promise.resolve({ data: null, error: null });
	}

	then<TResult1 = any, TResult2 = never>(
		onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
		onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
	) {
		return Promise.resolve({ data: [], error: null }).then(onfulfilled, onrejected);
	}
}

function createSupabase() {
	const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
		if (name === 'ensure_actor_for_user') {
			return { data: 'collaborator-actor', error: null };
		}
		if (name === 'current_actor_has_project_access') {
			return {
				data: args?.p_project_id === PROJECT_ID && args?.p_required_access === 'write',
				error: null
			};
		}
		return { data: null, error: null };
	});

	return {
		rpc,
		from: vi.fn((table: string) => new QueryMock(table))
	} as any;
}

describe('loadGoalReverseContext', () => {
	it('authorizes shared project collaborators through project access', async () => {
		const supabase = createSupabase();

		const context = await loadGoalReverseContext(supabase, 'user-1', GOAL_ID, 'write');

		expect(context.actorId).toBe('collaborator-actor');
		expect(context.project.created_by).toBe('owner-actor');
		expect(supabase.rpc).toHaveBeenCalledWith('current_actor_has_project_access', {
			p_project_id: PROJECT_ID,
			p_required_access: 'write'
		});
	});
});
