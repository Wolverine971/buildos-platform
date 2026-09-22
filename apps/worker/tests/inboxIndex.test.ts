// apps/worker/tests/inboxIndex.test.ts
import { describe, expect, it } from 'vitest';
import {
	mapAgentRunToInboxItem,
	mapCalendarSuggestionToInboxItem,
	mapProjectAuditToInboxItem,
	mapProjectReviewToInboxItem,
	mapProjectSuggestionToInboxItem,
	expireInboxItemsForProject,
	expireInboxItemsForProjectAuditChildSuggestions,
	expireProjectSuggestionInboxItemsForManagerBrief,
	FRESHNESS_RETIRED_SOURCE_STATUS,
	markInboxItemFreshness,
	restoreFreshnessRetiredInboxSource,
	retireInboxSourceForFreshness,
	syncInboxItemForAgentRun,
	syncInboxItemForProjectAudit,
	syncInboxItemForProjectReview,
	syncInboxItemForProjectSuggestion
} from '../../../packages/shared-agent-ops/src/inbox-index';

type Row = Record<string, any>;

const recentSourceTimestamp = () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

function createSupabaseMock(tables: Record<string, Row[]>) {
	const upserts: Row[] = [];
	const updates: Row[] = [];
	const supabase = {
		from(table: string) {
			const filters: Array<[string, unknown]> = [];
			const inFilters: Array<[string, unknown[]]> = [];
			const notInFilters: Array<[string, unknown[]]> = [];
			let upsertPayload: Row | null = null;
			let updatePayload: Row | null = null;
			const matches = (candidate: Row) =>
				filters.every(([field, value]) => candidate[field] === value) &&
				inFilters.every(([field, values]) => values.includes(candidate[field])) &&
				notInFilters.every(([field, values]) => !values.includes(candidate[field]));
			const builder = {
				select() {
					return builder;
				},
				limit() {
					return builder;
				},
				not(field: string, operator: string, value: string) {
					if (operator !== 'in') throw new Error(`Unsupported not operator ${operator}`);
					notInFilters.push([field, value.replace(/^\(|\)$/g, '').split(',')]);
					return builder;
				},
				eq(field: string, value: unknown) {
					filters.push([field, value]);
					return builder;
				},
				in(field: string, values: unknown[]) {
					inFilters.push([field, values]);
					return builder;
				},
				upsert(payload: Row) {
					upsertPayload = payload;
					return builder;
				},
				update(payload: Row) {
					updatePayload = payload;
					return builder;
				},
				async maybeSingle() {
					if (updatePayload) {
						const row = (tables[table] ?? []).find(matches);
						if (row) Object.assign(row, updatePayload);
						if (row) updates.push({ table, ...updatePayload });
						return { data: row ?? null, error: null };
					}
					const row = (tables[table] ?? []).find(matches);
					return { data: row ?? null, error: null };
				},
				async single() {
					if (!upsertPayload) return { data: null, error: new Error('Missing upsert') };
					upserts.push(upsertPayload);
					return { data: { id: 'inbox-1', ...upsertPayload }, error: null };
				},
				then(resolve: (value: { data: Row[]; error: null }) => unknown) {
					let rows = (tables[table] ?? []).filter(matches);
					if (updatePayload) {
						rows = rows.map((row) => {
							Object.assign(row, updatePayload);
							updates.push({ table, ...updatePayload });
							return row;
						});
					}
					return Promise.resolve(resolve({ data: rows, error: null }));
				}
			};
			return builder;
		}
	};

	return { supabase, upserts, updates };
}

describe('inbox index mappers', () => {
	it('sets a 7-day expiry on pending project suggestions (tasker/28 WP-3)', () => {
		const row = mapProjectSuggestionToInboxItem({
			id: 'suggestion-1',
			project_id: 'project-1',
			status: 'pending',
			title: 'Review task overlap',
			created_at: '2026-07-01T12:00:00.000Z'
		});

		expect(row).toMatchObject({
			status: 'pending',
			expires_at: '2026-07-08T12:00:00.000Z'
		});
	});

	it('extends the review window from updated_at when a loop run re-confirms a finding', () => {
		const row = mapProjectSuggestionToInboxItem({
			id: 'suggestion-1',
			project_id: 'project-1',
			status: 'pending',
			title: 'Review task overlap',
			created_at: '2026-07-01T12:00:00.000Z',
			updated_at: '2026-07-05T12:00:00.000Z'
		});

		expect(row).toMatchObject({
			status: 'pending',
			expires_at: '2026-07-12T12:00:00.000Z'
		});
	});

	it('gives audit recommendations the 14-day audit window, not the light-loop one', () => {
		const row = mapProjectSuggestionToInboxItem({
			id: 'suggestion-1',
			project_id: 'project-1',
			kind: 'audit_recommendation',
			status: 'pending',
			title: 'Decide the next milestone',
			created_at: '2026-07-01T12:00:00.000Z'
		});

		expect(row).toMatchObject({
			status: 'pending',
			expires_at: '2026-07-15T12:00:00.000Z'
		});
	});

	it('sets per-source expiries on deciding source rows (tasker/28 WP-3)', () => {
		const agentRun = mapAgentRunToInboxItem({
			id: 'agent-run-1',
			user_id: 'user-1',
			status: 'running',
			label: 'Apply proposal',
			change_set: {
				status: 'pending',
				changes: [{ id: 'change-1' }]
			},
			created_at: '2026-07-01T12:00:00.000Z'
		});
		const calendarSuggestion = mapCalendarSuggestionToInboxItem({
			id: 'calendar-1',
			user_id: 'user-1',
			status: 'processing',
			suggested_name: 'Launch planning',
			created_at: '2026-07-01T12:00:00.000Z'
		});

		expect(agentRun).toMatchObject({
			status: 'deciding',
			expires_at: '2026-07-15T12:00:00.000Z'
		});
		expect(calendarSuggestion).toMatchObject({
			status: 'deciding',
			expires_at: '2026-07-08T12:00:00.000Z'
		});
	});

	it('expires a superseded agent-run proposal instead of blocking it (tasker/93)', () => {
		const run = {
			id: 'agent-run-old',
			user_id: 'user-1',
			label: 'Update project START HERE',
			change_set: { status: 'pending', changes: [{ id: 'change-1' }] },
			created_at: '2026-09-20T12:00:00.000Z',
			completed_at: '2026-09-22T12:00:00.000Z'
		};
		expect(
			mapAgentRunToInboxItem({
				...run,
				status: 'cancelled',
				error: 'superseded: replaced by newer Start Here proposal agent-run-new'
			})
		).toMatchObject({
			status: 'expired',
			blocked_reason: 'Replaced by a newer proposal',
			decided_at: '2026-09-22T12:00:00.000Z',
			expires_at: null
		});
		expect(
			mapAgentRunToInboxItem({ ...run, status: 'cancelled', error: 'User cancelled' })
		).toMatchObject({ status: 'blocked', blocked_reason: 'User cancelled' });
	});

	it('expires a calendar suggestion when its event window has passed (48h grace)', () => {
		const row = mapCalendarSuggestionToInboxItem({
			id: 'calendar-1',
			user_id: 'user-1',
			status: 'pending',
			suggested_name: 'Launch planning',
			created_at: '2026-07-01T12:00:00.000Z',
			event_patterns: {
				start_date: '2026-07-01',
				end_date: '2026-07-02'
			}
		});

		// Event window end (7/02 UTC midnight) + 48h beats the 7d TTL.
		expect(row).toMatchObject({
			status: 'pending',
			expires_at: '2026-07-04T00:00:00.000Z'
		});
	});

	it('keeps the TTL expiry when the event window extends beyond it', () => {
		const row = mapCalendarSuggestionToInboxItem({
			id: 'calendar-1',
			user_id: 'user-1',
			status: 'pending',
			suggested_name: 'Conference series',
			created_at: '2026-07-01T12:00:00.000Z',
			event_patterns: {
				start_date: '2026-07-01',
				end_date: '2026-09-30'
			}
		});

		expect(row).toMatchObject({
			status: 'pending',
			expires_at: '2026-07-08T12:00:00.000Z'
		});
	});

	it('falls back to the TTL when a calendar suggestion has no event dates', () => {
		const row = mapCalendarSuggestionToInboxItem({
			id: 'calendar-1',
			user_id: 'user-1',
			status: 'pending',
			suggested_name: 'Untimed suggestion',
			created_at: '2026-07-01T12:00:00.000Z',
			event_patterns: { tags: ['work'] }
		});

		expect(row).toMatchObject({
			status: 'pending',
			expires_at: '2026-07-08T12:00:00.000Z'
		});
	});

	it('clears expiry when the source is terminal', () => {
		const row = mapProjectSuggestionToInboxItem({
			id: 'suggestion-1',
			project_id: 'project-1',
			status: 'rejected',
			title: 'Dismissed review item',
			created_at: '2026-07-01T12:00:00.000Z',
			decided_at: '2026-07-02T12:00:00.000Z'
		});

		expect(row).toMatchObject({
			status: 'decided',
			expires_at: null
		});
	});

	it('maps a ready audit into one parent manager packet', () => {
		expect(
			mapProjectAuditToInboxItem({
				id: 'audit-1',
				project_id: 'project-1',
				status: 'ready',
				summary: 'Two launch blockers need one owner decision.',
				recommendations: [
					{
						title: 'Choose the launch go/no-go owner',
						summary: 'I recommend assigning one owner before adding launch work.'
					}
				],
				unresolved_suggestion_count: 1,
				created_at: '2026-08-14T12:00:00.000Z'
			})
		).toMatchObject({
			source_type: 'project_audit',
			status: 'pending',
			title: 'Recommendation: Choose the launch go/no-go owner',
			expires_at: '2026-08-28T12:00:00.000Z'
		});
	});

	it('admits only decision-level project manager briefs', () => {
		const decision = mapProjectReviewToInboxItem({
			id: 'run-decision',
			project_id: 'project-1',
			user_id: 'user-1',
			status: 'waiting_review',
			created_at: '2026-07-01T12:00:00.000Z',
			brief: {
				version: 2,
				attention_level: 'decision',
				bottom_line: 'The launch plan and launch tasks disagree on timing.',
				recommendation: 'Keep the current launch date and park the later work.',
				decision: {
					recommended_suggestion_id: null
				}
			}
		});
		const minor = mapProjectReviewToInboxItem({
			id: 'run-minor',
			project_id: 'project-1',
			user_id: 'user-1',
			status: 'completed',
			brief: { version: 2, attention_level: 'minor' }
		});

		expect(decision).toMatchObject({
			source_type: 'project_review',
			status: 'pending',
			title: 'The launch plan and launch tasks disagree on timing.',
			action_kinds: ['discuss', 'snooze', 'dismiss']
		});
		expect(minor).toBeNull();
	});

	it('does not admit drift observations to the attention inbox', () => {
		const row = mapProjectSuggestionToInboxItem({
			id: 'finding-1',
			project_id: 'project-1',
			kind: 'drift',
			status: 'pending',
			title: 'Launch date drifted',
			operations: []
		});

		expect(row).toBeNull();
	});

	it('retires an existing unresolved drift inbox row during source sync', async () => {
		const { supabase, updates, upserts } = createSupabaseMock({
			project_suggestions: [
				{
					id: 'drift-1',
					project_id: 'project-1',
					kind: 'drift',
					status: 'pending',
					title: 'Observed scope drift',
					operations: []
				}
			],
			inbox_items: [
				{
					id: 'inbox-drift-1',
					source_type: 'project_suggestion',
					source_ref_id: 'drift-1',
					status: 'deferred'
				}
			]
		});

		const row = await syncInboxItemForProjectSuggestion({
			supabase: supabase as any,
			suggestionId: 'drift-1'
		});

		expect(row).toMatchObject({
			status: 'expired',
			source_status: 'observation_not_admitted'
		});
		expect(upserts).toHaveLength(0);
		expect(updates).toContainEqual(
			expect.objectContaining({
				table: 'inbox_items',
				status: 'expired',
				source_status: 'observation_not_admitted'
			})
		);
	});

	it('does not map a clean project audit into the inbox', () => {
		expect(
			mapProjectAuditToInboxItem({
				id: 'audit-clean',
				project_id: 'project-1',
				status: 'ready',
				summary: 'No immediate changes are recommended.',
				recommendations: [],
				generated_suggestion_count: 0,
				unresolved_suggestion_count: 0
			})
		).toBeNull();
	});

	it('does not map an audit before its recommendations are final', () => {
		expect(
			mapProjectAuditToInboxItem({
				id: 'audit-running',
				project_id: 'project-1',
				status: 'running',
				recommendations: [
					{
						title: 'Draft recommendation',
						summary: 'This should not surface before the audit is ready.'
					}
				]
			})
		).toBeNull();
	});

	it('maps a failed audit with partial recommendations as terminal, not blocked work', () => {
		const row = mapProjectAuditToInboxItem({
			id: 'audit-failed',
			project_id: 'project-1',
			status: 'failed',
			recommendations: [
				{
					title: 'Partial recommendation',
					summary: 'The audit failed before this could become an actionable proposal.'
				}
			]
		});

		expect(row).toMatchObject({
			status: 'decided',
			blocked_reason: null,
			expires_at: null
		});
	});

	it('writes an expired inbox row immediately when a pending source is past its review TTL', async () => {
		const { supabase, upserts } = createSupabaseMock({
			project_suggestions: [
				{
					id: 'suggestion-old',
					project_id: 'project-1',
					status: 'pending',
					title: 'Old review item',
					created_at: '2020-01-01T00:00:00.000Z'
				}
			],
			inbox_items: []
		});

		const row = await syncInboxItemForProjectSuggestion({
			supabase: supabase as any,
			suggestionId: 'suggestion-old'
		});

		expect(row).toMatchObject({
			status: 'expired',
			expires_at: '2020-01-08T00:00:00.000Z',
			blocked_reason: 'Review item expired',
			snoozed_until: null
		});
		expect(row?.decided_at).toEqual(expect.any(String));
		expect(upserts[0]).toMatchObject({
			status: 'expired',
			expires_at: '2020-01-08T00:00:00.000Z'
		});
	});

	it('syncs a ready audit as one parent packet', async () => {
		const { supabase, updates, upserts } = createSupabaseMock({
			project_audits: [
				{
					id: 'audit-1',
					project_id: 'project-1',
					status: 'ready',
					recommendations: [
						{
							title: 'Decide whether to defer launch',
							summary: 'Two launch blockers remain open.',
							role: 'decision_point'
						}
					],
					unresolved_suggestion_count: 1,
					created_at: recentSourceTimestamp()
				}
			],
			inbox_items: [
				{
					id: 'inbox-audit-1',
					source_type: 'project_audit',
					source_ref_id: 'audit-1',
					status: 'pending'
				}
			]
		});

		const row = await syncInboxItemForProjectAudit({
			supabase: supabase as any,
			auditId: 'audit-1'
		});

		expect(row).toMatchObject({
			status: 'pending',
			source_type: 'project_audit',
			source_status: 'ready'
		});
		expect(upserts).toHaveLength(1);
		expect(updates).toHaveLength(0);
	});

	it('syncs one decision-level manager brief and leaves its candidates as payload evidence', async () => {
		const { supabase, upserts } = createSupabaseMock({
			project_loop_runs: [
				{
					id: 'run-1',
					project_id: 'project-1',
					user_id: 'user-1',
					status: 'waiting_review',
					created_at: recentSourceTimestamp(),
					brief: {
						version: 2,
						attention_level: 'decision',
						bottom_line: 'Two launch documents now tell different stories.',
						recommendation:
							'Keep Launch Plan as the main plan and archive the old draft.',
						candidate_ids: ['suggestion-1', 'suggestion-2']
					}
				}
			],
			inbox_items: []
		});

		const row = await syncInboxItemForProjectReview({
			supabase: supabase as any,
			runId: 'run-1'
		});

		expect(row).toMatchObject({
			source_type: 'project_review',
			source_ref_id: 'run-1',
			status: 'pending'
		});
		expect(upserts).toHaveLength(1);
	});

	it('expires an existing project audit inbox item when the completed audit has no action', async () => {
		const { supabase, updates, upserts } = createSupabaseMock({
			project_audits: [
				{
					id: 'audit-clean',
					project_id: 'project-1',
					status: 'ready',
					recommendations: [],
					generated_suggestion_count: 0,
					unresolved_suggestion_count: 0
				}
			],
			inbox_items: [
				{
					id: 'inbox-clean',
					source_type: 'project_audit',
					source_ref_id: 'audit-clean',
					status: 'deciding'
				}
			]
		});

		const row = await syncInboxItemForProjectAudit({
			supabase: supabase as any,
			auditId: 'audit-clean'
		});

		expect(row).toMatchObject({
			status: 'expired',
			source_status: 'no_action_required',
			blocked_reason: 'Audit completed without an actionable recommendation'
		});
		expect(upserts).toHaveLength(0);
		expect(updates).toContainEqual(
			expect.objectContaining({
				table: 'inbox_items',
				status: 'expired',
				source_status: 'no_action_required'
			})
		);
	});

	it('expires a failed audit that produced no actionable recommendation', async () => {
		const { supabase, updates, upserts } = createSupabaseMock({
			project_audits: [
				{
					id: 'audit-failed',
					project_id: 'project-1',
					status: 'failed',
					recommendations: []
				}
			],
			inbox_items: [
				{
					id: 'inbox-failed',
					source_type: 'project_audit',
					source_ref_id: 'audit-failed',
					status: 'deciding'
				}
			]
		});

		const row = await syncInboxItemForProjectAudit({
			supabase: supabase as any,
			auditId: 'audit-failed'
		});

		expect(row).toMatchObject({
			status: 'expired',
			source_status: 'failed',
			blocked_reason: 'Audit failed before producing an actionable recommendation'
		});
		expect(upserts).toHaveLength(0);
		expect(updates).toContainEqual(
			expect.objectContaining({
				table: 'inbox_items',
				status: 'expired',
				source_status: 'failed'
			})
		);
	});

	it('expires active child suggestion inbox rows that are grouped into an audit packet', async () => {
		const { supabase, updates } = createSupabaseMock({
			project_audit_suggestions: [
				{ audit_id: 'audit-1', suggestion_id: 'suggestion-1' },
				{ audit_id: 'audit-1', suggestion_id: 'suggestion-2' }
			],
			inbox_items: [
				{
					id: 'inbox-1',
					source_type: 'project_suggestion',
					source_ref_id: 'suggestion-1',
					status: 'pending'
				},
				{
					id: 'inbox-2',
					source_type: 'project_suggestion',
					source_ref_id: 'suggestion-2',
					status: 'decided'
				}
			]
		});

		const count = await expireInboxItemsForProjectAuditChildSuggestions({
			supabase: supabase as any,
			auditId: 'audit-1'
		});

		expect(count).toBe(1);
		expect(updates).toContainEqual(
			expect.objectContaining({
				table: 'inbox_items',
				status: 'expired',
				source_status: 'grouped_into_project_audit'
			})
		);
	});

	it('expires every active inbox item for a deleted project', async () => {
		const tables = {
			inbox_items: [
				{ id: 'inbox-1', project_id: 'project-1', status: 'pending' },
				{ id: 'inbox-2', project_id: 'project-1', status: 'snoozed' },
				{ id: 'inbox-3', project_id: 'project-1', status: 'decided' },
				{ id: 'inbox-4', project_id: 'project-2', status: 'pending' }
			]
		};
		const { supabase } = createSupabaseMock(tables);

		const count = await expireInboxItemsForProject({
			supabase: supabase as any,
			projectId: 'project-1'
		});

		expect(count).toBe(2);
		expect(tables.inbox_items).toEqual([
			expect.objectContaining({
				id: 'inbox-1',
				status: 'expired',
				source_status: 'project_deleted',
				blocked_reason: 'Project was deleted'
			}),
			expect.objectContaining({
				id: 'inbox-2',
				status: 'expired',
				source_status: 'project_deleted',
				blocked_reason: 'Project was deleted'
			}),
			expect.objectContaining({ id: 'inbox-3', status: 'decided' }),
			expect.objectContaining({ id: 'inbox-4', status: 'pending' })
		]);
	});

	it('does not reactivate a deleted-project inbox item during source reconciliation', async () => {
		const { supabase, upserts } = createSupabaseMock({
			agent_runs: [
				{
					id: 'agent-run-1',
					user_id: 'user-1',
					project_id: 'project-1',
					status: 'proposal_ready',
					label: 'Update project START HERE',
					change_set: { status: 'pending', changes: [{ id: 'change-1' }] },
					created_at: '2026-07-11T03:31:37.886Z'
				}
			],
			inbox_items: [
				{
					id: 'inbox-1',
					source_type: 'agent_run',
					source_ref_id: 'agent-run-1',
					status: 'expired',
					source_status: 'project_deleted',
					blocked_reason: 'Project was deleted',
					decided_at: '2026-07-11T03:38:13.141Z'
				}
			]
		});

		const row = await syncInboxItemForAgentRun({
			supabase: supabase as any,
			runId: 'agent-run-1'
		});

		expect(row).toMatchObject({
			status: 'expired',
			blocked_reason: 'Project was deleted'
		});
		expect(upserts[0]).toMatchObject({
			status: 'expired',
			blocked_reason: 'Project was deleted'
		});
	});
});

// ---------------------------------------------------------------------------
// Jev freshness radar (Tasker 88): bundle mapping, exemptions, retire/restore
// ---------------------------------------------------------------------------

const RADAR_PROJECT = 'project-radar';

function freshnessBundle(overrides: Row = {}): Row {
	return {
		id: 'bundle-1',
		project_id: RADAR_PROJECT,
		kind: 'freshness_update',
		status: 'pending',
		title: 'Freshness update',
		risk_tier: 1,
		run_id: null,
		freshness_scan_id: 'scan-1',
		operations: [
			{
				tool: 'update_onto_task',
				args: { project_id: RADAR_PROJECT, task_id: 'task-1', state_key: 'done' },
				label: 'Mark Draft the launch email done'
			},
			{
				tool: 'update_onto_milestone',
				args: {
					project_id: RADAR_PROJECT,
					milestone_id: 'milestone-1',
					due_at: '2026-10-22'
				},
				label: 'Reschedule Shed weather-tight'
			}
		],
		created_at: '2026-09-18T15:00:00.000Z',
		updated_at: recentSourceTimestamp(),
		...overrides
	};
}

function radarEntityTables(): Record<string, Row[]> {
	return {
		onto_projects: [
			{ id: RADAR_PROJECT, doc_structure: { root: [] }, deleted_at: null, archived_at: null }
		],
		onto_tasks: [
			{
				id: 'task-1',
				project_id: RADAR_PROJECT,
				title: 'Draft the launch email',
				state_key: 'in_progress',
				due_at: null,
				start_at: null,
				deleted_at: null,
				archived_at: null
			}
		],
		onto_milestones: [
			{
				id: 'milestone-1',
				project_id: RADAR_PROJECT,
				title: 'Shed weather-tight',
				state_key: 'pending',
				due_at: '2026-10-15T04:00:00.000Z',
				deleted_at: null,
				archived_at: null
			}
		]
	};
}

function retirableSuggestion(overrides: Row = {}): Row {
	return {
		id: 'suggestion-obsolete',
		project_id: RADAR_PROJECT,
		kind: 'task_conflict',
		status: 'pending',
		freshness_state: 'fresh',
		title: 'Resolve the launch email overlap',
		operations: [],
		result: null,
		created_at: recentSourceTimestamp(),
		updated_at: recentSourceTimestamp(),
		...overrides
	};
}

function retirableInboxRow(overrides: Row = {}): Row {
	return {
		id: 'inbox-obsolete',
		source_type: 'project_suggestion',
		source_ref_id: 'suggestion-obsolete',
		project_id: RADAR_PROJECT,
		audience: 'project_members',
		status: 'pending',
		source_status: 'pending',
		blocked_reason: null,
		expires_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
		created_at: recentSourceTimestamp(),
		updated_at: recentSourceTimestamp(),
		...overrides
	};
}

describe('freshness_update bundle inbox mapping', () => {
	it('maps the bundle with a code-authored title, summary, tier 1 and a 72-hour TTL', () => {
		const row = mapProjectSuggestionToInboxItem(
			freshnessBundle({ updated_at: '2026-09-18T15:00:00.000Z' })
		);
		expect(row).toMatchObject({
			source_type: 'project_suggestion',
			source_ref_id: 'bundle-1',
			audience: 'project_members',
			status: 'pending',
			title: 'Update 2 out-of-date items',
			summary: 'From your update on Sep 18 · 1 task, 1 milestone',
			risk_tier: 1,
			action_kinds: ['approve', 'reject'],
			expires_at: '2026-09-21T15:00:00.000Z'
		});
	});

	it('never quotes chat or model text in the bundle row', () => {
		const row = mapProjectSuggestionToInboxItem(
			freshnessBundle({
				title: 'I finished the launch email yesterday',
				why_now: 'User said: "I finished the launch email yesterday"',
				rationale: 'quoted chat'
			})
		);
		expect(JSON.stringify(row)).not.toContain('yesterday');
		expect(JSON.stringify(row)).not.toContain('quoted chat');
	});

	it('uses a singular title and summary for one operation', () => {
		const bundle = freshnessBundle();
		const row = mapProjectSuggestionToInboxItem({
			...bundle,
			operations: [bundle.operations[0]]
		});
		expect(row?.title).toBe('Update 1 out-of-date item');
		expect(row?.summary).toMatch(/· 1 task$/);
	});

	it('is not grouped into an active manager brief and keeps its verified bundle title', async () => {
		const { supabase, upserts, updates } = createSupabaseMock({
			...radarEntityTables(),
			project_suggestions: [freshnessBundle()],
			inbox_items: [
				{
					id: 'inbox-brief',
					source_type: 'project_review',
					source_ref_id: 'run-1',
					project_id: RADAR_PROJECT,
					status: 'pending'
				},
				{
					id: 'inbox-bundle',
					source_type: 'project_suggestion',
					source_ref_id: 'bundle-1',
					project_id: RADAR_PROJECT,
					status: 'pending',
					source_status: 'grouped_into_project_review'
				}
			]
		});

		const row = await syncInboxItemForProjectSuggestion({
			supabase: supabase as any,
			suggestionId: 'bundle-1'
		});

		expect(updates).toHaveLength(0);
		expect(upserts).toHaveLength(1);
		expect(row).toMatchObject({
			status: 'pending',
			title: 'Update 2 out-of-date items',
			source_status: expect.stringMatching(/^proposal_verified:[0-9a-f]{64}$/)
		});
	});

	it('still groups an ordinary suggestion behind an active manager brief', async () => {
		const { supabase, upserts } = createSupabaseMock({
			project_suggestions: [retirableSuggestion()],
			inbox_items: [
				{
					id: 'inbox-brief',
					source_type: 'project_review',
					source_ref_id: 'run-1',
					project_id: RADAR_PROJECT,
					status: 'pending'
				},
				retirableInboxRow()
			]
		});
		const row = await syncInboxItemForProjectSuggestion({
			supabase: supabase as any,
			suggestionId: 'suggestion-obsolete'
		});
		expect(upserts).toHaveLength(0);
		expect(row).toMatchObject({
			status: 'expired',
			source_status: 'grouped_into_project_review'
		});
	});

	it('exempts the bundle from the manager-brief bulk expiry', async () => {
		const tables = {
			project_suggestions: [freshnessBundle(), retirableSuggestion()],
			inbox_items: [
				retirableInboxRow(),
				retirableInboxRow({
					id: 'inbox-bundle',
					source_ref_id: 'bundle-1'
				})
			]
		};
		const { supabase } = createSupabaseMock(tables);
		const expired = await expireProjectSuggestionInboxItemsForManagerBrief({
			supabase: supabase as any,
			projectId: RADAR_PROJECT
		});
		expect(expired).toBe(1);
		expect(tables.inbox_items.find((row) => row.id === 'inbox-bundle')).toMatchObject({
			status: 'pending'
		});
		expect(tables.inbox_items.find((row) => row.id === 'inbox-obsolete')).toMatchObject({
			status: 'expired',
			source_status: 'grouped_into_project_review'
		});
	});
});

describe('freshness radar inbox cleanup', () => {
	it('retires an eligible suggestion: source superseded first, then the inbox row', async () => {
		const tables = {
			project_suggestions: [retirableSuggestion()],
			inbox_items: [retirableInboxRow({ status: 'deferred' })]
		};
		const { supabase } = createSupabaseMock(tables);
		const result = await retireInboxSourceForFreshness({
			supabase: supabase as any,
			inboxItemId: 'inbox-obsolete',
			flagId: 'flag-1',
			reason: 'Already done: the linked task is complete',
			projectId: RADAR_PROJECT
		});

		expect(result).toEqual({
			ok: true,
			undo: {
				kind: 'inbox_retire',
				suggestionId: 'suggestion-obsolete',
				inboxItemId: 'inbox-obsolete',
				previousSuggestionStatus: 'pending',
				previousInboxStatus: 'deferred'
			},
			inboxItem: expect.objectContaining({ status: 'expired' })
		});
		expect(tables.project_suggestions[0]).toMatchObject({
			status: 'superseded',
			freshness_state: 'stale',
			result: {
				freshness_retire: {
					flag_id: 'flag-1',
					reason: 'Already done: the linked task is complete',
					previous_freshness_state: 'fresh'
				}
			}
		});
		expect(tables.inbox_items[0]).toMatchObject({
			status: 'expired',
			source_status: FRESHNESS_RETIRED_SOURCE_STATUS,
			blocked_reason: 'Already done: the linked task is complete',
			snoozed_until: null
		});
		expect(tables.inbox_items[0].expires_at).toEqual(tables.inbox_items[0].decided_at);
	});

	it('keeps a retired row retired when the superseded source resyncs', async () => {
		const tables = {
			project_suggestions: [retirableSuggestion()],
			inbox_items: [retirableInboxRow()]
		};
		const { supabase, upserts } = createSupabaseMock(tables);
		await retireInboxSourceForFreshness({
			supabase: supabase as any,
			inboxItemId: 'inbox-obsolete',
			flagId: 'flag-1',
			reason: 'No longer relevant'
		});

		const row = await syncInboxItemForProjectSuggestion({
			supabase: supabase as any,
			suggestionId: 'suggestion-obsolete'
		});

		expect(upserts).toHaveLength(1);
		expect(row).toMatchObject({
			status: 'expired',
			source_status: FRESHNESS_RETIRED_SOURCE_STATUS,
			blocked_reason: 'No longer relevant'
		});
	});

	it.each([
		[
			'a manager brief',
			retirableInboxRow({ source_type: 'project_review' }),
			retirableSuggestion()
		],
		['a user-audience item', retirableInboxRow({ audience: 'user' }), retirableSuggestion()],
		['a snoozed item', retirableInboxRow({ status: 'snoozed' }), retirableSuggestion()],
		[
			'another project item',
			retirableInboxRow({ project_id: 'project-other' }),
			retirableSuggestion()
		],
		[
			'the radar bundle itself',
			retirableInboxRow(),
			retirableSuggestion({ kind: 'freshness_update' })
		]
	])('refuses to retire %s', async (_label, inboxRow, suggestion) => {
		const tables = { project_suggestions: [suggestion], inbox_items: [inboxRow] };
		const { supabase } = createSupabaseMock(tables);
		const result = await retireInboxSourceForFreshness({
			supabase: supabase as any,
			inboxItemId: 'inbox-obsolete',
			flagId: 'flag-1',
			reason: 'Obsolete',
			projectId: RADAR_PROJECT
		});
		expect(result).toEqual({ ok: false, reason: 'not_eligible' });
		expect(tables.project_suggestions[0].status).toBe(suggestion.status);
		expect(tables.inbox_items[0].status).toBe(inboxRow.status);
	});

	it('does not retire a suggestion that was already decided', async () => {
		const tables = {
			project_suggestions: [retirableSuggestion({ status: 'approved' })],
			inbox_items: [retirableInboxRow()]
		};
		const { supabase } = createSupabaseMock(tables);
		const result = await retireInboxSourceForFreshness({
			supabase: supabase as any,
			inboxItemId: 'inbox-obsolete',
			flagId: 'flag-1',
			reason: 'Obsolete'
		});
		expect(result).toEqual({ ok: false, reason: 'source_changed' });
		expect(tables.inbox_items[0].status).toBe('pending');
	});

	it('restores a retired suggestion, reopens and resyncs its row, and reapplies the budget', async () => {
		const tables = {
			project_suggestions: [retirableSuggestion()],
			inbox_items: [retirableInboxRow({ status: 'deferred' })]
		};
		const { supabase, upserts } = createSupabaseMock(tables);
		const retired = await retireInboxSourceForFreshness({
			supabase: supabase as any,
			inboxItemId: 'inbox-obsolete',
			flagId: 'flag-1',
			reason: 'Obsolete'
		});
		if (!retired.ok) throw new Error('Fixture should retire');

		const restored = await restoreFreshnessRetiredInboxSource({
			supabase: supabase as any,
			undo: retired.undo,
			flagId: 'flag-1'
		});

		expect(restored.ok).toBe(true);
		expect(tables.project_suggestions[0]).toMatchObject({
			status: 'pending',
			freshness_state: 'fresh',
			result: null
		});
		// Reopened with its previous status; the resync keeps a deferred row deferred
		// and the budget pass (one row, within budget) promotes it.
		expect(upserts.at(-1)).toMatchObject({
			status: 'deferred',
			source_status: 'pending',
			blocked_reason: null
		});
		expect(tables.inbox_items[0]).toMatchObject({ status: 'pending' });
	});

	it('refuses to restore when the suggestion changed or another flag retired it', async () => {
		const tables = {
			project_suggestions: [retirableSuggestion()],
			inbox_items: [retirableInboxRow()]
		};
		const { supabase } = createSupabaseMock(tables);
		const retired = await retireInboxSourceForFreshness({
			supabase: supabase as any,
			inboxItemId: 'inbox-obsolete',
			flagId: 'flag-1',
			reason: 'Obsolete'
		});
		if (!retired.ok) throw new Error('Fixture should retire');

		expect(
			await restoreFreshnessRetiredInboxSource({
				supabase: supabase as any,
				undo: retired.undo,
				flagId: 'flag-other'
			})
		).toEqual({ ok: false, reason: 'changed_since' });

		tables.project_suggestions[0].status = 'rejected';
		expect(
			await restoreFreshnessRetiredInboxSource({
				supabase: supabase as any,
				undo: retired.undo,
				flagId: 'flag-1'
			})
		).toEqual({ ok: false, reason: 'changed_since' });
		expect(tables.inbox_items[0]).toMatchObject({
			status: 'expired',
			source_status: FRESHNESS_RETIRED_SOURCE_STATUS
		});
	});

	it('marks an item possibly stale and later resets it to fresh', async () => {
		const tables = { inbox_items: [retirableInboxRow()] };
		const { supabase } = createSupabaseMock(tables);
		await markInboxItemFreshness({
			supabase: supabase as any,
			inboxItemId: 'inbox-obsolete',
			state: 'possibly_stale',
			note: 'The linked task changed after this was suggested',
			flagId: 'flag-2',
			checkedAt: '2026-09-18T16:00:00.000Z'
		});
		expect(tables.inbox_items[0]).toMatchObject({
			freshness_state: 'possibly_stale',
			freshness_note: 'The linked task changed after this was suggested',
			freshness_flag_id: 'flag-2',
			freshness_checked_at: '2026-09-18T16:00:00.000Z'
		});

		await markInboxItemFreshness({
			supabase: supabase as any,
			inboxItemId: 'inbox-obsolete',
			state: 'fresh',
			note: 'ignored',
			flagId: 'flag-3'
		});
		expect(tables.inbox_items[0]).toMatchObject({
			freshness_state: 'fresh',
			freshness_note: null,
			freshness_flag_id: 'flag-3'
		});
	});

	it('never writes freshness columns during an ordinary resync', async () => {
		const { supabase, upserts } = createSupabaseMock({
			project_suggestions: [retirableSuggestion()],
			inbox_items: [retirableInboxRow({ freshness_state: 'possibly_stale' })]
		});
		await syncInboxItemForProjectSuggestion({
			supabase: supabase as any,
			suggestionId: 'suggestion-obsolete'
		});
		expect(upserts).toHaveLength(1);
		expect(Object.keys(upserts[0]).filter((key) => key.startsWith('freshness'))).toEqual([]);
	});
});
