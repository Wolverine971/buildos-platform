// apps/web/src/lib/tests/agentic-e2e/phase-a/route-mode-eval.test.ts
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

import { env as privateEnv } from '$env/dynamic/private';
import {
	GLM_52_MODEL,
	SmartLLMService,
	type JSONUsageEvent,
	type UsageLogParams
} from '@buildos/smart-llm';
import { describe, expect, it } from 'vitest';

import {
	buildPhaseAWorldCard,
	routeRequest,
	routeRequestWithReview,
	ROUTE_PROMPT_VERSION,
	ROUTE_REVIEW_POLICY_VERSION,
	ROUTE_SYSTEM_PROMPT,
	serializeWorldCard,
	type RouteModelCall,
	type RouteModelPort
} from '../../../../../../../packages/agent-orchestrator/src';
import {
	buildRouteEvalReport,
	type RouteEvalRun,
	type RouteEvalUsageEvent
} from '../../../../../../../packages/agent-orchestrator/src/testing/harness/route-eval-report';
import { frozenPhaseACorpus, phaseAProjectSnapshot } from './fixtures';

const ROUTE_EVAL_OUTPUT_PATH =
	process.env.PHASE_A_ROUTE_OUTPUT_PATH?.trim() || '/tmp/buildos-phase-a-route-eval.json';
const ROUTE_EVAL_MODEL = process.env.PHASE_A_ROUTE_MODEL?.trim() || GLM_52_MODEL;
const ROUTE_EVAL_PROFILE = parseRouteEvalProfile(process.env.PHASE_A_ROUTE_PROFILE);
const ROUTE_EVAL_STRATEGY = parseRouteEvalStrategy(process.env.PHASE_A_ROUTE_STRATEGY);
const ROUTE_REVIEW_MODEL = process.env.PHASE_A_ROUTE_REVIEW_MODEL?.trim() || GLM_52_MODEL;
const ROUTE_REVIEW_PROFILE = parseRouteEvalProfile(process.env.PHASE_A_ROUTE_REVIEW_PROFILE);
const ROUTES_PER_SCENARIO = parseRoutesPerScenario(process.env.PHASE_A_ROUTE_RUNS_PER_SCENARIO);
const EXPECTED_LOGICAL_RUNS = frozenPhaseACorpus.scenarios.length * ROUTES_PER_SCENARIO;
const ROUTE_EVAL_CONCURRENCY = 3;
const routeDescribe = process.env.AGENTIC_PHASE_A_ROUTE_EVAL === 'true' ? describe : describe.skip;

function parseRouteEvalProfile(value: string | undefined): 'fast' | 'powerful' {
	if (!value?.trim() || value === 'powerful') return 'powerful';
	if (value === 'fast') return 'fast';
	throw new Error(`[phase-a-route] Unsupported evaluation profile: ${value}`);
}

function parseRouteEvalStrategy(value: string | undefined): 'single_model' | 'fast_then_review' {
	if (!value?.trim() || value === 'single_model') return 'single_model';
	if (value === 'fast_then_review') return 'fast_then_review';
	throw new Error(`[phase-a-route] Unsupported evaluation strategy: ${value}`);
}

function parseRoutesPerScenario(value: string | undefined): number {
	if (!value?.trim()) return 9;
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < 1 || parsed > 9) {
		throw new Error(
			`[phase-a-route] Runs per scenario must be an integer from 1 to 9: ${value}`
		);
	}
	return parsed;
}

function requiredApiKey(): string {
	const key = privateEnv.PRIVATE_OPENROUTER_API_KEY?.trim();
	if (!key) {
		throw new Error('[phase-a-route] Missing PRIVATE_OPENROUTER_API_KEY in apps/web/.env.');
	}
	return key;
}

function sha256(value: string): string {
	return createHash('sha256').update(value).digest('hex');
}

function isPinnedModel(actual: string): boolean {
	const allowed =
		ROUTE_EVAL_STRATEGY === 'fast_then_review'
			? [ROUTE_EVAL_MODEL, ROUTE_REVIEW_MODEL]
			: [ROUTE_EVAL_MODEL];
	return allowed.some((model) => actual === model || actual.startsWith(`${model}-`));
}

function toUsageEvent(event: JSONUsageEvent): RouteEvalUsageEvent {
	return {
		model: event.model,
		provider: event.provider ?? event.billingProvider ?? null,
		promptTokens: event.promptTokens,
		completionTokens: event.completionTokens,
		totalTokens: event.totalTokens,
		totalCostUsd: event.totalCost,
		billingDisposition: event.billingDisposition ?? null
	};
}

function infrastructureInvalidReason(usage: RouteEvalUsageEvent[]): string | null {
	if (usage.length === 0) return 'No model usage event was observed.';
	const mismatched = usage.find((event) => !isPinnedModel(event.model));
	if (mismatched) {
		return `Actual model ${mismatched.model} is outside the pinned route strategy.`;
	}
	if (
		usage.some(
			(event) =>
				event.billingDisposition === 'released' &&
				event.promptTokens === 0 &&
				event.completionTokens === 0
		)
	) {
		return 'Provider rejected the request before inference.';
	}
	return null;
}

function createPinnedModelPort(params: {
	apiKey: string;
	scenarioId: string;
	runIndex: number;
	replacementIndex: number;
	usage: RouteEvalUsageEvent[];
	model: string;
	profile: 'fast' | 'powerful';
	modelRole: 'primary' | 'review';
}): RouteModelPort {
	const llm = new SmartLLMService({
		apiKey: params.apiKey,
		enforceUserId: true,
		usageLogger: {
			logUsageToDatabase: async (_event: UsageLogParams) => undefined
		},
		openrouter: { timeoutMs: 60_000 }
	});

	return {
		async generateJson(call: RouteModelCall): Promise<unknown> {
			return llm.getJSONResponse<unknown>({
				systemPrompt: call.systemPrompt,
				userPrompt: call.userPrompt,
				profile: params.profile,
				model: params.model,
				models: [],
				temperature: call.temperature,
				maxTokens: call.maxTokens,
				timeoutMs: 60_000,
				spendLimit: {
					maxCostUsd: 0.02,
					minOutputTokens: 256,
					safetyMultiplier: 2
				},
				validation: {
					retryOnParseError: false,
					validateSchema: false,
					maxRetries: 0,
					allowTruncatedJsonRecovery: false
				},
				userId: 'phase-a-route-eval',
				operationType: 'agent_orchestrator_phase_a_route',
				metadata: {
					promptVersion: call.promptVersion,
					attempt: call.attempt,
					modelRole: params.modelRole,
					scenarioId: params.scenarioId,
					runIndex: params.runIndex,
					replacementIndex: params.replacementIndex
				},
				onUsage: async (event) => {
					params.usage.push(toUsageEvent(event));
				}
			});
		}
	};
}

async function executeRun(params: {
	apiKey: string;
	scenario: (typeof frozenPhaseACorpus.scenarios)[number];
	runIndex: number;
	replacementIndex: number;
	worldCard: ReturnType<typeof buildPhaseAWorldCard>;
}): Promise<RouteEvalRun> {
	const usage: RouteEvalUsageEvent[] = [];
	const startedAt = Date.now();
	let actualRoute: string | null = null;
	let actualReasonCode: string | null = null;
	let repaired = false;
	let error: string | null = null;

	try {
		const primaryModel = createPinnedModelPort({
			apiKey: params.apiKey,
			scenarioId: params.scenario.scenario_id,
			runIndex: params.runIndex,
			replacementIndex: params.replacementIndex,
			usage,
			model: ROUTE_EVAL_MODEL,
			profile: ROUTE_EVAL_PROFILE,
			modelRole: 'primary'
		});
		const result =
			ROUTE_EVAL_STRATEGY === 'fast_then_review'
				? await routeRequestWithReview({
						worldCard: params.worldCard,
						request: params.scenario.request_text,
						primaryModel,
						reviewModel: createPinnedModelPort({
							apiKey: params.apiKey,
							scenarioId: params.scenario.scenario_id,
							runIndex: params.runIndex,
							replacementIndex: params.replacementIndex,
							usage,
							model: ROUTE_REVIEW_MODEL,
							profile: ROUTE_REVIEW_PROFILE,
							modelRole: 'review'
						})
					})
				: await routeRequest({
						worldCard: params.worldCard,
						request: params.scenario.request_text,
						model: primaryModel
					});
		actualRoute = result.decision.route;
		actualReasonCode = result.decision.reason_code;
		repaired = result.repaired;
	} catch (caught) {
		error = caught instanceof Error ? caught.message : String(caught);
		repaired = usage.length > 1;
	}

	const invalidReason = infrastructureInvalidReason(usage);
	const routeMatch = actualRoute === params.scenario.expected_route;
	const reasonCodeMatch = actualReasonCode === params.scenario.expected_reason_code;
	return {
		scenarioId: params.scenario.scenario_id,
		scenarioClass: params.scenario.class,
		runIndex: params.runIndex,
		replacementIndex: params.replacementIndex,
		expectedRoute: params.scenario.expected_route,
		expectedReasonCode: params.scenario.expected_reason_code,
		actualRoute,
		actualReasonCode,
		routeMatch,
		reasonCodeMatch,
		strictMatch: routeMatch && reasonCodeMatch,
		scored: invalidReason === null,
		infrastructureInvalidReason: invalidReason,
		repaired,
		modelCallCount: usage.length,
		durationMs: Date.now() - startedAt,
		usage,
		error
	};
}

routeDescribe('Phase A pinned CEO route evaluation (paid)', () => {
	it(
		'scores nine independent route calls for each frozen scenario',
		{ retry: 0, timeout: 1_800_000 },
		async () => {
			const apiKey = requiredApiKey();
			const worldCard = buildPhaseAWorldCard(phaseAProjectSnapshot);
			const logicalRuns = frozenPhaseACorpus.scenarios.flatMap((scenario) =>
				Array.from({ length: ROUTES_PER_SCENARIO }, (_, index) => ({
					scenario,
					runIndex: index + 1
				}))
			);
			const runs: RouteEvalRun[] = [];
			let cursor = 0;
			let completedLogicalRuns = 0;

			async function worker(): Promise<void> {
				while (cursor < logicalRuns.length) {
					const logical = logicalRuns[cursor];
					cursor += 1;
					if (!logical) return;

					const first = await executeRun({
						apiKey,
						scenario: logical.scenario,
						runIndex: logical.runIndex,
						replacementIndex: 0,
						worldCard
					});
					runs.push(first);
					if (!first.scored) {
						runs.push(
							await executeRun({
								apiKey,
								scenario: logical.scenario,
								runIndex: logical.runIndex,
								replacementIndex: 1,
								worldCard
							})
						);
					}

					completedLogicalRuns += 1;
					console.info(
						`[phase-a-route] ${completedLogicalRuns}/${EXPECTED_LOGICAL_RUNS} ${logical.scenario.scenario_id}#${logical.runIndex}`
					);
				}
			}

			await Promise.all(Array.from({ length: ROUTE_EVAL_CONCURRENCY }, async () => worker()));
			runs.sort(
				(a, b) =>
					frozenPhaseACorpus.scenarios.findIndex(
						(scenario) => scenario.scenario_id === a.scenarioId
					) -
						frozenPhaseACorpus.scenarios.findIndex(
							(scenario) => scenario.scenario_id === b.scenarioId
						) ||
					a.runIndex - b.runIndex ||
					a.replacementIndex - b.replacementIndex
			);

			const report = buildRouteEvalReport({
				corpusVersion: frozenPhaseACorpus.corpus_version,
				promptVersion: ROUTE_PROMPT_VERSION,
				promptSha256: sha256(ROUTE_SYSTEM_PROMPT),
				worldCardVersion: worldCard.world_card_version,
				worldCardSha256: sha256(serializeWorldCard(worldCard)),
				modelPin:
					ROUTE_EVAL_STRATEGY === 'fast_then_review'
						? `${ROUTE_EVAL_MODEL} -> ${ROUTE_REVIEW_MODEL}`
						: ROUTE_EVAL_MODEL,
				profile: ROUTE_EVAL_PROFILE,
				routingStrategy: ROUTE_EVAL_STRATEGY,
				reviewModelPin:
					ROUTE_EVAL_STRATEGY === 'fast_then_review' ? ROUTE_REVIEW_MODEL : null,
				reviewPolicyVersion:
					ROUTE_EVAL_STRATEGY === 'fast_then_review' ? ROUTE_REVIEW_POLICY_VERSION : null,
				runs
			});
			writeFileSync(ROUTE_EVAL_OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
			console.info(
				'[phase-a-route] evaluation summary',
				JSON.stringify({ output: ROUTE_EVAL_OUTPUT_PATH, ...report.summary }, null, 2)
			);

			expect(report.summary.overall.scoredRunCount).toBe(EXPECTED_LOGICAL_RUNS);
			expect(report.summary.overall.routeAccuracy).toBeGreaterThanOrEqual(0.75);
		}
	);
});
