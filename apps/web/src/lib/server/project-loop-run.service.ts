// apps/web/src/lib/server/project-loop-run.service.ts
//
// Project-loop run lifecycle helpers used by the suggestion-decision paths.

type AnySupabase = any;

/**
 * Suggestion ids an open v2 manager brief asks the user to decide on, or null when the brief
 * is not an open decision. They are project-wide candidates, not the run's own children, and
 * the Inbox approves them through this run. Mirrors the worker's stalled-run reclaim.
 */
function managerBriefDecisionCandidateIds(brief: unknown): string[] | null {
	if (!brief || typeof brief !== 'object' || Array.isArray(brief)) return null;
	const record = brief as Record<string, unknown>;
	if (record.version !== 2) return null;
	if (record.attention_level !== 'decision' && record.attention_level !== 'urgent') return null;
	return Array.isArray(record.candidate_ids)
		? record.candidate_ids.filter(
				(id): id is string => typeof id === 'string' && id.trim().length > 0
			)
		: [];
}

/**
 * Advance a run from `waiting_review` → `completed` once the user has decided
 * every child suggestion. Runs are parked at `waiting_review` when suggestions
 * are written and previously never advanced past it, so decided runs piled up
 * as false "still in review" rows (audit Tier 1 #7). Called after each decision.
 *
 * Idempotent and guarded: only a run STILL in `waiting_review` is flipped, and
 * only when no child suggestion (nor, for an open v2 decision brief, no candidate
 * suggestion) is still `pending`. `finished_at` is left as the
 * generation-finished timestamp. Swallows its own errors — finalization is a
 * housekeeping nicety and must never fail the decision it follows.
 */
export async function finalizeProjectLoopRunIfComplete(
	supabase: AnySupabase,
	runId: string | null | undefined
): Promise<void> {
	if (!runId) return;
	try {
		const { data: pending, error } = await supabase
			.from('project_suggestions')
			.select('id')
			.eq('run_id', runId)
			.eq('status', 'pending')
			.limit(1);
		if (error) {
			console.warn(
				`[ProjectLoops] Run finalize check failed for run ${runId}:`,
				error.message
			);
			return;
		}
		// A still-pending child means the user has more to review.
		if (pending && pending.length) return;

		const { data: run, error: runError } = await supabase
			.from('project_loop_runs')
			.select('brief')
			.eq('id', runId)
			.maybeSingle();
		if (runError) {
			console.warn(
				`[ProjectLoops] Run finalize brief lookup failed for run ${runId}:`,
				runError.message
			);
			return;
		}
		const candidateIds = managerBriefDecisionCandidateIds(run?.brief);
		if (candidateIds !== null) {
			// An open decision with no candidates stays in review until answered or superseded.
			if (candidateIds.length === 0) return;
			const { data: pendingCandidates, error: candidatesError } = await supabase
				.from('project_suggestions')
				.select('id')
				.in('id', candidateIds)
				.eq('status', 'pending')
				.limit(1);
			if (candidatesError) {
				console.warn(
					`[ProjectLoops] Run finalize candidate check failed for run ${runId}:`,
					candidatesError.message
				);
				return;
			}
			if (pendingCandidates && pendingCandidates.length) return;
		}

		const { error: updateError } = await supabase
			.from('project_loop_runs')
			.update({ status: 'completed' })
			.eq('id', runId)
			.eq('status', 'waiting_review');
		if (updateError) {
			console.warn(
				`[ProjectLoops] Run finalize update failed for run ${runId}:`,
				updateError.message
			);
		}
	} catch (error) {
		console.warn(
			`[ProjectLoops] Run finalize threw for run ${runId}:`,
			error instanceof Error ? error.message : error
		);
	}
}
