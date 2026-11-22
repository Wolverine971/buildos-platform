// apps/web/src/lib/server/today-calendar-sources.ts
// The connected Google calendars Today's two-week strip reads from. Loaded with the page so
// the browser only asks Google for events when there is a calendar to ask, and already knows
// each calendar's name and colour when they arrive.
import { env as privateEnv } from '$env/dynamic/private';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { GoogleCalendarConnectionService } from '$lib/server/google-calendar-connection.service';
import { isMultiCalendarUserAllowed } from '$lib/server/google-calendar-feature';
import type { GoogleCalendarSourceSummary } from '$lib/types/google-calendar-integration';

export type TodayCalendarSource = GoogleCalendarSourceSummary & {
	connectionLabel: string;
	emailAddress: string;
};

/** Readable calendars on active connections. Empty (never throws) when there are none. */
export async function loadTodayCalendarSources(userId: string): Promise<TodayCalendarSource[]> {
	if (!isMultiCalendarUserAllowed(userId, privateEnv)) return [];
	try {
		// Connection rows are service-only tables; the lookup is scoped to this user's id.
		const payload = await new GoogleCalendarConnectionService(
			createAdminSupabaseClient()
		).listConnections(userId);
		return payload.connections.flatMap((connection) =>
			connection.status === 'active'
				? connection.sources
						.filter((source) => source.readEnabled && !source.providerDeletedAt)
						.map((source) => ({
							...source,
							connectionLabel: connection.accountLabel,
							emailAddress: connection.emailAddress
						}))
				: []
		);
	} catch (error) {
		console.warn('[Today] Failed to list connected calendars:', error);
		return [];
	}
}
