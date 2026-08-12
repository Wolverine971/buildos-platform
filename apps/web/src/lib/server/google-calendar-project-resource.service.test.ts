// apps/web/src/lib/server/google-calendar-project-resource.service.test.ts
import { describe, expect, it, vi } from 'vitest';
import { GoogleCalendarProjectResourceService } from './google-calendar-project-resource.service';
import type { CalendarTarget } from './google-calendar-target.service';

function target(overrides: Partial<CalendarTarget> = {}): CalendarTarget {
	return {
		userId: 'user-1',
		connectionId: 'connection-a',
		calendarSourceId: 'source-a',
		providerCalendarId: 'primary-a@example.com',
		accessRole: 'owner',
		accountLabel: 'Personal',
		sourceSummary: 'Personal',
		isPrimary: true,
		connectionConnectedAt: '2026-08-10T10:00:00.000Z',
		sourceCreatedAt: '2026-08-10T10:01:00.000Z',
		...overrides
	};
}

function setup() {
	const targets = {
		resolveExplicitSource: vi.fn().mockResolvedValue(target()),
		resolveDefaultWriteTarget: vi.fn().mockResolvedValue(target()),
		listTargets: vi.fn().mockResolvedValue([
			target(),
			target({
				connectionId: 'connection-b',
				calendarSourceId: 'source-b',
				providerCalendarId: 'primary-b@example.com'
			})
		])
	};
	const connection = {
		getAuthenticatedClient: vi.fn().mockResolvedValue({ auth: true }),
		registerCreatedSource: vi.fn().mockResolvedValue({
			id: 'created-source',
			providerCalendarId: 'created@example.com',
			summary: 'Launch - Tasks',
			colorId: '7'
		})
	};
	const api = {
		calendars: {
			insert: vi.fn().mockResolvedValue({
				data: {
					id: 'created@example.com',
					summary: 'Launch - Tasks',
					timeZone: 'America/New_York'
				}
			}),
			patch: vi.fn().mockResolvedValue({ data: {} }),
			delete: vi.fn().mockResolvedValue({ data: {} })
		},
		calendarList: {
			patch: vi.fn().mockResolvedValue({ data: {} })
		},
		acl: {
			insert: vi.fn().mockResolvedValue({ data: {} })
		}
	};
	const service = new GoogleCalendarProjectResourceService({} as any, {
		targetService: targets,
		connectionService: connection as any,
		createCalendarApi: () => api as any
	});
	return { service, targets, connection, api };
}

describe('GoogleCalendarProjectResourceService', () => {
	it('resolves an existing project calendar by opaque source identity', async () => {
		const { service, targets } = setup();

		await expect(service.resolveLinkedSource('user-1', 'source-a')).resolves.toMatchObject({
			calendarSourceId: 'source-a',
			connectionId: 'connection-a',
			providerCalendarId: 'primary-a@example.com'
		});
		expect(targets.resolveExplicitSource).toHaveBeenCalledWith('user-1', 'source-a', 'write');
	});

	it('creates and registers a project calendar through the selected connection', async () => {
		const { service, targets, connection, api } = setup();

		await expect(
			service.createCalendar({
				userId: 'user-1',
				connectionId: 'connection-b',
				name: 'Launch - Tasks',
				colorId: '7',
				timeZone: 'America/New_York'
			})
		).resolves.toMatchObject({
			calendarSourceId: 'created-source',
			connectionId: 'connection-b',
			providerCalendarId: 'created@example.com'
		});
		expect(targets.listTargets).toHaveBeenCalledWith('user-1', 'write');
		expect(connection.getAuthenticatedClient).toHaveBeenCalledWith('user-1', 'connection-b');
		expect(api.calendars.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				requestBody: expect.objectContaining({ summary: 'Launch - Tasks' })
			})
		);
		expect(connection.registerCreatedSource).toHaveBeenCalledWith(
			expect.objectContaining({
				connectionId: 'connection-b',
				providerCalendarId: 'created@example.com'
			})
		);
	});

	it('deletes a just-created provider calendar when source registration fails', async () => {
		const { service, connection, api } = setup();
		connection.registerCreatedSource.mockRejectedValue(new Error('database unavailable'));

		await expect(
			service.createCalendar({
				userId: 'user-1',
				name: 'Launch - Tasks',
				timeZone: 'America/New_York'
			})
		).rejects.toThrow('database unavailable');
		expect(api.calendars.delete).toHaveBeenCalledWith({
			calendarId: 'created@example.com'
		});
	});

	it('updates and deletes through the exact stored source', async () => {
		const { service, targets, api } = setup();

		await service.updateCalendar({
			userId: 'user-1',
			calendarSourceId: 'source-a',
			providerResourceManaged: true,
			name: 'Renamed',
			colorId: '8'
		});
		await service.deleteCalendar({ userId: 'user-1', calendarSourceId: 'source-a' });

		expect(targets.resolveExplicitSource).toHaveBeenNthCalledWith(
			1,
			'user-1',
			'source-a',
			'write'
		);
		expect(api.calendars.patch).toHaveBeenCalledWith({
			calendarId: 'primary-a@example.com',
			requestBody: expect.objectContaining({ summary: 'Renamed' })
		});
		expect(api.calendarList.patch).toHaveBeenCalledWith({
			calendarId: 'primary-a@example.com',
			requestBody: { colorId: '8' }
		});
		expect(api.calendars.delete).toHaveBeenCalledWith({
			calendarId: 'primary-a@example.com'
		});
	});

	it('treats an already-deleted provider calendar as a successful delete retry', async () => {
		const { service, api } = setup();
		api.calendars.delete.mockRejectedValue({ response: { status: 404 } });

		await expect(
			service.deleteCalendar({ userId: 'user-1', calendarSourceId: 'source-a' })
		).resolves.toBeUndefined();
		expect(api.calendars.delete).toHaveBeenCalledWith({
			calendarId: 'primary-a@example.com'
		});
	});

	it('preserves provider failures other than not found', async () => {
		const { service, api } = setup();
		api.calendars.delete.mockRejectedValue({ response: { status: 503 } });

		await expect(
			service.deleteCalendar({ userId: 'user-1', calendarSourceId: 'source-a' })
		).rejects.toEqual({ response: { status: 503 } });
	});

	it('shares through the exact stored source connection', async () => {
		const { service, connection, api } = setup();

		await service.shareCalendar({
			userId: 'user-1',
			calendarSourceId: 'source-a',
			shares: [{ email: 'teammate@example.com', role: 'writer' }]
		});

		expect(connection.getAuthenticatedClient).toHaveBeenCalledWith('user-1', 'connection-a');
		expect(api.acl.insert).toHaveBeenCalledWith({
			calendarId: 'primary-a@example.com',
			requestBody: {
				role: 'writer',
				scope: { type: 'user', value: 'teammate@example.com' }
			}
		});
	});
});
