// apps/web/src/lib/server/project-recent-chats.ts
/**
 * Display rules for a project's recent chats: which chats count, how each is
 * titled when nobody named it, and the order they show in. Used by
 * GET /api/onto/projects/[id]/recent-chats.
 */

import type { Database } from '@buildos/shared-types';

export type ChatSessionRow = Pick<
	Database['public']['Tables']['chat_sessions']['Row'],
	| 'id'
	| 'title'
	| 'auto_title'
	| 'summary'
	| 'chat_topics'
	| 'context_type'
	| 'entity_id'
	| 'message_count'
	| 'status'
	| 'created_at'
	| 'updated_at'
	| 'last_message_at'
> & { focus: unknown };

type ProjectFocusMetadata = {
	focusType?: string | null;
	focusEntityName?: string | null;
	projectId?: string | null;
	projectName?: string | null;
};

// Only the focus is read out of agent_metadata: the rest of it (context caches)
// runs to tens of kilobytes a chat, about a megabyte for a page of them.
export const SESSION_SELECT = `
	id,
	title,
	auto_title,
	summary,
	chat_topics,
	context_type,
	entity_id,
	message_count,
	status,
	focus:agent_metadata->focus,
	created_at,
	updated_at,
	last_message_at
`;

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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

export function normalizeText(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const normalized = value.replace(/\s+/g, ' ').trim();
	return normalized.length > 0 ? normalized : null;
}

function isPlaceholderTitle(value: string | null): boolean {
	return !value || DEFAULT_CHAT_TITLES.has(value.toLowerCase());
}

function readProjectFocus(focus: unknown): ProjectFocusMetadata | null {
	if (!isRecord(focus)) return null;
	return {
		focusType: normalizeText(focus.focusType),
		focusEntityName: normalizeText(focus.focusEntityName),
		projectId: normalizeText(focus.projectId),
		projectName: normalizeText(focus.projectName)
	};
}

function lastActivityAt(session: ChatSessionRow): string | null {
	return session.last_message_at ?? session.updated_at ?? session.created_at;
}

// Chats sort by the time they show: when something was last said. Reopening a
// chat touches updated_at, and sorting on that moved a chat that was only read
// to the top of the list under a weeks-old date.
function lastActivityMs(session: ChatSessionRow): number {
	const parsed = Date.parse(lastActivityAt(session) ?? '');
	return Number.isNaN(parsed) ? 0 : parsed;
}

export function hasOwnTitle(session: ChatSessionRow): boolean {
	return (
		!isPlaceholderTitle(normalizeText(session.title)) ||
		Boolean(normalizeText(session.auto_title))
	);
}

const OPENING_LINE_MAX = 90;

function clip(text: string, max: number): string {
	return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** A chat nobody titled yet goes by how it opened. */
function resolveDisplayTitle(session: ChatSessionRow, openingLine: string | null): string {
	const title = normalizeText(session.title);
	if (title && !isPlaceholderTitle(title)) return title;

	const autoTitle = normalizeText(session.auto_title);
	if (autoTitle) return autoTitle;

	if (openingLine) return clip(openingLine, OPENING_LINE_MAX);

	return title ?? 'Recent chat';
}

function resolveFocusLabel(focus: ProjectFocusMetadata | null): string | null {
	if (!focus?.focusType || focus.focusType === 'project-wide') return null;
	if (focus.focusEntityName) return focus.focusEntityName;
	return focus.focusType.replace(/-/g, ' ');
}

export function toSummary(session: ChatSessionRow, openingLine: string | null) {
	const focus = readProjectFocus(session.focus);
	return {
		id: session.id,
		title: resolveDisplayTitle(session, openingLine),
		summary: normalizeText(session.summary),
		chat_topics: Array.isArray(session.chat_topics)
			? session.chat_topics
					.map(normalizeText)
					.filter((topic): topic is string => Boolean(topic))
			: [],
		context_type: session.context_type,
		entity_id: session.entity_id,
		message_count: session.message_count ?? 0,
		status: session.status,
		focus_label: resolveFocusLabel(focus),
		focus_type: focus?.focusType ?? null,
		created_at: session.created_at,
		updated_at: session.updated_at,
		last_message_at: session.last_message_at,
		last_activity_at: lastActivityAt(session)
	};
}

export function mergeSessions(sessionGroups: ChatSessionRow[][]): ChatSessionRow[] {
	const byId = new Map<string, ChatSessionRow>();
	for (const group of sessionGroups) {
		for (const session of group) {
			byId.set(session.id, session);
		}
	}

	return Array.from(byId.values()).sort((a, b) => lastActivityMs(b) - lastActivityMs(a));
}
