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
		logical_provider_round: 1,
		pass_role: 'acting',
		provider_attempt: 1,
		attempt_kind: 'primary',
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
		expect(rpc).toHaveBeenCalledWith('persist_agentic_chat_provider_attempt_observation', {
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

	it('accepts the redacted provider-media boundary introduced by S4', async () => {
		const observationKey = createStableAgenticChatExecutionObservationKeyV1({
			turnRunId: TURN_RUN_ID,
			scope: 'live-vision:current-turn',
			boundary: 'provider_media_resolved'
		});
		const mediaInput: AgenticChatExecutionObservationInputV1 = {
			...input,
			observationKey,
			eventType: 'provider_media_resolved',
			payload: {
				requested: true,
				policy: {
					max_images: 2,
					max_image_bytes: 8 * 1024 * 1024,
					render_width: 1600,
					signed_url_ttl_seconds: 900
				},
				resolved: [],
				failed: [],
				skipped_by_limit: 0
			}
		};
		const rpc = vi.fn(async () => ({
			data: receipt({
				observation_key: observationKey,
				event_type: 'provider_media_resolved'
			}),
			error: null
		}));
		await expect(
			new SupabaseAgenticChatExecutionObservationAdapter({ rpc }).observe(
				mediaInput,
				new AbortController().signal
			)
		).resolves.toBeUndefined();
		expect(rpc).toHaveBeenCalledWith(
			'persist_agentic_chat_execution_observation',
			expect.objectContaining({ p_event_type: 'provider_media_resolved' })
		);
	});

	it('forwards the rejected-tool receipt keys unchanged on a provider attempt', async () => {
		const observationKey = createStableAgenticChatExecutionObservationKeyV1({
			turnRunId: TURN_RUN_ID,
			scope: 'provider:1:initial:openrouter',
			boundary: 'provider_attempt_ended'
		});
		const endedInput: AgenticChatExecutionObservationInputV1 = {
			...input,
			observationKey,
			eventType: 'provider_attempt_ended',
			payload: {
				round: 'initial',
				logical_provider_round: 1,
				pass_role: 'acting',
				provider_attempt: 1,
				attempt_kind: 'primary',
				route_id: 'openrouter',
				model_requested: 'provider/model',
				model_used: 'provider/model',
				provider: 'openrouter',
				status: 'success',
				duration_ms: 12,
				finish_reason: 'tool_calls',
				error_class: null,
				usage: null,
				rejected_tool_name: 'skill_load',
				advertised_tool_count: 3
			}
		};
		const rpc = vi.fn(async () => ({
			data: receipt({
				observation_key: observationKey,
				event_type: 'provider_attempt_ended'
			}),
			error: null
		}));
		await expect(
			new SupabaseAgenticChatExecutionObservationAdapter({ rpc }).observe(
				endedInput,
				new AbortController().signal
			)
		).resolves.toBeUndefined();
		expect(rpc).toHaveBeenCalledWith(
			'persist_agentic_chat_provider_attempt_observation',
			expect.objectContaining({
				p_event_type: 'provider_attempt_ended',
				p_payload: expect.objectContaining({
					rejected_tool_name: 'skill_load',
					advertised_tool_count: 3
				})
			})
		);
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
