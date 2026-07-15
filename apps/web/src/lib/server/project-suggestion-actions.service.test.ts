// apps/web/src/lib/server/project-suggestion-actions.service.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	chatExecutorConstructor: vi.fn(),
	executeTool: vi.fn(),
	createAdminSupabaseClient: vi.fn(),
	syncInboxItemForProjectAudit: vi.fn(),
	syncInboxItemForProjectSuggestion: vi.fn(),
	isProjectSuggestionFresh: vi.fn(),
	finalizeProjectLoopRunIfComplete: vi.fn(),
	captureServerEvent: vi.fn()
}));

vi.mock('$lib/services/agentic-chat/tools/core/tool-executor', () => ({
	ChatToolExecutor: vi.fn().mockImplementation((supabase, userId, sessionId, fetchFn) => {
		mocks.chatExecutorConstructor(supabase, userId, sessionId, fetchFn);
		return { execute: mocks.executeTool };
	})
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: mocks.createAdminSupabaseClient
}));

vi.mock('@buildos/shared-agent-ops', () => ({
	syncInboxItemForProjectAudit: mocks.syncInboxItemForProjectAudit,
	syncInboxItemForProjectSuggestion: mocks.syncInboxItemForProjectSuggestion
}));

vi.mock('$lib/server/project-loop-snapshot.service', () => ({
	isProjectSuggestionFresh: mocks.isProjectSuggestionFresh
}));

vi.mock('$lib/server/project-loop-run.service', () => ({
	finalizeProjectLoopRunIfComplete: mocks.finalizeProjectLoopRunIfComplete
}));

vi.mock('$lib/server/posthog', () => ({
	captureServerEvent: mocks.captureServerEvent
}));

import { decideProjectSuggestion } from './project-suggestion-actions.service';

type QueryResult = { data: unknown; error: null | { message: string } };

function makeSupabase(script: Record<string, QueryResult[]>) {
	const updates: Array<{ table: string; payload: Record<string, unknown> }> = [];
	const supabase = {
		from: vi.fn((table: string) => {
			const builder: any = {
				select: vi.fn(() => builder),
				eq: vi.fn(() => builder),
				update: vi.fn((payload: Record<string, unknown>) => {
					updates.push({ table, payload });
					return builder;
				}),
				maybeSingle: vi.fn(
					async () => script[table]?.shift() ?? { data: null, error: null }
				),
				single: vi.fn(async () => script[table]?.shift() ?? { data: null, error: null }),
				then: vi.fn((resolve, reject) =>
					Promise.resolve(script[table]?.shift() ?? { data: null, error: null }).then(
						resolve,
						reject
					)
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
		run_id: 'run-1',
		project_id: 'project-1',
		status: 'pending',
		source_fingerprint: 'fp-1',
		operations: [],
		...overrides
	};
}

describe('decideProjectSuggestion', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.createAdminSupabaseClient.mockReturnValue({});
		mocks.syncInboxItemForProjectAudit.mockResolvedValue(undefined);
		mocks.syncInboxItemForProjectSuggestion.mockResolvedValue(undefined);
		mocks.executeTool.mockResolvedValue({ success: true });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('stores sanitized dismiss feedback', async () => {
		const { supabase, updates } = makeSupabase({
			project_suggestions: [
				{ data: pendingSuggestion(), error: null },
				{ data: pendingSuggestion({ status: 'rejected' }), error: null }
			]
		});

		const outcome = await decideProjectSuggestion({
			supabase,
			userId: 'user-1',
			projectId: 'project-1',
			suggestionId: 'suggestion-1',
			action: 'dismiss',
			feedback: {
				reason: 'wrong_evidence',
				note: ` ${'x'.repeat(1200)} `
			}
		});

		expect(outcome.ok).toBe(true);
		expect(updates[0]).toMatchObject({
			table: 'project_suggestions',
			payload: {
				status: 'rejected',
				user_feedback: {
					reason: 'wrong_evidence',
					note: 'x'.repeat(1000),
					created_at: expect.any(String)
				}
			}
		});
		expect(mocks.isProjectSuggestionFresh).not.toHaveBeenCalled();
	});

	it('records a required one-line response as an addressed finding', async () => {
		const { supabase, updates } = makeSupabase({
			project_suggestions: [
				{ data: pendingSuggestion({ kind: 'drift' }), error: null },
				{ data: pendingSuggestion({ kind: 'drift', status: 'addressed' }), error: null }
			]
		});

		const outcome = await decideProjectSuggestion({
			supabase,
			userId: 'user-1',
			projectId: 'project-1',
			suggestionId: 'suggestion-1',
			action: 'address',
			feedback: { note: 'The launch date is intentionally provisional.' }
		});

		expect(outcome.ok).toBe(true);
		expect(updates[0]).toMatchObject({
			table: 'project_suggestions',
			payload: {
				status: 'addressed',
				user_feedback: {
					reason: 'other',
					note: 'The launch date is intentionally provisional.',
					created_at: expect.any(String)
				}
			}
		});
		expect(mocks.executeTool).not.toHaveBeenCalled();
	});

	it('rejects approval when a suggestion has no executable operations', async () => {
		const { supabase, updates } = makeSupabase({
			project_suggestions: [{ data: pendingSuggestion({ kind: 'drift' }), error: null }]
		});

		const outcome = await decideProjectSuggestion({
			supabase,
			userId: 'user-1',
			projectId: 'project-1',
			suggestionId: 'suggestion-1',
			action: 'approve'
		});

		expect(outcome).toMatchObject({
			ok: false,
			status: 422,
			message: expect.stringContaining('finding, not an executable proposal')
		});
		expect(updates).toHaveLength(0);
		expect(mocks.isProjectSuggestionFresh).not.toHaveBeenCalled();
	});

	it('refreshes linked audit follow-up counts after dismissing an audit child suggestion', async () => {
		const { supabase, updates } = makeSupabase({
			project_suggestions: [
				{ data: pendingSuggestion({ kind: 'audit_recommendation' }), error: null },
				{
					data: pendingSuggestion({ kind: 'audit_recommendation', status: 'rejected' }),
					error: null
				}
			],
			project_audit_suggestions: [
				{ data: [{ audit_id: 'audit-1' }], error: null },
				{
					data: [
						{ project_suggestions: { status: 'rejected' } },
						{ project_suggestions: { status: 'pending' } }
					],
					error: null
				}
			]
		});

		const outcome = await decideProjectSuggestion({
			supabase,
			userId: 'user-1',
			projectId: 'project-1',
			suggestionId: 'suggestion-1',
			action: 'dismiss'
		});

		expect(outcome.ok).toBe(true);
		expect(updates).toContainEqual({
			table: 'project_audits',
			payload: {
				generated_suggestion_count: 2,
				unresolved_suggestion_count: 1
			}
		});
	});

	it('closes and resyncs the parent audit after its final recommendation is decided', async () => {
		const reviewedAudit = {
			id: 'audit-1',
			project_id: 'project-1',
			status: 'reviewed',
			recommendations: [{ title: 'Resolve the final drift finding' }]
		};
		const { supabase, updates } = makeSupabase({
			project_suggestions: [
				{ data: pendingSuggestion({ kind: 'audit_recommendation' }), error: null },
				{
					data: pendingSuggestion({ kind: 'audit_recommendation', status: 'rejected' }),
					error: null
				}
			],
			project_audit_suggestions: [
				{ data: [{ audit_id: 'audit-1' }], error: null },
				{ data: [{ project_suggestions: { status: 'rejected' } }], error: null }
			],
			project_audits: [
				{ data: null, error: null },
				{ data: reviewedAudit, error: null }
			]
		});

		const outcome = await decideProjectSuggestion({
			supabase,
			userId: 'user-1',
			projectId: 'project-1',
			suggestionId: 'suggestion-1',
			action: 'dismiss'
		});

		expect(outcome.ok).toBe(true);
		expect(updates).toContainEqual({
			table: 'project_audits',
			payload: {
				generated_suggestion_count: 1,
				unresolved_suggestion_count: 0
			}
		});
		expect(updates).toContainEqual({
			table: 'project_audits',
			payload: {
				status: 'reviewed',
				reviewed_at: expect.any(String)
			}
		});
		expect(mocks.syncInboxItemForProjectAudit).toHaveBeenCalledWith({
			supabase: {},
			audit: reviewedAudit
		});
	});

	it('supersedes stale approvals before replaying operations', async () => {
		mocks.isProjectSuggestionFresh.mockResolvedValue(false);
		const operation = { tool: 'update_onto_task', args: { task_id: 'task-1' } };
		const { supabase, updates } = makeSupabase({
			project_suggestions: [
				{
					data: pendingSuggestion({
						source_fingerprint: 'fp-old',
						operations: [operation]
					}),
					error: null
				},
				{
					data: pendingSuggestion({ status: 'superseded', operations: [operation] }),
					error: null
				}
			]
		});
		const outcome = await decideProjectSuggestion({
			supabase,
			userId: 'user-1',
			projectId: 'project-1',
			suggestionId: 'suggestion-1',
			action: 'approve'
		});

		expect(outcome).toMatchObject({ ok: true, superseded: true });
		expect(updates[0].payload).toMatchObject({
			status: 'superseded',
			freshness_state: 'changed',
			result: {
				ok: false,
				applied_operations: 0,
				errors: [
					{
						tool: 'freshness_guard',
						error: expect.stringContaining('Project changed')
					}
				]
			}
		});
		expect(mocks.executeTool).not.toHaveBeenCalled();
	});

	it('approves fresh suggestions with the run chat session and burst-skip fetch header', async () => {
		mocks.isProjectSuggestionFresh.mockResolvedValue(true);
		const operation = {
			tool: 'update_onto_task',
			args: {
				task_id: 'task-1',
				props: { loop_flagged_conflict: true }
			}
		};
		const { supabase, updates } = makeSupabase({
			project_suggestions: [
				{ data: pendingSuggestion({ operations: [operation] }), error: null },
				{
					data: pendingSuggestion({ status: 'approved', operations: [operation] }),
					error: null
				},
				{
					data: pendingSuggestion({ status: 'applied', operations: [operation] }),
					error: null
				}
			],
			project_loop_runs: [{ data: { chat_session_id: 'chat-1' }, error: null }]
		});
		const routeFetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ data: { ok: true } }), {
				status: 200,
				headers: { 'content-type': 'application/json' }
			})
		);

		const outcome = await decideProjectSuggestion({
			supabase,
			userId: 'user-1',
			projectId: 'project-1',
			suggestionId: 'suggestion-1',
			action: 'approve',
			fetchFn: routeFetchMock
		});

		expect(outcome).toMatchObject({
			ok: true,
			result: { ok: true, applied_operations: 1 }
		});
		expect(updates.map((update) => update.payload.status)).toEqual(['approved', 'applied']);
		expect(mocks.chatExecutorConstructor).toHaveBeenCalledWith(
			supabase,
			'user-1',
			'chat-1',
			expect.any(Function)
		);
		expect(mocks.executeTool).toHaveBeenCalledWith(
			expect.objectContaining({
				function: expect.objectContaining({ name: 'update_onto_task' })
			})
		);

		const fetchFn = mocks.chatExecutorConstructor.mock.calls[0][3] as typeof fetch;
		await fetchFn('/api/test', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ title: 'Updated task' })
		});

		expect(routeFetchMock).toHaveBeenCalledWith('/api/test', expect.any(Object));
		const replayInit = routeFetchMock.mock.calls[0][1] as RequestInit;
		const replayHeaders = new Headers(replayInit.headers);
		expect(replayHeaders.get('Content-Type')).toBe('application/json');
		expect(replayHeaders.get('X-Skip-Project-Loop-Burst')).toBeNull();
		expect(JSON.parse(replayInit.body as string)).toEqual({
			title: 'Updated task',
			project_review_context: {
				origin: 'project_suggestion_replay',
				operation_kind: 'suggestion_apply',
				review_policy: 'suppress',
				operation_id: 'project_suggestion:suggestion-1',
				entity_count: 1
			}
		});
	});
});
