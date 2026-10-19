// apps/web/src/lib/server/agent-call/change-set-commit.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
	commitChangeSet,
	recoverStalledCommit
} from '../../../../../../packages/shared-agent-ops/src/gateway/change-set';
import type { ChangeSet, ProposedChange } from '@buildos/shared-types';
import { insertGatewayEntity } from '../../../../../../packages/shared-agent-ops/src/gateway/op-execution-gateway.create-idempotency';

const gatewayMocks = vi.hoisted(() => ({
	runGatewayWriteOp: vi.fn()
}));

const inboxMocks = vi.hoisted(() => ({
	syncInboxItemForAgentRun: vi.fn()
}));

vi.mock('@buildos/shared-agent-ops/gateway/op-execution-gateway', async () => {
	const actual = await vi.importActual<
		typeof import('@buildos/shared-agent-ops/gateway/op-execution-gateway')
	>('@buildos/shared-agent-ops/gateway/op-execution-gateway');
	return {
		...actual,
		runGatewayWriteOp: gatewayMocks.runGatewayWriteOp
	};
});

vi.mock('@buildos/shared-agent-ops/inbox-index', () => ({
	syncInboxItemForAgentRun: inboxMocks.syncInboxItemForAgentRun
}));

type QueryResult = { data: unknown; error: null | { message: string } };

function createSupabaseMock(
	results: Record<string, QueryResult[]>,
	// Result returned when a query builder is awaited directly (no maybeSingle/single),
	// e.g. the D9b re-entry load of prior applied executions and the per-change
	// heartbeat / final update. Reads chain.data / chain.error, matching how the
	// production code destructures `await admin.from(...)...`.
	directData: Record<string, QueryResult> = {},
	insertResults: QueryResult[] = []
) {
	const updates: Array<{ table: string; payload: Record<string, unknown> }> = [];
	const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];

	return {
		updates,
		inserts,
		client: {
			from: vi.fn((table: string) => {
				const direct = directData[table];
				let selectedColumns: string | undefined;
				const chain = {
					data: direct?.data ?? null,
					error: direct?.error ?? null,
					select: vi.fn((columns?: string) => {
						selectedColumns = columns;
						return chain;
					}),
					update: vi.fn((payload: Record<string, unknown>) => {
						updates.push({ table, payload });
						return chain;
					}),
					insert: vi.fn(async (payload: Record<string, unknown>) => {
						inserts.push({ table, payload });
						return insertResults.shift() ?? { data: null, error: null };
					}),
					eq: vi.fn(() => chain),
					is: vi.fn(() => chain),
					in: vi.fn(() => chain),
					maybeSingle: vi.fn(async () => {
						const next = results[table]?.shift();
						if (
							!next ||
							!next.data ||
							typeof next.data !== 'object' ||
							!selectedColumns
						) {
							return next ?? { data: null, error: null };
						}
						const projected = Object.fromEntries(
							selectedColumns
								.split(',')
								.map((column) => column.trim())
								.filter((column) => column && column !== '*')
								.map((column) => [
									column,
									(next.data as Record<string, unknown>)[column]
								])
						);
						return selectedColumns.trim() === '*' ? next : { ...next, data: projected };
					}),
					single: vi.fn(async () => {
						const next = results[table]?.shift();
						return next ?? { data: null, error: null };
					})
				};
				return chain;
			})
		}
	};
}

function startHereContent(statusText: string, authoredText: string): string {
	return [
		'# START HERE - Example',
		'',
		'<!-- managed:status v=1 -->',
		statusText,
		'<!-- /managed:status -->',
		'',
		'## What this is',
		authoredText,
		'',
		'<!-- managed:map v=1 -->',
		'## Where the detail lives',
		'- Generated map',
		'<!-- /managed:map -->'
	].join('\n');
}

describe('commitChangeSet', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		inboxMocks.syncInboxItemForAgentRun.mockResolvedValue(null);
		gatewayMocks.runGatewayWriteOp.mockResolvedValue({
			ok: true,
			entityId: 'document-1',
			entityKind: 'document',
			entityProjectId: 'project-1',
			entityTitle: 'START HERE - Example',
			data: { ok: true }
		});
	});

	it('does not treat Start Here managed-region refreshes as stale authored edits', async () => {
		const beforeContent = startHereContent(
			'**Now:** 1 open task',
			'Same authored project orientation.'
		);
		const currentContent = startHereContent(
			'**Now:** 2 open tasks',
			'Same authored project orientation.'
		);
		const beforeSnapshot = {
			id: 'document-1',
			project_id: 'project-1',
			title: 'START HERE - Example',
			description: null,
			type_key: 'document.context.project',
			state_key: 'ready',
			content: beforeContent,
			props: { origin: 'external_agent', body_markdown: beforeContent },
			children: { children: [] },
			created_by: 'user-1',
			created_at: '2026-06-28T19:00:00.000Z',
			updated_at: '2026-06-28T19:07:56.593Z',
			archived_at: null,
			deleted_at: null
		};
		const currentSnapshot = {
			...beforeSnapshot,
			content: currentContent,
			props: { origin: 'external_agent', body_markdown: currentContent },
			updated_at: '2026-06-28T20:26:26.421Z'
		};
		const change: ProposedChange = {
			id: 'change-1',
			op: 'onto.document.update',
			entity_type: 'document',
			entity_id: 'document-1',
			action: 'update',
			before: beforeSnapshot,
			after: {
				document_id: 'document-1',
				content: startHereContent(
					'**Now:** generated elsewhere',
					'Updated authored orientation.'
				),
				update_strategy: 'replace'
			},
			rationale: 'Update Start Here authored orientation',
			decision: 'pending'
		};
		const changeSet: ChangeSet = {
			run_id: 'run-1',
			status: 'pending',
			changes: [change],
			created_at: '2026-06-28T20:20:00.000Z'
		};
		const run = {
			id: 'run-1',
			user_id: 'user-1',
			status: 'proposal_ready',
			change_set: changeSet,
			allowed_ops: ['onto.document.update'],
			context_type: 'project',
			project_id: 'project-1',
			label: 'Update project START HERE',
			goal: 'Review proposed Start Here updates',
			result: { summary: 'Review proposed Start Here updates' }
		};
		const supabase = createSupabaseMock({
			agent_runs: [
				{ data: run, error: null },
				{ data: { id: 'run-1' }, error: null }
			],
			onto_documents: [{ data: currentSnapshot, error: null }]
		});

		const outcome = await commitChangeSet({
			admin: supabase.client as any,
			runId: 'run-1',
			userId: 'user-1',
			decisions: [{ change_id: 'change-1', decision: 'approved' }]
		});

		expect(outcome).toMatchObject({
			ok: true,
			result: {
				change_set_status: 'applied',
				run_status: 'completed',
				applied: 1,
				failed: 0
			}
		});
		expect(gatewayMocks.runGatewayWriteOp).toHaveBeenCalledWith(
			expect.objectContaining({
				op: 'onto.document.update',
				args: change.after
			})
		);
		expect(supabase.updates).toContainEqual(
			expect.objectContaining({
				table: 'agent_runs',
				payload: expect.objectContaining({
					status: 'completed'
				})
			})
		);
	});

	function buildStagedRun(overrides: Record<string, unknown> = {}) {
		const change: ProposedChange = {
			id: 'change-1',
			op: 'onto.document.update',
			entity_type: 'document',
			entity_id: 'document-1',
			action: 'update',
			after: { document_id: 'document-1', content: 'new' },
			rationale: 'Update doc',
			decision: 'pending'
		};
		const changeSet: ChangeSet = {
			run_id: 'run-1',
			status: 'pending',
			changes: [change],
			created_at: '2026-07-02T00:00:00.000Z'
		};
		return {
			id: 'run-1',
			user_id: 'user-1',
			status: 'running',
			change_set: changeSet,
			allowed_ops: ['onto.document.update'],
			context_type: 'project',
			project_id: 'project-1',
			label: 'Commit doc',
			goal: 'Commit',
			result: { summary: 'Commit' },
			...overrides
		};
	}

	it('re-enters a stalled commit and skips already-applied changes (no re-apply)', async () => {
		const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
		const run = buildStagedRun({ status: 'running', commit_started_at: tenMinutesAgo });
		const supabase = createSupabaseMock(
			{
				agent_runs: [
					{ data: run, error: null },
					// re-entry CAS claim wins
					{ data: { id: 'run-1' }, error: null }
				]
			},
			{
				// prior crashed attempt already applied change-1
				agent_tool_executions: {
					data: [
						{
							proposed_change_id: 'change-1',
							entity_id: 'document-1',
							entity_kind: 'document',
							success: true
						}
					],
					error: null
				}
			}
		);

		const outcome = await commitChangeSet({
			admin: supabase.client as any,
			runId: 'run-1',
			userId: 'user-1',
			decisions: [{ change_id: 'change-1', decision: 'approved' }]
		});

		expect(outcome).toMatchObject({
			ok: true,
			result: {
				change_set_status: 'applied',
				run_status: 'completed',
				applied: 1,
				failed: 0
			}
		});
		// The already-applied write is NOT re-run.
		expect(gatewayMocks.runGatewayWriteOp).not.toHaveBeenCalled();
		// The rebuilt EntityTouch is carried into the run result.
		expect((outcome as any).result.entities_touched).toContainEqual(
			expect.objectContaining({ type: 'document', id: 'document-1' })
		);
		// The claim compare-and-swaps commit_started_at (re-entry), not status.
		expect(supabase.updates).toContainEqual(
			expect.objectContaining({
				table: 'agent_runs',
				payload: expect.objectContaining({ commit_started_at: expect.any(String) })
			})
		);
	});

	it('rejects a concurrent commit while a fresh commit is still in-flight (double-commit guard)', async () => {
		const justNow = new Date().toISOString();
		const run = buildStagedRun({ status: 'running', commit_started_at: justNow });
		const supabase = createSupabaseMock({ agent_runs: [{ data: run, error: null }] });

		const outcome = await commitChangeSet({
			admin: supabase.client as any,
			runId: 'run-1',
			userId: 'user-1'
		});

		expect(outcome.ok).toBe(false);
		expect((outcome as any).error.code).toBe('CONFLICT');
		expect(gatewayMocks.runGatewayWriteOp).not.toHaveBeenCalled();
	});

	describe('recoverStalledCommit (sweep recovery of a dead web commit)', () => {
		const tenMinutesAgo = () => new Date(Date.now() - 10 * 60 * 1000).toISOString();

		function twoChangeRun() {
			const run = buildStagedRun({ commit_started_at: tenMinutesAgo() });
			const changeSet = run.change_set as ChangeSet;
			changeSet.changes.push({
				...changeSet.changes[0]!,
				id: 'change-2',
				entity_id: 'document-2',
				after: { document_id: 'document-2', content: 'new 2' }
			});
			return run;
		}

		it('returns a commit that applied nothing to review instead of failing it', async () => {
			const run = buildStagedRun({ commit_started_at: tenMinutesAgo() });
			const supabase = createSupabaseMock(
				{
					agent_runs: [
						{ data: run, error: null },
						{ data: { id: 'run-1' }, error: null }
					]
				},
				{ agent_tool_executions: { data: [], error: null } }
			);

			const outcome = await recoverStalledCommit({
				admin: supabase.client as any,
				runId: 'run-1'
			});

			expect(outcome).toEqual({ outcome: 'returned_to_review' });
			expect(supabase.updates).toEqual([
				{
					table: 'agent_runs',
					payload: { status: 'proposal_ready', commit_started_at: null }
				}
			]);
			expect(inboxMocks.syncInboxItemForAgentRun).toHaveBeenCalledWith(
				expect.objectContaining({ runId: 'run-1' })
			);
			expect(gatewayMocks.runGatewayWriteOp).not.toHaveBeenCalled();
		});

		it('records what landed when a commit died part-way, and marks the rest not applied', async () => {
			const supabase = createSupabaseMock(
				{
					agent_runs: [
						{ data: twoChangeRun(), error: null },
						{ data: { id: 'run-1' }, error: null }
					]
				},
				{
					agent_tool_executions: {
						data: [
							{
								proposed_change_id: 'change-1',
								entity_id: 'document-1',
								entity_kind: 'document'
							}
						],
						error: null
					}
				}
			);

			const outcome = await recoverStalledCommit({
				admin: supabase.client as any,
				runId: 'run-1'
			});

			expect(outcome).toEqual({
				outcome: 'finalized',
				runStatus: 'partial',
				applied: 1,
				notApplied: 1
			});
			const payload = supabase.updates[0]?.payload as Record<string, any>;
			expect(payload.status).toBe('partial');
			expect(payload.error).toBe(
				'commit interrupted: 1 of 2 change(s) applied before the approval stopped'
			);
			expect(payload.change_set.status).toBe('partially_applied');
			expect(payload.change_set.changes[0]).toMatchObject({
				id: 'change-1',
				decision: 'approved',
				applied_entity_id: 'document-1'
			});
			expect(payload.change_set.changes[1].error).toMatch(/^Not applied:/);
			expect(payload.result.entities_touched).toContainEqual(
				expect.objectContaining({ type: 'document', id: 'document-1' })
			);
			expect(gatewayMocks.runGatewayWriteOp).not.toHaveBeenCalled();
		});

		it('completes a commit whose every change landed before the terminal write', async () => {
			const supabase = createSupabaseMock(
				{
					agent_runs: [
						{
							data: buildStagedRun({ commit_started_at: tenMinutesAgo() }),
							error: null
						},
						{ data: { id: 'run-1' }, error: null }
					]
				},
				{
					agent_tool_executions: {
						data: [{ proposed_change_id: 'change-1', entity_id: 'document-1' }],
						error: null
					}
				}
			);

			const outcome = await recoverStalledCommit({
				admin: supabase.client as any,
				runId: 'run-1'
			});

			expect(outcome).toMatchObject({ outcome: 'finalized', runStatus: 'completed' });
			const payload = supabase.updates[0]?.payload as Record<string, any>;
			expect(payload).toMatchObject({ status: 'completed', error: null });
			expect(payload.change_set.status).toBe('applied');
		});

		it('leaves a commit that is still inside its heartbeat window alone', async () => {
			const supabase = createSupabaseMock({
				agent_runs: [
					{
						data: buildStagedRun({
							commit_started_at: new Date(Date.now() - 30_000).toISOString()
						}),
						error: null
					}
				]
			});

			const outcome = await recoverStalledCommit({
				admin: supabase.client as any,
				runId: 'run-1'
			});

			expect(outcome).toEqual({ outcome: 'skipped', reason: 'not_stalled' });
			expect(supabase.updates).toEqual([]);
		});

		it('yields to a D9b re-entry that re-claimed the run first', async () => {
			const supabase = createSupabaseMock(
				{
					agent_runs: [
						{
							data: buildStagedRun({ commit_started_at: tenMinutesAgo() }),
							error: null
						},
						// compare-and-swap on the stale commit_started_at matched no row
						{ data: null, error: null }
					]
				},
				{ agent_tool_executions: { data: [], error: null } }
			);

			const outcome = await recoverStalledCommit({
				admin: supabase.client as any,
				runId: 'run-1'
			});

			expect(outcome).toEqual({ outcome: 'skipped', reason: 'raced' });
			expect(inboxMocks.syncInboxItemForAgentRun).not.toHaveBeenCalled();
		});
	});

	it('does not re-enter a running run that never recorded commit_started_at', async () => {
		const run = buildStagedRun({ status: 'running', commit_started_at: null });
		const supabase = createSupabaseMock({ agent_runs: [{ data: run, error: null }] });

		const outcome = await commitChangeSet({
			admin: supabase.client as any,
			runId: 'run-1',
			userId: 'user-1'
		});

		expect(outcome.ok).toBe(false);
		expect((outcome as any).error.code).toBe('CONFLICT');
		expect(gatewayMocks.runGatewayWriteOp).not.toHaveBeenCalled();
	});
});

describe('approval crash safety', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		inboxMocks.syncInboxItemForAgentRun.mockResolvedValue(null);
		gatewayMocks.runGatewayWriteOp.mockResolvedValue({
			ok: true,
			entityId: 'doc-1',
			entityKind: 'document',
			data: { document: { id: 'doc-1' } }
		});
	});
	function run() {
		return {
			id: 'run-1',
			user_id: 'user-1',
			status: 'proposal_ready',
			allowed_ops: ['onto.document.create'],
			context_type: 'project',
			project_id: 'project-1',
			change_set: {
				run_id: 'run-1',
				status: 'pending',
				created_at: '2026-10-18',
				changes: [1, 2].map((i) => ({
					id: `change-${i}`,
					action: 'create',
					entity_type: 'document',
					op: 'onto.document.create',
					after: { project_id: 'project-1', title: `Doc ${i}` },
					decision: 'pending'
				}))
			}
		};
	}
	it('passes stable downstream keys on first apply and crash re-entry', async () => {
		const staged = run();
		const crashed = {
			...run(),
			status: 'running',
			commit_started_at: new Date(Date.now() - 600_000).toISOString()
		};
		const db = createSupabaseMock({
			agent_runs: [
				{ data: staged, error: null },
				{ data: { id: 'run-1' }, error: null },
				{ data: crashed, error: null },
				{ data: { id: 'run-1' }, error: null }
			]
		});
		await commitChangeSet({ admin: db.client as any, userId: 'user-1', runId: 'run-1' });
		await commitChangeSet({ admin: db.client as any, userId: 'user-1', runId: 'run-1' });
		expect(
			gatewayMocks.runGatewayWriteOp.mock.calls.map(([args]) => args.downstreamIdempotencyKey)
		).toEqual([
			'agent-run:run-1:change-1',
			'agent-run:run-1:change-2',
			'agent-run:run-1:change-1',
			'agent-run:run-1:change-2'
		]);
	});
	it.each([true, false])(
		'stops and leaves the run for recovery when receipt insert fails (write success=%s)',
		async (success) => {
			gatewayMocks.runGatewayWriteOp.mockResolvedValue(
				success
					? { ok: true, entityId: 'doc-1', entityKind: 'document' }
					: { ok: false, error: { message: 'Write failed' } }
			);
			const db = createSupabaseMock(
				{
					agent_runs: [
						{ data: run(), error: null },
						{ data: { id: 'run-1' }, error: null }
					]
				},
				{},
				[{ data: null, error: { message: 'Receipt unavailable' } }]
			);
			const outcome = await commitChangeSet({
				admin: db.client as any,
				userId: 'user-1',
				runId: 'run-1'
			});
			expect(outcome).toMatchObject({
				ok: false,
				error: { code: 'INTERNAL', message: expect.stringContaining('Receipt unavailable') }
			});
			expect(gatewayMocks.runGatewayWriteOp).toHaveBeenCalledTimes(1);
			expect(
				db.updates.some(
					({ payload }) => payload.status === 'completed' || payload.status === 'partial'
				)
			).toBe(false);
		}
	);

	it.each([
		['document', 'onto_documents', 'onto.document.create'],
		['goal', 'onto_goals', 'onto.goal.create'],
		['plan', 'onto_plans', 'onto.plan.create'],
		['milestone', 'onto_milestones', 'onto.milestone.create'],
		['risk', 'onto_risks', 'onto.risk.create'],
		['document', 'onto_documents', 'onto.task.docs.create_or_attach']
	] as const)(
		'recovers a landed %s in %s (%s) after its receipt fails, so only unrun work is re-proposed',
		async (kind, table, op) => {
			const staged = run();
			staged.allowed_ops = [op];
			for (const change of staged.change_set.changes) {
				change.op = op;
				change.entity_type = kind;
			}
			const landed: Array<Record<string, unknown>> = [];
			// Use the real insert path to generate durable IDs, rather than reproducing
			// the hash in this test. Recovery must find precisely those saved rows.
			gatewayMocks.runGatewayWriteOp.mockImplementation(async (args) => {
				const created = await insertGatewayEntity(
					{
						userId: args.userId,
						downstreamIdempotencyKey: args.downstreamIdempotencyKey,
						admin: {
							from: () => ({
								insert: (row: Record<string, unknown>) => ({
									select: () => ({
										single: async () => {
											landed.push(row);
											return { data: row, error: null };
										}
									})
								})
							})
						}
					} as any,
					table,
					{ ...args.args, created_by: 'actor-1' },
					'*'
				);
				return { ok: true, entityId: created.data!.id, entityKind: kind };
			});
			const crashed = {
				...structuredClone(staged),
				status: 'running',
				commit_started_at: '2026-10-18T12:00:00Z'
			};
			const db = createSupabaseMock(
				{
					agent_runs: [
						{ data: staged, error: null },
						{ data: { id: 'run-1' }, error: null },
						{ data: crashed, error: null },
						{ data: { id: 'run-1' }, error: null }
					]
				},
				{
					agent_tool_executions: { data: [], error: null },
					[table]: { data: landed, error: null }
				},
				[{ data: null, error: { message: 'Receipt unavailable once' } }]
			);
			const first = await commitChangeSet({
				admin: db.client as any,
				userId: 'user-1',
				runId: 'run-1'
			});
			expect(first).toMatchObject({ ok: false, error: { code: 'INTERNAL' } });
			expect(landed).toHaveLength(1);
			// Later human edits must survive recovery unchanged.
			landed[0]!.description = 'Human edit after the create';
			const recovered = await recoverStalledCommit({
				admin: db.client as any,
				runId: 'run-1',
				now: new Date('2026-10-18T12:10:00Z')
			});
			expect(recovered).toEqual({
				outcome: 'finalized',
				runStatus: 'partial',
				applied: 1,
				notApplied: 1
			});
			const final = db.updates.at(-1)!.payload;
			const changes = (final.change_set as ChangeSet).changes;
			expect(changes[0]).toMatchObject({
				decision: 'approved',
				applied_entity_id: landed[0]!.id
			});
			expect(changes[0]!.error).toBeUndefined();
			expect(changes[1]!.error).toMatch(/^Not applied:/);
			const completedDb = createSupabaseMock({
				agent_runs: [{ data: { ...crashed, ...final }, error: null }]
			});
			await commitChangeSet({
				admin: completedDb.client as any,
				userId: 'user-1',
				runId: 'run-1'
			});
			expect(gatewayMocks.runGatewayWriteOp).toHaveBeenCalledTimes(1);
			// A fresh proposal contains only the work recovery says did not run.
			const retry = run();
			retry.id = 'run-2';
			retry.allowed_ops = staged.allowed_ops;
			retry.change_set = {
				...retry.change_set,
				run_id: 'run-2',
				changes: changes
					.filter((c) => c.error)
					.map((c) => ({
						...c,
						id: 'retry-change',
						decision: 'pending',
						error: undefined
					})) as any
			};
			const retryDb = createSupabaseMock({
				agent_runs: [
					{ data: retry, error: null },
					{ data: { id: 'run-2' }, error: null }
				]
			});
			expect(
				await commitChangeSet({
					admin: retryDb.client as any,
					userId: 'user-1',
					runId: 'run-2'
				})
			).toMatchObject({ ok: true });
			expect(landed.map((row) => row.title)).toEqual(['Doc 1', 'Doc 2']);
			expect(landed[0]!.description).toBe('Human edit after the create');
		}
	);

	it('does not finalize recovery when the durable create lookup fails', async () => {
		const db = createSupabaseMock(
			{
				agent_runs: [
					{
						data: {
							...run(),
							status: 'running',
							commit_started_at: '2026-10-18T12:00:00Z'
						},
						error: null
					},
					{ data: { id: 'run-1' }, error: null }
				]
			},
			{
				agent_tool_executions: { data: [], error: null },
				onto_documents: { data: null, error: { message: 'Read unavailable' } }
			}
		);
		await expect(
			recoverStalledCommit({
				admin: db.client as any,
				runId: 'run-1',
				now: new Date('2026-10-18T12:10:00Z')
			})
		).rejects.toThrow('Read unavailable');
		expect(db.updates).toEqual([]);
	});

	it('recovers a task by its persisted key alongside a successful receipt', async () => {
		const staged = run();
		staged.change_set.changes[0]!.op = 'onto.task.create';
		staged.change_set.changes[0]!.entity_type = 'task';
		const db = createSupabaseMock(
			{
				agent_runs: [
					{
						data: {
							...staged,
							status: 'running',
							commit_started_at: '2026-10-18T12:00:00Z'
						},
						error: null
					},
					{ data: { id: 'run-1' }, error: null }
				]
			},
			{
				agent_tool_executions: {
					data: [
						{
							proposed_change_id: 'change-2',
							entity_id: 'doc-2',
							entity_kind: 'document'
						}
					],
					error: null
				},
				onto_tasks: {
					data: [{ id: 'task-1', idempotency_key: 'agent-run:run-1:change-1' }],
					error: null
				}
			}
		);
		expect(
			await recoverStalledCommit({
				admin: db.client as any,
				runId: 'run-1',
				now: new Date('2026-10-18T12:10:00Z')
			})
		).toEqual({ outcome: 'finalized', runStatus: 'completed', applied: 2, notApplied: 0 });
		expect((db.updates[0]!.payload.change_set as ChangeSet).changes[0]).toMatchObject({
			decision: 'approved',
			applied_entity_id: 'task-1'
		});
	});
});

describe('sequential approved updates', () => {
	const before = {
		id: 'task-1',
		project_id: 'project-1',
		title: 'Original',
		state_key: 'todo',
		props: { agent: 'old', human: 'old' },
		updated_at: 'old',
		archived_at: null
	};
	function change(id: string, after: Record<string, unknown>): ProposedChange {
		return {
			id,
			op: 'onto.task.update',
			entity_type: 'task',
			entity_id: 'task-1',
			action: 'update',
			before: { ...before },
			after: { task_id: 'task-1', ...after },
			rationale: 'Review',
			decision: 'pending'
		};
	}
	function fixture(
		changes: ProposedChange[],
		rows: Record<string, unknown>[],
		prior?: Record<string, unknown>
	) {
		const run = {
			id: 'run-1',
			user_id: 'user-1',
			status: prior ? 'running' : 'proposal_ready',
			commit_started_at: new Date(Date.now() - 600_000).toISOString(),
			allowed_ops: ['onto.task.update'],
			context_type: 'project',
			project_id: 'project-1',
			change_set: { run_id: 'run-1', status: 'pending', created_at: '2026-10-18', changes }
		};
		return createSupabaseMock(
			{
				agent_runs: [
					{ data: run, error: null },
					{ data: { id: 'run-1' }, error: null }
				],
				onto_tasks: rows.map((data) => ({ data, error: null }))
			},
			prior ? { agent_tool_executions: { data: [prior], error: null } } : {}
		);
	}
	beforeEach(() => {
		vi.clearAllMocks();
		inboxMocks.syncInboxItemForAgentRun.mockResolvedValue(null);
	});
	it('uses the saved row for a later edit to the same field', async () => {
		const changes = [
			change('first', { title: 'First' }),
			change('second', { title: 'Second' })
		];
		const post = { ...before, title: 'First', updated_at: 'new' };
		gatewayMocks.runGatewayWriteOp.mockResolvedValue({
			ok: true,
			entityId: 'task-1',
			entityKind: 'task',
			data: { task: post }
		});
		const db = fixture(changes, [before, post]);
		const result = await commitChangeSet({
			admin: db.client as any,
			userId: 'user-1',
			runId: 'run-1'
		});
		expect(result).toMatchObject({ ok: true, result: { applied: 2, failed: 0 } });
	});
	it('tracks only the written props keys and still rejects unrelated scalar drift', async () => {
		const changes = [
			change('first', { props: { agent: 'first' } }),
			change('second', { props: { agent: 'second' } }),
			change('third', { state_key: 'done' })
		];
		const post = {
			...before,
			state_key: 'blocked',
			props: { agent: 'first', human: 'concurrent' }
		};
		gatewayMocks.runGatewayWriteOp.mockResolvedValue({
			ok: true,
			entityId: 'task-1',
			entityKind: 'task',
			data: { task: post }
		});
		const db = fixture(changes, [before, post, post]);
		const result = await commitChangeSet({
			admin: db.client as any,
			userId: 'user-1',
			runId: 'run-1'
		});
		expect(result).toMatchObject({ ok: true, result: { applied: 2, failed: 1 } });
		expect(gatewayMocks.runGatewayWriteOp).toHaveBeenCalledTimes(2);
	});
	it.each([{ goal_id: 'goal-1' }, { archived: true }])(
		'treats an update without row-column writes as an empty compare: %j',
		async (after) => {
			const db = fixture(
				[change('first', after)],
				[{ ...before, title: 'Human edit', props: { human: 'changed' } }]
			);
			gatewayMocks.runGatewayWriteOp.mockResolvedValue({
				ok: true,
				entityId: 'task-1',
				entityKind: 'task',
				data: { task: before }
			});
			expect(
				await commitChangeSet({ admin: db.client as any, userId: 'user-1', runId: 'run-1' })
			).toMatchObject({ ok: true, result: { applied: 1, failed: 0 } });
		}
	);
	it('counts a prior applied change as approved even if re-entry rejects it', async () => {
		const db = fixture([change('first', { title: 'First' })], [], {
			proposed_change_id: 'first',
			entity_id: 'task-1',
			entity_kind: 'task',
			result: { task: { ...before, title: 'First' } }
		});
		const result = await commitChangeSet({
			admin: db.client as any,
			userId: 'user-1',
			runId: 'run-1',
			decisions: [{ change_id: 'first', decision: 'rejected' }]
		});
		expect(result).toMatchObject({
			ok: true,
			result: { applied: 1, rejected: 0, change_set: { changes: [{ decision: 'approved' }] } }
		});
		expect(gatewayMocks.runGatewayWriteOp).not.toHaveBeenCalled();
	});
	it('restores the post-apply baseline from receipts on re-entry', async () => {
		const post = { ...before, title: 'First' };
		const db = fixture(
			[change('first', { title: 'First' }), change('second', { title: 'Second' })],
			[post],
			{
				proposed_change_id: 'first',
				entity_id: 'task-1',
				entity_kind: 'task',
				result: { task: post }
			}
		);
		gatewayMocks.runGatewayWriteOp.mockResolvedValue({
			ok: true,
			entityId: 'task-1',
			entityKind: 'task',
			data: { task: { ...post, title: 'Second' } }
		});
		expect(
			await commitChangeSet({ admin: db.client as any, userId: 'user-1', runId: 'run-1' })
		).toMatchObject({ ok: true, result: { applied: 2, failed: 0 } });
	});
});
