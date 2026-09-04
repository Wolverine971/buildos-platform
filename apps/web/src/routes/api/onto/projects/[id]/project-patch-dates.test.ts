// apps/web/src/routes/api/onto/projects/[id]/project-patch-dates.test.ts
//
// A bare YYYY-MM-DD on a project timeline is a civil day in the owner's
// timezone, not a midnight-UTC instant. These cover the conversion the edit
// modal now depends on: it sends the calendar date it is showing, the route
// turns it into the right boundary instant.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

let capturedUpdate: Record<string, unknown> | null = null;
let userTimezone: string | null = 'America/New_York';

vi.mock('$lib/services/async-activity-logger', () => ({
	logUpdateAsync: vi.fn(),
	logDeleteAsync: vi.fn(),
	getChangeSourceFromRequest: vi.fn(() => 'ui'),
	getChatSessionIdFromRequest: vi.fn(() => null)
}));

vi.mock('../../shared/error-logging', () => ({
	logOntologyApiError: vi.fn()
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: vi.fn(() => null)
}));

vi.mock('@buildos/shared-agent-ops/inbox-index', () => ({
	expireInboxItemsForProject: vi.fn()
}));

const existingProject = {
	id: PROJECT_ID,
	name: 'Ontology rewrite',
	description: null,
	state_key: 'active',
	type_key: 'project.default',
	props: {},
	start_at: '2026-11-02T05:00:00.000Z',
	end_at: '2026-11-21T04:59:59.000Z',
	next_step_short: null,
	next_step_long: null,
	created_by: '22222222-2222-4222-8222-222222222222',
	created_at: '2026-10-01T00:00:00.000Z',
	updated_at: '2026-10-01T00:00:00.000Z'
};

class ProjectQueryMock {
	private action: 'select' | 'update' = 'select';

	constructor(private readonly table: string) {}

	select() {
		return this;
	}

	update(values: Record<string, unknown>) {
		this.action = 'update';
		capturedUpdate = values;
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
			return { data: { timezone: userTimezone }, error: null };
		}
		return { data: null, error: null };
	}

	async single() {
		if (this.table !== 'onto_projects') return { data: null, error: null };
		return this.action === 'update'
			? { data: { ...existingProject, ...capturedUpdate }, error: null }
			: { data: existingProject, error: null };
	}
}

function createSupabaseMock() {
	return {
		rpc: vi.fn(async (fn: string) => {
			if (fn === 'ensure_actor_for_user') return { data: 'actor-current', error: null };
			if (fn === 'current_actor_has_project_member_access')
				return { data: true, error: null };
			return { data: null, error: null };
		}),
		from: (table: string) => new ProjectQueryMock(table)
	};
}

async function patch(body: Record<string, unknown>) {
	const { PATCH } = await import('./+server');
	return PATCH({
		params: { id: PROJECT_ID },
		request: new Request(`http://localhost/api/onto/projects/${PROJECT_ID}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		}),
		locals: {
			supabase: createSupabaseMock() as any,
			safeGetSession: async () => ({ user: { id: 'user-actor' } })
		}
	} as any);
}

describe('PATCH /api/onto/projects/[id] civil-day timeline input', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		capturedUpdate = null;
		userTimezone = 'America/New_York';
	});

	it('closes an end date on the last second of that day in the user timezone', async () => {
		const response = await patch({ end_at: '2026-11-20' });

		expect(response.status).toBe(200);
		expect(capturedUpdate?.end_at).toBe('2026-11-21T04:59:59.000Z');
	});

	it('opens a start date on the first moment of that day in the user timezone', async () => {
		// Nov 2 2026 is EST (-05:00); DST ended the day before.
		const response = await patch({ start_at: '2026-11-02' });

		expect(response.status).toBe(200);
		expect(capturedUpdate?.start_at).toBe('2026-11-02T05:00:00.000Z');
	});

	it('falls back to UTC when the user has no usable timezone', async () => {
		userTimezone = null;
		const response = await patch({ end_at: '2026-11-20' });

		expect(response.status).toBe(200);
		expect(capturedUpdate?.end_at).toBe('2026-11-20T23:59:59.000Z');
	});

	it('passes a full ISO instant through unchanged', async () => {
		const response = await patch({ start_at: '2026-11-02T15:45:00.000Z' });

		expect(response.status).toBe(200);
		expect(capturedUpdate?.start_at).toBe('2026-11-02T15:45:00.000Z');
	});

	it('clears a timeline field on null', async () => {
		const response = await patch({ end_at: null });

		expect(response.status).toBe(200);
		expect(capturedUpdate?.end_at).toBeNull();
	});

	it('rejects a value that is not a date', async () => {
		const response = await patch({ end_at: 'not-a-date' });

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({
			success: false,
			error: 'end_at must be a valid date'
		});
	});
});
