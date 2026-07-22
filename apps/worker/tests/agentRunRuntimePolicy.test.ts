// apps/worker/tests/agentRunRuntimePolicy.test.ts
import { describe, expect, it } from 'vitest';
import {
	classifyAgentRunTokenUsage,
	estimateAgentRunPromptTokens,
	renderDeepResearchFinalizationContext,
	renderDeepResearchInterruptedAnswer,
	renderDeepResearchWorkingContext,
	resolveAgentRunHardTokenLimit,
	resolveAgentRunTokenPlan,
	sanitizeAgentRunTelemetryJson
} from '../src/workers/agent-run/agentRunRuntimePolicy';

describe('deep-research token policy', () => {
	it('treats 20k as a soft target with a modest 22k hard ceiling', () => {
		expect(resolveAgentRunHardTokenLimit(20_000, true)).toBe(22_000);
		expect(resolveAgentRunHardTokenLimit(20_000, false)).toBe(20_000);
		expect(resolveAgentRunHardTokenLimit(undefined, true)).toBeUndefined();
	});

	it('allows early research turns but preserves room for final evidence', () => {
		const early = resolveAgentRunTokenPlan({
			maxTokens: 20_000,
			tokensUsed: 0,
			isResearchEvidenceChild: true,
			toolCallBudgetReached: false,
			systemPrompt: 'system '.repeat(200),
			normalUserPrompt: 'research next',
			finalUserPrompt: 'submit the evidence packet'
		});
		expect(early.forceSubmitResult).toBe(false);
		expect(early.maxOutputTokens).toBe(2_048);

		const nearLimit = resolveAgentRunTokenPlan({
			maxTokens: 20_000,
			tokensUsed: 9_000,
			isResearchEvidenceChild: true,
			toolCallBudgetReached: false,
			systemPrompt: 'system '.repeat(200),
			normalUserPrompt: 'source material '.repeat(1_200),
			finalUserPrompt: 'verified source material '.repeat(900)
		});
		expect(nearLimit.forceSubmitResult).toBe(true);
		expect(nearLimit.reason).toBe('token_headroom');
		expect(nearLimit.maxOutputTokens).toBeGreaterThanOrEqual(512);
		expect(nearLimit.maxOutputTokens).toBeLessThanOrEqual(4_096);
	});

	it('does not stop useful research just to reserve the maximum final output', () => {
		const usefulHeadroom = resolveAgentRunTokenPlan({
			maxTokens: 20_000,
			tokensUsed: 6_000,
			isResearchEvidenceChild: true,
			toolCallBudgetReached: false,
			systemPrompt: 'system '.repeat(430),
			normalUserPrompt: 'research context '.repeat(940),
			finalUserPrompt: 'verified evidence '.repeat(560)
		});

		expect(usefulHeadroom.forceSubmitResult).toBe(false);
		expect(usefulHeadroom.maxOutputTokens).toBe(2_048);
	});

	it('budgets a compact next action instead of its unused maximum output', () => {
		const plan = resolveAgentRunTokenPlan({
			maxTokens: 20_000,
			tokensUsed: 8_000,
			isResearchEvidenceChild: true,
			toolCallBudgetReached: false,
			systemPrompt: 's',
			normalUserPrompt: 'n'.repeat(14_000),
			finalUserPrompt: 'f'.repeat(18_400)
		});

		expect(plan.forceSubmitResult).toBe(false);
		expect(plan.maxOutputTokens).toBe(2_048);
	});

	it('preserves a bounded final turn for a direct deep run', () => {
		const plan = resolveAgentRunTokenPlan({
			maxTokens: 60_000,
			tokensUsed: 48_000,
			isResearchEvidenceChild: false,
			isDeepRun: true,
			toolCallBudgetReached: false,
			systemPrompt: 'system '.repeat(300),
			finalSystemPrompt: 'system plus final-only override '.repeat(300),
			normalUserPrompt: 'accumulated operation history '.repeat(700),
			finalUserPrompt: 'accumulated operation history '.repeat(700)
		});

		expect(plan.hardLimit).toBe(62_500);
		expect(plan.forceSubmitResult).toBe(true);
		expect(plan.reason).toBe('token_headroom');
		expect(plan.maxOutputTokens).toBeGreaterThanOrEqual(512);
		expect(plan.maxOutputTokens).toBeLessThanOrEqual(4_096);
	});

	it('still forces a terminal turn at the tool-call boundary', () => {
		const plan = resolveAgentRunTokenPlan({
			maxTokens: 20_000,
			tokensUsed: 2_000,
			isResearchEvidenceChild: true,
			toolCallBudgetReached: true,
			systemPrompt: 'system',
			normalUserPrompt: 'normal',
			finalUserPrompt: 'final'
		});
		expect(plan.forceSubmitResult).toBe(true);
		expect(plan.reason).toBe('tool_budget');
	});

	it('refuses to dispatch a final turn whose prompt would drastically exceed the ceiling', () => {
		const plan = resolveAgentRunTokenPlan({
			maxTokens: 20_000,
			tokensUsed: 21_500,
			isResearchEvidenceChild: true,
			toolCallBudgetReached: false,
			systemPrompt: 'system',
			normalUserPrompt: 'normal',
			finalUserPrompt: 'large final context '.repeat(1_000)
		});
		expect(plan.forceSubmitResult).toBe(true);
		expect(plan.cannotFitFinalTurn).toBe(true);
	});

	it('uses a conservative prompt estimate without the cost guard byte-for-token extreme', () => {
		const estimate = estimateAgentRunPromptTokens('a'.repeat(3_000));
		expect(estimate).toBe(1_512);
	});

	it('separates uncertain reservation units from observed token usage', () => {
		expect(
			classifyAgentRunTokenUsage({
				totalTokens: 17_000,
				costSource: 'reservation',
				billingDisposition: 'uncertain'
			})
		).toEqual({ observedTokens: 0, uncertainTokenExposure: 17_000 });
		expect(
			classifyAgentRunTokenUsage({
				totalTokens: 1_250,
				costSource: 'provider_reported',
				billingDisposition: 'settled'
			})
		).toEqual({ observedTokens: 1_250, uncertainTokenExposure: 0 });
	});
});

describe('agent-run telemetry JSON sanitation', () => {
	it('normalizes PostgreSQL-hostile strings and exotic runtime values', () => {
		const value = {
			content: 'before\u0000after',
			loneSurrogate: '\uD800',
			big: 42n,
			notFinite: Number.POSITIVE_INFINITY,
			missing: undefined
		};
		const sanitized = sanitizeAgentRunTelemetryJson(value) as Record<string, unknown>;
		expect(sanitized.content).toBe('before\uFFFDafter');
		expect(sanitized.loneSurrogate).toBe('\uFFFD');
		expect(sanitized.big).toBe('42');
		expect(sanitized.notFinite).toBeNull();
		expect(sanitized.missing).toBeNull();
		expect(() => JSON.stringify(sanitized)).not.toThrow();
	});

	it('breaks cycles instead of losing the complete tool result', () => {
		const cyclic: Record<string, unknown> = { title: 'source' };
		cyclic.self = cyclic;
		expect(sanitizeAgentRunTelemetryJson(cyclic)).toEqual({
			title: 'source',
			self: '[circular]'
		});
	});

	it('preserves hostile object keys without mutating an object prototype', () => {
		const sanitized = sanitizeAgentRunTelemetryJson(
			JSON.parse('{"__proto__":{"polluted":true}}')
		) as Record<string, unknown>;
		expect(Object.prototype.hasOwnProperty.call(sanitized, '__proto__')).toBe(true);
		expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
	});
});

describe('deep-research finalization context', () => {
	it('renders only durable source URLs when interrupted instead of a raw tool transcript', () => {
		expect(
			renderDeepResearchInterruptedAnswer({
				searchQueries: ['query'],
				searchResults: [],
				visitedSources: [
					{
						requestedUrl: 'https://example.com/start',
						finalUrl: 'https://example.com/final',
						accessedAt: '2026-07-22T12:00:00.000Z',
						content: 'private tool transcript payload'
					},
					{
						requestedUrl: 'https://example.com/duplicate',
						finalUrl: 'https://example.com/final',
						accessedAt: '2026-07-22T12:01:00.000Z',
						content: 'duplicate'
					}
				]
			})
		).toBe(
			'Research stopped before final synthesis. Verified sources collected:\n\n- https://example.com/final'
		);
		expect(
			renderDeepResearchInterruptedAnswer({
				searchQueries: [],
				searchResults: [],
				visitedSources: []
			})
		).toBe('');
	});

	it('keeps verified URLs and bounded source text for the evidence packet turn', () => {
		const rendered = renderDeepResearchFinalizationContext({
			searchQueries: ['test query'],
			searchResults: [],
			visitedSources: [
				{
					requestedUrl: 'https://example.com/start',
					finalUrl: 'https://example.com/final',
					title: 'Example',
					accessedAt: '2026-07-22T12:00:00.000Z',
					content: 'evidence '.repeat(3_000)
				}
			]
		});
		const parsed = JSON.parse(rendered);
		expect(parsed.search_queries).toEqual(['test query']);
		expect(parsed.verified_visited_sources[0].final_url).toBe('https://example.com/final');
		expect(parsed.verified_visited_sources[0].content.length).toBe(6_000);
		expect(rendered.length).toBeLessThan(7_000);
	});

	it('keeps candidate URLs while bounding the normal research-turn context', () => {
		const rendered = renderDeepResearchWorkingContext({
			searchQueries: ['test query'],
			searchResults: Array.from({ length: 15 }, (_, index) => ({
				query: 'test query',
				title: `Candidate ${index}`,
				url: `https://example.com/candidate-${index}`,
				snippet: 'candidate detail '.repeat(100)
			})),
			visitedSources: [
				{
					requestedUrl: 'https://example.com/start',
					finalUrl: 'https://example.com/final',
					accessedAt: '2026-07-22T12:00:00.000Z',
					content: 'verified evidence '.repeat(1_000)
				}
			]
		});
		const parsed = JSON.parse(rendered);
		expect(parsed.candidate_search_results).toHaveLength(12);
		expect(parsed.candidate_search_results[0].url).toBe('https://example.com/candidate-3');
		expect(parsed.candidate_search_results[0].snippet.length).toBe(350);
		expect(parsed.verified_visited_sources[0].content.length).toBe(1_500);
		expect(rendered.length).toBeLessThan(8_000);
	});
});
