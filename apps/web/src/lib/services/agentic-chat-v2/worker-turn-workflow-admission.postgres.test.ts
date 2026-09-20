// apps/web/src/lib/services/agentic-chat-v2/worker-turn-workflow-admission.postgres.test.ts
//
// Tasker 86: the web's server-derived v4 admission arguments against the frozen
// workflow v1 migrations in a disposable local PostgreSQL, through psql.
// DISPOSABLE DATABASE ONLY. Never point this at a linked or hosted database.
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	admitAgenticChatWorkflowV4Turn,
	buildAgenticChatWorkflowV4AdmissionArgs,
	evaluateAgenticChatWorkflowV4Admission,
	type AgenticChatWorkflowV4AdmissionRpcArgs,
	type AgenticChatWorkflowV4AdmissionRpcClient,
	type AgenticChatWorkflowV4CommandV1
} from './worker-turn-workflow-admission.server';

const FIXTURE = 'supabase/tests/fixtures/agentic_chat_workflow_v1_base.sql';
const MIGRATIONS = [
	'supabase/migrations/20260914203007_agentic_chat_workflow_v1_storage.sql',
	'supabase/migrations/20260914203008_agentic_chat_workflow_v1_dispatch_recovery.sql'
];
const USER_ID = 'c1000000-0000-4000-8000-000000000001';
const OTHER_USER_ID = 'c1000000-0000-4000-8000-000000000002';
const BUSY_USER_ID = 'c1000000-0000-4000-8000-000000000003';
const ACTOR_ID = 'c2000000-0000-4000-8000-000000000001';
const BUSY_ACTOR_ID = 'c2000000-0000-4000-8000-000000000003';
const PROJECT_ID = 'c3000000-0000-4000-8000-000000000001';
const FOREIGN_PROJECT_ID = 'c3000000-0000-4000-8000-000000000002';
const BUSY_PROJECT_ID = 'c3000000-0000-4000-8000-000000000003';
const SESSION_ID = 'c4000000-0000-4000-8000-000000000001';
const GLOBAL_SESSION_ID = 'c4000000-0000-4000-8000-000000000002';
const OTHER_USER_SESSION_ID = 'c4000000-0000-4000-8000-000000000003';
const POLICY = { enabled: true, cohortUserIds: [USER_ID, BUSY_USER_ID] };

const postgresAvailable = ['initdb', 'pg_ctl', 'psql'].every(
	(command) => spawnSync(command, ['--version'], { stdio: 'ignore' }).status === 0
);
const describePostgres = postgresAvailable ? describe : describe.skip;

describePostgres('workflow v4 admission against disposable PostgreSQL', () => {
	let tempDir = '';
	let dataDir = '';
	let socketDir = '';
	let port = 0;
	let sqlCounter = 0;

	function psql(sql: string): string {
		const file = join(tempDir, `statement-${++sqlCounter}.sql`);
		writeFileSync(file, sql);
		return execFileSync(
			'psql',
			[
				'-X',
				'-q',
				'-A',
				'-t',
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
				file
			],
			{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
		).trim();
	}

	function literal(value: unknown, type: string): string {
		if (value === null || value === undefined) return `NULL::${type}`;
		const text = typeof value === 'string' ? value : JSON.stringify(value);
		const tag = `q${randomBytes(6).toString('hex')}`;
		return `$${tag}$${text}$${tag}$::${type}`;
	}

	/** PostgREST-shaped service RPC over psql, with named arguments and SQL errors as `error`. */
	const client: AgenticChatWorkflowV4AdmissionRpcClient = {
		async rpc(name, args) {
			const types: Record<keyof AgenticChatWorkflowV4AdmissionRpcArgs, string> = {
				p_user_id: 'uuid',
				p_session_id: 'uuid',
				p_turn_run_id: 'uuid',
				p_user_message_id: 'uuid',
				p_request_artifact_id: 'uuid',
				p_stream_run_id: 'text',
				p_client_turn_id: 'text',
				p_transport_decision_id: 'uuid',
				p_correlation_id: 'uuid',
				p_project_id: 'uuid',
				p_message: 'text',
				p_review_intent: 'jsonb',
				p_policy: 'jsonb',
				p_policy_ref: 'text',
				p_request_hash: 'text',
				p_cache_ref: 'jsonb',
				p_specialist_snapshot: 'jsonb',
				p_specialist_snapshot_hash: 'text'
			};
			const call = (Object.keys(args) as Array<keyof AgenticChatWorkflowV4AdmissionRpcArgs>)
				.map((key) => `${key} => ${literal(args[key], types[key])}`)
				.join(',\n');
			try {
				const output = psql(
					`SET ROLE service_role;\nSELECT public.${name}(\n${call}\n)::text;\n`
				);
				return { data: JSON.parse(output), error: null };
			} catch (error) {
				const stderr = String((error as { stderr?: string }).stderr ?? '');
				const message = stderr.match(/ERROR:\s+(.*)/)?.[1] ?? stderr;
				return { data: null, error: { code: 'P0001', message } };
			}
		}
	};

	function command(overrides: Partial<AgenticChatWorkflowV4CommandV1> = {}) {
		return {
			clientTurnId: 'web-client-1',
			streamRunId: 'web-stream-1',
			sessionId: SESSION_ID,
			context: { type: 'project', entityId: PROJECT_ID, projectId: PROJECT_ID },
			message: 'Review the café 🚀 launch — what “must” happen next?\r\n',
			attachments: [],
			projectFocus: null,
			voiceNoteGroupId: null,
			reviewIntent: 'project_review' as const,
			...overrides
		};
	}

	async function admit(
		overrides: Partial<AgenticChatWorkflowV4CommandV1> = {},
		userId = USER_ID
	) {
		const value = command(overrides);
		const eligibility = evaluateAgenticChatWorkflowV4Admission({
			policy: POLICY,
			userId,
			command: value
		});
		if (!eligibility.eligible) throw new Error(`ineligible: ${eligibility.reason}`);
		const args = await buildAgenticChatWorkflowV4AdmissionArgs({
			userId,
			command: value,
			eligibility,
			// Each Send carries its own lease decision (unique per admitted turn).
			transportDecisionId: randomUUID()
		});
		return { args, result: await admitAgenticChatWorkflowV4Turn({ client, args }) };
	}

	beforeAll(async () => {
		tempDir = mkdtempSync('/tmp/buildos-workflow-v4-admission-pg-');
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
		const repositoryRoot = resolve(process.cwd(), '../..');
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
		psql(`
			INSERT INTO public.users (id) VALUES ('${USER_ID}'), ('${OTHER_USER_ID}'), ('${BUSY_USER_ID}');
			INSERT INTO auth.users (id) VALUES ('${USER_ID}'), ('${OTHER_USER_ID}'), ('${BUSY_USER_ID}');
			INSERT INTO public.onto_actors (id, kind, name, user_id) VALUES
				('${ACTOR_ID}', 'human', 'Owner', '${USER_ID}'),
				('c2000000-0000-4000-8000-000000000002', 'human', 'Other', '${OTHER_USER_ID}'),
				('${BUSY_ACTOR_ID}', 'human', 'Busy', '${BUSY_USER_ID}');
			INSERT INTO public.onto_projects (id, name, created_by) VALUES
				('${PROJECT_ID}', 'Kiln Studio', '${ACTOR_ID}'),
				('${FOREIGN_PROJECT_ID}', 'Not yours', 'c2000000-0000-4000-8000-000000000002'),
				('${BUSY_PROJECT_ID}', 'Busy', '${BUSY_ACTOR_ID}');
			INSERT INTO public.chat_sessions (id, user_id, context_type, entity_id, status) VALUES
				('${SESSION_ID}', '${USER_ID}', 'project', '${PROJECT_ID}', 'active'),
				('${GLOBAL_SESSION_ID}', '${USER_ID}', 'global', NULL, 'active'),
				('${OTHER_USER_SESSION_ID}', '${OTHER_USER_ID}', 'project', '${PROJECT_ID}', 'active');
			INSERT INTO public.chat_messages (id, session_id, user_id, role, content, created_at) VALUES
				('c6000000-0000-4000-8000-000000000001', '${SESSION_ID}', '${USER_ID}', 'user', 'Plan the launch', now() - interval '10 minutes'),
				('c6000000-0000-4000-8000-000000000002', '${SESSION_ID}', '${USER_ID}', 'assistant', 'Book the kiln vent first.', now() - interval '9 minutes');
		`);
	}, 120_000);

	afterAll(() => {
		if (dataDir)
			spawnSync('pg_ctl', ['-D', dataDir, 'stop', '-m', 'fast'], { stdio: 'ignore' });
		if (tempDir) rmSync(tempDir, { recursive: true, force: true });
	});

	it('admits the web-derived request byte-for-byte as one raw v4 turn', async () => {
		const { args, result } = await admit();
		expect(result).toMatchObject({
			outcome: 'newly_admitted',
			turnRunId: args.p_turn_run_id,
			sessionId: SESSION_ID,
			sessionCreated: false,
			historyMessageCount: 2,
			status: 'queued'
		});
		const row = JSON.parse(
			psql(`
				SELECT json_build_object(
					'artifact_version', a.artifact_version,
					'prepared', a.prepared,
					'request_hash', a.request_hash,
					'request', a.request,
					'phase', r.phase,
					'policy_ref', r.policy_ref,
					'job_status', j.status,
					'message', m.content
				)
				FROM public.chat_turn_input_artifacts a
				JOIN public.chat_turn_workflow_runs r ON r.turn_run_id = a.turn_run_id
				JOIN public.chat_turn_runs t ON t.id = a.turn_run_id
				JOIN public.queue_jobs j ON j.id = t.queue_job_id
				JOIN public.chat_messages m ON m.id = t.user_message_id
				WHERE a.id = '${args.p_request_artifact_id}';
			`)
		);
		expect(row).toMatchObject({
			artifact_version: 'agentic_chat_input_v4',
			prepared: null,
			request_hash: args.p_request_hash,
			phase: 'preparing',
			policy_ref: 'internal-project-review:v1',
			job_status: 'pending',
			message: 'Review the café 🚀 launch — what “must” happen next?'
		});
		expect(row.request).toMatchObject({
			message: args.p_message,
			reviewIntent: args.p_review_intent,
			policy: args.p_policy,
			cacheRef: null
		});
	});

	it('returns the original turn for a duplicate Send and conflicts on changed text or scope', async () => {
		const first = await admit();
		expect(first.result).toMatchObject({ outcome: 'matching_duplicate' });
		const original = psql(
			`SELECT id FROM public.chat_turn_runs WHERE user_id = '${USER_ID}' AND client_turn_id = 'web-client-1';`
		);
		expect(first.result).toMatchObject({ turnRunId: original });

		await expect(admit({ message: 'A different review question?' })).resolves.toMatchObject({
			result: { outcome: 'idempotency_conflict', conflictReason: 'request_hash_mismatch' }
		});
		await expect(
			admit({
				sessionId: null,
				context: {
					type: 'project',
					entityId: FOREIGN_PROJECT_ID,
					projectId: FOREIGN_PROJECT_ID
				}
			})
		).resolves.toMatchObject({ result: { outcome: 'idempotency_conflict' } });
		expect(
			psql(
				`SELECT count(*) FROM public.chat_turn_runs WHERE user_id = '${USER_ID}' AND client_turn_id = 'web-client-1';`
			)
		).toBe('1');
	});

	it('fails safely across users, sessions, and projects', async () => {
		await expect(
			admit({
				clientTurnId: 'web-client-2',
				streamRunId: 'web-stream-2',
				sessionId: OTHER_USER_SESSION_ID
			})
		).rejects.toMatchObject({
			code: 'session_conflict',
			message: 'agentic_chat_session_not_owned'
		});
		await expect(
			admit({
				clientTurnId: 'web-client-3',
				streamRunId: 'web-stream-3',
				sessionId: GLOBAL_SESSION_ID
			})
		).rejects.toMatchObject({
			code: 'session_conflict',
			message: 'agentic_chat_workflow_admission_session_scope_mismatch'
		});
		await expect(
			admit({
				clientTurnId: 'web-client-4',
				streamRunId: 'web-stream-4',
				sessionId: null,
				context: {
					type: 'project',
					entityId: FOREIGN_PROJECT_ID,
					projectId: FOREIGN_PROJECT_ID
				}
			})
		).resolves.toMatchObject({ result: { outcome: 'access_denied' } });
		// Nothing durable was written by any refusal.
		expect(
			psql(
				`SELECT count(*) FROM public.chat_turn_runs WHERE client_turn_id IN ('web-client-2', 'web-client-3', 'web-client-4');`
			)
		).toBe('0');
	});

	it('creates a project session when none is supplied', async () => {
		const { result } = await admit({
			clientTurnId: 'web-client-5',
			streamRunId: 'web-stream-5',
			sessionId: null
		});
		expect(result).toMatchObject({
			outcome: 'newly_admitted',
			sessionCreated: true,
			historyMessageCount: 0
		});
	});

	it('refuses past the per-user queued ceiling before any insert', async () => {
		// 100 queued raw turns for one user, each in its own new session, admitted by SQL.
		psql(`
			SET ROLE service_role;
			DO $fill$
			DECLARE
				v_index integer;
				v_message text;
				v_intent jsonb;
				v_receipt jsonb;
			BEGIN
				FOR v_index IN 1..100 LOOP
					v_message := 'Queued review number ' || v_index;
					v_intent := public.agentic_chat_workflow_review_intent_v1(v_message);
					v_receipt := public.create_agentic_chat_workflow_turn_with_job_v1(
						'${BUSY_USER_ID}', NULL, gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
						'fill-stream-' || v_index, 'fill-client-' || v_index, gen_random_uuid(), gen_random_uuid(),
						'${BUSY_PROJECT_ID}', v_message, v_intent, public.agentic_chat_workflow_policy_v1(),
						'internal-project-review:v1',
						public.agentic_chat_workflow_request_hash_v1(jsonb_build_object(
							'clientTurnId', 'fill-client-' || v_index,
							'streamRunId', 'fill-stream-' || v_index,
							'context', jsonb_build_object('type', 'project', 'entityId', '${BUSY_PROJECT_ID}', 'projectId', '${BUSY_PROJECT_ID}'),
							'message', v_message,
							'reviewIntent', v_intent,
							'policy', public.agentic_chat_workflow_policy_v1(),
							'policyRef', 'internal-project-review:v1'
						))
					);
					IF v_receipt->>'outcome' <> 'newly_admitted' THEN
						RAISE EXCEPTION 'fill failed: %', v_receipt;
					END IF;
				END LOOP;
			END
			$fill$;
		`);
		await expect(
			admit(
				{
					clientTurnId: 'busy-client-101',
					streamRunId: 'busy-stream-101',
					sessionId: null,
					context: {
						type: 'project',
						entityId: BUSY_PROJECT_ID,
						projectId: BUSY_PROJECT_ID
					}
				},
				BUSY_USER_ID
			)
		).resolves.toMatchObject({
			result: { outcome: 'capacity_exceeded', retryAfterSeconds: 30, queuedCount: 100 }
		});
		expect(
			psql(
				`SELECT count(*) FROM public.chat_turn_runs WHERE client_turn_id = 'busy-client-101';`
			)
		).toBe('0');
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
