// apps/web/src/routes/api/admin/emails/[id]/+server.ts

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ApiResponse, parseRequestBody } from '$lib/utils/api-response';

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

export const PATCH: RequestHandler = async ({
	params,
	request,
	locals: { supabase, safeGetSession }
}) => {
	const { user } = await safeGetSession();

	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	try {
		const updates = await parseRequestBody(request);

		if (!updates) {
			return ApiResponse.badRequest('Invalid request body');
		}

		const { recipients } = updates;

		// Remove fields that shouldn't be updated directly
		// const { id, created_by, created_at, tracking_id, subject...allowedUpdates } = updates;

		// Check if email already has a tracking_id
		const { data: existingEmail } = await supabase
			.from('emails')
			.select('tracking_id')
			.eq('id', params.id)
			.single();

		const allowedUpdates = {
			subject: updates.subject,
			content: updates.content,
			from_email: updates.from_email,
			from_name: updates.from_name,
			category: updates.category,
			status: updates.status,
			scheduled_at: updates.scheduled_at || null,
			created_by: user.id,
			// Generate tracking_id if it doesn't exist yet
			tracking_id: updates.tracking_id || existingEmail?.tracking_id || crypto.randomUUID(),
			tracking_enabled: true,
			sent_at: updates.sent_at || null,
			template_data: updates.template_data || null
		};

		const { data: email, error } = await supabase
			.from('emails')
			.update(allowedUpdates)
			.eq('id', params.id)
			.select()
			.single();

		if (error) {
			return ApiResponse.databaseError(error);
		}

		// Handle recipient updates if provided
		if (recipients && Array.isArray(recipients)) {
			console.log(
				'Processing recipients:',
				recipients.map((r) => ({ email: r.email, type: r.type }))
			);

			// First, remove all existing recipients for this email
			const { error: deleteError } = await supabase
				.from('email_recipients')
				.delete()
				.eq('email_id', email.id);

			if (deleteError) {
				console.error('Error removing existing recipients:', deleteError);
				throw new Error('Failed to update recipients');
			}

			// Then add the new recipients if any
			if (recipients.length > 0) {
				const recipientData = recipients.map((recipient) => {
					// Validate email format for all recipients
					const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
					if (!emailRegex.test(recipient.email)) {
						throw new Error(`Invalid email format: ${recipient.email}`);
					}

					return {
						email_id: email.id,
						recipient_email: recipient.email,
						recipient_name: recipient.name || null,
						recipient_type: recipient.type || 'custom',
						recipient_id: recipient.id || null
					};
				});

				const { error: recipientError } = await supabase
					.from('email_recipients')
					.insert(recipientData);

				if (recipientError) {
					console.error('Error adding recipients:', recipientError);
					throw new Error('Failed to save recipients');
				}

				console.log(`Successfully saved ${recipientData.length} recipients`);
			} else {
				console.log('No recipients to add');
			}
		}

		return ApiResponse.success({ email }, 'Email updated successfully');
	} catch (error) {
		console.error('Error updating email:', error);
		return ApiResponse.internalError(error, 'Failed to update email');
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
