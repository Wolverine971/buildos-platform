import type { RequestHandler } from './$types';
import { z } from 'zod';
import { ApiResponse } from '$lib/utils/api-response';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { getChangeSourceFromRequest } from '$lib/services/async-activity-logger';
import {
	EntityMentionPingServiceError,
	pingOntoEntity,
	type EntityMentionPingEntityType
} from '$lib/server/entity-mention-ping.service';
import { parseJsonRequest } from '$lib/utils/request-validation';
import { logOntologyApiError } from '../../shared/error-logging';

const ALLOWED_ENTITY_TYPES = new Set<string>(['task', 'goal', 'document']);
const MAX_MENTIONED_USERS = 25;
const MAX_MESSAGE_SUFFIX_LENGTH = 280;

const mentionPingSchema = z
	.object({
		project_id: z.string().min(1),
		entity_type: z.string().min(1),
		entity_id: z.string().min(1),
		message: z.string().optional(),
		mentioned_user_ids: z.array(z.string())
	})
	.strict();

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
	let projectId: string | undefined;
	let entityType: EntityMentionPingEntityType | undefined;
	let entityId: string | undefined;

	try {
		const parsed = await parseJsonRequest(request, mentionPingSchema);
		if (!parsed.ok) return parsed.response;
		const body = parsed.data;
		projectId = body.project_id.trim();
		const normalizedEntityType = body.entity_type.trim().toLowerCase();
		entityId = body.entity_id.trim();
		const messageSuffix = body.message?.trim().slice(0, MAX_MESSAGE_SUFFIX_LENGTH) || null;
		const mentionedUserIds = normalizeMentionedUserIds(body.mentioned_user_ids);

		if (!projectId || !entityId || !ALLOWED_ENTITY_TYPES.has(normalizedEntityType)) {
			return ApiResponse.badRequest(
				'project_id, entity_type (task|goal|document), and entity_id are required'
			);
		}
		entityType = normalizedEntityType as EntityMentionPingEntityType;
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

		const result = await pingOntoEntity({
			client: supabase,
			projectId,
			entityType,
			entityId,
			mentionedUserIds,
			messageSuffix,
			source: getChangeSourceFromRequest(request) === 'chat' ? 'agent_ping' : 'manual_ping',
			caller: {
				kind: 'authenticated',
				userId: user.id,
				actorDisplayName: getActorDisplayName({ name: user.name, email: user.email })
			}
		});

		return ApiResponse.success(result);
	} catch (error) {
		if (error instanceof EntityMentionPingServiceError) {
			if (error.code === 'invalid_arguments' || error.code === 'ineligible_recipients') {
				return ApiResponse.badRequest(error.message);
			}
			if (error.code === 'access_denied') return ApiResponse.forbidden(error.message);
			if (error.code === 'project_not_found') return ApiResponse.notFound('Project');
			if (error.code === 'entity_not_found') return ApiResponse.notFound(entityType);

			await logOntologyApiError({
				supabase,
				error: error.causeValue ?? error,
				endpoint: '/api/onto/mentions/ping',
				method: 'POST',
				userId: user.id,
				projectId,
				entityType,
				entityId,
				operation: `mention_ping_${error.code}`
			});
			if (error.code === 'database_error') {
				return ApiResponse.databaseError(error.causeValue ?? error);
			}
			return ApiResponse.internalError(error, 'Failed to ping mentions');
		}

		console.error('[Mention Ping API] Failed to ping mentions:', error);
		return ApiResponse.internalError(error, 'Failed to ping mentions');
	}
};
