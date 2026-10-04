import type { ClaimedLibriStep, LibriTransactionClient, LibriTransactionalPool } from './lifecycle';
export type BookResearchUsage = {
	provider?: 'openrouter' | 'tavily';
	model: string;
	providerRequestId: string;
	costMicrousd: bigint;
	promptTokens: bigint;
	completionTokens: bigint;
};
export async function researchTransaction<T>(
	pool: LibriTransactionalPool,
	operation: (client: LibriTransactionClient) => Promise<T>
): Promise<T> {
	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		const result = await operation(client);
		await client.query('COMMIT');
		return result;
	} catch (error) {
		await client.query('ROLLBACK').catch(() => undefined);
		throw error;
	} finally {
		client.release();
	}
}
export async function lockResearchClaim(client: LibriTransactionClient, claim: ClaimedLibriStep) {
	const result = await client.query(
		`SELECT step.id FROM public.queue_jobs job
   JOIN libri.research_steps step ON step.active_queue_job_id=job.id
   WHERE job.id=$1 AND job.processing_token=$2 AND job.status='processing' AND job.job_type='libri_research'
    AND step.id=$3 AND step.active_processing_token=$2 AND step.status='leased'
    AND step.execution_generation=$4 AND step.lease_token=$5 AND step.lease_expires_at>clock_timestamp()
    AND step.library_id=$6 AND step.run_id=$7 FOR UPDATE OF job,step`,
		[
			claim.queueRowId,
			claim.processingToken,
			claim.stepId,
			claim.executionGeneration,
			claim.leaseToken,
			claim.libraryId,
			claim.runId
		]
	);
	if (result.rowCount !== 1) throw new Error('Research queue ownership is stale');
	await client.query('SELECT id FROM libri.research_runs WHERE id=$1 FOR UPDATE', [claim.runId]);
}
export async function finishResearchClaim(
	client: LibriTransactionClient,
	claim: ClaimedLibriStep,
	result: Record<string, unknown>,
	usage?: BookResearchUsage
) {
	const queue = await client.query(
		`UPDATE public.queue_jobs SET status='completed',processing_token=NULL,completed_at=now(),updated_at=now(),result=$3::jsonb,error_message=NULL
   WHERE id=$1 AND status='processing' AND processing_token=$2 RETURNING id`,
		[claim.queueRowId, claim.processingToken, JSON.stringify(result)]
	);
	if (queue.rowCount !== 1) throw new Error('Research queue completion lost ownership');
	const step = await client.query(
		`UPDATE libri.research_steps SET status='completed',result=$6::jsonb,active_processing_token=NULL,
   lease_token=NULL,lease_owner=NULL,leased_at=NULL,lease_expires_at=NULL,last_heartbeat_at=now(),completed_at=now(),updated_at=now(),
   provider=$7,model=$8,prompt_tokens=$9,completion_tokens=$10,estimated_cost_microusd=$11,error_class=NULL,error_message=NULL
   WHERE id=$1 AND active_queue_job_id=$2 AND active_processing_token=$3 AND execution_generation=$4 AND lease_token=$5 AND status='leased' RETURNING id`,
		[
			claim.stepId,
			claim.queueRowId,
			claim.processingToken,
			claim.executionGeneration,
			claim.leaseToken,
			JSON.stringify(result),
			usage ? (usage.provider ?? 'openrouter') : null,
			usage?.model ?? null,
			usage?.promptTokens.toString() ?? null,
			usage?.completionTokens.toString() ?? null,
			usage?.costMicrousd.toString() ?? null
		]
	);
	if (step.rowCount !== 1) throw new Error('Research step completion lost ownership');
	await client.query(
		`UPDATE libri.research_runs SET completed_steps=completed_steps+1,last_progress_at=now(),updated_at=now() WHERE id=$1`,
		[claim.runId]
	);
	await client.query(
		`UPDATE libri.research_runs run SET status=CASE WHEN cancel_requested_at IS NOT NULL THEN 'cancelled'
   WHEN (failed_steps>0 OR dead_letter_steps>0) AND completed_steps>0 THEN 'partial'
   WHEN failed_steps>0 OR dead_letter_steps>0 THEN 'failed' ELSE 'completed' END,finished_at=now(),updated_at=now()
   WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM libri.research_steps WHERE run_id=run.id AND status NOT IN ('completed','failed','cancelled','skipped','needs_review','dead_letter'))`,
		[claim.runId]
	);
}
