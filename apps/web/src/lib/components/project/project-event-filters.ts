import type { OntoEvent } from '$lib/types/onto';

export type ProjectEventBucketKey = 'upcoming' | 'recent' | 'past';

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_PAST_WINDOW_MS = 30 * DAY_MS;

function readTimeMs(value: string | null | undefined): number | null {
	if (!value) return null;
	const time = new Date(value).getTime();
	return Number.isFinite(time) ? time : null;
}

export function getEventStartMs(event: OntoEvent): number | null {
	return readTimeMs(event.start_at);
}

export function getEventEndMs(event: OntoEvent): number | null {
	const explicitEnd = readTimeMs(event.end_at);
	if (explicitEnd !== null) return explicitEnd;

	const start = getEventStartMs(event);
	if (start === null) return null;
	return event.all_day ? start + DAY_MS - 1 : start;
}

export function isEventPast(event: OntoEvent, nowMs = Date.now()): boolean {
	const end = getEventEndMs(event);
	return end !== null && end < nowMs;
}

export function getUpcomingEvents(events: OntoEvent[], nowMs = Date.now()): OntoEvent[] {
	return events
		.filter((event) => !isEventPast(event, nowMs))
		.sort((a, b) => (getEventStartMs(a) ?? Infinity) - (getEventStartMs(b) ?? Infinity));
}

export function getProjectEventBuckets(events: OntoEvent[], nowMs = Date.now()) {
	const recentCutoff = nowMs - RECENT_PAST_WINDOW_MS;
	const upcoming: OntoEvent[] = [];
	const recent: OntoEvent[] = [];
	const past: OntoEvent[] = [];

	for (const event of events) {
		const end = getEventEndMs(event);
		if (end === null || end >= nowMs) {
			upcoming.push(event);
		} else if (end >= recentCutoff) {
			recent.push(event);
		} else {
			past.push(event);
		}
	}

	upcoming.sort((a, b) => (getEventStartMs(a) ?? Infinity) - (getEventStartMs(b) ?? Infinity));
	const pastSort = (a: OntoEvent, b: OntoEvent) =>
		(getEventEndMs(b) ?? -Infinity) - (getEventEndMs(a) ?? -Infinity);
	recent.sort(pastSort);
	past.sort(pastSort);

	return { upcoming, recent, past };
}
