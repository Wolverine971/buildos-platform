// apps/web/src/lib/services/calendar-webhook-source-routing.test.ts
import { describe, expect, it, vi } from 'vitest';
import { CalendarWebhookService, type WebhookChannel } from './calendar-webhook-service';
import { GoogleOAuthConnectionError } from './google-oauth-service';
import { ScheduledSmsUpdateService } from './scheduledSmsUpdate.service';
import type { CalendarTarget } from '$lib/server/google-calendar-target.service';

type QueryResult = { data: any; error: any };

// `results` is keyed by table, or by `table:action` to give writes their own result.
function createDatabase(results: Record<string, QueryResult>) {
	const operations: Array<{
		table: string;
		action: string;
		payload?: unknown;
		filters: Array<[string, unknown]>;
	}> = [];

	function query(table: string) {
		const entry: (typeof operations)[number] = {
			table,
			action: 'select',
			filters: [] as Array<[string, unknown]>
		};
		operations.push(entry);
		const result = () =>
			results[`${table}:${entry.action}`] ?? results[table] ?? { data: null, error: null };
		const builder: any = {
			select: () => builder,
			eq: (column: string, value: unknown) => {
				entry.filters.push([column, value]);
				return builder;
			},
			is: (column: string, value: unknown) => {
				entry.filters.push([column, value]);
				return builder;
			},
			lt: (column: string, value: unknown) => {
				entry.filters.push([column, value]);
				return builder;
			},
			in: (column: string, value: unknown) => {
				entry.filters.push([column, value]);
				return builder;
			},
			order: () => builder,
			limit: () => builder,
			update: (payload: unknown) => {
				entry.action = 'update';
				entry.payload = payload;
				return builder;
			},
			insert: (payload: unknown) => {
				entry.action = 'insert';
				entry.payload = payload;
				return builder;
			},
			upsert: (payload: unknown) => {
				entry.action = 'upsert';
				entry.payload = payload;
				return builder;
			},
			delete: () => {
				entry.action = 'delete';
				return builder;
			},
			single: () => Promise.resolve(result()),
			maybeSingle: () => Promise.resolve(result()),
			then: (
				resolve: (value: QueryResult) => unknown,
				reject: (reason: unknown) => unknown
			) => Promise.resolve(result()).then(resolve, reject)
		};
		return builder;
	}

	return {
		database: { from: vi.fn(query) } as any,
		operations
	};
}

function target(): CalendarTarget {
	return {
		userId: 'user-1',
		connectionId: 'connection-b',
		calendarSourceId: 'source-b',
		providerCalendarId: 'calendar-b@example.com',
		accessRole: 'owner',
		accountLabel: 'Work',
		sourceSummary: 'Work',
		isPrimary: true,
		connectionConnectedAt: '2026-08-12T00:00:00.000Z',
		sourceCreatedAt: '2026-08-12T00:00:00.000Z'
	};
}

function channel(overrides: Partial<WebhookChannel> = {}): WebhookChannel {
	return {
		id: 'webhook-b',
		user_id: 'user-1',
		channel_id: 'channel-b',
		resource_id: 'resource-b',
		calendar_id: 'calendar-b@example.com',
		calendar_source_id: 'source-b',
		expiration: Date.now() + 60_000,
		sync_token: 'sync-b',
		webhook_token: 'secret-b',
		...overrides
	};
}

function setup(results: Record<string, QueryResult>) {
	const { database, operations } = createDatabase(results);
	const connectionService = {
		getAuthenticatedClient: vi.fn().mockResolvedValue({ connection: 'b' })
	};
	const targetService = {
		resolveExplicitSource: vi.fn().mockResolvedValue(target())
	};
	const api = {
		events: {
			watch: vi.fn().mockResolvedValue({
				data: { resourceId: 'resource-new', expiration: String(Date.now() + 60_000) }
			}),
			list: vi.fn().mockResolvedValue({
				data: { items: [], nextSyncToken: 'sync-new' }
			})
		},
		channels: { stop: vi.fn().mockResolvedValue({ data: {} }) }
	};
	const service = new CalendarWebhookService(database, {
		connectionService,
		targetService,
		createCalendarApi: () => api as any
	});
	return { service, operations, connectionService, targetService, api };
}

describe('CalendarWebhookService source routing', () => {
	it('registers and seeds a webhook through the source owning connection', async () => {
		const { service, operations, connectionService, targetService, api } = setup({
			calendar_webhook_channels: { data: null, error: null }
		});

		await expect(
			service.registerWebhook(
				'user-1',
				'https://buildos.com/webhooks/calendar-events',
				'primary',
				'source-b'
			)
		).resolves.toEqual({ success: true });

		expect(targetService.resolveExplicitSource).toHaveBeenCalledWith(
			'user-1',
			'source-b',
			'sync'
		);
		expect(connectionService.getAuthenticatedClient).toHaveBeenCalledWith(
			'user-1',
			'connection-b'
		);
		expect(api.events.watch).toHaveBeenCalledWith(
			expect.objectContaining({ calendarId: 'calendar-b@example.com' })
		);
		expect(
			operations.find(
				(operation) =>
					operation.table === 'calendar_webhook_channels' && operation.action === 'insert'
			)?.payload
		).toEqual(
			expect.objectContaining({
				user_id: 'user-1',
				calendar_id: 'calendar-b@example.com',
				calendar_source_id: 'source-b',
				resource_id: 'resource-new'
			})
		);
		expect(
			operations.some(
				(operation) =>
					operation.action === 'update' &&
					operation.filters.some(
						([column, value]) => column === 'calendar_source_id' && value === 'source-b'
					)
			)
		).toBe(true);
	});

	it('uses source-qualified authentication and mapping filters for notifications', async () => {
		const { service, operations, connectionService, api } = setup({
			calendar_webhook_channels: { data: channel(), error: null },
			users: { data: { created_at: '2026-01-01T00:00:00.000Z' }, error: null },
			task_calendar_events: { data: [], error: null },
			time_blocks: { data: [], error: null }
		});
		api.events.list.mockResolvedValue({
			data: {
				items: [{ id: 'event-b', status: 'confirmed' }],
				nextSyncToken: 'sync-after-notification'
			}
		});

		await expect(
			service.handleWebhookNotification('channel-b', 'resource-b', 'secret-b', {
				'x-goog-resource-state': 'exists'
			})
		).resolves.toEqual({ success: true, processed: 0 });

		expect(connectionService.getAuthenticatedClient).toHaveBeenCalledWith(
			'user-1',
			'connection-b'
		);
		expect(api.events.list).toHaveBeenCalledWith(
			expect.objectContaining({
				calendarId: 'calendar-b@example.com',
				syncToken: 'sync-b'
			})
		);
		for (const table of ['task_calendar_events', 'time_blocks']) {
			expect(
				operations.find((operation) => operation.table === table)?.filters
			).toContainEqual(['calendar_source_id', 'source-b']);
		}
	});

	it('rotates an existing source channel without dropping its sync cursor', async () => {
		const existing = channel();
		const { service, operations, api } = setup({
			calendar_webhook_channels: { data: existing, error: null }
		});

		await expect(
			service.registerWebhook(
				'user-1',
				'https://buildos.com/webhooks/calendar-events',
				'calendar-b@example.com',
				'source-b'
			)
		).resolves.toEqual({ success: true });

		const update = operations.find(
			(operation) =>
				operation.table === 'calendar_webhook_channels' && operation.action === 'update'
		);
		expect(update?.filters).toContainEqual(['id', 'webhook-b']);
		expect(update?.payload).toEqual(expect.objectContaining({ sync_token: 'sync-b' }));
		expect(api.events.list).not.toHaveBeenCalled();
		expect(api.channels.stop).toHaveBeenCalledWith({
			requestBody: { id: 'channel-b', resourceId: 'resource-b' }
		});
	});

	it('rejects a webhook token mismatch before selecting credentials', async () => {
		const { service, connectionService, api } = setup({
			calendar_webhook_channels: { data: channel(), error: null }
		});

		await expect(
			service.handleWebhookNotification('channel-b', 'resource-b', 'wrong-secret', {})
		).resolves.toEqual({ success: false, processed: 0, error: 'Invalid token' });
		expect(connectionService.getAuthenticatedClient).not.toHaveBeenCalled();
		expect(api.events.list).not.toHaveBeenCalled();
	});

	it('does not retry or duplicate-log a legacy channel that requires reconnection', async () => {
		const expiredLegacyChannel = channel({
			calendar_id: 'primary',
			calendar_source_id: null,
			expiration: Date.now() - 60_000
		});
		const { database, operations } = createDatabase({
			calendar_webhook_channels: { data: [expiredLegacyChannel], error: null }
		});
		const legacyOAuthService = {
			getAuthenticatedClient: vi
				.fn()
				.mockRejectedValue(
					new GoogleOAuthConnectionError('Reconnect Google Calendar', true)
				)
		};
		const api = {
			events: {
				watch: vi.fn(),
				list: vi.fn()
			},
			channels: { stop: vi.fn() }
		};
		const service = new CalendarWebhookService(database, {
			legacyOAuthService,
			createCalendarApi: () => api as any
		});

		await expect(
			service.renewExpiringWebhooks('https://build-os.com/webhooks/calendar-events')
		).resolves.toEqual({
			attempted: 1,
			renewed: 0,
			failed: 1,
			rotateAll: false,
			hasMore: false
		});

		expect(legacyOAuthService.getAuthenticatedClient).toHaveBeenCalledOnce();
		expect(api.events.watch).not.toHaveBeenCalled();
		expect(
			operations.filter(
				(operation) => operation.table === 'error_logs' || operation.action === 'insert'
			)
		).toEqual([]);
		// The revoked channel moves to the back of the updated_at renewal queue.
		const bump = operations.find(
			(operation) =>
				operation.table === 'calendar_webhook_channels' && operation.action === 'update'
		);
		expect(bump?.filters).toContainEqual(['id', 'webhook-b']);
		expect(bump?.payload).toEqual({ updated_at: expect.any(String) });
	});

	describe('applying Google-side changes', () => {
		const timeBlockRow = {
			id: 'tb-1',
			user_id: 'user-1',
			calendar_event_id: 'event-b',
			calendar_source_id: 'source-b',
			sync_source: 'google',
			start_time: '2026-09-22T14:00:00.000Z',
			end_time: '2026-09-22T15:00:00.000Z',
			updated_at: '2026-09-01T00:00:00.000Z'
		};

		function notify(service: CalendarWebhookService) {
			return service.handleWebhookNotification('channel-b', 'resource-b', 'secret-b', {
				'x-goog-resource-state': 'exists'
			});
		}

		function storedSyncToken(operations: ReturnType<typeof createDatabase>['operations']) {
			return operations.find(
				(operation) =>
					operation.table === 'calendar_webhook_channels' &&
					operation.action === 'update' &&
					(operation.payload as any)?.sync_token === 'sync-after-notification'
			);
		}

		it('updates a moved time block by id instead of upserting a partial row', async () => {
			const { service, operations, api } = setup({
				calendar_webhook_channels: { data: channel(), error: null },
				users: { data: { created_at: '2026-01-01T00:00:00.000Z' }, error: null },
				task_calendar_events: { data: [], error: null },
				time_blocks: { data: [timeBlockRow], error: null }
			});
			api.events.list.mockResolvedValue({
				data: {
					items: [
						{
							id: 'event-b',
							status: 'confirmed',
							start: { dateTime: '2026-09-22T16:00:00.000Z' },
							end: { dateTime: '2026-09-22T17:30:00.000Z' }
						}
					],
					nextSyncToken: 'sync-after-notification'
				}
			});

			await expect(notify(service)).resolves.toEqual({ success: true, processed: 1 });

			expect(operations.some((operation) => operation.action === 'upsert')).toBe(false);
			const update = operations.find(
				(operation) => operation.table === 'time_blocks' && operation.action === 'update'
			);
			expect(update?.filters).toContainEqual(['id', 'tb-1']);
			expect(update?.payload).not.toHaveProperty('id');
			expect(update?.payload).toEqual(
				expect.objectContaining({
					start_time: '2026-09-22T16:00:00.000Z',
					end_time: '2026-09-22T17:30:00.000Z',
					duration_minutes: 90
				})
			);
			expect(storedSyncToken(operations)).toBeDefined();
		});

		it('keeps the previous sync token when a change fails to write', async () => {
			const { service, operations, api } = setup({
				calendar_webhook_channels: { data: channel(), error: null },
				users: { data: { created_at: '2026-01-01T00:00:00.000Z' }, error: null },
				task_calendar_events: { data: [], error: null },
				time_blocks: { data: [timeBlockRow], error: null },
				'time_blocks:update': { data: null, error: { message: 'write failed' } }
			});
			api.events.list.mockResolvedValue({
				data: {
					items: [
						{
							id: 'event-b',
							status: 'confirmed',
							start: { dateTime: '2026-09-22T16:00:00.000Z' },
							end: { dateTime: '2026-09-22T17:00:00.000Z' }
						}
					],
					nextSyncToken: 'sync-after-notification'
				}
			});

			await notify(service);

			expect(storedSyncToken(operations)).toBeUndefined();
		});

		it("reads all-day events as midnight in the user's timezone", async () => {
			const { service, operations, api } = setup({
				calendar_webhook_channels: { data: channel(), error: null },
				users: {
					data: {
						created_at: '2026-01-01T00:00:00.000Z',
						timezone: 'America/New_York'
					},
					error: null
				},
				task_calendar_events: { data: [], error: null },
				time_blocks: { data: [timeBlockRow], error: null }
			});
			api.events.list.mockResolvedValue({
				data: {
					items: [
						{
							id: 'event-b',
							status: 'confirmed',
							start: { date: '2026-09-23' },
							end: { date: '2026-09-24' }
						}
					],
					nextSyncToken: 'sync-after-notification'
				}
			});

			await notify(service);

			const update = operations.find(
				(operation) => operation.table === 'time_blocks' && operation.action === 'update'
			);
			expect(update?.payload).toEqual(
				expect.objectContaining({
					start_time: '2026-09-23T04:00:00.000Z',
					end_time: '2026-09-24T04:00:00.000Z',
					duration_minutes: 1440
				})
			);
		});

		it('cancels scheduled SMS for a deleted event by its Google event id', async () => {
			const { service, operations, api } = setup({
				calendar_webhook_channels: { data: channel(), error: null },
				users: { data: { created_at: '2026-01-01T00:00:00.000Z' }, error: null },
				task_calendar_events: {
					data: [
						{
							id: 'row-uuid-1',
							task_id: 'task-1',
							user_id: 'user-1',
							calendar_event_id: 'event-b',
							sync_source: 'google',
							is_master_event: false
						}
					],
					error: null
				},
				time_blocks: { data: [], error: null },
				scheduled_sms_messages: { data: [], error: null }
			});
			api.events.list.mockResolvedValue({
				data: {
					items: [{ id: 'event-b', status: 'cancelled' }],
					nextSyncToken: 'sync-after-notification'
				}
			});

			await notify(service);

			const smsLookup = operations.find(
				(operation) =>
					operation.table === 'scheduled_sms_messages' && operation.action === 'select'
			);
			expect(smsLookup?.filters).toContainEqual(['calendar_event_id', ['event-b']]);
		});
	});

	it('extracts SMS changes keyed by Google event id, never by row id', () => {
		const changes = ScheduledSmsUpdateService.extractEventChangesFromBatch(
			[
				{
					id: 'row-uuid-2',
					calendar_event_id: 'google-2',
					event_start: '2026-09-22T16:00:00.000Z',
					event_end: '2026-09-22T17:00:00.000Z',
					event_title: 'Moved'
				},
				{ id: 'row-uuid-3', recurrence_rule: 'RRULE:FREQ=DAILY' }
			],
			[{ calendar_event_id: 'google-1' }]
		);

		expect(changes).toEqual([
			{ calendarEventId: 'google-1', type: 'deleted' },
			{
				calendarEventId: 'google-2',
				type: 'rescheduled',
				newStart: '2026-09-22T16:00:00.000Z',
				newEnd: '2026-09-22T17:00:00.000Z',
				newTitle: 'Moved'
			}
		]);
	});
});
