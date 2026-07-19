// apps/worker/src/workers/agent-run/agentRunPolicy.ts
import type { JSONProfile, ReasoningOptions } from '@buildos/smart-llm';

export type AgentRunEffort = 'standard' | 'deep';

export type AgentRunModelPolicy = {
	profile: JSONProfile;
	reasoning?: ReasoningOptions;
	defaultWallClockMs: number;
};

const STANDARD_WALL_CLOCK_MS = 5 * 60 * 1000;
const DEEP_WALL_CLOCK_MS = 10 * 60 * 1000;

export type AgentRunCancellationSource = 'run' | 'parent' | null;

export function resolveAgentRunCancellationSource(params: {
	pendingSignalKinds: readonly string[];
	parentRunId: string | null | undefined;
	parentCancelSignalCount: number;
	parentStatus?: string | null;
}): AgentRunCancellationSource {
	if (params.pendingSignalKinds.includes('cancel')) return 'run';
	if (
		params.parentRunId &&
		(params.parentCancelSignalCount > 0 ||
			params.parentStatus === 'cancelled' ||
			params.parentStatus === 'failed' ||
			params.parentStatus === 'completed' ||
			params.parentStatus === 'partial')
	) {
		return 'parent';
	}
	return null;
}

/**
 * Keep model quality routing independent from orchestration shape. A future
 * deep-research template can use this policy for its planner/synthesizer while
 * cheaper child researchers remain on the standard lane.
 */
export function resolveAgentRunModelPolicy(effort: unknown): AgentRunModelPolicy {
	if (effort === 'deep') {
		return {
			profile: 'powerful',
			reasoning: { effort: 'high', exclude: false },
			defaultWallClockMs: DEEP_WALL_CLOCK_MS
		};
	}

	return {
		profile: 'balanced',
		defaultWallClockMs: STANDARD_WALL_CLOCK_MS
	};
}
