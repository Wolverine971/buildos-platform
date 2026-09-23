// apps/worker/tests/agenticChatMutationSpans.test.ts

import type { JsonObject } from '@buildos/shared-types';
import { describe, expect, it, vi } from 'vitest';
import {
	AgenticChatEffectExecutionError,
	AgenticChatMutationAdapterError,
	AgenticChatMutationExecutor,
	type AgenticChatMutationSpanV1
} from '../src/workers/agentic-chat/mutations/mutation-executor';
import { createStableAgenticChatEffectIdentityV1 } from '../src/workers/agentic-chat/effects/effect-identity';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const SESSION_ID = '20000000-0000-4000-8000-000000000002';
const TURN_RUN_ID = '30000000-0000-4000-8000-000000000003';
const QUEUE_JOB_ID = '40000000-0000-4000-8000-000000000004';
const PROCESSING_TOKEN = '50000000-0000-4000-8000-000000000005';
const LOGICAL_OPERATION_ID = '60000000-0000-4000-8000-000000000006';

const executionInput = {
	claim: {
		turnRunId: TURN_RUN_ID,
		queueJobId: QUEUE_JOB_ID,
		sessionId: SESSION_ID,
		userId: USER_ID,
		executionGeneration: 3
	}
} as never;

const step = {
	logicalOperationId: LOGICAL_OPERATION_ID,
	providerToolCallId: 'provider-call-1',
	toolName: 'fixture_project_write',
	operationName: 'update_project',
	arguments: { projectId: 'project-1', patch: { name: 'Private launch codename' } },
	downstreamIdempotencySupported: false
} as const;

const stable = createStableAgenticChatEffectIdentityV1({
	turnRunId: TURN_RUN_ID,
	logicalOperationId: LOGICAL_OPERATION_ID,
	toolName: step.toolName,
	operationName: step.operationName,
	arguments: step.arguments
});

function receipt(overrides: Record<string, unknown>) {
	return {
		effectId: stable.effectId,
		turnRunId: TURN_RUN_ID,
		executionGeneration: 3,
		sessionId: SESSION_ID,
		userId: USER_ID,
		state: 'reserved',
		downstreamIdempotencySupported: false,
		downstreamReceipt: null,
		startedAt: null,
		finishedAt: null,
		outcome: 'reserved',
		invokeAdapter: false,
		...overrides
	};
}

function harness(options: {
	execute?: () => Promise<JsonObject>;
	onSpan?: (span: AgenticChatMutationSpanV1) => void;
}) {
	const spans: AgenticChatMutationSpanV1[] = [];
	let clock = 1_000;
	const control = {
		reserve: vi.fn(async () => receipt({})),
		begin: vi.fn(async () =>
			receipt({
				state: 'started',
				outcome: 'started',
				invokeAdapter: true,
				startedAt: '2026-08-03T12:00:00.000Z'
			})
		),
		reconcile: vi.fn(async (input: { targetState: string; downstreamReceipt: unknown }) =>
			receipt({
				state: input.targetState,
				outcome: 'reconciled',
				downstreamReceipt: input.downstreamReceipt,
				startedAt: '2026-08-03T12:00:00.000Z',
				finishedAt: '2026-08-03T12:00:01.000Z'
			})
		)
	};
	const executor = new AgenticChatMutationExecutor({
		control: control as never,
		mutatingTool: {
			execute: vi.fn(options.execute ?? (async () => ({ secretReceipt: 'row-body' })))
		},
		onSpan:
			options.onSpan ??
			((span) => {
				spans.push(span);
			}),
		nowMs: () => (clock += 5)
	});
	return { executor, spans };
}

describe('Agentic Chat mutation critical-path spans', () => {
	it('emits reserve, begin, adapter, and reconcile spans without write content', async () => {
		const { executor, spans } = harness({});

		await executor.execute({
			executionInput,
			processingToken: PROCESSING_TOKEN,
			step,
			signal: new AbortController().signal
		});

		expect(spans.map((span) => [span.stage, span.state, span.durationMs])).toEqual([
			['effect_reserve', 'finished', 5],
			['effect_begin', 'finished', 5],
			['mutation_adapter', 'finished', 5],
			['effect_reconcile', 'finished', 5]
		]);
		expect(spans[0]).toMatchObject({
			turnRunId: TURN_RUN_ID,
			executionGeneration: 3,
			effectId: stable.effectId,
			toolName: step.toolName
		});
		const serialized = JSON.stringify(spans);
		expect(serialized).not.toContain('Private launch codename');
		expect(serialized).not.toContain('row-body');
	});

	it('marks a failed adapter span and still times the failure reconciliation', async () => {
		const { executor, spans } = harness({
			execute: async () => {
				throw new AgenticChatMutationAdapterError(
					'known_failed',
					'fixture_rejected',
					'Downstream rejected the write'
				);
			}
		});

		await expect(
			executor.execute({
				executionInput,
				processingToken: PROCESSING_TOKEN,
				step,
				signal: new AbortController().signal
			})
		).rejects.toBeInstanceOf(AgenticChatEffectExecutionError);
		expect(spans.map((span) => [span.stage, span.state])).toEqual([
			['effect_reserve', 'finished'],
			['effect_begin', 'finished'],
			['mutation_adapter', 'failed'],
			['effect_reconcile', 'finished']
		]);
	});

	it('cannot change the effect outcome when the span sink throws', async () => {
		const { executor } = harness({
			onSpan: () => {
				throw new Error('telemetry sink unavailable');
			}
		});

		await expect(
			executor.execute({
				executionInput,
				processingToken: PROCESSING_TOKEN,
				step,
				signal: new AbortController().signal
			})
		).resolves.toMatchObject({ effectId: stable.effectId, replayed: false });
	});
});
