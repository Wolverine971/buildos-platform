// apps/web/src/routes/webhooks/daily-brief-email/+server.ts
import type { RequestHandler } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';
import { createHmac } from 'crypto';
import { createCustomClient } from '@buildos/supabase-client';
import { PRIVATE_SUPABASE_SERVICE_KEY, PRIVATE_BUILDOS_WEBHOOK_SECRET } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { EmailService } from '$lib/services/email-service';
import { generateMinimalEmailHTML } from '$lib/utils/emailTemplate';
import { renderMarkdown } from '$lib/utils/markdown';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';

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
			const supabase = createCustomClient(PUBLIC_SUPABASE_URL, PRIVATE_SUPABASE_SERVICE_KEY, {
				auth: {
					autoRefreshToken: false,
					persistSession: false
				}
			});
			const errorLogger = ErrorLoggerService.getInstance(supabase);
			await errorLogger.logAPIError(
				new Error(
					`Missing webhook signature or timestamp - signature: ${!!signature}, timestamp: ${!!timestamp}`
				),
				'/webhooks/daily-brief-email',
				'POST',
				undefined,
				{
					source: request.headers.get('x-source'),
					headers: Object.fromEntries(request.headers)
				}
			);
			throw error(401, 'Missing webhook signature or timestamp');
		}

		if (source !== 'daily-brief-worker') {
			const supabase = createCustomClient(PUBLIC_SUPABASE_URL, PRIVATE_SUPABASE_SERVICE_KEY, {
				auth: {
					autoRefreshToken: false,
					persistSession: false
				}
			});
			const errorLogger = ErrorLoggerService.getInstance(supabase);
			await errorLogger.logAPIError(
				new Error(`Invalid webhook source: ${source}`),
				'/webhooks/daily-brief-email',
				'POST',
				undefined,
				{ expectedSource: 'daily-brief-worker', receivedSource: source }
			);
			throw error(401, 'Invalid webhook source');
		}

		// 2. Parse and validate payload
		const rawBody = await request.text();
		const webhookSecret = PRIVATE_BUILDOS_WEBHOOK_SECRET;

		if (!webhookSecret) {
			const supabase = createCustomClient(PUBLIC_SUPABASE_URL, PRIVATE_SUPABASE_SERVICE_KEY, {
				auth: {
					autoRefreshToken: false,
					persistSession: false
				}
			});
			const errorLogger = ErrorLoggerService.getInstance(supabase);
			await errorLogger.logAPIError(
				new Error('PRIVATE_BUILDOS_WEBHOOK_SECRET not configured'),
				'/webhooks/daily-brief-email',
				'POST',
				undefined,
				{ error: 'Configuration issue: missing webhook secret' }
			);
			console.error('PRIVATE_BUILDOS_WEBHOOK_SECRET not configured');
			throw error(500, 'Webhook secret not configured');
		}

		// Verify signature
		if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
			const supabase = createCustomClient(PUBLIC_SUPABASE_URL, PRIVATE_SUPABASE_SERVICE_KEY, {
				auth: {
					autoRefreshToken: false,
					persistSession: false
				}
			});
			const errorLogger = ErrorLoggerService.getInstance(supabase);
			await errorLogger.logAPIError(
				new Error('Invalid webhook signature'),
				'/webhooks/daily-brief-email',
				'POST',
				undefined,
				{ signature, timestamp, bodyLength: rawBody.length }
			);
			throw error(401, 'Invalid webhook signature');
		}

		// Check timestamp freshness (prevent replay attacks)
		const requestTime = new Date(timestamp).getTime();
		const now = Date.now();
		const MAX_AGE = 5 * 60 * 1000; // 5 minutes

		if (Math.abs(now - requestTime) > MAX_AGE) {
			const supabase = createCustomClient(PUBLIC_SUPABASE_URL, PRIVATE_SUPABASE_SERVICE_KEY, {
				auth: {
					autoRefreshToken: false,
					persistSession: false
				}
			});
			const errorLogger = ErrorLoggerService.getInstance(supabase);
			await errorLogger.logAPIError(
				new Error(`Webhook timestamp too old: ${Math.abs(now - requestTime)}ms difference`),
				'/webhooks/daily-brief-email',
				'POST',
				undefined,
				{
					timestamp,
					now: new Date().toISOString(),
					requestTime: new Date(requestTime).toISOString(),
					difference: Math.abs(now - requestTime)
				}
			);
			throw error(401, 'Webhook timestamp too old');
		}

		const payload: WebhookPayload = JSON.parse(rawBody);

		// 3. Initialize Supabase client with service role
		const supabase = createCustomClient(PUBLIC_SUPABASE_URL, PRIVATE_SUPABASE_SERVICE_KEY, {
			auth: {
				autoRefreshToken: false,
				persistSession: false
			}
		});

		// Initialize error logger
		const errorLogger = ErrorLoggerService.getInstance(supabase);

		// 4. Fetch the daily brief data with llm_analysis
		const { data: brief, error: briefError } = await supabase
			.from('daily_briefs')
			.select('*')
			.eq('id', payload.briefId)
			.single();

		if (briefError || !brief) {
			await errorLogger.logAPIError(
				briefError || new Error('Brief not found'),
				'/webhooks/daily-brief-email',
				'POST',
				payload.userId,
				{ briefId: payload.briefId, error: briefError?.message, payload }
			);
			console.error('Failed to fetch brief:', briefError);
			throw error(404, 'Brief not found');
		}

		// Get llm_analysis content or fallback to summary_content
		const briefContent = brief.llm_analysis || brief.summary_content || '';

		if (!briefContent) {
			await errorLogger.logAPIError(
				new Error('No content found in brief'),
				'/webhooks/daily-brief-email',
				'POST',
				payload.userId,
				{
					briefId: payload.briefId,
					hasLlmAnalysis: !!brief.llm_analysis,
					hasSummaryContent: !!brief.summary_content
				}
			);
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
				<a href="https://build-os.com/projects?briefDate=${payload.briefDate}" style="color: #3b82f6; text-decoration: none; font-size: 14px;">View in BuildOS →</a>
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
			await errorLogger.logAPIError(
				new Error(emailResult.error || 'Failed to send email'),
				'/webhooks/daily-brief-email',
				'POST',
				payload.userId,
				{
					briefId: payload.briefId,
					recipientEmail: payload.recipientEmail,
					emailError: emailResult.error,
					metadata: payload.metadata
				}
			);
			console.error('Failed to send email:', emailResult.error);
			throw error(500, 'Failed to send email');
		}

		// 10. Update tracking records if provided
		if (payload.metadata?.recipientRecordId) {
			const { error: recipientUpdateError } = await supabase
				.from('email_recipients')
				.update({
					status: 'sent',
					sent_at: new Date().toISOString()
				})
				.eq('id', payload.metadata.recipientRecordId);

			if (recipientUpdateError) {
				await errorLogger.logDatabaseError(
					recipientUpdateError,
					'update',
					'email_recipients',
					payload.metadata.recipientRecordId,
					{ status: 'sent', sent_at: new Date().toISOString() }
				);
				console.error('Failed to update email recipient record:', recipientUpdateError);
			}
		}

		// 11. Log email tracking event
		if (payload.metadata?.emailRecordId && payload.metadata?.recipientRecordId) {
			const { error: trackingError } = await supabase.from('email_tracking_events').insert({
				email_id: payload.metadata.emailRecordId,
				recipient_id: payload.metadata.recipientRecordId,
				event_type: 'sent',
				timestamp: new Date().toISOString(),
				event_data: {
					brief_id: payload.briefId,
					user_id: payload.userId,
					sent_via: 'webhook',
					message_id: emailResult.messageId,
					tracking_id: payload.metadata.trackingId
				}
			});

			if (trackingError) {
				await errorLogger.logDatabaseError(
					trackingError,
					'insert',
					'email_tracking_events',
					undefined,
					{
						email_id: payload.metadata.emailRecordId,
						recipient_id: payload.metadata.recipientRecordId,
						event_type: 'sent',
						event_data: {
							brief_id: payload.briefId,
							user_id: payload.userId,
							tracking_id: payload.metadata.trackingId
						}
					}
				);
				console.error('Failed to log email tracking event:', trackingError);
			}
		}

		// 12. Return success response
		// Note: Email tracking is handled through the emails and email_recipients tables.
		// The brief_id is stored in the email metadata for reference.
		return json({
			success: true,
			message: 'Email sent successfully',
			briefId: payload.briefId,
			messageId: emailResult.messageId,
			timestamp: new Date().toISOString()
		});
	} catch (err) {
		// Try to log the error if we haven't already
		if (
			err instanceof Error &&
			!err.message.includes('Missing webhook') &&
			!err.message.includes('Invalid webhook') &&
			!err.message.includes('Webhook timestamp')
		) {
			try {
				const supabase = createCustomClient(
					PUBLIC_SUPABASE_URL,
					PRIVATE_SUPABASE_SERVICE_KEY,
					{
						auth: {
							autoRefreshToken: false,
							persistSession: false
						}
					}
				);
				const errorLogger = ErrorLoggerService.getInstance(supabase);
				const payload = request.headers.get('x-webhook-payload')
					? JSON.parse(request.headers.get('x-webhook-payload') as string)
					: undefined;
				await errorLogger.logAPIError(
					err,
					'/webhooks/daily-brief-email',
					'POST',
					payload?.userId,
					{
						errorType: 'unexpected_webhook_error',
						errorMessage: err.message,
						errorStack: err.stack
					}
				);
			} catch (logError) {
				console.error('Failed to log webhook error:', logError);
			}
		}

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
