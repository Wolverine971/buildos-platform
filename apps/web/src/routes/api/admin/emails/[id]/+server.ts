// apps/web/src/routes/api/admin/emails/[id]/+server.ts

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	try {
		const { data: email, error } = await supabase
			.from('emails')
			.select(
				`
				*,
				email_recipients (
					id,
					recipient_email,
					recipient_name,
					recipient_type,
					recipient_id,
					status,
					sent_at,
					delivered_at,
					opened_at,
					open_count,
					last_opened_at,
					error_message
				),
				email_attachments (
					id,
					filename,
					original_filename,
					file_size,
					content_type,
					is_image,
					image_width,
					image_height,
					storage_path,
					optimized_versions,
					is_inline,
					cid
				)
			`
			)
			.eq('id', params.id)
			.single();

		if (error) {
			return ApiResponse.databaseError(error);
		}

		return ApiResponse.success({ email });
	} catch (error) {
		console.error('Error fetching email:', error);
		return ApiResponse.internalError(error, 'Failed to fetch email');
	}
};

export const DELETE: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	try {
		// Check if email exists and is not sent
		const { data: email, error: fetchError } = await supabase
			.from('emails')
			.select('status')
			.eq('id', params.id)
			.single();

		if (fetchError) {
			return ApiResponse.databaseError(fetchError);
		}

		if (email.status === 'sent' || email.status === 'delivered') {
			return ApiResponse.badRequest('Cannot delete sent emails');
		}

		// Delete email (cascades to recipients and attachments)
		const { error: deleteError } = await supabase.from('emails').delete().eq('id', params.id);

		if (deleteError) {
			return ApiResponse.databaseError(deleteError);
		}

		return ApiResponse.success(null, 'Email deleted successfully');
	} catch (error) {
		console.error('Error deleting email:', error);
		return ApiResponse.internalError(error, 'Failed to delete email');
	}
};
