// packages/agentic-chat-runtime/src/lifecycle-observability.test.ts
import { describe, expect, it } from 'vitest';
import { projectAgenticChatWorkerLifecycleObservationsV1 } from './lifecycle-observability';

const baseEvents = [
	{ type: 'turn_phase', turn_phase: 'acknowledged' },
	{ type: 'session' },
	{ type: 'context_usage' }
];

// Expected lifecycle projections. These were pinned against the two-engine
// parity goldens until those were retired on 2026-09-04 (one-engine); the
// arrays below are the same contract, now owned by this test.
const TEXT_ONLY_SUCCESS_LIFECYCLE = [
	{ event_type: 'turn_intent_resolved', phase: 'prompt' },
	{ event_type: 'tool_surface_materialized', phase: 'tool' },
	{ event_type: 'prepared_prompt_cache_checked', phase: 'prompt' },
	{ event_type: 'turn_phase_changed', phase: 'stream' },
	{ event_type: 'turn_outcome_resolved', phase: 'finalize' },
	{ event_type: 'orchestration_interventions', phase: 'finalize' },
	{ event_type: 'done_emitted', phase: 'finalize' },
	{ event_type: 'prompt_snapshot_created', phase: 'prompt' }
];

const READ_ONLY_TOOL_LIFECYCLE = [
	{ event_type: 'turn_intent_resolved', phase: 'prompt' },
	{ event_type: 'tool_surface_materialized', phase: 'tool' },
	{ event_type: 'prepared_prompt_cache_checked', phase: 'prompt' },
	{ event_type: 'tool_call_emitted', phase: 'tool' },
	{ event_type: 'first_tool_call_planning_cue_emitted', phase: 'stream' },
	{ event_type: 'tool_result_received', phase: 'tool' },
	{ event_type: 'tool_call_emitted', phase: 'tool' },
	{ event_type: 'tool_call_validation_failed', phase: 'tool' },
	{ event_type: 'tool_call_emitted', phase: 'tool' },
	{ event_type: 'tool_result_received', phase: 'tool' },
	{ event_type: 'context_shift_emitted', phase: 'tool' },
	{ event_type: 'tool_call_emitted', phase: 'tool' },
	{ event_type: 'tool_result_received', phase: 'tool' },
	{ event_type: 'turn_phase_changed', phase: 'stream' },
	{ event_type: 'turn_outcome_resolved', phase: 'finalize' },
	{ event_type: 'orchestration_interventions', phase: 'finalize' },
	{ event_type: 'done_emitted', phase: 'finalize' },
	{ event_type: 'prompt_snapshot_created', phase: 'prompt' }
];

const CANCELLED_LIFECYCLE = [
	{ event_type: 'turn_intent_resolved', phase: 'prompt' },
	{ event_type: 'tool_surface_materialized', phase: 'tool' },
	{ event_type: 'prepared_prompt_cache_checked', phase: 'prompt' },
	{ event_type: 'turn_outcome_resolved', phase: 'finalize' },
	{ event_type: 'orchestration_interventions', phase: 'finalize' },
	{ event_type: 'done_emitted', phase: 'finalize' },
	{ event_type: 'prompt_snapshot_created', phase: 'prompt' }
];

const PROVIDER_ERROR_LIFECYCLE = [
	{ event_type: 'turn_intent_resolved', phase: 'prompt' },
	{ event_type: 'tool_surface_materialized', phase: 'tool' },
	{ event_type: 'prepared_prompt_cache_checked', phase: 'prompt' },
	{ event_type: 'done_emitted', phase: 'finalize' },
	{ event_type: 'prompt_snapshot_created', phase: 'prompt' }
];

const STREAM_TERMINAL_FAILURE_LIFECYCLE = [
	{ event_type: 'turn_intent_resolved', phase: 'prompt' },
	{ event_type: 'tool_surface_materialized', phase: 'tool' },
	{ event_type: 'prepared_prompt_cache_checked', phase: 'prompt' },
	{ event_type: 'stream_terminal_failure', phase: 'llm' },
	{ event_type: 'done_emitted', phase: 'finalize' },
	{ event_type: 'prompt_snapshot_created', phase: 'prompt' }
];

describe('worker lifecycle observability projection', () => {
	it('projects the exact text-only lifecycle meanings', () => {
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
		).toEqual(TEXT_ONLY_SUCCESS_LIFECYCLE);
	});

	it('projects the exact four-round validation-repair lifecycle meanings', () => {
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
		).toEqual(READ_ONLY_TOOL_LIFECYCLE);
	});

	it('preserves the distinct cancelled and failed terminal meanings', () => {
		expect(
			projectAgenticChatWorkerLifecycleObservationsV1({
				admissionObserved: true,
				publicEvents: [...baseEvents, { type: 'done', status: 'cancelled' }],
				terminalStatus: 'cancelled',
				promptSnapshotCount: 1
			})
		).toEqual(CANCELLED_LIFECYCLE);
		expect(
			projectAgenticChatWorkerLifecycleObservationsV1({
				admissionObserved: true,
				publicEvents: [...baseEvents, { type: 'done', status: 'failed' }],
				terminalStatus: 'failed',
				promptSnapshotCount: 1
			})
		).toEqual(PROVIDER_ERROR_LIFECYCLE);
		expect(
			projectAgenticChatWorkerLifecycleObservationsV1({
				admissionObserved: true,
				publicEvents: [...baseEvents, { type: 'done', status: 'failed' }],
				terminalStatus: 'failed',
				promptSnapshotCount: 1,
				streamTerminalFailureObserved: true
			})
		).toEqual(STREAM_TERMINAL_FAILURE_LIFECYCLE);
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
