// apps/web/src/lib/tests/agentic-e2e/scenarios/document-edit-context.scenario.ts
//
// The headline test: edit a document, then edit it AGAIN referring only to
// "that section you just added" — proving the chat keeps conversational context
// across turns and re-targets the same document without being re-told which one.
import type { ProjectSpec } from '$lib/types/onto';
import type { Scenario, SeedResult } from '../harness/types';
import { harnessProjectName, seedProject } from '../harness/seed';
import {
	assertToolCalled,
	assertTurnRunCompleted,
	assertTurnSucceeded,
	buildTranscript,
	extractMarkdownSection,
	normalizeComparableText
} from '../harness/assertions';
import { getDocumentById, getDocumentByTitle, waitForTurnRun } from '../harness/telemetry';

const DOC_TITLE = 'Launch Checklist';
const ORIGINAL_SECTIONS = ['Pre-flight', 'Launch Day', 'Comms'];

const ORIGINAL_CONTENT = `## Pre-flight
- Verify the staging deploy is green
- Confirm all feature flags are configured

## Launch Day
- Flip the production flag at 9am
- Watch the error dashboard for the first hour

## Comms
- Send the launch email to the beta list
- Post the announcement in #general`;

function requireSection(content: string, heading: string): string {
	const section = extractMarkdownSection(content, heading);
	if (section === null) throw new Error(`[assert] section "${heading}" was missing`);
	return section;
}

function assertSectionsPreserved(before: string, after: string, headings: string[]): void {
	for (const heading of headings) {
		const beforeSection = normalizeComparableText(requireSection(before, heading));
		const afterSection = normalizeComparableText(requireSection(after, heading));
		if (afterSection !== beforeSection) {
			throw new Error(`[assert] unrelated section "${heading}" changed during the edit`);
		}
	}
}

function spec(): ProjectSpec {
	return {
		project: {
			name: harnessProjectName('Doc Edit Context'),
			type_key: 'project.business.product_launch',
			description: 'A product launch with one working checklist document.'
		},
		entities: [
			{
				temp_id: 'checklist',
				kind: 'document',
				title: DOC_TITLE,
				body_markdown: ORIGINAL_CONTENT
			}
		],
		relationships: []
	};
}

export const documentEditContextScenario: Scenario = {
	id: 'document-edit-context',
	title: 'Edit a document, then edit it again from context alone',
	category: 'document',
	seed: async (ctx): Promise<SeedResult> => {
		const { projectId } = await seedProject(ctx, spec());
		const doc = await getDocumentByTitle(ctx.db.admin, projectId, DOC_TITLE);
		if (!doc) throw new Error('[seed] failed to seed the checklist document');
		return { projectId, entityIds: { checklist: doc.id }, notes: {} };
	},
	turns: [
		// Turn 1 — explicit edit: add a fourth section.
		{
			contextType: 'project',
			entityIdFromSeed: (seed) => seed.projectId,
			message:
				`Open the "${DOC_TITLE}" document and add a fourth section called "Rollback" with a few ` +
				`concrete steps for backing out a bad launch (revert the flag, restore the previous build, notify the team).`,
			assert: async (turn, ctx, seed) => {
				assertTurnSucceeded(turn);
				assertToolCalled(turn, 'update_onto_document');
				assertTurnRunCompleted(await waitForTurnRun(ctx.db.admin, turn.streamRunId!));

				const docId = seed.entityIds.checklist;
				if (!docId) throw new Error('[assert] seeded checklist doc id missing');
				const doc = await getDocumentById(ctx.db.admin, docId);
				if (!doc) throw new Error('[assert] checklist document vanished after edit');

				const content = doc.content ?? '';
				// The new section landed...
				if (!/rollback/i.test(content)) {
					throw new Error(
						`[assert] "Rollback" section not present after edit. Content:\n${content}`
					);
				}
				assertSectionsPreserved(ORIGINAL_CONTENT, content, ORIGINAL_SECTIONS);
				const rollback = normalizeComparableText(requireSection(content, 'Rollback'));
				for (const requiredTerm of ['flag', 'build', 'team']) {
					if (!rollback.includes(requiredTerm)) {
						throw new Error(
							`[assert] rollback section omitted requested "${requiredTerm}" guidance`
						);
					}
				}
				// Stash the post-edit snapshot for turn 2's comparison.
				seed.notes.afterTurn1Content = content;
				seed.notes.afterTurn1UpdatedAt = doc.updated_at;
			}
		},
		// Turn 2 — context-only edit: no document named, refers to "that section
		// you just added". Same session id is threaded by the runner.
		{
			contextType: 'project',
			entityIdFromSeed: (seed) => seed.projectId,
			message:
				'Nice. Now tighten the wording in that rollback section you just added — make it crisper.',
			assert: async (turn, ctx, seed) => {
				assertTurnSucceeded(turn);
				assertToolCalled(turn, 'update_onto_document');
				assertTurnRunCompleted(await waitForTurnRun(ctx.db.admin, turn.streamRunId!));

				const docId = seed.entityIds.checklist;
				if (!docId) throw new Error('[assert] seeded checklist doc id missing');
				const doc = await getDocumentById(ctx.db.admin, docId);
				if (!doc) throw new Error('[assert] checklist document vanished after second edit');

				const content = doc.content ?? '';
				// It re-targeted the SAME document (proving context) and actually changed it.
				const before = String(seed.notes.afterTurn1Content ?? '');
				if (content === before) {
					throw new Error('[assert] second edit did not change the document content');
				}
				assertSectionsPreserved(before, content, ORIGINAL_SECTIONS);
				const rollbackBefore = normalizeComparableText(requireSection(before, 'Rollback'));
				const rollbackAfter = normalizeComparableText(requireSection(content, 'Rollback'));
				if (rollbackAfter === rollbackBefore) {
					throw new Error(
						'[assert] rollback wording was not changed by the tighten edit'
					);
				}
				seed.notes.finalContent = content;
			},
			judge: async (turn, _ctx, seed) => ({
				rubric:
					'The user asked the assistant to tighten the wording of the "Rollback" section it had just ' +
					'added to the Launch Checklist, referring to it only from conversation context (the document ' +
					'was not named again). A good result: the assistant edited the SAME Launch Checklist document, ' +
					'tightened specifically the Rollback section, and left the Pre-flight / Launch Day / Comms ' +
					'sections intact. Penalize editing the wrong doc, rewriting unrelated sections, or claiming ' +
					'success without a real edit.',
				threshold: 3,
				transcript: buildTranscript(turn, {
					finalDocumentContent: seed.notes.finalContent ?? '(unavailable)'
				})
			})
		}
	]
};
