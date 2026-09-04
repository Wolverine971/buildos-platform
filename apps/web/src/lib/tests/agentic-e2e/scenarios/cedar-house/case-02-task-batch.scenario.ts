// apps/web/src/lib/tests/agentic-e2e/scenarios/cedar-house/case-02-task-batch.scenario.ts
//
// Cedar House case 2 — create five tasks with dates, priorities, estimates and
// dependencies in one request.
// Audit score: 1/4. Eleven `create_onto_task` calls were rejected with
// `write_execution_scope_mismatch`; the assistant correctly reported that
// nothing persisted. This is the battery's single most load-bearing write case:
// it either shows the batch write lane working or reproduces the blocker.
import type { Scenario } from '../../harness/types';
import {
	assertIsoDate,
	assertNumericPriorityAtMost,
	assertToolCalled,
	assertTurnRunCompleted,
	assertTurnSucceeded
} from '../../harness/assertions';
import { listTasks, waitForTurnRun } from '../../harness/telemetry';
import { CEDAR_ALL_TASK_SLUGS, CEDAR_TASKS, seedCedarHouse } from './fixture';
import {
	assertMinutesRecorded,
	assertNoCalendarSideEffects,
	assertWorkerLaneOnly,
	requireStreamRunId,
	taskByTitle
} from './guards';

export const cedarCase02TaskBatchScenario: Scenario = {
	id: 'cedar-02-task-batch',
	title: 'Case 2 — create five dated, prioritized, dependent tasks in one request',
	category: 'cedar-house',
	batteryCase: 2,
	requiredMutationTools: ['create_onto_task'],
	seed: (ctx) => seedCedarHouse(ctx, { tasks: 'none', label: 'case-02' }),
	turns: [
		{
			label: 'batch-create the five requested tasks',
			contextType: 'project',
			entityIdFromSeed: (seed) => seed.projectId,
			message:
				'In this project create exactly these five tasks, all initially not started, with no ' +
				'calendar events: (1) "QA — Confirm permit requirements", due September 15, 2026, ' +
				'priority high, 60 minutes; (2) "QA — Order kitchen cabinets", due September 18, 2026, ' +
				'priority high, 90 minutes, depends on Confirm permit requirements; (3) "QA — Electrical ' +
				'rough-in", due September 28, 2026, priority high, 480 minutes, depends on Confirm permit ' +
				'requirements; (4) "QA — Kitchen inspection", due September 30, 2026, priority medium, ' +
				'60 minutes, depends on Electrical rough-in; (5) "QA — Bathroom inspection", due ' +
				'October 2, 2026, priority medium, 60 minutes. These are due dates, not appointments. ' +
				'Save the dependencies as relationships if supported. Do not mark the permit approved. ' +
				'Report any fields you cannot save.',
			assert: async (turn, ctx, seed) => {
				assertTurnSucceeded(turn);
				assertToolCalled(turn, 'create_onto_task');
				assertTurnRunCompleted(
					await waitForTurnRun(ctx.db.admin, requireStreamRunId(turn))
				);

				const tasks = await listTasks(ctx.db.admin, seed.projectId!);
				if (tasks.length !== CEDAR_ALL_TASK_SLUGS.length) {
					throw new Error(
						`[assert] expected exactly ${CEDAR_ALL_TASK_SLUGS.length} tasks, found ${tasks.length}: ` +
							`[${tasks.map((task) => task.title).join(', ')}]`
					);
				}

				for (const slug of CEDAR_ALL_TASK_SLUGS) {
					const fixture = CEDAR_TASKS[slug]!;
					const task = taskByTitle(tasks, fixture.title);
					assertIsoDate(task.due_at, fixture.dueDate, `task "${fixture.title}" due`);
					assertNumericPriorityAtMost(
						task.priority,
						fixture.priority,
						`task "${fixture.title}"`
					);
					assertMinutesRecorded(task, fixture.minutes);
					if (task.state_key !== 'todo') {
						throw new Error(
							`[assert] task "${fixture.title}" was created in state "${task.state_key}"; ` +
								'the prompt said all five start not-started'
						);
					}
					if (fixture.prerequisite) {
						const text = `${task.title} ${task.description ?? ''}`.toLowerCase();
						if (!text.includes(fixture.prerequisite.toLowerCase())) {
							throw new Error(
								`[assert] task "${fixture.title}" did not record its "${fixture.prerequisite}" ` +
									`prerequisite. Description: "${task.description ?? '(none)'}"`
							);
						}
					}
				}

				// "These are due dates, not appointments" + "with no calendar events".
				await assertNoCalendarSideEffects(
					ctx,
					seed.projectId!,
					'the prompt said these are due dates, not appointments, with no calendar events'
				);
				await assertWorkerLaneOnly(turn, ctx);
			}
		}
	]
};
