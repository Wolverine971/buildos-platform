// apps/web/src/routes/api/admin/emails/[id]/+server.ts

import type { RequestHandler } from './$types';
import { z } from 'zod';
import { ApiResponse } from '$lib/utils/api-response';
import { parseJsonRequest } from '$lib/utils/request-validation';

const emailRecipientSchema = z
	.object({
		email: z.string().email(),
		name: z.string().nullable().optional(),
		type: z.string().min(1).optional(),
		id: z.string().nullable().optional()
	})
	.strict();

const updateAdminEmailSchema = z
	.object({
		subject: z.string().min(1).optional(),
		content: z.string().min(1).optional(),
		from_email: z.string().email().optional(),
		from_name: z.string().min(1).optional(),
		category: z.string().min(1).optional(),
		template_data: z.record(z.unknown()).nullable().optional(),
		recipients: z.array(emailRecipientSchema).optional(),
		scheduled_at: z.string().min(1).nullable().optional()
	})
	.strict()
	.refine((updates) => Object.keys(updates).length > 0, 'At least one update is required');

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
		const parsed = await parseJsonRequest(request, updateAdminEmailSchema);
		if (!parsed.ok) return parsed.response;
		const updates = parsed.data;
		const { recipients } = updates;

		const { data: existingEmail, error: existingEmailError } = await supabase
			.from('emails')
			.select('*')
			.eq('id', params.id)
			.single();

		if (existingEmailError || !existingEmail) {
			return ApiResponse.databaseError(existingEmailError);
		}

		if (existingEmail.status === 'sent' || existingEmail.status === 'delivered') {
			return ApiResponse.badRequest('Sent emails cannot be edited');
		}

		const allowedUpdates: Record<string, unknown> = {};
		for (const field of [
			'subject',
			'content',
			'from_email',
			'from_name',
			'category'
		] as const) {
			if (Object.hasOwn(updates, field)) allowedUpdates[field] = updates[field];
		}
		if (Object.hasOwn(updates, 'template_data')) {
			allowedUpdates.template_data = updates.template_data;
		}
		if (Object.hasOwn(updates, 'scheduled_at')) {
			allowedUpdates.scheduled_at = updates.scheduled_at;
			allowedUpdates.status = updates.scheduled_at ? 'scheduled' : 'draft';
		}
		if (!existingEmail.tracking_id) {
			allowedUpdates.tracking_id = crypto.randomUUID();
			allowedUpdates.tracking_enabled = true;
		}

		if (Object.keys(allowedUpdates).length > 0) {
			const { error: updateError } = await supabase
				.from('emails')
				.update(allowedUpdates)
				.eq('id', params.id);

			if (updateError) {
				return ApiResponse.databaseError(updateError);
			}
		}

		// Handle recipient updates if provided
		if (recipients && Array.isArray(recipients)) {
			const { data: previousRecipients, error: previousRecipientsError } = await supabase
				.from('email_recipients')
				.select('recipient_email, recipient_name, recipient_type, recipient_id')
				.eq('email_id', params.id);

			if (previousRecipientsError) {
				return ApiResponse.databaseError(previousRecipientsError);
			}

			// First, remove all existing recipients for this email
			const { error: deleteError } = await supabase
				.from('email_recipients')
				.delete()
				.eq('email_id', params.id);

			if (deleteError) {
				console.error('Error removing existing recipients:', deleteError);
				throw new Error('Failed to update recipients');
			}

			// Then add the new recipients if any
			if (recipients.length > 0) {
				const recipientData = recipients.map((recipient) => {
					return {
						email_id: params.id,
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
					if (previousRecipients && previousRecipients.length > 0) {
						await supabase.from('email_recipients').insert(
							previousRecipients.map((recipient) => ({
								email_id: params.id,
								...recipient
							}))
						);
					}
					throw new Error('Failed to save recipients');
				}
			}
		}

		const { data: savedEmail, error: savedEmailError } = await supabase
			.from('emails')
			.select(
				`*, email_recipients (id, recipient_email, recipient_name, recipient_type, recipient_id, status, sent_at, delivered_at, opened_at, open_count)`
			)
			.eq('id', params.id)
			.single();

		if (savedEmailError) {
			return ApiResponse.databaseError(savedEmailError);
		}

		return ApiResponse.success({ email: savedEmail }, 'Email updated successfully');
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
