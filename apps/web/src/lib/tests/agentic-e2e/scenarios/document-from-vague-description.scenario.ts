// apps/web/src/lib/tests/agentic-e2e/scenarios/document-from-vague-description.scenario.ts
//
// Tier 1 gap #6. `document-create` already covers the imperative form — "create a
// doc with these sections" — where the user has effectively written the spec. The
// untested case is the one DJ actually produces: a **non-imperative** thought that
// implies work without commanding it.
//
//   "We need to figure out research for a doc about X."
//   "I think we need to figure out..." — no verb aimed at the agent at all.
//
// The first run (2026-07-25) failed this with 10 tool calls including 6 web
// searches and ZERO documents — it researched at length and reported findings in
// chat only. That reframed the scenario around a second BuildOS principle DJ
// stated in response:
//
//   "Learn through each chat. We want to build context. We don't want bloat, but
//    we do want to build context."
//
// So the primary assertion is now research-persistence, not document-creation:
// appending to an existing doc counts, spraying six new docs does not.
//
// Two failure modes, opposite in shape, and the assertions have to separate them:
//
//   - Under-action: the agent treats the sentence as conversation, replies
//     agreeably, and creates nothing. This is the default failure for phrasing
//     that never says "create".
//   - Empty compliance: a document exists, but it is a title and a stub. It
//     technically passes "a document was created" while being worthless.
//
// The structure and substance floors below exist for the second one. Per the
// clarification policy (OPEN_BRIEF_EVAL_METHODOLOGY.md §6.1), run-and-surface is
// the default: this brief is underspecified but proceedable, so producing the doc
// with assumptions attached is the expected behavior, not asking first.
import type { ProjectSpec } from '$lib/types/onto';
import type { Scenario, SeedResult } from '../harness/types';
import { harnessProjectName, seedProject } from '../harness/seed';
import {
	assertNonEmptyAssistantText,
	assertResearchPersisted,
	assertTurnRunCompleted,
	assertTurnSucceeded,
	buildTranscript
} from '../harness/assertions';
import { listDocuments, waitForTurnRun } from '../harness/telemetry';

const SEED_DOC_TITLE = 'Product Overview';

function countHeadings(markdown: string): number {
	return markdown.split(/\r?\n/).filter((line) => /^\s*#{1,6}\s+\S/.test(line.trim())).length;
}

function spec(): ProjectSpec {
	return {
		project: {
			name: harnessProjectName('Vague Doc'),
			type_key: 'project.business.product_launch',
			description: 'A B2B scheduling tool preparing to introduce paid plans.'
		},
		entities: [
			{
				temp_id: 'overview',
				kind: 'document',
				title: SEED_DOC_TITLE,
				body_markdown:
					'# Product Overview\n\n' +
					'A scheduling tool for small service businesses — salons, clinics, studios. ' +
					'Free while in beta. Roughly 400 active accounts, no paid tier yet. ' +
					'The nearest comparable tools are Calendly and Acuity.'
			}
		],
		relationships: []
	};
}

export const documentFromVagueDescriptionScenario: Scenario = {
	id: 'document-from-vague-description',
	title: 'Turn a non-imperative "we need to figure out X" into a real document',
	category: 'document',
	seed: async (ctx): Promise<SeedResult> => {
		const { projectId } = await seedProject(ctx, spec());
		const docs = await listDocuments(ctx.db.admin, projectId);
		return {
			projectId,
			entityIds: {},
			notes: {
				seededDocIds: docs.map((d) => d.id),
				// Baseline timestamps so an append to an existing doc is detectable.
				seededDocUpdatedAt: Object.fromEntries(docs.map((d) => [d.id, d.updated_at]))
			}
		};
	},
	turns: [
		{
			contextType: 'project',
			entityIdFromSeed: (seed) => seed.projectId,
			// Dictated, non-imperative. Never says "create", "write", or "make".
			message:
				'i think we need to figure out the research on what other people are charging for ' +
				'this kind of thing — like a pricing landscape doc or something',
			assert: async (turn, ctx, seed) => {
				assertTurnSucceeded(turn);
				assertNonEmptyAssistantText(turn);
				assertTurnRunCompleted(await waitForTurnRun(ctx.db.admin, turn.streamRunId!));

				const seededIds = new Set(seed.notes.seededDocIds as string[]);
				const allDocs = await listDocuments(ctx.db.admin, seed.projectId!);
				const created = allDocs.filter((d) => !seededIds.has(d.id));
				// Appending research to the existing overview is also "building
				// context" — the principle is that it lands somewhere durable, not
				// that it lands in a NEW document specifically.
				const updatedExisting = allDocs.filter(
					(d) =>
						seededIds.has(d.id) &&
						d.updated_at !==
							(seed.notes.seededDocUpdatedAt as Record<string, string>)[d.id]
				);

				// "Learn through each chat" (DJ, 2026-07-25). Checked BEFORE the
				// shape assertions below: if the research evaporated, that is the
				// finding, and "which document" is a secondary question.
				assertResearchPersisted(turn, [
					...created.map((d) => `created:${d.title}`),
					...updatedExisting.map((d) => `updated:${d.title}`)
				]);

				// No bloat: building context must not mean spraying documents.
				if (created.length > 2) {
					throw new Error(
						`[assert] ${created.length} new documents for one request — context building ` +
							`became bloat. Created: [${created.map((d) => d.title).join(', ')}]`
					);
				}

				if (created.length === 0 && updatedExisting.length === 0) {
					throw new Error(
						'[assert] no document was created or updated. Non-imperative phrasing ("i think ' +
							'we need to figure out...") was treated as conversation rather than a commission.'
					);
				}
				if (created.length === 0) {
					// Research landed in the existing doc rather than a new one —
					// acceptable under the principle; skip the new-doc shape checks.
					seed.notes.createdTitle = `(appended to) ${updatedExisting[0]!.title}`;
					seed.notes.createdContent = updatedExisting[0]!.content ?? '';
					return;
				}

				const doc = created.find((d) => /pric|cost|rate|landscape|competit/i.test(d.title));
				if (!doc) {
					throw new Error(
						`[assert] a document was created but none is about pricing. ` +
							`Titles: [${created.map((d) => d.title).join(', ')}]`
					);
				}
				seed.notes.createdTitle = doc.title;
				seed.notes.createdContent = doc.content ?? '';

				// Substance floors — the empty-compliance guard. A title plus a
				// sentence satisfies "a document exists" while being useless.
				const content = doc.content ?? '';
				if (content.trim().length < 300) {
					throw new Error(
						`[assert] "${doc.title}" holds only ${content.trim().length} chars — a stub, ` +
							`not a research doc. Content: "${content.slice(0, 200)}"`
					);
				}
				const headings = countHeadings(content);
				if (headings < 2) {
					throw new Error(
						`[assert] "${doc.title}" has ${headings} heading(s); a research scaffold needs ` +
							'sections to be usable. Content starts: ' +
							`"${content.slice(0, 200)}"`
					);
				}
			},
			judge: async (turn, _ctx, seed) => ({
				rubric:
					'The user said, without ever issuing a command, that they think they need research on ' +
					'what others charge — "like a pricing landscape doc or something". The project is a ' +
					'free-while-in-beta scheduling tool for small service businesses (salons, clinics, ' +
					'studios) with ~400 accounts and no paid tier, whose nearest comparables are Calendly ' +
					'and Acuity. A good result: a real document scaffolding that research — named ' +
					'comparables, the dimensions worth comparing (price points, tiering, per-seat vs flat, ' +
					'free-tier limits), and what is still unknown — visibly shaped by THIS project rather ' +
					'than a generic pricing-research template. Stating assumptions or open questions in the ' +
					'reply is good, not a flaw. Penalize: a generic outline that would suit any product, ' +
					'inventing specific competitor prices as fact, or only talking about the doc in chat ' +
					'without producing one.',
				threshold: 3,
				transcript: buildTranscript(turn, {
					createdDocumentTitle: seed.notes.createdTitle ?? '(none)',
					createdDocumentContent: seed.notes.createdContent ?? '(none)'
				})
			})
		}
	]
};
