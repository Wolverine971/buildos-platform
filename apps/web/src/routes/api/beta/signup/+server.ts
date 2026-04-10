// apps/web/src/routes/api/beta/signup/+server.ts
import { ApiResponse } from '$lib/utils/api-response';
import type { RequestHandler } from './$types';
import { generateMinimalEmailHTML } from '$lib/utils/emailTemplate.js';
import { createGmailTransporter, getDefaultSender } from '$lib/utils/email-config';
import { validateEmail } from '$lib/utils/email-validation';

interface BetaSignupRequest {
	email: string;
	full_name?: string;
	job_title?: string;
	company_name?: string;
	why_interested?: string;
	productivity_tools?: string[];
	biggest_challenge?: string;
	referral_source?: string;
	wants_weekly_calls?: boolean;
	wants_community_access?: boolean;
	user_timezone?: string;
	honeypot?: string;
}

interface NormalizedBetaSignupRequest {
	email: string;
	full_name: string;
	job_title: string | null;
	company_name: string | null;
	why_interested: string | null;
	productivity_tools: string[];
	biggest_challenge: string | null;
	referral_source: string | null;
	wants_weekly_calls: boolean;
	wants_community_access: boolean;
	user_timezone: string;
}

function normalizeSingleLine(value?: string | null): string | null {
	if (!value) return null;

	const normalized = value
		.replace(/[\r\n\t]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	return normalized || null;
}

function normalizeMultiline(value?: string | null): string | null {
	const normalized = value?.trim();
	return normalized ? normalized : null;
}

function inferFullNameFromEmail(email: string): string {
	const localPart = email.split('@')[0] ?? '';
	const cleaned = localPart
		.replace(/\+.*$/, '')
		.replace(/[._-]+/g, ' ')
		.replace(/\d+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

	if (cleaned.length < 2) {
		return 'BuildOS Beta User';
	}

	return cleaned
		.split(' ')
		.slice(0, 3)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function containsSpamPattern(text: string): boolean {
	const linkMatches = text.match(/https?:\/\/[^\s]+/gi) ?? [];
	if (linkMatches.length > 1) {
		return true;
	}

	return /(.)\1{14,}/.test(text);
}

function normalizeSignupData(data: BetaSignupRequest): {
	data?: NormalizedBetaSignupRequest;
	error?: string;
} {
	if (data.honeypot && data.honeypot.trim() !== '') {
		return { error: 'Spam detected' };
	}

	if (!data.email?.trim()) {
		return { error: 'Email is required' };
	}

	const emailValidation = validateEmail(data.email);
	if (!emailValidation.success || !emailValidation.email) {
		return { error: emailValidation.error || 'Please provide a valid email address' };
	}

	const fullName =
		normalizeSingleLine(data.full_name) ?? inferFullNameFromEmail(emailValidation.email);
	const whyInterested = normalizeMultiline(data.why_interested);
	const biggestChallenge = normalizeMultiline(data.biggest_challenge);
	const combinedNote = [whyInterested, biggestChallenge].filter(Boolean).join('\n');

	if (combinedNote.length > 2000) {
		return { error: 'Please keep your note under 2000 characters.' };
	}

	if (combinedNote && containsSpamPattern(combinedNote)) {
		return { error: 'Your note looks like spam. Please trim it down and try again.' };
	}

	return {
		data: {
			email: emailValidation.email,
			full_name: fullName,
			job_title: normalizeSingleLine(data.job_title),
			company_name: normalizeSingleLine(data.company_name),
			why_interested: whyInterested,
			productivity_tools: (data.productivity_tools ?? [])
				.map((tool) => normalizeSingleLine(tool))
				.filter((tool): tool is string => Boolean(tool))
				.slice(0, 20),
			biggest_challenge: biggestChallenge,
			referral_source: normalizeSingleLine(data.referral_source),
			wants_weekly_calls: data.wants_weekly_calls ?? true,
			wants_community_access: data.wants_community_access ?? true,
			user_timezone: normalizeSingleLine(data.user_timezone) || 'America/New_York'
		}
	};
}

function getClientIP(request: Request): string {
	const forwardedFor = request.headers.get('x-forwarded-for');
	const realIP = request.headers.get('x-real-ip');
	const cfConnectingIP = request.headers.get('cf-connecting-ip');

	if (forwardedFor) {
		return forwardedFor.split(',')[0]?.trim() ?? 'unknown';
	}

	if (realIP) {
		return realIP;
	}

	if (cfConnectingIP) {
		return cfConnectingIP;
	}

	return 'unknown';
}

// Welcome email function
async function sendBetaWelcomeEmail(signupData: any) {
	const defaultSender = getDefaultSender();
	if (!defaultSender.password) {
		console.warn('Gmail credentials not configured, skipping welcome email');
		return;
	}

	try {
		const transporter = createGmailTransporter();

		const firstName = signupData.full_name.split(' ')[0] || 'there';
		const safeFirstName = escapeHtml(firstName);
		const safeEmail = escapeHtml(signupData.email);
		const safeJobTitle = signupData.job_title ? escapeHtml(signupData.job_title) : null;
		const safeCompanyName = signupData.company_name
			? escapeHtml(signupData.company_name)
			: null;

		const emailContent = `
			<h2>Welcome to BuildOS, ${safeFirstName}! 🎉</h2>

			<p>I'm <strong>so excited</strong> you signed up for the beta program! Your application just came through, and I wanted to reach out personally to say thanks.</p>

			<p>Here's what happens next:</p>

			<div style="background-color: #f3f4f6; padding: 20px; border-radius: 12px; margin: 20px 0;">
				<h3 style="margin-top: 0; color: #1f2937;">🚀 What's Coming</h3>
				<ul style="margin: 0; padding-left: 20px;">
					<li><strong>I'll be in touch shortly</strong> - I personally review every application and will reach out within 48 hours</li>
					<li><strong>Beta discount locked in</strong> - Since you're signing up for the beta, you'll get special pricing when we launch</li>
					<li><strong>Early access</strong> - You'll be among the first to see what we've been building</li>
				</ul>
			</div>

			<p>We're creating BuildOS to help people get their life organized so they can spend more time on what actually matters (and maybe touch some grass while you're at it 😄).</p>

			<p>On a serious note - I'm a builder, and I want to help other people build. The fact that you took the time to sign up means the world to me. I can't wait to show you what we've been working on and get your feedback on how to make it even better.</p>

			${
				signupData.wants_weekly_calls
					? "<p>I noticed you're interested in joining calls with me - that's awesome! I love talking with users directly about what they need and how we can help. I'll definitely include you in upcoming beta user calls.</p>"
					: ''
			}

			${
				signupData.wants_community_access
					? "<p>You also mentioned wanting to connect with other beta users. I'm working on setting up a small community where beta users can share tips, give feedback, and help each other out. You'll be first to know when that's ready.</p>"
					: ''
			}

			<div style="background-color: #FDF4ED; border: 1px solid #D96C1E; padding: 20px; border-radius: 12px; margin: 24px 0;">
				<h3 style="margin-top: 0; color: #D96C1E;">In the meantime...</h3>
				<p style="margin-bottom: 0;">Keep an eye on your inbox! I'll be sending you beta access details soon, along with some behind-the-scenes updates on what we're building. If you have any questions or just want to chat about productivity, hit reply - I read every email personally.</p>
			</div>

			<p>Thanks again for joining us on this journey!</p>

			<p>Cheers,<br>
			<strong>DJ</strong><br>
			<span style="color: #6F6E75; font-size: 14px;">Founder, BuildOS</span></p>

			<hr style="margin: 32px 0; border: none; border-top: 1px solid #DCD9D1;">

			<div style="font-size: 14px; color: #6F6E75;">
				<p><strong>Your beta application details:</strong></p>
				<p>📧 Email: ${safeEmail}<br>
				${safeJobTitle ? `💼 Role: ${safeJobTitle}<br>` : ''}
				${safeCompanyName ? `🏢 Company: ${safeCompanyName}<br>` : ''}
				📅 Applied: ${new Date(signupData.created_at).toLocaleDateString()}</p>
			</div>
		`;

		const emailHTML = generateMinimalEmailHTML({
			subject: `Welcome to BuildOS Beta, ${firstName}!`,
			content: emailContent
		});

		const mailOptions = {
			from: `"DJ from BuildOS" <${defaultSender.email}>`,
			to: signupData.email,
			subject: `🎉 Welcome to BuildOS Beta, ${firstName}!`,
			html: emailHTML,
			replyTo: defaultSender.email
		};

		await transporter.sendMail(mailOptions);
		console.log(`Welcome email sent to: ${signupData.email}`);

		await sendBetaSignupNotification(signupData);
	} catch (error) {
		console.error('Failed to send welcome email:', error);
	}
}

async function sendBetaSignupNotification(signupData: any) {
	try {
		const defaultSender = getDefaultSender();
		const transporter = createGmailTransporter();
		const safeName = escapeHtml(signupData.full_name);
		const safeEmail = escapeHtml(signupData.email);
		const safeJobTitle = signupData.job_title ? escapeHtml(signupData.job_title) : null;
		const safeCompanyName = signupData.company_name
			? escapeHtml(signupData.company_name)
			: null;
		const safeReferralSource = signupData.referral_source
			? escapeHtml(signupData.referral_source)
			: null;
		const safeWhyInterested = signupData.why_interested
			? escapeHtml(signupData.why_interested)
			: null;
		const safeBiggestChallenge = signupData.biggest_challenge
			? escapeHtml(signupData.biggest_challenge)
			: null;
		const safeProductivityTools =
			signupData.productivity_tools && signupData.productivity_tools.length > 0
				? signupData.productivity_tools.map((tool: string) => escapeHtml(tool)).join(', ')
				: null;

		const notificationContent = `
			<h2>New Beta Signup: ${safeName}</h2>

			<div style="background-color: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
				<h3>Applicant Details</h3>
				<p><strong>Name:</strong> ${safeName}</p>
				<p><strong>Email:</strong> ${safeEmail}</p>
				${safeJobTitle ? `<p><strong>Role:</strong> ${safeJobTitle}</p>` : ''}
				${safeCompanyName ? `<p><strong>Company:</strong> ${safeCompanyName}</p>` : ''}
				<p><strong>Signed up:</strong> ${new Date(signupData.created_at).toLocaleString()}</p>
				<p><strong>Wants calls:</strong> ${signupData.wants_weekly_calls ? 'Yes' : 'No'}</p>
				<p><strong>Wants community:</strong> ${signupData.wants_community_access ? 'Yes' : 'No'}</p>
				${safeReferralSource ? `<p><strong>Heard about us:</strong> ${safeReferralSource}</p>` : ''}
			</div>

			${
				safeWhyInterested
					? `
				<div style="background-color: #FAF9F7; border: 1px solid #DCD9D1; padding: 16px; border-radius: 8px; margin: 16px 0;">
					<h3>What they're hoping BuildOS helps with:</h3>
					<p style="font-style: italic;">"${safeWhyInterested}"</p>
				</div>
			`
					: ''
			}

			${
				safeBiggestChallenge
					? `
				<div style="background-color: #FAF9F7; border: 1px solid #DCD9D1; padding: 16px; border-radius: 8px; margin: 16px 0;">
					<h3>Their biggest challenge:</h3>
					<p style="font-style: italic;">"${safeBiggestChallenge}"</p>
				</div>
			`
					: ''
			}

			${
				safeProductivityTools
					? `
				<div style="background-color: #FAF9F7; padding: 16px; border-radius: 8px; margin: 16px 0;">
					<h3>Tools they currently use:</h3>
					<p>${safeProductivityTools}</p>
				</div>
			`
					: ''
			}

			<div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #DCD9D1; color: #6F6E75; font-size: 14px;">
				<p>Review this application in the admin panel and approve/decline as needed.</p>
				<p>Signup ID: ${signupData.id}</p>
			</div>
		`;

		// Generate the email HTML
		const emailHTML = generateMinimalEmailHTML({
			subject: `New Beta Signup: ${signupData.full_name}`,
			content: notificationContent
		});

		const adminEmails = ['dj@build-os.com'];

		for (const adminEmail of adminEmails) {
			const mailOptions = {
				from: `"BuildOS Beta Signups" <${defaultSender.email}>`,
				to: adminEmail,
				subject: `🔔 New Beta Signup: ${signupData.full_name}`,
				html: emailHTML
			};

			await transporter.sendMail(mailOptions);
		}

		console.log(`Beta signup notification sent for: ${signupData.full_name}`);
	} catch (error) {
		console.error('Failed to send signup notification:', error);
	}
}

export const POST: RequestHandler = async ({ request, locals: { supabase } }) => {
	try {
		const data: BetaSignupRequest = await request.json();
		const clientIP = getClientIP(request);
		const normalized = normalizeSignupData(data);
		if (normalized.error || !normalized.data) {
			return ApiResponse.badRequest(normalized.error || 'Invalid signup payload.');
		}
		const signupData = normalized.data;

		const userAgent = request.headers.get('user-agent') || 'unknown';

		const { data: existingSignup, error: checkError } = await supabase
			.from('beta_signups')
			.select('id, signup_status')
			.eq('email', signupData.email)
			.single();

		if (checkError && checkError.code !== 'PGRST116') {
			console.error('Error checking existing signup:', checkError);
			return ApiResponse.internalError(
				checkError,
				'Failed to process signup. Please try again.'
			);
		}

		if (existingSignup) {
			return ApiResponse.error(
				"You've already signed up for the beta program. Check your email for updates!",
				409,
				undefined,
				{ status: existingSignup.signup_status }
			);
		}

		const { data: insertData, error: insertError } = await supabase
			.from('beta_signups')
			.insert({
				email: signupData.email,
				full_name: signupData.full_name,
				job_title: signupData.job_title,
				company_name: signupData.company_name,
				why_interested: signupData.why_interested,
				productivity_tools: signupData.productivity_tools,
				biggest_challenge: signupData.biggest_challenge,
				referral_source: signupData.referral_source,
				wants_weekly_calls: signupData.wants_weekly_calls,
				wants_community_access: signupData.wants_community_access,
				user_timezone: signupData.user_timezone,
				ip_address: clientIP !== 'unknown' ? clientIP : null,
				user_agent: userAgent
			})
			.select()
			.single();

		if (insertError) {
			console.error('Database insert error:', insertError);
			return ApiResponse.internalError(
				insertError,
				'Failed to save signup. Please try again.'
			);
		}

		console.log(`New beta signup: ${insertData.id} - ${signupData.email} from ${clientIP}`);

		await sendBetaWelcomeEmail(insertData);

		return ApiResponse.created(
			{ id: insertData.id },
			'Thank you for joining our beta program! Check your email for a welcome message.'
		);
	} catch (error) {
		console.error('Beta signup error:', error);
		return ApiResponse.internalError(error, 'Internal server error');
	}
};

// Function to check beta signup status
export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
	const email = url.searchParams.get('email');

	if (!email) {
		return ApiResponse.badRequest('Email parameter required');
	}

	// Validate and normalize email
	const emailValidation = validateEmail(email);
	if (!emailValidation.success) {
		return ApiResponse.badRequest('Invalid email address');
	}

	try {
		const { data: signup, error } = await supabase
			.from('beta_signups')
			.select('signup_status, created_at')
			.eq('email', emailValidation.email!)
			.single();

		if (error) {
			if (error.code === 'PGRST116') {
				return ApiResponse.success({ status: 'not_found' });
			}
			console.error('Error checking signup status:', error);
			return ApiResponse.internalError(error, 'Failed to check status');
		}

		return ApiResponse.success({
			status: signup.signup_status,
			signedUpAt: signup.created_at
		});
	} catch (error) {
		console.error('Beta status check error:', error);
		return ApiResponse.internalError(error, 'Internal server error');
	}
};
