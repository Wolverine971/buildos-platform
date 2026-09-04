// apps/web/src/lib/services/ontology/onto-event-sync.service.test.ts
// The write-path behavior now lives with the shared service; see
// packages/shared-agent-ops/src/calendar/onto-event-sync.service.test.ts.
// What remains here is the web shim's own wiring: the queue fan-out that keeps
// project-scoped writes asynchronous on web, and the legacy singleton-OAuth
// CalendarService that cannot move out of apps/web.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: () => ({ rpc })
}));

import { OntoEventSyncService } from './onto-event-sync.service';

function createEventListSupabaseMock() {
	const query: any = {
		select: vi.fn(() => query),
		eq: vi.fn(() => query),
		order: vi.fn(() => query),
		is: vi.fn(() => query),
		gte: vi.fn(() => query),
		lte: vi.fn(() => query),
		limit: vi.fn(() => query),
		data: [],
		error: null
	};

	return {
		supabase: {
			from: vi.fn(() => query)
		},
		query
	};
}

beforeEach(() => {
	rpc.mockReset();
	rpc.mockResolvedValue({ data: null, error: null });
});

describe('OntoEventSyncService project event listing', () => {
	it('preserves ascending order by default', async () => {
		const { supabase, query } = createEventListSupabaseMock();
		const service = new OntoEventSyncService(supabase as any);

		await service.listProjectEvents('project-1', { includeDeleted: false });

		expect(query.order).toHaveBeenCalledWith('start_at', { ascending: true });
	});

	it('supports a bounded newest-first event window', async () => {
		const { supabase, query } = createEventListSupabaseMock();
		const service = new OntoEventSyncService(supabase as any);

		await service.listProjectEvents('project-1', {
			timeMin: '2026-06-01T00:00:00.000Z',
			timeMax: '2026-07-01T00:00:00.000Z',
			includeDeleted: false,
			limit: 26,
			orderDirection: 'descending'
		});

		expect(query.order).toHaveBeenCalledWith('start_at', { ascending: false });
		expect(query.gte).toHaveBeenCalledWith('start_at', '2026-06-01T00:00:00.000Z');
		expect(query.lte).toHaveBeenCalledWith('start_at', '2026-07-01T00:00:00.000Z');
		expect(query.limit).toHaveBeenCalledWith(26);
	});
});

describe('OntoEventSyncService web queue fan-out', () => {
	it('enqueues a sync_calendar job per target through the admin client', async () => {
		const service = new OntoEventSyncService({} as any);
		vi.spyOn(service as any, 'resolveProjectSyncTargets').mockResolvedValue({
			mode: 'member_fanout',
			targetUserIds: ['user-1', 'user-2']
		});

		const result = await (service as any).enqueueProjectEventSyncJobs(
			'user-1',
			{
				id: 'event-1',
				project_id: 'project-1',
				updated_at: '2026-08-12T12:00:00.000Z',
				created_at: '2026-08-12T11:00:00.000Z'
			},
			'upsert'
		);

		expect(result).toEqual({
			mode: 'member_fanout',
			targetUserIds: ['user-1', 'user-2'],
			enqueued: 2
		});
		expect(rpc).toHaveBeenCalledTimes(2);
		expect(rpc).toHaveBeenCalledWith(
			'add_queue_job',
			expect.objectContaining({
				p_user_id: 'user-1',
				p_job_type: 'sync_calendar',
				p_dedup_key:
					'onto-project-event-sync:upsert:event-1:user-1:2026-08-12T12:00:00.000Z',
				p_metadata: expect.objectContaining({
					kind: 'onto_project_event_sync',
					createCalendarIfMissing: true
				})
			})
		);
		// Fan-out targets that are not the actor must not provision a calendar.
		expect(rpc).toHaveBeenCalledWith(
			'add_queue_job',
			expect.objectContaining({
				p_user_id: 'user-2',
				p_metadata: expect.objectContaining({ createCalendarIfMissing: false })
			})
		);
	});

	it('marks the event failed when no job could be enqueued', async () => {
		const service = new OntoEventSyncService({} as any);
		vi.spyOn(service as any, 'resolveProjectSyncTargets').mockResolvedValue({
			mode: 'actor_projection',
			targetUserIds: ['user-1']
		});
		const markEventSyncError = vi
			.spyOn(service as any, 'markEventSyncError')
			.mockResolvedValue(undefined);
		rpc.mockResolvedValue({ data: null, error: { message: 'nope' } });

		const result = await (service as any).enqueueProjectEventSyncJobs(
			'user-1',
			{ id: 'event-2', project_id: 'project-1', updated_at: '2026-08-12T12:00:00.000Z' },
			'delete'
		);

		expect(result.enqueued).toBe(0);
		expect(markEventSyncError).toHaveBeenCalledWith(
			'event-2',
			'Failed to enqueue calendar sync job'
		);
	});

	it('is wired into the shared write path so project writes stay asynchronous', async () => {
		const service = new OntoEventSyncService({} as any);
		const enqueue = vi.spyOn(service as any, 'enqueueProjectEventSyncJobs').mockResolvedValue({
			mode: 'actor_projection',
			targetUserIds: ['user-1'],
			enqueued: 1
		});
		const event = {
			id: 'event-3',
			project_id: 'project-1',
			updated_at: '2026-08-12T12:00:00.000Z',
			created_at: '2026-08-12T11:00:00.000Z',
			deleted_at: null,
			sync_status: null,
			props: {},
			external_link: null,
			onto_event_sync: []
		};
		const query: any = {
			update: vi.fn(() => query),
			eq: vi.fn(() => query),
			select: vi.fn(() => query),
			single: vi.fn(async () => ({ data: { ...event, deleted_at: 'now' }, error: null }))
		};
		(service as any).supabase = { from: vi.fn(() => query) };
		vi.spyOn(service as any, 'getEvent').mockResolvedValue(event);

		await service.deleteEvent('user-1', { eventId: event.id });

		expect(enqueue).toHaveBeenCalledWith(
			'user-1',
			expect.objectContaining({ id: 'event-3' }),
			'delete'
		);
	});
});

describe('OntoEventSyncService legacy calendar wiring', () => {
	it('hands the legacy CalendarService to the shared write path', async () => {
		const service = new OntoEventSyncService({} as any);
		const deleteSpy = vi
			.spyOn((service as any).calendarService, 'deleteCalendarEvent')
			.mockResolvedValue({ success: true } as any);
		vi.spyOn(service as any, 'getEvent').mockResolvedValue({
			id: 'event-legacy',
			project_id: 'project-1',
			updated_at: '2026-08-12T13:00:00.000Z',
			created_at: '2026-08-12T12:00:00.000Z',
			deleted_at: '2026-08-12T13:00:00.000Z',
			props: {},
			onto_event_sync: []
		});
		vi.spyOn(service as any, 'resolveExternalMapping').mockResolvedValue({
			externalEventId: 'google-event-legacy',
			calendarId: 'project@example.com'
		});
		vi.spyOn(service as any, 'markEventSynced').mockResolvedValue(undefined);

		await expect(
			service.processProjectEventSyncJob({
				action: 'delete',
				eventId: 'event-legacy',
				projectId: 'project-1',
				targetUserId: 'user-1'
			})
		).resolves.toEqual({ outcome: 'deleted', reason: 'deleted_external_event' });
		expect(deleteSpy).toHaveBeenCalledWith(
			'user-1',
			expect.objectContaining({
				event_id: 'google-event-legacy',
				calendar_id: 'project@example.com'
			})
		);
	});
});
