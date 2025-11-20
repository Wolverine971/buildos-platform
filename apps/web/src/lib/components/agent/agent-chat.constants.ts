import type { ChatContextType } from '@buildos/shared-types';

export const CONTEXT_DESCRIPTORS: Record<ChatContextType, { title: string; subtitle: string }> = {
	global: {
		title: 'Global conversation',
		subtitle: 'Work across projects, tasks, and the calendar without constraints.'
	},
	project: {
		title: 'Project workspace',
		subtitle: 'Answer questions, explore insights, or update a selected project.'
	},
	task: {
		title: 'Task focus',
		subtitle: 'Dig into an individual task and its related work.'
	},
	calendar: {
		title: 'Calendar planning',
		subtitle: 'Coordinate schedules, availability, and time blocks.'
	},
	general: {
		title: 'Global conversation',
		subtitle: 'Legacy mode - use global instead.'
	},
	project_create: {
		title: 'New project flow',
		subtitle: 'Guide creation of a structured project from a spark of an idea.'
	},
	project_audit: {
		title: 'Project audit',
		subtitle: 'Stress-test the project for gaps, risks, and clarity.'
	},
	project_forecast: {
		title: 'Project forecast',
		subtitle: 'Explore timelines, what-ifs, and scenario planning.'
	},
	task_update: {
		title: 'Task spotlight',
		subtitle: 'Quick tune-ups, triage, and clarifications for tasks.'
	},
	daily_brief_update: {
		title: 'Daily brief tuning',
		subtitle: 'Adjust what surfaces in your daily brief and notifications.'
	}
};

export const CONTEXT_BADGE_CLASSES: Partial<Record<ChatContextType, string>> = {
	global: 'bg-blue-500/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300',
	project: 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
	project_create: 'bg-purple-500/10 text-purple-600 dark:bg-purple-500/15 dark:text-purple-300',
	project_audit: 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
	project_forecast: 'bg-teal-500/10 text-teal-600 dark:bg-teal-500/15 dark:text-teal-300',
	task_update: 'bg-orange-500/10 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300',
	task: 'bg-orange-500/10 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300',
	daily_brief_update: 'bg-rose-500/10 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300',
	calendar: 'bg-sky-500/10 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300'
};

export const DEFAULT_CONTEXT_BADGE_CLASS =
	'bg-slate-500/10 text-slate-700 dark:bg-slate-500/20 dark:text-slate-200';
