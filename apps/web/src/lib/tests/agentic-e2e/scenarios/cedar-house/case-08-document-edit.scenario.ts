// apps/web/src/lib/tests/agentic-e2e/scenarios/cedar-house/case-08-document-edit.scenario.ts
//
// Cedar House case 8 — change two sections and append one change-log line,
// preserving everything else and the document identity.
// Audit score: 0/4. Two attempts ended with a promise of imminent action and no
// document tool call at all, so this case is the battery's cleanest detector of
// "said it would, never did": the assertion is on the saved row, and the
// scenario also refuses a second document that would hide an in-place failure.
import type { Scenario } from '../../harness/types';
import {
	assertToolCalled,
	assertTurnRunCompleted,
	assertTurnSucceeded,
	excludeSystemDocuments,
	extractMarkdownSection,
	normalizeComparableText
} from '../../harness/assertions';
import { getDocumentById, listDocuments, waitForTurnRun } from '../../harness/telemetry';
import {
	CEDAR_BRIEF_CHANGELOG,
	CEDAR_BRIEF_FACTS,
	CEDAR_BRIEF_GUARDRAIL,
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

const REVISED_AUDIENCE =
	'First-time homeowners in the Baltimore area planning a kitchen and bathroom renovation.';
const REVISED_CTA = 'Request a free scope checklist.';
const APPENDED_CHANGELOG = '2026-09-03: Revised audience and CTA.';

function requireSection(content: string, heading: string): string {
	const section = extractMarkdownSection(content, heading);
	if (section === null) {
		throw new Error(
			`[assert] the edited brief lost its "${heading}" section. Content:\n${content.slice(0, 800)}`
		);
	}
	return section;
}

export const cedarCase08DocumentEditScenario: Scenario = {
	id: 'cedar-08-document-edit',
	title: 'Case 8 — edit two sections in place and preserve the rest',
	category: 'cedar-house',
	batteryCase: 8,
	requiredMutationTools: ['update_onto_document'],
	seed: (ctx) => seedCedarHouse(ctx, { tasks: 'none', brief: true, label: 'case-08' }),
	turns: [
		{
			label: 'bounded in-place document edit',
			contextType: 'project',
			entityIdFromSeed: (seed) => seed.projectId,
			message:
				`Update the existing "${CEDAR_BRIEF_TITLE}" in place. Change only Audience to ` +
				`"${REVISED_AUDIENCE}" Change only Call to action to "${REVISED_CTA}" Append exactly ` +
				`"${APPENDED_CHANGELOG}" to Change log. Keep the title, Promise, Project facts, ` +
				'Guardrails, PRESERVE-EXACTLY line, and original changelog entry unchanged. Do not ' +
				'create a second document.',
			assert: async (turn, ctx, seed) => {
				assertTurnSucceeded(turn);
				assertToolCalled(turn, 'update_onto_document');
				assertTurnRunCompleted(
					await waitForTurnRun(ctx.db.admin, requireStreamRunId(turn))
				);

				// Same identity — not a helpful new copy.
				const briefId = seed.entityIds.brief;
				if (!briefId) throw new Error('[assert] the seeded marketing brief id is missing');
				const named = excludeSystemDocuments(
					await listDocuments(ctx.db.admin, seed.projectId!)
				).filter((document) => document.title.trim() === CEDAR_BRIEF_TITLE);
				if (named.length !== 1 || named[0]!.id !== briefId) {
					throw new Error(
						`[assert] expected the edit to land on the single seeded brief ${briefId}; ` +
							`found ${named.length} document(s) with that title: ` +
							`[${named.map((document) => document.id).join(', ')}]`
					);
				}
				const brief = await getDocumentById(ctx.db.admin, briefId);
				if (!brief)
					throw new Error('[assert] the marketing brief vanished during the edit');
				const content = brief.content ?? '';

				// Commissioned changes landed, exactly as worded.
				const audience = normalizeComparableText(requireSection(content, 'Audience'));
				if (audience !== normalizeComparableText(REVISED_AUDIENCE)) {
					throw new Error(
						`[assert] Audience was not replaced with the requested text.\n` +
							`  expected: ${REVISED_AUDIENCE}\n  saved:    ${requireSection(content, 'Audience')}`
					);
				}
				const cta = normalizeComparableText(requireSection(content, 'Call to action'));
				if (cta !== normalizeComparableText(REVISED_CTA)) {
					throw new Error(
						`[assert] Call to action was not replaced with the requested text.\n` +
							`  expected: ${REVISED_CTA}\n  saved:    ${requireSection(content, 'Call to action')}`
					);
				}
				const changeLog = requireSection(content, 'Change log');
				assertIncludesExactText(changeLog, CEDAR_BRIEF_CHANGELOG, 'the change log');
				assertIncludesExactText(changeLog, APPENDED_CHANGELOG, 'the change log');

				// Everything NOT commissioned survived, including the sentinel.
				assertIncludesExactText(
					content,
					CEDAR_BRIEF_PROMISE,
					'the preserved Promise section'
				);
				assertIncludesExactText(
					content,
					CEDAR_BRIEF_FACTS,
					'the preserved Project facts section'
				);
				assertIncludesExactText(
					content,
					CEDAR_BRIEF_GUARDRAIL,
					'the preserved Guardrails section'
				);
				assertIncludesExactText(
					content,
					CEDAR_BRIEF_SENTINEL,
					'the preserved sentinel line'
				);

				await assertNoCalendarSideEffects(
					ctx,
					seed.projectId!,
					'a document edit must not schedule anything'
				);
				await assertWorkerLaneOnly(turn, ctx);
			}
		}
	]
};
