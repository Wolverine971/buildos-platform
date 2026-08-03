// apps/web/src/lib/services/agentic-chat-v2/worker-turn-admission.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	admitAgenticChatWorkerTurn,
	type AgenticChatWorkerAdmissionRpcArgs,
	type AgenticChatWorkerAdmissionRpcClient
} from './worker-turn-admission.server';

const USER_ID = 'd1000000-0000-4000-8000-000000000001';
const SESSION_ID = 'd2000000-0000-4000-8000-000000000001';
const TURN_ID = 'd3000000-0000-4000-8000-000000000001';
const MESSAGE_ID = 'd4000000-0000-4000-8000-000000000001';
const ARTIFACT_ID = 'd5000000-0000-4000-8000-000000000001';
const DECISION_ID = 'd6000000-0000-4000-8000-000000000001';
const CORRELATION_ID = 'd7000000-0000-4000-8000-000000000001';
const QUEUE_JOB_ID = 'd8000000-0000-4000-8000-000000000001';

const args: AgenticChatWorkerAdmissionRpcArgs = {
	p_user_id: USER_ID,
	p_session_id: SESSION_ID,
	p_turn_run_id: TURN_ID,
	p_user_message_id: MESSAGE_ID,
	p_input_artifact_id: ARTIFACT_ID,
	p_stream_run_id: 'stream-1',
	p_client_turn_id: 'client-1',
	p_request_hash: 'a'.repeat(64),
	p_request_hash_version: 'agentic_chat_request_hash_v2',
	p_transport_contract_version: 'agentic_chat_worker_v1',
	p_transport_decision_id: DECISION_ID,
	p_correlation_id: CORRELATION_ID,
	p_context_type: 'project',
	p_entity_id: SESSION_ID,
	p_project_id: SESSION_ID,
	p_source: 'live_ui',
	p_gateway_enabled: true,
	p_request_message: 'Ship it',
	p_request_payload: {},
	p_request_payload_version: 'agentic_chat_request_v1',
	p_user_message_content: 'Ship it',
	p_user_message_metadata: {},
	p_history_limit: 10,
	p_history_source: 'admission_window',
	p_artifact_history: [],
	p_artifact_prepared: {},
	p_artifact_content_hash: 'b'.repeat(64),
	p_artifact_history_bytes: 2,
	p_artifact_content_bytes: 100,
	p_prepared_prompt_id: null,
	p_prepared_context_payload_sha256: null,
	p_prepared_surface_profile: null,
	p_session_agent_metadata: {},
	p_capacity_available: true
};

function handle(overrides: Record<string, unknown> = {}) {
	return {
		outcome: 'newly_admitted',
		execution_may_start: false,
		turn_run_id: TURN_ID,
		session_id: SESSION_ID,
		session_created: false,
		user_message_id: MESSAGE_ID,
		input_artifact_id: ARTIFACT_ID,
		queue_job_id: QUEUE_JOB_ID,
		correlation_id: CORRELATION_ID,
		stream_run_id: 'stream-1',
		client_turn_id: 'client-1',
		execution_mode: 'worker_realtime',
		status: 'queued',
		...overrides
	};
}

function client(result: { data: unknown; error: null | { message: string } }) {
	const rpc = vi.fn(async () => result);
	return { value: { rpc } as AgenticChatWorkerAdmissionRpcClient, rpc };
}

describe('Agentic Chat worker admission gateway', () => {
	it('invokes the exact hosted RPC and validates a new admission identity', async () => {
		const database = client({ data: handle(), error: null });
		const result = await admitAgenticChatWorkerTurn({ client: database.value, args });
		expect(result).toEqual({
			outcome: 'newly_admitted',
			executionMayStart: false,
			turnRunId: TURN_ID,
			sessionId: SESSION_ID,
			userMessageId: MESSAGE_ID,
			inputArtifactId: ARTIFACT_ID,
			queueJobId: QUEUE_JOB_ID,
			correlationId: CORRELATION_ID,
			streamRunId: 'stream-1',
			clientTurnId: 'client-1',
			executionMode: 'worker_realtime',
			status: 'queued',
			sessionCreated: false
		});
		expect(database.rpc).toHaveBeenCalledWith('create_agentic_chat_turn_with_job', args);
	});

	it('maps an exact matching duplicate without authorizing execution', async () => {
		const database = client({
			data: handle({ outcome: 'matching_duplicate', status: 'running' }),
			error: null
		});
		const result = await admitAgenticChatWorkerTurn({ client: database.value, args });
		expect(result).toMatchObject({
			outcome: 'matching_duplicate',
			executionMayStart: false,
			clientTurnId: 'client-1',
			status: 'running'
		});
	});

	it('preserves a legacy active conflict with no client-turn identity', async () => {
		const database = client({
			data: handle({
				outcome: 'active_turn_conflict',
				execution_mode: 'legacy_sse',
				status: 'running',
				client_turn_id: null,
				user_message_id: null,
				input_artifact_id: null,
				queue_job_id: null
			}),
			error: null
		});
		const result = await admitAgenticChatWorkerTurn({ client: database.value, args });
		expect(result).toMatchObject({
			outcome: 'active_turn_conflict',
			executionMode: 'legacy_sse',
			clientTurnId: null
		});
	});

	it('maps idempotency and bounded capacity outcomes', async () => {
		let database = client({
			data: handle({
				outcome: 'idempotency_conflict',
				conflict_reason: 'request_hash_mismatch'
			}),
			error: null
		});
		expect(await admitAgenticChatWorkerTurn({ client: database.value, args })).toMatchObject({
			outcome: 'idempotency_conflict'
		});

		database = client({
			data: {
				outcome: 'capacity_exceeded',
				execution_may_start: false,
				capacity_reason: 'max_queued',
				retry_after_seconds: 2,
				running_count: 1,
				queued_count: 20
			},
			error: null
		});
		expect(await admitAgenticChatWorkerTurn({ client: database.value, args })).toEqual({
			outcome: 'capacity_exceeded',
			executionMayStart: false,
			capacityReason: 'max_queued',
			retryAfterSeconds: 2,
			runningCount: 1,
			queuedCount: 20
		});
	});

	it('rejects contradictory identities, execution authority, and malformed bounds', async () => {
		for (const data of [
			handle({ turn_run_id: 'd3000000-0000-4000-8000-000000000099' }),
			handle({ execution_may_start: true }),
			{
				outcome: 'capacity_exceeded',
				execution_may_start: false,
				capacity_reason: 'max_queued',
				retry_after_seconds: 999,
				running_count: 1,
				queued_count: 20
			}
		]) {
			await expect(
				admitAgenticChatWorkerTurn({ client: client({ data, error: null }).value, args })
			).rejects.toMatchObject({ code: 'protocol_error' });
		}
	});

	it('keeps database details private behind a typed error', async () => {
		await expect(
			admitAgenticChatWorkerTurn({
				client: client({ data: null, error: { message: 'private database detail' } }).value,
				args
			})
		).rejects.toMatchObject({
			code: 'database_error',
			message: 'Worker turn admission failed'
		});
	});
});
