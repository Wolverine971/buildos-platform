// apps/worker/tests/queueContracts.test.ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateAgentRunMetadata, validateJobMetadata } from '@buildos/shared-types';

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

describe('agent_run worker budget behavior', () => {
	it('allows a final submit_result turn after the tool-call budget is reached', () => {
		const source = readRepoFile('apps/worker/src/workers/agent-run/agentRunWorker.ts');

		expect(source).toContain('TOOL CALL BUDGET EXHAUSTED');
		expect(source).toContain('forceSubmitResult: toolCallBudgetReached()');
		expect(source).toContain("return finalizeBudgetExhausted('tool-call budget exhausted')");
	});
});

describe('agent_run worker steering boundary', () => {
	it('checks for newly-arrived control signals after an LLM turn before acting on it', () => {
		const source = readRepoFile('apps/worker/src/workers/agent-run/agentRunWorker.ts');

		expect(source).toContain('const postTurnSignalDrain = await drainControlSignals();');
		expect(source).toContain("if (postTurnSignalDrain.kind === 'return')");
		expect(source).toContain("if (postTurnSignalDrain.kind === 'steered')");
	});
});

// Agent Work (Phase 0.5): the agent_run job payload contract. Exercises the shared
// validator directly — independent of `gen:types` adding 'agent_run' to QueueJobType.
describe('agent_run job metadata contract', () => {
	const RUN_ID = '11111111-1111-4111-8111-111111111111';
	const PROJECT_ID = '22222222-2222-4222-8222-222222222222';

	it('accepts a manual read-only run payload', () => {
		const meta = validateAgentRunMetadata({
			run_id: RUN_ID,
			trigger: 'manual',
			context_type: 'global',
			scope_mode: 'read_only'
		});

		expect(meta.run_id).toBe(RUN_ID);
		expect(meta.scope_mode).toBe('read_only');
	});

	it('requires a project_id for project-context runs', () => {
		expect(() =>
			validateAgentRunMetadata({
				run_id: RUN_ID,
				trigger: 'chat',
				context_type: 'project'
			})
		).toThrow();

		const meta = validateAgentRunMetadata({
			run_id: RUN_ID,
			trigger: 'chat',
			context_type: 'project',
			project_id: PROJECT_ID,
			scope_mode: 'read_write'
		});
		expect(meta.project_id).toBe(PROJECT_ID);
	});

	it('rejects review on a read-only run (nothing to stage)', () => {
		expect(() =>
			validateAgentRunMetadata({
				run_id: RUN_ID,
				trigger: 'scheduled',
				context_type: 'global',
				scope_mode: 'read_only',
				review_required: true
			})
		).toThrow();
	});

	it('rejects an invalid trigger and a too-deep run', () => {
		expect(() =>
			validateAgentRunMetadata({ run_id: RUN_ID, trigger: 'nope', context_type: 'global' })
		).toThrow();

		expect(() =>
			validateAgentRunMetadata({
				run_id: RUN_ID,
				trigger: 'chat',
				context_type: 'global',
				depth: 2
			})
		).toThrow();
	});

	it('rejects malformed allowed ops and budgets', () => {
		expect(() =>
			validateAgentRunMetadata({
				run_id: RUN_ID,
				trigger: 'manual',
				context_type: 'global',
				allowed_ops: ['onto.project.list', 42]
			})
		).toThrow();

		expect(() =>
			validateAgentRunMetadata({
				run_id: RUN_ID,
				trigger: 'manual',
				context_type: 'global',
				budgets: { max_tokens: -1 }
			})
		).toThrow();

		expect(() =>
			validateAgentRunMetadata({
				run_id: RUN_ID,
				trigger: 'manual',
				context_type: 'global',
				budgets: { max_tool_calls: 1.5 }
			})
		).toThrow();

		const meta = validateAgentRunMetadata({
			run_id: RUN_ID,
			trigger: 'manual',
			context_type: 'global',
			allowed_ops: ['onto.project.list'],
			budgets: { wall_clock_ms: 1000, max_tokens: 2000, max_tool_calls: 3 }
		});
		expect(meta.budgets?.max_tool_calls).toBe(3);
	});

	it('accepts valid continuation markers and rejects invalid ones', () => {
		const meta = validateAgentRunMetadata({
			run_id: RUN_ID,
			trigger: 'chat',
			context_type: 'project',
			project_id: PROJECT_ID,
			scope_mode: 'read_only',
			continuation_from: 'needs_input'
		});
		expect(meta.continuation_from).toBe('needs_input');

		expect(() =>
			validateAgentRunMetadata({
				run_id: RUN_ID,
				trigger: 'chat',
				context_type: 'global',
				continuation_from: 'completed'
			})
		).toThrow();
	});

	it('routes through the generic validateJobMetadata dispatcher', () => {
		const meta = validateJobMetadata('agent_run', {
			run_id: RUN_ID,
			trigger: 'manual',
			context_type: 'global',
			scope_mode: 'read_only'
		});
		expect(meta.run_id).toBe(RUN_ID);
	});
});
