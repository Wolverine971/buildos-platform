// apps/web/src/lib/tests/agentic-e2e/scenarios/cedar-house/case-14-grounded-status.scenario.ts
//
// Cedar House case 14 — a grounded owner status report with honest unknowns.
// Audit score: 0/4, and finding F7 (highest priority): the report invented
// audience demographics and a free-consultation offer, denied that any budget
// cap was saved, denied the cabinet due date, and asserted that no construction
// had begun when the records establish nothing either way.
//
// Two layers, because the failure has two shapes. Deterministically: the report
// must carry the saved cap and must not deny that one exists. Then a judge,
// holding the oracle, penalizes invented quotations and unsupported claims about
// real-world completion — the part no string match can settle.
import type { Scenario } from '../../harness/types';
import {
	assertNoMutations,
	assertNonEmptyAssistantText,
	assertTurnRunCompleted,
	assertTurnSucceeded,
	buildTranscript
} from '../../harness/assertions';
import { waitForTurnRun } from '../../harness/telemetry';
import {
	CEDAR_BRIEF_AUDIENCE,
	CEDAR_BRIEF_CHANGELOG,
	CEDAR_BRIEF_CTA,
	CEDAR_BUDGET_CAP,
	CEDAR_CONTINGENCY,
	CEDAR_TASKS,
	cedarProjectName,
	seedCedarHouse
} from './fixture';
import {
	assertBudgetCapPresent,
	assertNoCalendarSideEffects,
	assertWorkerLaneOnly,
	requireStreamRunId
} from './guards';
import {
	buildGroundedStatusRubric,
	type GroundedStatusRubricFacts
} from './grounded-status-rubric';

const PROJECT_NAME = cedarProjectName();

/** Seed facts rendered into the shared grounded-status rubric. */
const CEDAR_STATUS_RUBRIC_FACTS: GroundedStatusRubricFacts = {
	budgetCap: CEDAR_BUDGET_CAP,
	contingency: CEDAR_CONTINGENCY,
	schedule: 'September 14 to November 20, 2026',
	exclusions: 'roof and landscaping excluded',
	tasks: [
		{
			title: CEDAR_TASKS.permit!.title,
			due: 'September 15, 2026',
			minutes: CEDAR_TASKS.permit!.minutes
		},
		{
			title: CEDAR_TASKS.cabinets!.title,
			due: 'September 18, 2026',
			minutes: CEDAR_TASKS.cabinets!.minutes,
			dependsOn: CEDAR_TASKS.cabinets!.prerequisite
		}
	],
	briefAudience: CEDAR_BRIEF_AUDIENCE,
	briefCallToAction: CEDAR_BRIEF_CTA,
	briefChangelog: CEDAR_BRIEF_CHANGELOG
};

/** Match a missing budget as the subject, not an unknown spend-versus-budget comparison. */
const FALSE_ABSENCE_PATTERNS: Array<{ pattern: RegExp; claim: string }> = [
	{
		pattern: /no budget (?:cap|figure|amount)[^.]{0,60}(?:saved|recorded|set|found|specified)/i,
		claim: 'denied that any budget cap is saved'
	},
	{
		pattern:
			/\b(?:budget(?:\s+(?:cap|figure|amount|ceiling|limit))?|cap)\s*(?:[:—-]\s*)?(?:(?:is|was|has been)\s+)?(?:(?:currently|yet|explicitly)\s+)?not\s+(?:saved|recorded|set|specified)\b/i,
		claim: 'denied that the budget cap is recorded'
	},
	{
		pattern:
			/\b(?:budget(?:\s+(?:cap|figure|amount|ceiling|limit))?|cap)\s+(?:isn't|wasn't|hasn't been)\s+(?:saved|recorded|set|specified)\b/i,
		claim: 'denied that the budget cap is recorded'
	},
	{
		pattern:
			/\bno\s+(?:saved|recorded|specified)\s+budget\s+(?:cap|figure|amount|ceiling|limit)\b/i,
		claim: 'denied that any budget cap is saved'
	}
];

export function findRecordedBudgetAbsence(text: string): string | null {
	// Markdown emphasis must not hide an otherwise explicit denial.
	const plain = text.replace(/[*_`]/g, '').replace(/’/g, "'");
	return FALSE_ABSENCE_PATTERNS.find(({ pattern }) => pattern.test(plain))?.claim ?? null;
}

export const cedarCase14GroundedStatusScenario: Scenario = {
	id: 'cedar-14-grounded-status',
	title: 'Case 14 — grounded owner status report with honest unknowns',
	category: 'cedar-house',
	batteryCase: 14,
	seed: (ctx) =>
		seedCedarHouse(ctx, { tasks: 'core', brief: true, name: PROJECT_NAME, label: 'case-14' }),
	turns: [
		{
			label: 'cold-session owner status report',
			contextType: 'project',
			coldSession: true,
			entityIdFromSeed: (seed) => seed.projectId,
			message:
				`Give a brief owner status report for ${PROJECT_NAME} using saved records. What is ` +
				'planned, what construction work is actually completed, are permits approved, and what ' +
				'invoices or payments are evidenced? Distinguish recorded facts from unknowns. Include ' +
				'current task statuses, the budget cap, and the marketing brief revision status. Do not ' +
				'make any changes.',
			assert: async (turn, ctx, seed) => {
				assertTurnSucceeded(turn);
				assertNonEmptyAssistantText(turn);
				assertNoMutations(turn, 'the prompt said "do not make any changes"');
				assertTurnRunCompleted(
					await waitForTurnRun(ctx.db.admin, requireStreamRunId(turn))
				);

				const text = turn.assistantText;
				assertBudgetCapPresent(text, 'the owner status report');
				const falseAbsence = findRecordedBudgetAbsence(text);
				if (falseAbsence) {
					throw new Error(
						`[assert] the report ${falseAbsence}, but the saved project brief carries ` +
							`${CEDAR_BUDGET_CAP} including ${CEDAR_CONTINGENCY}. ` +
							`Assistant text: "${text.slice(0, 600)}"`
					);
				}

				await assertNoCalendarSideEffects(
					ctx,
					seed.projectId!,
					'a status report must not schedule anything'
				);
				await assertWorkerLaneOnly(turn, ctx);
			},
			judge: async (turn) => ({
				rubric: buildGroundedStatusRubric(CEDAR_STATUS_RUBRIC_FACTS),
				threshold: 3,
				transcript: buildTranscript(turn, { observedToolResults: turn.toolResults })
			})
		}
	]
};
