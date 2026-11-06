// apps/web/src/lib/services/calendar-webhook-project-ingest.test.ts
// Tasker 154: project calendars sync both ways. Wiring between the webhook service and the
// shared ingest module (which has its own tests in shared-agent-ops).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { ingestMock } = vi.hoisted(() => ({
	ingestMock: vi.fn().mockResolvedValue({
		applied: 0,
		skipped: 0,
		failed: 0,
		notProjectCalendar: false
	})
}));
vi.mock('@buildos/shared-agent-ops/calendar/calendar-change-ingest', () => ({
	ingestProjectCalendarChanges: ingestMock
}));

import { CalendarWebhookService } from './calendar-webhook-service';

type QueryResult = { data: any; error: any };

function createDatabase(results: Record<string, QueryResult>) {
	const operations: Array<{ table: string; action: string; payload?: unknown }> = [];
	function query(table: string) {
		const entry: (typeof operations)[number] = { table, action: 'select' };
		operations.push(entry);
		const result = () =>
			results[`${table}:${entry.action}`] ?? results[table] ?? { data: null, error: null };
		const builder: any = {
			select: () => builder,
			order: () => builder,
			limit: () => builder,
			update: (payload: unknown) => (
				(entry.action = 'update'),
				(entry.payload = payload),
				builder
			),
			insert: (payload: unknown) => (
				(entry.action = 'insert'),
				(entry.payload = payload),
				builder
			),
			upsert: (payload: unknown) => (
				(entry.action = 'upsert'),
				(entry.payload = payload),
				builder
			),
			delete: () => ((entry.action = 'delete'), builder),
			single: () => Promise.resolve(result()),
			maybeSingle: () => Promise.resolve(result()),
			then: (resolve: any, reject: any) => Promise.resolve(result()).then(resolve, reject)
		};
		for (const op of ['eq', 'is', 'lt', 'gt', 'in', 'neq', 'not']) builder[op] = () => builder;
		return builder;
	}
	return {
		database: {
			from: vi.fn(query),
			rpc: vi.fn().mockResolvedValue({ data: null, error: null })
		} as any,
		operations
	};
}

function setup(results: Record<string, QueryResult>) {
	const { database, operations } = createDatabase(results);
	const api = {
		events: {
			watch: vi.fn().mockResolvedValue({
				data: { resourceId: 'resource-new', expiration: String(Date.now() + 60_000) }
			}),
			list: vi.fn().mockResolvedValue({
				data: {
					items: [{ id: 'g-1', status: 'confirmed', updated: new Date().toISOString() }],
					nextSyncToken: 'sync-new'
				}
			})
		},
		channels: { stop: vi.fn().mockResolvedValue({ data: {} }) }
	};
	const service = new CalendarWebhookService(database, {
		connectionService: { getAuthenticatedClient: vi.fn().mockResolvedValue({}) },
		targetService: {
			resolveExplicitSource: vi.fn().mockResolvedValue({
				userId: 'user-1',
				connectionId: 'connection-1',
				calendarSourceId: 'source-1',
				providerCalendarId: 'project-cal@group.calendar.google.com',
				accessRole: 'owner'
			})
		} as any,
		createCalendarApi: () => api as any,
		createIngestWriter: () => ({}) as any
	});
	return { service, operations, api, database };
}

const channel = {
	id: 'webhook-1',
	user_id: 'user-1',
	channel_id: 'channel-1',
	resource_id: 'resource-1',
	calendar_id: 'project-cal@group.calendar.google.com',
	calendar_source_id: 'source-1',
	expiration: Date.now() + 60_000,
	sync_token: 'sync-old',
	webhook_token: 'secret'
};

beforeEach(() => ingestMock.mockClear());

describe('project calendar ingest wiring', () => {
	it('hands every webhook delta to the project ingest as a live change', async () => {
		const { service } = setup({
			calendar_webhook_channels: { data: channel, error: null },
			users: {
				data: { created_at: '2026-01-01T00:00:00Z', timezone: 'America/New_York' },
				error: null
			},
			task_calendar_events: { data: [], error: null },
			time_blocks: { data: [], error: null }
		});
		const result = await service.handleWebhookNotification(
			'channel-1',
			'resource-1',
			'secret',
			{
				'x-goog-resource-state': 'exists'
			}
		);
		expect(result.success).toBe(true);
		expect(ingestMock).toHaveBeenCalledTimes(1);
		expect(ingestMock.mock.calls[0]![0]).toMatchObject({
			userId: 'user-1',
			providerCalendarId: 'project-cal@group.calendar.google.com',
			calendarSourceId: 'source-1',
			origin: 'live',
			fullListing: false,
			userTimezone: 'America/New_York'
		});
		expect(ingestMock.mock.calls[0]![0].events).toHaveLength(1);
	});

	it('first sight of a project calendar: turns its sync on, watches it, copies upcoming events', async () => {
		const { service, database, api, operations } = setup({
			project_calendars: {
				data: [
					{
						id: 'pc-1',
						user_id: 'user-1',
						calendar_id: 'project-cal@group.calendar.google.com',
						calendar_source_id: null,
						inbound_backfilled_at: null
					}
				],
				error: null
			},
			user_calendar_sources: {
				data: [
					{
						id: 'source-1',
						user_id: 'user-1',
						provider_calendar_id: 'project-cal@group.calendar.google.com',
						sync_enabled: false,
						access_role: 'owner'
					}
				],
				error: null
			},
			'calendar_webhook_channels:select': { data: [], error: null },
			users: { data: { timezone: 'America/New_York' }, error: null }
		});
		const summary = await service.ensureProjectCalendarsWatched(
			'https://build-os.com/webhooks/calendar-events'
		);

		expect(database.rpc).toHaveBeenCalledWith(
			'set_calendar_source_preferences',
			expect.objectContaining({
				p_calendar_source_id: 'source-1',
				p_read_enabled: true,
				p_sync_enabled: true
			})
		);
		expect(api.events.watch).toHaveBeenCalled();
		expect(api.events.list).toHaveBeenCalledWith(
			expect.objectContaining({ singleEvents: false, timeMin: expect.any(String) })
		);
		expect(ingestMock.mock.calls.at(-1)![0]).toMatchObject({ origin: 'backfill' });
		expect(
			operations.find((op) => op.table === 'project_calendars' && op.action === 'update')
				?.payload
		).toMatchObject({ inbound_backfilled_at: expect.any(String) });
		expect(summary).toMatchObject({ checked: 1, enabled: 1, registered: 1, failed: 0 });
	});

	it('respects a user who turned a project calendar off after the first time', async () => {
		const { service, database, api } = setup({
			project_calendars: {
				data: [
					{
						id: 'pc-1',
						user_id: 'user-1',
						calendar_id: 'project-cal@group.calendar.google.com',
						calendar_source_id: 'source-1',
						inbound_backfilled_at: '2026-11-05T00:00:00Z'
					}
				],
				error: null
			},
			user_calendar_sources: {
				data: [
					{
						id: 'source-1',
						user_id: 'user-1',
						provider_calendar_id: 'project-cal@group.calendar.google.com',
						sync_enabled: false,
						access_role: 'owner'
					}
				],
				error: null
			},
			calendar_webhook_channels: { data: [], error: null }
		});
		await service.ensureProjectCalendarsWatched(
			'https://build-os.com/webhooks/calendar-events'
		);
		expect(database.rpc).not.toHaveBeenCalled();
		expect(api.events.watch).not.toHaveBeenCalled();
	});

	it('sweeps a quiet channel with its sync token and marks the changes as sweep', async () => {
		const { service, api } = setup({
			calendar_webhook_channels: { data: [channel], error: null },
			users: { data: { created_at: '2026-01-01T00:00:00Z', timezone: 'UTC' }, error: null },
			task_calendar_events: { data: [], error: null },
			time_blocks: { data: [], error: null }
		});
		const result = await service.sweepQuietChannels();
		expect(result).toEqual({ swept: 1, failed: 0 });
		expect(api.events.list).toHaveBeenCalledWith(
			expect.objectContaining({ syncToken: 'sync-old' })
		);
		expect(ingestMock.mock.calls[0]![0]).toMatchObject({ origin: 'sweep' });
	});
});
