// apps/web/src/lib/tests/agentic-e2e/scenarios/task-reschedule-cold-reference.scenario.ts
//
// Tier 1 gap #4: cold reference resolution PLUS a date mutation, verified against
// `due_at`. Distinct from `task-create`, which is handed the task on a plate —
// here the referent is never named, only described, and there is no conversation
// history to read it out of.
//
// The distinguishing risk this catches: an agent that resolves the right task but
// treats "push it to friday" as a completion, or that creates a second task
// instead of moving the existing one. Both are asserted against.
import type { ProjectSpec } from '$lib/types/onto';
import type { Scenario, SeedResult } from '../harness/types';
import { harnessProjectName, seedProject } from '../harness/seed';
import {
	assertIsoDate,
	assertNonEmptyAssistantText,
	assertTaskState,
	assertToolCalled,
	assertTurnRunCompleted,
	assertTurnSucceeded,
	nextWeekdayDate
} from '../harness/assertions';
import { listTasks, waitForTurnRun } from '../harness/telemetry';

const TARGET_TITLE = 'Send the launch announcement to the beta list';
const CONTROL_TITLE = 'Record the walkthrough video';

function isoDaysFromDate(dateString: string, days: number): string {
	const date = new Date(`${dateString}T12:00:00.000Z`);
	date.setUTCDate(date.getUTCDate() + days);
	date.setUTCHours(15, 0, 0, 0);
	return date.toISOString();
}

export function buildRescheduleFixtureDates(now: Date): {
	expectedFriday: string;
	targetDueAt: string;
	controlDueAt: string;
} {
	const nextFriday = nextWeekdayDate(now, 5);
	// “Push it to Friday” means the next future Friday when the request itself is
	// made on a Friday. Keep the shared helper's inclusive semantics for scenarios
	// such as “due this Friday,” and make this reschedule fixture explicit.
	const isFridayInScenarioZone =
		new Intl.DateTimeFormat('en-US', {
			timeZone: 'America/New_York',
			weekday: 'short'
		}).format(now) === 'Fri';
	const expectedFriday = isFridayInScenarioZone
		? isoDaysFromDate(nextFriday, 7).slice(0, 10)
		: nextFriday;
	return {
		expectedFriday,
		targetDueAt: isoDaysFromDate(expectedFriday, -2),
		controlDueAt: isoDaysFromDate(expectedFriday, 2)
	};
}

function spec(dates: ReturnType<typeof buildRescheduleFixtureDates>): ProjectSpec {
	return {
		project: {
			name: harnessProjectName('Reschedule Cold Ref'),
			type_key: 'project.business.product_launch',
			description: 'A launch project with dated work in flight.'
		},
		entities: [
			{
				temp_id: 'target',
				kind: 'task',
				title: TARGET_TITLE,
				type_key: 'task.default',
				state_key: 'todo',
				priority: 2,
				// Always distinct from the requested Friday, regardless of the day
				// or time at which this paid scenario happens to run.
				due_at: dates.targetDueAt
			},
			{
				temp_id: 'control',
				kind: 'task',
				title: CONTROL_TITLE,
				type_key: 'task.default',
				state_key: 'todo',
				due_at: dates.controlDueAt
			}
		],
		relationships: []
	};
}

export const taskRescheduleColdReferenceScenario: Scenario = {
	id: 'task-reschedule-cold-reference',
	title: 'Reschedule a task described, not named, in a cold session',
	category: 'task',
	seed: async (ctx): Promise<SeedResult> => {
		const dates = buildRescheduleFixtureDates(new Date());
		const { projectId } = await seedProject(ctx, spec(dates));
		const tasks = await listTasks(ctx.db.admin, projectId);
		const target = tasks.find((t) => t.title === TARGET_TITLE);
		const control = tasks.find((t) => t.title === CONTROL_TITLE);
		if (!target || !control) throw new Error('[seed] failed to seed the reschedule fixtures');
		return {
			projectId,
			entityIds: { target: target.id, control: control.id },
			notes: {
				expectedFriday: dates.expectedFriday,
				controlDueAt: control.due_at,
				seededTaskIds: tasks.map((t) => t.id)
			}
		};
	},
	turns: [
		{
			contextType: 'project',
			entityIdFromSeed: (seed) => seed.projectId,
			// Dictated. The task is described by what it does, never by its title.
			message:
				"push the beta list email thing to friday, i'm not gonna get to it before then",
			assert: async (turn, ctx, seed) => {
				assertTurnSucceeded(turn);
				assertNonEmptyAssistantText(turn);
				assertToolCalled(turn, 'update_onto_task');
				assertTurnRunCompleted(await waitForTurnRun(ctx.db.admin, turn.streamRunId!));

				const tasks = await listTasks(ctx.db.admin, seed.projectId!);

				// It moved the existing task rather than forking a duplicate.
				const seededIds = new Set(seed.notes.seededTaskIds as string[]);
				const created = tasks.filter((t) => !seededIds.has(t.id));
				if (created.length > 0) {
					throw new Error(
						`[assert] a reschedule created ${created.length} new task(s) instead of ` +
							`moving the existing one: [${created.map((t) => t.title).join(', ')}]`
					);
				}

				const target = tasks.find((t) => t.id === seed.entityIds.target);
				if (!target) throw new Error('[assert] the target task vanished');
				assertIsoDate(
					target.due_at,
					String(seed.notes.expectedFriday),
					`"${target.title}" due`
				);
				// A reschedule is not a completion. This is the specific confusion to catch.
				assertTaskState(target.state_key, 'todo', `"${target.title}"`);

				const control = tasks.find((t) => t.id === seed.entityIds.control);
				if (!control) throw new Error('[assert] the control task vanished');
				if (control.due_at !== seed.notes.controlDueAt) {
					throw new Error(
						`[assert] the unrelated task "${CONTROL_TITLE}" was rescheduled too ` +
							`(${seed.notes.controlDueAt} -> ${control.due_at})`
					);
				}
			}
		}
	]
};
