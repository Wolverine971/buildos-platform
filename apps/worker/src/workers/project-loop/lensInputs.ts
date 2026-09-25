// apps/worker/src/workers/project-loop/lensInputs.ts
//
// Tasker 108: a loop run only analyzes what changed. A lens whose inputs are
// unchanged since the last review would re-read the same records and has
// nothing new to say; its earlier findings are still open in the inbox.
//   - doc organization reads the documents and the doc tree (project row);
//   - task conflicts reads the tasks.
// Outdated docs and drift compare documents with everything else, so any
// change (the run itself is activity-gated at enqueue) keeps them running.

import type { ProjectLoopTriggerReason } from '@buildos/shared-types';
import { supabase } from '../../lib/supabase';

export type UnchangedLensInputs = {
	/** Documents and doc tree unchanged: doc organization has nothing new. */
	documents: boolean;
	/** Tasks unchanged: task conflicts has nothing new. */
	tasks: boolean;
};

const RUN_EVERY_LENS: UnchangedLensInputs = Object.freeze({ documents: false, tasks: false });

/**
 * Which lens inputs are unchanged since the project's last completed review.
 * Manual runs, a first review, and any read error run every lens.
 */
export async function loadUnchangedLensInputs(params: {
	projectId: string;
	runId: string;
	triggerReason: ProjectLoopTriggerReason | string | null;
}): Promise<UnchangedLensInputs> {
	if (params.triggerReason === 'manual') return RUN_EVERY_LENS;
	try {
		return await readUnchangedLensInputs(params);
	} catch (error) {
		console.warn('[ProjectLoops] Lens change check failed; running every lens:', error);
		return RUN_EVERY_LENS;
	}
}

async function readUnchangedLensInputs(params: {
	projectId: string;
	runId: string;
}): Promise<UnchangedLensInputs> {

	const { data: lastReview, error } = await supabase
		.from('project_loop_runs')
		.select('finished_at')
		.eq('project_id', params.projectId)
		.neq('id', params.runId)
		.in('status', ['completed', 'waiting_review'])
		.not('finished_at', 'is', null)
		.order('finished_at', { ascending: false })
		.limit(1)
		.maybeSingle();
	if (error || !lastReview?.finished_at) return RUN_EVERY_LENS;
	const since = lastReview.finished_at;

	const [documents, tasks, project] = await Promise.all([
		supabase
			.from('onto_documents')
			.select('id')
			.eq('project_id', params.projectId)
			.gt('updated_at', since)
			.limit(1),
		supabase
			.from('onto_tasks')
			.select('id')
			.eq('project_id', params.projectId)
			.gt('updated_at', since)
			.limit(1),
		supabase.from('onto_projects').select('updated_at').eq('id', params.projectId).maybeSingle()
	]);
	if (documents.error || tasks.error || project.error) return RUN_EVERY_LENS;

	// The doc tree lives on the project row; machine-only writes no longer move
	// its updated_at (20260925180000), so a newer stamp is a real edit.
	const projectUpdatedAt = project.data?.updated_at;
	const projectRowChanged = projectUpdatedAt
		? Date.parse(projectUpdatedAt) > Date.parse(since)
		: false;
	return {
		documents: (documents.data ?? []).length === 0 && !projectRowChanged,
		tasks: (tasks.data ?? []).length === 0
	};
}
