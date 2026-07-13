// apps/web/src/lib/tests/agentic-e2e/scenarios/document-create.scenario.ts
//
// Baseline write: seed an empty project, ask the chat to add a structured
// document, verify the document actually landed in onto_documents.
import type { ProjectSpec } from '$lib/types/onto';
import type { Scenario } from '../harness/types';
import { harnessProjectName, seedScenarioProject } from '../harness/seed';
import {
	assertToolCalled,
	assertTurnRunCompleted,
	assertTurnSucceeded,
	assertToolExecutionSucceeded,
	assertMarkdownSectionBullets
} from '../harness/assertions';
import { getDocumentByTitle, getToolExecutions, waitForTurnRun } from '../harness/telemetry';

const DOC_TITLE = 'Launch Checklist';

function spec(): ProjectSpec {
	return {
		project: {
			name: harnessProjectName('Doc Create'),
			type_key: 'project.business.product_launch',
			description: 'A product launch with no documents yet.'
		},
		entities: [],
		relationships: []
	};
}

export const documentCreateScenario: Scenario = {
	id: 'document-create',
	title: 'Add a structured document to a project',
	category: 'document',
	seed: (ctx) => seedScenarioProject(ctx, spec()),
	turns: [
		{
			contextType: 'project',
			entityIdFromSeed: (seed) => seed.projectId,
			message:
				`Add a document to this project called "${DOC_TITLE}" with three sections: ` +
				`Pre-flight, Launch Day, and Rollback. Put two or three bullet points under each section.`,
			assert: async (turn, ctx, seed) => {
				assertTurnSucceeded(turn);
				assertToolCalled(turn, 'create_onto_document');

				const run = await waitForTurnRun(ctx.db.admin, turn.streamRunId!);
				assertTurnRunCompleted(run);

				const execs = await getToolExecutions(ctx.db.admin, turn.streamRunId!);
				assertToolExecutionSucceeded(execs, 'create_onto_document');

				// Ground truth: the document exists under the project with real content.
				const doc = await getDocumentByTitle(ctx.db.admin, seed.projectId!, DOC_TITLE);
				if (!doc) {
					throw new Error(
						`[assert] no "${DOC_TITLE}" document found under the seeded project`
					);
				}
				if (!doc.content || doc.content.trim().length < 20) {
					throw new Error(
						`[assert] "${DOC_TITLE}" was created but content is empty/too short: "${doc.content ?? ''}"`
					);
				}
				for (const heading of ['Pre-flight', 'Launch Day', 'Rollback']) {
					assertMarkdownSectionBullets(doc.content, heading, 2, 3);
				}
			}
		}
	]
};
