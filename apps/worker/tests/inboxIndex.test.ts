// apps/worker/tests/inboxIndex.test.ts
import { describe, expect, it } from 'vitest';
import {
	mapAgentRunToInboxItem,
	mapCalendarSuggestionToInboxItem,
	mapProjectAuditToInboxItem,
	mapProjectSuggestionToInboxItem,
	expireInboxItemsForProject,
	expireInboxItemsForProjectAuditChildSuggestions,
	syncInboxItemForAgentRun,
	syncInboxItemForProjectAudit,
	syncInboxItemForProjectSuggestion
} from '../../../packages/shared-agent-ops/src/inbox-index';

type Row = Record<string, any>;

function createSupabaseMock(tables: Record<string, Row[]>) {
	const upserts: Row[] = [];
	const updates: Row[] = [];
	const supabase = {
		from(table: string) {
			const filters: Array<[string, unknown]> = [];
			const inFilters: Array<[string, unknown[]]> = [];
			let upsertPayload: Row | null = null;
			let updatePayload: Row | null = null;
			const matches = (candidate: Row) =>
				filters.every(([field, value]) => candidate[field] === value) &&
				inFilters.every(([field, values]) => values.includes(candidate[field]));
			const builder = {
				select() {
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

	it('keeps ready audit reports out of the inbox so recommendations surface individually', () => {
		expect(
			mapProjectAuditToInboxItem({
				id: 'audit-1',
				project_id: 'project-1',
				status: 'ready',
				recommendations: [{ title: 'Choose the launch go/no-go owner' }],
				unresolved_suggestion_count: 1
			})
		).toBeNull();
	});

	it('maps non-mutating findings to Address and Dismiss instead of Accept', () => {
		const row = mapProjectSuggestionToInboxItem({
			id: 'finding-1',
			project_id: 'project-1',
			kind: 'drift',
			status: 'pending',
			title: 'Launch date drifted',
			operations: []
		});

		expect(row).toMatchObject({
			status: 'pending',
			action_kinds: ['address', 'reject']
		});
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

	it('expires a parent audit packet when its recommendations are indexed individually', async () => {
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
					created_at: '2026-07-01T12:00:00.000Z'
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
			status: 'expired',
			source_status: 'recommendations_indexed',
			blocked_reason: 'Audit recommendations are available as individual inbox items'
		});
		expect(upserts).toHaveLength(0);
		expect(updates).toContainEqual(
			expect.objectContaining({
				table: 'inbox_items',
				status: 'expired',
				source_status: 'recommendations_indexed'
			})
		);
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
