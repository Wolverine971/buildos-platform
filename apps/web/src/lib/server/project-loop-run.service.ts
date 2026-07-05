// apps/web/src/lib/server/project-loop-run.service.ts
//
// Project-loop run lifecycle helpers used by the suggestion-decision paths.

type AnySupabase = any;

/**
 * Advance a run from `waiting_review` → `completed` once the user has decided
 * every child suggestion. Runs are parked at `waiting_review` when suggestions
 * are written and previously never advanced past it, so decided runs piled up
 * as false "still in review" rows (audit Tier 1 #7). Called after each decision.
 *
 * Idempotent and guarded: only a run STILL in `waiting_review` is flipped, and
 * only when no child suggestion is still `pending`. `finished_at` is left as the
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
