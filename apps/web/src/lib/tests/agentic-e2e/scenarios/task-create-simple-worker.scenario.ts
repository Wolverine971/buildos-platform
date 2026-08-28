// apps/web/src/lib/tests/agentic-e2e/scenarios/task-create-simple-worker.scenario.ts
//
// Worker fast-lane release gate: one target-free create in the focused project
// must execute directly without materializing the complex contract/reviewer
// path. Keep this prompt free of calendar/domain requirements so the scenario
// measures the worker write boundary rather than legacy-only tool routing.
import type { ProjectSpec } from '$lib/types/onto';
import type { Scenario } from '../harness/types';
import { harnessProjectName, seedScenarioProject } from '../harness/seed';
import {
	assertToolCalled,
	assertToolExecutionSucceeded,
	assertTurnRunCompleted,
	assertTurnSucceeded
} from '../harness/assertions';
import { getToolExecutions, listTasks, waitForTurnRun } from '../harness/telemetry';

const TASK_TITLE = 'Email beta launch recap';

function spec(): ProjectSpec {
	return {
		project: {
			name: harnessProjectName('Simple Worker Task Create'),
			type_key: 'project.business.product_launch',
			description: 'A focused project for the worker direct-create release gate.'
		},
		entities: [],
		relationships: []
	};
}

export const taskCreateSimpleWorkerScenario: Scenario = {
	id: 'task-create-simple-worker',
	title: 'Create one task through the worker simple-write lane',
	category: 'task',
	requiredMutationTools: ['create_onto_task'],
	seed: async (ctx) => seedScenarioProject(ctx, spec()),
	turns: [
		{
			contextType: 'project',
			entityIdFromSeed: (seed) => seed.projectId,
			message: `Create a task called ${TASK_TITLE} in this project.`,
			assert: async (turn, ctx, seed) => {
				assertTurnSucceeded(turn);
				assertToolCalled(turn, 'create_onto_task');
				assertTurnRunCompleted(await waitForTurnRun(ctx.db.admin, turn.streamRunId!));

				const executions = await getToolExecutions(ctx.db.admin, turn.streamRunId!);
				assertToolExecutionSucceeded(executions, 'create_onto_task');
				const matchingTasks = (await listTasks(ctx.db.admin, seed.projectId!)).filter(
					(task) => task.title === TASK_TITLE
				);
				if (matchingTasks.length !== 1) {
					throw new Error(
						`[assert] expected exactly one task titled "${TASK_TITLE}"; found ${matchingTasks.length}`
					);
				}
			}
		}
	]
};
