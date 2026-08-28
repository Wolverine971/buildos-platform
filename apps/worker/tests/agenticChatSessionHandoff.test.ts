import { describe, expect, it, vi } from 'vitest';
import {
	AgenticChatSessionHandoffFenceError,
	AgenticChatSessionHandoffProtocolError,
	SupabaseAgenticChatSessionHandoffAdapter
} from '../src/workers/agentic-chat/sessionHandoff';

const TURN_RUN_ID = '11111111-1111-4111-8111-111111111111';
const QUEUE_JOB_ID = '22222222-2222-4222-8222-222222222222';
const PROCESSING_TOKEN = '33333333-3333-4333-8333-333333333333';
const USER_ID = '44444444-4444-4444-8444-444444444444';
const SESSION_ID = '55555555-5555-4555-8555-555555555555';
const PROJECT_ID = '66666666-6666-4666-8666-666666666666';

function input(overrides: Record<string, unknown> = {}) {
	return {
		turnRunId: TURN_RUN_ID,
		queueJobId: QUEUE_JOB_ID,
		processingToken: PROCESSING_TOKEN,
		userId: USER_ID,
		sessionId: SESSION_ID,
		executionGeneration: 1,
		contextType: 'project',
		entityId: PROJECT_ID,
		projectId: PROJECT_ID,
		...overrides
	} as const;
}

function receipt(overrides: Record<string, unknown> = {}) {
	return {
		outcome: 'persisted',
		turn_run_id: TURN_RUN_ID,
		queue_job_id: QUEUE_JOB_ID,
		session_id: SESSION_ID,
		user_id: USER_ID,
		execution_generation: 1,
		context_type: 'project',
		entity_id: PROJECT_ID,
		project_id: PROJECT_ID,
		shifted_at: '2026-08-28T04:30:00.123456+00:00',
		...overrides
	};
}

describe('SupabaseAgenticChatSessionHandoffAdapter', () => {
	it.each(['persisted', 'already_applied'] as const)(
		'accepts an idempotent %s project handoff receipt',
		async (outcome) => {
			const rpc = vi.fn(async () => ({ data: receipt({ outcome }), error: null }));
			const adapter = new SupabaseAgenticChatSessionHandoffAdapter({ rpc });

			await expect(
				adapter.persist(input(), new AbortController().signal)
			).resolves.toBeUndefined();
			expect(rpc).toHaveBeenCalledWith('persist_agentic_chat_session_handoff', {
				p_turn_run_id: TURN_RUN_ID,
				p_queue_job_id: QUEUE_JOB_ID,
				p_processing_token: PROCESSING_TOKEN,
				p_execution_generation: 1,
				p_user_id: USER_ID,
				p_context_type: 'project',
				p_entity_id: PROJECT_ID,
				p_project_id: PROJECT_ID
			});
		}
	);

	it('rejects stale generations and malformed persisted receipts', async () => {
		const stale = new SupabaseAgenticChatSessionHandoffAdapter({
			rpc: vi.fn(async () => ({
				data: receipt({ outcome: 'stale_generation', execution_generation: 2 }),
				error: null
			}))
		});
		await expect(stale.persist(input(), new AbortController().signal)).rejects.toBeInstanceOf(
			AgenticChatSessionHandoffFenceError
		);

		const malformed = new SupabaseAgenticChatSessionHandoffAdapter({
			rpc: vi.fn(async () => ({
				data: receipt({ project_id: '77777777-7777-4777-8777-777777777777' }),
				error: null
			}))
		});
		await expect(
			malformed.persist(input(), new AbortController().signal)
		).rejects.toBeInstanceOf(AgenticChatSessionHandoffProtocolError);
	});

	it('requires a project context to carry one matching project identity', async () => {
		const rpc = vi.fn();
		const adapter = new SupabaseAgenticChatSessionHandoffAdapter({ rpc });

		await expect(
			adapter.persist(input({ projectId: null }), new AbortController().signal)
		).rejects.toBeInstanceOf(AgenticChatSessionHandoffProtocolError);
		expect(rpc).not.toHaveBeenCalled();
	});
});
