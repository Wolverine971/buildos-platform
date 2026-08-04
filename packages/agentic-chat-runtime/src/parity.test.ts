// packages/agentic-chat-runtime/src/parity.test.ts
import { describe, expect, it } from 'vitest';
import type {
	AgentSSEMessage,
	AgentStreamEventPhase,
	AgentStreamEventV1
} from '@buildos/shared-types';
import { normalizeAgenticChatParityEventsV1, normalizeAgenticChatParityRunV1 } from './parity';

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
			legacyEvent({ type: 'phase_update', session_phase: 'gathering_info' }, 3, 'stream'),
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
			workerEvent({ type: 'phase_update', session_phase: 'gathering_info' }, 3, 'stream'),
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
});
