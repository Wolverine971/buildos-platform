// apps/web/src/routes/history/+page.server.ts
/**
 * History Page - Server Load
 *
 * Lists both braindumps and chat sessions for a unified history view.
 * Supports filtering by type, status, and search.
 *
 * PERFORMANCE:
 * - The initial load does not block on COUNT(*) queries.
 * - Full history data is streamed from a bounded RPC that returns only the
 *   requested page and aggregate stats.
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
type SelectedType = HistoryItem['type'];
type StatusFilter = 'pending' | 'processing' | 'processed' | 'failed';

interface HistoryStats {
	totalBraindumps: number;
	processedBraindumps: number;
	pendingBraindumps: number;
	totalChatSessions: number;
	chatSessionsWithSummary: number;
}

interface HistoryDataResult {
	items: HistoryItem[];
	totalItems: number;
	totalItemsExact: boolean;
	stats: HistoryStats;
	selectedItem: HistoryItem | null;
	hasMore: boolean;
}

interface HistoryRpcRow {
	type: SelectedType;
	data: unknown;
}

interface HistoryRpcPayload {
	rows?: unknown;
	totalItems?: unknown;
	totalItemsExact?: unknown;
	stats?: unknown;
	selectedRow?: unknown;
	hasMore?: unknown;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const SKELETON_ITEM_LIMIT = 12;
const MIN_SEARCH_LENGTH = 3;
const MAX_SEARCH_LENGTH = 120;

export const load: PageServerLoad = async ({ locals, url, depends }) => {
	depends('history:data');
	const { safeGetSession, supabase } = locals;
	const { user } = await safeGetSession();

	if (!user) {
		redirect(302, '/auth/login');
	}

	// Parse query parameters
	const limit = clampIntegerParam(url.searchParams.get('limit'), DEFAULT_LIMIT, 1, MAX_LIMIT);
	const offset = clampIntegerParam(url.searchParams.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER);
	const typeFilter = parseTypeFilter(url.searchParams.get('type'));
	const status = parseStatusFilter(url.searchParams.get('status'));
	const search = normalizeSearchFilter(url.searchParams.get('search')) ?? '';
	const selectedId = parseUuid(url.searchParams.get('id'));
	const selectedType = parseSelectedType(url.searchParams.get('itemType'));

	const filters = {
		limit,
		offset,
		typeFilter,
		status,
		search,
		selectedId,
		selectedType
	};

	// STREAMED: Full history data loaded in background
	// Skeletons will be hydrated when this resolves
	const historyData = loadHistoryData(supabase, user.id, filters);

	return {
		// Immediate skeleton shape. Exact totals arrive in streamed historyData.
		itemCount: Math.min(limit, SKELETON_ITEM_LIMIT),
		braindumpCount: 0,
		chatSessionCount: 0,
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
		status: StatusFilter | null;
		search: string;
		selectedId: string | null;
		selectedType: SelectedType | null;
	}
): Promise<HistoryDataResult> {
	try {
		const { limit, offset, typeFilter, status, search, selectedId, selectedType } = filters;

		const { data, error } = await supabase.rpc('get_history_page_v1', {
			p_user_id: userId,
			p_type_filter: typeFilter,
			p_status: status,
			p_search: search || null,
			p_limit: limit,
			p_offset: offset,
			p_selected_id: selectedId,
			p_selected_type: selectedType
		});

		if (error) {
			throw error;
		}

		const payload = normalizeHistoryRpcPayload(data);
		const rows = normalizeHistoryRpcRows(payload.rows);
		const selectedRow = normalizeHistoryRpcRow(payload.selectedRow);
		const chatSessions = [
			...rows
				.filter((row) => row.type === 'chat_session')
				.map((row) => normalizeChatSession(row.data))
				.filter((session): session is ChatSession => Boolean(session)),
			...(selectedRow?.type === 'chat_session'
				? [normalizeChatSession(selectedRow.data)].filter(
						(session): session is ChatSession => Boolean(session)
					)
				: [])
		];
		const classificationJobsBySessionId = await loadChatClassificationJobs(
			supabase,
			userId,
			chatSessions.filter(needsChatClassification).map((session) => session.id)
		);

		const items = rows
			.map((row) => toHistoryItem(row, classificationJobsBySessionId))
			.filter((item): item is HistoryItem => Boolean(item));
		const selectedItem = selectedRow
			? toHistoryItem(selectedRow, classificationJobsBySessionId)
			: null;
		const totalItems = asNumber(payload.totalItems, items.length);
		const stats = normalizeHistoryStats(payload.stats);
		const hasMore =
			typeof payload.hasMore === 'boolean' ? payload.hasMore : totalItems > offset + limit;
		const totalItemsExact =
			typeof payload.totalItemsExact === 'boolean' ? payload.totalItemsExact : !hasMore;

		return {
			items,
			totalItems,
			totalItemsExact,
			stats,
			selectedItem,
			hasMore
		};
	} catch (err) {
		console.error('Error loading history data:', err);
		return {
			items: [],
			totalItems: 0,
			totalItemsExact: true,
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

function toHistoryItem(
	row: HistoryRpcRow,
	classificationJobsBySessionId: Map<string, ChatClassificationJob>
): HistoryItem | null {
	if (row.type === 'braindump') {
		const braindump = normalizeBraindump(row.data);
		return braindump ? toBraindumpHistoryItem(braindump) : null;
	}

	const session = normalizeChatSession(row.data);
	return session
		? toChatHistoryItem(session, classificationJobsBySessionId.get(session.id))
		: null;
}

function toBraindumpHistoryItem(braindump: OntoBraindump): HistoryItem {
	const content = braindump.content ?? '';
	const summary = normalizeHistoryText(braindump.summary);
	const preview = summary ?? content.slice(0, 200) + (content.length > 200 ? '...' : '');

	return {
		id: braindump.id,
		type: 'braindump',
		title: normalizeHistoryText(braindump.title) ?? 'Untitled Braindump',
		preview,
		topics: normalizeHistoryTopics(braindump.topics),
		status: braindump.status,
		createdAt: braindump.created_at,
		originalData: braindump
	};
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

function clampIntegerParam(
	value: string | null,
	fallback: number,
	min: number,
	max: number
): number {
	const parsed = Number.parseInt(value ?? '', 10);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.min(Math.max(parsed, min), max);
}

function normalizeFilterText(value: string | null): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed ? trimmed : null;
}

function normalizeSearchFilter(value: string | null): string | null {
	const normalized = normalizeFilterText(value);
	return normalized && normalized.length >= MIN_SEARCH_LENGTH
		? normalized.slice(0, MAX_SEARCH_LENGTH)
		: null;
}

function parseTypeFilter(value: string | null): TypeFilter {
	if (value === 'braindumps' || value === 'chats') return value;
	return 'all';
}

function parseStatusFilter(value: string | null): StatusFilter | null {
	if (
		value === 'pending' ||
		value === 'processing' ||
		value === 'processed' ||
		value === 'failed'
	) {
		return value;
	}
	return null;
}

function parseSelectedType(value: string | null): SelectedType | null {
	if (value === 'braindump' || value === 'chat_session') return value;
	return null;
}

function parseUuid(value: string | null): string | null {
	const normalized = normalizeFilterText(value);
	if (!normalized) return null;
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalized)
		? normalized
		: null;
}

function normalizeHistoryRpcPayload(value: unknown): HistoryRpcPayload {
	return isRecord(value) ? value : {};
}

function normalizeHistoryRpcRows(value: unknown): HistoryRpcRow[] {
	if (!Array.isArray(value)) return [];

	return value.map(normalizeHistoryRpcRow).filter((row): row is HistoryRpcRow => Boolean(row));
}

function normalizeHistoryRpcRow(value: unknown): HistoryRpcRow | null {
	if (!isRecord(value)) return null;
	const type = value.type;
	if (type !== 'braindump' && type !== 'chat_session') return null;
	return { type, data: value.data };
}

function normalizeHistoryStats(value: unknown): HistoryStats {
	const record = isRecord(value) ? value : {};
	return {
		totalBraindumps: asNumber(record.totalBraindumps, 0),
		processedBraindumps: asNumber(record.processedBraindumps, 0),
		pendingBraindumps: asNumber(record.pendingBraindumps, 0),
		totalChatSessions: asNumber(record.totalChatSessions, 0),
		chatSessionsWithSummary: asNumber(record.chatSessionsWithSummary, 0)
	};
}

function normalizeBraindump(value: unknown): OntoBraindump | null {
	if (!isRecord(value)) return null;

	const id = asString(value.id);
	const createdAt = asString(value.created_at);
	if (!id || !createdAt) return null;

	return {
		id,
		content: asString(value.content) ?? '',
		title: asNullableString(value.title),
		topics: asStringArray(value.topics),
		summary: asNullableString(value.summary),
		status: asBraindumpStatus(value.status),
		chat_session_id: asNullableString(value.chat_session_id),
		metadata: asNullableRecord(value.metadata),
		processed_at: asNullableString(value.processed_at),
		error_message: asNullableString(value.error_message),
		created_at: createdAt,
		updated_at: asString(value.updated_at) ?? createdAt
	};
}

function normalizeChatSession(value: unknown): ChatSession | null {
	if (!isRecord(value)) return null;

	const id = asString(value.id);
	if (!id) return null;

	return {
		id,
		title: asNullableString(value.title),
		auto_title: asNullableString(value.auto_title),
		chat_topics: asStringArray(value.chat_topics),
		summary: asNullableString(value.summary),
		context_type: asString(value.context_type) ?? 'global',
		entity_id: asNullableString(value.entity_id),
		message_count: asNullableNumber(value.message_count),
		status: asString(value.status) ?? 'active',
		created_at: asNullableString(value.created_at),
		updated_at: asNullableString(value.updated_at),
		last_message_at: asNullableString(value.last_message_at)
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown): string | null {
	return typeof value === 'string' ? value : null;
}

function asNullableString(value: unknown): string | null {
	return typeof value === 'string' ? value : null;
}

function asStringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === 'string')
		: [];
}

function asNumber(value: unknown, fallback: number): number {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string') {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return fallback;
}

function asNullableNumber(value: unknown): number | null {
	if (value === null || value === undefined) return null;
	return asNumber(value, 0);
}

function asNullableRecord(value: unknown): Record<string, unknown> | null {
	return isRecord(value) ? value : null;
}

function asBraindumpStatus(value: unknown): OntoBraindump['status'] {
	if (
		value === 'pending' ||
		value === 'processing' ||
		value === 'processed' ||
		value === 'failed'
	) {
		return value;
	}
	return 'pending';
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
