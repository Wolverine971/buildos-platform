// apps/web/src/routes/api/email-tracking/[tracking_id]/click/+server.ts

import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createLogger } from '@buildos/shared-utils';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { PUBLIC_APP_URL } from '$env/static/public';
import { captureServerEvent } from '$lib/server/posthog';

function getTemplateData(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function getStringMetadata(metadata: Record<string, unknown>, key: string): string | null {
	const value = metadata[key];
	return typeof value === 'string' && value.trim() ? value : null;
}

function getAllowedAppOrigin(): string {
	try {
		return new URL(PUBLIC_APP_URL || 'https://build-os.com').origin;
	} catch {
		return 'https://build-os.com';
	}
}

function getSafeRedirectDestination(destination: string): string | null {
	if (
		destination.startsWith('/') &&
		!destination.startsWith('//') &&
		!destination.startsWith('/\\')
	) {
		return destination;
	}

	try {
		const destinationUrl = new URL(destination);
		if (destinationUrl.origin === getAllowedAppOrigin()) {
			return destinationUrl.toString();
		}
	} catch {
		return null;
	}

	return null;
}

export const GET: RequestHandler = async ({ params, url }) => {
	const supabase = createAdminSupabaseClient();
	const baseLogger = createLogger('web:api:email-tracking', supabase);
	const tracking_id = params.tracking_id;
	const requestedDestination = url.searchParams.get('url');

	// If no destination URL provided, redirect to home
	if (!requestedDestination) {
		baseLogger.warn('No destination URL for click tracking', {
			trackingId: tracking_id
		});
		throw redirect(302, '/');
	}

	const destination = getSafeRedirectDestination(requestedDestination);
	if (!destination) {
		baseLogger.warn('Blocked unsafe email click redirect destination', {
			trackingId: tracking_id,
			destination: requestedDestination.substring(0, 100)
		});
		throw redirect(302, '/');
	}

	try {
		// Find the email by tracking ID
		const { data: email, error: emailError } = (await (supabase.from('emails') as any)
			.select(
				`
				id,
				subject,
				template_data,
				email_recipients (
					id,
					recipient_id,
					recipient_email
				)
			`
			)
			.eq('tracking_id', tracking_id)
			.maybeSingle()) as any;

		if (emailError) {
			baseLogger.error('Failed to load email for click tracking', emailError, {
				trackingId: tracking_id
			});
			// Still redirect even if tracking fails
			throw redirect(302, destination);
		}

		if (!email) {
			baseLogger.warn('Email not found for click tracking', {
				trackingId: tracking_id
			});
			// Still redirect even if tracking fails
			throw redirect(302, destination);
		}

		// Try to extract correlation ID from notification delivery
		let correlationId: string | undefined;
		const templateData = getTemplateData(email.template_data);
		const deliveryId = getStringMetadata(templateData, 'delivery_id');
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

		const recipients = Array.isArray(email.email_recipients) ? email.email_recipients : [];
		const recipientIds = recipients
			.map((recipient: { id?: string }) => recipient.id)
			.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0);
		const clickedRecipientIds = new Set<string>();

		if (recipientIds.length > 0) {
			const { data: priorClicks, error: priorClicksError } = await (
				supabase.from('email_tracking_events') as any
			)
				.select('recipient_id')
				.eq('email_id', email.id)
				.eq('event_type', 'clicked')
				.in('recipient_id', recipientIds);

			if (priorClicksError) {
				logger.error('Failed to load prior click tracking events', priorClicksError, {
					emailId: email.id
				});
			} else if (Array.isArray(priorClicks)) {
				for (const click of priorClicks) {
					if (typeof click.recipient_id === 'string') {
						clickedRecipientIds.add(click.recipient_id);
					}
				}
			}
		}

		// PostHog captures are collected and awaited together right before the
		// redirect — concurrent instead of one awaited round-trip per recipient.
		const analyticsCaptures: Promise<unknown>[] = [];

		// Update each recipient's click tracking
		if (recipients.length > 0) {
			for (const recipient of recipients) {
				const now = new Date().toISOString();
				const isFirstClick = !clickedRecipientIds.has(recipient.id);

				logger.info('Tracking email click', {
					recipientEmail: recipient.recipient_email,
					recipientId: recipient.id,
					isFirstClick
				});

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

				analyticsCaptures.push(
					captureServerEvent(
						recipient.recipient_id || recipient.recipient_email,
						'email_clicked',
						{
							email_id: email.id,
							email_recipient_id: recipient.id,
							tracking_id: tracking_id,
							delivery_id: deliveryId,
							event_type: getStringMetadata(templateData, 'event_type'),
							category: getStringMetadata(templateData, 'category'),
							brief_id: getStringMetadata(templateData, 'brief_id'),
							brief_date: getStringMetadata(templateData, 'brief_date'),
							engagement_stage:
								getStringMetadata(templateData, 'engagement_stage') ||
								getStringMetadata(templateData, 'engagementStage') ||
								'standard',
							is_first_click: isFirstClick,
							clicked_url: destination
						}
					).catch(() => {})
				);
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

		// Flush analytics before the redirect (fire-and-forget is unsafe on Vercel).
		if (analyticsCaptures.length > 0) {
			await Promise.allSettled(analyticsCaptures);
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
