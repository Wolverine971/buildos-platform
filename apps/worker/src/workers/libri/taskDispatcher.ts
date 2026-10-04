import type { QueryResult } from 'pg';
import type { LibriLifecyclePort } from './lifecycle';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type QueryPort = {
	query: <T extends Record<string, unknown> = Record<string, unknown>>(
		text: string,
		values?: readonly unknown[]
	) => Promise<QueryResult<T>>;
};
type Batch = { batch_id: string; library_id: string; step_ids: string[] };
const DISPATCHABLE = new Set(['pending', 'retry_wait', 'queued']);
const ALREADY_CONSUMED = new Set([
	'leased',
	'completed',
	'failed',
	'cancelled',
	'skipped',
	'needs_review',
	'dead_letter'
]);

/** Drains the durable admission outbox without calling any providers. Enqueue is
 * atomic/idempotent in the existing lifecycle; uncertain replies are reconciled
 * through stored step state, never by inventing successful queue receipts. */
export function createLibriTaskDispatcher(
	database: QueryPort,
	lifecycle: Pick<LibriLifecyclePort, 'enqueueStep'>
) {
	return {
		async dispatchPending(
			signal: AbortSignal,
			limit = 5
		): Promise<{ batches: number; steps: number }> {
			if (!Number.isInteger(limit) || limit < 1 || limit > 20)
				throw new Error('Use 1 to 20 task batches');
			signal.throwIfAborted();
			await database.query('SELECT libri.reconcile_pending_research_tasks($1)', [30]);
			signal.throwIfAborted();
			const selected = await database.query<Batch>(
				'SELECT * FROM libri.pending_research_task_batches($1)',
				[limit]
			);
			if (selected.rows.length > limit)
				throw new Error('Task dispatch exceeded its batch bound');
			const identities = new Set<string>();
			// Validate the entire read before the first queue write.
			for (const batch of selected.rows) {
				if (
					!UUID.test(batch.batch_id) ||
					!UUID.test(batch.library_id) ||
					identities.has(batch.batch_id) ||
					!Array.isArray(batch.step_ids) ||
					batch.step_ids.length < 1 ||
					batch.step_ids.length > 30 ||
					new Set(batch.step_ids).size !== batch.step_ids.length ||
					batch.step_ids.some((id) => !UUID.test(id))
				)
					throw new Error('Invalid task dispatch manifest');
				identities.add(batch.batch_id);
			}
			let batches = 0,
				steps = 0;
			for (const batch of selected.rows) {
				for (const stepId of batch.step_ids) {
					signal.throwIfAborted();
					const status = await state(batch, stepId);
					if (DISPATCHABLE.has(status)) {
						try {
							const receipt = await lifecycle.enqueueStep({ stepId });
							if (
								receipt.stepId !== stepId ||
								receipt.runId !== batch.batch_id ||
								receipt.queueType !== 'libri_research' ||
								!UUID.test(receipt.queueRowId) ||
								!receipt.queueJobId.startsWith('libri_research_') ||
								!UUID.test(receipt.queueJobId.slice('libri_research_'.length))
							)
								throw new Error('Task enqueue returned an inconsistent receipt');
						} catch (cause) {
							// Another dispatcher/consumer may have already advanced the same step.
							// Final acknowledgement independently checks actual shared-queue evidence.
							signal.throwIfAborted();
							const saved = await state(batch, stepId);
							if (saved !== 'queued' && !ALREADY_CONSUMED.has(saved)) throw cause;
						}
					} else if (!ALREADY_CONSUMED.has(status))
						throw new Error('Unexpected task step state');
					steps += 1;
				}
				signal.throwIfAborted();
				const receipt = await database.query<{ accepted: boolean }>(
					'SELECT libri.acknowledge_research_task_dispatch($1) AS accepted',
					[batch.batch_id]
				);
				if (receipt.rows.length !== 1 || receipt.rows[0].accepted !== true)
					throw new Error(
						'Task dispatch could not be confirmed from durable queue evidence'
					);
				batches += 1;
			}
			return { batches, steps };
		}
	};
	async function state(batch: Batch, stepId: string): Promise<string> {
		const result = await database.query<{ status: string }>(
			`SELECT step.status FROM libri.research_steps step
    JOIN libri.research_task_batch_items item ON item.library_id=step.library_id AND item.batch_id=step.run_id AND item.step_id=step.id
    WHERE step.library_id=$1 AND step.run_id=$2 AND step.id=$3 AND step.kind='task_execute' AND step.queue_family='libri_research'`,
			[batch.library_id, batch.batch_id, stepId]
		);
		if (result.rows.length !== 1 || typeof result.rows[0].status !== 'string')
			throw new Error('Task dispatch step is missing or outside the batch');
		return result.rows[0].status;
	}
}
