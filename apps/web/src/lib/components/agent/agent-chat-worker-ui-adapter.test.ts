// apps/web/src/lib/components/agent/agent-chat-worker-ui-adapter.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
	createAgentStreamEventIdV1,
	type AgentStreamEventV1,
	type JsonObject,
	type TurnHandleV1
} from '@buildos/shared-types';
import type { AgenticChatWorkerReconciledReceipt } from '$lib/services/agentic-chat-v2/worker-realtime-inbox';
import {
	AgentChatWorkerUiAdapter,
	type AgentChatWorkerUiAdapterPort
} from './agent-chat-worker-ui-adapter';
import { workflowProjectionFixture } from './agent-chat-workflow.fixture';

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
		requested_execution_generation: 1,
		execution_generation: 1,
		generation_changed: false,
		status: 'running',
		text: 'Hello',
		projection: {},
		snapshot_sequence: 0,
		durable_through_sequence: 0,
		projection_durable_sequence: 0,
		durable_events: [],
		response_watermark: 0,
		reconcile_required: false,
		assistant_message: null,
		terminal_event_id: null,
		terminalized_at: null,
		finished_reason: null,
		failure_code: null,
		updated_at: '2026-08-03T12:00:00.000Z',
		...overrides
	};
}

function harness(options: { now?: () => number } = {}) {
	const order: string[] = [];
	const port: AgentChatWorkerUiAdapterPort = {
		beginGeneration: vi.fn(() => order.push('begin')),
		replaceAssistantSnapshot: vi.fn(() => order.push('snapshot')),
		appendAssistantText: vi.fn(() => order.push('append')),
		applySemanticEvent: vi.fn((message) => order.push(`semantic:${message.type}`)),
		updateTurnState: vi.fn(() => order.push('state')),
		finishTurn: vi.fn(() => order.push('finish')),
		onError: vi.fn(() => order.push('error'))
	};
	const onTerminal = vi.fn(() => order.push('terminal'));
	const adapter = new AgentChatWorkerUiAdapter({ handle, port, onTerminal, now: options.now });
	return { adapter, port, onTerminal, order };
}

describe('AgentChatWorkerUiAdapter', () => {
	it('restores a workflow projection before finalizing a partial turn at the same sequence', () => {
		const h = harness();
		const workflow = workflowProjectionFixture({
			phase: 'finished',
			terminalOutcome: 'partial'
		});
		workflow.steps[3]!.status = 'claimed';
		h.adapter.applyReconciliation(
			receipt({
				status: 'completed',
				projection: {
					version: 'agentic_chat_ui_projection_v1',
					current_activity: '',
					semantic_events: [],
					workflow
				} as unknown as JsonObject,
				projection_durable_sequence: 3,
				response_watermark: 3,
				terminal_event_id: createAgentStreamEventIdV1(TURN_ID, 1, 3)
			})
		);
		expect(h.port.applySemanticEvent).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({ type: 'workflow_progress', workflow })
		);
		expect(h.port.applySemanticEvent).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ type: 'done' })
		);
		expect(h.order.indexOf('semantic:workflow_progress')).toBeLessThan(
			h.order.indexOf('semantic:done')
		);
		expect(h.onTerminal).toHaveBeenCalledExactlyOnceWith('completed');
	});

	it('normalizes live workflow progress and applies terminal workflow truth before done', () => {
		const h = harness();
		h.adapter.applyReconciliation(receipt());
		const workflow = workflowProjectionFixture({ phase: 'executing' });
		h.adapter.applyLiveEvent(event(1, 'workflow_progress', { workflow }));
		const finished = { ...workflow, phase: 'finished', terminalOutcome: 'cancelled' };
		h.adapter.applyLiveEvent(event(2, 'done', { status: 'cancelled', workflow: finished }));
		expect(h.port.applySemanticEvent).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({ type: 'workflow_progress', workflow })
		);
		expect(h.port.applySemanticEvent).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ type: 'workflow_progress', workflow: finished })
		);
		expect(h.port.applySemanticEvent).toHaveBeenNthCalledWith(
			3,
			expect.objectContaining({ type: 'done', finished_reason: 'cancelled' })
		);
		expect(h.onTerminal).toHaveBeenCalledExactlyOnceWith('cancelled');
	});

	it('deduplicates reconciled workflow snapshots and restores progress in a new generation', () => {
		const h = harness();
		const workflow = workflowProjectionFixture({ phase: 'executing' });
		const snapshot = receipt({
			projection: {
				version: 'agentic_chat_ui_projection_v1',
				semantic_events: [],
				workflow
			} as unknown as JsonObject,
			projection_durable_sequence: 2,
			response_watermark: 2
		});
		h.adapter.applyReconciliation(snapshot);
		h.adapter.applyReconciliation(snapshot);
		expect(h.port.applySemanticEvent).toHaveBeenCalledOnce();
		h.adapter.applyReconciliation({
			...snapshot,
			execution_generation: 2,
			generation_changed: true
		});
		expect(h.port.applySemanticEvent).toHaveBeenCalledTimes(2);
		expect(h.port.beginGeneration).toHaveBeenCalledTimes(2);
	});

	it('reports an invalid workflow snapshot while still restoring ordinary terminal truth', () => {
		const h = harness();
		h.adapter.applyReconciliation(
			receipt({
				status: 'failed',
				projection: {
					version: 'agentic_chat_ui_projection_v1',
					semantic_events: [],
					workflow: { phase: 'finished' }
				}
			})
		);
		expect(h.port.onError).toHaveBeenCalledOnce();
		expect(h.port.applySemanticEvent).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({ type: 'done' })
		);
		expect(h.onTerminal).toHaveBeenCalledExactlyOnceWith('failed');
	});

	it('applies authoritative text before semantic projection and skips reconciled text deltas', () => {
		const h = harness();
		const projectedToolCall = event(1, 'tool_call', {
			tool_call_id: 'tool-call-1',
			tool_name: 'search',
			arguments: {}
		});
		const retainedText = event(2, 'text_delta', { text_delta: 'llo' });
		const retainedToolResult = event(3, 'tool_result', {
			tool_call_id: 'tool-call-1',
			tool_name: 'search',
			ok: true,
			result: {}
		});

		h.adapter.applyReconciliation(
			receipt({
				projection: {
					version: 'agentic_chat_ui_projection_v1',
					current_activity: 'Searching the workspace...',
					semantic_events: [projectedToolCall]
				} as unknown as JsonObject,
				snapshot_sequence: 3,
				durable_through_sequence: 3,
				projection_durable_sequence: 1,
				durable_events: [retainedText, retainedToolResult],
				response_watermark: 3
			})
		);

		expect(h.order).toEqual([
			'begin',
			'snapshot',
			'semantic:tool_call',
			'semantic:tool_result',
			'state'
		]);
		expect(h.port.replaceAssistantSnapshot).toHaveBeenCalledWith(
			expect.objectContaining({ text: 'Hello', executionGeneration: 1 })
		);
		expect(h.port.appendAssistantText).not.toHaveBeenCalled();
		expect(h.port.updateTurnState).toHaveBeenCalledWith(
			expect.objectContaining({ currentActivity: 'Searching the workspace...' })
		);
	});

	it('appends live text exactly once and deduplicates semantic events across reconciliation', () => {
		const h = harness();
		const projected = event(1, 'tool_call', {
			tool_call_id: 'tool-call-1',
			tool_name: 'search',
			arguments: {}
		});
		const projection = {
			version: 'agentic_chat_ui_projection_v1',
			current_activity: null,
			semantic_events: [projected]
		} as unknown as JsonObject;
		h.adapter.applyReconciliation(
			receipt({
				projection,
				snapshot_sequence: 1,
				durable_through_sequence: 1,
				projection_durable_sequence: 1,
				response_watermark: 1
			})
		);

		h.adapter.applyLiveEvent(event(2, 'text_delta', { text_delta: ' world' }));
		h.adapter.applyReconciliation(
			receipt({
				text: 'Hello world',
				projection,
				snapshot_sequence: 2,
				durable_through_sequence: 2,
				projection_durable_sequence: 1,
				durable_events: [event(2, 'text_delta', { text_delta: ' world' })],
				response_watermark: 2
			})
		);

		expect(h.port.appendAssistantText).toHaveBeenCalledOnce();
		expect(h.port.appendAssistantText).toHaveBeenCalledWith(
			expect.objectContaining({ text: ' world' })
		);
		expect(h.port.applySemanticEvent).toHaveBeenCalledOnce();
		expect(h.port.replaceAssistantSnapshot).toHaveBeenLastCalledWith(
			expect.objectContaining({ text: 'Hello world' })
		);
	});

	it('resets generation-scoped semantic identities after authoritative recovery', () => {
		const h = harness();
		h.adapter.applyReconciliation(receipt());
		h.adapter.applyLiveEvent(
			event(1, 'tool_call', {
				tool_call_id: 'tool-call-1',
				tool_name: 'search',
				arguments: {}
			})
		);

		h.adapter.applyReconciliation(
			receipt({
				requested_execution_generation: 1,
				execution_generation: 2,
				generation_changed: true,
				projection: {
					version: 'agentic_chat_ui_projection_v1',
					current_activity: 'Retrying...',
					semantic_events: [
						event(
							1,
							'tool_call',
							{
								tool_call_id: 'tool-call-2',
								tool_name: 'search',
								arguments: {}
							},
							2
						)
					]
				} as unknown as JsonObject,
				snapshot_sequence: 1,
				durable_through_sequence: 1,
				projection_durable_sequence: 1,
				response_watermark: 1
			})
		);

		expect(h.port.beginGeneration).toHaveBeenCalledTimes(2);
		expect(h.port.beginGeneration).toHaveBeenLastCalledWith(
			expect.objectContaining({ executionGeneration: 2 })
		);
		expect(h.port.applySemanticEvent).toHaveBeenCalledTimes(2);
	});

	it('projects reconciled terminal truth once and releases adoption', () => {
		const h = harness();
		const done = event(1, 'done', {
			status: 'completed',
			finished_reason: 'stop',
			failure_code: null,
			assistant_message_id: 'd6000000-0000-4000-8000-000000000001'
		});
		const terminal = receipt({
			status: 'completed',
			text: 'Finished answer',
			snapshot_sequence: 1,
			durable_through_sequence: 1,
			projection_durable_sequence: 0,
			durable_events: [done],
			response_watermark: 1,
			assistant_message: {
				id: 'd6000000-0000-4000-8000-000000000001',
				role: 'assistant',
				content: 'Finished answer',
				metadata: { turn_run_id: TURN_ID, execution_generation: 1 },
				prompt_tokens: 10,
				completion_tokens: 2,
				total_tokens: 12,
				created_at: '2026-08-03T12:00:00.000Z'
			},
			terminal_event_id: createAgentStreamEventIdV1(TURN_ID, 1, 1),
			terminalized_at: '2026-08-03T12:00:01.000Z',
			finished_reason: 'stop'
		});

		h.adapter.applyReconciliation(terminal);
		h.adapter.applyReconciliation(terminal);

		expect(h.order).toEqual([
			'begin',
			'snapshot',
			'semantic:done',
			'state',
			'finish',
			'terminal'
		]);
		expect(h.port.finishTurn).toHaveBeenCalledWith(
			expect.objectContaining({ status: 'completed', finishedReason: 'stop' })
		);
		expect(h.onTerminal).toHaveBeenCalledOnce();
	});

	it('keeps authoritative text and status when an optional projection is invalid', () => {
		const h = harness();
		h.adapter.applyReconciliation(
			receipt({
				projection: {
					version: 'unknown_projection',
					semantic_events: []
				} as unknown as JsonObject
			})
		);

		expect(h.order).toEqual(['begin', 'snapshot', 'error', 'state']);
		expect(h.port.replaceAssistantSnapshot).toHaveBeenCalledOnce();
		expect(h.port.updateTurnState).toHaveBeenCalledOnce();
	});

	it('rejects a live event before generation reconciliation and forbids snapshot text events', () => {
		const h = harness();
		expect(() =>
			h.adapter.applyLiveEvent(event(1, 'text_delta', { text_delta: 'unsafe' }))
		).toThrow('before generation reconciliation');

		h.adapter.applyReconciliation(receipt());
		expect(() => h.adapter.applyLiveEvent(event(1, 'text', { content: 'snapshot' }))).toThrow(
			'cannot publish a non-snapshot text event'
		);
		expect(h.port.appendAssistantText).not.toHaveBeenCalled();
	});

	describe('a turn no worker has picked up', () => {
		const QUEUED_AT = '2026-09-23T12:00:00.000Z';
		const queuedReceipt = (overrides: Partial<AgenticChatWorkerReconciledReceipt> = {}) =>
			receipt({
				requested_execution_generation: null,
				execution_generation: 0,
				status: 'queued',
				text: '',
				updated_at: QUEUED_AT,
				...overrides
			});

		it('reads as Thinking… at first and names the wait once it runs past ~20s', () => {
			let now = Date.parse(QUEUED_AT) + 5_000;
			const h = harness({ now: () => now });

			h.adapter.applyReconciliation(queuedReceipt());
			now = Date.parse(QUEUED_AT) + 25_000;
			h.adapter.applyReconciliation(queuedReceipt({ requested_execution_generation: 0 }));

			expect(h.port.updateTurnState).toHaveBeenNthCalledWith(1, {
				handle,
				status: 'queued',
				currentActivity: 'Thinking…'
			});
			expect(h.port.updateTurnState).toHaveBeenNthCalledWith(2, {
				handle,
				status: 'queued',
				currentActivity: 'Taking longer than usual…'
			});
		});

		it('keys the wait on the durable queue time, so a reload shows the same text', () => {
			const h = harness({ now: () => Date.parse(QUEUED_AT) + 90_000 });

			h.adapter.applyReconciliation(queuedReceipt());

			expect(h.port.beginGeneration).toHaveBeenCalledOnce();
			expect(h.port.updateTurnState).toHaveBeenCalledWith(
				expect.objectContaining({ currentActivity: 'Taking longer than usual…' })
			);
		});

		it('ignores a previous attempt’s projected activity while requeued', () => {
			const h = harness({ now: () => Date.parse(QUEUED_AT) + 1_000 });

			h.adapter.applyReconciliation(
				queuedReceipt({
					execution_generation: 1,
					projection: {
						version: 'agentic_chat_ui_projection_v1',
						current_activity: 'Reading your project…',
						semantic_events: []
					} as unknown as JsonObject
				})
			);

			expect(h.port.updateTurnState).toHaveBeenCalledWith(
				expect.objectContaining({ status: 'queued', currentActivity: 'Thinking…' })
			);
		});

		it('keeps a running turn’s own status text however long it has run', () => {
			const h = harness({ now: () => Date.parse(QUEUED_AT) + 600_000 });

			h.adapter.applyReconciliation(
				receipt({
					updated_at: QUEUED_AT,
					projection: {
						version: 'agentic_chat_ui_projection_v1',
						current_activity: 'Drafting the plan…',
						semantic_events: []
					} as unknown as JsonObject
				})
			);
			h.adapter.applyReconciliation(receipt({ updated_at: QUEUED_AT }));

			expect(h.port.updateTurnState).toHaveBeenNthCalledWith(
				1,
				expect.objectContaining({ status: 'running', currentActivity: 'Drafting the plan…' })
			);
			expect(h.port.updateTurnState).toHaveBeenNthCalledWith(
				2,
				expect.objectContaining({ status: 'running', currentActivity: 'Thinking…' })
			);
		});

		it('renders a sweeper timeout as a failure, not a Stop', () => {
			const h = harness({ now: () => Date.parse(QUEUED_AT) + 601_000 });

			h.adapter.applyReconciliation(
				queuedReceipt({
					status: 'cancelled',
					snapshot_sequence: 1,
					durable_through_sequence: 1,
					projection_durable_sequence: 1,
					response_watermark: 1,
					reconcile_required: true,
					projection: {
						terminal: { status: 'cancelled', finishedReason: 'timeout' }
					} as unknown as JsonObject,
					terminal_event_id: createAgentStreamEventIdV1(TURN_ID, 0, 1),
					terminalized_at: '2026-09-23T12:10:00.000Z',
					finished_reason: 'timeout'
				})
			);

			expect(h.port.applySemanticEvent).toHaveBeenCalledExactlyOnceWith(
				expect.objectContaining({
					type: 'done',
					event_id: createAgentStreamEventIdV1(TURN_ID, 0, 1),
					finished_reason: 'queue_timeout',
					completion_status: 'failed'
				})
			);
			// The authoritative terminal is still the stored one.
			expect(h.port.finishTurn).toHaveBeenCalledExactlyOnceWith({
				handle,
				status: 'cancelled',
				finishedReason: 'timeout',
				failureCode: null
			});
			expect(h.onTerminal).toHaveBeenCalledExactlyOnceWith('cancelled');
		});

		it('renders a live sweeper done event the same way', () => {
			const h = harness();
			h.adapter.applyReconciliation(queuedReceipt());

			h.adapter.applyLiveEvent(
				event(
					1,
					'done',
					{
						status: 'cancelled',
						finished_reason: 'timeout',
						cancel_reason: 'timeout',
						cancel_source: 'sweeper'
					},
					0
				)
			);

			expect(h.port.applySemanticEvent).toHaveBeenCalledWith(
				expect.objectContaining({
					type: 'done',
					finished_reason: 'queue_timeout',
					completion_status: 'failed'
				})
			);
			expect(h.port.finishTurn).toHaveBeenCalledWith(
				expect.objectContaining({ status: 'cancelled', finishedReason: 'timeout' })
			);
		});

		it('still renders a queued Stop as cancelled', () => {
			const h = harness();
			h.adapter.applyReconciliation(queuedReceipt());

			h.adapter.applyLiveEvent(
				event(
					1,
					'done',
					{
						status: 'cancelled',
						finished_reason: 'user_cancelled',
						cancel_reason: 'user_cancelled',
						cancel_source: 'browser'
					},
					0
				)
			);

			expect(h.port.applySemanticEvent).toHaveBeenCalledWith(
				expect.objectContaining({
					type: 'done',
					finished_reason: 'cancelled',
					completion_status: 'completed'
				})
			);
		});
	});
});
