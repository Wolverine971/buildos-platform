// scripts/agentic/continuation-reasoning-metrics.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	type PassRow,
	buildVariantReport,
	classifyPass,
	distribution,
	renderReport,
	replayUptake
} from './continuation-reasoning-metrics';

function pass(overrides: Partial<PassRow>): PassRow {
	return {
		turnKey: 'turn-1',
		passRole: 'acting',
		logicalProviderRound: 1,
		providerAttempt: 1,
		startedAtMs: 0,
		completedAtMs: 1_000,
		responseTimeMs: 1_000,
		promptTokens: 1_000,
		cachedPromptTokens: 0,
		completionTokens: 100,
		reasoningTokens: 50,
		costUsd: 0.001,
		status: 'success',
		modelUsed: 'deepseek/deepseek-v4.1-flash',
		...overrides
	};
}

test('classifies opening vs continuation acting passes by logical round', () => {
	assert.equal(classifyPass({ passRole: 'acting', logicalProviderRound: 1 }), 'opening');
	assert.equal(classifyPass({ passRole: 'acting', logicalProviderRound: 3 }), 'continuation');
	assert.equal(classifyPass({ passRole: 'repair', logicalProviderRound: 4 }), 'repair');
	assert.equal(classifyPass({ passRole: 'final_response', logicalProviderRound: 5 }), 'final');
	assert.equal(classifyPass({ passRole: 'mutation_review', logicalProviderRound: 2 }), 'review');
	assert.equal(
		classifyPass({ passRole: 'tool_selection', logicalProviderRound: null }),
		'tool_selection'
	);
	assert.equal(classifyPass({ passRole: null, logicalProviderRound: null }), 'other');
});

test('distribution uses nearest-rank percentiles', () => {
	assert.deepEqual(distribution([]), { n: 0, mean: null, p50: null, p90: null });
	assert.deepEqual(distribution([5, 1, 3, 2, 4, 6, 7, 8, 9, 10]), {
		n: 10,
		mean: 5.5,
		p50: 5,
		p90: 9
	});
});

test('builds per-turn totals and continuation prompt growth over the previous acting pass', () => {
	const rows = [
		pass({ startedAtMs: 0, promptTokens: 1_000, reasoningTokens: 300 }),
		pass({
			passRole: 'mutation_review',
			logicalProviderRound: 1,
			startedAtMs: 1_500,
			reasoningTokens: 0,
			costUsd: 0.002
		}),
		pass({
			logicalProviderRound: 2,
			startedAtMs: 3_000,
			completedAtMs: 5_000,
			responseTimeMs: 2_000,
			promptTokens: 1_800,
			cachedPromptTokens: 900,
			reasoningTokens: 0
		}),
		pass({
			turnKey: 'turn-2',
			startedAtMs: 10_000,
			completedAtMs: 11_000,
			reasoningTokens: 100
		}),
		pass({ turnKey: 'turn-2', logicalProviderRound: 2, status: 'failure', startedAtMs: 12_000 })
	];
	const report = buildVariantReport({
		label: 'replay',
		sources: ['test'],
		rows,
		wallMsByTurn: new Map([['turn-1', 6_000]]),
		quality: { totalScore: 50, maxScore: 52, percent: 96.2 }
	});
	assert.equal(report.turns, 2);
	assert.equal(report.byClass.opening.passes, 2);
	assert.equal(report.byClass.continuation.passes, 2);
	assert.equal(report.byClass.continuation.failures, 1);
	assert.equal(report.byClass.continuation.zeroReasoningPasses, 1);
	assert.equal(report.byClass.continuation.cachedPromptShare, 0.5);
	assert.equal(report.byClass.review.passes, 1);
	// Per-turn totals include failed attempts (they spent time): turn 1 = 300 + 0,
	// turn 2 = 100 + 50 from its failed continuation. Turn 1 spans 0 → 5,000 ms.
	assert.deepEqual(report.perTurn.actingReasoningTokens, { n: 2, mean: 225, p50: 150, p90: 300 });
	assert.equal(report.perTurn.llmSpanMs.p90, 5_000);
	assert.deepEqual(report.perTurn.wallMs, { n: 1, mean: 6_000, p50: 6_000, p90: 6_000 });
	// Only turn 1's successful continuation counts: 1,800 − 1,000, after 300 reasoning.
	assert.deepEqual(report.promptGrowth.growthTokens, { n: 1, mean: 800, p50: 800, p90: 800 });
	assert.deepEqual(report.promptGrowth.priorReasoningTokens, {
		n: 1,
		mean: 300,
		p50: 300,
		p90: 300
	});
	assert.ok(Math.abs(report.costUsd.total - 0.006) < 1e-12);
	assert.ok(Math.abs(report.costUsd.acting - 0.004) < 1e-12);
});

test('replay uptake compares prompt growth to a baseline, scaled by prior reasoning', () => {
	const make = (growth: number, prior: number) =>
		buildVariantReport({
			label: 'x',
			sources: [],
			rows: [
				pass({ startedAtMs: 0, promptTokens: 1_000, reasoningTokens: prior }),
				pass({ logicalProviderRound: 2, startedAtMs: 2_000, promptTokens: 1_000 + growth })
			]
		});
	assert.equal(replayUptake(make(900, 400), make(500, 400)), 1);
	assert.equal(replayUptake(make(500, 400), make(500, 400)), 0);
	assert.equal(replayUptake(make(500, 0), make(500, 0)), null);
	const text = renderReport([make(500, 400), make(900, 400)]);
	assert.match(text, /replay uptake/);
	assert.match(text, /Against x:/);
});
