// apps/worker/tests/integration/deepResearchMigration.test.ts
import { execFile, execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

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

describePostgres('deep research PostgreSQL guardrails', () => {
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

	const psqlAsync = (sql: string): Promise<string> =>
		new Promise((resolveSql, rejectSql) => {
			execFile(
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
				{ encoding: 'utf8' },
				(error, stdout) => {
					if (error) {
						rejectSql(error);
						return;
					}
					resolveSql(stdout.trim());
				}
			);
		});

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

	const insertRoot = (
		id: string,
		stage: 'dispatching' | 'researching',
		childIds: string[] = [],
		budgets: Record<string, number | string> = {
			max_cost_usd: 0.5,
			max_tool_calls: 10,
			max_tokens: 60_000,
			wall_clock_ms: 600_000
		}
	): void => {
		psql(`
			INSERT INTO public.agent_runs (
				id, user_id, trigger, label, goal, context_type, scope_mode,
				status, depth, effort, run_template, orchestration_state, budgets
			) VALUES (
				'${id}', '90000000-0000-4000-8000-000000000001', 'chat',
				'Root', 'Research safely', 'global', 'read_only', 'running', 0,
				'deep', 'deep_research',
				'{"version":1,"stage":"${stage}","child_run_ids":${JSON.stringify(childIds)}}',
				'${JSON.stringify(budgets)}'
			)
		`);
	};

	const insertChild = (
		id: string,
		parentId: string,
		overrides: {
			userId?: string;
			scopeMode?: 'read_only' | 'read_write';
			allowedOps?: string[];
			budgets?: Record<string, number | string>;
		} = {}
	): void => {
		const allowedOps = overrides.allowedOps ?? ['util.web.search', 'util.web.visit'];
		const budgets = overrides.budgets ?? {
			max_cost_usd: 0.15,
			max_tool_calls: 5,
			max_tokens: 20_000,
			wall_clock_ms: 300_000
		};
		psql(`
			INSERT INTO public.agent_runs (
				id, user_id, trigger, parent_run_id, depth, label, goal,
				context_type, scope_mode, effort, run_template, allowed_ops,
				review_required, status, orchestration_state, budgets
			) VALUES (
				'${id}',
				'${overrides.userId ?? '90000000-0000-4000-8000-000000000001'}',
				'chat', '${parentId}', 1, 'Child', 'Find evidence', 'global',
				'${overrides.scopeMode ?? 'read_only'}', 'standard', 'agent',
				ARRAY[${allowedOps.map((op) => `'${op}'`).join(',')}],
				FALSE, 'queued', '{}', '${JSON.stringify(budgets)}'
			)
		`);
	};

	beforeAll(async () => {
		tempDir = mkdtempSync(join(tmpdir(), 'buildos-deep-research-pg-'));
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
	});

	afterAll(() => {
		if (dataDir) {
			spawnSync('pg_ctl', ['-D', dataDir, 'stop', '-m', 'fast'], { stdio: 'ignore' });
		}
		if (tempDir) rmSync(tempDir, { recursive: true, force: true });
	});

	beforeEach(() => {
		psql('TRUNCATE public.queue_jobs, public.agent_runs CASCADE');
	});

	it('allows exactly two concurrent safe researchers and race-safely rejects a third', async () => {
		const rootId = '10000000-0000-4000-8000-000000000001';
		insertRoot(rootId, 'dispatching');
		const childIds = [
			'20000000-0000-4000-8000-000000000001',
			'20000000-0000-4000-8000-000000000002',
			'20000000-0000-4000-8000-000000000003'
		];
		const attempts = await Promise.allSettled(
			childIds.map((id) =>
				psqlAsync(`
					INSERT INTO public.agent_runs (
						id, user_id, trigger, parent_run_id, depth, label, goal,
						context_type, scope_mode, effort, run_template, allowed_ops,
						review_required, status, orchestration_state, budgets
					) VALUES (
						'${id}', '90000000-0000-4000-8000-000000000001',
						'chat', '${rootId}', 1, 'Child', 'Find evidence', 'global',
						'read_only', 'standard', 'agent',
						ARRAY['util.web.search', 'util.web.visit'],
						FALSE, 'queued', '{}',
						'{"max_cost_usd":0.15,"max_tool_calls":5,"max_tokens":20000,"wall_clock_ms":300000}'
					)
				`)
			)
		);

		expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(2);
		expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1);
		expect(
			psql(`SELECT COUNT(*) FROM public.agent_runs WHERE parent_run_id = '${rootId}'`)
		).toBe('2');
	});

	it('rejects write access, extra operations, and a mismatched child owner', () => {
		const rootId = '10000000-0000-4000-8000-000000000002';
		insertRoot(rootId, 'dispatching');

		expect(() =>
			insertChild('21000000-0000-4000-8000-000000000001', rootId, {
				scopeMode: 'read_write'
			})
		).toThrow();
		expect(() =>
			insertChild('21000000-0000-4000-8000-000000000002', rootId, {
				allowedOps: ['util.web.search', 'onto.project.list']
			})
		).toThrow();
		expect(() =>
			insertChild('21000000-0000-4000-8000-000000000003', rootId, {
				userId: '90000000-0000-4000-8000-000000000099'
			})
		).toThrow();
	});

	it('enforces root and child cost, tool, token, and time envelopes at the database boundary', () => {
		expect(() =>
			insertRoot('10000000-0000-4000-8000-000000000096', 'dispatching', [], {
				max_cost_usd: 1.01,
				max_tool_calls: 10,
				max_tokens: 60_000,
				wall_clock_ms: 600_000
			})
		).toThrow();
		expect(() =>
			insertRoot('10000000-0000-4000-8000-000000000094', 'dispatching', [], {
				max_cost_usd: 'unbounded',
				max_tool_calls: 10,
				max_tokens: 60_000,
				wall_clock_ms: 600_000
			})
		).toThrow();

		const rootId = '10000000-0000-4000-8000-000000000095';
		insertRoot(rootId, 'dispatching');
		expect(() =>
			insertChild('26000000-0000-4000-8000-000000000001', rootId, {
				budgets: {
					max_cost_usd: 0.3,
					max_tool_calls: 6,
					max_tokens: 25_001,
					wall_clock_ms: 300_001
				}
			})
		).toThrow();
		expect(() =>
			insertChild('26000000-0000-4000-8000-000000000002', rootId, {
				budgets: {
					max_cost_usd: 'unbounded',
					max_tool_calls: 5,
					max_tokens: 20_000,
					wall_clock_ms: 300_000
				}
			})
		).toThrow();
	});

	it('reserves the user run capacity while deep research is active', () => {
		const standardRun = `
			INSERT INTO public.agent_runs (
				id, user_id, trigger, label, goal, context_type, scope_mode,
				status, depth, effort, run_template, orchestration_state
			) VALUES (
				'30000000-0000-4000-8000-000000000001',
				'90000000-0000-4000-8000-000000000001',
				'chat', 'Standard', 'Other work', 'global', 'read_only',
				'queued', 0, 'standard', 'agent', '{}'
			)
		`;
		psql(standardRun);

		expect(() => insertRoot('10000000-0000-4000-8000-000000000099', 'dispatching')).toThrow();

		psql('TRUNCATE public.queue_jobs, public.agent_runs CASCADE');
		const rootId = '10000000-0000-4000-8000-000000000098';
		insertRoot(rootId, 'dispatching');
		expect(() => psql(standardRun)).toThrow();
	});

	it('allows the active coordinator to be reclaimed while its children occupy the reservation', () => {
		const rootId = '10000000-0000-4000-8000-000000000097';
		insertRoot(rootId, 'dispatching');
		insertChild('25000000-0000-4000-8000-000000000001', rootId);
		insertChild('25000000-0000-4000-8000-000000000002', rootId);

		psql(`
			UPDATE public.agent_runs
			SET status = 'running', started_at = NOW()
			WHERE id = '${rootId}' AND status = 'running'
		`);

		expect(psql(`SELECT status FROM public.agent_runs WHERE id = '${rootId}'`)).toBe('running');
	});

	it('queues synthesis exactly once when the final child settles', () => {
		const rootId = '10000000-0000-4000-8000-000000000003';
		const childOne = '22000000-0000-4000-8000-000000000001';
		const childTwo = '22000000-0000-4000-8000-000000000002';
		insertRoot(rootId, 'researching', [childOne, childTwo]);
		insertChild(childOne, rootId);
		insertChild(childTwo, rootId);
		psql(`UPDATE public.agent_runs SET status = 'completed' WHERE id = '${childOne}'`);

		expect(
			psql(
				`SELECT orchestration_state->>'stage' FROM public.agent_runs WHERE id = '${rootId}'`
			)
		).toBe('researching');
		expect(psql('SELECT COUNT(*) FROM public.queue_jobs')).toBe('0');

		psql(`UPDATE public.agent_runs SET status = 'partial' WHERE id = '${childTwo}'`);
		psql(`UPDATE public.agent_runs SET status = 'partial' WHERE id = '${childTwo}'`);

		expect(
			psql(
				`SELECT orchestration_state->>'stage' FROM public.agent_runs WHERE id = '${rootId}'`
			)
		).toBe('synthesis_queued');
		expect(psql('SELECT COUNT(*) FROM public.queue_jobs')).toBe('1');
		expect(psql(`SELECT metadata->>'continuation_from' FROM public.queue_jobs LIMIT 1`)).toBe(
			'children'
		);
	});

	it('does not strand children that settled before the root enters researching', () => {
		const rootId = '10000000-0000-4000-8000-000000000004';
		const childOne = '23000000-0000-4000-8000-000000000001';
		const childTwo = '23000000-0000-4000-8000-000000000002';
		insertRoot(rootId, 'dispatching', [childOne, childTwo]);
		insertChild(childOne, rootId);
		insertChild(childTwo, rootId);
		psql(
			`UPDATE public.agent_runs SET status = 'completed' WHERE id IN ('${childOne}', '${childTwo}')`
		);

		psql(`
			UPDATE public.agent_runs
			SET orchestration_state = jsonb_set(
				orchestration_state,
				'{stage}',
				'"researching"'::jsonb
			)
			WHERE id = '${rootId}'
		`);

		expect(
			psql(
				`SELECT orchestration_state->>'stage' FROM public.agent_runs WHERE id = '${rootId}'`
			)
		).toBe('synthesis_queued');
		expect(psql('SELECT COUNT(*) FROM public.queue_jobs')).toBe('1');
	});

	it('does not synthesize with fewer than the two checkpointed children', () => {
		const rootId = '10000000-0000-4000-8000-000000000005';
		const childOne = '24000000-0000-4000-8000-000000000001';
		const missingChild = '24000000-0000-4000-8000-000000000002';
		insertRoot(rootId, 'researching', [childOne, missingChild]);
		insertChild(childOne, rootId);
		psql(`UPDATE public.agent_runs SET status = 'completed' WHERE id = '${childOne}'`);

		expect(
			psql(
				`SELECT orchestration_state->>'stage' FROM public.agent_runs WHERE id = '${rootId}'`
			)
		).toBe('researching');
		expect(psql('SELECT COUNT(*) FROM public.queue_jobs')).toBe('0');
	});

	it('atomically rejects concurrent reservations that would exceed the root budget', async () => {
		const rootId = '10000000-0000-4000-8000-000000000006';
		const childOne = '27000000-0000-4000-8000-000000000001';
		const childTwo = '27000000-0000-4000-8000-000000000002';
		insertRoot(rootId, 'researching', [childOne, childTwo]);
		insertChild(childOne, rootId);
		insertChild(childTwo, rootId);
		psql(
			`UPDATE public.agent_runs SET status = 'running' WHERE id IN ('${childOne}', '${childTwo}')`
		);
		psql(`
			SELECT public.reserve_agent_run_cost(
				'${rootId}', 'planner', 'smart-llm', 'deep_research.plan',
				'planner-model', 0.25, 1000, 'tokens', '{}'
			)
		`);

		const attempts = await Promise.allSettled([
			psqlAsync(`
				SELECT public.reserve_agent_run_cost(
					'${childOne}', 'search-1', 'tavily', 'util.web.search',
					'advanced', 0.15, 2, 'credits', '{}'
				)
			`),
			psqlAsync(`
				SELECT public.reserve_agent_run_cost(
					'${childTwo}', 'search-1', 'tavily', 'util.web.search',
					'advanced', 0.15, 2, 'credits', '{}'
				)
			`)
		]);

		expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
		expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1);
		expect(
			psql(
				`SELECT COALESCE(SUM(reserved_cost_usd), 0) FROM public.agent_run_cost_entries WHERE root_run_id = '${rootId}'`
			)
		).toBe('0.40000000');
	});

	it('makes reservation and settlement retries idempotent and rejects changed payloads', () => {
		const rootId = '10000000-0000-4000-8000-000000000007';
		insertRoot(rootId, 'dispatching');

		const first = JSON.parse(
			psql(`
				SELECT public.reserve_agent_run_cost(
					'${rootId}', 'planner', 'smart-llm', 'deep_research.plan',
					'planner-model', 0.10, 1000, 'tokens', '{"stage":"planning"}'
				)
			`)
		) as { idempotent: boolean; status: string };
		const repeated = JSON.parse(
			psql(`
				SELECT public.reserve_agent_run_cost(
					'${rootId}', 'planner', 'smart-llm', 'deep_research.plan',
					'planner-model', 0.10, 1000, 'tokens', '{"stage":"planning"}'
				)
			`)
		) as { idempotent: boolean; status: string };

		expect(first).toMatchObject({ idempotent: false, status: 'reserved' });
		expect(repeated).toMatchObject({ idempotent: true, status: 'reserved' });
		expect(psql('SELECT COUNT(*) FROM public.agent_run_cost_entries')).toBe('1');
		expect(() =>
			psql(`
				SELECT public.reserve_agent_run_cost(
					'${rootId}', 'planner', 'smart-llm', 'deep_research.plan',
					'planner-model', 0.11, 1000, 'tokens', '{}'
				)
			`)
		).toThrow();
		expect(() =>
			psql(`
				SELECT public.reserve_agent_run_cost(
					'${rootId}', 'not-a-number', 'smart-llm', 'deep_research.plan',
					'planner-model', 'NaN'::NUMERIC, 1000, 'tokens', '{}'
				)
			`)
		).toThrow();

		const settled = JSON.parse(
			psql(`
				SELECT public.settle_agent_run_cost(
					'${rootId}', 'planner', 'settled', 0.04, 800,
					'provider-request-1', '{"cost_source":"provider_reported"}'
				)
			`)
		) as { idempotent: boolean; status: string; actual_cost_usd: number };
		const settledAgain = JSON.parse(
			psql(`
				SELECT public.settle_agent_run_cost(
					'${rootId}', 'planner', 'settled', 0.04, 800,
					'provider-request-1', '{"cost_source":"provider_reported"}'
				)
			`)
		) as { idempotent: boolean; status: string };

		expect(settled).toMatchObject({
			idempotent: false,
			status: 'settled',
			actual_cost_usd: 0.04
		});
		expect(settledAgain).toMatchObject({ idempotent: true, status: 'settled' });
		expect(() =>
			psql(`
				SELECT public.settle_agent_run_cost(
					'${rootId}', 'planner', 'settled', 0.05, 800,
					'provider-request-1', '{}'
				)
			`)
		).toThrow();
	});

	it('retains uncertain exposure and flags provider cost above reservation', () => {
		const rootId = '10000000-0000-4000-8000-000000000008';
		insertRoot(rootId, 'dispatching');
		psql(`
			SELECT public.reserve_agent_run_cost(
				'${rootId}', 'synthesis', 'smart-llm', 'deep_research.synthesis',
				'synthesis-model', 0.02, 1000, 'tokens', '{}'
			)
		`);

		const result = JSON.parse(
			psql(`
				SELECT public.settle_agent_run_cost(
					'${rootId}', 'synthesis', 'settled', 0.03, 900,
					'provider-request-overrun', '{}'
				)
			`)
		) as {
			status: string;
			actual_cost_usd: number;
			metadata: { reservation_overrun: boolean };
		};

		expect(result).toMatchObject({
			status: 'reconciliation_required',
			actual_cost_usd: 0.03,
			metadata: { reservation_overrun: true }
		});
		const reconciled = JSON.parse(
			psql(`
				SELECT public.settle_agent_run_cost(
					'${rootId}', 'synthesis', 'settled', 0.03, 900,
					'provider-request-overrun', '{"operator_reviewed":true}', TRUE
				)
			`)
		) as { status: string; metadata: { operator_reviewed: boolean } };
		expect(reconciled).toMatchObject({
			status: 'settled',
			metadata: { operator_reviewed: true }
		});
		expect(() =>
			psql(`
				INSERT INTO public.agent_run_cost_entries (
					root_run_id, leaf_run_id, attempt_key, provider, operation,
					resource, reserved_cost_usd
				) VALUES (
					'${rootId}', '${rootId}', 'direct-write', 'tavily',
					'util.web.search', 'advanced', 0.01
				)
			`)
		).toThrow();
		psql(`DELETE FROM public.agent_runs WHERE id = '${rootId}'`);
		expect(psql('SELECT COUNT(*) FROM public.agent_run_cost_entries')).toBe('0');
	});

	it('claims stale cost rows once with bounded lease ownership', () => {
		const rootId = '10000000-0000-4000-8000-000000000009';
		insertRoot(rootId, 'dispatching');
		psql(`
			SELECT public.reserve_agent_run_cost(
				'${rootId}', 'planner', 'openrouter', 'deep_research.plan',
				'planner-model', 0.02, 1000, 'tokens', '{}'
			)
		`);

		const claimed = JSON.parse(
			psql(`
				SELECT COALESCE(jsonb_agg(to_jsonb(claimed)), '[]'::jsonb)
				FROM public.claim_agent_run_cost_reconciliation(
					NOW(), 1, 120, 8
				) AS claimed
			`)
		) as Array<{
			id: string;
			reconciliation_attempts: number;
			reconciliation_lock_token: string;
		}>;
		const claimedAgain = JSON.parse(
			psql(`
				SELECT COALESCE(jsonb_agg(to_jsonb(claimed)), '[]'::jsonb)
				FROM public.claim_agent_run_cost_reconciliation(
					NOW(), 1, 120, 8
				) AS claimed
			`)
		) as unknown[];

		expect(claimed).toHaveLength(1);
		expect(claimed[0]).toMatchObject({
			reconciliation_attempts: 1,
			reconciliation_lock_token: expect.any(String)
		});
		expect(claimedAgain).toEqual([]);
	});

	it('fences reconciliation release by lease token and schedules bounded retry', () => {
		const rootId = '10000000-0000-4000-8000-000000000010';
		insertRoot(rootId, 'dispatching');
		psql(`
			SELECT public.reserve_agent_run_cost(
				'${rootId}', 'planner', 'openrouter', 'deep_research.plan',
				'planner-model', 0.02, 1000, 'tokens', '{}'
			)
		`);
		const claimed = JSON.parse(
			psql(`
				SELECT to_jsonb(claimed)
				FROM public.claim_agent_run_cost_reconciliation(
					NOW(), 1, 120, 8
				) AS claimed
			`)
		) as { id: string; reconciliation_lock_token: string };

		expect(() =>
			psql(`
				SELECT public.release_agent_run_cost_reconciliation(
					'${claimed.id}',
					'50000000-0000-4000-8000-000000000099',
					'not ready',
					TRUE,
					NOW() + INTERVAL '15 minutes'
				)
			`)
		).toThrow();

		const released = JSON.parse(
			psql(`
				SELECT public.release_agent_run_cost_reconciliation(
					'${claimed.id}',
					'${claimed.reconciliation_lock_token}',
					'not ready',
					TRUE,
					NOW() + INTERVAL '15 minutes'
				)
			`)
		) as {
			reconciliation_lock_token: string | null;
			reconciliation_next_attempt_at: string;
			reconciliation_last_error: string;
		};
		expect(released).toMatchObject({
			reconciliation_lock_token: null,
			reconciliation_next_attempt_at: expect.any(String),
			reconciliation_last_error: 'not ready'
		});
		expect(
			psql(`
				SELECT reconciliation_next_attempt_at > NOW()
				FROM public.agent_run_cost_entries
				WHERE id = '${claimed.id}'
			`)
		).toBe('t');
	});

	it('routes an expired final reconciliation lease to operators instead of stranding it', () => {
		const rootId = '10000000-0000-4000-8000-000000000012';
		insertRoot(rootId, 'dispatching');
		psql(`
			SELECT public.reserve_agent_run_cost(
				'${rootId}', 'planner', 'openrouter', 'deep_research.plan',
				'planner-model', 0.02, 1000, 'tokens', '{}'
			)
		`);
		const firstClaim = JSON.parse(
			psql(`
				SELECT to_jsonb(claimed)
				FROM public.claim_agent_run_cost_reconciliation(
					NOW(), 1, 30, 1
				) AS claimed
			`)
		) as { id: string; reconciliation_attempts: number };
		expect(firstClaim.reconciliation_attempts).toBe(1);

		// Simulate a worker dying on its final allowed attempt and its lease
		// expiring without release/settlement.
		psql(`
			SELECT set_config('app.agent_run_cost_rpc', 'on', FALSE);
			UPDATE public.agent_run_cost_entries
			SET
				reconciliation_locked_at = NOW() - INTERVAL '2 seconds',
				reconciliation_lock_expires_at = NOW() - INTERVAL '1 second'
			WHERE id = '${firstClaim.id}'
		`);

		const recovered = JSON.parse(
			psql(`
				SELECT to_jsonb(claimed)
				FROM public.claim_agent_run_cost_reconciliation(
					NOW(), 1, 30, 1
				) AS claimed
			`)
		) as {
			reconciliation_attempts: number;
			reconciliation_lock_token: string | null;
			reconciliation_needs_operator_at: string;
			reconciliation_last_error: string;
		};
		expect(recovered).toMatchObject({
			reconciliation_attempts: 1,
			reconciliation_lock_token: null,
			reconciliation_needs_operator_at: expect.any(String),
			reconciliation_last_error:
				'Final automatic reconciliation lease expired before completion.'
		});
	});

	it('settles an authoritative provider overrun through the claimed reconciliation lease', () => {
		const rootId = '10000000-0000-4000-8000-000000000011';
		insertRoot(rootId, 'dispatching');
		psql(`
			SELECT public.reserve_agent_run_cost(
				'${rootId}', 'synthesis', 'openrouter', 'deep_research.synthesis',
				'synthesis-model', 0.02, 1000, 'tokens', '{}'
			)
		`);
		psql(`
			SELECT public.settle_agent_run_cost(
				'${rootId}', 'synthesis', 'settled', 0.03, 900,
				'gen-overrun', '{"cost_source":"provider_reported"}'
			)
		`);
		const claimed = JSON.parse(
			psql(`
				SELECT to_jsonb(claimed)
				FROM public.claim_agent_run_cost_reconciliation(
					NOW(), 1, 120, 8
				) AS claimed
			`)
		) as { id: string; reconciliation_lock_token: string };

		const reconciled = JSON.parse(
			psql(`
				SELECT public.reconcile_agent_run_cost(
					'${claimed.id}',
					'${claimed.reconciliation_lock_token}',
					0.03,
					900,
					'gen-overrun',
					'{"reconciliation_source":"openrouter_generation_api"}'
				)
			`)
		) as {
			status: string;
			actual_cost_usd: number;
			reconciliation_lock_token: string | null;
			metadata: { provider_reconciled: boolean };
		};
		expect(reconciled).toMatchObject({
			status: 'settled',
			actual_cost_usd: 0.03,
			reconciliation_lock_token: null,
			metadata: { provider_reconciled: true }
		});
		const repeated = JSON.parse(
			psql(`
				SELECT public.reconcile_agent_run_cost(
					'${claimed.id}',
					'${claimed.reconciliation_lock_token}',
					0.03,
					900,
					'gen-overrun',
					'{"reconciliation_source":"openrouter_generation_api"}'
				)
			`)
		) as { status: string; idempotent: boolean };
		expect(repeated).toMatchObject({ status: 'settled', idempotent: true });
	});

	it('corrects a response settlement that races an authoritative provider lookup', () => {
		const rootId = '10000000-0000-4000-8000-000000000013';
		insertRoot(rootId, 'dispatching');
		psql(`
			SELECT public.reserve_agent_run_cost(
				'${rootId}', 'planner', 'openrouter', 'deep_research.plan',
				'planner-model', 0.02, 1000, 'tokens', '{}'
			)
		`);
		const claimed = JSON.parse(
			psql(`
				SELECT to_jsonb(claimed)
				FROM public.claim_agent_run_cost_reconciliation(
					NOW(), 1, 120, 8
				) AS claimed
			`)
		) as { id: string; reconciliation_lock_token: string };

		// The original request callback arrives after the scheduler claimed the
		// stale row but before its provider lookup completes.
		psql(`
			SELECT public.settle_agent_run_cost(
				'${rootId}', 'planner', 'settled', 0.015, 850,
				'gen-race', '{"cost_source":"catalog_estimate"}'
			)
		`);

		const corrected = JSON.parse(
			psql(`
				SELECT public.reconcile_agent_run_cost(
					'${claimed.id}',
					'${claimed.reconciliation_lock_token}',
					0.012,
					800,
					'gen-race',
					'{"reconciliation_source":"openrouter_generation_api"}'
				)
			`)
		) as {
			status: string;
			actual_cost_usd: number;
			actual_units: number;
			reconciliation_lock_token: string | null;
			metadata: { provider_reconciled: boolean };
		};
		expect(corrected).toMatchObject({
			status: 'settled',
			actual_cost_usd: 0.012,
			actual_units: 800,
			reconciliation_lock_token: null,
			metadata: { provider_reconciled: true }
		});
	});

	it('allows only the service role to read the ledger and execute cost RPCs', () => {
		const functionSignatures = [
			'public.reserve_agent_run_cost(uuid,text,text,text,text,numeric,numeric,text,jsonb)',
			'public.settle_agent_run_cost(uuid,text,text,numeric,numeric,text,jsonb,boolean)',
			'public.claim_agent_run_cost_reconciliation(timestamp with time zone,integer,integer,integer)',
			'public.release_agent_run_cost_reconciliation(uuid,uuid,text,boolean,timestamp with time zone)',
			'public.reconcile_agent_run_cost(uuid,uuid,numeric,numeric,text,jsonb)'
		];
		for (const signature of functionSignatures) {
			expect(psql(`SELECT has_function_privilege('anon', '${signature}', 'EXECUTE')`)).toBe(
				'f'
			);
			expect(
				psql(`SELECT has_function_privilege('authenticated', '${signature}', 'EXECUTE')`)
			).toBe('f');
			expect(
				psql(`SELECT has_function_privilege('service_role', '${signature}', 'EXECUTE')`)
			).toBe('t');
		}
		expect(
			psql(`SELECT has_table_privilege('anon', 'public.agent_run_cost_entries', 'SELECT')`)
		).toBe('f');
		expect(
			psql(
				`SELECT has_table_privilege('authenticated', 'public.agent_run_cost_entries', 'SELECT')`
			)
		).toBe('f');
		expect(
			psql(
				`SELECT has_table_privilege('service_role', 'public.agent_run_cost_entries', 'SELECT')`
			)
		).toBe('t');
		for (const privilege of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
			expect(
				psql(
					`SELECT has_table_privilege('service_role', 'public.agent_run_cost_entries', '${privilege}')`
				)
			).toBe('f');
		}
		for (const role of ['anon', 'authenticated']) {
			expect(() =>
				psql(`
					SET ROLE ${role};
					SELECT public.claim_agent_run_cost_reconciliation(
						NOW(), 1, 120, 8
					)
				`)
			).toThrow();
		}
	});
});
