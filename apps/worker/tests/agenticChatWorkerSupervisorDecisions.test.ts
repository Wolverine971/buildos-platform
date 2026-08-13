// apps/worker/tests/agenticChatWorkerSupervisorDecisions.test.ts
import type { TurnDigest, TurnSupervisorDecision } from '@buildos/agentic-chat-runtime/supervisor';
import { describe, expect, it } from 'vitest';
import type { AgenticChatWorkerSupervisorDecisionRecordV1 } from '../src/workers/agentic-chat/workerSupervisor';
import {
	AGENTIC_CHAT_SUPERVISOR_BLOCKED_RETRY_ERROR,
	reduceAgenticChatWorkerSupervisorDecisionsV1
} from '../src/workers/agentic-chat/workerSupervisorDecisions';

const TRANSITION_ID = '3000000a-0000-4000-8000-000000000003';

describe('reduceAgenticChatWorkerSupervisorDecisionsV1', () => {
	it('maps status, recovery, synthesis, blocking, and eval actions without dropping one', () => {
		const effects = reduceAgenticChatWorkerSupervisorDecisionsV1([
			record(1, {
				action: 'emit_status',
				message: 'Still working...',
				reason: 'long_silence'
			}),
			record(2, {
				action: 'inject_recovery_instruction',
				instruction: 'Use the correct task id.',
				reason: 'wrong_entity_kind_failed_write'
			}),
			record(3, {
				action: 'inject_recovery_instruction',
				instruction: 'Do not retry the same payload.',
				reason: 'blocked_repeated_failed_write',
				toolCallId: 'write-2',
				blockToolCall: true
			}),
			record(4, {
				action: 'force_synthesis',
				instruction: 'Answer from the available results.',
				reason: 'low_novelty_reads'
			}),
			record(5, { action: 'flag_eval', reason: 'empty_final_candidate_after_tool_work' })
		]);

		expect(effects.semanticSteps).toEqual([
			expect.objectContaining({
				type: 'semantic',
				transitionId: TRANSITION_ID,
				eventType: 'agent_state',
				currentActivity: 'Still working...'
			})
		]);
		expect(effects.providerInstructions).toEqual([
			'Use the correct task id.',
			'Do not retry the same payload.',
			'Answer from the available results.'
		]);
		expect(effects.forceSynthesis).toBe(true);
		expect(effects.blockedToolCalls).toEqual([
			{
				providerToolCallId: 'write-2',
				error: AGENTIC_CHAT_SUPERVISOR_BLOCKED_RETRY_ERROR,
				modelPayload: {
					error: AGENTIC_CHAT_SUPERVISOR_BLOCKED_RETRY_ERROR,
					supervisor_recovery: { blocked_exact_retry: true }
				}
			}
		]);
		expect(effects.evaluationFlags).toEqual([
			{
				type: 'supervisor_evaluation',
				transitionId: TRANSITION_ID,
				reason: 'empty_final_candidate_after_tool_work',
				sequence: 5,
				executionGeneration: 1
			}
		]);
		expect(effects.terminalRequest).toBeNull();
	});

	it('preserves the clarification checkpoint as an explicit terminal request', () => {
		const checkpoint = { digest: digest(), resumeContext: { missing_field: 'task_id' } };
		const effects = reduceAgenticChatWorkerSupervisorDecisionsV1([
			record(1, {
				action: 'ask_user',
				question: 'Which task?',
				checkpoint,
				reason: 'repeated_validation_failures'
			})
		]);

		expect(effects.terminalRequest).toEqual({
			kind: 'ask_user',
			transitionId: TRANSITION_ID,
			sequence: 1,
			executionGeneration: 1,
			reason: 'repeated_validation_failures',
			question: 'Which task?',
			supervisorDecision: {
				action: 'ask_user',
				question: 'Which task?',
				checkpoint,
				reason: 'repeated_validation_failures'
			},
			checkpoint,
			finishedReason: 'supervisor_question'
		});
	});

	it('accepts a later globally ordered decision as the first record in a local batch', () => {
		expect(
			reduceAgenticChatWorkerSupervisorDecisionsV1([
				record(7, { action: 'flag_eval', reason: 'late_batch' })
			]).evaluationFlags
		).toEqual([
			{
				type: 'supervisor_evaluation',
				transitionId: TRANSITION_ID,
				reason: 'late_batch',
				sequence: 7,
				executionGeneration: 1
			}
		]);
	});

	it('fails closed on continue records, gaps, mixed generations, and malformed blocks', () => {
		expect(() =>
			reduceAgenticChatWorkerSupervisorDecisionsV1([record(1, { action: 'continue' })])
		).toThrow('cannot contain continue');
		expect(() =>
			reduceAgenticChatWorkerSupervisorDecisionsV1([
				record(1, { action: 'flag_eval', reason: 'first' }),
				record(3, { action: 'flag_eval', reason: 'gap' })
			])
		).toThrow('must be contiguous');
		expect(() =>
			reduceAgenticChatWorkerSupervisorDecisionsV1([
				record(1, { action: 'flag_eval', reason: 'first' }),
				{ ...record(2, { action: 'flag_eval', reason: 'second' }), executionGeneration: 2 }
			])
		).toThrow('generation is inconsistent');
		expect(() =>
			reduceAgenticChatWorkerSupervisorDecisionsV1([
				record(1, {
					action: 'inject_recovery_instruction',
					instruction: 'Blocked.',
					reason: 'blocked_repeated_failed_write',
					blockToolCall: true
				})
			])
		).toThrow('missing its tool-call id');
	});
});

function record(
	sequence: number,
	decision: TurnSupervisorDecision
): AgenticChatWorkerSupervisorDecisionRecordV1 {
	return {
		decision,
		digest: digest(),
		at: '2026-08-13T10:00:00.000Z',
		source: 'monitor',
		transitionId: TRANSITION_ID,
		executionGeneration: 1,
		sequence
	};
}

function digest(): TurnDigest {
	return {
		turnRunId: '10000000-0000-4000-8000-000000000001',
		sessionId: '20000000-0000-4000-8000-000000000002',
		userId: '30000000-0000-4000-8000-000000000003',
		contextType: 'project',
		entityId: null,
		projectId: null,
		userMessage: 'Update the task.',
		elapsedMs: 0,
		msSinceVisibleText: null,
		assistantTextChars: 0,
		finalCandidateChars: 0,
		llmPassCount: 0,
		toolRoundCount: 0,
		toolCallCount: 0,
		validationFailureCount: 0,
		recentTools: [],
		progress: {
			successfulWrites: 0,
			failedWrites: 0,
			readRounds: 0,
			lowNoveltyReadRounds: 0,
			repeatedToolPatternCount: 0,
			repeatedFailureCount: 0,
			discoveredEntityCount: 0
		},
		risks: []
	};
}
