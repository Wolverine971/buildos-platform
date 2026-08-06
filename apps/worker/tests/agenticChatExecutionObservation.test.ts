// apps/worker/tests/agenticChatExecutionObservation.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	AgenticChatExecutionObservationError,
	SupabaseAgenticChatExecutionObservationAdapter,
	createStableAgenticChatExecutionObservationKeyV1,
	type AgenticChatExecutionObservationInputV1
} from '../src/workers/agentic-chat/executionObservation';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const TURN_RUN_ID = '30000000-0000-4000-8000-000000000003';
const QUEUE_JOB_ID = '40000000-0000-4000-8000-000000000004';
const PROCESSING_TOKEN = '50000000-0000-4000-8000-000000000005';
const OBSERVATION_KEY = createStableAgenticChatExecutionObservationKeyV1({
	turnRunId: TURN_RUN_ID,
	scope: 'provider:initial:openrouter',
	boundary: 'provider_attempt_started'
});

const input: AgenticChatExecutionObservationInputV1 = {
	turnRunId: TURN_RUN_ID,
	queueJobId: QUEUE_JOB_ID,
	processingToken: PROCESSING_TOKEN,
	userId: USER_ID,
	executionGeneration: 2,
	observationKey: OBSERVATION_KEY,
	phase: 'provider',
	eventType: 'provider_attempt_started',
	payload: {
		round: 'initial',
		route_id: 'openrouter',
		model_requested: 'provider/model'
	}
};

function receipt(overrides: Record<string, unknown> = {}) {
	return {
		outcome: 'persisted',
		turn_run_id: TURN_RUN_ID,
		execution_generation: 2,
		observation_key: OBSERVATION_KEY,
		event_type: 'provider_attempt_started',
		...overrides
	};
}

describe('Agentic Chat private execution observations', () => {
	it('uses stable redacted identity and sends the exact fenced RPC payload', async () => {
		expect(OBSERVATION_KEY).toMatch(/^[0-9a-f]{64}$/);
		expect(
			createStableAgenticChatExecutionObservationKeyV1({
				turnRunId: TURN_RUN_ID,
				scope: 'provider:initial:openrouter',
				boundary: 'provider_attempt_started'
			})
		).toBe(OBSERVATION_KEY);
		const rpc = vi.fn(async () => ({ data: receipt(), error: null }));
		const adapter = new SupabaseAgenticChatExecutionObservationAdapter({ rpc });

		await expect(adapter.observe(input, new AbortController().signal)).resolves.toBeUndefined();
		expect(rpc).toHaveBeenCalledWith('persist_agentic_chat_execution_observation', {
			p_turn_run_id: TURN_RUN_ID,
			p_user_id: USER_ID,
			p_queue_job_id: QUEUE_JOB_ID,
			p_processing_token: PROCESSING_TOKEN,
			p_execution_generation: 2,
			p_observation_key: OBSERVATION_KEY,
			p_phase: 'provider',
			p_event_type: 'provider_attempt_started',
			p_payload: input.payload
		});
	});

	it('accepts an exact replay and rejects a mismatched receipt', async () => {
		const replay = new SupabaseAgenticChatExecutionObservationAdapter({
			rpc: vi.fn(async () => ({
				data: receipt({ outcome: 'already_persisted' }),
				error: null
			}))
		});
		await expect(replay.observe(input, new AbortController().signal)).resolves.toBeUndefined();

		const mismatched = new SupabaseAgenticChatExecutionObservationAdapter({
			rpc: vi.fn(async () => ({
				data: receipt({ event_type: 'provider_attempt_ended' }),
				error: null
			}))
		});
		await expect(
			mismatched.observe(input, new AbortController().signal)
		).rejects.toBeInstanceOf(AgenticChatExecutionObservationError);
	});

	it('aborts a hung observation RPC at its local deadline', async () => {
		let deadlineSignal: AbortSignal | null = null;
		const response = Object.assign(new Promise<never>(() => undefined), {
			abortSignal(signal: AbortSignal) {
				deadlineSignal = signal;
				return this;
			}
		});
		const adapter = new SupabaseAgenticChatExecutionObservationAdapter(
			{ rpc: vi.fn(() => response) },
			{ timeoutMs: 10 }
		);

		await expect(adapter.observe(input, new AbortController().signal)).rejects.toMatchObject({
			code: 'execution_observation_timeout'
		});
		expect(deadlineSignal).toMatchObject({ aborted: true });
	});
});
