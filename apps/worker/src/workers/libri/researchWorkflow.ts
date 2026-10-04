import {
	finishResearchClaim,
	lockResearchClaim,
	researchTransaction
} from './bookResearchTransaction';
import type {
	ClaimedLibriStep,
	LibriLifecyclePort,
	LibriTransactionClient,
	LibriTransactionalPool
} from './lifecycle';

export type ChapterWorkflowStage = {
	phase: 'chapter_search' | 'chapter_extract';
	chapterId: string;
	dependsOn: number[];
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TERMINAL = ['completed', 'failed', 'cancelled', 'skipped', 'needs_review', 'dead_letter'];

/** Parent completion, child dispatch and prerequisite failure are durable database
 * state. Repeating maintenance is safe after a process exit or lost queue reply. */
export function createLibriResearchWorkflow(
	pool: LibriTransactionalPool,
	lifecycle: Pick<LibriLifecyclePort, 'enqueueStep'>
) {
	return {
		plan(
			claim: ClaimedLibriStep,
			input:
				| ChapterWorkflowStage[]
				| ((client: LibriTransactionClient) => Promise<ChapterWorkflowStage[]>)
		) {
			return researchTransaction(pool, async (client) => {
				await lockResearchClaim(client, claim);
				const stages = typeof input === 'function' ? await input(client) : input;
				if (!Array.isArray(stages) || stages.length > 999)
					throw new Error('Invalid workflow plan');
				const authority = await client.query<{ allowed: boolean }>(
					'SELECT libri.research_task_execution_allowed($1) AS allowed',
					[claim.stepId]
				);
				if (authority.rows[0]?.allowed !== true)
					throw new Error('Research authority expired');
				if (stages.length === 0) {
					// A processor may only use this after checking the complete current subject.
					await finishResearchClaim(client, claim, {
						message: 'No chapter research gaps remain.'
					});
					return { plannedCount: 0, stepIds: [] as string[] };
				}
				const planned = await client.query<{
					receipt: { plannedCount: number; stepIds: string[] };
				}>('SELECT libri.prepare_research_workflow($1,$2,$3,$4::jsonb) AS receipt', [
					claim.stepId,
					claim.executionGeneration,
					claim.leaseToken,
					JSON.stringify(stages)
				]);
				const receipt = planned.rows[0]?.receipt;
				if (
					!receipt ||
					receipt.plannedCount !== stages.length ||
					!Array.isArray(receipt.stepIds) ||
					receipt.stepIds.length !== stages.length ||
					new Set(receipt.stepIds).size !== stages.length ||
					receipt.stepIds.some((id) => !UUID.test(id))
				)
					throw new Error('Invalid workflow plan receipt');
				const result = {
					workflowVersion: 1,
					awaitingChildren: true,
					plannedCount: stages.length,
					message: `Chapter research is in progress (${stages.length / 2} chapters).`
				};
				const queue = await client.query(
					`UPDATE public.queue_jobs SET status='completed',processing_token=NULL,completed_at=now(),updated_at=now(),result=$3::jsonb,error_message=NULL
      WHERE id=$1 AND status='processing' AND processing_token=$2 RETURNING id`,
					[claim.queueRowId, claim.processingToken, JSON.stringify(result)]
				);
				if (queue.rowCount !== 1) throw new Error('Workflow queue ownership changed');
				const parent = await client.query(
					`UPDATE libri.research_steps SET status='waiting',result=$6::jsonb,active_processing_token=NULL,
      lease_token=NULL,lease_owner=NULL,leased_at=NULL,lease_expires_at=NULL,last_heartbeat_at=now(),updated_at=now()
      WHERE id=$1 AND active_queue_job_id=$2 AND active_processing_token=$3 AND execution_generation=$4 AND lease_token=$5 AND status='leased' RETURNING id`,
					[
						claim.stepId,
						claim.queueRowId,
						claim.processingToken,
						claim.executionGeneration,
						claim.leaseToken,
						JSON.stringify(result)
					]
				);
				if (parent.rowCount !== 1) throw new Error('Workflow parent ownership changed');
				return receipt;
			});
		},
		reconcile(signal: AbortSignal, limit = 30) {
			bounded(limit);
			signal.throwIfAborted();
			return researchTransaction(pool, async (client) => {
				// Only unqueued dependent steps can be skipped here. Active queue ownership
				// remains the lifecycle's responsibility, including cancellation/recovery.
				const blocked = await client.query<{ id: string }>(
					`SELECT step.id FROM libri.research_steps step
      JOIN libri.research_runs run ON run.id=step.run_id AND run.library_id=step.library_id
      WHERE step.parent_step_id IS NOT NULL AND step.payload->>'workflowVersion'='1'
       AND step.status IN ('pending','retry_wait') AND step.active_queue_job_id IS NULL
       AND EXISTS(SELECT 1 FROM libri.research_step_dependencies dependency
        JOIN libri.research_steps prerequisite ON prerequisite.id=dependency.prerequisite_step_id
        WHERE dependency.step_id=step.id AND prerequisite.status=ANY($2::text[]) AND prerequisite.status<>'completed')
      ORDER BY step.created_at,step.id LIMIT $1 FOR UPDATE OF step,run SKIP LOCKED`,
					[limit, TERMINAL]
				);
				for (const step of blocked.rows) {
					signal.throwIfAborted();
					await client.query(
						`UPDATE libri.research_steps SET status='skipped',completed_at=now(),updated_at=now(),
      error_class='libri_prerequisite_failed',error_message='A required research stage did not complete.' WHERE id=$1`,
						[step.id]
					);
				}
				const parents = await client.query<{ id: string; run_id: string }>(
					`SELECT parent.id,parent.run_id FROM libri.research_steps parent
      JOIN libri.research_runs run ON run.id=parent.run_id AND run.library_id=parent.library_id
      WHERE parent.status='waiting' AND parent.result->>'workflowVersion'='1'
       AND EXISTS(SELECT 1 FROM libri.research_steps child WHERE child.parent_step_id=parent.id)
       AND NOT EXISTS(SELECT 1 FROM libri.research_steps child WHERE child.parent_step_id=parent.id AND NOT child.status=ANY($2::text[]))
      ORDER BY parent.created_at,parent.id LIMIT $1 FOR UPDATE OF parent,run SKIP LOCKED`,
					[limit, TERMINAL]
				);
				for (const parent of parents.rows) {
					signal.throwIfAborted();
					const aggregate = await client.query<{
						failed: number;
						review: number;
						chapters: number;
					}>(
						`SELECT count(*) FILTER(WHERE status<>'completed')::int failed,
       count(*) FILTER(WHERE status='needs_review' OR result->>'outcome' IN ('insufficient_evidence','outdated'))::int review,
       count(*) FILTER(WHERE payload->>'phase'='chapter_extract')::int chapters
       FROM libri.research_steps WHERE parent_step_id=$1`,
						[parent.id]
					);
					const counts = aggregate.rows[0];
					const status =
						counts.review > 0
							? 'needs_review'
							: counts.failed > 0
								? 'failed'
								: 'completed';
					const message =
						status === 'completed'
							? `Research completed for ${counts.chapters} chapters.`
							: 'Chapter research requires attention. Review the individual stage results.';
					await client.query(
						`UPDATE libri.research_steps SET status=$2,completed_at=now(),updated_at=now(),
      result=result||jsonb_build_object('awaitingChildren',false,'message',$3::text),error_class=CASE WHEN $2='completed' THEN NULL ELSE 'libri_workflow_incomplete' END,
      error_message=CASE WHEN $2='completed' THEN NULL ELSE $3 END WHERE id=$1 AND status='waiting'`,
						[parent.id, status, message]
					);
					await client.query(
						`UPDATE libri.research_runs SET completed_steps=completed_steps+CASE WHEN $2='completed' THEN 1 ELSE 0 END,
      failed_steps=failed_steps+CASE WHEN $2='completed' THEN 0 ELSE 1 END,last_progress_at=now(),updated_at=now() WHERE id=$1`,
						[parent.run_id, status]
					);
					await client.query(
						`UPDATE libri.research_runs run SET status=CASE WHEN cancel_requested_at IS NOT NULL THEN 'cancelled'
      WHEN (failed_steps>0 OR dead_letter_steps>0) AND completed_steps>0 THEN 'partial'
      WHEN failed_steps>0 OR dead_letter_steps>0 THEN 'failed' ELSE 'completed' END,finished_at=now(),updated_at=now()
      WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM libri.research_steps WHERE run_id=run.id AND NOT status=ANY($2::text[]))`,
						[parent.run_id, TERMINAL]
					);
				}
				return { skipped: blocked.rows.length, completedParents: parents.rows.length };
			});
		},
		async dispatch(signal: AbortSignal, limit = 30) {
			bounded(limit);
			signal.throwIfAborted();
			const steps = await researchTransaction(
				pool,
				async (client) =>
					(
						await client.query<{ id: string; run_id: string }>(
							`SELECT step.id,step.run_id FROM libri.research_steps step
     WHERE step.parent_step_id IS NOT NULL AND step.payload->>'workflowVersion'='1'
      AND step.status IN ('pending','retry_wait') AND step.active_queue_job_id IS NULL
      AND step.scheduled_for<=clock_timestamp() AND libri.research_workflow_step_ready(step.id)
      AND libri.research_task_execution_allowed(step.id)
     ORDER BY step.priority,step.created_at,step.id LIMIT $1`,
							[limit]
						)
					).rows
			);
			let dispatched = 0;
			for (const step of steps) {
				signal.throwIfAborted();
				try {
					const receipt = await lifecycle.enqueueStep({ stepId: step.id });
					if (
						receipt.stepId !== step.id ||
						receipt.runId !== step.run_id ||
						receipt.queueType !== 'libri_research' ||
						!UUID.test(receipt.queueRowId) ||
						!receipt.queueJobId.startsWith('libri_research_') ||
						!UUID.test(receipt.queueJobId.slice('libri_research_'.length))
					)
						throw new Error('Invalid workflow queue receipt');
				} catch (cause) {
					signal.throwIfAborted();
					const durable = await researchTransaction(
						pool,
						async (client) =>
							(
								await client.query<{ accepted: boolean }>(
									`SELECT EXISTS(SELECT 1 FROM libri.research_steps step JOIN public.queue_jobs job ON job.id=step.active_queue_job_id
       WHERE step.id=$1 AND step.run_id=$2 AND step.payload->>'workflowVersion'='1'
        AND step.status NOT IN ('pending','retry_wait') AND job.job_type='libri_research'
        AND job.dedup_key='libri:research-step:'||step.id::text
        AND job.metadata->>'researchStepId'=step.id::text AND job.metadata->>'researchRunId'=step.run_id::text
        AND job.metadata->>'libraryId'=step.library_id::text) AS accepted`,
									[step.id, step.run_id]
								)
							).rows[0]?.accepted
					);
					if (durable !== true) throw cause;
				}
				dispatched += 1;
			}
			return { dispatched };
		}
	};
}
function bounded(limit: number) {
	if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
		throw new Error('Use 1 to 100 workflow stages');
}
