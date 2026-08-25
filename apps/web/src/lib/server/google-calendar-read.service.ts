// apps/web/src/lib/server/google-calendar-read.service.ts
import { google, type calendar_v3 } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { GoogleCalendarSourceEventIdentity } from '@buildos/shared-types';
import { toZonedTime } from 'date-fns-tz';
import { GoogleCalendarConnectionService } from './google-calendar-connection.service';
import { GoogleCalendarTargetService, type CalendarTarget } from './google-calendar-target.service';

const DEFAULT_INTERACTIVE_BUDGET_MS = 4000;
const DEFAULT_BACKGROUND_BUDGET_MS = 20_000;
const MAX_CONCURRENCY = 3;
const MAX_EVENTS_PER_SOURCE = 500;
const MAX_FREE_BUSY_ITEMS = 50;

type CalendarApi = Pick<calendar_v3.Calendar, 'events' | 'freebusy'>;

export type GoogleCalendarReadWarning = {
	code: 'CALENDAR_SOURCE_READ_FAILED' | 'CALENDAR_PARTIAL_RESULT';
	message: string;
	calendarSourceId: string;
	connectionId: string;
};

export type GoogleCalendarSourceReadStatus = {
	calendarSourceId: string;
	connectionId: string;
	providerCalendarId: string;
	status: 'success' | 'error' | 'timeout';
	itemCount: number;
};

export type AggregatedGoogleCalendarEvent = calendar_v3.Schema$Event & {
	calendarSourceId: string;
	contributingCalendarSourceIds: string[];
	contributingSourceEvents: GoogleCalendarSourceEventIdentity[];
	connectionId: string;
	connectionLabel: string;
	calendarSummary: string;
	providerCalendarId: string;
	providerEventId: string;
};

export type AggregatedGoogleCalendarEventsResponse = {
	event_count: number;
	time_range: {
		start: string;
		end: string;
		timeZone?: string;
	};
	events: AggregatedGoogleCalendarEvent[];
	partial: boolean;
	warnings: GoogleCalendarReadWarning[];
	sourceStatuses: GoogleCalendarSourceReadStatus[];
};

export type GoogleCalendarBusyInterval = {
	start: string;
	end: string;
	calendarSourceIds: string[];
};

export type AggregatedGoogleCalendarFreeBusyResponse = {
	timeMin: string;
	timeMax: string;
	busy: GoogleCalendarBusyInterval[];
	partial: boolean;
	warnings: GoogleCalendarReadWarning[];
	sourceStatuses: GoogleCalendarSourceReadStatus[];
};

type ReadServiceOptions = {
	connectionService?: Pick<GoogleCalendarConnectionService, 'getAuthenticatedClient'>;
	targetService?: Pick<
		GoogleCalendarTargetService,
		| 'listEnabledReadTargets'
		| 'listAvailabilityTargets'
		| 'listAnalysisTargets'
		| 'resolveExplicitSource'
		| 'resolveLegacyCalendarId'
		| 'reconcileDefaultWriteSourceId'
	>;
	createCalendarApi?: (auth: unknown) => CalendarApi;
	now?: () => Date;
	clock?: () => number;
};

class CalendarReadBudgetExpiredError extends Error {
	constructor() {
		super('calendar_read_budget_expired');
		this.name = 'CalendarReadBudgetExpiredError';
	}
}

function chunk<T>(values: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let index = 0; index < values.length; index += size) {
		chunks.push(values.slice(index, index + size));
	}
	return chunks;
}

function interleaveTargetsByConnection(targets: CalendarTarget[]): CalendarTarget[] {
	const groups = new Map<string, CalendarTarget[]>();
	for (const target of targets) {
		groups.set(target.connectionId, [...(groups.get(target.connectionId) ?? []), target]);
	}
	const queues = Array.from(groups.values());
	const interleaved: CalendarTarget[] = [];
	for (let index = 0; ; index += 1) {
		let appended = false;
		for (const queue of queues) {
			const target = queue[index];
			if (!target) continue;
			interleaved.push(target);
			appended = true;
		}
		if (!appended) return interleaved;
	}
}

function eventStart(event: calendar_v3.Schema$Event): string {
	return event.start?.dateTime ?? event.start?.date ?? event.created ?? '';
}

function eventOccurrenceKey(event: calendar_v3.Schema$Event): string {
	return (
		event.originalStartTime?.dateTime ??
		event.originalStartTime?.date ??
		event.start?.dateTime ??
		event.start?.date ??
		''
	);
}

function targetRank(target: CalendarTarget, defaultSourceId: string | null): string {
	return [
		target.calendarSourceId === defaultSourceId ? '0' : '1',
		target.connectionConnectedAt,
		target.sourceCreatedAt,
		target.calendarSourceId
	].join('|');
}

function safeBudget(value: number | undefined, fallback: number): number {
	if (!Number.isFinite(value) || value == null) return fallback;
	return Math.max(50, Math.min(value, DEFAULT_BACKGROUND_BUDGET_MS));
}

export class GoogleCalendarReadService {
	private readonly connectionService: Pick<
		GoogleCalendarConnectionService,
		'getAuthenticatedClient'
	>;
	private readonly targetService: Pick<
		GoogleCalendarTargetService,
		| 'listEnabledReadTargets'
		| 'listAvailabilityTargets'
		| 'listAnalysisTargets'
		| 'resolveExplicitSource'
		| 'resolveLegacyCalendarId'
		| 'reconcileDefaultWriteSourceId'
	>;
	private readonly createCalendarApi: (auth: unknown) => CalendarApi;
	private readonly now: () => Date;
	private readonly clock: () => number;

	constructor(admin: TypedSupabaseClient, options: ReadServiceOptions = {}) {
		this.connectionService =
			options.connectionService ?? new GoogleCalendarConnectionService(admin);
		this.targetService = options.targetService ?? new GoogleCalendarTargetService(admin);
		this.createCalendarApi =
			options.createCalendarApi ??
			((auth) => google.calendar({ version: 'v3', auth: auth as OAuth2Client }));
		this.now = options.now ?? (() => new Date());
		this.clock = options.clock ?? (() => Date.now());
	}

	private async resolveReadTargets(params: {
		userId: string;
		calendarSourceId?: string;
		calendarSourceIds?: string[];
		calendarId?: string;
		capability?: 'read' | 'analysis';
	}): Promise<CalendarTarget[]> {
		const capability = params.capability ?? 'read';
		if (params.calendarSourceIds?.length) {
			const sourceIds = Array.from(new Set(params.calendarSourceIds));
			return Promise.all(
				sourceIds.map((sourceId) =>
					this.targetService.resolveExplicitSource(params.userId, sourceId, capability)
				)
			);
		}
		if (params.calendarSourceId) {
			return [
				await this.targetService.resolveExplicitSource(
					params.userId,
					params.calendarSourceId,
					capability
				)
			];
		}
		if (params.calendarId) {
			return [
				await this.targetService.resolveLegacyCalendarId(
					params.userId,
					params.calendarId,
					capability
				)
			];
		}
		return capability === 'analysis'
			? this.targetService.listAnalysisTargets(params.userId)
			: this.targetService.listEnabledReadTargets(params.userId);
	}

	private async resolveAvailabilityTargets(params: {
		userId: string;
		calendarSourceId?: string;
		calendarId?: string;
	}): Promise<CalendarTarget[]> {
		if (params.calendarSourceId) {
			return [
				await this.targetService.resolveExplicitSource(
					params.userId,
					params.calendarSourceId,
					'availability'
				)
			];
		}
		if (params.calendarId) {
			return [
				await this.targetService.resolveLegacyCalendarId(
					params.userId,
					params.calendarId,
					'availability'
				)
			];
		}
		return this.targetService.listAvailabilityTargets(params.userId);
	}

	private async withinBudget<T>(operation: Promise<T>, deadline: number): Promise<T> {
		const remaining = deadline - this.clock();
		if (remaining <= 0) throw new CalendarReadBudgetExpiredError();

		let timeout: ReturnType<typeof setTimeout> | undefined;
		try {
			return await Promise.race([
				operation,
				new Promise<T>((_, reject) => {
					timeout = setTimeout(
						() => reject(new CalendarReadBudgetExpiredError()),
						remaining
					);
				})
			]);
		} finally {
			if (timeout) clearTimeout(timeout);
		}
	}

	private async mapBounded<T, R>(values: T[], mapper: (value: T) => Promise<R>): Promise<R[]> {
		const results = new Array<R>(values.length);
		let cursor = 0;
		const worker = async () => {
			while (cursor < values.length) {
				const index = cursor++;
				results[index] = await mapper(values[index]!);
			}
		};
		await Promise.all(
			Array.from({ length: Math.min(MAX_CONCURRENCY, values.length) }, () => worker())
		);
		return results;
	}

	private clientForConnection(
		userId: string,
		connectionId: string,
		cache: Map<string, Promise<unknown>>
	): Promise<unknown> {
		let client = cache.get(connectionId);
		if (!client) {
			client = this.connectionService.getAuthenticatedClient(userId, connectionId);
			cache.set(connectionId, client);
		}
		return client;
	}

	private async listTargetEvents(params: {
		userId: string;
		target: CalendarTarget;
		timeMin: string;
		timeMax: string;
		maxResults: number;
		q?: string;
		timeZone?: string;
		deadline: number;
		clientCache: Map<string, Promise<unknown>>;
	}): Promise<calendar_v3.Schema$Event[]> {
		const auth = await this.withinBudget(
			this.clientForConnection(params.userId, params.target.connectionId, params.clientCache),
			params.deadline
		);
		const calendar = this.createCalendarApi(auth);
		const events: calendar_v3.Schema$Event[] = [];
		let pageToken: string | undefined;

		do {
			const remaining = params.maxResults - events.length;
			if (remaining <= 0) break;
			const response = await this.withinBudget(
				calendar.events.list({
					calendarId: params.target.providerCalendarId,
					timeMin: params.timeMin,
					timeMax: params.timeMax,
					singleEvents: true,
					orderBy: 'startTime',
					maxResults: Math.min(250, remaining),
					pageToken,
					q: params.q,
					timeZone: params.timeZone
				}),
				params.deadline
			);
			events.push(...(response.data.items ?? []));
			pageToken = response.data.nextPageToken ?? undefined;
		} while (pageToken);

		return events;
	}

	async listEvents(params: {
		userId: string;
		calendarSourceId?: string;
		calendarSourceIds?: string[];
		calendarId?: string;
		capability?: 'read' | 'analysis';
		timeMin?: string;
		timeMax?: string;
		maxResults?: number;
		q?: string;
		timeZone?: string;
		budgetMs?: number;
		background?: boolean;
	}): Promise<AggregatedGoogleCalendarEventsResponse> {
		const now = this.now();
		const timeMin = params.timeMin ?? now.toISOString();
		const timeMax =
			params.timeMax ?? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
		const maxResults = Math.max(
			1,
			Math.min(Math.floor(params.maxResults ?? 200), MAX_EVENTS_PER_SOURCE)
		);
		const budgetMs = safeBudget(
			params.budgetMs,
			params.background ? DEFAULT_BACKGROUND_BUDGET_MS : DEFAULT_INTERACTIVE_BUDGET_MS
		);
		const deadline = this.clock() + budgetMs;
		const targets = await this.resolveReadTargets(params);
		const defaultSourceId = await this.targetService
			.reconcileDefaultWriteSourceId(params.userId)
			.catch(() => null);
		const clientCache = new Map<string, Promise<unknown>>();

		// A slow credential refresh for one account must not occupy every worker
		// slot while later accounts wait behind all of its sources. Round-robin the
		// connections so bounded concurrency gives each account an early chance.
		const orderedTargets = interleaveTargetsByConnection(targets);
		const targetResults = await this.mapBounded(orderedTargets, async (target) => {
			try {
				const events = await this.listTargetEvents({
					...params,
					target,
					timeMin,
					timeMax,
					maxResults,
					deadline,
					clientCache
				});
				return { target, status: 'success' as const, events };
			} catch (error) {
				return {
					target,
					status:
						error instanceof CalendarReadBudgetExpiredError
							? ('timeout' as const)
							: ('error' as const),
					events: [] as calendar_v3.Schema$Event[]
				};
			}
		});

		const warnings: GoogleCalendarReadWarning[] = [];
		const sourceStatuses: GoogleCalendarSourceReadStatus[] = [];
		const candidates: Array<{
			event: AggregatedGoogleCalendarEvent;
			target: CalendarTarget;
		}> = [];
		for (const result of targetResults) {
			sourceStatuses.push({
				calendarSourceId: result.target.calendarSourceId,
				connectionId: result.target.connectionId,
				providerCalendarId: result.target.providerCalendarId,
				status: result.status,
				itemCount: result.events.length
			});
			if (result.status !== 'success') {
				warnings.push({
					code:
						result.status === 'timeout'
							? 'CALENDAR_PARTIAL_RESULT'
							: 'CALENDAR_SOURCE_READ_FAILED',
					message:
						result.status === 'timeout'
							? `Calendar read budget expired for ${result.target.sourceSummary}`
							: `Could not read ${result.target.sourceSummary}`,
					calendarSourceId: result.target.calendarSourceId,
					connectionId: result.target.connectionId
				});
				continue;
			}

			for (const event of result.events) {
				if (!event.id) continue;
				candidates.push({
					target: result.target,
					event: {
						...event,
						calendarSourceId: result.target.calendarSourceId,
						contributingCalendarSourceIds: [result.target.calendarSourceId],
						contributingSourceEvents: [
							{
								calendarSourceId: result.target.calendarSourceId,
								providerEventId: event.id
							}
						],
						connectionId: result.target.connectionId,
						connectionLabel: result.target.accountLabel,
						calendarSummary: result.target.sourceSummary,
						providerCalendarId: result.target.providerCalendarId,
						providerEventId: event.id
					}
				});
			}
		}

		const chooseCandidate = (
			left: (typeof candidates)[number],
			right: (typeof candidates)[number]
		) =>
			targetRank(left.target, defaultSourceId) <= targetRank(right.target, defaultSourceId)
				? left
				: right;
		const mergeCandidates = (
			left: (typeof candidates)[number],
			right: (typeof candidates)[number]
		) => {
			const selected = chooseCandidate(left, right);
			const sourceIds = Array.from(
				new Set([
					...left.event.contributingCalendarSourceIds,
					...right.event.contributingCalendarSourceIds
				])
			);
			const sourceEvents = Array.from(
				new Map(
					[
						...left.event.contributingSourceEvents,
						...right.event.contributingSourceEvents
					].map((identity) => [
						`${identity.calendarSourceId}\u0000${identity.providerEventId}`,
						identity
					])
				).values()
			);
			return {
				...selected,
				event: {
					...selected.event,
					contributingCalendarSourceIds: sourceIds,
					contributingSourceEvents: sourceEvents
				}
			};
		};

		const exact = new Map<string, (typeof candidates)[number]>();
		for (const candidate of candidates) {
			const key = `${candidate.event.providerCalendarId}\u0000${candidate.event.providerEventId}`;
			const existing = exact.get(key);
			exact.set(key, existing ? mergeCandidates(existing, candidate) : candidate);
		}

		const collapsed = new Map<string, (typeof candidates)[number]>();
		for (const candidate of exact.values()) {
			// Recurring instances share an iCalUID, so include their occurrence start. This still
			// collapses attendee copies across accounts without deleting later series instances.
			const key = candidate.event.iCalUID
				? `ical\u0000${candidate.event.iCalUID}\u0000${eventOccurrenceKey(candidate.event)}`
				: `event\u0000${candidate.event.providerCalendarId}\u0000${candidate.event.providerEventId}`;
			const existing = collapsed.get(key);
			collapsed.set(key, existing ? mergeCandidates(existing, candidate) : candidate);
		}

		const events = Array.from(collapsed.values())
			.map(({ event }) => event)
			.sort((left, right) => eventStart(left).localeCompare(eventStart(right)))
			.slice(0, maxResults);
		return {
			event_count: events.length,
			time_range: { start: timeMin, end: timeMax, timeZone: params.timeZone },
			events,
			partial: warnings.length > 0,
			warnings,
			sourceStatuses
		};
	}

	async getFreeBusy(params: {
		userId: string;
		calendarSourceId?: string;
		calendarId?: string;
		timeMin: string;
		timeMax: string;
		timeZone?: string;
		budgetMs?: number;
		background?: boolean;
	}): Promise<AggregatedGoogleCalendarFreeBusyResponse> {
		const budgetMs = safeBudget(
			params.budgetMs,
			params.background ? DEFAULT_BACKGROUND_BUDGET_MS : DEFAULT_INTERACTIVE_BUDGET_MS
		);
		const deadline = this.clock() + budgetMs;
		const targets = await this.resolveAvailabilityTargets(params);
		const groups = new Map<string, CalendarTarget[]>();
		for (const target of targets) {
			groups.set(target.connectionId, [...(groups.get(target.connectionId) ?? []), target]);
		}
		const batches = Array.from(groups.values()).flatMap((group) =>
			chunk(group, MAX_FREE_BUSY_ITEMS)
		);
		const clientCache = new Map<string, Promise<unknown>>();
		const warnings: GoogleCalendarReadWarning[] = [];
		const sourceStatuses: GoogleCalendarSourceReadStatus[] = [];
		const intervals: GoogleCalendarBusyInterval[] = [];

		const batchResults = await this.mapBounded(batches, async (batch) => {
			try {
				const auth = await this.withinBudget(
					this.clientForConnection(params.userId, batch[0]!.connectionId, clientCache),
					deadline
				);
				const response = await this.withinBudget(
					this.createCalendarApi(auth).freebusy.query({
						requestBody: {
							timeMin: params.timeMin,
							timeMax: params.timeMax,
							timeZone: params.timeZone,
							items: batch.map((target) => ({ id: target.providerCalendarId }))
						}
					}),
					deadline
				);
				return { batch, response, status: 'success' as const };
			} catch (error) {
				return {
					batch,
					response: null,
					status:
						error instanceof CalendarReadBudgetExpiredError
							? ('timeout' as const)
							: ('error' as const)
				};
			}
		});

		for (const result of batchResults) {
			for (const target of result.batch) {
				if (result.status !== 'success' || !result.response) {
					sourceStatuses.push({
						calendarSourceId: target.calendarSourceId,
						connectionId: target.connectionId,
						providerCalendarId: target.providerCalendarId,
						status: result.status,
						itemCount: 0
					});
					warnings.push({
						code:
							result.status === 'timeout'
								? 'CALENDAR_PARTIAL_RESULT'
								: 'CALENDAR_SOURCE_READ_FAILED',
						message:
							result.status === 'timeout'
								? `Availability read budget expired for ${target.sourceSummary}`
								: `Could not read availability for ${target.sourceSummary}`,
						calendarSourceId: target.calendarSourceId,
						connectionId: target.connectionId
					});
					continue;
				}

				const providerResult = result.response.data.calendars?.[target.providerCalendarId];
				if (!providerResult || (providerResult.errors?.length ?? 0) > 0) {
					sourceStatuses.push({
						calendarSourceId: target.calendarSourceId,
						connectionId: target.connectionId,
						providerCalendarId: target.providerCalendarId,
						status: 'error',
						itemCount: 0
					});
					warnings.push({
						code: 'CALENDAR_SOURCE_READ_FAILED',
						message: `Google did not return availability for ${target.sourceSummary}`,
						calendarSourceId: target.calendarSourceId,
						connectionId: target.connectionId
					});
					continue;
				}

				const busy = (providerResult.busy ?? []).filter(
					(interval): interval is { start: string; end: string } =>
						Boolean(interval.start && interval.end)
				);
				sourceStatuses.push({
					calendarSourceId: target.calendarSourceId,
					connectionId: target.connectionId,
					providerCalendarId: target.providerCalendarId,
					status: 'success',
					itemCount: busy.length
				});
				intervals.push(
					...busy.map((interval) => ({
						start: interval.start,
						end: interval.end,
						calendarSourceIds: [target.calendarSourceId]
					}))
				);
			}
		}

		const merged: GoogleCalendarBusyInterval[] = [];
		for (const interval of intervals.sort(
			(left, right) => Date.parse(left.start) - Date.parse(right.start)
		)) {
			const previous = merged.at(-1);
			if (previous && Date.parse(interval.start) <= Date.parse(previous.end)) {
				if (Date.parse(interval.end) > Date.parse(previous.end))
					previous.end = interval.end;
				previous.calendarSourceIds = Array.from(
					new Set([...previous.calendarSourceIds, ...interval.calendarSourceIds])
				);
			} else {
				merged.push({ ...interval, calendarSourceIds: [...interval.calendarSourceIds] });
			}
		}

		return {
			timeMin: params.timeMin,
			timeMax: params.timeMax,
			busy: merged,
			partial: warnings.length > 0,
			warnings,
			sourceStatuses
		};
	}

	async findAvailableSlots(params: {
		userId: string;
		calendarSourceId?: string;
		calendarId?: string;
		timeMin: string;
		timeMax: string;
		durationMinutes?: number;
		preferredHours?: number[];
		timeZone?: string;
		budgetMs?: number;
	}): Promise<{
		available_slots: Array<{
			start: string;
			end: string;
			duration_minutes: number;
			timeZone?: string;
		}>;
		total_available: number;
		search_params: {
			timeMin: string;
			timeMax: string;
			duration_minutes: number;
			preferred_hours?: number[];
			timeZone?: string;
		};
		partial: boolean;
		warnings: GoogleCalendarReadWarning[];
		sourceStatuses: GoogleCalendarSourceReadStatus[];
	}> {
		const durationMinutes = Math.max(1, Math.min(params.durationMinutes ?? 60, 24 * 60));
		const freeBusy = await this.getFreeBusy(params);
		const searchStart = new Date(params.timeMin);
		const searchEnd = new Date(params.timeMax);
		const availableSlots: Array<{
			start: string;
			end: string;
			duration_minutes: number;
			timeZone?: string;
		}> = [];

		for (
			let current = new Date(searchStart);
			current < searchEnd;
			current = new Date(current.getTime() + 30 * 60 * 1000)
		) {
			const end = new Date(current.getTime() + durationMinutes * 60 * 1000);
			if (end > searchEnd) break;
			const blocked = freeBusy.busy.some(
				(interval) => current < new Date(interval.end) && end > new Date(interval.start)
			);
			const hour = params.timeZone
				? toZonedTime(current, params.timeZone).getHours()
				: current.getHours();
			if (!blocked && (!params.preferredHours || params.preferredHours.includes(hour))) {
				availableSlots.push({
					start: current.toISOString(),
					end: end.toISOString(),
					duration_minutes: durationMinutes,
					timeZone: params.timeZone
				});
			}
		}

		return {
			available_slots: availableSlots.slice(0, 10),
			total_available: availableSlots.length,
			search_params: {
				timeMin: params.timeMin,
				timeMax: params.timeMax,
				duration_minutes: durationMinutes,
				preferred_hours: params.preferredHours,
				timeZone: params.timeZone
			},
			partial: freeBusy.partial,
			warnings: freeBusy.warnings,
			sourceStatuses: freeBusy.sourceStatuses
		};
	}
}
