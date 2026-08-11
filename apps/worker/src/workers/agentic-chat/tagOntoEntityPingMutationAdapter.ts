import {
	type EntityMentionPingInput,
	type EntityMentionPingResult,
	EntityMentionPingServiceError,
	buildEntityMentionPingToolResult,
	pingOntoEntity
} from '@buildos/shared-agent-ops/ops/entity-mention-ping.service';
import { type Database, type JsonObject } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgenticChatFixtureMutatingToolPortV1 } from './fixtureMutationExecutor';
import {
	type MutationInput,
	assertMutationAdapterBoundary,
	assertMutationReceiptSize,
	canonicalGatewayError,
	canonicalMutationReceipt,
	canonicalUuid,
	isRecord,
	knownFailure,
	requestProjectId,
	requiredUuid,
	uncertainFailure
} from './mutationAdapterBoundary';
import { AGENTIC_CHAT_REVIEWED_MUTATION_SPECS_V1 } from './mutationToolCatalog';

const TOOL_NAME = 'tag_onto_entity';
const MUTATION_SPEC = AGENTIC_CHAT_REVIEWED_MUTATION_SPECS_V1[TOOL_NAME];
const REVIEWED_ARGUMENT_NAMES = new Set(MUTATION_SPEC.reviewedArgumentNames);
const ALLOWED_ENTITY_TYPES = new Set(['task', 'goal', 'document']);
const MAX_MENTIONED_USERS = 25;
const MAX_MESSAGE_SUFFIX_LENGTH = 280;

type EntityMentionPingRunner = (input: EntityMentionPingInput) => Promise<EntityMentionPingResult>;

/**
 * One-attempt adapter for explicit notification-only tags. Content mutation and
 * handle resolution remain web-owned; notification fan-out has no stable
 * idempotency key, so ambiguous delivery is never retried automatically.
 */
export class AgenticChatTagOntoEntityPingMutationAdapter
	implements AgenticChatFixtureMutatingToolPortV1
{
	private readonly pingEntity: EntityMentionPingRunner;

	constructor(
		private readonly client: SupabaseClient<Database>,
		options: { pingEntity?: EntityMentionPingRunner } = {}
	) {
		this.pingEntity = options.pingEntity ?? pingOntoEntity;
	}

	async execute(input: MutationInput): Promise<JsonObject> {
		assertMutationAdapterBoundary(input, {
			toolName: TOOL_NAME,
			operationName: MUTATION_SPEC.operationName,
			downstreamIdempotencySupported: MUTATION_SPEC.downstreamIdempotencySupported,
			reviewedArgumentNames: REVIEWED_ARGUMENT_NAMES
		});

		const projectId = requiredUuid(input.arguments.project_id, 'project_id');
		const contextProjectId = requestProjectId(input);
		if (contextProjectId !== null && contextProjectId !== projectId) {
			throw knownFailure(
				'mutation_project_scope_mismatch',
				'tag_onto_entity project_id must match the admitted project context'
			);
		}
		if (input.arguments.mode !== 'ping') {
			throw knownFailure(
				'mutation_arguments_not_admitted',
				'tag_onto_entity requires explicit mode "ping" in the worker'
			);
		}
		const entityType = requiredEntityType(input.arguments.entity_type);
		const entityId = requiredUuid(input.arguments.entity_id, 'entity_id');
		const mentionedUserIds = requiredMentionedUserIds(input.arguments.mentioned_user_ids);
		const messageSuffix = optionalMessageSuffix(input.arguments.message);

		let result: EntityMentionPingResult;
		try {
			result = await this.pingEntity({
				client: this.client,
				projectId,
				entityType,
				entityId,
				mentionedUserIds,
				messageSuffix,
				source: 'agent_ping',
				caller: {
					kind: 'worker',
					userId: input.executionInput.claim.userId,
					actorDisplayName: 'BuildOS agent'
				}
			});
		} catch (error) {
			if (error instanceof EntityMentionPingServiceError) {
				if (error.disposition === 'known_failed') {
					throw knownFailure(`${TOOL_NAME}_${error.code}`, error.message);
				}
				throw uncertainFailure(`${TOOL_NAME}_${error.code}`, error.message);
			}
			throw uncertainFailure(
				`${TOOL_NAME}_outcome_uncertain`,
				canonicalGatewayError(error, TOOL_NAME)
			);
		}

		assertPingResult(result, {
			projectId,
			entityType,
			entityId,
			mentionedUserIds,
			actorUserId: input.executionInput.claim.userId
		});
		const receipt = canonicalMutationReceipt(
			buildEntityMentionPingToolResult(result),
			TOOL_NAME
		);
		assertMutationReceiptSize(receipt, TOOL_NAME);
		return receipt;
	}
}

function requiredEntityType(value: unknown): 'task' | 'goal' | 'document' {
	if (typeof value !== 'string' || !ALLOWED_ENTITY_TYPES.has(value)) {
		throw knownFailure(
			'mutation_arguments_not_admitted',
			'entity_type must be task, goal, or document'
		);
	}
	return value as 'task' | 'goal' | 'document';
}

function requiredMentionedUserIds(value: unknown): string[] {
	if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MENTIONED_USERS) {
		throw knownFailure(
			'mutation_arguments_not_admitted',
			`mentioned_user_ids must contain 1-${MAX_MENTIONED_USERS} canonical user UUIDs`
		);
	}
	const normalized: string[] = [];
	const seen = new Set<string>();
	for (const userId of value) {
		if (!canonicalUuid(userId) || seen.has(userId)) {
			throw knownFailure(
				'mutation_arguments_not_admitted',
				'mentioned_user_ids must contain unique canonical user UUIDs'
			);
		}
		seen.add(userId);
		normalized.push(userId);
	}
	return normalized;
}

function optionalMessageSuffix(value: unknown): string | null {
	if (value === undefined || value === null) return null;
	if (typeof value !== 'string') {
		throw knownFailure('mutation_arguments_not_admitted', 'message must be a string');
	}
	const normalized = value.trim();
	if (normalized.length === 0) return null;
	if (normalized.length > MAX_MESSAGE_SUFFIX_LENGTH) {
		throw knownFailure(
			'mutation_arguments_not_admitted',
			`message must be at most ${MAX_MESSAGE_SUFFIX_LENGTH} characters`
		);
	}
	return normalized;
}

function assertPingResult(
	result: EntityMentionPingResult,
	expected: {
		projectId: string;
		entityType: 'task' | 'goal' | 'document';
		entityId: string;
		mentionedUserIds: string[];
		actorUserId: string;
	}
): void {
	const expectedNotifiedUserIds = expected.mentionedUserIds.filter(
		(userId) => userId !== expected.actorUserId
	);
	if (
		!isRecord(result) ||
		result.project_id !== expected.projectId ||
		result.entity_type !== expected.entityType ||
		result.entity_id !== expected.entityId ||
		!sameOrderedStrings(result.mentioned_user_ids, expected.mentionedUserIds) ||
		!sameOrderedStrings(result.notified_user_ids, expectedNotifiedUserIds)
	) {
		throw uncertainFailure(
			`${TOOL_NAME}_receipt_invalid`,
			'tag_onto_entity returned a mismatched or malformed receipt'
		);
	}
}

function sameOrderedStrings(value: unknown, expected: readonly string[]): boolean {
	return (
		Array.isArray(value) &&
		value.length === expected.length &&
		value.every((entry, index) => entry === expected[index])
	);
}
