// apps/web/src/routes/history/+page.server.ts
/**
 * History Page - Server Load
 *
 * Lists both braindumps and chat sessions for a unified history view.
 * Supports filtering by type, status, and search.
 */

import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** Braindump from onto_braindumps table */
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

/** Chat session from chat_sessions table */
interface ChatSession {
	id: string;
	title: string | null;
	auto_title: string | null;
	chat_topics: string[] | null;
	summary: string | null;
	context_type: string;
	entity_id: string | null;
	message_count: number | null;
	status: string;
	created_at: string | null;
	updated_at: string | null;
	last_message_at: string | null;
}

/** Unified history item for display */
export interface HistoryItem {
	id: string;
	type: 'braindump' | 'chat_session';
	title: string;
	preview: string;
	topics: string[];
	status: string;
	createdAt: string;
	messageCount?: number;
	contextType?: string;
	entityId?: string | null;
	originalData: OntoBraindump | ChatSession;
}

/** Type filter options */
type TypeFilter = 'all' | 'braindumps' | 'chats';

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
		const typeFilter = (url.searchParams.get('type') as TypeFilter) || 'all';
		const status = url.searchParams.get('status') || null;
		const search = url.searchParams.get('search') || '';
		const selectedId = url.searchParams.get('id') || null;
		const selectedType = url.searchParams.get('itemType') || null;

		// Fetch data based on type filter
		let braindumps: OntoBraindump[] = [];
		let chatSessions: ChatSession[] = [];
		let braindumpCount = 0;
		let chatSessionCount = 0;

		// Fetch braindumps if needed
		if (typeFilter === 'all' || typeFilter === 'braindumps') {
			let braindumpQuery = supabase
				.from('onto_braindumps')
				.select('*', { count: 'exact' })
				.eq('user_id', user.id)
				.order('created_at', { ascending: false });

			// Apply status filter for braindumps
			if (status && ['pending', 'processing', 'processed', 'failed'].includes(status)) {
				braindumpQuery = braindumpQuery.eq('status', status);
			}

			// Apply search filter
			if (search) {
				braindumpQuery = braindumpQuery.or(
					`content.ilike.%${search}%,title.ilike.%${search}%,summary.ilike.%${search}%`
				);
			}

			const { data: braindumpData, error: braindumpError, count } = await braindumpQuery;

			if (!braindumpError) {
				braindumps = (braindumpData || []) as OntoBraindump[];
				braindumpCount = count || 0;
			} else {
				console.error('Error fetching braindumps:', braindumpError);
			}
		}

		// Fetch chat sessions if needed
		if (typeFilter === 'all' || typeFilter === 'chats') {
			let chatQuery = supabase
				.from('chat_sessions')
				.select('*', { count: 'exact' })
				.eq('user_id', user.id)
				.neq('status', 'archived')
				.order('created_at', { ascending: false });

			// Apply status filter for chat sessions (only show completed/active)
			if (status === 'processed') {
				// "processed" means has summary
				chatQuery = chatQuery.not('summary', 'is', null);
			}

			// Apply search filter
			if (search) {
				chatQuery = chatQuery.or(
					`title.ilike.%${search}%,auto_title.ilike.%${search}%,summary.ilike.%${search}%`
				);
			}

			// Only include sessions with meaningful content (3+ messages or summary)
			// This filters out empty or very brief sessions
			chatQuery = chatQuery.or('message_count.gte.3,summary.not.is.null');

			const { data: chatData, error: chatError, count } = await chatQuery;

			if (!chatError) {
				chatSessions = (chatData || []) as ChatSession[];
				chatSessionCount = count || 0;
			} else {
				console.error('Error fetching chat sessions:', chatError);
			}
		}

		// Merge and sort items by creation date
		const allItems: HistoryItem[] = [
			...braindumps.map(
				(b): HistoryItem => ({
					id: b.id,
					type: 'braindump',
					title: b.title || 'Untitled Braindump',
					preview:
						b.summary ||
						b.content.slice(0, 200) + (b.content.length > 200 ? '...' : ''),
					topics: b.topics || [],
					status: b.status,
					createdAt: b.created_at,
					originalData: b
				})
			),
			...chatSessions.map(
				(c): HistoryItem => ({
					id: c.id,
					type: 'chat_session',
					title: c.title || c.auto_title || 'Untitled Chat',
					preview: c.summary || 'No summary available',
					topics: c.chat_topics || [],
					status: c.status,
					createdAt: c.created_at || new Date().toISOString(),
					messageCount: c.message_count || 0,
					contextType: c.context_type,
					entityId: c.entity_id,
					originalData: c
				})
			)
		];

		// Sort by creation date descending
		allItems.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

		// Apply pagination to merged results
		const paginatedItems = allItems.slice(offset, offset + limit);
		const totalItems = allItems.length;

		// Get selected item if specified
		let selectedItem: HistoryItem | null = null;
		if (selectedId && selectedType) {
			if (selectedType === 'braindump') {
				const found = braindumps.find((b) => b.id === selectedId);
				if (found) {
					selectedItem = {
						id: found.id,
						type: 'braindump',
						title: found.title || 'Untitled Braindump',
						preview: found.summary || found.content.slice(0, 200),
						topics: found.topics || [],
						status: found.status,
						createdAt: found.created_at,
						originalData: found
					};
				}
			} else if (selectedType === 'chat_session') {
				const found = chatSessions.find((c) => c.id === selectedId);
				if (found) {
					selectedItem = {
						id: found.id,
						type: 'chat_session',
						title: found.title || found.auto_title || 'Untitled Chat',
						preview: found.summary || 'No summary available',
						topics: found.chat_topics || [],
						status: found.status,
						createdAt: found.created_at || new Date().toISOString(),
						messageCount: found.message_count || 0,
						contextType: found.context_type,
						entityId: found.entity_id,
						originalData: found
					};
				}
			}
		}

		// Calculate stats
		const { data: braindumpStats } = await supabase
			.from('onto_braindumps')
			.select('status')
			.eq('user_id', user.id);

		const { data: chatStats } = await supabase
			.from('chat_sessions')
			.select('id, summary')
			.eq('user_id', user.id)
			.neq('status', 'archived')
			.or('message_count.gte.3,summary.not.is.null');

		const stats = {
			totalBraindumps: braindumpStats?.length || 0,
			processedBraindumps:
				braindumpStats?.filter((b) => b.status === 'processed').length || 0,
			pendingBraindumps: braindumpStats?.filter((b) => b.status === 'pending').length || 0,
			totalChatSessions: chatStats?.length || 0,
			chatSessionsWithSummary: chatStats?.filter((c) => c.summary).length || 0
		};

		return {
			items: paginatedItems,
			totalItems,
			braindumpCount,
			chatSessionCount,
			stats,
			filters: {
				limit,
				offset,
				typeFilter,
				status,
				search,
				selectedId,
				selectedType
			},
			selectedItem,
			hasMore: totalItems > offset + limit,
			user
		};
	} catch (err) {
		console.error('Error loading history page:', err);
		return {
			items: [] as HistoryItem[],
			totalItems: 0,
			braindumpCount: 0,
			chatSessionCount: 0,
			stats: {
				totalBraindumps: 0,
				processedBraindumps: 0,
				pendingBraindumps: 0,
				totalChatSessions: 0,
				chatSessionsWithSummary: 0
			},
			filters: {
				limit: 50,
				offset: 0,
				typeFilter: 'all' as TypeFilter,
				status: null,
				search: '',
				selectedId: null,
				selectedType: null
			},
			selectedItem: null,
			hasMore: false,
			user: null
		};
	}
};
