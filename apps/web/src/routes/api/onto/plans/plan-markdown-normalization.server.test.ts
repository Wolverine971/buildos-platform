// apps/web/src/routes/api/onto/plans/plan-markdown-normalization.server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const autoOrganizeConnectionsMock = vi.fn();
const assertEntityRefsInProjectMock = vi.fn();
const logCreateAsyncMock = vi.fn();
const logUpdateAsyncMock = vi.fn();

vi.mock('$lib/services/ontology/auto-organizer.service', () => ({
	AutoOrganizeError: class AutoOrganizeError extends Error {
		status = 400;
	},
	autoOrganizeConnections: autoOrganizeConnectionsMock,
	assertEntityRefsInProject: assertEntityRefsInProjectMock,
	toParentRefs: vi.fn(() => [])
}));

vi.mock('$lib/services/async-activity-logger', () => ({
	logCreateAsync: logCreateAsyncMock,
	logUpdateAsync: logUpdateAsyncMock,
	logDeleteAsync: vi.fn(),
	getChangeSourceFromRequest: vi.fn(() => 'chat'),
	getChatSessionIdFromRequest: vi.fn(() => null)
}));

vi.mock('$lib/server/ontology-classification.service', () => ({
	classifyOntologyEntity: vi.fn()
}));

vi.mock('../shared/error-logging', () => ({
	logOntologyApiError: vi.fn()
}));

type Captures = {
	insertPayload?: Record<string, any>;
	updatePayload?: Record<string, any>;
};

class QueryBuilderMock {
	private action: 'select' | 'insert' | 'update' | null = null;
	private insertPayload: Record<string, any> | null = null;
	private updatePayload: Record<string, any> | null = null;

	constructor(
		private readonly table: string,
		private readonly fixtures: { existingPlan?: Record<string, any> },
		private readonly captures: Captures
	) {}

	select() {
		if (!this.action) {
			this.action = 'select';
		}
		return this;
	}

	insert(payload: Record<string, any>) {
		this.action = 'insert';
		this.insertPayload = payload;
		this.captures.insertPayload = payload;
		return this;
	}

	update(payload: Record<string, any>) {
		this.action = 'update';
		this.updatePayload = payload;
		this.captures.updatePayload = payload;
		return this;
	}

	eq() {
		return this;
	}

	is() {
		return this;
	}

	single() {
		if (this.table === 'onto_projects') {
			return Promise.resolve({ data: { id: 'project-1' }, error: null });
		}

		if (this.table === 'onto_plans' && this.action === 'insert') {
			return Promise.resolve({
				data: {
					id: 'plan-1',
					...this.insertPayload
				},
				error: null
			});
		}

		if (this.table === 'onto_plans' && this.action === 'select') {
			return Promise.resolve({
				data: this.fixtures.existingPlan ?? {
					id: 'plan-1',
					project_id: 'project-1',
					name: 'Existing plan',
					state_key: 'draft',
					props: {},
					project: { id: 'project-1' }
				},
				error: null
			});
		}

		if (this.table === 'onto_plans' && this.action === 'update') {
			const existing = this.fixtures.existingPlan ?? {};
			return Promise.resolve({
				data: {
					...existing,
					...this.updatePayload
				},
				error: null
			});
		}

		return Promise.resolve({ data: null, error: null });
	}
}

function createSupabaseMock(
	captures: Captures,
	fixtures: { existingPlan?: Record<string, any> } = {}
) {
	return {
		rpc: vi.fn(async (fn: string) => {
			if (fn === 'ensure_actor_for_user') {
				return { data: 'actor-1', error: null };
			}
			if (fn === 'current_actor_has_project_access') {
				return { data: true, error: null };
			}
			return { data: null, error: null };
		}),
		from: (table: string) => new QueryBuilderMock(table, fixtures, captures)
	};
}

const rawAgentPlan =
	'# First Draft Writing Schedule\\n\\n## Objective\\nFinish the draft. /n- Track words\\n\\n## Risks\\nBurnout';
const normalizedAgentPlan =
	'# First Draft Writing Schedule\n\n## Objective\nFinish the draft. \n- Track words\n\n## Risks\nBurnout';

describe('plan markdown normalization', () => {
	beforeEach(() => {
		autoOrganizeConnectionsMock.mockReset();
		assertEntityRefsInProjectMock.mockReset();
		logCreateAsyncMock.mockReset();
		logUpdateAsyncMock.mockReset();
	});

	it('normalizes plan details before creating a plan', async () => {
		const { POST } = await import('./create/+server');
		const captures: Captures = {};
		const request = new Request('http://localhost/api/onto/plans/create', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				project_id: 'project-1',
				name: 'First Draft Writing Schedule',
				plan: rawAgentPlan
			})
		});

		const response = await POST({
			request,
			locals: {
				supabase: createSupabaseMock(captures) as any,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as any);

		expect(response.status).toBe(201);
		expect(captures.insertPayload?.plan).toBe(normalizedAgentPlan);
		expect(captures.insertPayload?.props?.plan).toBe(normalizedAgentPlan);
	});

	it('normalizes required plan create fields before inserting', async () => {
		const { POST } = await import('./create/+server');
		const captures: Captures = {};
		const request = new Request('http://localhost/api/onto/plans/create', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				project_id: ' project-1 ',
				name: ' First Draft Writing Schedule ',
				state_key: ''
			})
		});

		const response = await POST({
			request,
			locals: {
				supabase: createSupabaseMock(captures) as any,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as any);

		expect(response.status).toBe(201);
		expect(captures.insertPayload).toMatchObject({
			project_id: 'project-1',
			name: 'First Draft Writing Schedule',
			state_key: 'draft'
		});
	});

	it('returns 400 for invalid required plan create fields', async () => {
		const { POST } = await import('./create/+server');
		const captures: Captures = {};
		const request = new Request('http://localhost/api/onto/plans/create', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				project_id: 'project-1',
				name: '   '
			})
		});

		const response = await POST({
			request,
			locals: {
				supabase: createSupabaseMock(captures) as any,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as any);

		expect(response.status).toBe(400);
		expect(captures.insertPayload).toBeUndefined();
		await expect(response.json()).resolves.toMatchObject({
			success: false,
			error: 'Name is required'
		});
	});

	it('normalizes plan details before updating a plan', async () => {
		const { PATCH } = await import('./[id]/+server');
		const captures: Captures = {};
		const existingPlan = {
			id: 'plan-1',
			project_id: 'project-1',
			name: 'First Draft Writing Schedule',
			state_key: 'draft',
			props: { plan: 'Old details', description: 'Old synopsis' },
			project: { id: 'project-1' }
		};
		const request = new Request('http://localhost/api/onto/plans/plan-1', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				plan: rawAgentPlan
			})
		});

		const response = await PATCH({
			params: { id: 'plan-1' },
			request,
			locals: {
				supabase: createSupabaseMock(captures, { existingPlan }) as any,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as any);

		expect(response.status).toBe(200);
		expect(captures.updatePayload?.plan).toBe(normalizedAgentPlan);
		expect(captures.updatePayload?.props?.plan).toBe(normalizedAgentPlan);
	});

	it('persists plan type_key updates', async () => {
		const { PATCH } = await import('./[id]/+server');
		const captures: Captures = {};
		const existingPlan = {
			id: 'plan-1',
			project_id: 'project-1',
			name: 'First Draft Writing Schedule',
			type_key: 'plan.default',
			state_key: 'draft',
			props: {},
			project: { id: 'project-1' }
		};
		const request = new Request('http://localhost/api/onto/plans/plan-1', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				type_key: 'plan.phase.launch'
			})
		});

		const response = await PATCH({
			params: { id: 'plan-1' },
			request,
			locals: {
				supabase: createSupabaseMock(captures, { existingPlan }) as any,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as any);

		expect(response.status).toBe(200);
		expect(captures.updatePayload?.type_key).toBe('plan.phase.launch');
	});

	it('returns 400 when plan update props is not an object', async () => {
		const { PATCH } = await import('./[id]/+server');
		const captures: Captures = {};
		const existingPlan = {
			id: 'plan-1',
			project_id: 'project-1',
			name: 'First Draft Writing Schedule',
			type_key: 'plan.default',
			state_key: 'draft',
			props: {},
			project: { id: 'project-1' }
		};
		const request = new Request('http://localhost/api/onto/plans/plan-1', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				props: ['not', 'an', 'object']
			})
		});

		const response = await PATCH({
			params: { id: 'plan-1' },
			request,
			locals: {
				supabase: createSupabaseMock(captures, { existingPlan }) as any,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as any);

		expect(response.status).toBe(400);
		expect(captures.updatePayload).toBeUndefined();
		await expect(response.json()).resolves.toMatchObject({
			success: false,
			error: 'props must be an object'
		});
	});
});
