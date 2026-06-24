// apps/web/src/lib/services/agentic-chat/tools/core/entity-result-materialization.ts
type EntityKind = 'project' | 'task' | 'document' | 'goal' | 'plan' | 'milestone' | 'risk';

const MATERIALIZED_TOOLS_BY_KIND: Record<EntityKind, string[]> = {
	project: ['get_onto_project_details'],
	task: ['get_onto_task_details', 'list_task_documents'],
	document: ['get_document_outline', 'read_document_section', 'get_onto_document_details'],
	goal: ['get_onto_goal_details'],
	plan: ['get_onto_plan_details'],
	milestone: ['get_onto_milestone_details'],
	risk: ['get_onto_risk_details']
};

const COLLECTION_KIND_BY_KEY: Record<string, EntityKind> = {
	project: 'project',
	projects: 'project',
	task: 'task',
	tasks: 'task',
	document: 'document',
	documents: 'document',
	goal: 'goal',
	goals: 'goal',
	plan: 'plan',
	plans: 'plan',
	milestone: 'milestone',
	milestones: 'milestone',
	risk: 'risk',
	risks: 'risk'
};

export function inferMaterializedToolsFromEntityResults(payload: unknown): string[] {
	const kinds = new Set<EntityKind>();
	collectEntityKinds(payload, kinds);

	const tools: string[] = [];
	for (const kind of kinds) {
		for (const toolName of MATERIALIZED_TOOLS_BY_KIND[kind]) {
			if (!tools.includes(toolName)) {
				tools.push(toolName);
			}
		}
	}
	return tools;
}

function collectEntityKinds(
	value: unknown,
	kinds: Set<EntityKind>,
	collectionKind?: EntityKind
): void {
	if (!value || typeof value !== 'object') return;

	if (Array.isArray(value)) {
		for (const item of value) {
			collectEntityKinds(item, kinds, collectionKind);
		}
		return;
	}

	const record = value as Record<string, unknown>;
	const ownKind = normalizeEntityKind(record.type ?? record.entity_type ?? record.kind);
	if (ownKind) {
		kinds.add(ownKind);
	} else if (collectionKind && typeof record.id === 'string') {
		kinds.add(collectionKind);
	}

	for (const [key, nested] of Object.entries(record)) {
		const nestedCollectionKind = COLLECTION_KIND_BY_KEY[key] ?? undefined;
		if (nestedCollectionKind || key === 'results') {
			collectEntityKinds(nested, kinds, nestedCollectionKind);
		}
	}
}

function normalizeEntityKind(value: unknown): EntityKind | null {
	if (typeof value !== 'string') return null;
	const normalized = value.trim().toLowerCase();
	if (normalized === 'project' || normalized === 'projects') return 'project';
	if (normalized === 'task' || normalized === 'tasks') return 'task';
	if (normalized === 'document' || normalized === 'documents' || normalized === 'doc') {
		return 'document';
	}
	if (normalized === 'goal' || normalized === 'goals') return 'goal';
	if (normalized === 'plan' || normalized === 'plans') return 'plan';
	if (normalized === 'milestone' || normalized === 'milestones') return 'milestone';
	if (normalized === 'risk' || normalized === 'risks') return 'risk';
	return null;
}
