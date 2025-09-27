// src/routes/api/admin/emails/[id]/send/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dev } from '$app/environment';

import { generateMinimalEmailHTML } from '$lib/utils/emailTemplate';
import { createGmailTransporterByEmail, getSenderByEmail } from '$lib/utils/email-config';

const baseUrl = dev ? 'http://localhost:5173' : 'https://build-os.com'; // Adjust this to your actual base URL

export const POST: RequestHandler = async ({
	params,
	request,
	locals: { supabase, safeGetSession }
}) => {
	const { user } = await safeGetSession();

	if (!user?.is_admin) {
		return json({ error: 'Admin access required' }, { status: 403 });
	}

	try {
		const { send_now = false } = await request.json();

		// Get email details
		const { data: email, error: fetchError } = await supabase
			.from('emails')
			.select(
				`
				*,
				email_recipients (
					id,
					recipient_email,
					recipient_name,
					recipient_type,
					status
				),
				email_attachments (
					id,
					filename,
					content_type,
					storage_path,
					is_inline,
					cid
				)
			`
			)
			.eq('id', params.id)
			.single();

		if (fetchError) {
			if (fetchError.code === 'PGRST116') {
				return json({ error: 'Email not found' }, { status: 404 });
			}
			throw fetchError;
		}

		if (email.status === 'sent' || email.status === 'delivered') {
			return json({ error: 'Email already sent' }, { status: 400 });
		}

		if (!email.email_recipients || email.email_recipients.length === 0) {
			return json({ error: 'No recipients found' }, { status: 400 });
		}

		// Ensure email has a tracking_id if tracking is enabled
		if (email.tracking_enabled && !email.tracking_id) {
			const newTrackingId = crypto.randomUUID();
			await supabase
				.from('emails')
				.update({ tracking_id: newTrackingId })
				.eq('id', params.id);
			email.tracking_id = newTrackingId;
			console.log(`Generated tracking_id for email ${params.id}: ${newTrackingId}`);
		}

		// Validate sender configuration
		const sender = getSenderByEmail(email.from_email);
		if (!sender) {
			return json(
				{ error: `No sender configuration found for ${email.from_email}` },
				{ status: 500 }
			);
		}

		if (!sender.password) {
			return json(
				{ error: `Gmail credentials not configured for ${email.from_email}` },
				{ status: 500 }
			);
		}

		// If sending now, process immediately
		if (send_now) {
			const transporter = createGmailTransporterByEmail(email.from_email);
			const results = [];

			// Generate tracking pixel HTML - only if both tracking is enabled AND tracking_id exists
			const trackingPixel =
				email.tracking_enabled && email.tracking_id
					? `<img src="${baseUrl}/api/email-tracking/${email.tracking_id}" width="1" height="1" style="display:none;" alt="" />`
					: '';

			// Log tracking status for debugging
			console.log('Email tracking status:', {
				email_id: email.id,
				tracking_enabled: email.tracking_enabled,
				tracking_id: email.tracking_id,
				pixel_added: !!trackingPixel
			});

			// Generate the email HTML using the shared template
			const emailHTML = generateMinimalEmailHTML({
				subject: email.subject,
				content: email.content,
				trackingPixel: trackingPixel
			});

			const seenEmails = new Set();
			const uniqueRecipients = [];

			for (const recipient of email.email_recipients) {
				if (!seenEmails.has(recipient.recipient_email)) {
					seenEmails.add(recipient.recipient_email);
					uniqueRecipients.push(recipient);
				}
			}

			// Send to each recipient
			for (const recipient of uniqueRecipients) {
				if (recipient.status !== 'pending') continue;

				try {
					const mailOptions = {
						from: `"${email.from_name}" <${email.from_email}>`,
						to: recipient.recipient_email,
						subject: email.subject,
						html: emailHTML,
						// Add attachments if any
						attachments:
							email.email_attachments?.map((attachment: any) => ({
								filename: attachment.filename,
								path: attachment.storage_path,
								...(attachment.is_inline && attachment.cid
									? { cid: attachment.cid }
									: {})
							})) || []
					};

					const info = await transporter.sendMail(mailOptions);

					// Update recipient status
					await supabase
						.from('email_recipients')
						.update({
							status: 'sent',
							sent_at: new Date().toISOString()
						})
						.eq('id', recipient.id);

					// Log tracking event
					await supabase.from('email_tracking_events').insert({
						email_id: email.id,
						recipient_id: recipient.id,
						event_type: 'sent',
						event_data: {
							message_id: info.messageId,
							recipient_type: recipient.recipient_type,
							is_custom_recipient: recipient.recipient_type === 'custom'
						}
					});

					results.push({
						recipient: recipient.recipient_email,
						status: 'sent',
						type: recipient.recipient_type
					});
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : 'Unknown error';
					console.error(`Failed to send to ${recipient.recipient_email}:`, error);

					// Update recipient status
					await supabase
						.from('email_recipients')
						.update({
							status: 'failed',
							error_message: errorMessage
						})
						.eq('id', recipient.id);

					// Log tracking event
					await supabase.from('email_tracking_events').insert({
						email_id: email.id,
						recipient_id: recipient.id,
						event_type: 'failed',
						event_data: {
							error: errorMessage,
							recipient_type: recipient.recipient_type,
							is_custom_recipient: recipient.recipient_type === 'custom'
						}
					});

					results.push({
						recipient: recipient.recipient_email,
						status: 'failed',
						error: errorMessage,
						type: recipient.recipient_type
					});
				}
			}

			// Update email status
			const sentCount = results.filter((r) => r.status === 'sent').length;
			const failedCount = results.filter((r) => r.status === 'failed').length;

			await supabase
				.from('emails')
				.update({
					status: failedCount === 0 ? 'sent' : 'failed',
					sent_at: new Date().toISOString()
				})
				.eq('id', email.id);

			return json({
				success: true,
				results,
				summary: {
					sent: sentCount,
					failed: failedCount,
					total: results.length
				}
			});
		} else {
			// Just update status to scheduled for now
			await supabase
				.from('emails')
				.update({
					status: 'scheduled',
					scheduled_at: email.scheduled_at || new Date().toISOString()
				})
				.eq('id', email.id);

			return json({ success: true, message: 'Email scheduled for sending' });
		}
	} catch (error) {
		console.error('Error sending email:', error);
		return json({ error: 'Failed to send email' }, { status: 500 });
	}
};
