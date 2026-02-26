import { PERSON_FILTER_ME } from './insight-panel-config';

export type TaskPersonAssigneeLike = {
	actor_id?: string | null;
};

export function resolveTaskPersonFocusActorId({
	selectedValues,
	currentActorId
}: {
	selectedValues: string[] | undefined;
	currentActorId?: string | null;
}): string | null {
	const selectedValue = selectedValues?.[0] ?? null;
	if (!selectedValue || selectedValue === PERSON_FILTER_ME) {
		return currentActorId ?? null;
	}
	return selectedValue;
}

export function getTaskPersonRelevanceScore({
	focusActorId,
	assignees,
	createdByActorId,
	lastChangedByActorId
}: {
	focusActorId?: string | null;
	assignees: TaskPersonAssigneeLike[];
	createdByActorId?: string | null;
	lastChangedByActorId?: string | null;
}): number {
	if (!focusActorId) return 0;

	const isAssignedToFocus = assignees.some((assignee) => assignee.actor_id === focusActorId);
	if (isAssignedToFocus) return 2;

	if (createdByActorId === focusActorId || lastChangedByActorId === focusActorId) {
		return 1;
	}

	return 0;
}

export function taskMatchesPersonFocusFilter({
	selectedValues,
	currentActorId,
	assignees,
	createdByActorId,
	lastChangedByActorId
}: {
	selectedValues: string[];
	currentActorId?: string | null;
	assignees: TaskPersonAssigneeLike[];
	createdByActorId?: string | null;
	lastChangedByActorId?: string | null;
}): boolean {
	if (!selectedValues || selectedValues.length === 0) {
		return true;
	}

	return selectedValues.some((value) => {
		const focusActorId = value === PERSON_FILTER_ME ? (currentActorId ?? null) : value;
		if (!focusActorId) return false;
		return (
			getTaskPersonRelevanceScore({
				focusActorId,
				assignees,
				createdByActorId,
				lastChangedByActorId
			}) > 0
		);
	});
}

export function getTaskPersonRelevanceLabel(score: number): 'Assigned' | 'Created/Updated' | 'Other' {
	if (score >= 2) return 'Assigned';
	if (score >= 1) return 'Created/Updated';
	return 'Other';
}
