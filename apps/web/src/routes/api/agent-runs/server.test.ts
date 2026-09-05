// apps/web/src/routes/api/agent-runs/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dispatchMock = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/agent-runs/dispatch', () => ({
	ACTIVE_AGENT_RUN_STATUSES: ['queued', 'running', 'paused', 'needs_input', 'proposal_ready'],
	dispatchAgentRun: dispatchMock,
	normalizeAgentRunAllowedOps: vi.fn(),
	normalizeAgentRunBudgets: vi.fn()
}));

import { config, GET } from './+server';

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

	it('allows a transient upstream stall beyond the global ten-second budget', () => {
		expect(config).toEqual({ maxDuration: 30 });
	});

	it('keeps the full representation for on-demand history', async () => {
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

	it('uses a compact projection for the realtime reconciliation heartbeat', async () => {
		const supabase = createSupabaseMock();
		const requestEvent = event(supabase);
		requestEvent.url = new URL('http://localhost/api/agent-runs?limit=25&view=summary');

		await GET(requestEvent);

		const projection = supabase.builder.select.mock.calls[0][0] as string;
		expect(projection).toBe(
			'id,user_id,project_id,label,goal,instructions,expected_output,context_type,scope_mode,effort,run_template,review_required,allowed_ops,budgets,status,error,trigger,parent_session_id,created_at,started_at,completed_at,updated_at,project:onto_projects!agent_runs_project_id_fkey(id, name)'
		);
	});

	it('requires authentication', async () => {
		const supabase = createSupabaseMock();

		const response = await GET(event(supabase, null));

		expect(response.status).toBe(401);
		expect(supabase.from).not.toHaveBeenCalled();
	});
});
