import { createWorkerTaskSyncPort } from '@buildos/shared-agent-ops/calendar/worker-task-event-mutation-port';
import {
	type TaskSyncPort,
	runGatewayWriteOp
} from '@buildos/shared-agent-ops/gateway/op-execution-gateway';
import {
	type Database,
	type JsonObject,
	type JsonValue,
	canonicalizeAgenticChatJson
} from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	type AgenticChatFixtureMutatingToolPortV1,
	AgenticChatFixtureMutationAdapterError
} from './fixtureMutationExecutor';

const TOOL_NAME = 'update_onto_task';
const OPERATION_NAME = 'onto.task.update';
const MAX_RECEIPT_BYTES = 480 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const REVIEWED_ARGUMENT_NAMES = new Set([
	'task_id',
	'project_id',
	'title',
	'description',
	'type_key',
	'state_key',
	'priority',
	'assignee_actor_ids',
	'assignee_handles',
	'goal_id',
	'supporting_milestone_id',
	'start_at',
	'due_at',
	'props'
]);

type GatewayRunner = typeof runGatewayWriteOp;
type MutationInput = Parameters<AgenticChatFixtureMutatingToolPortV1['execute']>[0];

/**
 * Worker-safe `update_onto_task` adapter over the shared in-process gateway.
 *
 * The gateway cannot atomically persist or query the effect identity, so the
 * provider catalog must continue to declare downstream idempotency unsupported.
 * The effect executor therefore invokes this adapter once and treats an
 * ambiguous gateway failure as an uncertain external commit.
 */
export class AgenticChatUpdateOntoTaskMutationAdapter
	implements AgenticChatFixtureMutatingToolPortV1
{
	private readonly runGateway: GatewayRunner;
	private readonly taskSync: TaskSyncPort;

	constructor(
		private readonly client: SupabaseClient<Database>,
		options: { runGateway?: GatewayRunner; taskSync?: TaskSyncPort } = {}
	) {
		this.runGateway = options.runGateway ?? runGatewayWriteOp;
		this.taskSync = options.taskSync ?? createWorkerTaskSyncPort(client);
	}

	async execute(input: MutationInput): Promise<JsonObject> {
		validateEffectBoundary(input);
		assertSignedToolSurface(input);
		assertReviewedArguments(input.arguments);
		if (input.signal.aborted) {
			throw knownFailure(
				'mutation_cancelled_before_dispatch',
				'Mutation cancelled before dispatch'
			);
		}

		const contextProjectId = requestProjectId(input);
		const argumentProjectId = optionalUuid(input.arguments.project_id, 'project_id');
		if (
			contextProjectId !== null &&
			argumentProjectId !== null &&
			contextProjectId !== argumentProjectId
		) {
			throw knownFailure(
				'mutation_project_scope_mismatch',
				'update_onto_task project_id is outside the admitted turn context'
			);
		}
		const projectId = contextProjectId ?? argumentProjectId;
		const gatewayArguments = { ...input.arguments } as Record<string, unknown>;
		// `project_id` is a legacy direct-tool scope/assignee hint, not a field on
		// the canonical gateway operation. Keep it as a worker scope fence only.
		delete gatewayArguments.project_id;

		let result: Awaited<ReturnType<GatewayRunner>>;
		try {
			result = await this.runGateway({
				admin: this.client,
				userId: input.executionInput.claim.userId,
				scope: {
					mode: 'read_write',
					allowed_ops: [OPERATION_NAME],
					...(projectId
						? { project_ids: [projectId], write_project_ids: [projectId] }
						: {})
				},
				op: OPERATION_NAME,
				args: gatewayArguments,
				callSessionId: input.executionInput.claim.sessionId,
				taskSync: this.taskSync
			});
		} catch (error) {
			throw uncertainFailure('update_onto_task_gateway_threw', canonicalError(error));
		}

		if (!result.ok) {
			const code = result.error?.code ?? 'INTERNAL';
			const message = result.error?.message ?? 'update_onto_task gateway failed';
			if (code === 'VALIDATION_ERROR' || code === 'NOT_FOUND' || code === 'FORBIDDEN') {
				throw knownFailure(`update_onto_task_${code.toLowerCase()}`, message);
			}
			throw uncertainFailure('update_onto_task_outcome_uncertain', message);
		}

		const task = requireTaskReceipt(result.data, input, projectId);
		const receipt = canonicalJsonObject({
			task,
			message: 'Task updated successfully.',
			requires_user_action: false
		});
		if (Buffer.byteLength(JSON.stringify(receipt), 'utf8') > MAX_RECEIPT_BYTES) {
			// The write has already returned success. Failing to fit its authoritative
			// receipt into the effect ledger is therefore an uncertain commit, never a
			// validation failure that may be retried.
			throw uncertainFailure(
				'update_onto_task_receipt_too_large',
				'update_onto_task returned an oversized downstream receipt'
			);
		}
		return receipt;
	}
}

function assertReviewedArguments(argumentsValue: JsonObject): void {
	const unsupported = Object.keys(argumentsValue).filter(
		(name) => !REVIEWED_ARGUMENT_NAMES.has(name)
	);
	if (unsupported.length > 0) {
		throw knownFailure(
			'mutation_arguments_not_admitted',
			`update_onto_task contains unsupported arguments: ${unsupported.sort().join(', ')}`
		);
	}
}

function validateEffectBoundary(input: MutationInput): void {
	if (input.toolName !== TOOL_NAME || input.operationName !== OPERATION_NAME) {
		throw knownFailure(
			'mutation_adapter_not_allowlisted',
			'Only update_onto_task / onto.task.update is enabled for this adapter'
		);
	}
	if (!canonicalUuid(input.effectId)) {
		throw knownFailure('mutation_effect_identity_invalid', 'Mutation effect_id is invalid');
	}
	if (input.downstreamIdempotencyKey !== `chat-effect:${input.effectId}`) {
		throw knownFailure(
			'mutation_effect_identity_invalid',
			'Mutation downstream idempotency key does not match effect_id'
		);
	}
	if (!canonicalText(input.providerToolCallId, 512)) {
		throw knownFailure(
			'mutation_provider_call_invalid',
			'Mutation provider tool-call identity is invalid'
		);
	}
}

function assertSignedToolSurface(input: MutationInput): void {
	const surface = input.executionInput.artifact.prepared.toolSurface;
	if (!isRecord(surface)) {
		throw knownFailure('mutation_tool_not_admitted', 'Mutation tool surface is missing');
	}
	const selected = Array.isArray(surface.toolNames) && surface.toolNames.includes(TOOL_NAME);
	const defined =
		Array.isArray(surface.definitions) &&
		surface.definitions.some((definition) => {
			if (
				!isRecord(definition) ||
				definition.type !== 'function' ||
				!isRecord(definition.function)
			) {
				return false;
			}
			return definition.function.name === TOOL_NAME;
		});
	if (!selected || !defined) {
		throw knownFailure(
			'mutation_tool_not_admitted',
			'update_onto_task is absent from the immutable admitted tool surface'
		);
	}
}

function requestProjectId(input: MutationInput): string | null {
	const context = input.executionInput.requestPayload.context;
	if (!isRecord(context)) {
		throw knownFailure('mutation_context_invalid', 'Mutation turn context is invalid');
	}
	const explicit = optionalUuid(context.projectId, 'context projectId');
	const entity = optionalUuid(context.entityId, 'context entityId');
	if (context.type === 'project') {
		if (explicit !== null && entity !== null && explicit !== entity) {
			throw knownFailure(
				'mutation_context_invalid',
				'Mutation project context is inconsistent'
			);
		}
		const projectId = explicit ?? entity;
		if (projectId === null) {
			throw knownFailure(
				'mutation_context_invalid',
				'Mutation project context has no project ID'
			);
		}
		return projectId;
	}
	return explicit;
}

function requireTaskReceipt(
	value: Record<string, unknown> | undefined,
	input: MutationInput,
	projectId: string | null
): JsonObject {
	if (!isRecord(value) || !isRecord(value.task)) {
		throw uncertainFailure(
			'update_onto_task_receipt_invalid',
			'update_onto_task returned no task receipt'
		);
	}
	const task = { ...value.task };
	const expectedTaskId = input.arguments.task_id;
	if (
		typeof expectedTaskId !== 'string' ||
		task.id !== expectedTaskId ||
		(projectId !== null && task.project_id !== projectId)
	) {
		throw uncertainFailure(
			'update_onto_task_receipt_invalid',
			'update_onto_task returned a mismatched task receipt'
		);
	}
	// The shared gateway enriches rows with project_name for generic agent-run
	// callers. The legacy direct tool does not expose that extra field.
	delete task.project_name;
	return canonicalJsonObject(task);
}

function canonicalJsonObject(value: Record<string, unknown>): JsonObject {
	const canonical = canonicalizeAgenticChatJson(value as JsonValue);
	const parsed = JSON.parse(canonical) as unknown;
	if (!isRecord(parsed)) {
		throw uncertainFailure(
			'update_onto_task_receipt_invalid',
			'update_onto_task returned a non-object receipt'
		);
	}
	return parsed as JsonObject;
}

function optionalUuid(value: unknown, label: string): string | null {
	if (value === undefined || value === null || value === '') return null;
	if (!canonicalUuid(value)) {
		throw knownFailure('mutation_scope_invalid', `${label} must be a canonical UUID`);
	}
	return value;
}

function canonicalUuid(value: unknown): value is string {
	return typeof value === 'string' && UUID_PATTERN.test(value) && value === value.toLowerCase();
}

function canonicalText(value: unknown, maxLength: number): value is string {
	return (
		typeof value === 'string' &&
		value === value.trim() &&
		value.length > 0 &&
		value.length <= maxLength
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function knownFailure(code: string, message: string): AgenticChatFixtureMutationAdapterError {
	return new AgenticChatFixtureMutationAdapterError('known_failed', code, message);
}

function uncertainFailure(code: string, message: string): AgenticChatFixtureMutationAdapterError {
	return new AgenticChatFixtureMutationAdapterError('outcome_uncertain', code, message);
}

function canonicalError(error: unknown): string {
	return error instanceof Error
		? error.message
		: String(error ?? 'update_onto_task gateway failed');
}
