// apps/web/src/lib/services/agentic-chat/tools/skills/task.skill.ts
import type { SkillDefinition } from './types';

export const taskSkill: SkillDefinition = {
	path: 'onto.task.skill',
	id: 'task',
	name: 'task',
	summary:
		'Task workflow playbook for deciding when work should become a task and how to manage task scope, ownership, schedule, and relationships safely.',
	relatedOps: [
		'onto.task.create',
		'onto.task.get',
		'onto.task.list',
		'onto.task.search',
		'onto.task.update',
		'onto.plan.get',
		'onto.goal.get',
		'onto.milestone.get'
	],
	whenToUse: [
		'Decide whether a user request should become a task at all',
		'Create a task for future human work',
		'Assign or reassign task ownership',
		'Update task state, dates, or priority',
		'Place a task under the right plan, goal, or milestone'
	],
	workflow: [
		'Decide first whether this should be a tracked task or whether the work should just be done in the conversation now.',
		'If it should be a task, choose the project and the right parent context: plan, goal, milestone, or direct project scope.',
		'For creates, include title and only add schedule, assignees, or supporting links when the user has given enough concrete information.',
		'Prefer assignee_handles over actor IDs unless the IDs were just discovered in-turn from project membership data.',
		'Use valid task states such as todo, in_progress, blocked, or done.',
		'For updates, discover and pass the exact task_id before any write.',
		'Only use description merge strategies when append or merge behavior is actually needed; otherwise keep updates simple.',
		'After execution, tell the user what changed and call out any missing owner, due date, or parent relationship that still matters.'
	],
	guardrails: [
		'Do not create tasks for research, analysis, brainstorming, or drafting that the agent can do now in chat.',
		'Do not invent assignee IDs, handles, or project membership.',
		'Do not use invalid task states such as open.',
		'Do not emit update calls without an exact task_id.',
		'If the request is really a goal, milestone, or plan, do not flatten it into a task just because task creation is easy.'
	],
	examples: [
		{
			description: 'Track a real follow-up the user must do later',
			next_steps: [
				'Confirm the request is future user work rather than work the agent can complete now.',
				'Inspect onto.task.create if the create schema is not already known in-turn.',
				'Create the task with the right parent plan/goal/milestone when that relationship is already clear.'
			]
		},
		{
			description: 'Update an existing task status and owner safely',
			next_steps: [
				'Use onto.task.search, onto.task.list, or onto.task.get to discover the exact task_id first.',
				'If ownership is changing, prefer assignee_handles unless actor IDs were just retrieved.',
				'Call onto.task.update with the exact task_id and the intended state/assignment changes.'
			]
		}
	],
	notes: [
		'Tasks are for future human work, not a transcript of what happened in chat.',
		'Containment and task relationships matter. A well-placed task is usually better than a floating task with no parent context.'
	]
};
