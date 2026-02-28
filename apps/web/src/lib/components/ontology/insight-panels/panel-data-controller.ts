// apps/web/src/lib/components/ontology/insight-panels/panel-data-controller.ts
import { resolveMilestoneState } from '$lib/utils/milestone-state';
import type { Milestone } from '$lib/types/onto';
import {
	ASSIGNEE_FILTER_ME,
	ASSIGNEE_FILTER_UNASSIGNED,
	IMPACT_ORDER,
	PANEL_CONFIGS,
	PERSON_FILTER_ME,
	STAGE_ORDER,
	calculateRiskScore,
	getPriorityGroup,
	isWithinTimeframe,
	type FilterGroup,
	type InsightPanelKey,
	type InsightPanelState
} from './insight-panel-config';
import { taskMatchesAssigneeFilter } from './task-assignee-filter';
import { getTaskPersonRelevanceScore, taskMatchesPersonFocusFilter } from './task-person-relevance';

export type TaskAssigneeFilterMember = {
	actorId: string;
	label: string;
};

export type TaskSortLike = {
	assignees?: Array<{ actor_id?: string | null }>;
	created_by?: string | null;
	last_changed_by_actor_id?: string | null;
	updated_at?: string | null;
};

type GenericEntity = Record<string, unknown>;

export type InsightPanelCounts = {
	tasks: { showCompleted: number; showDeleted: number };
	plans: { showCompleted: number; showDeleted: number };
	goals: { showAchieved: number; showAbandoned: number; showDeleted: number };
	milestones: { showCompleted: number; showMissed: number; showDeleted: number };
	risks: { showClosed: number; showDeleted: number };
	events: { showPast: number; showCancelled: number; showDeleted: number };
	images: { showFailedOnly: number };
};

type FilterOptions = {
	currentActorId: string | null;
};

type SortOptions = {
	taskFocusActorId: string | null;
};

export function buildTaskFilterGroups(options: {
	members: TaskAssigneeFilterMember[];
	currentActorId: string | null;
}): FilterGroup[] {
	const { members, currentActorId } = options;
	return PANEL_CONFIGS.tasks.filters.map((group) => {
		if (group.id !== 'assignee_actor_id' && group.id !== 'person_focus_actor_id') {
			return group;
		}

		const dynamicOptions: FilterGroup['options'] = [];
		if (group.id === 'assignee_actor_id') {
			if (currentActorId) {
				dynamicOptions.push({ value: ASSIGNEE_FILTER_ME, label: 'Assigned to me' });
			}
			dynamicOptions.push({ value: ASSIGNEE_FILTER_UNASSIGNED, label: 'Unassigned' });
		} else if (group.id === 'person_focus_actor_id' && currentActorId) {
			dynamicOptions.push({ value: PERSON_FILTER_ME, label: 'Me' });
		}

		for (const member of members) {
			if (group.id === 'person_focus_actor_id' && member.actorId === currentActorId) {
				continue;
			}
			dynamicOptions.push({
				value: member.actorId,
				label: `@${member.label}`
			});
		}

		return {
			...group,
			options: dynamicOptions
		};
	});
}

export function getTaskRelevanceScoreForSort(
	task: TaskSortLike,
	taskFocusActorId: string | null
): number {
	return getTaskPersonRelevanceScore({
		focusActorId: taskFocusActorId,
		assignees: Array.isArray(task.assignees)
			? (task.assignees as Array<{ actor_id?: string | null }>)
			: [],
		createdByActorId: typeof task.created_by === 'string' ? task.created_by : null,
		lastChangedByActorId:
			typeof task.last_changed_by_actor_id === 'string' ? task.last_changed_by_actor_id : null
	});
}

export function filterInsightEntity(
	item: GenericEntity,
	filters: Record<string, string[]>,
	toggles: Record<string, boolean>,
	entityType: InsightPanelKey,
	options: FilterOptions
): boolean {
	const { currentActorId } = options;
	if (!toggles.showDeleted && item.deleted_at) {
		return false;
	}

	if (entityType === 'tasks') {
		if (!toggles.showCompleted && item.state_key === 'done') return false;
	} else if (entityType === 'plans') {
		if (!toggles.showCompleted && item.state_key === 'completed') return false;
	} else if (entityType === 'goals') {
		if (!toggles.showAchieved && item.state_key === 'achieved') return false;
		if (!toggles.showAbandoned && item.state_key === 'abandoned') return false;
	} else if (entityType === 'milestones') {
		const { state } = resolveMilestoneState(item as Milestone);
		if (!toggles.showCompleted && state === 'completed') return false;
		if (!toggles.showMissed && state === 'missed') return false;
	} else if (entityType === 'risks') {
		if (!toggles.showClosed && item.state_key === 'closed') return false;
	} else if (entityType === 'events') {
		if (!toggles.showCancelled && item.state_key === 'cancelled') return false;
		if (!toggles.showPast) {
			const endAt = item.end_at as string | null;
			const startAt = item.start_at as string | null;
			const eventEnd = endAt ? new Date(endAt) : startAt ? new Date(startAt) : null;
			if (eventEnd && eventEnd < new Date()) return false;
		}
	} else if (entityType === 'images') {
		if (toggles.showFailedOnly && item.ocr_status !== 'failed') return false;
	}

	for (const [field, selectedValues] of Object.entries(filters)) {
		if (!selectedValues || selectedValues.length === 0) continue;

		if (field === 'priority' && entityType === 'tasks') {
			const priorityGroup = getPriorityGroup(item.priority as number | null);
			if (!selectedValues.includes(priorityGroup)) return false;
			continue;
		}

		if (field === 'state_key' && entityType === 'milestones') {
			const { state } = resolveMilestoneState(item as Milestone);
			if (!selectedValues.includes(state)) return false;
			continue;
		}

		if (field === 'timeframe' && entityType === 'milestones') {
			const timeframe = selectedValues[0] || 'all';
			if (timeframe !== 'all') {
				if (!isWithinTimeframe(item.due_at as string | null, timeframe)) return false;
			}
			continue;
		}

		if (field === 'assignee_actor_id' && entityType === 'tasks') {
			const assigneeRows = Array.isArray(item.assignees)
				? (item.assignees as Array<{ actor_id?: string | null }>)
				: [];
			if (
				!taskMatchesAssigneeFilter({
					selectedValues,
					currentActorId,
					assignees: assigneeRows
				})
			) {
				return false;
			}
			continue;
		}

		if (field === 'person_focus_actor_id' && entityType === 'tasks') {
			const assigneeRows = Array.isArray(item.assignees)
				? (item.assignees as Array<{ actor_id?: string | null }>)
				: [];
			if (
				!taskMatchesPersonFocusFilter({
					selectedValues,
					currentActorId,
					assignees: assigneeRows,
					createdByActorId:
						typeof item.created_by === 'string' ? (item.created_by as string) : null,
					lastChangedByActorId:
						typeof item.last_changed_by_actor_id === 'string'
							? (item.last_changed_by_actor_id as string)
							: null
				})
			) {
				return false;
			}
			continue;
		}

		if (field === 'state_key') {
			const stateVal = String(item[field] ?? '');
			const allowedByToggle =
				(entityType === 'tasks' && toggles.showCompleted && stateVal === 'done') ||
				(entityType === 'plans' && toggles.showCompleted && stateVal === 'completed') ||
				(entityType === 'goals' && toggles.showAchieved && stateVal === 'achieved') ||
				(entityType === 'goals' && toggles.showAbandoned && stateVal === 'abandoned') ||
				(entityType === 'risks' && toggles.showClosed && stateVal === 'closed') ||
				(entityType === 'events' && toggles.showCancelled && stateVal === 'cancelled');
			if (allowedByToggle || selectedValues.includes(stateVal)) {
				continue;
			}
			return false;
		}

		const itemValue = item[field];
		if (itemValue == null || !selectedValues.includes(String(itemValue))) {
			return false;
		}
	}

	return true;
}

export function sortInsightEntities<T extends GenericEntity>(
	items: T[],
	sort: { field: string; direction: 'asc' | 'desc' },
	entityType: InsightPanelKey,
	options: SortOptions
): T[] {
	const { taskFocusActorId } = options;
	return [...items].sort((a, b) => {
		let aVal = a[sort.field];
		let bVal = b[sort.field];

		if (sort.field === 'relevance' && entityType === 'tasks') {
			const aRelevance = getTaskRelevanceScoreForSort(a as TaskSortLike, taskFocusActorId);
			const bRelevance = getTaskRelevanceScoreForSort(b as TaskSortLike, taskFocusActorId);
			if (aRelevance !== bRelevance) {
				const relevanceComparison = aRelevance - bRelevance;
				return sort.direction === 'asc' ? relevanceComparison : -relevanceComparison;
			}

			const aUpdated = typeof a.updated_at === 'string' ? Date.parse(a.updated_at) : 0;
			const bUpdated = typeof b.updated_at === 'string' ? Date.parse(b.updated_at) : 0;
			return (
				(Number.isFinite(bUpdated) ? bUpdated : 0) -
				(Number.isFinite(aUpdated) ? aUpdated : 0)
			);
		}

		if (sort.field === 'risk_score' && entityType === 'risks') {
			aVal = calculateRiskScore(a.impact as string, a.probability as number);
			bVal = calculateRiskScore(b.impact as string, b.probability as number);
		}

		if (sort.field === 'facet_stage' && entityType === 'plans') {
			aVal = STAGE_ORDER[String(a.facet_stage)] ?? 99;
			bVal = STAGE_ORDER[String(b.facet_stage)] ?? 99;
		}

		if (sort.field === 'impact' && entityType === 'risks') {
			aVal = IMPACT_ORDER[String(a.impact)] ?? 99;
			bVal = IMPACT_ORDER[String(b.impact)] ?? 99;
		}

		if (aVal == null && bVal == null) return 0;
		if (aVal == null) return 1;
		if (bVal == null) return -1;

		let comparison = 0;
		if (typeof aVal === 'string' && typeof bVal === 'string') {
			comparison = aVal.localeCompare(bVal);
		} else if (typeof aVal === 'number' && typeof bVal === 'number') {
			comparison = aVal - bVal;
		} else {
			comparison = String(aVal).localeCompare(String(bVal));
		}

		return sort.direction === 'asc' ? comparison : -comparison;
	});
}

export function filterAndSortInsightEntities<T extends GenericEntity>(
	items: T[],
	panelState: InsightPanelState,
	entityType: InsightPanelKey,
	options: {
		currentActorId: string | null;
		taskFocusActorId: string | null;
	}
): T[] {
	const filtered = items.filter((item) =>
		filterInsightEntity(item, panelState.filters, panelState.toggles, entityType, {
			currentActorId: options.currentActorId
		})
	);
	return sortInsightEntities(filtered, panelState.sort, entityType, {
		taskFocusActorId: options.taskFocusActorId
	});
}

export function updateInsightPanelFilters(
	panelStates: Record<InsightPanelKey, InsightPanelState>,
	panelKey: InsightPanelKey,
	filters: Record<string, string[]>
): Record<InsightPanelKey, InsightPanelState> {
	return {
		...panelStates,
		[panelKey]: {
			...panelStates[panelKey],
			filters
		}
	};
}

export function updateInsightPanelSort(
	panelStates: Record<InsightPanelKey, InsightPanelState>,
	panelKey: InsightPanelKey,
	sort: { field: string; direction: 'asc' | 'desc' }
): Record<InsightPanelKey, InsightPanelState> {
	return {
		...panelStates,
		[panelKey]: {
			...panelStates[panelKey],
			sort
		}
	};
}

export function updateInsightPanelToggle(
	panelStates: Record<InsightPanelKey, InsightPanelState>,
	panelKey: InsightPanelKey,
	toggleId: string,
	value: boolean
): Record<InsightPanelKey, InsightPanelState> {
	return {
		...panelStates,
		[panelKey]: {
			...panelStates[panelKey],
			toggles: {
				...panelStates[panelKey].toggles,
				[toggleId]: value
			}
		}
	};
}

export function calculateInsightPanelCounts(options: {
	tasks: Array<{ state_key?: string | null; deleted_at?: string | null }>;
	plans: Array<{ state_key?: string | null; deleted_at?: string | null }>;
	goals: Array<{ state_key?: string | null; deleted_at?: string | null }>;
	milestones: Milestone[];
	risks: Array<{ state_key?: string | null; deleted_at?: string | null }>;
	events: Array<{
		state_key?: string | null;
		deleted_at?: string | null;
		end_at?: string | null;
		start_at?: string | null;
	}>;
	images: Array<{ ocr_status?: string | null }>;
}): InsightPanelCounts {
	const { tasks, plans, goals, milestones, risks, events, images } = options;
	return {
		tasks: {
			showCompleted: tasks.filter((task) => task.state_key === 'done').length,
			showDeleted: tasks.filter((task) => task.deleted_at).length
		},
		plans: {
			showCompleted: plans.filter((plan) => plan.state_key === 'completed').length,
			showDeleted: plans.filter((plan) => plan.deleted_at).length
		},
		goals: {
			showAchieved: goals.filter((goal) => goal.state_key === 'achieved').length,
			showAbandoned: goals.filter((goal) => goal.state_key === 'abandoned').length,
			showDeleted: goals.filter((goal) => goal.deleted_at).length
		},
		milestones: {
			showCompleted: milestones.filter(
				(milestone) => resolveMilestoneState(milestone).state === 'completed'
			).length,
			showMissed: milestones.filter(
				(milestone) => resolveMilestoneState(milestone).state === 'missed'
			).length,
			showDeleted: milestones.filter((milestone) =>
				Boolean((milestone as GenericEntity).deleted_at)
			).length
		},
		risks: {
			showClosed: risks.filter((risk) => risk.state_key === 'closed').length,
			showDeleted: risks.filter((risk) => risk.deleted_at).length
		},
		events: {
			showPast: events.filter((event) => {
				const eventEnd = event.end_at
					? new Date(event.end_at)
					: event.start_at
						? new Date(event.start_at)
						: null;
				return eventEnd && eventEnd < new Date();
			}).length,
			showCancelled: events.filter((event) => event.state_key === 'cancelled').length,
			showDeleted: events.filter((event) => event.deleted_at).length
		},
		images: {
			showFailedOnly: images.filter((image) => image.ocr_status === 'failed').length
		}
	};
}
