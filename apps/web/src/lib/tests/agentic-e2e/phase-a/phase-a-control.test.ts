// apps/web/src/lib/tests/agentic-e2e/phase-a/phase-a-control.test.ts
import { writeFileSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loginAndGetCookie } from '../harness/auth';
import { loadHarnessEnv } from '../harness/env';
import { assertTurnSucceeded } from '../harness/assertions';
import { runTurn, warmupPing } from '../harness/sse-client';
import { sweepOrphanProjects, sweepStaleOrphanProjects, teardownProject } from '../harness/seed';
import { teardownChatSession, waitForUsageSummary } from '../harness/telemetry';
import { ensureTestAuthUser, provisionTestUser } from '../harness/test-user';
import type { ScenarioContext } from '../harness/types';
import { assertNoMutationToolCalls, evaluateAcceptanceChecks } from './acceptance';
import { buildControlBaselineReport, type PhaseAControlRun } from './baseline-report';
import { frozenPhaseACorpus, seedPhaseAProject } from './fixtures';

const CONTROL_MODE =
	process.env.AGENTIC_PHASE_A_CONTROL_MODE === 'a2-complex' ? 'a2-complex' : 'a0-baseline';
const BASELINE_OUTPUT_PATH =
	process.env.PHASE_A_CONTROL_OUTPUT_PATH?.trim() ||
	(CONTROL_MODE === 'a2-complex'
		? '/tmp/buildos-phase-a-control-a2.json'
		: '/tmp/buildos-phase-a-control-baseline.json');
const phaseADescribe = process.env.AGENTIC_PHASE_A_CONTROL === 'true' ? describe : describe.skip;
const selectedScenarios =
	CONTROL_MODE === 'a2-complex'
		? frozenPhaseACorpus.scenarios.filter((scenario) =>
				[
					'a0-c06-single-source-article',
					'a0-c07-campaign-workflow-research',
					'a0-c08-context-app-recommendation'
				].includes(scenario.scenario_id)
			)
		: frozenPhaseACorpus.scenarios;

let ctx: ScenarioContext | null = null;
const completedRuns: PhaseAControlRun[] = [];

function requireCtx(): ScenarioContext {
	if (!ctx) throw new Error('[phase-a-control] harness context not initialized');
	return ctx;
}

async function urlResolves(url: string): Promise<boolean> {
	const request = async (method: 'HEAD' | 'GET') => {
		const response = await fetch(url, {
			method,
			redirect: 'follow',
			signal: AbortSignal.timeout(8_000),
			headers: { 'User-Agent': 'BuildOS-Phase-A-Evaluation/1.0' }
		});
		return response.ok;
	};
	try {
		if (await request('HEAD')) return true;
		return await request('GET');
	} catch {
		return false;
	}
}

// The model the control lane is expected to have actually run on. Defaults to the
// original frozen deepseek pin, so every historical run and any re-run of the
// original cohort behaves exactly as before.
//
// Tier 1 overrides this to the workflow lane's synthesis model to kill the model
// confound (research/SYNTHESIS.md §2.1): the control ran a cheap model while the
// workflow lane ended with GLM 5.2 writing the text the judge reads, so the
// measured contrast included "which model wrote the answer."
//
// This MUST remain a real check. Per-role pin verification is audit fix S4 — a run
// on a substituted model is not a scoreable run. Parameterizing the expected value
// is not the same as weakening the check: set it to whatever you pinned the dev
// server to, and it still fails every run that drifted off that pin.
export const CONTROL_EXPECTED_MODEL =
	process.env.PHASE_A_CONTROL_EXPECTED_MODEL?.trim() || 'deepseek/deepseek-v4-flash';

function controlInfrastructureInvalidReason(usage: {
	requestCount: number;
	models: string[];
}): string | null {
	if (usage.requestCount === 0) return 'No stream-correlated model usage was observed.';
	const mismatch = usage.models.find(
		(model) =>
			model !== CONTROL_EXPECTED_MODEL && !model.startsWith(`${CONTROL_EXPECTED_MODEL}-`)
	);
	return mismatch
		? `Actual control model ${mismatch} is outside the pin ${CONTROL_EXPECTED_MODEL}.`
		: null;
}

async function executeControlRun(params: {
	ctx: ScenarioContext;
	scenario: (typeof frozenPhaseACorpus.scenarios)[number];
	runIndex: number;
	replacementIndex: number;
}): Promise<PhaseAControlRun> {
	const seed = await seedPhaseAProject(
		params.ctx,
		`${params.scenario.scenario_id}-${params.runIndex}-r${params.replacementIndex}`
	);
	let sessionId: string | undefined;
	try {
		const result = await runTurn({
			baseUrl: params.ctx.baseUrl,
			cookie: params.ctx.cookie,
			message: params.scenario.request_text,
			contextType: params.scenario.context_type,
			entityId: seed.projectId
		});
		sessionId = result.sessionId ?? undefined;
		const acceptance = await evaluateAcceptanceChecks(
			params.scenario.acceptance_checks,
			result.assistantText,
			{ resolveUrl: urlResolves }
		);
		const usage = result.streamRunId
			? await waitForUsageSummary(params.ctx.db.admin, result.streamRunId)
			: {
					requestCount: 0,
					promptTokens: 0,
					completionTokens: 0,
					totalTokens: 0,
					totalCostUsd: 0,
					models: [],
					providers: [],
					profiles: [],
					operations: []
				};
		const infrastructureInvalidReason = controlInfrastructureInvalidReason(usage);
		const run: PhaseAControlRun = {
			scenarioId: params.scenario.scenario_id,
			scenarioClass: params.scenario.class,
			expectedRoute: params.scenario.expected_route,
			expectedReasonCode: params.scenario.expected_reason_code,
			runIndex: params.runIndex,
			replacementIndex: params.replacementIndex,
			scored: infrastructureInvalidReason === null,
			infrastructureInvalidReason,
			requestStartedAt: result.timing.requestStartedAt,
			timing: result.timing,
			usage,
			completed: result.completed,
			finishedReason: result.finishedReason,
			errors: result.errors.map((error) => error.error),
			toolCalls: result.toolCalls.map((call) => call.function.name),
			acceptance,
			allRequiredChecksPassed: acceptance
				.filter((check) => check.required)
				.every((check) => check.passed),
			assistantText: result.assistantText
		};

		completedRuns.push(run);
		assertNoMutationToolCalls(result);
		if (CONTROL_MODE === 'a0-baseline') {
			assertTurnSucceeded(result);
			expect(
				result.timing.ttftMs,
				'control baseline requires a client-observed SSE text event'
			).not.toBeNull();
			expect(
				usage.requestCount,
				'control baseline requires stream-correlated llm_usage_logs'
			).toBeGreaterThan(0);
		}
		return run;
	} finally {
		try {
			await teardownChatSession(params.ctx.db.admin, params.ctx.db.userId, sessionId);
		} finally {
			await teardownProject(params.ctx.db, seed.projectId);
		}
	}
}

phaseADescribe('Phase A frozen-corpus control baseline (paid, real endpoint)', () => {
	beforeAll(async () => {
		const env = loadHarnessEnv();
		await ensureTestAuthUser({ email: env.testUserEmail, password: env.testUserPassword });
		const { cookie, userId } = await loginAndGetCookie({
			baseUrl: env.baseUrl,
			email: env.testUserEmail,
			password: env.testUserPassword
		});
		const db = await provisionTestUser({ userId, email: env.testUserEmail });
		await warmupPing({ baseUrl: env.baseUrl, cookie });
		await sweepStaleOrphanProjects(db);
		ctx = { baseUrl: env.baseUrl, cookie, db };
	}, 60_000);

	afterAll(async () => {
		const report = buildControlBaselineReport(
			frozenPhaseACorpus.corpus_version,
			completedRuns,
			undefined,
			CONTROL_EXPECTED_MODEL
		);
		writeFileSync(BASELINE_OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
		console.info(
			'[phase-a-control] baseline summary',
			JSON.stringify({ output: BASELINE_OUTPUT_PATH, ...report.summary }, null, 2)
		);
		if (ctx) await sweepOrphanProjects(ctx.db);
		const scoredRuns = completedRuns.filter((run) => run.scored !== false);
		if (CONTROL_MODE === 'a2-complex' && scoredRuns.length !== 9) {
			throw new Error(
				`[phase-a-control] A2 requires exactly 9 scored fresh control runs; observed ${scoredRuns.length}`
			);
		}
	});

	for (const scenario of selectedScenarios) {
		const repetitions =
			CONTROL_MODE === 'a2-complex' || scenario.class === 'simple_read' ? 3 : 1;

		it(
			`[${scenario.class}] ${scenario.scenario_id} ×${repetitions}`,
			{ retry: 0, timeout: 600_000 },
			async () => {
				const c = requireCtx();

				for (let runIndex = 1; runIndex <= repetitions; runIndex += 1) {
					const first = await executeControlRun({
						ctx: c,
						scenario,
						runIndex,
						replacementIndex: 0
					});
					if (CONTROL_MODE === 'a2-complex' && first.scored === false) {
						await executeControlRun({
							ctx: c,
							scenario,
							runIndex,
							replacementIndex: 1
						});
					}
				}
			}
		);
	}
});
