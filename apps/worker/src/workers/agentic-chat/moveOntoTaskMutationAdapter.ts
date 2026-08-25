// apps/worker/src/workers/agentic-chat/moveOntoTaskMutationAdapter.ts
import {
	type AtomicTaskMoveInput,
	type TaskMoveResult,
	TaskMoveServiceError,
	buildTaskMoveToolResult,
	moveOntoTaskAtomic
} from '@buildos/shared-agent-ops/ontology/task-move.service';
import { type Database, type JsonObject } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgenticChatMutatingToolPortV1 } from './mutation-executor';
import {
	type MutationInput,
	assertMutationAdapterBoundary,
	assertMutationReceiptSize,
	canonicalGatewayError,
	canonicalMutationReceipt,
	isRecord,
	knownFailure,
	requestProjectId,
	requiredUuid,
	uncertainFailure
} from './mutationAdapterBoundary';
import { AGENTIC_CHAT_REVIEWED_MUTATION_SPECS_V1 } from './mutationToolCatalog';

const TOOL_NAME = 'move_onto_task';
const MUTATION_SPEC = AGENTIC_CHAT_REVIEWED_MUTATION_SPECS_V1[TOOL_NAME];
const REVIEWED_ARGUMENT_NAMES = new Set(MUTATION_SPEC.reviewedArgumentNames);
const KNOWN_TASK_MOVE_FAILURES = new Set([
	'access_denied',
	'not_found',
	'source_project_mismatch',
	'destination_archived',
	'impact_changed',
	'invalid_arguments'
]);

type TaskMoveRunner = (input: AtomicTaskMoveInput) => Promise<TaskMoveResult>;

/**
 * One-attempt adapter over the authoritative atomic task-move transaction.
 *
 * The destination task row is inspectable after a lost response, but an
 * `already_moved` replay cannot reconstruct the original cleanup impact and
 * applied counts. The adapter therefore does not claim exact downstream
 * idempotency and never retries an ambiguous outcome automatically.
 */
export class AgenticChatMoveOntoTaskMutationAdapter
	implements AgenticChatMutatingToolPortV1
{
	private readonly moveTask: TaskMoveRunner;

	constructor(
		private readonly client: SupabaseClient<Database>,
		options: { moveTask?: TaskMoveRunner } = {}
	) {
		this.moveTask = options.moveTask ?? moveOntoTaskAtomic;
	}

	async execute(input: MutationInput): Promise<JsonObject> {
		assertMutationAdapterBoundary(input, {
			toolName: TOOL_NAME,
			operationName: MUTATION_SPEC.operationName,
			downstreamIdempotencySupported: MUTATION_SPEC.downstreamIdempotencySupported,
			reviewedArgumentNames: REVIEWED_ARGUMENT_NAMES
		});

		const taskId = requiredUuid(input.arguments.task_id, 'task_id');
		const sourceProjectId = requiredUuid(
			input.arguments.expected_source_project_id,
			'expected_source_project_id'
		);
		const destinationProjectId = requiredUuid(
			input.arguments.destination_project_id,
			'destination_project_id'
		);
		if (sourceProjectId === destinationProjectId) {
			throw knownFailure(
				'mutation_scope_invalid',
				'move_onto_task requires different source and destination projects'
			);
		}
		const contextProjectId = requestProjectId(input);
		if (contextProjectId !== null && contextProjectId !== sourceProjectId) {
			throw knownFailure(
				'mutation_project_scope_mismatch',
				'move_onto_task expected_source_project_id must match the admitted project context'
			);
		}
		const confirmationToken = normalizeConfirmationToken(input.arguments.confirmation_token);

		let result: TaskMoveResult;
		try {
			result = await this.moveTask({
				client: this.client,
				taskId,
				expectedSourceProjectId: sourceProjectId,
				destinationProjectId,
				confirmationToken,
				caller: {
					kind: 'worker',
					userId: input.executionInput.claim.userId
				},
				activity: {
					changedBy: input.executionInput.claim.userId,
					changeSource: 'chat',
					chatSessionId: input.executionInput.claim.sessionId
				}
			});
		} catch (error) {
			if (error instanceof TaskMoveServiceError && KNOWN_TASK_MOVE_FAILURES.has(error.code)) {
				throw knownFailure(`${TOOL_NAME}_${error.code}`, error.message);
			}
			throw uncertainFailure(
				`${TOOL_NAME}_outcome_uncertain`,
				canonicalGatewayError(error, TOOL_NAME)
			);
		}

		assertTaskMoveResult(result, {
			taskId,
			sourceProjectId,
			destinationProjectId
		});
		const receipt = canonicalMutationReceipt(buildTaskMoveToolResult(result), TOOL_NAME);
		assertMutationReceiptSize(receipt, TOOL_NAME);
		return receipt;
	}
}

function normalizeConfirmationToken(value: unknown): string | null {
	if (value === undefined || value === null) return null;
	if (
		typeof value !== 'string' ||
		value !== value.trim() ||
		value.length === 0 ||
		value.length > 128
	) {
		throw knownFailure(
			'mutation_arguments_not_admitted',
			'confirmation_token must be a non-empty string of at most 128 characters'
		);
	}
	return value;
}

function assertTaskMoveResult(
	result: TaskMoveResult,
	expected: { taskId: string; sourceProjectId: string; destinationProjectId: string }
): void {
	if (
		!isRecord(result) ||
		!['moved', 'already_moved', 'confirmation_required', 'blocked'].includes(
			String(result.status)
		) ||
		typeof result.requires_user_action !== 'boolean' ||
		!isRecord(result.task) ||
		result.task.id !== expected.taskId ||
		!isRecord(result.source_project) ||
		result.source_project.id !== expected.sourceProjectId ||
		!isRecord(result.destination_project) ||
		result.destination_project.id !== expected.destinationProjectId
	) {
		throw invalidReceipt();
	}

	if (result.status === 'moved') {
		if (
			result.requires_user_action ||
			result.task.project_id !== expected.destinationProjectId ||
			!isRecord(result.task_before) ||
			result.task_before.id !== expected.taskId ||
			result.task_before.project_id !== expected.sourceProjectId ||
			!isRecord(result.impact) ||
			!isRecord(result.applied)
		) {
			throw invalidReceipt();
		}
		return;
	}
	if (result.status === 'already_moved') {
		if (
			result.requires_user_action ||
			result.task.project_id !== expected.destinationProjectId
		) {
			throw invalidReceipt();
		}
		return;
	}
	if (
		!result.requires_user_action ||
		result.task.project_id !== expected.sourceProjectId ||
		!isRecord(result.impact)
	) {
		throw invalidReceipt();
	}
	if (
		result.status === 'confirmation_required' &&
		(typeof result.confirmation_token !== 'string' ||
			result.confirmation_token.length === 0 ||
			result.confirmation_token.length > 128)
	) {
		throw invalidReceipt();
	}
	if (
		result.status === 'blocked' &&
		(typeof result.blocker !== 'string' ||
			result.blocker.length === 0 ||
			typeof result.message !== 'string' ||
			result.message.length === 0)
	) {
		throw invalidReceipt();
	}
}

function invalidReceipt(): ReturnType<typeof uncertainFailure> {
	return uncertainFailure(
		`${TOOL_NAME}_receipt_invalid`,
		'move_onto_task returned a mismatched or malformed receipt'
	);
}
