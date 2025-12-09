// apps/web/src/routes/history/thoughts/+page.server.ts
/**
 * Thoughts History Page - Server Load
 *
 * Lists braindumps from onto_braindumps table (captured via agent chat braindump context).
 * When a braindump is selected, it can be loaded into the AgentChatModal for exploration.
 */

import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

interface OntoBraindump {
	id: string;
	content: string;
	title: string | null;
	topics: string[] | null;
	summary: string | null;
	status: 'pending' | 'processing' | 'processed' | 'failed';
	chat_session_id: string | null;
	metadata: Record<string, unknown> | null;
	processed_at: string | null;
	error_message: string | null;
	created_at: string;
	updated_at: string;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const { safeGetSession, supabase } = locals;
	const { user } = await safeGetSession();

	if (!user) {
		redirect(302, '/auth/login');
	}

	try {
		// Parse query parameters
		const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
		const offset = parseInt(url.searchParams.get('offset') || '0');
		const status = url.searchParams.get('status') as OntoBraindump['status'] | null;
		const search = url.searchParams.get('search') || '';
		const selectedId = url.searchParams.get('id') || null;

		// Build query for onto_braindumps
		let query = supabase
			.from('onto_braindumps')
			.select('*', { count: 'exact' })
			.eq('user_id', user.id)
			.order('created_at', { ascending: false });

		// Apply status filter
		if (status && ['pending', 'processing', 'processed', 'failed'].includes(status)) {
			query = query.eq('status', status);
		}

		// Apply search filter (search in content, title, summary, topics)
		if (search) {
			query = query.or(
				`content.ilike.%${search}%,title.ilike.%${search}%,summary.ilike.%${search}%`
			);
		}

		// Apply pagination
		query = query.range(offset, offset + limit - 1);

		const { data: braindumps, error, count } = await query;

		if (error) {
			console.error('Error fetching onto_braindumps:', error);
			throw error;
		}

		// If a specific braindump is selected, fetch it separately if not in results
		let selectedBraindump: OntoBraindump | null = null;
		if (selectedId) {
			const existingInResults = braindumps?.find((b) => b.id === selectedId);
			if (existingInResults) {
				selectedBraindump = existingInResults as OntoBraindump;
			} else {
				const { data: specific, error: specificError } = await supabase
					.from('onto_braindumps')
					.select('*')
					.eq('id', selectedId)
					.eq('user_id', user.id)
					.single();

				if (!specificError && specific) {
					selectedBraindump = specific as OntoBraindump;
				}
			}
		}

		// Calculate stats
		const { data: statsData } = await supabase
			.from('onto_braindumps')
			.select('status')
			.eq('user_id', user.id);

		const stats = {
			total: statsData?.length || 0,
			processed: statsData?.filter((b) => b.status === 'processed').length || 0,
			pending: statsData?.filter((b) => b.status === 'pending').length || 0,
			processing: statsData?.filter((b) => b.status === 'processing').length || 0,
			failed: statsData?.filter((b) => b.status === 'failed').length || 0
		};

		return {
			braindumps: (braindumps || []) as OntoBraindump[],
			total: count || 0,
			stats,
			filters: {
				limit,
				offset,
				status,
				search,
				selectedId
			},
			selectedBraindump,
			hasMore: (count || 0) > offset + limit,
			user
		};
	} catch (err) {
		console.error('Error loading thoughts history page:', err);
		return {
			braindumps: [] as OntoBraindump[],
			total: 0,
			stats: {
				total: 0,
				processed: 0,
				pending: 0,
				processing: 0,
				failed: 0
			},
			filters: {
				limit: 50,
				offset: 0,
				status: null,
				search: '',
				selectedId: null
			},
			selectedBraindump: null,
			hasMore: false,
			user: null
		};
	}
};
