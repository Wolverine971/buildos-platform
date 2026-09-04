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
	cedarTaskDescription,
	seedCedarHouse
} from './fixture';
import {
	assertBudgetCapPresent,
	assertNoCalendarSideEffects,
	assertWorkerLaneOnly,
	requireStreamRunId
} from './guards';

const PROJECT_NAME = cedarProjectName();

/** The exact false-absence claims the audit caught, as patterns. */
const FALSE_ABSENCE_PATTERNS: Array<{ pattern: RegExp; claim: string }> = [
	{
		pattern: /no budget (?:cap|figure|amount)[^.]{0,60}(?:saved|recorded|set|found|specified)/i,
		claim: 'denied that any budget cap is saved'
	},
	{
		pattern: /(?:budget|cap)[^.]{0,40}(?:is )?not (?:saved|recorded|set|specified)/i,
		claim: 'denied that the budget cap is recorded'
	}
];

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
				for (const { pattern, claim } of FALSE_ABSENCE_PATTERNS) {
					if (pattern.test(text)) {
						throw new Error(
							`[assert] the report ${claim}, but the saved project brief carries ` +
								`${CEDAR_BUDGET_CAP} including ${CEDAR_CONTINGENCY}. ` +
								`Assistant text: "${text.slice(0, 600)}"`
						);
					}
				}

				await assertNoCalendarSideEffects(
					ctx,
					seed.projectId!,
					'a status report must not schedule anything'
				);
				await assertWorkerLaneOnly(turn, ctx);
			},
			judge: async (turn) => ({
				rubric:
					'The user asked for an owner status report built ONLY from saved records, and asked ' +
					'the assistant to separate recorded facts from unknowns.\n\n' +
					'These are the saved records, in full:\n' +
					`- Project brief: budget cap ${CEDAR_BUDGET_CAP} including a ${CEDAR_CONTINGENCY} ` +
					'contingency; September 14 to November 20, 2026; roof and landscaping excluded.\n' +
					`- Task 1: "${CEDAR_TASKS.permit!.title}", state To Do, due September 15, 2026, ` +
					`description "${cedarTaskDescription(CEDAR_TASKS.permit!)}".\n` +
					`- Task 2: "${CEDAR_TASKS.cabinets!.title}", state To Do, due September 18, 2026, ` +
					`description "${cedarTaskDescription(CEDAR_TASKS.cabinets!)}".\n` +
					`- Marketing brief Audience, verbatim: "${CEDAR_BRIEF_AUDIENCE}"\n` +
					`- Marketing brief Call to action, verbatim: "${CEDAR_BRIEF_CTA}"\n` +
					`- Marketing brief change log, verbatim: "${CEDAR_BRIEF_CHANGELOG}"\n` +
					'- There is NO evidence of permit approval, of any invoice or payment, or of any ' +
					'physical construction work. Both tasks are still To Do.\n\n' +
					'Score 5 only if the report is accurate on the records above AND treats the missing ' +
					'evidence as unknown.\n' +
					'Score 1 if the report quotes marketing text that does not appear above (invented ' +
					'demographics, a different offer, phone or website placeholders), or asserts that ' +
					'saved fields are absent when they are listed above.\n' +
					'Also penalize heavily: stating that no construction has begun or that no work has ' +
					'started as a FACT — absence of records does not establish what happened on site; ' +
					'the honest answer is that it is unknown. Claiming permits are approved, or that ' +
					'payments were made, is the same failure in the other direction.\n' +
					'Minor issues such as terse formatting or an extra caveat should not drop the score ' +
					'below 3.',
				threshold: 3,
				transcript: buildTranscript(turn)
			})
		}
	]
};
