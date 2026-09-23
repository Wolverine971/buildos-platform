// apps/web/src/routes/api/onto/milestones/[id]/milestone-due-at.test.ts
//
// A bare YYYY-MM-DD milestone due date is a civil day in the user's timezone:
// it closes at 23:59:59 local, not at midnight UTC (which lands on the previous
// evening for anyone west of Greenwich). Full ISO instants pass through as-is.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const MILESTONE_ID = '33333333-3333-4333-8333-333333333333';
const GOAL_ID = '44444444-4444-4444-8444-444444444444';

let capturedWrite: Record<string, unknown> | null = null;
let userTimezone: string | null = 'America/New_York';
let usersTableReads = 0;

vi.mock('$app/environment', () => ({ dev: false }));

vi.mock('$lib/services/async-activity-logger', () => ({
	logCreateAsync: vi.fn(),
	logUpdateAsync: vi.fn(),
	logDeleteAsync: vi.fn(),
	getChangeSourceFromRequest: vi.fn(() => 'ui'),
	getChatSessionIdFromRequest: vi.fn(() => null)
}));

vi.mock('../../shared/error-logging', () => ({
	logOntologyApiError: vi.fn()
}));

vi.mock('$lib/server/ontology-classification.service', () => ({
	classifyOntologyEntity: vi.fn(async () => undefined)
}));

vi.mock('$lib/services/ontology/auto-organizer.service', () => ({
	AutoOrganizeError: class AutoOrganizeError extends Error {
		status = 400;
	},
	autoOrganizeConnections: vi.fn(async () => undefined),
	assertEntityRefsInProject: vi.fn(async () => undefined),
	toParentRefs: vi.fn(() => [])
}));

vi.mock('@buildos/agentic-chat-runtime/tools', () => ({
	AgenticChatToolAccessDeniedError: class extends Error {},
	loadOntoMilestoneDetail: vi.fn()
}));

vi.mock('$lib/services/agentic-chat/tools/core/executors/web-access-adapter', () => ({
	createWebAgenticChatSharedReadContext: vi.fn()
}));

const existingMilestone = {
	id: MILESTONE_ID,
	project_id: PROJECT_ID,
	title: 'Ship beta',
	due_at: null,
	state_key: 'pending',
	type_key: 'milestone.default',
	props: {},
	project: { id: PROJECT_ID }
};

class QueryMock {
	private action: 'select' | 'write' = 'select';

	constructor(private readonly table: string) {}

	select() {
		return this;
	}

	insert(values: Record<string, unknown>) {
		this.action = 'write';
		capturedWrite = values;
		return this;
	}

	update(values: Record<string, unknown>) {
		this.action = 'write';
		capturedWrite = values;
		return this;
	}

	eq() {
		return this;
	}

	is() {
		return this;
	}

	async maybeSingle() {
		if (this.table === 'users') {
			usersTableReads += 1;
			return { data: { timezone: userTimezone }, error: null };
		}
		return { data: null, error: null };
	}

	async single() {
		if (this.table === 'onto_projects') return { data: { id: PROJECT_ID }, error: null };
		if (this.table !== 'onto_milestones') return { data: null, error: null };
		return this.action === 'write'
			? { data: { ...existingMilestone, ...capturedWrite }, error: null }
			: { data: existingMilestone, error: null };
	}
}

function createLocals() {
	return {
		supabase: {
			rpc: vi.fn(async (fn: string) => {
				if (fn === 'ensure_actor_for_user') return { data: 'actor-current', error: null };
				if (fn === 'current_actor_has_project_member_access')
					return { data: true, error: null };
				return { data: null, error: null };
			}),
			from: (table: string) => new QueryMock(table)
		},
		safeGetSession: async () => ({ user: { id: 'user-1' } })
	};
}

async function patch(body: Record<string, unknown>) {
	const { PATCH } = await import('./+server');
	return PATCH({
		params: { id: MILESTONE_ID },
		request: new Request(`http://localhost/api/onto/milestones/${MILESTONE_ID}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		}),
		locals: createLocals()
	} as any);
}

async function create(body: Record<string, unknown>) {
	const { POST } = await import('../create/+server');
	return POST({
		request: new Request('http://localhost/api/onto/milestones/create', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				project_id: PROJECT_ID,
				title: 'Ship beta',
				goal_id: GOAL_ID,
				...body
			})
		}),
		locals: createLocals()
	} as any);
}

describe('milestone due_at civil-day input', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		capturedWrite = null;
		userTimezone = 'America/New_York';
		usersTableReads = 0;
	});

	it('PATCH closes a bare date at the end of that day in the user timezone', async () => {
		// Oct 1 2026 is EDT (-04:00).
		const response = await patch({ due_at: '2026-10-01' });

		expect(response.status).toBe(200);
		expect(capturedWrite?.due_at).toBe('2026-10-02T03:59:59.000Z');
	});

	it('PATCH passes a full ISO instant through without reading the timezone', async () => {
		const response = await patch({ due_at: '2026-10-01T15:30:00.000Z' });

		expect(response.status).toBe(200);
		expect(capturedWrite?.due_at).toBe('2026-10-01T15:30:00.000Z');
		expect(usersTableReads).toBe(0);
	});

	it('PATCH clears the due date on null and rejects garbage', async () => {
		const cleared = await patch({ due_at: null });
		expect(cleared.status).toBe(200);
		expect(capturedWrite?.due_at).toBeNull();

		const invalid = await patch({ due_at: 'next tuesday' });
		expect(invalid.status).toBe(400);
	});

	it('create closes a bare date at the end of that day in the user timezone', async () => {
		const response = await create({ due_at: '2026-10-01' });

		expect(response.status).toBe(201);
		expect(capturedWrite?.due_at).toBe('2026-10-02T03:59:59.000Z');
	});

	it('create keeps a full ISO instant unchanged', async () => {
		const response = await create({ due_at: '2026-10-01T15:30:00.000Z' });

		expect(response.status).toBe(201);
		expect(capturedWrite?.due_at).toBe('2026-10-01T15:30:00.000Z');
	});
});
