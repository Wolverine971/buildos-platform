// apps/worker/tests/agentRunPolicy.test.ts
import { describe, expect, it } from 'vitest';
import {
	REVIEW_STAGE_NO_CHANGES_ERROR,
	buildReviewStageSystemRules,
	enforceReviewStageCompletion,
	resolveAgentRunCancellationSource,
	resolveAgentRunModelPolicy
} from '../src/workers/agent-run/agentRunPolicy';

describe('resolveAgentRunModelPolicy', () => {
	it('preserves the existing balanced lane for standard and unknown effort', () => {
		expect(resolveAgentRunModelPolicy('standard')).toEqual({
			profile: 'balanced',
			defaultWallClockMs: 5 * 60 * 1000
		});
		expect(resolveAgentRunModelPolicy('unexpected').profile).toBe('balanced');
	});

	it('maps deep work to the powerful lane with explicit high reasoning', () => {
		expect(resolveAgentRunModelPolicy('deep')).toEqual({
			profile: 'powerful',
			reasoning: { effort: 'high', exclude: false },
			defaultWallClockMs: 10 * 60 * 1000
		});
	});
});

describe('resolveAgentRunCancellationSource', () => {
	it('prioritizes a direct cancellation signal', () => {
		expect(
			resolveAgentRunCancellationSource({
				pendingSignalKinds: ['steer', 'cancel'],
				parentRunId: '10000000-0000-4000-8000-000000000001',
				parentCancelSignalCount: 1,
				parentStatus: 'running'
			})
		).toBe('run');
	});

	it('propagates cancellation from a parent to a child', () => {
		expect(
			resolveAgentRunCancellationSource({
				pendingSignalKinds: [],
				parentRunId: '10000000-0000-4000-8000-000000000001',
				parentCancelSignalCount: 1,
				parentStatus: 'running'
			})
		).toBe('parent');
	});

	it('uses durable parent terminal state after the parent cancel signal is consumed', () => {
		expect(
			resolveAgentRunCancellationSource({
				pendingSignalKinds: [],
				parentRunId: '10000000-0000-4000-8000-000000000001',
				parentCancelSignalCount: 0,
				parentStatus: 'cancelled'
			})
		).toBe('parent');
		expect(
			resolveAgentRunCancellationSource({
				pendingSignalKinds: [],
				parentRunId: '10000000-0000-4000-8000-000000000001',
				parentCancelSignalCount: 0,
				parentStatus: 'failed'
			})
		).toBe('parent');
	});

	it('ignores parent signal counts for root runs and unrelated signals', () => {
		expect(
			resolveAgentRunCancellationSource({
				pendingSignalKinds: ['pause'],
				parentRunId: null,
				parentCancelSignalCount: 1,
				parentStatus: 'cancelled'
			})
		).toBeNull();
		expect(
			resolveAgentRunCancellationSource({
				pendingSignalKinds: ['steer'],
				parentRunId: '10000000-0000-4000-8000-000000000001',
				parentCancelSignalCount: 0,
				parentStatus: 'running'
			})
		).toBeNull();
	});
});

describe('review-required Agent Run staging contract', () => {
	it('tells review runs that write ops create durable proposals without mutating live data', () => {
		const rules = buildReviewStageSystemRules({ mutationMode: 'stage', hasWriteOps: true });

		expect(rules.join('\n')).toContain('intercepted as a ProposedChange');
		expect(rules.join('\n')).toContain('does not mutate the live entity');
		expect(rules.join('\n')).toContain(
			'Describing proposed JSON in submit_result does not stage'
		);
	});

	it('does not add staging rules to ordinary commit or read-only surfaces', () => {
		expect(buildReviewStageSystemRules({ mutationMode: 'commit', hasWriteOps: true })).toEqual(
			[]
		);
		expect(buildReviewStageSystemRules({ mutationMode: 'stage', hasWriteOps: false })).toEqual(
			[]
		);
	});

	it('fails closed as partial when a review run claims completion with no proposed changes', () => {
		const completion = enforceReviewStageCompletion({
			mutationMode: 'stage',
			proposedChangeCount: 0,
			status: 'completed',
			result: { answer: { status: 'staged_only' }, summary: 'Staged the proposal.' }
		});

		expect(completion.status).toBe('partial');
		expect(completion.result.error).toBe(REVIEW_STAGE_NO_CHANGES_ERROR);
		expect(completion.result.answer).toContain('did not stage a reviewable change set');
		expect(completion.result.reported_answer).toEqual({ status: 'staged_only' });
	});

	it('preserves completed review runs that contain at least one proposed change', () => {
		const result = { answer: 'Proposal staged.' };
		expect(
			enforceReviewStageCompletion({
				mutationMode: 'stage',
				proposedChangeCount: 1,
				status: 'completed',
				result
			})
		).toEqual({ status: 'completed', result });
	});
});
