// apps/worker/tests/agenticChatToolExecution.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	AgenticChatToolExecutionFenceError,
	AgenticChatToolExecutionRpcError,
	AgenticChatToolExecutionTimeoutError,
	SupabaseAgenticChatToolExecutionAdapter,
	createStableAgenticChatToolExecutionIdV1,
	type AgenticChatMutationToolExecutionPersistInputV1,
	type AgenticChatToolExecutionPersistInputV1,
	type AgenticChatToolFailurePersistInputV1
} from '../src/workers/agentic-chat/toolExecution';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const SESSION_ID = '20000000-0000-4000-8000-000000000002';
const TURN_RUN_ID = '30000000-0000-4000-8000-000000000003';
const QUEUE_JOB_ID = '40000000-0000-4000-8000-000000000004';
const PROCESSING_TOKEN = '50000000-0000-4000-8000-000000000005';
const TOOL_EXECUTION_ID = 'f1e584b9-4a0b-5715-b940-50848e21ca38';
const EFFECT_ID = '60000000-0000-5000-8000-000000000006';

const input: AgenticChatToolExecutionPersistInputV1 = {
	turnRunId: TURN_RUN_ID,
	userId: USER_ID,
	queueJobId: QUEUE_JOB_ID,
	processingToken: PROCESSING_TOKEN,
	executionGeneration: 2,
	toolExecutionId: TOOL_EXECUTION_ID,
	sequenceIndex: 1,
	providerToolCallId: 'read-tool-call-1',
	toolName: 'fixture_project_read',
	arguments: { projectId: 'da000000-0000-4000-8000-000000000001' },
	execution: {
		result: { note: 'Fixture project is ready.' },
		executionTimeMs: 12,
		tokensConsumed: 9,
		affectedEntities: [{ id: 'da000000-0000-4000-8000-000000000001', type: 'project' }],
		toolCategory: 'utility',
		resultCount: 1,
		zeroResult: false,
		requiresUserAction: false
	}
};

const validationFailureInput: AgenticChatToolFailurePersistInputV1 = {
	turnRunId: TURN_RUN_ID,
	userId: USER_ID,
	queueJobId: QUEUE_JOB_ID,
	processingToken: PROCESSING_TOKEN,
	executionGeneration: 2,
	failureKind: 'validation',
	toolExecutionId: TOOL_EXECUTION_ID,
	sequenceIndex: 1,
	providerToolCallId: 'read-tool-call-1',
	toolName: 'fixture_project_read',
	arguments: {},
	toolCategory: 'read',
	error: 'Tool validation failed: Missing required parameter: project_id'
};

const mutationInput: AgenticChatMutationToolExecutionPersistInputV1 = {
	turnRunId: TURN_RUN_ID,
	userId: USER_ID,
	queueJobId: QUEUE_JOB_ID,
	processingToken: PROCESSING_TOKEN,
	executionGeneration: 2,
	effectId: EFFECT_ID,
	canonicalArgumentHash: 'a'.repeat(64),
	toolExecutionId: TOOL_EXECUTION_ID,
	sequenceIndex: 1,
	providerToolCallId: 'mutation-tool-call-1',
	toolName: 'update_onto_task',
	operationName: 'onto.task.update',
	arguments: { task_id: 'da000000-0000-4000-8000-000000000001', state_key: 'done' },
	executionTimeMs: 12,
	tokensConsumed: null,
	requiresUserAction: false,
	affectedEntities: [{ id: 'da000000-0000-4000-8000-000000000001', type: 'task' }]
};

function receipt(overrides: Record<string, unknown> = {}) {
	return {
		outcome: 'persisted',
		turn_run_id: TURN_RUN_ID,
		queue_job_id: QUEUE_JOB_ID,
		session_id: SESSION_ID,
		user_id: USER_ID,
		execution_generation: 2,
		tool_execution_id: TOOL_EXECUTION_ID,
		sequence_index: 1,
		provider_tool_call_id: 'read-tool-call-1',
		tool_name: 'fixture_project_read',
		message_id: null,
		created_at: '2026-08-04T12:00:00.123456Z',
		...overrides
	};
}

function adapterFor(data: unknown) {
	const rpc = vi.fn(async () => ({ data, error: null }));
	return { adapter: new SupabaseAgenticChatToolExecutionAdapter({ rpc }), rpc };
}

describe('Agentic Chat read-tool execution ledger', () => {
	it('pins the stable row identity and sends the exact generation-fenced RPC payload', async () => {
		expect(
			createStableAgenticChatToolExecutionIdV1({ turnRunId: TURN_RUN_ID, sequenceIndex: 1 })
		).toBe(TOOL_EXECUTION_ID);
		const { adapter, rpc } = adapterFor(receipt());

		await expect(adapter.persistRead(input)).resolves.toBeUndefined();
		expect(rpc).toHaveBeenCalledWith('persist_agentic_chat_read_tool_execution', {
			p_turn_run_id: TURN_RUN_ID,
			p_user_id: USER_ID,
			p_queue_job_id: QUEUE_JOB_ID,
			p_processing_token: PROCESSING_TOKEN,
			p_execution_generation: 2,
			p_tool_execution_id: TOOL_EXECUTION_ID,
			p_sequence_index: 1,
			p_provider_tool_call_id: 'read-tool-call-1',
			p_tool_name: 'fixture_project_read',
			p_tool_category: 'utility',
			p_arguments: { projectId: 'da000000-0000-4000-8000-000000000001' },
			p_result: { note: 'Fixture project is ready.' },
			p_result_count: 1,
			p_zero_result: false,
			p_execution_time_ms: 12,
			p_tokens_consumed: 9,
			p_requires_user_action: false,
			p_affected_entities: [{ id: 'da000000-0000-4000-8000-000000000001', type: 'project' }]
		});
	});

	it('persists a pre-execution validation failure through its fenced RPC', async () => {
		const { adapter, rpc } = adapterFor(receipt());

		await expect(adapter.persistFailure(validationFailureInput)).resolves.toBeUndefined();
		expect(rpc).toHaveBeenCalledWith('persist_agentic_chat_counted_tool_validation_failure', {
			p_turn_run_id: TURN_RUN_ID,
			p_user_id: USER_ID,
			p_queue_job_id: QUEUE_JOB_ID,
			p_processing_token: PROCESSING_TOKEN,
			p_execution_generation: 2,
			p_tool_execution_id: TOOL_EXECUTION_ID,
			p_sequence_index: 1,
			p_provider_tool_call_id: 'read-tool-call-1',
			p_tool_name: 'fixture_project_read',
			p_tool_category: 'read',
			p_arguments: {},
			p_error_message: 'Tool validation failed: Missing required parameter: project_id'
		});
	});

	it('keeps operational failures out of the validation counter', async () => {
		const { adapter, rpc } = adapterFor(receipt());

		await expect(
			adapter.persistFailure({ ...validationFailureInput, failureKind: 'dependency_failed' })
		).resolves.toBeUndefined();
		expect(rpc).toHaveBeenCalledWith(
			'persist_agentic_chat_tool_validation_failure',
			expect.any(Object)
		);
	});

	it('persists a succeeded mutation through its effect-linked fenced RPC', async () => {
		const { adapter, rpc } = adapterFor(
			receipt({
				provider_tool_call_id: mutationInput.providerToolCallId,
				tool_name: mutationInput.toolName,
				effect_id: EFFECT_ID
			})
		);

		await expect(adapter.persistMutation(mutationInput)).resolves.toBeUndefined();
		expect(rpc).toHaveBeenCalledWith('persist_agentic_chat_mutation_tool_execution', {
			p_turn_run_id: TURN_RUN_ID,
			p_user_id: USER_ID,
			p_queue_job_id: QUEUE_JOB_ID,
			p_processing_token: PROCESSING_TOKEN,
			p_execution_generation: 2,
			p_effect_id: EFFECT_ID,
			p_canonical_argument_hash: 'a'.repeat(64),
			p_tool_execution_id: TOOL_EXECUTION_ID,
			p_sequence_index: 1,
			p_provider_tool_call_id: 'mutation-tool-call-1',
			p_tool_name: 'update_onto_task',
			p_operation_name: 'onto.task.update',
			p_arguments: {
				task_id: 'da000000-0000-4000-8000-000000000001',
				state_key: 'done'
			},
			p_execution_time_ms: 12,
			p_tokens_consumed: null,
			p_requires_user_action: false,
			p_affected_entities: [{ id: 'da000000-0000-4000-8000-000000000001', type: 'task' }]
		});
	});

	it('accepts an exact lost-response replay', async () => {
		const { adapter } = adapterFor(receipt({ outcome: 'already_persisted' }));
		await expect(adapter.persistRead(input)).resolves.toBeUndefined();
	});

	it('aborts and rejects a hung ledger RPC at the configured deadline', async () => {
		let deadlineSignal: AbortSignal | null = null;
		const response = Object.assign(new Promise<never>(() => undefined), {
			abortSignal(signal: AbortSignal) {
				deadlineSignal = signal;
				return this;
			}
		});
		const adapter = new SupabaseAgenticChatToolExecutionAdapter(
			{ rpc: vi.fn(() => response) },
			{ timeoutMs: 10 }
		);

		await expect(
			adapter.persistRead(input, new AbortController().signal)
		).rejects.toBeInstanceOf(AgenticChatToolExecutionTimeoutError);
		expect(deadlineSignal).toMatchObject({ aborted: true });
	});

	it('surfaces stale, cancelled, and terminal receipts as typed execution fences', async () => {
		for (const [outcome, failureClass] of [
			['stale_generation', 'unknown'],
			['cancel_requested', 'cancelled'],
			['already_terminal', 'unknown']
		] as const) {
			const { adapter } = adapterFor(receipt({ outcome }));
			await expect(adapter.persistRead(input)).rejects.toMatchObject<
				Partial<AgenticChatToolExecutionFenceError>
			>({
				name: 'AgenticChatToolExecutionFenceError',
				outcome,
				failureClass
			});
		}
	});

	it('rejects malformed identity, receipts, and RPC failures without publishing success', async () => {
		const local = adapterFor(receipt());
		await expect(
			local.adapter.persistRead({ ...input, toolExecutionId: SESSION_ID })
		).rejects.toThrow('tool-execution id is not the stable turn sequence identity');
		expect(local.rpc).not.toHaveBeenCalled();
		await expect(
			local.adapter.persistRead({
				...input,
				execution: { ...input.execution, resultCount: 0, zeroResult: false }
			})
		).rejects.toThrow('resultCount and zeroResult are inconsistent');
		expect(local.rpc).not.toHaveBeenCalled();

		await expect(
			adapterFor(receipt({ message_id: SESSION_ID })).adapter.persistRead(input)
		).rejects.toThrow('persisted receipt is inconsistent');
		await expect(adapterFor(null).adapter.persistRead(input)).rejects.toThrow(
			'RPC returned no receipt'
		);

		const failed = new SupabaseAgenticChatToolExecutionAdapter({
			async rpc() {
				return { data: null, error: { code: '08006', message: 'connection lost' } };
			}
		});
		await expect(failed.persistRead(input)).rejects.toBeInstanceOf(
			AgenticChatToolExecutionRpcError
		);
	});
});
