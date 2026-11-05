// apps/worker/src/workers/project-loop/jobIdentity.ts
// A buildos_project_loop job acts only for its queue row owner, on a project
// that owner can edit, and on a run that owner created. Every legitimate
// enqueue (web and worker) sets p_user_id = metadata.userId, so a mismatch
// means the metadata was not written by BuildOS.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, ProjectLoopJobMetadata } from '@buildos/shared-types';
import type { ProcessingJob } from '../../lib/supabaseQueue';
import { userHasProjectAccess } from '../../lib/projectAccess';

/** Null when the job may run; otherwise a short reason to skip it. Throws on DB errors. */
export async function projectLoopJobRefusal(
	client: SupabaseClient<Database>,
	job: Pick<ProcessingJob<ProjectLoopJobMetadata>, 'userId' | 'data'>
): Promise<string | null> {
	const { projectId, runId, userId: metadataUserId } = job.data;
	if (!job.userId) return 'missing_queue_owner';
	if (metadataUserId && metadataUserId !== job.userId) return 'metadata_user_mismatch';
	// Missing projectId is reported by the processor's own validation.
	if (!projectId) return null;

	if (!(await userHasProjectAccess(client, job.userId, projectId, 'write'))) {
		return 'no_project_access';
	}

	if (runId) {
		const { data: run, error } = await client
			.from('project_loop_runs')
			.select('user_id, project_id')
			.eq('id', runId)
			.maybeSingle();
		if (error) throw new Error(`Failed to load loop run owner: ${error.message}`);
		if (run && (run.user_id !== job.userId || run.project_id !== projectId)) {
			return 'run_not_owned';
		}
	}
	return null;
}
