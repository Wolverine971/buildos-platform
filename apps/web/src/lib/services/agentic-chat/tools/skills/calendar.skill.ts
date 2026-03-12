// apps/web/src/lib/services/agentic-chat/tools/skills/calendar.skill.ts
import type { SkillDefinition } from './types';

export const calendarSkill: SkillDefinition = {
	path: 'cal.skill',
	id: 'calendar',
	name: 'calendar',
	summary:
		'Calendar workflow playbook for BuildOS agentic chat. Use for event reads/writes, scope decisions, and project calendar mapping.',
	relatedOps: [
		'cal.event.list',
		'cal.event.get',
		'cal.event.create',
		'cal.event.update',
		'cal.event.delete',
		'cal.project.get',
		'cal.project.set'
	],
	whenToUse: [
		'Read events in a time window',
		'Create, reschedule, or cancel events',
		'Choose between user scope and project scope',
		'Manage project calendar mapping',
		'Link work sessions to tasks'
	],
	workflow: [
		'Choose scope first: user, project, or explicit calendar_id.',
		'For project scope, include exact project_id.',
		'Use timezone-safe ISO 8601 values for start_at and end_at, or supply timezone.',
		'For project calendar mapping questions, check cal.project.get before assuming a project calendar exists.',
		'For update/delete, discover and pass exact onto_event_id or event_id.',
		'For first-time or complex writes, inspect exact op help before tool_exec.',
		'After execution, tell the user what changed and mention sync implications when they matter.'
	],
	guardrails: [
		'Prefer onto_event_id when available for update/delete.',
		'If sync status matters, verify with calendar ops instead of guessing.',
		'If a task is clearly the subject of the event, include task_id.',
		'If only start_at is known, the backend may default duration; still prefer explicit end_at when the user gave enough detail.'
	],
	examples: [
		{
			description: 'Schedule a project work session tied to a task',
			next_steps: [
				'Use cal.skill to confirm scope and ID rules.',
				'Inspect cal.event.create if the exact args are not already known in-turn.',
				'Call cal.event.create with title, start_at, project_id, calendar_scope="project", and task_id when relevant.'
			]
		},
		{
			description: 'Reschedule an existing event safely',
			next_steps: [
				'Use cal.event.list or cal.event.get to discover the exact onto_event_id or event_id.',
				'Inspect cal.event.update if needed.',
				'Call cal.event.update with the exact identifier and updated fields.'
			]
		}
	],
	notes: [
		'Calendar reads and writes are often sensitive to scope, time zone normalization, and exact event identifiers.',
		'Use exact op help if the request depends on less common fields such as sync_to_calendar or calendar_id.'
	]
};
