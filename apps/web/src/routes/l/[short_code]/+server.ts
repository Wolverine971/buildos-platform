// apps/web/src/routes/l/[short_code]/+server.ts

import type { RequestHandler } from './$types';
import { redirect } from '@sveltejs/kit';

/**
 * Link Shortener Redirect Endpoint
 *
 * Redirects shortened tracking links to their destination URLs
 * and records click analytics.
 *
 * Flow:
 * 1. Look up short_code in notification_tracking_links
 * 2. Update click tracking (timestamps and counts)
 * 3. Update notification_deliveries (clicked_at, opened_at)
 * 4. Redirect to destination URL
 *
 * Usage: https://build-os.com/l/abc123 → https://build-os.com/app/briefs/today
 */
export const GET: RequestHandler = async ({ params, locals: { supabase } }) => {
	const { short_code } = params;

	try {
		// Look up tracking link by short code
		const { data: link, error: linkError } = await supabase
			.from('notification_tracking_links')
			.select('*')
			.eq('short_code', short_code)
			.maybeSingle(); // Use maybeSingle to avoid 406 error

		if (linkError) {
			console.error(`[LinkShortener] Database error for code ${short_code}:`, linkError);
			throw redirect(302, '/');
		}

		if (!link) {
			console.warn(`[LinkShortener] Short code not found: ${short_code}`);
			throw redirect(302, '/');
		}

		const now = new Date().toISOString();
		const isFirstClick = !link.first_clicked_at;

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
			console.error(
				`[LinkShortener] Failed to update tracking link ${link.id}:`,
				updateError
			);
			// Continue anyway - redirect is more important than tracking
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
				console.error(
					`[LinkShortener] Failed to update delivery ${link.delivery_id}:`,
					deliveryError
				);
				// Continue anyway - redirect is more important than tracking
			} else if (isFirstClick) {
				console.log(`[LinkShortener] Tracked first click for delivery ${link.delivery_id}`);
			}
		}

		console.log(
			`[LinkShortener] Redirecting ${short_code} → ${link.destination_url} (click #${(link.click_count || 0) + 1})`
		);

		// Redirect to destination URL
		throw redirect(302, link.destination_url);
	} catch (error) {
		// If it's a redirect, let it through
		if (error instanceof Response && error.status === 302) {
			throw error;
		}

		// Log unexpected errors and redirect to home
		console.error('[LinkShortener] Unexpected error:', error);
		throw redirect(302, '/');
	}
};
