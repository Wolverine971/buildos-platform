// apps/worker/tests/agenticChatWorkflowRunner.postgres.test.ts
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	AGENTIC_CHAT_WORKFLOW_POLICY_V1,
	buildAgenticChatWorkflowReviewIntentV1,
	canonicalizeAgenticChatJson,
	hashAgenticChatWorkflowRequestV1
} from '@buildos/shared-types';
import { AgenticChatProviderCapacity } from '../src/workers/agentic-chat/providerCapacity';
import { SupabaseAgenticChatExecutionControlAdapter } from '../src/workers/agentic-chat/executionControl';
import {
	SupabaseAgenticChatWorkflowStore,
	type AgenticChatWorkflowFenceV1
} from '../src/workers/agentic-chat/workflow/workflow-store';
import { AgenticChatWorkflowRunner } from '../src/workers/agentic-chat/workflow/workflow-runner';
import {
	buildAgenticChatWorkflowProjectionV1,
	workflowCheckpointV1
} from '../src/workers/agentic-chat/workflow/workflow-projection';
import { FAKE_CONTEXT_PAYLOAD, FAKE_EVIDENCE } from './helpers/workflowStoreFake';
import {
	EDITOR_TEXT,
	type ScriptedCall,
	type ScriptedReply,
	happyScript,
	plannerReply,
	reportReply,
	scriptedWorkflowProvider
} from './helpers/workflowProviderScript';

/**
 * Tasker 87: the real runner and the real Supabase store adapter against Tasker 85's
 * frozen SQL on a disposable, socket-only local PostgreSQL. It never connects to a
 * hosted database. It checks what the in-memory fake cannot: exact RPC names and
 * named arguments, receipt parsing, projection validation, generation-scoped event
 * sequences, and ledger arithmetic in SQL.
 */

const CONTRACT = 'supabase/tests/20260914203008_agentic_chat_workflow_v1.test.sql';
const USER_ID = 'b1000000-0000-4000-8000-000000000001';
const PROJECT_ID = 'b3000000-0000-4000-8000-000000000001';

const id = (prefix: string, n: number) =>
	`${prefix}000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

const postgresAvailable = ['initdb', 'pg_ctl', 'psql'].every(
	(command) => spawnSync(command, ['--version'], { stdio: 'ignore' }).status === 0
);
const describePostgres = postgresAvailable ? describe : describe.skip;

/** Supabase-shaped client over one pg connection: named-argument RPCs and simple reads. */
function supabaseShim(client: Client, failRpc: (name: string) => boolean = () => false) {
	const toJs = (row: Record<string, unknown>) =>
		Object.fromEntries(
			Object.entries(row).map(([key, value]) => [
				key,
				value instanceof Date ? value.toISOString() : value
			])
		);
	return {
		async rpc(name: string, args: Record<string, unknown>) {
			const entries = Object.entries(args);
			const values = entries.map(([, value]) =>
				value !== null && typeof value === 'object' ? JSON.stringify(value) : value
			);
			const named = entries.map(([key], index) => `${key} => $${index + 1}`).join(', ');
			if (failRpc(name))
				return { data: null, error: { code: '08006', message: 'connection lost' } };
			try {
				const { rows } = await client.query(
					`SELECT public.${name}(${named}) AS data`,
					values
				);
				return { data: rows[0]!.data, error: null };
			} catch (error: any) {
				return { data: null, error: { code: error.code ?? '', message: error.message } };
			}
		},
		from(table: string) {
			return {
				select(columns: string) {
					return {
						eq(column: string, value: unknown) {
							const run = async () => {
								try {
									const { rows } = await client.query(
										`SELECT ${columns} FROM public.${table} WHERE ${column} = $1`,
										[value]
									);
									return { data: rows.map(toJs), error: null };
								} catch (error: any) {
									return {
										data: null,
										error: { code: error.code ?? '', message: error.message }
									};
								}
							};
							return {
								then: (resolve: any, reject: any) => run().then(resolve, reject),
								maybeSingle: async () => {
									const result = await run();
									return { data: result.data?.[0] ?? null, error: result.error };
								}
							};
						}
					};
				}
			};
		}
	};
}

describePostgres('workflow runner against the frozen SQL on disposable PostgreSQL', () => {
	const repositoryRoot = resolve(process.cwd(), '../..');
	let tempDir = '';
	let dataDir = '';
	let admin: Client;
	let service: Client;
	const sessions = new Map<number, string>();

	async function sql(name: string, ...args: unknown[]) {
		const values = args.map((value) =>
			value !== null && typeof value === 'object' ? JSON.stringify(value) : value
		);
		const { rows } = await service.query(
			`SELECT public.${name}(${values.map((_, index) => `$${index + 1}`).join(', ')}) AS data`,
			values
		);
		return rows[0]!.data as Record<string, any>;
	}

	async function admitAndClaim(n: number, message: string): Promise<AgenticChatWorkflowFenceV1> {
		// One active turn per session: each scenario gets its own project chat session.
		const sessionId = id('dc', n);
		sessions.set(n, sessionId);
		await admin.query(
			`INSERT INTO public.chat_sessions (id, user_id, context_type, entity_id, status)
			VALUES ($1, $2, 'project', $3, 'active')`,
			[sessionId, USER_ID, PROJECT_ID]
		);
		const clientTurnId = `runner-client-${n}`;
		const request = {
			clientTurnId,
			streamRunId: `runner-stream-${n}`,
			context: { type: 'project' as const, entityId: PROJECT_ID, projectId: PROJECT_ID },
			message,
			reviewIntent: buildAgenticChatWorkflowReviewIntentV1(message),
			policy: AGENTIC_CHAT_WORKFLOW_POLICY_V1,
			policyRef: 'policy-ref-runner'
		};
		const admitted = await sql(
			'create_agentic_chat_workflow_turn_with_job_v1',
			USER_ID,
			sessionId,
			id('d5', n),
			id('d6', n),
			id('d7', n),
			request.streamRunId,
			clientTurnId,
			id('d8', n),
			id('d9', n),
			PROJECT_ID,
			message,
			request.reviewIntent,
			AGENTIC_CHAT_WORKFLOW_POLICY_V1,
			request.policyRef,
			await hashAgenticChatWorkflowRequestV1(request),
			null
		);
		expect(admitted.outcome).toBe('newly_admitted');
		return leaseAndClaim(id('d5', n));
	}

	async function leaseAndClaim(turnRunId: string): Promise<AgenticChatWorkflowFenceV1> {
		const token = randomUUID();
		const { rows } = await admin.query(
			`UPDATE public.queue_jobs jobs
			SET status = 'processing', processing_token = $2, started_at = now()
			FROM public.chat_turn_runs turns
			WHERE turns.id = $1 AND jobs.id = turns.queue_job_id
			RETURNING jobs.id`,
			[turnRunId, token]
		);
		const queueJobId = rows[0]!.id as string;
		const claim = await sql('claim_agentic_chat_turn', turnRunId, queueJobId, token);
		expect(claim.outcome).toBe('claimed');
		return {
			turnRunId,
			queueJobId,
			processingToken: token,
			executionGeneration: Number(claim.execution_generation)
		};
	}

	function runnerFor(
		script: (call: ScriptedCall) => ScriptedReply,
		failRpc?: (name: string) => boolean
	) {
		const store = new SupabaseAgenticChatWorkflowStore(supabaseShim(service, failRpc) as never);
		const provider = scriptedWorkflowProvider(script);
		const runner = new AgenticChatWorkflowRunner(
			{
				store,
				client: provider.client,
				capacity: new AgenticChatProviderCapacity({ configured: true, concurrency: 2 }),
				// Tasker 86's preparation seam: accept project context through the store.
				prepareContext: async ({ fence, run }) => {
					const canonical = canonicalizeAgenticChatJson(FAKE_CONTEXT_PAYLOAD);
					const observedAt = new Date().toISOString();
					const receipt = await store.acceptContext(fence, {
						contextId: randomUUID(),
						requestArtifactId: run.requestArtifactId,
						requestHash: run.requestHash,
						preparationVersion: 'agentic_chat_prepared_context_v1',
						contextIdentity: {
							userId: USER_ID,
							projectId: PROJECT_ID,
							accessCheckedAt: observedAt,
							contextLoadedAt: observedAt,
							cacheRefUsed: null
						},
						evidenceVersions: FAKE_EVIDENCE,
						payload: FAKE_CONTEXT_PAYLOAD,
						contextHash: sha256(canonical),
						contextBytes: Buffer.byteLength(canonical, 'utf8'),
						...workflowCheckpointV1(
							randomUUID(),
							buildAgenticChatWorkflowProjectionV1(run, {
								phase: 'assessing',
								providerActivity: 'idle',
								observedAt
							})
						)
					});
					expect(receipt.outcome).toBe('accepted');
				}
			},
			{ capacityPollMs: 5, settlementDrainMs: 5_000, meter: { settleRetryDelayMs: 5 } }
		);
		const controller = new AbortController();
		const run = (fence: AgenticChatWorkflowFenceV1, n: number) =>
			runner.run({
				fence,
				userId: USER_ID,
				sessionId: sessions.get(n)!,
				streamRunId: `runner-stream-${n}`,
				clientTurnId: `runner-client-${n}`,
				projectId: PROJECT_ID,
				question: 'What should we prioritize next?',
				history: [],
				invocationDeadlineAtMs: Date.now() + 300_000,
				signal: controller.signal
			});
		return { store, provider, run, controller };
	}

	async function dispatchRows(turnRunId: string) {
		const { rows } = await admin.query(
			`SELECT step_key, physical_attempt, dispatch_kind AS kind, state, reserved_micro_usd::bigint AS reserved, actual_micro_usd::bigint AS actual
			FROM public.chat_turn_workflow_dispatches WHERE turn_run_id = $1 ORDER BY reserved_at, physical_attempt`,
			[turnRunId]
		);
		return rows.map((row) => ({
			step: row.step_key,
			attempt: row.physical_attempt,
			kind: row.kind,
			state: row.state,
			reserved: Number(row.reserved),
			actual: row.actual === null ? null : Number(row.actual)
		}));
	}

	beforeAll(async () => {
		tempDir = mkdtempSync('/tmp/buildos-workflow-runner-pg-');
		dataDir = join(tempDir, 'data');
		const socketDir = join(tempDir, 'socket');
		const port = await availablePort();
		mkdirSync(socketDir);
		execFileSync(
			'initdb',
			[
				'-D',
				dataDir,
				'--no-locale',
				'--encoding=UTF8',
				'--auth=trust',
				'--username=postgres'
			],
			{
				stdio: 'pipe'
			}
		);
		const postgresLog = join(tempDir, 'postgres.log');
		try {
			execFileSync(
				'pg_ctl',
				[
					'-D',
					dataDir,
					'-l',
					postgresLog,
					'-o',
					`-p ${port} -k ${socketDir} -c listen_addresses=''`,
					'-w',
					'start'
				],
				{ stdio: 'pipe' }
			);
		} catch (error) {
			throw new Error(
				`Disposable PostgreSQL failed to start:\n${readFileSync(postgresLog, 'utf8')}`,
				{ cause: error }
			);
		}
		const contractOutput = execFileSync(
			'psql',
			[
				'-X',
				'-h',
				socketDir,
				'-p',
				String(port),
				'-U',
				'postgres',
				'-d',
				'postgres',
				'-v',
				'ON_ERROR_STOP=1',
				'-f',
				resolve(repositoryRoot, CONTRACT)
			],
			{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 }
		);
		expect(contractOutput).toContain('agentic_chat_workflow_v1_contract_ok');
		const connection = { host: socketDir, port, user: 'postgres', database: 'postgres' };
		admin = new Client(connection);
		await admin.connect();
		service = new Client(connection);
		await service.connect();
		await service.query('SET ROLE service_role');

		await admin.query('INSERT INTO public.users (id) VALUES ($1)', [USER_ID]);
		await admin.query('INSERT INTO auth.users (id) VALUES ($1)', [USER_ID]);
		await admin.query(
			`INSERT INTO public.onto_actors (id, kind, name, user_id) VALUES ($1, 'human', 'Owner', $2)`,
			[id('d2', 1), USER_ID]
		);
		await admin.query(
			`INSERT INTO public.onto_projects (id, name, created_by) VALUES ($1, 'Workshop launch', $2)`,
			[PROJECT_ID, id('d2', 1)]
		);
	}, 120_000);

	afterAll(async () => {
		await service?.end().catch(() => undefined);
		await admin?.end().catch(() => undefined);
		if (dataDir)
			spawnSync('pg_ctl', ['-D', dataDir, 'stop', '-m', 'fast'], { stdio: 'ignore' });
		if (tempDir) rmSync(tempDir, { recursive: true, force: true });
	});

	it('runs a full review through the real RPCs with one fenced event per checkpoint', async () => {
		const fence = await admitAndClaim(1, 'What should we prioritize next?');
		const harness = runnerFor(happyScript);
		const result = await harness.run(fence, 1);

		expect(result.outcome).toMatchObject({
			kind: 'completed',
			quality: 'complete',
			answerSource: 'editor',
			answerText: EDITOR_TEXT
		});
		expect(result.settlementsDrained).toBe(true);
		const steps = await admin.query(
			`SELECT step_key, status, attempts_used FROM public.chat_turn_workflow_steps WHERE turn_run_id = $1 ORDER BY step_key`,
			[fence.turnRunId]
		);
		expect(steps.rows).toEqual([
			{ step_key: 'editor', status: 'accepted', attempts_used: 1 },
			{ step_key: 'planner', status: 'accepted', attempts_used: 1 },
			{ step_key: 'project_analyst', status: 'accepted', attempts_used: 1 },
			{ step_key: 'risk_reviewer', status: 'accepted', attempts_used: 1 }
		]);
		expect(await dispatchRows(fence.turnRunId)).toEqual([
			expect.objectContaining({
				step: 'planner',
				kind: 'planner',
				state: 'settled',
				actual: 1_100
			}),
			expect.objectContaining({ kind: 'specialist', state: 'settled', actual: 1_100 }),
			expect.objectContaining({ kind: 'specialist', state: 'settled', actual: 1_100 }),
			expect.objectContaining({
				step: 'editor',
				kind: 'editor',
				state: 'settled',
				actual: 1_100
			})
		]);
		const events = await admin.query(
			`SELECT sequence_index FROM public.chat_turn_events
			WHERE turn_run_id = $1 AND execution_generation = $2 ORDER BY sequence_index`,
			[fence.turnRunId, fence.executionGeneration]
		);
		// Progress checkpoints are event rows. The single answer text batch takes the
		// stream sequence before synthesis acceptance but lives in chat_turn_stream_state.
		const sequences = events.rows.map((row) => Number(row.sequence_index));
		expect(sequences).toEqual([1, 2, 3, 4, 5, 6, 8]);
		const answer = await harness.store.loadRun(fence.turnRunId);
		expect(answer?.answer).toMatchObject({
			status: 'accepted',
			quality: 'complete',
			text: EDITOR_TEXT
		});
	}, 60_000);

	it('recovers a killed worker, holds its unknown charge, and reuses accepted work in generation 2', async () => {
		const fence = await admitAndClaim(2, 'Where are the schedule risks?');
		// The first worker's process dies: once `crashed` is set, nothing it sends reaches the database.
		let crashed = false;
		const first = runnerFor(
			(call) =>
				call.role === 'risk_reviewer'
					? reportReply(call.role, ['task-1'], { stallAfterText: true })
					: happyScript(call),
			() => crashed
		);
		const running = first.run(fence, 2);
		const started = Date.now();
		for (;;) {
			const rows = await dispatchRows(fence.turnRunId);
			const steps = await admin.query(
				`SELECT status FROM public.chat_turn_workflow_steps WHERE turn_run_id = $1 AND step_key = 'project_analyst'`,
				[fence.turnRunId]
			);
			if (
				steps.rows[0]?.status === 'accepted' &&
				rows.some((row) => row.step === 'risk_reviewer' && row.state === 'dispatching')
			)
				break;
			if (Date.now() - started > 10_000)
				throw new Error('first generation never reached the reviewer');
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
		crashed = true;
		first.controller.abort(new Error('worker process killed'));
		await running;
		expect(
			(await dispatchRows(fence.turnRunId)).find((row) => row.step === 'risk_reviewer')?.state
		).toBe('dispatching');

		const control = new SupabaseAgenticChatExecutionControlAdapter(
			supabaseShim(service) as never
		);
		const recovery = await control.recoverWorkflow({
			...fence,
			failureClass: 'timeout_post_start',
			errorMessage: 'Agentic Chat worker interrupted while queue ownership was stalled'
		});
		expect(recovery).toMatchObject({ outcome: 'retry_scheduled', uncertainCostHeld: true });

		const second = runnerFor(happyScript);
		const gen2 = await leaseAndClaim(fence.turnRunId);
		expect(gen2.executionGeneration).toBe(fence.executionGeneration + 1);
		const result = await second.run(gen2, 2);

		expect(result.outcome).toMatchObject({
			kind: 'completed',
			quality: 'complete',
			answerSource: 'editor'
		});
		expect(second.provider.callsFor('planner')).toHaveLength(0);
		expect(second.provider.callsFor('project_analyst')).toHaveLength(0);
		expect(second.provider.callsFor('risk_reviewer')).toHaveLength(1);
		const reviewer = (await dispatchRows(fence.turnRunId)).filter(
			(row) => row.step === 'risk_reviewer'
		);
		expect(reviewer.map((row) => row.state).sort()).toEqual(['settled', 'uncertain']);
		const exposure = await admin.query(
			'SELECT public.agentic_chat_workflow_exposure_micro_usd_v1($1) AS value',
			[fence.turnRunId]
		);
		const uncertain = reviewer.find((row) => row.state === 'uncertain')!;
		// Planner, analyst, reviewer (generation 2) and editor settled; the dead request stays held.
		expect(Number(exposure.rows[0]!.value)).toBe(4 * 1_100 + uncertain.reserved);
		const gen2Events = await admin.query(
			`SELECT min(sequence_index)::int AS first FROM public.chat_turn_events WHERE turn_run_id = $1 AND execution_generation = $2`,
			[fence.turnRunId, gen2.executionGeneration]
		);
		expect(gen2Events.rows[0]!.first).toBe(1);
	}, 60_000);

	it('lets exactly one specialist past the synthesis headroom after a real planner overrun', async () => {
		const fence = await admitAndClaim(3, 'What could derail the launch?');
		const harness = runnerFor((call) =>
			call.role === 'planner'
				? { ...plannerReply(), costUsd: 0.19 }
				: call.role === 'editor'
					? happyScript(call)
					: reportReply(call.role, ['task-1'], { delayMs: 30 })
		);
		const result = await harness.run(fence, 3);

		const steps = await admin.query(
			`SELECT step_key, status, failure_code FROM public.chat_turn_workflow_steps
			WHERE turn_run_id = $1 AND step_key IN ('project_analyst', 'risk_reviewer')`,
			[fence.turnRunId]
		);
		expect(steps.rows.filter((row) => row.status === 'accepted')).toHaveLength(1);
		expect(steps.rows.filter((row) => row.status === 'failed')).toEqual([
			expect.objectContaining({ failure_code: 'dispatch_synthesis_headroom_required' })
		]);
		expect(result.outcome).toMatchObject({
			kind: 'completed',
			quality: 'partial',
			answerSource: 'editor'
		});
		const planner = (await dispatchRows(fence.turnRunId)).find(
			(row) => row.step === 'planner'
		)!;
		expect(planner.actual).toBe(190_000);
	}, 60_000);
});

async function availablePort(): Promise<number> {
	return new Promise((resolvePort, reject) => {
		const server = createServer();
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			server.close(() =>
				typeof address === 'object' && address
					? resolvePort(address.port)
					: reject(new Error('no port'))
			);
		});
	});
}
