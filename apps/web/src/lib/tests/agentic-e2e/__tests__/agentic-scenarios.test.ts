// apps/web/src/lib/tests/agentic-e2e/__tests__/agentic-scenarios.test.ts
//
// ⚠️ End-to-end agentic-chat stress harness. Every scenario drives the REAL
// POST /api/agent/v2/stream endpoint against a running dev server, runs the
// production (cheap) model + tools, writes to the hosted DB, and calls a strong
// LLM judge on fuzzy scenarios. It COSTS MONEY and requires a running dev server
// (`pnpm dev --filter=@buildos/web`). Excluded from `pnpm test`; run with
// `pnpm --filter @buildos/web test:agentic`.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadHarnessEnv } from '../harness/env';
import { loginAndGetCookie } from '../harness/auth';
import { ensureTestAuthUser, provisionTestUser } from '../harness/test-user';
import { runTurn, warmupPing } from '../harness/sse-client';
import { sweepOrphanProjects, teardownProject } from '../harness/seed';
import { releaseTurnForFollowup, teardownChatSession } from '../harness/telemetry';
import { judgeQuality } from '../harness/judge';
import { checkTurnBeforeFollowupRelease } from '../harness/turn-sequencing';
import { readTurnAttribution } from '../harness/attribution';
import { scenarioCatalog } from '../scenarios/catalog';
import type { ScenarioContext, SeedResult } from '../harness/types';
import type { LastTurnContext } from '@buildos/shared-types';

let ctx: ScenarioContext | null = null;

function requireCtx(): ScenarioContext {
	if (!ctx) throw new Error('[agentic-e2e] harness context not initialized (beforeAll failed)');
	return ctx;
}

beforeAll(async () => {
	const env = loadHarnessEnv();

	// 1. Ensure the dedicated test user exists (auth + public.users + actor).
	await ensureTestAuthUser({ email: env.testUserEmail, password: env.testUserPassword });
	const { cookie, userId } = await loginAndGetCookie({
		baseUrl: env.baseUrl,
		email: env.testUserEmail,
		password: env.testUserPassword
	});
	const db = await provisionTestUser({ userId, email: env.testUserEmail });

	// 2. Confirm the stream endpoint is reachable + authorized.
	await warmupPing({ baseUrl: env.baseUrl, cookie });

	// 3. Clear any orphaned harness projects from a previous crashed run.
	await sweepOrphanProjects(db);

	ctx = { baseUrl: env.baseUrl, cookie, db };
}, 60000);

afterAll(async () => {
	if (ctx) {
		const swept = await sweepOrphanProjects(ctx.db);
		if (swept > 0) console.warn(`[agentic-e2e] afterAll swept ${swept} leftover project(s)`);
	}
});

describe('agentic chat e2e scenarios (real model + tools + DB)', () => {
	for (const scenario of scenarioCatalog) {
		const skipped = scenario.skip?.() ?? false;
		const runner = skipped ? it.skip : it;

		runner(
			`[${scenario.category}] ${scenario.title}`,
			async () => {
				const c = requireCtx();
				let seed: SeedResult = { entityIds: {}, notes: {} };
				let sessionId: string | undefined;

				try {
					if (scenario.seed) {
						seed = await scenario.seed(c);
					}

					let lastTurnContext: LastTurnContext | null = null;
					for (const [turnIndex, turn] of scenario.turns.entries()) {
						const entityId = turn.entityIdFromSeed?.(seed);
						const result = await runTurn({
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
									if (process.env.AGENTIC_ASSERT_TELEMETRY === 'true') {
										throw new Error(
											'[agentic-e2e] turn did not expose a stream_run_id'
										);
									}
									return;
								}
								const attribution = await readTurnAttribution(
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
								if (process.env.AGENTIC_ASSERT_TELEMETRY === 'true') {
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
							releaseForFollowup: () =>
								releaseTurnForFollowup(c.db.admin, result.streamRunId)
						});
					}
				} finally {
					try {
						await teardownChatSession(c.db.admin, c.db.userId, sessionId);
					} finally {
						if (scenario.seed) {
							await teardownProject(c.db, seed.projectId);
						}
					}
				}
			},
			300000
		);
	}
});
