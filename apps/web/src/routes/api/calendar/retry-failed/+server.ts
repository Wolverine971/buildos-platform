// apps/web/src/routes/api/calendar/retry-failed/+server.ts
import { ApiResponse } from '$lib/utils/api-response';
import type { RequestHandler } from './$types';
import { CalendarService } from '$lib/services/calendar-service';
import { PRIVATE_CRON_SECRET } from '$env/static/private';
import { isAuthorizedCronRequest } from '$lib/utils/security';
import { createAdminSupabaseClient } from '$lib/supabase/admin';

// Optional: Vercel Cron Job for processing failed calendar operations
export const GET: RequestHandler = async ({ request }) => {
	if (!isAuthorizedCronRequest(request, PRIVATE_CRON_SECRET)) {
		return ApiResponse.unauthorized();
	}

	const supabase = createAdminSupabaseClient();

	try {
		// Find tasks with failed calendar sync from the last 24 hours
		const { data: failedEvents } = await supabase
			.from('task_calendar_events')
			.select(
				`
				*,
				task:tasks(id, title, start_date, duration_minutes, user_id, status, description, project_id)
			`
			)
			.eq('sync_status', 'failed')
			.gte('last_synced_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
			.limit(50); // Process max 50 at a time

		if (!failedEvents?.length) {
			return ApiResponse.success({ message: 'No failed events to retry', count: 0 });
		}

		const calendarService = new CalendarService(supabase);

		// Group events by user for bulk processing
		const eventsByUser = new Map<string, typeof failedEvents>();

		for (const event of failedEvents) {
			if (!event.task || event.task.status === 'done') continue;

			const userId = event.task.user_id;
			if (!eventsByUser.has(userId)) {
				eventsByUser.set(userId, []);
			}
			eventsByUser.get(userId)!.push(event);
		}

		let totalRetried = 0;
		let totalStillFailed = 0;
		const userResults = [];

		// Process each user's events in bulk
		for (const [userId, userEvents] of eventsByUser) {
			// Prepare bulk update operations
			const updates = userEvents.map((event) => {
				if (!event.task.start_date) {
					throw new Error(`Task ${event.task.id} has no start date`);
				}

				const startDate = new Date(event.task.start_date);
				if (startDate.getHours() === 0) startDate.setHours(9, 0, 0, 0);

				const endDate = new Date(startDate);
				endDate.setMinutes(endDate.getMinutes() + (event.task.duration_minutes || 60));

				return {
					event_id: event.calendar_event_id,
					calendar_id: event.calendar_id || 'primary',
					start_time: startDate.toISOString(),
					end_time: endDate.toISOString(),
					summary: event.task.title,
					description: event.task.description || undefined
				};
			});

			try {
				// Use bulk update operation
				const result = await calendarService.bulkUpdateCalendarEvents(
					userId,
					updates,
					{ batchSize: 10 } // Process 10 at a time
				);

				// Update database records based on results
				for (const updateResult of result.results) {
					const eventRecord = userEvents.find(
						(e) => e.calendar_event_id === updateResult.eventId
					);

					if (!eventRecord) continue;

					if (updateResult.success) {
						await supabase
							.from('task_calendar_events')
							.update({
								sync_status: 'synced',
								sync_error: null,
								last_synced_at: new Date().toISOString()
							})
							.eq('id', eventRecord.id);
						totalRetried++;
					} else {
						await supabase
							.from('task_calendar_events')
							.update({
								sync_error: updateResult.error || 'Update failed',
								last_synced_at: new Date().toISOString()
							})
							.eq('id', eventRecord.id);
						totalStillFailed++;
					}
				}

				userResults.push({
					userId,
					updated: result.updated,
					failed: result.failed
				});
			} catch (error: any) {
				console.error(`Failed to process events for user ${userId}:`, error);
				totalStillFailed += userEvents.length;

				// Update all events for this user as still failed
				for (const event of userEvents) {
					await supabase
						.from('task_calendar_events')
						.update({
							sync_error: error.message || 'Bulk update failed',
							last_synced_at: new Date().toISOString()
						})
						.eq('id', event.id);
				}

				userResults.push({
					userId,
					updated: 0,
					failed: userEvents.length,
					error: error.message
				});
			}
		}

		return ApiResponse.success({
			message: 'Retry completed',
			processed: failedEvents.length,
			retried: totalRetried,
			stillFailed: totalStillFailed,
			userResults
		});
	} catch (error) {
		console.error('Retry failed events error:', error);
		return ApiResponse.internalError(error, 'Failed to retry events');
	}
};
