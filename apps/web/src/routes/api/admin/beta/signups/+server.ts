// apps/web/src/routes/api/admin/beta/signups/+server.ts
import { ApiResponse } from '$lib/utils/api-response';

import type { RequestHandler } from './$types';
import { generateMinimalEmailHTML } from '$lib/utils/emailTemplate.js';
import { createGmailTransporter, getDefaultSender } from '$lib/utils/email-config';

// Beta approval email function
async function sendBetaApprovalEmail(signupData: any) {
	const defaultSender = getDefaultSender();
	if (!defaultSender.password) {
		console.warn('Gmail credentials not configured, skipping approval email');
		return;
	}

	try {
		const transporter = createGmailTransporter();

		// Get first name for personalization
		const firstName = signupData.full_name.split(' ')[0];

		// Create approval email content
		// Updated emailContent in the sendBetaApprovalEmail function
		const emailContent = `
	<h2>🎉 You're In – Welcome to the BuildOS Beta</h2>

	<p><strong>Hey ${firstName},</strong></p>

	<p>You're officially in! We're <em>thrilled</em> to have you as one of our first beta users!</p>

	<div style="background-color: #FAF9F7; border: 2px solid #DCD9D1; padding: 24px; border-radius: 12px; margin: 24px 0; text-align: center;">
		<h3 style="margin-top: 0; color: #D96C1E;">Quick BuildOS Explainer</h3>
		<p style="margin-bottom: 16px;">Before you dive in, here's a quick overview of what BuildOS is all about:</p>

		<div style="position: relative; width: 100%; max-width: 560px; margin: 0 auto;">
			<a href="https://youtu.be/u_BII_b85Wc" target="_blank" style="display: block; text-decoration: none;">
				<img src="https://img.youtube.com/vi/u_BII_b85Wc/maxresdefault.jpg"
					 alt="BuildOS Explainer Video"
					 style="width: 100%; height: auto; border-radius: 8px; border: 2px solid #D96C1E;">
			</a>
		</div>

		<p style="margin-top: 12px; margin-bottom: 0; font-size: 14px;">
			<a href="https://youtu.be/u_BII_b85Wc" target="_blank" style="color: #D96C1E; text-decoration: none;">
				Watch the BuildOS Explainer Video
			</a>
		</p>
	</div>

	<p>We're purposely trying not to say too much here because we want to see what <em>you're</em> going to build and how <em>you</em> are going to use the system.</p>

	<div style="background-color: #fef3c7; border: 2px solid #f59e0b; padding: 20px; border-radius: 12px; margin: 24px 0;">
		<h3 style="margin-top: 0; color: #92400e;">🧠 Your First Mission: Brain Dump</h3>
		<p style="margin-bottom: 0;">The first thing we request that you do is <strong>brain dump a project</strong> and see how the system handles what you said. We're excited to see you use it and see what you build!</p>
	</div>

	<div style="background-color: #FDF4ED; border: 2px solid #D96C1E; padding: 20px; border-radius: 12px; margin: 24px 0;">
		<h3 style="margin-top: 0; color: #D96C1E;">Ready to Get Started?</h3>

		<p><strong>Create your beta account:</strong><br>
		<a href="https://build-os.com/auth/register" style="color: #D96C1E; text-decoration: none; font-weight: bold;">https://build-os.com/auth/register</a></p>

		<p><strong>Already have an account? Login here:</strong><br>
		<a href="https://build-os.com/auth/login" style="color: #D96C1E; text-decoration: none; font-weight: bold;">https://build-os.com/auth/login</a></p>

		<p style="font-size: 14px; margin-bottom: 0;">Use the same email address you signed up with – Google login is available for fastest access.</p>
	</div>

	<div style="background-color: #fef3c7; border: 1px solid #f59e0b; padding: 16px; border-radius: 8px; margin: 16px 0;">
		<p style="margin: 0; font-size: 14px; color: #92400e;"><strong>Note:</strong> We're still awaiting Google's approval for OAuth access, so you may receive a warning when trying to login via Google. If you're not comfortable with this, just use regular email/password.</p>
	</div>

	<h3 style="color: #1f2937;">We Want to Help People Build</h3>

	<p>If you don't know already, we've been using BuildOS to build BuildOS. We believe this is a game-changing productivity tool for creative and chaotic minds like ours – and now yours.</p>

	<p>Found a bug or have feedback? <strong><a href="https://build-os.com/feedback" style="color: #D96C1E; text-decoration: none;">Let us know here</a></strong> – your input shapes where we go next.</p>

	<p>Thanks for being part of this journey. We're excited to build with you.</p>

	<p><strong>– DJ</strong><br>
	<em style="color: #6b7280;">Co-Founders @ BuildOS</em></p>
`;

		// Generate the email HTML using our template
		const emailHTML = generateMinimalEmailHTML({
			subject: `🎉 You're In – Welcome to the BuildOS Beta`,
			content: emailContent
		});

		// Send approval email to the user
		const mailOptions = {
			from: `"DJ from BuildOS" <${defaultSender.email}>`,
			to: signupData.email,
			subject: `🎉 You're In – Welcome to the BuildOS Beta`,
			html: emailHTML,
			replyTo: defaultSender.email
		};

		await transporter.sendMail(mailOptions);
		console.log(`Beta approval email sent to: ${signupData.email}`);

		// Also notify admins about the approval
		await sendBetaApprovalNotification(signupData);
	} catch (error) {
		console.error('Failed to send beta approval email:', error);
		throw error; // Throw error so the API can handle it appropriately
	}
}

// Admin notification for beta approvals
async function sendBetaApprovalNotification(signupData: any) {
	console.log(
		`[sendBetaApprovalNotification] Starting admin notification for: ${signupData.full_name} (${signupData.email})`
	);

	try {
		const defaultSender = getDefaultSender();
		if (!defaultSender.password) {
			console.error(
				'[sendBetaApprovalNotification] ERROR: Gmail credentials not configured!'
			);
			console.error(
				'[sendBetaApprovalNotification] Missing PRIVATE_DJ_GMAIL_APP_PASSWORD environment variable'
			);
			console.error(
				`[sendBetaApprovalNotification] Default sender email: ${defaultSender.email}`
			);
			return;
		}

		console.log(
			`[sendBetaApprovalNotification] Creating Gmail transporter for: ${defaultSender.email}`
		);
		const transporter = createGmailTransporter();

		// Create admin notification content
		const notificationContent = `
			<h2>Beta Application Approved: ${signupData.full_name}</h2>

			<div style="background-color: #dcfce7; border: 1px solid #16a34a; padding: 16px; border-radius: 8px; margin: 16px 0;">
				<h3 style="margin-top: 0; color: #15803d;">✅ Approval Details</h3>
				<p><strong>Name:</strong> ${signupData.full_name}</p>
				<p><strong>Email:</strong> ${signupData.email}</p>
				${signupData.job_title ? `<p><strong>Role:</strong> ${signupData.job_title}</p>` : ''}
				${signupData.company_name ? `<p><strong>Company:</strong> ${signupData.company_name}</p>` : ''}
				<p><strong>Approved:</strong> ${new Date().toLocaleString()}</p>
				<p><strong>Beta Tier:</strong> Founder (20% lifetime discount)</p>
			</div>

			<div style="background-color: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
				<h3>Actions Completed</h3>
				<ul style="margin: 0; padding-left: 20px;">
					<li>✅ Beta member account created</li>
					<li>✅ Welcome email sent to user</li>
					<li>✅ Founder tier access granted</li>
					<li>✅ 20% lifetime discount applied</li>
					<li>✅ Status changed to "approved"</li>
				</ul>
			</div>

			<div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px;">
				<p>The user should now be able to log in and access the beta version.</p>
				<p>Signup ID: ${signupData.id}</p>
			</div>
		`;

		// Generate the email HTML
		const emailHTML = generateMinimalEmailHTML({
			subject: `Beta Approved: ${signupData.full_name}`,
			content: notificationContent
		});

		// Send to both admins
		const adminEmails = ['dj@build-os.com'];
		console.log(
			`[sendBetaApprovalNotification] Preparing to send emails to admins: ${adminEmails.join(', ')}`
		);

		for (const adminEmail of adminEmails) {
			const mailOptions = {
				from: `"BuildOS Beta Management" <${defaultSender.email}>`,
				to: adminEmail,
				subject: `✅ Beta Approved: ${signupData.full_name}`,
				html: emailHTML
			};

			try {
				const result = await transporter.sendMail(mailOptions);
			} catch (emailError: any) {
				console.error(
					`[sendBetaApprovalNotification] ❌ FAILED to send email to ${adminEmail}`
				);
				console.error(
					`[sendBetaApprovalNotification] Error message: ${emailError.message}`
				);
				console.error(`[sendBetaApprovalNotification] Error code: ${emailError.code}`);
				console.error(`[sendBetaApprovalNotification] Full error:`, emailError);
			}
		}

		console.log(
			`[sendBetaApprovalNotification] Completed notification process for: ${signupData.full_name}`
		);
	} catch (error: any) {
		console.error('[sendBetaApprovalNotification] ❌ CRITICAL ERROR in notification function');
		console.error(`[sendBetaApprovalNotification] Error message: ${error.message}`);
		console.error(`[sendBetaApprovalNotification] Error stack:`, error.stack);
		console.error('[sendBetaApprovalNotification] Full error object:', error);
		// Don't throw - we don't want admin notification failures to break the approval
	}
}

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	try {
		const page = parseInt(url.searchParams.get('page') || '1');
		const limit = parseInt(url.searchParams.get('limit') || '100');
		const status = url.searchParams.get('status');
		const search = url.searchParams.get('search');
		const sortBy = url.searchParams.get('sort_by') || 'created_at';
		const sortOrder = url.searchParams.get('sort_order') || 'desc';

		const offset = (page - 1) * limit;

		// Build query
		let query = supabase.from('beta_signups').select('*', { count: 'exact' });

		// Apply filters
		if (status && status !== 'all') {
			query = query.eq('signup_status', status);
		}

		if (search) {
			query = query.or(
				`full_name.ilike.%${search}%,email.ilike.%${search}%,company_name.ilike.%${search}%`
			);
		}

		// Apply sorting and pagination
		query = query
			.order(sortBy, { ascending: sortOrder === 'asc' })
			.range(offset, offset + limit - 1);

		const { data: signups, error, count } = await query;

		if (error) throw error;

		const totalPages = Math.ceil((count || 0) / limit);

		return ApiResponse.success({
			signups: signups || [],
			pagination: {
				current_page: page,
				total_pages: totalPages,
				total_items: count || 0,
				items_per_page: limit
			}
		});
	} catch (error) {
		console.error('Error fetching beta signups:', error);
		return ApiResponse.internalError(error, 'Failed to fetch beta signups');
	}
};

export const PATCH: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	try {
		const { signup_id, status, create_member, send_approval_email } = await request.json();

		if (!signup_id || !status) {
			return ApiResponse.badRequest('Signup ID and status are required');
		}

		// Get the signup data first
		const { data: signupData, error: fetchError } = await supabase
			.from('beta_signups')
			.select('*')
			.eq('id', signup_id)
			.single();

		if (fetchError) {
			console.error('Error fetching signup data:', fetchError);
			return ApiResponse.internalError(fetchError, 'Failed to fetch signup data');
		}

		// Update signup status
		const updates: any = { signup_status: status };
		if (status === 'approved') {
			updates.approved_at = new Date().toISOString();
		}

		const { data: updatedSignup, error: updateError } = await supabase
			.from('beta_signups')
			.update(updates)
			.eq('id', signup_id)
			.select()
			.single();

		if (updateError) throw updateError;

		// If approved and create_member is true, create beta member
		if (status === 'approved' && create_member) {
			const { error: memberError } = await supabase.from('beta_members').insert({
				signup_id: signup_id,
				full_name: updatedSignup.full_name,
				email: updatedSignup.email,
				job_title: updatedSignup.job_title,
				company_name: updatedSignup.company_name,
				beta_tier: 'founder',
				access_level: 'full',
				has_lifetime_pricing: true,
				discount_percentage: 50,
				wants_weekly_calls: updatedSignup.wants_weekly_calls,
				wants_community_access: updatedSignup.wants_community_access,
				user_timezone: updatedSignup.user_timezone || 'America/New_York'
			});

			if (memberError) {
				console.error('Error creating beta member:', memberError);
				return ApiResponse.internalError(memberError, 'Failed to create beta member');
			}

			// Update the user's is_beta_user flag if they have an account
			// First, check if a user with this email exists
			const { data: userData, error: userFetchError } = await supabase
				.from('users')
				.select('id')
				.eq('email', updatedSignup.email)
				.single();

			if (userData && !userFetchError) {
				// User exists, update their beta status
				const { error: userUpdateError } = await supabase
					.from('users')
					.update({ is_beta_user: true })
					.eq('id', userData.id);

				if (userUpdateError) {
					console.error('Error updating user beta status:', userUpdateError);
					// Don't fail the whole operation if this update fails
				} else {
					console.log(`Updated is_beta_user flag for user: ${updatedSignup.email}`);
				}
			} else {
				console.log(
					`No existing user found for email: ${updatedSignup.email} - they will be marked as beta when they register`
				);
			}
		}

		// Send approval email if requested
		if (status === 'approved' && send_approval_email) {
			try {
				await sendBetaApprovalEmail(updatedSignup);
			} catch (emailError) {
				console.error('Failed to send approval email:', emailError);
				return ApiResponse.error(
					'Signup approved but failed to send email. Please contact the user manually.',
					207,
					undefined,
					{ signup: updatedSignup, email_failed: true }
				); // 207 Multi-Status (partial success)
			}
		}

		return ApiResponse.success({
			signup: updatedSignup,
			email_sent: status === 'approved' && send_approval_email
		});
	} catch (error) {
		console.error('Error updating beta signup:', error);
		return ApiResponse.internalError(error, 'Failed to update beta signup');
	}
};
