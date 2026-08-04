// apps/worker/tests/agenticChatTimingPayload.test.ts
import { describe, expect, it } from 'vitest';
import type { AgenticChatWorkerTimingBaselineV1 } from '../src/workers/agentic-chat/executionInput';
import { AgenticChatRuntimeTimingTracker } from '../src/workers/agentic-chat/runtimeTiming';
import {
	AgenticChatTimingPayloadError,
	buildAgenticChatAsyncTimingDraftV1,
	finalizeAgenticChatAsyncTimingSummaryV1
} from '../src/workers/agentic-chat/timingPayload';

const IMMEDIATE_BASELINE: AgenticChatWorkerTimingBaselineV1 = {
	admittedAt: '2026-08-03T11:59:57.000Z',
	startedAt: '2026-08-03T11:59:58.000Z',
	workerStartedAt: '2026-08-03T11:59:59.000Z',
	executionStartedAt: null,
	historyCutoffAt: '2026-08-03T11:59:58.000Z',
	requestPrewarmedContext: false,
	cacheSource: 'not_requested',
	cacheAgeSeconds: null,
	historyStrategy: 'raw_history',
	historyCompressed: false,
	rawHistoryCount: 0,
	historyForModelCount: 0,
	preparedPromptId: null,
	preparedPromptHit: false,
	preparedPromptMissReason: null,
	preparedSurfaceProfile: null
};

function preterminalSnapshot(baseline: AgenticChatWorkerTimingBaselineV1 = IMMEDIATE_BASELINE) {
	const values = [100, 110, 120, 150, 160];
	const tracker = new AgenticChatRuntimeTimingTracker({
		turnRunId: '30000000-0000-4000-8000-000000000003',
		executionGeneration: 1,
		baseline,
		executionStartedAt: '2026-08-03T12:00:00.000Z',
		clock: {
			nowMs() {
				const value = values.shift();
				if (value === undefined) throw new Error('Fixture clock exhausted');
				return value;
			}
		}
	});
	tracker.observePersistedEvent('2026-08-03T12:00:00.010Z', 'turn_phase');
	tracker.observePersistedEvent('2026-08-03T12:00:00.020Z', 'text_delta');
	tracker.markProviderFinished();
	tracker.markTerminalCallStarted();
	return tracker.preterminalSnapshot();
}

function timingSummary(baseline: AgenticChatWorkerTimingBaselineV1 = IMMEDIATE_BASELINE) {
	return finalizeAgenticChatAsyncTimingSummaryV1(
		buildAgenticChatAsyncTimingDraftV1(preterminalSnapshot(baseline), 'stop'),
		{
			assistantPersistedAt: '2026-08-03T12:00:00.180Z',
			terminalCommittedAt: '2026-08-03T12:00:00.200Z'
		}
	);
}

describe('Agentic Chat asynchronous timing payload', () => {
	it('pins the immediate-response product payload without invented preparation fields', () => {
		const summary = timingSummary();

		expect(summary).toEqual({
			timing_contract_version: 'agentic_chat_async_v1',
			request_started_at: '2026-08-03T11:59:57.000Z',
			admitted_at: '2026-08-03T11:59:57.000Z',
			accepted_at: '2026-08-03T11:59:58.000Z',
			worker_started_at: '2026-08-03T11:59:59.000Z',
			provider_authorized_at: '2026-08-03T12:00:00.000Z',
			first_event_at: '2026-08-03T12:00:00.010Z',
			first_response_at: '2026-08-03T12:00:00.020Z',
			assistant_persisted_at: '2026-08-03T12:00:00.180Z',
			done_emitted_at: null,
			terminal_committed_at: '2026-08-03T12:00:00.200Z',
			cache_source: 'not_requested',
			cache_age_seconds: null,
			request_prewarmed_context: false,
			history_strategy: 'raw_history',
			history_compressed: false,
			raw_history_count: 0,
			history_for_model_count: 0,
			prepared_prompt_hit: false,
			prepared_prompt_miss_reason: null,
			prepared_surface_profile: null,
			finished_reason: 'stop',
			phases: {
				admission_to_acceptance_ms: 1_000,
				queue_wait_ms: 1_000,
				worker_start_to_provider_authority_ms: 1_000,
				time_to_first_event_ms: 3_010,
				time_to_first_response_ms: 3_020,
				provider_authority_to_first_event_persistence_ms: 10,
				provider_authority_to_first_response_persistence_ms: 20,
				response_generation_ms: 30,
				provider_authority_to_finish_ms: 50,
				provider_finish_to_terminal_call_ms: 10,
				total_request_ms: 3_200
			}
		});
		expect(summary).not.toHaveProperty('session_resolved_at');
		expect(summary).not.toHaveProperty('history_loaded_at');
		expect(summary).not.toHaveProperty('context_ready_at');
		expect(summary.phases).not.toHaveProperty('context_build_ms');
		expect(summary.phases).not.toHaveProperty('finalization_ms');
	});

	it('keeps queue delay in database duration while preserving provider measurements', () => {
		const summary = timingSummary({
			...IMMEDIATE_BASELINE,
			admittedAt: '2026-08-03T11:00:00.000Z',
			startedAt: '2026-08-03T11:00:01.000Z',
			historyCutoffAt: '2026-08-03T11:00:01.000Z'
		});

		expect(summary).toMatchObject({
			request_started_at: '2026-08-03T11:00:00.000Z',
			admitted_at: '2026-08-03T11:00:00.000Z',
			phases: {
				admission_to_acceptance_ms: 1_000,
				queue_wait_ms: 3_598_000,
				worker_start_to_provider_authority_ms: 1_000,
				time_to_first_event_ms: 3_600_010,
				time_to_first_response_ms: 3_600_020,
				provider_authority_to_first_event_persistence_ms: 10,
				provider_authority_to_first_response_persistence_ms: 20,
				provider_authority_to_finish_ms: 50,
				provider_finish_to_terminal_call_ms: 10,
				total_request_ms: 3_600_200
			}
		});
	});

	it('rejects terminal evidence that predates provider authority', () => {
		const draft = buildAgenticChatAsyncTimingDraftV1(preterminalSnapshot(), 'stop');

		expect(() =>
			finalizeAgenticChatAsyncTimingSummaryV1(draft, {
				assistantPersistedAt: '2026-08-03T11:59:59.900Z',
				terminalCommittedAt: '2026-08-03T12:00:00.200Z'
			})
		).toThrow(AgenticChatTimingPayloadError);
	});
});
