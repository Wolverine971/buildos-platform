// apps/web/src/routes/api/inbox/[item_id]/resolve-from-chat/+server.ts
import type { RequestHandler } from './$types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { requireProjectMemberAccess } from '$lib/server/ontology-project-access';
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';
import { commitChangeSet } from '@buildos/shared-agent-ops';
import { syncInboxItemForSource } from '@buildos/shared-agent-ops/inbox-index';
import type { InboxIndexRow, InboxSourceType } from '@buildos/shared-agent-ops/inbox-index';

type ChatSessionRow = {
	id: string;
	user_id: string;
	agent_metadata?: unknown;
};

type ChatResolutionBody = {
	session_id?: unknown;
	has_changes?: unknown;
	total_mutations?: unknown;
	affected_project_ids?: unknown;
};

type ChatMutationSummary = {
	sessionId: string;
	totalMutations: number;
	affectedProjectIds: string[];
};

const SUPPORTED_SOURCE_TYPES = new Set<InboxSourceType>([
	'agent_run',
	'project_suggestion',
	'calendar_suggestion'
]);

function readString(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function parseMutationSummary(body: ChatResolutionBody): ChatMutationSummary | null {
	if (body.has_changes !== true) return null;
	const sessionId = readString(body.session_id);
	if (!sessionId) return null;
	return {
		sessionId,
		totalMutations:
			typeof body.total_mutations === 'number' && Number.isFinite(body.total_mutations)
				? Math.max(0, Math.floor(body.total_mutations))
				: 0,
		affectedProjectIds: Array.isArray(body.affected_project_ids)
			? body.affected_project_ids.filter(
					(projectId): projectId is string =>
						typeof projectId === 'string' && projectId.trim().length > 0
				)
			: []
	};
}

function isTerminalInboxStatus(status: InboxIndexRow['status'] | string | null | undefined) {
	return !!status && status !== 'pending' && status !== 'snoozed';
}

function sessionMatchesInboxItem(session: ChatSessionRow, item: InboxIndexRow): boolean {
	const metadata = asRecord(session.agent_metadata);
	if (!metadata || metadata.source !== 'ai_inbox') return false;
	if (metadata.inbox_item_id === item.id) return true;
	return (
		metadata.source_type === item.source_type && metadata.source_ref_id === item.source_ref_id
	);
}

async function loadInboxItem(params: {
	supabase: any;
	itemId: string;
}): Promise<InboxIndexRow | null> {
	const { data, error } = await params.supabase
		.from('inbox_items')
		.select('*')
		.eq('id', params.itemId)
		.maybeSingle();
	if (error) throw error;
	return (data ?? null) as InboxIndexRow | null;
}

async function loadChatSession(params: {
	supabase: any;
	sessionId: string;
	userId: string;
}): Promise<ChatSessionRow | null> {
	const { data, error } = await params.supabase
		.from('chat_sessions')
		.select('id, user_id, agent_metadata')
		.eq('id', params.sessionId)
		.eq('user_id', params.userId)
		.maybeSingle();
	if (error) throw error;
	return (data ?? null) as ChatSessionRow | null;
}

async function syncResolvedItem(admin: any, item: InboxIndexRow): Promise<InboxIndexRow | null> {
	return syncInboxItemForSource({
		supabase: admin,
		sourceType: item.source_type,
		sourceRefId: item.source_ref_id
	});
}

async function resolveProjectSuggestionFromChat(params: {
	admin: any;
	item: InboxIndexRow;
	summary: ChatMutationSummary;
}): Promise<{ resolved: boolean; item: InboxIndexRow | null; reason?: string }> {
	if (!params.item.project_id) {
		return { resolved: false, item: params.item, reason: 'missing_project' };
	}

	const now = new Date().toISOString();
	const { data: updated, error } = await params.admin
		.from('project_suggestions')
		.update({
			status: 'applied',
			result: {
				ok: true,
				handled_in_chat: true,
				chat_session_id: params.summary.sessionId,
				mutation_count: params.summary.totalMutations,
				affected_project_ids: params.summary.affectedProjectIds
			},
			decided_at: now,
			applied_at: now,
			updated_at: now
		})
		.eq('id', params.item.source_ref_id)
		.eq('project_id', params.item.project_id)
		.eq('status', 'pending')
		.select('*')
		.maybeSingle();

	if (error) throw error;
	const synced = updated ? await syncResolvedItem(params.admin, params.item) : null;
	if (updated) return { resolved: true, item: synced };

	const repaired = await syncResolvedItem(params.admin, params.item);
	return {
		resolved: isTerminalInboxStatus(repaired?.status),
		item: repaired,
		reason: 'source_not_pending'
	};
}

async function resolveCalendarSuggestionFromChat(params: {
	admin: any;
	item: InboxIndexRow;
	summary: ChatMutationSummary;
}): Promise<{ resolved: boolean; item: InboxIndexRow | null; reason?: string }> {
	const createdProjectId = params.summary.affectedProjectIds[0] ?? null;
	if (!createdProjectId) {
		return { resolved: false, item: params.item, reason: 'no_project_created' };
	}

	const now = new Date().toISOString();
	const { data: updated, error } = await params.admin
		.from('calendar_project_suggestions')
		.update({
			status: 'accepted',
			created_project_id: createdProjectId,
			status_changed_at: now,
			updated_at: now
		})
		.eq('id', params.item.source_ref_id)
		.eq('status', 'pending')
		.select('*')
		.maybeSingle();

	if (error) throw error;
	const synced = updated ? await syncResolvedItem(params.admin, params.item) : null;
	if (updated) return { resolved: true, item: synced };

	const repaired = await syncResolvedItem(params.admin, params.item);
	return {
		resolved: isTerminalInboxStatus(repaired?.status),
		item: repaired,
		reason: 'source_not_pending'
	};
}

async function resolveAgentRunFromChat(params: {
	admin: any;
	item: InboxIndexRow;
	userId: string;
}): Promise<{ resolved: boolean; item: InboxIndexRow | null; reason?: string }> {
	const repaired = await syncResolvedItem(params.admin, params.item);
	if (isTerminalInboxStatus(repaired?.status)) {
		return { resolved: true, item: repaired };
	}

	const outcome = await commitChangeSet({
		admin: params.admin,
		runId: params.item.source_ref_id,
		userId: params.userId,
		defaultDecision: 'rejected'
	});

	if (!outcome.ok) {
		if (outcome.error.code === 'CONFLICT') {
			const synced = await syncResolvedItem(params.admin, params.item);
			return {
				resolved: isTerminalInboxStatus(synced?.status),
				item: synced,
				reason: 'commit_conflict'
			};
		}
		throw new Error(outcome.error.message);
	}

	const synced = await syncResolvedItem(params.admin, params.item);
	return { resolved: true, item: synced };
}

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user?.id) return ApiResponse.unauthorized('Authentication required');

	const itemId = readString(params.item_id);
	if (!itemId) return ApiResponse.badRequest('Inbox item id is required');

	const body = (await request.json().catch(() => ({}))) as ChatResolutionBody;
	const summary = parseMutationSummary(body);
	if (!summary) {
		return ApiResponse.success({ resolved: false, reason: 'no_chat_mutations' });
	}

	let item: InboxIndexRow | null = null;
	let session: ChatSessionRow | null = null;
	try {
		item = await loadInboxItem({ supabase: locals.supabase as any, itemId });
		session = await loadChatSession({
			supabase: locals.supabase as any,
			sessionId: summary.sessionId,
			userId: user.id
		});
	} catch (error) {
		return ApiResponse.databaseError(error);
	}

	if (!item) return ApiResponse.notFound('Inbox item');
	if (!session) return ApiResponse.notFound('Chat session');
	if (!SUPPORTED_SOURCE_TYPES.has(item.source_type)) {
		return ApiResponse.error(
			'Inbox item does not support chat resolution',
			HttpStatus.UNPROCESSABLE_ENTITY,
			'UNSUPPORTED_INBOX_SOURCE'
		);
	}
	if (!sessionMatchesInboxItem(session, item)) {
		return ApiResponse.badRequest('Chat session does not match inbox item');
	}

	if (item.source_type === 'project_suggestion') {
		if (!item.project_id)
			return ApiResponse.badRequest('Project suggestion is missing project_id');
		const access = await requireProjectMemberAccess({
			locals,
			user,
			projectId: item.project_id,
			requiredAccess: 'write'
		});
		if (!access.ok) return access.response;
	} else if (item.user_id !== user.id) {
		return ApiResponse.forbidden('Inbox item is owned by another user');
	}

	const admin = createAdminSupabaseClient();
	try {
		const result =
			item.source_type === 'project_suggestion'
				? await resolveProjectSuggestionFromChat({ admin, item, summary })
				: item.source_type === 'calendar_suggestion'
					? await resolveCalendarSuggestionFromChat({ admin, item, summary })
					: await resolveAgentRunFromChat({ admin, item, userId: user.id });

		return ApiResponse.success({
			...result,
			source_type: item.source_type,
			source_ref_id: item.source_ref_id
		});
	} catch (error) {
		return ApiResponse.databaseError(error);
	}
};
