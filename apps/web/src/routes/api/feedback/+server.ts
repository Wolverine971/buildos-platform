// apps/web/src/routes/api/feedback/+server.ts
import type { RequestHandler } from './$types';
import { generateMinimalEmailHTML } from '$lib/utils/emailTemplate.js';
import { createGmailTransporter, getDefaultSender } from '$lib/utils/email-config';
import { ApiResponse, parseRequestBody } from '$lib/utils/api-response';
import { emailColors } from '$lib/utils/email-styles';
import { validateOptionalEmail } from '$lib/utils/email-validation';

interface FeedbackRequest {
	category: string;
	rating?: number;
	feedback_text: string;
	user_email?: string;
	honeypot?: string;
}

function validateFeedbackData(data: FeedbackRequest): string | null {
	// Check honeypot (should be empty)
	if (data.honeypot && data.honeypot.trim() !== '') {
		return 'Spam detected';
	}

	// Validate required fields
	if (!data.category || !data.feedback_text) {
		return 'Missing required fields';
	}

	// Validate category
	const validCategories = ['feature', 'bug', 'improvement', 'general'];
	if (!validCategories.includes(data.category)) {
		return 'Invalid category';
	}

	// Validate feedback text length
	if (data.feedback_text.length < 10) {
		return 'Feedback too short (minimum 10 characters)';
	}

	if (data.feedback_text.length > 5000) {
		return 'Feedback too long (maximum 5000 characters)';
	}

	// Validate rating if provided
	if (data.rating !== undefined && (data.rating < 1 || data.rating > 5)) {
		return 'Invalid rating (must be 1-5)';
	}

	// Validate email format if provided (enhanced security)
	if (data.user_email) {
		const emailValidation = validateOptionalEmail(data.user_email);
		if (!emailValidation.success) {
			return emailValidation.error || 'Invalid email format';
		}
	}

	// Check for spam patterns
	const spamPatterns = [
		/https?:\/\/[^\s]+/gi, // URLs
		/\b(bitcoin|crypto|investment|loan|money|viagra|casino|gambling)\b/gi, // Common spam words
		/(.)\1{10,}/g, // Repeated characters
		/\b(buy|sell|cheap|free|win|click|urgent|limited)\b/gi // More spam indicators
	];

	for (const pattern of spamPatterns) {
		if (pattern.test(data.feedback_text)) {
			return 'Message appears to contain spam';
		}
	}

	return null;
}

function getClientIP(request: Request): string {
	// Try to get IP from various headers (depends on your deployment)
	const forwardedFor = request.headers.get('x-forwarded-for');
	const realIP = request.headers.get('x-real-ip');
	const cfConnectingIP = request.headers.get('cf-connecting-ip'); // Cloudflare

	if (forwardedFor) {
		return forwardedFor.split(',')[0]!.trim();
	}

	if (realIP) {
		return realIP;
	}

	if (cfConnectingIP) {
		return cfConnectingIP;
	}

	return 'unknown';
}

async function checkRateLimit(supabase: any, clientIP: string): Promise<boolean> {
	if (clientIP === 'unknown') return true; // Allow if we can't get IP

	try {
		const { data, error } = await supabase.rpc('check_feedback_rate_limit', {
			client_ip: clientIP
		});

		if (error) {
			// Rate limit check error
			return true; // Allow submission if rate limit check fails
		}

		return data;
	} catch (error) {
		console.error('Rate limit check error:', error);
		return true; // Allow submission if rate limit check fails
	}
}

// Email notification function - now actually implemented!
async function sendFeedbackNotification(feedback: any) {
	console.log(`[sendFeedbackNotification] Starting notification for feedback ID: ${feedback.id}`);
	console.log(
		`[sendFeedbackNotification] Category: ${feedback.category}, User email: ${feedback.user_email || 'anonymous'}`
	);

	const defaultSender = getDefaultSender();
	if (!defaultSender.password) {
		console.error('[sendFeedbackNotification] ERROR: Gmail credentials not configured!');
		console.error(
			'[sendFeedbackNotification] Missing PRIVATE_DJ_GMAIL_APP_PASSWORD environment variable'
		);
		console.error(`[sendFeedbackNotification] Default sender email: ${defaultSender.email}`);
		return;
	}

	console.log(
		`[sendFeedbackNotification] Creating Gmail transporter for: ${defaultSender.email}`
	);

	try {
		const transporter = createGmailTransporter();

		// Format the category for display
		const categoryDisplayNames = {
			feature: 'Feature Request',
			bug: 'Bug Report',
			improvement: 'Improvement Suggestion',
			general: 'General Feedback'
		};

		const categoryDisplay =
			categoryDisplayNames[feedback.category as keyof typeof categoryDisplayNames] ||
			feedback.category;

		// Create warm and appreciative email content
		const emailContent = `
			<h2>🎉 New ${categoryDisplay} from a BuildOS User!</h2>

			<p>Hey! Someone just took the time to share some valuable feedback with us. Love seeing this - it means people are actually using what we're building and care enough to help make it better! 🙌</p>

			${
				feedback.user_email
					? `<div style="background-color: ${emailColors.primaryLight}; border: 1px solid ${emailColors.primary}; padding: 16px; border-radius: 12px; margin: 20px 0;">
					<h3 style="margin-top: 0; color: ${emailColors.primaryDark};">💌 They left their email!</h3>
					<p style="margin-bottom: 0;"><strong>${feedback.user_email}</strong> - Don't forget to reply personally! These are the users who really care about what we're doing.</p>
				</div>`
					: `<div style="background-color: ${emailColors.warningLight}; border: 1px solid ${emailColors.warning}; padding: 16px; border-radius: 12px; margin: 20px 0;">
					<h3 style="margin-top: 0; color: ${emailColors.warningDark};">📬 Anonymous feedback</h3>
					<p style="margin-bottom: 0;">They didn't leave an email, but their input is still super valuable for improving BuildOS!</p>
				</div>`
			}

			<div style="background-color: ${emailColors.backgroundAlt}; padding: 20px; border-radius: 12px; margin: 20px 0;">
				<h3 style="margin-top: 0; color: ${emailColors.text};">📋 What they shared</h3>
				<p><strong>Type:</strong> ${categoryDisplay}</p>
				${feedback.rating ? `<p><strong>Rating:</strong> ${'★'.repeat(feedback.rating)}${'☆'.repeat(5 - feedback.rating)} (${feedback.rating}/5) ${feedback.rating >= 4 ? '- Nice! 🎯' : feedback.rating === 3 ? '- Room for improvement 💪' : '- We need to do better 🔧'}</p>` : ''}
				<p><strong>Submitted:</strong> ${new Date(feedback.created_at).toLocaleString()}</p>
				${feedback.user_ip ? `<p><strong>Location:</strong> ${feedback.user_ip}</p>` : ''}
			</div>

			<div style="background-color: ${emailColors.background}; border: 2px solid ${emailColors.border}; padding: 20px; border-radius: 12px; margin: 20px 0;">
				<h3 style="margin-top: 0; color: ${emailColors.text};">💬 Their message:</h3>
				<div style="background-color: ${emailColors.backgroundAlt}; padding: 16px; border-radius: 8px; border-left: 4px solid ${emailColors.primary};">
					<p style="white-space: pre-wrap; line-height: 1.6; margin: 0; font-style: italic;">"${feedback.feedback_text}"</p>
				</div>
			</div>

			${
				feedback.category === 'bug'
					? `<div style="background-color: ${emailColors.errorLight}; border: 1px solid ${emailColors.error}; padding: 16px; border-radius: 12px; margin: 20px 0;">
					<h3 style="margin-top: 0; color: ${emailColors.errorDark};">🐛 Bug Alert!</h3>
					<p style="margin-bottom: 0;">This is a bug report - might want to prioritize looking into this one!</p>
				</div>`
					: feedback.category === 'feature'
						? `<div style="background-color: ${emailColors.successLight}; border: 1px solid ${emailColors.success}; padding: 16px; border-radius: 12px; margin: 20px 0;">
					<h3 style="margin-top: 0; color: ${emailColors.successDark};">💡 Feature Idea!</h3>
					<p style="margin-bottom: 0;">Someone has an idea for making BuildOS even better. Love to see it!</p>
				</div>`
						: ''
			}

			<div style="background-color: ${emailColors.backgroundAlt}; border: 1px solid ${emailColors.border}; padding: 20px; border-radius: 12px; margin: 24px 0;">
				<h3 style="margin-top: 0; color: ${emailColors.textMuted};">🎯 Next steps:</h3>
				<ul style="margin-bottom: 0; padding-left: 20px;">
					${feedback.user_email ? `<li><strong>Reply personally</strong> - Thank them for taking the time to share feedback</li>` : ''}
					<li><strong>Consider the feedback</strong> - How can this help us improve BuildOS?</li>
					<li><strong>Take action</strong> - Whether it's a bug fix, feature consideration, or process improvement</li>
				</ul>
			</div>

			<p>We consider every piece of feedback a gift. Someone cared enough about what we're building to take time out of their day to help us make it better. That's pretty amazing! 🚀</p>

			<p>Time to dive in and see how we can use this to make BuildOS more awesome!</p>

			<hr style="margin: 32px 0; border: none; border-top: 1px solid #e5e7eb;">

			<div style="font-size: 14px; color: #6b7280;">
				<p><strong>Feedback Details:</strong></p>
				<p>ID: ${feedback.id}<br>
				Submitted: ${new Date(feedback.created_at).toLocaleString()}<br>
				${feedback.user_email ? `Contact: ${feedback.user_email}` : 'Contact: Anonymous'}</p>
				<p style="margin-top: 16px;"><em>This notification was sent from your BuildOS feedback system.</em></p>
			</div>
		`;

		// Generate the email HTML using our template
		const emailHTML = generateMinimalEmailHTML({
			subject: `New ${categoryDisplay} - BuildOS Feedback`,
			content: emailContent
		});

		// Determine notification recipients
		const notificationEmails = ['dj@build-os.com'];
		console.log(
			`[sendFeedbackNotification] Preparing to send emails to admins: ${notificationEmails.join(', ')}`
		);

		// Send email to each admin with a more personal subject line
		for (const adminEmail of notificationEmails) {
			const subjectEmoji =
				feedback.category === 'bug'
					? '🐛'
					: feedback.category === 'feature'
						? '💡'
						: feedback.category === 'improvement'
							? '⭐'
							: '💬';

			const mailOptions = {
				from: `"BuildOS Feedback" <${defaultSender.email}>`,
				to: adminEmail,
				subject: `Feedback- ${subjectEmoji} New ${categoryDisplay}${feedback.user_email ? ' (with email!)' : ''} - BuildOS`,
				html: emailHTML,
				replyTo: feedback.user_email || undefined // Allow direct reply if user provided email
			};

			console.log(`[sendFeedbackNotification] Sending email to: ${adminEmail}`);
			console.log(`[sendFeedbackNotification] From: ${mailOptions.from}`);
			console.log(`[sendFeedbackNotification] Subject: ${mailOptions.subject}`);
			console.log(`[sendFeedbackNotification] ReplyTo: ${mailOptions.replyTo || 'none'}`);

			try {
				const result = await transporter.sendMail(mailOptions);
				console.log(`[sendFeedbackNotification] ✅ SUCCESS: Email sent to ${adminEmail}`);
				console.log(`[sendFeedbackNotification] Message ID: ${result.messageId}`);
				console.log(`[sendFeedbackNotification] Response: ${result.response}`);
			} catch (emailError: any) {
				console.error(
					`[sendFeedbackNotification] ❌ FAILED to send email to ${adminEmail}`
				);
				console.error(`[sendFeedbackNotification] Error message: ${emailError.message}`);
				console.error(`[sendFeedbackNotification] Error code: ${emailError.code}`);
				console.error(`[sendFeedbackNotification] Full error:`, emailError);
			}
		}

		console.log(
			`[sendFeedbackNotification] Completed notification process for feedback ID: ${feedback.id}`
		);
	} catch (error: any) {
		console.error('[sendFeedbackNotification] ❌ CRITICAL ERROR in notification function');
		console.error(`[sendFeedbackNotification] Error message: ${error.message}`);
		console.error(`[sendFeedbackNotification] Error stack:`, error.stack);
		console.error('[sendFeedbackNotification] Full error object:', error);
		// Don't throw error - we don't want email failures to break feedback submission
	}
}

export const POST: RequestHandler = async ({ request, locals: { supabase } }) => {
	try {
		// Parse request body
		const data = await parseRequestBody<FeedbackRequest>(request);
		if (!data) {
			return ApiResponse.badRequest('Invalid request body');
		}

		// Validate input data
		const validationError = validateFeedbackData(data);
		if (validationError) {
			return ApiResponse.badRequest(validationError);
		}

		// Normalize email if provided
		const emailValidation = validateOptionalEmail(data.user_email);
		const normalizedEmail = emailValidation.email;

		// Get client IP for rate limiting
		const clientIP = getClientIP(request);

		// Check rate limit
		const canSubmit = await checkRateLimit(supabase, clientIP);
		if (!canSubmit) {
			return ApiResponse.error(
				'Rate limit exceeded. Please wait before submitting again.',
				429,
				'RATE_LIMITED'
			);
		}

		// Get user agent
		const userAgent = request.headers.get('user-agent') || 'unknown';

		// Insert feedback into database (use normalized email)
		const { data: insertData, error: insertError } = await supabase
			.from('feedback')
			.insert({
				category: data.category,
				rating: data.rating || null,
				feedback_text: data.feedback_text.trim(),
				user_email: normalizedEmail,
				user_ip: clientIP !== 'unknown' ? clientIP : null,
				user_agent: userAgent
			})
			.select()
			.single();

		if (insertError) {
			console.error('Database insert error:', insertError);
			return ApiResponse.databaseError(insertError);
		}

		// Log successful submission
		console.log(`New feedback submitted: ${insertData.id} from ${clientIP}`);

		// Send email notification (now actually implemented!)
		await sendFeedbackNotification(insertData);

		return ApiResponse.created({ id: insertData.id }, 'Feedback submitted successfully');
	} catch (error) {
		console.error('Feedback submission error:', error);
		return ApiResponse.internalError(error);
	}
};
