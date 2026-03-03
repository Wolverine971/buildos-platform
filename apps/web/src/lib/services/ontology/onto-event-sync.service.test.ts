// apps/web/src/lib/services/ontology/onto-event-sync.service.test.ts
import { describe, expect, it, vi } from 'vitest';
import { OntoEventSyncService } from './onto-event-sync.service';

function createSupabaseMock(fixtures: {
	tasks?: Record<
		string,
		{
			id: string;
			title?: string | null;
			description?: string | null;
			project_id?: string | null;
		}
	>;
	projects?: Record<string, { id: string; name?: string | null }>;
}) {
	return {
		from: (table: string) => {
			const state: { id?: string } = {};

			const builder: any = {
				select: () => builder,
				eq: (column: string, value: string) => {
					if (column === 'id') state.id = value;
					return builder;
				},
				is: () => builder,
				maybeSingle: async () => {
					if (!state.id) return { data: null, error: null };

					if (table === 'onto_tasks') {
						const task = fixtures.tasks?.[state.id] ?? null;
						return { data: task, error: null };
					}

					if (table === 'onto_projects') {
						const project = fixtures.projects?.[state.id] ?? null;
						return { data: project, error: null };
					}

					return { data: null, error: null };
				}
			};

			return builder;
		}
	};
}

describe('OntoEventSyncService calendar descriptions', () => {
	it('includes BuildOS task + project links and task description', async () => {
		const supabase = createSupabaseMock({
			tasks: {
				task1: {
					id: 'task1',
					title: 'Write spec',
					description: 'Do the thing.',
					project_id: 'proj1'
				}
			},
			projects: {
				proj1: { id: 'proj1', name: 'BuildOS' }
			}
		});

		const service = new OntoEventSyncService(supabase as any);
		const description = await (service as any).buildCalendarEventDescription({
			owner_entity_type: 'task',
			owner_entity_id: 'task1',
			project_id: 'proj1',
			description: null,
			props: {}
		});

		expect(description).toContain('Project: BuildOS');
		expect(description).toContain('/projects/proj1');
		expect(description).toContain('/projects/proj1/tasks/task1');
		expect(description).toContain('[BuildOS Task #task1]');
		expect(description).toContain('Do the thing.');
	});

	it('drops migrated Google Calendar links stored as description', async () => {
		const supabase = createSupabaseMock({
			tasks: {
				task1: { id: 'task1', title: 'Write spec', description: null, project_id: 'proj1' }
			},
			projects: {
				proj1: { id: 'proj1', name: 'BuildOS' }
			}
		});

		const service = new OntoEventSyncService(supabase as any);
		const description = await (service as any).buildCalendarEventDescription({
			owner_entity_type: 'task',
			owner_entity_id: 'task1',
			project_id: 'proj1',
			description: 'https://www.google.com/calendar/event?eid=abc123',
			props: {}
		});

		expect(description).not.toContain('google.com/calendar');
		expect(description).toContain('/projects/proj1/tasks/task1');
	});

	it('passes through non-task descriptions unchanged', async () => {
		const supabase = createSupabaseMock({});
		const service = new OntoEventSyncService(supabase as any);
		const description = await (service as any).buildCalendarEventDescription({
			owner_entity_type: 'project',
			owner_entity_id: 'proj1',
			project_id: 'proj1',
			description: 'Meet with client. https://zoom.us/j/123',
			props: {}
		});

		expect(description).toBe('Meet with client. https://zoom.us/j/123');
	});
});

describe('OntoEventSyncService project sync job version guards', () => {
	it('skips stale project sync jobs when event has newer update timestamp', async () => {
		const service = new OntoEventSyncService({} as any);
		vi.spyOn(service as any, 'getEvent').mockResolvedValue({
			id: 'event-1',
			project_id: 'project-1',
			updated_at: '2026-02-28T12:00:00.000Z',
			created_at: '2026-02-28T10:00:00.000Z',
			deleted_at: null,
			onto_event_sync: []
		});

		const updateCalendarEventSpy = vi.spyOn(
			(service as any).calendarService,
			'updateCalendarEvent'
		);
		const syncEventToCalendarSpy = vi.spyOn(service as any, 'syncEventToCalendar');

		const result = await service.processProjectEventSyncJob({
			action: 'upsert',
			eventId: 'event-1',
			projectId: 'project-1',
			targetUserId: 'user-1',
			expectedEventUpdatedAt: '2026-02-28T11:00:00.000Z'
		});

		expect(result).toEqual({
			outcome: 'skipped',
			reason: 'stale_event_version'
		});
		expect(updateCalendarEventSpy).not.toHaveBeenCalled();
		expect(syncEventToCalendarSpy).not.toHaveBeenCalled();
	});

	it('skips upsert when project mapping is missing but prior external reference exists', async () => {
		const service = new OntoEventSyncService({} as any);
		vi.spyOn(service as any, 'getEvent').mockResolvedValue({
			id: 'event-2',
			project_id: 'project-1',
			updated_at: '2026-03-01T12:00:00.000Z',
			created_at: '2026-03-01T10:00:00.000Z',
			deleted_at: null,
			external_link: null,
			sync_status: 'synced',
			props: {
				external_event_id: 'evt_existing',
				external_calendar_id: 'cal_existing'
			},
			onto_event_sync: []
		});
		vi.spyOn(service as any, 'resolveExternalMapping').mockResolvedValue(null);
		const markSyncErrorSpy = vi
			.spyOn(service as any, 'markEventSyncError')
			.mockResolvedValue(undefined);
		const syncEventToCalendarSpy = vi.spyOn(service as any, 'syncEventToCalendar');

		const result = await service.processProjectEventSyncJob({
			action: 'upsert',
			eventId: 'event-2',
			projectId: 'project-1',
			targetUserId: 'user-1'
		});

		expect(result).toEqual({
			outcome: 'skipped',
			reason: 'missing_project_sync_mapping'
		});
		expect(syncEventToCalendarSpy).not.toHaveBeenCalled();
		expect(markSyncErrorSpy).toHaveBeenCalledWith(
			'event-2',
			'missing_project_sync_mapping',
			undefined,
			'2026-03-01T12:00:00.000Z'
		);
	});

	it('does not recreate external events on google 404 during project updates', async () => {
		const service = new OntoEventSyncService({} as any);
		vi.spyOn(service as any, 'getEvent').mockResolvedValue({
			id: 'event-3',
			project_id: 'project-1',
			updated_at: '2026-03-02T12:00:00.000Z',
			created_at: '2026-03-02T10:00:00.000Z',
			deleted_at: null,
			external_link: null,
			props: {},
			onto_event_sync: [
				{
					id: 'sync-1',
					user_id: 'user-1'
				}
			]
		});
		vi.spyOn(service as any, 'resolveExternalMapping').mockResolvedValue({
			externalEventId: 'evt_404',
			calendarId: 'cal_1',
			syncRowId: 'sync-1'
		});
		vi.spyOn(service as any, 'buildCalendarEventDescription').mockResolvedValue('notes');
		vi.spyOn((service as any).calendarService, 'updateCalendarEvent').mockRejectedValue(
			new Error('404 not found')
		);
		const syncEventToCalendarSpy = vi.spyOn(service as any, 'syncEventToCalendar');
		const markSyncErrorSpy = vi
			.spyOn(service as any, 'markEventSyncError')
			.mockResolvedValue(undefined);

		const result = await service.processProjectEventSyncJob({
			action: 'upsert',
			eventId: 'event-3',
			projectId: 'project-1',
			targetUserId: 'user-1'
		});

		expect(result).toEqual({
			outcome: 'skipped',
			reason: 'external_event_not_found'
		});
		expect(syncEventToCalendarSpy).not.toHaveBeenCalled();
		expect(markSyncErrorSpy).toHaveBeenCalledWith(
			'event-3',
			'external_event_not_found',
			'sync-1',
			'2026-03-02T12:00:00.000Z'
		);
	});

	it('recovers project mapping from event props when sync row is missing', async () => {
		const service = new OntoEventSyncService({} as any);

		const mapping = await (service as any).resolveExternalMapping(
			'user-1',
			{
				id: 'event-4',
				project_id: 'project-1',
				props: {
					external_event_id: 'evt_recover',
					external_calendar_id: 'cal_recover'
				},
				external_link: null
			},
			[]
		);

		expect(mapping).toEqual({
			externalEventId: 'evt_recover',
			calendarId: 'cal_recover'
		});
	});
});
