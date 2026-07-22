// apps/worker/tests/agentRunAttemptKeys.test.ts
//
// Budgeted-reservation attempt keys must include the job's retry ordinal so a
// queue retry of the SAME job reserves fresh budget instead of colliding with the
// prior attempt's ledger entry (duplicate_attempt), while remaining stable within
// a single job run per iteration/stage/tool call.
import { describe, expect, it } from 'vitest';
import { OpenRouterEmptyContentError } from '@buildos/smart-llm';
import {
	buildForcedFinalSystemPrompt,
	deepResearchAttemptKey,
	isAgentRunQueueRetryResume,
	shouldRetryAgentRunLlmTurn,
	shouldUseDurableResearchContext,
	toolAttemptKey,
	turnAttemptKey
} from '../src/workers/agent-run/agentRunWorker';

const JOB = 'agent_run_abc';

describe('agent run attempt keys', () => {
	it('embeds the job retry ordinal in every key shape', () => {
		expect(turnAttemptKey(JOB, 0, 3)).toBe(`llm:${JOB}:a0:turn:3`);
		expect(deepResearchAttemptKey(JOB, 0, 'synthesis')).toBe(
			`llm:${JOB}:a0:deep-research:synthesis`
		);
		expect(toolAttemptKey(JOB, 0, 2, 'util.web.search')).toBe(
			`tool:${JOB}:a0:2:util.web.search`
		);
	});

	it('changes the key across a retry of the same job (fresh reservation)', () => {
		expect(turnAttemptKey(JOB, 0, 3)).not.toBe(turnAttemptKey(JOB, 1, 3));
		expect(deepResearchAttemptKey(JOB, 0, 'plan')).not.toBe(
			deepResearchAttemptKey(JOB, 1, 'plan')
		);
		expect(toolAttemptKey(JOB, 0, 2, 'util.web.search')).not.toBe(
			toolAttemptKey(JOB, 1, 2, 'util.web.search')
		);
	});

	it('reclaims only a running row for a genuine queue retry', () => {
		expect(isAgentRunQueueRetryResume(1, 'running')).toBe(true);
		expect(isAgentRunQueueRetryResume(0, 'running')).toBe(false);
		expect(isAgentRunQueueRetryResume(1, 'queued')).toBe(false);
		expect(isAgentRunQueueRetryResume(-1, 'running')).toBe(false);
	});

	it('is stable within a single job run per iteration / stage / tool call', () => {
		expect(turnAttemptKey(JOB, 2, 5)).toBe(turnAttemptKey(JOB, 2, 5));
		expect(turnAttemptKey(JOB, 2, 5)).not.toBe(turnAttemptKey(JOB, 2, 6));
		expect(deepResearchAttemptKey(JOB, 2, 'plan')).not.toBe(
			deepResearchAttemptKey(JOB, 2, 'synthesis')
		);
		expect(toolAttemptKey(JOB, 2, 3, 'util.web.search')).not.toBe(
			toolAttemptKey(JOB, 2, 4, 'util.web.search')
		);
	});

	it('gives a bounded provider fallback its own paid-attempt key', () => {
		expect(turnAttemptKey(JOB, 0, 3, 1)).toBe(`llm:${JOB}:a0:turn:3:fallback:1`);
		expect(turnAttemptKey(JOB, 0, 3, 1)).not.toBe(turnAttemptKey(JOB, 0, 3));
	});

	it('retries empty content and model availability, but not deterministic schema errors', () => {
		expect(
			shouldRetryAgentRunLlmTurn(
				new OpenRouterEmptyContentError('empty', { inferredCause: 'null_content' })
			)
		).toBe(true);
		expect(
			shouldRetryAgentRunLlmTurn(
				new Error(
					'Failed to generate valid JSON: OpenRouter returned empty content (cause=null_content)'
				)
			)
		).toBe(true);
		expect(
			shouldRetryAgentRunLlmTurn({
				status: 404,
				message: 'OpenRouter API error: 404 - No endpoints found for this model'
			})
		).toBe(true);
		expect(
			shouldRetryAgentRunLlmTurn({
				status: 400,
				message: 'OpenRouter API error: 400 - invalid response schema'
			})
		).toBe(false);
	});

	it('does not retry an accepted request whose response was lost', () => {
		const acceptedTimeout = Object.assign(new Error('upstream timeout'), {
			status: 504,
			openrouter: { httpStatus: 504, generationId: 'gen-accepted-timeout' }
		});
		const wrapped = Object.assign(
			new Error('Failed to generate valid JSON: upstream timeout'),
			{ cause: acceptedTimeout }
		);

		expect(shouldRetryAgentRunLlmTurn(acceptedTimeout)).toBe(false);
		expect(shouldRetryAgentRunLlmTurn(wrapped)).toBe(false);
	});

	it('uses compact durable state only for research-scoped web runs', () => {
		expect(
			shouldUseDurableResearchContext({
				isResearchEvidenceChild: false,
				effort: 'deep',
				scopeMode: 'read_only',
				allowedOps: ['util.web.search', 'util.web.visit']
			})
		).toBe(true);
		expect(
			shouldUseDurableResearchContext({
				isResearchEvidenceChild: false,
				effort: 'deep',
				scopeMode: 'read_only',
				allowedOps: ['util.web.search', 'onto.project.get']
			})
		).toBe(false);
	});

	it('makes submit_result the only valid action on a forced final turn', () => {
		const prompt = buildForcedFinalSystemPrompt('base system', true);
		expect(prompt).toContain('only valid action is "submit_result"');
		expect(prompt).toContain('verified_visited_sources');
		expect(prompt).toContain('Candidate search results are not evidence');
	});
});
