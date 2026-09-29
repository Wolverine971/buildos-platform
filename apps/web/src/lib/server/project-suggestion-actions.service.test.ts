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
	captureServerEvent: vi.fn(),
	archiveDocumentInTree: vi.fn(),
	archiveTaskCanonical: vi.fn(),
	logUpdateAsync: vi.fn()
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
	}),
	// Same contract as the shared helper: absent means archive_children.
	readDocumentArchiveChildrenMode: vi.fn(function (value: unknown) {
		if (value === undefined || value === null) return 'archive_children';
		return value === 'archive_children' || value === 'promote_children' ? value : null;
	})
}));

vi.mock('$lib/services/ontology/doc-structure.service', () => ({
	archiveDocumentInTree: mocks.archiveDocumentInTree
}));

vi.mock('$lib/server/task-archive.service', () => ({
	archiveTaskCanonical: mocks.archiveTaskCanonical
}));

vi.mock('$lib/services/async-activity-logger', () => ({
	logUpdateAsync: mocks.logUpdateAsync
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
	isReplayableLoopOperationTool,
	replayLoopOperations
} from './project-suggestion-actions.service';

type QueryResult = { data: unknown; error: null | { message: string } };

function makeSupabase(script: Record<string, QueryResult[]>) {
	const updates: Array<{ table: string; payload: Record<string, unknown> }> = [];
	const supabase = {
		rpc: vi.fn(async () => ({ data: 'actor-1', error: null })),
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

// ---------------------------------------------------------------------------
// Project cleanup operations (Tasker 112)
// ---------------------------------------------------------------------------

const CLEANUP_PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const CLEANUP_DOCUMENT_ID = '22222222-2222-4222-8222-222222222222';
const CLEANUP_TASK_ID = '33333333-3333-4333-8333-333333333333';

function archiveReplaySupabase(documentRow: Record<string, unknown> | null) {
	const builder: any = {
		select: vi.fn(() => builder),
		eq: vi.fn(() => builder),
		is: vi.fn(() => builder),
		maybeSingle: vi.fn(async () => ({ data: documentRow, error: null }))
	};
	return {
		builder,
		supabase: {
			rpc: vi.fn(async (name: string) =>
				name === 'ensure_actor_for_user'
					? { data: 'actor-1', error: null }
					: { data: null, error: null }
			),
			from: vi.fn(() => builder)
		}
	};
}

const cleanupDocumentRow = {
	id: CLEANUP_DOCUMENT_ID,
	project_id: CLEANUP_PROJECT_ID,
	title: 'Rod Chamberlin',
	state_key: 'draft',
	type_key: 'document.context.project',
	updated_at: '2026-09-28T10:00:00.000Z'
};

describe('replayLoopOperations: cleanup operations', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.runGatewayWriteOp.mockResolvedValue({ ok: true, data: { project: { id: 'p' } } });
		mocks.archiveDocumentInTree.mockResolvedValue({
			document: { ...cleanupDocumentRow, state_key: 'archived' },
			structure: null,
			archivedDocumentIds: [CLEANUP_DOCUMENT_ID],
			archiveMode: 'promote_children'
		});
		mocks.archiveTaskCanonical.mockResolvedValue({
			ok: true,
			archivedAt: '2026-09-29T10:00:00.000Z'
		});
	});

	it('accepts the cleanup tools in the replay allowlist', () => {
		expect(isReplayableLoopOperationTool('archive_onto_document')).toBe(true);
		expect(isReplayableLoopOperationTool('archive_onto_task')).toBe(true);
		expect(isReplayableLoopOperationTool('update_onto_project')).toBe(true);
		expect(isReplayableLoopOperationTool('delete_onto_task')).toBe(false);
	});

	it('dispatches archives to the canonical paths and the project edit to the gateway', async () => {
		const { supabase, builder } = archiveReplaySupabase(cleanupDocumentRow);
		const replay = await replayLoopOperations({
			supabase,
			userId: 'user-1',
			chatSessionId: 'chat-1',
			projectId: CLEANUP_PROJECT_ID,
			operations: [
				{
					tool: 'archive_onto_document',
					args: {
						project_id: CLEANUP_PROJECT_ID,
						document_id: CLEANUP_DOCUMENT_ID,
						children: 'promote_children'
					}
				},
				{
					tool: 'archive_onto_task',
					args: { project_id: CLEANUP_PROJECT_ID, task_id: CLEANUP_TASK_ID }
				},
				{
					tool: 'update_onto_project',
					args: {
						project_id: CLEANUP_PROJECT_ID,
						description: 'Consulting for Maryland creators.',
						// Never shown by the verifier, so never replayed.
						state_key: 'paused'
					}
				}
			],
			operationId: 'project_suggestion:cleanup-1'
		});

		expect(replay).toEqual({ appliedCount: 3, errors: [], outcomes: [true, true, true] });
		expect(supabase.rpc).toHaveBeenCalledWith('ensure_actor_for_user', {
			p_user_id: 'user-1'
		});
		expect(builder.is).toHaveBeenCalledWith('deleted_at', null);
		expect(mocks.archiveDocumentInTree).toHaveBeenCalledWith(
			supabase,
			CLEANUP_PROJECT_ID,
			CLEANUP_DOCUMENT_ID,
			{ mode: 'promote_children', expectedUpdatedAt: cleanupDocumentRow.updated_at },
			'actor-1'
		);
		expect(mocks.logUpdateAsync).toHaveBeenCalledWith(
			supabase,
			CLEANUP_PROJECT_ID,
			'document',
			CLEANUP_DOCUMENT_ID,
			expect.objectContaining({ state_key: 'draft' }),
			expect.objectContaining({ state_key: 'archived' }),
			'user-1',
			'agent_call',
			'chat-1'
		);
		// One actor lookup serves every archive in the batch.
		expect(
			supabase.rpc.mock.calls.filter(([name]) => name === 'ensure_actor_for_user')
		).toHaveLength(1);
		expect(mocks.archiveTaskCanonical).toHaveBeenCalledWith({
			supabase,
			userId: 'user-1',
			actorId: 'actor-1',
			taskId: CLEANUP_TASK_ID,
			projectId: CLEANUP_PROJECT_ID,
			changeSource: 'agent_call',
			chatSessionId: 'chat-1'
		});
		expect(mocks.runGatewayWriteOp).toHaveBeenCalledTimes(1);
		expect(mocks.runGatewayWriteOp).toHaveBeenCalledWith({
			admin: supabase,
			userId: 'user-1',
			scope: {
				mode: 'read_write',
				allowed_ops: ['onto.project.update'],
				project_ids: [CLEANUP_PROJECT_ID],
				write_project_ids: [CLEANUP_PROJECT_ID]
			},
			op: 'onto.project.update',
			args: {
				description: 'Consulting for Maryland creators.',
				project_id: CLEANUP_PROJECT_ID
			},
			chatSessionId: 'chat-1'
		});
	});

	it('defaults a document archive to archive_children', async () => {
		const { supabase } = archiveReplaySupabase(cleanupDocumentRow);
		await replayLoopOperations({
			supabase,
			userId: 'user-1',
			chatSessionId: null,
			projectId: CLEANUP_PROJECT_ID,
			operations: [
				{
					tool: 'archive_onto_document',
					args: { project_id: CLEANUP_PROJECT_ID, document_id: CLEANUP_DOCUMENT_ID }
				}
			],
			operationId: 'project_suggestion:cleanup-2'
		});
		expect(mocks.archiveDocumentInTree).toHaveBeenCalledWith(
			supabase,
			CLEANUP_PROJECT_ID,
			CLEANUP_DOCUMENT_ID,
			expect.objectContaining({ mode: 'archive_children' }),
			'actor-1'
		);
	});

	it('keeps per-operation outcomes aligned when one archive fails', async () => {
		mocks.archiveDocumentInTree.mockRejectedValueOnce(
			new Error('Failed to archive document: document_archive_access_denied')
		);
		const { supabase } = archiveReplaySupabase(cleanupDocumentRow);
		const replay = await replayLoopOperations({
			supabase,
			userId: 'user-1',
			chatSessionId: null,
			projectId: CLEANUP_PROJECT_ID,
			operations: [
				{
					tool: 'archive_onto_document',
					args: { project_id: CLEANUP_PROJECT_ID, document_id: CLEANUP_DOCUMENT_ID }
				},
				{
					tool: 'archive_onto_task',
					args: { project_id: CLEANUP_PROJECT_ID, task_id: CLEANUP_TASK_ID }
				}
			],
			operationId: 'project_suggestion:cleanup-3'
		});
		expect(replay).toEqual({
			appliedCount: 1,
			errors: [
				{
					tool: 'archive_onto_document',
					error: 'You do not have write access to this project.'
				}
			],
			outcomes: [false, true]
		});
		expect(mocks.logUpdateAsync).not.toHaveBeenCalled();
	});

	it('reports a task archive failure from the canonical helper', async () => {
		mocks.archiveTaskCanonical.mockResolvedValueOnce({
			ok: false,
			status: 404,
			error: 'Task not found in this project.'
		});
		const { supabase } = archiveReplaySupabase(null);
		const replay = await replayLoopOperations({
			supabase,
			userId: 'user-1',
			chatSessionId: null,
			projectId: CLEANUP_PROJECT_ID,
			operations: [
				{
					tool: 'archive_onto_task',
					args: { project_id: CLEANUP_PROJECT_ID, task_id: CLEANUP_TASK_ID }
				}
			],
			operationId: 'project_suggestion:cleanup-4'
		});
		expect(replay).toEqual({
			appliedCount: 0,
			errors: [{ tool: 'archive_onto_task', error: 'Task not found in this project.' }],
			outcomes: [false]
		});
	});

	it('does not archive a document outside the fenced project', async () => {
		const { supabase } = archiveReplaySupabase({
			...cleanupDocumentRow,
			project_id: '99999999-9999-4999-8999-999999999999'
		});
		const replay = await replayLoopOperations({
			supabase,
			userId: 'user-1',
			chatSessionId: null,
			projectId: CLEANUP_PROJECT_ID,
			operations: [
				{
					tool: 'archive_onto_document',
					args: { project_id: CLEANUP_PROJECT_ID, document_id: CLEANUP_DOCUMENT_ID }
				}
			],
			operationId: 'project_suggestion:cleanup-5'
		});
		expect(mocks.archiveDocumentInTree).not.toHaveBeenCalled();
		expect(replay.outcomes).toEqual([false]);
		expect(replay.errors[0]?.error).toBe('Document not found in this project.');
	});

	it.each([
		[
			'an unknown children mode',
			{
				tool: 'archive_onto_document',
				args: {
					project_id: CLEANUP_PROJECT_ID,
					document_id: CLEANUP_DOCUMENT_ID,
					children: 'unlink_children'
				}
			}
		],
		[
			'a non-UUID document id',
			{
				tool: 'archive_onto_document',
				args: { project_id: CLEANUP_PROJECT_ID, document_id: 'Rod folder' }
			}
		],
		[
			'a missing task id',
			{ tool: 'archive_onto_task', args: { project_id: CLEANUP_PROJECT_ID } }
		],
		[
			'another project',
			{
				tool: 'archive_onto_task',
				args: {
					project_id: '99999999-9999-4999-8999-999999999999',
					task_id: CLEANUP_TASK_ID
				}
			}
		]
	])('refuses the whole batch before any write for %s', async (_label, bad) => {
		const replay = await replayLoopOperations({
			supabase: { from: vi.fn(), rpc: vi.fn() },
			userId: 'user-1',
			chatSessionId: null,
			projectId: CLEANUP_PROJECT_ID,
			operations: [
				{
					tool: 'update_onto_project',
					args: { project_id: CLEANUP_PROJECT_ID, name: 'Wayne Strategies MD' }
				},
				bad
			],
			operationId: 'project_suggestion:cleanup-6'
		});
		expect(replay.appliedCount).toBe(0);
		expect(replay.outcomes).toEqual([false, false]);
		expect(mocks.runGatewayWriteOp).not.toHaveBeenCalled();
		expect(mocks.archiveDocumentInTree).not.toHaveBeenCalled();
		expect(mocks.archiveTaskCanonical).not.toHaveBeenCalled();
	});
});

describe('decideProjectSuggestion with the fingerprint the user was shown', () => {
	const operation = {
		tool: 'archive_onto_task',
		args: { project_id: 'project-1', task_id: CLEANUP_TASK_ID },
		label: 'Archive Build referral pipeline'
	};
	let adminFrom: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.clearAllMocks();
		adminFrom = vi.fn(function () {
			const builder: any = {
				select: vi.fn(() => builder),
				eq: vi.fn(() => builder),
				maybeSingle: vi.fn(async () => ({ data: null, error: null }))
			};
			return builder;
		});
		mocks.createAdminSupabaseClient.mockReturnValue({ from: adminFrom });
		mocks.syncInboxItemForProjectSuggestion.mockResolvedValue(undefined);
		mocks.quarantineProjectSuggestionInboxItem.mockResolvedValue(undefined);
		mocks.archiveTaskCanonical.mockResolvedValue({
			ok: true,
			archivedAt: '2026-09-29T10:00:00.000Z'
		});
		mocks.verifyProjectSuggestionIntegrity.mockResolvedValue({
			ok: true,
			summary: {
				headline: 'Archive task "Build referral pipeline".',
				operation_count: 1,
				operations: [],
				structural_fingerprint: 'shown-fingerprint',
				verified_at: '2026-09-29T09:00:00.000Z'
			}
		});
	});

	it('verifies against the shown fingerprint instead of the inbox row, then applies', async () => {
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

		const outcome = await decideProjectSuggestion({
			supabase,
			userId: 'user-1',
			projectId: 'project-1',
			suggestionId: 'suggestion-1',
			action: 'approve',
			expectedStructuralFingerprint: 'shown-fingerprint'
		});

		expect(outcome).toMatchObject({ ok: true, result: { ok: true, applied_operations: 1 } });
		expect(mocks.verifyProjectSuggestionIntegrity).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				expectedStructuralFingerprint: 'shown-fingerprint',
				checkModelAlignment: false
			})
		);
		// The inbox row's stored fingerprint is not consulted.
		expect(adminFrom).not.toHaveBeenCalledWith('inbox_items');
		// A verified fingerprint replaces the coarse project freshness guard.
		expect(mocks.isProjectSuggestionFresh).not.toHaveBeenCalled();
		expect(mocks.archiveTaskCanonical).toHaveBeenCalledWith(
			expect.objectContaining({ taskId: CLEANUP_TASK_ID, projectId: 'project-1' })
		);
		expect(updates.map((update) => update.payload.status)).toEqual(['approved', 'applied']);
	});

	it('keeps a stale card item open for re-review instead of quarantining it', async () => {
		mocks.verifyProjectSuggestionIntegrity.mockResolvedValueOnce({
			ok: false,
			diagnostic: {
				code: 'EXPECTED_STATE_CHANGED',
				message:
					'The proposal structure or resolved entity state changed after verification'
			}
		});
		const { supabase, updates } = makeSupabase({
			project_suggestions: [
				{ data: pendingSuggestion({ operations: [operation] }), error: null }
			]
		});

		const outcome = await decideProjectSuggestion({
			supabase,
			userId: 'user-1',
			projectId: 'project-1',
			suggestionId: 'suggestion-1',
			action: 'approve',
			expectedStructuralFingerprint: 'stale-fingerprint'
		});

		expect(outcome).toMatchObject({
			ok: false,
			status: 409,
			code: 'EXPECTED_STATE_CHANGED',
			message: expect.stringContaining('updated after you opened it')
		});
		expect(mocks.quarantineProjectSuggestionInboxItem).not.toHaveBeenCalled();
		expect(mocks.archiveTaskCanonical).not.toHaveBeenCalled();
		expect(updates).toHaveLength(0);
	});

	it('still quarantines other integrity failures and reports their code', async () => {
		mocks.verifyProjectSuggestionIntegrity.mockResolvedValueOnce({
			ok: false,
			diagnostic: { code: 'ENTITY_NOT_FOUND', message: 'task no longer exists' }
		});
		const { supabase } = makeSupabase({
			project_suggestions: [
				{ data: pendingSuggestion({ operations: [operation] }), error: null }
			]
		});

		const outcome = await decideProjectSuggestion({
			supabase,
			userId: 'user-1',
			projectId: 'project-1',
			suggestionId: 'suggestion-1',
			action: 'approve',
			expectedStructuralFingerprint: 'shown-fingerprint'
		});

		expect(outcome).toMatchObject({ ok: false, status: 409, code: 'ENTITY_NOT_FOUND' });
		expect(mocks.quarantineProjectSuggestionInboxItem).toHaveBeenCalledTimes(1);
	});

	it('falls back to the inbox row fingerprint when none is sent', async () => {
		mocks.isProjectSuggestionFresh.mockResolvedValue(true);
		const { supabase } = makeSupabase({
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
			project_loop_runs: [{ data: { chat_session_id: null }, error: null }]
		});

		await decideProjectSuggestion({
			supabase,
			userId: 'user-1',
			projectId: 'project-1',
			suggestionId: 'suggestion-1',
			action: 'approve',
			expectedStructuralFingerprint: '   '
		});

		expect(adminFrom).toHaveBeenCalledWith('inbox_items');
		expect(mocks.verifyProjectSuggestionIntegrity).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				expectedStructuralFingerprint: null,
				checkModelAlignment: true
			})
		);
		expect(mocks.isProjectSuggestionFresh).toHaveBeenCalled();
	});
});
