// apps/web/src/lib/services/agentic-chat/execution/tool-execution/scope-guards.ts
import type { ChatToolDefinition } from '@buildos/shared-types';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import type { ServiceContext, ToolExecutionResult } from '../../shared/types';
import { resolveProjectIdFromContext } from './argument-pipeline';
import type { ToolArguments } from './argument-values';
import type { ProjectScopedOntologyKind } from './ontology-scope-evidence';
import { ONTOLOGY_UPDATE_TOOL_PREFIX } from './schema-custom-validations';
import { getToolDefinition, toolDefinitionSupportsProjectId } from './schema-validator';

interface EntityScopeCheck {
	argKey: string;
	kind: ProjectScopedOntologyKind;
	id: string;
}

interface ScopeGuardParams {
	toolName: string;
	args: ToolArguments;
	context: ServiceContext;
	toolCallId: string;
}

const PROJECT_SCOPED_ID_ARG_KINDS: Readonly<Record<string, ProjectScopedOntologyKind>> = {
	project_id: 'project',
	task_id: 'task',
	goal_id: 'goal',
	plan_id: 'plan',
	document_id: 'document',
	onto_event_id: 'event',
	milestone_id: 'milestone',
	risk_id: 'risk',
	parent_id: 'document',
	parent_document_id: 'document',
	new_parent_id: 'document',
	supporting_milestone_id: 'milestone'
};

const ENTITY_KIND_ALIASES: Readonly<Record<string, ProjectScopedOntologyKind>> = {
	project: 'project',
	projects: 'project',
	task: 'task',
	tasks: 'task',
	goal: 'goal',
	goals: 'goal',
	plan: 'plan',
	plans: 'plan',
	document: 'document',
	documents: 'document',
	doc: 'document',
	docs: 'document',
	event: 'event',
	events: 'event',
	milestone: 'milestone',
	milestones: 'milestone',
	risk: 'risk',
	risks: 'risk',
	requirement: 'requirement',
	requirements: 'requirement'
};

const ENTITY_PLURAL_KEYS: Readonly<Partial<Record<ProjectScopedOntologyKind, string>>> = {
	project: 'projects',
	task: 'tasks',
	goal: 'goals',
	plan: 'plans',
	document: 'documents',
	event: 'events',
	milestone: 'milestones',
	risk: 'risks',
	requirement: 'requirements'
};

export function guardProjectIdMatchesContextScope(
	params: ScopeGuardParams & { availableTools: ChatToolDefinition[] }
): ToolExecutionResult | null {
	const { toolName, args, context, toolCallId, availableTools } = params;
	if (toolName === 'move_onto_task') {
		const scopedProjectId = resolveProjectIdFromContext(context);
		const expectedSourceProjectId = readTrimmedString(args.expected_source_project_id);
		const destinationProjectId = readTrimmedString(args.destination_project_id);

		if (
			!isValidUUID(expectedSourceProjectId) ||
			!isValidUUID(destinationProjectId) ||
			expectedSourceProjectId === destinationProjectId
		) {
			return validationError(
				toolName,
				toolCallId,
				'move_onto_task requires different, valid expected_source_project_id and destination_project_id UUIDs.'
			);
		}

		if (scopedProjectId && expectedSourceProjectId !== scopedProjectId) {
			return validationError(
				toolName,
				toolCallId,
				'move_onto_task expected_source_project_id must match the current project focus. The destination may be another writable project.'
			);
		}
		return null;
	}

	if (!toolDefinitionSupportsProjectId(getToolDefinition(toolName, availableTools))) {
		return null;
	}

	const scopedProjectId = resolveProjectIdFromContext(context);
	const requestedProjectId = readTrimmedString(args.project_id);
	if (!scopedProjectId || !isValidUUID(scopedProjectId) || !requestedProjectId) return null;
	if (!isValidUUID(requestedProjectId)) {
		return validationError(
			toolName,
			toolCallId,
			'Tool project_id must be a valid UUID in the current project focus.'
		);
	}
	if (requestedProjectId === scopedProjectId) return null;

	return validationError(
		toolName,
		toolCallId,
		'Tool project_id does not match the current project focus. Switch focus or ask for explicit cross-project confirmation before using another project.'
	);
}

export function guardEntityIdsMatchContextScope(
	params: ScopeGuardParams & {
		sameTurnEntityProjectIds: ReadonlyMap<string, string | null>;
	}
): ToolExecutionResult | null {
	const { toolName, args, context, toolCallId, sameTurnEntityProjectIds } = params;
	const scopedProjectId = resolveProjectIdFromContext(context);
	if (!scopedProjectId || !isValidUUID(scopedProjectId)) return null;

	const requiresKnownProject = requiresKnownProjectForEntityIdMutation(toolName);
	const seen = new Set<string>();
	for (const check of collectEntityScopeChecks(args)) {
		const key = `${check.kind}:${check.id}`;
		if (seen.has(key)) continue;
		seen.add(key);

		const knownProjectId = resolveKnownEntityProjectId({
			context,
			kind: check.kind,
			entityId: check.id,
			sameTurnEntityProjectIds
		});
		if (!knownProjectId) {
			if (requiresKnownProject && check.kind !== 'project') {
				return validationError(
					toolName,
					toolCallId,
					`Tool ${check.argKey} is not known to belong to the current project focus. Load or resolve the entity in the current project before mutating it.`
				);
			}
			continue;
		}
		if (knownProjectId === scopedProjectId) continue;

		return validationError(
			toolName,
			toolCallId,
			`Tool ${check.argKey} belongs to a different project than the current project focus. Switch focus or ask for explicit cross-project confirmation before using another project.`
		);
	}

	return null;
}

export function normalizeProjectScopedEntityKind(
	value: unknown
): ProjectScopedOntologyKind | undefined {
	if (typeof value !== 'string') return undefined;
	const normalized = value.trim().toLowerCase().replace(/_/g, '-');
	return ENTITY_KIND_ALIASES[normalized];
}

export function requiresKnownProjectForEntityIdMutation(toolName: string): boolean {
	if (toolName.startsWith(ONTOLOGY_UPDATE_TOOL_PREFIX)) return true;
	if (toolName.startsWith('delete_onto_')) return true;
	if (toolName === 'delete_calendar_event') return true;
	if (toolName.startsWith('create_onto_') && toolName !== 'create_onto_project') return true;
	return (
		toolName === 'create_task_document' ||
		toolName === 'link_onto_entities' ||
		toolName === 'move_document_in_tree' ||
		toolName === 'move_onto_task' ||
		toolName === 'tag_onto_entity'
	);
}

function collectEntityScopeChecks(args: ToolArguments): EntityScopeCheck[] {
	const checks: EntityScopeCheck[] = [];
	const addCheck = (
		argKey: string,
		kind: ProjectScopedOntologyKind | undefined,
		value: unknown
	): void => {
		if (!kind || typeof value !== 'string') return;
		const id = value.trim();
		if (id && isValidUUID(id)) checks.push({ argKey, kind, id });
	};

	for (const [argKey, kind] of Object.entries(PROJECT_SCOPED_ID_ARG_KINDS)) {
		addCheck(argKey, kind, args[argKey]);
	}
	addCheck(
		'entity_id',
		normalizeProjectScopedEntityKind(
			args.entity_kind ?? args.entity_type ?? args.entityType ?? args.kind
		),
		args.entity_id
	);
	addCheck('src_id', normalizeProjectScopedEntityKind(args.src_kind), args.src_id);
	addCheck('dst_id', normalizeProjectScopedEntityKind(args.dst_kind), args.dst_id);
	return checks;
}

function resolveKnownEntityProjectId(params: {
	context: ServiceContext;
	kind: ProjectScopedOntologyKind;
	entityId: string;
	sameTurnEntityProjectIds: ReadonlyMap<string, string | null>;
}): string | null | undefined {
	const { context, kind, entityId, sameTurnEntityProjectIds } = params;
	if (kind === 'project') return isValidUUID(entityId) ? entityId : undefined;

	const sameTurnKey = `${kind}:${entityId}`;
	if (sameTurnEntityProjectIds.has(sameTurnKey)) {
		return sameTurnEntityProjectIds.get(sameTurnKey);
	}

	const focusProjectId = resolveProjectIdFromProjectFocus(context, kind, entityId);
	if (focusProjectId) return focusProjectId;
	const contextScopeProjectId = resolveProjectIdFromScope(context.contextScope, kind, entityId);
	if (contextScopeProjectId) return contextScopeProjectId;
	const ontologyScopeProjectId = resolveProjectIdFromScope(
		context.ontologyContext?.scope,
		kind,
		entityId
	);
	if (ontologyScopeProjectId) return ontologyScopeProjectId;
	return resolveProjectIdFromOntologyContext(context, kind, entityId);
}

function resolveProjectIdFromProjectFocus(
	context: ServiceContext,
	kind: ProjectScopedOntologyKind,
	entityId: string
): string | undefined {
	const focus = context.projectFocus;
	if (!focus || focus.focusType !== kind || focus.focusEntityId !== entityId) return undefined;
	return typeof focus.projectId === 'string' && isValidUUID(focus.projectId)
		? focus.projectId
		: undefined;
}

function resolveProjectIdFromScope(
	scope: ServiceContext['contextScope'],
	kind: ProjectScopedOntologyKind,
	entityId: string
): string | undefined {
	if (scope?.focus?.type !== kind || scope.focus.id !== entityId) return undefined;
	return typeof scope.projectId === 'string' && isValidUUID(scope.projectId)
		? scope.projectId
		: undefined;
}

function resolveProjectIdFromOntologyContext(
	context: ServiceContext,
	kind: ProjectScopedOntologyKind,
	entityId: string
): string | undefined {
	const ontologyContext = context.ontologyContext;
	const entities = ontologyContext?.entities;
	if (!entities) return undefined;

	const scopedProjectId = ontologyContext.scope?.projectId;
	const fallbackProjectId =
		typeof scopedProjectId === 'string' && isValidUUID(scopedProjectId)
			? scopedProjectId
			: undefined;
	const entityRecord = entities as unknown as Record<string, unknown>;
	const directProjectId = resolveProjectIdFromEntityRecord(
		entityRecord[kind],
		kind,
		entityId,
		fallbackProjectId
	);
	if (directProjectId) return directProjectId;

	const pluralKey = ENTITY_PLURAL_KEYS[kind];
	const collection = pluralKey ? entityRecord[pluralKey] : undefined;
	if (Array.isArray(collection)) {
		for (const item of collection) {
			const itemProjectId = resolveProjectIdFromEntityRecord(
				item,
				kind,
				entityId,
				fallbackProjectId
			);
			if (itemProjectId) return itemProjectId;
		}
	}

	if (ontologyGraphContainsEntity(context, kind, entityId)) return fallbackProjectId;
	if (kind === 'document' && documentTreeContainsEntity(context, entityId)) {
		return fallbackProjectId;
	}
	return undefined;
}

function resolveProjectIdFromEntityRecord(
	record: unknown,
	kind: ProjectScopedOntologyKind,
	entityId: string,
	fallbackProjectId?: string
): string | undefined {
	if (!record || typeof record !== 'object' || Array.isArray(record)) return undefined;
	const item = record as Record<string, unknown>;
	if (item.id !== entityId) return undefined;
	if (kind === 'project') return isValidUUID(entityId) ? entityId : undefined;
	const projectId = item.project_id ?? item.projectId;
	return typeof projectId === 'string' && isValidUUID(projectId) ? projectId : fallbackProjectId;
}

function ontologyGraphContainsEntity(
	context: ServiceContext,
	kind: ProjectScopedOntologyKind,
	entityId: string
): boolean {
	const nodes = context.ontologyContext?.metadata?.graph_snapshot?.nodes;
	return Array.isArray(nodes)
		? nodes.some((node) => node?.id === entityId && node.kind === kind)
		: false;
}

function documentTreeContainsEntity(context: ServiceContext, entityId: string): boolean {
	const root = context.ontologyContext?.metadata?.document_tree?.root;
	const contains = (nodes: unknown): boolean => {
		if (!Array.isArray(nodes)) return false;
		for (const node of nodes) {
			if (!node || typeof node !== 'object') continue;
			const record = node as Record<string, unknown>;
			if (record.id === entityId || contains(record.children)) return true;
		}
		return false;
	};
	return contains(root);
}

function readTrimmedString(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

function validationError(toolName: string, toolCallId: string, error: string): ToolExecutionResult {
	return { success: false, error, errorType: 'validation_error', toolName, toolCallId };
}
