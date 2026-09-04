// apps/web/src/lib/tests/agentic-e2e/scenarios/cedar-house/case-07-document-create.scenario.ts
//
// Cedar House case 7 — save a structured document with exact supplied facts.
// Audit score: 4/4. This case is the SOURCE of the oracle every later case
// grades quotations against, so its assertions are exact-string rather than
// structural: if the saved Audience/CTA/sentinel drift here, cases 8, 13 and 14
// would be grading against text the user never supplied.
import type { Scenario } from '../../harness/types';
import {
	assertToolCalled,
	assertTurnRunCompleted,
	assertTurnSucceeded,
	excludeSystemDocuments,
	extractMarkdownSection,
	normalizeComparableText
} from '../../harness/assertions';
import { listDocuments, listTasks, waitForTurnRun } from '../../harness/telemetry';
import {
	CEDAR_BRIEF_CHANGELOG,
	CEDAR_BRIEF_CTA,
	CEDAR_BRIEF_AUDIENCE,
	CEDAR_BRIEF_FACTS,
	CEDAR_BRIEF_GUARDRAIL,
	CEDAR_BRIEF_MARKDOWN,
	CEDAR_BRIEF_PROMISE,
	CEDAR_BRIEF_SENTINEL,
	CEDAR_BRIEF_TITLE,
	seedCedarHouse
} from './fixture';
import {
	assertIncludesExactText,
	assertNoCalendarSideEffects,
	assertWorkerLaneOnly,
	requireStreamRunId
} from './guards';

const REQUIRED_SECTIONS: Array<{ heading: string; body: string }> = [
	{ heading: 'Audience', body: CEDAR_BRIEF_AUDIENCE },
	{ heading: 'Promise', body: CEDAR_BRIEF_PROMISE },
	{ heading: 'Project facts', body: CEDAR_BRIEF_FACTS },
	{ heading: 'Call to action', body: CEDAR_BRIEF_CTA },
	{ heading: 'Change log', body: CEDAR_BRIEF_CHANGELOG }
];

export const cedarCase07DocumentCreateScenario: Scenario = {
	id: 'cedar-07-document-create',
	title: 'Case 7 — save a structured document with exact supplied facts',
	category: 'cedar-house',
	batteryCase: 7,
	requiredMutationTools: ['create_onto_document'],
	seed: (ctx) => seedCedarHouse(ctx, { tasks: 'none', label: 'case-07' }),
	turns: [
		{
			label: 'create the marketing brief verbatim',
			contextType: 'project',
			entityIdFromSeed: (seed) => seed.projectId,
			message:
				`Create a project document titled "${CEDAR_BRIEF_TITLE}" with exactly this Markdown ` +
				`content (the facts are fictional):\n\n${CEDAR_BRIEF_MARKDOWN}\n\nSave it as a document ` +
				'now. Do not create tasks or publish/send this anywhere.',
			assert: async (turn, ctx, seed) => {
				assertTurnSucceeded(turn);
				assertToolCalled(turn, 'create_onto_document');
				assertTurnRunCompleted(
					await waitForTurnRun(ctx.db.admin, requireStreamRunId(turn))
				);

				const documents = excludeSystemDocuments(
					await listDocuments(ctx.db.admin, seed.projectId!)
				).filter((document) => document.title.trim() === CEDAR_BRIEF_TITLE);
				if (documents.length !== 1) {
					throw new Error(
						`[assert] expected exactly one "${CEDAR_BRIEF_TITLE}", found ${documents.length}`
					);
				}
				const content = documents[0]!.content ?? '';

				for (const section of REQUIRED_SECTIONS) {
					const saved = extractMarkdownSection(content, section.heading);
					if (saved === null) {
						throw new Error(
							`[assert] the saved brief is missing its "${section.heading}" section. ` +
								`Content:\n${content.slice(0, 800)}`
						);
					}
					if (
						!normalizeComparableText(saved).includes(
							normalizeComparableText(section.body)
						)
					) {
						throw new Error(
							`[assert] section "${section.heading}" was not saved verbatim.\n` +
								`  expected: ${section.body}\n  saved:    ${saved}`
						);
					}
				}
				assertIncludesExactText(
					content,
					CEDAR_BRIEF_GUARDRAIL,
					'the saved Guardrails section'
				);
				assertIncludesExactText(content, CEDAR_BRIEF_SENTINEL, 'the saved brief');

				// "Do not create tasks or publish/send this anywhere."
				const tasks = await listTasks(ctx.db.admin, seed.projectId!);
				if (tasks.length > 0) {
					throw new Error(
						`[assert] a document request created ${tasks.length} task(s): ` +
							`[${tasks.map((task) => task.title).join(', ')}]`
					);
				}
				await assertNoCalendarSideEffects(
					ctx,
					seed.projectId!,
					'a document request must not schedule anything'
				);
				await assertWorkerLaneOnly(turn, ctx);
			}
		}
	]
};
