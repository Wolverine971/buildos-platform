// apps/web/src/routes/api/email-tracking/[tracking_id]/+server.ts

import type { RequestHandler } from './$types';
import { createLogger } from '@buildos/shared-utils';

export const GET: RequestHandler = async ({ params, request, locals: { supabase } }) => {
	const baseLogger = createLogger('web:api:email-tracking', supabase);
	const transparentPixel = Buffer.from(
		'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAGAWA0dpQAAAABJRU5ErkJggg==',
		'base64'
	);

	const pixelResponse = new Response(transparentPixel, {
		status: 200,
		headers: {
			'Content-Type': 'image/png',
			'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
			Expires: '0',
			Pragma: 'no-cache',
			'Surrogate-Control': 'no-store'
		}
	});

	try {
		const tracking_id = params.tracking_id;

		const userAgent = request.headers.get('user-agent') || '';
		const forwardedFor = request.headers.get('x-forwarded-for');
		const realIp = request.headers.get('x-real-ip');
		const ipAddress = forwardedFor?.split(',')[0] || realIp || '';

		// Find the email by tracking ID
		const { data: email, error: emailError } = await supabase
			.from('emails')
			.select(
				`
				id,
				subject,
				template_data,
				email_recipients (
					id,
					recipient_email,
					opened_at,
					open_count,
					last_opened_at
				)
			`
			)
			.eq('tracking_id', tracking_id)
			.single();

		if (emailError || !email) {
			baseLogger.warn('Email not found for tracking pixel', {
				trackingId: tracking_id,
				error: emailError?.message
			});
			// Still return a 1x1 transparent pixel even if tracking fails
			return pixelResponse;
		}

		// Try to extract correlation ID from notification delivery
		let correlationId: string | undefined;
		const deliveryId = (email.template_data as any)?.delivery_id;
		if (deliveryId) {
			const { data: delivery } = await supabase
				.from('notification_deliveries')
				.select('event_id')
				.eq('id', deliveryId)
				.single();

			if (delivery?.event_id) {
				const { data: event } = await supabase
					.from('notification_events')
					.select('metadata')
					.eq('id', delivery.event_id)
					.single();

				if (
					event?.metadata &&
					typeof event.metadata === 'object' &&
					'correlationId' in event.metadata
				) {
					correlationId = event.metadata.correlationId as string;
				}
			}
		}

		// Create logger with correlation context
		const logger = correlationId
			? baseLogger.child('open', {
					correlationId,
					trackingId: tracking_id,
					emailId: email.id,
					deliveryId
				})
			: baseLogger.child('open', { trackingId: tracking_id, emailId: email.id });

		logger.info('Email tracking pixel requested', {
			recipientCount: email.email_recipients?.length || 0,
			userAgent: userAgent.substring(0, 100)
		});

		// Update each recipient's open tracking
		if (email.email_recipients && email.email_recipients.length > 0) {
			for (const recipient of email.email_recipients) {
				const now = new Date().toISOString();
				const isFirstOpen = !recipient.opened_at;

				logger.info('Tracking email open', {
					recipientEmail: recipient.recipient_email,
					recipientId: recipient.id,
					isFirstOpen,
					openCount: (recipient.open_count || 0) + 1
				});

				// Update recipient tracking
				const { error: updateError } = await supabase
					.from('email_recipients')
					.update({
						opened_at: recipient.opened_at || now,
						open_count: (recipient.open_count || 0) + 1,
						last_opened_at: now
					})
					.eq('id', recipient.id);

				if (updateError) {
					logger.error('Failed to update recipient tracking', updateError, {
						recipientId: recipient.id
					});
				}

				// Log tracking event
				const { error: eventError } = await supabase.from('email_tracking_events').insert({
					email_id: email.id,
					recipient_id: recipient.id,
					event_type: 'opened',
					event_data: {
						is_first_open: isFirstOpen,
						open_count: (recipient.open_count || 0) + 1
					},
					user_agent: userAgent,
					ip_address: ipAddress
				});

				if (eventError) {
					logger.error('Failed to log email tracking event', eventError, {
						recipientId: recipient.id
					});
				}
			}

			// NEW: Update notification_deliveries if this email is tied to a notification
			// This connects the existing email tracking to the notification system
			if (deliveryId) {
				logger.debug('Checking notification delivery for update');

				// Only update if opened_at is null (first open)
				const { data: delivery } = await supabase
					.from('notification_deliveries')
					.select('opened_at')
					.eq('id', deliveryId)
					.single();

				if (delivery && !delivery.opened_at) {
					const now = new Date().toISOString();
					const { error: deliveryUpdateError } = await supabase
						.from('notification_deliveries')
						.update({
							opened_at: now,
							status: 'opened'
						})
						.eq('id', deliveryId);

					if (deliveryUpdateError) {
						logger.error('Failed to update notification delivery', deliveryUpdateError);
					} else {
						logger.info('Updated notification delivery status to opened');
					}
				}
			}
		} else {
			logger.warn('No recipients found for email');
		}

		// Return 1x1 transparent pixel
		return pixelResponse;
	} catch (error) {
		baseLogger.error('Error in email tracking', error);

		// Still return a pixel even if there's an error
		return pixelResponse;
	}
};
