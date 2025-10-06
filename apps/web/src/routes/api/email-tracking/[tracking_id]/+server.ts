// apps/web/src/routes/api/email-tracking/[tracking_id]/+server.ts

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, request, locals: { supabase } }) => {
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

		// Log the tracking attempt
		console.log(`Email tracking request for tracking_id: ${tracking_id}`);

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
			console.log(`Email not found for tracking_id: ${tracking_id}`, emailError?.message);
			// Still return a 1x1 transparent pixel even if tracking fails
			return pixelResponse;
		}

		console.log(
			`Found email ${email.id} with ${email.email_recipients?.length || 0} recipients`
		);

		// Update each recipient's open tracking
		if (email.email_recipients && email.email_recipients.length > 0) {
			for (const recipient of email.email_recipients) {
				const now = new Date().toISOString();
				const isFirstOpen = !recipient.opened_at;

				console.log(
					`Tracking open for recipient: ${recipient.recipient_email}, first open: ${isFirstOpen}`
				);

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
					console.error(`Failed to update recipient tracking:`, updateError);
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
					console.error(`Failed to log tracking event:`, eventError);
				}
			}

			// NEW: Update notification_deliveries if this email is tied to a notification
			// This connects the existing email tracking to the notification system
			const deliveryId = email.template_data?.delivery_id;
			if (deliveryId) {
				console.log(`Updating notification_deliveries ${deliveryId} for email ${email.id}`);

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
						console.error(
							`Failed to update notification_deliveries ${deliveryId}:`,
							deliveryUpdateError
						);
					} else {
						console.log(`Successfully updated notification_deliveries ${deliveryId}`);
					}
				}
			}
		} else {
			console.log(`No recipients found for email ${email.id}`);
		}

		// Return 1x1 transparent pixel
		return pixelResponse;
	} catch (error) {
		console.error('Error in email tracking:', error);

		// Still return a pixel even if there's an error
		return pixelResponse;
	}
};
