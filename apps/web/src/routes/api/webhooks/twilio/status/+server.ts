// apps/web/src/routes/api/webhooks/twilio/status/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import twilio from 'twilio';
import { PRIVATE_TWILIO_AUTH_TOKEN } from '$env/static/private';
import { PUBLIC_APP_URL } from '$env/static/public';

import { createServiceClient } from '@buildos/supabase-client';
import { smsMetricsService, createLogger, extractCorrelationContext } from '@buildos/shared-utils';

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

export const POST: RequestHandler = async ({ request, url }) => {
	const supabase = createServiceClient();
	const baseLogger = createLogger('web:webhook:twilio', supabase);
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
			baseLogger.error('Missing required parameters', undefined, {
				messageSid: messageSid || 'missing',
				messageStatus: messageStatus || 'missing'
			});
			return json({ error: 'Missing required parameters' }, { status: 400 });
		}

		// Try to extract correlation ID from SMS message metadata
		let correlationId: string | undefined;
		if (messageId) {
			const { data: smsMessage } = await supabase
				.from('sms_messages')
				.select('metadata')
				.eq('id', messageId)
				.single();

			if (smsMessage?.metadata) {
				const context = extractCorrelationContext(smsMessage.metadata as any);
				correlationId = context.correlationId;
			}
		}

		// Create logger with correlation ID if available
		const logger = correlationId
			? baseLogger.child('status', { correlationId, messageSid, messageId, userId })
			: baseLogger.child('status', { messageSid, messageId, userId });

		logger.info('Received Twilio status webhook', {
			messageStatus,
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
				logger.error('Invalid Twilio webhook signature');
				return json({ error: 'Invalid signature' }, { status: 401 });
			}
		} else {
			logger.warn('Webhook signature missing (development mode?)');
		}

		// Map Twilio status to our enum
		const mappedStatus = statusMap[messageStatus] || messageStatus;

		// Categorize error if present
		const errorInfo = categorizeErrorCode(errorCode);

		logger.info('Processing SMS status update', {
			mappedStatus,
			errorCategory: errorInfo.category,
			errorSeverity: errorInfo.severity
		});

		// Update message status in database
		if (messageId) {
			// Store error information if present
			if (errorCode || errorMessage) {
				logger.warn('SMS delivery error detected', {
					errorCode,
					errorMessage,
					errorCategory: errorInfo.category,
					severity: errorInfo.severity
				});
			}

			// ATOMIC dual-table update using RPC (prevents race conditions)
			// This updates both sms_messages and notification_deliveries in a single transaction
			const { data: updateResult, error: atomicError } = await supabase
				.rpc('update_sms_status_atomic', {
					p_message_id: messageId,
					p_twilio_sid: messageSid,
					p_twilio_status: messageStatus,
					p_mapped_status: mappedStatus,
					p_error_code: errorCode ? parseInt(errorCode) : undefined,
					p_error_message: errorMessage || undefined
				})
				.single();

			if (atomicError) {
				logger.error('Failed to update SMS status atomically', atomicError, {
					errorCode: atomicError.code
				});
				// Don't return error to Twilio, as it might retry unnecessarily
			} else if (!updateResult) {
				logger.error('SMS message not found for update');
			} else {
				logger.info('SMS status updated atomically', {
					hasNotificationDelivery: !!updateResult.notification_delivery_id,
					updatedSms: updateResult.updated_sms,
					updatedDelivery: updateResult.updated_delivery
				});

				// Track delivery metrics when message is delivered
				if (messageStatus === 'delivered' && updateResult?.user_id) {
					const sentAt = updateResult.sent_at;
					const deliveredAt = updateResult.delivered_at;

					if (sentAt && deliveredAt) {
						const deliveryTimeMs =
							new Date(deliveredAt).getTime() - new Date(sentAt).getTime();

						// Record delivery metrics (non-blocking)
						smsMetricsService
							.recordDelivered(updateResult.user_id, messageId, deliveryTimeMs)
							.catch((err) => {
								logger.error('Failed to record delivery metrics', err);
							});

						logger.info('Delivery metrics tracked', {
							deliveryTimeMs
						});
					} else {
						logger.warn('Cannot calculate delivery time - missing timestamps', {
							hasSentAt: !!sentAt,
							hasDeliveredAt: !!deliveredAt
						});
					}
				}
			}

			// Store reference to update result for later use
			const updatedMessage = updateResult;

			// Phase 4: Update scheduled_sms_messages if linked
			const { data: scheduledSms } = await supabase
				.from('scheduled_sms_messages')
				.select('id, status, send_attempts, max_send_attempts')
				.eq('sms_message_id', messageId)
				.maybeSingle();

			if (scheduledSms) {
				logger.info('Found linked scheduled SMS', {
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
					logger.error('Failed to update scheduled SMS', scheduledError, {
						scheduledSmsId: scheduledSms.id
					});
				} else {
					logger.info('Scheduled SMS updated successfully', {
						scheduledSmsId: scheduledSms.id,
						newStatus: scheduledUpdateData.status
					});
				}
			}

			// Note: notification_deliveries update is now handled atomically by update_sms_status_atomic RPC
			// This prevents race conditions and ensures data consistency

			// Enhanced retry logic with error categorization
			if ((messageStatus === 'failed' || messageStatus === 'undelivered') && updatedMessage) {
				const shouldRetry = errorInfo.shouldRetry;
				const attemptCount = updatedMessage.attempt_count ?? 0;
				const maxAttempts = updatedMessage.max_attempts ?? 3;

				if (shouldRetry && attemptCount < maxAttempts) {
					// Fetch full message data for retry job
					const { data: fullMessage, error: fetchError } = await supabase
						.from('sms_messages')
						.select('id, user_id, phone_number, message_content, priority')
						.eq('id', messageId)
						.single();

					if (fetchError || !fullMessage) {
						logger.error('Failed to fetch message for retry', fetchError);
					} else {
						// Calculate backoff delay based on attempt count and error severity
						let baseDelay = 60; // 1 minute base
						if (errorInfo.category === 'rate_limit') {
							baseDelay = 300; // 5 minutes for rate limits
						} else if (errorInfo.category === 'carrier_issue') {
							baseDelay = 180; // 3 minutes for carrier issues
						}

						const delay = Math.pow(2, attemptCount) * baseDelay; // Exponential backoff
						const scheduledFor = new Date(Date.now() + delay * 1000);

						logger.info('Scheduling retry for failed SMS', {
							attemptCount,
							maxAttempts,
							delaySeconds: delay,
							scheduledFor: scheduledFor.toISOString(),
							errorCategory: errorInfo.category
						});

						const { error: queueError } = await supabase.rpc('add_queue_job', {
							p_user_id: fullMessage.user_id,
							p_job_type: 'send_sms',
							p_metadata: {
								message_id: messageId,
								phone_number: fullMessage.phone_number,
								message: fullMessage.message_content,
								user_id: fullMessage.user_id,
								priority: fullMessage.priority,
								scheduled_sms_id: scheduledSms?.id || undefined,
								retry_attempt: attemptCount + 1,
								previous_error: errorMessage,
								error_code: errorCode,
								error_category: errorInfo.category
							},
							p_scheduled_for: scheduledFor.toISOString(),
							p_priority: fullMessage.priority === 'urgent' ? 1 : 10
						});

						if (queueError) {
							logger.error('Failed to queue retry job', queueError);
						}
					}
				} else if (!shouldRetry) {
					logger.warn('Permanent failure - retry not attempted', {
						errorCategory: errorInfo.category,
						reason: 'Error category indicates permanent failure'
					});
				} else {
					logger.warn('Max retry attempts reached', {
						attemptCount,
						maxAttempts
					});
				}
			}
		} else {
			// Fallback: Update by Twilio SID if message_id not provided (legacy SMS messages)
			logger.info('Updating SMS by Twilio SID (no message_id)');

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
				logger.error('Failed to update SMS by SID', sidUpdateError);
			}
		}

		// Calculate and log processing time
		const processingTime = Date.now() - startTime;
		logger.info('Webhook processed successfully', {
			processingTimeMs: processingTime
		});

		// Twilio expects a 200 OK response
		return json({ success: true, processed: true });
	} catch (error: any) {
		const processingTime = Date.now() - startTime;
		baseLogger.error('Webhook processing failed', error, {
			processingTimeMs: processingTime
		});

		// Always return 200 to prevent Twilio from retrying
		// We've logged the error for investigation
		return json({ success: true, error: 'Internal error logged' });
	}
};
