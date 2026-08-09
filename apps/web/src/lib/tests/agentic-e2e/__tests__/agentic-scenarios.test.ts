// apps/web/src/lib/tests/agentic-e2e/__tests__/agentic-scenarios.test.ts
//
// ⚠️ End-to-end agentic-chat stress harness. Every scenario drives the REAL
// selected production transport against a running dev server, runs the production
// (cheap) model + tools, writes to the hosted DB, and calls a strong LLM judge on
// fuzzy scenarios. It COSTS MONEY and requires a running dev server
// (`pnpm dev --filter=@buildos/web`). Excluded from `pnpm test`; run with
// `pnpm --filter @buildos/web test:agentic`.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadHarnessEnv } from '../harness/env';
import { loginAndGetCookie } from '../harness/auth';
import { ensureTestAuthUser, provisionTestUser } from '../harness/test-user';
import { runTurn, warmupPing } from '../harness/sse-client';
import {
	createAgenticE2EWorkerClient,
	resolveAgenticE2EExecutionMode,
	type AgenticE2EWorkerClient
} from '../harness/worker-client';
import {
	HARNESS_RUN_ID,
	sweepOrphanProjects,
	sweepStaleOrphanProjects,
	teardownProject
} from '../harness/seed';
import { releaseTurnForFollowup, teardownChatSession, waitForTurnRun } from '../harness/telemetry';
import { judgeQuality } from '../harness/judge';
import { checkTurnBeforeFollowupRelease } from '../harness/turn-sequencing';
import { readTurnAttribution, readWorkerTurnAttribution } from '../harness/attribution';
import { scenarioCatalog } from '../scenarios/catalog';
import {
	evaluateTurnCheckpoints,
	formatCheckpointFailures,
	type CheckpointFailure
} from '../harness/checkpoints';
import type { ScenarioContext, SeedResult } from '../harness/types';
import type { LastTurnContext } from '@buildos/shared-types';
import {
	buildPhase0EvidenceReport,
	collectPhase0TurnEvidence,
	readPhase0RepositoryState,
	writePhase0EvidenceReport,
	type Phase0RepositoryState,
	type Phase0TurnEvidence
} from '../phase0/evidence-report';

let ctx: ScenarioContext | null = null;
let phase0Repository: Phase0RepositoryState | null = null;
let phase0BaseUrl = '';
let workerClient: AgenticE2EWorkerClient | null = null;
const phase0Turns: Phase0TurnEvidence[] = [];
const phase0FatalCaptureErrors: string[] = [];
const PHASE0_CAPTURE = process.env.AGENTIC_PHASE0_CAPTURE === 'true';
const EXECUTION_MODE = resolveAgenticE2EExecutionMode();
const WORKER_PREFLIGHT_ONLY = process.env.AGENTIC_E2E_WORKER_PREFLIGHT_ONLY === 'true';
const PHASE0_OUTPUT_PATH =
	process.env.AGENTIC_PHASE0_OUTPUT_PATH?.trim() ||
	`/tmp/buildos-agentic-phase0-${HARNESS_RUN_ID}.json`;

function positiveIntegerEnv(name: string, fallback: number): number {
	const raw = process.env[name]?.trim();
	if (!raw) return fallback;
	const parsed = Number(raw);
	if (!Number.isSafeInteger(parsed) || parsed < 1) {
		throw new Error(`[agentic-e2e] ${name} must be a positive integer; received ${raw}`);
	}
	return parsed;
}

const PHASE0_REPETITIONS = positiveIntegerEnv('AGENTIC_PHASE0_REPETITIONS', 1);

function requireCtx(): ScenarioContext {
	if (!ctx) throw new Error('[agentic-e2e] harness context not initialized (beforeAll failed)');
	return ctx;
}

beforeAll(async () => {
	const env = loadHarnessEnv();
	phase0BaseUrl = env.baseUrl;
	if (PHASE0_CAPTURE) {
		phase0Repository = readPhase0RepositoryState();
		if (phase0Repository.dirty) {
			throw new Error(
				'[agentic-e2e] Phase 0 evidence requires a clean exact tree. ' +
					`Dirty paths: ${phase0Repository.status.slice(0, 20).join(', ')}`
			);
		}
	}

	// 1. Ensure the dedicated test user exists (auth + public.users + actor).
	await ensureTestAuthUser({ email: env.testUserEmail, password: env.testUserPassword });
	const { cookie, userId } = await loginAndGetCookie({
		baseUrl: env.baseUrl,
		email: env.testUserEmail,
		password: env.testUserPassword
	});
	const db = await provisionTestUser({ userId, email: env.testUserEmail });

	// 2. Confirm the selected transport is reachable + authorized. Worker mode
	// requires both the private Realtime subscription and an exact worker lease;
	// it never silently falls back to legacy SSE.
	await warmupPing({ baseUrl: env.baseUrl, cookie });
	if (EXECUTION_MODE === 'worker_realtime') {
		workerClient = await createAgenticE2EWorkerClient({
			baseUrl: env.baseUrl,
			cookie,
			email: env.testUserEmail,
			password: env.testUserPassword,
			userId,
			admin: db.admin
		});
		await workerClient.requireWorkerLease();
	}

	// 3. Clear only old crashed-run fixtures. Live concurrent runs remain isolated.
	await sweepStaleOrphanProjects(db);

	ctx = { baseUrl: env.baseUrl, cookie, db };
}, 60000);

afterAll(async () => {
	if (workerClient) {
		try {
			await workerClient.close();
		} catch (error) {
			phase0FatalCaptureErrors.push(
				`could not close worker Realtime client: ${
					error instanceof Error ? error.message : String(error)
				}`
			);
		} finally {
			workerClient = null;
		}
	}
	if (PHASE0_CAPTURE && phase0Repository) {
		try {
			const report = buildPhase0EvidenceReport({
				runId: HARNESS_RUN_ID,
				repository: phase0Repository,
				baseUrl: phase0BaseUrl,
				executionMode: EXECUTION_MODE,
				scenarioIds: selectedScenarios().map((scenario) => scenario.id),
				repetitions: PHASE0_REPETITIONS,
				retryCount: 0,
				turns: phase0Turns
			});
			writePhase0EvidenceReport(PHASE0_OUTPUT_PATH, report);
			console.info(
				'[agentic-e2e] Phase 0 evidence summary',
				JSON.stringify({ output: PHASE0_OUTPUT_PATH, ...report.summary }, null, 2)
			);
			if (report.summary.captureErrorTurnCount > 0) {
				phase0FatalCaptureErrors.push(
					`${report.summary.captureErrorTurnCount} turn(s) have incomplete retained evidence; inspect ${PHASE0_OUTPUT_PATH}`
				);
			}
		} catch (error) {
			phase0FatalCaptureErrors.push(
				`could not build or write ${PHASE0_OUTPUT_PATH}: ${
					error instanceof Error ? error.message : String(error)
				}`
			);
		}
	}
	if (ctx) {
		const swept = await sweepOrphanProjects(ctx.db);
		if (swept > 0) console.warn(`[agentic-e2e] afterAll swept ${swept} leftover project(s)`);
	}
	if (PHASE0_CAPTURE && phase0FatalCaptureErrors.length > 0) {
		throw new Error(
			`[agentic-e2e] Phase 0 evidence capture failed: ${phase0FatalCaptureErrors.join(' | ')}`
		);
	}
});

// Every scenario costs real model spend, so allow running a subset:
//   AGENTIC_SCENARIOS=task-multi-update,restraint-noop-and-ambiguity
// Unset runs the whole catalog. Unknown ids fail loudly rather than silently
// running nothing — a typo that quietly passes zero scenarios reads as success.
function selectedScenarios() {
	const raw = process.env.AGENTIC_SCENARIOS?.trim();
	if (!raw) return scenarioCatalog;
	const wanted = raw
		.split(',')
		.map((id) => id.trim())
		.filter(Boolean);
	const known = new Set(scenarioCatalog.map((s) => s.id));
	const unknown = wanted.filter((id) => !known.has(id));
	if (unknown.length > 0) {
		throw new Error(
			`[agentic-e2e] AGENTIC_SCENARIOS names unknown scenario(s): [${unknown.join(', ')}]. ` +
				`Known ids: [${[...known].join(', ')}]`
		);
	}
	return scenarioCatalog.filter((s) => wanted.includes(s.id));
}

describe('agentic chat e2e scenarios (real model + tools + DB)', () => {
	if (WORKER_PREFLIGHT_ONLY) {
		it('authenticates, subscribes, and obtains an exact worker transport lease without a model turn', () => {
			expect(EXECUTION_MODE).toBe('worker_realtime');
			expect(workerClient).not.toBeNull();
		});
		return;
	}

	for (const scenario of selectedScenarios()) {
		const skipped = scenario.skip?.() ?? false;
		const runner = skipped ? it.skip : it;
		for (let repetition = 1; repetition <= PHASE0_REPETITIONS; repetition += 1) {
			runner(
				`[${scenario.category}] ${scenario.title}${PHASE0_REPETITIONS > 1 ? ` [run ${repetition}/${PHASE0_REPETITIONS}]` : ''}`,
				{
					timeout: scenario.timeoutMs ?? 300000,
					retry: PHASE0_CAPTURE ? 0 : 1
				},
				async () => {
					const c = requireCtx();
					const evidenceStartIndex = phase0Turns.length;
					let seed: SeedResult = { entityIds: {}, notes: {} };
					let sessionId: string | undefined;
					const checkpointFailures: CheckpointFailure[] = [];

					try {
						if (scenario.seed) {
							seed = await scenario.seed(c);
						}

						let lastTurnContext: LastTurnContext | null = null;
						for (const [turnIndex, turn] of scenario.turns.entries()) {
							const entityId = turn.entityIdFromSeed?.(seed);
							// A cold turn deliberately forgets the conversation so the assertion can
							// only pass on durable project state, not on recall from history.
							if (turn.coldSession) {
								if (sessionId) {
									await teardownChatSession(c.db.admin, c.db.userId, sessionId, {
										retainForWorkerControlRowRetention:
											EXECUTION_MODE === 'worker_realtime'
									});
								}
								sessionId = undefined;
								lastTurnContext = null;
							}
							const turnRunner = workerClient
								? workerClient.runTurn.bind(workerClient)
								: runTurn;
							const result = await turnRunner({
								baseUrl: c.baseUrl,
								cookie: c.cookie,
								message: turn.message,
								contextType: turn.contextType,
								entityId,
								sessionId,
								lastTurnContext
							});
							// Thread the session forward so later turns keep context.
							sessionId = result.sessionId ?? sessionId;
							lastTurnContext = result.lastTurnContext;

							await checkTurnBeforeFollowupRelease({
								hasFollowup: turnIndex < scenario.turns.length - 1,
								assertTurn: async () => {
									await turn.assert(result, c, seed);
									if (!result.streamRunId) {
										throw new Error(
											'[agentic-e2e] selected transport did not expose a stream_run_id'
										);
									}
									const selectedTurnRun = await waitForTurnRun(
										c.db.admin,
										result.streamRunId
									);
									const expectedContract = 'agentic_chat_worker_v1';
									if (
										selectedTurnRun?.execution_mode !== EXECUTION_MODE ||
										(EXECUTION_MODE === 'worker_realtime' &&
											selectedTurnRun.transport_contract_version !==
												expectedContract)
									) {
										throw new Error(
											`[agentic-e2e] expected ${EXECUTION_MODE}${EXECUTION_MODE === 'worker_realtime' ? `/${expectedContract}` : ''}, received ` +
												`${selectedTurnRun?.execution_mode ?? 'missing'}/${selectedTurnRun?.transport_contract_version ?? 'missing'}`
										);
									}
									const failures = await evaluateTurnCheckpoints({
										checkpoints: turn.checkpoints ?? [],
										turn: result,
										ctx: c,
										seed,
										turnNumber: turnIndex + 1,
										turnLabel: turn.label
									});
									checkpointFailures.push(...failures);
									for (const failure of failures) {
										console.warn(
											`[agentic-e2e] checkpoint miss: ${scenario.id} / ${failure.turnLabel} / ` +
												`${failure.checkpoint}: ${failure.message}`
										);
									}
									if (!result.streamRunId) {
										if (process.env.AGENTIC_ASSERT_TELEMETRY === 'true') {
											throw new Error(
												'[agentic-e2e] turn did not expose a stream_run_id'
											);
										}
										return;
									}
									const attribution =
										EXECUTION_MODE === 'worker_realtime'
											? await readWorkerTurnAttribution(
													c.db.admin,
													result.streamRunId
												)
											: await readTurnAttribution(
													c.db.admin,
													result.streamRunId
												);
									console.info(
										'[agentic-e2e] turn attribution',
										JSON.stringify({
											scenario: scenario.id,
											turn: turnIndex + 1,
											streamRunId: result.streamRunId,
											...attribution
										})
									);
									if (
										process.env.AGENTIC_ASSERT_TELEMETRY === 'true' &&
										attribution.outcomeClass === 'unattributed'
									) {
										throw new Error(
											`[agentic-e2e] missing model/provider/intervention attribution for ${result.streamRunId}`
										);
									}
									if (
										process.env.AGENTIC_ASSERT_TELEMETRY === 'true' &&
										EXECUTION_MODE !== 'worker_realtime'
									) {
										const interventions = attribution.interventions;
										const expectedVariant =
											process.env.AGENTIC_EXPECT_SCAFFOLD_VARIANT?.trim();
										const expectedFingerprint =
											process.env.AGENTIC_EXPECT_SCAFFOLD_FINGERPRINT?.trim();
										if (
											!interventions?.evalScaffoldVariant ||
											!interventions.evalScaffoldFingerprint ||
											!interventions.evalScaffoldConfig
										) {
											throw new Error(
												`[agentic-e2e] missing computed scaffold attribution for ${result.streamRunId}`
											);
										}
										if (
											interventions.evalScaffoldConfig.variant !==
											interventions.evalScaffoldVariant
										) {
											throw new Error(
												`[agentic-e2e] scaffold label/config mismatch for ${result.streamRunId}`
											);
										}
										if (
											expectedVariant &&
											interventions.evalScaffoldVariant !== expectedVariant
										) {
											throw new Error(
												`[agentic-e2e] expected scaffold ${expectedVariant}, received ${interventions.evalScaffoldVariant}`
											);
										}
										if (
											expectedFingerprint &&
											interventions.evalScaffoldFingerprint !==
												expectedFingerprint
										) {
											throw new Error(
												`[agentic-e2e] expected scaffold fingerprint ${expectedFingerprint}, received ${interventions.evalScaffoldFingerprint}`
											);
										}
									}
								},
								judgeTurn: turn.judge
									? async () => {
											const j = await turn.judge!(result, c, seed);
											const verdict = await judgeQuality({
												rubric: j.rubric,
												transcript: j.transcript,
												threshold: j.threshold
											});
											expect(
												verdict.passed,
												`LLM judge scored ${verdict.score}/5 (needed ${j.threshold ?? 3}): ${verdict.reasoning}`
											).toBe(true);
										}
									: undefined,
								captureTurn: PHASE0_CAPTURE
									? async (checkError) => {
											try {
												phase0Turns.push(
													await collectPhase0TurnEvidence({
														admin: c.db.admin,
														scenario,
														repetition,
														turnIndex: turnIndex + 1,
														turnLabel: turn.label ?? null,
														result,
														assertionError: checkError
													})
												);
											} catch (error) {
												phase0FatalCaptureErrors.push(
													`${scenario.id} run ${repetition} turn ${turnIndex + 1}: ${
														error instanceof Error
															? error.message
															: String(error)
													}`
												);
											}
										}
									: undefined,
								releaseForFollowup: () =>
									releaseTurnForFollowup(c.db.admin, result.streamRunId)
							});
						}

						if (checkpointFailures.length > 0) {
							const checkpointError = formatCheckpointFailures(
								scenario.id,
								checkpointFailures
							);
							for (const evidence of phase0Turns.slice(evidenceStartIndex)) {
								evidence.assertionPassed = false;
								evidence.assertionError = checkpointError.slice(0, 1_000);
							}
							throw new Error(checkpointError);
						}
					} finally {
						try {
							await teardownChatSession(c.db.admin, c.db.userId, sessionId, {
								retainForWorkerControlRowRetention:
									EXECUTION_MODE === 'worker_realtime'
							});
						} finally {
							// Extra cleanup first (multi-project fixtures, agent-created
							// projects the AE2E-prefix sweep cannot see), then the primary.
							if (scenario.teardown) {
								try {
									await scenario.teardown(c, seed);
								} catch (error) {
									console.warn(
										`[agentic-e2e] scenario teardown failed for ${scenario.id}: ${
											error instanceof Error ? error.message : String(error)
										}`
									);
								}
							}
							if (scenario.seed) {
								await teardownProject(c.db, seed.projectId);
							}
						}
					}
				}
			);
		}
	}
});
