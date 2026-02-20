// apps/web/src/lib/components/ontology/insight-panels/task-assignee-filter.ts
import { ASSIGNEE_FILTER_ME, ASSIGNEE_FILTER_UNASSIGNED } from './insight-panel-config';

export type TaskAssigneeLike = {
	actor_id?: string | null;
};

export function taskMatchesAssigneeFilter({
	selectedValues,
	currentActorId,
	assignees
}: {
	selectedValues: string[];
	currentActorId?: string | null;
	assignees: TaskAssigneeLike[];
}): boolean {
	if (!selectedValues || selectedValues.length === 0) {
		return true;
	}

	const taskAssigneeIds = assignees
		.map((assignee) => assignee.actor_id)
		.filter((actorId): actorId is string => Boolean(actorId));
	const includeUnassigned = selectedValues.includes(ASSIGNEE_FILTER_UNASSIGNED);

	const selectedActorIds = selectedValues
		.map((value) => {
			if (value === ASSIGNEE_FILTER_ME) return currentActorId ?? null;
			if (value === ASSIGNEE_FILTER_UNASSIGNED) return null;
			return value;
		})
		.filter((actorId): actorId is string => Boolean(actorId));

	const matchesActor = taskAssigneeIds.some((actorId) => selectedActorIds.includes(actorId));
	const isUnassigned = taskAssigneeIds.length === 0;

	return matchesActor || (includeUnassigned && isUnassigned);
}
