// apps/web/src/lib/tests/agentic-e2e/scenarios/cedar-house/case-01-project-create.scenario.ts
//
// Cedar House case 1 — create a constrained construction project.
// Audit score: 3/4 (created correctly; the overview rendered the start date a
// day early). The oracle here is the stored row, not the rendered timeline:
// `start_at` must resolve to September 14 and `end_at` to November 20 as NEW
// YORK civil days, which is exactly the assertion an off-by-one-day storage bug
// fails and a display-only bug passes.
import type { Scenario, SeedResult } from '../../harness/types';
import { teardownProject } from '../../harness/seed';
import {
	assertCleanText,
	assertIsoDate,
	assertToolCalled,
	assertTurnRunCompleted,
	assertTurnSucceeded
} from '../../harness/assertions';
import { listProjectsByExactName, listTasks, waitForTurnRun } from '../../harness/telemetry';
import { CEDAR_END_DATE, CEDAR_START_DATE, cedarProjectName } from './fixture';
import {
	assertBudgetCapPresent,
	assertContingencyPresent,
	assertNoCalendarSideEffects,
	assertWorkerLaneOnly,
	readCedarProject,
	requireStreamRunId
} from './guards';

const PROJECT_NAME = cedarProjectName();

export const cedarCase01ProjectCreateScenario: Scenario = {
	id: 'cedar-01-project-create',
	title: 'Case 1 — create a constrained construction project',
	category: 'cedar-house',
	batteryCase: 1,
	requiredMutationTools: ['create_onto_project'],
	seed: async (): Promise<SeedResult> => ({ entityIds: {}, notes: {} }),
	teardown: async (ctx, seed) => {
		// Sweep duplicates too: a second project with the exact same name is itself
		// a finding, and leaving it behind poisons the next run's exact-name lookup.
		const projects = await listProjectsByExactName(ctx.db.admin, ctx.db.actorId, PROJECT_NAME);
		for (const project of projects) {
			if (project.id !== seed.projectId) await teardownProject(ctx.db, project.id);
		}
	},
	turns: [
		{
			label: 'create the project from an exact brief',
			contextType: 'project_create',
			message:
				`Create a construction project named "${PROJECT_NAME}". This is synthetic test data. ` +
				'We are renovating a fictional 1,200 sq ft house: kitchen, one bathroom, and electrical ' +
				'upgrades. Budget cap $85,000 including a $10,000 contingency. Start September 14, 2026; ' +
				'target completion November 20, 2026. Timezone America/New_York. Exclude roof replacement ' +
				'and landscaping. Success means inspections passed, owner walkthrough accepted, and total ' +
				'spend within the cap. Create the project now with this brief, but do not create tasks or ' +
				'calendar events yet. Preserve the exact dates and budget; do not invent an address, ' +
				'vendors, or permits already approved.',
			assert: async (turn, ctx, seed) => {
				assertTurnSucceeded(turn);
				assertCleanText(turn);
				assertToolCalled(turn, 'create_onto_project');
				assertTurnRunCompleted(
					await waitForTurnRun(ctx.db.admin, requireStreamRunId(turn))
				);

				const projects = await listProjectsByExactName(
					ctx.db.admin,
					ctx.db.actorId,
					PROJECT_NAME
				);
				if (projects.length !== 1) {
					throw new Error(
						`[assert] expected exactly one project named "${PROJECT_NAME}", found ${projects.length}`
					);
				}
				const projectId = projects[0]!.id;
				seed.projectId = projectId;

				const project = await readCedarProject(ctx, projectId);
				assertIsoDate(project.start_at, CEDAR_START_DATE, 'project start');
				assertIsoDate(project.end_at, CEDAR_END_DATE, 'project end');
				assertBudgetCapPresent(project.description ?? '', 'the saved project brief');
				assertContingencyPresent(project.description ?? '', 'the saved project brief');

				// "do not create tasks or calendar events yet"
				const tasks = await listTasks(ctx.db.admin, projectId);
				if (tasks.length > 0) {
					throw new Error(
						`[assert] the prompt forbade tasks but ${tasks.length} were created: ` +
							`[${tasks.map((task) => task.title).join(', ')}]`
					);
				}
				await assertNoCalendarSideEffects(
					ctx,
					projectId,
					'the prompt said "do not create tasks or calendar events yet"'
				);
				await assertWorkerLaneOnly(turn, ctx);
			}
		}
	]
};
