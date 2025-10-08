// apps/web/src/lib/services/scheduledSmsUpdate.service.ts
/**
 * Scheduled SMS Update Service - Phase 3
 *
 * Handles updating and canceling scheduled SMS messages when calendar events
 * are rescheduled, cancelled, or modified.
 *
 * This service is called by the calendar webhook service after processing
 * calendar event changes to ensure SMS reminders stay in sync.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';

interface EventChange {
	calendarEventId: string;
	type: 'deleted' | 'rescheduled' | 'updated';
	newStart?: string; // ISO timestamp
	newEnd?: string;
	newTitle?: string;
}

interface SMSUpdateResult {
	success: boolean;
	updated: number;
	cancelled: number;
	regenerated: number;
	errors: number;
}

export class ScheduledSmsUpdateService {
	private supabase: SupabaseClient<Database>;

	constructor(supabase: SupabaseClient<Database>) {
		this.supabase = supabase;
	}

	/**
	 * Process calendar event changes and update scheduled SMS messages
	 *
	 * This is the main entry point called by the calendar webhook service
	 */
	async processCalendarEventChanges(
		userId: string,
		changes: EventChange[]
	): Promise<SMSUpdateResult> {
		console.log(`[SMSUpdate] Processing ${changes.length} calendar changes for user ${userId}`);

		const result: SMSUpdateResult = {
			success: true,
			updated: 0,
			cancelled: 0,
			regenerated: 0,
			errors: 0
		};

		if (changes.length === 0) {
			return result;
		}

		// Group changes by type for efficient processing
		const deletions = changes.filter((c) => c.type === 'deleted');
		const reschedules = changes.filter((c) => c.type === 'rescheduled');
		const updates = changes.filter((c) => c.type === 'updated');

		// Process deletions (cancel SMS)
		if (deletions.length > 0) {
			const cancelled = await this.cancelSMSForDeletedEvents(userId, deletions);
			result.cancelled = cancelled;
		}

		// Process reschedules (update scheduled_for time)
		if (reschedules.length > 0) {
			const updated = await this.rescheduleSMSForEvents(userId, reschedules);
			result.updated = updated;
		}

		// Process updates (regenerate message content)
		if (updates.length > 0) {
			const regenerated = await this.regenerateSMSForEvents(userId, updates);
			result.regenerated = regenerated;
		}

		console.log(`[SMSUpdate] Completed:`, result);
		return result;
	}

	/**
	 * Cancel scheduled SMS messages for deleted calendar events
	 */
	private async cancelSMSForDeletedEvents(
		userId: string,
		deletions: EventChange[]
	): Promise<number> {
		try {
			const eventIds = deletions.map((d) => d.calendarEventId);

			console.log(`[SMSUpdate] Cancelling SMS for ${eventIds.length} deleted events`);

			// Find all scheduled SMS messages for these events
			const { data: smsMessages, error: fetchError } = await this.supabase
				.from('scheduled_sms_messages')
				.select('id, calendar_event_id, status')
				.eq('user_id', userId)
				.in('calendar_event_id', eventIds)
				.in('status', ['scheduled', 'pending']);

			if (fetchError) {
				console.error('[SMSUpdate] Error fetching SMS messages:', fetchError);
				return 0;
			}

			if (!smsMessages || smsMessages.length === 0) {
				console.log('[SMSUpdate] No scheduled SMS found for deleted events');
				return 0;
			}

			console.log(`[SMSUpdate] Found ${smsMessages.length} SMS messages to cancel`);

			// Update status to cancelled
			const { error: updateError } = await this.supabase
				.from('scheduled_sms_messages')
				.update({
					status: 'cancelled',
					cancellation_reason: 'event_deleted',
					updated_at: new Date().toISOString()
				})
				.in(
					'id',
					smsMessages.map((m) => m.id)
				);

			if (updateError) {
				console.error('[SMSUpdate] Error cancelling SMS messages:', updateError);
				return 0;
			}

			// Cancel pending send_sms jobs in the worker queue
			await this.cancelSMSJobsInQueue(smsMessages.map((m) => m.id));

			console.log(`[SMSUpdate] Successfully cancelled ${smsMessages.length} SMS messages`);
			return smsMessages.length;
		} catch (error) {
			console.error('[SMSUpdate] Error in cancelSMSForDeletedEvents:', error);
			return 0;
		}
	}

	/**
	 * Reschedule SMS messages when event times change
	 */
	private async rescheduleSMSForEvents(
		userId: string,
		reschedules: EventChange[]
	): Promise<number> {
		try {
			console.log(`[SMSUpdate] Rescheduling SMS for ${reschedules.length} events`);

			let updatedCount = 0;

			for (const change of reschedules) {
				if (!change.newStart) {
					console.warn('[SMSUpdate] Skipping reschedule with no newStart:', change);
					continue;
				}

				// Find scheduled SMS for this event
				const { data: smsMessages, error: fetchError } = await this.supabase
					.from('scheduled_sms_messages')
					.select('id, calendar_event_id, scheduled_for, user_id')
					.eq('user_id', userId)
					.eq('calendar_event_id', change.calendarEventId)
					.in('status', ['scheduled', 'pending'])
					.single();

				if (fetchError || !smsMessages) {
					// No SMS found for this event, that's okay
					continue;
				}

				// Get user's SMS preferences for lead time
				const { data: preferences } = await this.supabase
					.from('user_sms_preferences')
					.select('event_reminder_lead_time_minutes')
					.eq('user_id', userId)
					.single();

				const leadTimeMinutes = preferences?.event_reminder_lead_time_minutes || 15;

				// Calculate new scheduled time
				const newEventStart = new Date(change.newStart);
				const newScheduledFor = new Date(newEventStart.getTime() - leadTimeMinutes * 60000);

				// Check if new time is in the past
				if (newScheduledFor < new Date()) {
					console.log(
						`[SMSUpdate] New time is in past, cancelling SMS for event ${change.calendarEventId}`
					);
					await this.supabase
						.from('scheduled_sms_messages')
						.update({
							status: 'cancelled',
							cancellation_reason: 'event_rescheduled_to_past',
							updated_at: new Date().toISOString()
						})
						.eq('id', smsMessages.id);
					updatedCount++;
					continue;
				}

				// Update the scheduled time
				const { error: updateError } = await this.supabase
					.from('scheduled_sms_messages')
					.update({
						scheduled_for: newScheduledFor.toISOString(),
						event_start: change.newStart,
						event_end: change.newEnd || change.newStart,
						updated_at: new Date().toISOString()
					})
					.eq('id', smsMessages.id);

				if (updateError) {
					console.error('[SMSUpdate] Error rescheduling SMS:', updateError);
					continue;
				}

				console.log(
					`[SMSUpdate] Rescheduled SMS ${smsMessages.id} to ${newScheduledFor.toISOString()}`
				);
				updatedCount++;

				// Note: The worker will automatically pick up the new scheduled_for time
				// when it processes send_sms jobs
			}

			console.log(`[SMSUpdate] Successfully rescheduled ${updatedCount} SMS messages`);
			return updatedCount;
		} catch (error) {
			console.error('[SMSUpdate] Error in rescheduleSMSForEvents:', error);
			return 0;
		}
	}

	/**
	 * Regenerate SMS message content when event details change
	 */
	private async regenerateSMSForEvents(userId: string, updates: EventChange[]): Promise<number> {
		try {
			console.log(`[SMSUpdate] Regenerating SMS for ${updates.length} updated events`);

			let regeneratedCount = 0;

			for (const change of updates) {
				// Find scheduled SMS for this event
				const { data: smsMessage, error: fetchError } = await this.supabase
					.from('scheduled_sms_messages')
					.select('id, calendar_event_id, status')
					.eq('user_id', userId)
					.eq('calendar_event_id', change.calendarEventId)
					.in('status', ['scheduled', 'pending'])
					.single();

				if (fetchError || !smsMessage) {
					// No SMS found for this event, that's okay
					continue;
				}

				// Call worker API to regenerate the message
				const regenerated = await this.requestMessageRegeneration(
					smsMessage.id,
					change.newTitle
				);

				if (regenerated) {
					regeneratedCount++;
				}
			}

			console.log(`[SMSUpdate] Successfully regenerated ${regeneratedCount} SMS messages`);
			return regeneratedCount;
		} catch (error) {
			console.error('[SMSUpdate] Error in regenerateSMSForEvents:', error);
			return 0;
		}
	}

	/**
	 * Cancel pending send_sms jobs in the worker queue
	 */
	private async cancelSMSJobsInQueue(smsMessageIds: string[]): Promise<void> {
		try {
			// Query queue_jobs for pending send_sms jobs with these message IDs
			const { data: jobs, error } = await this.supabase
				.from('queue_jobs')
				.select('id, metadata')
				.eq('job_type', 'send_sms')
				.eq('status', 'pending');

			if (error || !jobs) {
				console.warn('[SMSUpdate] Could not fetch queue jobs:', error);
				return;
			}

			// Filter jobs that match our SMS message IDs
			const jobsToCancel = jobs.filter((job) => {
				try {
					const metadata =
						typeof job.metadata === 'string' ? JSON.parse(job.metadata) : job.metadata;
					return (
						metadata.scheduledSmsId && smsMessageIds.includes(metadata.scheduledSmsId)
					);
				} catch {
					return false;
				}
			});

			if (jobsToCancel.length === 0) {
				return;
			}

			console.log(`[SMSUpdate] Cancelling ${jobsToCancel.length} send_sms jobs in queue`);

			// Update job status to cancelled
			const { error: cancelError } = await this.supabase
				.from('queue_jobs')
				.update({
					status: 'failed',
					error: 'Cancelled due to event deletion',
					updated_at: new Date().toISOString()
				})
				.in(
					'id',
					jobsToCancel.map((j) => j.id)
				);

			if (cancelError) {
				console.error('[SMSUpdate] Error cancelling queue jobs:', cancelError);
			}
		} catch (error) {
			console.error('[SMSUpdate] Error in cancelSMSJobsInQueue:', error);
		}
	}

	/**
	 * Request message regeneration from worker service
	 */
	private async requestMessageRegeneration(
		smsMessageId: string,
		newTitle?: string
	): Promise<boolean> {
		try {
			// Note: This would call the worker API endpoint when it's implemented
			// For now, we'll just mark it as needing regeneration in the database

			const { error } = await this.supabase
				.from('scheduled_sms_messages')
				.update({
					// Mark for regeneration - worker will regenerate before sending
					status: 'pending',
					updated_at: new Date().toISOString(),
					event_title: newTitle || undefined
				})
				.eq('id', smsMessageId);

			if (error) {
				console.error('[SMSUpdate] Error marking for regeneration:', error);
				return false;
			}

			console.log(`[SMSUpdate] Marked SMS ${smsMessageId} for regeneration`);
			return true;
		} catch (error) {
			console.error('[SMSUpdate] Error in requestMessageRegeneration:', error);
			return false;
		}
	}

	/**
	 * Helper: Extract event changes from calendar sync batch results
	 *
	 * This is called by CalendarWebhookService after processBatchEventChanges
	 */
	static extractEventChangesFromBatch(
		taskEventUpdates: any[],
		deletions: string[],
		calendarEvents: Map<string, any>
	): EventChange[] {
		const changes: EventChange[] = [];

		// Handle deletions
		for (const deletion of deletions) {
			const taskEvent = calendarEvents.get(deletion);
			if (taskEvent?.calendar_event_id) {
				changes.push({
					calendarEventId: taskEvent.calendar_event_id,
					type: 'deleted'
				});
			}
		}

		// Handle updates/reschedules
		for (const update of taskEventUpdates) {
			if (update.event_start) {
				changes.push({
					calendarEventId: update.calendar_event_id || update.id,
					type: 'rescheduled',
					newStart: update.event_start,
					newEnd: update.event_end,
					newTitle: update.event_title
				});
			} else if (update.event_title) {
				changes.push({
					calendarEventId: update.calendar_event_id || update.id,
					type: 'updated',
					newTitle: update.event_title
				});
			}
		}

		return changes;
	}
}
