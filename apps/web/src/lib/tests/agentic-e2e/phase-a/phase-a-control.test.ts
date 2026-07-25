// apps/web/src/lib/tests/agentic-e2e/phase-a/phase-a-control.test.ts
import { writeFileSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loginAndGetCookie } from '../harness/auth';
import { loadHarnessEnv } from '../harness/env';
import { assertTurnSucceeded } from '../harness/assertions';
import { runTurn, warmupPing } from '../harness/sse-client';
import { sweepOrphanProjects, teardownProject } from '../harness/seed';
import { teardownChatSession, waitForUsageSummary } from '../harness/telemetry';
import { ensureTestAuthUser, provisionTestUser } from '../harness/test-user';
import type { ScenarioContext } from '../harness/types';
import { assertNoMutationToolCalls, evaluateAcceptanceChecks } from './acceptance';
import { buildControlBaselineReport, type PhaseAControlRun } from './baseline-report';
import { frozenPhaseACorpus, seedPhaseAProject } from './fixtures';

const BASELINE_OUTPUT_PATH = '/tmp/buildos-phase-a-control-baseline.json';
const phaseADescribe = process.env.AGENTIC_PHASE_A_CONTROL === 'true' ? describe : describe.skip;

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
		await sweepOrphanProjects(db);
		ctx = { baseUrl: env.baseUrl, cookie, db };
	}, 60_000);

	afterAll(async () => {
		const report = buildControlBaselineReport(frozenPhaseACorpus.corpus_version, completedRuns);
		writeFileSync(BASELINE_OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
		console.info(
			'[phase-a-control] baseline summary',
			JSON.stringify({ output: BASELINE_OUTPUT_PATH, ...report.summary }, null, 2)
		);
		if (ctx) await sweepOrphanProjects(ctx.db);
	});

	for (const scenario of frozenPhaseACorpus.scenarios) {
		const repetitions = scenario.class === 'simple_read' ? 3 : 1;

		it(
			`[${scenario.class}] ${scenario.scenario_id} ×${repetitions}`,
			{ retry: 0, timeout: 600_000 },
			async () => {
				const c = requireCtx();

				for (let runIndex = 1; runIndex <= repetitions; runIndex += 1) {
					const seed = await seedPhaseAProject(c, `${scenario.scenario_id}-${runIndex}`);
					let sessionId: string | undefined;
					try {
						const result = await runTurn({
							baseUrl: c.baseUrl,
							cookie: c.cookie,
							message: scenario.request_text,
							contextType: scenario.context_type,
							entityId: seed.projectId
						});
						sessionId = result.sessionId ?? undefined;

						const acceptance = await evaluateAcceptanceChecks(
							scenario.acceptance_checks,
							result.assistantText,
							{ resolveUrl: urlResolves }
						);
						const usage = result.streamRunId
							? await waitForUsageSummary(c.db.admin, result.streamRunId)
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
						const allRequiredChecksPassed = acceptance
							.filter((check) => check.required)
							.every((check) => check.passed);

						completedRuns.push({
							scenarioId: scenario.scenario_id,
							scenarioClass: scenario.class,
							expectedRoute: scenario.expected_route,
							expectedReasonCode: scenario.expected_reason_code,
							runIndex,
							requestStartedAt: result.timing.requestStartedAt,
							timing: result.timing,
							usage,
							completed: result.completed,
							finishedReason: result.finishedReason,
							errors: result.errors.map((error) => error.error),
							toolCalls: result.toolCalls.map((call) => call.function.name),
							acceptance,
							allRequiredChecksPassed,
							assistantText: result.assistantText
						});

						assertTurnSucceeded(result);
						assertNoMutationToolCalls(result);
						expect(
							result.timing.ttftMs,
							'control baseline requires a client-observed SSE text event'
						).not.toBeNull();
						expect(
							usage.requestCount,
							'control baseline requires stream-correlated llm_usage_logs'
						).toBeGreaterThan(0);
					} finally {
						try {
							await teardownChatSession(c.db.admin, c.db.userId, sessionId);
						} finally {
							await teardownProject(c.db, seed.projectId);
						}
					}
				}
			}
		);
	}
});
