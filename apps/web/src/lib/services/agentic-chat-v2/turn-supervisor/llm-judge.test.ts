// apps/web/src/lib/services/agentic-chat-v2/turn-supervisor/llm-judge.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createLLMTurnSupervisorJudge } from './llm-judge';
import type { TurnDigest, TurnSupervisorDecision } from './types';

const digest: TurnDigest = {
	turnRunId: 'turn-1',
	sessionId: 'session-1',
	userId: 'user-1',
	contextType: 'project',
	entityId: 'project-1',
	projectId: 'project-1',
	userMessage: 'Update the task',
	elapsedMs: 18_000,
	msSinceVisibleText: 12_000,
	assistantTextChars: 0,
	finalCandidateChars: 0,
	llmPassCount: 2,
	toolRoundCount: 2,
	toolCallCount: 2,
	validationFailureCount: 2,
	recentTools: [
		{
			sequence: 1,
			toolName: 'update_onto_task',
			success: false,
			errorClass: 'validation',
			resultSummary: 'Tool validation failed: Missing required parameter: task_id'
		}
	],
	progress: {
		successfulWrites: 0,
		failedWrites: 2,
		readRounds: 0,
		lowNoveltyReadRounds: 0,
		repeatedToolPatternCount: 1,
		repeatedFailureCount: 2,
		discoveredEntityCount: 0
	},
	risks: ['repeated_failures']
};

const deterministicDecision: TurnSupervisorDecision = {
	action: 'ask_user',
	reason: 'repeated_validation_failures',
	question: 'Which exact task should I use?',
	checkpoint: {
		digest,
		resumeContext: {}
	}
};

describe('createLLMTurnSupervisorJudge', () => {
	it('does not call the model when disabled', async () => {
		const llm = { generateText: vi.fn() };
		const judge = createLLMTurnSupervisorJudge({ llm, enabled: false });

		await expect(
			judge.evaluate({
				trigger: 'repeated_failures',
				digest,
				deterministicDecision,
				observationType: 'tool_round_completed'
			})
		).resolves.toBeNull();
		expect(llm.generateText).not.toHaveBeenCalled();
	});

	it('normalizes an ask_user response into a checkpoint decision', async () => {
		const llm = {
			generateText: vi.fn().mockResolvedValue(
				JSON.stringify({
					action: 'ask_user',
					reason: 'missing_target',
					question: 'Which task should I update?'
				})
			)
		};
		const judge = createLLMTurnSupervisorJudge({ llm });

		const decision = await judge.evaluate({
			trigger: 'repeated_failures',
			digest,
			deterministicDecision,
			observationType: 'tool_round_completed'
		});

		expect(decision).toMatchObject({
			action: 'ask_user',
			reason: 'missing_target',
			question: 'Which task should I update?'
		});
		expect(decision?.action === 'ask_user' ? decision.checkpoint.digest : null).toBe(digest);
		expect(llm.generateText).toHaveBeenCalledWith(
			expect.objectContaining({
				temperature: 0,
				timeoutMs: 4000,
				operationType: 'fastchat_turn_supervisor_judge'
			})
		);
	});

	it('returns null for invalid model output', async () => {
		const llm = {
			generateText: vi.fn().mockResolvedValue('not json')
		};
		const judge = createLLMTurnSupervisorJudge({ llm });

		await expect(
			judge.evaluate({
				trigger: 'repeated_failures',
				digest,
				deterministicDecision,
				observationType: 'tool_round_completed'
			})
		).resolves.toBeNull();
	});
});
