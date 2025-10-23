import { json } from '@sveltejs/kit';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminServiceClient } from '$lib/server/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import type { RequestHandler } from './$types';

interface TriggerOptions {
	user_ids?: string[]; // Specific users to process (optional)
	dry_run?: boolean; // Preview without queueing jobs
	override_date?: string; // Override the date (YYYY-MM-DD)
	skip_quiet_hours?: boolean; // Ignore quiet hours for testing
	skip_daily_limit?: boolean; // Ignore daily SMS limits
}

export const POST: RequestHandler = async ({ request, locals }) => {
	// 1. Admin authentication check
	const session = await locals.getSession();
	if (!session?.user?.id) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const adminClient = createAdminServiceClient();
	const { data: user } = await adminClient
		.from('users')
		.select('is_admin')
		.eq('id', session.user.id)
		.single();

	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	// 2. Parse options
	let options: TriggerOptions;
	try {
		options = await request.json();
	} catch (error) {
		return ApiResponse.badRequest('Invalid request body');
	}

	// 3. Rate limiting (prevent abuse) - try to use admin_activity_logs if it exists
	// Note: This table may not exist in all deployments, so we handle gracefully
	try {
		const { data: recentTriggers } = await adminClient
			.from('admin_activity_logs')
			.select('id')
			.eq('admin_user_id', session.user.id)
			.eq('action', 'sms_scheduler_manual_trigger')
			.gte('created_at', new Date(Date.now() - 3600000).toISOString()) // 1 hour
			.limit(10);

		if (recentTriggers && recentTriggers.length >= 10) {
			return ApiResponse.tooManyRequests('Maximum 10 manual triggers per hour');
		}

		// 4. Log the admin action
		await adminClient.from('admin_activity_logs').insert({
			admin_user_id: session.user.id,
			action: 'sms_scheduler_manual_trigger',
			metadata: options,
			ip_address: request.headers.get('x-forwarded-for') || 'unknown'
		});
	} catch (error) {
		// If admin_activity_logs table doesn't exist, log to console instead
		console.log('Admin action (SMS scheduler manual trigger):', {
			admin_user_id: session.user.id,
			action: 'sms_scheduler_manual_trigger',
			metadata: options,
			timestamp: new Date().toISOString()
		});
		// Continue execution - don't fail just because logging table is missing
	}

	try {
		// 5. Fetch eligible users
		let smsPreferencesQuery = adminClient
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
			return ApiResponse.error('Failed to fetch SMS preferences', prefError);
		}

		if (!smsPreferences || smsPreferences.length === 0) {
			return ApiResponse.success({
				message: 'No eligible users found',
				users_processed: 0,
				jobs_queued: 0
			});
		}

		// 6. Get user timezones
		const userIds = smsPreferences.map((p) => p.user_id);
		const { data: users } = await adminClient
			.from('users')
			.select('id, timezone')
			.in('id', userIds);

		const timezoneMap = new Map(users?.map((u) => [u.id, u.timezone || 'UTC']) || []);

		// 7. Process each user (dry run or actual)
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
				triggeredBy: session.user.id
			};

			if (!options.dry_run) {
				// Queue the job using the existing queue system
				const { error: queueError } = await adminClient.rpc('add_queue_job', {
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

		// 8. Return results
		return ApiResponse.success({
			message: options.dry_run
				? `Dry run completed. Would queue ${results.users_processed} jobs`
				: `Successfully queued ${results.jobs_queued} of ${results.users_processed} SMS scheduling jobs`,
			...results
		});
	} catch (error) {
		console.error('Manual SMS scheduler trigger error:', error);
		return ApiResponse.error('Failed to trigger SMS scheduler', error);
	}
};

// GET endpoint to check job status
export const GET: RequestHandler = async ({ url, locals }) => {
	// Admin authentication check
	const session = await locals.getSession();
	if (!session?.user?.id) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const adminClient = createAdminServiceClient();
	const { data: user } = await adminClient
		.from('users')
		.select('is_admin')
		.eq('id', session.user.id)
		.single();

	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	const userId = url.searchParams.get('user_id');
	const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0];

	if (!userId) {
		return ApiResponse.badRequest('user_id parameter required');
	}

	// Fetch scheduled SMS messages for this user and date
	const { data: messages, error } = await adminClient
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
		return ApiResponse.error('Failed to fetch scheduled messages', error);
	}

	return ApiResponse.success({
		user_id: userId,
		date,
		message_count: messages?.length || 0,
		messages
	});
};
