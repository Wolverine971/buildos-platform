import { createLibriCostLedger } from './costLedger';
import type { ClaimedLibriStep, LibriTransactionClient, LibriTransactionalPool } from './lifecycle';
import type { SynthesisExecution, SynthesisInput, SynthesisResult } from './bookSynthesis';

export function createBookSynthesisExecution(pool: LibriTransactionalPool): SynthesisExecution {
	async function transaction<T>(
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
	async function load(
		client: LibriTransactionClient,
		claim: ClaimedLibriStep
	): Promise<SynthesisInput> {
		const result = await client.query<{ input: SynthesisInput }>(
			'SELECT libri.read_book_synthesis_input($1,$2,$3) AS input',
			[claim.stepId, claim.executionGeneration, claim.leaseToken]
		);
		const input = result.rows[0]?.input;
		if (
			result.rows.length !== 1 ||
			!input?.dataset?.book?.id ||
			!Array.isArray(input.dataset.chapters) ||
			!Number.isSafeInteger(input.snapshot?.chapterCount) ||
			!/^[a-f0-9]{64}$/.test(input.fingerprint)
		)
			throw new Error('Invalid synthesis input receipt');
		return input;
	}
	async function lock(client: LibriTransactionClient, claim: ClaimedLibriStep) {
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
		if (result.rowCount !== 1) throw new Error('Synthesis queue ownership is stale');
		await client.query('SELECT id FROM libri.research_runs WHERE id=$1 FOR UPDATE', [
			claim.runId
		]);
	}
	async function finish(
		client: LibriTransactionClient,
		claim: ClaimedLibriStep,
		result: Record<string, unknown>,
		usage?: SynthesisResult
	) {
		const queue = await client.query(
			`UPDATE public.queue_jobs SET status='completed',processing_token=NULL,completed_at=now(),updated_at=now(),result=$3::jsonb,error_message=NULL
   WHERE id=$1 AND status='processing' AND processing_token=$2 RETURNING id`,
			[claim.queueRowId, claim.processingToken, JSON.stringify(result)]
		);
		if (queue.rowCount !== 1) throw new Error('Synthesis queue completion lost ownership');
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
				usage ? 'openrouter' : null,
				usage?.model ?? null,
				usage?.promptTokens.toString() ?? null,
				usage?.completionTokens.toString() ?? null,
				usage?.costMicrousd.toString() ?? null
			]
		);
		if (step.rowCount !== 1) throw new Error('Synthesis step completion lost ownership');
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
	return {
		load: (claim) => transaction((client) => load(client, claim)),
		authorize: (claim, reservationId) =>
			transaction(async (client) => {
				await lock(client, claim);
				await load(client, claim);
				const result = await createLibriCostLedger(client).authorizeProviderCall({
					reservationId,
					executionGeneration: claim.executionGeneration,
					leaseToken: claim.leaseToken
				});
				return result.authorized;
			}),
		useCurrent: (claim, artifactId) =>
			transaction(async (client) => {
				await lock(client, claim);
				const input = await load(client, claim);
				const current = input.currentAnalysis;
				if (
					!current ||
					current.id !== artifactId ||
					current.fingerprint !== input.fingerprint ||
					!['generated', 'reviewed'].includes(current.status) ||
					Date.now() - Date.parse(current.generatedAt) >= 86400000
				)
					throw new Error('Current synthesis changed');
				await finish(client, claim, {
					message: 'Existing book synthesis is current.',
					artifactId,
					version: current.version
				});
			}),
		complete: (claim, reservationId, input, result) =>
			transaction(async (client) => {
				await lock(client, claim);
				const persisted = await client.query<{ receipt: Record<string, unknown> }>(
					`SELECT libri.persist_book_synthesis_result($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12,$13) AS receipt`,
					[
						claim.stepId,
						claim.executionGeneration,
						claim.leaseToken,
						claim.queueRowId,
						claim.processingToken,
						reservationId,
						input.fingerprint,
						JSON.stringify(input.snapshot),
						JSON.stringify(result.analysis),
						result.costMicrousd.toString(),
						result.promptTokens.toString(),
						result.completionTokens.toString(),
						result.providerRequestId
					]
				);
				const receipt = persisted.rows[0]?.receipt;
				if (
					persisted.rows.length !== 1 ||
					!receipt ||
					typeof receipt.artifactId !== 'string' ||
					receipt.bookId !== input.dataset.book.id ||
					receipt.model !== result.model
				)
					throw new Error('Invalid synthesis completion receipt');
				await finish(client, claim, receipt, result);
			})
	};
}
