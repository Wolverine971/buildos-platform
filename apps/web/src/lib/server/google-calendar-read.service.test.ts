// apps/web/src/lib/server/google-calendar-read.service.test.ts
import { describe, expect, it, vi } from 'vitest';
import { GoogleCalendarReadService } from './google-calendar-read.service';
import type { CalendarTarget } from './google-calendar-target.service';

function target(overrides: Partial<CalendarTarget> = {}): CalendarTarget {
	return {
		userId: 'user-1',
		connectionId: 'connection-a',
		calendarSourceId: 'source-a',
		providerCalendarId: 'personal@example.com',
		accessRole: 'owner',
		accountLabel: 'Personal',
		sourceSummary: 'Personal calendar',
		isPrimary: true,
		connectionConnectedAt: '2026-08-10T10:00:00.000Z',
		sourceCreatedAt: '2026-08-10T10:01:00.000Z',
		...overrides
	};
}

function createTargetService(options: {
	readTargets?: CalendarTarget[];
	availabilityTargets?: CalendarTarget[];
	analysisTargets?: CalendarTarget[];
	defaultSourceId?: string | null;
}) {
	return {
		listEnabledReadTargets: vi.fn().mockResolvedValue(options.readTargets ?? []),
		listAvailabilityTargets: vi.fn().mockResolvedValue(options.availabilityTargets ?? []),
		listAnalysisTargets: vi.fn().mockResolvedValue(options.analysisTargets ?? []),
		resolveExplicitSource: vi.fn(),
		resolveLegacyCalendarId: vi.fn(),
		reconcileDefaultWriteSourceId: vi.fn().mockResolvedValue(options.defaultSourceId ?? null)
	};
}

describe('GoogleCalendarReadService', () => {
	it('interleaves accounts so one stalled credential refresh cannot starve another account', async () => {
		const targets = [
			target({ calendarSourceId: 'source-a1' }),
			target({ calendarSourceId: 'source-a2', providerCalendarId: 'a2@example.com' }),
			target({ calendarSourceId: 'source-a3', providerCalendarId: 'a3@example.com' }),
			target({
				connectionId: 'connection-b',
				calendarSourceId: 'source-b',
				providerCalendarId: 'b@example.com'
			})
		];
		const targetService = createTargetService({ readTargets: targets });
		const getAuthenticatedClient = vi.fn(async (_userId: string, connectionId: string) => {
			if (connectionId === 'connection-a') {
				return new Promise(() => undefined);
			}
			return { connectionId };
		});
		const service = new GoogleCalendarReadService({} as any, {
			targetService,
			connectionService: { getAuthenticatedClient },
			createCalendarApi: () =>
				({
					events: { list: vi.fn().mockResolvedValue({ data: { items: [] } }) },
					freebusy: {} as any
				}) as any
		});

		const result = await service.listEvents({ userId: 'user-1', budgetMs: 50 });

		expect(result.sourceStatuses).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ calendarSourceId: 'source-b', status: 'success' })
			])
		);
		expect(result.sourceStatuses.filter((status) => status.status === 'timeout')).toHaveLength(
			3
		);
	});

	it('aggregates accounts, reuses clients, and collapses attendee copies without collapsing recurring instances', async () => {
		const targets = [
			target(),
			target({
				connectionId: 'connection-b',
				calendarSourceId: 'source-b',
				providerCalendarId: 'work@example.com',
				accountLabel: 'Work',
				sourceSummary: 'Work calendar',
				connectionConnectedAt: '2026-08-11T10:00:00.000Z',
				sourceCreatedAt: '2026-08-11T10:01:00.000Z'
			}),
			target({
				calendarSourceId: 'source-shared',
				providerCalendarId: 'shared@example.com',
				sourceSummary: 'Shared calendar'
			})
		];
		const targetService = createTargetService({
			readTargets: targets,
			defaultSourceId: 'source-b'
		});
		const getAuthenticatedClient = vi.fn(async (_userId: string, connectionId: string) => ({
			connectionId
		}));
		const list = vi.fn(async ({ calendarId }: { calendarId: string }) => {
			if (calendarId === 'shared@example.com') throw new Error('provider unavailable');
			if (calendarId === 'personal@example.com') {
				return {
					data: {
						items: [
							{
								id: 'personal-meeting',
								iCalUID: 'meeting-uid',
								summary: 'Planning',
								start: { dateTime: '2026-08-12T14:00:00.000Z' }
							},
							{
								id: 'series-one',
								iCalUID: 'series-uid',
								start: { dateTime: '2026-08-12T16:00:00.000Z' },
								originalStartTime: { dateTime: '2026-08-12T16:00:00.000Z' }
							},
							{
								id: 'series-two',
								iCalUID: 'series-uid',
								start: { dateTime: '2026-08-13T16:00:00.000Z' },
								originalStartTime: { dateTime: '2026-08-13T16:00:00.000Z' }
							}
						]
					}
				};
			}
			return {
				data: {
					items: [
						{
							id: 'work-meeting',
							iCalUID: 'meeting-uid',
							summary: 'Planning',
							start: { dateTime: '2026-08-12T14:00:00.000Z' }
						}
					]
				}
			};
		});
		const service = new GoogleCalendarReadService({} as any, {
			targetService,
			connectionService: { getAuthenticatedClient },
			createCalendarApi: () => ({ events: { list }, freebusy: {} as any }) as any,
			now: () => new Date('2026-08-12T12:00:00.000Z')
		});

		const result = await service.listEvents({ userId: 'user-1' });

		expect(result.partial).toBe(true);
		expect(result.event_count).toBe(3);
		expect(result.events[0]).toMatchObject({
			providerEventId: 'work-meeting',
			calendarSourceId: 'source-b',
			contributingCalendarSourceIds: ['source-a', 'source-b'],
			contributingSourceEvents: [
				{ calendarSourceId: 'source-a', providerEventId: 'personal-meeting' },
				{ calendarSourceId: 'source-b', providerEventId: 'work-meeting' }
			]
		});
		expect(result.events.filter((event) => event.iCalUID === 'series-uid')).toHaveLength(2);
		expect(result.warnings).toEqual([
			expect.objectContaining({
				code: 'CALENDAR_SOURCE_READ_FAILED',
				calendarSourceId: 'source-shared'
			})
		]);
		expect(getAuthenticatedClient).toHaveBeenCalledTimes(2);
	});

	it('returns a partial result when the wall-clock budget expires', async () => {
		const readTarget = target();
		const targetService = createTargetService({ readTargets: [readTarget] });
		const service = new GoogleCalendarReadService({} as any, {
			targetService,
			connectionService: {
				getAuthenticatedClient: vi.fn().mockResolvedValue({ connectionId: 'connection-a' })
			},
			createCalendarApi: () =>
				({
					events: { list: vi.fn(() => new Promise(() => {})) },
					freebusy: {} as any
				}) as any
		});

		const result = await service.listEvents({ userId: 'user-1', budgetMs: 50 });

		expect(result).toMatchObject({
			partial: true,
			event_count: 0,
			sourceStatuses: [expect.objectContaining({ status: 'timeout' })],
			warnings: [expect.objectContaining({ code: 'CALENDAR_PARTIAL_RESULT' })]
		});
	});

	it('uses only analysis-enabled targets for background analysis reads', async () => {
		const analysisTarget = target({ calendarSourceId: 'source-analysis' });
		const targetService = createTargetService({ analysisTargets: [analysisTarget] });
		const list = vi.fn().mockResolvedValue({ data: { items: [] } });
		const service = new GoogleCalendarReadService({} as any, {
			targetService,
			connectionService: {
				getAuthenticatedClient: vi.fn().mockResolvedValue({ connectionId: 'connection-a' })
			},
			createCalendarApi: () => ({ events: { list }, freebusy: {} as any }) as any
		});

		await service.listEvents({
			userId: 'user-1',
			capability: 'analysis',
			background: true
		});

		expect(targetService.listAnalysisTargets).toHaveBeenCalledWith('user-1');
		expect(targetService.listEnabledReadTargets).not.toHaveBeenCalled();
		expect(list).toHaveBeenCalledWith(
			expect.objectContaining({ calendarId: 'personal@example.com' })
		);
	});

	it('batches FreeBusy by connection, honors per-calendar errors, and merges healthy intervals', async () => {
		const targets = [
			target(),
			target({
				connectionId: 'connection-b',
				calendarSourceId: 'source-b',
				providerCalendarId: 'work@example.com',
				sourceSummary: 'Work calendar'
			}),
			target({
				connectionId: 'connection-b',
				calendarSourceId: 'source-c',
				providerCalendarId: 'restricted@example.com',
				sourceSummary: 'Restricted calendar'
			})
		];
		const targetService = createTargetService({ availabilityTargets: targets });
		const getAuthenticatedClient = vi.fn(async (_userId: string, connectionId: string) => ({
			connectionId
		}));
		const query = vi.fn(async ({ requestBody }: any) => {
			const ids = requestBody.items.map((item: { id: string }) => item.id);
			return ids.includes('personal@example.com')
				? {
						data: {
							calendars: {
								'personal@example.com': {
									busy: [
										{
											start: '2026-08-12T14:00:00.000Z',
											end: '2026-08-12T15:00:00.000Z'
										}
									]
								}
							}
						}
					}
				: {
						data: {
							calendars: {
								'work@example.com': {
									busy: [
										{
											start: '2026-08-12T14:30:00.000Z',
											end: '2026-08-12T16:00:00.000Z'
										}
									]
								},
								'restricted@example.com': {
									errors: [{ reason: 'accessDenied' }]
								}
							}
						}
					};
		});
		const service = new GoogleCalendarReadService({} as any, {
			targetService,
			connectionService: { getAuthenticatedClient },
			createCalendarApi: () => ({ events: {} as any, freebusy: { query } }) as any
		});

		const result = await service.getFreeBusy({
			userId: 'user-1',
			timeMin: '2026-08-12T12:00:00.000Z',
			timeMax: '2026-08-12T20:00:00.000Z'
		});

		expect(query).toHaveBeenCalledTimes(2);
		expect(getAuthenticatedClient).toHaveBeenCalledTimes(2);
		expect(result.busy).toEqual([
			{
				start: '2026-08-12T14:00:00.000Z',
				end: '2026-08-12T16:00:00.000Z',
				calendarSourceIds: ['source-a', 'source-b']
			}
		]);
		expect(result.partial).toBe(true);
		expect(result.warnings).toEqual([
			expect.objectContaining({ calendarSourceId: 'source-c' })
		]);
	});
});
