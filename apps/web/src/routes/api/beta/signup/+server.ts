// apps/web/src/routes/api/beta/signup/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateMinimalEmailHTML } from '$lib/utils/emailTemplate.js';
import { createGmailTransporter, getDefaultSender } from '$lib/utils/email-config';

interface BetaSignupRequest {
	email: string;
	full_name: string;
	job_title?: string;
	company_name?: string;
	why_interested: string;
	productivity_tools: string[];
	biggest_challenge: string;
	referral_source?: string;
	wants_weekly_calls: boolean;
	wants_community_access: boolean;
	user_timezone?: string;
	honeypot?: string;
}

function validateSignupData(data: BetaSignupRequest): string | null {
	// Check honeypot
	if (data.honeypot && data.honeypot.trim() !== '') {
		return 'Spam detected';
	}

	// Validate required fields
	if (!data.email || !data.full_name || !data.why_interested || !data.biggest_challenge) {
		return 'Please fill in all required fields';
	}

	// Validate email format
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	if (!emailRegex.test(data.email)) {
		return 'Please provide a valid email address';
	}

	// Validate field lengths
	if (data.full_name.length < 2) {
		return 'Please provide your full name';
	}

	if (data.why_interested.length < 20) {
		return "Please provide more detail about why you're interested (minimum 20 characters)";
	}

	if (data.biggest_challenge.length < 10) {
		return 'Please describe your productivity challenge in more detail';
	}

	// Check for spam patterns
	const spamPatterns = [
		/https?:\/\/[^\s]+/gi,
		/\b(bitcoin|crypto|investment|loan|money)\b/gi,
		/(.)\1{10,}/g
	];

	const textToCheck = `${data.why_interested} ${data.biggest_challenge}`;
	for (const pattern of spamPatterns) {
		if (pattern.test(textToCheck)) {
			return 'Your message appears to contain spam. Please revise and try again.';
		}
	}

	return null;
}

function getClientIP(request: Request): string {
	const forwardedFor = request.headers.get('x-forwarded-for');
	const realIP = request.headers.get('x-real-ip');
	const cfConnectingIP = request.headers.get('cf-connecting-ip');

	if (forwardedFor) {
		return forwardedFor.split(',')[0].trim();
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

		// Get first name for personalization
		const firstName = signupData.full_name.split(' ')[0];

		// Create personalized email content
		const emailContent = `
			<h2>Welcome to BuildOS, ${firstName}! 🎉</h2>

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

			<p>On a serious note - I'm a builder, and I want to help other people build. The fact that you took the time to sign up and share your productivity challenges means the world to me. I can't wait to show you what we've been working on and get your feedback on how to make it even better.</p>

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

			<div style="background-color: #dbeafe; border: 1px solid #3b82f6; padding: 20px; border-radius: 12px; margin: 24px 0;">
				<h3 style="margin-top: 0; color: #1e40af;">💡 In the meantime...</h3>
				<p style="margin-bottom: 0;">Keep an eye on your inbox! I'll be sending you beta access details soon, along with some behind-the-scenes updates on what we're building. If you have any questions or just want to chat about productivity, hit reply - I read every email personally.</p>
			</div>

			<p>Thanks again for joining us on this journey!</p>

			<p>Cheers,<br>
			<strong>DJ</strong><br>
			<span style="color: #6b7280; font-size: 14px;">Founder, BuildOS</span></p>

			<hr style="margin: 32px 0; border: none; border-top: 1px solid #e5e7eb;">

			<div style="font-size: 14px; color: #6b7280;">
				<p><strong>Your beta application details:</strong></p>
				<p>📧 Email: ${signupData.email}<br>
				${signupData.job_title ? `💼 Role: ${signupData.job_title}<br>` : ''}
				${signupData.company_name ? `🏢 Company: ${signupData.company_name}<br>` : ''}
				📅 Applied: ${new Date(signupData.created_at).toLocaleDateString()}</p>
			</div>
		`;

		// Generate the email HTML using our template
		const emailHTML = generateMinimalEmailHTML({
			subject: `Welcome to BuildOS Beta, ${firstName}!`,
			content: emailContent
		});

		// Send welcome email to the user
		const mailOptions = {
			from: `"DJ from BuildOS" <${defaultSender.email}>`,
			to: signupData.email,
			subject: `🎉 Welcome to BuildOS Beta, ${firstName}!`,
			html: emailHTML,
			replyTo: defaultSender.email
		};

		await transporter.sendMail(mailOptions);
		console.log(`Welcome email sent to: ${signupData.email}`);

		// Also notify admins about the new signup
		await sendBetaSignupNotification(signupData);
	} catch (error) {
		console.error('Failed to send welcome email:', error);
		// Don't throw error - we don't want email failures to break signup
	}
}

// Admin notification for new beta signups
async function sendBetaSignupNotification(signupData: any) {
	try {
		const transporter = createGmailTransporter();

		// Create admin notification content
		const notificationContent = `
			<h2>New Beta Signup: ${signupData.full_name}</h2>

			<div style="background-color: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
				<h3>Applicant Details</h3>
				<p><strong>Name:</strong> ${signupData.full_name}</p>
				<p><strong>Email:</strong> ${signupData.email}</p>
				${signupData.job_title ? `<p><strong>Role:</strong> ${signupData.job_title}</p>` : ''}
				${signupData.company_name ? `<p><strong>Company:</strong> ${signupData.company_name}</p>` : ''}
				<p><strong>Signed up:</strong> ${new Date(signupData.created_at).toLocaleString()}</p>
				<p><strong>Wants calls:</strong> ${signupData.wants_weekly_calls ? 'Yes' : 'No'}</p>
				<p><strong>Wants community:</strong> ${signupData.wants_community_access ? 'Yes' : 'No'}</p>
				${signupData.referral_source ? `<p><strong>Heard about us:</strong> ${signupData.referral_source}</p>` : ''}
			</div>

			<div style="background-color: #ffffff; border: 1px solid #e5e7eb; padding: 16px; border-radius: 8px; margin: 16px 0;">
				<h3>Why they're interested:</h3>
				<p style="font-style: italic;">"${signupData.why_interested}"</p>
			</div>

			<div style="background-color: #ffffff; border: 1px solid #e5e7eb; padding: 16px; border-radius: 8px; margin: 16px 0;">
				<h3>Their biggest challenge:</h3>
				<p style="font-style: italic;">"${signupData.biggest_challenge}"</p>
			</div>

			${
				signupData.productivity_tools && signupData.productivity_tools.length > 0
					? `
				<div style="background-color: #f9fafb; padding: 16px; border-radius: 8px; margin: 16px 0;">
					<h3>Tools they currently use:</h3>
					<p>${signupData.productivity_tools.join(', ')}</p>
				</div>
			`
					: ''
			}

			<div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px;">
				<p>Review this application in the admin panel and approve/decline as needed.</p>
				<p>Signup ID: ${signupData.id}</p>
			</div>
		`;

		// Generate the email HTML
		const emailHTML = generateMinimalEmailHTML({
			subject: `New Beta Signup: ${signupData.full_name}`,
			content: notificationContent
		});

		// Send to both admins
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
		// Parse request body
		const data: BetaSignupRequest = await request.json();

		// Validate input data
		const validationError = validateSignupData(data);
		if (validationError) {
			return json({ error: validationError }, { status: 400 });
		}

		// Get client info
		const clientIP = getClientIP(request);
		const userAgent = request.headers.get('user-agent') || 'unknown';

		// Check if email already exists
		const { data: existingSignup, error: checkError } = await supabase
			.from('beta_signups')
			.select('id, signup_status')
			.eq('email', data.email.toLowerCase().trim())
			.single();

		if (checkError && checkError.code !== 'PGRST116') {
			// PGRST116 = no rows found
			console.error('Error checking existing signup:', checkError);
			return json({ error: 'Failed to process signup. Please try again.' }, { status: 500 });
		}

		if (existingSignup) {
			return json(
				{
					error: "You've already signed up for the beta program. Check your email for updates!",
					status: existingSignup.signup_status
				},
				{ status: 409 }
			);
		}

		// Insert beta signup
		const { data: insertData, error: insertError } = await supabase
			.from('beta_signups')
			.insert({
				email: data.email.toLowerCase().trim(),
				full_name: data.full_name.trim(),
				job_title: data.job_title?.trim() || null,
				company_name: data.company_name?.trim() || null,
				why_interested: data.why_interested.trim(),
				productivity_tools: data.productivity_tools || [],
				biggest_challenge: data.biggest_challenge.trim(),
				referral_source: data.referral_source?.trim() || null,
				wants_weekly_calls: data.wants_weekly_calls,
				wants_community_access: data.wants_community_access,
				user_timezone: data.user_timezone || 'America/New_York',
				ip_address: clientIP !== 'unknown' ? clientIP : null,
				user_agent: userAgent
			})
			.select()
			.single();

		if (insertError) {
			console.error('Database insert error:', insertError);
			return json({ error: 'Failed to save signup. Please try again.' }, { status: 500 });
		}

		// Log successful signup
		console.log(`New beta signup: ${insertData.id} - ${data.email} from ${clientIP}`);

		// Send welcome email!
		await sendBetaWelcomeEmail(insertData);

		return json(
			{
				success: true,
				id: insertData.id,
				message:
					'Thank you for joining our beta program! Check your email for a welcome message.'
			},
			{ status: 201 }
		);
	} catch (error) {
		console.error('Beta signup error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

// Function to check beta signup status
export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
	const email = url.searchParams.get('email');

	if (!email) {
		return json({ error: 'Email parameter required' }, { status: 400 });
	}

	try {
		const { data: signup, error } = await supabase
			.from('beta_signups')
			.select('signup_status, created_at')
			.eq('email', email.toLowerCase().trim())
			.single();

		if (error) {
			if (error.code === 'PGRST116') {
				return json({ status: 'not_found' });
			}
			console.error('Error checking signup status:', error);
			return json({ error: 'Failed to check status' }, { status: 500 });
		}

		return json({
			status: signup.signup_status,
			signedUpAt: signup.created_at
		});
	} catch (error) {
		console.error('Beta status check error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
