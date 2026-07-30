// packages/agent-orchestrator/src/testing/harness/open-brief-cohort-plan.ts
import type { OpenBriefCorpusCell } from './open-brief-corpus';
import { OPEN_BRIEF_LANES, type OpenBriefLane } from './open-brief-blind-packet';

export const OPEN_BRIEF_COHORT1_REPETITIONS_BY_CELL = {
	'ob-01-marketing-plan__project-beta': 1,
	'ob-02-whats-blocking__project-alpha': 1,
	'ob-02-whats-blocking__project-beta': 1,
	'ob-03-domain-research__project-alpha': 1,
	'ob-03-domain-research__project-beta': 1,
	'ob-04-four-week-plan__project-alpha': 3,
	'ob-04-four-week-plan__project-beta': 3,
	'ob-05-underspecified__project-beta-no-direction': 1
} as const;

export const OPEN_BRIEF_COHORT1_TRIPLET_COUNT = 12;
export const OPEN_BRIEF_COHORT1_OUTPUT_COUNT =
	OPEN_BRIEF_COHORT1_TRIPLET_COUNT * OPEN_BRIEF_LANES.length;
export const OPEN_BRIEF_COHORT1_MAX_REPLACEMENTS_PER_RUN = 1;
export const OPEN_BRIEF_BLOCKED_FOLLOWUP =
	'use your best judgment based on the project context, but tell me what you are assuming and do not pretend you have more direction than you do';

export interface OpenBriefCohortPlannedRun {
	cellId: string;
	briefId: string;
	snapshotId: string;
	runIndex: number;
	lane: OpenBriefLane;
}

export function buildOpenBriefCohort1RunPlan(
	cells: OpenBriefCorpusCell[]
): OpenBriefCohortPlannedRun[] {
	const suppliedIds = new Set(cells.map((cell) => cell.cellId));
	const plannedIds = Object.keys(OPEN_BRIEF_COHORT1_REPETITIONS_BY_CELL);
	const missing = plannedIds.filter((cellId) => !suppliedIds.has(cellId));
	const unexpected = cells
		.map((cell) => cell.cellId)
		.filter((cellId) => !plannedIds.includes(cellId));
	if (missing.length > 0 || unexpected.length > 0) {
		throw new Error(
			`Cohort-1 cells do not match the pre-registration. Missing: ${missing.join(', ') || 'none'}. Unexpected: ${unexpected.join(', ') || 'none'}.`
		);
	}

	return cells.flatMap((cell) => {
		const repetitions =
			OPEN_BRIEF_COHORT1_REPETITIONS_BY_CELL[
				cell.cellId as keyof typeof OPEN_BRIEF_COHORT1_REPETITIONS_BY_CELL
			];
		return Array.from({ length: repetitions }, (_, index) => index + 1).flatMap((runIndex) =>
			OPEN_BRIEF_LANES.map((lane) => ({
				cellId: cell.cellId,
				briefId: cell.briefId,
				snapshotId: cell.snapshotId,
				runIndex,
				lane
			}))
		);
	});
}
