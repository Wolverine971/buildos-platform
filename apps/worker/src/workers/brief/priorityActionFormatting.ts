// apps/worker/src/workers/brief/priorityActionFormatting.ts
import { parseISO } from 'date-fns';

import type { GoalProgress, OntoTask, ProjectBriefData } from './ontologyBriefTypes.js';

export interface BriefPriorityAction {
	text: string;
	href: string;
}

interface PriorityActionBriefData {
	overdueTasks: OntoTask[];
	todaysTasks: OntoTask[];
	projects: Array<Pick<ProjectBriefData, 'unblockingTasks'>>;
	goals: GoalProgress[];
}

function escapeMarkdownLinkLabel(label: string): string {
	return label.replace(/([\\[\]*])/g, '\\$1');
}

export function buildProjectEntityHref(
	projectId: string,
	entityType: 'goal' | 'risk',
	entityId: string
): string {
	const params = new URLSearchParams({
		entity: entityType,
		entity_id: entityId
	});
	return `/projects/${encodeURIComponent(projectId)}?${params.toString()}`;
}

function buildTaskHref(task: OntoTask): string {
	return `/projects/${encodeURIComponent(task.project_id)}/tasks/${encodeURIComponent(task.id)}`;
}

export function formatPriorityActionMarkdown(action: BriefPriorityAction): string {
	return `[${escapeMarkdownLinkLabel(action.text)}](${action.href})`;
}

export function extractPriorityActions(briefData: PriorityActionBriefData): BriefPriorityAction[] {
	const actions: BriefPriorityAction[] = [];
	const seenTaskIds = new Set<string>();

	const addTask = (task: OntoTask): boolean => {
		if (seenTaskIds.has(task.id)) return false;
		seenTaskIds.add(task.id);
		actions.push({ text: task.title, href: buildTaskHref(task) });
		return true;
	};

	const taskSort = (a: OntoTask, b: OntoTask): number => {
		const priorityA = a.priority ?? Number.POSITIVE_INFINITY;
		const priorityB = b.priority ?? Number.POSITIVE_INFINITY;
		if (priorityA !== priorityB) return priorityA - priorityB;

		const dueA = a.due_at ? parseISO(a.due_at).getTime() : Number.POSITIVE_INFINITY;
		const dueB = b.due_at ? parseISO(b.due_at).getTime() : Number.POSITIVE_INFINITY;
		return dueA - dueB;
	};

	const highPriorityTasks = [...briefData.overdueTasks, ...briefData.todaysTasks]
		.filter((task) => task.priority !== null && task.priority <= 2 && task.state_key !== 'done')
		.sort(taskSort);
	let highPriorityCount = 0;
	for (const task of highPriorityTasks) {
		if (addTask(task)) highPriorityCount += 1;
		if (highPriorityCount >= 3) break;
	}

	for (const project of briefData.projects) {
		for (const task of project.unblockingTasks.slice(0, 2)) {
			if (actions.length >= 5) break;
			addTask(task);
		}
		if (actions.length >= 5) break;
	}

	const seenGoalIds = new Set<string>();
	const goalsAtRisk = briefData.goals.filter(
		(goal) => goal.status === 'at_risk' || goal.status === 'behind'
	);
	for (const goal of goalsAtRisk) {
		if (actions.length >= 5) break;
		if (seenGoalIds.has(goal.goal.id)) continue;
		seenGoalIds.add(goal.goal.id);
		actions.push({
			text: `Address goal: ${goal.goal.name}`,
			href: buildProjectEntityHref(goal.goal.project_id, 'goal', goal.goal.id)
		});
	}

	return actions;
}
