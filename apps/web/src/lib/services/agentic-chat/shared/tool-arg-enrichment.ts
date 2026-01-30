// apps/web/src/lib/services/agentic-chat/shared/tool-arg-enrichment.ts
import type {
	OntologyContext,
	OntologyContextScope,
	OntologyEntityType
} from '$lib/types/agent-chat-enhancement';

type DisplayNameSources = {
	ontologyContext?: OntologyContext;
	locationMetadata?: Record<string, unknown>;
	contextScope?: OntologyContextScope;
};

type UpdateToolConfig = {
	kind: OntologyEntityType;
	idKey: string;
	displayKey: string;
	preferredArgKeys: string[];
};

const UPDATE_TOOL_CONFIG: Record<string, UpdateToolConfig> = {
	update_onto_project: {
		kind: 'project',
		idKey: 'project_id',
		displayKey: 'project_name',
		preferredArgKeys: ['project_name', 'name']
	},
	update_onto_task: {
		kind: 'task',
		idKey: 'task_id',
		displayKey: 'task_title',
		preferredArgKeys: ['task_title', 'title']
	},
	update_onto_goal: {
		kind: 'goal',
		idKey: 'goal_id',
		displayKey: 'goal_name',
		preferredArgKeys: ['goal_name', 'name']
	},
	update_onto_plan: {
		kind: 'plan',
		idKey: 'plan_id',
		displayKey: 'plan_name',
		preferredArgKeys: ['plan_name', 'name']
	},
	update_onto_document: {
		kind: 'document',
		idKey: 'document_id',
		displayKey: 'document_title',
		preferredArgKeys: ['document_title', 'title']
	},
	update_onto_milestone: {
		kind: 'milestone',
		idKey: 'milestone_id',
		displayKey: 'milestone_title',
		preferredArgKeys: ['milestone_title', 'title']
	},
	update_onto_risk: {
		kind: 'risk',
		idKey: 'risk_id',
		displayKey: 'risk_title',
		preferredArgKeys: ['risk_title', 'title']
	},
	update_onto_requirement: {
		kind: 'requirement',
		idKey: 'requirement_id',
		displayKey: 'requirement_text',
		preferredArgKeys: ['requirement_text', 'text']
	}
};

const ENTITY_PLURAL_KEYS: Record<OntologyEntityType, string> = {
	project: 'projects',
	task: 'tasks',
	goal: 'goals',
	plan: 'plans',
	document: 'documents',
	milestone: 'milestones',
	risk: 'risks',
	requirement: 'requirements'
};

function normalizeLabel(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function extractDisplayName(entity: Record<string, unknown>): string | undefined {
	return (
		normalizeLabel(entity.name) ||
		normalizeLabel(entity.title) ||
		normalizeLabel(entity.summary) ||
		normalizeLabel(entity.text)
	);
}

function resolveDisplayNameFromContext(
	entityId: string,
	entityKind: OntologyEntityType,
	sources: DisplayNameSources
): string | undefined {
	const locationMetadata = sources.locationMetadata ?? {};
	const scope = sources.contextScope ?? sources.ontologyContext?.scope;

	const focusedEntityId = normalizeLabel(locationMetadata.focusedEntityId);
	const focusedEntityName = normalizeLabel(locationMetadata.focusedEntityName);
	if (focusedEntityId && focusedEntityName && focusedEntityId === entityId) {
		return focusedEntityName;
	}

	if (entityKind === 'project' && normalizeLabel(locationMetadata.projectId) === entityId) {
		const projectName = normalizeLabel(locationMetadata.projectName);
		if (projectName) return projectName;
	}

	if (scope?.focus?.id === entityId && scope.focus?.name) {
		const scopedName = normalizeLabel(scope.focus.name);
		if (scopedName) return scopedName;
	}

	if (entityKind === 'project' && scope?.projectId === entityId && scope.projectName) {
		const scopedProjectName = normalizeLabel(scope.projectName);
		if (scopedProjectName) return scopedProjectName;
	}

	const entities = sources.ontologyContext?.entities;
	if (!entities) return undefined;

	const directEntity = (entities as Record<string, any>)[entityKind];
	if (directEntity && directEntity.id === entityId) {
		const directName = extractDisplayName(directEntity);
		if (directName) return directName;
	}

	const pluralKey = ENTITY_PLURAL_KEYS[entityKind];
	const collection = (entities as Record<string, any>)[pluralKey];
	if (Array.isArray(collection)) {
		const match = collection.find((item) => item && item.id === entityId);
		if (match) {
			const matchName = extractDisplayName(match);
			if (matchName) return matchName;
		}
	}

	return undefined;
}

function resolveArgDisplayName(
	args: Record<string, any>,
	preferredKeys: string[]
): string | undefined {
	for (const key of preferredKeys) {
		const value = normalizeLabel(args[key]);
		if (value) return value;
	}
	return undefined;
}

export function enrichOntologyUpdateArgs(
	toolName: string,
	args: Record<string, any>,
	sources: DisplayNameSources
): Record<string, any> {
	const config = UPDATE_TOOL_CONFIG[toolName];
	if (!config) return args;

	const entityId = args[config.idKey];
	if (typeof entityId !== 'string' || entityId.trim().length === 0) {
		return args;
	}

	const existingDisplay = resolveArgDisplayName(args, config.preferredArgKeys);
	const resolvedDisplay =
		existingDisplay ?? resolveDisplayNameFromContext(entityId, config.kind, sources);

	if (!resolvedDisplay) return args;

	if (normalizeLabel(args[config.displayKey])) {
		return args;
	}

	return {
		...args,
		[config.displayKey]: resolvedDisplay
	};
}

export function isOntologyUpdateTool(toolName: string): boolean {
	return toolName in UPDATE_TOOL_CONFIG;
}
