// apps/web/src/routes/api/admin/emails/recipients/+server.ts

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	try {
		const source = url.searchParams.get('source') || 'beta_users'; // beta_users, beta_members, custom
		const search = url.searchParams.get('search');
		const limit = parseInt(url.searchParams.get('limit') || '50');

		let recipients = [];

		if (source === 'beta_users') {
			let query = supabase
				.from('beta_signups')
				.select('id, full_name, email, company_name, signup_status')
				.eq('signup_status', 'approved')
				.limit(limit);

			if (search) {
				query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
			}

			const { data, error } = await query;
			if (error) throw error;

			recipients =
				data?.map((user) => ({
					id: user.id,
					name: user.full_name,
					email: user.email,
					company: user.company_name,
					type: 'beta_user',
					status: user.signup_status
				})) || [];
		} else if (source === 'beta_members') {
			let query = supabase
				.from('beta_members')
				.select('id, full_name, email, company_name, beta_tier, is_active')
				.eq('is_active', true)
				.limit(limit);

			if (search) {
				query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
			}

			const { data, error } = await query;
			if (error) throw error;

			recipients =
				data?.map((member) => ({
					id: member.id,
					name: member.full_name,
					email: member.email,
					company: member.company_name,
					type: 'beta_member',
					tier: member.beta_tier,
					active: member.is_active
				})) || [];
		}

		return ApiResponse.success({ recipients });
	} catch (error) {
		console.error('Error fetching recipients:', error);
		return ApiResponse.internalError(error, 'Failed to fetch recipients');
	}
};

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	try {
		const { email_id, recipients } = await request.json();

		if (!email_id || !recipients || !Array.isArray(recipients)) {
			return ApiResponse.badRequest('Email ID and recipients array required');
		}

		// Validate email exists
		const { data: _email, error: emailError } = await supabase
			.from('emails')
			.select('id')
			.eq('id', email_id)
			.single();

		if (emailError) {
			if (emailError.code === 'PGRST116') {
				return ApiResponse.notFound('Email');
			}
			throw emailError;
		}

		// Remove existing recipients
		await supabase.from('email_recipients').delete().eq('email_id', email_id);

		// Add new recipients
		const recipientData = recipients.map((recipient) => ({
			email_id,
			recipient_email: recipient.email,
			recipient_name: recipient.name || null,
			recipient_type: recipient.type || 'custom',
			recipient_id: recipient.id || null
		}));

		const { data: newRecipients, error: insertError } = await supabase
			.from('email_recipients')
			.insert(recipientData)
			.select();

		if (insertError) throw insertError;

		return ApiResponse.success({ recipients: newRecipients });
	} catch (error) {
		console.error('Error updating recipients:', error);
		return ApiResponse.internalError(error, 'Failed to update recipients');
	}
};
