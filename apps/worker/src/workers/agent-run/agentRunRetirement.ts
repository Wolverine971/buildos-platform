// apps/worker/src/workers/agent-run/agentRunRetirement.ts
/** Compatibility boundary for historical rows and already queued jobs. */
export const RETIRED_RESEARCH_MESSAGE =
	'Deep research has been retired. This run was cancelled without starting research.';
export function isRetiredResearchRun(run: {
	run_template: string;
	orchestration_state: unknown;
}): boolean {
	const state = run.orchestration_state;
	return (
		run.run_template === 'deep_research' ||
		Boolean(
			state &&
				typeof state === 'object' &&
				'role' in state &&
				state.role === 'deep_research_child'
		)
	);
}
