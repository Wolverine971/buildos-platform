// apps/web/src/routes/api/onto/mentions/ping/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';
import { getChangeSourceFromRequest } from '$lib/services/async-activity-logger';
import { logOntologyApiError } from '../../shared/error-logging';
import {
	notifyEntityMentionsAdded,
	resolveEligibleProjectMentionUserIds,
	type EntityMentionNotificationSource
} from '$lib/server/entity-mention-notification.service';

const ALLOWED_ENTITY_TYPES = new Set(['task', 'goal', 'document']);
const MAX_MENTIONED_USERS = 25;
const MAX_MESSAGE_SUFFIX_LENGTH = 280;

const ENTITY_TITLE_COLUMN: Record<string, 'title' | 'name'> = {
	task: 'title',
	goal: 'name',
	document: 'title'
};

function normalizeMentionedUserIds(rawValue: unknown): string[] | null {
	if (!Array.isArray(rawValue)) return null;

	const normalized: string[] = [];
	const seen = new Set<string>();
	for (const value of rawValue) {
		if (typeof value !== 'string') return null;
		const userId = value.trim();
		if (!isValidUUID(userId)) return null;
		if (!seen.has(userId)) {
			seen.add(userId);
			normalized.push(userId);
		}
	}
	return normalized;
}

function getActorDisplayName(user: { name?: string | null; email?: string | null }): string {
	if (typeof user.name === 'string' && user.name.trim().length > 0) {
		return user.name.trim();
	}
	if (typeof user.email === 'string' && user.email.includes('@')) {
		return user.email.split('@')[0] ?? 'A teammate';
	}
	return 'A teammate';
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const supabase = locals.supabase;

	try {
		const body = (await request.json()) as Record<string, unknown>;
		const projectId = typeof body.project_id === 'string' ? body.project_id.trim() : '';
		const entityType =
			typeof body.entity_type === 'string' ? body.entity_type.trim().toLowerCase() : '';
		const entityId = typeof body.entity_id === 'string' ? body.entity_id.trim() : '';
		const rawMessageSuffix = typeof body.message === 'string' ? body.message.trim() : '';
		const messageSuffix = rawMessageSuffix.slice(0, MAX_MESSAGE_SUFFIX_LENGTH);
		const mentionedUserIds = normalizeMentionedUserIds(body.mentioned_user_ids);

		if (!projectId || !entityId || !ALLOWED_ENTITY_TYPES.has(entityType)) {
			return ApiResponse.badRequest(
				'project_id, entity_type (task|goal|document), and entity_id are required'
			);
		}

		if (!mentionedUserIds) {
			return ApiResponse.badRequest('mentioned_user_ids must be an array of user UUIDs');
		}

		if (mentionedUserIds.length === 0) {
			return ApiResponse.badRequest('mentioned_user_ids cannot be empty');
		}

		if (mentionedUserIds.length > MAX_MENTIONED_USERS) {
			return ApiResponse.badRequest(
				`mentioned_user_ids supports at most ${MAX_MENTIONED_USERS} recipients`
			);
		}

		await ensureActorId(supabase, user.id);

		const { data: hasAccess, error: accessError } = await supabase.rpc(
			'current_actor_has_project_access',
			{
				p_project_id: projectId,
				p_required_access: 'write'
			}
		);

		if (accessError) {
			await logOntologyApiError({
				supabase,
				error: accessError,
				endpoint: '/api/onto/mentions/ping',
				method: 'POST',
				userId: user.id,
				projectId,
				entityType: 'project',
				operation: 'mention_ping_access'
			});
			return ApiResponse.internalError(accessError, 'Failed to check project access');
		}

		if (!hasAccess) {
			return ApiResponse.forbidden(
				'You do not have permission to tag members in this project'
			);
		}

		const { data: projectRow, error: projectError } = await supabase
			.from('onto_projects')
			.select('id, name, created_by')
			.eq('id', projectId)
			.is('deleted_at', null)
			.maybeSingle();

		if (projectError) {
			await logOntologyApiError({
				supabase,
				error: projectError,
				endpoint: '/api/onto/mentions/ping',
				method: 'POST',
				userId: user.id,
				projectId,
				entityType: 'project',
				operation: 'mention_ping_project_lookup',
				tableName: 'onto_projects'
			});
			return ApiResponse.databaseError(projectError);
		}

		if (!projectRow) {
			return ApiResponse.notFound('Project');
		}

		const titleColumn = ENTITY_TITLE_COLUMN[entityType];
		const { data: entityRow, error: entityError } = await (supabase as any)
			.from(
				entityType === 'task'
					? 'onto_tasks'
					: entityType === 'goal'
						? 'onto_goals'
						: 'onto_documents'
			)
			.select(`id, project_id, ${titleColumn}`)
			.eq('id', entityId)
			.eq('project_id', projectId)
			.is('deleted_at', null)
			.maybeSingle();

		if (entityError) {
			await logOntologyApiError({
				supabase,
				error: entityError,
				endpoint: '/api/onto/mentions/ping',
				method: 'POST',
				userId: user.id,
				projectId,
				entityType,
				entityId,
				operation: 'mention_ping_entity_lookup'
			});
			return ApiResponse.databaseError(entityError);
		}

		if (!entityRow) {
			return ApiResponse.notFound(entityType);
		}

		const { eligibleUserIds, ineligibleUserIds } = await resolveEligibleProjectMentionUserIds({
			supabase,
			projectId,
			projectOwnerActorId: projectRow.created_by,
			candidateUserIds: mentionedUserIds
		});

		if (ineligibleUserIds.length > 0) {
			return ApiResponse.badRequest(
				`mentioned_user_ids must be active project members: ${ineligibleUserIds.join(', ')}`
			);
		}

		const changeSource = getChangeSourceFromRequest(request);
		const source: EntityMentionNotificationSource =
			changeSource === 'chat' ? 'agent_ping' : 'manual_ping';
		const actorDisplayName = getActorDisplayName({
			name: user.name,
			email: user.email
		});

		const { notifiedUserIds } = await notifyEntityMentionsAdded({
			supabase,
			projectId,
			projectName: projectRow.name,
			entityType,
			entityId,
			entityTitle:
				(titleColumn === 'name'
					? (entityRow as { name?: string | null }).name
					: (entityRow as { title?: string | null }).title) ?? null,
			actorUserId: user.id,
			actorDisplayName,
			mentionedUserIds: eligibleUserIds,
			source,
			messageSuffix: messageSuffix.length > 0 ? messageSuffix : null
		});

		return ApiResponse.success({
			project_id: projectId,
			entity_type: entityType,
			entity_id: entityId,
			mentioned_user_ids: eligibleUserIds,
			notified_user_ids: notifiedUserIds
		});
	} catch (error) {
		console.error('[Mention Ping API] Failed to ping mentions:', error);
		return ApiResponse.internalError(error, 'Failed to ping mentions');
	}
};
