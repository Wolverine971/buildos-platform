// apps/worker/tests/agentRunPolicy.test.ts
import { describe, expect, it } from 'vitest';
import {
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
