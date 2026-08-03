// apps/worker/tests/agenticChatEffectControl.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	AgenticChatEffectControlProtocolError,
	AgenticChatEffectControlRpcError,
	SupabaseAgenticChatEffectControlAdapter
} from '../src/workers/agentic-chat/effectControl';

const EFFECT_ID = '10000000-0000-5000-8000-000000000001';
const TURN_RUN_ID = '20000000-0000-4000-8000-000000000002';
const QUEUE_JOB_ID = '30000000-0000-4000-8000-000000000003';
const PROCESSING_TOKEN = '40000000-0000-4000-8000-000000000004';
const SESSION_ID = '50000000-0000-4000-8000-000000000005';
const USER_ID = '60000000-0000-4000-8000-000000000006';
const ARGUMENT_HASH = 'a'.repeat(64);
const STARTED_AT = '2026-08-03T12:00:00.000Z';
const FINISHED_AT = '2026-08-03T12:00:01.000Z';

const identity = {
	effectId: EFFECT_ID,
	turnRunId: TURN_RUN_ID,
	queueJobId: QUEUE_JOB_ID,
	processingToken: PROCESSING_TOKEN,
	sessionId: SESSION_ID,
	userId: USER_ID,
	executionGeneration: 2,
	canonicalArgumentHash: ARGUMENT_HASH,
	downstreamIdempotencySupported: true
} as const;

function receipt(overrides: Record<string, unknown> = {}) {
	return {
		effectId: EFFECT_ID,
		turnRunId: TURN_RUN_ID,
		executionGeneration: 2,
		sessionId: SESSION_ID,
		userId: USER_ID,
		state: 'reserved',
		downstreamIdempotencySupported: true,
		downstreamReceipt: null,
		startedAt: null,
		finishedAt: null,
		outcome: 'reserved',
		invokeAdapter: false,
		...overrides
	};
}

function createAdapter(data: unknown) {
	const rpc = vi.fn(async () => ({ data, error: null }));
	return { adapter: new SupabaseAgenticChatEffectControlAdapter({ rpc }), rpc };
}

describe('SupabaseAgenticChatEffectControlAdapter', () => {
	it('calls the exact reservation signature and accepts only a fenced new reservation', async () => {
		const { adapter, rpc } = createAdapter(receipt());

		await expect(
			adapter.reserve({
				...identity,
				toolName: 'fixture_project_write',
				operationName: 'update_project',
				providerToolCallId: 'provider-call-1'
			})
		).resolves.toMatchObject({ outcome: 'reserved', state: 'reserved' });
		expect(rpc).toHaveBeenCalledWith('reserve_agentic_chat_effect', {
			p_effect_id: EFFECT_ID,
			p_turn_run_id: TURN_RUN_ID,
			p_queue_job_id: QUEUE_JOB_ID,
			p_processing_token: PROCESSING_TOKEN,
			p_execution_generation: 2,
			p_tool_name: 'fixture_project_write',
			p_operation_name: 'update_project',
			p_canonical_argument_hash: ARGUMENT_HASH,
			p_downstream_idempotency_supported: true,
			p_provider_tool_call_id: 'provider-call-1'
		});
	});

	it('permits an immutable existing receipt from its original reservation generation', async () => {
		const { adapter } = createAdapter(
			receipt({
				executionGeneration: 1,
				state: 'succeeded',
				downstreamReceipt: { mutationId: 'mutation-1' },
				startedAt: STARTED_AT,
				finishedAt: FINISHED_AT,
				outcome: 'existing'
			})
		);

		await expect(
			adapter.reserve({
				...identity,
				toolName: 'fixture_project_write',
				operationName: 'update_project',
				providerToolCallId: 'changed-provider-id'
			})
		).resolves.toMatchObject({
			outcome: 'existing',
			executionGeneration: 1,
			state: 'succeeded'
		});
	});

	it('grants mutation authority only for the single valid begin winner', async () => {
		const { adapter } = createAdapter(
			receipt({
				state: 'started',
				startedAt: STARTED_AT,
				outcome: 'started',
				invokeAdapter: true
			})
		);

		await expect(
			adapter.begin({ ...identity, providerToolCallId: 'provider-call-1' })
		).resolves.toMatchObject({ outcome: 'started', invokeAdapter: true });

		const invalid = createAdapter(
			receipt({
				state: 'started',
				startedAt: STARTED_AT,
				outcome: 'existing',
				invokeAdapter: true
			})
		).adapter;
		await expect(
			invalid.begin({ ...identity, providerToolCallId: 'provider-call-1' })
		).rejects.toBeInstanceOf(AgenticChatEffectControlProtocolError);
	});

	it('validates reconciled outcome shape and target input before making the call', async () => {
		const { adapter, rpc } = createAdapter(
			receipt({
				state: 'uncertain',
				startedAt: STARTED_AT,
				finishedAt: FINISHED_AT,
				outcome: 'reconciled'
			})
		);

		await expect(
			adapter.reconcile({
				...identity,
				targetState: 'uncertain',
				downstreamReceipt: null,
				failureCode: 'uncertain_external_commit'
			})
		).resolves.toMatchObject({ state: 'uncertain', outcome: 'reconciled' });
		await expect(
			adapter.reconcile({
				...identity,
				targetState: 'cancelled',
				downstreamReceipt: { invalid: true },
				failureCode: null
			})
		).rejects.toBeInstanceOf(AgenticChatEffectControlProtocolError);
		expect(rpc).toHaveBeenCalledTimes(1);

		const contradictory = createAdapter(
			receipt({
				state: 'failed',
				startedAt: STARTED_AT,
				finishedAt: FINISHED_AT,
				outcome: 'reconciled'
			})
		).adapter;
		await expect(
			contradictory.reconcile({
				...identity,
				targetState: 'succeeded',
				downstreamReceipt: { mutationId: 'mutation-1' },
				failureCode: null
			})
		).rejects.toBeInstanceOf(AgenticChatEffectControlProtocolError);
	});

	it('rejects identity, state, timestamp, receipt, and authority corruption', async () => {
		const corruptions = [
			{ userId: TURN_RUN_ID },
			{ state: 'started', startedAt: null, outcome: 'started', invokeAdapter: true },
			{ state: 'succeeded', startedAt: STARTED_AT, finishedAt: null, outcome: 'existing' },
			{
				state: 'succeeded',
				startedAt: STARTED_AT,
				finishedAt: FINISHED_AT,
				downstreamReceipt: []
			},
			{ outcome: 'reserved', invokeAdapter: true }
		];
		for (const corruption of corruptions) {
			const { adapter } = createAdapter(receipt(corruption));
			await expect(
				adapter.reserve({
					...identity,
					toolName: 'fixture_project_write',
					operationName: 'update_project',
					providerToolCallId: null
				})
			).rejects.toBeInstanceOf(AgenticChatEffectControlProtocolError);
		}
	});

	it('keeps database errors typed and does not expose a missing receipt as success', async () => {
		const rpcError = new SupabaseAgenticChatEffectControlAdapter({
			rpc: vi.fn(async () => ({
				data: null,
				error: { code: '23505', message: 'effect identity conflict' }
			}))
		});
		await expect(
			rpcError.begin({ ...identity, providerToolCallId: null })
		).rejects.toBeInstanceOf(AgenticChatEffectControlRpcError);

		const missing = createAdapter(null).adapter;
		await expect(
			missing.begin({ ...identity, providerToolCallId: null })
		).rejects.toBeInstanceOf(AgenticChatEffectControlProtocolError);
	});
});
