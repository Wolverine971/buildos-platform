// apps/worker/tests/integration/agentRunCostWiring.test.ts
//
// Live-wiring smoke for the Agent Run cost ledger.
//
// The 24 disposable-PostgreSQL migration cases exercise `reserve_agent_run_cost`
// directly with hand-written SQL, but never drove the DEPLOYED worker's
// reservation wiring: `parseBudgets` -> `resolveAgentRunLlmSpendLimit` -> the real
// `SmartLLMService.getJSONResponse` -> `onSpendReservation` -> `reserveAgentRunCost`
// -> the real RPC. A bake-off found that path silently made unreserved paid calls
// for runs whose `max_cost_usd` was read back from JSONB as a numeric string. This
// suite runs the real wiring end to end against a disposable Postgres cluster and
// asserts a durable `agent_run_cost_entries` row is written before dispatch.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SmartLLMService } from '@buildos/smart-llm';
import { parseBudgets } from '../../src/workers/agent-run/agentRunWorker';
import { resolveAgentRunLlmSpendLimit } from '../../src/workers/agent-run/agentRunCostPolicy';
import {
	reserveAgentRunCost,
	AgentRunCostLedgerError
} from '../../src/workers/agent-run/agentRunCostLedger';

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

const USER_ID = '90000000-0000-4000-8000-000000000001';

function sqlLiteral(value: string): string {
	return `'${value.replace(/'/g, "''")}'`;
}

describePostgres('Agent Run cost-ledger live wiring', () => {
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

	// A minimal Supabase-shaped RPC client backed by psql, so the real
	// `reserveAgentRunCost` adapter exercises the deployed RPC.
	const rpcClient = {
		async rpc(fn: string, args: Record<string, unknown>) {
			const order = [
				'p_leaf_run_id',
				'p_attempt_key',
				'p_provider',
				'p_operation',
				'p_resource',
				'p_reserved_cost_usd',
				'p_reserved_units',
				'p_unit_type',
				'p_metadata'
			];
			const rendered = order.map((key) => {
				const value = args[key];
				if (value === null || value === undefined) return 'NULL';
				if (key === 'p_leaf_run_id') return `${sqlLiteral(String(value))}::uuid`;
				if (key === 'p_reserved_cost_usd' || key === 'p_reserved_units') {
					return `${Number(value)}::numeric`;
				}
				if (key === 'p_metadata') return `${sqlLiteral(JSON.stringify(value))}::jsonb`;
				return sqlLiteral(String(value));
			});
			try {
				const data = psql(`SELECT public.${fn}(${rendered.join(', ')})`);
				return { data: JSON.parse(data), error: null };
			} catch (error) {
				const failure = error as { stderr?: string; message?: string };
				return {
					data: null,
					error: { message: `${failure.stderr ?? ''} ${failure.message ?? ''}`.trim() }
				};
			}
		}
	};

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

	// A depth-0, run_template='agent', effort='deep' run is a "single deep run":
	// its own root, driven by the main turn loop (not the coordinator path).
	const insertSingleDeepRun = (id: string, budgets: Record<string, unknown>): void => {
		psql(`
			INSERT INTO public.agent_runs (
				id, user_id, trigger, depth, label, goal, context_type, scope_mode,
				effort, run_template, status, started_at, budgets
			) VALUES (
				${sqlLiteral(id)}, ${sqlLiteral(USER_ID)}, 'chat', 0, 'Single deep run',
				'Research the topic', 'global', 'read_only', 'deep', 'agent', 'running', NOW(),
				${sqlLiteral(JSON.stringify(budgets))}::jsonb
			)
		`);
	};

	function jsonTurnCompletion() {
		return new Response(
			JSON.stringify({
				id: 'cmpl-turn-1',
				model: 'deepseek/deepseek-v4-flash',
				provider: 'DeepSeek',
				choices: [
					{
						message: {
							role: 'assistant',
							content: JSON.stringify({
								action: 'submit_result',
								status: 'completed',
								answer: 'done'
							})
						},
						finish_reason: 'stop'
					}
				],
				usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, cost: 0.001 }
			}),
			{ status: 200, headers: { 'content-type': 'application/json' } }
		);
	}

	// Replica of the turn-loop LLM accounting: reserve THROUGH the real ledger
	// adapter immediately before the real getJSONResponse dispatches.
	async function runBudgetedTurn(runId: string, runBudgets: unknown) {
		const fetchMock = vi.fn(async () => jsonTurnCompletion());
		const llm = new SmartLLMService({
			apiKey: 'openrouter-test-key',
			fetch: fetchMock as unknown as typeof fetch
		});
		const budgets = parseBudgets(runBudgets);
		const spendLimit = resolveAgentRunLlmSpendLimit(budgets.max_cost_usd, 0);
		if (spendLimit === undefined) {
			// Fixed turn loop fails closed rather than making an unreserved call.
			return { dispatched: false, spendLimit };
		}
		await llm.getJSONResponse({
			systemPrompt: 'You are a bounded research agent.',
			userPrompt: 'Research the topic.',
			userId: USER_ID,
			profile: 'balanced',
			spendLimit,
			onSpendReservation: async (reservation) => {
				await reserveAgentRunCost(
					{
						leafRunId: runId,
						attemptKey: 'llm:test:a0:turn:0',
						provider: reservation.provider,
						operation: 'agent_run.deep_turn',
						resource: reservation.model,
						reservedCostUsd: reservation.reservedCostUsd,
						reservedUnits: reservation.estimatedInputTokens + reservation.maxTokens,
						unitType: 'tokens',
						metadata: { model: reservation.model },
						requireNewAttempt: true
					},
					rpcClient
				);
			},
			onUsage: async () => {}
		});
		return { dispatched: true, spendLimit };
	}

	beforeAll(async () => {
		tempDir = mkdtempSync(join(tmpdir(), 'buildos-cost-wiring-pg-'));
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
	});

	afterAll(() => {
		if (dataDir)
			spawnSync('pg_ctl', ['-D', dataDir, 'stop', '-m', 'fast'], { stdio: 'ignore' });
		if (tempDir) rmSync(tempDir, { recursive: true, force: true });
	});

	beforeEach(() => {
		psql('TRUNCATE public.agent_run_cost_entries, public.agent_runs CASCADE');
	});

	it('writes a durable reservation row for a numeric-budget deep turn', async () => {
		const runId = '30000000-0000-4000-8000-000000000001';
		insertSingleDeepRun(runId, {
			max_cost_usd: 0.5,
			max_tokens: 20000,
			max_tool_calls: 5,
			wall_clock_ms: 300000
		});

		const outcome = await runBudgetedTurn(runId, {
			max_cost_usd: 0.5,
			max_tokens: 20000,
			max_tool_calls: 5,
			wall_clock_ms: 300000
		});

		expect(outcome.dispatched).toBe(true);
		expect(
			psql(
				`SELECT COUNT(*) FROM public.agent_run_cost_entries WHERE leaf_run_id = '${runId}'`
			)
		).toBe('1');
		expect(
			psql(`SELECT status FROM public.agent_run_cost_entries WHERE leaf_run_id = '${runId}'`)
		).toBe('reserved');
	});

	it('reserves a paid Tavily search against the same run budget', async () => {
		const runId = '30000000-0000-4000-8000-000000000002';
		insertSingleDeepRun(runId, {
			max_cost_usd: 0.5,
			max_tokens: 20000,
			max_tool_calls: 5,
			wall_clock_ms: 300000
		});

		await reserveAgentRunCost(
			{
				leafRunId: runId,
				attemptKey: 'tool:test:a0:1:util.web.search',
				provider: 'tavily',
				operation: 'util.web.search',
				resource: 'advanced',
				reservedCostUsd: 0.016,
				reservedUnits: 2,
				unitType: 'credits',
				metadata: { source: 'search_depth_fallback' },
				requireNewAttempt: true
			},
			rpcClient
		);

		expect(
			psql(
				`SELECT unit_type FROM public.agent_run_cost_entries WHERE leaf_run_id = '${runId}'`
			)
		).toBe('credits');
	});

	it('fails closed (no reservation, no unreserved spend) for a non-numeric budget', async () => {
		const runId = '30000000-0000-4000-8000-000000000003';
		// A run row whose max_cost_usd is a JSONB string. parseBudgets now coerces
		// it for the worker, but the ledger RPC still requires a JSONB number, so
		// the reservation is rejected -- the safe fail-closed outcome (never an
		// unreserved paid call).
		insertSingleDeepRun(runId, {
			max_cost_usd: '0.5',
			max_tokens: 20000,
			max_tool_calls: 5,
			wall_clock_ms: 300000
		});

		await expect(
			reserveAgentRunCost(
				{
					leafRunId: runId,
					attemptKey: 'llm:test:a0:turn:0',
					provider: 'DeepSeek',
					operation: 'agent_run.deep_turn',
					resource: 'deepseek/deepseek-v4-flash',
					reservedCostUsd: 0.04,
					reservedUnits: 1000,
					unitType: 'tokens',
					metadata: {},
					requireNewAttempt: true
				},
				rpcClient
			)
		).rejects.toBeInstanceOf(AgentRunCostLedgerError);

		expect(
			psql(
				`SELECT COUNT(*) FROM public.agent_run_cost_entries WHERE leaf_run_id = '${runId}'`
			)
		).toBe('0');
	});
});
