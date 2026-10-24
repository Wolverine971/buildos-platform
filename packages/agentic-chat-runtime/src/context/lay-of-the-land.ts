// packages/agentic-chat-runtime/src/context/lay-of-the-land.ts
//
// Workspace chat's opening view (tasker/146). DJ: "When I open the workspace chat,
// it should have a high-level view of things I've talked about in the past and
// anything that's timely, pressing, or urgent... a high-level view of my recent
// projects." Pressing work and recent projects already load (project
// intelligence and the project index); this adds the two missing pieces:
//   - recent conversations: the last few chats in any context, each as one topic
//     line (its title, else its summary's first sentence, else the user's own
//     opening message), so chat can pick up a thread without a search;
//   - the Workspace shelf: newest loose items and open suggestions.
// Both read with the user-scoped client beside the context RPC, so they add no
// round trip, and any failure leaves that piece out rather than failing the load.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { ABOUT_YOU_TYPE_KEY } from '@buildos/shared-agent-ops/ontology/about-you';
import type {
	GlobalLayOfTheLand,
	GlobalRecentConversation,
	GlobalWorkspaceShelf
} from './context-models';

export const LAY_OF_THE_LAND_LIMITS = Object.freeze({
	conversationDays: 21,
	/** One extra so the current chat can be dropped at render time. */
	conversations: 9,
	topicChars: 140,
	shelfItems: 8,
	suggestions: 4,
	reasonChars: 120
});

/** Titles the app writes before a chat is named; they say nothing about the topic. */
const PLACEHOLDER_TITLES = new Set(
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

function clean(value: unknown, max: number): string | null {
	if (typeof value !== 'string') return null;
	const flat = value.replace(/\s+/g, ' ').trim();
	if (!flat) return null;
	return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

function realTitle(...candidates: unknown[]): string | null {
	for (const candidate of candidates) {
		const title = clean(candidate, 90);
		if (title && !PLACEHOLDER_TITLES.has(title.toLowerCase())) return title;
	}
	return null;
}

/** The summary's first sentence: summaries open with what the user asked. */
function firstSentence(summary: unknown): string | null {
	const text = clean(summary, 600);
	if (!text) return null;
	const end = text.search(/[.!?](\s|$)/);
	return clean(end > 0 ? text.slice(0, end + 1) : text, LAY_OF_THE_LAND_LIMITS.topicChars);
}

type SessionRow = {
	id: string;
	title: string | null;
	auto_title: string | null;
	summary: string | null;
	context_type: string | null;
	entity_id: string | null;
	last_message_at: string | null;
	updated_at: string | null;
	chat_messages?: Array<{ content: string | null }> | null;
};

export function toRecentConversation(row: SessionRow): GlobalRecentConversation | null {
	const lastAt = row.last_message_at ?? row.updated_at;
	if (!row.id || !lastAt) return null;
	const title = realTitle(row.title, row.auto_title);
	const summaryTopic = firstSentence(row.summary);
	const opening = clean(row.chat_messages?.[0]?.content, LAY_OF_THE_LAND_LIMITS.topicChars);
	const topic = summaryTopic ?? opening;
	if (!title && !topic) return null;
	return {
		session_id: row.id,
		context_type: row.context_type ?? 'global',
		entity_id: row.entity_id ?? null,
		last_at: lastAt,
		title,
		topic,
		topic_source: summaryTopic ? 'summary' : opening ? 'first_message' : null
	};
}

async function loadRecentConversations(
	supabase: SupabaseClient<Database>,
	userId: string,
	now: Date
): Promise<GlobalRecentConversation[]> {
	const since = new Date(
		now.getTime() - LAY_OF_THE_LAND_LIMITS.conversationDays * 86_400_000
	).toISOString();
	const { data, error } = await supabase
		.from('chat_sessions')
		.select(
			'id, title, auto_title, summary, context_type, entity_id, last_message_at, updated_at, chat_messages(content)'
		)
		.eq('user_id', userId)
		.neq('status', 'archived')
		.gte('message_count', 1)
		.gte('last_message_at', since)
		.eq('chat_messages.role', 'user')
		.order('created_at', { referencedTable: 'chat_messages', ascending: true })
		.limit(1, { referencedTable: 'chat_messages' })
		.order('last_message_at', { ascending: false })
		.limit(LAY_OF_THE_LAND_LIMITS.conversations);
	if (error) throw error;
	return ((data ?? []) as unknown as SessionRow[])
		.map(toRecentConversation)
		.filter((row): row is GlobalRecentConversation => row !== null);
}

async function loadWorkspaceShelf(
	supabase: SupabaseClient<Database>,
	userId: string,
	workspaceId: string
): Promise<GlobalWorkspaceShelf> {
	const [docs, tasks, suggestions] = await Promise.all([
		supabase
			.from('onto_documents')
			.select('id, title, type_key, created_at', { count: 'exact' })
			.eq('project_id', workspaceId)
			.neq('type_key', ABOUT_YOU_TYPE_KEY)
			.is('deleted_at', null)
			.is('archived_at', null)
			.order('created_at', { ascending: false })
			.limit(LAY_OF_THE_LAND_LIMITS.shelfItems),
		supabase
			.from('onto_tasks')
			.select('id, title, created_at, due_at', { count: 'exact' })
			.eq('project_id', workspaceId)
			.is('deleted_at', null)
			.is('archived_at', null)
			.neq('state_key', 'done')
			.order('created_at', { ascending: false })
			.limit(LAY_OF_THE_LAND_LIMITS.shelfItems),
		supabase
			.from('workspace_suggestions')
			.select('id, kind, proposed_name, target_project_id, reason, items')
			.eq('user_id', userId)
			.eq('status', 'open')
			.order('created_at', { ascending: false })
			.limit(LAY_OF_THE_LAND_LIMITS.suggestions)
	]);
	if (docs.error) throw docs.error;
	if (tasks.error) throw tasks.error;
	const items: GlobalWorkspaceShelf['items'] = [
		...(docs.data ?? []).map((doc) => ({
			entity: 'document' as const,
			kind: doc.type_key === 'document.note' ? ('note' as const) : ('doc' as const),
			id: doc.id,
			title: clean(doc.title, 80) ?? 'Untitled',
			created_at: doc.created_at
		})),
		...(tasks.data ?? []).map((task) => ({
			entity: 'task' as const,
			kind: 'task' as const,
			id: task.id,
			title: clean(task.title, 80) ?? 'Untitled task',
			created_at: task.created_at,
			due_at: task.due_at ?? null
		}))
	]
		.sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))
		.slice(0, LAY_OF_THE_LAND_LIMITS.shelfItems);
	// Suggestions are a nice-to-have: a failed read leaves them out.
	const openSuggestions: GlobalWorkspaceShelf['open_suggestions'] = suggestions.error
		? []
		: (suggestions.data ?? []).flatMap((row) => {
				const kind = row.kind;
				if (kind !== 'file' && kind !== 'graduate' && kind !== 'fold') return [];
				return [
					{
						id: row.id,
						kind,
						proposed_name: clean(row.proposed_name, 80),
						target_project_id: row.target_project_id ?? null,
						item_count: Array.isArray(row.items) ? row.items.length : 0,
						reason: clean(row.reason, LAY_OF_THE_LAND_LIMITS.reasonChars)
					}
				];
			});
	return {
		loose_total:
			(docs.count ?? docs.data?.length ?? 0) + (tasks.count ?? tasks.data?.length ?? 0),
		items,
		open_suggestions: openSuggestions
	};
}

export async function loadGlobalLayOfTheLand(params: {
	supabase: SupabaseClient<Database>;
	userId: string;
	workspaceId: Promise<string | null>;
	onError?: (source: string, error: unknown) => void;
	now?: Date;
}): Promise<GlobalLayOfTheLand> {
	const now = params.now ?? new Date();
	const [conversations, shelf] = await Promise.all([
		loadRecentConversations(params.supabase, params.userId, now).catch((error) => {
			params.onError?.('query.global.recent_conversations', error);
			return [] as GlobalRecentConversation[];
		}),
		params.workspaceId
			.then((workspaceId) =>
				workspaceId ? loadWorkspaceShelf(params.supabase, params.userId, workspaceId) : null
			)
			.catch((error) => {
				params.onError?.('query.global.workspace_shelf', error);
				return null;
			})
	]);
	return { recent_conversations: conversations, workspace_shelf: shelf };
}
