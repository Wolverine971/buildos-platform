import { beforeEach, describe, expect, it, vi } from 'vitest';

const dispatchMock = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/agent-runs/dispatch', () => ({
	ACTIVE_AGENT_RUN_STATUSES: ['queued', 'running', 'paused', 'needs_input', 'proposal_ready'],
	dispatchAgentRun: dispatchMock,
	normalizeAgentRunAllowedOps: vi.fn(),
	normalizeAgentRunBudgets: vi.fn()
}));

import { GET } from './+server';

function createSupabaseMock(data: unknown[] = [], error: unknown = null) {
	const builder: Record<string, any> = {};
	builder.select = vi.fn(() => builder);
	builder.eq = vi.fn(() => builder);
	builder.in = vi.fn(() => builder);
	builder.order = vi.fn(() => builder);
	builder.limit = vi.fn(() => builder);
	builder.then = (
		resolve: (value: { data: unknown[]; error: unknown }) => unknown,
		reject: (reason: unknown) => unknown
	) => Promise.resolve({ data, error }).then(resolve, reject);

	return {
		from: vi.fn(() => builder),
		builder
	};
}

function event(supabase: unknown, user: { id: string } | null = { id: 'user-1' }) {
	return {
		url: new URL('http://localhost/api/agent-runs?limit=25'),
		locals: {
			supabase,
			safeGetSession: vi.fn(async () => ({ user }))
		}
	} as any;
}

describe('GET /api/agent-runs', () => {
	beforeEach(() => vi.clearAllMocks());

	it('includes the owning project name with each run', async () => {
		const supabase = createSupabaseMock([
			{
				id: 'run-1',
				project_id: 'project-1',
				project: { id: 'project-1', name: 'Author Training' }
			}
		]);

		const response = await GET(event(supabase));
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(supabase.from).toHaveBeenCalledWith('agent_runs');
		expect(supabase.builder.select).toHaveBeenCalledWith(
			'*, project:onto_projects!agent_runs_project_id_fkey(id, name)'
		);
		expect(json.data.runs[0].project.name).toBe('Author Training');
	});

	it('requires authentication', async () => {
		const supabase = createSupabaseMock();

		const response = await GET(event(supabase, null));

		expect(response.status).toBe(401);
		expect(supabase.from).not.toHaveBeenCalled();
	});
});
