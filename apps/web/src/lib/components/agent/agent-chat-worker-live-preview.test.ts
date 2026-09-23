// apps/web/src/lib/components/agent/agent-chat-worker-live-preview.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
	createAgentStreamEventIdV1,
	type AgenticChatLiveTextPreviewV1,
	type AgentStreamEventV1,
	type TurnHandleV1
} from '@buildos/shared-types';
import type { AgenticChatWorkerReconciledReceipt } from '$lib/services/agentic-chat-v2/worker-realtime-inbox';
import { LIVE_TEXT_PREVIEW_STALE_MS } from '$lib/services/agentic-chat-v2/worker-realtime-preview';
import {
	AgentChatWorkerUiAdapter,
	type AgentChatWorkerUiAdapterPort
} from './agent-chat-worker-ui-adapter';

const SESSION_ID = 'd2000000-0000-4000-8000-000000000001';
const TURN_ID = 'd4000000-0000-4000-8000-000000000001';

type WorkerTurnHandle = Extract<TurnHandleV1, { executionMode: 'worker_realtime' }>;

const handle: WorkerTurnHandle = {
	contractVersion: AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
	executionMode: 'worker_realtime',
	turnRunId: TURN_ID,
	sessionId: SESSION_ID,
	streamRunId: 'stream-run-1',
	clientTurnId: 'client-turn-1'
};

afterEach(() => {
	vi.useRealTimers();
});

function event(
	sequenceIndex: number,
	type: string,
	payload: Record<string, unknown> = {},
	executionGeneration = 1
): AgentStreamEventV1 {
	return {
		contract_version: AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
		event_id: createAgentStreamEventIdV1(TURN_ID, executionGeneration, sequenceIndex),
		stream_run_id: handle.streamRunId,
		client_turn_id: handle.clientTurnId,
		session_id: SESSION_ID,
		turn_run_id: TURN_ID,
		execution_generation: executionGeneration,
		sequence_index: sequenceIndex,
		phase: type === 'done' ? 'finalize' : type.startsWith('tool_') ? 'tool' : 'llm',
		event_type: type,
		durable: true,
		type,
		...payload
	};
}

function receipt(
	overrides: Partial<AgenticChatWorkerReconciledReceipt> = {}
): AgenticChatWorkerReconciledReceipt {
	return {
		outcome: 'reconciled',
		contract_version: AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
		turn_run_id: TURN_ID,
		session_id: SESSION_ID,
		user_id: 'd1000000-0000-4000-8000-000000000001',
		stream_run_id: handle.streamRunId,
		client_turn_id: handle.clientTurnId,
		execution_mode: 'worker_realtime',
		requested_execution_generation: 0,
		execution_generation: 1,
		generation_changed: true,
		status: 'running',
		text: '',
		projection: {},
		snapshot_sequence: 3,
		durable_through_sequence: 3,
		projection_durable_sequence: 3,
		durable_events: [],
		response_watermark: 3,
		reconcile_required: false,
		assistant_message: null,
		terminal_event_id: null,
		terminalized_at: null,
		finished_reason: null,
		failure_code: null,
		updated_at: '2026-09-23T12:00:00.000Z',
		...overrides
	};
}

function preview(
	overrides: Partial<AgenticChatLiveTextPreviewV1> = {}
): AgenticChatLiveTextPreviewV1 {
	return {
		contract_version: AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
		turn_run_id: TURN_ID,
		session_id: SESSION_ID,
		execution_generation: 1,
		pass_key: '2.acting.1.7',
		seq: 1,
		text: 'Here',
		state: 'streaming',
		durable_sequence_floor: 3,
		...overrides
	};
}

/** Renders exactly what the modal would: durable text followed by the preview. */
function harness() {
	let durable = '';
	let previewText: string | null = null;
	const port: AgentChatWorkerUiAdapterPort = {
		beginGeneration: vi.fn(),
		replaceAssistantSnapshot: vi.fn(({ text }) => {
			durable = text;
		}),
		appendAssistantText: vi.fn(({ text }) => {
			durable += text;
		}),
		applySemanticEvent: vi.fn(),
		updateTurnState: vi.fn(),
		finishTurn: vi.fn(),
		setAssistantPreview: vi.fn(({ text }) => {
			previewText = text;
		}),
		onError: vi.fn()
	};
	const adapter = new AgentChatWorkerUiAdapter({ handle, port, onTerminal: vi.fn() });
	adapter.applyReconciliation(receipt());
	return {
		adapter,
		port,
		screen: () => durable + (previewText ?? ''),
		preview: () => previewText
	};
}

describe('AgentChatWorkerUiAdapter live preview', () => {
	it('shows the preview after durable text and swaps to durable text without a flicker', () => {
		const h = harness();
		h.adapter.applyPreview(preview({ seq: 1, text: 'Here' }));
		expect(h.screen()).toBe('Here');
		h.adapter.applyPreview(preview({ seq: 2, text: 'Here is your plan.' }));
		expect(h.screen()).toBe('Here is your plan.');

		// The released pass arrives in two durable chunks; the bubble never shrinks.
		h.adapter.applyLiveEvent(event(4, 'text_delta', { text_delta: 'Here' }));
		expect(h.screen()).toBe('Here is your plan.');
		expect(h.preview()).toBe(' is your plan.');
		h.adapter.applyLiveEvent(event(5, 'text_delta', { text_delta: ' is your plan.' }));
		expect(h.screen()).toBe('Here is your plan.');
		expect(h.preview()).toBeNull();

		// A late copy of the final flush is older than durable truth: ignored.
		h.adapter.applyPreview(preview({ seq: 3, text: 'Here is your plan.' }));
		expect(h.screen()).toBe('Here is your plan.');
	});

	it('clears a preview whose prose was withheld when the next durable event lands', () => {
		const h = harness();
		h.adapter.applyPreview(preview({ text: "I'll create those tasks now." }));
		expect(h.preview()).toBe("I'll create those tasks now.");

		h.adapter.applyLiveEvent(event(4, 'tool_call', { tool_name: 'create_onto_task' }));
		expect(h.preview()).toBeNull();
		expect(h.screen()).toBe('');
	});

	it('keeps the preview across durable events at or below its floor', () => {
		const h = harness();
		h.adapter.applyPreview(preview({ seq: 1, durable_sequence_floor: 5, text: 'Draft' }));
		h.adapter.applyLiveEvent(event(4, 'turn_phase', { turn_phase: 'acknowledged' }));
		h.adapter.applyLiveEvent(event(5, 'context_usage', { usage: {} }));
		expect(h.preview()).toBe('Draft');
	});

	it('joins a later pass after earlier durable text the way the worker will', () => {
		const h = harness();
		h.adapter.applyLiveEvent(event(4, 'text_delta', { text_delta: 'Let me check.' }));
		h.adapter.applyLiveEvent(event(5, 'tool_call', { tool_name: 'list_onto_tasks' }));
		h.adapter.applyPreview(preview({ durable_sequence_floor: 5, text: 'You have 3 tasks.' }));
		expect(h.screen()).toBe('Let me check.\n\nYou have 3 tasks.');

		h.adapter.applyLiveEvent(
			event(6, 'text_delta', { text_delta: '\n\nYou have 3 tasks.' })
		);
		expect(h.screen()).toBe('Let me check.\n\nYou have 3 tasks.');
		expect(h.preview()).toBeNull();
	});

	it('retracts on discard, replaces on a newer pass, and ignores stale seq', () => {
		const h = harness();
		h.adapter.applyPreview(preview({ seq: 5, pass_key: 'a', text: 'Attempt one' }));
		h.adapter.applyPreview(preview({ seq: 4, pass_key: 'a', text: 'Stale' }));
		expect(h.preview()).toBe('Attempt one');
		h.adapter.applyPreview(preview({ seq: 6, pass_key: 'a', state: 'discard', text: '' }));
		expect(h.preview()).toBeNull();
		h.adapter.applyPreview(preview({ seq: 7, pass_key: 'b', text: 'Attempt two' }));
		h.adapter.applyPreview(preview({ seq: 8, pass_key: 'c', text: 'Synthesis' }));
		expect(h.preview()).toBe('Synthesis');
	});

	it('ignores previews for another generation or another turn', () => {
		const h = harness();
		h.adapter.applyPreview(preview({ execution_generation: 2 }));
		h.adapter.applyPreview(preview({ turn_run_id: 'd4000000-0000-4000-8000-000000000009' }));
		expect(h.port.setAssistantPreview).not.toHaveBeenCalled();
	});

	it('clears on terminal state and never shows a preview afterwards', () => {
		const h = harness();
		h.adapter.applyPreview(preview({ text: 'Almost done' }));
		h.adapter.applyLiveEvent(
			event(4, 'done', { status: 'completed', finished_reason: 'stop' })
		);
		expect(h.preview()).toBeNull();
		expect(vi.mocked(h.port.setAssistantPreview!).mock.invocationCallOrder.at(-1)).toBeLessThan(
			vi.mocked(h.port.finishTurn).mock.invocationCallOrder[0]!
		);
		h.adapter.applyPreview(preview({ seq: 9, durable_sequence_floor: 4, text: 'Late' }));
		expect(h.preview()).toBeNull();
	});

	it('drops a preview that stops updating', () => {
		vi.useFakeTimers({ now: 10_000 });
		const h = harness();
		h.adapter.applyPreview(preview({ text: 'Stalled' }));
		vi.advanceTimersByTime(LIVE_TEXT_PREVIEW_STALE_MS - 1);
		expect(h.preview()).toBe('Stalled');
		vi.advanceTimersByTime(1);
		expect(h.preview()).toBeNull();
	});

	it('supersedes through reconciliation when durable truth moved past the floor', () => {
		const h = harness();
		h.adapter.applyPreview(preview({ text: 'Working on it' }));
		h.adapter.applyReconciliation(
			receipt({
				requested_execution_generation: 1,
				generation_changed: false,
				text: '',
				snapshot_sequence: 4,
				durable_through_sequence: 4,
				projection_durable_sequence: 3,
				response_watermark: 4,
				durable_events: [event(4, 'tool_call', { tool_name: 'list_onto_tasks' })]
			})
		);
		expect(h.preview()).toBeNull();
	});
});
