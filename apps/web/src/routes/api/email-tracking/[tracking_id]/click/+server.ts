// apps/web/src/routes/api/email-tracking/[tracking_id]/click/+server.ts

import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createLogger } from '@buildos/shared-utils';

export const GET: RequestHandler = async ({ params, url, locals: { supabase } }) => {
	const baseLogger = createLogger('web:api:email-tracking', supabase);
	const tracking_id = params.tracking_id;
	const destination = url.searchParams.get('url');

	// If no destination URL provided, redirect to home
	if (!destination) {
		baseLogger.warn('No destination URL for click tracking', {
			trackingId: tracking_id
		});
		throw redirect(302, '/');
	}

	try {
		// Find the email by tracking ID
		const { data: email, error: emailError } = await (supabase
			.from('emails') as any)
			.select(
				`
				id,
				subject,
				template_data,
				email_recipients (
					id,
					recipient_email,
					clicked_at
				)
			`
			)
			.eq('tracking_id', tracking_id)
			.single() as any;

		if (emailError || !email) {
			baseLogger.warn('Email not found for click tracking', {
				trackingId: tracking_id,
				error: emailError?.message
			});
			// Still redirect even if tracking fails
			throw redirect(302, destination);
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
			? baseLogger.child('click', {
					correlationId,
					trackingId: tracking_id,
					emailId: email.id,
					deliveryId,
					destinationUrl: destination.substring(0, 100)
				})
			: baseLogger.child('click', {
					trackingId: tracking_id,
					emailId: email.id,
					destinationUrl: destination.substring(0, 100)
				});

		logger.info('Email click tracking requested');

		// Update each recipient's click tracking
		if (email.email_recipients && email.email_recipients.length > 0) {
			for (const recipient of email.email_recipients) {
				const now = new Date().toISOString();
				const isFirstClick = !recipient.clicked_at;

				logger.info('Tracking email click', {
					recipientEmail: recipient.recipient_email,
					recipientId: recipient.id,
					isFirstClick
				});

				// Update recipient click tracking
				const { error: updateError } = await supabase
					.from('email_recipients')
					.update({
						clicked_at: recipient.clicked_at || now
					})
					.eq('id', recipient.id);

				if (updateError) {
					logger.error('Failed to update recipient click tracking', updateError, {
						recipientId: recipient.id
					});
				}

				// Log tracking event
				const { error: eventError } = await supabase.from('email_tracking_events').insert({
					email_id: email.id,
					recipient_id: recipient.id,
					event_type: 'clicked',
					event_data: {
						is_first_click: isFirstClick,
						clicked_url: destination
					},
					clicked_url: destination
				});

				if (eventError) {
					logger.error('Failed to log click tracking event', eventError, {
						recipientId: recipient.id
					});
				}
			}

			// NEW: Update notification_deliveries if this email is tied to a notification
			if (deliveryId) {
				logger.debug('Checking notification delivery for click update');

				// Only update if clicked_at is null (first click)
				const { data: delivery } = await supabase
					.from('notification_deliveries')
					.select('clicked_at, opened_at')
					.eq('id', deliveryId)
					.single();

				if (delivery) {
					const now = new Date().toISOString();
					const updates: { clicked_at?: string; opened_at?: string; status?: string } =
						{};

					// Set clicked_at if not already set
					if (!delivery.clicked_at) {
						updates.clicked_at = now;
					}

					// Also set opened_at if not set (click implies open)
					if (!delivery.opened_at) {
						updates.opened_at = now;
					}

					// Update status to clicked
					updates.status = 'clicked';

					if (Object.keys(updates).length > 0) {
						const { error: deliveryUpdateError } = await supabase
							.from('notification_deliveries')
							.update(updates)
							.eq('id', deliveryId);

						if (deliveryUpdateError) {
							logger.error(
								'Failed to update notification delivery',
								deliveryUpdateError
							);
						} else {
							logger.info('Updated notification delivery status to clicked', {
								setClickedAt: !!updates.clicked_at,
								setOpenedAt: !!updates.opened_at
							});
						}
					}
				}
			}
		} else {
			logger.warn('No recipients found for email');
		}

		// Redirect to destination URL
		throw redirect(302, destination);
	} catch (error) {
		// If it's a redirect, re-throw it
		if (error instanceof Response && error.status === 302) {
			throw error;
		}

		baseLogger.error('Error in email click tracking', error);

		// Still redirect to destination even if there's an error
		throw redirect(302, destination);
	}
};
