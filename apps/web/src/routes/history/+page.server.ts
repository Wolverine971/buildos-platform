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
import {
	needsChatClassification,
	normalizeHistoryText,
	normalizeHistoryTopics,
	resolveChatDisplayState,
	resolveChatPreview,
	resolveChatTitle,
	type HistoryDisplayStatus
} from './history-display';

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

/** Classification job for a chat session summary/title/topics pass */
interface ChatClassificationJob {
	id: string;
	queue_job_id: string;
	metadata: Record<string, unknown> | null;
	status: string | null;
	error_message: string | null;
	created_at: string | null;
	updated_at: string | null;
	started_at: string | null;
	completed_at: string | null;
}

/** Unified history item for display */
export interface HistoryItem {
	id: string;
	type: 'braindump' | 'chat_session';
	title: string;
	preview: string;
	topics: string[];
	status: string;
	displayStatus?: HistoryDisplayStatus;
	statusLabel?: string;
	createdAt: string;
	messageCount?: number;
	contextType?: string;
	entityId?: string | null;
	needsClassification?: boolean;
	canQueueSummary?: boolean;
	originalData: OntoBraindump | ChatSession;
}

/** Type filter options */
type TypeFilter = 'all' | 'braindumps' | 'chats';

export const load: PageServerLoad = async ({ locals, url, depends }) => {
	depends('history:data');
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
	const historyData = loadHistoryData(supabase, user.id, filters);

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
	supabase: any,
	userId: string,
	filters: {
		limit: number;
		offset: number;
		typeFilter: TypeFilter;
		status: string | null;
		search: string;
		selectedId: string | null;
		selectedType: string | null;
	}
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
		const classificationJobsBySessionId = await loadChatClassificationJobs(
			supabase,
			userId,
			chatSessions.filter(needsChatClassification).map((session) => session.id)
		);
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
				(c): HistoryItem => toChatHistoryItem(c, classificationJobsBySessionId.get(c.id))
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
					selectedItem = toChatHistoryItem(
						found,
						classificationJobsBySessionId.get(found.id)
					);
				}
			}
		}

		const stats = {
			totalBraindumps: braindumpStats?.length || 0,
			processedBraindumps:
				braindumpStats?.filter((b: any) => b.status === 'processed').length || 0,
			pendingBraindumps:
				braindumpStats?.filter((b: any) => b.status === 'pending').length || 0,
			totalChatSessions: chatStats?.length || 0,
			chatSessionsWithSummary:
				chatStats?.filter((c: any) => normalizeHistoryText(c.summary)).length || 0
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

function toChatHistoryItem(
	session: ChatSession,
	classificationJob?: ChatClassificationJob | null
): HistoryItem {
	const displayState = resolveChatDisplayState(session, classificationJob);

	return {
		id: session.id,
		type: 'chat_session',
		title: resolveChatTitle(session, displayState),
		preview: resolveChatPreview(session, displayState),
		topics: normalizeHistoryTopics(session.chat_topics),
		status: session.status,
		displayStatus: displayState.displayStatus,
		statusLabel: displayState.statusLabel,
		createdAt: session.created_at || new Date().toISOString(),
		messageCount: session.message_count || 0,
		contextType: session.context_type,
		entityId: session.entity_id,
		needsClassification: needsChatClassification(session),
		canQueueSummary: displayState.canQueueSummary,
		originalData: session
	};
}

async function loadChatClassificationJobs(
	supabase: any,
	userId: string,
	sessionIds: string[]
): Promise<Map<string, ChatClassificationJob>> {
	const uniqueSessionIds = Array.from(new Set(sessionIds)).filter(Boolean);
	if (uniqueSessionIds.length === 0) return new Map();

	const { data, error } = await supabase
		.from('queue_jobs')
		.select(
			'id, queue_job_id, metadata, status, error_message, created_at, updated_at, started_at, completed_at'
		)
		.eq('user_id', userId)
		.eq('job_type', 'classify_chat_session')
		.in('metadata->>sessionId', uniqueSessionIds)
		.order('created_at', { ascending: false })
		.limit(Math.min(uniqueSessionIds.length * 3, 150));

	if (error) {
		console.warn('Error fetching chat classification jobs:', error);
		return new Map();
	}

	const jobsBySessionId = new Map<string, ChatClassificationJob>();
	for (const job of (data || []) as ChatClassificationJob[]) {
		const sessionId = getClassificationJobSessionId(job);
		if (!sessionId || jobsBySessionId.has(sessionId)) continue;
		jobsBySessionId.set(sessionId, job);
	}

	return jobsBySessionId;
}

function getClassificationJobSessionId(job: ChatClassificationJob): string | null {
	const metadata = job.metadata;
	if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;

	const sessionId = metadata.sessionId;
	return typeof sessionId === 'string' && sessionId ? sessionId : null;
}
