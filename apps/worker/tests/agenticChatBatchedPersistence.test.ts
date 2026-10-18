// apps/worker/tests/agenticChatBatchedPersistence.test.ts
//
// Pipeline audit 2026-10-17 S7 / B4 / M3: batched UI persistence, byte-capped
// projection, payload fitting, and first-visible-text evidence. The batch
// persistence fake below mirrors persist_agentic_chat_semantic_event_batch
// (supabase/migrations/20261017200000_agentic_chat_batched_persistence.sql):
// consecutive sequences in input order, a committed prefix replays as
// already_persisted, a changed payload conflicts, one projection per batch.
import { describe, expect, it, vi } from 'vitest';
import {
	AGENTIC_CHAT_STREAM_EVENT_PAYLOAD_MAX_BYTES,
	AGENTIC_CHAT_STREAM_PROJECTION_MAX_BYTES,
	AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
	createAgentStreamEventIdV1,
	type AgentStreamEventV1,
	type AgenticChatSemanticEventRpcResultV1,
	type AgenticChatTextBatchFlushRpcResultV1,
	type AgenticChatTextBatchInputV1,
	type JsonObject
} from '@buildos/shared-types';
import { deferred } from './helpers/deferred';
import {
	AgenticChatSemanticBatchUnavailableError,
	AgenticChatStreamPublisher,
	type AgenticChatBroadcastMessageV1,
	type AgenticChatPersistencePortV1,
	type AgenticChatPublisherTurnV1,
	type AgenticChatSemanticBatchInputV1,
	type AgenticChatSemanticBatchRpcResultV1,
	type AgenticChatSemanticPublishInputV1
} from '../src/workers/agentic-chat/stream/stream-publisher';
import {
	AgenticChatPersistenceRpcError,
	SupabaseAgenticChatPersistenceAdapter
} from '../src/workers/agentic-chat/stream/supabase-stream-publisher-adapters';
import {
	AGENTIC_CHAT_STREAM_COMPACTION_MARKER_KEY,
	AGENTIC_CHAT_STREAM_EVENT_PAYLOAD_BUDGET_BYTES,
	AGENTIC_CHAT_UI_PROJECTION_BUDGET_BYTES,
	AGENTIC_CHAT_UI_PROJECTION_TOOL_ENTRY_BUDGET_BYTES,
	compactStreamJsonValue,
	estimateStreamJsonBytes,
	fitAgenticChatStreamPayloadV1
} from '../src/workers/agentic-chat/stream/stream-payload-budget';
import {
	MAX_UI_PROJECTION_EVENTS,
	appendProjectionEvent,
	emptyProjection,
	projectionEstimatedBytes,
	removeProjectionEvent,
	toProjectionJson
} from '../src/workers/agentic-chat/turn/turn-run';
import { AgenticChatTurnRunServices } from '../src/workers/agentic-chat/turn/turn-run-services';

const TURN_RUN_ID = '11111111-1111-4111-8111-111111111111';
const QUEUE_JOB_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const SESSION_ID = '44444444-4444-4444-8444-444444444444';

const context: AgenticChatPublisherTurnV1 = {
	turnRunId: TURN_RUN_ID,
	queueJobId: QUEUE_JOB_ID,
	processingToken: '55555555-5555-4555-8555-555555555555',
	userId: USER_ID,
	sessionId: SESSION_ID,
	streamRunId: 'stream-1',
	clientTurnId: 'client-1',
	executionGeneration: 1
};

function transitionId(index: number): string {
	return `66666666-6666-4666-8666-${index.toString().padStart(12, '0')}`;
}

function utf8(value: unknown): number {
	return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function semanticInput(
	index: number,
	overrides: Partial<AgenticChatSemanticPublishInputV1> = {}
): AgenticChatSemanticPublishInputV1 {
	return {
		transitionId: transitionId(index),
		phase: 'tool',
		eventType: 'tool_call',
		projection: { version: 'agentic_chat_ui_projection_v1', marker: index },
		eventPayload: { type: 'tool_call', tool_call: { id: `call-${index}` } },
		...overrides
	};
}

type StoredEvent = {
	sequence: number;
	phase: string;
	eventType: string;
	payload: JsonObject;
};

/** Mirrors the SQL contract of the batch, per-event, and text RPCs for one turn. */
function createBatchPersistence(options: { batch?: boolean } = {}) {
	let sequence = 0;
	const stored = new Map<string, StoredEvent>();
	const log: string[] = [];
	const batches: AgenticChatSemanticBatchInputV1[] = [];
	const singles: Array<Record<string, unknown>> = [];
	const projections: Array<{ throughSequence: number; projection: JsonObject }> = [];
	const hooks: {
		beforeBatch?: (input: AgenticChatSemanticBatchInputV1) => Promise<void> | void;
		afterCommit?: (input: AgenticChatSemanticBatchInputV1) => Promise<void> | void;
		batchResponse?: (
			input: AgenticChatSemanticBatchInputV1,
			response: AgenticChatSemanticBatchRpcResultV1
		) => AgenticChatSemanticBatchRpcResultV1;
	} = {};

	const receipt = (
		transition: string,
		event: StoredEvent,
		outcome: 'persisted' | 'already_persisted'
	): AgenticChatSemanticEventRpcResultV1 =>
		({
			outcome,
			publish_allowed: outcome === 'persisted',
			turn_run_id: TURN_RUN_ID,
			queue_job_id: QUEUE_JOB_ID,
			session_id: SESSION_ID,
			user_id: USER_ID,
			stream_run_id: 'stream-1',
			client_turn_id: 'client-1',
			execution_generation: 1,
			sequence_index: event.sequence,
			event_id: createAgentStreamEventIdV1(TURN_RUN_ID, 1, event.sequence),
			phase: event.phase,
			event_type: event.eventType,
			durable: true,
			transition_id: transition,
			event_payload: event.payload,
			...(outcome === 'persisted'
				? {
						reconcile_required: true,
						persisted_at: `2026-10-17T20:00:0${event.sequence % 10}.000Z`
					}
				: {})
		}) as AgenticChatSemanticEventRpcResultV1;

	const persistence: AgenticChatPersistencePortV1 = {
		async flushTextBatches(inputs: AgenticChatTextBatchInputV1[]) {
			log.push(`text:${inputs.map((input) => input.text_delta).join('|')}`);
			return {
				outcome: 'flushed',
				input_count: inputs.length,
				persisted_count: inputs.length,
				rejected_count: 0,
				results: inputs.map((input, inputIndex) => {
					sequence += 1;
					return {
						outcome: 'persisted',
						publish_allowed: true,
						turn_run_id: input.turn_run_id,
						queue_job_id: input.queue_job_id,
						session_id: SESSION_ID,
						user_id: USER_ID,
						stream_run_id: 'stream-1',
						client_turn_id: 'client-1',
						execution_generation: 1,
						sequence_index: sequence,
						event_id: createAgentStreamEventIdV1(TURN_RUN_ID, 1, sequence),
						phase: 'llm',
						event_type: 'text_delta',
						durable: true,
						batch_id: input.batch_id,
						text_delta: input.text_delta,
						assistant_text_bytes: Buffer.byteLength(input.assistant_text),
						reconcile_required: true,
						persisted_at: '2026-10-17T20:00:00.500Z',
						input_index: inputIndex
					} as const;
				})
			} satisfies AgenticChatTextBatchFlushRpcResultV1;
		},
		async persistSemantic(input) {
			singles.push(input as unknown as Record<string, unknown>);
			log.push(`single:${input.event_type}`);
			const existing = stored.get(input.transition_id);
			if (existing) return receipt(input.transition_id, existing, 'already_persisted');
			sequence += 1;
			const event = {
				sequence,
				phase: input.phase,
				eventType: input.event_type,
				payload: input.event_payload
			};
			stored.set(input.transition_id, event);
			projections.push({ throughSequence: sequence, projection: input.projection });
			return receipt(input.transition_id, event, 'persisted');
		}
	};
	if (options.batch !== false) {
		persistence.persistSemanticBatch = async (input) => {
			batches.push(input);
			log.push(`batch:${input.events.map((event) => event.event_type).join(',')}`);
			await hooks.beforeBatch?.(input);
			const results: AgenticChatSemanticEventRpcResultV1[] = [];
			let replayed = 0;
			for (const [index, item] of input.events.entries()) {
				const existing = stored.get(item.transition_id);
				if (!existing) continue;
				if (JSON.stringify(existing.payload) !== JSON.stringify(item.event_payload)) {
					throw new AgenticChatPersistenceRpcError(
						'persist_agentic_chat_semantic_event_batch',
						'P0001',
						'agentic_chat_semantic_write_transition_conflict'
					);
				}
				if (index !== replayed) {
					throw new AgenticChatPersistenceRpcError(
						'persist_agentic_chat_semantic_event_batch',
						'P0001',
						'agentic_chat_semantic_batch_replay_out_of_order'
					);
				}
				replayed += 1;
				results.push(receipt(item.transition_id, existing, 'already_persisted'));
			}
			for (const item of input.events.slice(replayed)) {
				sequence += 1;
				const event = {
					sequence,
					phase: item.phase,
					eventType: item.event_type,
					payload: item.event_payload
				};
				stored.set(item.transition_id, event);
				results.push(receipt(item.transition_id, event, 'persisted'));
			}
			if (input.events.length > replayed) {
				projections.push({ throughSequence: sequence, projection: input.projection });
			}
			await hooks.afterCommit?.(input);
			const response: AgenticChatSemanticBatchRpcResultV1 = {
				outcome: 'batch_persisted',
				turn_run_id: TURN_RUN_ID,
				queue_job_id: QUEUE_JOB_ID,
				execution_generation: 1,
				persisted_count: input.events.length - replayed,
				replayed_count: replayed,
				results
			};
			return hooks.batchResponse ? hooks.batchResponse(input, response) : response;
		};
	}
	return {
		persistence,
		log,
		batches,
		singles,
		projections,
		hooks,
		get sequence() {
			return sequence;
		}
	};
}

function createBroadcast(log: string[] = []) {
	const messages: AgenticChatBroadcastMessageV1[] = [];
	return {
		messages,
		async publish(message: AgenticChatBroadcastMessageV1) {
			messages.push(message);
			log.push(
				message.kind === 'event'
					? `broadcast:${(message.payload as { sequence_index: number }).sequence_index}`
					: `broadcast:${message.kind}`
			);
			return 'sent' as const;
		}
	};
}

function eventBroadcastSequences(messages: AgenticChatBroadcastMessageV1[]): number[] {
	return messages
		.filter((message) => message.kind === 'event')
		.map((message) => (message.payload as { sequence_index: number }).sequence_index);
}

function startedPublisher(
	db: ReturnType<typeof createBatchPersistence>,
	options: {
		broadcast?: ReturnType<typeof createBroadcast>;
		now?: () => number;
		config?: ConstructorParameters<typeof AgenticChatStreamPublisher>[1];
	} = {}
) {
	const broadcast = options.broadcast ?? createBroadcast(db.log);
	const publisher = new AgenticChatStreamPublisher(
		{
			persistence: db.persistence,
			broadcast,
			...(options.now ? { now: options.now } : {})
		},
		options.config
	);
	publisher.start();
	publisher.registerTurn(context);
	return { publisher, broadcast };
}

/** A 470 KiB read result: one huge body plus a long item list, like a big document read. */
function hugeReadResultPayload(): JsonObject {
	return {
		type: 'tool_result',
		result: {
			tool_call_id: 'call-huge',
			tool_name: 'get_onto_document_details',
			success: true,
			duration_ms: 812,
			result: {
				document: {
					id: '77777777-7777-4777-8777-777777777777',
					title: 'Quarterly plan',
					body: 'Plan line with "quotes" and \\ backslashes.\n'.repeat(9_000)
				},
				items: Array.from({ length: 1_500 }, (_, index) => ({
					id: `item-${index}`,
					name: `Item ${index}`,
					score: index / 7
				}))
			},
			affected_entities: Array.from({ length: 40 }, (_, index) => ({
				entity_type: 'task',
				entity_id: `task-${index}`,
				entity_name: `Task ${index}`
			}))
		}
	};
}

describe('stream payload budget', () => {
	it('estimates at least the JSON text size, escapes, unicode, and numbers included', () => {
		const samples: unknown[] = [
			'plain',
			'quote " and \\ backslash',
			'control \u0001\u0002 and \n\t',
			'emoji 😀 and ünïcödé',
			{ nested: [1, 2.5, -3e-7, 123456789012345, true, null, 'x'] },
			Array.from({ length: 500 }, (_, index) => index),
			{ deep: { deeper: { deepest: ['a', { b: 'c' }] } } },
			hugeReadResultPayload()
		];
		for (const sample of samples) {
			expect(estimateStreamJsonBytes(sample)).toBeGreaterThanOrEqual(utf8(sample));
		}
	});

	it('leaves a payload under budget untouched', () => {
		const payload: JsonObject = { type: 'tool_result', result: { success: true, result: {} } };
		const fitted = fitAgenticChatStreamPayloadV1(payload, 4_096);
		expect(fitted.compacted).toBe(false);
		expect(fitted.value).toBe(payload);
	});

	it('fits a 470 KiB read into one event row: routing fields intact, marker added, deterministic', () => {
		const payload = hugeReadResultPayload();
		expect(utf8(payload)).toBeGreaterThan(AGENTIC_CHAT_STREAM_EVENT_PAYLOAD_MAX_BYTES);

		const fitted = fitAgenticChatStreamPayloadV1(
			payload,
			AGENTIC_CHAT_STREAM_EVENT_PAYLOAD_BUDGET_BYTES
		);
		expect(fitted.compacted).toBe(true);
		expect(estimateStreamJsonBytes(fitted.value)).toBeLessThanOrEqual(
			AGENTIC_CHAT_STREAM_EVENT_PAYLOAD_BUDGET_BYTES
		);
		expect(utf8(fitted.value)).toBeLessThan(AGENTIC_CHAT_STREAM_EVENT_PAYLOAD_MAX_BYTES);
		const result = fitted.value.result as Record<string, any>;
		expect(result).toMatchObject({
			tool_call_id: 'call-huge',
			tool_name: 'get_onto_document_details',
			success: true,
			duration_ms: 812
		});
		// Shape kept: the inner result is still an object with its document.
		expect(result.result.document.id).toBe('77777777-7777-4777-8777-777777777777');
		expect(result.result.document.title).toBe('Quarterly plan');
		expect(Array.isArray(result.result.items)).toBe(true);
		expect(fitted.value[AGENTIC_CHAT_STREAM_COMPACTION_MARKER_KEY]).toMatchObject({
			version: 1,
			fields: expect.arrayContaining(['result.result']),
			original_bytes: fitted.originalBytes
		});
		// A replayed transition must compare equal to its stored row.
		expect(
			fitAgenticChatStreamPayloadV1(payload, AGENTIC_CHAT_STREAM_EVENT_PAYLOAD_BUDGET_BYTES)
				.value
		).toEqual(fitted.value);
	});

	it('compacts tool_call arguments into argument JSON that still parses', () => {
		const payload: JsonObject = {
			type: 'tool_call',
			tool_call: {
				id: 'call-big-args',
				type: 'function',
				function: {
					name: 'create_onto_document',
					arguments: JSON.stringify({
						title: 'Spec',
						content: 'Paragraph text. '.repeat(30_000)
					})
				}
			}
		};
		const fitted = fitAgenticChatStreamPayloadV1(
			payload,
			AGENTIC_CHAT_UI_PROJECTION_TOOL_ENTRY_BUDGET_BYTES
		);
		expect(fitted.compacted).toBe(true);
		expect(estimateStreamJsonBytes(fitted.value)).toBeLessThanOrEqual(
			AGENTIC_CHAT_UI_PROJECTION_TOOL_ENTRY_BUDGET_BYTES
		);
		const toolCall = fitted.value.tool_call as Record<string, any>;
		expect(toolCall.id).toBe('call-big-args');
		expect(toolCall.function.name).toBe('create_onto_document');
		expect(JSON.parse(toolCall.function.arguments)).toMatchObject({ title: 'Spec' });
	});

	it('never changes a value type while compacting', () => {
		const value = {
			list: Array.from({ length: 300 }, (_, index) => ({ index, text: 'x'.repeat(200) })),
			nested: { a: { b: { c: { d: { e: { f: [1, 2, 3] } } } } } },
			text: 'y'.repeat(50_000),
			count: 42,
			flag: true,
			none: null
		};
		const compacted = compactStreamJsonValue(value, 1_024).value as Record<string, unknown>;
		expect(estimateStreamJsonBytes(compacted)).toBeLessThanOrEqual(1_024);
		for (const [key, original] of Object.entries(value)) {
			if (!(key in compacted)) continue;
			const next = compacted[key];
			expect(Array.isArray(next)).toBe(Array.isArray(original));
			expect(typeof next).toBe(typeof original);
		}
	});
});

function streamEvent(sequence: number, payload: JsonObject): AgentStreamEventV1 {
	return {
		...payload,
		contract_version: AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
		event_id: createAgentStreamEventIdV1(TURN_RUN_ID, 1, sequence),
		stream_run_id: 'stream-1',
		client_turn_id: 'client-1',
		session_id: SESSION_ID,
		turn_run_id: TURN_RUN_ID,
		execution_generation: 1,
		sequence_index: sequence,
		phase: 'tool',
		event_type: String(payload.type),
		durable: true
	} as AgentStreamEventV1;
}

/** The browser's projection rules (agent-chat-worker-ui-adapter.ts #parseProjection). */
function assertBrowserAcceptsProjection(value: JsonObject, projectionSequence: number) {
	expect(value.version).toBe('agentic_chat_ui_projection_v1');
	const events = value.semantic_events as Array<Record<string, unknown>>;
	expect(Array.isArray(events)).toBe(true);
	expect(events.length).toBeLessThanOrEqual(128);
	let previous = 0;
	for (const event of events) {
		const sequence = event.sequence_index as number;
		expect(event.contract_version).toBe(AGENTIC_CHAT_WORKER_CONTRACT_VERSION);
		expect(event.turn_run_id).toBe(TURN_RUN_ID);
		expect(event.session_id).toBe(SESSION_ID);
		expect(event.stream_run_id).toBe('stream-1');
		expect(event.client_turn_id).toBe('client-1');
		expect(event.execution_generation).toBe(1);
		expect(event.event_id).toBe(createAgentStreamEventIdV1(TURN_RUN_ID, 1, sequence));
		expect(event.event_type).toBe(event.type);
		expect(event.durable).toBe(true);
		expect(sequence).toBeGreaterThan(previous);
		expect(sequence).toBeLessThanOrEqual(projectionSequence);
		previous = sequence;
	}
}

describe('UI projection state', () => {
	it('stays inside the count and byte bounds, keeps the newest entry, and marks what it dropped', () => {
		const projection = emptyProjection();
		appendProjectionEvent(
			projection,
			streamEvent(1, {
				type: 'session',
				session: { id: SESSION_ID, notes: 'n'.repeat(70_000) }
			}),
			'Thinking…',
			transitionId(1)
		);
		for (let sequence = 2; sequence <= 200; sequence += 1) {
			const big = sequence % 3 === 0;
			appendProjectionEvent(
				projection,
				streamEvent(sequence, {
					type: 'tool_result',
					result: {
						tool_call_id: `call-${sequence}`,
						tool_name: 'search_project',
						success: true,
						result: { text: (big ? 'z' : 'y').repeat(big ? 40_000 : 400) }
					}
				}),
				'Looking things up…',
				transitionId(sequence)
			);
			expect(projectionEstimatedBytes(projection)).toBeLessThanOrEqual(
				AGENTIC_CHAT_UI_PROJECTION_BUDGET_BYTES
			);
			expect(projection.semanticEvents.length).toBeLessThanOrEqual(MAX_UI_PROJECTION_EVENTS);
		}
		const json = toProjectionJson(projection);
		expect(utf8(json)).toBeLessThanOrEqual(AGENTIC_CHAT_UI_PROJECTION_BUDGET_BYTES);
		expect(utf8(json) * 2).toBeLessThan(AGENTIC_CHAT_STREAM_PROJECTION_MAX_BYTES);
		const events = json.semantic_events as Array<Record<string, any>>;
		expect(events.at(-1)!.sequence_index).toBe(200);
		expect(json.omitted_event_count).toBe(200 - events.length);
		expect(json.omitted_through_sequence).toBe(events[0]!.sequence_index - 1);
		// Tool entries are summaries: no entry above the tool entry budget.
		for (const entry of events) {
			expect(estimateStreamJsonBytes(entry)).toBeLessThanOrEqual(
				AGENTIC_CHAT_UI_PROJECTION_TOOL_ENTRY_BUDGET_BYTES
			);
		}
		expect(
			events.some((entry) => entry[AGENTIC_CHAT_STREAM_COMPACTION_MARKER_KEY] !== undefined)
		).toBe(true);
		assertBrowserAcceptsProjection(json, 200);
	});

	// Review 2026-10-17: a browser that reconciles mid-turn renders a proposal
	// card from its projection entry and digests what it shows; a clipped card
	// vanished or had its Apply refused as changed.
	it('keeps a ready proposal card whole in the projection, clipping other large results', () => {
		const projection = emptyProjection();
		const card = streamEvent(1, {
			type: 'tool_result',
			result: {
				tool_call_id: 'call-card',
				tool_name: 'propose_project_combine',
				success: true,
				result: {
					card_rail: 'proposal_v1',
					status: 'proposal_ready',
					kind: 'project_combine',
					summary: 's'.repeat(30_000)
				}
			}
		});
		const plain = streamEvent(2, {
			type: 'tool_result',
			result: {
				tool_call_id: 'call-plain',
				tool_name: 'search_project',
				success: true,
				result: { text: 's'.repeat(30_000) }
			}
		});
		appendProjectionEvent(projection, card, 'Looking things up…', transitionId(1));
		appendProjectionEvent(projection, plain, 'Looking things up…', transitionId(2));
		expect(projection.semanticEvents[0]).toBe(card);
		expect(projection.semanticEvents[1]).not.toBe(plain);
		expect(
			projection.semanticEvents[1]![AGENTIC_CHAT_STREAM_COMPACTION_MARKER_KEY as never]
		).toBeDefined();
	});

	it('keeps a small entry as the very event object it was given', () => {
		const projection = emptyProjection();
		const event = streamEvent(1, { type: 'turn_phase', turn_phase: 'acknowledged' });
		appendProjectionEvent(projection, event, 'Thinking…', transitionId(1));
		expect(projection.semanticEvents[0]).toBe(event);
		expect(toProjectionJson(projection)).not.toHaveProperty('omitted_event_count');
	});

	it('removes a rolled-back event by identity and restores the activity only when it set it', () => {
		const projection = emptyProjection();
		appendProjectionEvent(
			projection,
			streamEvent(1, { type: 'tool_call' }),
			'One',
			transitionId(1)
		);
		appendProjectionEvent(
			projection,
			streamEvent(2, { type: 'tool_call' }),
			'Two',
			transitionId(2)
		);
		const bytesBefore = projection.semanticBytes;
		removeProjectionEvent(
			projection,
			createAgentStreamEventIdV1(TURN_RUN_ID, 1, 1),
			transitionId(1),
			'Before one'
		);
		expect(projection.semanticEvents.map((event) => event.sequence_index)).toEqual([2]);
		expect(projection.semanticBytes).toBeLessThan(bytesBefore);
		expect(projection.semanticEventBytes).toHaveLength(1);
		expect(projection.currentActivity).toBe('Two');
		removeProjectionEvent(
			projection,
			createAgentStreamEventIdV1(TURN_RUN_ID, 1, 2),
			transitionId(2),
			'One'
		);
		expect(projection.currentActivity).toBe('One');
		expect(projection.semanticBytes).toBe(0);
	});
});

describe('publisher semantic batches', () => {
	it('writes queued semantic events with one RPC, in order, with the last projection, and broadcasts each only after its receipt', async () => {
		const db = createBatchPersistence();
		const gate = deferred<void>();
		db.hooks.beforeBatch = () => gate.promise;
		const { publisher, broadcast } = startedPublisher(db);

		const first = publisher.enqueueSemantic(TURN_RUN_ID, semanticInput(1));
		// The first RPC is in flight; the next two queue behind it.
		const second = publisher.enqueueSemantic(TURN_RUN_ID, semanticInput(2));
		const third = publisher.enqueueSemantic(TURN_RUN_ID, semanticInput(3));
		await vi.waitFor(() => expect(db.batches).toHaveLength(1));
		expect(eventBroadcastSequences(broadcast.messages)).toEqual([]);

		gate.resolve();
		await expect(
			Promise.all([first.accepted, second.accepted, third.accepted])
		).resolves.toEqual([
			expect.objectContaining({ outcome: 'persisted', sequenceIndex: 1 }),
			expect.objectContaining({ outcome: 'persisted', sequenceIndex: 2 }),
			expect.objectContaining({ outcome: 'persisted', sequenceIndex: 3 })
		]);
		await expect(
			Promise.all([first.delivery, second.delivery, third.delivery])
		).resolves.toEqual(Array(3).fill('broadcast_sent_reconcile_pending'));
		expect(db.batches.map((batch) => batch.events.map((event) => event.transition_id))).toEqual(
			[[transitionId(1)], [transitionId(2), transitionId(3)]]
		);
		// One projection per batch: the batch's last event's.
		expect(db.projections).toEqual([
			{ throughSequence: 1, projection: semanticInput(1).projection },
			{ throughSequence: 3, projection: semanticInput(3).projection }
		]);
		expect(db.singles).toHaveLength(0);
		expect(eventBroadcastSequences(broadcast.messages)).toEqual([1, 2, 3]);
		// Durable before broadcast: every event broadcast came after its batch.
		expect(db.log.indexOf('broadcast:2')).toBeGreaterThan(
			db.log.indexOf('batch:tool_call,tool_call')
		);
		await publisher.stop();
	});

	it('never batches across a text batch, which takes its own sequence', async () => {
		const db = createBatchPersistence();
		const gate = deferred<void>();
		let gated = true;
		db.hooks.beforeBatch = () => (gated ? gate.promise : undefined);
		const { publisher } = startedPublisher(db);

		const first = publisher.enqueueSemantic(TURN_RUN_ID, semanticInput(1));
		const text = publisher.appendText(TURN_RUN_ID, 'Hello');
		const second = publisher.enqueueSemantic(TURN_RUN_ID, semanticInput(2));
		gated = false;
		gate.resolve();
		await expect(first.accepted).resolves.toMatchObject({ sequenceIndex: 1 });
		await expect(text.accepted).resolves.toMatchObject({ sequenceIndex: 2 });
		await expect(second.accepted).resolves.toMatchObject({ sequenceIndex: 3 });
		expect(db.log.filter((entry) => !entry.startsWith('broadcast'))).toEqual([
			'batch:tool_call',
			'text:Hello',
			'batch:tool_call'
		]);
		expect(db.batches[1]!.assistant_text).toBe('Hello');
		await publisher.stop();
	});

	it('caps a batch by item count', async () => {
		const db = createBatchPersistence();
		const gate = deferred<void>();
		db.hooks.beforeBatch = () => gate.promise;
		const { publisher } = startedPublisher(db, { config: { semanticBatchMaxItems: 2 } });
		const queued = [1, 2, 3, 4, 5].map((index) =>
			publisher.enqueueSemantic(TURN_RUN_ID, semanticInput(index))
		);
		gate.resolve();
		await Promise.all(queued.map((item) => item.accepted));
		expect(db.batches.map((batch) => batch.events.length)).toEqual([1, 2, 2]);
		await publisher.stop();
	});

	// Review 2026-10-17: a batch that times out would time out again if resent
	// whole, until the turn deadline. The retry halves it; a commit restores it.
	it('halves a batch after a transient failure and restores the size after a commit', async () => {
		const db = createBatchPersistence();
		const gate = deferred<void>();
		let calls = 0;
		db.hooks.beforeBatch = async () => {
			calls += 1;
			if (calls === 1) await gate.promise;
			if (calls === 2) {
				throw new AgenticChatPersistenceRpcError(
					'persist_agentic_chat_semantic_event_batch',
					'57014',
					'canceling statement due to statement timeout'
				);
			}
		};
		const { publisher } = startedPublisher(db, { config: { retryDelayMs: 1 } });
		const first = publisher.enqueueSemantic(TURN_RUN_ID, semanticInput(1));
		const rest = [2, 3, 4, 5].map((index) =>
			publisher.enqueueSemantic(TURN_RUN_ID, semanticInput(index))
		);
		gate.resolve();
		await Promise.all([first, ...rest].map((item) => item.accepted));
		const extra = [6, 7, 8].map((index) =>
			publisher.enqueueSemantic(TURN_RUN_ID, semanticInput(index))
		);
		await Promise.all(extra.map((item) => item.accepted));
		// [1]; [2..5] sent and failed (nothing written); [2,3] at half size; then
		// [4,5] and [6..8] at full size again.
		expect(db.batches.map((batch) => batch.events.length)).toEqual([1, 4, 2, 2, 3]);
		expect(db.sequence).toBe(8);
		await publisher.stop();
	});

	it('replays a lost batch response without broadcasting it again and keeps going', async () => {
		const db = createBatchPersistence();
		let lostOnce = false;
		db.hooks.afterCommit = () => {
			if (lostOnce) return;
			lostOnce = true;
			// Committed, then the response was lost (statement timeout on the way back).
			throw Object.assign(new Error('canceling statement due to statement timeout'), {
				code: '57014'
			});
		};
		const { publisher, broadcast } = startedPublisher(db, { config: { retryDelayMs: 1 } });

		const first = publisher.enqueueSemantic(TURN_RUN_ID, semanticInput(1));
		const second = publisher.enqueueSemantic(TURN_RUN_ID, semanticInput(2));
		await expect(first.accepted).resolves.toMatchObject({
			outcome: 'already_persisted',
			sequenceIndex: 1
		});
		await expect(first.delivery).resolves.toBe('already_persisted');
		await expect(second.accepted).resolves.toMatchObject({ sequenceIndex: 2 });
		const third = publisher.enqueueSemantic(TURN_RUN_ID, semanticInput(3));
		await expect(third.accepted).resolves.toMatchObject({
			outcome: 'persisted',
			sequenceIndex: 3
		});
		await publisher.flushTurn(TURN_RUN_ID);
		// A replay never broadcasts without authority; a hint covers it instead.
		expect(eventBroadcastSequences(broadcast.messages)).not.toContain(1);
		expect(broadcast.messages.some((message) => message.kind === 'reconcile_hint')).toBe(true);
		expect(db.sequence).toBe(3);
		expect(publisher.getSnapshot(TURN_RUN_ID)).toMatchObject({
			durableSequence: 3,
			blockedReason: null
		});
		await publisher.stop();
	});

	it('takes new events behind a replayed prefix in one retry', async () => {
		const db = createBatchPersistence();
		const committed = deferred<void>();
		let lostOnce = false;
		db.hooks.afterCommit = async () => {
			if (lostOnce) return;
			lostOnce = true;
			committed.resolve();
			throw Object.assign(new Error('connection lost'), { code: 'PGRST000' });
		};
		const { publisher } = startedPublisher(db, { config: { retryDelayMs: 5 } });
		const first = publisher.enqueueSemantic(TURN_RUN_ID, semanticInput(1));
		await committed.promise;
		const second = publisher.enqueueSemantic(TURN_RUN_ID, semanticInput(2));
		await expect(first.accepted).resolves.toMatchObject({
			outcome: 'already_persisted',
			sequenceIndex: 1
		});
		await expect(second.accepted).resolves.toMatchObject({
			outcome: 'persisted',
			sequenceIndex: 2
		});
		expect(db.batches.map((batch) => batch.events.length)).toEqual([1, 2]);
		await publisher.stop();
	});

	it('blocks every queued event when the batch answers stale generation', async () => {
		const db = createBatchPersistence();
		db.hooks.batchResponse = () => ({
			outcome: 'stale_generation',
			publish_allowed: false,
			turn_run_id: TURN_RUN_ID,
			queue_job_id: QUEUE_JOB_ID,
			execution_generation: 2,
			requested_execution_generation: 1,
			status: 'running'
		});
		const { publisher, broadcast } = startedPublisher(db);
		const first = publisher.enqueueSemantic(TURN_RUN_ID, semanticInput(1));
		const second = publisher.enqueueSemantic(TURN_RUN_ID, semanticInput(2));
		await expect(first.accepted).rejects.toThrow('stale_generation');
		await expect(second.accepted).rejects.toThrow('stale_generation');
		expect(publisher.getSnapshot(TURN_RUN_ID).blockedReason).toBe('ownership_lost');
		expect(eventBroadcastSequences(broadcast.messages)).toEqual([]);
		await publisher.stop();
	});

	it('blocks on a batch receipt that does not answer the batch it was sent', async () => {
		const db = createBatchPersistence();
		const gate = deferred<void>();
		db.hooks.beforeBatch = () => gate.promise;
		db.hooks.batchResponse = (input, response) =>
			input.events.length === 2 && response.outcome === 'batch_persisted'
				? { ...response, results: [...response.results].reverse() }
				: response;
		const { publisher, broadcast } = startedPublisher(db);
		const first = publisher.enqueueSemantic(TURN_RUN_ID, semanticInput(1));
		const second = publisher.enqueueSemantic(TURN_RUN_ID, semanticInput(2));
		const third = publisher.enqueueSemantic(TURN_RUN_ID, semanticInput(3));
		gate.resolve();
		await expect(first.accepted).resolves.toMatchObject({ sequenceIndex: 1 });
		await expect(second.accepted).rejects.toThrow('batch_receipt_order_mismatch');
		await expect(third.accepted).rejects.toThrow('batch_receipt_order_mismatch');
		expect(eventBroadcastSequences(broadcast.messages)).not.toContain(2);
		await publisher.stop();
	});

	it('falls back to one RPC per event while the batch RPC is missing, then probes it again', async () => {
		const db = createBatchPersistence();
		const batchRpc = db.persistence.persistSemanticBatch!;
		let missing = true;
		db.persistence.persistSemanticBatch = vi.fn(
			async (input: AgenticChatSemanticBatchInputV1) => {
				if (missing) throw new AgenticChatSemanticBatchUnavailableError('PGRST202');
				return batchRpc(input);
			}
		);
		let nowMs = 1_000;
		const { publisher } = startedPublisher(db, {
			now: () => nowMs,
			config: { semanticBatchUnavailableRetryMs: 60_000 }
		});

		const first = publisher.enqueueSemantic(TURN_RUN_ID, semanticInput(1));
		await expect(first.accepted).resolves.toMatchObject({
			outcome: 'persisted',
			sequenceIndex: 1
		});
		const second = publisher.enqueueSemantic(TURN_RUN_ID, semanticInput(2));
		await expect(second.accepted).resolves.toMatchObject({ sequenceIndex: 2 });
		expect(db.singles.map((input) => input.transition_id)).toEqual([
			transitionId(1),
			transitionId(2)
		]);
		expect(db.persistence.persistSemanticBatch).toHaveBeenCalledTimes(1);

		missing = false;
		nowMs += 60_001;
		const third = publisher.enqueueSemantic(TURN_RUN_ID, semanticInput(3));
		await expect(third.accepted).resolves.toMatchObject({ sequenceIndex: 3 });
		expect(db.batches.map((batch) => batch.events.map((event) => event.transition_id))).toEqual(
			[[transitionId(3)]]
		);
		await publisher.stop();
	});

	it('does not charge a tracked projection to pending bytes for every queued event', async () => {
		const db = createBatchPersistence();
		const gate = deferred<void>();
		db.hooks.beforeBatch = () => gate.promise;
		const { publisher } = startedPublisher(db);
		const queued = Array.from({ length: 10 }, (_, index) =>
			publisher.enqueueSemantic(
				TURN_RUN_ID,
				semanticInput(index + 1, { projectionBytes: 400 * 1024 })
			)
		);
		// Ten snapshots of a 400 KiB projection would be 4 MiB: over the 1 MiB
		// hard bound if each were charged. They share entries, so none is.
		expect(publisher.getSnapshot(TURN_RUN_ID)).toMatchObject({
			blockedReason: null,
			pendingEvents: 10
		});
		expect(publisher.getSnapshot(TURN_RUN_ID).pendingBytes).toBeLessThan(10 * 1024);
		gate.resolve();
		await Promise.all(queued.map((item) => item.accepted));
		await publisher.stop();
	});

	it('refuses a tracked projection above the database bound', () => {
		const db = createBatchPersistence();
		const { publisher } = startedPublisher(db);
		expect(() =>
			publisher.enqueueSemantic(
				TURN_RUN_ID,
				semanticInput(1, { projectionBytes: AGENTIC_CHAT_STREAM_PROJECTION_MAX_BYTES + 1 })
			)
		).toThrow('Semantic projection exceeds the database bound');
		void publisher.stop();
	});

	it('carries the earliest first-visible text time on the next batch, once', async () => {
		const db = createBatchPersistence();
		const { publisher } = startedPublisher(db);
		publisher.noteVisibleText(TURN_RUN_ID, 1, '2026-10-17T20:00:05.000Z', 'preview');
		publisher.noteVisibleText(TURN_RUN_ID, 1, '2026-10-17T20:00:04.000Z', 'durable_text');
		publisher.noteVisibleText(TURN_RUN_ID, 1, '2026-10-17T20:00:09.000Z', 'preview');
		// Another generation's evidence never lands on this one.
		publisher.noteVisibleText(TURN_RUN_ID, 2, '2026-10-17T20:00:01.000Z', 'preview');
		await publisher.enqueueSemantic(TURN_RUN_ID, semanticInput(1)).accepted;
		await publisher.enqueueSemantic(TURN_RUN_ID, semanticInput(2)).accepted;
		publisher.noteVisibleText(TURN_RUN_ID, 1, '2026-10-17T20:00:03.000Z', 'preview');
		await publisher.enqueueSemantic(TURN_RUN_ID, semanticInput(3)).accepted;
		expect(
			db.batches.map((batch) => [
				batch.first_visible_text_at,
				batch.first_visible_text_source
			])
		).toEqual([
			['2026-10-17T20:00:04.000Z', 'durable_text'],
			[null, null],
			['2026-10-17T20:00:03.000Z', 'preview']
		]);
		await publisher.stop();
	});

	it('records persisted text as visible when no preview came first', async () => {
		const db = createBatchPersistence();
		const { publisher } = startedPublisher(db);
		await publisher.appendText(TURN_RUN_ID, 'Answer').accepted;
		await publisher.enqueueSemantic(TURN_RUN_ID, semanticInput(1)).accepted;
		expect(db.batches[0]).toMatchObject({
			first_visible_text_at: '2026-10-17T20:00:00.500Z',
			first_visible_text_source: 'durable_text'
		});
		await publisher.stop();
	});
});

describe('Supabase batch persistence adapter', () => {
	it('maps a batch to the batch RPC behind the generation fence', async () => {
		const rpc = vi.fn(async () => ({
			data: { outcome: 'batch_persisted', results: [] },
			error: null
		}));
		const adapter = new SupabaseAgenticChatPersistenceAdapter({ rpc });
		const input: AgenticChatSemanticBatchInputV1 = {
			turn_run_id: TURN_RUN_ID,
			queue_job_id: QUEUE_JOB_ID,
			processing_token: context.processingToken,
			execution_generation: 1,
			assistant_text: 'Hello',
			events: [
				{
					transition_id: transitionId(1),
					phase: 'tool',
					event_type: 'tool_call',
					event_payload: { type: 'tool_call' }
				}
			],
			projection: { version: 'agentic_chat_ui_projection_v1' },
			first_visible_text_at: '2026-10-17T20:00:00.000Z',
			first_visible_text_source: 'preview'
		};
		await adapter.persistSemanticBatch(input);
		expect(rpc).toHaveBeenCalledWith('persist_agentic_chat_semantic_event_batch', {
			p_turn_run_id: TURN_RUN_ID,
			p_queue_job_id: QUEUE_JOB_ID,
			p_processing_token: context.processingToken,
			p_execution_generation: 1,
			p_assistant_text: 'Hello',
			p_events: input.events,
			p_projection: input.projection,
			p_first_visible_text_at: '2026-10-17T20:00:00.000Z',
			p_first_visible_text_source: 'preview'
		});
	});

	it('reports a missing batch function as unavailable and other errors unchanged', async () => {
		const missing = new SupabaseAgenticChatPersistenceAdapter({
			rpc: async () => ({
				data: null,
				error: {
					code: 'PGRST202',
					message:
						'Could not find the function public.persist_agentic_chat_semantic_event_batch'
				}
			})
		});
		const rejected = new SupabaseAgenticChatPersistenceAdapter({
			rpc: async () => ({
				data: null,
				error: { code: 'P0001', message: 'agentic_chat_semantic_batch_projection_ahead' }
			})
		});
		const input = { events: [] } as unknown as AgenticChatSemanticBatchInputV1;
		await expect(missing.persistSemanticBatch(input)).rejects.toBeInstanceOf(
			AgenticChatSemanticBatchUnavailableError
		);
		await expect(rejected.persistSemanticBatch(input)).rejects.toBeInstanceOf(
			AgenticChatPersistenceRpcError
		);
	});
});

const executionInput = {
	claim: {
		turnRunId: TURN_RUN_ID,
		queueJobId: QUEUE_JOB_ID,
		userId: USER_ID,
		sessionId: SESSION_ID,
		executionGeneration: 1
	},
	streamRunId: 'stream-1',
	clientTurnId: 'client-1'
} as never;

function servicesFor(publisher: AgenticChatStreamPublisher) {
	return new AgenticChatTurnRunServices(
		{ publisher, control: {} as never, sessionHandoff: {} as never },
		{} as never,
		{ timeoutMs: 1_000 } as never
	);
}

function semanticStep(index: number, payload?: JsonObject) {
	return {
		type: 'semantic' as const,
		transitionId: transitionId(index),
		phase: 'tool' as const,
		eventType: String(payload?.type ?? 'tool_call'),
		currentActivity: 'Looking things up…',
		eventPayload: payload ?? { type: 'tool_call', tool_call: { id: `call-${index}` } }
	};
}

describe('turn-run services admission', () => {
	it('enqueues concurrent publications in call order without waiting for earlier commits', async () => {
		const db = createBatchPersistence();
		const gate = deferred<void>();
		db.hooks.beforeBatch = () => gate.promise;
		const { publisher, broadcast } = startedPublisher(db);
		const services = servicesFor(publisher);
		const projection = emptyProjection();
		const signal = new AbortController().signal;

		const publications = [1, 2, 3].map((index) =>
			services.startSemantic(executionInput, projection, semanticStep(index), signal)
		);
		// All three hold their FIFO place while the first write is still open.
		await Promise.all(publications.map((publication) => publication.enqueued));
		expect(db.batches).toHaveLength(1);
		expect(publisher.getSnapshot(TURN_RUN_ID).pendingPersistenceEvents).toBe(3);
		expect(projection.semanticEvents.map((event) => event.sequence_index)).toEqual([1, 2, 3]);

		gate.resolve();
		await Promise.all(publications.map((publication) => publication.accepted));
		expect(db.batches.map((batch) => batch.events.map((event) => event.transition_id))).toEqual(
			[[transitionId(1)], [transitionId(2), transitionId(3)]]
		);
		await publisher.flushTurn(TURN_RUN_ID);
		expect(eventBroadcastSequences(broadcast.messages)).toEqual([1, 2, 3]);
		// Each projection written covers exactly the durable events up to its batch.
		for (const written of db.projections) {
			assertBrowserAcceptsProjection(written.projection, written.throughSequence);
			expect(
				(written.projection.semantic_events as Array<{ sequence_index: number }>).at(-1)!
					.sequence_index
			).toBe(written.throughSequence);
		}
		await publisher.stop();
	});

	it('publishes a 470 KiB read result inside every database bound (audit B4)', async () => {
		const db = createBatchPersistence();
		const { publisher } = startedPublisher(db);
		const services = servicesFor(publisher);
		const projection = emptyProjection();
		const signal = new AbortController().signal;

		await services.publishSemantic(
			executionInput,
			projection,
			semanticStep(1, hugeReadResultPayload()),
			signal
		);
		const written = db.batches[0]!;
		expect(utf8(written.events[0]!.event_payload)).toBeLessThan(
			AGENTIC_CHAT_STREAM_EVENT_PAYLOAD_MAX_BYTES
		);
		expect(
			written.events[0]!.event_payload[AGENTIC_CHAT_STREAM_COMPACTION_MARKER_KEY]
		).toBeDefined();
		expect(utf8(written.projection)).toBeLessThan(
			AGENTIC_CHAT_UI_PROJECTION_TOOL_ENTRY_BUDGET_BYTES * 2
		);
		assertBrowserAcceptsProjection(written.projection, 1);
		await publisher.stop();
	});

	it('under soft pressure the next publication waits for relief before it enqueues', async () => {
		const db = createBatchPersistence();
		const gate = deferred<void>();
		db.hooks.beforeBatch = () => gate.promise;
		const { publisher } = startedPublisher(db, {
			config: { turnPendingSoftEvents: 2, turnPendingHardEvents: 3 }
		});
		const services = servicesFor(publisher);
		const projection = emptyProjection();
		const signal = new AbortController().signal;
		const publications = [1, 2, 3, 4, 5].map((index) =>
			services.startSemantic(executionInput, projection, semanticStep(index), signal)
		);
		await publications[1]!.enqueued;
		await new Promise((resolve) => setImmediate(resolve));
		// Two are queued (the soft bound); the rest wait instead of overloading.
		expect(publisher.getSnapshot(TURN_RUN_ID)).toMatchObject({
			pendingEvents: 2,
			blockedReason: null
		});
		gate.resolve();
		await Promise.all(publications.map((publication) => publication.accepted));
		expect(db.sequence).toBe(5);
		expect(
			db.batches.flatMap((batch) => batch.events.map((event) => event.transition_id))
		).toEqual([1, 2, 3, 4, 5].map(transitionId));
		await publisher.stop();
	});

	it('an aborted caller enqueues nothing and does not reorder the others', async () => {
		const db = createBatchPersistence();
		const { publisher } = startedPublisher(db);
		const services = servicesFor(publisher);
		const projection = emptyProjection();
		const live = new AbortController().signal;
		const aborted = new AbortController();
		aborted.abort(new Error('cancelled'));
		const first = services.startSemantic(executionInput, projection, semanticStep(1), live);
		const skipped = services.startSemantic(
			executionInput,
			projection,
			semanticStep(2),
			aborted.signal
		);
		const third = services.startSemantic(executionInput, projection, semanticStep(3), live);
		await expect(skipped.accepted).rejects.toThrow('cancelled');
		await Promise.all([first.accepted, third.accepted]);
		expect(
			db.batches.flatMap((batch) => batch.events.map((event) => event.transition_id))
		).toEqual([transitionId(1), transitionId(3)]);
		expect(projection.semanticEvents.map((event) => event.sequence_index)).toEqual([1, 2]);
		await publisher.stop();
	});

	// Review 2026-10-17 P0: the live read runner stops at a rejected `enqueued`
	// and never awaits `accepted`. An unhandled rejection there exits the
	// worker process with every turn on it.
	it('a caller that stops at a rejected enqueue leaves no unhandled rejection', async () => {
		const unhandled: unknown[] = [];
		const onUnhandled = (reason: unknown) => unhandled.push(reason);
		process.on('unhandledRejection', onUnhandled);
		try {
			const db = createBatchPersistence();
			const gate = deferred<void>();
			db.hooks.beforeBatch = () => gate.promise;
			const { publisher } = startedPublisher(db, {
				config: { turnPendingSoftEvents: 1, turnPendingHardEvents: 8 }
			});
			const services = servicesFor(publisher);
			const projection = emptyProjection();
			const first = services.startSemantic(
				executionInput,
				projection,
				semanticStep(1),
				new AbortController().signal
			);
			await first.enqueued;
			// The second waits behind soft pressure; its read is cancelled meanwhile.
			const read = new AbortController();
			const second = services.startSemantic(
				executionInput,
				projection,
				semanticStep(2),
				read.signal
			);
			read.abort(new Error('provider_budget_exhausted'));
			await expect(second.enqueued).rejects.toThrow('provider_budget_exhausted');
			gate.resolve();
			await first.accepted;
			await new Promise((resolve) => setTimeout(resolve, 20));
			expect(unhandled).toEqual([]);
			await publisher.stop();
		} finally {
			process.off('unhandledRejection', onUnhandled);
		}
	});

	it('drops an event that never became durable from the projection', async () => {
		const db = createBatchPersistence();
		db.hooks.beforeBatch = () => {
			throw new AgenticChatPersistenceRpcError(
				'persist_agentic_chat_semantic_event_batch',
				'P0001',
				'agentic_chat_semantic_batch_prefix_conflict'
			);
		};
		const { publisher } = startedPublisher(db);
		const services = servicesFor(publisher);
		const projection = emptyProjection();
		await expect(
			services.publishSemantic(
				executionInput,
				projection,
				semanticStep(1),
				new AbortController().signal
			)
		).rejects.toThrow('persistence_error:P0001');
		expect(projection.semanticEvents).toEqual([]);
		expect(projection.semanticBytes).toBe(0);
		await publisher.stop();
	});
});
