// apps/web/src/routes/api/admin/emails/+server.ts
// Read-only sent log. Composing and sending moved to email campaigns
// (/api/admin/email-campaigns); one-to-one admin email stays at ./send.

import type { RequestHandler } from './$types';

import { ApiResponse } from '$lib/utils/api-response';

/** Emails the system sends on its own (and campaign sends, which live on the Campaigns tab). */
const AUTOMATIC_CATEGORIES = [
	'daily_brief',
	'welcome_sequence',
	'notification',
	'campaign',
	'campaign_test'
];

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
		const hideAutomatic = url.searchParams.get('hide_automatic') === 'true';
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

		if (hideAutomatic) {
			// category IS NULL rows (one-to-one admin email) must survive the NOT IN.
			query = query
				.or(`category.is.null,category.not.in.(${AUTOMATIC_CATEGORIES.join(',')})`)
				// Drafts already moved into a campaign.
				.is('template_data->>imported_to_campaign_id', null);
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
