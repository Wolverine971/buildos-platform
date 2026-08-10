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
	isRecord,
	knownFailure,
	optionalUuid,
	requestProjectId,
	throwGatewayResultFailure,
	uncertainFailure
} from './mutationAdapterBoundary';

const TOOL_NAME = 'update_onto_task';
const OPERATION_NAME = 'onto.task.update';
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
		assertMutationAdapterBoundary(input, {
			toolName: TOOL_NAME,
			operationName: OPERATION_NAME,
			reviewedArgumentNames: REVIEWED_ARGUMENT_NAMES
		});

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
			throw uncertainFailure(
				'update_onto_task_gateway_threw',
				canonicalGatewayError(error, TOOL_NAME)
			);
		}

		if (!result.ok) {
			throwGatewayResultFailure(TOOL_NAME, result.error);
		}

		const task = requireTaskReceipt(result.data, input, projectId);
		const receipt = canonicalMutationReceipt(
			{
				task,
				message: 'Task updated successfully.',
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
	return canonicalMutationReceipt(task, TOOL_NAME);
}
