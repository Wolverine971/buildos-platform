// apps/worker/tests/queueContracts.test.ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '../../..');

function readRepoFile(path: string): string {
	return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('queue SQL contracts', () => {
	it('claims lower numeric priority jobs first and assigns a processing token', () => {
		const sql = readRepoFile('packages/shared-types/src/functions/claim_pending_jobs.sql');

		expect(sql).toContain('processing_token = gen_random_uuid()');
		expect(sql).toContain('ORDER BY queue_jobs.priority ASC, queue_jobs.scheduled_for ASC');
		expect(sql).toContain('queue_jobs.processing_token');
	});

	it('guards terminal transitions by processing token', () => {
		const completeSql = readRepoFile(
			'packages/shared-types/src/functions/complete_queue_job.sql'
		);
		const failSql = readRepoFile('packages/shared-types/src/functions/fail_queue_job.sql');

		expect(completeSql).toContain('p_processing_token uuid');
		expect(completeSql).toContain(
			'AND (p_processing_token IS NULL OR processing_token = p_processing_token)'
		);
		expect(failSql).toContain('p_processing_token uuid');
		expect(failSql).toContain(
			'AND (p_processing_token IS NULL OR processing_token = p_processing_token)'
		);
	});

	it('consumes an attempt and clears ownership when recovering stalled jobs', () => {
		const sql = readRepoFile('packages/shared-types/src/functions/reset_stalled_jobs.sql');

		expect(sql).toContain('attempts = stalled_jobs.current_attempts + 1');
		expect(sql).toContain('processing_token = NULL');
	});
});

describe('SMS retry ownership', () => {
	it('does not enqueue a second retry job from inside the SMS worker catch path', () => {
		const source = readRepoFile('apps/worker/src/workers/smsWorker.ts');

		expect(source).not.toContain('sms-retry-');
		expect(source).not.toContain('Scheduled retry');
	});
});

describe('queue processor timeout', () => {
	it('enforces the configured worker timeout around job processors', () => {
		const source = readRepoFile('apps/worker/src/lib/supabaseQueue.ts');

		expect(source).toContain('queueConfig.workerTimeout');
		expect(source).toContain('Promise.race');
		expect(source).toContain('Worker timed out after');
	});
});
