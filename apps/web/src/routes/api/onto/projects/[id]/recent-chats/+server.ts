// apps/web/src/routes/api/onto/projects/[id]/recent-chats/+server.ts
/**
 * GET /api/onto/projects/[id]/recent-chats
 * Fetch recent chat sessions scoped to a project for the project detail page.
 * `include=workspace_chats` (the Workspace card) also lists the caller's own
 * Workspace chats: the global context, whose home is the Workspace (tasker 146).
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { validatePaginationCustom, verifyProjectAccess } from '$lib/utils/api-helpers';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { logOntologyApiError } from '../../../shared/error-logging';
import {
	SESSION_SELECT,
	hasOwnTitle,
	isWorkspaceChatRow,
	mergeSessions,
	normalizeText,
	toSummary,
	type ChatSessionRow
} from '$lib/server/project-recent-chats';

async function fetchLinkedSessionIds(
	supabase: App.Locals['supabase'],
	projectId: string,
	limit: number
): Promise<string[]> {
	const { data, error } = await (supabase as any)
		.from('chat_sessions_projects')
		.select('chat_session_id')
		.eq('project_id', projectId)
		.order('linked_at', { ascending: false, nullsFirst: false })
		.limit(limit);

	if (error) {
		console.warn('[Project Recent Chats API] Failed to fetch linked chat sessions:', error);
		return [];
	}

	return Array.from(
		new Set(
			(data ?? [])
				.map((row: { chat_session_id?: string | null }) => row.chat_session_id)
				.filter((id: string | null | undefined): id is string => Boolean(id))
		)
	);
}

async function fetchTurnRunSessionIds(
	supabase: App.Locals['supabase'],
	userId: string,
	projectId: string,
	limit: number
): Promise<string[]> {
	const { data, error } = await supabase
		.from('chat_turn_runs')
		.select('session_id')
		.eq('user_id', userId)
		.eq('project_id', projectId)
		.order('created_at', { ascending: false })
		.limit(limit);

	if (error) {
		console.warn('[Project Recent Chats API] Failed to fetch chat turn runs:', error);
		return [];
	}

	return Array.from(
		new Set(
			(data ?? [])
				.map((row) => row.session_id)
				.filter((id: string | null | undefined): id is string => Boolean(id))
		)
	);
}

async function fetchSessionsByIds(
	supabase: App.Locals['supabase'],
	userId: string,
	sessionIds: string[]
): Promise<ChatSessionRow[]> {
	if (sessionIds.length === 0) return [];

	const { data, error } = await supabase
		.from('chat_sessions')
		.select(SESSION_SELECT)
		.eq('user_id', userId)
		.neq('status', 'archived')
		.or('message_count.gte.1,summary.not.is.null,last_message_at.not.is.null')
		.in('id', sessionIds);

	if (error) {
		console.warn('[Project Recent Chats API] Failed to fetch linked chat session rows:', error);
		return [];
	}

	return (data ?? []) as ChatSessionRow[];
}

/** The caller's Workspace chats (global context), for the Workspace card. */
async function fetchWorkspaceChats(
	supabase: App.Locals['supabase'],
	userId: string,
	workspaceId: string,
	limit: number
): Promise<ChatSessionRow[]> {
	const { data, error } = await supabase
		.from('chat_sessions')
		.select(SESSION_SELECT)
		.eq('user_id', userId)
		.neq('status', 'archived')
		.in('context_type', ['global', 'general'])
		.or('message_count.gte.1,summary.not.is.null,last_message_at.not.is.null')
		.order('last_message_at', { ascending: false, nullsFirst: false })
		.order('updated_at', { ascending: false, nullsFirst: false })
		.order('created_at', { ascending: false, nullsFirst: false })
		.limit(limit);

	if (error) {
		console.warn('[Project Recent Chats API] Failed to fetch Workspace chats:', error);
		return [];
	}

	return ((data ?? []) as ChatSessionRow[]).filter((session) =>
		isWorkspaceChatRow(session, workspaceId)
	);
}

/** The first thing the user said in each chat, for chats that have no title yet. */
async function fetchOpeningLines(
	supabase: App.Locals['supabase'],
	userId: string,
	sessionIds: string[]
): Promise<Map<string, string>> {
	const lines = new Map<string, string>();
	if (sessionIds.length === 0) return lines;

	const { data, error } = await supabase
		.from('chat_messages')
		.select('session_id, content')
		.eq('user_id', userId)
		.eq('role', 'user')
		.in('session_id', sessionIds)
		.order('created_at', { ascending: true })
		.limit(sessionIds.length * 8);

	if (error) {
		console.warn('[Project Recent Chats API] Failed to fetch opening messages:', error);
		return lines;
	}

	for (const row of data ?? []) {
		if (lines.has(row.session_id)) continue;
		const line = normalizeText(row.content);
		if (line) lines.set(row.session_id, line);
	}
	return lines;
}

export const GET: RequestHandler = async ({ params, url, locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const { id: projectId } = params;
		if (!projectId) {
			return ApiResponse.badRequest('Project ID required');
		}
		if (!isValidUUID(projectId)) {
			return ApiResponse.badRequest('Invalid project ID');
		}

		const { limit, offset } = validatePaginationCustom(
			{
				limit: url.searchParams.get('limit'),
				offset: url.searchParams.get('offset')
			},
			{ defaultLimit: 10, maxLimit: 25 }
		);

		const supabase = locals.supabase;
		const measure = <T>(name: string, fn: () => Promise<T> | T) =>
			locals.serverTiming ? locals.serverTiming.measure(name, fn) : fn();

		const fetchWindow = Math.min(offset + limit + 1, 75);
		const includeWorkspaceChats = url.searchParams.get('include') === 'workspace_chats';

		// The access check runs beside the reads instead of ahead of them: each
		// read is already limited to this user's own sessions, and nothing is
		// returned unless the check passes.
		const [authResult, directResult, metadataResult, linkedSessions, workspaceChats] =
			await Promise.all([
				measure('chats.access', () => verifyProjectAccess(supabase, projectId, user.id)),
				measure('chats.db.direct', () =>
					supabase
						.from('chat_sessions')
						.select(SESSION_SELECT)
						.eq('user_id', user.id)
						.neq('status', 'archived')
						.eq('context_type', 'project')
						.eq('entity_id', projectId)
						.or('message_count.gte.1,summary.not.is.null,last_message_at.not.is.null')
						.order('last_message_at', { ascending: false, nullsFirst: false })
						.order('updated_at', { ascending: false, nullsFirst: false })
						.order('created_at', { ascending: false, nullsFirst: false })
						.limit(fetchWindow)
				),
				measure('chats.db.focus', () =>
					supabase
						.from('chat_sessions')
						.select(SESSION_SELECT)
						.eq('user_id', user.id)
						.neq('status', 'archived')
						.filter('agent_metadata->focus->>projectId', 'eq', projectId)
						.or('message_count.gte.1,summary.not.is.null,last_message_at.not.is.null')
						.order('last_message_at', { ascending: false, nullsFirst: false })
						.order('updated_at', { ascending: false, nullsFirst: false })
						.order('created_at', { ascending: false, nullsFirst: false })
						.limit(fetchWindow)
				),
				measure('chats.db.linked', async () => {
					const [linkedIds, turnRunIds] = await Promise.all([
						fetchLinkedSessionIds(supabase, projectId, fetchWindow),
						fetchTurnRunSessionIds(supabase, user.id, projectId, fetchWindow * 2)
					]);
					return fetchSessionsByIds(
						supabase,
						user.id,
						Array.from(new Set([...linkedIds, ...turnRunIds]))
					);
				}),
				// Only the caller's own sessions, so the flag can't widen what anyone sees.
				includeWorkspaceChats
					? measure('chats.db.workspace', () =>
							fetchWorkspaceChats(supabase, user.id, projectId, fetchWindow)
						)
					: Promise.resolve([] as ChatSessionRow[])
			]);

		if (!authResult.authorized) {
			return authResult.error!;
		}

		if (directResult.error) {
			console.error(
				'[Project Recent Chats API] Failed to fetch direct sessions:',
				directResult.error
			);
			await logOntologyApiError({
				supabase,
				error: directResult.error,
				endpoint: `/api/onto/projects/${projectId}/recent-chats`,
				method: 'GET',
				userId: user.id,
				projectId,
				entityType: 'project',
				operation: 'project_recent_chats_fetch',
				tableName: 'chat_sessions'
			});
			return ApiResponse.databaseError(directResult.error);
		}

		if (metadataResult.error) {
			console.warn(
				'[Project Recent Chats API] Failed to fetch metadata-scoped sessions:',
				metadataResult.error
			);
		}

		const merged = mergeSessions([
			(directResult.data ?? []) as ChatSessionRow[],
			metadataResult.error ? [] : ((metadataResult.data ?? []) as ChatSessionRow[]),
			linkedSessions,
			workspaceChats
		]);

		const pageSessions = merged.slice(offset, offset + limit);
		const hasMore = merged.length > offset + limit;
		const openingLines = await measure('chats.db.openings', () =>
			fetchOpeningLines(
				supabase,
				user.id,
				pageSessions.filter((session) => !hasOwnTitle(session)).map((session) => session.id)
			)
		);

		return ApiResponse.success({
			chats: pageSessions.map((session) =>
				toSummary(session, openingLines.get(session.id) ?? null)
			),
			total: merged.length,
			hasMore
		});
	} catch (err) {
		console.error('[Project Recent Chats API] Unexpected error:', err);
		await logOntologyApiError({
			supabase: locals.supabase,
			error: err,
			endpoint: `/api/onto/projects/${params.id ?? ''}/recent-chats`,
			method: 'GET',
			userId: (await locals.safeGetSession()).user?.id,
			projectId: params.id,
			entityType: 'project',
			operation: 'project_recent_chats_fetch'
		});
		return ApiResponse.internalError(err, 'An unexpected error occurred');
	}
};
