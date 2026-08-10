import { createWorkerTaskSyncPort } from '@buildos/shared-agent-ops/calendar/worker-task-event-mutation-port';
import {
	type TaskSyncPort,
	runGatewayWriteOp
} from '@buildos/shared-agent-ops/gateway/op-execution-gateway';
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
	throwGatewayResultFailure,
	uncertainFailure
} from './mutationAdapterBoundary';

const TOOL_NAME = 'create_onto_task';
const OPERATION_NAME = 'onto.task.create';
const REVIEWED_ARGUMENT_NAMES = new Set([
	'project_id',
	'title',
	'description',
	'type_key',
	'state_key',
	'priority',
	'assignee_actor_ids',
	'assignee_handles',
	'plan_id',
	'goal_id',
	'supporting_milestone_id',
	'parent',
	'start_at',
	'due_at',
	'props'
]);

type GatewayRunner = typeof runGatewayWriteOp;

/**
 * Idempotent worker adapter for `create_onto_task`.
 *
 * The stable effect key reaches the domain-level atomic create RPC, whose
 * unique task key makes the adapter safe for the effect executor's bounded
 * retry. Notifications/calendar/activity remain post-commit and are skipped on
 * an RPC replay, matching the legacy task-create contract.
 */
export class AgenticChatCreateOntoTaskMutationAdapter
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
		assertMutationAdapterBoundary(input, {
			toolName: TOOL_NAME,
			operationName: OPERATION_NAME,
			reviewedArgumentNames: REVIEWED_ARGUMENT_NAMES
		});

		const contextProjectId = requestProjectId(input);
		const argumentProjectId = requiredUuid(input.arguments.project_id, 'project_id');
		if (contextProjectId !== null && contextProjectId !== argumentProjectId) {
			throw knownFailure(
				'mutation_project_scope_mismatch',
				'create_onto_task project_id is outside the admitted turn context'
			);
		}

		let result: Awaited<ReturnType<GatewayRunner>>;
		try {
			result = await this.runGateway({
				admin: this.client,
				userId: input.executionInput.claim.userId,
				scope: {
					mode: 'read_write',
					allowed_ops: [OPERATION_NAME],
					project_ids: [argumentProjectId],
					write_project_ids: [argumentProjectId]
				},
				op: OPERATION_NAME,
				args: { ...input.arguments },
				callSessionId: input.executionInput.claim.sessionId,
				taskSync: this.taskSync,
				downstreamIdempotencyKey: input.downstreamIdempotencyKey
			});
		} catch (error) {
			throw uncertainFailure(
				'create_onto_task_gateway_threw',
				canonicalGatewayError(error, TOOL_NAME)
			);
		}

		if (!result.ok) {
			throwGatewayResultFailure(TOOL_NAME, result.error);
		}

		const task = requireTaskReceipt(result.data, argumentProjectId);
		const receipt = canonicalMutationReceipt(
			{
				task,
				message: 'Task created successfully.',
				requires_user_action: false
			},
			TOOL_NAME
		);
		assertMutationReceiptSize(receipt, TOOL_NAME);
		return receipt;
	}
}

function requireTaskReceipt(
	value: Record<string, unknown> | undefined,
	projectId: string
): JsonObject {
	if (!isRecord(value) || !isRecord(value.task)) {
		throw uncertainFailure(
			'create_onto_task_receipt_invalid',
			'create_onto_task returned no task receipt'
		);
	}
	const task = { ...value.task };
	if (!canonicalUuid(task.id) || task.project_id !== projectId) {
		throw uncertainFailure(
			'create_onto_task_receipt_invalid',
			'create_onto_task returned a mismatched task receipt'
		);
	}
	delete task.project_name;
	delete task.idempotency_key;
	return canonicalMutationReceipt(task, TOOL_NAME);
}
