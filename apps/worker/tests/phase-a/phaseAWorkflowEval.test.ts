// apps/worker/tests/phase-a/phaseAWorkflowEval.test.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
	DEEPSEEK_V4_PRO_MODEL,
	GEMINI_31_FLASH_LITE_MODEL,
	GLM_52_MODEL,
	SmartLLMService,
	type JSONProfile,
	type JSONUsageEvent,
	type UsageLogParams
} from '@buildos/smart-llm';
import { config } from 'dotenv';
import { describe, expect, it } from 'vitest';

import {
	buildPhaseAWorldCard,
	ContextPacketSchema,
	executeWorkflow,
	extractHttpUrls,
	routeRequestWithReview,
	runDeterministicLibrarian,
	runResearcher,
	WorkflowSafetyViolation,
	type AgentExecutorPort,
	type ModelUsageEvent,
	type ModelUsageRole,
	type ResearchModelCall,
	type ResearchModelPort,
	type RouteModelCall,
	type RouteModelPort,
	type SynthesisModelCall,
	type SynthesisModelPort,
	type TransitionModelCall,
	type TransitionModelPort,
	type WorkflowRunResult
} from '../../../../packages/agent-orchestrator/src';
import {
	evaluateHarnessAcceptance,
	type HarnessAcceptanceCheck
} from '../../../../packages/agent-orchestrator/src/testing/harness/acceptance-eval';
import {
	FrozenCorpusSchema,
	ProjectSnapshotSchema
} from '../../../../packages/agent-orchestrator/src/testing/harness/corpus-schema';
import {
	buildWorkflowEvalReport,
	type WorkflowEvalRun
} from '../../../../packages/agent-orchestrator/src/testing/harness/workflow-eval-report';
import { createAgentRunWebResearchPort } from '../../src/workers/agent-run/webResearchPort';

const evalDescribe = process.env.AGENTIC_PHASE_A_WORKFLOW === 'true' ? describe : describe.skip;
const OUTPUT_PATH =
	process.env.PHASE_A_WORKFLOW_OUTPUT_PATH?.trim() || '/tmp/buildos-phase-a-workflow-eval.json';
const USER_ID = 'phase-a-workflow-eval';
const COMPLEX_SCENARIO_IDS = [
	'a0-c06-single-source-article',
	'a0-c07-campaign-workflow-research',
	'a0-c08-context-app-recommendation'
] as const;
const MODEL_PINS = {
	route_primary: GEMINI_31_FLASH_LITE_MODEL,
	route_reviewer: GLM_52_MODEL,
	researcher: DEEPSEEK_V4_PRO_MODEL,
	transition: GLM_52_MODEL,
	synthesis: GLM_52_MODEL
};

const fixtureRoot = fileURLToPath(
	new URL('../../../../packages/agent-orchestrator/src/testing/harness/', import.meta.url)
);
const corpus = FrozenCorpusSchema.parse(
	JSON.parse(readFileSync(`${fixtureRoot}/corpus/phase-a.json`, 'utf8'))
);
const snapshot = ProjectSnapshotSchema.parse(
	JSON.parse(readFileSync(`${fixtureRoot}/fixtures/project-alpha.snapshot.json`, 'utf8'))
);
const scenarios = corpus.scenarios.filter((scenario) =>
	(COMPLEX_SCENARIO_IDS as readonly string[]).includes(scenario.scenario_id)
);
const completedRuns: WorkflowEvalRun[] = [];

function loadPaidEnvironment(): void {
	config({
		path: fileURLToPath(new URL('../../.env', import.meta.url)),
		override: true,
		quiet: true
	});
}

function requiredEnvironment(name: string): string {
	const value = process.env[name]?.trim();
	if (!value) throw new Error(`[phase-a-workflow] Missing ${name} in apps/worker/.env`);
	return value;
}

function toUsage(event: JSONUsageEvent, role: ModelUsageRole): ModelUsageEvent {
	return {
		model: event.model,
		provider: event.provider ?? event.billingProvider ?? null,
		promptTokens: event.promptTokens,
		completionTokens: event.completionTokens,
		totalTokens: event.totalTokens,
		totalCostUsd: event.totalCost,
		billingDisposition: event.billingDisposition ?? null,
		role
	};
}

function createLlm(apiKey: string, evaluationOnlyAllowNonZdr = false): SmartLLMService {
	return new SmartLLMService({
		apiKey,
		enforceUserId: true,
		usageLogger: {
			logUsageToDatabase: async (_event: UsageLogParams) => undefined
		},
		openrouter: { timeoutMs: 120_000, evaluationOnlyAllowNonZdr }
	});
}

function readContentEnvelope(value: unknown): string {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error('Model did not return a JSON content envelope');
	}
	const content = (value as Record<string, unknown>).content;
	if (typeof content !== 'string' || !content.trim()) {
		throw new Error('Model JSON envelope is missing non-empty content');
	}
	return content.trim();
}

function createRoutePort(params: {
	apiKey: string;
	model: string;
	profile: JSONProfile;
	role: Extract<ModelUsageRole, 'route_primary' | 'route_reviewer'>;
	observedUsage: ModelUsageEvent[];
	scenarioId: string;
	runIndex: number;
	replacementIndex: number;
}): RouteModelPort {
	const llm = createLlm(params.apiKey);
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
				reasoning: { effort: 'low', exclude: true },
				spendLimit: { maxCostUsd: 0.01, minOutputTokens: 128, safetyMultiplier: 2 },
				validation: {
					retryOnParseError: false,
					validateSchema: false,
					maxRetries: 0,
					allowTruncatedJsonRecovery: false
				},
				userId: USER_ID,
				operationType: 'agent_orchestrator_phase_a_workflow_route',
				metadata: {
					role: params.role,
					scenarioId: params.scenarioId,
					runIndex: params.runIndex,
					replacementIndex: params.replacementIndex,
					promptVersion: call.promptVersion
				},
				onUsage: async (event) => {
					params.observedUsage.push(toUsage(event, params.role));
				}
			});
		}
	};
}

function createJsonTextPort(params: {
	apiKey: string;
	model: string;
	profile: JSONProfile;
	role: Extract<ModelUsageRole, 'researcher' | 'synthesis'>;
	observedUsage: ModelUsageEvent[];
	scenarioId: string;
	runIndex: number;
	evaluationOnlyAllowNonZdr?: boolean;
}): ResearchModelPort & SynthesisModelPort {
	const llm = createLlm(params.apiKey, params.evaluationOnlyAllowNonZdr);
	return {
		async generateText(call: ResearchModelCall | SynthesisModelCall) {
			const usage: ModelUsageEvent[] = [];
			const value = await llm.getJSONResponse<unknown>({
				systemPrompt: `${call.systemPrompt}\n\nReturn only JSON with this exact shape: {"content":"the complete user-visible Markdown response"}.`,
				userPrompt: call.userPrompt,
				profile: params.profile,
				model: params.model,
				models: [],
				temperature: call.temperature,
				maxTokens: call.maxTokens,
				timeoutMs: 120_000,
				reasoning: {
					effort: params.role === 'synthesis' ? 'medium' : 'low',
					exclude: true
				},
				spendLimit: {
					maxCostUsd: call.maxCostUsd,
					minOutputTokens: 512,
					safetyMultiplier: 2
				},
				validation: {
					retryOnParseError: false,
					validateSchema: false,
					maxRetries: 0,
					allowTruncatedJsonRecovery: false
				},
				userId: USER_ID,
				operationType: `agent_orchestrator_phase_a_${params.role}`,
				metadata: {
					role: params.role,
					scenarioId: params.scenarioId,
					runIndex: params.runIndex,
					promptVersion: call.promptVersion
				},
				onUsage: async (event) => {
					const normalized = toUsage(event, params.role);
					usage.push(normalized);
					params.observedUsage.push(normalized);
				}
			});
			return { text: readContentEnvelope(value), usage };
		}
	};
}

function createTransitionPort(params: {
	apiKey: string;
	observedUsage: ModelUsageEvent[];
	scenarioId: string;
	runIndex: number;
}): TransitionModelPort {
	const llm = createLlm(params.apiKey);
	return {
		async generateJson(call: TransitionModelCall) {
			const usage: ModelUsageEvent[] = [];
			const value = await llm.getJSONResponse<unknown>({
				systemPrompt: call.systemPrompt,
				userPrompt: call.userPrompt,
				profile: 'powerful',
				model: GLM_52_MODEL,
				models: [],
				temperature: call.temperature,
				maxTokens: call.maxTokens,
				timeoutMs: 60_000,
				reasoning: { effort: 'low', exclude: true },
				spendLimit: {
					maxCostUsd: call.maxCostUsd,
					minOutputTokens: 128,
					safetyMultiplier: 2
				},
				validation: {
					retryOnParseError: false,
					validateSchema: false,
					maxRetries: 0,
					allowTruncatedJsonRecovery: false
				},
				userId: USER_ID,
				operationType: 'agent_orchestrator_phase_a_transition',
				metadata: {
					role: 'transition',
					scenarioId: params.scenarioId,
					runIndex: params.runIndex,
					promptVersion: call.promptVersion,
					attempt: call.attempt
				},
				onUsage: async (event) => {
					const normalized = toUsage(event, 'transition');
					usage.push(normalized);
					params.observedUsage.push(normalized);
				}
			});
			return { value, usage };
		}
	};
}

function createAgentExecutor(params: {
	apiKey: string;
	tavilyApiKey: string;
	observedUsage: ModelUsageEvent[];
	toolCharges: number[];
	scenario: (typeof scenarios)[number];
	runIndex: number;
}): AgentExecutorPort {
	return {
		async execute(request) {
			// Agents self-report against the criterion ids the step actually declares; a hardcoded
			// id cannot be reconciled with the plan. See research/09_INTERNAL_GROUND_TRUTH_MAP.md D10.
			const declaredCriterionIds = request.step.acceptance_criteria.map(
				(criterion) => criterion.criterion_id
			);

			if (request.step.agent_id === 'librarian.v0') {
				return {
					result: runDeterministicLibrarian({
						objective: params.scenario.request_text,
						snapshot,
						acceptanceCriterionIds: declaredCriterionIds
					}),
					usage: [],
					toolCostUsd: 0,
					toolCalls: []
				};
			}
			if (request.step.agent_id !== 'researcher.v0') {
				throw new Error(`Unsupported Phase A agent: ${request.step.agent_id}`);
			}

			const contextArtifact = request.inputArtifacts.find(
				(artifact) => artifact.envelope.artifact_type === 'context_packet'
			);
			const contextPacket = contextArtifact
				? ContextPacketSchema.parse(contextArtifact.envelope.payload)
				: null;
			const suppliedUrlCount = extractHttpUrls(params.scenario.request_text).length;
			const reservedToolCost = suppliedUrlCount > 0 ? 0 : 0.008;
			const dispatchedCharges: number[] = [];
			const web = createAgentRunWebResearchPort({
				apiKey: params.tavilyApiKey,
				onSearchDispatched: (charge) => {
					dispatchedCharges.push(charge.cost_usd);
					params.toolCharges.push(charge.cost_usd);
				}
			});
			// No scenario-keyed knobs. `runResearcher` derives its visit budget and citation floor
			// from whether the request supplied its own sources. See
			// PHASE_A_AUDIT_2026-07-25.md S2.
			const researcher = await runResearcher({
				objective: params.scenario.request_text,
				focus: request.step.goal,
				contextPacket,
				acceptanceCriterionIds: declaredCriterionIds,
				maxModelCostUsd: Math.max(0.001, request.maxCostUsd - reservedToolCost),
				web,
				model: createJsonTextPort({
					apiKey: params.apiKey,
					model: DEEPSEEK_V4_PRO_MODEL,
					profile: 'powerful',
					role: 'researcher',
					observedUsage: params.observedUsage,
					scenarioId: params.scenario.scenario_id,
					runIndex: params.runIndex,
					// DJ approved non-ZDR transport only for the anonymized Phase A DeepSeek
					// researcher input. Every other role keeps SmartLLM's ZDR-safe default.
					evaluationOnlyAllowNonZdr: true
				})
			});
			return {
				result: researcher.result,
				usage: researcher.usage,
				toolCostUsd: Math.max(
					researcher.toolCostUsd,
					dispatchedCharges.reduce((total, charge) => total + charge, 0)
				),
				toolCalls: researcher.webCalls.map((call) => ({
					operation: `web.${call.operation}`,
					effect: 'read' as const,
					succeeded: call.succeeded,
					error: call.error
				}))
			};
		}
	};
}

async function urlResolves(url: string): Promise<boolean> {
	for (const method of ['HEAD', 'GET'] as const) {
		try {
			const response = await fetch(url, {
				method,
				redirect: 'follow',
				signal: AbortSignal.timeout(8_000),
				headers: { 'User-Agent': 'BuildOS-Phase-A-Evaluation/1.0' }
			});
			if (response.ok) return true;
		} catch {
			// Fall through from HEAD to GET, or report false after GET.
		}
	}
	return false;
}

function modelCost(usage: ModelUsageEvent[]): number {
	return usage.reduce((total, event) => total + event.totalCostUsd, 0);
}

/**
 * ADR 0001 promises that a run whose actual model differs from its role's pin is
 * infrastructure-invalid. Checking every event against the union of all five pins does not
 * deliver that: a researcher call that silently fell back to GLM 5.2 would pass, because GLM 5.2
 * is the transition and synthesis pin. The check is therefore per role.
 * See PHASE_A_AUDIT_2026-07-25.md S4.
 */
function matchesPin(actual: string, pin: string): boolean {
	return actual === pin || actual.startsWith(`${pin}-`);
}

function infrastructureInvalidReason(usage: ModelUsageEvent[]): string | null {
	if (usage.length === 0) return 'No model usage event was observed.';
	const untagged = usage.find((event) => !event.role);
	if (untagged) {
		return `Usage event for ${untagged.model} carried no role, so its pin cannot be verified.`;
	}
	const mismatch = usage.find((event) => {
		const pin = MODEL_PINS[event.role as keyof typeof MODEL_PINS];
		return !pin || !matchesPin(event.model, pin);
	});
	if (mismatch) {
		return `Role ${mismatch.role} returned ${mismatch.model}, which is not its frozen A2 pin.`;
	}
	if (
		usage.some(
			(event) =>
				event.billingDisposition === 'released' &&
				event.promptTokens === 0 &&
				event.completionTokens === 0
		)
	) {
		return 'Provider rejected a model request before inference.';
	}
	return null;
}

async function executeRun(params: {
	apiKey: string;
	tavilyApiKey: string;
	scenario: (typeof scenarios)[number];
	runIndex: number;
	replacementIndex: number;
}): Promise<WorkflowEvalRun> {
	const startedAtMs = Date.now();
	const startedAt = new Date(startedAtMs).toISOString();
	const observedUsage: ModelUsageEvent[] = [];
	const toolCharges: number[] = [];
	let actualRoute: string | null = null;
	let actualReasonCode: string | null = null;
	let routeDurationMs = 0;
	let workflow: WorkflowRunResult | null = null;
	let error: string | null = null;

	try {
		const routeResult = await routeRequestWithReview({
			worldCard: buildPhaseAWorldCard(snapshot),
			request: params.scenario.request_text,
			primaryModel: createRoutePort({
				apiKey: params.apiKey,
				model: GEMINI_31_FLASH_LITE_MODEL,
				profile: 'fast',
				role: 'route_primary',
				observedUsage,
				scenarioId: params.scenario.scenario_id,
				runIndex: params.runIndex,
				replacementIndex: params.replacementIndex
			}),
			reviewModel: createRoutePort({
				apiKey: params.apiKey,
				model: GLM_52_MODEL,
				profile: 'powerful',
				role: 'route_reviewer',
				observedUsage,
				scenarioId: params.scenario.scenario_id,
				runIndex: params.runIndex,
				replacementIndex: params.replacementIndex
			})
		});
		actualRoute = routeResult.decision.route;
		actualReasonCode = routeResult.decision.reason_code;
		routeDurationMs = routeResult.durationMs;
		if (routeResult.decision.route !== 'workflow') {
			throw new Error(
				`Route selected ${routeResult.decision.route}; workflow lane did not execute.`
			);
		}
		const routeUsage = [...observedUsage];
		workflow = await executeWorkflow({
			routeDecision: routeResult.decision,
			permissionGrant: {
				mode: 'read_only',
				project_ids: [snapshot.project.id],
				operations: [
					'ontology.project.read',
					'ontology.entity.read',
					'web.search',
					'web.visit'
				],
				network: 'web_read',
				artifact_types_read: ['context_packet', 'research_packet'],
				artifact_types_write: ['context_packet', 'research_packet'],
				expires_at: new Date(Date.now() + 10 * 60_000).toISOString()
			},
			projectScope: [
				{
					project_id: snapshot.project.id,
					project_name: snapshot.project.name,
					role: 'primary',
					reason: 'The frozen Phase A request is scoped to this project.'
				}
			],
			agentExecutor: createAgentExecutor({
				apiKey: params.apiKey,
				tavilyApiKey: params.tavilyApiKey,
				observedUsage,
				toolCharges,
				scenario: params.scenario,
				runIndex: params.runIndex
			}),
			transitionModel: createTransitionPort({
				apiKey: params.apiKey,
				observedUsage,
				scenarioId: params.scenario.scenario_id,
				runIndex: params.runIndex
			}),
			synthesisModel: createJsonTextPort({
				apiKey: params.apiKey,
				model: GLM_52_MODEL,
				profile: 'powerful',
				role: 'synthesis',
				observedUsage,
				scenarioId: params.scenario.scenario_id,
				runIndex: params.runIndex
			}),
			maxUsd: 0.05,
			maxWallClockMs: 300_000,
			initialUsage: routeUsage
		});
	} catch (caught) {
		if (caught instanceof WorkflowSafetyViolation) throw caught;
		error = caught instanceof Error ? caught.message : String(caught);
	}

	const assistantText = workflow?.output ?? '';
	const acceptance = await evaluateHarnessAcceptance({
		checks: params.scenario.acceptance_checks as HarnessAcceptanceCheck[],
		text: assistantText,
		resolveUrl: urlResolves
	});
	const allRequiredChecksPassed = acceptance
		.filter((check) => check.required)
		.every((check) => check.passed);
	const invalidReason = infrastructureInvalidReason(observedUsage);
	const toolCostUsd = toolCharges.reduce((total, charge) => total + charge, 0);
	const actualModelCost = modelCost(observedUsage);

	return {
		scenarioId: params.scenario.scenario_id,
		scenarioClass: params.scenario.class,
		runIndex: params.runIndex,
		replacementIndex: params.replacementIndex,
		scored: invalidReason === null,
		infrastructureInvalidReason: invalidReason,
		expectedRoute: params.scenario.expected_route,
		expectedReasonCode: params.scenario.expected_reason_code,
		actualRoute,
		actualReasonCode,
		status: workflow?.status ?? 'failed',
		startedAt,
		routeDurationMs,
		totalDurationMs: Date.now() - startedAtMs,
		stageCount: workflow?.stageCount ?? 0,
		replanCount: workflow?.replanCount ?? 0,
		transitionModelCalls: workflow?.transitionModelCalls ?? 0,
		forcedTransitions: workflow?.forcedTransitions ?? 0,
		usage: observedUsage,
		modelCostUsd: actualModelCost,
		toolCostUsd,
		totalCostUsd: actualModelCost + toolCostUsd,
		toolCalls: workflow?.toolCalls ?? [],
		stages: workflow?.stages ?? [],
		artifacts: workflow?.artifacts ?? [],
		acceptance,
		allRequiredChecksPassed,
		assistantText,
		error
	};
}

evalDescribe('Phase A A2 in-process workflow evaluation (paid)', () => {
	it(
		'runs three fresh workflow outputs for each frozen complex scenario',
		{ retry: 0, timeout: 2_700_000 },
		async () => {
			loadPaidEnvironment();
			const apiKey = requiredEnvironment('PRIVATE_OPENROUTER_API_KEY');
			const tavilyApiKey =
				process.env.PRIVATE_TAVILY_API_KEY?.trim() || requiredEnvironment('TAVILY_API_KEY');
			expect(scenarios.map((scenario) => scenario.scenario_id)).toEqual(COMPLEX_SCENARIO_IDS);

			for (const scenario of scenarios) {
				for (let runIndex = 1; runIndex <= 3; runIndex += 1) {
					const first = await executeRun({
						apiKey,
						tavilyApiKey,
						scenario,
						runIndex,
						replacementIndex: 0
					});
					completedRuns.push(first);
					if (!first.scored) {
						completedRuns.push(
							await executeRun({
								apiKey,
								tavilyApiKey,
								scenario,
								runIndex,
								replacementIndex: 1
							})
						);
					}
					const report = buildWorkflowEvalReport({
						corpusVersion: corpus.corpus_version,
						modelPins: MODEL_PINS,
						runs: completedRuns
					});
					writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
				}
			}

			const report = buildWorkflowEvalReport({
				corpusVersion: corpus.corpus_version,
				modelPins: MODEL_PINS,
				runs: completedRuns
			});
			writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
			const scored = completedRuns.filter((run) => run.scored);
			expect(scored).toHaveLength(9);
			expect(report.summary.safetyPassed).toBe(true);
		}
	);
});
