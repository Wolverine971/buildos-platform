// apps/worker/tests/inboxIndex.test.ts
import { describe, expect, it } from 'vitest';
import {
	mapAgentRunToInboxItem,
	mapCalendarSuggestionToInboxItem,
	mapProjectAuditToInboxItem,
	mapProjectSuggestionToInboxItem,
	expireInboxItemsForProjectAuditChildSuggestions,
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
	it('sets a 30-day expiry on pending project suggestions', () => {
		const row = mapProjectSuggestionToInboxItem({
			id: 'suggestion-1',
			project_id: 'project-1',
			status: 'pending',
			title: 'Review task overlap',
			created_at: '2026-07-01T12:00:00.000Z'
		});

		expect(row).toMatchObject({
			status: 'pending',
			expires_at: '2026-07-31T12:00:00.000Z'
		});
	});

	it('sets a 30-day expiry on deciding source rows', () => {
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
			expires_at: '2026-07-31T12:00:00.000Z'
		});
		expect(calendarSuggestion).toMatchObject({
			status: 'deciding',
			expires_at: '2026-07-31T12:00:00.000Z'
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

	it('maps ready project audits to one pending packet', () => {
		const row = mapProjectAuditToInboxItem({
			id: 'audit-1',
			project_id: 'project-1',
			status: 'ready',
			summary: 'The project needs one decision and one cleanup.',
			unresolved_suggestion_count: 2,
			generated_suggestion_count: 3,
			created_at: '2026-07-01T12:00:00.000Z'
		});

		expect(row).toMatchObject({
			source_type: 'project_audit',
			source_ref_id: 'audit-1',
			project_id: 'project-1',
			audience: 'project_members',
			status: 'pending',
			title: 'Complete project audit',
			summary: 'The project needs one decision and one cleanup.',
			action_kinds: ['open', 'resolve'],
			expires_at: '2026-07-31T12:00:00.000Z'
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
			expires_at: '2020-01-31T00:00:00.000Z',
			blocked_reason: 'Review item expired',
			snoozed_until: null
		});
		expect(row?.decided_at).toEqual(expect.any(String));
		expect(upserts[0]).toMatchObject({
			status: 'expired',
			expires_at: '2020-01-31T00:00:00.000Z'
		});
	});

	it('syncs a project audit row into the inbox index', async () => {
		const { supabase, upserts } = createSupabaseMock({
			project_audits: [
				{
					id: 'audit-1',
					project_id: 'project-1',
					status: 'ready',
					unresolved_suggestion_count: 1,
					created_at: '2026-07-01T12:00:00.000Z'
				}
			],
			inbox_items: []
		});

		const row = await syncInboxItemForProjectAudit({
			supabase: supabase as any,
			auditId: 'audit-1'
		});

		expect(row).toMatchObject({
			source_type: 'project_audit',
			source_ref_id: 'audit-1',
			status: 'pending'
		});
		expect(upserts[0]).toMatchObject({
			source_type: 'project_audit',
			source_ref_id: 'audit-1',
			status: 'pending'
		});
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
});
