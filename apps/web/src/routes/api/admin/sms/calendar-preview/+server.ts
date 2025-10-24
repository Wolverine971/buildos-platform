// apps/web/src/routes/api/admin/sms/calendar-preview/+server.ts
import { ApiResponse } from '$lib/utils/api-response';
import type { RequestHandler } from './$types';
import { parseISO, addMinutes, isBefore, startOfDay, endOfDay } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';

interface UserCalendarInfo {
	user_id: string;
	user_email: string;
	user_name: string | null;
	timezone: string;
	calendar_connected: boolean;
	total_events: number;
	synced_events: number;
	events_that_would_trigger_sms: number;
	events_skipped: {
		past_reminder_time: number;
		all_day: number;
		quiet_hours: number;
		no_start_time: number;
	};
	sms_preferences: {
		event_reminders_enabled: boolean;
		phone_verified: boolean;
		daily_sms_count: number;
		daily_sms_limit: number;
		quiet_hours_start: string | null;
		quiet_hours_end: string | null;
	} | null;
	event_details: Array<{
		event_title: string;
		event_start: string;
		event_end: string | null;
		would_trigger_sms: boolean;
		skip_reason: string | null;
		reminder_time: string | null;
	}>;
	errors: string[];
}

// Date validation regex: YYYY-MM-DD
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateFormat(date: string): boolean {
	if (!DATE_REGEX.test(date)) return false;
	const dateObj = new Date(date + 'T00:00:00');
	return dateObj instanceof Date && !isNaN(dateObj.getTime());
}

function isInQuietHours(
	reminderTime: Date,
	timezone: string,
	quietStart: string | null,
	quietEnd: string | null
): boolean {
	if (!quietStart || !quietEnd) return false;

	const reminderTimeInUserTz = toZonedTime(reminderTime, timezone);
	const reminderHour = reminderTimeInUserTz.getHours();
	const reminderMinute = reminderTimeInUserTz.getMinutes();

	const quietStartParts = quietStart.split(':').map(Number);
	const quietEndParts = quietEnd.split(':').map(Number);

	const quietStartHour = quietStartParts[0] ?? 0;
	const quietStartMinute = quietStartParts[1] ?? 0;
	const quietEndHour = quietEndParts[0] ?? 0;
	const quietEndMinute = quietEndParts[1] ?? 0;

	const reminderMinutes = reminderHour * 60 + reminderMinute;
	const quietStartMinutes = quietStartHour * 60 + quietStartMinute;
	const quietEndMinutes = quietEndHour * 60 + quietEndMinute;

	// Handle overnight quiet hours (e.g., 22:00 to 08:00)
	return quietStartMinutes < quietEndMinutes
		? reminderMinutes >= quietStartMinutes && reminderMinutes < quietEndMinutes
		: reminderMinutes >= quietStartMinutes || reminderMinutes < quietEndMinutes;
}

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	// 1. Admin authentication check
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	if (!user.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	// 2. Parse query parameters
	const userIdsParam = url.searchParams.get('user_ids');
	const date = url.searchParams.get('date');

	// 3. Validate parameters
	if (!userIdsParam) {
		return ApiResponse.badRequest('user_ids parameter required');
	}

	if (!date) {
		return ApiResponse.badRequest('date parameter required');
	}

	if (!isValidDateFormat(date)) {
		return ApiResponse.badRequest('Invalid date format. Use YYYY-MM-DD format.');
	}

	// Validate date is not too far in the past (more than 90 days)
	const targetDate = new Date(date);
	const ninetyDaysAgo = new Date();
	ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

	if (targetDate < ninetyDaysAgo) {
		return ApiResponse.badRequest(
			'Cannot preview calendar info for dates more than 90 days in the past'
		);
	}

	// Validate date is not too far in the future (more than 365 days)
	const oneYearFromNow = new Date();
	oneYearFromNow.setDate(oneYearFromNow.getDate() + 365);

	if (targetDate > oneYearFromNow) {
		return ApiResponse.badRequest(
			'Cannot preview calendar info for dates more than 1 year in the future'
		);
	}

	let userIds: string[];
	try {
		userIds = JSON.parse(userIdsParam);
		if (!Array.isArray(userIds) || userIds.length === 0) {
			return ApiResponse.badRequest('user_ids must be a non-empty array');
		}
		if (userIds.length > 100) {
			return ApiResponse.badRequest('Maximum 100 users can be checked at once');
		}

		// Validate user IDs are valid UUIDs
		const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
		const invalidIds = userIds.filter((id) => typeof id !== 'string' || !uuidRegex.test(id));
		if (invalidIds.length > 0) {
			return ApiResponse.badRequest(
				`Invalid user IDs format: ${invalidIds.slice(0, 3).join(', ')}${invalidIds.length > 3 ? '...' : ''}`
			);
		}
	} catch (error) {
		return ApiResponse.badRequest('Invalid user_ids format. Expected JSON array.');
	}

	try {
		// 4. Fetch user data
		const { data: users, error: usersError } = await supabase
			.from('users')
			.select('id, email, name, timezone')
			.in('id', userIds);

		if (usersError) {
			return ApiResponse.databaseError(usersError);
		}

		if (!users || users.length === 0) {
			return ApiResponse.success({
				date,
				results: [],
				message: 'No users found with provided IDs'
			});
		}

		// 5. Fetch calendar connection status
		const { data: calendarTokens } = await supabase
			.from('user_calendar_tokens')
			.select('user_id')
			.in('user_id', userIds);

		const calendarConnectedSet = new Set(calendarTokens?.map((t) => t.user_id) || []);

		// 6. Fetch SMS preferences
		const { data: smsPrefs } = await supabase
			.from('user_sms_preferences')
			.select(
				'user_id, event_reminders_enabled, phone_verified, daily_sms_count, daily_sms_limit, quiet_hours_start, quiet_hours_end, event_reminder_lead_time_minutes'
			)
			.in('user_id', userIds);

		const smsPrefsMap = new Map(smsPrefs?.map((p) => [p.user_id, p]) || []);

		// 7. Process each user
		const results: UserCalendarInfo[] = [];

		for (const userRecord of users) {
			const userTimezone = userRecord.timezone || 'UTC';
			const calendarConnected = calendarConnectedSet.has(userRecord.id);
			const userSmsPrefs = smsPrefsMap.get(userRecord.id);
			const leadTimeMinutes = userSmsPrefs?.event_reminder_lead_time_minutes || 15;

			const userInfo: UserCalendarInfo = {
				user_id: userRecord.id,
				user_email: userRecord.email,
				user_name: userRecord.name,
				timezone: userTimezone,
				calendar_connected: calendarConnected,
				total_events: 0,
				synced_events: 0,
				events_that_would_trigger_sms: 0,
				events_skipped: {
					past_reminder_time: 0,
					all_day: 0,
					quiet_hours: 0,
					no_start_time: 0
				},
				sms_preferences: userSmsPrefs
					? {
							event_reminders_enabled: userSmsPrefs.event_reminders_enabled || false,
							phone_verified: userSmsPrefs.phone_verified || false,
							daily_sms_count: userSmsPrefs.daily_sms_count || 0,
							daily_sms_limit: userSmsPrefs.daily_sms_limit || 10,
							quiet_hours_start: userSmsPrefs.quiet_hours_start,
							quiet_hours_end: userSmsPrefs.quiet_hours_end
						}
					: null,
				event_details: [],
				errors: []
			};

			// Skip if no calendar connected
			if (!calendarConnected) {
				userInfo.errors.push('Calendar not connected');
				results.push(userInfo);
				continue;
			}

			// Calculate date range for calendar events
			const userDate = parseISO(`${date}T00:00:00`);
			const startOfUserDay = toZonedTime(startOfDay(userDate), userTimezone);
			const endOfUserDay = toZonedTime(endOfDay(userDate), userTimezone);
			const startUTC = fromZonedTime(startOfUserDay, userTimezone);
			const endUTC = fromZonedTime(endOfUserDay, userTimezone);

			// 8. Fetch calendar events for this user and date
			const { data: calendarEvents, error: eventsError } = await supabase
				.from('task_calendar_events')
				.select('calendar_event_id, event_title, event_start, event_end, sync_status')
				.eq('user_id', userRecord.id)
				.gte('event_start', startUTC.toISOString())
				.lte('event_start', endUTC.toISOString())
				.order('event_start', { ascending: true });

			if (eventsError) {
				userInfo.errors.push(`Failed to fetch calendar events: ${eventsError.message}`);
				results.push(userInfo);
				continue;
			}

			userInfo.total_events = calendarEvents?.length || 0;
			userInfo.synced_events =
				calendarEvents?.filter((e) => e.sync_status === 'synced').length || 0;

			// 9. Analyze each event
			const now = new Date();

			for (const event of calendarEvents || []) {
				try {
					let wouldTrigger = true;
					let skipReason: string | null = null;

					// Check if event_start is null
					if (!event.event_start) {
						wouldTrigger = false;
						skipReason = 'No start time';
						userInfo.events_skipped.no_start_time++;
					}
					// Check if all-day event
					else if (!event.event_start.includes('T')) {
						wouldTrigger = false;
						skipReason = 'All-day event';
						userInfo.events_skipped.all_day++;
					}
					// Check if synced
					else if (event.sync_status !== 'synced') {
						wouldTrigger = false;
						skipReason = `Not synced (status: ${event.sync_status})`;
					} else {
						const parsedEventStart = parseISO(event.event_start);
						const reminderTime = addMinutes(parsedEventStart, -leadTimeMinutes);

						// Check if reminder time is in the past
						if (isBefore(reminderTime, now)) {
							wouldTrigger = false;
							skipReason = 'Reminder time is in the past';
							userInfo.events_skipped.past_reminder_time++;
						}
						// Check quiet hours
						else if (
							userSmsPrefs &&
							isInQuietHours(
								reminderTime,
								userTimezone,
								userSmsPrefs.quiet_hours_start,
								userSmsPrefs.quiet_hours_end
							)
						) {
							wouldTrigger = false;
							skipReason = 'Falls in quiet hours';
							userInfo.events_skipped.quiet_hours++;
						}

						if (wouldTrigger) {
							userInfo.events_that_would_trigger_sms++;
						}

						userInfo.event_details.push({
							event_title: event.event_title || 'Untitled Event',
							event_start: event.event_start,
							event_end: event.event_end,
							would_trigger_sms: wouldTrigger,
							skip_reason: skipReason,
							reminder_time: wouldTrigger ? reminderTime.toISOString() : null
						});
					}
				} catch (eventError) {
					// Log error but continue processing other events
					console.error(
						`Error analyzing event ${event.calendar_event_id} for user ${userRecord.id}:`,
						eventError
					);
					userInfo.errors.push(
						`Failed to analyze event: ${event.event_title || 'Untitled'}`
					);
				}
			}

			results.push(userInfo);
		}

		// 10. Return results
		return ApiResponse.success({
			date,
			total_users: results.length,
			results
		});
	} catch (error) {
		console.error('Calendar preview error:', error);
		return ApiResponse.internalError(error, 'Failed to fetch calendar preview');
	}
};
