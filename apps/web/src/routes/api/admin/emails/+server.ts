// apps/web/src/routes/api/admin/emails/+server.ts
import type { RequestHandler } from './$types';

import { env as publicEnv } from '$env/dynamic/public';
import { z } from 'zod';
import { ApiResponse } from '$lib/utils/api-response';
import { parseJsonRequest } from '$lib/utils/request-validation';

const GMAIL_USER = publicEnv.PUBLIC_GMAIL_USER || 'dj@build-os.com';

const emailRecipientSchema = z
	.object({
		email: z.string().email(),
		name: z.string().nullable().optional(),
		type: z.string().min(1).optional(),
		id: z.string().nullable().optional()
	})
	.strict();

const createAdminEmailSchema = z
	.object({
		subject: z.string().min(1),
		content: z.string().min(1),
		from_email: z.string().email().optional(),
		from_name: z.string().min(1).optional(),
		category: z.string().min(1).optional(),
		template_data: z.record(z.unknown()).optional(),
		recipients: z.array(emailRecipientSchema).optional(),
		scheduled_at: z.string().min(1).nullable().optional()
	})
	.strict();

const EMAIL_SORT_COLUMNS = new Set(['created_at', 'subject', 'status', 'sent_at', 'updated_at']);

function normalizePagination(value: string | null, fallback: number, maximum: number): number {
	const parsed = Number.parseInt(value || '', 10);
	if (!Number.isFinite(parsed) || parsed < 1) return fallback;
	return Math.min(parsed, maximum);
}

function escapePostgrestSearch(value: string): string {
	return value.replace(/[\\%_,().]/g, ' ').trim();
}

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	try {
		const page = normalizePagination(url.searchParams.get('page'), 1, 10_000);
		const limit = normalizePagination(url.searchParams.get('limit'), 20, 100);
		const status = url.searchParams.get('status');
		const category = url.searchParams.get('category');
		const search = url.searchParams.get('search');
		const requestedSortBy = url.searchParams.get('sort_by') || 'created_at';
		const sortBy = EMAIL_SORT_COLUMNS.has(requestedSortBy) ? requestedSortBy : 'created_at';
		const sortOrder = url.searchParams.get('sort_order') === 'asc' ? 'asc' : 'desc';

		const offset = (page - 1) * limit;

		// Build query
		let query = supabase.from('emails').select(
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
					open_count
				),
				email_attachments (
					id,
					filename,
					original_filename,
					file_size,
					content_type,
					is_image,
					storage_path
				)
			`,
			{ count: 'exact' }
		);

		// Apply filters
		if (status && status !== 'all') {
			query = query.eq('status', status);
		}

		if (category && category !== 'all') {
			query = query.eq('category', category);
		}

		const safeSearch = search ? escapePostgrestSearch(search) : '';
		if (safeSearch) {
			query = query.or(`subject.ilike.%${safeSearch}%,content.ilike.%${safeSearch}%`);
		}

		// Apply sorting and pagination
		query = query
			.order(sortBy, { ascending: sortOrder === 'asc' })
			.range(offset, offset + limit - 1);

		const { data: emails, error, count } = await query;

		if (error) throw error;

		const totalPages = Math.ceil((count || 0) / limit);

		return ApiResponse.success({
			emails: emails || [],
			pagination: {
				current_page: page,
				total_pages: totalPages,
				total_items: count || 0,
				items_per_page: limit
			}
		});
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to fetch emails');
	}
};

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	try {
		const parsed = await parseJsonRequest(request, createAdminEmailSchema);
		if (!parsed.ok) return parsed.response;
		const {
			subject,
			content,
			from_email,
			from_name,
			category,
			template_data,
			recipients,
			scheduled_at
		} = parsed.data;

		// Generate a unique tracking ID for this email
		const tracking_id = crypto.randomUUID();

		// Create email
		const { data: email, error: emailError } = await supabase
			.from('emails')
			.insert({
				subject,
				content,
				from_email: from_email || GMAIL_USER,
				from_name: from_name || 'BuildOS Team',
				category: category || 'general',
				template_data: (template_data || {}) as any,
				status: scheduled_at ? 'scheduled' : 'draft',
				scheduled_at: scheduled_at || null,
				created_by: user.id,
				tracking_enabled: true,
				tracking_id: tracking_id
			})
			.select()
			.single();

		if (emailError) throw emailError;

		// Add recipients if provided
		if (recipients && Array.isArray(recipients) && recipients.length > 0) {
			console.log(
				'Processing recipients:',
				recipients.map((r) => ({ email: r.email, type: r.type }))
			);

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
				await supabase.from('emails').delete().eq('id', email.id);
				throw new Error('Failed to save recipients');
			}

			console.log(`Successfully saved ${recipientData.length} recipients`);
		}

		const { data: savedEmail, error: savedEmailError } = await supabase
			.from('emails')
			.select(
				`*, email_recipients (id, recipient_email, recipient_name, recipient_type, recipient_id, status, sent_at, delivered_at, opened_at, open_count)`
			)
			.eq('id', email.id)
			.single();

		if (savedEmailError) throw savedEmailError;

		return ApiResponse.created({ email: savedEmail }, 'Email created successfully');
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to create email');
	}
};
