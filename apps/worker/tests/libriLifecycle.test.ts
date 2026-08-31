import { describe, expect, it, vi } from 'vitest';
import type { QueryResult } from 'pg';
import { createLibriLifecycle, type LibriTransactionClient } from '../src/workers/libri/lifecycle';

const STEP_ID = '20000000-0000-4000-8000-000000000001';
const RUN_ID = '10000000-0000-4000-8000-000000000001';
const LIBRARY_ID = '30000000-0000-4000-8000-000000000001';
const USER_ID = '40000000-0000-4000-8000-000000000001';
const QUEUE_ROW_ID = '50000000-0000-4000-8000-000000000001';
const PROCESSING_TOKEN = '60000000-0000-4000-8000-000000000001';
const LEASE_TOKEN = '70000000-0000-4000-8000-000000000001';

describe('Libri transactional lifecycle', () => {
	it('atomically enqueues an existing step with an enum-typed Libri job', async () => {
		const harness = fakeTransaction((sql) => {
			if (sql.includes('FROM libri.research_steps step')) {
				return result([
					{
						step_id: STEP_ID,
						run_id: RUN_ID,
						library_id: LIBRARY_ID,
						queue_family: 'libri_maintenance',
						step_status: 'pending',
						priority: 100,
						payload_version: 1,
						max_attempts: 3,
						active_queue_job_id: null,
						run_status: 'queued',
						correlation_id: '80000000-0000-4000-8000-000000000001',
						created_by: USER_ID
					}
				]);
			}
			if (sql.includes('INSERT INTO public.queue_jobs')) {
				return result([
					{
						id: QUEUE_ROW_ID,
						queue_job_id: 'libri_maintenance_test',
						job_type: 'libri_maintenance',
						metadata: { researchStepId: STEP_ID },
						status: 'pending'
					}
				]);
			}
			if (sql.includes('UPDATE libri.research_steps')) return result([{ id: STEP_ID }]);
			return result([]);
		});
		const lifecycle = createLibriLifecycle(harness.pool);

		const receipt = await lifecycle.enqueueStep({
			stepId: STEP_ID,
			priority: 7,
			scheduledFor: new Date('2026-08-30T20:00:00.000Z')
		});

		expect(receipt).toEqual({
			queueJobId: 'libri_maintenance_test',
			queueRowId: QUEUE_ROW_ID,
			stepId: STEP_ID,
			runId: RUN_ID,
			queueType: 'libri_maintenance',
			created: true
		});
		expect(harness.statements[0]?.sql).toBe('BEGIN');
		expect(harness.statements.at(-1)?.sql).toBe('COMMIT');
		expect(harness.joinedSql()).toContain('FOR UPDATE OF step, run');
		expect(harness.joinedSql()).toContain('$3::public.queue_type');
		expect(harness.joinedSql()).toContain('ON CONFLICT (dedup_key)');
		expect(harness.release).toHaveBeenCalledOnce();
	});

	it('claims queue and domain ownership in one fenced transaction', async () => {
		const harness = fakeTransaction((sql) => {
			if (sql.includes('FROM public.queue_jobs') && sql.includes('SKIP LOCKED')) {
				return result([
					{
						id: QUEUE_ROW_ID,
						queue_job_id: 'libri_maintenance_test',
						job_type: 'libri_maintenance',
						metadata: { researchStepId: STEP_ID },
						status: 'pending',
						processing_token: null
					}
				]);
			}
			if (sql.includes('FROM libri.research_steps step')) {
				return result([
					{
						step_id: STEP_ID,
						run_id: RUN_ID,
						library_id: LIBRARY_ID,
						queue_family: 'libri_maintenance',
						step_status: 'queued',
						active_queue_job_id: QUEUE_ROW_ID,
						attempts: 0,
						max_attempts: 3,
						payload: { canary: true },
						run_status: 'queued',
						cancel_requested_at: null
					}
				]);
			}
			if (sql.includes('UPDATE public.queue_jobs')) return result([{ id: QUEUE_ROW_ID }]);
			if (sql.includes('UPDATE libri.research_steps')) {
				return result([{ execution_generation: 1 }]);
			}
			return result([]);
		});
		const lifecycle = createLibriLifecycle(harness.pool);

		const receipt = await lifecycle.claimNextStep({
			workerId: 'libri-worker:test',
			leaseDurationMs: 60_000,
			queueTypes: ['libri_maintenance'],
			stepIds: [STEP_ID]
		});

		expect(receipt).toMatchObject({
			kind: 'claimed',
			queueRowId: QUEUE_ROW_ID,
			stepId: STEP_ID,
			runId: RUN_ID,
			libraryId: LIBRARY_ID,
			queueType: 'libri_maintenance',
			executionGeneration: 1,
			payload: { canary: true }
		});
		expect(harness.joinedSql()).toContain('job_type = ANY($1::public.queue_type[])');
		expect(
			harness.statements.find((statement) => statement.sql.includes('SKIP LOCKED'))
				?.values?.[0]
		).toEqual(['libri_maintenance']);
		expect(
			harness.statements.find((statement) => statement.sql.includes('SKIP LOCKED'))
				?.values?.[1]
		).toEqual([STEP_ID]);
		expect(harness.joinedSql()).toContain("metadata->>'researchStepId' = ANY($2::text[])");
		expect(harness.joinedSql()).toContain('FOR UPDATE SKIP LOCKED');
		expect(harness.joinedSql()).toContain('execution_generation = execution_generation + 1');
		expect(harness.statements.at(-1)?.sql).toBe('COMMIT');
	});

	it('quarantines malformed Libri queue metadata instead of poisoning every poll', async () => {
		const harness = fakeTransaction((sql) => {
			if (sql.includes('FROM public.queue_jobs') && sql.includes('SKIP LOCKED')) {
				return result([
					{
						id: QUEUE_ROW_ID,
						queue_job_id: 'libri_maintenance_bad',
						job_type: 'libri_maintenance',
						metadata: {},
						status: 'pending'
					}
				]);
			}
			return result([]);
		});
		const lifecycle = createLibriLifecycle(harness.pool);

		await expect(
			lifecycle.claimNextStep({ workerId: 'libri-worker:test', leaseDurationMs: 60_000 })
		).resolves.toEqual({
			kind: 'quarantined',
			queueJobId: 'libri_maintenance_bad',
			queueRowId: QUEUE_ROW_ID,
			reason: 'libri_queue_metadata_invalid'
		});
		expect(harness.joinedSql()).toContain("status = 'failed'");
		expect(harness.joinedSql()).not.toContain('UPDATE libri.research_steps');
	});

	it('rejects a stale heartbeat without changing either lease owner', async () => {
		const harness = fakeTransaction((sql) => {
			if (sql.includes('FROM public.queue_jobs') && sql.includes('processing_token')) {
				return result([]);
			}
			return result([]);
		});
		const lifecycle = createLibriLifecycle(harness.pool);

		await expect(
			lifecycle.heartbeatStep({
				queueRowId: QUEUE_ROW_ID,
				stepId: STEP_ID,
				processingToken: PROCESSING_TOKEN,
				leaseToken: LEASE_TOKEN,
				executionGeneration: 1,
				workerId: 'libri-worker:test',
				leaseDurationMs: 60_000
			})
		).resolves.toBe(false);
		expect(harness.joinedSql()).not.toContain('UPDATE libri.research_steps');
		expect(harness.statements.at(-1)?.sql).toBe('COMMIT');
	});

	it('completes queue, step, and run while holding both ownership fences', async () => {
		const harness = fakeTransaction((sql) => {
			if (sql.includes('FROM public.queue_jobs') && sql.includes('FOR UPDATE')) {
				return result([{ id: QUEUE_ROW_ID }]);
			}
			if (sql.includes('FROM libri.research_steps') && sql.includes('FOR UPDATE')) {
				return result([{ run_id: RUN_ID }]);
			}
			if (sql.includes('FROM libri.research_runs') && sql.includes('FOR UPDATE')) {
				return result([{ cancel_requested_at: null }]);
			}
			if (sql.includes('UPDATE public.queue_jobs')) return result([{ id: QUEUE_ROW_ID }]);
			if (sql.includes('UPDATE libri.research_steps')) return result([{ id: STEP_ID }]);
			if (sql.includes('count(*)::text')) return result([{ remaining_steps: '0' }]);
			return result([]);
		});
		const lifecycle = createLibriLifecycle(harness.pool);

		await expect(
			lifecycle.completeStep({
				queueRowId: QUEUE_ROW_ID,
				stepId: STEP_ID,
				processingToken: PROCESSING_TOKEN,
				leaseToken: LEASE_TOKEN,
				executionGeneration: 1,
				result: { canary: 'passed' },
				promptTokens: 0,
				completionTokens: 0,
				estimatedCostMicrousd: 0
			})
		).resolves.toBe(true);
		expect(harness.joinedSql()).toContain("status = 'completed'");
		expect(harness.joinedSql()).toContain('active_processing_token = NULL');
		expect(harness.joinedSql()).toContain('completed_steps = completed_steps + 1');
		expect(harness.statements.at(-1)?.sql).toBe('COMMIT');
	});

	it('rolls back the whole lifecycle transaction on any write failure', async () => {
		const harness = fakeTransaction((sql) => {
			if (sql.includes('FROM libri.research_steps step')) {
				return result([
					{
						step_id: STEP_ID,
						run_id: RUN_ID,
						library_id: LIBRARY_ID,
						queue_family: 'libri_maintenance',
						step_status: 'pending',
						priority: 100,
						payload_version: 1,
						max_attempts: 3,
						active_queue_job_id: null,
						run_status: 'queued',
						correlation_id: '80000000-0000-4000-8000-000000000001',
						created_by: USER_ID
					}
				]);
			}
			if (sql.includes('INSERT INTO public.queue_jobs')) throw new Error('write failed');
			return result([]);
		});
		const lifecycle = createLibriLifecycle(harness.pool);

		await expect(lifecycle.enqueueStep({ stepId: STEP_ID })).rejects.toThrow('write failed');
		expect(harness.statements.at(-1)?.sql).toBe('ROLLBACK');
		expect(harness.release).toHaveBeenCalledOnce();
	});

	it('validates all fence and lease inputs before taking a database connection', async () => {
		const harness = fakeTransaction(() => result([]));
		const lifecycle = createLibriLifecycle(harness.pool);

		expect(() => lifecycle.claimNextStep({ workerId: '', leaseDurationMs: 60_000 })).toThrow(
			'workerId'
		);
		expect(() =>
			lifecycle.claimNextStep({
				workerId: 'worker',
				leaseDurationMs: 60_000,
				queueTypes: []
			})
		).toThrow('queueTypes');
		expect(() =>
			lifecycle.claimNextStep({
				workerId: 'worker',
				leaseDurationMs: 60_000,
				stepIds: []
			})
		).toThrow('stepIds');
		expect(() =>
			lifecycle.claimNextStep({
				workerId: 'worker',
				leaseDurationMs: 60_000,
				stepIds: [STEP_ID, STEP_ID]
			})
		).toThrow('stepIds');
		expect(() =>
			lifecycle.claimNextStep({
				workerId: 'worker',
				leaseDurationMs: 60_000,
				stepIds: ['not-a-uuid']
			})
		).toThrow('stepId');
		expect(() =>
			lifecycle.claimNextStep({
				workerId: 'worker',
				leaseDurationMs: 60_000,
				queueTypes: ['libri_maintenance', 'libri_maintenance']
			})
		).toThrow('queueTypes');
		expect(() =>
			lifecycle.heartbeatStep({
				queueRowId: 'not-a-uuid',
				stepId: STEP_ID,
				processingToken: PROCESSING_TOKEN,
				leaseToken: LEASE_TOKEN,
				executionGeneration: 1,
				workerId: 'worker',
				leaseDurationMs: 60_000
			})
		).toThrow('queueRowId');
		expect(harness.connect).not.toHaveBeenCalled();
	});
});

function fakeTransaction(
	handler: (
		sql: string,
		values: readonly unknown[] | undefined
	) => QueryResult<Record<string, unknown>>
) {
	const statements: Array<{ sql: string; values: readonly unknown[] | undefined }> = [];
	const release = vi.fn();
	const client: LibriTransactionClient = {
		async query<T extends Record<string, unknown> = Record<string, unknown>>(
			text: string,
			values?: readonly unknown[]
		): Promise<QueryResult<T>> {
			const sql = text.replace(/\s+/g, ' ').trim();
			statements.push({ sql, values });
			return handler(sql, values) as QueryResult<T>;
		},
		release
	};
	const connect = vi.fn(async () => client);
	return {
		pool: { connect },
		connect,
		release,
		statements,
		joinedSql: () => statements.map((statement) => statement.sql).join('\n')
	};
}

function result<T extends Record<string, unknown>>(
	rows: T[],
	rowCount: number = rows.length
): QueryResult<T> {
	return {
		command: '',
		rowCount,
		oid: 0,
		fields: [],
		rows
	};
}
