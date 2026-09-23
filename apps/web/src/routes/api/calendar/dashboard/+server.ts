// apps/web/src/routes/api/calendar/dashboard/+server.ts
import { env as privateEnv } from '$env/dynamic/private';
import { z } from 'zod';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { GoogleCalendarConnectionService } from '$lib/server/google-calendar-connection.service';
import { isMultiCalendarUserAllowed } from '$lib/server/google-calendar-feature';
import { ApiResponse } from '$lib/utils/api-response';
import type { CalendarItem, DashboardCalendarPayload } from '$lib/types/calendar-items';
import type { RequestHandler } from './$types';

/**
 * Everything the dashboard calendar needs to paint, in one request: every BuildOS calendar
 * item in range plus (with `meta=1`) the display toggles and connected Google calendars.
 *
 * This replaces a prefs + connections -> items client waterfall. Items come back for every
 * layer regardless of the toggles, so the page filters locally and flipping a toggle never
 * waits on the network. Live Google reads stay on /api/calendar/events so a slow provider
 * never holds back BuildOS items.
 */

const querySchema = z
	.object({
		start: z.string().datetime({ offset: true }),
		end: z.string().datetime({ offset: true }),
		meta: z.enum(['0', '1']).optional()
	})
	.strict()
	.refine((value) => Date.parse(value.start) < Date.parse(value.end), {
		message: 'start must be earlier than end'
	});

const ITEM_LIMIT = 2000;

export const GET: RequestHandler = async ({ url, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user) return ApiResponse.unauthorized('Unauthorized');

	const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) {
		return ApiResponse.badRequest('Invalid calendar range', parsed.error.flatten());
	}
	const { start, end, meta } = parsed.data;
	const includeMeta = meta === '1';

	const itemsPromise = supabase.rpc('list_calendar_items', {
		p_start: start,
		p_end: end,
		p_include_events: true,
		p_include_task_range: true,
		p_include_task_start: true,
		p_include_task_due: true,
		p_limit: ITEM_LIMIT
	});

	const preferencesPromise = includeMeta
		? supabase
				.from('user_calendar_preferences')
				.select('show_events, show_task_scheduled, show_task_start, show_task_due')
				.eq('user_id', user.id)
				.maybeSingle()
		: null;

	const connectionsPromise =
		includeMeta && isMultiCalendarUserAllowed(user.id, privateEnv)
			? new GoogleCalendarConnectionService(createAdminSupabaseClient())
					.listConnections(user.id)
					.then(
						(value) => ({ value, failed: false }),
						(error: unknown) => {
							console.warn('[DashboardCalendar] Failed to list connections:', error);
							return { value: null, failed: true };
						}
					)
			: null;

	try {
		const [itemsResult, preferencesResult, connectionsResult] = await Promise.all([
			itemsPromise,
			preferencesPromise,
			connectionsPromise
		]);

		if (itemsResult.error) {
			console.error('[DashboardCalendar] RPC error:', itemsResult.error);
			return ApiResponse.internalError(itemsResult.error, 'Failed to load calendar items');
		}

		const payload: DashboardCalendarPayload = {
			items: (itemsResult.data ?? []) as CalendarItem[]
		};

		if (includeMeta) {
			if (preferencesResult?.error) {
				console.warn(
					'[DashboardCalendar] Failed to load display preferences:',
					preferencesResult.error
				);
			}
			const stored = preferencesResult?.data;
			payload.meta = {
				preferences: {
					show_events: stored?.show_events ?? true,
					show_task_scheduled: stored?.show_task_scheduled ?? true,
					show_task_start: stored?.show_task_start ?? true,
					show_task_due: stored?.show_task_due ?? true
				},
				connections: connectionsResult?.value ?? null,
				connectionsError: connectionsResult?.failed ?? false
			};
		}

		const response = ApiResponse.success(payload);
		response.headers.set('Cache-Control', 'private, no-store');
		return response;
	} catch (error) {
		console.error('[DashboardCalendar] Failed to load calendar:', error);
		return ApiResponse.internalError(error, 'Failed to load calendar');
	}
};
