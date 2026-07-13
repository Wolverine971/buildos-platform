// apps/web/src/lib/tests/agentic-e2e/scenarios/task-create.scenario.ts
//
// Baseline task write: seed a project, ask the chat to add a scheduled,
// prioritized task, verify it landed in onto_tasks with sensible fields.
import type { ProjectSpec } from '$lib/types/onto';
import type { Scenario } from '../harness/types';
import { harnessProjectName, seedScenarioProject } from '../harness/seed';
import {
	assertToolCalled,
	assertToolExecutionSucceeded,
	assertTurnRunCompleted,
	assertTurnSucceeded,
	assertIsoDate,
	assertNumericPriorityAtMost,
	nextWeekdayDate
} from '../harness/assertions';
import { getToolExecutions, listTasks, waitForTurnRun } from '../harness/telemetry';

function spec(): ProjectSpec {
	return {
		project: {
			name: harnessProjectName('Task Create'),
			type_key: 'project.business.product_launch',
			description: 'A launch project ready to accept new tasks.'
		},
		entities: [],
		relationships: []
	};
}

export const taskCreateScenario: Scenario = {
	id: 'task-create',
	title: 'Create a scheduled, prioritized task',
	category: 'task',
	seed: async (ctx) => {
		const seed = await seedScenarioProject(ctx, spec());
		seed.notes.expectedFriday = nextWeekdayDate(new Date(), 5);
		return seed;
	},
	turns: [
		{
			contextType: 'project',
			entityIdFromSeed: (seed) => seed.projectId,
			message: 'Add a high-priority task to email the beta list by this Friday.',
			assert: async (turn, ctx, seed) => {
				assertTurnSucceeded(turn);
				assertToolCalled(turn, 'create_onto_task');
				assertTurnRunCompleted(await waitForTurnRun(ctx.db.admin, turn.streamRunId!));

				const execs = await getToolExecutions(ctx.db.admin, turn.streamRunId!);
				assertToolExecutionSucceeded(execs, 'create_onto_task');

				// Ground truth: a task exists mentioning the beta list.
				const tasks = await listTasks(ctx.db.admin, seed.projectId!);
				const task = tasks.find((candidate) => {
					const text = `${candidate.title} ${candidate.description ?? ''}`;
					return /beta/i.test(text) && /email/i.test(text);
				});
				if (!task) {
					throw new Error(
						`[assert] no matching task found. Got titles: [${tasks.map((t) => t.title).join(', ')}]`
					);
				}
				assertNumericPriorityAtMost(task.priority, 2, `task "${task.title}"`);
				assertIsoDate(
					task.due_at,
					String(seed.notes.expectedFriday),
					`task "${task.title}" due`
				);
			}
		}
	]
};
