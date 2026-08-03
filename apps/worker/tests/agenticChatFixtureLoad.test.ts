import type {
	AgenticChatCancellationObservationInputV1,
	AgenticChatCancellationObservationV1,
	AgenticChatStreamDeliveryAckRpcResultV1,
	AgenticChatTextBatchFlushRpcResultV1,
	AgenticChatTextBatchInputV1
} from '@buildos/shared-types';
import { describe, expect, it } from 'vitest';
import { AgenticChatCancellationObserver } from '../src/workers/agentic-chat/cancellationObserver';
import {
	AgenticChatStreamPublisher,
	type AgenticChatPersistencePortV1,
	type AgenticChatPublisherTurnV1
} from '../src/workers/agentic-chat/streamPublisher';

const ACTIVE_TURNS = 100;
const TEXT_BYTES_PER_TURN = 1_024;

function turn(index: number): AgenticChatPublisherTurnV1 {
	const suffix = index.toString().padStart(3, '0');
	return {
		turnRunId: `turn-${suffix}`,
		queueJobId: `job-${suffix}`,
		processingToken: `token-${suffix}`,
		userId: `user-${suffix}`,
		sessionId: `session-${suffix}`,
		streamRunId: `stream-${suffix}`,
		clientTurnId: `client-${suffix}`,
		executionGeneration: 1
	};
}

function cancellation(turnRunId: string): AgenticChatCancellationObservationV1 {
	return {
		turn_run_id: turnRunId,
		execution_generation: 1,
		signal_id: `signal-${turnRunId}`,
		cancel_reason: 'user_cancelled',
		cancel_source: 'browser',
		cancel_requested_at: '2026-08-03T12:00:00.000Z',
		consumed_at: '2026-08-03T12:00:00.500Z'
	};
}

describe('Agentic Chat 100-turn fixture load', () => {
	it('uses one cancel observation and bounded worker-level text flushes', async () => {
		const turns = Array.from({ length: ACTIVE_TURNS }, (_, index) => turn(index));
		const observedBatches: AgenticChatCancellationObservationInputV1[][] = [];
		const observer = new AgenticChatCancellationObserver(
			{
				observation: {
					async observe(inputs) {
						observedBatches.push(inputs);
						return inputs
							.filter((_, index) => index % 10 === 0)
							.map((input) => cancellation(input.turn_run_id));
					}
				}
			},
			{ consumerConcurrency: ACTIVE_TURNS, rpcMaxPairs: 128 }
		);
		const cancelSignals = turns.map((context) =>
			observer.registerTurn({
				turnRunId: context.turnRunId,
				executionGeneration: context.executionGeneration
			})
		);

		await expect(observer.pollNow()).resolves.toBe(10);
		expect(observedBatches).toHaveLength(1);
		expect(observedBatches[0]).toHaveLength(ACTIVE_TURNS);
		expect(cancelSignals.filter((signal) => signal.aborted)).toHaveLength(10);

		let releaseFirstFlush!: () => void;
		const firstFlushBlocked = new Promise<void>((resolve) => {
			releaseFirstFlush = resolve;
		});
		const database = createMeasuredPersistence(turns, firstFlushBlocked);
		const publisher = new AgenticChatStreamPublisher({
			persistence: database,
			broadcast: { publish: async () => 'sent' }
		});
		publisher.start();
		for (const context of turns) publisher.registerTurn(context);

		const text = 'x'.repeat(TEXT_BYTES_PER_TURN);
		const deliveries = turns.map((context) =>
			publisher.appendText(context.turnRunId, text).delivery
		);
		const peak = publisher.getWorkerSnapshot();
		expect(peak).toMatchObject({
			registeredTurns: ACTIVE_TURNS,
			pendingBytes: ACTIVE_TURNS * TEXT_BYTES_PER_TURN,
			pendingEvents: ACTIVE_TURNS,
			pressure: 'normal',
			accepting: true,
			stopping: false
		});
		expect(peak.pendingBytes).toBeLessThan(peak.softByteLimit);
		expect(peak.pendingEvents).toBeLessThan(peak.softEventLimit);

		releaseFirstFlush();
		await expect(Promise.all(deliveries)).resolves.toEqual(
			Array(ACTIVE_TURNS).fill('broadcast_acknowledged')
		);
		expect(database.metrics).toMatchObject({
			textFlushStatements: 2,
			affectedRows: ACTIVE_TURNS,
			acknowledgementStatements: ACTIVE_TURNS,
			maxFlushBatchItems: ACTIVE_TURNS - 1
		});
		expect(database.metrics.requestPayloadBytes).toBeGreaterThan(
			ACTIVE_TURNS * TEXT_BYTES_PER_TURN
		);
		expect(publisher.getWorkerSnapshot()).toMatchObject({
			pendingBytes: 0,
			pendingEvents: 0,
			pressure: 'normal'
		});
		await expect(publisher.stop()).resolves.toMatchObject({
			drained: true,
			pendingEvents: 0,
			pendingBytes: 0
		});
		await observer.stop();
	});
});

function createMeasuredPersistence(
	turns: AgenticChatPublisherTurnV1[],
	firstFlushBlocked: Promise<void>
): AgenticChatPersistencePortV1 & {
	metrics: {
		textFlushStatements: number;
		affectedRows: number;
		acknowledgementStatements: number;
		maxFlushBatchItems: number;
		requestPayloadBytes: number;
	};
} {
	const contexts = new Map(turns.map((context) => [context.turnRunId, context]));
	const metrics = {
		textFlushStatements: 0,
		affectedRows: 0,
		acknowledgementStatements: 0,
		maxFlushBatchItems: 0,
		requestPayloadBytes: 0
	};
	return {
		metrics,
		async flushTextBatches(inputs: AgenticChatTextBatchInputV1[]) {
			metrics.textFlushStatements += 1;
			metrics.affectedRows += inputs.length;
			metrics.maxFlushBatchItems = Math.max(metrics.maxFlushBatchItems, inputs.length);
			metrics.requestPayloadBytes += Buffer.byteLength(JSON.stringify(inputs), 'utf8');
			if (metrics.textFlushStatements === 1) await firstFlushBlocked;
			return {
				outcome: 'flushed',
				input_count: inputs.length,
				persisted_count: inputs.length,
				rejected_count: 0,
				results: inputs.map((input, inputIndex) => {
					const context = contexts.get(input.turn_run_id);
					if (!context) throw new Error('Unknown fixture turn');
					return {
						outcome: 'persisted',
						publish_allowed: true,
						turn_run_id: input.turn_run_id,
						queue_job_id: input.queue_job_id,
						session_id: context.sessionId,
						user_id: context.userId,
						stream_run_id: context.streamRunId,
						client_turn_id: context.clientTurnId,
						execution_generation: input.execution_generation,
						sequence_index: 1,
						event_id: `${input.turn_run_id}:1:1`,
						phase: 'llm',
						event_type: 'text_delta',
						durable: true,
						batch_id: input.batch_id,
						text_delta: input.text_delta,
						assistant_text_bytes: Buffer.byteLength(input.assistant_text, 'utf8'),
						reconcile_required: true,
						persisted_at: '2026-08-03T12:00:01.000Z',
						input_index: inputIndex
					} as const;
				})
			} satisfies AgenticChatTextBatchFlushRpcResultV1;
		},
		async persistSemantic() {
			throw new Error('The text-only load fixture must not persist semantic events');
		},
		async acknowledge(input) {
			metrics.acknowledgementStatements += 1;
			return {
				outcome: 'acknowledged',
				turn_run_id: input.turn_run_id,
				queue_job_id: input.queue_job_id,
				execution_generation: input.execution_generation,
				acknowledged_sequence: input.acknowledged_sequence,
				current_sequence: input.acknowledged_sequence,
				reconcile_required: false
			} satisfies AgenticChatStreamDeliveryAckRpcResultV1;
		}
	};
}
