// apps/web/src/lib/components/project/project-entity-modal-loader.ts
import type { EntityOpenAction } from './project-page-interactions';

type ProjectEntityModalKind = Extract<
	EntityOpenAction['kind'],
	'task' | 'document' | 'goal' | 'plan' | 'milestone' | 'risk' | 'event'
>;

let taskEditModalPromise: ReturnType<typeof importTaskEditModal> | null = null;
let documentModalPromise: ReturnType<typeof importDocumentModal> | null = null;
let goalEditModalPromise: ReturnType<typeof importGoalEditModal> | null = null;
let planEditModalPromise: ReturnType<typeof importPlanEditModal> | null = null;
let milestoneEditModalPromise: ReturnType<typeof importMilestoneEditModal> | null = null;
let riskEditModalPromise: ReturnType<typeof importRiskEditModal> | null = null;
let eventEditModalPromise: ReturnType<typeof importEventEditModal> | null = null;

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

function importMilestoneEditModal() {
	return import('$lib/components/ontology/MilestoneEditModal.svelte');
}

function importRiskEditModal() {
	return import('$lib/components/ontology/RiskEditModal.svelte');
}

function importEventEditModal() {
	return import('$lib/components/ontology/EventEditModal.svelte');
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

export function loadMilestoneEditModal() {
	return (milestoneEditModalPromise ??= importMilestoneEditModal().catch((error) => {
		milestoneEditModalPromise = null;
		throw error;
	}));
}

export function loadRiskEditModal() {
	return (riskEditModalPromise ??= importRiskEditModal().catch((error) => {
		riskEditModalPromise = null;
		throw error;
	}));
}

export function loadEventEditModal() {
	return (eventEditModalPromise ??= importEventEditModal().catch((error) => {
		eventEditModalPromise = null;
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
		case 'milestone':
			return loadMilestoneEditModal();
		case 'risk':
			return loadRiskEditModal();
		case 'event':
			return loadEventEditModal();
		default:
			return Promise.resolve();
	}
}

function isProjectEntityModalKind(value: string): value is ProjectEntityModalKind {
	return (
		value === 'task' ||
		value === 'document' ||
		value === 'goal' ||
		value === 'plan' ||
		value === 'milestone' ||
		value === 'risk' ||
		value === 'event'
	);
}
