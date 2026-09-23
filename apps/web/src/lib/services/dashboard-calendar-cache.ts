// apps/web/src/lib/services/dashboard-calendar-cache.ts
import { browser } from '$app/environment';
import { page } from '$app/state';
import { addDays, addMonths, startOfDay } from 'date-fns';
import { getMonthDates, getWeekDates } from '$lib/utils/schedulingUtils';
import { requireApiData } from '$lib/utils/api-client-helpers';
import { fetchConnectedGoogleCalendarEvents } from '$lib/services/calendar-items.service';
import type {
	CalendarItem,
	DashboardCalendarDisplayPreferences,
	DashboardCalendarMeta,
	DashboardCalendarPayload,
	DashboardCalendarProjectSummary
} from '$lib/types/calendar-items';
import type { ConnectedGoogleCalendarEventsPayload } from '$lib/types/google-calendar-integration';

/**
 * Session-lived cache behind /dashboard/calendar.
 *
 * The page paints from here synchronously (no spinner on repeat visits) and revalidates in
 * the background. The dashboard calls `prefetchDashboardCalendar()` on hover/focus of its
 * Calendar button so a first visit's data is usually in flight before the click lands.
 *
 * BuildOS items are fetched for the visible period plus one period on each side, so
 * flipping to the previous/next month or week paints from cache while the next window loads.
 * Provider (Google) reads keep the old visible-range-plus-a-week window: they are slower and
 * capped at 500 events, so widening them would risk silently truncating busy calendars.
 */

export type DashboardCalendarViewMode = 'day' | 'week' | 'month';

type Range = { start: Date; end: Date };

type ItemsEntry = { start: number; end: number; items: CalendarItem[]; fetchedAt: number };
type TimedEntry<T> = { value: T; fetchedAt: number };

export type SavedDashboardCalendarState = {
	viewMode: DashboardCalendarViewMode;
	hiddenCalendarSourceIds: string[];
	/** Lets a cold prefetch start the Google read without waiting for meta. */
	hasConnectedSources: boolean;
};

const VIEW_STATE_KEY = 'dashboard_calendar_state_v3';
const PROVIDER_BUFFER_DAYS = 7;
const FRESH_MS = 30_000;
const MAX_ITEM_WINDOWS = 8;
const MAX_PROVIDER_WINDOWS = 6;
const PROVIDER_MAX_RESULTS = 500;

// The account the cached data belongs to. Sign-in/out are client-side navigations, so the
// module outlives a session; a different user must never paint (or save) the last one's data.
let ownerUserId: string | null = null;
let itemWindows: ItemsEntry[] = [];
// Bumped by invalidate so a response that started before a write never re-enters the cache.
let generation = 0;
// Bumped when the owner changes so a response from the previous account stores nothing.
let ownerEpoch = 0;
const itemRequests = new Map<string, Promise<DashboardCalendarPayload>>();
let metaEntry: TimedEntry<DashboardCalendarMeta> | null = null;
// Once a toggle is flipped in this tab it stays authoritative for the session, so a meta read
// racing the debounced preference save can never flip it back.
let preferencesOverride: DashboardCalendarDisplayPreferences | null = null;
// Project labels accumulate across windows for the session; they rarely change.
const projectSummaries = new Map<string, DashboardCalendarProjectSummary>();
const providerWindows = new Map<string, TimedEntry<ConnectedGoogleCalendarEventsPayload>>();
const providerRequests = new Map<string, Promise<ConnectedGoogleCalendarEventsPayload>>();

const isViewMode = (value: unknown): value is DashboardCalendarViewMode =>
	value === 'day' || value === 'week' || value === 'month';

export function readSavedDashboardCalendarState(): SavedDashboardCalendarState {
	const fallback: SavedDashboardCalendarState = {
		viewMode: 'month',
		hiddenCalendarSourceIds: [],
		hasConnectedSources: false
	};
	if (!browser) return fallback;
	try {
		const raw = localStorage.getItem(VIEW_STATE_KEY);
		if (!raw) return fallback;
		const parsed = JSON.parse(raw) as Partial<
			Record<keyof SavedDashboardCalendarState, unknown>
		>;
		return {
			viewMode: isViewMode(parsed.viewMode) ? parsed.viewMode : fallback.viewMode,
			hiddenCalendarSourceIds: Array.isArray(parsed.hiddenCalendarSourceIds)
				? parsed.hiddenCalendarSourceIds.filter(
						(id): id is string => typeof id === 'string'
					)
				: [],
			hasConnectedSources: parsed.hasConnectedSources === true
		};
	} catch {
		return fallback;
	}
}

export function saveDashboardCalendarState(patch: Partial<SavedDashboardCalendarState>): void {
	if (!browser) return;
	try {
		const next = { ...readSavedDashboardCalendarState(), ...patch };
		localStorage.setItem(VIEW_STATE_KEY, JSON.stringify(next));
	} catch {
		// Storage can be unavailable (private mode, quota); the view still works without it.
	}
}

/** The dates the grid actually shows for a view. */
export function getDashboardCalendarViewRange(date: Date, mode: DashboardCalendarViewMode): Range {
	if (mode === 'day') {
		const start = startOfDay(date);
		return { start, end: addDays(start, 1) };
	}
	const dates = mode === 'month' ? getMonthDates(date) : getWeekDates(date);
	const start = startOfDay(dates[0] ?? date);
	const end = startOfDay(addDays(dates[dates.length - 1] ?? date, 1));
	return { start, end };
}

function getItemsWindow(date: Date, mode: DashboardCalendarViewMode): Range {
	if (mode === 'month') {
		return {
			start: getDashboardCalendarViewRange(addMonths(date, -1), 'month').start,
			end: getDashboardCalendarViewRange(addMonths(date, 1), 'month').end
		};
	}
	const view = getDashboardCalendarViewRange(date, mode);
	return { start: addDays(view.start, -7), end: addDays(view.end, 7) };
}

export function getDashboardCalendarProviderRange(
	date: Date,
	mode: DashboardCalendarViewMode
): Range {
	const view = getDashboardCalendarViewRange(date, mode);
	return {
		start: addDays(view.start, -PROVIDER_BUFFER_DAYS),
		end: addDays(view.end, PROVIDER_BUFFER_DAYS)
	};
}

const rangeKey = (range: Range) => `${range.start.toISOString()}|${range.end.toISOString()}`;
const isFresh = (fetchedAt: number) => Date.now() - fetchedAt < FRESH_MS;

export type CachedDashboardCalendarItems = {
	items: CalendarItem[];
	/** False once the data is old enough to revalidate in the background. */
	fresh: boolean;
	/** True when a fresh window also covers the neighbouring periods. */
	neighborsCached: boolean;
};

function newestCovering(range: Range): ItemsEntry | null {
	const start = range.start.getTime();
	const end = range.end.getTime();
	let best: ItemsEntry | null = null;
	for (const entry of itemWindows) {
		if (entry.start <= start && entry.end >= end) {
			if (!best || entry.fetchedAt > best.fetchedAt) best = entry;
		}
	}
	return best;
}

/** Synchronous read: the newest cached window covering the visible range. */
export function peekDashboardCalendarItems(
	date: Date,
	mode: DashboardCalendarViewMode
): CachedDashboardCalendarItems | null {
	const entry = newestCovering(getDashboardCalendarViewRange(date, mode));
	if (!entry) return null;
	const fullWindow = newestCovering(getItemsWindow(date, mode));
	return {
		items: entry.items,
		fresh: isFresh(entry.fetchedAt),
		neighborsCached: Boolean(fullWindow && isFresh(fullWindow.fetchedAt))
	};
}

export function metaHasReadableSources(meta: DashboardCalendarMeta | null | undefined): boolean {
	return Boolean(
		meta?.connections?.connections.some(
			(connection) =>
				connection.status === 'active' &&
				connection.sources.some((source) => source.readEnabled && !source.providerDeletedAt)
		)
	);
}

export function peekDashboardCalendarProject(
	projectId: string | null | undefined
): DashboardCalendarProjectSummary | null {
	return projectId ? (projectSummaries.get(projectId) ?? null) : null;
}

export function peekDashboardCalendarMeta(): DashboardCalendarMeta | null {
	return metaEntry?.value ?? null;
}

function storeItems(range: Range, items: CalendarItem[]): void {
	const start = range.start.getTime();
	const end = range.end.getTime();
	// A new window supersedes any older one it fully covers.
	itemWindows = itemWindows.filter((entry) => !(entry.start >= start && entry.end <= end));
	itemWindows.push({ start, end, items, fetchedAt: Date.now() });
	if (itemWindows.length > MAX_ITEM_WINDOWS) {
		itemWindows.sort((a, b) => b.fetchedAt - a.fetchedAt);
		itemWindows.length = MAX_ITEM_WINDOWS;
	}
}

function storeMeta(meta: DashboardCalendarMeta): void {
	metaEntry = { value: meta, fetchedAt: Date.now() };
	saveDashboardCalendarState({ hasConnectedSources: metaHasReadableSources(meta) });
}

/**
 * Fetch BuildOS items (and meta when it is missing, stale, or forced) for the window around
 * a view. Concurrent calls for the same window share one request; `force` always starts a
 * new one.
 */
export function loadDashboardCalendar(
	date: Date,
	mode: DashboardCalendarViewMode,
	options: { force?: boolean } = {}
): Promise<DashboardCalendarPayload> {
	const range = getItemsWindow(date, mode);
	const withMeta = Boolean(options.force || !metaEntry || !isFresh(metaEntry.fetchedAt));
	const key = `${rangeKey(range)}|${withMeta ? 'meta' : 'items'}`;
	const inFlight = itemRequests.get(key);
	if (inFlight && !options.force) return inFlight;

	const requestGeneration = generation;
	const requestEpoch = ownerEpoch;
	const params = new URLSearchParams({
		start: range.start.toISOString(),
		end: range.end.toISOString(),
		meta: withMeta ? '1' : '0'
	});
	const request = fetch(`/api/calendar/dashboard?${params}`)
		.then((response) =>
			requireApiData<DashboardCalendarPayload>(response, 'Failed to load calendar')
		)
		.then((payload) => {
			const sameOwner = requestEpoch === ownerEpoch;
			const meta =
				payload.meta && preferencesOverride && sameOwner
					? { ...payload.meta, preferences: preferencesOverride }
					: payload.meta;
			if (sameOwner) {
				for (const project of Object.values(payload.projects ?? {})) {
					projectSummaries.set(project.id, project);
				}
			}
			if (sameOwner && requestGeneration === generation) {
				storeItems(range, payload.items ?? []);
				if (meta) storeMeta(meta);
			}
			return {
				items: payload.items ?? [],
				projects: payload.projects ?? {},
				meta: meta ?? (sameOwner ? metaEntry?.value : undefined)
			};
		})
		.finally(() => {
			if (itemRequests.get(key) === request) itemRequests.delete(key);
		});
	itemRequests.set(key, request);
	return request;
}

export type CachedProviderEvents = {
	payload: ConnectedGoogleCalendarEventsPayload;
	fresh: boolean;
};

export function peekDashboardCalendarProviderEvents(
	date: Date,
	mode: DashboardCalendarViewMode
): CachedProviderEvents | null {
	const entry = providerWindows.get(rangeKey(getDashboardCalendarProviderRange(date, mode)));
	return entry ? { payload: entry.value, fresh: isFresh(entry.fetchedAt) } : null;
}

export function loadDashboardCalendarProviderEvents(
	date: Date,
	mode: DashboardCalendarViewMode,
	options: { force?: boolean } = {}
): Promise<ConnectedGoogleCalendarEventsPayload> {
	const range = getDashboardCalendarProviderRange(date, mode);
	const key = rangeKey(range);
	const inFlight = providerRequests.get(key);
	if (inFlight && !options.force) return inFlight;

	const requestGeneration = generation;
	const requestEpoch = ownerEpoch;

	const request = fetchConnectedGoogleCalendarEvents({
		start: range.start.toISOString(),
		end: range.end.toISOString(),
		maxResults: PROVIDER_MAX_RESULTS
	})
		.then((payload) => {
			if (requestEpoch === ownerEpoch && requestGeneration === generation) {
				providerWindows.delete(key);
				providerWindows.set(key, { value: payload, fetchedAt: Date.now() });
				if (providerWindows.size > MAX_PROVIDER_WINDOWS) {
					const oldest = providerWindows.keys().next().value;
					if (oldest) providerWindows.delete(oldest);
				}
			}
			return payload;
		})
		.finally(() => {
			if (providerRequests.get(key) === request) providerRequests.delete(key);
		});
	providerRequests.set(key, request);
	return request;
}

/** Write-through for display toggles so the next visit paints with them. */
export function updateDashboardCalendarPreferences(
	preferences: DashboardCalendarDisplayPreferences
): void {
	preferencesOverride = preferences;
	if (metaEntry) {
		metaEntry = { ...metaEntry, value: { ...metaEntry.value, preferences } };
	}
}

/**
 * Bind the cache to the signed-in user before reading it. When the user differs from the
 * one the cache was filled for (sign-out, account switch), everything goes: items, Google
 * events, meta (connected account emails), project labels, in-flight requests, and the
 * display-preference override, so nothing from the last account is painted or saved.
 */
export function setDashboardCalendarCacheOwner(userId: string | null | undefined): void {
	const next = userId ?? null;
	if (next === ownerUserId) return;
	ownerUserId = next;
	ownerEpoch += 1;
	generation += 1;
	itemWindows = [];
	itemRequests.clear();
	metaEntry = null;
	preferencesOverride = null;
	projectSummaries.clear();
	providerWindows.clear();
	providerRequests.clear();
}

/** Drop cached data after a write so the next read reflects it. */
export function invalidateDashboardCalendar(options: { meta?: boolean } = {}): void {
	generation += 1;
	itemWindows = [];
	providerWindows.clear();
	if (options.meta) metaEntry = null;
}

/**
 * Warm the calendar before navigation. Safe to call repeatedly (hover, focus, touch):
 * fresh data and in-flight requests are reused, and failures stay silent because the page
 * retries on mount.
 */
export function prefetchDashboardCalendar(): void {
	if (!browser) return;
	// Callers do not pass the user; the root layout always carries it in page data.
	setDashboardCalendarCacheOwner(page.data?.user?.id);
	const today = new Date();
	const saved = readSavedDashboardCalendarState();
	const cached = peekDashboardCalendarItems(today, saved.viewMode);
	const metaFresh = Boolean(metaEntry && isFresh(metaEntry.fetchedAt));
	if (!cached?.fresh || !metaFresh) {
		void loadDashboardCalendar(today, saved.viewMode).catch(() => undefined);
	}

	const meta = metaEntry?.value;
	const eventsShown = meta ? meta.preferences.show_events : true;
	const hasSources = meta ? metaHasReadableSources(meta) : saved.hasConnectedSources;
	const provider = peekDashboardCalendarProviderEvents(today, saved.viewMode);
	if (eventsShown && hasSources && !provider?.fresh) {
		void loadDashboardCalendarProviderEvents(today, saved.viewMode).catch(() => undefined);
	}
}
