// apps/worker/src/workers/notification/notificationWorker.ts
/**
 * Notification Worker - Processes notification delivery jobs
 *
 * Handles sending notifications via different channels:
 * - Browser push notifications
 * - In-app notifications
 * - Email (future)
 * - SMS (future)
 */

import { createServiceClient } from '@buildos/supabase-client';
import type {
	NotificationJobMetadata,
	NotificationDelivery,
	NotificationChannel,
	NotificationStatus,
	PushSubscription as PushSubscriptionType,
	EventType
} from '@buildos/shared-types';
import {
	transformEventPayload,
	validateNotificationPayload,
	getFallbackPayload
} from '@buildos/shared-types';
import type { ProcessingJob } from '../../lib/supabaseQueue.js';
import webpush from 'web-push';
import { sendEmailNotification } from './emailAdapter.js';
// import { sendSMSNotification } from "./smsAdapter.js"; // SMS disabled in notification system
import {
	createLogger,
	generateCorrelationId,
	extractCorrelationContext,
	type Logger
} from '@buildos/shared-utils';
import { checkUserPreferences } from './preferenceChecker.js';

const supabase = createServiceClient();
const logger = createLogger('worker:notification', supabase);

// =====================================================
// VAPID CONFIGURATION
// =====================================================

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:support@buildos.com';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
	webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
	logger.info('VAPID keys configured successfully');
} else {
	logger.warn('VAPID keys not configured - push notifications will not work');
}

// =====================================================
// PAYLOAD TRANSFORMATION
// =====================================================

/**
 * Enrich delivery payload with transformed event data if needed
 * If payload already has title and body, use it as-is
 * Otherwise, transform the event payload
 *
 * @param delivery - The notification delivery to enrich
 * @param eventType - The event type from job metadata (fallback if event fetch fails)
 * @param jobLogger - Logger instance
 */
async function enrichDeliveryPayload(
	delivery: NotificationDelivery,
	eventType: EventType,
	jobLogger: Logger
): Promise<NotificationDelivery> {
	// If payload already has valid title and body, check if event_type exists
	if (validateNotificationPayload(delivery.payload as any)) {
		// If event_type is already in payload, we're done
		if (delivery.payload.event_type) {
			jobLogger.debug(
				'Delivery already has valid payload with event_type, skipping transformation',
				{
					notificationDeliveryId: delivery.id,
					eventType: delivery.payload.event_type
				}
			);
			return delivery;
		}

		// Payload is valid but missing event_type - add it from job metadata
		jobLogger.debug(
			'Delivery has valid payload but missing event_type, adding from job metadata',
			{
				notificationDeliveryId: delivery.id,
				eventType
			}
		);
		return {
			...delivery,
			payload: {
				...delivery.payload,
				event_type: eventType
			}
		};
	}

	// Get the event data to transform
	const { data: event, error } = await supabase
		.from('notification_events')
		.select('event_type, payload')
		.eq('id', delivery.event_id)
		.single();

	if (error || !event) {
		jobLogger.warn('Could not fetch event for transformation', {
			notificationEventId: delivery.event_id,
			notificationDeliveryId: delivery.id,
			error: error?.message,
			usingFallbackEventType: eventType
		});
		// Use fallback payload with event type from job metadata
		const fallbackPayload = getFallbackPayload(eventType);
		return {
			...delivery,
			payload: {
				...fallbackPayload,
				event_type: eventType // Explicitly preserve event_type in fallback
			}
		};
	}

	try {
		// Transform event payload to notification payload
		const transformedPayload = transformEventPayload(
			event.event_type as EventType,
			event.payload as any
		);

		jobLogger.debug('Transformed event payload for delivery', {
			notificationDeliveryId: delivery.id,
			eventType: event.event_type
		});

		// Merge transformed payload with existing delivery payload
		// This preserves any channel-specific fields that were already set
		// IMPORTANT: Explicitly preserve event_type for preference checking
		return {
			...delivery,
			payload: {
				...transformedPayload,
				...delivery.payload, // Allow delivery payload to override if present
				event_type: event.event_type // Always preserve event_type from source event
			}
		};
	} catch (error: any) {
		jobLogger.error('Error transforming event payload', error, {
			notificationDeliveryId: delivery.id,
			eventType: event.event_type
		});
		// Use fallback payload
		const fallbackPayload = getFallbackPayload(event.event_type as EventType);
		return {
			...delivery,
			payload: {
				...fallbackPayload,
				...delivery.payload,
				event_type: event.event_type // Always preserve event_type from source event
			}
		};
	}
}

// =====================================================
// CHANNEL ADAPTERS
// =====================================================

interface DeliveryResult {
	success: boolean;
	external_id?: string;
	error?: string;
}

/**
 * Send browser push notification
 */
async function sendPushNotification(
	delivery: NotificationDelivery,
	pushSubscription: PushSubscriptionType,
	jobLogger: Logger
): Promise<DeliveryResult> {
	const pushLogger = jobLogger.child('push');

	try {
		if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
			throw new Error('VAPID keys not configured');
		}

		// Format push subscription object
		const subscription = {
			endpoint: pushSubscription.endpoint,
			keys: {
				p256dh: pushSubscription.p256dh_key,
				auth: pushSubscription.auth_key
			}
		};

		pushLogger.debug('Sending push notification', {
			notificationDeliveryId: delivery.id,
			recipientUserId: delivery.recipient_user_id,
			subscriptionId: pushSubscription.id
		});

		// Format notification payload
		// Note: payload is guaranteed to have title and body by enrichDeliveryPayload
		const payload = JSON.stringify({
			title: delivery.payload.title,
			body: delivery.payload.body,
			icon:
				delivery.payload.icon_url || '/AppImages/android/android-launchericon-192-192.png',
			badge: '/AppImages/android/android-launchericon-96-96.png',
			tag: delivery.payload.event_type || 'notification',
			requireInteraction: delivery.payload.priority === 'urgent',
			data: {
				url: delivery.payload.action_url,
				event_id: delivery.event_id,
				delivery_id: delivery.id,
				...delivery.payload.data
			}
		});

		// Send notification
		await webpush.sendNotification(subscription, payload, {
			TTL: 60 * 60 * 24, // 24 hours
			urgency: delivery.payload.priority === 'urgent' ? 'high' : 'normal'
		});

		// Update last_used_at for push subscription
		const { error: updateError } = await supabase
			.from('push_subscriptions')
			.update({ last_used_at: new Date().toISOString() })
			.eq('id', pushSubscription.id);

		if (updateError) {
			pushLogger.warn('Failed to update push subscription last_used_at', {
				subscriptionId: pushSubscription.id,
				error: updateError.message
			});
			// Don't fail the notification - it was already sent successfully
		}

		pushLogger.info('Push notification sent successfully', {
			notificationDeliveryId: delivery.id,
			subscriptionId: pushSubscription.id
		});

		return { success: true };
	} catch (error: any) {
		// Handle subscription expiration
		if (error.statusCode === 410 || error.statusCode === 404) {
			pushLogger.warn('Push subscription expired or not found', {
				notificationDeliveryId: delivery.id,
				subscriptionId: pushSubscription.id,
				statusCode: error.statusCode
			});

			// Subscription expired - deactivate it
			const { error: deactivateError } = await supabase
				.from('push_subscriptions')
				.update({ is_active: false })
				.eq('id', pushSubscription.id);

			if (deactivateError) {
				pushLogger.error(
					'Failed to deactivate expired push subscription',
					deactivateError,
					{
						subscriptionId: pushSubscription.id,
						warning: 'Subscription will be retried on next notification'
					}
				);
				// Return error anyway - the subscription is dead
			}

			return {
				success: false,
				error: 'Push subscription expired or not found'
			};
		}

		pushLogger.error('Push notification failed', error, {
			notificationDeliveryId: delivery.id,
			subscriptionId: pushSubscription.id
		});

		return {
			success: false,
			error: error.message || 'Unknown push notification error'
		};
	}
}

/**
 * Send in-app notification (insert into existing notification system)
 */
async function sendInAppNotification(
	delivery: NotificationDelivery,
	jobLogger: Logger
): Promise<DeliveryResult> {
	const inAppLogger = jobLogger.child('in_app');

	try {
		inAppLogger.debug('Creating in-app notification', {
			notificationDeliveryId: delivery.id,
			recipientUserId: delivery.recipient_user_id
		});

		// Insert into existing user_notifications table
		// Note: user_notifications schema doesn't have metadata column
		// Schema: id, user_id, type, title, message, priority, action_url, read_at, dismissed_at, expires_at, created_at
		// Note: payload is guaranteed to have title and body by enrichDeliveryPayload
		const { error } = await supabase.from('user_notifications').insert({
			user_id: delivery.recipient_user_id,
			type: delivery.payload.type || 'info',
			title: delivery.payload.title,
			message: delivery.payload.body,
			priority: delivery.payload.priority || 'normal',
			action_url: delivery.payload.action_url || undefined,
			expires_at: delivery.payload.expires_at || undefined
		});

		if (error) {
			throw error;
		}

		inAppLogger.info('In-app notification created successfully', {
			notificationDeliveryId: delivery.id,
			recipientUserId: delivery.recipient_user_id
		});

		return { success: true };
	} catch (error: any) {
		inAppLogger.error('In-app notification failed', error, {
			notificationDeliveryId: delivery.id,
			recipientUserId: delivery.recipient_user_id
		});

		return {
			success: false,
			error: error.message || 'Unknown in-app notification error'
		};
	}
}

/**
 * Route notification to appropriate channel adapter
 */
async function sendNotification(
	channel: NotificationChannel,
	delivery: NotificationDelivery,
	jobLogger: Logger
): Promise<DeliveryResult> {
	switch (channel) {
		case 'push': {
			// Get push subscription
			if (!delivery.channel_identifier) {
				return {
					success: false,
					error: 'Push subscription endpoint missing'
				};
			}

			const { data: pushSubs, error } = await supabase
				.from('push_subscriptions')
				.select('*')
				.eq('user_id', delivery.recipient_user_id)
				.eq('endpoint', delivery.channel_identifier)
				.eq('is_active', true)
				.order('created_at', { ascending: false }); // Use most recent

			if (error) {
				jobLogger.warn('Error querying push subscriptions', {
					notificationDeliveryId: delivery.id,
					recipientUserId: delivery.recipient_user_id,
					error: error.message
				});
				return {
					success: false,
					error: 'Error querying push subscriptions'
				};
			}

			if (!pushSubs || pushSubs.length === 0) {
				jobLogger.warn('Push subscription not found or inactive', {
					notificationDeliveryId: delivery.id,
					recipientUserId: delivery.recipient_user_id
				});
				return {
					success: false,
					error: 'Push subscription not found or inactive'
				};
			}

			// Use the most recent subscription if multiple exist
			const pushSub = pushSubs[0];

			// Log warning if duplicates detected
			if (pushSubs.length > 1) {
				jobLogger.warn('Multiple active push subscriptions found for same endpoint', {
					count: pushSubs.length,
					endpoint: delivery.channel_identifier,
					subscriptionIds: pushSubs.map((s) => s.id)
				});
				// TODO: Deactivate older duplicates (cleanup job)
			}

			// Convert database type to match interface
			const subscription: PushSubscriptionType = {
				...pushSub,
				created_at: pushSub.created_at || new Date().toISOString(),
				last_used_at: pushSub.last_used_at || undefined,
				user_agent: pushSub.user_agent || undefined,
				is_active: pushSub.is_active || false
			};

			return sendPushNotification(delivery, subscription, jobLogger);
		}

		case 'in_app':
			return sendInAppNotification(delivery, jobLogger);

		case 'email':
			return sendEmailNotification(delivery, jobLogger);

		case 'sms':
			// SMS disabled in notification system - only scheduled SMS (calendar reminders) are sent
			// Scheduled SMS uses add_queue_job directly, not the notification system
			jobLogger.info('SMS notifications disabled - skipping', {
				notificationDeliveryId: delivery.id
			});
			return {
				success: true
			};

		default:
			jobLogger.error('Unknown notification channel', undefined, {
				channel,
				notificationDeliveryId: delivery.id
			});
			return {
				success: false,
				error: `Unknown notification channel: ${channel}`
			};
	}
}

// =====================================================
// WORKER PROCESSOR
// =====================================================

/**
 * Process a single notification job
 */
export async function processNotification(
	job: ProcessingJob<NotificationJobMetadata>
): Promise<void> {
	const { delivery_id, channel } = job.data;

	// Extract or generate correlation ID for tracking across systems
	const correlationContext = job.data.correlationId
		? { correlationId: job.data.correlationId }
		: extractCorrelationContext(job.data as any);
	const correlationId = correlationContext.correlationId || generateCorrelationId();

	// Create child logger with correlation ID and job context
	const jobLogger = logger.child('process', {
		correlationId,
		jobId: job.id,
		notificationDeliveryId: delivery_id,
		channel
	});

	jobLogger.info('Processing notification job', {
		attempts: job.attempts
	});

	try {
		// Get delivery record
		const { data: delivery, error: fetchError } = await supabase
			.from('notification_deliveries')
			.select('*')
			.eq('id', delivery_id)
			.single();

		if (fetchError || !delivery) {
			jobLogger.error('Delivery not found', fetchError, {
				notificationDeliveryId: delivery_id
			});
			throw new Error(`Delivery ${delivery_id} not found: ${fetchError?.message}`);
		}

		// Define final states that should not be retried
		const FINAL_STATES: NotificationStatus[] = [
			'sent',
			'delivered',
			'clicked',
			'opened', // User already saw it
			'failed', // Already failed max attempts
			'bounced' // Hard bounce, don't retry
		];

		// Skip if already in a final state
		if (FINAL_STATES.includes(delivery.status as NotificationStatus)) {
			jobLogger.info('Delivery already in final state, skipping', {
				status: delivery.status
			});
			return;
		}

		// Skip if max attempts exceeded
		const maxAttempts = delivery.max_attempts || 3;
		const currentAttempts = delivery.attempts || 0;
		if (currentAttempts >= maxAttempts) {
			jobLogger.warn('Max attempts exceeded, marking as failed', {
				currentAttempts,
				maxAttempts
			});
			const { error: maxAttemptsError } = await supabase
				.from('notification_deliveries')
				.update({
					status: 'failed',
					failed_at: new Date().toISOString(),
					last_error: `Exceeded maximum attempts (${maxAttempts})`,
					updated_at: new Date().toISOString()
				})
				.eq('id', delivery_id);

			if (maxAttemptsError) {
				jobLogger.error(
					'Failed to mark delivery as failed after max attempts',
					maxAttemptsError,
					{
						notificationDeliveryId: delivery_id,
						currentAttempts,
						maxAttempts
					}
				);
				// Still return - we shouldn't retry after max attempts even if update fails
			}
			return;
		}

		// Validate required fields before processing
		if (!delivery.event_id) {
			jobLogger.error('Delivery missing required event_id', undefined, {
				notificationDeliveryId: delivery_id,
				deliveryData: {
					id: delivery.id,
					recipient_user_id: delivery.recipient_user_id,
					channel: delivery.channel
				}
			});
			throw new Error(
				`Delivery ${delivery_id} missing required event_id - cannot process notification`
			);
		}

		// Send notification (status will be updated after send completes)
		let typedDelivery: NotificationDelivery = {
			...delivery,
			channel: delivery.channel as NotificationChannel,
			status: delivery.status as NotificationStatus,
			payload: (delivery.payload as Record<string, any>) || {},
			event_id: delivery.event_id, // Required field, validated above
			subscription_id: delivery.subscription_id || undefined,
			attempts: delivery.attempts || 0,
			max_attempts: delivery.max_attempts || 3,
			channel_identifier: delivery.channel_identifier || undefined,
			sent_at: delivery.sent_at || undefined,
			delivered_at: delivery.delivered_at || undefined,
			opened_at: delivery.opened_at || undefined,
			clicked_at: delivery.clicked_at || undefined,
			failed_at: delivery.failed_at || undefined,
			last_error: delivery.last_error || undefined,
			external_id: delivery.external_id || undefined,
			tracking_id: delivery.tracking_id || undefined,
			created_at: delivery.created_at || new Date().toISOString(),
			updated_at: delivery.updated_at || new Date().toISOString()
		};

		// Enrich payload with transformed event data if needed
		// Pass event_type from job metadata as fallback
		typedDelivery = await enrichDeliveryPayload(typedDelivery, job.data.event_type, jobLogger);

		// Validate that we have a proper payload after transformation
		if (!validateNotificationPayload(typedDelivery.payload as any)) {
			jobLogger.error('Invalid payload after transformation', undefined, {
				payload: typedDelivery.payload
			});
			throw new Error('Invalid notification payload: missing or empty title/body');
		}

		const attemptNumber = (delivery.attempts || 0) + 1;
		const totalAttempts = delivery.max_attempts || 3;

		// ✅ CHECK USER PREFERENCES BEFORE SENDING
		// Preferences may have changed since the delivery was queued
		const eventType = typedDelivery.payload.event_type || 'unknown';
		const prefCheck = await checkUserPreferences(
			typedDelivery.recipient_user_id,
			eventType,
			channel,
			jobLogger
		);

		if (!prefCheck.allowed) {
			jobLogger.info('Notification cancelled - user preferences do not allow', {
				reason: prefCheck.reason,
				channel,
				eventType
			});

			// Mark delivery as cancelled (not failed)
			const { error: cancelError } = await supabase
				.from('notification_deliveries')
				.update({
					status: 'failed', // Use 'failed' status but with specific error message
					failed_at: new Date().toISOString(),
					last_error: `Cancelled: ${prefCheck.reason}`,
					attempts: (delivery.attempts || 0) + 1,
					updated_at: new Date().toISOString()
				})
				.eq('id', delivery_id);

			if (cancelError) {
				jobLogger.error('Failed to mark delivery as cancelled', cancelError, {
					notificationDeliveryId: delivery_id,
					reason: prefCheck.reason
				});
				// Still return - preferences block sending even if status update fails
			}

			// Job completes successfully (don't retry)
			jobLogger.debug('Marked delivery as cancelled', {
				notificationDeliveryId: delivery_id
			});
			return; // Exit successfully - job will be marked as completed
		}

		jobLogger.info('Sending notification', {
			attemptNumber,
			totalAttempts,
			channel
		});

		const startTime = Date.now();
		const result = await sendNotification(channel, typedDelivery, jobLogger);
		const durationMs = Date.now() - startTime;

		// Update delivery record with final status
		const updateData: any = {
			attempts: (delivery.attempts || 0) + 1,
			updated_at: new Date().toISOString()
		};

		if (result.success) {
			updateData.status = 'sent';
			updateData.sent_at = new Date().toISOString();
			if (result.external_id) {
				updateData.external_id = result.external_id;
			}

			jobLogger.info('Notification sent successfully', {
				durationMs,
				externalId: result.external_id
			});
		} else {
			updateData.status = 'failed';
			updateData.failed_at = new Date().toISOString();
			updateData.last_error = result.error;

			jobLogger.error('Notification send failed', undefined, {
				durationMs,
				error: result.error
			});
		}

		// Always update status, even if there's an error
		// Use optimistic locking to prevent race conditions
		const currentStatus = delivery.status;
		// Reuse currentAttempts declared earlier (line 519)

		const { error: updateError, count } = await supabase
			.from('notification_deliveries')
			.update(updateData)
			.eq('id', delivery_id)
			.eq('status', currentStatus) // Optimistic lock - ensure status hasn't changed
			.eq('attempts', currentAttempts); // Verify attempts match

		if (updateError) {
			jobLogger.fatal('CRITICAL: Failed to update delivery status', updateError, {
				updateData,
				warning: 'This may cause duplicate sends!'
			});
			// Still throw to mark job as failed, but the notification was already sent
			throw new Error(`Failed to update delivery status: ${updateError.message}`);
		}

		if (count === 0) {
			jobLogger.warn('Optimistic lock failed - delivery state changed during processing', {
				expectedStatus: currentStatus,
				expectedAttempts: currentAttempts,
				warning: 'Another worker may have processed this delivery concurrently'
			});
			// Don't throw - notification may have already been sent by other worker
			return;
		}

		jobLogger.debug('Updated delivery status', {
			newStatus: updateData.status,
			attempts: updateData.attempts
		});

		// If failed and can retry, throw error to trigger retry
		if (!result.success && (delivery.attempts || 0) + 1 < (delivery.max_attempts || 3)) {
			throw new Error(result.error);
		}

		// Success - job will be marked complete by the queue
	} catch (error: any) {
		jobLogger.error('Error processing notification job', error);

		// Try to mark delivery as failed if not already updated to a final state
		try {
			const { data: currentDelivery } = await supabase
				.from('notification_deliveries')
				.select('status, attempts')
				.eq('id', delivery_id)
				.single();

			// Define states that should NOT be updated (successful or bounced deliveries)
			// We DO want to update "failed" deliveries to capture latest error info
			const CLEANUP_EXCLUDED_STATES: NotificationStatus[] = [
				'sent',
				'delivered',
				'clicked',
				'opened', // User already saw it
				'bounced' // Hard bounce, don't update
			];

			// Update delivery if not in an excluded state (includes "pending" and "failed")
			if (
				currentDelivery &&
				!CLEANUP_EXCLUDED_STATES.includes(currentDelivery.status as NotificationStatus)
			) {
				const currentAttempts = currentDelivery.attempts || 0;

				const { error: updateError, count } = await supabase
					.from('notification_deliveries')
					.update({
						status: 'failed',
						failed_at: new Date().toISOString(),
						last_error: error.message,
						attempts: currentAttempts + 1,
						updated_at: new Date().toISOString()
					})
					.eq('id', delivery_id)
					.eq('status', currentDelivery.status); // Optimistic lock

				if (updateError) {
					jobLogger.error('Could not mark delivery as failed', updateError);
				} else if (count === 0) {
					jobLogger.warn('Optimistic lock failed in cleanup - delivery state changed', {
						deliveryId: delivery_id,
						expectedStatus: currentDelivery.status
					});
				} else {
					jobLogger.info('Marked delivery as failed after error', {
						attemptNumber: currentAttempts + 1
					});
				}
			}
		} catch (cleanupError) {
			jobLogger.error('Could not mark delivery as failed', cleanupError);
		}

		throw error;
	}
}

/**
 * Process notification jobs from queue
 * Uses atomic claim_pending_jobs RPC to prevent race conditions
 */
export async function processNotificationJobs(): Promise<void> {
	const batchLogger = logger.child('batch');

	try {
		// Atomically claim pending notification jobs
		// This uses FOR UPDATE SKIP LOCKED to prevent multiple workers from claiming the same job
		const { data: jobs, error } = await supabase.rpc('claim_pending_jobs', {
			p_job_types: ['send_notification'],
			p_batch_size: 10
		});

		if (error) {
			batchLogger.error('Error claiming jobs', error);
			return;
		}

		if (!jobs || jobs.length === 0) {
			return;
		}

		batchLogger.info('Claimed notification jobs for processing', {
			jobCount: jobs.length
		});

		// Process jobs in parallel with proper error isolation
		const results = await Promise.allSettled(
			jobs.map(async (job) => {
				// Create per-job logger
				const jobBatchLogger = batchLogger.child('job', {
					jobId: job.queue_job_id,
					dbJobId: job.id,
					userId: job.user_id
				});

				try {
					// Type the job - convert database 'metadata' to ProcessingJob 'data'
					const typedJob: ProcessingJob<NotificationJobMetadata> = {
						id: job.queue_job_id,
						userId: job.user_id,
						data: job.metadata as unknown as NotificationJobMetadata,
						attempts: job.attempts || 0,
						updateProgress: async () => {}, // Stub - not used in direct processing
						log: async (message: string) => {
							jobBatchLogger.debug('Job progress update', { message });
						}
					};

					// Process notification
					await processNotification(typedJob);

					// Mark as completed using atomic RPC
					// IDEMPOTENCY RISK: If notification sends successfully but both status update
					// and job completion fail, the job will be retried and may cause duplicate sends.
					// This is mitigated by:
					// 1. Status check at start of processNotification (FINAL_STATES)
					// 2. Optimistic locking on delivery status updates
					// 3. Idempotency in channel adapters (email message-ids, SMS deduplication)
					// 4. Short stale job timeout to minimize retry window
					const { error: completeError } = await supabase.rpc('complete_queue_job', {
						p_job_id: job.id,
						p_result: null
					});

					if (completeError) {
						jobBatchLogger.error(
							'CRITICAL: Failed to mark job as completed after successful send',
							completeError,
							{
								warning: 'Job may be retried, causing duplicate notification',
								mitigation: 'Status check should prevent duplicate sends'
							}
						);
						throw new Error(
							`Failed to mark job as completed: ${completeError.message}`
						);
					}

					jobBatchLogger.info('Job completed successfully');
				} catch (error: any) {
					jobBatchLogger.error('Job processing failed', error, {
						attempts: job.attempts || 0
					});

					// Mark as failed using atomic RPC (with retry logic)
					const currentAttempts = job.attempts || 0;
					const maxAttempts = job.max_attempts || 3;
					const shouldRetry = currentAttempts + 1 < maxAttempts;

					const { error: failError } = await supabase.rpc('fail_queue_job', {
						p_job_id: job.id,
						p_error_message: error.message || 'Unknown error',
						p_retry: shouldRetry
					});

					if (failError) {
						jobBatchLogger.error(
							'Failed to mark job as failed via RPC, attempting direct update',
							failError
						);

						// Fallback: Direct database update
						const { error: directUpdateError } = await supabase
							.from('queue_jobs')
							.update({
								status: shouldRetry ? 'pending' : 'failed',
								error: error.message,
								attempts: currentAttempts + 1,
								updated_at: new Date().toISOString()
							})
							.eq('id', job.id);

						if (directUpdateError) {
							jobBatchLogger.fatal(
								'CRITICAL: Could not mark job as failed via RPC or direct update',
								directUpdateError,
								{
									jobId: job.id,
									warning:
										'Job stuck in limbo - manual intervention may be required'
								}
							);
						}
					}

					throw error;
				}
			})
		);

		// Log summary
		const successfulJobs = results.filter((result) => result.status === 'fulfilled').length;
		const failedJobs = results.filter((result) => result.status === 'rejected').length;

		if (failedJobs > 0) {
			batchLogger.warn('Some jobs failed during processing', {
				failedCount: failedJobs,
				successfulCount: successfulJobs,
				totalCount: jobs.length
			});
		}
		if (successfulJobs > 0) {
			batchLogger.info('Batch processing completed', {
				successfulCount: successfulJobs,
				failedCount: failedJobs,
				totalCount: jobs.length
			});
		}
	} catch (error) {
		batchLogger.fatal('Fatal error in processNotificationJobs', error);
	}
}

// =====================================================
// EXPORTS
// =====================================================

export const notificationWorker = {
	processNotification,
	processNotificationJobs
};
