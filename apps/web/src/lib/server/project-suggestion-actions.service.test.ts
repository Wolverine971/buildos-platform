// apps/web/src/lib/server/project-suggestion-actions.service.test.ts
import { requireTestValue } from '$lib/test-helpers/require-test-value';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	runGatewayWriteOp: vi.fn(),
	createAdminSupabaseClient: vi.fn(),
	syncInboxItemForProjectAudit: vi.fn(),
	syncInboxItemForProjectSuggestion: vi.fn(),
	verifyProjectSuggestionIntegrity: vi.fn(),
	quarantineProjectSuggestionInboxItem: vi.fn(),
	isProjectSuggestionFresh: vi.fn(),
	finalizeProjectLoopRunIfComplete: vi.fn(),
	captureServerEvent: vi.fn()
}));

vi.mock('@buildos/shared-agent-ops/gateway/op-execution-gateway', () => ({
	runGatewayWriteOp: mocks.runGatewayWriteOp
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: mocks.createAdminSupabaseClient
}));

vi.mock('@buildos/shared-agent-ops', () => ({
	syncInboxItemForProjectAudit: mocks.syncInboxItemForProjectAudit,
	syncInboxItemForProjectSuggestion: mocks.syncInboxItemForProjectSuggestion,
	verifyProjectSuggestionIntegrity: mocks.verifyProjectSuggestionIntegrity,
	quarantineProjectSuggestionInboxItem: mocks.quarantineProjectSuggestionInboxItem,
	readProjectSuggestionStructuralFingerprint: vi.fn(function () {
		return null;
	})
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

import {
	decideProjectSuggestion,
	replayLoopOperations
} from './project-suggestion-actions.service';

type QueryResult = { data: unknown; error: null | { message: string } };

function makeSupabase(script: Record<string, QueryResult[]>) {
	const updates: Array<{ table: string; payload: Record<string, unknown> }> = [];
	const supabase = {
		from: vi.fn(function (table: string) {
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
		mocks.createAdminSupabaseClient.mockReturnValue({
			from: vi.fn(function () {
				const builder: any = {
					select: vi.fn(() => builder),
					eq: vi.fn(() => builder),
					maybeSingle: vi.fn(async () => ({ data: null, error: null }))
				};
				return builder;
			})
		});
		mocks.syncInboxItemForProjectAudit.mockResolvedValue(undefined);
		mocks.syncInboxItemForProjectSuggestion.mockResolvedValue(undefined);
		mocks.verifyProjectSuggestionIntegrity.mockResolvedValue({
			ok: true,
			summary: {
				headline: 'Apply verified change.',
				operation_count: 1,
				operations: [],
				structural_fingerprint: 'structural-fingerprint',
				verified_at: '2026-08-13T12:00:00.000Z'
			}
		});
		mocks.quarantineProjectSuggestionInboxItem.mockResolvedValue(undefined);
		mocks.runGatewayWriteOp.mockResolvedValue({ ok: true, data: { task: { id: 'task-1' } } });
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
		expect(mocks.runGatewayWriteOp).not.toHaveBeenCalled();
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
			supabase: expect.any(Object),
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
		expect(requireTestValue(updates[0]).payload).toMatchObject({
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
		expect(mocks.runGatewayWriteOp).not.toHaveBeenCalled();
	});

	it('fails closed and quarantines a proposal whose resolved entities do not match', async () => {
		mocks.verifyProjectSuggestionIntegrity.mockResolvedValueOnce({
			ok: false,
			diagnostic: {
				code: 'MODEL_ENTITY_MISMATCH',
				message: 'Stored operation targets a different document'
			}
		});
		const suggestion = pendingSuggestion({
			title: 'Move The Mirror Moment',
			operations: [
				{
					tool: 'move_document_in_tree',
					args: {
						project_id: 'project-1',
						document_id: 'wrong-document',
						new_parent_id: 'destination'
					},
					label: 'Move The Mirror Moment'
				}
			]
		});
		const { supabase, updates } = makeSupabase({
			project_suggestions: [{ data: suggestion, error: null }]
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
			status: 409,
			message: expect.stringContaining('MODEL_ENTITY_MISMATCH')
		});
		expect(mocks.quarantineProjectSuggestionInboxItem).toHaveBeenCalledWith(
			expect.objectContaining({ suggestion })
		);
		expect(mocks.isProjectSuggestionFresh).not.toHaveBeenCalled();
		expect(mocks.runGatewayWriteOp).not.toHaveBeenCalled();
		expect(updates).toHaveLength(0);
	});

	it('approves a fresh suggestion through the write gateway, fenced to its project', async () => {
		mocks.isProjectSuggestionFresh.mockResolvedValue(true);
		const operation = {
			tool: 'update_onto_task',
			args: {
				task_id: 'task-1',
				project_id: 'project-1',
				props: { loop_flagged_conflict: true },
				// Not a field the legacy tool forwarded: a replay must drop it.
				archived: true
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
		const routeFetchMock = vi.fn();

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
		expect(mocks.runGatewayWriteOp).toHaveBeenCalledTimes(1);
		expect(mocks.runGatewayWriteOp).toHaveBeenCalledWith({
			admin: supabase,
			userId: 'user-1',
			scope: {
				mode: 'read_write',
				allowed_ops: ['onto.task.update'],
				project_ids: ['project-1'],
				write_project_ids: ['project-1']
			},
			op: 'onto.task.update',
			args: {
				task_id: 'task-1',
				props: { loop_flagged_conflict: true },
				calendar_sync: 'none'
			},
			chatSessionId: 'chat-1'
		});
		// No self-fetch of /api/onto routes any more.
		expect(routeFetchMock).not.toHaveBeenCalled();
	});

	it('refuses a tool outside the replay allowlist before claiming or writing', async () => {
		mocks.isProjectSuggestionFresh.mockResolvedValue(true);
		const operations = [
			{
				tool: 'update_onto_task',
				args: { project_id: 'project-1', task_id: 'task-1', props: { flag: true } }
			},
			{ tool: 'delete_onto_project', args: { project_id: 'project-1' } }
		];
		const { supabase, updates } = makeSupabase({
			project_suggestions: [{ data: pendingSuggestion({ operations }), error: null }]
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
			message: expect.stringContaining('delete_onto_project')
		});
		expect(updates).toHaveLength(0);
		expect(mocks.runGatewayWriteOp).not.toHaveBeenCalled();
		expect(mocks.isProjectSuggestionFresh).not.toHaveBeenCalled();
	});

	it('records the explicit partial-failure policy when a later operation fails', async () => {
		const operations = [
			{
				tool: 'update_onto_task',
				args: { project_id: 'project-1', task_id: 'task-1', props: { priority: 'high' } }
			},
			{
				tool: 'update_onto_task',
				args: { project_id: 'project-1', task_id: 'task-2', props: { priority: 'low' } }
			}
		];
		mocks.runGatewayWriteOp
			.mockResolvedValueOnce({ ok: true, data: { task: { id: 'task-1' } } })
			.mockResolvedValueOnce({
				ok: false,
				error: { code: 'VALIDATION_ERROR', message: 'Second update failed' }
			});
		const { supabase, updates } = makeSupabase({
			project_suggestions: [
				{ data: pendingSuggestion({ operations }), error: null },
				{ data: pendingSuggestion({ status: 'approved', operations }), error: null },
				{ data: pendingSuggestion({ status: 'failed', operations }), error: null }
			],
			project_loop_runs: [{ data: { chat_session_id: 'chat-1' }, error: null }]
		});

		const outcome = await decideProjectSuggestion({
			supabase,
			userId: 'user-1',
			projectId: 'project-1',
			suggestionId: 'suggestion-1',
			action: 'approve'
		});

		expect(outcome).toMatchObject({
			ok: true,
			result: {
				ok: false,
				applied_operations: 1,
				execution_policy: 'prevalidated_sequential',
				partial_failure: true,
				errors: [{ tool: 'update_onto_task', error: 'Second update failed' }]
			}
		});
		expect(updates.at(-1)?.payload).toMatchObject({
			status: 'failed',
			result: expect.objectContaining({ partial_failure: true })
		});
	});
});

describe('replayLoopOperations', () => {
	const supabase = { from: vi.fn() };

	beforeEach(() => {
		vi.clearAllMocks();
		mocks.runGatewayWriteOp.mockResolvedValue({ ok: true, data: { task: { id: 'task-1' } } });
	});

	it('undo replays each inverse operation through the gateway, fenced to the operations project', async () => {
		// The shapes the freshness radar and doc-organization generator store as undo.
		const operations = [
			{
				tool: 'update_onto_task',
				args: {
					task_id: 'task-1',
					project_id: 'project-1',
					due_at: '2026-09-01T16:00:00.000Z'
				},
				label: 'Restore the due date of "Send deck"'
			},
			{
				tool: 'move_document_in_tree',
				args: {
					document_id: 'doc-1',
					new_parent_id: null,
					new_position: 0,
					project_id: 'project-1'
				},
				label: 'Move document back to its previous parent'
			}
		];

		const replay = await replayLoopOperations({
			supabase,
			userId: 'user-1',
			chatSessionId: 'session-1',
			operations,
			operationId: 'freshness_undo:flag-1',
			operationKind: 'freshness_undo'
		});

		expect(replay).toEqual({ appliedCount: 2, errors: [], outcomes: [true, true] });
		const calls = mocks.runGatewayWriteOp.mock.calls.map(([call]) => call);
		expect(calls).toEqual([
			{
				admin: supabase,
				userId: 'user-1',
				scope: {
					mode: 'read_write',
					allowed_ops: ['onto.task.update'],
					project_ids: ['project-1'],
					write_project_ids: ['project-1']
				},
				op: 'onto.task.update',
				args: {
					task_id: 'task-1',
					due_at: '2026-09-01T16:00:00.000Z',
					calendar_sync: 'none'
				},
				chatSessionId: 'session-1'
			},
			{
				admin: supabase,
				userId: 'user-1',
				scope: {
					mode: 'read_write',
					allowed_ops: ['onto.document.tree.move'],
					project_ids: ['project-1'],
					write_project_ids: ['project-1']
				},
				op: 'onto.document.tree.move',
				args: {
					project_id: 'project-1',
					document_id: 'doc-1',
					new_parent_id: null,
					new_position: 0
				},
				chatSessionId: 'session-1'
			}
		]);
	});

	it('refuses the whole batch with no write when any tool is not replayable', async () => {
		const replay = await replayLoopOperations({
			supabase,
			userId: 'user-1',
			chatSessionId: null,
			projectId: 'project-1',
			operations: [
				{ tool: 'update_onto_task', args: { task_id: 'task-1', state_key: 'done' } },
				{ tool: 'call_corsair_mcp_tool', args: { tool: 'send_email' } }
			],
			operationId: 'freshness_undo:flag-2'
		});

		expect(mocks.runGatewayWriteOp).not.toHaveBeenCalled();
		expect(replay.appliedCount).toBe(0);
		expect(replay.outcomes).toEqual([false, false]);
		expect(replay.errors).toEqual([
			{ tool: 'call_corsair_mcp_tool', error: expect.stringContaining('cannot be replayed') }
		]);
	});

	it('refuses an operation that targets a different project', async () => {
		const replay = await replayLoopOperations({
			supabase,
			userId: 'user-1',
			chatSessionId: null,
			projectId: 'project-1',
			operations: [
				{
					tool: 'update_onto_goal',
					args: { goal_id: 'goal-1', project_id: 'project-2', state_key: 'achieved' }
				}
			],
			operationId: 'project_suggestion:s-3'
		});

		expect(mocks.runGatewayWriteOp).not.toHaveBeenCalled();
		expect(replay.errors[0]?.error).toContain('different project');
	});

	it('retries a doc-tree move once after a structure version conflict', async () => {
		mocks.runGatewayWriteOp
			.mockResolvedValueOnce({
				ok: false,
				error: {
					code: 'INTERNAL',
					message: 'Structure version conflict: expected 3, got 4'
				}
			})
			.mockResolvedValueOnce({ ok: true, data: { document_id: 'doc-1' } });

		const replay = await replayLoopOperations({
			supabase,
			userId: 'user-1',
			chatSessionId: null,
			operations: [
				{
					tool: 'move_document_in_tree',
					args: {
						project_id: 'project-1',
						document_id: 'doc-1',
						new_parent_id: 'doc-parent',
						new_position: 2
					}
				}
			],
			operationId: 'project_suggestion:s-4'
		});

		expect(replay).toEqual({ appliedCount: 1, errors: [], outcomes: [true] });
		expect(mocks.runGatewayWriteOp).toHaveBeenCalledTimes(2);
	});

	it('keeps the task_completed signal for a replay that marks a task done', async () => {
		mocks.runGatewayWriteOp.mockResolvedValueOnce({
			ok: true,
			data: { task: { id: 'task-9', state_key: 'done' } }
		});

		await replayLoopOperations({
			supabase,
			userId: 'user-1',
			chatSessionId: null,
			projectId: 'project-1',
			operations: [
				{ tool: 'update_onto_task', args: { task_id: 'task-9', state_key: 'done' } }
			],
			operationId: 'project_suggestion:s-5'
		});

		expect(mocks.captureServerEvent).toHaveBeenCalledWith('user-1', 'task_completed', {
			task_id: 'task-9',
			project_id: 'project-1'
		});
	});

	it('refuses internal tool markup in replayed text without writing', async () => {
		const replay = await replayLoopOperations({
			supabase,
			userId: 'user-1',
			chatSessionId: null,
			projectId: 'project-1',
			operations: [
				{
					tool: 'update_onto_document',
					args: {
						document_id: 'doc-1',
						props: {
							loop_outdated_reason: '<tool_call>update_onto_document</tool_call>'
						}
					}
				}
			],
			operationId: 'project_suggestion:s-6'
		});

		expect(mocks.runGatewayWriteOp).not.toHaveBeenCalled();
		expect(replay.outcomes).toEqual([false]);
		expect(replay.errors[0]?.error).toContain('internal tool-call markup');
	});
});
