// src/routes/webhooks/daily-brief-email/+server.ts
import type { RequestHandler } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';
import { createHmac } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { PRIVATE_SUPABASE_SERVICE_KEY, PRIVATE_BUILDOS_WEBHOOK_SECRET } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { EmailService } from '$lib/services/email-service';
import { generateMinimalEmailHTML } from '$lib/utils/emailTemplate';
import { renderMarkdown } from '$lib/utils/markdown';

interface WebhookPayload {
	userId: string;
	briefId: string;
	briefDate: string;
	recipientEmail: string;
	timestamp: string;
	metadata?: {
		emailRecordId?: string;
		recipientRecordId?: string;
		trackingId?: string;
		subject?: string;
	};
}

/**
 * Verify webhook signature using HMAC SHA-256
 */
function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
	const expectedSignature = createHmac('sha256', secret).update(payload).digest('hex');

	// Timing-safe comparison
	return signature === expectedSignature;
}

/**
 * POST /webhooks/daily-brief-email
 *
 * Receives webhook from daily-brief-worker to send email
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		// 1. Validate webhook headers
		const signature = request.headers.get('x-webhook-signature');
		const timestamp = request.headers.get('x-webhook-timestamp');
		const source = request.headers.get('x-source');

		if (!signature || !timestamp) {
			throw error(401, 'Missing webhook signature or timestamp');
		}

		if (source !== 'daily-brief-worker') {
			throw error(401, 'Invalid webhook source');
		}

		// 2. Parse and validate payload
		const rawBody = await request.text();
		const webhookSecret = PRIVATE_BUILDOS_WEBHOOK_SECRET;

		if (!webhookSecret) {
			console.error('PRIVATE_BUILDOS_WEBHOOK_SECRET not configured');
			throw error(500, 'Webhook secret not configured');
		}

		// Verify signature
		if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
			throw error(401, 'Invalid webhook signature');
		}

		// Check timestamp freshness (prevent replay attacks)
		const requestTime = new Date(timestamp).getTime();
		const now = Date.now();
		const MAX_AGE = 5 * 60 * 1000; // 5 minutes

		if (Math.abs(now - requestTime) > MAX_AGE) {
			throw error(401, 'Webhook timestamp too old');
		}

		const payload: WebhookPayload = JSON.parse(rawBody);

		// 3. Initialize Supabase client with service role
		const supabase = createClient(PUBLIC_SUPABASE_URL, PRIVATE_SUPABASE_SERVICE_KEY, {
			auth: {
				autoRefreshToken: false,
				persistSession: false
			}
		});

		// 4. Fetch the daily brief data with llm_analysis
		const { data: brief, error: briefError } = await supabase
			.from('daily_briefs')
			.select('*')
			.eq('id', payload.briefId)
			.single();

		if (briefError || !brief) {
			console.error('Failed to fetch brief:', briefError);
			throw error(404, 'Brief not found');
		}

		// Get llm_analysis content or fallback to summary_content
		const briefContent = brief.llm_analysis || brief.summary_content || '';

		if (!briefContent) {
			console.error('No content found in brief');
			throw error(400, 'Brief has no content to send');
		}

		// 5. Fetch user preferences (optional - for additional customization)
		const { data: preferences } = await supabase
			.from('user_brief_preferences')
			.select('*')
			.eq('user_id', payload.userId)
			.single();

		// 6. Generate email subject
		const emailSubject =
			payload.metadata?.subject ||
			`Daily Brief - ${new Date(payload.briefDate).toLocaleDateString('en-US', {
				weekday: 'long',
				year: 'numeric',
				month: 'long',
				day: 'numeric'
			})}`;

		// 7. Convert markdown to HTML
		const contentHtml = renderMarkdown(briefContent);

		// Add brief-specific header and footer
		const fullContent = `
			<h1 style="color: #111827; font-size: 24px; margin-bottom: 8px;">Your Daily Brief</h1>
			<p style="color: #6b7280; font-size: 14px; margin-bottom: 24px;">${new Date(
				payload.briefDate
			).toLocaleDateString('en-US', {
				weekday: 'long',
				year: 'numeric',
				month: 'long',
				day: 'numeric'
			})}</p>

			<div style="margin: 20px 0;">
				${contentHtml}
			</div>

			<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">

			<div style="text-align: center; margin-top: 24px;">
				<a href="https://build-os.com/daily-briefs/${payload.briefId}" style="color: #3b82f6; text-decoration: none; font-size: 14px;">View in BuildOS �</a>
				<span style="color: #d1d5db; margin: 0 8px;">|</span>
				<a href="https://build-os.com/settings/daily-briefs" style="color: #3b82f6; text-decoration: none; font-size: 14px;">Manage Preferences</a>
			</div>
		`;

		// 8. Generate the full email HTML using the template
		const trackingPixel = payload.metadata?.trackingId
			? `<img src="https://build-os.com/api/email-tracking/${payload.metadata.trackingId}" width="1" height="1" style="display:none;" alt="" />`
			: '';

		const emailHtml = generateMinimalEmailHTML({
			subject: emailSubject,
			content: fullContent,
			trackingPixel
		});

		// 9. Send email using EmailService
		const emailService = new EmailService(supabase);

		const emailResult = await emailService.sendEmail({
			to: payload.recipientEmail,
			subject: emailSubject,
			body: briefContent, // Plain text version
			html: emailHtml,
			userId: payload.userId,
			metadata: {
				brief_id: payload.briefId,
				brief_date: payload.briefDate,
				sent_via: 'webhook',
				category: 'daily-brief',
				...payload.metadata
			},
			trackingEnabled: !!payload.metadata?.trackingId,
			emailId: payload.metadata?.emailRecordId
		});

		if (!emailResult.success) {
			console.error('Failed to send email:', emailResult.error);
			throw error(500, 'Failed to send email');
		}

		// 10. Update tracking records if provided
		if (payload.metadata?.recipientRecordId) {
			await supabase
				.from('email_recipients')
				.update({
					status: 'sent',
					sent_at: new Date().toISOString()
				})
				.eq('id', payload.metadata.recipientRecordId);
		}

		// 11. Log email tracking event
		if (payload.metadata?.trackingId) {
			await supabase.from('email_tracking_events').insert({
				tracking_id: payload.metadata.trackingId,
				event_type: 'sent',
				recipient_email: payload.recipientEmail,
				metadata: {
					brief_id: payload.briefId,
					user_id: payload.userId,
					sent_via: 'webhook',
					message_id: emailResult.messageId
				}
			});
		}

		// 12. Update daily_briefs table to mark as emailed
		await supabase
			.from('daily_briefs')
			.update({
				email_sent: true,
				email_sent_at: new Date().toISOString()
			})
			.eq('id', payload.briefId);

		// 13. Return success response
		return json({
			success: true,
			message: 'Email sent successfully',
			briefId: payload.briefId,
			messageId: emailResult.messageId,
			timestamp: new Date().toISOString()
		});
	} catch (err) {
		console.error('Webhook error:', err);

		// Return appropriate error response
		if (err instanceof Error && 'status' in err) {
			throw err; // Re-throw SvelteKit errors
		}

		throw error(500, 'Failed to process webhook');
	}
};

/**
 * GET /webhooks/daily-brief-email
 *
 * Health check endpoint
 */
export const GET: RequestHandler = async () => {
	return json({
		status: 'healthy',
		service: 'daily-brief-email-webhook',
		timestamp: new Date().toISOString(),
		environment: {
			supabase_configured: !!PUBLIC_SUPABASE_URL && !!PRIVATE_SUPABASE_SERVICE_KEY,
			webhook_secret_configured: !!PRIVATE_BUILDOS_WEBHOOK_SECRET
		}
	});
};
