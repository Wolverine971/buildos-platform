// apps/worker/tests/integration/agentRunStrandedSweep.test.ts
//
// Drives the REAL runAgentRunStrandedSweep control flow against a disposable
// local PostgreSQL cluster with the production migrations applied, through a
// psql-backed StrandedSweepStore. This exercises the actual DB primitives the
// sweep relies on (add_queue_job dedup, queue_deep_research_synthesis guard, the
// conditional terminal transitions) instead of a hand-rolled mock.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runAgentRunStrandedSweep } from '../../src/workers/agent-run/agentRunStrandedSweep';
import type {
	StrandedChildRow,
	StrandedParentRow,
	StrandedRunRow,
	StrandedSweepStore
} from '../../src/workers/agent-run/agentRunStrandedSweep';

function hasCommand(command: string): boolean {
	return spawnSync(command, ['--version'], { stdio: 'ignore' }).status === 0;
}

async function availablePort(): Promise<number> {
	return await new Promise((resolvePort, reject) => {
		const server = createServer();
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			if (!address || typeof address === 'string') {
				server.close();
				reject(new Error('Could not allocate a PostgreSQL test port.'));
				return;
			}
			const { port } = address;
			server.close((error) => (error ? reject(error) : resolvePort(port)));
		});
	});
}

const postgresAvailable = hasCommand('initdb') && hasCommand('pg_ctl') && hasCommand('psql');
const describePostgres = postgresAvailable ? describe : describe.skip;

const NOW = new Date('2026-07-20T12:00:00.000Z');
const GRACE_MS = 600_000; // 2 × default stalledTimeout
const USER_ID = '90000000-0000-4000-8000-000000000001';

function minutesAgo(mins: number): string {
	return new Date(NOW.getTime() - mins * 60_000).toISOString();
}

describePostgres('agent run stranded sweep (integration)', () => {
	let tempDir = '';
	let dataDir = '';
	let socketDir = '';
	let port = 0;

	const psql = (sql: string): string =>
		execFileSync(
			'psql',
			[
				'-h',
				socketDir,
				'-p',
				String(port),
				'-d',
				'postgres',
				'-v',
				'ON_ERROR_STOP=1',
				'-At',
				'-c',
				sql
			],
			{ encoding: 'utf8' }
		).trim();

	const psqlJson = <T>(sql: string): T => JSON.parse(psql(sql)) as T;

	const applyMigration = (filename: string): void => {
		execFileSync(
			'psql',
			[
				'-h',
				socketDir,
				'-p',
				String(port),
				'-d',
				'postgres',
				'-v',
				'ON_ERROR_STOP=1',
				'-f',
				resolve(process.cwd(), '../../supabase/migrations', filename)
			],
			{ stdio: 'pipe' }
		);
	};

	// A psql-backed implementation of the sweep's data-access port. Mirrors the
	// production supabase store 1:1 in raw SQL so the real control flow runs here.
	const sqlArray = (values: string[]): string =>
		`ARRAY[${values.map((value) => `'${value}'`).join(',')}]`;

	const store: StrandedSweepStore = {
		async listStrandedCandidates({ statuses, updatedBefore, limit }) {
			return psqlJson<StrandedRunRow[]>(`
				SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)::text
				FROM (
					SELECT id, user_id, status, run_template, depth, parent_run_id,
						started_at, updated_at, budgets, orchestration_state, trigger,
						context_type, project_id, scope_mode, effort, allowed_ops,
						review_required
					FROM public.agent_runs
					WHERE status::text = ANY(${sqlArray(statuses)})
						AND updated_at < '${updatedBefore}'
					ORDER BY updated_at ASC
					LIMIT ${limit}
				) t
			`);
		},
		async listActiveDedupKeys(userId, dedupKeys) {
			if (dedupKeys.length === 0) return [];
			return psqlJson<string[]>(`
				SELECT COALESCE(json_agg(dedup_key), '[]'::json)::text
				FROM public.queue_jobs
				WHERE user_id = '${userId}'
					AND job_type = 'agent_run'
					AND status IN ('pending', 'processing')
					AND dedup_key = ANY(${sqlArray(dedupKeys)})
			`);
		},
		async loadParent(parentRunId) {
			const rows = psqlJson<StrandedParentRow[]>(`
				SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)::text
				FROM (
					SELECT status, completed_at FROM public.agent_runs WHERE id = '${parentRunId}'
				) t
			`);
			return rows[0] ?? null;
		},
		async loadChildren(parentRunId) {
			return psqlJson<StrandedChildRow[]>(`
				SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)::text
				FROM (
					SELECT id, status FROM public.agent_runs WHERE parent_run_id = '${parentRunId}'
				) t
			`);
		},
		async enqueueContinuation(userId, metadata, dedupKey) {
			try {
				psql(`
					SELECT public.add_queue_job(
						'${userId}', 'agent_run', '${JSON.stringify(metadata)}'::jsonb,
						7, NOW(), '${dedupKey}'
					)
				`);
				return {};
			} catch (error) {
				return { errorMessage: error instanceof Error ? error.message : String(error) };
			}
		},
		async wakeSynthesis(parentRunId) {
			try {
				const jobId = psql(
					`SELECT COALESCE(public.queue_deep_research_synthesis('${parentRunId}')::text, '')`
				);
				return { jobId: jobId ? jobId : null };
			} catch (error) {
				return {
					jobId: null,
					errorMessage: error instanceof Error ? error.message : String(error)
				};
			}
		},
		async finalizeRun({ runId, expectedStatuses, expectedUpdatedAt, status, error }) {
			const count = psql(`
				WITH updated AS (
					UPDATE public.agent_runs
					SET status = '${status}'::agent_run_status,
						error = '${error}',
						completed_at = NOW()
					WHERE id = '${runId}'
						AND updated_at = '${expectedUpdatedAt}'
						AND status::text = ANY(${sqlArray(expectedStatuses)})
					RETURNING id
				)
				SELECT COUNT(*) FROM updated
			`);
			return Number(count) > 0;
		},
		async ensureCancelSignal(runId) {
			psql(`
				INSERT INTO public.agent_run_signals (run_id, kind, source)
				SELECT '${runId}', 'cancel', 'system'
				WHERE NOT EXISTS (
					SELECT 1 FROM public.agent_run_signals
					WHERE run_id = '${runId}' AND kind = 'cancel' AND consumed_at IS NULL
				)
			`);
		}
	};

	const sweep = () => runAgentRunStrandedSweep({ store, now: () => NOW, graceMs: GRACE_MS });

	const insertRoot = (
		id: string,
		stage: 'dispatching' | 'researching' | 'synthesizing',
		childIds: string[],
		options: { status?: string; startedMinsAgo?: number; updatedMinsAgo?: number } = {}
	): void => {
		psql(`
			INSERT INTO public.agent_runs (
				id, user_id, trigger, label, goal, context_type, scope_mode,
				status, depth, effort, run_template, orchestration_state, budgets,
				started_at, updated_at
			) VALUES (
				'${id}', '${USER_ID}', 'chat', 'Root', 'Research safely', 'global',
				'read_only', '${options.status ?? 'running'}', 0, 'deep', 'deep_research',
				'{"version":1,"stage":"${stage}","child_run_ids":${JSON.stringify(childIds)}}',
				'{"max_cost_usd":0.5,"max_tool_calls":10,"max_tokens":60000,"wall_clock_ms":600000}',
				'${minutesAgo(options.startedMinsAgo ?? 5)}',
				'${minutesAgo(options.updatedMinsAgo ?? 15)}'
			)
		`);
	};

	const insertChild = (id: string, parentId: string): void => {
		psql(`
			INSERT INTO public.agent_runs (
				id, user_id, trigger, parent_run_id, depth, label, goal, context_type,
				scope_mode, effort, run_template, allowed_ops, review_required, status,
				orchestration_state, budgets
			) VALUES (
				'${id}', '${USER_ID}', 'chat', '${parentId}', 1, 'Child', 'Find evidence',
				'global', 'read_only', 'standard', 'agent',
				ARRAY['util.web.search', 'util.web.visit'], FALSE, 'queued', '{}',
				'{"max_cost_usd":0.15,"max_tool_calls":5,"max_tokens":20000,"wall_clock_ms":300000}'
			)
		`);
	};

	const settleChild = (id: string, status: string): void => {
		// Disable the wake triggers so settling a child during setup does not itself
		// queue synthesis — that reproduces the strand the sweep must recover.
		psql(
			`ALTER TABLE public.agent_runs DISABLE TRIGGER trg_agent_run_wake_deep_research_parent`
		);
		psql(
			`ALTER TABLE public.agent_runs DISABLE TRIGGER trg_agent_run_wake_deep_research_on_researching`
		);
		psql(`UPDATE public.agent_runs SET status = '${status}' WHERE id = '${id}'`);
		psql(
			`ALTER TABLE public.agent_runs ENABLE TRIGGER trg_agent_run_wake_deep_research_parent`
		);
		psql(
			`ALTER TABLE public.agent_runs ENABLE TRIGGER trg_agent_run_wake_deep_research_on_researching`
		);
	};

	beforeAll(async () => {
		tempDir = mkdtempSync(join(tmpdir(), 'buildos-stranded-sweep-pg-'));
		dataDir = join(tempDir, 'data');
		socketDir = join(tempDir, 'socket');
		port = await availablePort();

		execFileSync('mkdir', ['-p', socketDir]);
		execFileSync('initdb', ['-D', dataDir, '--no-locale', '--encoding=UTF8'], {
			stdio: 'pipe'
		});
		execFileSync(
			'pg_ctl',
			[
				'-D',
				dataDir,
				'-l',
				join(tempDir, 'postgres.log'),
				'-o',
				`-p ${port} -k ${socketDir}`,
				'start'
			],
			{ stdio: 'pipe' }
		);

		const baseSchema = readFileSync(
			resolve(process.cwd(), 'tests/integration/fixtures/deep-research-base.sql'),
			'utf8'
		);
		psql(baseSchema);
		applyMigration('20260719010000_agent_run_effort.sql');
		applyMigration('20260719020000_deep_research_orchestration.sql');
		applyMigration('20260719030000_agent_run_cost_ledger.sql');
		applyMigration('20260719040000_agent_run_cost_reconciliation.sql');
		applyMigration('20260719050000_agent_run_cost_rpc_privileges.sql');
		applyMigration('20260720010000_deep_research_hardening.sql');

		// agent_run_signals is not part of the deep-research fixture; add the minimal
		// shape the cancel-signal mechanism uses.
		psql(
			`CREATE TYPE public.agent_run_signal_kind AS ENUM ('steer', 'pause', 'resume', 'cancel')`
		);
		psql(`
			CREATE TABLE public.agent_run_signals (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				run_id UUID NOT NULL,
				kind public.agent_run_signal_kind NOT NULL,
				source TEXT NOT NULL,
				payload JSONB NULL,
				consumed_at TIMESTAMPTZ NULL,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			)
		`);
	}, 60_000);

	afterAll(() => {
		if (dataDir) {
			spawnSync('pg_ctl', ['-D', dataDir, 'stop', '-m', 'fast'], { stdio: 'ignore' });
		}
		if (tempDir) rmSync(tempDir, { recursive: true, force: true });
	});

	beforeEach(() => {
		psql('TRUNCATE public.queue_jobs, public.agent_runs, public.agent_run_signals CASCADE');
	});

	it('wakes synthesis for a researching root whose children have all settled', async () => {
		const rootId = '10000000-0000-4000-8000-000000000001';
		const childOne = '20000000-0000-4000-8000-000000000001';
		const childTwo = '20000000-0000-4000-8000-000000000002';
		insertRoot(rootId, 'researching', [childOne, childTwo]);
		insertChild(childOne, rootId);
		insertChild(childTwo, rootId);
		settleChild(childOne, 'completed');
		settleChild(childTwo, 'partial');

		// Precondition: stranded — settled children, still 'researching', no job.
		expect(
			psql(`SELECT orchestration_state->>'stage' FROM public.agent_runs WHERE id='${rootId}'`)
		).toBe('researching');
		expect(psql('SELECT COUNT(*) FROM public.queue_jobs')).toBe('0');

		const summary = await sweep();

		expect(summary.synthesisWoken).toBe(1);
		expect(summary.errors).toBe(0);
		expect(
			psql(`SELECT orchestration_state->>'stage' FROM public.agent_runs WHERE id='${rootId}'`)
		).toBe('synthesis_queued');
		expect(psql('SELECT COUNT(*) FROM public.queue_jobs')).toBe('1');
		expect(psql(`SELECT dedup_key FROM public.queue_jobs LIMIT 1`)).toBe(
			`agent-run:${rootId}:synthesis`
		);
		expect(psql(`SELECT metadata->>'continuation_from' FROM public.queue_jobs LIMIT 1`)).toBe(
			'children'
		);
	});

	it('re-enqueues a jobless within-deadline run exactly once even when called twice', async () => {
		const runId = '10000000-0000-4000-8000-000000000010';
		psql(`
			INSERT INTO public.agent_runs (
				id, user_id, trigger, label, goal, context_type, scope_mode, status,
				depth, effort, run_template, orchestration_state, budgets, updated_at
			) VALUES (
				'${runId}', '${USER_ID}', 'chat', 'Standard', 'Do the thing', 'global',
				'read_only', 'queued', 0, 'standard', 'agent', '{}',
				'{"max_cost_usd":0.3,"wall_clock_ms":600000}', '${minutesAgo(15)}'
			)
		`);

		const first = await sweep();
		const second = await sweep();

		expect(first.requeuedContinuations).toBe(1);
		expect(second.requeuedContinuations).toBe(0);
		expect(psql('SELECT COUNT(*) FROM public.queue_jobs')).toBe('1');
		expect(psql(`SELECT dedup_key FROM public.queue_jobs LIMIT 1`)).toBe(`agent-run:${runId}`);
		expect(psql(`SELECT metadata->>'run_id' FROM public.queue_jobs LIMIT 1`)).toBe(runId);
	});

	it('cancels the non-terminal children of a terminal parent', async () => {
		const rootId = '10000000-0000-4000-8000-000000000020';
		const childOne = '20000000-0000-4000-8000-000000000021';
		const childTwo = '20000000-0000-4000-8000-000000000022';
		insertRoot(rootId, 'researching', [childOne, childTwo]);
		insertChild(childOne, rootId);
		insertChild(childTwo, rootId);
		// Parent terminal well past grace; children stranded non-terminal + stale.
		psql(
			`UPDATE public.agent_runs SET status='failed', completed_at='${minutesAgo(20)}' WHERE id='${rootId}'`
		);
		psql(
			`UPDATE public.agent_runs SET updated_at='${minutesAgo(15)}' WHERE parent_run_id='${rootId}'`
		);

		const summary = await sweep();

		expect(summary.childrenCancelled).toBe(2);
		expect(summary.errors).toBe(0);
		expect(
			psql(
				`SELECT COUNT(*) FROM public.agent_runs WHERE parent_run_id='${rootId}' AND status='cancelled'`
			)
		).toBe('2');
		expect(psql(`SELECT COUNT(*) FROM public.agent_run_signals WHERE kind='cancel'`)).toBe('2');
	});

	it('does NOT touch a run that still has a live queue job', async () => {
		const runId = '10000000-0000-4000-8000-000000000030';
		psql(`
			INSERT INTO public.agent_runs (
				id, user_id, trigger, label, goal, context_type, scope_mode, status,
				depth, effort, run_template, orchestration_state, budgets, started_at, updated_at
			) VALUES (
				'${runId}', '${USER_ID}', 'chat', 'Running', 'Do the thing', 'global',
				'read_only', 'running', 0, 'standard', 'agent', '{}',
				'{"max_cost_usd":0.3,"wall_clock_ms":600000}', '${minutesAgo(20)}', '${minutesAgo(15)}'
			)
		`);
		// A live continuation job exists — a worker is (or will be) driving it.
		psql(`
			INSERT INTO public.queue_jobs (user_id, job_type, metadata, priority, scheduled_for, dedup_key, status)
			VALUES ('${USER_ID}', 'agent_run', '{}'::jsonb, 7, NOW(), 'agent-run:${runId}', 'pending')
		`);

		const summary = await sweep();

		expect(summary).toMatchObject({
			scanned: 1,
			requeuedContinuations: 0,
			finalizedFailed: 0,
			finalizedPartial: 0,
			errors: 0
		});
		expect(psql(`SELECT status FROM public.agent_runs WHERE id='${runId}'`)).toBe('running');
		expect(psql('SELECT COUNT(*) FROM public.queue_jobs')).toBe('1');
	});
});
