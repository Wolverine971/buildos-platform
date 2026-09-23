// apps/worker/tests/contextFinderPilot.live.test.ts
//
// PAID AND OPT-IN (CONTEXT_FINDER_PILOT=1). Skipped in every normal run.
//
// Runs the real published-specialist workflow (admission, claim, preparation, checkpoint,
// planner/analyst/reviewer/editor, document reads) on a disposable PostgreSQL with real
// DeepSeek and real Jev. Project data is read from the linked app database READ-ONLY
// (`load_fastchat_context` is STABLE; the finder loader only selects); nothing is written
// there and no queue is touched. Three arms per labeled question:
//   baseline: today's recency-capped inventory + document reads, no finder
//   auto:     the worker ranks with Jev during preparation
//   curated:  a Workflow Lab preview plan with one user edit, materialized without Jev
// Answers are fact-graded by Jev against the eval's hand labels. Output (private project
// text) goes to output/context-finder-pilot/<timestamp>/ with mode 0600: results, a report,
// and per run (runs/) every provider call (timing, finish reason, hidden-reasoning tokens,
// serving provider, visible text) joined to its dispatch, step and event rows.
//
// Env:
//   CONTEXT_FINDER_PILOT_SCENARIOS  scenario keys
//   CONTEXT_FINDER_PILOT_ARMS       baseline,auto,curated
//   CONTEXT_FINDER_PILOT_REPS       default 1
//   CONTEXT_FINDER_PILOT_ROUTING    `workflow` (the worker's workflow provider policy) or
//                                   `openrouter_default` (no preferences: the 2026-09-22 pilot)
//   CONTEXT_FINDER_PILOT_HANDOFF    `off` (default, production: analyst and reviewer in
//                                   parallel) or `on` (serial evidence handoff: the 09-22 pilot)
//   CONTEXT_FINDER_PILOT_BUDGET_USD       stop before the next review past this measured spend
//   CONTEXT_FINDER_PILOT_MAX_CREDITS_USD  stop before the next review once the OpenRouter
//                                         account's usage has risen this much (every caller of
//                                         the shared key counts, so it errs toward stopping)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { parse } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JevClient } from '@buildos/smart-llm';
import { createFastChatContextLoader } from '@buildos/agentic-chat-runtime/context/loader';
import { createSpecialistStarterDraftV1 } from '@buildos/agentic-chat-runtime/specialists';
import {
	applyContextPlanEdits,
	buildContextFinderEntities,
	contextFinderCandidates,
	findProjectContext,
	loadContextFinderProject,
	type ContextFinderReadClient,
	type ContextPlanV1
} from '@buildos/agentic-chat-runtime/context-finder';
import {
	saveSpecialistWorkbenchDraft,
	publishSpecialistWorkbenchVersion,
	type SpecialistWorkbenchClient
} from '../../web/src/lib/services/agentic-chat-v2/specialist-workbench.server';
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
	seedE2EOwner,
	E2E_USER_ID,
	E2E_ACTOR_ID,
	buildE2EWorker,
	leaseAndClaimE2E,
	e2eFacts
} from './helpers/workflowEndToEnd';
import { AgenticChatOpenRouterClient } from '../src/workers/agentic-chat/provider/openrouter-client';
import {
	AGENTIC_CHAT_WORKFLOW_REQUEST_TIMEOUT_MS,
	AGENTIC_CHAT_WORKFLOW_RESPONSE_HEADERS_TIMEOUT_MS,
	buildAgenticChatWorkflowRoutesV1
} from '../src/workers/agentic-chat/workflow/workflow-dispatch';
import {
	createWorkflowContextFinder,
	WORKFLOW_CONTEXT_FINDER_TIMEOUT_MS
} from '../src/workers/agentic-chat/workflow/context-finder-port';
import {
	createProviderCapture,
	providerCallTiming,
	type CapturedProviderCallV1
} from './helpers/providerCapture';

const ENABLED = process.env.CONTEXT_FINDER_PILOT === '1';
const ROOT = resolve(process.cwd(), '../..');
/** Skip the remaining runs past this spend (model dispatches + Jev), checked before each review. */
const BUDGET_USD = Number(process.env.CONTEXT_FINDER_PILOT_BUDGET_USD ?? '0.25');
/** Independent stop on the account's measured usage delta (OpenRouter `/credits`). */
const MAX_CREDITS_USD = Number(process.env.CONTEXT_FINDER_PILOT_MAX_CREDITS_USD ?? '0.30');
const ALL_ARMS = ['baseline', 'auto', 'curated'] as const;
type Arm = (typeof ALL_ARMS)[number];
const ARMS: Arm[] = (process.env.CONTEXT_FINDER_PILOT_ARMS ?? ALL_ARMS.join(','))
	.split(',')
	.map((arm) => arm.trim() as Arm)
	.filter((arm) => {
		if (!ALL_ARMS.includes(arm)) throw new Error(`Unknown pilot arm ${arm}`);
		return true;
	});
const REPS = Math.max(1, Number(process.env.CONTEXT_FINDER_PILOT_REPS ?? '1'));
const ROUTING = process.env.CONTEXT_FINDER_PILOT_ROUTING ?? 'workflow';
if (ROUTING !== 'workflow' && ROUTING !== 'openrouter_default')
	throw new Error('CONTEXT_FINDER_PILOT_ROUTING must be workflow or openrouter_default');
const HANDOFF = process.env.CONTEXT_FINDER_PILOT_HANDOFF ?? 'off';
if (HANDOFF !== 'on' && HANDOFF !== 'off')
	throw new Error('CONTEXT_FINDER_PILOT_HANDOFF must be on or off');

type Scenario = {
	key: string;
	project: string;
	message: string;
	must: string[];
	answerFacts?: string[];
	control?: boolean;
};

// Read only when the pilot runs: collection of the skipped suite must not touch local files.
function loadScenarios() {
	const labels = JSON.parse(
		readFileSync(
			resolve(ROOT, 'docs/research/jev-context-ranker-2026-09-22/scenarios.json'),
			'utf8'
		)
	) as { projects: Record<string, string>; scenarios: Scenario[] };
	const keys = (
		process.env.CONTEXT_FINDER_PILOT_SCENARIOS ??
		'9t-influencers,9t-email-strategy,school-cost,school-who'
	)
		.split(',')
		.map((key) => key.trim());
	const scenarios = keys.map((key) => {
		const found = labels.scenarios.find(
			(scenario) => scenario.key === key && !scenario.control
		);
		if (!found?.answerFacts) throw new Error(`Unknown or unlabeled scenario ${key}`);
		return found;
	});
	return { labels, SCENARIOS: scenarios };
}

type Result = {
	scenario: string;
	arm: Arm;
	rep: number;
	routing: string;
	handoff: string;
	/** OpenRouter account usage delta across this review (all callers of the key). */
	creditsUsd: number | null;
	turnRunId: string;
	status: string | undefined;
	outcome: string | undefined;
	answer: string;
	facts: number[];
	factsHit: number;
	modelUsd: number;
	jevUsd: number;
	durationMs: number;
	steps: Record<string, string>;
	documentReads: string[];
	evidence: {
		status: string;
		source: string;
		ranker: unknown;
		full: {
			id: string;
			title: string;
			p: number | null;
			pinned?: boolean;
			sections: (string | null)[];
		}[];
		summaries: number;
		missing: unknown[];
		coverage: unknown;
	} | null;
	citableRecords: number;
	edit: string | null;
	mustLoadedInFull: number;
	timeline: RunTimeline;
};

type RunTimeline = {
	/** Admission to the planner's claim: queue pickup, preparation, context finder. */
	preparationMs: number | null;
	steps: {
		step: string;
		status: string;
		failureCode: string | null;
		attempts: number;
		startMs: number | null;
		durationMs: number | null;
	}[];
	calls: {
		step: string | null;
		role: string | null;
		kind: string | null;
		physicalAttempt: number | null;
		/** The model the request led with; route health moves a turn to the fallback after a failure. */
		requestModel: unknown;
		startMs: number;
		provider: string | null;
		model: string | null;
		maxTokens: unknown;
		promptTokens: number | null;
		finishReason: string | null;
		error: string | null;
		textChars: number;
		timing: ReturnType<typeof providerCallTiming>;
	}[];
};

(ENABLED && postgresAvailable ? describe : describe.skip)('context finder paid pilot', () => {
	let apiKey: string | undefined;
	// The linked app database, read-only here.
	let source: ReturnType<typeof createClient>;
	const outDir = resolve(
		ROOT,
		'output/context-finder-pilot',
		new Date().toISOString().replace(/[:.]/g, '-')
	);
	let pg: DisposablePostgres;
	let admin: Client;
	let service: Client;
	let shim: ReturnType<typeof createPgSupabaseShim>;
	const results: Result[] = [];
	let spent = 0;
	let creditsAtStart: number | null = null;

	/** Account usage so far (USD), or null when the endpoint is unavailable. */
	async function creditsUsage(): Promise<number | null> {
		try {
			const response = await fetch('https://openrouter.ai/api/v1/credits', {
				headers: { Authorization: `Bearer ${apiKey}` }
			});
			const body = (await response.json()) as { data?: { total_usage?: number } };
			return typeof body.data?.total_usage === 'number' ? body.data.total_usage : null;
		} catch {
			return null;
		}
	}

	beforeAll(async () => {
		const env = parse(readFileSync(resolve(ROOT, 'apps/worker/.env')));
		apiKey = env.PRIVATE_OPENROUTER_API_KEY?.trim();
		if (!apiKey) throw new Error('PRIVATE_OPENROUTER_API_KEY missing from apps/worker/.env');
		source = createClient(env.PUBLIC_SUPABASE_URL!, env.PRIVATE_SUPABASE_SERVICE_KEY!, {
			auth: { persistSession: false, autoRefreshToken: false }
		});
		mkdirSync(outDir, { recursive: true, mode: 0o700 });
		creditsAtStart = await creditsUsage();
		// Free: the endpoint pool as OpenRouter saw it for this run (throughput, latency, price).
		for (const model of ['deepseek/deepseek-v4.1-flash', 'deepseek/deepseek-v4-flash'])
			try {
				const endpoints = await fetch(
					`https://openrouter.ai/api/v1/models/${model}/endpoints`,
					{
						headers: { Authorization: `Bearer ${apiKey}` }
					}
				);
				writeFileSync(
					resolve(outDir, `endpoints-${model.split('/')[1]}.json`),
					await endpoints.text(),
					{ mode: 0o600 }
				);
			} catch {
				// Diagnostics only.
			}
		pg = await startDisposableWorkflowPostgres(ROOT, 'buildos-context-finder-pilot-pg-');
		admin = new Client(pg.connection);
		await admin.connect();
		await admin.query(
			'CREATE TABLE public.onto_documents (id uuid PRIMARY KEY, project_id uuid, title text, content text, updated_at timestamptz, deleted_at timestamptz); GRANT SELECT ON public.onto_documents TO service_role;'
		);
		for (const migration of [
			'20260920010743_agentic_chat_specialist_snapshots_v2.sql',
			'20260920032259_agentic_chat_document_read_tools_v1.sql',
			'20260920041644_agentic_chat_specialist_selection_shadow_v1.sql',
			'20260920154843_agentic_chat_document_evidence_handoff_v1.sql',
			'20260920162616_agentic_chat_specialist_workbench_v1.sql',
			'20260921002731_agentic_chat_published_specialist_execution_v1.sql',
			'20260921041759_agentic_chat_specialist_recommendations_v1.sql'
		])
			await admin.query(
				readFileSync(resolve(ROOT, 'supabase/migrations', migration), 'utf8')
			);
		await seedE2EOwner(admin);
		service = await serviceClient(pg.connection);
		shim = createPgSupabaseShim(service);
	}, 180_000);

	afterAll(async () => {
		writeFileSync(resolve(outDir, 'results.json'), JSON.stringify(results, null, 2), {
			mode: 0o600
		});
		writeFileSync(resolve(outDir, 'report.md'), report(results), { mode: 0o600 });
		const creditsAtEnd = await creditsUsage();
		console.info(
			`Context finder pilot: ${outDir} · measured spend ~$${spent.toFixed(4)} · account usage delta ${creditsAtStart === null || creditsAtEnd === null ? 'unknown' : `$${(creditsAtEnd - creditsAtStart).toFixed(4)}`}`
		);
		await service?.end();
		await admin?.end();
		pg?.stop();
	});

	it(
		'runs baseline, auto and curated reviews on real projects',
		async () => {
			const { labels, SCENARIOS } = loadScenarios();
			const judge = new JevClient({
				apiKey: apiKey!,
				timeoutMs: 20_000,
				retryOnce: true,
				title: 'BuildOS context finder pilot judge'
			});
			const ranker = new JevClient({
				apiKey: apiKey!,
				// The worker's preparation budget, not the 09-22 pilot's 3 s (which timed out).
				timeoutMs: WORKFLOW_CONTEXT_FINDER_TIMEOUT_MS,
				maxRequestBytes: 96_000,
				retryOnce: false,
				title: 'BuildOS Context Finder'
			});
			// Every finder call made through the worker port, with its Jev cost.
			let finderJevUsd = 0;
			const meteredRanker = {
				decide: async (...args: Parameters<JevClient['decide']>) => {
					const result = await ranker.decide(...args);
					finderJevUsd += result.receipt.costUsd ?? 0;
					return result;
				}
			};
			const findContext = createWorkflowContextFinder({
				client: source as unknown as ContextFinderReadClient,
				decider: meteredRanker
			});
			// The same workflow-only priced routes the worker builds. The route's own model is
			// replaced: workflow requests lead with the pinned V4.1 Flash, V4 Flash as fallback.
			const routes = buildAgenticChatWorkflowRoutesV1([
				{
					id: 'openrouter',
					kind: 'openrouter' as const,
					baseUrl: 'https://openrouter.ai/api/v1',
					apiKey: apiKey!,
					model: 'deepseek/deepseek-v4-flash'
				}
			]).map((route) =>
				ROUTING === 'openrouter_default' ? { ...route, providerRouting: undefined } : route
			);
			const capture = createProviderCapture();
			const provider = new AgenticChatOpenRouterClient(
				{ usage: { observe: () => undefined } },
				{
					routes,
					httpReferer: 'https://build-os.com',
					appName: 'BuildOS Context Finder Pilot',
					fetchImpl: capture.fetchImpl,
					requestTimeoutMs: AGENTIC_CHAT_WORKFLOW_REQUEST_TIMEOUT_MS,
					responseHeadersTimeoutMs: AGENTIC_CHAT_WORKFLOW_RESPONSE_HEADERS_TIMEOUT_MS
				}
			);
			mkdirSync(resolve(outDir, 'runs'), { recursive: true, mode: 0o700 });
			const catalog = shim as unknown as SpecialistWorkbenchClient;
			const draftId = randomUUID();
			await saveSpecialistWorkbenchDraft(
				catalog,
				E2E_USER_ID,
				draftId,
				0,
				createSpecialistStarterDraftV1('research_synthesizer')
			);
			const published = await publishSpecialistWorkbenchVersion(
				catalog,
				E2E_USER_ID,
				draftId,
				1
			);
			const loader = createFastChatContextLoader({ logger: { warn: () => undefined } });

			for (const projectKey of new Set(SCENARIOS.map((scenario) => scenario.project))) {
				const projectId = labels.projects[projectKey]!;
				const owner = await ownerUserId(projectId);
				const signal = new AbortController().signal;
				// One consistent read of the project for every arm.
				const project = await loadContextFinderProject(
					source as unknown as ContextFinderReadClient,
					projectId,
					signal
				);
				const baselineContext = await loader.loadFastChatPromptContext({
					supabase: source as never,
					userId: owner,
					contextType: 'project',
					entityId: projectId
				});
				await admin.query(
					`INSERT INTO public.onto_projects (id, name, created_by) VALUES ($1, $2, $3)
					ON CONFLICT DO NOTHING`,
					[projectId, project.project.name, E2E_ACTOR_ID]
				);
				for (const doc of project.documents)
					await admin.query(
						'INSERT INTO public.onto_documents VALUES ($1,$2,$3,$4,$5,NULL) ON CONFLICT DO NOTHING',
						[doc.id, projectId, doc.title, doc.content ?? '', doc.updated_at]
					);
				const entities = buildContextFinderEntities(project);
				const resolveId = (prefix: string) =>
					entities.find((entity) => entity.id.startsWith(prefix))?.id ?? null;

				for (const scenario of SCENARIOS.filter((s) => s.project === projectKey)) {
					const must = scenario.must.map(resolveId).filter((id): id is string => !!id);
					for (let rep = 1; rep <= REPS; rep += 1)
						for (const arm of ARMS) {
							const creditsBefore = await creditsUsage();
							const accountDelta =
								creditsAtStart === null || creditsBefore === null
									? null
									: creditsBefore - creditsAtStart;
							if (spent > BUDGET_USD || (accountDelta ?? 0) > MAX_CREDITS_USD) {
								console.warn(
									`Budget reached (measured $${spent.toFixed(4)} / $${BUDGET_USD}, account $${accountDelta?.toFixed(4) ?? '?'} / $${MAX_CREDITS_USD}); skipping ${scenario.key}/${arm}/r${rep}`
								);
								continue;
							}
							let edit: string | null = null;
							let previewJevUsd = 0;
							let contextFinder:
								| { version: 'context_finder_request_v1'; mode: 'auto' }
								| {
										version: 'context_finder_request_v1';
										mode: 'curated';
										plan: ContextPlanV1;
								  }
								| undefined;
							if (arm === 'auto')
								contextFinder = {
									version: 'context_finder_request_v1',
									mode: 'auto'
								};
							if (arm === 'curated') {
								// What Workflow Lab's preview returns, then one edit a user who knows the
								// project would make: pin the first must-have record not loaded in full.
								const preview = await findProjectContext({
									project,
									message: scenario.message,
									decider: {
										decide: async (
											...args: Parameters<JevClient['decide']>
										) => {
											const result = await ranker.decide(...args);
											previewJevUsd += result.receipt.costUsd ?? 0;
											return result;
										}
									}
								});
								if (!preview.plan) {
									spent += previewJevUsd;
									console.warn(
										`Preview ranking unavailable; skipping ${scenario.key}/${arm}`
									);
									continue;
								}
								let plan = preview.plan;
								const full = new Set(
									plan.items
										.filter((item) => item.tier === 'full')
										.map((item) => item.id)
								);
								const missing = must.find((id) => !full.has(id));
								if (missing) {
									const candidate = contextFinderCandidates(
										preview.entities,
										preview.ranking
									).find((x) => x.id === missing);
									const inPlan = plan.items.some((item) => item.id === missing);
									plan = applyContextPlanEdits(plan, {
										pins: inPlan ? [missing] : [],
										drops: [],
										added: !inPlan && candidate ? [candidate] : []
									});
									edit = `pinned ${candidate?.title ?? missing}`;
								} else edit = 'none (every must-have already loaded in full)';
								contextFinder = {
									version: 'context_finder_request_v1',
									mode: 'curated',
									plan
								};
							}
							const args = await buildAgenticChatWorkflowV4AdmissionArgs({
								userId: E2E_USER_ID,
								command: {
									clientTurnId: randomUUID(),
									streamRunId: randomUUID(),
									sessionId: null
								},
								eligibility: {
									eligible: true,
									projectId,
									message: scenario.message,
									profile: 'document_organization',
									documentReadTools: true,
									documentEvidenceHandoff: HANDOFF === 'on'
								},
								published: {
									snapshot: published.snapshot,
									snapshotHash: published.version.snapshotHash,
									...(contextFinder ? { contextFinder } : {})
								},
								transportDecisionId: randomUUID()
							});
							const admitted = await admitAgenticChatWorkflowV4Turn({
								client: shim as never,
								args
							});
							expect(admitted.outcome).toBe('newly_admitted');
							const turnRunId = args.p_turn_run_id as string;
							const errors: { stage: string }[] = [];
							const worker = buildE2EWorker({
								shim,
								client: provider,
								specialistWorkflowsEnabled: true,
								documentReadToolsEnabled: true,
								documentEvidenceHandoffEnabled: HANDOFF === 'on',
								publishedSpecialistsEnabled: true,
								findContext,
								context: baselineContext,
								onError: (report) => errors.push(report)
							});
							const finderBefore = finderJevUsd;
							const callMark = capture.calls.length;
							const started = Date.now();
							try {
								await worker.execute(
									await leaseAndClaimE2E(admin, shim, turnRunId)
								);
							} finally {
								await worker.stop();
							}
							const durationMs = Date.now() - started;
							await capture.settled();
							const calls = capture.since(callMark);
							const rows = await exportRunRows(turnRunId);
							const timeline = buildTimeline(started, rows, calls);
							writeFileSync(
								resolve(outDir, 'runs', `${scenario.key}-${arm}-r${rep}.json`),
								JSON.stringify(
									{
										scenario: scenario.key,
										arm,
										rep,
										routing: ROUTING,
										turnRunId,
										timeline,
										rows,
										calls
									},
									null,
									2
								),
								{ mode: 0o600 }
							);
							const facts = await e2eFacts(admin, turnRunId);
							const answer = String(
								facts.run?.answer_text ?? facts.messages[0]?.content ?? ''
							);
							const modelUsd =
								facts.dispatches.reduce(
									(n, d) => n + (d.actual ?? d.reserved ?? 0),
									0
								) / 1e6;
							const ctx = await admin.query(
								`SELECT context_payload->'data'->'selected_evidence' AS evidence,
								jsonb_array_length(evidence_versions) AS citable
							FROM public.chat_turn_workflow_runs WHERE turn_run_id = $1`,
								[turnRunId]
							);
							const reads = await admin.query(
								'SELECT document_ids FROM public.chat_turn_document_read_batches WHERE turn_run_id = $1',
								[turnRunId]
							);
							const graded = answer
								? await judgeFacts(judge, scenario, answer)
								: { facts: [], cost: 0 };
							const evidence = ctx.rows[0]?.evidence as Record<string, any> | null;
							const fullIds = new Set<string>(
								(evidence?.full ?? []).map((item: { id: string }) => item.id)
							);
							const jevUsd =
								graded.cost + previewJevUsd + (finderJevUsd - finderBefore);
							spent += modelUsd + jevUsd;
							const creditsAfter = await creditsUsage();
							const result: Result = {
								scenario: scenario.key,
								arm,
								rep,
								routing: ROUTING,
								handoff: HANDOFF,
								creditsUsd:
									creditsBefore === null || creditsAfter === null
										? null
										: creditsAfter - creditsBefore,
								turnRunId,
								status: facts.turn?.status,
								outcome: facts.run?.terminal_outcome,
								answer,
								facts: graded.facts,
								factsHit: graded.facts.filter((p) => p >= 0.5).length,
								modelUsd,
								jevUsd,
								durationMs,
								steps: Object.fromEntries(
									facts.steps.map((s) => [s.step_key, s.status])
								),
								documentReads:
									(reads.rows[0]?.document_ids as string[] | undefined) ?? [],
								evidence: evidence
									? {
											status: evidence.status,
											source: evidence.source,
											ranker: evidence.ranker,
											full: (evidence.full ?? []).map(
												(item: Record<string, any>) => ({
													id: item.id,
													title: item.title,
													p: item.p,
													...(item.pinned ? { pinned: true } : {}),
													sections: (item.excerpts ?? []).map(
														(excerpt: { heading: string | null }) =>
															excerpt.heading
													)
												})
											),
											summaries: (evidence.summaries ?? []).length,
											missing: evidence.missing ?? [],
											coverage: evidence.coverage
										}
									: null,
								citableRecords: Number(ctx.rows[0]?.citable ?? 0),
								edit,
								mustLoadedInFull: must.filter((id) => fullIds.has(id)).length,
								timeline
							};
							results.push(result);
							writeFileSync(
								resolve(outDir, 'results.json'),
								JSON.stringify(results, null, 2),
								{
									mode: 0o600
								}
							);
							console.info(
								`${scenario.key} ${arm} r${rep}: ${result.status}/${result.outcome} facts ${result.factsHit}/${scenario.answerFacts!.length} · $${(modelUsd + jevUsd).toFixed(4)} · ${Math.round(durationMs / 1000)}s · steps ${timeline.steps.map((st) => `${st.step}=${st.status}${st.failureCode ? `(${st.failureCode})` : ''}`).join(' ')} · errors ${errors.map((e) => e.stage).join(',') || 'none'}`
							);
						}
				}
			}
			expect(results.length).toBeGreaterThan(0);
		},
		60 * 60_000
	);

	/** Rows the disposable database would otherwise take with it. Heavy payloads dropped. */
	async function exportRunRows(turnRunId: string) {
		// One failed export query must not lose a paid run's other evidence.
		const q = async (sql: string) => {
			try {
				return (await admin.query(sql, [turnRunId])).rows.map(
					(row) => row.j as Record<string, any>
				);
			} catch (error) {
				return [{ exportError: error instanceof Error ? error.message : String(error) }];
			}
		};
		const [turn, run, steps, dispatches, events, reads] = await Promise.all([
			q(`SELECT to_jsonb(t) AS j FROM public.chat_turn_runs t WHERE t.id = $1`),
			q(`SELECT to_jsonb(r) - 'context_payload' - 'evidence_versions' - 'answer_text' - 'policy' AS j
				FROM public.chat_turn_workflow_runs r WHERE r.turn_run_id = $1`),
			q(`SELECT to_jsonb(s) - 'result' AS j FROM public.chat_turn_workflow_steps s
				WHERE s.turn_run_id = $1 ORDER BY s.created_at`),
			q(`SELECT to_jsonb(d) - 'pricing' AS j FROM public.chat_turn_workflow_dispatches d
				WHERE d.turn_run_id = $1 ORDER BY d.reserved_at, d.physical_attempt`),
			q(`SELECT to_jsonb(e) - 'payload' AS j FROM public.chat_turn_events e
				WHERE e.turn_run_id = $1 ORDER BY e.execution_generation, e.sequence_index`),
			q(`SELECT to_jsonb(b) - 'result' AS j FROM public.chat_turn_document_read_batches b
				WHERE b.turn_run_id = $1`)
		]);
		return { turn: turn[0] ?? null, run: run[0] ?? null, steps, dispatches, events, reads };
	}

	async function ownerUserId(projectId: string): Promise<string> {
		const project = await source
			.from('onto_projects')
			.select('created_by')
			.eq('id', projectId)
			.maybeSingle();
		const actor = await source
			.from('onto_actors')
			.select('user_id')
			.eq('id', (project.data as { created_by: string } | null)?.created_by ?? '')
			.maybeSingle();
		const userId = (actor.data as { user_id: string } | null)?.user_id;
		if (!userId) throw new Error(`No owner for project ${projectId}`);
		return userId;
	}
});

async function judgeFacts(judge: JevClient, scenario: Scenario, answer: string) {
	const facts = scenario.answerFacts!;
	// Same judge as the offline eval: structured yes/no per labeled fact, no lexical matching.
	const verdict = await judge.decide({
		state: { question: scenario.message, answer, claims: facts },
		questions: Object.fromEntries(
			facts.map((_, i) => [
				`f${i}`,
				{
					type: 'noul' as const,
					instructions: {
						question: `Does \`answer\` state or clearly convey \`claims[${i}]\`?`,
						rules: [
							'Judge only what the answer text says. Paraphrase counts; a vague gesture does not.'
						]
					}
				}
			])
		)
	});
	return {
		facts: verdict.ok
			? facts.map(
					(_, i) => (verdict.answers as Record<string, { noul: number }>)[`f${i}`]!.noul
				)
			: [],
		cost: verdict.receipt.costUsd ?? 0
	};
}

function buildTimeline(
	startedAtMs: number,
	rows: {
		steps: Record<string, any>[];
		dispatches: Record<string, any>[];
	},
	calls: CapturedProviderCallV1[]
): RunTimeline {
	const ms = (value: unknown) =>
		typeof value === 'string' ? Date.parse(value) - startedAtMs : null;
	// A call is its dispatch when the serialized request bytes match (one row per request).
	const unmatched = [...rows.dispatches];
	const planner = rows.steps.find((step) => step.step_key === 'planner');
	return {
		preparationMs: ms(planner?.claimed_at ?? planner?.finished_at),
		steps: rows.steps.map((step) => {
			const start = ms(step.claimed_at);
			const end = ms(step.finished_at);
			return {
				step: step.step_key,
				status: step.status,
				failureCode: step.failure_code ?? null,
				attempts: step.attempts_used,
				startMs: start,
				durationMs: start !== null && end !== null ? end - start : null
			};
		}),
		calls: calls.map((call) => {
			const at = unmatched.findIndex(
				(row) => row.serialized_request_bytes === call.requestBytes
			);
			const dispatch = at >= 0 ? unmatched.splice(at, 1)[0] : null;
			return {
				step: dispatch?.step_key ?? null,
				role: call.request.role,
				kind: dispatch?.dispatch_kind ?? null,
				physicalAttempt: dispatch?.physical_attempt ?? null,
				requestModel: call.request.model,
				startMs: call.startedAtMs - startedAtMs,
				provider: call.provider,
				model: call.modelUsed,
				maxTokens: call.request.maxTokens,
				promptTokens: call.usage.promptTokens,
				finishReason: call.finishReason,
				error: call.error,
				textChars: call.text.length,
				timing: providerCallTiming(call)
			};
		})
	};
}

function seconds(value: number | null | undefined): string {
	return value === null || value === undefined ? '-' : (value / 1000).toFixed(1);
}

function report(results: Result[]): string {
	const lines = [
		'# Context finder pilot',
		'',
		'| Scenario | Arm | Rep | Routing | Handoff | Facts | Must in full | Docs read | Model $ | Jev $ | Account $ | Time | Prep | Steps |',
		'| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'
	];
	for (const r of results)
		lines.push(
			`| ${r.scenario} | ${r.arm} | ${r.rep} | ${r.routing} | ${r.handoff} | ${r.factsHit}/${r.facts.length || '?'} | ${r.evidence ? r.mustLoadedInFull : '-'} | ${r.documentReads.length} | ${r.modelUsd.toFixed(4)} | ${r.jevUsd.toFixed(4)} | ${r.creditsUsd?.toFixed(4) ?? '?'} | ${Math.round(r.durationMs / 1000)}s | ${seconds(r.timeline.preparationMs)}s | ${r.timeline.steps.map((s) => `${s.step} ${s.status}${s.failureCode ? ` (${s.failureCode})` : ''}`).join('; ')} |`
		);
	lines.push(
		'',
		'## Provider calls',
		'',
		'Times in seconds from the run start. First output = first visible token (hidden reasoning precedes it).',
		'',
		'Led = the model the request led with; ⚠ marks a request that led with the V4 Flash fallback.',
		'',
		'| Scenario | Arm | Rep | Step | Kind | Led | Served | Provider | Start | Headers | First output | Total | Prompt tok | Completion | Reasoning | Visible | tok/s | Max | Finish | Error |',
		'| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'
	);
	for (const r of results)
		for (const c of r.timeline.calls)
			lines.push(
				`| ${r.scenario} | ${r.arm} | ${r.rep} | ${c.step ?? c.role ?? '?'} | ${c.kind ?? '-'} | ${String(c.requestModel ?? '-')}${c.requestModel === 'deepseek/deepseek-v4-flash' ? ' ⚠' : ''} | ${c.model ?? '-'} | ${c.provider ?? '-'} | ${seconds(c.startMs)} | ${seconds(c.timing.headersMs)} | ${seconds(c.timing.firstOutputMs)} | ${seconds(c.timing.totalMs)} | ${c.promptTokens ?? '-'} | ${c.timing.completionTokens ?? '-'} | ${c.timing.reasoningTokens ?? '-'} | ${c.timing.visibleTokens ?? '-'} | ${c.timing.tokensPerSecond ?? '-'} | ${c.maxTokens} | ${c.finishReason ?? '-'} | ${c.error ? c.error.slice(0, 80) : ''} |`
			);
	lines.push('');
	for (const r of results) {
		lines.push(`## ${r.scenario} · ${r.arm} · r${r.rep}`, '');
		if (r.edit) lines.push(`Edit: ${r.edit}`, '');
		if (r.evidence)
			lines.push(
				`Evidence: ${r.evidence.status} (${r.evidence.source}); full: ${r.evidence.full.map((f) => `${f.title}${f.pinned ? ' [pinned]' : ''} (${f.p?.toFixed(2) ?? 'added'})`).join('; ') || 'none'}; ${r.evidence.summaries} summaries`,
				''
			);
		lines.push(`Facts: ${r.facts.map((p) => p.toFixed(2)).join(', ')}`, '', r.answer, '');
	}
	return lines.join('\n');
}
