// packages/agent-orchestrator/src/testing/harness/open-brief-cohort-plan.test.ts
import { describe, expect, it } from 'vitest';

import type { OpenBriefCorpusCell } from './open-brief-corpus';
import {
	buildOpenBriefCohort1RunPlan,
	OPEN_BRIEF_COHORT1_OUTPUT_COUNT,
	OPEN_BRIEF_COHORT1_REPETITIONS_BY_CELL,
	OPEN_BRIEF_COHORT1_TRIPLET_COUNT
} from './open-brief-cohort-plan';

function cells(): OpenBriefCorpusCell[] {
	return Object.keys(OPEN_BRIEF_COHORT1_REPETITIONS_BY_CELL).map((cellId) => {
		const [briefId, snapshotId] = cellId.split('__');
		return {
			cellId,
			briefId: briefId!,
			snapshotId: snapshotId!,
			requestText: `Request ${briefId}`,
			clarificationLabel: briefId === 'ob-05-underspecified' ? 'blocked' : 'proceedable',
			isSwapTestAnchor: briefId === 'ob-04-four-week-plan'
		};
	});
}

describe('open-brief cohort-1 pre-registered run plan', () => {
	it('budgets 12 three-lane triplets / 36 unique outputs', () => {
		const plan = buildOpenBriefCohort1RunPlan(cells());
		expect(OPEN_BRIEF_COHORT1_TRIPLET_COUNT).toBe(12);
		expect(OPEN_BRIEF_COHORT1_OUTPUT_COUNT).toBe(36);
		expect(plan).toHaveLength(36);
	});

	it('replicates only the two swap-anchor cells three times', () => {
		const plan = buildOpenBriefCohort1RunPlan(cells());
		const triplets = new Set(plan.map((run) => `${run.cellId}-r${run.runIndex}`));
		expect(triplets).toHaveLength(12);
		for (const cell of cells()) {
			const runIndexes = new Set(
				plan.filter((run) => run.cellId === cell.cellId).map((run) => run.runIndex)
			);
			expect(runIndexes.size).toBe(cell.isSwapTestAnchor ? 3 : 1);
		}
	});

	it('refuses corpus drift after pre-registration', () => {
		expect(() => buildOpenBriefCohort1RunPlan(cells().slice(1))).toThrow('Missing:');
		expect(() =>
			buildOpenBriefCohort1RunPlan([
				...cells(),
				{
					...cells()[0]!,
					cellId: 'post-hoc-cell__project-beta'
				}
			])
		).toThrow('Unexpected:');
	});
});
