// packages/agentic-chat-runtime/src/parity.test.ts
import { describe, expect, it } from 'vitest';
import type {
	AgentSSEMessage,
	AgentStreamEventPhase,
	AgentStreamEventV1
} from '@buildos/shared-types';
import {
	diffAgenticChatParityRunsV1,
	normalizeAgenticChatParityEventsV1,
	normalizeAgenticChatParityRunV1
} from './parity';

const legacyEvent = <TEvent extends AgentSSEMessage>(
	event: TEvent,
	sequence: number,
	phase: AgentStreamEventPhase
): TEvent =>
	({
		...event,
		event_id: `legacy-stream:${sequence}`,
		stream_run_id: 'legacy-stream',
		client_turn_id: 'legacy-client',
		turn_run_id: 'legacy-turn',
		sequence_index: sequence,
		phase,
		event_type: event.type,
		durable: true
	}) as TEvent;

const workerEvent = <TEvent extends AgentSSEMessage>(
	event: TEvent,
	sequence: number,
	phase: AgentStreamEventPhase
): AgentStreamEventV1<TEvent> => ({
	...event,
	contract_version: 'agentic_chat_worker_v1',
	event_id: `worker-turn:1:${sequence}`,
	stream_run_id: 'worker-stream',
	client_turn_id: 'worker-client',
	session_id: 'worker-session',
	turn_run_id: 'worker-turn',
	execution_generation: 1,
	sequence_index: sequence,
	phase,
	event_type: event.type,
	durable: true
});

describe('Agentic Chat Phase 4 parity projection', () => {
	it('equates transport envelopes and assistant text chunk boundaries', () => {
		const legacy = normalizeAgenticChatParityEventsV1([
			legacyEvent({ type: 'text_delta', content: 'Hel' }, 1, 'llm'),
			legacyEvent({ type: 'text', content: 'lo' }, 2, 'llm'),
			legacyEvent(
				{
					type: 'phase_update',
					session_phase: 'gathering_info'
				} as unknown as AgentSSEMessage,
				3,
				'stream'
			),
			legacyEvent(
				{ type: 'turn_phase', turn_phase: 'finalizing', message: 'Finishing' },
				4,
				'stream'
			),
			legacyEvent({ type: 'done', finished_reason: 'stop' }, 5, 'finalize')
		]);
		const worker = normalizeAgenticChatParityEventsV1([
			workerEvent({ type: 'text', content: 'H' }, 1, 'llm'),
			workerEvent({ type: 'text_delta', content: 'ello' }, 2, 'llm'),
			workerEvent(
				{
					type: 'phase_update',
					session_phase: 'gathering_info'
				} as unknown as AgentSSEMessage,
				3,
				'stream'
			),
			workerEvent(
				{ type: 'turn_phase', turn_phase: 'finalizing', message: 'Finishing' },
				4,
				'stream'
			),
			workerEvent({ type: 'done', finished_reason: 'stop' }, 5, 'finalize')
		]);

		expect(worker).toEqual(legacy);
		expect(worker).toEqual([
			{ type: 'assistant_text', phase: 'llm', payload: { content: 'Hello' } },
			{
				type: 'phase_update',
				phase: 'stream',
				payload: { session_phase: 'gathering_info' }
			},
			{
				type: 'turn_phase',
				phase: 'stream',
				payload: { message: 'Finishing', turn_phase: 'finalizing' }
			},
			{ type: 'done', phase: 'finalize', payload: { finished_reason: 'stop' } }
		]);
	});

	it('accepts the durable worker text_delta spelling and rejects ambiguous text', () => {
		const durableWorkerEvent = {
			...workerEvent({ type: 'text_delta', content: 'Hello' }, 1, 'llm'),
			content: undefined,
			text_delta: 'Hello'
		};
		expect(normalizeAgenticChatParityEventsV1([durableWorkerEvent as never])).toEqual([
			{ type: 'assistant_text', phase: 'llm', payload: { content: 'Hello' } }
		]);
		expect(() =>
			normalizeAgenticChatParityEventsV1([
				{ ...durableWorkerEvent, content: 'Different' } as never
			])
		).toThrow('assistant text spellings do not match');
	});

	it('keeps semantic payloads and every persistence collection exact', () => {
		const baseline = normalizeAgenticChatParityRunV1({
			events: [legacyEvent({ type: 'done', finished_reason: 'stop' }, 1, 'finalize')],
			messages: [{ role: 'assistant', content: 'Answer', id: 'assistant-1' }],
			toolExecutions: [],
			checkpoints: [],
			outcome: { status: 'completed', finishedReason: 'stop' },
			metadata: { model: 'test-model', timing: { totalMs: 42 } }
		});
		const changed = normalizeAgenticChatParityRunV1({
			events: [workerEvent({ type: 'done', finished_reason: 'length' }, 1, 'finalize')],
			messages: [{ role: 'assistant', content: 'Different', id: 'assistant-1' }],
			toolExecutions: [],
			checkpoints: [],
			outcome: { status: 'completed', finishedReason: 'length' },
			metadata: { model: 'test-model', timing: { totalMs: 42 } }
		});

		expect(changed).not.toEqual(baseline);
		expect(baseline.messages).toEqual([
			{ content: 'Answer', id: 'assistant-1', role: 'assistant' }
		]);
	});

	it('rejects mismatched envelope identities and unsafe ordering', () => {
		expect(() =>
			normalizeAgenticChatParityEventsV1([
				{
					...legacyEvent({ type: 'done', finished_reason: 'stop' }, 1, 'finalize'),
					event_type: 'error'
				}
			])
		).toThrow('event_type does not match type');
		expect(() =>
			normalizeAgenticChatParityEventsV1([
				workerEvent({ type: 'text', content: 'A' }, 2, 'llm'),
				workerEvent({ type: 'text', content: 'B' }, 1, 'llm')
			])
		).toThrow('not in strict sequence order');
		expect(() =>
			normalizeAgenticChatParityEventsV1([
				workerEvent({ type: 'text', content: 'A' }, 1, 'llm'),
				{
					...workerEvent({ type: 'done', finished_reason: 'stop' }, 2, 'finalize'),
					execution_generation: 2
				}
			])
		).toThrow('cannot mix execution generations');
	});

	it('fails closed on the ambiguous legacy phase_update field', () => {
		expect(() =>
			normalizeAgenticChatParityEventsV1([
				legacyEvent(
					{ type: 'phase_update', phase: 'review' } as unknown as AgentSSEMessage,
					1,
					'stream'
				)
			])
		).toThrow('requires session_phase separate from envelope phase');
	});

	it('rejects non-wire-safe snapshot values instead of hiding them', () => {
		expect(() =>
			normalizeAgenticChatParityRunV1({
				events: [],
				messages: [],
				toolExecutions: [],
				checkpoints: [],
				outcome: { score: Number.NaN },
				metadata: {}
			})
		).toThrow('require finite numbers');
	});

	it('reports a bounded stable structural diff', () => {
		const expected = normalizeAgenticChatParityRunV1({
			events: [legacyEvent({ type: 'done', finished_reason: 'stop' }, 1, 'finalize')],
			messages: [{ role: 'assistant', content: 'Answer' }],
			toolExecutions: [],
			checkpoints: [],
			outcome: { status: 'completed' },
			metadata: { model: 'fixture' }
		});
		const actual = normalizeAgenticChatParityRunV1({
			events: [],
			messages: [{ role: 'assistant', content: 'Different' }],
			toolExecutions: [{ name: 'unexpected' }],
			checkpoints: [],
			outcome: { status: 'completed' },
			metadata: { model: 'fixture' }
		});

		expect(diffAgenticChatParityRunsV1(expected, actual)).toEqual({
			matches: false,
			truncated: false,
			differences: [
				{
					path: '/events/0',
					kind: 'missing_in_actual',
					expected: { present: true, value: expected.events[0] },
					actual: { present: false, value: null }
				},
				{
					path: '/messages/0/content',
					kind: 'value_mismatch',
					expected: { present: true, value: 'Answer' },
					actual: { present: true, value: 'Different' }
				},
				{
					path: '/toolExecutions/0',
					kind: 'unexpected_in_actual',
					expected: { present: false, value: null },
					actual: { present: true, value: { name: 'unexpected' } }
				}
			]
		});
		expect(diffAgenticChatParityRunsV1(expected, actual, { maxDifferences: 1 })).toMatchObject({
			matches: false,
			truncated: true,
			differences: [{ path: '/events/0' }]
		});
	});

	it('aligns semantic events so missing lifecycle events do not cascade', () => {
		const expected = normalizeAgenticChatParityRunV1({
			events: [
				legacyEvent(
					{ type: 'turn_phase', turn_phase: 'acknowledged', message: 'Starting' },
					1,
					'stream'
				),
				legacyEvent({ type: 'text_delta', content: 'Answer' }, 2, 'llm'),
				legacyEvent(
					{ type: 'turn_phase', turn_phase: 'finalizing', message: 'Finishing' },
					3,
					'stream'
				),
				legacyEvent(
					{ type: 'done', finished_reason: 'stop', usage: { total_tokens: 5 } },
					4,
					'finalize'
				)
			],
			messages: [],
			toolExecutions: [],
			checkpoints: [],
			outcome: {},
			metadata: {}
		});
		const actual = normalizeAgenticChatParityRunV1({
			events: [
				workerEvent({ type: 'text_delta', content: 'Answer' }, 1, 'llm'),
				workerEvent(
					{ type: 'turn_phase', turn_phase: 'finalizing', message: 'Finishing' },
					2,
					'stream'
				),
				workerEvent(
					{ type: 'done', finished_reason: 'stop', usage: { total_tokens: 6 } },
					3,
					'finalize'
				)
			],
			messages: [],
			toolExecutions: [],
			checkpoints: [],
			outcome: {},
			metadata: {}
		});

		expect(diffAgenticChatParityRunsV1(expected, actual).differences).toEqual([
			expect.objectContaining({ path: '/events/0', kind: 'missing_in_actual' }),
			expect.objectContaining({
				path: '/events/3/payload/usage/total_tokens',
				kind: 'value_mismatch'
			})
		]);
	});

	it('aligns lifecycle observability metadata without weakening other metadata', () => {
		const expected = normalizeAgenticChatParityRunV1({
			events: [],
			messages: [],
			toolExecutions: [],
			checkpoints: [],
			outcome: {},
			metadata: {
				lifecycle_events: [
					{ event_type: 'turn_intent_resolved', phase: 'prompt' },
					{ event_type: 'turn_phase_changed', phase: 'stream', status: 'finalizing' },
					{ event_type: 'done_emitted', phase: 'finalize' }
				],
				prompt_snapshot_count: 1
			}
		});
		const actual = normalizeAgenticChatParityRunV1({
			events: [],
			messages: [],
			toolExecutions: [],
			checkpoints: [],
			outcome: {},
			metadata: {
				lifecycle_events: [
					{ event_type: 'turn_phase_changed', phase: 'stream', status: 'finalizing' }
				],
				prompt_snapshot_count: 0
			}
		});

		expect(diffAgenticChatParityRunsV1(expected, actual).differences).toEqual([
			expect.objectContaining({
				path: '/metadata/lifecycle_events/0',
				kind: 'missing_in_actual'
			}),
			expect.objectContaining({
				path: '/metadata/lifecycle_events/2',
				kind: 'missing_in_actual'
			}),
			expect.objectContaining({
				path: '/metadata/prompt_snapshot_count',
				kind: 'value_mismatch'
			})
		]);
	});
});
