// apps/worker/tests/inboxIndex.test.ts
import { describe, expect, it } from 'vitest';
import {
	mapAgentRunToInboxItem,
	mapCalendarSuggestionToInboxItem,
	mapProjectSuggestionToInboxItem,
	syncInboxItemForProjectSuggestion
} from '../../../packages/shared-agent-ops/src/inbox-index';

type Row = Record<string, any>;

function createSupabaseMock(tables: Record<string, Row[]>) {
	const upserts: Row[] = [];
	const supabase = {
		from(table: string) {
			const filters: Array<[string, unknown]> = [];
			let upsertPayload: Row | null = null;
			const builder = {
				select() {
					return builder;
				},
				eq(field: string, value: unknown) {
					filters.push([field, value]);
					return builder;
				},
				upsert(payload: Row) {
					upsertPayload = payload;
					return builder;
				},
				async maybeSingle() {
					const row = (tables[table] ?? []).find((candidate) =>
						filters.every(([field, value]) => candidate[field] === value)
					);
					return { data: row ?? null, error: null };
				},
				async single() {
					if (!upsertPayload) return { data: null, error: new Error('Missing upsert') };
					upserts.push(upsertPayload);
					return { data: { id: 'inbox-1', ...upsertPayload }, error: null };
				}
			};
			return builder;
		}
	};

	return { supabase, upserts };
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
});
