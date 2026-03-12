// apps/web/src/lib/services/agentic-chat/tools/skills/plan.skill.ts
import type { SkillDefinition } from './types';

export const planSkill: SkillDefinition = {
	path: 'onto.plan.skill',
	id: 'plan',
	name: 'plan',
	summary:
		'Plan workflow playbook for deciding when to create plans, structuring them well, and connecting plans to tasks, goals, milestones, and documents.',
	relatedOps: [
		'onto.plan.create',
		'onto.plan.get',
		'onto.plan.update',
		'onto.task.create',
		'onto.task.list',
		'onto.edge.link',
		'onto.document.get'
	],
	whenToUse: [
		'Decide whether a goal needs a plan',
		'Create a plan from a goal or milestone',
		'Break a plan into tasks',
		'Refine a plan that already exists',
		'Connect plans to supporting documents'
	],
	workflow: [
		'Decide whether a plan is warranted. Prefer direct tasks when the work is trivial.',
		'Identify the outcome the plan supports.',
		'Create the plan with project_id and name; include description, type_key, and state_key whenever the user has given enough information.',
		'If goal or milestone IDs are already known, prefer passing them on plan creation; use onto.edge.link when adding relationships after the fact.',
		'Break the plan into concrete tasks.',
		'When creating tasks under a plan, include plan_id or the equivalent containment reference.',
		'Use valid task states such as todo, in_progress, blocked, or done; do not invent values like open.',
		'Reference relevant documents when they materially shape execution.'
	],
	guardrails: [
		'Do not create a large plan when the request is still vague brainstorming.',
		'Do not use the goal name as the plan name without adding an approach or phase.',
		'Do not leave tasks floating if they are clearly part of a plan.'
	],
	examples: [
		{
			description: 'Turn a goal into an actionable first plan',
			next_steps: [
				'Confirm the outcome the plan supports and whether a plan is actually warranted.',
				'Inspect onto.plan.create if the create schema is not already known in-turn.',
				'Create the plan, then create a small set of tasks with plan_id.'
			]
		},
		{
			description: 'Refine an existing plan that drifted out of date',
			next_steps: [
				'Read the existing plan and current tasks first.',
				'Update the plan metadata with onto.plan.update as needed.',
				'Add, adjust, or retire tasks so the plan matches the current approach.'
			]
		}
	],
	notes: [
		'Plans are useful when work needs coordination or structure, not as a mandatory layer for every request.',
		'If the model already knows the exact task and plan relationships in-turn, it can go straight to exact op help or tool_exec.'
	]
};
