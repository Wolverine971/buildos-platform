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
});
