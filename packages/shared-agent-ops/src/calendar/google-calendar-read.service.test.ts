// packages/shared-agent-ops/src/calendar/google-calendar-read.service.test.ts
//
// These cases exist because of one production turn: the chat worker had no
// calendar credentials, every failure was classified `provider_error`, and the
// assistant told the user Google was having "a transient OAuth/sync issue".
// The read layer now has to name server configuration for what it is, and a
// single source that cannot be read must not abort the whole read.
import { describe, expect, it, vi } from 'vitest';
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import { GoogleCalendarConnectionError } from './google-calendar-credential.service';
import { GoogleCalendarReadService } from './google-calendar-read.service';
import { GoogleCalendarTargetError, type CalendarTarget } from './google-calendar-target.service';

const admin = {} as unknown as TypedSupabaseClient;

function target(overrides: Partial<CalendarTarget> = {}): CalendarTarget {
	return {
		userId: 'user-1',
		connectionId: 'connection-1',
		calendarSourceId: 'source-1',
		providerCalendarId: 'primary@example.com',
		accessRole: 'owner',
		accountLabel: 'Work',
		sourceSummary: 'Work calendar',
		isPrimary: true,
		connectionConnectedAt: '2026-01-01T00:00:00.000Z',
		sourceCreatedAt: '2026-01-01T00:00:00.000Z',
		...overrides
	} as CalendarTarget;
}

function readService(input: {
	targets?: CalendarTarget[];
	resolveExplicitSource?: (userId: string, sourceId: string) => Promise<CalendarTarget>;
	getAuthenticatedClient?: () => Promise<unknown>;
	events?: unknown[];
}) {
	const listEvents = vi.fn().mockResolvedValue({
		data: { items: input.events ?? [], nextPageToken: null }
	});
	const service = new GoogleCalendarReadService(admin, {
		connectionService: {
			getAuthenticatedClient: input.getAuthenticatedClient ?? (async () => ({}))
		},
		targetService: {
			listEnabledReadTargets: vi.fn(async () => input.targets ?? [target()]),
			listAvailabilityTargets: vi.fn(async () => input.targets ?? [target()]),
			listAnalysisTargets: vi.fn(async () => input.targets ?? [target()]),
			resolveExplicitSource: vi.fn(
				input.resolveExplicitSource ?? (async () => target())
			) as never,
			resolveLegacyCalendarId: vi.fn(async () => target()) as never,
			reconcileDefaultWriteSourceId: vi.fn(async () => 'source-1')
		} as never,
		createCalendarApi: () => ({ events: { list: listEvents } }) as never,
		now: () => new Date('2026-09-04T12:00:00.000Z'),
		clock: () => 0
	});
	return { service, listEvents };
}

describe('GoogleCalendarReadService failure classification', () => {
	it.each([
		['not_configured', 'credentials_not_configured'],
		['database_error', 'credentials_unreadable'],
		['reconnect_required', 'reconnect_required']
	])('reports a %s connection error as %s, never provider_error', async (code, reasonCode) => {
		const { service } = readService({
			getAuthenticatedClient: async () => {
				throw new GoogleCalendarConnectionError(code as never, 'boom');
			}
		});
		const response = await service.listEvents({ userId: 'user-1' });
		expect(response.sourceStatuses).toEqual([
			expect.objectContaining({ status: 'error', reasonCode })
		]);
		expect(response.warnings[0]?.reasonCode).toBe(reasonCode);
	});

	it('says plainly that the server credentials are missing rather than blaming Google', async () => {
		const { service } = readService({
			getAuthenticatedClient: async () => {
				throw new GoogleCalendarConnectionError(
					'not_configured',
					'Calendar token encryption key is not configured on this server (PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1)'
				);
			}
		});
		const response = await service.listEvents({ userId: 'user-1' });
		expect(response.warnings[0]?.message).toContain(
			"this server's Google Calendar credentials are not configured"
		);
		expect(response.warnings[0]?.message).toContain('credentials_not_configured');
	});

	it('keeps unrelated provider failures on provider_error', async () => {
		const { service } = readService({
			getAuthenticatedClient: async () => {
				throw new Error('something else went wrong');
			}
		});
		const response = await service.listEvents({ userId: 'user-1' });
		expect(response.sourceStatuses[0]?.reasonCode).toBe('provider_error');
	});
});

describe('GoogleCalendarReadService target resolution', () => {
	const notCapable = new GoogleCalendarTargetError(
		'CALENDAR_SOURCE_NOT_CAPABLE',
		'Google Calendar source cannot be used for read'
	);

	it('turns a source that is not enabled for reading into one source failure', async () => {
		const { service } = readService({
			resolveExplicitSource: async () => {
				throw notCapable;
			}
		});
		const response = await service.listEvents({
			userId: 'user-1',
			calendarSourceId: 'source-off'
		});
		expect(response.sourceStatuses).toEqual([
			expect.objectContaining({
				calendarSourceId: 'source-off',
				status: 'error',
				reasonCode: 'source_not_readable'
			})
		]);
		expect(response.warnings[0]?.message).toContain('not enabled for reading');
	});

	it('still reads the readable sources when one requested source is read-disabled', async () => {
		const { service, listEvents } = readService({
			events: [{ id: 'event-1', start: { dateTime: '2026-09-04T13:00:00.000Z' } }],
			resolveExplicitSource: async (_userId, sourceId) => {
				if (sourceId === 'source-off') throw notCapable;
				return target({ calendarSourceId: sourceId });
			}
		});
		const response = await service.listEvents({
			userId: 'user-1',
			calendarSourceIds: ['source-off', 'source-on']
		});
		expect(listEvents).toHaveBeenCalledOnce();
		expect(response.events).toHaveLength(1);
		expect(
			response.sourceStatuses.map((status) => [status.calendarSourceId, status.status])
		).toEqual(
			expect.arrayContaining([
				['source-off', 'error'],
				['source-on', 'success']
			])
		);
		expect(response.partial).toBe(true);
	});

	it('still throws for a source that does not exist — a bad request is not a partial read', async () => {
		const { service } = readService({
			resolveExplicitSource: async () => {
				throw new GoogleCalendarTargetError(
					'CALENDAR_SOURCE_NOT_FOUND',
					'Google Calendar source was not found'
				);
			}
		});
		await expect(
			service.listEvents({ userId: 'user-1', calendarSourceId: 'nope' })
		).rejects.toMatchObject({ code: 'CALENDAR_SOURCE_NOT_FOUND' });
	});
});
