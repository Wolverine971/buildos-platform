// apps/web/src/routes/api/admin/sms/daily-scheduler/trigger/+server.ts
import { ApiResponse, parseRequestBody } from '$lib/utils/api-response';
import type { RequestHandler } from './$types';

interface TriggerOptions {
	user_ids?: string[]; // Specific users to process (optional)
	dry_run?: boolean; // Preview without queueing jobs
	override_date?: string; // Override the date (YYYY-MM-DD)
	skip_quiet_hours?: boolean; // Ignore quiet hours for testing
	skip_daily_limit?: boolean; // Ignore daily SMS limits
}

// Date validation regex: YYYY-MM-DD
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Helper to validate date format
function isValidDateFormat(date: string): boolean {
	if (!DATE_REGEX.test(date)) return false;

	// Also check if it's a valid date
	const dateObj = new Date(date + 'T00:00:00');
	return dateObj instanceof Date && !isNaN(dateObj.getTime());
}

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	// 1. Admin authentication check using standard pattern
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	if (!user.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	// 2. Parse and validate request body
	const options = await parseRequestBody<TriggerOptions>(request);
	if (!options) {
		return ApiResponse.badRequest('Invalid request body');
	}

	// 3. Validate options
	if (options.override_date && !isValidDateFormat(options.override_date)) {
		return ApiResponse.badRequest('Invalid date format. Use YYYY-MM-DD format.');
	}

	if (options.user_ids && !Array.isArray(options.user_ids)) {
		return ApiResponse.badRequest('user_ids must be an array');
	}

	if (options.user_ids && options.user_ids.length > 100) {
		return ApiResponse.badRequest('Maximum 100 users can be processed at once');
	}

	try {
		// 4. Fetch eligible users
		let smsPreferencesQuery = supabase
			.from('user_sms_preferences')
			.select('user_id, event_reminders_enabled, event_reminder_lead_time_minutes')
			.eq('event_reminders_enabled', true)
			.eq('phone_verified', true)
			.eq('opted_out', false);

		// Filter specific users if provided
		if (options.user_ids && options.user_ids.length > 0) {
			smsPreferencesQuery = smsPreferencesQuery.in('user_id', options.user_ids);
		}

		const { data: smsPreferences, error: prefError } = await smsPreferencesQuery;

		if (prefError) {
			return ApiResponse.databaseError(prefError);
		}

		if (!smsPreferences || smsPreferences.length === 0) {
			return ApiResponse.success({
				message: 'No eligible users found',
				users_processed: 0,
				jobs_queued: 0
			});
		}

		// 5. Get user timezones
		const userIds = smsPreferences.map((p) => p.user_id);
		const { data: users } = await supabase
			.from('users')
			.select('id, timezone')
			.in('id', userIds);

		const timezoneMap = new Map(users?.map((u) => [u.id, u.timezone || 'UTC']) || []);

		// 6. Process each user (dry run or actual)
		const results = {
			users_processed: smsPreferences.length,
			jobs_queued: 0,
			dry_run: options.dry_run || false,
			date_override: options.override_date,
			details: [] as any[]
		};

		const targetDate = options.override_date || new Date().toISOString().split('T')[0];

		for (const pref of smsPreferences) {
			const userTimezone = timezoneMap.get(pref.user_id) || 'UTC';

			const jobData = {
				userId: pref.user_id,
				date: targetDate,
				timezone: userTimezone,
				leadTimeMinutes: pref.event_reminder_lead_time_minutes || 15,
				// Add test flags if specified
				skipQuietHours: options.skip_quiet_hours || false,
				skipDailyLimit: options.skip_daily_limit || false,
				manualTrigger: true,
				triggeredBy: user.id
			};

			if (!options.dry_run) {
				// Queue the job using the existing queue system
				const { error: queueError } = await supabase.rpc('add_queue_job', {
					p_user_id: pref.user_id,
					p_job_type: 'schedule_daily_sms',
					p_metadata: jobData,
					p_scheduled_for: new Date().toISOString(),
					p_priority: 5,
					p_dedup_key: `manual-schedule-daily-sms-${pref.user_id}-${targetDate}-${Date.now()}`
				});

				if (!queueError) {
					results.jobs_queued++;
				}

				results.details.push({
					user_id: pref.user_id,
					timezone: userTimezone,
					lead_time_minutes: pref.event_reminder_lead_time_minutes,
					queued: !queueError,
					error: queueError?.message
				});
			} else {
				// Dry run - just collect what would be queued
				results.details.push({
					user_id: pref.user_id,
					timezone: userTimezone,
					lead_time_minutes: pref.event_reminder_lead_time_minutes,
					would_queue: true,
					job_data: jobData
				});
			}
		}

		// 7. Return results
		return ApiResponse.success({
			message: options.dry_run
				? `Dry run completed. Would queue ${results.users_processed} jobs`
				: `Successfully queued ${results.jobs_queued} of ${results.users_processed} SMS scheduling jobs`,
			...results
		});
	} catch (error) {
		console.error('Manual SMS scheduler trigger error:', error);
		return ApiResponse.internalError(error, 'Failed to trigger SMS scheduler');
	}
};

// GET endpoint to check job status
export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	// Admin authentication check using standard pattern
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	if (!user.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	const userId = url.searchParams.get('user_id');
	const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0];

	if (!userId) {
		return ApiResponse.badRequest('user_id parameter required');
	}

	// Validate date format if provided
	if (date && !isValidDateFormat(date)) {
		return ApiResponse.badRequest('Invalid date format. Use YYYY-MM-DD format.');
	}

	// Fetch scheduled SMS messages for this user and date
	const { data: messages, error } = await supabase
		.from('scheduled_sms_messages')
		.select(
			`
      *,
      sms_messages!scheduled_sms_messages_sms_message_id_fkey (
        status,
        twilio_sid,
        sent_at,
        phone_number
      )
    `
		)
		.eq('user_id', userId)
		.gte('scheduled_for', `${date}T00:00:00`)
		.lt('scheduled_for', `${date}T23:59:59`)
		.order('scheduled_for', { ascending: true });

	if (error) {
		return ApiResponse.databaseError(error);
	}

	return ApiResponse.success({
		user_id: userId,
		date,
		message_count: messages?.length || 0,
		messages
	});
};
