// apps/worker/tests/agenticChatStreamPublisher.test.ts

import { deferred } from './helpers/deferred';
import { describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type {
	AgenticChatSemanticEventRpcResultV1,
	AgenticChatStreamDeliveryAckRpcResultV1,
	AgenticChatTextBatchFlushRpcResultV1,
	AgenticChatTextBatchInputV1
} from '@buildos/shared-types';
import {
	AgenticChatPublisherOverloadError,
	AgenticChatStreamPublisher,
	type AgenticChatBroadcastMessageV1,
	type AgenticChatPersistencePortV1,
	type AgenticChatPublisherTurnV1
} from '../src/workers/agentic-chat/stream/stream-publisher';
import {
	SupabaseAgenticChatBroadcastAdapter,
	SupabaseAgenticChatPersistenceAdapter
} from '../src/workers/agentic-chat/stream/supabase-stream-publisher-adapters';

function turn(suffix: string): AgenticChatPublisherTurnV1 {
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

const subscriptionTestMessage = {
	kind: 'reconcile_hint',
	topic: 'chat-user:user-subscribe',
	event: 'agent-stream-reconcile',
	payload: {
		contract_version: 'agentic_chat_worker_v1',
		turn_run_id: 'turn-subscribe',
		session_id: 'session-subscribe',
		execution_generation: 1,
		durable_through_sequence: 0
	}
} as const;

function createPersistence(
	turns: AgenticChatPublisherTurnV1[],
	log: string[] = []
): AgenticChatPersistencePortV1 & { textCalls: AgenticChatTextBatchInputV1[][] } {
	const contexts = new Map(turns.map((context) => [context.turnRunId, context]));
	const sequences = new Map<string, number>();
	const textCalls: AgenticChatTextBatchInputV1[][] = [];
	return {
		textCalls,
		async flushTextBatches(inputs) {
			textCalls.push(inputs);
			log.push(`persist:text:${inputs.map((input) => input.turn_run_id).join(',')}`);
			const results = inputs.map((input, inputIndex) => {
				const context = contexts.get(input.turn_run_id)!;
				const sequence = (sequences.get(input.turn_run_id) ?? 0) + 1;
				sequences.set(input.turn_run_id, sequence);
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
					sequence_index: sequence,
					event_id: `${input.turn_run_id}:1:${sequence}`,
					phase: 'llm',
					event_type: 'text_delta',
					durable: true,
					batch_id: input.batch_id,
					text_delta: input.text_delta,
					assistant_text_bytes: Buffer.byteLength(input.assistant_text),
					reconcile_required: true,
					persisted_at: '2026-08-02T20:00:00.000Z',
					input_index: inputIndex
				} as const;
			});
			return {
				outcome: 'flushed',
				input_count: inputs.length,
				persisted_count: inputs.length,
				rejected_count: 0,
				results
			} satisfies AgenticChatTextBatchFlushRpcResultV1;
		},
		async persistSemantic(input) {
			const context = contexts.get(input.turn_run_id)!;
			const sequence = (sequences.get(input.turn_run_id) ?? 0) + 1;
			sequences.set(input.turn_run_id, sequence);
			log.push(`persist:semantic:${input.event_type}`);
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
				sequence_index: sequence,
				event_id: `${input.turn_run_id}:1:${sequence}`,
				phase: input.phase,
				event_type: input.event_type,
				durable: true,
				transition_id: input.transition_id,
				event_payload: input.event_payload,
				reconcile_required: true,
				persisted_at: '2026-08-02T20:00:00.000Z'
			} satisfies AgenticChatSemanticEventRpcResultV1;
		},
		async acknowledge(input) {
			log.push(`ack:${input.turn_run_id}:${input.acknowledged_sequence}`);
			// Mirror acknowledge_agentic_chat_stream_delivery: only the exact current
			// durable sequence clears reconciliation. A committed terminal receipt is
			// written by a larger transaction outside this fixture's counter.
			let current = sequences.get(input.turn_run_id) ?? 0;
			if (input.acknowledged_sequence === current + 1) {
				current = input.acknowledged_sequence;
				sequences.set(input.turn_run_id, current);
			}
			if (input.acknowledged_sequence > current) {
				throw Object.assign(new Error('agentic_chat_stream_ack_future_sequence'), {
					code: 'P0001'
				});
			}
			const receipt = {
				turn_run_id: input.turn_run_id,
				queue_job_id: input.queue_job_id,
				execution_generation: input.execution_generation,
				acknowledged_sequence: input.acknowledged_sequence,
				current_sequence: current
			};
			return input.acknowledged_sequence < current
				? ({
						...receipt,
						outcome: 'newer_snapshot',
						reconcile_required: true
					} satisfies AgenticChatStreamDeliveryAckRpcResultV1)
				: ({
						...receipt,
						outcome: 'acknowledged',
						reconcile_required: false
					} satisfies AgenticChatStreamDeliveryAckRpcResultV1);
		}
	};
}

function createBroadcast(log: string[] = [], results: Array<'sent' | 'failed'> = []) {
	const messages: AgenticChatBroadcastMessageV1[] = [];
	return {
		messages,
		async publish(message: AgenticChatBroadcastMessageV1) {
			messages.push(message);
			log.push(`broadcast:${message.kind}`);
			return results.shift() ?? ('sent' as const);
		}
	};
}

describe('AgenticChatStreamPublisher', () => {
	it('traces slow persistence, retries, and pressure without accepting early or leaking payloads', async () => {
		vi.useFakeTimers();
		const context = turn('traced');
		const persistence = createPersistence([context]);
		const persist = persistence.persistSemantic.bind(persistence);
		let attempts = 0;
		persistence.persistSemantic = async (input) => {
			attempts++;
			await new Promise((resolve) => setTimeout(resolve, attempts === 1 ? 1000 : 200));
			if (attempts === 1)
				throw Object.assign(new Error('private-database-body'), { code: '40001' });
			return persist(input);
		};
		const traces: import('../src/workers/agentic-chat/effects/persistence-trace').AgenticChatPersistenceTraceV1[] =
			[];
		const publisher = new AgenticChatStreamPublisher(
			{
				persistence,
				broadcast: createBroadcast(),
				onTrace: (trace) => {
					traces.push(trace);
					throw new Error('trace sink down');
				}
			},
			{ turnPendingSoftEvents: 1, flushIntervalMs: 10 }
		);
		publisher.start();
		publisher.registerTurn(context);
		try {
			const queued = publisher.enqueueSemantic(context.turnRunId, {
				transitionId: 'traced-operation',
				phase: 'stream',
				eventType: 'agent_state',
				projection: { private: 'private-document-content' },
				eventPayload: { type: 'agent_state', details: 'private-document-content' }
			});
			let accepted = false;
			void queued.accepted.then(() => {
				accepted = true;
			});
			await vi.advanceTimersByTimeAsync(999);
			expect(accepted).toBe(false);
			await vi.advanceTimersByTimeAsync(1001);
			await expect(queued.accepted).resolves.toMatchObject({
				outcome: 'persisted',
				sequenceIndex: 1
			});
			await queued.delivery;
			await queued.pressureRelieved;
			expect(traces.filter((t) => t.stage === 'attempt_finished')).toMatchObject([
				{ attempt: 1, durationMs: 1000, outcome: 'failed', errorCode: '40001' },
				{ attempt: 2, durationMs: 200, outcome: 'persisted' }
			]);
			expect(traces.find((t) => t.stage === 'retry_scheduled')).toMatchObject({
				retryDelayMs: 250
			});
			expect(
				traces.find((t) => t.stage === 'attempt_started' && t.attempt === 2)?.retryWaitMs
			).toBeGreaterThanOrEqual(250);
			expect(
				traces.find((t) => t.stage === 'accepted')?.enqueueToReceiptMs
			).toBeGreaterThanOrEqual(1450);
			expect(traces.find((t) => t.stage === 'pressure_finished')).toMatchObject({
				outcome: 'relieved'
			});
			expect(JSON.stringify(traces)).not.toContain('private-');
			expect(JSON.stringify(traces)).not.toContain(context.processingToken);
		} finally {
			await publisher.stop();
			vi.useRealTimers();
		}
	});

	it('emits a claim-time reconcile hint without a durable stream write', async () => {
		const context = turn('claimed');
		const broadcast = createBroadcast();
		const publisher = new AgenticChatStreamPublisher({
			persistence: createPersistence([context]),
			broadcast
		});
		publisher.start();
		publisher.registerTurn(context);

		await publisher.publishReconcileHint(context.turnRunId);

		expect(broadcast.messages).toEqual([
			expect.objectContaining({
				kind: 'reconcile_hint',
				topic: `chat-user:${context.userId}`,
				payload: expect.objectContaining({
					turn_run_id: context.turnRunId,
					session_id: context.sessionId,
					durable_through_sequence: 0
				})
			})
		]);
		expect(publisher.getSnapshot(context.turnRunId).durableSequence).toBe(0);
		await publisher.stop();
	});

	it('persists first text before Broadcast and exact-sequence acknowledgement', async () => {
		const log: string[] = [];
		const observations: unknown[] = [];
		const deliveryObservations: unknown[] = [];
		const context = {
			...turn('first'),
			onPersistenceObserved(observation) {
				observations.push(observation);
				log.push(`observe:${observation.eventType}`);
			},
			onDeliveryObserved(observation) {
				deliveryObservations.push(observation);
			}
		} satisfies AgenticChatPublisherTurnV1;
		const persistence = createPersistence([context], log);
		const broadcast = createBroadcast(log);
		const publisher = new AgenticChatStreamPublisher({ persistence, broadcast });
		publisher.start();
		publisher.registerTurn(context);

		const queued = publisher.appendText(context.turnRunId, 'Hello');
		await expect(queued.delivery).resolves.toBe('broadcast_acknowledged');
		expect(log).toEqual([
			`persist:text:${context.turnRunId}`,
			'observe:text_delta',
			'broadcast:event',
			`ack:${context.turnRunId}:1`
		]);
		expect(observations).toEqual([
			{
				turnRunId: context.turnRunId,
				executionGeneration: 1,
				sequenceIndex: 1,
				phase: 'llm',
				eventType: 'text_delta',
				persistedAt: '2026-08-02T20:00:00.000Z'
			}
		]);
		expect(deliveryObservations).toEqual([
			expect.objectContaining({
				turnRunId: context.turnRunId,
				executionGeneration: 1,
				sequenceIndex: 1,
				eventType: 'text_delta',
				delivery: 'broadcast_acknowledged',
				queueingMs: expect.any(Number),
				deliveryDecisionMs: expect.any(Number),
				durableAcknowledgementMs: expect.any(Number),
				totalDeliveryMs: expect.any(Number)
			})
		]);
		expect(broadcast.messages[0]).toMatchObject({
			topic: `chat-user:${context.userId}`,
			payload: { event_id: `${context.turnRunId}:1:1`, text_delta: 'Hello' }
		});
		await publisher.stop();
	});

	it('accepts newer durable progress before delayed Broadcast and covers both events with one exact ACK', async () => {
		const context = turn('durable-before-delivery');
		const persistence = createPersistence([context]);
		const broadcastGate = deferred<'sent'>();
		const acknowledgementGate = deferred<void>();
		const exactAcknowledge = persistence.acknowledge.bind(persistence);
		persistence.acknowledge = vi.fn(async (input) => {
			await acknowledgementGate.promise;
			return exactAcknowledge(input);
		});
		const broadcast = {
			publish: vi.fn(async (_message: AgenticChatBroadcastMessageV1) => broadcastGate.promise)
		};
		const publisher = new AgenticChatStreamPublisher({ persistence, broadcast });
		publisher.start();
		publisher.registerTurn(context);

		const first = publisher.enqueueSemantic(context.turnRunId, {
			transitionId: 'durable-before-delivery-transition',
			phase: 'stream',
			eventType: 'turn_phase',
			projection: { current_activity: 'Gathering project context' },
			eventPayload: {
				type: 'turn_phase',
				turn_phase: 'acknowledged',
				message: 'Gathering project context'
			}
		});
		let firstDeliverySettled = false;
		void first.delivery.finally(() => {
			firstDeliverySettled = true;
		});

		await expect(first.accepted).resolves.toEqual({
			outcome: 'persisted',
			turnRunId: context.turnRunId,
			executionGeneration: 1,
			sequenceIndex: 1,
			phase: 'stream',
			eventType: 'turn_phase',
			persistedAt: '2026-08-02T20:00:00.000Z'
		});
		expect(firstDeliverySettled).toBe(false);
		expect(persistence.acknowledge).not.toHaveBeenCalled();

		const second = publisher.enqueueSemantic(context.turnRunId, {
			transitionId: 'durable-before-delivery-transition-2',
			phase: 'prompt',
			eventType: 'context_snapshot',
			projection: { current_activity: 'Project context ready' },
			eventPayload: { type: 'context_snapshot', message: 'Project context ready' }
		});
		let secondDeliverySettled = false;
		void second.delivery.finally(() => {
			secondDeliverySettled = true;
		});
		await expect(second.accepted).resolves.toMatchObject({
			outcome: 'persisted',
			sequenceIndex: 2,
			eventType: 'context_snapshot'
		});
		expect(firstDeliverySettled).toBe(false);
		expect(secondDeliverySettled).toBe(false);
		expect(publisher.getSnapshot(context.turnRunId)).toMatchObject({
			durableSequence: 2,
			pendingEvents: 2
		});

		broadcastGate.resolve('sent');
		await vi.waitFor(() => expect(persistence.acknowledge).toHaveBeenCalledOnce());
		expect(firstDeliverySettled).toBe(false);
		expect(secondDeliverySettled).toBe(false);
		expect(persistence.acknowledge).toHaveBeenCalledWith(
			expect.objectContaining({ acknowledged_sequence: 2 })
		);
		acknowledgementGate.resolve();
		await expect(Promise.all([first.delivery, second.delivery])).resolves.toEqual([
			'broadcast_acknowledged',
			'broadcast_acknowledged'
		]);
		expect(broadcast.publish.mock.calls.map(([message]) => message.kind)).toEqual([
			'event',
			'event'
		]);
		expect(publisher.getSnapshot(context.turnRunId).reconcileOnly).toBe(false);
		await publisher.stop();
	});

	it('keeps live delivery when its own later durable write supersedes an ACK', async () => {
		const context = turn('own-supersession');
		const persistence = createPersistence([context]);
		const acknowledgementGate = deferred<void>();
		const exactAcknowledge = persistence.acknowledge.bind(persistence);
		const acknowledged: number[] = [];
		persistence.acknowledge = vi.fn(async (input) => {
			acknowledged.push(input.acknowledged_sequence);
			if (input.acknowledged_sequence === 1) await acknowledgementGate.promise;
			return exactAcknowledge(input);
		});
		const broadcast = createBroadcast();
		const publisher = new AgenticChatStreamPublisher({ persistence, broadcast });
		publisher.start();
		publisher.registerTurn(context);

		const text = publisher.appendText(context.turnRunId, 'Reading the project');
		await text.accepted;
		await vi.waitFor(() => expect(acknowledged).toEqual([1]));
		const semantic = publisher.enqueueSemantic(context.turnRunId, {
			transitionId: 'own-supersession-transition',
			phase: 'tool',
			eventType: 'tool_call',
			projection: { phase: 'tool' },
			eventPayload: { type: 'tool_call', tool_name: 'onto_project_read' }
		});
		await expect(semantic.accepted).resolves.toMatchObject({ sequenceIndex: 2 });
		acknowledgementGate.resolve();

		// The database refuses ACK 1 once sequence 2 exists. That is supersession by
		// this turn's own ordered work, not delivery uncertainty.
		await expect(Promise.all([text.delivery, semantic.delivery])).resolves.toEqual([
			'broadcast_sent_reconcile_pending',
			'broadcast_acknowledged'
		]);
		expect(acknowledged).toEqual([1, 2]);
		expect(broadcast.messages.map((message) => message.kind)).toEqual(['event', 'event']);
		expect(publisher.getSnapshot(context.turnRunId).reconcileOnly).toBe(false);
		await publisher.stop();
	});

	it('does not accept semantic progress when persistence rejects the write', async () => {
		const context = turn('semantic-persistence-rejected');
		const persistence = createPersistence([context]);
		persistence.persistSemantic = vi.fn(async () => {
			throw Object.assign(new Error('semantic write rejected'), { code: 'P0001' });
		});
		const broadcast = createBroadcast();
		const publisher = new AgenticChatStreamPublisher({ persistence, broadcast });
		publisher.start();
		publisher.registerTurn(context);

		const publication = publisher.enqueueSemantic(context.turnRunId, {
			transitionId: 'semantic-persistence-rejected-transition',
			phase: 'stream',
			eventType: 'turn_phase',
			projection: { current_activity: 'Gathering project context' },
			eventPayload: { type: 'turn_phase' }
		});

		await Promise.all([
			expect(publication.accepted).rejects.toThrow('persistence_error:P0001'),
			expect(publication.delivery).rejects.toThrow('persistence_error:P0001')
		]);
		expect(broadcast.messages).toHaveLength(0);
		expect(publisher.getSnapshot(context.turnRunId)).toMatchObject({
			durableSequence: 0,
			blockedReason: 'persistence_rejected'
		});
		await publisher.stop();
	});

	it('rejects stale-generation acceptance without Broadcast or acknowledgement', async () => {
		const context = turn('stale-semantic');
		const persistence = createPersistence([context]);
		persistence.persistSemantic = vi.fn(async (input) => ({
			outcome: 'stale_generation' as const,
			publish_allowed: false as const,
			turn_run_id: input.turn_run_id,
			queue_job_id: input.queue_job_id,
			requested_execution_generation: input.execution_generation,
			execution_generation: input.execution_generation + 1,
			status: 'running' as const
		}));
		const acknowledge = vi.spyOn(persistence, 'acknowledge');
		const broadcast = createBroadcast();
		const publisher = new AgenticChatStreamPublisher({ persistence, broadcast });
		publisher.start();
		publisher.registerTurn(context);

		const publication = publisher.enqueueSemantic(context.turnRunId, {
			transitionId: 'stale-semantic-transition',
			phase: 'stream',
			eventType: 'turn_phase',
			projection: { current_activity: 'Stale worker' },
			eventPayload: { type: 'turn_phase' }
		});

		await Promise.all([
			expect(publication.accepted).rejects.toThrow('stale_generation'),
			expect(publication.delivery).rejects.toThrow('stale_generation')
		]);
		expect(broadcast.messages).toHaveLength(0);
		expect(acknowledge).not.toHaveBeenCalled();
		expect(publisher.getSnapshot(context.turnRunId)).toMatchObject({
			durableSequence: 0,
			blockedReason: 'ownership_lost'
		});
		await publisher.stop();
	});

	it('settles delayed delivery when a turn is abandoned after durable acceptance', async () => {
		const context = turn('abandon-delivery');
		const broadcastGate = deferred<'sent'>();
		const persistence = createPersistence([context]);
		const acknowledge = vi.spyOn(persistence, 'acknowledge');
		const publisher = new AgenticChatStreamPublisher({
			persistence,
			broadcast: { publish: async () => broadcastGate.promise }
		});
		publisher.start();
		publisher.registerTurn(context);
		const publication = publisher.enqueueSemantic(context.turnRunId, {
			transitionId: 'abandon-delivery-transition',
			phase: 'stream',
			eventType: 'turn_phase',
			projection: { current_activity: 'Gathering project context' },
			eventPayload: { type: 'turn_phase' }
		});

		await expect(publication.accepted).resolves.toMatchObject({
			outcome: 'persisted',
			sequenceIndex: 1
		});
		publisher.abandonTurn(context.turnRunId, 'cancel_requested');
		await expect(publication.delivery).rejects.toThrow('cancel_requested');
		broadcastGate.resolve('sent');
		await vi.waitFor(() => expect(acknowledge).not.toHaveBeenCalled());
		await publisher.stop();
	});

	it('bounds persisted delivery backlog and settles it when shutdown drain expires', async () => {
		vi.useFakeTimers();
		try {
			const context = turn('bounded-delivery-backlog');
			const broadcastGate = deferred<'sent'>();
			const publisher = new AgenticChatStreamPublisher(
				{
					persistence: createPersistence([context]),
					broadcast: { publish: async () => broadcastGate.promise }
				},
				{
					turnPendingSoftEvents: 1,
					turnPendingHardEvents: 2,
					workerPendingSoftEvents: 4,
					workerPendingHardEvents: 8,
					shutdownDrainTimeoutMs: 25
				}
			);
			publisher.start();
			publisher.registerTurn(context);
			const first = publisher.enqueueSemantic(context.turnRunId, {
				transitionId: 'bounded-delivery-backlog-1',
				phase: 'stream',
				eventType: 'turn_phase',
				projection: { current_activity: 'First durable event' },
				eventPayload: { type: 'turn_phase' }
			});
			await first.accepted;
			const second = publisher.enqueueSemantic(context.turnRunId, {
				transitionId: 'bounded-delivery-backlog-2',
				phase: 'prompt',
				eventType: 'context_snapshot',
				projection: { current_activity: 'Second durable event' },
				eventPayload: { type: 'context_snapshot' }
			});
			await second.accepted;
			expect(second.pressure).toBe('soft_limit');
			expect(publisher.getSnapshot(context.turnRunId).pendingEvents).toBe(2);

			const deliveryRejections = Promise.all([
				expect(first.delivery).rejects.toThrow('publisher_shutdown_drain_timeout'),
				expect(second.delivery).rejects.toThrow('publisher_shutdown_drain_timeout')
			]);
			const stopping = publisher.stop();
			await vi.advanceTimersByTimeAsync(25);
			await expect(stopping).resolves.toMatchObject({
				drained: false,
				pendingEvents: 2
			});
			await deliveryRejections;
			expect(publisher.getWorkerSnapshot()).toMatchObject({
				pendingEvents: 0,
				pendingBytes: 0,
				pressure: 'normal'
			});
			broadcastGate.resolve('sent');
			await vi.runAllTimersAsync();
		} finally {
			vi.useRealTimers();
		}
	});

	it('coalesces adjacent text and keeps a semantic transition behind its prefix', async () => {
		const context = turn('ordered');
		const log: string[] = [];
		const persistence = createPersistence([context], log);
		const publisher = new AgenticChatStreamPublisher({
			persistence,
			broadcast: createBroadcast(log)
		});
		publisher.start();
		publisher.registerTurn(context);
		await publisher.appendText(context.turnRunId, 'A').delivery;
		log.length = 0;

		const left = publisher.appendText(context.turnRunId, 'B');
		const right = publisher.appendText(context.turnRunId, 'C');
		const semantic = publisher.publishSemantic(context.turnRunId, {
			transitionId: 'transition-1',
			phase: 'tool',
			eventType: 'tool_call',
			projection: { phase: 'tool' },
			eventPayload: { type: 'tool_call', tool_name: 'onto_project_read' }
		});

		await Promise.all([left.delivery, right.delivery, semantic]);
		expect(publisher.getSnapshot(context.turnRunId)).toMatchObject({
			durableSequence: 3,
			reconcileOnly: false
		});
		expect(persistence.textCalls.at(-1)?.[0]).toMatchObject({
			text_delta: 'BC',
			assistant_text: 'ABC'
		});
		// Both accepted events leave in one ordered delivery run. The database
		// refuses ACK 2 once sequence 3 exists, so only the exact ACK 3 is sent.
		expect(log).toEqual([
			`persist:text:${context.turnRunId}`,
			'broadcast:event',
			'persist:semantic:tool_call',
			'broadcast:event',
			`ack:${context.turnRunId}:3`
		]);
		await publisher.stop();
	});

	it('flushes ready text for multiple turns through one worker-level batch', async () => {
		vi.useFakeTimers();
		try {
			const first = turn('batch-a');
			const second = turn('batch-b');
			const persistence = createPersistence([first, second]);
			const publisher = new AgenticChatStreamPublisher(
				{ persistence, broadcast: createBroadcast() },
				{ flushIntervalMs: 5, textBatchTargetBytes: 100 }
			);
			publisher.start();
			publisher.registerTurn(first);
			publisher.registerTurn(second);
			await Promise.all([
				publisher.appendText(first.turnRunId, 'A').delivery,
				publisher.appendText(second.turnRunId, 'B').delivery
			]);

			const firstSteady = publisher.appendText(first.turnRunId, '1');
			const secondSteady = publisher.appendText(second.turnRunId, '2');
			await vi.advanceTimersByTimeAsync(5);
			await Promise.all([firstSteady.delivery, secondSteady.delivery]);

			expect(persistence.textCalls.at(-1)?.map((input) => input.turn_run_id)).toEqual([
				first.turnRunId,
				second.turnRunId
			]);
			await publisher.stop();
		} finally {
			vi.useRealTimers();
		}
	});

	it('enters reconcile-only mode on replay and never Broadcasts without authority', async () => {
		const context = turn('replay');
		const base = createPersistence([context]);
		base.flushTextBatches = async (inputs) => ({
			outcome: 'flushed',
			input_count: 1,
			persisted_count: 0,
			rejected_count: 0,
			results: [
				{
					outcome: 'already_persisted',
					publish_allowed: false,
					turn_run_id: context.turnRunId,
					queue_job_id: context.queueJobId,
					session_id: context.sessionId,
					user_id: context.userId,
					stream_run_id: context.streamRunId,
					client_turn_id: context.clientTurnId,
					execution_generation: 1,
					sequence_index: 1,
					event_id: `${context.turnRunId}:1:1`,
					phase: 'llm',
					event_type: 'text_delta',
					durable: true,
					batch_id: inputs[0]!.batch_id,
					assistant_text_bytes: 5,
					input_index: 0
				}
			]
		});
		const broadcast = createBroadcast();
		const publisher = new AgenticChatStreamPublisher({ persistence: base, broadcast });
		publisher.start();
		publisher.registerTurn(context);

		await expect(publisher.appendText(context.turnRunId, 'Hello').delivery).resolves.toBe(
			'already_persisted'
		);
		expect(broadcast.messages).toHaveLength(1);
		expect(broadcast.messages[0]?.kind).toBe('reconcile_hint');
		expect(publisher.getSnapshot(context.turnRunId).reconcileOnly).toBe(true);
		await publisher.stop();
	});

	it('suppresses duplicate semantic Broadcast after a persisted response is lost', async () => {
		const context = turn('semantic-replay');
		const base = createPersistence([context]);
		const transitionId = '60000000-0000-5000-8000-000000000006';
		base.persistSemantic = vi.fn<AgenticChatPersistencePortV1['persistSemantic']>(
			async (input) => ({
				outcome: 'already_persisted',
				publish_allowed: false,
				turn_run_id: context.turnRunId,
				queue_job_id: context.queueJobId,
				session_id: context.sessionId,
				user_id: context.userId,
				stream_run_id: context.streamRunId,
				client_turn_id: context.clientTurnId,
				execution_generation: context.executionGeneration,
				sequence_index: 1,
				event_id: `${context.turnRunId}:1:1`,
				phase: input.phase,
				event_type: input.event_type,
				durable: true,
				transition_id: input.transition_id,
				event_payload: input.event_payload
			})
		);
		const broadcast = createBroadcast();
		const publisher = new AgenticChatStreamPublisher({ persistence: base, broadcast });
		publisher.start();
		publisher.registerTurn(context);

		await expect(
			publisher.publishSemantic(context.turnRunId, {
				transitionId,
				phase: 'stream',
				eventType: 'turn_phase',
				projection: { current_activity: 'Finalizing the response...' },
				eventPayload: {
					type: 'turn_phase',
					turn_phase: 'finalizing',
					message: 'Finalizing the response...'
				}
			})
		).resolves.toBe('already_persisted');
		expect(base.persistSemantic).toHaveBeenCalledWith(
			expect.objectContaining({ transition_id: transitionId })
		);
		expect(broadcast.messages.map((message) => message.kind)).toEqual(['reconcile_hint']);
		expect(publisher.getSnapshot(context.turnRunId).reconcileOnly).toBe(true);
		await publisher.stop();
	});

	it('suppresses later live events after Broadcast failure and emits only a reconcile hint', async () => {
		const context = turn('degraded');
		const persistence = createPersistence([context]);
		const broadcast = createBroadcast([], ['failed', 'sent']);
		const publisher = new AgenticChatStreamPublisher(
			{ persistence, broadcast, now: () => 100 },
			{ reconcileHintIntervalMs: 1 }
		);
		publisher.start();
		publisher.registerTurn(context);

		await expect(publisher.appendText(context.turnRunId, 'A').delivery).resolves.toBe(
			'reconcile_only'
		);
		const later = publisher.appendText(context.turnRunId, 'B');
		await publisher.flushTurn(context.turnRunId);
		await later.delivery;
		await publisher.publishSemantic(context.turnRunId, {
			transitionId: 'degraded-transition',
			phase: 'tool',
			eventType: 'tool_call',
			projection: { phase: 'tool' },
			eventPayload: { type: 'tool_call' }
		});

		expect(broadcast.messages.map((message) => message.kind)).toEqual([
			'event',
			'reconcile_hint'
		]);
		expect(publisher.getSnapshot(context.turnRunId).reconcileOnly).toBe(true);
		await publisher.stop();
	});

	it('keeps reconciliation required when acknowledgement reports a newer snapshot', async () => {
		const context = turn('ack-newer');
		const persistence = createPersistence([context]);
		persistence.acknowledge = async (input) => ({
			outcome: 'newer_snapshot',
			turn_run_id: input.turn_run_id,
			queue_job_id: input.queue_job_id,
			execution_generation: input.execution_generation,
			acknowledged_sequence: input.acknowledged_sequence,
			current_sequence: input.acknowledged_sequence + 1,
			reconcile_required: true
		});
		const publisher = new AgenticChatStreamPublisher({
			persistence,
			broadcast: createBroadcast()
		});
		publisher.start();
		publisher.registerTurn(context);

		await expect(publisher.appendText(context.turnRunId, 'A').delivery).resolves.toBe(
			'broadcast_sent_reconcile_pending'
		);
		expect(publisher.getSnapshot(context.turnRunId).reconcileOnly).toBe(true);
		await publisher.stop();
	});

	it('does not retry a permanent isolated-row rejection', async () => {
		const context = turn('rejected');
		const base = createPersistence([context]);
		base.flushTextBatches = vi.fn<AgenticChatPersistencePortV1['flushTextBatches']>(
			async () => ({
				outcome: 'flushed',
				input_count: 1,
				persisted_count: 0,
				rejected_count: 1,
				results: [
					{
						outcome: 'rejected',
						publish_allowed: false,
						input_index: 0,
						error_code: 'P0001',
						error_message: 'agentic_chat_text_write_prefix_conflict'
					}
				]
			})
		);
		const broadcast = createBroadcast();
		const publisher = new AgenticChatStreamPublisher({ persistence: base, broadcast });
		publisher.start();
		publisher.registerTurn(context);

		const publication = publisher.appendText(context.turnRunId, 'bad prefix');
		await Promise.all([
			expect(publication.accepted).rejects.toThrow('rejected:P0001'),
			expect(publication.delivery).rejects.toThrow('rejected:P0001')
		]);
		expect(base.flushTextBatches).toHaveBeenCalledOnce();
		expect(broadcast.messages).toHaveLength(0);
		expect(publisher.getSnapshot(context.turnRunId).blockedReason).toBe('persistence_rejected');
		await publisher.stop();
	});

	it('provides pressure relief and fails closed with the complete prefix at the hard bound', async () => {
		const context = turn('pressure');
		const gate = deferred<void>();
		const base = createPersistence([context]);
		const originalFlush = base.flushTextBatches.bind(base);
		let firstFlush = true;
		base.flushTextBatches = async (inputs) => {
			if (firstFlush) {
				firstFlush = false;
				await gate.promise;
			}
			return await originalFlush(inputs);
		};
		const overloaded = vi.fn();
		context.onOverload = overloaded;
		const publisher = new AgenticChatStreamPublisher(
			{ persistence: base, broadcast: createBroadcast() },
			{
				flushIntervalMs: 10_000,
				textBatchTargetBytes: 12,
				turnPendingSoftBytes: 5,
				turnPendingHardBytes: 10,
				workerPendingSoftBytes: 100,
				workerPendingHardBytes: 200,
				turnPendingSoftEvents: 2,
				turnPendingHardEvents: 8,
				workerPendingSoftEvents: 10,
				workerPendingHardEvents: 20
			}
		);
		publisher.start();
		publisher.registerTurn(context);

		const first = publisher.appendText(context.turnRunId, '1234');
		const pressured = publisher.appendText(context.turnRunId, '567');
		expect(pressured.pressure).toBe('soft_limit');
		expect(pressured.pressureRelieved).not.toBeNull();
		gate.resolve();
		await Promise.all([first.delivery, pressured.delivery, pressured.pressureRelieved]);

		const held = deferred<void>();
		base.flushTextBatches = async (inputs) => {
			await held.promise;
			return await originalFlush(inputs);
		};
		const pending = publisher.appendText(context.turnRunId, '89');
		const pendingRejections = Promise.all([
			expect(pending.accepted).rejects.toBeInstanceOf(AgenticChatPublisherOverloadError),
			expect(pending.delivery).rejects.toBeInstanceOf(AgenticChatPublisherOverloadError)
		]);
		expect(() => publisher.appendText(context.turnRunId, 'abcdefghij')).toThrow(
			AgenticChatPublisherOverloadError
		);
		await pendingRejections;
		expect(overloaded).toHaveBeenCalledOnce();
		expect(overloaded.mock.calls[0]?.[0]).toMatchObject({
			code: 'publisher_overload',
			assistantText: '123456789abcdefghij'
		});
		held.resolve();
		await publisher.stop();
	});

	it('bounds terminal Broadcast retries after terminal truth commits', async () => {
		const context = turn('terminal');
		const broadcast = createBroadcast([], ['failed', 'failed', 'failed']);
		const publisher = new AgenticChatStreamPublisher({
			persistence: createPersistence([context]),
			broadcast,
			sleep: async () => undefined
		});
		publisher.start();
		publisher.registerTurn(context);

		await expect(
			publisher.publishTerminal(
				context.turnRunId,
				{
					turn_run_id: context.turnRunId,
					session_id: context.sessionId,
					user_id: context.userId,
					queue_job_id: context.queueJobId,
					execution_generation: 1,
					status: 'completed',
					finished_reason: 'stop',
					failure_code: null,
					assistant_message_id: 'message-terminal',
					terminal_event_id: `${context.turnRunId}:1:1`,
					terminal_sequence_index: 1,
					terminalized_at: '2026-08-02T20:00:00.000Z'
				},
				{ type: 'done', status: 'completed' }
			)
		).resolves.toBe('reconcile_only');
		expect(broadcast.messages).toHaveLength(3);
		await publisher.stop();
	});

	it('reconnects after a failed terminal send instead of retrying the dead channel', async () => {
		const context = turn('terminal-reconnect');
		const channels: Array<{
			send: ReturnType<typeof vi.fn>;
			subscribe: ReturnType<typeof vi.fn>;
		}> = [];
		const client = {
			channel: vi.fn(() => {
				const sendResult = channels.length === 0 ? 'failed' : 'ok';
				const channel = {
					send: vi.fn().mockResolvedValue(sendResult),
					subscribe: vi.fn((callback: (status: 'SUBSCRIBED') => void) => {
						callback('SUBSCRIBED');
						return channel;
					})
				};
				channels.push(channel);
				return channel;
			}),
			removeChannel: vi.fn().mockResolvedValue(undefined)
		};
		const broadcast = new SupabaseAgenticChatBroadcastAdapter(client);
		const publisher = new AgenticChatStreamPublisher({
			persistence: createPersistence([context]),
			broadcast,
			sleep: async () => undefined
		});
		publisher.start();
		publisher.registerTurn(context);

		await expect(
			publisher.publishTerminal(
				context.turnRunId,
				{
					turn_run_id: context.turnRunId,
					session_id: context.sessionId,
					user_id: context.userId,
					queue_job_id: context.queueJobId,
					execution_generation: 1,
					status: 'completed',
					finished_reason: 'stop',
					failure_code: null,
					assistant_message_id: 'message-terminal-reconnect',
					terminal_event_id: `${context.turnRunId}:1:1`,
					terminal_sequence_index: 1,
					terminalized_at: '2026-08-19T20:00:00.000Z'
				},
				{ type: 'done', status: 'completed' }
			)
		).resolves.toBe('broadcast_acknowledged');
		expect(client.channel).toHaveBeenCalledTimes(2);
		expect(channels[0]?.send).toHaveBeenCalledOnce();
		expect(channels[1]?.send).toHaveBeenCalledOnce();
		expect(client.removeChannel).toHaveBeenCalledWith(channels[0]);
		expect(broadcast.getHealth()).toMatchObject({
			healthy: true,
			status: 'connected',
			activeChannels: 1,
			consecutiveFailures: 0
		});

		await publisher.stop();
		await broadcast.close();
	});

	it('publishes an atomically committed semantic receipt before terminal done', async () => {
		const context = turn('committed-context');
		const log: string[] = [];
		const broadcast = createBroadcast(log);
		const publisher = new AgenticChatStreamPublisher({
			persistence: createPersistence([context], log),
			broadcast
		});
		publisher.start();
		publisher.registerTurn(context);

		await expect(
			publisher.publishCommittedSemantic(context.turnRunId, {
				outcome: 'persisted',
				publish_allowed: true,
				turn_run_id: context.turnRunId,
				queue_job_id: context.queueJobId,
				session_id: context.sessionId,
				user_id: context.userId,
				stream_run_id: context.streamRunId,
				client_turn_id: context.clientTurnId,
				execution_generation: 1,
				sequence_index: 1,
				event_id: `${context.turnRunId}:1:1`,
				phase: 'finalize',
				event_type: 'last_turn_context',
				durable: true,
				transition_id: 'transition-last-context',
				event_payload: {
					type: 'last_turn_context',
					context: { timestamp: '2026-08-02T20:00:00.000Z' }
				},
				reconcile_required: true,
				persisted_at: '2026-08-02T20:00:00.010Z'
			})
		).resolves.toBe('broadcast_acknowledged');
		await expect(
			publisher.publishTerminal(
				context.turnRunId,
				{
					turn_run_id: context.turnRunId,
					session_id: context.sessionId,
					user_id: context.userId,
					queue_job_id: context.queueJobId,
					execution_generation: 1,
					status: 'completed',
					finished_reason: 'stop',
					failure_code: null,
					assistant_message_id: 'message-committed-context',
					terminal_event_id: `${context.turnRunId}:1:2`,
					terminal_sequence_index: 2,
					terminalized_at: '2026-08-02T20:00:00.020Z'
				},
				{ type: 'done', status: 'completed' }
			)
		).resolves.toBe('broadcast_acknowledged');
		expect(
			broadcast.messages.map((message) =>
				'type' in message.payload ? message.payload.type : undefined
			)
		).toEqual(['last_turn_context', 'done']);
		expect(log).toEqual([
			'broadcast:event',
			`ack:${context.turnRunId}:1`,
			'broadcast:event',
			`ack:${context.turnRunId}:2`
		]);
		await publisher.stop();
	});

	it('abandons pending writes without publishing a late in-flight receipt', async () => {
		const context = turn('abandon');
		const gate = deferred<void>();
		const persistence = createPersistence([context]);
		const originalFlush = persistence.flushTextBatches.bind(persistence);
		persistence.flushTextBatches = async (inputs) => {
			await gate.promise;
			return originalFlush(inputs);
		};
		const broadcast = createBroadcast();
		const publisher = new AgenticChatStreamPublisher({ persistence, broadcast });
		publisher.start();
		publisher.registerTurn(context);

		const pending = publisher.appendText(context.turnRunId, 'late');
		const pendingRejections = Promise.all([
			expect(pending.accepted).rejects.toThrow('terminalizing'),
			expect(pending.delivery).rejects.toThrow('terminalizing')
		]);
		publisher.abandonTurn(context.turnRunId, 'terminalizing');
		await pendingRejections;
		gate.resolve();
		await vi.waitFor(() => expect(persistence.textCalls).toHaveLength(1));
		expect(broadcast.messages).toHaveLength(0);
		await publisher.stop();
	});
});

describe('Supabase Agentic Chat publisher adapters', () => {
	it('maps the exact acknowledgement fence to the new RPC', async () => {
		const receipt = {
			outcome: 'acknowledged',
			turn_run_id: 'turn-1',
			queue_job_id: 'job-1',
			execution_generation: 2,
			acknowledged_sequence: 8,
			current_sequence: 8,
			reconcile_required: false
		} satisfies AgenticChatStreamDeliveryAckRpcResultV1;
		const rpc = vi.fn().mockResolvedValue({ data: receipt, error: null });
		const adapter = new SupabaseAgenticChatPersistenceAdapter({ rpc });

		await expect(
			adapter.acknowledge({
				turn_run_id: 'turn-1',
				queue_job_id: 'job-1',
				processing_token: 'token-1',
				execution_generation: 2,
				acknowledged_sequence: 8
			})
		).resolves.toEqual(receipt);
		expect(rpc).toHaveBeenCalledWith('acknowledge_agentic_chat_stream_delivery', {
			p_turn_run_id: 'turn-1',
			p_queue_job_id: 'job-1',
			p_processing_token: 'token-1',
			p_execution_generation: 2,
			p_acknowledged_sequence: 8
		});
	});

	it('uses acknowledged private user channels and releases cached channels', async () => {
		const send = vi.fn().mockResolvedValue('ok');
		const subscribe = vi.fn((callback: (status: 'SUBSCRIBED') => void) => {
			callback('SUBSCRIBED');
			return channel;
		});
		const channel = { send, subscribe };
		const removeChannel = vi.fn().mockResolvedValue(undefined);
		const client = {
			channel: vi.fn().mockReturnValue(channel),
			removeChannel
		};
		const adapter = new SupabaseAgenticChatBroadcastAdapter(client);
		const message = {
			kind: 'reconcile_hint',
			topic: 'chat-user:user-1',
			event: 'agent-stream-reconcile',
			payload: {
				contract_version: 'agentic_chat_worker_v1',
				turn_run_id: 'turn-1',
				session_id: 'session-1',
				execution_generation: 1,
				durable_through_sequence: 3
			}
		} as const;

		await expect(adapter.publish(message)).resolves.toBe('sent');
		expect(adapter.getHealth()).toMatchObject({
			healthy: true,
			status: 'connected',
			activeChannels: 1,
			consecutiveFailures: 0
		});
		expect(client.channel).toHaveBeenCalledWith('chat-user:user-1', {
			config: { private: true, broadcast: { ack: true } }
		});
		expect(subscribe).toHaveBeenCalledOnce();
		expect(send).toHaveBeenCalledWith({
			type: 'broadcast',
			event: 'agent-stream-reconcile',
			payload: message.payload
		});
		await adapter.close();
		expect(removeChannel).toHaveBeenCalledWith(channel);
		expect(adapter.getHealth()).toMatchObject({
			healthy: false,
			status: 'closed',
			activeChannels: 0
		});
		await expect(adapter.publish(message)).resolves.toBe('failed');
		expect(client.channel).toHaveBeenCalledOnce();
	});

	it('shares a pending subscription between the startup hint and first event with the installed SDK', async () => {
		const client = createClient('https://unused.invalid', 'test-key', {
			auth: { persistSession: false, autoRefreshToken: false }
		});
		// Exercise real topic deduplication and subscribe callback registration;
		// only the socket transport and message delivery are replaced.
		vi.spyOn(client.realtime, 'isConnected').mockReturnValue(true);
		vi.spyOn(client.realtime, 'push').mockImplementation(() => {});
		vi.spyOn(client.realtime, 'setAuth').mockResolvedValue();
		const channel = client.channel('chat-user:user-race', {
			config: { private: true, broadcast: { ack: true } }
		});
		const subscribe = vi.spyOn(channel, 'subscribe');
		const send = vi.spyOn(channel, 'send').mockResolvedValue('ok');
		const adapter = new SupabaseAgenticChatBroadcastAdapter(client);
		const message = {
			kind: 'reconcile_hint',
			topic: 'chat-user:user-race',
			event: 'agent-stream-reconcile',
			payload: {
				contract_version: 'agentic_chat_worker_v1',
				turn_run_id: 'turn-race',
				session_id: 'session-race',
				execution_generation: 1,
				durable_through_sequence: 0
			}
		} as const;
		try {
			const first = adapter.publish(message);
			const second = adapter.publish({
				...message,
				payload: { ...message.payload, durable_through_sequence: 1 }
			});
			channel.joinPush.trigger('ok', {});
			await expect(first).resolves.toBe('sent');
			expect(subscribe).toHaveBeenCalledOnce();
			await expect(second).resolves.toBe('sent');
			expect(send).toHaveBeenCalledTimes(2);
		} finally {
			channel.joinPush.destroy();
			await client.realtime.disconnect();
			vi.restoreAllMocks();
		}
	});

	it('fails closed and removes a private channel that cannot subscribe', async () => {
		const send = vi.fn().mockResolvedValue('ok');
		const channel = {
			send,
			subscribe: vi.fn((callback: (status: 'CHANNEL_ERROR', error?: Error) => void) => {
				callback('CHANNEL_ERROR', new Error('private channel denied'));
				return channel;
			})
		};
		const removeChannel = vi.fn().mockResolvedValue(undefined);
		const adapter = new SupabaseAgenticChatBroadcastAdapter({
			channel: vi.fn().mockReturnValue(channel),
			removeChannel
		});

		await expect(
			adapter.publish({
				kind: 'reconcile_hint',
				topic: 'chat-user:user-1',
				event: 'agent-stream-reconcile',
				payload: {
					contract_version: 'agentic_chat_worker_v1',
					turn_run_id: 'turn-1',
					session_id: 'session-1',
					execution_generation: 1,
					durable_through_sequence: 3
				}
			})
		).resolves.toBe('failed');
		expect(send).not.toHaveBeenCalled();
		expect(removeChannel).toHaveBeenCalledWith(channel);
		expect(adapter.getHealth()).toMatchObject({
			healthy: false,
			status: 'degraded',
			activeChannels: 0
		});
	});

	it('bounds a silent Broadcast send and evicts its channel', async () => {
		vi.useFakeTimers();
		const channel = {
			send: vi.fn(() => new Promise<string>(() => {})),
			subscribe: vi.fn((callback: (status: 'SUBSCRIBED') => void) => {
				callback('SUBSCRIBED');
				return channel;
			})
		};
		const client = {
			channel: vi.fn(() => channel),
			removeChannel: vi.fn().mockResolvedValue(undefined)
		};
		const adapter = new SupabaseAgenticChatBroadcastAdapter(client, 256, 100, 25);
		try {
			const publication = adapter.publish(subscriptionTestMessage);
			await vi.advanceTimersByTimeAsync(25);
			await expect(publication).resolves.toBe('failed');
			expect(client.removeChannel).toHaveBeenCalledOnce();
			expect(adapter.getHealth()).toMatchObject({
				healthy: false,
				status: 'degraded',
				activeChannels: 0
			});
		} finally {
			await adapter.close();
			vi.useRealTimers();
		}
	});

	it('releases per-send and per-subscription close listeners after they settle', async () => {
		const channel = {
			send: vi.fn(async () => 'ok'),
			subscribe: vi.fn((callback: (status: 'SUBSCRIBED') => void) => {
				callback('SUBSCRIBED');
				return channel;
			})
		};
		const client = {
			channel: vi.fn(() => channel),
			removeChannel: vi.fn().mockResolvedValue(undefined)
		};
		const adapter = new SupabaseAgenticChatBroadcastAdapter(client, 256, 100, 25);
		for (let index = 0; index < 5; index += 1) {
			await expect(adapter.publish(subscriptionTestMessage)).resolves.toBe('sent');
		}
		expect((adapter as unknown as { closeListeners: Set<unknown> }).closeListeners.size).toBe(
			0
		);
		await adapter.close();
	});

	it('bounds a silent subscription for both publishers, ignores late success, and allows retry', async () => {
		vi.useFakeTimers();
		let callback!: (status: 'SUBSCRIBED') => void;
		const channel = {
			send: vi.fn().mockResolvedValue('ok'),
			subscribe: vi.fn((observe: typeof callback) => {
				callback = observe;
				return channel;
			})
		};
		const client = {
			channel: vi.fn().mockReturnValue(channel),
			removeChannel: vi.fn().mockResolvedValue(undefined)
		};
		const adapter = new SupabaseAgenticChatBroadcastAdapter(client, 256, 25);
		try {
			const first = adapter.publish(subscriptionTestMessage);
			const second = adapter.publish(subscriptionTestMessage);
			const lateCallback = callback;
			await vi.advanceTimersByTimeAsync(25);
			await expect(Promise.all([first, second])).resolves.toEqual(['failed', 'failed']);
			expect(channel.subscribe).toHaveBeenCalledOnce();
			expect(client.removeChannel).toHaveBeenCalledOnce();
			lateCallback('SUBSCRIBED');
			expect(adapter.getHealth()).toMatchObject({ status: 'degraded', activeChannels: 0 });
			expect(channel.send).not.toHaveBeenCalled();
			const retried = adapter.publish(subscriptionTestMessage);
			callback('SUBSCRIBED');
			await expect(retried).resolves.toBe('sent');
			expect(channel.subscribe).toHaveBeenCalledTimes(2);
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			await adapter.close();
			vi.useRealTimers();
		}
	});

	it('does not cache or send a channel that finishes subscribing after close', async () => {
		let callback!: (status: 'SUBSCRIBED') => void;
		const channel = {
			send: vi.fn().mockResolvedValue('ok'),
			subscribe: vi.fn((observe: typeof callback) => {
				callback = observe;
				return channel;
			})
		};
		const removeChannel = vi.fn().mockResolvedValue(undefined);
		const adapter = new SupabaseAgenticChatBroadcastAdapter({
			channel: () => channel,
			removeChannel
		});
		const publication = adapter.publish(subscriptionTestMessage);
		const closing = adapter.close();
		callback('SUBSCRIBED');
		await closing;
		await expect(publication).resolves.toBe('failed');
		expect(channel.send).not.toHaveBeenCalled();
		expect(removeChannel).toHaveBeenCalledOnce();
		expect(adapter.getHealth()).toMatchObject({ status: 'closed', activeChannels: 0 });
	});

	it('clears the adapter deadline when subscribe throws synchronously', async () => {
		vi.useFakeTimers();
		const channel = {
			send: vi.fn(),
			subscribe: vi.fn(() => {
				throw new Error('closed socket');
			})
		};
		const adapter = new SupabaseAgenticChatBroadcastAdapter({
			channel: () => channel,
			removeChannel: vi.fn().mockResolvedValue(undefined)
		});
		try {
			await expect(adapter.publish(subscriptionTestMessage)).resolves.toBe('failed');
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			await adapter.close();
			vi.useRealTimers();
		}
	});

	it('evicts a channel that degrades after subscribing and reconnects on the next event', async () => {
		let observeStatus!: (
			status: 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR'
		) => void;
		const channel = {
			send: vi.fn().mockResolvedValue('ok'),
			subscribe: vi.fn((callback: typeof observeStatus) => {
				observeStatus = callback;
				callback('SUBSCRIBED');
				return channel;
			})
		};
		const client = {
			channel: vi.fn().mockReturnValue(channel),
			removeChannel: vi.fn().mockResolvedValue(undefined)
		};
		const adapter = new SupabaseAgenticChatBroadcastAdapter(client);
		const message = {
			kind: 'reconcile_hint',
			topic: 'chat-user:user-1',
			event: 'agent-stream-reconcile',
			payload: {
				contract_version: 'agentic_chat_worker_v1',
				turn_run_id: 'turn-1',
				session_id: 'session-1',
				execution_generation: 1,
				durable_through_sequence: 3
			}
		} as const;

		await expect(adapter.publish(message)).resolves.toBe('sent');
		observeStatus('CHANNEL_ERROR');
		await Promise.resolve();
		expect(adapter.getHealth()).toMatchObject({
			healthy: false,
			status: 'degraded',
			activeChannels: 0
		});
		expect(client.removeChannel).toHaveBeenCalledWith(channel);

		await expect(adapter.publish(message)).resolves.toBe('sent');
		expect(client.channel).toHaveBeenCalledTimes(2);
		expect(adapter.getHealth()).toMatchObject({
			healthy: true,
			status: 'connected',
			activeChannels: 1,
			consecutiveFailures: 0
		});
	});
});
