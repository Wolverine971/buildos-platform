// apps/worker/tests/agenticChatWorkflowPreparation.postgres.test.ts
//
// Tasker 86 end to end against the frozen workflow v1 migrations in a disposable
// local PostgreSQL: TS admission arguments, the real claim, the real v4 input
// reader, the real preparation store RPCs, and the real terminal writer. Only the
// project context loader, stream publisher, and workflow runner are fakes, and no
// provider exists anywhere in this file.
// DISPOSABLE DATABASE ONLY. Never point this at a linked or hosted database.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
	AGENTIC_CHAT_WORKFLOW_POLICY_V1,
	buildAgenticChatWorkflowReviewIntentV1,
	hashAgenticChatWorkflowRequestV1,
	type AgenticChatTurnClaimResultV1
} from '@buildos/shared-types';
import type { MasterPromptContext } from '@buildos/agentic-chat-runtime/context';
import { SupabaseAgenticChatExecutionControlAdapter } from '../src/workers/agentic-chat/executionControl';
import { SupabaseAgenticChatExecutionInputAdapter } from '../src/workers/agentic-chat/executionInput';
import { SupabaseAgenticChatWorkflowPreparationStore } from '../src/workers/agentic-chat/workflow/preparation-store';
import {
	buildAgenticChatWorkflowContextV1,
	hashAgenticChatWorkflowContextPayloadV1
} from '../src/workers/agentic-chat/workflow/prepared-context';
import { AgenticChatWorkflowTurnPreparer } from '../src/workers/agentic-chat/workflow/raw-turn-preparation';
import {
	buildAgenticChatWorkflowProgressEventV1,
	buildAgenticChatWorkflowProjectionV1,
	buildAgenticChatWorkflowStreamProjectionV1
} from '../src/workers/agentic-chat/workflow/workflow-projection';
import {
	type AgenticChatWorkflowPreparedTurnV1,
	type AgenticChatWorkflowRunnerPortV1,
	unavailableAgenticChatWorkflowRunner
} from '../src/workers/agentic-chat/workflow/workflow-runner-port';

const FIXTURE = 'supabase/tests/fixtures/agentic_chat_workflow_v1_base.sql';
const MIGRATIONS = [
	'supabase/migrations/20260914203007_agentic_chat_workflow_v1_storage.sql',
	'supabase/migrations/20260914203008_agentic_chat_workflow_v1_dispatch_recovery.sql'
];
const USER_ID = 'e1000000-0000-4000-8000-000000000001';
const OTHER_USER_ID = 'e1000000-0000-4000-8000-000000000002';
const ACTOR_ID = 'e2000000-0000-4000-8000-000000000001';
const PROJECT_ID = 'e3000000-0000-4000-8000-000000000001';
const REVOKED_PROJECT_ID = 'e3000000-0000-4000-8000-000000000002';

const id = (prefix: string, n: number) =>
	`${prefix}000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const postgresAvailable = ['initdb', 'pg_ctl', 'psql'].every(
	(command) => spawnSync(command, ['--version'], { stdio: 'ignore' }).status === 0
);
const describePostgres = postgresAvailable ? describe : describe.skip;

type Claim = Extract<
	AgenticChatTurnClaimResultV1,
	{ outcome: 'claimed' | 'matching_current_claim' }
>;
type RpcResult = { data: unknown; error: { code: string; message: string } | null };
type RpcInterceptor = (name: string, run: () => Promise<RpcResult>) => Promise<RpcResult>;

/**
 * A minimal PostgREST stand-in over one `service_role` connection. Named-argument
 * calls prove every `p_*` name the adapters send exists on the SQL signature.
 */
function createPgSupabaseShim(client: Client) {
	const signatures = new Map<
		string,
		Array<{ names: string[]; types: string[]; defaults: number }>
	>();
	let interceptor: RpcInterceptor | null = null;
	const rpcCalls: string[] = [];

	async function overloads(name: string) {
		const cached = signatures.get(name);
		if (cached) return cached;
		const { rows } = await client.query(
			`SELECT p.proargnames AS names, p.pronargs AS nargs, p.pronargdefaults AS defaults,
				ARRAY(SELECT format_type(t, NULL) FROM unnest(p.proargtypes) WITH ORDINALITY AS u(t, o) ORDER BY o) AS types
			FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
			WHERE n.nspname = 'public' AND p.proname = $1`,
			[name]
		);
		const parsed = rows.map((row) => ({
			names: (row.names as string[]).slice(0, row.nargs as number),
			types: row.types as string[],
			defaults: row.defaults as number
		}));
		signatures.set(name, parsed);
		return parsed;
	}

	async function execute(name: string, args: Record<string, unknown>): Promise<RpcResult> {
		try {
			const keys = Object.keys(args);
			const match = (await overloads(name)).find(
				(candidate) =>
					keys.every((key) => candidate.names.includes(key)) &&
					candidate.names
						.slice(0, candidate.names.length - candidate.defaults)
						.every((required) => keys.includes(required))
			);
			if (!match) throw new Error(`No ${name} overload accepts ${keys.join(', ')}`);
			const values = keys.map((key) => {
				const value = args[key];
				const type = match.types[match.names.indexOf(key)]!;
				if (type.endsWith('[]')) return value;
				return value !== null && typeof value === 'object' ? JSON.stringify(value) : value;
			});
			const call = keys
				.map(
					(key, index) =>
						`${key} => $${index + 1}::${match.types[match.names.indexOf(key)]}`
				)
				.join(', ');
			const { rows } = await client.query(`SELECT public.${name}(${call}) AS data`, values);
			return { data: rows[0]?.data ?? null, error: null };
		} catch (error) {
			const pgError = error as { code?: string; message?: string };
			if (typeof pgError.code === 'string') {
				return {
					data: null,
					error: { code: pgError.code, message: pgError.message ?? '' }
				};
			}
			throw error;
		}
	}

	return {
		rpcCalls,
		intercept(next: RpcInterceptor | null) {
			interceptor = next;
		},
		async rpc(name: string, args: Record<string, unknown>): Promise<RpcResult> {
			rpcCalls.push(name);
			const run = () => execute(name, args);
			return interceptor ? interceptor(name, run) : run();
		},
		from(table: string) {
			if (!/^[a-z_]+$/.test(table)) throw new Error('invalid table');
			return {
				select(columns: string) {
					if (!/^[a-z0-9_,]+$/.test(columns)) throw new Error('unsupported select');
					const filters: Array<[string, unknown]> = [];
					const chain = {
						eq(column: string, value: unknown) {
							if (!/^[a-z_]+$/.test(column)) throw new Error('invalid column');
							filters.push([column, value]);
							return chain;
						},
						async maybeSingle() {
							rpcCalls.push(`select:${table}`);
							try {
								const where = filters
									.map(([column], index) => `${column} = $${index + 1}`)
									.join(' AND ');
								const { rows } = await client.query(
									`SELECT row_to_json(r) AS data FROM (SELECT ${columns} FROM public.${table} WHERE ${where}) r`,
									filters.map(([, value]) => value)
								);
								if (rows.length > 1) {
									return {
										data: null,
										error: { code: 'PGRST116', message: 'multiple rows' }
									};
								}
								return { data: rows[0]?.data ?? null, error: null };
							} catch (error) {
								const pgError = error as { code?: string; message?: string };
								return {
									data: null,
									error: {
										code: pgError.code ?? '',
										message: pgError.message ?? ''
									}
								};
							}
						}
					};
					return chain;
				}
			};
		}
	};
}

function projectContext(projectId: string): MasterPromptContext {
	return {
		contextType: 'project',
		entityId: projectId,
		projectId,
		contextLoadSource: 'rpc',
		timezone: 'America/New_York',
		data: {
			project: {
				id: projectId,
				name: 'Kiln Studio — café 🚀',
				description: 'Line one\nline two   "quoted" \\ backslash \u0001 control',
				updated_at: '2026-09-17T10:00:00.123456+00:00',
				doc_structure: { root: [{ id: 'doc-1' }] }
			},
			goals: [{ id: 'goal-1', name: 'Open by spring', updated_at: '2026-09-10T00:00:00Z' }],
			tasks: [
				{
					id: 'task-1',
					title: 'Order kiln vent',
					updated_at: '2026-09-11T00:00:00Z',
					priority: 1.5
				},
				{
					id: 'task-2',
					title: 'Book inspection',
					created_at: '2026-09-12T00:00:00Z',
					n: 1e21
				}
			],
			documents: [{ id: 'doc-1', title: 'Permits', content: 'p'.repeat(6_000) }],
			events: []
		}
	} as unknown as MasterPromptContext;
}

function createFakePublisher() {
	return {
		registerTurn: vi.fn(),
		publishReconcileHint: vi.fn(async () => undefined),
		publishCommittedSemantic: vi.fn(async (..._args: unknown[]) => 'sent' as const),
		publishTerminal: vi.fn(async (..._args: unknown[]) => 'sent' as const),
		getSnapshot: vi.fn(() => ({ durableSequence: 0, pendingEvents: 0, busy: false })),
		unregisterTurn: vi.fn(),
		abandonTurn: vi.fn()
	};
}

describePostgres('workflow preparation against disposable PostgreSQL', () => {
	const repositoryRoot = resolve(process.cwd(), '../..');
	let tempDir = '';
	let dataDir = '';
	let admin: Client;
	let service: Client;
	let shim: ReturnType<typeof createPgSupabaseShim>;

	async function admit(n: number, projectId = PROJECT_ID, sessionId: string | null = null) {
		const message = `Review the project: what should happen next? (${n})`;
		const request = {
			clientTurnId: `prep-client-${n}`,
			streamRunId: `prep-stream-${n}`,
			context: { type: 'project' as const, entityId: projectId, projectId },
			message,
			reviewIntent: buildAgenticChatWorkflowReviewIntentV1(message),
			policy: AGENTIC_CHAT_WORKFLOW_POLICY_V1,
			policyRef: 'internal-project-review:v1'
		};
		const { data, error } = await shim.rpc('create_agentic_chat_workflow_turn_with_job_v1', {
			p_user_id: USER_ID,
			p_session_id: sessionId,
			p_turn_run_id: id('e5', n),
			p_user_message_id: id('e6', n),
			p_request_artifact_id: id('e7', n),
			p_stream_run_id: request.streamRunId,
			p_client_turn_id: request.clientTurnId,
			p_transport_decision_id: id('e8', n),
			p_correlation_id: id('e9', n),
			p_project_id: projectId,
			p_message: message,
			p_review_intent: request.reviewIntent,
			p_policy: AGENTIC_CHAT_WORKFLOW_POLICY_V1,
			p_policy_ref: request.policyRef,
			p_request_hash: await hashAgenticChatWorkflowRequestV1(request),
			p_cache_ref: null
		});
		expect(error).toBeNull();
		expect(data).toMatchObject({ outcome: 'newly_admitted', execution_may_start: false });
		return data as Record<string, string>;
	}

	async function leaseAndClaim(
		n: number,
		attempt = 1
	): Promise<{ claim: Claim; token: string; job: string }> {
		const token = id('ea', n * 10 + attempt);
		const { rows } = await admin.query(
			`UPDATE public.queue_jobs jobs
			SET status = 'processing', processing_token = $2, started_at = now()
			FROM public.chat_turn_runs turns
			WHERE turns.id = $1 AND jobs.id = turns.queue_job_id
			RETURNING jobs.id`,
			[id('e5', n), token]
		);
		const job = rows[0]!.id as string;
		const claim = await new SupabaseAgenticChatExecutionControlAdapter(shim as never).claim({
			turnRunId: id('e5', n),
			queueJobId: job,
			processingToken: token
		});
		expect(claim.outcome).toBe('claimed');
		return { claim: claim as Claim, token, job };
	}

	function preparer(input: {
		runner?: AgenticChatWorkflowRunnerPortV1;
		loadContext?: ReturnType<typeof vi.fn>;
		publisher?: ReturnType<typeof createFakePublisher>;
	}) {
		const publisher = input.publisher ?? createFakePublisher();
		const loadContext =
			input.loadContext ??
			vi.fn(async ({ projectId }: { projectId: string }) => projectContext(projectId));
		return {
			publisher,
			loadContext,
			preparer: new AgenticChatWorkflowTurnPreparer({
				input: new SupabaseAgenticChatExecutionInputAdapter(shim as never),
				store: new SupabaseAgenticChatWorkflowPreparationStore(shim, shim as never),
				loadContext: loadContext as never,
				publisher: publisher as never,
				control: new SupabaseAgenticChatExecutionControlAdapter(shim as never),
				runner: input.runner ?? unavailableAgenticChatWorkflowRunner,
				allowedUserIds: [USER_ID],
				onTiming: () => undefined,
				onError: () => undefined
			})
		};
	}

	function execute(
		target: AgenticChatWorkflowTurnPreparer,
		lease: { claim: Claim; token: string; job: string }
	) {
		return target.execute({
			envelope: {
				turnRunId: lease.claim.turnRunId,
				queueJobId: lease.job,
				processingToken: lease.token
			},
			claim: lease.claim,
			signal: new AbortController().signal,
			invocationDeadlineAtMs: Date.now() + 300_000
		});
	}

	async function events(turnRunId: string) {
		const { rows } = await admin.query(
			`SELECT execution_generation, sequence_index, event_type, payload
			FROM public.chat_turn_events WHERE turn_run_id = $1
			ORDER BY execution_generation, sequence_index`,
			[turnRunId]
		);
		return rows as Array<{
			execution_generation: number;
			sequence_index: number;
			event_type: string;
			payload: Record<string, any>;
		}>;
	}

	async function streamProjection(turnRunId: string): Promise<Record<string, any>> {
		const { rows } = await admin.query(
			'SELECT projection FROM public.chat_turn_stream_state WHERE turn_run_id = $1',
			[turnRunId]
		);
		return rows[0]!.projection as Record<string, any>;
	}

	beforeAll(async () => {
		tempDir = mkdtempSync('/tmp/buildos-workflow-prep-pg-');
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
		execFileSync(
			'psql',
			[
				'-X',
				'-q',
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
				resolve(repositoryRoot, FIXTURE),
				...MIGRATIONS.flatMap((migration) => ['-f', resolve(repositoryRoot, migration)])
			],
			{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 }
		);

		const connection = { host: socketDir, port, user: 'postgres', database: 'postgres' };
		admin = new Client(connection);
		await admin.connect();
		service = new Client(connection);
		await service.connect();
		await service.query('SET ROLE service_role');
		shim = createPgSupabaseShim(service);

		for (const user of [USER_ID, OTHER_USER_ID]) {
			await admin.query('INSERT INTO public.users (id) VALUES ($1)', [user]);
			await admin.query('INSERT INTO auth.users (id) VALUES ($1)', [user]);
		}
		await admin.query(
			`INSERT INTO public.onto_actors (id, kind, name, user_id) VALUES ($1, 'human', 'Owner', $2)`,
			[ACTOR_ID, USER_ID]
		);
		await admin.query(
			`INSERT INTO public.onto_actors (id, kind, name, user_id) VALUES ($1, 'human', 'Other', $2)`,
			[id('e2', 2), OTHER_USER_ID]
		);
		for (const project of [PROJECT_ID, REVOKED_PROJECT_ID]) {
			await admin.query(
				`INSERT INTO public.onto_projects (id, name, created_by) VALUES ($1, 'Kiln Studio', $2)`,
				[project, ACTOR_ID]
			);
		}
	}, 120_000);

	afterAll(async () => {
		await service?.end().catch(() => undefined);
		await admin?.end().catch(() => undefined);
		if (dataDir)
			spawnSync('pg_ctl', ['-D', dataDir, 'stop', '-m', 'fast'], { stdio: 'ignore' });
		if (tempDir) rmSync(tempDir, { recursive: true, force: true });
	});

	it('round-trips a built checkpoint through the real RPCs with stable bytes and hashes', async () => {
		await admit(1);
		const lease = await leaseAndClaim(1);
		const store = new SupabaseAgenticChatWorkflowPreparationStore(shim, shim as never);
		const fence = {
			turnRunId: lease.claim.turnRunId,
			queueJobId: lease.job,
			processingToken: lease.token,
			executionGeneration: lease.claim.executionGeneration
		};

		const run = await store.readRun({ turnRunId: id('e5', 1), userId: USER_ID });
		expect(run).toMatchObject({
			phase: 'preparing',
			projectId: PROJECT_ID,
			requestArtifactId: id('e7', 1),
			context: null,
			wholeRunLifetimeMs: 900_000
		});
		await expect(
			store.readRun({ turnRunId: id('e5', 1), userId: OTHER_USER_ID })
		).resolves.toBeNull();
		await expect(
			store.hasProjectAccess({ userId: USER_ID, projectId: PROJECT_ID })
		).resolves.toBe(true);
		await expect(
			store.hasProjectAccess({ userId: OTHER_USER_ID, projectId: PROJECT_ID })
		).resolves.toBe(false);

		const preparing = buildAgenticChatWorkflowProjectionV1({ phase: 'preparing' });
		const resumed = await store.resume({
			fence,
			transitionId: id('eb', 1),
			projection: buildAgenticChatWorkflowStreamProjectionV1(
				preparing,
				'Gathering project context'
			),
			eventPayload: buildAgenticChatWorkflowProgressEventV1(preparing)
		});
		expect(resumed).toMatchObject({
			outcome: 'resumed',
			phase: 'preparing',
			event: {
				kind: 'committed',
				receipt: { sequence_index: 1, event_type: 'workflow_progress' }
			}
		});

		const built = buildAgenticChatWorkflowContextV1({
			context: projectContext(PROJECT_ID),
			userId: USER_ID,
			projectId: PROJECT_ID,
			accessCheckedAt: '2026-09-18T12:00:00.000Z',
			contextLoadedAt: '2026-09-18T12:00:00.100Z'
		});
		const assessing = buildAgenticChatWorkflowProjectionV1({ phase: 'assessing' });
		const acceptInput = {
			fence,
			contextId: id('ec', 1),
			requestArtifactId: id('e7', 1),
			requestHash: run!.requestHash,
			context: built,
			transitionId: id('ed', 1),
			projection: buildAgenticChatWorkflowStreamProjectionV1(
				assessing,
				'Project context ready'
			),
			eventPayload: buildAgenticChatWorkflowProgressEventV1(assessing)
		};
		const accepted = await store.acceptContext(acceptInput);
		expect(accepted).toMatchObject({
			outcome: 'accepted',
			contextId: id('ec', 1),
			contextHash: built.contextHash,
			event: { kind: 'committed', receipt: { sequence_index: 2 } }
		});
		expect(accepted.outcome === 'accepted' && accepted.acceptedAt).toBeTruthy();

		// A lost response replays byte-identically; a different checkpoint loses.
		await expect(store.acceptContext(acceptInput)).resolves.toMatchObject({
			outcome: 'already_accepted',
			acceptedAt: null,
			event: { kind: 'replayed', sequenceIndex: 2, executionGeneration: 1 }
		});
		await expect(
			store.acceptContext({
				...acceptInput,
				contextId: id('ec', 2),
				transitionId: id('ed', 2)
			})
		).resolves.toMatchObject({ outcome: 'context_conflict', contextId: id('ec', 1) });

		// Durable truth recomputes to the same canonical hash after the jsonb round trip.
		const durable = await store.readRun({ turnRunId: id('e5', 1), userId: USER_ID });
		expect(durable!.context).toMatchObject({
			contextId: id('ec', 1),
			contextHash: built.contextHash,
			payloadBytes: built.payloadBytes,
			evidenceVersions: built.evidenceVersions,
			contextIdentity: built.contextIdentity
		});
		expect(durable!.context!.payload).toEqual(built.payload);
		expect(hashAgenticChatWorkflowContextPayloadV1(durable!.context!.payload)).toEqual({
			contextHash: built.contextHash,
			payloadBytes: built.payloadBytes
		});
		const { rows } = await admin.query(
			'SELECT octet_length(context_payload::text) AS bytes FROM public.chat_turn_workflow_runs WHERE turn_run_id = $1',
			[id('e5', 1)]
		);
		expect(rows[0]!.bytes).toBeGreaterThanOrEqual(built.payloadBytes);
		expect(rows[0]!.bytes).toBeLessThanOrEqual(built.jsonbTextBytes);

		// A stale fence is refused without writing.
		await expect(
			store.resume({
				fence: { ...fence, executionGeneration: 2 },
				transitionId: id('eb', 2),
				projection: buildAgenticChatWorkflowStreamProjectionV1(assessing, 'x'),
				eventPayload: buildAgenticChatWorkflowProgressEventV1(assessing)
			})
		).resolves.toEqual({ outcome: 'stale_generation' });
	});

	it('prepares a claimed raw request end to end and ends readably with no runner enabled', async () => {
		const admitted = await admit(2);
		const lease = await leaseAndClaim(2);
		const { preparer: target, publisher, loadContext } = preparer({});
		shim.rpcCalls.length = 0;

		await expect(execute(target, lease)).resolves.toMatchObject({
			outcome: 'failed',
			terminalStatus: 'failed',
			queueReconciled: true
		});

		expect(loadContext).toHaveBeenCalledOnce();
		expect(shim.rpcCalls).toEqual([
			'select:chat_turn_runs',
			'select:chat_turn_input_artifacts',
			'select:chat_turn_workflow_runs',
			'resume_agentic_chat_workflow_projection_v1',
			'agentic_chat_workflow_project_access_v1',
			'accept_agentic_chat_workflow_context_v1',
			'finalize_agentic_chat_turn',
			'recover_agentic_chat_workflow_turn_v1'
		]);
		const stored = await events(id('e5', 2));
		expect(stored.map((event) => [event.sequence_index, event.event_type])).toEqual([
			[1, 'workflow_progress'],
			[2, 'workflow_progress'],
			[3, 'done']
		]);
		expect(stored[0]!.payload.workflow.phase).toBe('preparing');
		expect(stored[1]!.payload.workflow.phase).toBe('assessing');
		expect(stored[2]!.payload).toMatchObject({
			type: 'done',
			status: 'failed',
			failure_code: 'workflow_execution_not_enabled'
		});
		const projection = await streamProjection(id('e5', 2));
		expect(projection.current_activity).toBe(
			'Project context is ready, but review execution is not enabled yet. Nothing was changed.'
		);
		expect(projection.workflow).toMatchObject({
			phase: 'finished',
			terminalOutcome: 'failed',
			coverageGap:
				'Project context is ready, but review execution is not enabled yet. Nothing was changed.'
		});
		expect(
			publisher.publishCommittedSemantic.mock.calls.map(
				(call) => (call[1] as { sequence_index: number }).sequence_index
			)
		).toEqual([1, 2]);
		expect(publisher.publishTerminal.mock.calls[0]![1]).toMatchObject({
			terminal_sequence_index: 3,
			status: 'failed',
			failure_code: 'workflow_execution_not_enabled'
		});

		const { rows } = await admin.query(
			`SELECT turns.status, turns.failure_code, runs.phase, runs.terminal_outcome, runs.context_id,
				runs.context_accepted_generation, jobs.status AS job_status,
				(SELECT count(*)::int FROM public.chat_turn_workflow_dispatches d WHERE d.turn_run_id = turns.id) AS dispatches,
				(SELECT count(*)::int FROM public.chat_turn_workflow_steps s WHERE s.turn_run_id = turns.id) AS steps
			FROM public.chat_turn_runs turns
			JOIN public.chat_turn_workflow_runs runs ON runs.turn_run_id = turns.id
			JOIN public.queue_jobs jobs ON jobs.id = turns.queue_job_id
			WHERE turns.id = $1`,
			[admitted.turn_run_id]
		);
		expect(rows[0]).toMatchObject({
			status: 'failed',
			failure_code: 'workflow_execution_not_enabled',
			phase: 'finished',
			terminal_outcome: 'failed',
			context_accepted_generation: 1,
			dispatches: 0,
			steps: 1
		});
		expect(rows[0]!.context_id).not.toBeNull();
		expect(['completed', 'failed']).toContain(rows[0]!.job_status);
	});

	it('requeues after doubly lost acceptance responses; the next generation reuses the durable checkpoint', async () => {
		await admit(3);
		const first = await leaseAndClaim(3, 1);
		let lost = 0;
		shim.intercept(async (name, run) => {
			const result = await run();
			if (name === 'accept_agentic_chat_workflow_context_v1' && lost < 2) {
				lost += 1;
				return { data: null, error: { code: '', message: 'TypeError: fetch failed' } };
			}
			return result;
		});
		const initial = preparer({});
		try {
			await expect(execute(initial.preparer, first)).resolves.toMatchObject({
				outcome: 'requeued'
			});
		} finally {
			shim.intercept(null);
		}
		expect(lost).toBe(2);
		const durable = await admin.query(
			`SELECT turns.status, turns.execution_generation, runs.context_id, runs.context_accepted_generation
			FROM public.chat_turn_runs turns JOIN public.chat_turn_workflow_runs runs ON runs.turn_run_id = turns.id
			WHERE turns.id = $1`,
			[id('e5', 3)]
		);
		expect(durable.rows[0]).toMatchObject({ status: 'queued', context_accepted_generation: 1 });
		const acceptedContextId = durable.rows[0]!.context_id as string;
		expect(acceptedContextId).toBeTruthy();

		const second = await leaseAndClaim(3, 2);
		expect(second.claim.executionGeneration).toBe(2);
		const handoffs: AgenticChatWorkflowPreparedTurnV1[] = [];
		const store = new SupabaseAgenticChatWorkflowPreparationStore(shim, shim as never);
		const retry = preparer({
			runner: {
				run: async ({ prepared }) => {
					handoffs.push(prepared);
					// The Tasker 87 invariant: resume is this generation's first fenced write,
					// with a projection whose phase is the durable run phase.
					const workflow = buildAgenticChatWorkflowProjectionV1({
						phase: prepared.durableRun.phase
					});
					const resumed = await store.resume({
						fence: {
							...prepared.envelope,
							executionGeneration: prepared.claim.executionGeneration
						},
						transitionId: id('ef', 1),
						projection: buildAgenticChatWorkflowStreamProjectionV1(
							workflow,
							'Resuming review'
						),
						eventPayload: buildAgenticChatWorkflowProgressEventV1(workflow)
					});
					expect(resumed).toMatchObject({
						outcome: 'resumed',
						phase: 'assessing',
						contextId: acceptedContextId,
						event: {
							kind: 'committed',
							receipt: { execution_generation: 2, sequence_index: 1 }
						}
					});
					return {
						kind: 'handled',
						result: {
							outcome: 'recovery_required',
							turnRunId: prepared.claim.turnRunId,
							executionGeneration: prepared.claim.executionGeneration,
							terminalStatus: null,
							queueReconciled: false
						}
					};
				}
			}
		});

		await expect(execute(retry.preparer, second)).resolves.toMatchObject({
			outcome: 'recovery_required'
		});
		expect(retry.loadContext).not.toHaveBeenCalled();
		expect(handoffs).toHaveLength(1);
		expect(handoffs[0]).toMatchObject({
			contextSource: 'reused_durable',
			stream: { resumeRequired: true },
			durableRun: { phase: 'assessing', contextAcceptedGeneration: 1 },
			context: { contextId: acceptedContextId, requestId: id('e7', 3) }
		});
		expect(handoffs[0]!.modelInput.contextId).toBe(acceptedContextId);
	});

	it('replays one lost acceptance response and hands on the durable checkpoint in the same generation', async () => {
		await admit(4);
		const lease = await leaseAndClaim(4);
		let lost = 0;
		shim.intercept(async (name, run) => {
			const result = await run();
			if (name === 'accept_agentic_chat_workflow_context_v1' && lost < 1) {
				lost += 1;
				return { data: null, error: { code: '', message: 'TypeError: fetch failed' } };
			}
			return result;
		});
		const handoffs: AgenticChatWorkflowPreparedTurnV1[] = [];
		const target = preparer({
			runner: {
				run: async ({ prepared }) => {
					handoffs.push(prepared);
					return { kind: 'unavailable', reason: 'test' };
				}
			}
		});
		try {
			await expect(execute(target.preparer, lease)).resolves.toMatchObject({
				outcome: 'failed'
			});
		} finally {
			shim.intercept(null);
		}
		expect(handoffs).toHaveLength(1);
		expect(handoffs[0]).toMatchObject({
			contextSource: 'accepted_now',
			timing: { checkpointOutcome: 'already_accepted', checkpointReplayed: true }
		});
		const { rows } = await admin.query(
			`SELECT context_id, context_accepted_at FROM public.chat_turn_workflow_runs WHERE turn_run_id = $1`,
			[id('e5', 4)]
		);
		expect(handoffs[0]!.context.contextId).toBe(rows[0]!.context_id);
		expect(Date.parse(handoffs[0]!.context.acceptedAt)).toBe(
			(rows[0]!.context_accepted_at as Date).getTime()
		);
		// Exactly one checkpoint event committed despite two acceptance calls.
		const stored = await events(id('e5', 4));
		expect(
			stored.filter((event) => event.payload?.workflow?.phase === 'assessing')
		).toHaveLength(1);
		expect(
			target.publisher.publishCommittedSemantic.mock.calls[1]![1] as Record<string, unknown>
		).toMatchObject({ outcome: 'already_persisted', sequence_index: 2 });
	});

	it('stops before reading a project the user can no longer access', async () => {
		await admit(5, REVOKED_PROJECT_ID);
		const lease = await leaseAndClaim(5);
		await admin.query('UPDATE public.onto_projects SET deleted_at = now() WHERE id = $1', [
			REVOKED_PROJECT_ID
		]);
		const target = preparer({});

		await expect(execute(target.preparer, lease)).resolves.toMatchObject({
			outcome: 'failed',
			terminalStatus: 'failed'
		});
		expect(target.loadContext).not.toHaveBeenCalled();
		const { rows } = await admin.query(
			`SELECT turns.failure_code, runs.context_id, runs.phase
			FROM public.chat_turn_runs turns JOIN public.chat_turn_workflow_runs runs ON runs.turn_run_id = turns.id
			WHERE turns.id = $1`,
			[id('e5', 5)]
		);
		expect(rows[0]).toMatchObject({
			failure_code: 'workflow_access_revoked',
			context_id: null,
			phase: 'finished'
		});
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
