import type { EntityOpenAction } from './project-page-interactions';

type ProjectEntityModalKind = Extract<
	EntityOpenAction['kind'],
	'task' | 'document' | 'goal' | 'plan'
>;

let taskEditModalPromise: ReturnType<typeof importTaskEditModal> | null = null;
let documentModalPromise: ReturnType<typeof importDocumentModal> | null = null;
let goalEditModalPromise: ReturnType<typeof importGoalEditModal> | null = null;
let planEditModalPromise: ReturnType<typeof importPlanEditModal> | null = null;

function importTaskEditModal() {
	return import('$lib/components/ontology/TaskEditModal.svelte');
}

function importDocumentModal() {
	return import('$lib/components/ontology/DocumentModal.svelte');
}

function importGoalEditModal() {
	return import('$lib/components/ontology/GoalEditModal.svelte');
}

function importPlanEditModal() {
	return import('$lib/components/ontology/PlanEditModal.svelte');
}

export function loadTaskEditModal() {
	return (taskEditModalPromise ??= importTaskEditModal().catch((error) => {
		taskEditModalPromise = null;
		throw error;
	}));
}

export function loadDocumentModal() {
	return (documentModalPromise ??= importDocumentModal().catch((error) => {
		documentModalPromise = null;
		throw error;
	}));
}

export function loadGoalEditModal() {
	return (goalEditModalPromise ??= importGoalEditModal().catch((error) => {
		goalEditModalPromise = null;
		throw error;
	}));
}

export function loadPlanEditModal() {
	return (planEditModalPromise ??= importPlanEditModal().catch((error) => {
		planEditModalPromise = null;
		throw error;
	}));
}

export function preloadProjectEntityModal(entityType: string): Promise<unknown> {
	const normalizedType: ProjectEntityModalKind | null =
		entityType === 'note'
			? 'document'
			: isProjectEntityModalKind(entityType)
				? entityType
				: null;

	switch (normalizedType) {
		case 'task':
			return loadTaskEditModal();
		case 'document':
			return loadDocumentModal();
		case 'goal':
			return loadGoalEditModal();
		case 'plan':
			return loadPlanEditModal();
		default:
			return Promise.resolve();
	}
}

function isProjectEntityModalKind(value: string): value is ProjectEntityModalKind {
	return value === 'task' || value === 'document' || value === 'goal' || value === 'plan';
}
