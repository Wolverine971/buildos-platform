// packages/agent-orchestrator/src/testing/harness/open-brief-report.test.ts
import { describe, expect, it } from 'vitest';

import {
	createOpenBriefBlindMapping,
	type OpenBriefDjItemScore,
	OPEN_BRIEF_LANES
} from './open-brief-blind-packet';
import { buildOpenBriefCohortReadout, type OpenBriefReportRun } from './open-brief-report';

function reportRuns(): OpenBriefReportRun[] {
	return OPEN_BRIEF_LANES.flatMap((lane, laneIndex) =>
		[1, 2].map((runIndex) => ({
			cellId: 'plan-alpha',
			runIndex,
			lane,
			replacementIndex: 0,
			scored: true,
			infrastructureInvalidReason: null,
			l0Passed: lane !== 'control' || runIndex !== 2,
			feasibilityPassed: lane === 'workflow',
			groundingRatio: 0.7 + laneIndex * 0.1,
			modelCostUsd: 0.01 + laneIndex * 0.01,
			toolCostUsd: 0.005,
			totalCostUsd: 0.015 + laneIndex * 0.01,
			latencyMs: 1_000 + laneIndex * 100 + runIndex,
			silentCaps: runIndex === 2 ? ['max tokens'] : []
		}))
	);
}

describe('open-brief cohort readout', () => {
	it('reports model-only and all-in cost separately with process and feasibility rates', () => {
		const readout = buildOpenBriefCohortReadout({
			runs: reportRuns(),
			mappings: [],
			djScores: []
		});
		expect(readout.byLane.control).toMatchObject({
			attemptedCount: 2,
			infrastructureValidCount: 2,
			l0CleanCount: 1,
			l0PassRate: 0.5,
			meanModelCostUsd: 0.01,
			meanAllInCostUsd: 0.015,
			silentCapCount: 1
		});
		expect(readout.byLane.workflow.feasibilityPassRate).toBe(1);
	});

	it('reveals counterbalanced scores, applies the feasibility tie-break, and prints binomial tails', () => {
		const mappings = [1, 2].map((runIndex) =>
			createOpenBriefBlindMapping({
				corpusVersion: 'open-brief-v1',
				cellIds: ['plan-alpha'],
				cellId: 'plan-alpha',
				runIndex
			})
		);
		const djScores: OpenBriefDjItemScore[] = mappings.map((mapping, index) => {
			const scoreByLane = {
				workflow: {
					would_you_execute: 3,
					knew_whether_executable: true,
					what_is_missing: ''
				},
				control: {
					would_you_execute: index === 0 ? 3 : 4,
					knew_whether_executable: false,
					what_is_missing: ''
				},
				single_strong_agent: {
					would_you_execute: 2,
					knew_whether_executable: true,
					what_is_missing: ''
				}
			} as const;
			return {
				item_id: mapping.itemId,
				scores: {
					A: scoreByLane[mapping.laneBySlot.A],
					B: scoreByLane[mapping.laneBySlot.B],
					C: scoreByLane[mapping.laneBySlot.C]
				}
			};
		});
		const readout = buildOpenBriefCohortReadout({ runs: reportRuns(), mappings, djScores });
		const workflowVsControl = readout.pairwise.find(
			(pair) => pair.leftLane === 'workflow' && pair.rightLane === 'control'
		)!;
		expect(workflowVsControl).toMatchObject({ wins: 1, losses: 1, ties: 0, denominator: 2 });
		expect(workflowVsControl.binomialTail).toBe(0.75);
		expect(readout.djByLane.workflow).toMatchObject({
			meanExecuteScore: 3,
			feasibilityAwarenessYesRate: 1
		});
	});

	it('rejects scores that do not belong to the sealed mapping packet', () => {
		expect(() =>
			buildOpenBriefCohortReadout({
				runs: [],
				mappings: [],
				djScores: [
					{
						item_id: 'unknown',
						scores: {
							A: {
								would_you_execute: 1,
								knew_whether_executable: false,
								what_is_missing: ''
							},
							B: {
								would_you_execute: 1,
								knew_whether_executable: false,
								what_is_missing: ''
							},
							C: {
								would_you_execute: 1,
								knew_whether_executable: false,
								what_is_missing: ''
							}
						}
					}
				]
			})
		).toThrow('No blind mapping exists');
	});
});
