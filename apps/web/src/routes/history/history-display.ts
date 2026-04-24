type ChatHistorySession = {
	title?: string | null;
	auto_title?: string | null;
	chat_topics?: string[] | null;
	summary?: string | null;
	status?: string | null;
	created_at?: string | null;
	updated_at?: string | null;
	last_message_at?: string | null;
};

type ChatClassificationJob = {
	status?: string | null;
	error_message?: string | null;
	created_at?: string | null;
	updated_at?: string | null;
	started_at?: string | null;
	completed_at?: string | null;
};

export type HistoryDisplayStatus =
	| 'done'
	| 'recent'
	| 'queued'
	| 'processing'
	| 'failed'
	| 'needs_summary';

export type ChatHistoryDisplayState = {
	displayStatus: HistoryDisplayStatus;
	statusLabel: string;
	previewFallback: string;
	canQueueSummary: boolean;
};

const RECENT_UNPROCESSED_CHAT_MS = 2 * 60 * 60 * 1000;

const INVALID_DISPLAY_TEXT = new Set(['undefined', 'null', 'nan', '[object object]']);

const DEFAULT_CHAT_TITLES = new Set(
	[
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
		'Untitled Chat',
		'New Chat'
	].map((title) => title.toLowerCase())
);

export function normalizeHistoryText(value: string | null | undefined): string | null {
	if (typeof value !== 'string') return null;

	const normalized = value.replace(/\s+/g, ' ').trim();
	if (!normalized) return null;
	if (INVALID_DISPLAY_TEXT.has(normalized.toLowerCase())) return null;

	return normalized;
}

export function normalizeHistoryTopics(topics: string[] | null | undefined): string[] {
	if (!Array.isArray(topics)) return [];

	return topics
		.map((topic) => normalizeHistoryText(topic))
		.filter((topic): topic is string => Boolean(topic));
}

export function isPlaceholderChatTitle(title: string | null | undefined): boolean {
	const normalized = normalizeHistoryText(title);
	if (!normalized) return true;
	return DEFAULT_CHAT_TITLES.has(normalized.toLowerCase());
}

export function hasMeaningfulChatTitle(session: ChatHistorySession): boolean {
	const autoTitle = normalizeHistoryText(session.auto_title);
	if (autoTitle) return true;

	const rawTitle = normalizeHistoryText(session.title);
	return Boolean(rawTitle && !isPlaceholderChatTitle(rawTitle));
}

export function needsChatClassification(session: ChatHistorySession): boolean {
	const hasTopics = normalizeHistoryTopics(session.chat_topics).length > 0;
	const hasSummary = Boolean(normalizeHistoryText(session.summary));
	const hasTitle = hasMeaningfulChatTitle(session);

	return !(hasTitle && hasTopics && hasSummary);
}

export function resolveChatDisplayState(
	session: ChatHistorySession,
	classificationJob?: ChatClassificationJob | null,
	nowMs: number = Date.now()
): ChatHistoryDisplayState {
	if (!needsChatClassification(session)) {
		return {
			displayStatus: 'done',
			statusLabel: 'Done',
			previewFallback: 'Summary available.',
			canQueueSummary: false
		};
	}

	const jobStatus = normalizeHistoryText(classificationJob?.status)?.toLowerCase();

	if (jobStatus === 'pending') {
		return {
			displayStatus: 'queued',
			statusLabel: 'Queued',
			previewFallback: 'Summary generation is queued.',
			canQueueSummary: false
		};
	}

	if (jobStatus === 'processing' || jobStatus === 'retrying') {
		return {
			displayStatus: 'processing',
			statusLabel: 'Summarizing',
			previewFallback: 'BuildOS is generating a summary and tags.',
			canQueueSummary: false
		};
	}

	if (jobStatus === 'failed' || jobStatus === 'cancelled') {
		return {
			displayStatus: 'failed',
			statusLabel: 'Summary failed',
			previewFallback: 'BuildOS could not summarize this chat. You can retry it.',
			canQueueSummary: true
		};
	}

	if (isRecentUnprocessedChat(session, nowMs)) {
		return {
			displayStatus: 'recent',
			statusLabel: 'Recent',
			previewFallback:
				'This recent chat may still be open. A summary will appear after it closes or finishes processing.',
			canQueueSummary: false
		};
	}

	return {
		displayStatus: 'needs_summary',
		statusLabel: 'Needs summary',
		previewFallback: 'No summary has been generated yet.',
		canQueueSummary: true
	};
}

export function resolveChatTitle(
	session: ChatHistorySession,
	displayState?: ChatHistoryDisplayState
): string {
	const rawTitle = normalizeHistoryText(session.title);
	const autoTitle = normalizeHistoryText(session.auto_title);

	if (rawTitle && !isPlaceholderChatTitle(rawTitle)) {
		return rawTitle;
	}

	if (autoTitle) {
		return autoTitle;
	}

	if (displayState?.displayStatus === 'recent') {
		return 'Recent chat';
	}

	return rawTitle ?? 'Untitled Chat';
}

export function resolveChatPreview(
	session: ChatHistorySession,
	displayState: ChatHistoryDisplayState
): string {
	return normalizeHistoryText(session.summary) ?? displayState.previewFallback;
}

function isRecentUnprocessedChat(session: ChatHistorySession, nowMs: number): boolean {
	const status = normalizeHistoryText(session.status)?.toLowerCase();
	if (status && status !== 'active') return false;

	const lastActivityMs = latestTimestampMs(
		session.last_message_at,
		session.updated_at,
		session.created_at
	);

	if (!lastActivityMs) return false;
	return nowMs - lastActivityMs >= 0 && nowMs - lastActivityMs <= RECENT_UNPROCESSED_CHAT_MS;
}

function latestTimestampMs(...timestamps: Array<string | null | undefined>): number {
	let latest = 0;

	for (const timestamp of timestamps) {
		if (!timestamp) continue;
		const parsed = Date.parse(timestamp);
		if (!Number.isNaN(parsed) && parsed > latest) {
			latest = parsed;
		}
	}

	return latest;
}
