import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	createAdminSupabaseClient: vi.fn(),
	loadProjectLoopSourceFingerprint: vi.fn(),
	decideProjectSuggestion: vi.fn(),
	countActiveAgentRuns: vi.fn(),
	dispatchAgentRun: vi.fn(),
	buildProjectSuggestionProposalContext: vi.fn(),
	syncInboxItemForProjectSuggestion: vi.fn()
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: mocks.createAdminSupabaseClient
}));

vi.mock('$lib/server/project-loop-snapshot.service', () => ({
	loadProjectLoopSourceFingerprint: mocks.loadProjectLoopSourceFingerprint
}));

vi.mock('$lib/server/project-suggestion-actions.service', () => ({
	decideProjectSuggestion: mocks.decideProjectSuggestion
}));

vi.mock('$lib/server/agent-runs/dispatch', () => ({
	MAX_CONCURRENT_AGENT_RUNS: 3,
	countActiveAgentRuns: mocks.countActiveAgentRuns,
	dispatchAgentRun: mocks.dispatchAgentRun
}));

vi.mock('@buildos/shared-agent-ops/proposal-context', () => ({
	buildProjectSuggestionProposalContext: mocks.buildProjectSuggestionProposalContext
}));

vi.mock('@buildos/shared-agent-ops', () => ({
	syncInboxItemForProjectSuggestion: mocks.syncInboxItemForProjectSuggestion
}));

import { decideProjectSuggestionWithClarification } from './clarified-decision.service';

type QueryResult = { data: unknown; error: null | { message: string } };

function makeSupabase(script: Record<string, QueryResult[]>) {
	const updates: Array<{
		table: string;
		payload: Record<string, unknown>;
		filters: Array<[string, unknown]>;
	}> = [];
	const supabase = {
		from: vi.fn((table: string) => {
			const filters: Array<[string, unknown]> = [];
			const builder: any = {
				select: vi.fn(() => builder),
				eq: vi.fn((column: string, value: unknown) => {
					filters.push([column, value]);
					return builder;
				}),
				update: vi.fn((payload: Record<string, unknown>) => {
					updates.push({ table, payload, filters });
					return builder;
				}),
				maybeSingle: vi.fn(
					async () => script[table]?.shift() ?? { data: null, error: null }
				)
			};
			return builder;
		})
	};
	return { supabase, updates };
}

function pendingSuggestion(overrides: Record<string, unknown> = {}) {
	return {
		id: 'suggestion-1',
		run_id: 'loop-run-1',
		project_id: 'project-1',
		status: 'pending',
		title: 'Resolve duplicate launch tasks',
		kind: 'task_conflict',
		risk_tier: 1,
		source_fingerprint: null,
		operations: [],
		evidence_refs: [],
		...overrides
	};
}

describe('decideProjectSuggestionWithClarification', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.createAdminSupabaseClient.mockReturnValue({ admin: true });
		mocks.countActiveAgentRuns.mockResolvedValue({ ok: true, count: 0 });
		mocks.dispatchAgentRun.mockResolvedValue({
			ok: true,
			run: { id: 'agent-run-1', status: 'queued' }
		});
		mocks.buildProjectSuggestionProposalContext.mockReturnValue({
			llmText: 'proposal context'
		});
		mocks.syncInboxItemForProjectSuggestion.mockResolvedValue(undefined);
	});

	it('claims a pending suggestion, dispatches a source-linked agent run, and links the run id', async () => {
		const delegated = pendingSuggestion({ status: 'delegated' });
		const linked = pendingSuggestion({ status: 'delegated', agent_run_id: 'agent-run-1' });
		const { supabase, updates } = makeSupabase({
			project_suggestions: [
				{ data: pendingSuggestion(), error: null },
				{ data: delegated, error: null },
				{ data: linked, error: null }
			],
			onto_projects: [{ data: { name: 'Launch project' }, error: null }],
			project_loop_runs: [
				{ data: { id: 'loop-run-1', chat_session_id: 'chat-1' }, error: null }
			]
		});

		const outcome = await decideProjectSuggestionWithClarification({
			supabase,
			userId: 'user-1',
			projectId: 'project-1',
			suggestionId: 'suggestion-1',
			action: 'approve',
			clarification: 'Only keep the higher-priority task open.'
		});

		expect(outcome).toMatchObject({
			ok: true,
			delegated: true,
			agent_run_id: 'agent-run-1'
		});
		expect(updates.map((update) => update.payload)).toEqual([
			expect.objectContaining({
				status: 'delegated',
				user_feedback: expect.objectContaining({
					note: 'Only keep the higher-priority task open.'
				})
			}),
			expect.objectContaining({ agent_run_id: 'agent-run-1' })
		]);
		expect(mocks.dispatchAgentRun).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: 'user-1',
				projectId: 'project-1',
				contextType: 'project',
				scopeMode: 'read_write',
				reviewRequired: false,
				parentSessionId: 'chat-1',
				sourceSuggestionId: 'suggestion-1',
				sourceDecision: 'approve',
				validateProjectAccess: false
			})
		);
	});

	it('falls back to the direct decision path when the agent queue is full', async () => {
		mocks.countActiveAgentRuns.mockResolvedValue({ ok: true, count: 3 });
		mocks.decideProjectSuggestion.mockResolvedValue({
			ok: true,
			suggestion: pendingSuggestion({ status: 'applied' }),
			result: { ok: true, applied_operations: 0 }
		});
		const { supabase, updates } = makeSupabase({
			project_suggestions: [{ data: pendingSuggestion(), error: null }]
		});

		const outcome = await decideProjectSuggestionWithClarification({
			supabase,
			userId: 'user-1',
			projectId: 'project-1',
			suggestionId: 'suggestion-1',
			action: 'dismiss',
			clarification: 'This is intentional.',
			reason: 'intentional'
		});

		expect(outcome).toMatchObject({ ok: true, degraded: true });
		expect(mocks.dispatchAgentRun).not.toHaveBeenCalled();
		expect(mocks.decideProjectSuggestion).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'dismiss',
				feedback: expect.objectContaining({
					reason: 'intentional',
					note: 'This is intentional.'
				})
			})
		);
		expect(updates[0].payload).toMatchObject({
			user_feedback: expect.objectContaining({
				reason: 'intentional',
				note: 'This is intentional.'
			})
		});
	});

	it('supersedes stale clarified approvals before dispatching a child run', async () => {
		mocks.loadProjectLoopSourceFingerprint.mockResolvedValue('new-fingerprint');
		const { supabase, updates } = makeSupabase({
			project_suggestions: [
				{ data: pendingSuggestion({ source_fingerprint: 'old-fingerprint' }), error: null },
				{ data: pendingSuggestion({ status: 'superseded' }), error: null }
			]
		});

		const outcome = await decideProjectSuggestionWithClarification({
			supabase,
			userId: 'user-1',
			projectId: 'project-1',
			suggestionId: 'suggestion-1',
			action: 'approve',
			clarification: 'Apply this, but only if still current.'
		});

		expect(outcome).toMatchObject({ ok: true, superseded: true });
		expect(updates[0].payload).toMatchObject({
			status: 'superseded',
			freshness_state: 'changed',
			user_feedback: expect.objectContaining({
				note: 'Apply this, but only if still current.'
			})
		});
		expect(mocks.countActiveAgentRuns).not.toHaveBeenCalled();
		expect(mocks.dispatchAgentRun).not.toHaveBeenCalled();
	});
});
