import type { Database, JsonObject } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureActorId } from '../ontology/ontology-projects.service';
import { isValidUUID } from '../utils/validation-utils';
import {
	notifyEntityMentionsAdded,
	type EntityMentionNotificationSource
} from './entity-mention-notification.service';

const ALLOWED_ENTITY_TYPES = new Set<EntityMentionPingEntityType>(['task', 'goal', 'document']);
const MAX_MENTIONED_USERS = 25;
const MAX_MESSAGE_SUFFIX_LENGTH = 280;

const ENTITY_TABLE: Record<EntityMentionPingEntityType, string> = {
	task: 'onto_tasks',
	goal: 'onto_goals',
	document: 'onto_documents'
};

const ENTITY_TITLE_COLUMN: Record<EntityMentionPingEntityType, 'title' | 'name'> = {
	task: 'title',
	goal: 'name',
	document: 'title'
};

export type EntityMentionPingEntityType = 'task' | 'goal' | 'document';

export type EntityMentionPingErrorCode =
	| 'invalid_arguments'
	| 'access_denied'
	| 'project_not_found'
	| 'entity_not_found'
	| 'ineligible_recipients'
	| 'database_error'
	| 'delivery_incomplete'
	| 'invalid_response';

export type EntityMentionPingFailureDisposition = 'known_failed' | 'outcome_uncertain';

export class EntityMentionPingServiceError extends Error {
	constructor(
		public readonly code: EntityMentionPingErrorCode,
		public readonly disposition: EntityMentionPingFailureDisposition,
		message: string,
		public readonly causeValue?: unknown
	) {
		super(message);
		this.name = 'EntityMentionPingServiceError';
	}
}

export type EntityMentionPingCaller =
	| {
			kind: 'authenticated';
			userId: string;
			actorDisplayName: string;
	  }
	| {
			kind: 'worker';
			userId: string;
			actorDisplayName?: string;
	  };

export type EntityMentionPingInput = {
	client: SupabaseClient<Database>;
	projectId: string;
	entityType: EntityMentionPingEntityType;
	entityId: string;
	mentionedUserIds: string[];
	messageSuffix?: string | null;
	source: EntityMentionNotificationSource;
	caller: EntityMentionPingCaller;
};

export type EntityMentionPingResult = {
	project_id: string;
	entity_type: EntityMentionPingEntityType;
	entity_id: string;
	mentioned_user_ids: string[];
	notified_user_ids: string[];
};

/**
 * Validate access and entity scope, then make exactly one notification fan-out
 * attempt. Notification rows are not idempotent or transactional across
 * recipients, so any thrown, partial, or malformed delivery result is reported
 * as outcome_uncertain and must never be retried automatically by a caller.
 */
export async function pingOntoEntity(
	input: EntityMentionPingInput
): Promise<EntityMentionPingResult> {
	const projectId = requiredText(input.projectId, 'projectId');
	const entityId = requiredText(input.entityId, 'entityId');
	if (!ALLOWED_ENTITY_TYPES.has(input.entityType)) {
		throw knownError('invalid_arguments', 'entityType must be task, goal, or document');
	}
	const mentionedUserIds = normalizeMentionedUserIds(input.mentionedUserIds);
	const messageSuffix = normalizeMessageSuffix(input.messageSuffix);
	const client = input.client;
	const sb = client as any;

	let actorId: string;
	try {
		actorId = await ensureActorId(client as never, input.caller.userId);
	} catch (error) {
		throw knownError('database_error', 'Failed to resolve ontology actor', error);
	}

	const accessResponse = await knownDatabaseStep('Failed to check project access', () =>
		input.caller.kind === 'worker'
			? client.rpc('actor_has_project_member_access', {
					p_actor_id: actorId,
					p_project_id: projectId,
					p_required_access: 'write'
				})
			: client.rpc('current_actor_has_project_member_access', {
					p_project_id: projectId,
					p_required_access: 'write'
				})
	);
	if (accessResponse.error) {
		throw knownError('database_error', 'Failed to check project access', accessResponse.error);
	}
	if (!accessResponse.data) {
		throw knownError(
			'access_denied',
			'You do not have permission to tag members in this project'
		);
	}

	const { data: projectRow, error: projectError } = await knownDatabaseStep<{
		data: { id: string; name: string | null; created_by: string | null } | null;
		error: unknown;
	}>('Failed to load project', () =>
		sb
			.from('onto_projects')
			.select('id, name, created_by')
			.eq('id', projectId)
			.is('deleted_at', null)
			.maybeSingle()
	);
	if (projectError) {
		throw knownError('database_error', 'Failed to load project', projectError);
	}
	if (!projectRow) {
		throw knownError('project_not_found', 'Project not found');
	}

	const titleColumn = ENTITY_TITLE_COLUMN[input.entityType];
	const { data: entityRow, error: entityError } = await knownDatabaseStep<{
		data: Record<string, string | null> | null;
		error: unknown;
	}>(`Failed to load ${input.entityType}`, () =>
		sb
			.from(ENTITY_TABLE[input.entityType])
			.select(`id, project_id, ${titleColumn}`)
			.eq('id', entityId)
			.eq('project_id', projectId)
			.is('deleted_at', null)
			.maybeSingle()
	);
	if (entityError) {
		throw knownError('database_error', `Failed to load ${input.entityType}`, entityError);
	}
	if (!entityRow) {
		throw knownError('entity_not_found', `${capitalize(input.entityType)} not found`);
	}

	const { eligibleUserIds, ineligibleUserIds } = await knownDatabaseStep(
		'Failed to resolve active project members',
		() =>
			resolveEligibleUserIdsStrict({
				client,
				projectId,
				projectOwnerActorId: projectRow.created_by,
				candidateUserIds: mentionedUserIds
			})
	);
	if (ineligibleUserIds.length > 0) {
		throw knownError(
			'ineligible_recipients',
			`mentioned_user_ids must be active project members: ${ineligibleUserIds.join(', ')}`
		);
	}

	let notificationResult: unknown;
	try {
		notificationResult = await notifyEntityMentionsAdded({
			supabase: client,
			projectId,
			projectName: projectRow.name,
			entityType: input.entityType,
			entityId,
			entityTitle: entityRow[titleColumn] ?? null,
			actorUserId: input.caller.userId,
			actorDisplayName: input.caller.actorDisplayName?.trim() || 'BuildOS agent',
			mentionedUserIds: eligibleUserIds,
			source: input.source,
			messageSuffix
		});
	} catch (error) {
		throw uncertainError(
			'delivery_incomplete',
			'Mention notification outcome is uncertain',
			error
		);
	}

	if (!isRecord(notificationResult) || !isStringArray(notificationResult.notifiedUserIds)) {
		throw uncertainError(
			'invalid_response',
			'Mention notification returned an invalid receipt'
		);
	}
	const expectedNotifiedUserIds = eligibleUserIds.filter(
		(userId) => userId !== input.caller.userId
	);
	if (!sameOrderedStrings(notificationResult.notifiedUserIds, expectedNotifiedUserIds)) {
		throw uncertainError('delivery_incomplete', 'Mention notification delivery was incomplete');
	}

	return {
		project_id: projectId,
		entity_type: input.entityType,
		entity_id: entityId,
		mentioned_user_ids: eligibleUserIds,
		notified_user_ids: notificationResult.notifiedUserIds
	};
}

export function buildEntityMentionPingToolResult(result: EntityMentionPingResult): JsonObject {
	const notifiedCount = result.notified_user_ids.length;
	return {
		...result,
		message: `Tagged ${notifiedCount} collaborator${notifiedCount === 1 ? '' : 's'} on the ${result.entity_type}.`
	};
}

async function resolveEligibleUserIdsStrict(input: {
	client: SupabaseClient<Database>;
	projectId: string;
	projectOwnerActorId: string | null;
	candidateUserIds: string[];
}): Promise<{ eligibleUserIds: string[]; ineligibleUserIds: string[] }> {
	const sb = input.client as any;
	const { data: actorRows, error: actorError } = await sb
		.from('onto_actors')
		.select('id, user_id')
		.in('user_id', input.candidateUserIds);
	if (actorError) {
		throw knownError('database_error', 'Failed to resolve mentioned users', actorError);
	}

	const actorIds = (actorRows ?? []).map((row: { id: string }) => row.id);
	let memberRows: Array<{ actor_id: string }> = [];
	if (actorIds.length > 0) {
		const memberResponse = await sb
			.from('onto_project_members')
			.select('actor_id')
			.eq('project_id', input.projectId)
			.is('removed_at', null)
			.in('actor_id', actorIds);
		if (memberResponse.error) {
			throw knownError(
				'database_error',
				'Failed to resolve active project members',
				memberResponse.error
			);
		}
		memberRows = memberResponse.data ?? [];
	}

	const allowedActorIds = new Set(memberRows.map((row) => row.actor_id));
	if (input.projectOwnerActorId) allowedActorIds.add(input.projectOwnerActorId);
	const allowedUserIds = new Set<string>(
		(actorRows ?? [])
			.filter(
				(row: { id: string; user_id: string | null }) =>
					row.user_id && allowedActorIds.has(row.id)
			)
			.map((row: { user_id: string }) => row.user_id)
	);

	return {
		eligibleUserIds: input.candidateUserIds.filter((userId) => allowedUserIds.has(userId)),
		ineligibleUserIds: input.candidateUserIds.filter((userId) => !allowedUserIds.has(userId))
	};
}

function normalizeMentionedUserIds(value: unknown): string[] {
	if (!Array.isArray(value)) {
		throw knownError('invalid_arguments', 'mentionedUserIds must be an array of user UUIDs');
	}
	const normalized: string[] = [];
	const seen = new Set<string>();
	for (const candidate of value) {
		if (typeof candidate !== 'string' || !isValidUUID(candidate.trim())) {
			throw knownError('invalid_arguments', 'mentionedUserIds must contain only user UUIDs');
		}
		const userId = candidate.trim();
		if (!seen.has(userId)) {
			seen.add(userId);
			normalized.push(userId);
		}
	}
	if (normalized.length === 0) {
		throw knownError('invalid_arguments', 'mentionedUserIds cannot be empty');
	}
	if (normalized.length > MAX_MENTIONED_USERS) {
		throw knownError(
			'invalid_arguments',
			`mentionedUserIds supports at most ${MAX_MENTIONED_USERS} recipients`
		);
	}
	return normalized;
}

function normalizeMessageSuffix(value: unknown): string | null {
	if (value === undefined || value === null) return null;
	if (typeof value !== 'string') {
		throw knownError('invalid_arguments', 'messageSuffix must be a string');
	}
	const normalized = value.trim().slice(0, MAX_MESSAGE_SUFFIX_LENGTH);
	return normalized.length > 0 ? normalized : null;
}

function requiredText(value: unknown, label: string): string {
	if (typeof value !== 'string' || value.trim().length === 0) {
		throw knownError('invalid_arguments', `${label} is required`);
	}
	return value.trim();
}

function knownError(
	code: EntityMentionPingErrorCode,
	message: string,
	causeValue?: unknown
): EntityMentionPingServiceError {
	return new EntityMentionPingServiceError(code, 'known_failed', message, causeValue);
}

function uncertainError(
	code: EntityMentionPingErrorCode,
	message: string,
	causeValue?: unknown
): EntityMentionPingServiceError {
	return new EntityMentionPingServiceError(code, 'outcome_uncertain', message, causeValue);
}

async function knownDatabaseStep<T>(message: string, run: () => PromiseLike<T>): Promise<T> {
	try {
		return await run();
	} catch (error) {
		if (error instanceof EntityMentionPingServiceError) throw error;
		throw knownError('database_error', message, error);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function sameOrderedStrings(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function capitalize(value: string): string {
	return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
