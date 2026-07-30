// packages/agent-orchestrator/src/testing/harness/open-brief-report.ts
import { binomialTailProbability } from './comparison-eligibility';
import {
	compareOpenBriefDjScores,
	laneScoresForItem,
	OPEN_BRIEF_LANES,
	type OpenBriefBlindMapping,
	type OpenBriefDjItemScore,
	type OpenBriefLane
} from './open-brief-blind-packet';

export interface OpenBriefReportRun {
	cellId: string;
	runIndex: number;
	lane: OpenBriefLane;
	replacementIndex: number;
	scored: boolean;
	infrastructureInvalidReason: string | null;
	l0Passed: boolean;
	feasibilityPassed: boolean;
	groundingRatio: number | null;
	modelCostUsd: number;
	toolCostUsd: number;
	totalCostUsd: number;
	latencyMs: number;
	silentCaps: string[];
}

export interface OpenBriefLaneAggregate {
	attemptedCount: number;
	infrastructureValidCount: number;
	l0CleanCount: number;
	feasibilityPassCount: number;
	l0PassRate: number | null;
	feasibilityPassRate: number | null;
	meanGroundingRatio: number | null;
	medianGroundingRatio: number | null;
	meanModelCostUsd: number | null;
	meanAllInCostUsd: number | null;
	totalOperationalCostUsd: number;
	medianLatencyMs: number | null;
	p95LatencyMs: number | null;
	silentCapCount: number;
}

export interface OpenBriefDjLaneAggregate {
	scoredOutputCount: number;
	meanExecuteScore: number | null;
	medianExecuteScore: number | null;
	feasibilityAwarenessYesCount: number;
	feasibilityAwarenessYesRate: number | null;
}

export interface OpenBriefPairwiseReadout {
	leftLane: OpenBriefLane;
	rightLane: OpenBriefLane;
	wins: number;
	losses: number;
	ties: number;
	denominator: number;
	binomialTail: number;
}

export interface OpenBriefCohortReadout {
	byLane: Record<OpenBriefLane, OpenBriefLaneAggregate>;
	djByLane: Record<OpenBriefLane, OpenBriefDjLaneAggregate>;
	pairwise: OpenBriefPairwiseReadout[];
}

function round(value: number, places = 6): number {
	const factor = 10 ** places;
	return Math.round(value * factor) / factor;
}

function mean(values: number[]): number | null {
	return values.length > 0
		? round(values.reduce((total, value) => total + value, 0) / values.length)
		: null;
}

function percentile(values: number[], value: number): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((left, right) => left - right);
	const rank = Math.max(1, Math.ceil(value * sorted.length));
	return sorted[Math.min(rank - 1, sorted.length - 1)] ?? null;
}

function aggregateLaneRuns(runs: OpenBriefReportRun[]): OpenBriefLaneAggregate {
	const valid = runs.filter((run) => run.scored && run.infrastructureInvalidReason === null);
	const grounding = valid
		.map((run) => run.groundingRatio)
		.filter((value): value is number => value !== null);
	return {
		attemptedCount: runs.length,
		infrastructureValidCount: valid.length,
		l0CleanCount: valid.filter((run) => run.l0Passed).length,
		feasibilityPassCount: valid.filter((run) => run.feasibilityPassed).length,
		l0PassRate:
			valid.length > 0
				? round(valid.filter((run) => run.l0Passed).length / valid.length)
				: null,
		feasibilityPassRate:
			valid.length > 0
				? round(valid.filter((run) => run.feasibilityPassed).length / valid.length)
				: null,
		meanGroundingRatio: mean(grounding),
		medianGroundingRatio: percentile(grounding, 0.5),
		meanModelCostUsd: mean(valid.map((run) => run.modelCostUsd)),
		meanAllInCostUsd: mean(valid.map((run) => run.totalCostUsd)),
		totalOperationalCostUsd: round(runs.reduce((total, run) => total + run.totalCostUsd, 0)),
		medianLatencyMs: percentile(
			valid.map((run) => run.latencyMs),
			0.5
		),
		p95LatencyMs: percentile(
			valid.map((run) => run.latencyMs),
			0.95
		),
		silentCapCount: runs.reduce((total, run) => total + run.silentCaps.length, 0)
	};
}

const PAIRWISE_CONTRASTS: Array<[OpenBriefLane, OpenBriefLane]> = [
	['workflow', 'control'],
	['workflow', 'single_strong_agent'],
	['single_strong_agent', 'control']
];

export function buildOpenBriefCohortReadout(params: {
	runs: OpenBriefReportRun[];
	mappings: OpenBriefBlindMapping[];
	djScores: OpenBriefDjItemScore[];
}): OpenBriefCohortReadout {
	const byLane = Object.fromEntries(
		OPEN_BRIEF_LANES.map((lane) => [
			lane,
			aggregateLaneRuns(params.runs.filter((run) => run.lane === lane))
		])
	) as Record<OpenBriefLane, OpenBriefLaneAggregate>;

	const mappingById = new Map(params.mappings.map((mapping) => [mapping.itemId, mapping]));
	if (mappingById.size !== params.mappings.length)
		throw new Error('Blind mapping item IDs must be unique');
	if (new Set(params.djScores.map((score) => score.item_id)).size !== params.djScores.length) {
		throw new Error('DJ score item IDs must be unique');
	}
	const scoredItems = params.djScores.map((score) => {
		const mapping = mappingById.get(score.item_id);
		if (!mapping) throw new Error(`No blind mapping exists for DJ score ${score.item_id}`);
		return { mapping, scores: laneScoresForItem({ mapping, score }) };
	});

	const djByLane = Object.fromEntries(
		OPEN_BRIEF_LANES.map((lane) => {
			const scores = scoredItems.map((item) => item.scores[lane]);
			const awarenessCount = scores.filter((score) => score.knew_whether_executable).length;
			return [
				lane,
				{
					scoredOutputCount: scores.length,
					meanExecuteScore: mean(scores.map((score) => score.would_you_execute)),
					medianExecuteScore: percentile(
						scores.map((score) => score.would_you_execute),
						0.5
					),
					feasibilityAwarenessYesCount: awarenessCount,
					feasibilityAwarenessYesRate:
						scores.length > 0 ? round(awarenessCount / scores.length) : null
				}
			];
		})
	) as Record<OpenBriefLane, OpenBriefDjLaneAggregate>;

	const pairwise = PAIRWISE_CONTRASTS.map(([leftLane, rightLane]) => {
		let wins = 0;
		let losses = 0;
		let ties = 0;
		for (const item of scoredItems) {
			const result = compareOpenBriefDjScores(item.scores[leftLane], item.scores[rightLane]);
			if (result === 'left') wins += 1;
			else if (result === 'right') losses += 1;
			else ties += 1;
		}
		const denominator = wins + losses + ties;
		return {
			leftLane,
			rightLane,
			wins,
			losses,
			ties,
			denominator,
			binomialTail: round(binomialTailProbability(wins, denominator))
		};
	});

	return { byLane, djByLane, pairwise };
}
