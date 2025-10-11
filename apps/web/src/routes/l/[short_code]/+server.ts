// apps/web/src/routes/l/[short_code]/+server.ts

import type { RequestHandler } from './$types';
import { redirect } from '@sveltejs/kit';
import { createLogger } from '@buildos/shared-utils';

/**
 * Link Shortener Redirect Endpoint
 *
 * Redirects shortened tracking links to their destination URLs
 * and records click analytics with correlation ID tracking.
 *
 * Flow:
 * 1. Look up short_code in notification_tracking_links
 * 2. Extract correlation ID from delivery → event → metadata
 * 3. Update click tracking (timestamps and counts)
 * 4. Update notification_deliveries (clicked_at, opened_at)
 * 5. Log all operations with correlation context
 * 6. Redirect to destination URL
 *
 * Usage: https://build-os.com/l/abc123 → https://build-os.com/app/briefs/today
 */
export const GET: RequestHandler = async ({ params, locals: { supabase } }) => {
	const { short_code } = params;
	const baseLogger = createLogger('web:api:link-tracking', supabase);

	try {
		// Look up tracking link by short code
		const { data: link, error: linkError } = await supabase
			.from('notification_tracking_links')
			.select('*')
			.eq('short_code', short_code)
			.maybeSingle();

		if (linkError) {
			baseLogger.error('Database error looking up tracking link', linkError, {
				shortCode: short_code
			});
			throw redirect(302, '/');
		}

		if (!link) {
			baseLogger.warn('Short code not found', { shortCode: short_code });
			throw redirect(302, '/');
		}

		// Try to extract correlation ID from notification delivery
		let correlationId: string | undefined;
		if (link.delivery_id) {
			const { data: delivery } = await supabase
				.from('notification_deliveries')
				.select('event_id, correlation_id')
				.eq('id', link.delivery_id)
				.single();

			if (delivery) {
				// First try the dedicated correlation_id column
				if (delivery.correlation_id) {
					correlationId = delivery.correlation_id;
				} else if (delivery.event_id) {
					// Fallback to extracting from event metadata
					const { data: event } = await supabase
						.from('notification_events')
						.select('metadata, correlation_id')
						.eq('id', delivery.event_id)
						.single();

					if (event) {
						// Try dedicated column first, then metadata
						correlationId =
							event.correlation_id ||
							(event.metadata &&
							typeof event.metadata === 'object' &&
							'correlationId' in event.metadata
								? (event.metadata.correlationId as string)
								: undefined);
					}
				}
			}
		}

		// Create logger with correlation context
		const logger = correlationId
			? baseLogger.child('click', {
					correlationId,
					shortCode: short_code,
					deliveryId: link.delivery_id,
					destinationUrl: link.destination_url.substring(0, 100)
				})
			: baseLogger.child('click', {
					shortCode: short_code,
					deliveryId: link.delivery_id,
					destinationUrl: link.destination_url.substring(0, 100)
				});

		const now = new Date().toISOString();
		const isFirstClick = !link.first_clicked_at;

		logger.info('SMS link clicked', {
			linkId: link.id,
			clickCount: (link.click_count || 0) + 1,
			isFirstClick
		});

		// Update tracking link statistics
		const { error: updateError } = await supabase
			.from('notification_tracking_links')
			.update({
				first_clicked_at: link.first_clicked_at || now,
				last_clicked_at: now,
				click_count: (link.click_count || 0) + 1
			})
			.eq('id', link.id);

		if (updateError) {
			logger.error('Failed to update tracking link', updateError, {
				linkId: link.id
			});
			// Continue anyway - redirect is more important than tracking
		} else {
			logger.debug('Tracking link updated successfully', {
				linkId: link.id,
				clickCount: (link.click_count || 0) + 1
			});
		}

		// Update notification delivery (if associated)
		if (link.delivery_id) {
			// Only update if clicked_at is null (first click)
			const { error: deliveryError } = await supabase
				.from('notification_deliveries')
				.update({
					clicked_at: now,
					opened_at: now, // Click implies open for SMS
					status: 'clicked'
				})
				.eq('id', link.delivery_id)
				.is('clicked_at', null); // Only update on first click

			if (deliveryError) {
				logger.error('Failed to update notification delivery', deliveryError, {
					deliveryId: link.delivery_id
				});
				// Continue anyway - redirect is more important than tracking
			} else if (isFirstClick) {
				logger.info('Updated notification delivery status to clicked', {
					deliveryId: link.delivery_id,
					isFirstClick: true
				});
			}
		}

		logger.info('Redirecting to destination URL', {
			totalClicks: (link.click_count || 0) + 1
		});

		// Redirect to destination URL
		throw redirect(302, link.destination_url);
	} catch (error) {
		// If it's a redirect, let it through
		if (error instanceof Response && error.status === 302) {
			throw error;
		}

		// Log unexpected errors and redirect to home
		baseLogger.error('Unexpected error in link tracking', error, {
			shortCode: short_code
		});
		throw redirect(302, '/');
	}
};
