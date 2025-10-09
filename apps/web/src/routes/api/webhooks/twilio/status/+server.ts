// apps/web/src/routes/api/webhooks/twilio/status/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import twilio from 'twilio';
import { PRIVATE_TWILIO_AUTH_TOKEN } from '$env/static/private';
import { PUBLIC_APP_URL } from '$env/static/public';

import { createServiceClient } from '@buildos/supabase-client';
import { smsMetricsService } from '@buildos/shared-utils';

/**
 * Webhook Context for logging and monitoring
 */
interface WebhookContext {
	messageSid: string;
	messageId?: string;
	userId?: string;
	status: string;
	timestamp: string;
}

/**
 * Map Twilio status to our sms_status enum
 */
const statusMap: Record<string, string> = {
	queued: 'queued',
	sending: 'sending',
	sent: 'sent',
	delivered: 'delivered',
	failed: 'failed',
	undelivered: 'undelivered',
	canceled: 'cancelled',
	// Additional Twilio statuses
	accepted: 'queued',
	receiving: 'sending',
	received: 'delivered'
};

/**
 * Map Twilio status to notification delivery status
 */
function mapTwilioStatusToDeliveryStatus(twilioStatus: string): string {
	const deliveryStatusMap: Record<string, string> = {
		queued: 'pending',
		accepted: 'pending',
		sending: 'sent',
		sent: 'sent',
		receiving: 'sent',
		received: 'delivered',
		delivered: 'delivered',
		failed: 'failed',
		undelivered: 'failed',
		canceled: 'failed'
	};
	return deliveryStatusMap[twilioStatus] || 'pending';
}

/**
 * Categorize Twilio error codes for better handling
 */
function categorizeErrorCode(errorCode: string | null): {
	category: string;
	shouldRetry: boolean;
	severity: 'low' | 'medium' | 'high' | 'critical';
} {
	if (!errorCode) {
		return { category: 'none', shouldRetry: false, severity: 'low' };
	}

	const code = parseInt(errorCode);

	// Permanent failures - don't retry
	if (code >= 30000 && code < 30010) {
		return { category: 'invalid_number', shouldRetry: false, severity: 'high' };
	}
	if (code >= 30020 && code < 30030) {
		return { category: 'account_issue', shouldRetry: false, severity: 'critical' };
	}
	if (code === 21211 || code === 21614) {
		return { category: 'invalid_number', shouldRetry: false, severity: 'high' };
	}

	// Temporary failures - retry possible
	if (code >= 30004 && code <= 30006) {
		return { category: 'carrier_issue', shouldRetry: true, severity: 'medium' };
	}
	if (code === 30003) {
		return { category: 'unreachable', shouldRetry: true, severity: 'medium' };
	}

	// Rate limiting
	if (code === 20429 || code === 14107) {
		return { category: 'rate_limit', shouldRetry: true, severity: 'low' };
	}

	// Unknown errors - be cautious, allow retry
	return { category: 'unknown', shouldRetry: true, severity: 'medium' };
}

/**
 * Log webhook event with structured context
 */
function logWebhookEvent(
	level: 'info' | 'warn' | 'error',
	message: string,
	context: Partial<WebhookContext> & Record<string, any>
) {
	const timestamp = new Date().toISOString();
	const logEntry = {
		timestamp,
		level,
		source: 'twilio_webhook',
		message,
		...context
	};

	if (level === 'error') {
		console.error('[TwilioWebhook]', message, logEntry);
	} else if (level === 'warn') {
		console.warn('[TwilioWebhook]', message, logEntry);
	} else {
		console.log('[TwilioWebhook]', message, logEntry);
	}
}

export const POST: RequestHandler = async ({ request, url }) => {
	const supabase = createServiceClient();
	const startTime = Date.now();

	try {
		// Get the raw request body for signature validation
		const body = await request.text();
		const params = new URLSearchParams(body);

		// Extract status update from Twilio
		const messageSid = params.get('MessageSid');
		const messageStatus = params.get('MessageStatus');
		const errorCode = params.get('ErrorCode');
		const errorMessage = params.get('ErrorMessage');

		// Extract custom metadata from URL params
		const messageId = url.searchParams.get('message_id');
		const userId = url.searchParams.get('user_id');

		// Early validation
		if (!messageSid || !messageStatus) {
			logWebhookEvent('error', 'Missing required parameters', {
				messageSid: messageSid || 'missing',
				messageStatus: messageStatus || 'missing',
				timestamp: new Date().toISOString()
			});
			return json({ error: 'Missing required parameters' }, { status: 400 });
		}

		// Create webhook context for logging
		const webhookContext: WebhookContext = {
			messageSid,
			messageId: messageId || undefined,
			userId: userId || undefined,
			status: messageStatus,
			timestamp: new Date().toISOString()
		};

		logWebhookEvent('info', 'Received status update', {
			...webhookContext,
			errorCode,
			hasError: !!errorCode
		});

		// Validate webhook signature (important for security)
		const twilioSignature = request.headers.get('X-Twilio-Signature');
		if (twilioSignature) {
			const webhookUrl = `${PUBLIC_APP_URL}/api/webhooks/twilio/status`;
			const isValid = twilio.validateRequest(
				PRIVATE_TWILIO_AUTH_TOKEN,
				twilioSignature,
				webhookUrl,
				Object.fromEntries(params)
			);

			if (!isValid) {
				logWebhookEvent('error', 'Invalid Twilio webhook signature', webhookContext);
				return json({ error: 'Invalid signature' }, { status: 401 });
			}
		} else {
			logWebhookEvent(
				'warn',
				'Webhook signature missing (development mode?)',
				webhookContext
			);
		}

		// Map Twilio status to our enum
		const mappedStatus = statusMap[messageStatus] || messageStatus;

		// Categorize error if present
		const errorInfo = categorizeErrorCode(errorCode);

		logWebhookEvent('info', 'Processing status update', {
			...webhookContext,
			mappedStatus,
			errorCategory: errorInfo.category,
			errorSeverity: errorInfo.severity
		});

		// Update message status in database
		if (messageId) {
			const updateData: any = {
				twilio_status: messageStatus,
				status: mappedStatus,
				updated_at: new Date().toISOString()
			};

			// Set appropriate timestamp based on status
			if (messageStatus === 'delivered') {
				updateData.delivered_at = new Date().toISOString();
			} else if (messageStatus === 'sent' || messageStatus === 'sending') {
				updateData.sent_at = updateData.sent_at || new Date().toISOString();
			}

			// Store error information
			if (errorCode || errorMessage) {
				updateData.twilio_error_code = parseInt(errorCode || '0');
				updateData.twilio_error_message = errorMessage;

				logWebhookEvent('warn', 'SMS delivery error detected', {
					...webhookContext,
					errorCode,
					errorMessage,
					errorCategory: errorInfo.category,
					severity: errorInfo.severity
				});
			}

			// Update SMS message - Step 1 of dual-table update
			const { data: updatedMessage, error: smsError } = await supabase
				.from('sms_messages')
				.update(updateData)
				.eq('id', messageId)
				.eq('twilio_sid', messageSid)
				.select(
					'notification_delivery_id, attempt_count, max_attempts, priority, user_id, sent_at, delivered_at'
				)
				.single();

			if (smsError) {
				logWebhookEvent('error', 'Failed to update SMS message', {
					...webhookContext,
					error: smsError.message,
					errorCode: smsError.code
				});
				// Don't return error to Twilio, as it might retry unnecessarily
			} else {
				logWebhookEvent('info', 'SMS message updated successfully', {
					...webhookContext,
					hasNotificationDelivery: !!updatedMessage?.notification_delivery_id
				});

				// Track delivery metrics when message is delivered
				if (messageStatus === 'delivered' && updatedMessage?.user_id) {
					const sentAt = updatedMessage.sent_at;
					const deliveredAt = updatedMessage.delivered_at;

					if (sentAt && deliveredAt) {
						const deliveryTimeMs =
							new Date(deliveredAt).getTime() - new Date(sentAt).getTime();

						// Record delivery metrics (non-blocking)
						smsMetricsService
							.recordDelivered(updatedMessage.user_id, messageId, deliveryTimeMs)
							.catch((err) => {
								logWebhookEvent('error', 'Failed to record delivery metrics', {
									...webhookContext,
									error: err.message
								});
							});

						logWebhookEvent('info', 'Delivery metrics tracked', {
							...webhookContext,
							deliveryTimeMs
						});
					} else {
						logWebhookEvent(
							'warn',
							'Cannot calculate delivery time - missing timestamps',
							{
								...webhookContext,
								hasSentAt: !!sentAt,
								hasDeliveredAt: !!deliveredAt
							}
						);
					}
				}
			}

			// Phase 4: Update scheduled_sms_messages if linked
			const { data: scheduledSms } = await supabase
				.from('scheduled_sms_messages')
				.select('id, status, send_attempts, max_send_attempts')
				.eq('sms_message_id', messageId)
				.maybeSingle();

			if (scheduledSms) {
				logWebhookEvent('info', 'Found linked scheduled SMS', {
					...webhookContext,
					scheduledSmsId: scheduledSms.id
				});

				const scheduledUpdateData: any = {
					updated_at: new Date().toISOString()
				};

				// Map status for scheduled SMS
				if (messageStatus === 'delivered') {
					scheduledUpdateData.status = 'delivered' as const;
				} else if (messageStatus === 'sent' || messageStatus === 'sending') {
					// Keep as 'sent' if already sent, don't downgrade to 'sending'
					if (scheduledSms.status !== 'delivered') {
						scheduledUpdateData.status = 'sent' as const;
					}
				} else if (
					messageStatus === 'failed' ||
					messageStatus === 'undelivered' ||
					messageStatus === 'canceled'
				) {
					scheduledUpdateData.status = 'failed' as const;
					scheduledUpdateData.last_error = errorMessage
						? `${errorMessage} (Code: ${errorCode})`
						: `Twilio error code: ${errorCode}`;
				}

				const { error: scheduledError } = await supabase
					.from('scheduled_sms_messages')
					.update(scheduledUpdateData)
					.eq('id', scheduledSms.id);

				if (scheduledError) {
					logWebhookEvent('error', 'Failed to update scheduled SMS', {
						...webhookContext,
						scheduledSmsId: scheduledSms.id,
						error: scheduledError.message
					});
				} else {
					logWebhookEvent('info', 'Scheduled SMS updated successfully', {
						...webhookContext,
						scheduledSmsId: scheduledSms.id,
						newStatus: scheduledUpdateData.status
					});
				}
			}

			// Step 2 of dual-table update: Update notification delivery if linked
			if (updatedMessage?.notification_delivery_id) {
				const deliveryStatus = mapTwilioStatusToDeliveryStatus(messageStatus);
				const deliveryUpdate: any = {
					status: deliveryStatus,
					updated_at: new Date().toISOString()
				};

				// Set appropriate timestamp for notification delivery
				if (messageStatus === 'sent' || messageStatus === 'sending') {
					deliveryUpdate.sent_at = new Date().toISOString();
				} else if (messageStatus === 'delivered') {
					deliveryUpdate.delivered_at = new Date().toISOString();
				} else if (
					messageStatus === 'failed' ||
					messageStatus === 'undelivered' ||
					messageStatus === 'canceled'
				) {
					deliveryUpdate.failed_at = new Date().toISOString();
					deliveryUpdate.last_error = errorMessage
						? `${errorMessage} (Code: ${errorCode})`
						: `Twilio error code: ${errorCode}`;
				}

				logWebhookEvent('info', 'Updating notification delivery', {
					...webhookContext,
					deliveryId: updatedMessage.notification_delivery_id,
					deliveryStatus
				});

				const { error: deliveryError } = await supabase
					.from('notification_deliveries')
					.update(deliveryUpdate)
					.eq('id', updatedMessage.notification_delivery_id);

				if (deliveryError) {
					logWebhookEvent('error', 'Failed to update notification delivery', {
						...webhookContext,
						deliveryId: updatedMessage.notification_delivery_id,
						error: deliveryError.message,
						errorCode: deliveryError.code
					});
				} else {
					logWebhookEvent('info', 'Dual-table update completed successfully', {
						...webhookContext,
						deliveryId: updatedMessage.notification_delivery_id,
						finalStatus: deliveryStatus
					});
				}
			}

			// Enhanced retry logic with error categorization
			if ((messageStatus === 'failed' || messageStatus === 'undelivered') && updatedMessage) {
				const shouldRetry = errorInfo.shouldRetry;
				const attemptCount = updatedMessage.attempt_count ?? 0;
				const maxAttempts = updatedMessage.max_attempts ?? 3;

				if (shouldRetry && attemptCount < maxAttempts) {
					// Calculate backoff delay based on attempt count and error severity
					let baseDelay = 60; // 1 minute base
					if (errorInfo.category === 'rate_limit') {
						baseDelay = 300; // 5 minutes for rate limits
					} else if (errorInfo.category === 'carrier_issue') {
						baseDelay = 180; // 3 minutes for carrier issues
					}

					const delay = Math.pow(2, attemptCount) * baseDelay; // Exponential backoff
					const scheduledFor = new Date(Date.now() + delay * 1000);

					logWebhookEvent('info', 'Scheduling retry for failed SMS', {
						...webhookContext,
						attemptCount,
						maxAttempts,
						delaySeconds: delay,
						scheduledFor: scheduledFor.toISOString(),
						errorCategory: errorInfo.category
					});

					const { error: queueError } = await supabase.rpc('add_queue_job', {
						p_user_id: updatedMessage.user_id,
						p_job_type: 'send_sms',
						p_metadata: {
							message_id: messageId,
							retry_attempt: attemptCount + 1,
							previous_error: errorMessage,
							error_code: errorCode,
							error_category: errorInfo.category
						},
						p_scheduled_for: scheduledFor.toISOString(),
						p_priority: updatedMessage.priority === 'urgent' ? 1 : 10
					});

					if (queueError) {
						logWebhookEvent('error', 'Failed to queue retry job', {
							...webhookContext,
							error: queueError.message
						});
					}
				} else if (!shouldRetry) {
					logWebhookEvent('warn', 'Permanent failure - retry not attempted', {
						...webhookContext,
						errorCategory: errorInfo.category,
						reason: 'Error category indicates permanent failure'
					});
				} else {
					logWebhookEvent('warn', 'Max retry attempts reached', {
						...webhookContext,
						attemptCount,
						maxAttempts
					});
				}
			}
		} else {
			// Fallback: Update by Twilio SID if message_id not provided (legacy SMS messages)
			logWebhookEvent('info', 'Updating SMS by Twilio SID (no message_id)', {
				messageSid,
				status: messageStatus,
				timestamp: new Date().toISOString()
			});

			const { error: sidUpdateError } = await supabase
				.from('sms_messages')
				.update({
					twilio_status: messageStatus,
					status: mappedStatus as any,
					delivered_at: messageStatus === 'delivered' ? new Date().toISOString() : null,
					sent_at:
						messageStatus === 'sent' || messageStatus === 'sending'
							? new Date().toISOString()
							: null,
					twilio_error_code: errorCode ? parseInt(errorCode) : null,
					twilio_error_message: errorMessage,
					updated_at: new Date().toISOString()
				})
				.eq('twilio_sid', messageSid);

			if (sidUpdateError) {
				logWebhookEvent('error', 'Failed to update SMS by SID', {
					messageSid,
					error: sidUpdateError.message
				});
			}
		}

		// Calculate and log processing time
		const processingTime = Date.now() - startTime;
		logWebhookEvent('info', 'Webhook processed successfully', {
			messageSid,
			messageId: messageId || 'none',
			status: messageStatus,
			processingTimeMs: processingTime
		});

		// Twilio expects a 200 OK response
		return json({ success: true, processed: true });
	} catch (error: any) {
		const processingTime = Date.now() - startTime;
		logWebhookEvent('error', 'Webhook processing failed', {
			error: error.message,
			stack: error.stack,
			processingTimeMs: processingTime
		});

		// Always return 200 to prevent Twilio from retrying
		// We've logged the error for investigation
		return json({ success: true, error: 'Internal error logged' });
	}
};
