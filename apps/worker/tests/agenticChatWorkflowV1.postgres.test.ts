// apps/worker/tests/agenticChatWorkflowV1.postgres.test.ts
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	AGENTIC_CHAT_WORKFLOW_MAX_OUTPUT_TOKENS,
	AGENTIC_CHAT_WORKFLOW_PLAN_STEPS_V1,
	AGENTIC_CHAT_WORKFLOW_POLICY_V1,
	AGENTIC_CHAT_WORKFLOW_REQUEST_HASH_VERSION,
	buildAgenticChatWorkflowReviewIntentV1,
	canonicalizeAgenticChatJson,
	computeAgenticChatWorkflowReservationMicroUsdV1,
	hashAgenticChatWorkflowRequestV1,
	normalizeAgenticChatText,
	validateAgenticChatRawWorkflowInputV4,
	type AgenticChatRawWorkflowInputV4,
	type JsonValue
} from '@buildos/shared-types';

// Loads the fixture and both migrations, then runs the single-session contract.
const CONTRACT = 'supabase/tests/20260914203008_agentic_chat_workflow_v1.test.sql';
const USER_ID = 'b1000000-0000-4000-8000-000000000001';
const PROJECT_ID = 'b3000000-0000-4000-8000-000000000001';
const SESSION_ID = 'b4000000-0000-4000-8000-000000000001';
const MODEL = 'deepseek/deepseek-v4-flash';
const PRICING = {
	version: 'agentic_chat_workflow_pricing_v1',
	model: MODEL,
	canonicalModel: 'deepseek/deepseek-v4-flash-20260801',
	promptUsdPerMillion: '0.27',
	completionUsdPerMillion: '1.1',
	cacheReadUsdPerMillion: '0.0055',
	requestUsd: '0',
	source: 'openrouter_models_api',
	observedAt: '2026-09-14T12:00:00Z'
};
const EVIDENCE = [
	{ kind: 'task', id: 'task-1', version: 'v1', observedAt: '2026-09-14T12:00:00Z' }
];
const PLANNER_RESULT = {
	version: 'agentic_chat_workflow_planner_result_v1',
	assignments: { project_analyst: { focus: 'next actions' }, risk_reviewer: { focus: 'risks' } }
};

const id = (prefix: string, n: number) =>
	`${prefix}000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const canonicalHash = (value: unknown) => sha256(canonicalizeAgenticChatJson(value as JsonValue));
const projection = (phase: string) => ({
	workflow: { version: 'agentic_chat_workflow_projection_v1', phase }
});
const progress = (phase: string) => ({ type: 'workflow_progress', ...projection(phase) });

const postgresAvailable = ['initdb', 'pg_ctl', 'psql'].every(
	(command) => spawnSync(command, ['--version'], { stdio: 'ignore' }).status === 0
);
const describePostgres = postgresAvailable ? describe : describe.skip;

type Receipt = Record<string, any>;

describePostgres('agentic chat workflow v1 against disposable PostgreSQL', () => {
	const repositoryRoot = resolve(process.cwd(), '../..');
	let tempDir = '';
	let dataDir = '';
	let contractOutput = '';
	let admin: Client;
	let services: Client[] = [];

	async function rpc(client: Client, name: string, ...args: unknown[]): Promise<Receipt> {
		const values = args.map((value) =>
			value !== null && typeof value === 'object' ? JSON.stringify(value) : value
		);
		const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');
		const { rows } = await client.query(
			`SELECT public.${name}(${placeholders}) AS data`,
			values
		);
		return rows[0]!.data as Receipt;
	}

	async function admit(client: Client, n: number, message: string, sessionId: string | null) {
		const clientTurnId = `ts-client-${n}`;
		const request = {
			clientTurnId,
			streamRunId: `ts-stream-${n}`,
			context: { type: 'project' as const, entityId: PROJECT_ID, projectId: PROJECT_ID },
			message,
			reviewIntent: buildAgenticChatWorkflowReviewIntentV1(message),
			policy: AGENTIC_CHAT_WORKFLOW_POLICY_V1,
			policyRef: 'policy-ref-ts'
		};
		return rpc(
			client,
			'create_agentic_chat_workflow_turn_with_job_v1',
			USER_ID,
			sessionId,
			id('b5', n),
			id('b6', n),
			id('b7', n),
			request.streamRunId,
			clientTurnId,
			id('b8', n),
			id('b9', n),
			PROJECT_ID,
			message,
			request.reviewIntent,
			AGENTIC_CHAT_WORKFLOW_POLICY_V1,
			request.policyRef,
			await hashAgenticChatWorkflowRequestV1(request),
			null
		);
	}

	async function lease(n: number, token: string): Promise<string> {
		const { rows } = await admin.query(
			`UPDATE public.queue_jobs jobs
			SET status = 'processing', processing_token = $2, started_at = now()
			FROM public.chat_turn_runs turns
			WHERE turns.id = $1 AND jobs.id = turns.queue_job_id
			RETURNING jobs.id`,
			[id('b5', n), token]
		);
		return rows[0]!.id as string;
	}

	beforeAll(async () => {
		tempDir = mkdtempSync('/tmp/buildos-workflow-v1-pg-');
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
			{ stdio: 'pipe' }
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
				{
					cause: error
				}
			);
		}
		contractOutput = execFileSync(
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

		const connection = { host: socketDir, port, user: 'postgres', database: 'postgres' };
		admin = new Client(connection);
		await admin.connect();
		services = await Promise.all(
			Array.from({ length: 4 }, async () => {
				const client = new Client(connection);
				await client.connect();
				await client.query('SET ROLE service_role');
				return client;
			})
		);

		await admin.query('INSERT INTO public.users (id) VALUES ($1)', [USER_ID]);
		await admin.query('INSERT INTO auth.users (id) VALUES ($1)', [USER_ID]);
		await admin.query(
			`INSERT INTO public.onto_actors (id, kind, name, user_id) VALUES ($1, 'human', 'Owner', $2)`,
			[id('b2', 1), USER_ID]
		);
		await admin.query(
			`INSERT INTO public.onto_projects (id, name, created_by) VALUES ($1, 'Kiln Studio', $2)`,
			[PROJECT_ID, id('b2', 1)]
		);
		await admin.query(
			`INSERT INTO public.chat_sessions (id, user_id, context_type, entity_id, status)
			VALUES ($1, $2, 'project', $3, 'active')`,
			[SESSION_ID, USER_ID, PROJECT_ID]
		);
		const history = [
			['user', 'Plan the café 🚀 launch — "soft open" first?\nThen\tpermits \\ inspections.'],
			[
				'assistant',
				'Café timeline:\u2028 book the kiln vent, then the naïve "dry run" \u0001 check.'
			]
		];
		for (const [index, [role, content]] of history.entries()) {
			await admin.query(
				`INSERT INTO public.chat_messages (id, session_id, user_id, role, content, created_at)
				VALUES ($1, $2, $3, $4, $5, now() - make_interval(mins => $6))`,
				[id('ba', index + 1), SESSION_ID, USER_ID, role, content, 10 - index]
			);
		}
	}, 120_000);

	afterAll(async () => {
		await Promise.all(services.map((client) => client.end().catch(() => undefined)));
		await admin?.end().catch(() => undefined);
		if (dataDir)
			spawnSync('pg_ctl', ['-D', dataDir, 'stop', '-m', 'fast'], { stdio: 'ignore' });
		if (tempDir) rmSync(tempDir, { recursive: true, force: true });
	});

	it('passes the single-session SQL contract', () => {
		expect(contractOutput).toContain('agentic_chat_workflow_v1_contract_ok');
	});

	it('derives normalization, canonical JSON, policy, and step constants identically in TS and SQL', async () => {
		const service = services[0]!;
		for (const value of [
			'\u00a0\ufeff Plan\r\nnext\u3000',
			'\u0085kept\u0085',
			'Cafe\u0301 plan',
			'\u2028line\u2029',
			'\t\u000b\f x \n'
		]) {
			const { rows } = await service.query(
				'SELECT public.agentic_chat_normalize_text_v1($1) AS value',
				[value]
			);
			expect(rows[0]!.value).toBe(normalizeAgenticChatText(value));
		}
		const sample = {
			b: [1, -2, 0, 'x"y\\z', null, true],
			a: { Z: '\u0001\u001f\u007f', a_: 'ä 🚀 \u2028', A: { nested: [] }, '': 'empty key' }
		};
		const { rows } = await service.query(
			'SELECT public.agentic_chat_canonical_json_v1($1::jsonb) AS value',
			[JSON.stringify(sample)]
		);
		expect(rows[0]!.value).toBe(canonicalizeAgenticChatJson(sample));

		await expect(rpc(service, 'agentic_chat_workflow_policy_v1')).resolves.toEqual(
			AGENTIC_CHAT_WORKFLOW_POLICY_V1
		);
		await expect(rpc(service, 'agentic_chat_workflow_plan_steps_v1')).resolves.toEqual(
			AGENTIC_CHAT_WORKFLOW_PLAN_STEPS_V1
		);
		for (const [step, tokens] of Object.entries(AGENTIC_CHAT_WORKFLOW_MAX_OUTPUT_TOKENS)) {
			await expect(
				rpc(service, 'agentic_chat_workflow_max_output_tokens_v1', step)
			).resolves.toBe(tokens);
		}
	});

	it('admits with a TS-computed hash and stores a v4 artifact the TS reader verifies byte-for-byte', async () => {
		const message = normalizeAgenticChatText(
			'Review the café 🚀 launch — what “must” happen next?'
		);
		const receipt = await admit(services[0]!, 1, message, SESSION_ID);
		expect(receipt).toMatchObject({ outcome: 'newly_admitted', history_message_count: 2 });

		const { rows } = await admin.query(
			`SELECT artifact_version, request, history, history_source, request_hash, history_hash, content_hash,
				history_bytes, content_bytes, created_at, retain_until
			FROM public.chat_turn_input_artifacts WHERE id = $1`,
			[id('b7', 1)]
		);
		const row = rows[0]!;
		const input: AgenticChatRawWorkflowInputV4 = {
			artifactVersion: row.artifact_version,
			request: row.request,
			historySource: row.history_source,
			history: row.history,
			requestHashVersion: AGENTIC_CHAT_WORKFLOW_REQUEST_HASH_VERSION,
			requestHash: row.request_hash,
			historyHash: row.history_hash,
			contentHash: row.content_hash,
			historyBytes: row.history_bytes,
			contentBytes: row.content_bytes,
			createdAt: (row.created_at as Date).toISOString(),
			retainUntil: (row.retain_until as Date).toISOString()
		};
		const expected = {
			artifactId: id('b7', 1),
			turnRunId: id('b5', 1),
			sessionId: SESSION_ID,
			userId: USER_ID
		};
		await expect(validateAgenticChatRawWorkflowInputV4(input, expected)).resolves.toEqual({
			ok: true,
			input
		});
		expect(input.history.map((item) => item.content)).toEqual([
			'Plan the café 🚀 launch — "soft open" first?\nThen\tpermits \\ inspections.',
			'Café timeline:\u2028 book the kiln vent, then the naïve "dry run" \u0001 check.'
		]);

		const tampered = structuredClone(input);
		tampered.history[1]!.content = tampered.history[1]!.content.replace('\u0001', '');
		await expect(
			validateAgenticChatRawWorkflowInputV4(tampered, expected)
		).resolves.toMatchObject({
			ok: false,
			code: 'history_hash_mismatch'
		});
	});

	it('serializes concurrent duplicate admission to one turn', async () => {
		const outcomes = await Promise.all(
			[services[1]!, services[2]!].map((client) =>
				admit(client, 2, 'Where are the schedule risks?', null)
			)
		);
		expect(outcomes.map((receipt) => receipt.outcome).sort()).toEqual([
			'matching_duplicate',
			'newly_admitted'
		]);
		const { rows } = await admin.query(
			'SELECT count(*)::int AS count FROM public.chat_turn_runs WHERE client_turn_id = $1',
			['ts-client-2']
		);
		expect(rows[0]!.count).toBe(1);
	});

	it('lets exactly one concurrent context checkpoint win and permits no dispatch from the raw request', async () => {
		const token = id('bb', 2);
		const job = await lease(2, token);
		const turn = id('b5', 2);
		await expect(
			rpc(services[0]!, 'claim_agentic_chat_turn', turn, job, token)
		).resolves.toMatchObject({
			outcome: 'claimed'
		});
		await expect(
			rpc(
				services[0]!,
				'reserve_agentic_chat_workflow_dispatch_v1',
				turn,
				job,
				token,
				1,
				id('bc', 1),
				'planner',
				id('bd', 1),
				1,
				'planner',
				MODEL,
				PRICING,
				2_000,
				1_200
			)
		).resolves.toMatchObject({ outcome: 'stale_claim' });

		const { rows } = await admin.query(
			'SELECT request_hash FROM public.chat_turn_runs WHERE id = $1',
			[turn]
		);
		const identity = {
			userId: USER_ID,
			projectId: PROJECT_ID,
			accessCheckedAt: '2026-09-14T12:00:00Z',
			contextLoadedAt: '2026-09-14T12:00:00Z',
			cacheRefUsed: null
		};
		const receipts = await Promise.all(
			[1, 2].map((n) =>
				rpc(
					services[n]!,
					'accept_agentic_chat_workflow_context_v1',
					turn,
					job,
					token,
					1,
					id('be', n),
					id('b7', 2),
					rows[0]!.request_hash,
					'agentic_chat_prepared_context_v1',
					identity,
					EVIDENCE,
					{ project: { name: 'Kiln Studio', variant: n } },
					sha256(`context-${n}`),
					30,
					id('bf', n),
					projection('assessing'),
					progress('assessing')
				)
			)
		);
		expect(receipts.map((receipt) => receipt.outcome).sort()).toEqual([
			'accepted',
			'context_conflict'
		]);
		const events = await admin.query(
			'SELECT count(*)::int AS count FROM public.chat_turn_events WHERE turn_run_id = $1',
			[turn]
		);
		expect(events.rows[0]!.count).toBe(1);
	});

	it('never lets concurrent reservations cross the synthesis headroom, and settles idempotently', async () => {
		const turn = id('b5', 2);
		const token = id('bb', 2);
		const { rows } = await admin.query(
			`SELECT turns.queue_job_id AS job, turns.request_hash, runs.context_id
			FROM public.chat_turn_runs turns JOIN public.chat_turn_workflow_runs runs ON runs.turn_run_id = turns.id
			WHERE turns.id = $1`,
			[turn]
		);
		const { job, request_hash: requestHash, context_id: contextId } = rows[0]!;
		const service = services[0]!;

		await expect(
			rpc(
				service,
				'claim_agentic_chat_workflow_step_v1',
				turn,
				job,
				token,
				1,
				null,
				'planner',
				id('bd', 1)
			)
		).resolves.toMatchObject({ outcome: 'claimed' });
		const planner = await rpc(
			service,
			'reserve_agentic_chat_workflow_dispatch_v1',
			turn,
			job,
			token,
			1,
			id('bc', 1),
			'planner',
			id('bd', 1),
			1,
			'planner',
			MODEL,
			PRICING,
			2_000,
			1_200
		);
		expect(planner).toMatchObject({
			outcome: 'reserved',
			reserved_micro_usd: computeAgenticChatWorkflowReservationMicroUsdV1(2_000, 1_200)
		});
		await expect(
			rpc(
				service,
				'begin_agentic_chat_workflow_dispatch_v1',
				turn,
				job,
				token,
				1,
				id('bc', 1)
			)
		).resolves.toMatchObject({ dispatch_permitted: true });
		// A large overrun is charged at actual cost and shrinks what remains.
		await expect(
			rpc(
				service,
				'settle_agentic_chat_workflow_dispatch_v1',
				id('bc', 1),
				planner.settlement_token,
				'gen-planner',
				{ total_tokens: 1 },
				100_000,
				'settled'
			)
		).resolves.toMatchObject({
			outcome: 'settled',
			overrun_micro_usd: 100_000 - planner.reserved_micro_usd
		});

		const plannerCanonical = canonicalizeAgenticChatJson(PLANNER_RESULT);
		await expect(
			rpc(
				service,
				'accept_agentic_chat_workflow_step_result_v1',
				turn,
				job,
				token,
				1,
				null,
				'planner',
				id('bd', 1),
				'complete',
				PLANNER_RESULT,
				sha256(plannerCanonical),
				Buffer.byteLength(plannerCanonical),
				id('bf', 3),
				projection('assessing'),
				progress('assessing')
			)
		).resolves.toMatchObject({ outcome: 'accepted' });
		const plan = {
			version: 'agentic_chat_project_review_plan_v1',
			contextId,
			requestHash,
			planner: {
				outcome: 'accepted',
				stepAttemptId: id('bd', 1),
				resultHash: sha256(plannerCanonical)
			},
			steps: AGENTIC_CHAT_WORKFLOW_PLAN_STEPS_V1,
			assignments: { planner: {}, ...PLANNER_RESULT.assignments, editor: {} }
		};
		const planHash = canonicalHash(plan);
		await expect(
			rpc(
				service,
				'install_agentic_chat_workflow_plan_v1',
				turn,
				job,
				token,
				1,
				contextId,
				'agentic_chat_project_review_plan_v1',
				plan,
				planHash,
				id('bf', 4),
				projection('executing'),
				progress('executing')
			)
		).resolves.toMatchObject({ outcome: 'installed' });
		for (const [step, attempt] of [
			['project_analyst', id('bd', 2)],
			['risk_reviewer', id('bd', 3)]
		] as const) {
			await expect(
				rpc(
					service,
					'claim_agentic_chat_workflow_step_v1',
					turn,
					job,
					token,
					1,
					planHash,
					step,
					attempt
				)
			).resolves.toMatchObject({ outcome: 'claimed' });
		}

		const attempts = [
			['project_analyst', id('bd', 2), 1, 'specialist'],
			['project_analyst', id('bd', 2), 2, 'provider_fallback'],
			['risk_reviewer', id('bd', 3), 1, 'specialist'],
			['risk_reviewer', id('bd', 3), 2, 'provider_fallback']
		] as const;
		const reservations = await Promise.all(
			attempts.map(([step, attempt, physical, kind], index) =>
				rpc(
					services[index]!,
					'reserve_agentic_chat_workflow_dispatch_v1',
					turn,
					job,
					token,
					1,
					id('bc', 10 + index),
					step,
					attempt,
					physical,
					kind,
					MODEL,
					PRICING,
					131_072,
					4_000
				)
			)
		);
		const maxReservation = computeAgenticChatWorkflowReservationMicroUsdV1(131_072, 4_000);
		expect(reservations.map((receipt) => receipt.outcome).sort()).toEqual([
			'reserved',
			'reserved',
			'synthesis_headroom_required',
			'synthesis_headroom_required'
		]);
		expect(
			reservations
				.filter((receipt) => receipt.outcome === 'reserved')
				.map((receipt) => receipt.reserved_micro_usd)
		).toEqual([maxReservation, maxReservation]);
		const exposure = await rpc(service, 'agentic_chat_workflow_exposure_micro_usd_v1', turn);
		expect(Number(exposure)).toBe(100_000 + 2 * maxReservation);
		expect(Number(exposure)).toBeLessThanOrEqual(
			AGENTIC_CHAT_WORKFLOW_POLICY_V1.maxSpendMicroUsd -
				AGENTIC_CHAT_WORKFLOW_POLICY_V1.synthesisHeadroomMicroUsd
		);

		const winner = reservations.findIndex((receipt) => receipt.outcome === 'reserved');
		await expect(
			rpc(
				service,
				'begin_agentic_chat_workflow_dispatch_v1',
				turn,
				job,
				token,
				1,
				id('bc', 10 + winner)
			)
		).resolves.toMatchObject({ dispatch_permitted: true });
		const settlements = await Promise.all(
			[services[1]!, services[2]!].map((client) =>
				rpc(
					client,
					'settle_agentic_chat_workflow_dispatch_v1',
					id('bc', 10 + winner),
					reservations[winner]!.settlement_token,
					'gen-specialist',
					{ total_tokens: 2 },
					12_000,
					'settled'
				)
			)
		);
		expect(settlements.map((receipt) => receipt.outcome).sort()).toEqual([
			'already_settled',
			'settled'
		]);
	});
});

async function availablePort(): Promise<number> {
	return await new Promise((resolvePort, rejectPort) => {
		const server = createServer();
		server.once('error', rejectPort);
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			if (!address || typeof address === 'string') {
				server.close();
				rejectPort(new Error('Could not allocate a PostgreSQL test port'));
				return;
			}
			server.close((error) => (error ? rejectPort(error) : resolvePort(address.port)));
		});
	});
}
