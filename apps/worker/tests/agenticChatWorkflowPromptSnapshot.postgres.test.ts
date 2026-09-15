// apps/worker/tests/agenticChatWorkflowPromptSnapshot.postgres.test.ts
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AgenticChatTurnClaimResultV1, TurnInputArtifactV1 } from '@buildos/shared-types';
import type { MasterPromptContext } from '@buildos/agentic-chat-runtime/context';
import type { AgenticChatWorkerExecutionInputV1 } from '../src/workers/agentic-chat/executionInput';
import type { AgenticChatTurnProviderClientPortV1 } from '../src/workers/agentic-chat/provider/contracts';
import { AgenticChatProviderCapacity } from '../src/workers/agentic-chat/providerCapacity';
import {
	type AgenticChatPromptSnapshotRpcClient,
	SupabaseAgenticChatPromptSnapshotAdapter,
	createStableAgenticChatPromptSnapshotIdV1
} from '../src/workers/agentic-chat/promptSnapshot';
import { ChatWorkflowPrototypeProvider } from '../src/workers/agentic-chat/workflow/prototype-provider';

const EXISTING_MIGRATIONS = [
	'20260804032000_agentic_chat_prompt_snapshot.sql',
	'20260813050000_agentic_chat_prompt_snapshot_tool_definitions.sql',
	'20260817010000_agentic_chat_prompt_snapshot_runtime_augmentation.sql'
];
const WORKFLOW_MIGRATION = '20260914165546_agentic_chat_workflow_prompt_snapshot.sql';
const USER_ID = 'a1000000-0000-4000-8000-000000000001';
const PROJECT_ID = 'a0000000-0000-4000-8000-000000000001';
// The retained browser replay question and prepared artifact shape (turn 594561f2).
const MESSAGE =
	'/workflow What should we prioritize next, and what risks or missing information could change that recommendation?';
const ADMITTED_SYSTEM_PROMPT = `BuildOS worker project prompt.\n${'Use only the reviewed project tools. '.repeat(350)}`;
const TOOL_NAMES = ['search_onto_tasks', 'update_onto_task', 'create_onto_document'];

type SnapshotCase = {
	name: string;
	suffix: string;
	historySource: 'prepared_prompt' | 'admission_window';
	sourcePreparedPromptId: string | null;
	history: TurnInputArtifactV1['history'];
};
const CASES: SnapshotCase[] = [
	{
		name: 'prewarmed prepared-prompt hit',
		suffix: '01',
		historySource: 'prepared_prompt',
		sourcePreparedPromptId: 'bb0ed560-59f0-4507-8a47-3dffcdd7499f',
		history: []
	},
	{
		name: 'admission-window miss with history',
		suffix: '02',
		historySource: 'admission_window',
		sourcePreparedPromptId: null,
		history: [
			{
				sourceMessageId: null,
				role: 'assistant',
				content: 'Earlier we agreed the venue decision comes first.',
				attachments: [],
				toolCalls: [],
				toolCallId: null
			}
		]
	}
];
const ids = (suffix: string) => ({
	session: `b1000000-0000-4000-8000-0000000000${suffix}`,
	message: `b2000000-0000-4000-8000-0000000000${suffix}`,
	job: `b3000000-0000-4000-8000-0000000000${suffix}`,
	turn: `b4000000-0000-4000-8000-0000000000${suffix}`,
	artifact: `b6000000-0000-4000-8000-0000000000${suffix}`,
	correlation: `b8000000-0000-4000-8000-0000000000${suffix}`,
	token: `b9000000-0000-4000-8000-0000000000${suffix}`
});

const postgresAvailable = ['initdb', 'pg_ctl', 'psql'].every(
	(command) => spawnSync(command, ['--version'], { stdio: 'ignore' }).status === 0
);
const describePostgres = postgresAvailable ? describe : describe.skip;

describePostgres('workflow prompt snapshot against the real v3 RPC', () => {
	const repositoryRoot = resolve(process.cwd(), '../..');
	let tempDir = '';
	let dataDir = '';
	let socketDir = '';
	let port = 0;
	let admin: Client;
	let service: Client;

	const applySqlFile = (relativePath: string): string =>
		execFileSync(
			'psql',
			[
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
				resolve(repositoryRoot, relativePath)
			],
			{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
		);

	beforeAll(async () => {
		tempDir = mkdtempSync('/tmp/buildos-workflow-snapshot-pg-');
		dataDir = join(tempDir, 'data');
		socketDir = join(tempDir, 'socket');
		port = await availablePort();
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
		applySqlFile('supabase/tests/fixtures/agentic_chat_worker_prompt_snapshot_base.sql');
		for (const migration of EXISTING_MIGRATIONS)
			applySqlFile(`supabase/migrations/${migration}`);

		const connection = { host: socketDir, port, user: 'postgres', database: 'postgres' };
		admin = new Client(connection);
		service = new Client(connection);
		await admin.connect();
		await service.connect();
		await service.query('SET ROLE service_role');
		await admin.query('INSERT INTO public.users (id) VALUES ($1)', [USER_ID]);
		for (const snapshotCase of CASES) await seedTurn(admin, snapshotCase);
	}, 60_000);

	afterAll(async () => {
		await service?.end().catch(() => undefined);
		await admin?.end().catch(() => undefined);
		if (dataDir)
			spawnSync('pg_ctl', ['-D', dataDir, 'stop', '-m', 'fast'], { stdio: 'ignore' });
		if (tempDir) rmSync(tempDir, { recursive: true, force: true });
	});

	it('reproduces the rejection, then persists prepared hit and miss snapshots exactly', async () => {
		const adapter = new SupabaseAgenticChatPromptSnapshotAdapter(rpcClient(service));
		const prepared = await Promise.all(
			CASES.map(async (snapshotCase) => {
				const id = ids(snapshotCase.suffix);
				const prompt = await workflowSnapshot(snapshotCase);
				return {
					snapshotCase,
					prompt,
					input: {
						turnRunId: id.turn,
						queueJobId: id.job,
						processingToken: id.token,
						userId: USER_ID,
						executionGeneration: 1,
						promptSnapshotId: createStableAgenticChatPromptSnapshotIdV1(id.turn),
						prompt
					}
				};
			})
		);

		for (const { input } of prepared) {
			await expect(adapter.persist(input)).rejects.toMatchObject({
				code: 'P0001',
				message: expect.stringContaining(
					'agentic_chat_prompt_snapshot_invalid_runtime_augmentation'
				)
			});
		}

		applySqlFile(`supabase/migrations/${WORKFLOW_MIGRATION}`);

		for (const { snapshotCase, prompt, input } of prepared) {
			const expected = {
				snapshotAvailable: true,
				promptSnapshotId: input.promptSnapshotId
			};
			await expect(adapter.persist(input)).resolves.toEqual({
				outcome: 'persisted',
				...expected
			});
			await expect(adapter.persist(input)).resolves.toEqual({
				outcome: 'already_persisted',
				...expected
			});
			const { rows } = await admin.query(
				`SELECT snapshots.model_messages, snapshots.system_prompt,
					snapshots.system_prompt_sha256, snapshots.messages_sha256,
					snapshots.tool_definitions, snapshots.prompt_sections,
					turns.prompt_snapshot_id
				FROM public.chat_prompt_snapshots snapshots
				JOIN public.chat_turn_runs turns ON turns.id = snapshots.turn_run_id
				WHERE snapshots.turn_run_id = $1`,
				[input.turnRunId]
			);
			expect(rows).toHaveLength(1);
			expect(rows[0]).toMatchObject({
				model_messages: prompt.modelMessages,
				system_prompt: prompt.modelMessages[0]!.content,
				system_prompt_sha256: prompt.systemPromptSha256,
				messages_sha256: prompt.messagesSha256,
				tool_definitions: [],
				prompt_snapshot_id: input.promptSnapshotId,
				prompt_sections: {
					workflow_prompt: {
						workflow_version: 'chat_workflow_prototype_v1',
						admitted_message_count: 2 + snapshotCase.history.length
					}
				}
			});
		}
	});

	it('keeps ordinary, runtime-augmentation, and workflow rejection fences in SQL', () => {
		applySqlFile(`supabase/migrations/${WORKFLOW_MIGRATION}`);
		const output = applySqlFile(
			'supabase/tests/20260914165546_agentic_chat_workflow_prompt_snapshot.test.sql'
		);
		expect(output).toContain('agentic_chat_prompt_snapshot_tool_definitions_ok');
		expect(output).toContain('agentic_chat_prompt_snapshot_runtime_augmentation_ok');
		expect(output).toContain('agentic_chat_workflow_prompt_snapshot_ok');
	});
});

async function seedTurn(client: Client, snapshotCase: SnapshotCase): Promise<void> {
	const id = ids(snapshotCase.suffix);
	const history = snapshotCase.history.map((message) => ({ ...message }));
	await client.query(
		`INSERT INTO public.chat_sessions (id, user_id, context_type, status)
		VALUES ($1, $2, 'global', 'active')`,
		[id.session, USER_ID]
	);
	await client.query(
		`INSERT INTO public.chat_messages (id, session_id, user_id, role, content, metadata)
		VALUES ($1, $2, $3, 'user', $4, $5)`,
		[
			id.message,
			id.session,
			USER_ID,
			MESSAGE,
			JSON.stringify({ idempotency_key: `workflow-snapshot-${snapshotCase.suffix}` })
		]
	);
	await client.query(
		`INSERT INTO public.queue_jobs (
			id, user_id, job_type, metadata, scheduled_for, dedup_key, status,
			queue_job_id, processing_token, started_at, attempts, max_attempts
		) VALUES (
			$1, $2, 'agentic_chat_turn', $3, now() - interval '2 seconds', $4, 'processing',
			$5, $6, now() - interval '1 second', 0, 3
		)`,
		[
			id.job,
			USER_ID,
			JSON.stringify({ turnRunId: id.turn, correlationId: id.correlation }),
			`agentic-chat-turn:${id.turn}`,
			`workflow_snapshot_${snapshotCase.suffix}`,
			id.token
		]
	);
	await client.query(
		`INSERT INTO public.chat_turn_runs (
			id, session_id, user_id, stream_run_id, client_turn_id, context_type,
			request_message, request_payload, request_payload_version, status,
			execution_mode, queue_job_id, correlation_id, execution_generation,
			worker_started_at, execution_started_at, history_cutoff_at, last_progress_at,
			last_event_sequence, user_message_id
		) VALUES (
			$1, $2, $3, $4, $5, 'global', $6, $7, 'agentic_chat_request_v1', 'running',
			'worker_realtime', $8, $9, 1, now() - interval '1 second',
			now() - interval '500 milliseconds', now() - interval '2 seconds',
			now() - interval '250 milliseconds', 4, $10
		)`,
		[
			id.turn,
			id.session,
			USER_ID,
			`workflow-stream-${snapshotCase.suffix}`,
			`workflow-client-${snapshotCase.suffix}`,
			MESSAGE,
			JSON.stringify({
				message: MESSAGE,
				attachments: [],
				promptVariant: 'lite_seed_v1',
				context: { type: 'project', entityId: PROJECT_ID, projectId: PROJECT_ID },
				clientTurnId: `workflow-client-${snapshotCase.suffix}`,
				streamRunId: `workflow-stream-${snapshotCase.suffix}`,
				preparedPromptId: snapshotCase.sourcePreparedPromptId
			}),
			id.job,
			id.correlation,
			id.message
		]
	);
	await client.query(
		`INSERT INTO public.chat_turn_input_artifacts (
			id, turn_run_id, session_id, user_id, source_prepared_prompt_id, artifact_version,
			history_source, history, prepared, content_hash, history_bytes, content_bytes,
			created_at, retain_until
		) VALUES (
			$1, $2, $3, $4, $5, 'agentic_chat_input_v3', $6, $7, $8, repeat('c', 64), 100, 500,
			now() - interval '2 seconds', now() + interval '8 days'
		)`,
		[
			id.artifact,
			id.turn,
			id.session,
			USER_ID,
			snapshotCase.sourcePreparedPromptId,
			snapshotCase.historySource,
			JSON.stringify(history),
			JSON.stringify({
				sourcePreparedPromptId: snapshotCase.sourcePreparedPromptId,
				contextPayload: { data: { project: { id: PROJECT_ID } } },
				conversationSummary: null,
				surfaceProfile: 'worker_realtime:project',
				systemPrompt: ADMITTED_SYSTEM_PROMPT,
				promptSections: [{ id: 'identity' }],
				toolSurface: {
					surfaceProfile: 'worker_realtime:project',
					toolNames: TOOL_NAMES,
					definitions: []
				},
				sessionSnapshot: { summary: null },
				contextUsageSnapshot: {
					estimatedTokens: 3235,
					tokenBudget: 64000,
					usagePercent: 5,
					tokensRemaining: 60765,
					status: 'ok'
				}
			})
		]
	);
	await client.query('UPDATE public.chat_turn_runs SET input_artifact_id = $1 WHERE id = $2', [
		id.artifact,
		id.turn
	]);
}

async function workflowSnapshot(snapshotCase: SnapshotCase) {
	const id = ids(snapshotCase.suffix);
	const context: MasterPromptContext = {
		contextType: 'project',
		contextLoadSource: 'rpc',
		data: {
			project: { id: PROJECT_ID, name: 'Cedar House' },
			tasks: [{ id: 'task-1', title: 'Book venue' }]
		}
	};
	const client: AgenticChatTurnProviderClientPortV1 = {
		async *stream(request) {
			const round = request.logicalProviderRound;
			yield {
				type: 'text',
				content:
					round === 1
						? JSON.stringify({ analyst: 'Review next actions', reviewer: 'Find risks' })
						: round === 4
							? 'Book the venue first.'
							: JSON.stringify({
									summary: 'The venue gates the launch.',
									findings: [
										{
											claim: 'The venue is not booked.',
											basis: 'recorded',
											evidence: ['task-1']
										}
									],
									risks: [],
									unknowns: [],
									recommendation: 'Book the venue.'
								})
			};
			yield {
				type: 'done',
				finishedReason: 'stop',
				usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }
			};
		}
	};
	const claim = {
		outcome: 'claimed',
		executionMayStart: true,
		turnRunId: id.turn,
		queueJobId: id.job,
		sessionId: id.session,
		userId: USER_ID,
		correlationId: id.correlation,
		executionGeneration: 1,
		status: 'running',
		inputArtifactId: id.artifact,
		userMessageId: id.message
	} satisfies Extract<AgenticChatTurnClaimResultV1, { outcome: 'claimed' }>;
	const executionInput: AgenticChatWorkerExecutionInputV1 = {
		claim,
		streamRunId: `workflow-stream-${snapshotCase.suffix}`,
		clientTurnId: `workflow-client-${snapshotCase.suffix}`,
		requestPayload: {
			clientTurnId: `workflow-client-${snapshotCase.suffix}`,
			streamRunId: `workflow-stream-${snapshotCase.suffix}`,
			message: MESSAGE,
			attachments: [],
			context: { type: 'project', entityId: PROJECT_ID, projectId: PROJECT_ID }
		},
		timingBaseline: {
			admittedAt: '2026-09-13T00:05:20.391Z',
			startedAt: '2026-09-13T00:05:20.408Z',
			workerStartedAt: '2026-09-13T00:05:20.748Z',
			executionStartedAt: null,
			historyCutoffAt: '2026-09-13T00:05:20.408Z',
			requestPrewarmedContext: snapshotCase.sourcePreparedPromptId !== null,
			cacheSource: null,
			cacheAgeSeconds: null,
			historyStrategy: 'raw_history',
			historyCompressed: false,
			rawHistoryCount: snapshotCase.history.length,
			historyForModelCount: snapshotCase.history.length,
			preparedPromptId: snapshotCase.sourcePreparedPromptId,
			preparedPromptHit: snapshotCase.sourcePreparedPromptId !== null,
			preparedPromptMissReason: null,
			preparedSurfaceProfile: 'worker_realtime:project'
		},
		artifact: {
			artifactVersion: 'agentic_chat_input_v2',
			historySource: snapshotCase.historySource,
			history: snapshotCase.history,
			prepared: {
				sourcePreparedPromptId: snapshotCase.sourcePreparedPromptId,
				contextPayload: {},
				conversationSummary: null,
				surfaceProfile: 'worker_realtime:project',
				systemPrompt: ADMITTED_SYSTEM_PROMPT,
				promptSections: [],
				toolSurface: {}
			},
			createdAt: '2026-09-13T00:05:20.391Z',
			retainUntil: '2026-09-20T00:05:20.391Z',
			contentHash: '0'.repeat(64)
		} satisfies TurnInputArtifactV1
	};
	const provider = new ChatWorkflowPrototypeProvider({
		direct: { prepare: vi.fn() },
		client,
		capacity: new AgenticChatProviderCapacity({ configured: true, concurrency: 2 }),
		allowedUserIds: [USER_ID],
		loadContext: async () => context
	});
	const invocation = await provider.prepare({
		executionInput,
		processingToken: id.token,
		signal: new AbortController().signal
	});
	for await (const _step of invocation.stream()) {
		// Drain the whole bounded workflow; the snapshot is its first provider request.
	}
	const prompt = invocation.promptSnapshot;
	if (!prompt) throw new Error('Workflow did not capture a prompt snapshot');
	return prompt;
}

function rpcClient(client: Client): AgenticChatPromptSnapshotRpcClient {
	return {
		rpc(name, args) {
			const entries = Object.entries(args);
			const sql = `SELECT public.${name}(${entries
				.map(([key], index) => `${key} => $${index + 1}`)
				.join(', ')}) AS data`;
			const values = entries.map(([, value]) =>
				value !== null && typeof value === 'object' ? JSON.stringify(value) : value
			);
			return client.query(sql, values).then(
				(result) => ({ data: result.rows[0]?.data ?? null, error: null }),
				(error: { code?: string; message: string }) => ({
					data: null,
					error: { code: error.code, message: error.message }
				})
			);
		}
	};
}

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
