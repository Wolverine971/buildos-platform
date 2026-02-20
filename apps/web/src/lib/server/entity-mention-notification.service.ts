// apps/web/src/lib/server/entity-mention-notification.service.ts
import { parseEntityReferences } from '$lib/utils/entity-reference-parser';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { createTrackedInAppNotification } from './tracked-in-app-notification.service';

type SupabaseClient = App.Locals['supabase'];

const ENTITY_LABELS: Record<string, string> = {
	task: 'task',
	goal: 'goal',
	document: 'document'
};

const DEFAULT_PROJECT_LABEL = 'your project';
const MAX_MENTION_NOTIFICATION_SUFFIX = 280;

export type EntityMentionNotificationSource = 'mention' | 'manual_ping' | 'agent_ping';

function parseMentionedUserIds(textValues: Array<string | null | undefined>): Set<string> {
	const mentionedUserIds = new Set<string>();

	for (const rawValue of textValues) {
		if (typeof rawValue !== 'string' || rawValue.length === 0) continue;
		const parsed = parseEntityReferences(rawValue);
		for (const entity of parsed.entities) {
			if (entity.type !== 'user') continue;
			if (!isValidUUID(entity.id)) continue;
			mentionedUserIds.add(entity.id);
		}
	}

	return mentionedUserIds;
}

function getEntityActionUrl(entityType: string, projectId: string, entityId: string): string {
	if (entityType === 'task') {
		return `/projects/${projectId}/tasks/${entityId}`;
	}
	return `/projects/${projectId}`;
}

function getEntityLabel(entityType: string): string {
	return ENTITY_LABELS[entityType] ?? 'item';
}

export async function resolveEligibleProjectMentionUserIds({
	supabase,
	projectId,
	projectOwnerActorId,
	candidateUserIds
}: {
	supabase: SupabaseClient;
	projectId: string;
	projectOwnerActorId?: string | null;
	candidateUserIds: string[];
}): Promise<{ eligibleUserIds: string[]; ineligibleUserIds: string[] }> {
	if (candidateUserIds.length === 0) {
		return { eligibleUserIds: [], ineligibleUserIds: [] };
	}

	let ownerActorId = projectOwnerActorId ?? null;
	if (!ownerActorId) {
		const { data: projectRow, error: projectError } = await supabase
			.from('onto_projects')
			.select('created_by')
			.eq('id', projectId)
			.is('deleted_at', null)
			.maybeSingle();

		if (projectError || !projectRow) {
			return { eligibleUserIds: [], ineligibleUserIds: candidateUserIds };
		}
		ownerActorId = projectRow.created_by;
	}

	const { data: actorRows, error: actorError } = await supabase
		.from('onto_actors')
		.select('id, user_id')
		.in('user_id', candidateUserIds);

	if (actorError || !actorRows || actorRows.length === 0) {
		return { eligibleUserIds: [], ineligibleUserIds: candidateUserIds };
	}

	const actorIds = actorRows.map((row) => row.id);
	const { data: memberRows, error: memberError } = await supabase
		.from('onto_project_members')
		.select('actor_id')
		.eq('project_id', projectId)
		.is('removed_at', null)
		.in('actor_id', actorIds);

	if (memberError) {
		return { eligibleUserIds: [], ineligibleUserIds: candidateUserIds };
	}

	const allowedActorIds = new Set<string>((memberRows ?? []).map((row) => row.actor_id));
	if (ownerActorId) {
		allowedActorIds.add(ownerActorId);
	}

	const allowedUserIds = new Set<string>(
		actorRows
			.filter((row) => row.user_id && allowedActorIds.has(row.id))
			.map((row) => row.user_id as string)
	);

	const eligibleUserIds: string[] = [];
	const ineligibleUserIds: string[] = [];
	for (const userId of candidateUserIds) {
		if (allowedUserIds.has(userId)) {
			eligibleUserIds.push(userId);
		} else {
			ineligibleUserIds.push(userId);
		}
	}

	return {
		eligibleUserIds: Array.from(new Set(eligibleUserIds)),
		ineligibleUserIds: Array.from(new Set(ineligibleUserIds))
	};
}

export async function resolveEntityMentionUserIds({
	supabase,
	projectId,
	projectOwnerActorId,
	actorUserId,
	nextTextValues,
	previousTextValues
}: {
	supabase: SupabaseClient;
	projectId: string;
	projectOwnerActorId?: string | null;
	actorUserId: string;
	nextTextValues: Array<string | null | undefined>;
	previousTextValues?: Array<string | null | undefined>;
}): Promise<string[]> {
	const nextMentionedUserIds = parseMentionedUserIds(nextTextValues);
	const previousMentionedUserIds = parseMentionedUserIds(previousTextValues ?? []);

	const candidateUserIds = Array.from(nextMentionedUserIds).filter(
		(userId) => userId !== actorUserId && !previousMentionedUserIds.has(userId)
	);
	if (candidateUserIds.length === 0) {
		return [];
	}

	const { eligibleUserIds } = await resolveEligibleProjectMentionUserIds({
		supabase,
		projectId,
		projectOwnerActorId,
		candidateUserIds
	});

	return eligibleUserIds;
}

export async function notifyEntityMentionsAdded({
	supabase,
	projectId,
	projectName,
	entityType,
	entityId,
	entityTitle,
	actorUserId,
	actorDisplayName,
	mentionedUserIds,
	skipUserIds = [],
	source = 'mention',
	messageSuffix
}: {
	supabase: SupabaseClient;
	projectId: string;
	projectName?: string | null;
	entityType: string;
	entityId: string;
	entityTitle?: string | null;
	actorUserId: string;
	actorDisplayName: string;
	mentionedUserIds: string[];
	skipUserIds?: string[];
	source?: EntityMentionNotificationSource;
	messageSuffix?: string | null;
}): Promise<{ notifiedUserIds: string[] }> {
	if (mentionedUserIds.length === 0) {
		return { notifiedUserIds: [] };
	}

	const skipSet = new Set<string>([actorUserId, ...skipUserIds]);
	const recipients = Array.from(new Set(mentionedUserIds)).filter(
		(userId) => !skipSet.has(userId)
	);
	if (recipients.length === 0) {
		return { notifiedUserIds: [] };
	}

	const projectLabel = projectName || DEFAULT_PROJECT_LABEL;
	const entityLabel = getEntityLabel(entityType);
	const actorLabel = actorDisplayName || 'A teammate';
	const actionUrl = getEntityActionUrl(entityType, projectId, entityId);
	const defaultMessage = `${actorLabel} tagged you in a ${entityLabel} in ${projectLabel}.`;
	const normalizedSuffix =
		typeof messageSuffix === 'string'
			? messageSuffix.trim().slice(0, MAX_MENTION_NOTIFICATION_SUFFIX)
			: '';
	const message = normalizedSuffix ? `${defaultMessage} ${normalizedSuffix}` : defaultMessage;

	const results = await Promise.all(
		recipients.map((userId) =>
			createTrackedInAppNotification({
				supabase,
				recipientUserId: userId,
				eventType: 'entity.tagged',
				actorUserId,
				eventSource: 'api_action',
				type: 'entity_tagged',
				title: 'You were tagged',
				message,
				actionUrl,
				payload: {
					project_id: projectId,
					project_name: projectName ?? null,
					entity_type: entityType,
					entity_id: entityId,
					entity_title: entityTitle ?? null,
					actor_user_id: actorUserId,
					source
				},
				data: {
					project_id: projectId,
					entity_type: entityType,
					entity_id: entityId,
					entity_title: entityTitle ?? null,
					actor_user_id: actorUserId,
					coalesced_from_assignment: false,
					source,
					...(normalizedSuffix ? { message_suffix: normalizedSuffix } : {})
				}
			})
		)
	);

	const failed = results.filter((result) => !result.success);
	if (failed.length > 0) {
		console.error('[Entity Mentions] Failed to create mention notifications:', failed);
		return { notifiedUserIds: [] };
	}

	return { notifiedUserIds: recipients };
}
