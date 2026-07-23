// apps/worker/tests/agentRunFencing.test.ts
// Source contracts for Agent Run execution fencing (2026-07-23 audit P1).
// These lock in the shape of the fix: claims CAS on execution_generation,
// critical transitions are generation-predicated, and the chat completion
// injection is idempotent under finalize retries.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
	resolve(__dirname, '../src/workers/agent-run/agentRunWorker.ts'),
	'utf8'
);

describe('agent run execution fencing', () => {
	it('claims runs via compare-and-swap on execution_generation', () => {
		expect(source).toContain('execution_generation: executionGeneration');
		expect(source).toContain(".eq('execution_generation', previousGeneration)");
		// The claim still guards on prior status too
		expect(source).toContain(".eq('status', initialRun.status)");
	});

	it('predicates critical run updates on the claiming generation', () => {
		expect(source).toContain('const fencedRunUpdate = async (');
		expect(source).toContain(".eq('execution_generation', executionGeneration)");
	});

	it('finalize and pause both go through the fenced writer', () => {
		expect(source).toContain('await fencedRunUpdate(');
		expect(source).toContain('`finalize as ${finalStatus}`');
		expect(source).toContain("'pause'");
	});

	it('a fenced-out finalize reports superseded instead of overwriting', () => {
		expect(source).toContain("status: 'superseded' as const");
		expect(source).toContain('Finalize skipped: superseded by a newer executor');
	});

	it('chat completion injection is idempotent under finalize retries', () => {
		expect(source).toContain('agent-run:${run.id}:completion');
		expect(source).toContain(".contains('metadata', { idempotency_key: idempotencyKey })");
		expect(source).toContain("error.code !== '23505'");
	});

	it('the executor aborts on infrastructure cancellation at loop boundaries', () => {
		expect(source).toContain('job.signal?.aborted');
		expect(source).toContain('signal: job.signal');
	});
});

describe('fencing migration exists', () => {
	it('adds execution_generation to agent_runs', () => {
		const migration = readFileSync(
			resolve(
				__dirname,
				'../../../supabase/migrations/20260723020000_agent_run_execution_fencing.sql'
			),
			'utf8'
		);
		expect(migration).toContain('ADD COLUMN IF NOT EXISTS execution_generation');
	});
});
