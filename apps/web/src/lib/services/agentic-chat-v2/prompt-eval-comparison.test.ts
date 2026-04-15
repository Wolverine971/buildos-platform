// apps/web/src/lib/services/agentic-chat-v2/prompt-eval-comparison.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildPromptEvalVariantComparison,
	formatPromptEvalVariantDecisionNote,
	normalizePromptEvalEvidenceVariant,
	readPromptEvalAssertionCounts
} from './prompt-eval-comparison';

describe('prompt eval comparison', () => {
	it('groups paired v2 and lite evidence by scenario and renders decision counts', () => {
		const report = buildPromptEvalVariantComparison([
			{
				scenarioSlug: 'project.named_status',
				turnRunId: 'run-v2',
				promptVariant: 'fastchat_prompt_v1',
				status: 'completed',
				evalStatus: 'passed',
				assertionCounts: { passed: 6, failed: 0 },
				validationFailureCount: 0,
				toolRoundCount: 1,
				toolCallCount: 1,
				llmPassCount: 1,
				promptTokens: 2100,
				completedAt: '2026-04-14T12:00:00.000Z'
			},
			{
				scenarioSlug: 'project.named_status',
				turnRunId: 'run-lite',
				promptVariant: 'lite_seed_v1',
				status: 'completed',
				evalStatus: 'passed',
				assertionCounts: { passed: 6, failed: 0 },
				validationFailureCount: 0,
				toolRoundCount: 1,
				toolCallCount: 1,
				llmPassCount: 1,
				promptTokens: 900,
				completedAt: '2026-04-14T12:01:00.000Z'
			},
			{
				scenarioSlug: 'calendar.read.tomorrow',
				turnRunId: 'run-lite-calendar',
				promptVariant: 'lite_seed_v1',
				status: 'completed',
				evalStatus: 'failed',
				assertionCounts: { passed: 4, failed: 2 },
				validationFailureCount: 1,
				promptTokens: 840,
				completedAt: '2026-04-14T12:02:00.000Z'
			}
		]);

		expect(report.totals).toMatchObject({
			scenarioCount: 2,
			pairedScenarioCount: 1,
			missingScenarioCount: 1,
			failedScenarioCount: 1,
			candidateBetterCount: 1,
			promptTokenDeltaTotal: -1200
		});
		expect(
			report.scenarios.find((scenario) => scenario.scenarioSlug === 'project.named_status')
				?.verdict
		).toBe('lite_better');
		expect(
			report.scenarios.find((scenario) => scenario.scenarioSlug === 'project.named_status')
				?.metricDeltas.promptTokens
		).toBe(-1200);
		expect(
			report.scenarios.find((scenario) => scenario.scenarioSlug === 'calendar.read.tomorrow')
				?.missingVariants
		).toEqual(['fastchat_prompt_v1']);

		const note = formatPromptEvalVariantDecisionNote(report);
		expect(note).toContain('2 scenarios');
		expect(note).toContain('1 paired scenario');
		expect(note).toContain('1 scenario missing evidence');
		expect(note).toContain('1 scenario with failures');
		expect(note).toContain('Lite seed vs FastChat v2: better in 1');
		expect(note).toContain('Paired prompt tokens: Lite seed -1200 total');
		expect(note).toContain('calendar.read.tomorrow missing FastChat v2');
		expect(note).toContain('Failures: calendar.read.tomorrow (Lite seed)');
	});

	it('uses the newest eval evidence when a scenario has repeated runs', () => {
		const report = buildPromptEvalVariantComparison([
			{
				scenarioSlug: 'workspace.my_projects_status',
				turnRunId: 'run-lite-old',
				promptVariant: 'lite_seed_v1',
				evalStatus: 'failed',
				assertionCounts: { failed: 1 },
				promptTokens: 1000,
				completedAt: '2026-04-14T12:00:00.000Z'
			},
			{
				scenarioSlug: 'workspace.my_projects_status',
				turnRunId: 'run-v2',
				promptVariant: 'fastchat_prompt_v1',
				evalStatus: 'passed',
				assertionCounts: { failed: 0 },
				promptTokens: 2000,
				completedAt: '2026-04-14T12:01:00.000Z'
			},
			{
				scenarioSlug: 'workspace.my_projects_status',
				turnRunId: 'run-lite-new',
				promptVariant: 'lite_seed_v1',
				evalStatus: 'passed',
				assertionCounts: { failed: 0 },
				promptTokens: 880,
				completedAt: '2026-04-14T12:02:00.000Z'
			}
		]);

		expect(report.scenarios[0]?.candidate?.turnRunId).toBe('run-lite-new');
		expect(report.scenarios[0]?.failureVariants).toEqual([]);
		expect(report.scenarios[0]?.metricDeltas.promptTokens).toBe(-1120);
	});

	it('reads assertion counts and falls back from prompt variant to snapshot version', () => {
		expect(
			readPromptEvalAssertionCounts({
				assertion_counts: {
					passed: '5',
					failed: 1,
					skipped: null
				}
			})
		).toEqual({ passed: 5, failed: 1, skipped: 0 });
		expect(
			normalizePromptEvalEvidenceVariant({
				promptVariant: null,
				snapshotVersion: 'fastchat_prompt_v1'
			})
		).toBe('fastchat_prompt_v1');
	});
});
