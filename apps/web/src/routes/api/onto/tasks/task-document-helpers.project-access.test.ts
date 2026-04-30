// apps/web/src/routes/api/onto/tasks/task-document-helpers.project-access.test.ts
import { describe, expect, it, vi } from 'vitest';
import { ensureTaskAccess } from './task-document-helpers';

const TASK_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';

class TaskQueryMock {
	select() {
		return this;
	}

	eq() {
		return this;
	}

	single() {
		return Promise.resolve({
			data: {
				id: TASK_ID,
				title: 'Shared task',
				project_id: PROJECT_ID,
				project: {
					id: PROJECT_ID,
					created_by: 'owner-actor'
				}
			},
			error: null
		});
	}
}

function createLocals() {
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
		supabase: {
			rpc,
			from: vi.fn(() => new TaskQueryMock())
		}
	} as any;
}

describe('ensureTaskAccess', () => {
	it('authorizes collaborators through project access instead of project ownership', async () => {
		const locals = createLocals();

		const result = await ensureTaskAccess(locals, TASK_ID, 'user-1', 'write');

		expect('error' in result).toBe(false);
		if ('error' in result) return;
		expect(result.actorId).toBe('collaborator-actor');
		expect(result.project.created_by).toBe('owner-actor');
		expect(locals.supabase.rpc).toHaveBeenCalledWith('current_actor_has_project_access', {
			p_project_id: PROJECT_ID,
			p_required_access: 'write'
		});
	});
});
