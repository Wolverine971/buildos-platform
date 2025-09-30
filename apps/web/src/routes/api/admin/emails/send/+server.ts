// apps/web/src/routes/api/admin/emails/send/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { EmailService } from '$lib/services/email-service';

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	try {
		const { user } = await safeGetSession();

		if (!user?.is_admin) {
			return ApiResponse.forbidden('Admin access required');
		}

		// Parse request body
		const body = await request.json();
		const { to, subject, body: emailBody, userId } = body;

		// Validate required fields
		if (!to || !subject || !emailBody) {
			return ApiResponse.error('Missing required fields');
		}

		// Initialize email service
		const emailService = new EmailService(supabase);

		// Send email with tracking
		const result = await emailService.sendEmail({
			to,
			subject,
			body: emailBody,
			userId: userId || null,
			createdBy: user.id,
			metadata: {
				sent_by_admin: user.id,
				generated_by_llm: true,
				user_id: userId || null
			}
		});

		if (!result.success) {
			return ApiResponse.error(result.error || 'Failed to send email');
		}

		return ApiResponse.success({
			success: true,
			messageId: result.messageId
		});
	} catch (error) {
		console.error('Error sending email:', error);
		return ApiResponse.error(error instanceof Error ? error.message : 'Failed to send email');
	}
};
