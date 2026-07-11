// apps/web/src/routes/api/inbox/decide/+server.ts
import type { RequestHandler } from './$types';
import { PROJECT_LOOPS_ENABLED } from '$lib/config/project-loops';
import { CalendarAnalysisService } from '$lib/services/calendar-analysis.service';
import { decideProjectSuggestionWithClarification } from '$lib/server/clarified-decision.service';
import { decideProjectSuggestion } from '$lib/server/project-suggestion-actions.service';
import { requireProjectMemberAccess } from '$lib/server/ontology-project-access';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';
import { isInboxSourceType } from '$lib/server/inbox.service';
import { commitChangeSet } from '@buildos/shared-agent-ops';
import { syncInboxItemForSource } from '@buildos/shared-agent-ops/inbox-index';
import type { ChangeSetDecision } from '@buildos/shared-types';
import type { InboxIndexRow, InboxSourceType } from '@buildos/shared-agent-ops/inbox-index';

type SourceDecisionAction = 'approve' | 'reject';
type DecisionAction = SourceDecisionAction | 'snooze';
type DecisionPayload = Record<string, unknown>;
const MAX_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;
const DELETED_PROJECT_DECISION_MESSAGE =
	'This review item belongs to a deleted project and can no longer be applied.';

function normalizeAction(value: unknown): DecisionAction | null {
	if (value === 'approve' || value === 'accept' || value === 'apply') return 'approve';
	if (value === 'reject' || value === 'dismiss' || value === 'decline') return 'reject';
	if (value === 'snooze') return 'snooze';
	return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function asString(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isNonPendingInboxStatus(status: string | null | undefined): boolean {
	return !!status && status !== 'pending' && status !== 'snoozed';
}

function parseDecisions(value: unknown): ChangeSetDecision[] {
	if (!Array.isArray(value)) return [];
	return value
		.filter(
			(decision): decision is { change_id: string; decision?: string } =>
				!!decision &&
				typeof decision === 'object' &&
				typeof (decision as { change_id?: unknown }).change_id === 'string'
		)
		.map((decision) => ({
			change_id: decision.change_id,
			decision: decision.decision === 'rejected' ? 'rejected' : 'approved'
		}));
}

function parseSnoozeUntil(
	value: unknown
): { ok: true; value: string } | { ok: false; message: string } {
	const raw = asString(value);
	if (!raw) return { ok: false, message: 'snooze_until is required' };
	const timestamp = Date.parse(raw);
	if (!Number.isFinite(timestamp)) {
		return { ok: false, message: 'snooze_until must be a valid ISO timestamp' };
	}

	const now = Date.now();
	if (timestamp <= now) return { ok: false, message: 'snooze_until must be in the future' };
	if (timestamp - now > MAX_SNOOZE_MS) {
		return { ok: false, message: 'snooze_until cannot be more than 30 days out' };
	}

	return { ok: true, value: new Date(timestamp).toISOString() };
}

async function loadInboxItem(params: {
	supabase: any;
	itemId?: string | null;
	sourceType?: InboxSourceType | null;
	sourceRefId?: string | null;
}): Promise<InboxIndexRow | null> {
	let query = params.supabase.from('inbox_items').select('*');
	if (params.itemId) {
		query = query.eq('id', params.itemId);
	} else if (params.sourceType && params.sourceRefId) {
		query = query.eq('source_type', params.sourceType).eq('source_ref_id', params.sourceRefId);
	} else {
		return null;
	}

	const { data, error } = await query.maybeSingle();
	if (error) throw error;
	return (data ?? null) as InboxIndexRow | null;
}

function fallbackSourceStatus(
	item: InboxIndexRow,
	action: SourceDecisionAction,
	payload: DecisionPayload
): string {
	if (item.source_type === 'project_suggestion') {
		const suggestionStatus = asString(asRecord(payload.suggestion)?.status);
		if (suggestionStatus) return suggestionStatus;
		if (payload.superseded === true) return 'superseded';
		if (payload.delegated === true) return 'delegated';
		if (action === 'reject') return 'rejected';
		if (asRecord(payload.result)?.ok === false) return 'failed';
		return 'applied';
	}

	if (item.source_type === 'calendar_suggestion') {
		if (asRecord(payload.result)?.inProgress === true) return 'processing';
		return action === 'reject' ? 'rejected' : 'accepted';
	}

	if (item.source_type === 'agent_run') {
		return 'completed';
	}

	return action === 'reject' ? 'rejected' : 'applied';
}

function fallbackInboxStatus(item: InboxIndexRow, sourceStatus: string): InboxIndexRow['status'] {
	if (item.source_type === 'project_suggestion') {
		if (sourceStatus === 'approved' || sourceStatus === 'delegated') return 'deciding';
		if (sourceStatus === 'failed') return 'blocked';
		if (sourceStatus === 'pending') return 'decided';
		return 'decided';
	}

	if (item.source_type === 'calendar_suggestion') {
		if (sourceStatus === 'processing') return 'deciding';
		if (sourceStatus === 'pending') return 'decided';
		return 'decided';
	}

	if (item.source_type === 'agent_run') {
		if (sourceStatus === 'running') return 'deciding';
		if (sourceStatus === 'failed' || sourceStatus === 'cancelled') return 'blocked';
		if (sourceStatus === 'proposal_ready') return 'decided';
		return 'decided';
	}

	return 'decided';
}

async function forceDecisionInboxStatus(params: {
	admin: any;
	item: InboxIndexRow;
	action: SourceDecisionAction;
	payload: DecisionPayload;
}): Promise<InboxIndexRow> {
	const sourceStatus = fallbackSourceStatus(params.item, params.action, params.payload);
	const status = fallbackInboxStatus(params.item, sourceStatus);
	const patch: Partial<InboxIndexRow> = {
		status,
		source_status: sourceStatus,
		decided_at: status === 'deciding' ? null : new Date().toISOString(),
		blocked_reason:
			status === 'blocked' ? (params.item.blocked_reason ?? 'Decision failed') : null
	};

	let query = params.admin.from('inbox_items').update(patch);
	if (params.item.id) {
		query = query.eq('id', params.item.id);
	} else {
		query = query
			.eq('source_type', params.item.source_type)
			.eq('source_ref_id', params.item.source_ref_id);
	}

	const { data, error } = await query.select('*').maybeSingle();
	if (error) throw error;
	return (data ?? { ...params.item, ...patch }) as InboxIndexRow;
}

async function syncResultItem(
	admin: any,
	item: InboxIndexRow,
	action: SourceDecisionAction,
	payload: DecisionPayload
): Promise<InboxIndexRow> {
	let repaired: InboxIndexRow | null = null;
	try {
		repaired = await syncInboxItemForSource({
			supabase: admin,
			sourceType: item.source_type,
			sourceRefId: item.source_ref_id
		});
	} catch (error) {
		console.warn('[AI Inbox] Decision source sync failed; forcing index status', {
			source_type: item.source_type,
			source_ref_id: item.source_ref_id,
			error: error instanceof Error ? error.message : error
		});
	}
	if (repaired && isNonPendingInboxStatus(repaired.status)) return repaired;

	return forceDecisionInboxStatus({
		admin,
		item: repaired ?? item,
		action,
		payload
	});
}

async function authorizeInboxSnooze(params: {
	item: InboxIndexRow;
	locals: App.Locals;
	user: NonNullable<Awaited<ReturnType<App.Locals['safeGetSession']>>['user']>;
}): Promise<{ ok: true } | { ok: false; response: Response; message: string }> {
	const { item, locals, user } = params;
	if (item.user_id && item.user_id !== user.id) {
		return {
			ok: false,
			message: 'Inbox item is owned by another user',
			response: ApiResponse.error(
				'Inbox item is owned by another user',
				HttpStatus.FORBIDDEN,
				'FORBIDDEN'
			)
		};
	}

	if (item.project_id) {
		const access = await requireProjectMemberAccess({
			locals,
			user,
			projectId: item.project_id,
			requiredAccess: 'read'
		});
		if (!access.ok) {
			return { ok: false, message: 'Project access denied', response: access.response };
		}
	}

	return { ok: true };
}

async function snoozeLoadedInboxItem(params: {
	item: InboxIndexRow;
	body: Record<string, unknown>;
	locals: App.Locals;
	user: NonNullable<Awaited<ReturnType<App.Locals['safeGetSession']>>['user']>;
	admin: ReturnType<typeof createAdminSupabaseClient>;
}): Promise<
	| { ok: true; payload: Record<string, unknown> }
	| { ok: false; response: Response; message: string }
> {
	const { item, body, locals, user, admin } = params;
	if (item.status !== 'pending' && item.status !== 'snoozed') {
		return {
			ok: false,
			message: 'Only pending inbox items can be snoozed',
			response: ApiResponse.error(
				'Only pending inbox items can be snoozed',
				HttpStatus.CONFLICT,
				'INBOX_ITEM_NOT_PENDING'
			)
		};
	}

	const parsed = parseSnoozeUntil(body.snooze_until ?? body.snoozed_until);
	if (!parsed.ok) {
		return {
			ok: false,
			message: parsed.message,
			response: ApiResponse.badRequest(parsed.message)
		};
	}

	const access = await authorizeInboxSnooze({ item, locals, user });
	if (!access.ok) return access;

	const patch: Partial<InboxIndexRow> = {
		status: 'snoozed',
		snoozed_until: parsed.value,
		decided_at: null,
		blocked_reason: null
	};
	let query = (admin as any).from('inbox_items').update(patch);
	if (item.id) {
		query = query.eq('id', item.id);
	} else {
		query = query.eq('source_type', item.source_type).eq('source_ref_id', item.source_ref_id);
	}

	const { data, error } = await query.select('*').maybeSingle();
	if (error) {
		return {
			ok: false,
			message: error.message ?? 'Failed to snooze inbox item',
			response: ApiResponse.databaseError(error)
		};
	}

	return {
		ok: true,
		payload: {
			item: (data ?? { ...item, ...patch }) as InboxIndexRow,
			snoozed_until: parsed.value
		}
	};
}

async function guardActiveInboxProject(params: {
	admin: any;
	item: InboxIndexRow;
}): Promise<{ ok: true } | { ok: false; response: Response; message: string }> {
	if (!params.item.project_id) return { ok: true };

	const { data: project, error } = await params.admin
		.from('onto_projects')
		.select('id, deleted_at')
		.eq('id', params.item.project_id)
		.maybeSingle();
	if (error) {
		return {
			ok: false,
			message: error.message ?? 'Failed to verify inbox project',
			response: ApiResponse.databaseError(error)
		};
	}
	if (project && !project.deleted_at) return { ok: true };

	let expireQuery = params.admin.from('inbox_items').update({
		status: 'expired',
		source_status: 'project_deleted',
		decided_at: new Date().toISOString(),
		blocked_reason: 'Project was deleted',
		snoozed_until: null
	});
	expireQuery = params.item.id
		? expireQuery.eq('id', params.item.id)
		: expireQuery
				.eq('source_type', params.item.source_type)
				.eq('source_ref_id', params.item.source_ref_id);
	const { error: expireError } = await expireQuery.select('*').maybeSingle();
	if (expireError) {
		return {
			ok: false,
			message: expireError.message ?? 'Failed to expire deleted-project inbox item',
			response: ApiResponse.databaseError(expireError)
		};
	}

	return {
		ok: false,
		message: DELETED_PROJECT_DECISION_MESSAGE,
		response: ApiResponse.error(
			DELETED_PROJECT_DECISION_MESSAGE,
			HttpStatus.CONFLICT,
			'PROJECT_DELETED'
		)
	};
}

function statusForCommitError(code: string): number {
	if (code === 'NOT_FOUND') return HttpStatus.NOT_FOUND;
	if (code === 'CONFLICT') return HttpStatus.CONFLICT;
	if (code === 'VALIDATION_ERROR') return HttpStatus.BAD_REQUEST;
	return HttpStatus.INTERNAL_SERVER_ERROR;
}

async function decideLoadedInboxItem(params: {
	item: InboxIndexRow;
	action: DecisionAction;
	body: Record<string, unknown>;
	locals: App.Locals;
	user: NonNullable<Awaited<ReturnType<App.Locals['safeGetSession']>>['user']>;
	admin: ReturnType<typeof createAdminSupabaseClient>;
	fetchFn: typeof fetch;
}): Promise<
	| { ok: true; payload: Record<string, unknown> }
	| { ok: false; response: Response; message: string }
> {
	const { item, action, body, locals, user, admin, fetchFn } = params;
	const projectGuard = await guardActiveInboxProject({ admin, item });
	if (!projectGuard.ok) return projectGuard;

	if (action === 'snooze') {
		return snoozeLoadedInboxItem({ item, body, locals, user, admin });
	}

	if (item.source_type === 'agent_run') {
		const defaultDecision: 'approved' | 'rejected' =
			action === 'reject'
				? 'rejected'
				: body.default_decision === 'rejected'
					? 'rejected'
					: 'approved';
		const outcome = await commitChangeSet({
			admin,
			runId: item.source_ref_id,
			userId: user.id,
			decisions: action === 'reject' ? [] : parseDecisions(body.decisions),
			defaultDecision
		});

		if (!outcome.ok) {
			return {
				ok: false,
				message: outcome.error.message,
				response: ApiResponse.error(
					outcome.error.message,
					statusForCommitError(outcome.error.code),
					outcome.error.code
				)
			};
		}

		const payload: DecisionPayload = {
			result: outcome.result
		};
		payload.item = await syncResultItem(admin as any, item, action, payload);
		return { ok: true, payload };
	}

	if (item.source_type === 'project_suggestion') {
		if (!PROJECT_LOOPS_ENABLED) {
			return {
				ok: false,
				message: 'Inbox item not found',
				response: ApiResponse.notFound('Inbox item')
			};
		}
		if (!item.project_id) {
			return {
				ok: false,
				message: 'Project suggestion is missing project_id',
				response: ApiResponse.badRequest('Project suggestion is missing project_id')
			};
		}

		const access = await requireProjectMemberAccess({
			locals,
			user,
			projectId: item.project_id,
			requiredAccess: 'write'
		});
		if (!access.ok) {
			return { ok: false, message: 'Project access denied', response: access.response };
		}

		const clarification =
			typeof body.clarification === 'string' && body.clarification.trim()
				? body.clarification
				: null;
		const suggestionAction = action === 'approve' ? 'approve' : 'dismiss';
		const outcome = clarification
			? await decideProjectSuggestionWithClarification({
					supabase: locals.supabase as any,
					userId: user.id,
					projectId: access.projectId,
					suggestionId: item.source_ref_id,
					action: suggestionAction,
					clarification,
					reason: typeof body.reason === 'string' ? body.reason : undefined
				})
			: await decideProjectSuggestion({
					supabase: locals.supabase as any,
					userId: user.id,
					projectId: access.projectId,
					suggestionId: item.source_ref_id,
					action: suggestionAction,
					fetchFn,
					feedback: {
						reason: typeof body.reason === 'string' ? body.reason : undefined,
						note: typeof body.note === 'string' ? body.note : undefined
					}
				});
		if (!outcome.ok) {
			return {
				ok: false,
				message: outcome.message,
				response: ApiResponse.error(outcome.message, outcome.status)
			};
		}
		const extendedOutcome = outcome as typeof outcome & {
			agentRun?: Record<string, unknown>;
			agent_run_id?: string;
			delegated?: boolean;
			degraded?: boolean;
		};

		const payload: DecisionPayload = {
			suggestion: outcome.suggestion,
			result: outcome.result,
			agentRun: extendedOutcome.agentRun,
			agent_run_id: extendedOutcome.agent_run_id,
			delegated: extendedOutcome.delegated ?? false,
			degraded: extendedOutcome.degraded ?? false,
			alreadyDecided: outcome.alreadyDecided ?? false,
			superseded: outcome.superseded ?? false
		};
		payload.item = await syncResultItem(admin as any, item, action, payload);
		return { ok: true, payload };
	}

	if (item.source_type === 'calendar_suggestion') {
		const service = CalendarAnalysisService.getInstance(locals.supabase as any);
		const result =
			action === 'approve'
				? await service.acceptSuggestion(
						item.source_ref_id,
						user.id,
						body.modifications as any
					)
				: await service.rejectSuggestion(
						item.source_ref_id,
						user.id,
						typeof body.reason === 'string' ? body.reason : undefined
					);

		if (!result.success) {
			const message = result.errors?.[0] ?? 'Failed to process suggestion';
			return {
				ok: false,
				message,
				response: ApiResponse.badRequest(message)
			};
		}

		const payload: DecisionPayload = {
			result: result.data ?? null
		};
		payload.item = await syncResultItem(admin as any, item, action, payload);
		return { ok: true, payload };
	}

	return {
		ok: false,
		message: 'Inbox source does not support unified decisions yet',
		response: ApiResponse.error(
			'Inbox source does not support unified decisions yet',
			HttpStatus.UNPROCESSABLE_ENTITY,
			'UNSUPPORTED_INBOX_SOURCE'
		)
	};
}

export const POST: RequestHandler = async ({ request, locals, fetch }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized();

	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object') {
		return ApiResponse.badRequest('Invalid JSON body');
	}

	const action = normalizeAction((body as { action?: unknown }).action);
	if (!action) {
		return ApiResponse.badRequest("action must be 'approve', 'reject', or 'snooze'");
	}

	const sourceTypeParam = (body as { source_type?: unknown }).source_type;
	const sourceType =
		typeof sourceTypeParam === 'string' && isInboxSourceType(sourceTypeParam)
			? sourceTypeParam
			: null;
	if (sourceTypeParam && !sourceType) {
		return ApiResponse.badRequest('Invalid source_type');
	}

	const admin = createAdminSupabaseClient();
	const bodyRecord = body as Record<string, unknown>;
	const itemIds = Array.isArray(bodyRecord.item_ids)
		? bodyRecord.item_ids.filter((id): id is string => typeof id === 'string')
		: [];

	if (itemIds.length > 0) {
		const results: Array<Record<string, unknown>> = [];
		const errors: Array<{ item_id: string; message: string }> = [];

		for (const itemId of [...new Set(itemIds)].slice(0, 50)) {
			let item: InboxIndexRow | null;
			try {
				item = await loadInboxItem({
					supabase: locals.supabase as any,
					itemId,
					sourceType: null,
					sourceRefId: null
				});
			} catch (error) {
				errors.push({
					item_id: itemId,
					message: error instanceof Error ? error.message : 'Failed to load inbox item'
				});
				continue;
			}

			if (!item) {
				errors.push({ item_id: itemId, message: 'Inbox item not found' });
				continue;
			}

			const result = await decideLoadedInboxItem({
				item,
				action,
				body: bodyRecord,
				locals,
				user,
				admin,
				fetchFn: fetch
			});
			if (result.ok) {
				results.push({ item_id: itemId, ...result.payload });
			} else {
				errors.push({ item_id: itemId, message: result.message });
			}
		}

		return ApiResponse.success({
			results,
			errors,
			applied: results.length,
			failed: errors.length
		});
	}

	let item: InboxIndexRow | null;
	try {
		item = await loadInboxItem({
			supabase: locals.supabase as any,
			itemId: typeof bodyRecord.item_id === 'string' ? (bodyRecord.item_id as string) : null,
			sourceType,
			sourceRefId:
				typeof bodyRecord.source_ref_id === 'string'
					? (bodyRecord.source_ref_id as string)
					: null
		});
	} catch (error) {
		return ApiResponse.databaseError(error);
	}

	if (!item) return ApiResponse.notFound('Inbox item');

	const result = await decideLoadedInboxItem({
		item,
		action,
		body: bodyRecord,
		locals,
		user,
		admin,
		fetchFn: fetch
	});
	return result.ok ? ApiResponse.success(result.payload) : result.response;
};
