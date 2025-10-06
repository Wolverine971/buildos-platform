// apps/web/src/routes/api/email-tracking/[tracking_id]/click/+server.ts

import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url, locals: { supabase } }) => {
	const tracking_id = params.tracking_id;
	const destination = url.searchParams.get('url');

	// If no destination URL provided, redirect to home
	if (!destination) {
		console.warn(`No destination URL for tracking_id: ${tracking_id}`);
		throw redirect(302, '/');
	}

	try {
		console.log(`Email click tracking request for tracking_id: ${tracking_id}`);

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
					clicked_at
				)
			`
			)
			.eq('tracking_id', tracking_id)
			.single();

		if (emailError || !email) {
			console.log(`Email not found for tracking_id: ${tracking_id}`, emailError?.message);
			// Still redirect even if tracking fails
			throw redirect(302, destination);
		}

		console.log(`Found email ${email.id} for click tracking`);

		// Update each recipient's click tracking
		if (email.email_recipients && email.email_recipients.length > 0) {
			for (const recipient of email.email_recipients) {
				const now = new Date().toISOString();
				const isFirstClick = !recipient.clicked_at;

				console.log(
					`Tracking click for recipient: ${recipient.recipient_email}, first click: ${isFirstClick}`
				);

				// Update recipient click tracking
				const { error: updateError } = await supabase
					.from('email_recipients')
					.update({
						clicked_at: recipient.clicked_at || now
					})
					.eq('id', recipient.id);

				if (updateError) {
					console.error(`Failed to update recipient click tracking:`, updateError);
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
					console.error(`Failed to log click tracking event:`, eventError);
				}
			}

			// NEW: Update notification_deliveries if this email is tied to a notification
			const deliveryId = email.template_data?.delivery_id;
			if (deliveryId) {
				console.log(
					`Updating notification_deliveries ${deliveryId} clicked_at for email ${email.id}`
				);

				// Only update if clicked_at is null (first click)
				const { data: delivery } = await supabase
					.from('notification_deliveries')
					.select('clicked_at, opened_at')
					.eq('id', deliveryId)
					.single();

				if (delivery) {
					const now = new Date().toISOString();
					const updates: { clicked_at?: string; opened_at?: string; status?: string } = {};

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
							console.error(
								`Failed to update notification_deliveries ${deliveryId}:`,
								deliveryUpdateError
							);
						} else {
							console.log(
								`Successfully updated notification_deliveries ${deliveryId} with click`
							);
						}
					}
				}
			}
		} else {
			console.log(`No recipients found for email ${email.id}`);
		}

		// Redirect to destination URL
		throw redirect(302, destination);
	} catch (error) {
		// If it's a redirect, re-throw it
		if (error instanceof Response && error.status === 302) {
			throw error;
		}

		console.error('Error in email click tracking:', error);

		// Still redirect to destination even if there's an error
		throw redirect(302, destination);
	}
};
