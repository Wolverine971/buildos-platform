// apps/web/src/lib/services/calendar-webhook-source-routing.test.ts
import { describe, expect, it, vi } from 'vitest';
import { CalendarWebhookService, type WebhookChannel } from './calendar-webhook-service';
import { GoogleOAuthConnectionError } from './google-oauth-service';
import type { CalendarTarget } from '$lib/server/google-calendar-target.service';

type QueryResult = { data: any; error: any };

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
			single: () => Promise.resolve(results[table] ?? { data: null, error: null }),
			maybeSingle: () => Promise.resolve(results[table] ?? { data: null, error: null }),
			then: (
				resolve: (value: QueryResult) => unknown,
				reject: (reason: unknown) => unknown
			) =>
				Promise.resolve(results[table] ?? { data: null, error: null }).then(resolve, reject)
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
	});
});
