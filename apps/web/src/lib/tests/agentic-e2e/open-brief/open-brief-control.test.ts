// apps/web/src/lib/tests/agentic-e2e/open-brief/open-brief-control.test.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { GLM_52_MODEL } from '@buildos/smart-llm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
	buildOpenBriefCorpusCells,
	inspectOpenBriefCorpusReadiness,
	OpenBriefCorpusSchema,
	type OpenBriefCorpusCell
} from '../../../../../../../packages/agent-orchestrator/src/testing/harness/open-brief-corpus';
import {
	buildOpenBriefCohort1RunPlan,
	OPEN_BRIEF_BLOCKED_FOLLOWUP,
	OPEN_BRIEF_COHORT1_MAX_REPLACEMENTS_PER_RUN
} from '../../../../../../../packages/agent-orchestrator/src/testing/harness/open-brief-cohort-plan';
import {
	evaluateOpenBriefRun,
	extractOpenBriefAssumptions,
	extractOpenBriefExternalClaims,
	extractOpenBriefQuestions,
	type OpenBriefEvaluationProfile,
	type OpenBriefRunEvidence
} from '../../../../../../../packages/agent-orchestrator/src/testing/harness/open-brief-eval';
import { excludeSystemDocuments } from '../harness/assertions';
import { loginAndGetCookie } from '../harness/auth';
import { loadHarnessEnv } from '../harness/env';
import { runTurn, warmupPing } from '../harness/sse-client';
import { sweepOrphanProjects, sweepStaleOrphanProjects, teardownProject } from '../harness/seed';
import {
	getToolExecutions,
	getTurnRun,
	listDocuments,
	teardownChatSession,
	waitForUsageSummary,
	type StreamUsageSummary,
	type ToolExecutionRow
} from '../harness/telemetry';
import { ensureTestAuthUser, provisionTestUser } from '../harness/test-user';
import type { ScenarioContext, TurnResult } from '../harness/types';
import { resolveOpenBriefSnapshot, seedOpenBriefProject } from './fixtures';

const controlDescribe =
	process.env.AGENTIC_OPEN_BRIEF_CONTROL === 'true' ? describe : describe.skip;
const OUTPUT_PATH =
	process.env.OPEN_BRIEF_CONTROL_OUTPUT_PATH?.trim() ||
	'/tmp/buildos-open-brief-control-cohort1.json';
const EXPECTED_MODEL = process.env.OPEN_BRIEF_EXPECTED_FINAL_MODEL?.trim() || GLM_52_MODEL;
const CONTROL_TOOL_ROUND_CAP = 12;
const TAVILY_PUBLIC_PAYG_CREDIT_COST_USD = 0.008;
const CORPUS_PATH = fileURLToPath(
	new URL(
		'../../../../../../../docs/architecture/agent-first-orchestration/corpus/open-brief-v1.json',
		import.meta.url
	)
);

const corpusInput = JSON.parse(readFileSync(CORPUS_PATH, 'utf8')) as unknown;
const corpus = OpenBriefCorpusSchema.parse(corpusInput);

interface OpenBriefControlAttempt {
	cellId: string;
	briefId: string;
	snapshotId: string;
	runIndex: number;
	replacementIndex: number;
	lane: 'control';
	scored: boolean;
	infrastructureInvalidReason: string | null;
	startedAt: string;
	latencyMs: number;
	completed: boolean;
	finishedReason: string | null;
	errors: string[];
	usage: Awaited<ReturnType<typeof waitForUsageSummary>>;
	modelCostUsd: number;
	toolCostUsd: number;
	totalCostUsd: number;
	toolExecutions: Array<{
		name: string;
		op: string | null;
		success: boolean;
	}>;
	evidence: OpenBriefRunEvidence;
	machineScore: ReturnType<typeof evaluateOpenBriefRun>;
	silentCaps: string[];
	assistantText: string;
	turnCount: number;
	transcript: Array<{ role: 'user' | 'assistant'; content: string }>;
}

let ctx: ScenarioContext | null = null;
const attempts: OpenBriefControlAttempt[] = [];

function requireCtx(): ScenarioContext {
	if (!ctx) throw new Error('[open-brief-control] harness context not initialized');
	return ctx;
}

function matchesPin(actual: string, expected: string): boolean {
	return actual === expected || actual.startsWith(`${expected}-`);
}

function infrastructureInvalidReason(params: {
	completed: boolean;
	finishedReason: string | null;
	errors: string[];
	usage: Awaited<ReturnType<typeof waitForUsageSummary>>;
}): string | null {
	if (!params.completed) return 'The stream did not emit a terminal done event.';
	if (params.errors.length > 0)
		return `The stream emitted error(s): ${params.errors.join(' | ')}`;
	if (params.usage.requestCount === 0) return 'No stream-correlated model usage was observed.';
	const mismatch = params.usage.models.find((model) => !matchesPin(model, EXPECTED_MODEL));
	if (mismatch) return `Actual control model ${mismatch} is outside the pin ${EXPECTED_MODEL}.`;
	if (params.finishedReason === 'error') return 'The terminal finished_reason was error.';
	return null;
}

function profileForCell(cell: OpenBriefCorpusCell): OpenBriefEvaluationProfile {
	const requiresPlanShape = cell.briefId !== 'ob-03-domain-research';
	return {
		clarificationLabel: cell.clarificationLabel,
		loadBearingUnknowns:
			cell.briefId === 'ob-05-underspecified'
				? [
						{
							description:
								"DJ's intended direction or permission to use best judgment",
							matchTerms: ['direction', 'vision', 'permission', 'best judgment']
						}
					]
				: [],
		requiresPlanShape,
		researchBearing: cell.briefId === 'ob-03-domain-research',
		maxSteps:
			cell.clarificationLabel === 'blocked'
				? CONTROL_TOOL_ROUND_CAP * 2
				: CONTROL_TOOL_ROUND_CAP
	};
}

function collectUrls(value: unknown, urls = new Set<string>()): Set<string> {
	if (typeof value === 'string') {
		for (const match of value.matchAll(/https?:\/\/[^\s<>()\]]+/g)) {
			urls.add(match[0].replace(/[.,;:]+$/, ''));
		}
		return urls;
	}
	if (Array.isArray(value)) {
		for (const entry of value) collectUrls(entry, urls);
		return urls;
	}
	if (value && typeof value === 'object') {
		for (const entry of Object.values(value as Record<string, unknown>))
			collectUrls(entry, urls);
	}
	return urls;
}

async function urlResolves(url: string): Promise<boolean> {
	for (const method of ['HEAD', 'GET'] as const) {
		try {
			const response = await fetch(url, {
				method,
				redirect: 'follow',
				signal: AbortSignal.timeout(8_000),
				headers: { 'User-Agent': 'BuildOS-Open-Brief-Evaluation/1.0' }
			});
			if (response.ok) return true;
		} catch {
			// Fall through from HEAD to GET, or report false after GET.
		}
	}
	return false;
}

function exactDuplicateAssignmentCount(executions: ToolExecutionRow[]): number {
	const seen = new Set<string>();
	let duplicates = 0;
	for (const execution of executions) {
		const signature = JSON.stringify([
			execution.gateway_op ?? execution.tool_name,
			execution.arguments
		]);
		if (seen.has(signature)) duplicates += 1;
		else seen.add(signature);
	}
	return duplicates;
}

function tavilyCost(executions: ToolExecutionRow[]): number {
	return executions
		.filter(
			(execution) =>
				execution.success &&
				(execution.tool_name === 'web_search' || execution.gateway_op === 'util.web.search')
		)
		.reduce((total, execution) => {
			const args =
				execution.arguments && typeof execution.arguments === 'object'
					? (execution.arguments as Record<string, unknown>)
					: {};
			const credits = args.search_depth === 'basic' ? 1 : 2;
			return total + credits * TAVILY_PUBLIC_PAYG_CREDIT_COST_USD;
		}, 0);
}

function silentCaps(params: {
	toolRoundCounts: number[];
	finishedReasons: Array<string | null>;
	assistantText: string;
}): string[] {
	const result: string[] = [];
	for (const [index, count] of params.toolRoundCounts.entries()) {
		if (count >= CONTROL_TOOL_ROUND_CAP) {
			result.push(`turn_${index + 1}_tool_round_cap:${CONTROL_TOOL_ROUND_CAP}`);
		}
	}
	for (const [index, reason] of params.finishedReasons.entries()) {
		if (reason === 'length') {
			result.push(`turn_${index + 1}_provider_finished_reason:length`);
		}
	}
	if (!params.assistantText.trim()) result.push('empty_assistant_output');
	return result;
}

function aggregateUsage(values: StreamUsageSummary[]): StreamUsageSummary {
	const unique = (items: string[]) => Array.from(new Set(items));
	return {
		requestCount: values.reduce((total, value) => total + value.requestCount, 0),
		promptTokens: values.reduce((total, value) => total + value.promptTokens, 0),
		completionTokens: values.reduce((total, value) => total + value.completionTokens, 0),
		totalTokens: values.reduce((total, value) => total + value.totalTokens, 0),
		totalCostUsd: values.reduce((total, value) => total + value.totalCostUsd, 0),
		models: unique(values.flatMap((value) => value.models)),
		providers: unique(values.flatMap((value) => value.providers)),
		profiles: unique(values.flatMap((value) => value.profiles)),
		operations: unique(values.flatMap((value) => value.operations))
	};
}

async function executeAttempt(params: {
	cell: OpenBriefCorpusCell;
	runIndex: number;
	replacementIndex: number;
}): Promise<OpenBriefControlAttempt> {
	const context = requireCtx();
	const startedAt = new Date().toISOString();
	const seed = await seedOpenBriefProject({
		ctx: context,
		snapshotId: params.cell.snapshotId,
		label: `${params.cell.cellId}-r${params.runIndex}-x${params.replacementIndex}`
	});
	let sessionId: string | null = null;
	try {
		const beforeDocuments = await listDocuments(context.db.admin, seed.projectId!);
		const beforeDocumentIds = new Set(beforeDocuments.map((document) => document.id));
		const firstTurn = await runTurn({
			baseUrl: context.baseUrl,
			cookie: context.cookie,
			message: params.cell.requestText,
			contextType: 'project',
			entityId: seed.projectId
		});
		sessionId = firstTurn.sessionId;
		const turns: TurnResult[] = [firstTurn];
		const afterFirstDocuments = await listDocuments(context.db.admin, seed.projectId!);
		const firstCreatedDocuments = excludeSystemDocuments(
			afterFirstDocuments.filter((document) => !beforeDocumentIds.has(document.id))
		);
		if (
			params.cell.clarificationLabel === 'blocked' &&
			extractOpenBriefQuestions(firstTurn.assistantText).length > 0 &&
			firstCreatedDocuments.length === 0 &&
			firstTurn.completed &&
			firstTurn.errors.length === 0
		) {
			const followup = await runTurn({
				baseUrl: context.baseUrl,
				cookie: context.cookie,
				message: OPEN_BRIEF_BLOCKED_FOLLOWUP,
				contextType: 'project',
				entityId: seed.projectId,
				sessionId: firstTurn.sessionId ?? undefined,
				lastTurnContext: firstTurn.lastTurnContext
			});
			turns.push(followup);
			sessionId = followup.sessionId ?? sessionId;
		}
		const finalTurn = turns.at(-1)!;
		const afterDocuments = await listDocuments(context.db.admin, seed.projectId!);
		const createdDocuments = excludeSystemDocuments(
			afterDocuments.filter((document) => !beforeDocumentIds.has(document.id))
		);
		const usageParts = await Promise.all(
			turns.map((turn) =>
				turn.streamRunId
					? waitForUsageSummary(context.db.admin, turn.streamRunId)
					: Promise.resolve<StreamUsageSummary>({
							requestCount: 0,
							promptTokens: 0,
							completionTokens: 0,
							totalTokens: 0,
							totalCostUsd: 0,
							models: [],
							providers: [],
							profiles: [],
							operations: []
						})
			)
		);
		const usage = aggregateUsage(usageParts);
		const executionParts = await Promise.all(
			turns.map((turn) =>
				turn.streamRunId
					? getToolExecutions(context.db.admin, turn.streamRunId)
					: Promise.resolve<ToolExecutionRow[]>([])
			)
		);
		const executions = executionParts.flat();
		const turnRuns = await Promise.all(
			turns.map((turn) =>
				turn.streamRunId
					? getTurnRun(context.db.admin, turn.streamRunId)
					: Promise.resolve(null)
			)
		);
		const assistantTranscript = turns.map((turn) => turn.assistantText).join('\n\n');
		const combinedText = `${assistantTranscript}\n\n${createdDocuments
			.map((document) => document.content ?? '')
			.join('\n\n')}`;
		const claimUrls = Array.from(
			new Set(
				extractOpenBriefExternalClaims(combinedText).flatMap((claim) => claim.citationUrls)
			)
		);
		const toolResultUrls = new Set<string>();
		for (const execution of executions) collectUrls(execution.result, toolResultUrls);
		const resolvedSourceUrls = (
			await Promise.all(
				claimUrls.map(
					async (url) =>
						[url, toolResultUrls.has(url) || (await urlResolves(url))] as const
				)
			)
		)
			.filter(([, resolves]) => resolves)
			.map(([url]) => url);
		const evidence: OpenBriefRunEvidence = {
			assistantText: finalTurn.assistantText,
			documents: createdDocuments.map((document) => ({
				documentId: document.id,
				title: document.title,
				content: document.content ?? '',
				persisted: true,
				author: 'model'
			})),
			projectContextReadCount: turns.length,
			assumptions: extractOpenBriefAssumptions(combinedText),
			questions: extractOpenBriefQuestions(combinedText),
			externalClaims: extractOpenBriefExternalClaims(combinedText),
			resolvedSourceUrls,
			stepsUsed: turnRuns.reduce(
				(total, turnRun) => total + (turnRun?.tool_round_count ?? 0),
				0
			),
			tokensUsed: usage.totalTokens,
			repeatedAssignmentCount: exactDuplicateAssignmentCount(executions)
		};
		const profile = profileForCell(params.cell);
		const machineScore = evaluateOpenBriefRun({
			profile,
			evidence,
			snapshot: resolveOpenBriefSnapshot(params.cell.snapshotId)
		});
		const errors = turns.flatMap((turn) => turn.errors.map((error) => error.error));
		const invalidReason = infrastructureInvalidReason({
			completed: turns.every((turn) => turn.completed),
			finishedReason: finalTurn.finishedReason,
			errors,
			usage
		});
		const toolCostUsd = tavilyCost(executions);
		const caps = silentCaps({
			toolRoundCounts: turnRuns.map((turnRun) => turnRun?.tool_round_count ?? 0),
			finishedReasons: turns.map((turn) => turn.finishedReason),
			assistantText: finalTurn.assistantText
		});
		return {
			cellId: params.cell.cellId,
			briefId: params.cell.briefId,
			snapshotId: params.cell.snapshotId,
			runIndex: params.runIndex,
			replacementIndex: params.replacementIndex,
			lane: 'control',
			scored: invalidReason === null,
			infrastructureInvalidReason: invalidReason,
			startedAt,
			latencyMs: Math.round(
				turns.reduce((total, turn) => total + (turn.timing.totalDurationMs ?? 0), 0)
			),
			completed: turns.every((turn) => turn.completed),
			finishedReason: finalTurn.finishedReason,
			errors,
			usage,
			modelCostUsd: usage.totalCostUsd,
			toolCostUsd,
			totalCostUsd: usage.totalCostUsd + toolCostUsd,
			toolExecutions: executions.map((execution) => ({
				name: execution.tool_name,
				op: execution.gateway_op,
				success: execution.success
			})),
			evidence,
			machineScore,
			silentCaps: caps,
			assistantText: finalTurn.assistantText,
			turnCount: turns.length,
			transcript: turns.flatMap((turn, index) => [
				{
					role: 'user' as const,
					content: index === 0 ? params.cell.requestText : OPEN_BRIEF_BLOCKED_FOLLOWUP
				},
				{ role: 'assistant' as const, content: turn.assistantText }
			])
		};
	} finally {
		try {
			await teardownChatSession(context.db.admin, context.db.userId, sessionId);
		} finally {
			await teardownProject(context.db, seed.projectId);
		}
	}
}

function writeReport(): void {
	writeFileSync(
		OUTPUT_PATH,
		`${JSON.stringify(
			{
				schema_version: 1,
				corpus_version: corpus.corpus_version,
				lane: 'production-v2-control',
				generated_at: new Date().toISOString(),
				expected_model_pin: EXPECTED_MODEL,
				runs: attempts
			},
			null,
			2
		)}\n`,
		'utf8'
	);
}

controlDescribe('Open-brief cohort 1 — production v2 control lane (paid)', () => {
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
		writeReport();
		if (ctx) await sweepOrphanProjects(ctx.db);
	});

	it(
		'runs the pre-registered control cells with one symmetric replacement for infra-invalid attempts',
		{ retry: 0, timeout: 3_600_000 },
		async () => {
			const readiness = inspectOpenBriefCorpusReadiness(corpus);
			if (!readiness.scoringReady) {
				throw new Error(
					`[open-brief-control] corpus is not score-ready; refusing paid execution: ${readiness.reasons.join(' ')}`
				);
			}
			const cells = buildOpenBriefCorpusCells(corpus);
			const plan = buildOpenBriefCohort1RunPlan(cells).filter(
				(run) => run.lane === 'control'
			);
			expect(plan).toHaveLength(12);

			for (const planned of plan) {
				const cell = cells.find((candidate) => candidate.cellId === planned.cellId)!;
				const first = await executeAttempt({
					cell,
					runIndex: planned.runIndex,
					replacementIndex: 0
				});
				attempts.push(first);
				writeReport();
				if (!first.scored) {
					for (
						let replacementIndex = 1;
						replacementIndex <= OPEN_BRIEF_COHORT1_MAX_REPLACEMENTS_PER_RUN;
						replacementIndex += 1
					) {
						const replacement = await executeAttempt({
							cell,
							runIndex: planned.runIndex,
							replacementIndex
						});
						attempts.push(replacement);
						writeReport();
						if (replacement.scored) break;
					}
				}
			}
		}
	);
});
