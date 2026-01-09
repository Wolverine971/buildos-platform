// apps/web/src/routes/api/admin/emails/history/+server.ts

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	try {
		const email = url.searchParams.get('email');

		if (!email) {
			return ApiResponse.badRequest('Email address required');
		}

		// Query email_recipients to find all emails sent to this recipient
		const { data: recipients, error: recipientError } = await supabase
			.from('email_recipients')
			.select(
				`
				id,
				email_id,
				recipient_email,
				recipient_name,
				status,
				sent_at,
				delivered_at,
				opened_at,
				open_count,
				last_opened_at,
				error_message,
				emails (
					id,
					subject,
					content,
					from_email,
					from_name,
					category,
					status,
					sent_at,
					created_at,
					tracking_enabled,
					tracking_id
				)
			`
			)
			.eq('recipient_email', email.toLowerCase())
			.order('sent_at', { ascending: false })
			.limit(50);

		if (recipientError) {
			return ApiResponse.databaseError(recipientError);
		}

		// Transform data to include email content with HTML rendering
		const emailHistory = recipients
			.map((recipient) => {
				if (!recipient.emails) return null;

				return {
					id: recipient.emails.id,
					recipient_id: recipient.id,
					subject: recipient.emails.subject,
					to: recipient.recipient_email,
					body: recipient.emails.content,
					html: recipient.emails.content, // Content is already HTML
					from_email: recipient.emails.from_email,
					from_name: recipient.emails.from_name,
					category: recipient.emails.category,
					status: recipient.emails.status,
					sent_at: recipient.emails.sent_at,
					created_at: recipient.emails.created_at,
					opened_at: recipient.opened_at,
					delivered_at: recipient.delivered_at,
					open_count: recipient.open_count,
					tracking_enabled: recipient.emails.tracking_enabled,
					recipient_status: recipient.status,
					error_message: recipient.error_message
				};
			})
			.filter((email) => email !== null);

		return ApiResponse.success({ data: emailHistory }, `Found ${emailHistory.length} emails`);
	} catch (error) {
		console.error('Error fetching email history:', error);
		return ApiResponse.internalError(error, 'Failed to fetch email history');
	}
};
