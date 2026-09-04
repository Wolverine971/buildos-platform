// apps/web/src/lib/tests/agentic-e2e/__tests__/agentic-scenarios.test.ts
//
// ⚠️ End-to-end agentic-chat stress harness. Every scenario drives the REAL
// production worker transport against a running dev server, runs the production
// (cheap) model + tools, writes to the hosted DB, and calls a strong LLM judge on
// fuzzy scenarios. It COSTS MONEY and requires a running dev server
// (`pnpm dev --filter=@buildos/web`). Excluded from `pnpm test`; run with
// `pnpm --filter @buildos/web test:agentic`.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadHarnessEnv } from '../harness/env';
import { loginAndGetCookie } from '../harness/auth';
import { ensureTestAuthUser, provisionTestUser } from '../harness/test-user';
import {
	createAgenticE2EWorkerClient,
	HARNESS_EXECUTION_MODE,
	requireAdvertisedMutationTools,
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
import { evaluateTurnEvidenceChecks } from '../harness/evidence-checks';
import { readWorkerTurnAttribution } from '../harness/attribution';
import { scenarioCatalog } from '../scenarios/catalog';
import { BatteryRecorder, selectBattery, writeBatteryScorecard } from '../harness/battery';
import {
	evaluateTurnCheckpoints,
	formatCheckpointFailures,
	type CheckpointFailure
} from '../harness/checkpoints';
import type { ScenarioContext, SeedResult } from '../harness/types';
import type { LastTurnContext } from '@buildos/shared-types';
import {
	buildPhase0EvidenceReport,
	classifyPhase0TurnResult,
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
// Includes a worker turn (315s reconciliation bound), deterministic checks,
// retained evidence, and the judge's 90s hard wall. A 300s whole-test default
// incorrectly classified completed worker turns as scenario timeouts.
const DEFAULT_SCENARIO_TIMEOUT_MS = 450_000;
const EXECUTION_MODE = HARNESS_EXECUTION_MODE;
const WORKER_PREFLIGHT_ONLY = process.env.AGENTIC_E2E_WORKER_PREFLIGHT_ONLY === 'true';
const PHASE0_OUTPUT_PATH =
	process.env.AGENTIC_PHASE0_OUTPUT_PATH?.trim() ||
	`/tmp/buildos-agentic-phase0-${HARNESS_RUN_ID}.json`;
// A graded battery run (AGENTIC_BATTERY=cedar-house) always emits a scorecard,
// independently of Phase 0 evidence capture — which refuses a dirty tree and so
// cannot be the only way to score a run during ordinary development.
const BATTERY = process.env.AGENTIC_BATTERY?.trim() || null;
const BATTERY_OUTPUT_PATH =
	process.env.AGENTIC_BATTERY_OUTPUT_PATH?.trim() ||
	`/tmp/buildos-agentic-battery-${HARNESS_RUN_ID}.json`;

function positiveIntegerEnv(name: string, fallback: number): number {
	const raw = process.env[name]?.trim();
	if (!raw) return fallback;
	const parsed = Number(raw);
	if (!Number.isSafeInteger(parsed) || parsed < 1) {
		throw new Error(`[agentic-e2e] ${name} must be a positive integer; received ${raw}`);
	}
	return parsed;
}

function nonNegativeIntegerEnv(name: string, fallback: number): number {
	const raw = process.env[name]?.trim();
	if (!raw) return fallback;
	const parsed = Number(raw);
	if (!Number.isSafeInteger(parsed) || parsed < 0) {
		throw new Error(`[agentic-e2e] ${name} must be a non-negative integer; received ${raw}`);
	}
	return parsed;
}

const PHASE0_REPETITIONS = positiveIntegerEnv('AGENTIC_PHASE0_REPETITIONS', 1);
const E2E_RETRY_COUNT = nonNegativeIntegerEnv('AGENTIC_E2E_RETRY_COUNT', 1);

function requireCtx(): ScenarioContext {
	if (!ctx) throw new Error('[agentic-e2e] harness context not initialized (beforeAll failed)');
	return ctx;
}

function requireWorkerClient(): AgenticE2EWorkerClient {
	if (!workerClient) {
		throw new Error('[agentic-e2e] worker client not initialized (beforeAll failed)');
	}
	return workerClient;
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

	// 2. Confirm the worker transport is reachable + authorized. This requires
	// both the private Realtime subscription and an exact worker lease; the
	// client never silently falls back.
	workerClient = await createAgenticE2EWorkerClient({
		baseUrl: env.baseUrl,
		cookie,
		email: env.testUserEmail,
		password: env.testUserPassword,
		userId,
		admin: db.admin
	});
	await workerClient.requireWorkerLease();

	// Fail-closed write-surface preflight: a valid transport lease only proves
	// the worker is reachable, not that it advertises the write tools the
	// selected scenarios need. Runs unconditionally (including
	// AGENTIC_E2E_WORKER_PREFLIGHT_ONLY) so a preflight-only run proves both.
	const requiredMutationTools = [
		...new Set(selectedScenarios().flatMap((scenario) => scenario.requiredMutationTools ?? []))
	];
	if (requiredMutationTools.length > 0) {
		if (!env.workerHealthUrl) {
			throw new Error(
				'[agentic-e2e] selected scenarios require write tools; set PRIVATE_AGENTIC_CHAT_WORKER_URL to run the write-surface preflight'
			);
		}
		const { advertised } = await requireAdvertisedMutationTools({
			healthUrl: env.workerHealthUrl,
			required: requiredMutationTools
		});
		console.info('[agentic-e2e] worker advertises mutation tools', JSON.stringify(advertised));
	}

	// 3. Clear only old crashed-run fixtures. Live concurrent runs remain isolated.
	await sweepStaleOrphanProjects(db);

	ctx = { baseUrl: env.baseUrl, cookie, db, executionMode: EXECUTION_MODE };
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
	if (batteryRecorder && BATTERY) {
		try {
			let head: string | null = null;
			try {
				head = readPhase0RepositoryState().head;
			} catch {
				head = null;
			}
			const scorecard = batteryRecorder.build({
				runId: HARNESS_RUN_ID,
				baseUrl: phase0BaseUrl,
				executionMode: EXECUTION_MODE,
				head
			});
			writeBatteryScorecard(BATTERY_OUTPUT_PATH, scorecard);
			console.info(
				`[agentic-e2e] battery "${BATTERY}" scored ` +
					`${scorecard.summary.totalScore}/${scorecard.summary.maxScore} ` +
					`(${scorecard.summary.percent}%, ${scorecard.summary.grade}) -> ${BATTERY_OUTPUT_PATH}\n` +
					'Render it with: node scripts/agentic-e2e/render-scorecard.mjs ' +
					`${BATTERY_OUTPUT_PATH}`
			);
		} catch (error) {
			console.error(
				`[agentic-e2e] could not write the battery scorecard: ${
					error instanceof Error ? error.message : String(error)
				}`
			);
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
	// AGENTIC_BATTERY narrows to one graded battery; AGENTIC_SCENARIOS can then
	// narrow further to a single case while iterating on it.
	const battery = selectBattery(scenarioCatalog, BATTERY ?? undefined);
	const raw = process.env.AGENTIC_SCENARIOS?.trim();
	if (!raw) return battery;
	const wanted = raw
		.split(',')
		.map((id) => id.trim())
		.filter(Boolean);
	const known = new Set(battery.map((s) => s.id));
	const unknown = wanted.filter((id) => !known.has(id));
	if (unknown.length > 0) {
		throw new Error(
			`[agentic-e2e] AGENTIC_SCENARIOS names unknown scenario(s): [${unknown.join(', ')}]. ` +
				`Known ids: [${[...known].join(', ')}]`
		);
	}
	return battery.filter((s) => wanted.includes(s.id));
}

const batteryRecorder = BATTERY ? new BatteryRecorder(BATTERY, selectedScenarios()) : null;

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
					timeout: scenario.timeoutMs ?? DEFAULT_SCENARIO_TIMEOUT_MS,
					retry: PHASE0_CAPTURE ? 0 : E2E_RETRY_COUNT
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
										retainForWorkerControlRowRetention: true
									});
								}
								sessionId = undefined;
								lastTurnContext = null;
							}
							const result = await requireWorkerClient().runTurn({
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
											'[agentic-e2e] worker transport did not expose a stream_run_id'
										);
									}
									const selectedTurnRun = await waitForTurnRun(
										c.db.admin,
										result.streamRunId
									);
									const expectedContract = 'agentic_chat_worker_v1';
									if (
										selectedTurnRun?.execution_mode !== EXECUTION_MODE ||
										selectedTurnRun.transport_contract_version !==
											expectedContract
									) {
										throw new Error(
											`[agentic-e2e] expected ${EXECUTION_MODE}/${expectedContract}, received ` +
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
									const attribution = await readWorkerTurnAttribution(
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
								},
								judgeTurn: turn.judge
									? async () => {
											const j = await turn.judge!(result, c, seed);
											const threshold = j.threshold ?? 3;
											const verdict = await judgeQuality({
												rubric: j.rubric,
												transcript: j.transcript,
												threshold
											});
											return { ...verdict, threshold };
										}
									: undefined,
								captureTurn:
									PHASE0_CAPTURE || batteryRecorder
										? async (checkOutcome) => {
												if (batteryRecorder) {
													// Scored from the SAME taxonomy the evidence
													// report uses, so a scorecard and a Phase 0
													// artifact from one run never disagree.
													batteryRecorder.recordTurn({
														scenario,
														repetition,
														turnIndex: turnIndex + 1,
														turnLabel: turn.label ?? null,
														streamRunId: result.streamRunId,
														resultClass: classifyPhase0TurnResult({
															result,
															// Wait for a terminal row: a still-
															// flushing run would otherwise be
															// scored a transport failure (0) when
															// it is really a behavior failure (1).
															turnRun: result.streamRunId
																? await waitForTurnRun(
																		c.db.admin,
																		result.streamRunId,
																		{ timeoutMs: 15_000 }
																	)
																: null,
															checkOutcome,
															captureErrors: []
														}),
														error: checkOutcome.overallError
													});
												}
												if (!PHASE0_CAPTURE) return;
												try {
													const subchecks =
														await evaluateTurnEvidenceChecks({
															checks: turn.evidenceChecks ?? [],
															turn: result,
															ctx: c,
															seed
														});
													phase0Turns.push(
														await collectPhase0TurnEvidence({
															admin: c.db.admin,
															scenario,
															repetition,
															turnIndex: turnIndex + 1,
															turnLabel: turn.label ?? null,
															result,
															checkOutcome,
															subchecks
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
								evidence.deterministicAssertionPassed = false;
								evidence.deterministicAssertionError = checkpointError.slice(
									0,
									1_000
								);
								evidence.resultClass = 'behavior_failure';
							}
							throw new Error(checkpointError);
						}
					} finally {
						try {
							await teardownChatSession(c.db.admin, c.db.userId, sessionId, {
								retainForWorkerControlRowRetention: true
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
