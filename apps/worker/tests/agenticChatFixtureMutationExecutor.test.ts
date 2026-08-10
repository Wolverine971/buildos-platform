// apps/worker/tests/agenticChatFixtureMutationExecutor.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	AgenticChatEffectExecutionError,
	AgenticChatFixtureMutationAdapterError,
	AgenticChatFixtureMutationExecutor
} from '../src/workers/agentic-chat/fixtureMutationExecutor';
import {
	createStableAgenticChatEffectIdentityV1,
	createStableAgenticChatMutationLogicalOperationIdV1
} from '../src/workers/agentic-chat/effectIdentity';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const SESSION_ID = '20000000-0000-4000-8000-000000000002';
const TURN_RUN_ID = '30000000-0000-4000-8000-000000000003';
const QUEUE_JOB_ID = '40000000-0000-4000-8000-000000000004';
const PROCESSING_TOKEN = '50000000-0000-4000-8000-000000000005';
const LOGICAL_OPERATION_ID = '60000000-0000-4000-8000-000000000006';
const STARTED_AT = '2026-08-03T12:00:00.000Z';
const FINISHED_AT = '2026-08-03T12:00:01.000Z';

const executionInput = {
	claim: {
		turnRunId: TURN_RUN_ID,
		queueJobId: QUEUE_JOB_ID,
		sessionId: SESSION_ID,
		userId: USER_ID,
		executionGeneration: 3
	}
} as never;

const baseStep = {
	logicalOperationId: LOGICAL_OPERATION_ID,
	providerToolCallId: 'provider-call-1',
	toolName: 'fixture_project_write',
	operationName: 'update_project',
	arguments: { projectId: 'project-1', patch: { name: 'New name' } },
	downstreamIdempotencySupported: true
} as const;

function effectReceipt(effectId: string, overrides: Record<string, unknown> = {}) {
	return {
		effectId,
		turnRunId: TURN_RUN_ID,
		executionGeneration: 3,
		sessionId: SESSION_ID,
		userId: USER_ID,
		state: 'reserved',
		downstreamIdempotencySupported: true,
		downstreamReceipt: null,
		startedAt: null,
		finishedAt: null,
		outcome: 'reserved',
		invokeAdapter: false,
		...overrides
	};
}

function createHarness(options: { abortOnReserve?: AbortController } = {}) {
	const stable = createStableAgenticChatEffectIdentityV1({
		turnRunId: TURN_RUN_ID,
		logicalOperationId: LOGICAL_OPERATION_ID,
		toolName: baseStep.toolName,
		operationName: baseStep.operationName,
		arguments: baseStep.arguments
	});
	const control = {
		reserve: vi.fn(async () => {
			options.abortOnReserve?.abort(new Error('cancelled between reserve and begin'));
			return effectReceipt(stable.effectId);
		}),
		begin: vi.fn(async () =>
			effectReceipt(stable.effectId, {
				state: 'started',
				startedAt: STARTED_AT,
				outcome: 'started',
				invokeAdapter: true
			})
		),
		reconcile: vi.fn(async (input: { targetState: string; downstreamReceipt: unknown }) =>
			effectReceipt(stable.effectId, {
				state: input.targetState,
				startedAt: input.targetState === 'cancelled' ? null : STARTED_AT,
				finishedAt: FINISHED_AT,
				downstreamReceipt: input.downstreamReceipt,
				outcome: 'reconciled'
			})
		)
	};
	const mutatingTool = {
		execute: vi.fn(async () => ({ mutationId: 'mutation-1' }))
	};
	const executor = new AgenticChatFixtureMutationExecutor({
		control: control as never,
		mutatingTool
	});
	return { executor, control, mutatingTool, stable };
}

describe('AgenticChat effect identity', () => {
	it('derives logical write identity from runtime round position, never provider correlation', () => {
		const first = createStableAgenticChatMutationLogicalOperationIdV1({
			turnRunId: TURN_RUN_ID,
			providerRound: 2,
			callIndex: 3
		});
		const replay = createStableAgenticChatMutationLogicalOperationIdV1({
			turnRunId: TURN_RUN_ID,
			providerRound: 2,
			callIndex: 3
		});
		const nextCall = createStableAgenticChatMutationLogicalOperationIdV1({
			turnRunId: TURN_RUN_ID,
			providerRound: 2,
			callIndex: 4
		});

		expect(first).toBe(replay);
		expect(first).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
		);
		expect(nextCall).not.toBe(first);
	});

	it('is stable across provider ids/generations and conflicts changed arguments under one effect id', () => {
		const first = createStableAgenticChatEffectIdentityV1({
			turnRunId: TURN_RUN_ID,
			logicalOperationId: LOGICAL_OPERATION_ID,
			toolName: baseStep.toolName,
			operationName: baseStep.operationName,
			arguments: { b: 2, a: 1 }
		});
		const reordered = createStableAgenticChatEffectIdentityV1({
			turnRunId: TURN_RUN_ID,
			logicalOperationId: LOGICAL_OPERATION_ID,
			toolName: baseStep.toolName,
			operationName: baseStep.operationName,
			arguments: { a: 1, b: 2 }
		});
		const changed = createStableAgenticChatEffectIdentityV1({
			turnRunId: TURN_RUN_ID,
			logicalOperationId: LOGICAL_OPERATION_ID,
			toolName: baseStep.toolName,
			operationName: baseStep.operationName,
			arguments: { a: 1, b: 3 }
		});

		expect(first).toEqual(reordered);
		expect(changed.effectId).toBe(first.effectId);
		expect(changed.canonicalArgumentHash).not.toBe(first.canonicalArgumentHash);
		const changedOperation = createStableAgenticChatEffectIdentityV1({
			turnRunId: TURN_RUN_ID,
			logicalOperationId: LOGICAL_OPERATION_ID,
			toolName: 'different_tool',
			operationName: 'different_operation',
			arguments: { a: 1, b: 2 }
		});
		expect(changedOperation.effectId).toBe(first.effectId);
		expect(first.downstreamIdempotencyKey).toBe(`chat-effect:${first.effectId}`);
	});
});

describe('AgenticChatFixtureMutationExecutor', () => {
	it('reserves, begins, invokes once with the stable key, and records success', async () => {
		const harness = createHarness();

		await expect(
			harness.executor.execute({
				executionInput,
				processingToken: PROCESSING_TOKEN,
				step: baseStep,
				signal: new AbortController().signal
			})
		).resolves.toEqual({
			effectId: harness.stable.effectId,
			canonicalArgumentHash: harness.stable.canonicalArgumentHash,
			downstreamIdempotencyKey: harness.stable.downstreamIdempotencyKey,
			downstreamReceipt: { mutationId: 'mutation-1' },
			replayed: false
		});
		expect(harness.control.begin).toHaveBeenCalledOnce();
		expect(harness.mutatingTool.execute).toHaveBeenCalledWith(
			expect.objectContaining({
				effectId: harness.stable.effectId,
				downstreamIdempotencyKey: harness.stable.downstreamIdempotencyKey,
				providerToolCallId: 'provider-call-1'
			})
		);
		expect(harness.control.reconcile).toHaveBeenCalledWith(
			expect.objectContaining({
				targetState: 'succeeded',
				downstreamReceipt: { mutationId: 'mutation-1' }
			})
		);
	});

	it('rejects cancellation before reservation without creating an effect', async () => {
		const controller = new AbortController();
		controller.abort(new Error('cancelled before reservation'));
		const harness = createHarness();

		await expect(
			harness.executor.execute({
				executionInput,
				processingToken: PROCESSING_TOKEN,
				step: baseStep,
				signal: controller.signal
			})
		).rejects.toThrow('cancelled before reservation');
		expect(harness.control.reserve).not.toHaveBeenCalled();
		expect(harness.control.begin).not.toHaveBeenCalled();
		expect(harness.mutatingTool.execute).not.toHaveBeenCalled();
	});

	it('closes a cancelled reservation before begin and never invokes the mutator', async () => {
		const controller = new AbortController();
		const harness = createHarness({ abortOnReserve: controller });

		await expect(
			harness.executor.execute({
				executionInput,
				processingToken: PROCESSING_TOKEN,
				step: baseStep,
				signal: controller.signal
			})
		).rejects.toThrow('cancelled between reserve and begin');
		expect(harness.control.reconcile).toHaveBeenCalledWith(
			expect.objectContaining({ targetState: 'cancelled', downstreamReceipt: null })
		);
		expect(harness.control.begin).not.toHaveBeenCalled();
		expect(harness.mutatingTool.execute).not.toHaveBeenCalled();
	});

	it('replays an existing committed receipt without begin or reinvocation', async () => {
		const harness = createHarness();
		harness.control.reserve.mockResolvedValueOnce(
			effectReceipt(harness.stable.effectId, {
				state: 'succeeded',
				startedAt: STARTED_AT,
				finishedAt: FINISHED_AT,
				downstreamReceipt: { mutationId: 'prior-mutation' },
				outcome: 'existing'
			}) as never
		);

		await expect(
			harness.executor.execute({
				executionInput,
				processingToken: PROCESSING_TOKEN,
				step: { ...baseStep, providerToolCallId: 'provider-call-changed' },
				signal: new AbortController().signal
			})
		).resolves.toMatchObject({
			downstreamReceipt: { mutationId: 'prior-mutation' },
			replayed: true
		});
		expect(harness.control.begin).not.toHaveBeenCalled();
		expect(harness.mutatingTool.execute).not.toHaveBeenCalled();
		expect(harness.control.reconcile).not.toHaveBeenCalled();
	});

	it('retries an idempotent downstream with the exact same effect key', async () => {
		const harness = createHarness();
		harness.mutatingTool.execute
			.mockRejectedValueOnce(new Error('response lost after downstream accepted key'))
			.mockResolvedValueOnce({ mutationId: 'mutation-1' });

		await harness.executor.execute({
			executionInput,
			processingToken: PROCESSING_TOKEN,
			step: baseStep,
			signal: new AbortController().signal
		});
		expect(harness.mutatingTool.execute).toHaveBeenCalledTimes(2);
		expect(
			harness.mutatingTool.execute.mock.calls.map((call) => call[0].downstreamIdempotencyKey)
		).toEqual([
			harness.stable.downstreamIdempotencyKey,
			harness.stable.downstreamIdempotencyKey
		]);
	});

	it('finishes idempotent recovery with an independent signal after cancellation', async () => {
		const controller = new AbortController();
		const harness = createHarness();
		harness.mutatingTool.execute
			.mockImplementationOnce(async () => {
				controller.abort(new Error('cancelled after possible commit'));
				throw new Error('response lost after downstream accepted key');
			})
			.mockImplementationOnce(async (input) => {
				expect(input.signal).not.toBe(controller.signal);
				expect(input.signal.aborted).toBe(false);
				return { mutationId: 'mutation-1' };
			});

		await expect(
			harness.executor.execute({
				executionInput,
				processingToken: PROCESSING_TOKEN,
				step: baseStep,
				signal: controller.signal
			})
		).resolves.toMatchObject({ downstreamReceipt: { mutationId: 'mutation-1' } });
		expect(harness.mutatingTool.execute).toHaveBeenCalledTimes(2);
	});

	it('keeps an earlier ambiguous attempt uncertain when recovery fails closed', async () => {
		const harness = createHarness();
		harness.mutatingTool.execute
			.mockRejectedValueOnce(new Error('response lost after possible commit'))
			.mockRejectedValueOnce(
				new AgenticChatFixtureMutationAdapterError(
					'known_failed',
					'mutation_cancelled_before_dispatch',
					'Recovery was cancelled before dispatch'
				)
			);

		await expect(
			harness.executor.execute({
				executionInput,
				processingToken: PROCESSING_TOKEN,
				step: baseStep,
				signal: new AbortController().signal
			})
		).rejects.toMatchObject<Partial<AgenticChatEffectExecutionError>>({
			failureClass: 'uncertain_external_commit',
			effectId: harness.stable.effectId
		});
		expect(harness.control.reconcile).toHaveBeenCalledWith(
			expect.objectContaining({
				targetState: 'uncertain',
				failureCode: 'uncertain_external_commit'
			})
		);
	});

	it('marks a non-queryable crash uncertain and never retries automatically', async () => {
		const harness = createHarness();
		harness.control.reserve.mockResolvedValueOnce(
			effectReceipt(harness.stable.effectId, {
				downstreamIdempotencySupported: false
			}) as never
		);
		harness.control.begin.mockResolvedValueOnce(
			effectReceipt(harness.stable.effectId, {
				downstreamIdempotencySupported: false,
				state: 'started',
				startedAt: STARTED_AT,
				outcome: 'started',
				invokeAdapter: true
			}) as never
		);
		harness.control.reconcile.mockImplementationOnce(
			async (input) =>
				effectReceipt(harness.stable.effectId, {
					downstreamIdempotencySupported: false,
					state: input.targetState,
					startedAt: STARTED_AT,
					finishedAt: FINISHED_AT,
					outcome: 'reconciled'
				}) as never
		);
		harness.mutatingTool.execute.mockRejectedValueOnce(
			new Error('connection closed after possible commit')
		);

		const execution = harness.executor.execute({
			executionInput,
			processingToken: PROCESSING_TOKEN,
			step: { ...baseStep, downstreamIdempotencySupported: false },
			signal: new AbortController().signal
		});
		await expect(execution).rejects.toMatchObject<Partial<AgenticChatEffectExecutionError>>({
			failureClass: 'uncertain_external_commit',
			effectId: harness.stable.effectId
		});
		expect(harness.mutatingTool.execute).toHaveBeenCalledOnce();
		expect(harness.control.reconcile).toHaveBeenCalledWith(
			expect.objectContaining({
				targetState: 'uncertain',
				failureCode: 'uncertain_external_commit'
			})
		);
	});

	it('never invokes for a duplicate started receipt without explicit authority', async () => {
		const harness = createHarness();
		harness.control.reserve.mockResolvedValueOnce(
			effectReceipt(harness.stable.effectId, {
				state: 'started',
				startedAt: STARTED_AT,
				outcome: 'existing'
			}) as never
		);

		await expect(
			harness.executor.execute({
				executionInput,
				processingToken: PROCESSING_TOKEN,
				step: baseStep,
				signal: new AbortController().signal
			})
		).rejects.toMatchObject({ failureClass: 'uncertain_external_commit' });
		expect(harness.control.begin).not.toHaveBeenCalled();
		expect(harness.mutatingTool.execute).not.toHaveBeenCalled();
	});
});
