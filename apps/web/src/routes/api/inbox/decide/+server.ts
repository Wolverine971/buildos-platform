// apps/web/src/routes/api/inbox/decide/+server.ts
import type { RequestHandler } from './$types';
import { PROJECT_LOOPS_ENABLED } from '$lib/config/project-loops';
import { CalendarAnalysisService } from '$lib/services/calendar-analysis.service';
import { decideProjectSuggestion } from '$lib/server/project-suggestion-actions.service';
import { requireProjectMemberAccess } from '$lib/server/ontology-project-access';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';
import { isInboxSourceType } from '$lib/server/inbox.service';
import { commitChangeSet, syncInboxItemForSource } from '@buildos/shared-agent-ops';
import type { ChangeSetDecision } from '@buildos/shared-types';
import type { InboxIndexRow, InboxSourceType } from '@buildos/shared-agent-ops';

type DecisionAction = 'approve' | 'reject';

function normalizeAction(value: unknown): DecisionAction | null {
	if (value === 'approve' || value === 'accept' || value === 'apply') return 'approve';
	if (value === 'reject' || value === 'dismiss' || value === 'decline') return 'reject';
	return null;
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

async function syncResultItem(admin: any, item: InboxIndexRow): Promise<InboxIndexRow> {
	const repaired = await syncInboxItemForSource({
		supabase: admin,
		sourceType: item.source_type,
		sourceRefId: item.source_ref_id
	});
	return repaired ?? item;
}

function statusForCommitError(code: string): number {
	if (code === 'NOT_FOUND') return HttpStatus.NOT_FOUND;
	if (code === 'CONFLICT') return HttpStatus.CONFLICT;
	if (code === 'VALIDATION_ERROR') return HttpStatus.BAD_REQUEST;
	return HttpStatus.INTERNAL_SERVER_ERROR;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized();

	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object') {
		return ApiResponse.badRequest('Invalid JSON body');
	}

	const action = normalizeAction((body as { action?: unknown }).action);
	if (!action) {
		return ApiResponse.badRequest("action must be 'approve' or 'reject'");
	}

	const sourceTypeParam = (body as { source_type?: unknown }).source_type;
	const sourceType =
		typeof sourceTypeParam === 'string' && isInboxSourceType(sourceTypeParam)
			? sourceTypeParam
			: null;
	if (sourceTypeParam && !sourceType) {
		return ApiResponse.badRequest('Invalid source_type');
	}

	let item: InboxIndexRow | null;
	try {
		item = await loadInboxItem({
			supabase: locals.supabase as any,
			itemId:
				typeof (body as { item_id?: unknown }).item_id === 'string'
					? (body as { item_id: string }).item_id
					: null,
			sourceType,
			sourceRefId:
				typeof (body as { source_ref_id?: unknown }).source_ref_id === 'string'
					? (body as { source_ref_id: string }).source_ref_id
					: null
		});
	} catch (error) {
		return ApiResponse.databaseError(error);
	}

	if (!item) return ApiResponse.notFound('Inbox item');

	const admin = createAdminSupabaseClient();

	if (item.source_type === 'agent_run') {
		const defaultDecision: 'approved' | 'rejected' =
			action === 'reject'
				? 'rejected'
				: (body as { default_decision?: unknown }).default_decision === 'rejected'
					? 'rejected'
					: 'approved';
		const outcome = await commitChangeSet({
			admin,
			runId: item.source_ref_id,
			userId: user.id,
			decisions:
				action === 'reject'
					? []
					: parseDecisions((body as { decisions?: unknown }).decisions),
			defaultDecision
		});

		if (!outcome.ok) {
			return ApiResponse.error(
				outcome.error.message,
				statusForCommitError(outcome.error.code),
				outcome.error.code
			);
		}

		return ApiResponse.success({
			item: await syncResultItem(admin as any, item),
			result: outcome.result
		});
	}

	if (item.source_type === 'project_suggestion') {
		if (!PROJECT_LOOPS_ENABLED) return ApiResponse.notFound('Inbox item');
		if (!item.project_id)
			return ApiResponse.badRequest('Project suggestion is missing project_id');

		const access = await requireProjectMemberAccess({
			locals,
			user,
			projectId: item.project_id,
			requiredAccess: 'write'
		});
		if (!access.ok) return access.response;

		const outcome = await decideProjectSuggestion({
			supabase: locals.supabase as any,
			userId: user.id,
			projectId: access.projectId,
			suggestionId: item.source_ref_id,
			action: action === 'approve' ? 'approve' : 'dismiss'
		});
		if (!outcome.ok) {
			return ApiResponse.error(outcome.message, outcome.status);
		}

		return ApiResponse.success({
			item: await syncResultItem(admin as any, item),
			suggestion: outcome.suggestion,
			result: outcome.result,
			alreadyDecided: outcome.alreadyDecided ?? false
		});
	}

	if (item.source_type === 'calendar_suggestion') {
		const service = CalendarAnalysisService.getInstance(locals.supabase as any);
		const result =
			action === 'approve'
				? await service.acceptSuggestion(
						item.source_ref_id,
						user.id,
						(body as { modifications?: unknown }).modifications as any
					)
				: await service.rejectSuggestion(
						item.source_ref_id,
						user.id,
						typeof (body as { reason?: unknown }).reason === 'string'
							? (body as { reason: string }).reason
							: undefined
					);

		if (!result.success) {
			return ApiResponse.badRequest(result.errors?.[0] ?? 'Failed to process suggestion');
		}

		return ApiResponse.success({
			item: await syncResultItem(admin as any, item),
			result: result.data ?? null
		});
	}

	return ApiResponse.error(
		'Inbox source does not support unified decisions yet',
		HttpStatus.UNPROCESSABLE_ENTITY,
		'UNSUPPORTED_INBOX_SOURCE'
	);
};
