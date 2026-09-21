// apps/worker/tests/projectReviewV2.postgres.test.ts
// Disposable PostgreSQL only: real admission, evidence query, validators and worker completion.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	buildAgenticChatWorkflowV4AdmissionArgs,
	admitAgenticChatWorkflowV4Turn
} from '../../web/src/lib/services/agentic-chat-v2/worker-turn-workflow-admission.server';
import {
	createPgSupabaseShim,
	serviceClient,
	startDisposableWorkflowPostgres,
	postgresAvailable,
	type DisposablePostgres
} from './helpers/workflowPostgres';
import {
	admitE2ETurn,
	seedE2EOwner,
	E2E_USER_ID,
	E2E_PROJECT_ID,
	buildE2EWorker,
	leaseAndClaimE2E,
	e2eFacts
} from './helpers/workflowEndToEnd';
import { scriptedWorkflowProvider } from './helpers/workflowProviderScript';
import { createWorkflowPreparationContextLoader } from '../src/workers/agentic-chat/workflow/context-loader';
import { parseSourceBoundReport } from '../src/workers/agentic-chat/workflow/source-bound-report';
import { buildAgenticChatWorkflowContextV1 } from '../src/workers/agentic-chat/workflow/prepared-context';
import { durableEvidenceIndexFromPreparedContext } from '../src/workers/agentic-chat/workflow/role-report';

const DOC = 'fd000000-0000-4000-8000-000000000001';
const RISK = 'fd000000-0000-4000-8000-000000000002';
const OTHER = 'fd000000-0000-4000-8000-000000000003';
const MIGRATIONS = [
	'20260920010743_agentic_chat_specialist_snapshots_v2.sql',
	'20260920032259_agentic_chat_document_read_tools_v1.sql',
	'20260920041644_agentic_chat_specialist_selection_shadow_v1.sql',
	'20260920154843_agentic_chat_document_evidence_handoff_v1.sql',
	'20260920162616_agentic_chat_specialist_workbench_v1.sql',
	'20260921002731_agentic_chat_published_specialist_execution_v1.sql',
	'20260921042959_agentic_chat_project_review_v2.sql',
	'20260921143217_agentic_chat_project_review_v3.sql'
];
(postgresAvailable ? describe : describe.skip)('project review v2/v3 against PostgreSQL', () => {
	let pg: DisposablePostgres,
		admin: Client,
		service: Client,
		shim: ReturnType<typeof createPgSupabaseShim>;
	beforeAll(async () => {
		const root = resolve(process.cwd(), '../..');
		pg = await startDisposableWorkflowPostgres(root, 'buildos-review-v2-pg-');
		admin = new Client(pg.connection);
		await admin.connect();
		await admin.query(`
   CREATE TABLE public.onto_documents(id uuid PRIMARY KEY, project_id uuid, title text, description text, content text, state_key text, type_key text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), deleted_at timestamptz, archived_at timestamptz, search_vector tsvector);
   CREATE TYPE public.risk_state AS ENUM ('identified', 'mitigated', 'occurred', 'closed');
   CREATE TABLE public.onto_risks(id uuid PRIMARY KEY, project_id uuid, title text, content text, state_key public.risk_state, impact text, probability numeric, updated_at timestamptz DEFAULT now(), created_at timestamptz DEFAULT now(), mitigated_at timestamptz, deleted_at timestamptz, archived_at timestamptz);
   CREATE TABLE public.onto_tasks(id uuid PRIMARY KEY, project_id uuid, title text, deleted_at timestamptz);
   CREATE TABLE public.onto_edges(id uuid PRIMARY KEY, project_id uuid, src_kind text, src_id uuid, rel text, dst_kind text, dst_id uuid, created_at timestamptz DEFAULT now());
   CREATE TABLE public.onto_project_logs(id uuid PRIMARY KEY, project_id uuid, entity_type text, entity_id uuid, action text, change_source text, created_at timestamptz DEFAULT now(), before_data jsonb, after_data jsonb);
   CREATE TABLE public.project_suggestions(id uuid PRIMARY KEY, project_id uuid, title text, status text, why_now text, rationale text, updated_at timestamptz DEFAULT now());
   GRANT SELECT ON public.onto_documents,public.onto_risks,public.onto_tasks,public.onto_edges,public.onto_project_logs,public.project_suggestions TO service_role;
   CREATE FUNCTION public.load_fastchat_context(text,uuid,uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('project',jsonb_build_object('id',$3,'name','Workshop launch'),'tasks','[]'::jsonb,'goals','[]'::jsonb,'milestones','[]'::jsonb,'plans','[]'::jsonb,'events','[]'::jsonb,'entity_counts',jsonb_build_object('tasks_total',25)) $$;
   GRANT EXECUTE ON FUNCTION public.load_fastchat_context(text,uuid,uuid) TO service_role;
  `);
		for (const migration of MIGRATIONS) {
			const sql = readFileSync(resolve(root, 'supabase/migrations', migration), 'utf8');
			try {
				await admin.query(sql);
			} catch (error) {
				const detail = error as { position?: string; where?: string };
				throw new Error(
					`${migration}: ${String(error)} at ${detail.position}; ${detail.where}`,
					{ cause: error }
				);
			}
		}
		await seedE2EOwner(admin);
		await admin.query("UPDATE public.users SET timezone='America/New_York' WHERE id=$1", [
			E2E_USER_ID
		]);
		await admin.query(
			`INSERT INTO public.onto_documents(id,project_id,title,content,search_vector,updated_at) SELECT gen_random_uuid(),$1,'Recent unrelated note','Nothing about the question',to_tsvector('english','unrelated note'),now() FROM generate_series(1,25)`,
			[E2E_PROJECT_ID]
		);
		await admin.query(
			`INSERT INTO public.onto_documents(id,project_id,title,content,search_vector,updated_at) VALUES($1,$2,'Safety permit',repeat('permit ',900),to_tsvector('english','permit'),'2020-01-01')`,
			[DOC, E2E_PROJECT_ID]
		);
		await admin.query(
			`INSERT INTO public.onto_risks(id,project_id,title,content,state_key,impact) VALUES ($1,$2,'Permit missing','A permit is required.','identified','high'),($3,$4,'PRIVATE OTHER PROJECT','must not leak','identified','high')`,
			[RISK, E2E_PROJECT_ID, randomUUID(), OTHER]
		);
		await admin.query(
			`INSERT INTO public.onto_edges(id,project_id,src_kind,src_id,rel,dst_kind,dst_id) VALUES(gen_random_uuid(),$1,'task',gen_random_uuid(),'depends_on','task',gen_random_uuid())`,
			[E2E_PROJECT_ID]
		);
		await admin.query(
			`INSERT INTO public.onto_project_logs(id,project_id,entity_type,entity_id,action,before_data,after_data) VALUES(gen_random_uuid(),$1,'task',gen_random_uuid(),'update','{"state_key":"todo","private":"secret"}','{"state_key":"done"}')`,
			[E2E_PROJECT_ID]
		);
		await admin.query(
			`INSERT INTO public.project_suggestions(id,project_id,title,status,why_now,rationale) VALUES(gen_random_uuid(),$1,'Investigate permit','pending','Before opening','Not a verified fact')`,
			[E2E_PROJECT_ID]
		);
		service = await serviceClient(pg.connection);
		shim = createPgSupabaseShim(service);
	}, 120000);
	afterAll(async () => {
		await service?.end();
		await admin?.end();
		pg?.stop();
	});
	async function evidence() {
		// Exercise the production loader's named args and AbortSignal path with a pg transport.
		const client = {
			rpc: (name: string, args: Record<string, unknown>) => ({
				abortSignal: (_signal: AbortSignal) => shim.rpc(name, args)
			})
		};
		return createWorkflowPreparationContextLoader(client as never)({
			userId: E2E_USER_ID,
			projectId: E2E_PROJECT_ID,
			projectReviewV2: true,
			question: 'permit',
			signal: new AbortController().signal
		});
	}
	it('checks source quotes and calculated dates in SQL against the accepted checkpoint', async () => {
		const loaded = await evidence();
		const tasks = ['2026-09-16', '2026-09-19', '2026-09-29', '2026-10-01', '2026-10-03'].map(
			(day, i) => ({
				id: `task-${i}`,
				title: `Task ${i}`,
				due_at: `${day}T03:59:59Z`,
				state_key: 'todo'
			})
		);
		const context = buildAgenticChatWorkflowContextV1({
			projectReviewV2: true,
			context: {
				...loaded,
				data: {
					...loaded.data,
					tasks,
					risks: [{ id: RISK, title: 'Permit', content: '🚧 A permit is required.' }]
				}
			} as typeof loaded,
			userId: E2E_USER_ID,
			projectId: E2E_PROJECT_ID,
			accessCheckedAt: '2026-09-21T12:00:00Z',
			contextLoadedAt: '2026-09-21T12:00:00Z'
		});
		const parsed = parseSourceBoundReport(
			JSON.stringify({
				outcome: 'findings',
				claims: [
					{
						kind: 'excerpt',
						source: RISK,
						field: 'content',
						quote: 'A permit is required.'
					},
					{
						kind: 'overdue_tasks',
						sources: tasks.map((task) => task.id),
						relation: 'count'
					}
				]
			}),
			'project_analyst',
			{ ...context, evidence: durableEvidenceIndexFromPreparedContext(context) }
		);
		if (!parsed.ok) throw new Error(parsed.reason);
		const check = async (value: unknown, hash = context.contextHash) =>
			(
				await service.query(
					'SELECT public.agentic_chat_workflow_role_report_valid_v3($1,$2,$3,$4,$5) AS valid',
					[
						JSON.stringify(value),
						'project_analyst',
						JSON.stringify(context.evidenceVersions),
						JSON.stringify(context.payload),
						hash
					]
				)
			).rows[0].valid;
		expect(await check(parsed.report)).toBe(true);
		expect(await check(parsed.report, '0'.repeat(64))).toBe(false);
		for (const value of [
			null,
			{},
			{
				...parsed.report,
				claims: parsed.report.claims.map((claim) =>
					claim.kind === 'overdue_tasks' ? { ...claim, relation: null } : claim
				)
			},
			{ ...parsed.report, summary: 'All five tasks are overdue.' },
			{
				...parsed.report,
				claims: parsed.report.claims.map((claim) =>
					claim.kind === 'overdue_tasks'
						? { ...claim, overdue: 5, relation: 'all' }
						: claim
				)
			},
			{
				...parsed.report,
				claims: parsed.report.claims.map((claim) =>
					claim.kind === 'excerpt'
						? { ...claim, quote: 'The permit is approved.' }
						: claim
				)
			}
		])
			expect(await check(value)).toBe(false);
		const grant = await admin.query(
			"SELECT has_function_privilege('authenticated','public.agentic_chat_workflow_role_report_valid_v3(jsonb,text,jsonb,jsonb,text)','EXECUTE') AS allowed"
		);
		expect(grant.rows[0].allowed).toBe(false);
	});
	it.each(['valid', 'invalid'])(
		'persists v3 source-bound reports with a %s editor and never publishes unchecked prose',
		async (mode) => {
			const args = await buildAgenticChatWorkflowV4AdmissionArgs({
				userId: E2E_USER_ID,
				command: { clientTurnId: randomUUID(), streamRunId: randomUUID(), sessionId: null },
				eligibility: {
					eligible: true,
					projectId: E2E_PROJECT_ID,
					message: 'Review the permit evidence.',
					projectReviewV3: true
				},
				transportDecisionId: randomUUID()
			});
			expect(
				(await admitAgenticChatWorkflowV4Turn({ client: shim as never, args })).outcome
			).toBe('newly_admitted');
			const provider = scriptedWorkflowProvider((call) => ({
				kind: 'text',
				text:
					call.role === 'planner'
						? '{}'
						: call.role === 'editor'
							? mode === 'valid'
								? JSON.stringify({
										selection: ['project_analyst:C1', 'risk_reviewer:C1']
									})
								: 'All tasks are overdue and the permit has been approved.'
							: JSON.stringify({
									outcome: 'findings',
									claims: [
										{
											kind: 'excerpt',
											source: RISK,
											field: 'content',
											quote: 'A permit is required.'
										}
									]
								})
			}));
			const errors: unknown[] = [];
			const worker = buildE2EWorker({
				shim,
				client: provider.client,
				projectReviewV3Enabled: true,
				context: await evidence(),
				onError: (error) => errors.push(error)
			});
			try {
				expect(
					await worker.execute(await leaseAndClaimE2E(admin, shim, args.p_turn_run_id))
				).toMatchObject({ terminalStatus: 'completed' });
			} finally {
				await worker.stop();
			}
			expect(errors).toEqual([]);
			const saved = await admin.query(
				'SELECT policy_ref, context_payload, answer_text FROM public.chat_turn_workflow_runs WHERE turn_run_id=$1',
				[args.p_turn_run_id]
			);
			expect(saved.rows[0].policy_ref).toBe('internal-project-review:v3');
			expect(saved.rows[0].context_payload.version).toBe(
				'agentic_chat_project_review_payload_v2'
			);
			expect(saved.rows[0].answer_text).toContain('A permit is required.');
			expect(saved.rows[0].answer_text).not.toContain('All tasks are overdue');
			expect(saved.rows[0].answer_text).not.toContain('permit has been approved');
			expect((await e2eFacts(admin, args.p_turn_run_id)).effects).toBe(0);
			const reports = await admin.query(
				"SELECT result FROM public.chat_turn_workflow_steps WHERE turn_run_id=$1 AND step_key IN ('project_analyst','risk_reviewer')",
				[args.p_turn_run_id]
			);
			for (const row of reports.rows)
				expect(row.result.version).toBe('chat_workflow_role_report_v3');
		}
	);
	it('loads relevant old documents, bounded families and truthful coverage without crossing projects', async () => {
		const loaded = await evidence();
		expect(loaded.timezone).toBe('America/New_York');
		const data = loaded.data as any;
		expect(data.documents).toHaveLength(20);
		expect(data.documents[0]).toMatchObject({
			id: DOC,
			content_coverage: 'excerpt',
			included_characters: 4000
		});
		expect(data.documents.filter((d: any) => d.content !== null)).toHaveLength(4);
		expect(data.review_coverage).toMatchObject({
			documents: { total: 26 },
			tasks: { total: 25 },
			risks: { total: 1 },
			relationships: { total: 1 }
		});
		expect(data.risks).toEqual([expect.objectContaining({ id: RISK })]);
		expect(data.prior_suggestions[0].evidence_kind).toBe(
			'prior_recommendation_not_verified_fact'
		);
		expect(JSON.stringify(data.activity)).not.toContain('secret');
		expect(JSON.stringify(data)).not.toContain('PRIVATE OTHER PROJECT');
		const denied = await shim.rpc('load_agentic_chat_project_review_evidence_v2', {
			p_user_id: randomUUID(),
			p_project_id: E2E_PROJECT_ID,
			p_question: 'permit'
		});
		expect(denied.error).toBeTruthy();
		const grants = await admin.query(
			`SELECT has_function_privilege('authenticated','public.load_agentic_chat_project_review_evidence_v2(uuid,uuid,text)','EXECUTE') AS allowed`
		);
		expect(grants.rows[0].allowed).toBe(false);
	});
	it('rejects malformed outcomes and forged identities without throwing from the SQL validator', async () => {
		const report = {
			version: 'chat_workflow_role_report_v2',
			role: 'risk_reviewer',
			specialist: { id: 'risk_reviewer', version: 3 },
			outcome: 'insufficient_evidence',
			summary: 'More evidence is needed.',
			findings: [],
			risks: [],
			unknowns: ['Permit status'],
			recommendation: 'Check the permit.',
			unsupportedReferences: 0,
			unsupportedFindings: 0
		};
		const check = async (value: unknown) =>
			(
				await service.query(
					'SELECT public.agentic_chat_workflow_role_report_valid_v2($1,$2,$3) AS valid',
					[JSON.stringify(value), 'risk_reviewer', '[]']
				)
			).rows[0].valid;
		expect(await check(report)).toBe(true);
		for (const value of [
			null,
			{},
			{ ...report, outcome: null },
			{ ...report, unknowns: [] },
			{ ...report, risks: 1 },
			{ ...report, findings: {} },
			{ ...report, specialist: { id: 'risk_reviewer', version: 2 } }
		])
			expect(await check(value)).toBe(false);
	});
	it('completes and persists v2 abstentions through real admission and worker fences', async () => {
		const args = await buildAgenticChatWorkflowV4AdmissionArgs({
			userId: E2E_USER_ID,
			command: { clientTurnId: randomUUID(), streamRunId: randomUUID(), sessionId: null },
			eligibility: {
				eligible: true,
				projectId: E2E_PROJECT_ID,
				message: 'Review the permit evidence.',
				projectReviewV2: true
			},
			transportDecisionId: randomUUID()
		});
		expect(
			(await admitAgenticChatWorkflowV4Turn({ client: shim as never, args })).outcome
		).toBe('newly_admitted');
		const provider = scriptedWorkflowProvider((call) => ({
			kind: 'text',
			text:
				call.role === 'planner'
					? JSON.stringify({ analyst: 'Inspect permit.', reviewer: 'Check risks.' })
					: call.role === 'editor'
						? 'The saved evidence is insufficient to establish permit approval.'
						: JSON.stringify({
								outcome: 'insufficient_evidence',
								summary: 'Approval cannot be established.',
								findings: [],
								risks: [],
								unknowns: ['Current permit approval'],
								recommendation: 'Check the permit authority.'
							})
		}));
		const errors: unknown[] = [];
		const worker = buildE2EWorker({
			shim,
			client: provider.client,
			projectReviewV2Enabled: true,
			context: await evidence(),
			onError: (e) => errors.push(e)
		});
		try {
			const result = await worker.execute(
				await leaseAndClaimE2E(admin, shim, args.p_turn_run_id)
			);
			expect(errors).toEqual([]);
			expect(result).toMatchObject({ terminalStatus: 'completed' });
		} finally {
			await worker.stop();
		}
		expect(errors).toEqual([]);
		const facts = await e2eFacts(admin, args.p_turn_run_id);
		expect(facts.turn.status).toBe('completed');
		expect(facts.effects).toBe(0);
		expect(provider.callsFor('project_analyst')).toHaveLength(1);
		expect(provider.callsFor('risk_reviewer')).toHaveLength(1);
		expect(provider.callsFor('editor')[0]?.body.messages[1]?.content).toContain(
			'insufficient_evidence'
		);
		const saved = await admin.query(
			`SELECT step_key, result FROM public.chat_turn_workflow_steps WHERE turn_run_id=$1 AND step_key IN ('project_analyst','risk_reviewer')`,
			[args.p_turn_run_id]
		);
		expect(saved.rows).toHaveLength(2);
		for (const row of saved.rows)
			expect(row.result).toMatchObject({
				version: 'chat_workflow_role_report_v2',
				outcome: 'insufficient_evidence',
				findings: []
			});
	});
	it('keeps v1 execution working after the v2 migration', async () => {
		const turnRunId = await admitE2ETurn(shim, 601);
		const provider = scriptedWorkflowProvider((call) => ({
			kind: 'text',
			text:
				call.role === 'planner'
					? '{}'
					: call.role === 'editor'
						? 'Check the venue.'
						: JSON.stringify({
								summary: 'Venue needs attention.',
								findings: [
									{
										claim: 'Inspect the venue task.',
										basis: 'recorded',
										evidence: ['task-1']
									}
								],
								risks: [],
								unknowns: [],
								recommendation: 'Check the venue.'
							})
		}));
		const worker = buildE2EWorker({ shim, client: provider.client });
		try {
			expect(
				await worker.execute(await leaseAndClaimE2E(admin, shim, turnRunId))
			).toMatchObject({ terminalStatus: 'completed' });
		} finally {
			await worker.stop();
		}
		const saved = await admin.query(
			`SELECT result FROM public.chat_turn_workflow_steps WHERE turn_run_id=$1 AND step_key='project_analyst'`,
			[turnRunId]
		);
		expect(saved.rows[0].result.version).toBe('chat_workflow_role_report_v1');
	});
});
