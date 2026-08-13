// apps/worker/tests/agenticChatSupervisorCheckpoint.test.ts

import { describe, expect, it, vi } from 'vitest';
import {
	AgenticChatSupervisorCheckpointFenceError,
	AgenticChatSupervisorCheckpointRpcError,
	AgenticChatSupervisorCheckpointTimeoutError,
	SupabaseAgenticChatSupervisorCheckpointAdapter,
	createStableAgenticChatSupervisorCheckpointIdV1
} from '../src/workers/agentic-chat/supervisorCheckpoint';
import { createStableAgenticChatSupervisorTransitionIdV1 } from '../src/workers/agentic-chat/workerSupervisor';

const TURN_RUN_ID = '30000000-0000-4000-8000-000000000003';
const USER_ID = '10000000-0000-4000-8000-000000000001';
const SESSION_ID = '20000000-0000-4000-8000-000000000002';
const QUEUE_JOB_ID = '40000000-0000-4000-8000-000000000004';
const PROCESSING_TOKEN = '60000000-0000-4000-8000-000000000006';
const EXECUTION_GENERATION = 2;
const TRANSITION_ID = createStableAgenticChatSupervisorTransitionIdV1({
	turnRunId: TURN_RUN_ID,
	executionGeneration: EXECUTION_GENERATION,
	sequence: 3,
	action: 'ask_user'
});

const digest = { contextType: 'project', validationFailureCount: 2 };
const resumeContext = {
	missing_field: 'task_id',
	instruction: 'Continue after the user identifies the task.'
};
const supervisorDecision = {
	action: 'ask_user',
	question: 'Which exact task should I update?',
	reason: 'repeated_validation_failures',
	checkpoint: { digest, resumeContext }
};
const checkpointId = createStableAgenticChatSupervisorCheckpointIdV1({
	turnRunId: TURN_RUN_ID,
	executionGeneration: EXECUTION_GENERATION,
	supervisorTransitionId: TRANSITION_ID
});
const input = {
	turnRunId: TURN_RUN_ID,
	userId: USER_ID,
	sessionId: SESSION_ID,
	queueJobId: QUEUE_JOB_ID,
	processingToken: PROCESSING_TOKEN,
	executionGeneration: EXECUTION_GENERATION,
	checkpointId,
	supervisorTransitionId: TRANSITION_ID,
	sequence: 3,
	reason: 'repeated_validation_failures',
	question: 'Which exact task should I update?',
	digest,
	resumeContext,
	supervisorDecision
} as const;

describe('SupabaseAgenticChatSupervisorCheckpointAdapter', () => {
	it('uses a deterministic checkpoint id and sends the exact fenced payload', async () => {
		expect(
			createStableAgenticChatSupervisorCheckpointIdV1({
				turnRunId: TURN_RUN_ID,
				executionGeneration: EXECUTION_GENERATION,
				supervisorTransitionId: TRANSITION_ID
			})
		).toBe(checkpointId);
		expect(checkpointId).toMatch(/^[0-9a-f-]{36}$/);

		const rpc = vi.fn(async () => ({ data: successReceipt('persisted'), error: null }));
		const adapter = new SupabaseAgenticChatSupervisorCheckpointAdapter({ rpc });
		await expect(adapter.persist(input, new AbortController().signal)).resolves.toEqual({
			outcome: 'persisted',
			checkpointId,
			expiresAt: '2026-08-14T12:00:00.000Z'
		});
		expect(rpc).toHaveBeenCalledWith('persist_agentic_chat_supervisor_question_checkpoint', {
			p_turn_run_id: TURN_RUN_ID,
			p_user_id: USER_ID,
			p_queue_job_id: QUEUE_JOB_ID,
			p_processing_token: PROCESSING_TOKEN,
			p_execution_generation: EXECUTION_GENERATION,
			p_checkpoint_id: checkpointId,
			p_supervisor_transition_id: TRANSITION_ID,
			p_sequence: 3,
			p_reason: input.reason,
			p_question: input.question,
			p_digest: digest,
			p_resume_context: resumeContext,
			p_supervisor_decision: supervisorDecision
		});
	});

	it('accepts an exact idempotent replay receipt', async () => {
		const adapter = new SupabaseAgenticChatSupervisorCheckpointAdapter({
			rpc: vi.fn(async () => ({ data: successReceipt('already_persisted'), error: null }))
		});
		await expect(adapter.persist(input, new AbortController().signal)).resolves.toEqual({
			outcome: 'already_persisted',
			checkpointId,
			expiresAt: '2026-08-14T12:00:00.000Z'
		});
	});

	it('turns cancellation and stale ownership receipts into explicit fence errors', async () => {
		for (const [outcome, failureClass] of [
			['cancel_requested', 'cancelled'],
			['stale_generation', 'unknown'],
			['already_terminal', 'unknown']
		] as const) {
			const adapter = new SupabaseAgenticChatSupervisorCheckpointAdapter({
				rpc: vi.fn(async () => ({
					data: {
						outcome,
						turn_run_id: TURN_RUN_ID,
						queue_job_id: QUEUE_JOB_ID,
						session_id: SESSION_ID,
						user_id: USER_ID,
						execution_generation: EXECUTION_GENERATION
					},
					error: null
				}))
			});
			await expect(adapter.persist(input, new AbortController().signal)).rejects.toEqual(
				expect.objectContaining({
					name: AgenticChatSupervisorCheckpointFenceError.name,
					outcome,
					failureClass
				})
			);
		}
	});

	it('fails closed on a mismatched decision before calling SQL', async () => {
		const rpc = vi.fn();
		const adapter = new SupabaseAgenticChatSupervisorCheckpointAdapter({ rpc });
		await expect(
			adapter.persist(
				{
					...input,
					supervisorDecision: { ...supervisorDecision, question: 'Different question' }
				},
				new AbortController().signal
			)
		).rejects.toThrow('decision does not match');
		expect(rpc).not.toHaveBeenCalled();
	});

	it('rejects malformed success receipts and surfaces RPC failures', async () => {
		const malformed = new SupabaseAgenticChatSupervisorCheckpointAdapter({
			rpc: vi.fn(async () => ({
				data: { ...successReceipt('persisted'), question: 'Wrong question' },
				error: null
			}))
		});
		await expect(malformed.persist(input, new AbortController().signal)).rejects.toThrow(
			'persisted checkpoint receipt is inconsistent'
		);

		const failed = new SupabaseAgenticChatSupervisorCheckpointAdapter({
			rpc: vi.fn(async () => ({ data: null, error: { code: 'XX000', message: 'boom' } }))
		});
		await expect(failed.persist(input, new AbortController().signal)).rejects.toEqual(
			expect.objectContaining({
				name: AgenticChatSupervisorCheckpointRpcError.name,
				code: 'XX000'
			})
		);
	});

	it('bounds a hanging RPC and propagates a parent cancellation before SQL', async () => {
		const hangingRequest = new Promise<never>(() => {}) as Promise<never> & {
			abortSignal: ReturnType<typeof vi.fn>;
		};
		hangingRequest.abortSignal = vi.fn(() => new Promise<never>(() => {}));
		const rpc = vi.fn(() => hangingRequest);
		const adapter = new SupabaseAgenticChatSupervisorCheckpointAdapter(
			{ rpc },
			{ timeoutMs: 5 }
		);
		await expect(adapter.persist(input, new AbortController().signal)).rejects.toEqual(
			expect.objectContaining({
				name: AgenticChatSupervisorCheckpointTimeoutError.name,
				code: 'supervisor_checkpoint_persist_timeout',
				failureClass: 'transient_infra'
			})
		);
		expect(hangingRequest.abortSignal).toHaveBeenCalledOnce();

		const cancelledRpc = vi.fn();
		const cancelledAdapter = new SupabaseAgenticChatSupervisorCheckpointAdapter({
			rpc: cancelledRpc
		});
		const controller = new AbortController();
		const reason = new Error('cancelled before checkpoint');
		controller.abort(reason);
		await expect(cancelledAdapter.persist(input, controller.signal)).rejects.toBe(reason);
		expect(cancelledRpc).not.toHaveBeenCalled();
	});
});

function successReceipt(outcome: 'persisted' | 'already_persisted') {
	return {
		outcome,
		turn_run_id: TURN_RUN_ID,
		queue_job_id: QUEUE_JOB_ID,
		session_id: SESSION_ID,
		user_id: USER_ID,
		execution_generation: EXECUTION_GENERATION,
		checkpoint_id: checkpointId,
		supervisor_transition_id: TRANSITION_ID,
		sequence: 3,
		checkpoint_type: 'supervisor_question',
		status: 'active',
		reason: input.reason,
		question: input.question,
		created_at: '2026-08-13T12:00:00.000Z',
		expires_at: '2026-08-14T12:00:00.000Z'
	};
}
