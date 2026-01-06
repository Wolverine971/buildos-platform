// apps/web/src/routes/history/+page.server.ts
/**
 * History Page - Server Load
 *
 * Lists both braindumps and chat sessions for a unified history view.
 * Supports filtering by type, status, and search.
 *
 * PERFORMANCE OPTIMIZATIONS (Dec 2024):
 * - itemCount returned IMMEDIATELY for instant skeleton rendering
 * - Full history data streamed in background
 * - Stats queries run in parallel
 * - Zero layout shift - exact number of skeleton cards rendered from start
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
	needsClassification?: boolean;
	originalData: OntoBraindump | ChatSession;
}

/** Type filter options */
type TypeFilter = 'all' | 'braindumps' | 'chats';

const DEFAULT_CHAT_TITLES = [
	'Agent Session',
	'Project Assistant',
	'Task Assistant',
	'Calendar Assistant',
	'General Assistant',
	'New Project Creation',
	'Project Audit',
	'Project Forecast',
	'Task Update',
	'Daily Brief Settings',
	'Chat session',
	'Untitled Chat'
].map((title) => title.toLowerCase());

const isPlaceholderChatTitle = (title?: string | null) => {
	const normalized = title?.trim().toLowerCase();
	if (!normalized) return true;
	return DEFAULT_CHAT_TITLES.includes(normalized);
};

const resolveChatTitle = (session: ChatSession): string => {
	const rawTitle = session.title?.trim() || '';
	const autoTitle = session.auto_title?.trim() || '';

	if (rawTitle && !isPlaceholderChatTitle(rawTitle)) {
		return rawTitle;
	}

	if (autoTitle) {
		return autoTitle;
	}

	return rawTitle || 'Untitled Chat';
};

const hasMeaningfulChatTitle = (session: ChatSession): boolean => {
	const rawTitle = session.title?.trim() || '';
	const autoTitle = session.auto_title?.trim() || '';

	if (autoTitle) return true;
	if (!rawTitle) return false;
	return !isPlaceholderChatTitle(rawTitle);
};

const needsChatClassification = (session: ChatSession): boolean => {
	const hasTopics = (session.chat_topics?.length ?? 0) > 0;
	const hasSummary = !!session.summary;
	const hasTitle = hasMeaningfulChatTitle(session);

	return !(hasTitle && hasTopics && hasSummary);
};

export const load: PageServerLoad = async ({ locals, url }) => {
	const { safeGetSession, supabase } = locals;
	const { user } = await safeGetSession();

	if (!user) {
		redirect(302, '/auth/login');
	}

	// Parse query parameters
	const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
	const offset = parseInt(url.searchParams.get('offset') || '0');
	const typeFilter = (url.searchParams.get('type') as TypeFilter) || 'all';
	const status = url.searchParams.get('status') || null;
	const search = url.searchParams.get('search') || '';
	const selectedId = url.searchParams.get('id') || null;
	const selectedType = url.searchParams.get('itemType') || null;

	const filters = {
		limit,
		offset,
		typeFilter,
		status,
		search,
		selectedId,
		selectedType
	};

	// FAST: Get item counts immediately (~20-50ms each) for skeleton rendering
	// These run in parallel for speed
	const [braindumpCountResult, chatCountResult] = await Promise.all([
		typeFilter === 'all' || typeFilter === 'braindumps'
			? supabase
					.from('onto_braindumps')
					.select('*', { count: 'exact', head: true })
					.eq('user_id', user.id)
			: Promise.resolve({ count: 0, error: null }),
		typeFilter === 'all' || typeFilter === 'chats'
			? supabase
					.from('chat_sessions')
					.select('*', { count: 'exact', head: true })
					.eq('user_id', user.id)
					.neq('status', 'archived')
					.or('message_count.gte.3,summary.not.is.null')
			: Promise.resolve({ count: 0, error: null })
	]);

	const braindumpCount = braindumpCountResult.count ?? 0;
	const chatSessionCount = chatCountResult.count ?? 0;
	const itemCount = Math.min(braindumpCount + chatSessionCount, limit);

	// STREAMED: Full history data loaded in background
	// Skeletons will be hydrated when this resolves
	const historyData = loadHistoryData(
		supabase,
		user.id,
		filters,
		braindumpCount,
		chatSessionCount
	);

	return {
		// Immediate data for skeleton rendering
		itemCount,
		braindumpCount,
		chatSessionCount,
		filters,
		user,
		// Streamed data
		historyData
	};
};

/** Helper to load full history data - streamed in background */
async function loadHistoryData(
	supabase: ReturnType<typeof import('@supabase/supabase-js').createClient>,
	userId: string,
	filters: {
		limit: number;
		offset: number;
		typeFilter: TypeFilter;
		status: string | null;
		search: string;
		selectedId: string | null;
		selectedType: string | null;
	},
	braindumpCount: number,
	chatSessionCount: number
): Promise<{
	items: HistoryItem[];
	totalItems: number;
	stats: {
		totalBraindumps: number;
		processedBraindumps: number;
		pendingBraindumps: number;
		totalChatSessions: number;
		chatSessionsWithSummary: number;
	};
	selectedItem: HistoryItem | null;
	hasMore: boolean;
}> {
	try {
		const { limit, offset, typeFilter, status, search, selectedId, selectedType } = filters;

		// Fetch data based on type filter - run in parallel
		const [braindumpResult, chatResult, braindumpStatsResult, chatStatsResult] =
			await Promise.all([
				// Braindumps query
				typeFilter === 'all' || typeFilter === 'braindumps'
					? (async () => {
							let query = supabase
								.from('onto_braindumps')
								.select('*')
								.eq('user_id', userId)
								.order('created_at', { ascending: false });

							if (
								status &&
								['pending', 'processing', 'processed', 'failed'].includes(status)
							) {
								query = query.eq('status', status);
							}

							if (search) {
								query = query.or(
									`content.ilike.%${search}%,title.ilike.%${search}%,summary.ilike.%${search}%`
								);
							}

							const { data, error } = await query;
							if (error) {
								console.error('Error fetching braindumps:', error);
								return [];
							}
							return (data || []) as OntoBraindump[];
						})()
					: Promise.resolve([] as OntoBraindump[]),

				// Chat sessions query
				typeFilter === 'all' || typeFilter === 'chats'
					? (async () => {
							let query = supabase
								.from('chat_sessions')
								.select('*')
								.eq('user_id', userId)
								.neq('status', 'archived')
								.order('created_at', { ascending: false });

							if (status === 'processed') {
								query = query.not('summary', 'is', null);
							}

							if (search) {
								query = query.or(
									`title.ilike.%${search}%,auto_title.ilike.%${search}%,summary.ilike.%${search}%`
								);
							}

							query = query.or('message_count.gte.3,summary.not.is.null');

							const { data, error } = await query;
							if (error) {
								console.error('Error fetching chat sessions:', error);
								return [];
							}
							return (data || []) as ChatSession[];
						})()
					: Promise.resolve([] as ChatSession[]),

				// Braindump stats
				supabase.from('onto_braindumps').select('status').eq('user_id', userId),

				// Chat stats
				supabase
					.from('chat_sessions')
					.select('id, summary')
					.eq('user_id', userId)
					.neq('status', 'archived')
					.or('message_count.gte.3,summary.not.is.null')
			]);

		const braindumps = braindumpResult;
		const chatSessions = chatResult;
		const braindumpStats = braindumpStatsResult.data;
		const chatStats = chatStatsResult.data;

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
					title: resolveChatTitle(c),
					preview: c.summary || 'No summary available',
					topics: c.chat_topics || [],
					status: c.status,
					createdAt: c.created_at || new Date().toISOString(),
					messageCount: c.message_count || 0,
					contextType: c.context_type,
					entityId: c.entity_id,
					needsClassification: needsChatClassification(c),
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
						title: resolveChatTitle(found),
						preview: found.summary || 'No summary available',
						topics: found.chat_topics || [],
						status: found.status,
						createdAt: found.created_at || new Date().toISOString(),
						messageCount: found.message_count || 0,
						contextType: found.context_type,
						entityId: found.entity_id,
						needsClassification: needsChatClassification(found),
						originalData: found
					};
				}
			}
		}

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
			stats,
			selectedItem,
			hasMore: totalItems > offset + limit
		};
	} catch (err) {
		console.error('Error loading history data:', err);
		return {
			items: [],
			totalItems: 0,
			stats: {
				totalBraindumps: 0,
				processedBraindumps: 0,
				pendingBraindumps: 0,
				totalChatSessions: 0,
				chatSessionsWithSummary: 0
			},
			selectedItem: null,
			hasMore: false
		};
	}
}
