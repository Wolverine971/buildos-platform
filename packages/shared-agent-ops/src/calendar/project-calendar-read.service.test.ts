// packages/shared-agent-ops/src/calendar/project-calendar-read.service.test.ts
import { describe, expect, it, vi } from 'vitest';
import { ProjectCalendarReadService } from './project-calendar-read.service';

function createSupabaseMock(fixtures: {
	calendar?: { data?: unknown; error?: { code?: string; message?: string } };
	projectProps?: Record<string, unknown> | null;
}) {
	const from = vi.fn((table: string) => {
		const builder: any = {
			select: () => builder,
			eq: () => builder,
			is: () => builder,
			single: async () => ({
				data: fixtures.calendar?.data ?? null,
				error: fixtures.calendar?.error ?? null
			}),
			maybeSingle: async () => {
				if (table === 'onto_projects') {
					return { data: { props: fixtures.projectProps ?? null }, error: null };
				}
				return { data: null, error: null };
			}
		};
		return builder;
	});
	return { supabase: { from } as any, from };
}

describe('ProjectCalendarReadService.readProjectCalendar', () => {
	it('returns the row with the project sync mode', async () => {
		const { supabase } = createSupabaseMock({
			calendar: { data: { id: 'pc-1', calendar_id: 'cal-1' } },
			projectProps: { calendar_sync_mode: 'member_fanout' }
		});

		await expect(
			new ProjectCalendarReadService(supabase).readProjectCalendar('project-1', 'user-1')
		).resolves.toEqual({
			status: 'ok',
			calendar: { id: 'pc-1', calendar_id: 'cal-1', sync_mode: 'member_fanout' }
		});
	});

	it('treats PGRST116 (no rows) as an absent calendar, not an error', async () => {
		const { supabase } = createSupabaseMock({
			calendar: { data: null, error: { code: 'PGRST116', message: 'no rows' } }
		});

		await expect(
			new ProjectCalendarReadService(supabase).readProjectCalendar('project-1', 'user-1')
		).resolves.toEqual({ status: 'ok', calendar: null });
	});

	it('reports any other query failure as an error outcome', async () => {
		const { supabase } = createSupabaseMock({
			calendar: { data: null, error: { code: '42501', message: 'denied' } }
		});

		await expect(
			new ProjectCalendarReadService(supabase).readProjectCalendar('project-1', 'user-1')
		).resolves.toEqual({ status: 'error', message: 'denied' });
	});
});

describe('ProjectCalendarReadService.getProjectCalendarSyncMode', () => {
	it('defaults to actor projection', async () => {
		const { supabase } = createSupabaseMock({ projectProps: null });
		await expect(
			new ProjectCalendarReadService(supabase).getProjectCalendarSyncMode('project-1')
		).resolves.toBe('actor_projection');
	});

	it('only recognizes the exact member_fanout value', async () => {
		const service = new ProjectCalendarReadService(
			createSupabaseMock({ projectProps: { calendar_sync_mode: 'member-fanout' } }).supabase
		);
		await expect(service.getProjectCalendarSyncMode('project-1')).resolves.toBe(
			'actor_projection'
		);
	});
});
