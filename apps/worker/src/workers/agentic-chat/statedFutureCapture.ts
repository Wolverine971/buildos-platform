// apps/worker/src/workers/agentic-chat/statedFutureCapture.ts
import { createHash } from 'node:crypto';
import {
	type FastToolExecution,
	STATED_FUTURE_SOURCE,
	STATED_FUTURE_TASK_TYPE_KEY,
	buildStatedFutureTaskDescription,
	buildStatedFutureTaskTitle,
	didWriteWithoutDurableRecord,
	extractStatedFutureClause,
	looksLikeConservativeStatedFuture
} from '@buildos/agentic-chat-runtime/loop';
import {
	type JsonObject,
	type JsonValue,
	canonicalizeAgenticChatJson
} from '@buildos/shared-types';
import { runWithAbortableDeadline } from './abortableDeadline';
import type { AgenticChatEffectControlPortV1 } from './effectControl';
import type { AgenticChatWorkerExecutionInputV1 } from './executionInput';
import {
	type AgenticChatFixtureMutatingToolPortV1,
	AgenticChatFixtureMutationAdapterError,
	AgenticChatFixtureMutationExecutor
} from './fixtureMutationExecutor';

const TOOL_NAME = 'agentic_chat_stated_future_capture';
const OPERATION_NAME = 'agentic_chat.stated_future_capture';
const IDENTITY_VERSION = 'agentic_chat_stated_future_capture_logical_operation_v1';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const AGENTIC_CHAT_STATED_FUTURE_CAPTURE_TIMEOUT_MS = 10_000;

type RpcError = { code?: string; message: string };
type RpcResponse = PromiseLike<{ data: unknown; error: RpcError | null }> & {
	abortSignal?(signal: AbortSignal): RpcResponse;
};

export type AgenticChatStatedFutureCaptureRpcClient = {
	rpc(name: string, args: Record<string, unknown>): RpcResponse;
};

export type AgenticChatStatedFutureCaptureResultV1 =
	| { status: 'created' | 'duplicate'; effectId: string; taskId: string; title: string }
	| {
			status: 'skipped';
			reason:
				| 'no_project'
				| 'not_stated_future'
				| 'not_eligible'
				| 'cancel_requested'
				| 'stale_generation'
				| 'already_terminal';
	  };

export type AgenticChatStatedFutureCapturePortV1 = {
	capture(input: {
		executionInput: AgenticChatWorkerExecutionInputV1;
		processingToken: string;
		signal: AbortSignal;
	}): Promise<AgenticChatStatedFutureCaptureResultV1>;
};

export class AgenticChatStatedFutureCaptureRpcError extends Error {
	constructor(
		readonly rpcName: string,
		readonly code: string,
		message: string
	) {
		super(`${rpcName} failed${code ? ` (${code})` : ''}: ${message}`);
		this.name = 'AgenticChatStatedFutureCaptureRpcError';
	}
}

export class AgenticChatStatedFutureCaptureProtocolError extends Error {
	constructor(message: string) {
		super(`Invalid Agentic Chat stated-future receipt: ${message}`);
		this.name = 'AgenticChatStatedFutureCaptureProtocolError';
	}
}

/** Durable-evidence forward-carry floor backed by the generic effect lifecycle. */
export class SupabaseAgenticChatStatedFutureCaptureAdapter
	implements AgenticChatStatedFutureCapturePortV1
{
	private readonly timeoutMs: number;
	private readonly mutationExecutor: AgenticChatFixtureMutationExecutor;

	constructor(
		private readonly client: AgenticChatStatedFutureCaptureRpcClient,
		control: AgenticChatEffectControlPortV1,
		options: { timeoutMs?: number; maximumAdapterAttempts?: number } = {}
	) {
		this.timeoutMs = options.timeoutMs ?? AGENTIC_CHAT_STATED_FUTURE_CAPTURE_TIMEOUT_MS;
		if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1) {
			throw invalid('stated-future capture timeout is invalid');
		}
		this.mutationExecutor = new AgenticChatFixtureMutationExecutor(
			{
				control,
				mutatingTool: new StatedFutureTaskMutationAdapter(client, this.timeoutMs)
			},
			{ maximumAdapterAttempts: options.maximumAdapterAttempts }
		);
	}

	async capture(input: {
		executionInput: AgenticChatWorkerExecutionInputV1;
		processingToken: string;
		signal: AbortSignal;
	}): Promise<AgenticChatStatedFutureCaptureResultV1> {
		const { executionInput } = input;
		const { claim } = executionInput;
		const context = requireRecord(executionInput.requestPayload.context, 'request context');
		const projectId = context.projectId;
		if (projectId === null || projectId === undefined) {
			return { status: 'skipped', reason: 'no_project' };
		}
		canonicalUuid(projectId, 'projectId');
		canonicalUuid(input.processingToken, 'processingToken');

		const userMessage = String(executionInput.requestPayload.message);
		if (!looksLikeConservativeStatedFuture(userMessage)) {
			return { status: 'skipped', reason: 'not_stated_future' };
		}
		const clause = extractStatedFutureClause(userMessage);
		if (!clause) return { status: 'skipped', reason: 'not_stated_future' };

		const evidenceValue = await this.callEvidence(
			{
				p_turn_run_id: claim.turnRunId,
				p_user_id: claim.userId,
				p_queue_job_id: claim.queueJobId,
				p_processing_token: input.processingToken,
				p_execution_generation: claim.executionGeneration
			},
			input.signal
		);
		const evidence = parseEvidence(evidenceValue, executionInput);
		if (evidence.outcome !== 'eligible') {
			return { status: 'skipped', reason: evidence.outcome };
		}
		if (!didWriteWithoutDurableRecord(evidence.executions)) {
			return { status: 'skipped', reason: 'not_eligible' };
		}

		const title = buildStatedFutureTaskTitle(clause);
		if (!title) return { status: 'skipped', reason: 'not_eligible' };
		const description = buildStatedFutureTaskDescription({ clause, userMessage });
		const argumentsValue: JsonObject = {
			project_id: projectId,
			stream_run_id: executionInput.streamRunId,
			clause,
			title,
			description,
			source: STATED_FUTURE_SOURCE
		};
		canonicalizeAgenticChatJson(argumentsValue);

		const result = await this.mutationExecutor.execute({
			executionInput,
			processingToken: input.processingToken,
			step: {
				logicalOperationId: createStableStatedFutureLogicalOperationId(claim.turnRunId),
				providerToolCallId: `deterministic-stated-future:${claim.turnRunId}`,
				toolName: TOOL_NAME,
				operationName: OPERATION_NAME,
				arguments: argumentsValue,
				downstreamIdempotencySupported: true
			},
			signal: input.signal
		});
		const receipt = parseTaskReceipt(result.downstreamReceipt, projectId);
		return {
			status: result.replayed || receipt.status === 'duplicate' ? 'duplicate' : 'created',
			effectId: result.effectId,
			taskId: receipt.taskId,
			title
		};
	}

	private async callEvidence(
		args: Record<string, unknown>,
		signal: AbortSignal
	): Promise<unknown> {
		const name = 'load_agentic_chat_stated_future_evidence';
		const { data, error } = await runRpc(this.client, name, args, signal, this.timeoutMs);
		if (error) {
			throw new AgenticChatStatedFutureCaptureRpcError(name, error.code ?? '', error.message);
		}
		if (data === null || data === undefined) throw invalid(`${name} returned no receipt`);
		return data;
	}
}

class StatedFutureTaskMutationAdapter implements AgenticChatFixtureMutatingToolPortV1 {
	constructor(
		private readonly client: AgenticChatStatedFutureCaptureRpcClient,
		private readonly timeoutMs: number
	) {}

	async execute(
		input: Parameters<AgenticChatFixtureMutatingToolPortV1['execute']>[0]
	): Promise<JsonObject> {
		if (
			input.toolName !== TOOL_NAME ||
			input.operationName !== OPERATION_NAME ||
			input.downstreamIdempotencySupported !== true
		) {
			throw new AgenticChatFixtureMutationAdapterError(
				'known_failed',
				'stated_future_adapter_boundary_mismatch',
				'Stated-future mutation adapter boundary mismatch'
			);
		}
		const projectId = requiredString(input.arguments.project_id, 'project_id');
		canonicalUuid(projectId, 'project_id');
		const context = requireRecord(
			input.executionInput.requestPayload.context,
			'request context'
		);
		if (context.projectId !== projectId) {
			throw knownFailure(
				'stated_future_project_scope_mismatch',
				'Stated-future task project is outside the admitted turn context'
			);
		}
		const streamRunId = requiredString(input.arguments.stream_run_id, 'stream_run_id');
		const title = requiredString(input.arguments.title, 'title');
		const description = requiredString(input.arguments.description, 'description');
		if (input.arguments.source !== STATED_FUTURE_SOURCE) {
			throw knownFailure(
				'stated_future_source_mismatch',
				'Stated-future task source is invalid'
			);
		}

		const actorValue = await this.call(
			'ensure_actor_for_user',
			{ p_user_id: input.executionInput.claim.userId },
			input.signal
		);
		if (typeof actorValue !== 'string' || !UUID_PATTERN.test(actorValue)) {
			throw uncertainFailure(
				'stated_future_actor_receipt_invalid',
				'ensure_actor_for_user returned no canonical actor id'
			);
		}

		const taskValue = await this.call(
			'onto_task_create_atomic',
			{
				p_task: {
					project_id: projectId,
					title,
					description,
					type_key: STATED_FUTURE_TASK_TYPE_KEY,
					state_key: 'todo',
					created_by: actorValue,
					props: {
						source: STATED_FUTURE_SOURCE,
						source_stream_run_id: streamRunId
					}
				},
				p_source: 'agent',
				p_idempotency_key: `${STATED_FUTURE_SOURCE}:${streamRunId}`
			},
			input.signal
		);
		const receipt = requireRecord(taskValue, 'task create receipt');
		const task = requireRecord(receipt.task, 'task create receipt task');
		if (typeof task.id !== 'string' || !UUID_PATTERN.test(task.id)) {
			throw uncertainFailure(
				'stated_future_task_receipt_invalid',
				'onto_task_create_atomic returned no canonical task id'
			);
		}
		return {
			status: receipt.idempotent_replay === true ? 'duplicate' : 'created',
			task_id: task.id,
			project_id: projectId
		};
	}

	private async call(
		name: string,
		args: Record<string, unknown>,
		signal: AbortSignal
	): Promise<unknown> {
		let response: { data: unknown; error: RpcError | null };
		try {
			response = await runRpc(this.client, name, args, signal, this.timeoutMs);
		} catch (error) {
			throw uncertainFailure(
				'stated_future_downstream_outcome_uncertain',
				error instanceof Error ? error.message : String(error)
			);
		}
		if (response.error) {
			const code = canonicalFailureCode(response.error.code);
			if (!code) {
				throw uncertainFailure(
					'stated_future_downstream_outcome_uncertain',
					`${name} failed without a transactional error code: ${response.error.message}`
				);
			}
			throw knownFailure(
				`stated_future_${canonicalFailureCode(name) ?? 'rpc'}_${code}`,
				`${name} failed (${code}): ${response.error.message}`
			);
		}
		if (response.data === null || response.data === undefined) {
			throw uncertainFailure(
				'stated_future_downstream_receipt_missing',
				`${name} returned no receipt`
			);
		}
		return response.data;
	}
}

function runRpc(
	client: AgenticChatStatedFutureCaptureRpcClient,
	name: string,
	args: Record<string, unknown>,
	signal: AbortSignal,
	timeoutMs: number
): Promise<{ data: unknown; error: RpcError | null }> {
	return runWithAbortableDeadline({
		parentSignal: signal,
		timeoutMs,
		createTimeoutError: () => new Error(`${name} exceeded its ${timeoutMs}ms deadline`),
		run: (deadlineSignal) => {
			const request = client.rpc(name, args);
			return request.abortSignal ? request.abortSignal(deadlineSignal) : request;
		}
	});
}

function parseEvidence(
	value: unknown,
	expected: AgenticChatWorkerExecutionInputV1
):
	| { outcome: 'eligible'; executions: FastToolExecution[] }
	| { outcome: 'cancel_requested' | 'stale_generation' | 'already_terminal' } {
	const receipt = requireRecord(value, 'evidence receipt');
	validateScope(receipt, expected);
	if (
		receipt.outcome === 'cancel_requested' ||
		receipt.outcome === 'stale_generation' ||
		receipt.outcome === 'already_terminal'
	) {
		return { outcome: receipt.outcome };
	}
	if (
		receipt.outcome !== 'eligible' ||
		!Array.isArray(receipt.executions) ||
		receipt.executions.length > 40
	) {
		throw invalid('eligible evidence fields are inconsistent');
	}
	const executions = receipt.executions.map((raw, index): FastToolExecution => {
		const execution = requireRecord(raw, `tool execution ${index}`);
		if (
			typeof execution.name !== 'string' ||
			execution.name.length < 1 ||
			execution.name.length > 256 ||
			typeof execution.success !== 'boolean' ||
			!isJsonObject(execution.args) ||
			!isJsonValue(execution.result) ||
			!(
				execution.error === null ||
				(typeof execution.error === 'string' && execution.error.length <= 1024)
			)
		) {
			throw invalid(`tool execution ${index} is malformed`);
		}
		canonicalizeAgenticChatJson(execution.args);
		canonicalizeAgenticChatJson(execution.result);
		const toolCallId = `durable-stated-future-${index + 1}`;
		return {
			toolCall: {
				id: toolCallId,
				type: 'function',
				function: { name: execution.name, arguments: JSON.stringify(execution.args) }
			},
			result: {
				tool_call_id: toolCallId,
				result: execution.result,
				success: execution.success,
				...(typeof execution.error === 'string' ? { error: execution.error } : {})
			}
		};
	});
	return { outcome: 'eligible', executions };
}

function validateScope(receipt: JsonObject, expected: AgenticChatWorkerExecutionInputV1): void {
	const { claim } = expected;
	if (
		receipt.turn_run_id !== claim.turnRunId ||
		receipt.queue_job_id !== claim.queueJobId ||
		receipt.session_id !== claim.sessionId ||
		receipt.user_id !== claim.userId ||
		receipt.execution_generation !== claim.executionGeneration ||
		receipt.stream_run_id !== expected.streamRunId
	) {
		throw invalid('evidence receipt scope is inconsistent');
	}
}

function parseTaskReceipt(
	value: JsonObject | null,
	expectedProjectId: string
): { status: 'created' | 'duplicate'; taskId: string } {
	const receipt = requireRecord(value, 'effect downstream receipt');
	if (
		(receipt.status !== 'created' && receipt.status !== 'duplicate') ||
		typeof receipt.task_id !== 'string' ||
		!UUID_PATTERN.test(receipt.task_id) ||
		receipt.project_id !== expectedProjectId
	) {
		throw invalid('effect downstream task receipt is inconsistent');
	}
	return { status: receipt.status, taskId: receipt.task_id };
}

function createStableStatedFutureLogicalOperationId(turnRunId: string): string {
	canonicalUuid(turnRunId, 'turnRunId');
	const bytes = createHash('sha256')
		.update(`${IDENTITY_VERSION}:${turnRunId}`, 'utf8')
		.digest()
		.subarray(0, 16);
	bytes[6] = (bytes[6] & 0x0f) | 0x50;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const hex = bytes.toString('hex');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function knownFailure(code: string, message: string): AgenticChatFixtureMutationAdapterError {
	return new AgenticChatFixtureMutationAdapterError('known_failed', code, message);
}

function uncertainFailure(code: string, message: string): AgenticChatFixtureMutationAdapterError {
	return new AgenticChatFixtureMutationAdapterError('outcome_uncertain', code, message);
}

function canonicalFailureCode(value: string | undefined): string | null {
	if (typeof value !== 'string') return null;
	const normalized = value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9_]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.slice(0, 64);
	return normalized || null;
}

function requiredString(value: JsonValue | undefined, label: string): string {
	if (typeof value !== 'string' || value.trim().length === 0) {
		throw knownFailure('stated_future_arguments_invalid', `${label} is required`);
	}
	return value;
}

function canonicalUuid(value: unknown, label: string): asserts value is string {
	if (typeof value !== 'string' || !UUID_PATTERN.test(value) || value !== value.toLowerCase()) {
		throw invalid(`${label} must be a canonical UUID`);
	}
}

function requireRecord(value: unknown, label: string): JsonObject {
	if (!isJsonObject(value)) throw invalid(`${label} is malformed`);
	return value;
}

function isJsonObject(value: unknown): value is JsonObject {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
	if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
	if (typeof value === 'number') return Number.isFinite(value);
	if (Array.isArray(value)) return value.every(isJsonValue);
	return isJsonObject(value) && Object.values(value).every(isJsonValue);
}

function invalid(message: string): AgenticChatStatedFutureCaptureProtocolError {
	return new AgenticChatStatedFutureCaptureProtocolError(message);
}
