// packages/agentic-chat-runtime/src/lifecycle-observability.test.ts
import { describe, expect, it } from 'vitest';
import {
	AGENTIC_CHAT_PARTIAL_CANCELLATION_GOLDEN_V1,
	AGENTIC_CHAT_PROVIDER_ERROR_GOLDEN_V1,
	AGENTIC_CHAT_READ_ONLY_TOOL_GOLDEN_V1,
	AGENTIC_CHAT_TEXT_ONLY_SUCCESS_GOLDEN_V1,
	AGENTIC_CHAT_TIMEOUT_GOLDEN_V1
} from './index';
import { projectAgenticChatWorkerLifecycleObservationsV1 } from './lifecycle-observability';

const baseEvents = [
	{ type: 'turn_phase', turn_phase: 'acknowledged' },
	{ type: 'session' },
	{ type: 'context_usage' }
];

describe('worker lifecycle observability projection', () => {
	it('projects the exact text-only legacy lifecycle meanings', () => {
		expect(
			projectAgenticChatWorkerLifecycleObservationsV1({
				admissionObserved: true,
				publicEvents: [
					...baseEvents,
					{ type: 'turn_phase', turn_phase: 'finalizing' },
					{ type: 'done', status: 'completed' }
				],
				terminalStatus: 'completed',
				promptSnapshotCount: 1
			})
		).toEqual(AGENTIC_CHAT_TEXT_ONLY_SUCCESS_GOLDEN_V1.metadata.lifecycle_events);
	});

	it('projects the exact four-round validation-repair legacy lifecycle meanings', () => {
		expect(
			projectAgenticChatWorkerLifecycleObservationsV1({
				admissionObserved: true,
				publicEvents: [
					...baseEvents,
					{
						type: 'agent_state',
						state: 'thinking',
						details: 'Planning the first step...'
					},
					{ type: 'tool_call' },
					{ type: 'tool_result' },
					{ type: 'tool_call' },
					{
						type: 'tool_result',
						result: {
							success: false,
							error: 'Tool validation failed: Missing required parameter: project_id'
						}
					},
					{ type: 'tool_call' },
					{ type: 'tool_result' },
					{ type: 'context_shift' },
					{ type: 'tool_call' },
					{ type: 'tool_result' },
					{ type: 'turn_phase', turn_phase: 'finalizing' },
					{ type: 'done', status: 'completed' }
				],
				terminalStatus: 'completed',
				promptSnapshotCount: 1
			})
		).toEqual(AGENTIC_CHAT_READ_ONLY_TOOL_GOLDEN_V1.metadata.lifecycle_events);
	});

	it('preserves the distinct cancelled and failed terminal meanings', () => {
		expect(
			projectAgenticChatWorkerLifecycleObservationsV1({
				admissionObserved: true,
				publicEvents: [...baseEvents, { type: 'done', status: 'cancelled' }],
				terminalStatus: 'cancelled',
				promptSnapshotCount: 1
			})
		).toEqual(AGENTIC_CHAT_PARTIAL_CANCELLATION_GOLDEN_V1.metadata.lifecycle_events);
		expect(
			projectAgenticChatWorkerLifecycleObservationsV1({
				admissionObserved: true,
				publicEvents: [...baseEvents, { type: 'done', status: 'failed' }],
				terminalStatus: 'failed',
				promptSnapshotCount: 1
			})
		).toEqual(AGENTIC_CHAT_PROVIDER_ERROR_GOLDEN_V1.metadata.lifecycle_events);
		expect(
			projectAgenticChatWorkerLifecycleObservationsV1({
				admissionObserved: true,
				publicEvents: [...baseEvents, { type: 'done', status: 'failed' }],
				terminalStatus: 'failed',
				promptSnapshotCount: 1,
				streamTerminalFailureObserved: true
			})
		).toEqual(AGENTIC_CHAT_TIMEOUT_GOLDEN_V1.metadata.lifecycle_events);
	});

	it('projects one lifecycle pair per tool call in event order', () => {
		expect(
			projectAgenticChatWorkerLifecycleObservationsV1({
				admissionObserved: false,
				publicEvents: [
					{ type: 'tool_call' },
					{ type: 'tool_result' },
					{ type: 'tool_call' },
					{ type: 'tool_result' },
					{ type: 'context_shift' },
					{ type: 'tool_call' }
				],
				terminalStatus: null,
				promptSnapshotCount: 0
			})
		).toEqual([
			{ event_type: 'tool_call_emitted', phase: 'tool' },
			{ event_type: 'tool_result_received', phase: 'tool' },
			{ event_type: 'tool_call_emitted', phase: 'tool' },
			{ event_type: 'tool_result_received', phase: 'tool' },
			{ event_type: 'context_shift_emitted', phase: 'tool' },
			{ event_type: 'tool_call_emitted', phase: 'tool' }
		]);
	});

	it('rejects evidence beyond the currently authorized cardinality', () => {
		expect(() =>
			projectAgenticChatWorkerLifecycleObservationsV1({
				admissionObserved: true,
				publicEvents: [{ type: 'tool_result' }],
				terminalStatus: null,
				promptSnapshotCount: 0
			})
		).toThrow('tool results exceed the bounded contract');
		expect(() =>
			projectAgenticChatWorkerLifecycleObservationsV1({
				admissionObserved: true,
				publicEvents: [
					{ type: 'turn_phase', turn_phase: 'finalizing' },
					{ type: 'turn_phase', turn_phase: 'finalizing' }
				],
				terminalStatus: null,
				promptSnapshotCount: 0
			})
		).toThrow('finalizing phases exceed the bounded contract');
		expect(() =>
			projectAgenticChatWorkerLifecycleObservationsV1({
				admissionObserved: true,
				publicEvents: [{ type: 'done', status: 'failed' }],
				terminalStatus: 'completed',
				promptSnapshotCount: 0
			})
		).toThrow('terminal evidence is inconsistent');
		expect(() =>
			projectAgenticChatWorkerLifecycleObservationsV1({
				admissionObserved: true,
				publicEvents: [{ event_payload: null }],
				terminalStatus: null,
				promptSnapshotCount: 0
			})
		).toThrow('public event 0 is invalid');
	});
});
