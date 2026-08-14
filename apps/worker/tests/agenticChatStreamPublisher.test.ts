// apps/worker/tests/agenticChatStreamPublisher.test.ts

import { describe, expect, it, vi } from 'vitest';
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
} from '../src/workers/agentic-chat/streamPublisher';
import {
	SupabaseAgenticChatBroadcastAdapter,
	SupabaseAgenticChatPersistenceAdapter
} from '../src/workers/agentic-chat/supabaseStreamPublisherAdapters';

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
	it('persists first text before Broadcast and exact-sequence acknowledgement', async () => {
		const log: string[] = [];
		const observations: unknown[] = [];
		const context = {
			...turn('first'),
			onPersistenceObserved(observation) {
				observations.push(observation);
				log.push(`observe:${observation.eventType}`);
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
		expect(broadcast.messages[0]).toMatchObject({
			topic: `chat-user:${context.userId}`,
			payload: { event_id: `${context.turnRunId}:1:1`, text_delta: 'Hello' }
		});
		await publisher.stop();
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
		expect(publisher.getSnapshot(context.turnRunId).durableSequence).toBe(3);
		expect(persistence.textCalls.at(-1)?.[0]).toMatchObject({
			text_delta: 'BC',
			assistant_text: 'ABC'
		});
		expect(log).toEqual([
			`persist:text:${context.turnRunId}`,
			'broadcast:event',
			`ack:${context.turnRunId}:2`,
			'persist:semantic:tool_call',
			'broadcast:event',
			`ack:${context.turnRunId}:3`
		]);
		await publisher.stop();
	});

	it('flushes ready text for multiple turns through one worker-level batch', async () => {
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
		await Promise.all([firstSteady.delivery, secondSteady.delivery]);

		expect(persistence.textCalls.at(-1)?.map((input) => input.turn_run_id)).toEqual([
			first.turnRunId,
			second.turnRunId
		]);
		await publisher.stop();
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
		base.persistSemantic = vi.fn(async (input) => ({
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
		}));
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
		base.flushTextBatches = vi.fn(async () => ({
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
		}));
		const broadcast = createBroadcast();
		const publisher = new AgenticChatStreamPublisher({ persistence: base, broadcast });
		publisher.start();
		publisher.registerTurn(context);

		await expect(
			publisher.appendText(context.turnRunId, 'bad prefix').delivery
		).rejects.toThrow('rejected:P0001');
		expect(base.flushTextBatches).toHaveBeenCalledOnce();
		expect(broadcast.messages).toHaveLength(0);
		expect(publisher.getSnapshot(context.turnRunId).blockedReason).toBe('persistence_rejected');
		await publisher.stop();
	});

	it('provides pressure relief and fails closed with the complete prefix at the hard bound', async () => {
		const context = turn('pressure');
		const gate = Promise.withResolvers<void>();
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

		const held = Promise.withResolvers<void>();
		base.flushTextBatches = async (inputs) => {
			await held.promise;
			return await originalFlush(inputs);
		};
		const pending = publisher.appendText(context.turnRunId, '89');
		void pending.delivery.catch(() => undefined);
		expect(() => publisher.appendText(context.turnRunId, 'abcdefghij')).toThrow(
			AgenticChatPublisherOverloadError
		);
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
		expect(broadcast.messages.map((message) => message.payload.type)).toEqual([
			'last_turn_context',
			'done'
		]);
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
		const gate = Promise.withResolvers<void>();
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
		void pending.delivery.catch(() => undefined);
		publisher.abandonTurn(context.turnRunId, 'terminalizing');
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
	});
});
