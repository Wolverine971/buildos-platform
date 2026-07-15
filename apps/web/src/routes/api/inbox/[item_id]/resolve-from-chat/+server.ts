// apps/web/src/routes/api/inbox/[item_id]/resolve-from-chat/+server.ts
import type { RequestHandler } from './$types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { requireProjectMemberAccess } from '$lib/server/ontology-project-access';
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';
import { commitChangeSet } from '@buildos/shared-agent-ops';
import { syncInboxItemForSource } from '@buildos/shared-agent-ops/inbox-index';
import { finalizeProjectLoopRunIfComplete } from '$lib/server/project-loop-run.service';
import { refreshLinkedAuditSuggestionCounts } from '$lib/server/project-suggestion-actions.service';
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
	resolution?: unknown;
	note?: unknown;
};

type ChatMutationSummary = {
	sessionId: string;
	totalMutations: number;
	affectedProjectIds: string[];
};

type ExplicitChatResolution = {
	sessionId: string;
	resolution: 'handled' | 'dismissed';
	note: string | null;
};

const SUPPORTED_SOURCE_TYPES = new Set<InboxSourceType>([
	'agent_run',
	'project_suggestion',
	'project_audit',
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

function parseExplicitResolution(body: ChatResolutionBody): ExplicitChatResolution | null {
	const resolution = readString(body.resolution);
	if (resolution !== 'handled' && resolution !== 'dismissed') return null;
	const sessionId = readString(body.session_id);
	if (!sessionId) return null;
	const note = readString(body.note);
	return {
		sessionId,
		resolution,
		note: note ? note.slice(0, 1000) : null
	};
}

function explicitResolutionNote(resolution: ExplicitChatResolution): string {
	const base =
		resolution.resolution === 'handled'
			? 'Marked handled from chat without applying the original suggestion.'
			: 'Dismissed from chat.';
	return resolution.note ? `${base} ${resolution.note}` : base;
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

function projectAuditSessionMatchesInboxItem(
	session: ChatSessionRow,
	item: InboxIndexRow
): boolean {
	if (item.source_type !== 'project_audit') return false;
	const metadata = asRecord(session.agent_metadata);
	if (!metadata) return false;
	return (
		(metadata.source === 'project_audit' && metadata.audit_id === item.source_ref_id) ||
		(metadata.source_type === 'project_audit' && metadata.source_ref_id === item.source_ref_id)
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
	if (updated) {
		await refreshLinkedAuditSuggestionCounts({
			supabase: params.admin,
			suggestionId: params.item.source_ref_id
		});
		await finalizeProjectLoopRunIfComplete(
			params.admin,
			(updated as { run_id?: string }).run_id
		);
		return { resolved: true, item: synced };
	}

	const repaired = await syncResolvedItem(params.admin, params.item);
	return {
		resolved: isTerminalInboxStatus(repaired?.status),
		item: repaired,
		reason: 'source_not_pending'
	};
}

async function resolveProjectSuggestionExplicitlyFromChat(params: {
	admin: any;
	item: InboxIndexRow;
	resolution: ExplicitChatResolution;
}): Promise<{ resolved: boolean; item: InboxIndexRow | null; reason?: string }> {
	if (!params.item.project_id) {
		return { resolved: false, item: params.item, reason: 'missing_project' };
	}

	const now = new Date().toISOString();
	const addressed = params.resolution.resolution === 'handled';
	const { data: updated, error } = await params.admin
		.from('project_suggestions')
		.update({
			status: addressed ? 'addressed' : 'rejected',
			decided_at: now,
			user_feedback: {
				reason: 'other',
				note: explicitResolutionNote(params.resolution),
				created_at: now
			},
			updated_at: now
		})
		.eq('id', params.item.source_ref_id)
		.eq('project_id', params.item.project_id)
		.eq('status', 'pending')
		.select('*')
		.maybeSingle();

	if (error) throw error;
	const synced = updated ? await syncResolvedItem(params.admin, params.item) : null;
	if (updated) {
		await refreshLinkedAuditSuggestionCounts({
			supabase: params.admin,
			suggestionId: params.item.source_ref_id
		});
		await finalizeProjectLoopRunIfComplete(
			params.admin,
			(updated as { run_id?: string }).run_id
		);
		return { resolved: true, item: synced };
	}

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
	userId: string;
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
		.eq('user_id', params.userId)
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

async function resolveCalendarSuggestionExplicitlyFromChat(params: {
	admin: any;
	item: InboxIndexRow;
	resolution: ExplicitChatResolution;
	userId: string;
}): Promise<{ resolved: boolean; item: InboxIndexRow | null; reason?: string }> {
	const now = new Date().toISOString();
	const { data: updated, error } = await params.admin
		.from('calendar_project_suggestions')
		.update({
			status: 'rejected',
			rejection_reason: explicitResolutionNote(params.resolution),
			status_changed_at: now,
			updated_at: now
		})
		.eq('id', params.item.source_ref_id)
		.eq('user_id', params.userId)
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

async function resolveProjectAuditFromChat(params: {
	admin: any;
	item: InboxIndexRow;
	summary?: ChatMutationSummary | null;
	resolution?: ExplicitChatResolution | null;
}): Promise<{ resolved: boolean; item: InboxIndexRow | null; reason?: string }> {
	if (!params.item.project_id) {
		return { resolved: false, item: params.item, reason: 'missing_project' };
	}

	const now = new Date().toISOString();
	const dismissed = params.resolution?.resolution === 'dismissed';
	const status = dismissed ? 'archived' : 'reviewed';
	const patch: Record<string, unknown> = dismissed
		? {
				status,
				archived_at: now
			}
		: {
				status,
				reviewed_at: now
			};

	const { data: updated, error } = await params.admin
		.from('project_audits')
		.update(patch)
		.eq('id', params.item.source_ref_id)
		.eq('project_id', params.item.project_id)
		.in('status', ['ready', 'reviewed', 'archived'])
		.select('*')
		.maybeSingle();

	if (error) throw error;
	if (updated) {
		const synced = await syncResolvedItem(params.admin, params.item);
		return { resolved: true, item: synced };
	}

	const repaired = await syncResolvedItem(params.admin, params.item);
	return {
		resolved: isTerminalInboxStatus(repaired?.status),
		item: repaired,
		reason: params.summary ? 'source_not_ready' : 'source_not_pending'
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

async function resolveInboxItemWithMutations(params: {
	admin: any;
	item: InboxIndexRow;
	summary: ChatMutationSummary;
	userId: string;
}): Promise<{ resolved: boolean; item: InboxIndexRow | null; reason?: string }> {
	if (params.item.source_type === 'project_suggestion') {
		return resolveProjectSuggestionFromChat({
			admin: params.admin,
			item: params.item,
			summary: params.summary
		});
	}
	if (params.item.source_type === 'calendar_suggestion') {
		return resolveCalendarSuggestionFromChat({
			admin: params.admin,
			item: params.item,
			summary: params.summary,
			userId: params.userId
		});
	}
	if (params.item.source_type === 'project_audit') {
		return resolveProjectAuditFromChat({
			admin: params.admin,
			item: params.item,
			summary: params.summary
		});
	}
	return resolveAgentRunFromChat({
		admin: params.admin,
		item: params.item,
		userId: params.userId
	});
}

async function resolveInboxItemExplicitly(params: {
	admin: any;
	item: InboxIndexRow;
	resolution: ExplicitChatResolution;
	userId: string;
}): Promise<{ resolved: boolean; item: InboxIndexRow | null; reason?: string }> {
	if (params.item.source_type === 'project_suggestion') {
		return resolveProjectSuggestionExplicitlyFromChat({
			admin: params.admin,
			item: params.item,
			resolution: params.resolution
		});
	}
	if (params.item.source_type === 'calendar_suggestion') {
		return resolveCalendarSuggestionExplicitlyFromChat({
			admin: params.admin,
			item: params.item,
			resolution: params.resolution,
			userId: params.userId
		});
	}
	if (params.item.source_type === 'project_audit') {
		return resolveProjectAuditFromChat({
			admin: params.admin,
			item: params.item,
			resolution: params.resolution
		});
	}
	return resolveAgentRunFromChat({
		admin: params.admin,
		item: params.item,
		userId: params.userId
	});
}

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user?.id) return ApiResponse.unauthorized('Authentication required');

	const itemId = readString(params.item_id);
	if (!itemId) return ApiResponse.badRequest('Inbox item id is required');

	const body = (await request.json().catch(() => ({}))) as ChatResolutionBody;
	const summary = parseMutationSummary(body);
	const explicitResolution = parseExplicitResolution(body);
	if (readString(body.resolution) && !explicitResolution) {
		return ApiResponse.badRequest('Invalid chat resolution');
	}
	const sessionId = summary?.sessionId ?? explicitResolution?.sessionId;
	if (!sessionId) {
		return ApiResponse.success({ resolved: false, reason: 'no_chat_mutations' });
	}

	let item: InboxIndexRow | null = null;
	let session: ChatSessionRow | null = null;
	try {
		item = await loadInboxItem({ supabase: locals.supabase as any, itemId });
		session = await loadChatSession({
			supabase: locals.supabase as any,
			sessionId,
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
	if (
		!sessionMatchesInboxItem(session, item) &&
		!projectAuditSessionMatchesInboxItem(session, item)
	) {
		return ApiResponse.badRequest('Chat session does not match inbox item');
	}

	if (item.source_type === 'project_suggestion' || item.source_type === 'project_audit') {
		if (!item.project_id)
			return ApiResponse.badRequest(
				item.source_type === 'project_audit'
					? 'Project audit is missing project_id'
					: 'Project suggestion is missing project_id'
			);
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
		let result: { resolved: boolean; item: InboxIndexRow | null; reason?: string };
		if (explicitResolution?.resolution === 'dismissed') {
			result = await resolveInboxItemExplicitly({
				admin,
				item,
				resolution: explicitResolution,
				userId: user.id
			});
		} else if (summary) {
			const mutationResult = await resolveInboxItemWithMutations({
				admin,
				item,
				summary,
				userId: user.id
			});
			result =
				mutationResult.resolved || !explicitResolution
					? mutationResult
					: await resolveInboxItemExplicitly({
							admin,
							item,
							resolution: explicitResolution,
							userId: user.id
						});
		} else if (explicitResolution) {
			result = await resolveInboxItemExplicitly({
				admin,
				item,
				resolution: explicitResolution,
				userId: user.id
			});
		} else {
			result = { resolved: false, item, reason: 'no_chat_mutations' };
		}

		return ApiResponse.success({
			...result,
			source_type: item.source_type,
			source_ref_id: item.source_ref_id
		});
	} catch (error) {
		return ApiResponse.databaseError(error);
	}
};
