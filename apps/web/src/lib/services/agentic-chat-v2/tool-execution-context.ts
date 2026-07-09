// apps/web/src/lib/services/agentic-chat-v2/tool-execution-context.ts
import type {
	AgentTimingSummary,
	ChatContextType,
	ContextShiftPayload
} from '@buildos/shared-types';
import type { ServiceContext } from '$lib/services/agentic-chat/shared/types';
import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';

export type FastChatResolvedPromptContext = {
	contextType: ChatContextType;
	entityId?: string | null;
	projectId?: string | null;
	projectName?: string | null;
	focusEntityType?: string | null;
	focusEntityId?: string | null;
	focusEntityName?: string | null;
	contextLoadSource?: AgentTimingSummary['context_load_source'];
	conversationSummary?: string | null;
	entityResolutionHint?: string | null;
	data?: Record<string, unknown> | string | null;
};

type ToolExecutionEntityKind =
	| 'project'
	| 'task'
	| 'goal'
	| 'plan'
	| 'document'
	| 'milestone'
	| 'risk'
	| 'requirement';

const TOOL_EXECUTION_ENTITY_KIND_ALIASES: Record<string, ToolExecutionEntityKind> = {
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
	milestone: 'milestone',
	milestones: 'milestone',
	risk: 'risk',
	risks: 'risk',
	requirement: 'requirement',
	requirements: 'requirement'
};

const TOOL_EXECUTION_ENTITY_COLLECTION_KEYS: Partial<Record<ToolExecutionEntityKind, string>> = {
	project: 'projects',
	task: 'tasks',
	goal: 'goals',
	plan: 'plans',
	document: 'documents',
	milestone: 'milestones',
	risk: 'risks',
	requirement: 'requirements'
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readMetadataString(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeToolExecutionEntityKind(value: unknown): ToolExecutionEntityKind | null {
	if (typeof value !== 'string') return null;
	const normalized = value.trim().toLowerCase();
	return TOOL_EXECUTION_ENTITY_KIND_ALIASES[normalized] ?? null;
}

function addToolExecutionEntityRecord(
	entities: Record<string, any>,
	kind: ToolExecutionEntityKind,
	record: Record<string, unknown>
): void {
	const id = readMetadataString(record.id);
	if (!id) return;

	if (kind === 'project') {
		entities.project = entities.project ?? record;
	} else {
		entities[kind] = entities[kind] ?? record;
	}

	const collectionKey = TOOL_EXECUTION_ENTITY_COLLECTION_KEYS[kind];
	if (!collectionKey) return;
	const collection = Array.isArray(entities[collectionKey]) ? entities[collectionKey] : [];
	if (!collection.some((item: unknown) => isPlainRecord(item) && item.id === id)) {
		collection.push(record);
	}
	entities[collectionKey] = collection;
}

function addToolExecutionEntityCollection(
	entities: Record<string, any>,
	kind: ToolExecutionEntityKind,
	value: unknown
): void {
	if (!Array.isArray(value)) return;
	for (const item of value) {
		if (isPlainRecord(item)) {
			addToolExecutionEntityRecord(entities, kind, item);
		}
	}
}

function findToolExecutionEntityRecord(params: {
	data: Record<string, unknown> | null;
	kind: ToolExecutionEntityKind;
	id: string;
}): Record<string, unknown> | null {
	const { data, kind, id } = params;
	if (!data) return null;

	const matchesId = (record: unknown): record is Record<string, unknown> =>
		isPlainRecord(record) && readMetadataString(record.id) === id;

	if (kind === 'project' && matchesId(data.project)) {
		return data.project;
	}

	const focusEntityKind = normalizeToolExecutionEntityKind(data.focus_entity_type);
	if (focusEntityKind === kind && matchesId(data.focus_entity_full)) {
		return data.focus_entity_full;
	}

	const collectionKey = TOOL_EXECUTION_ENTITY_COLLECTION_KEYS[kind];
	const searchCollection = (collection: unknown): Record<string, unknown> | null => {
		if (!Array.isArray(collection)) return null;
		return collection.find(matchesId) ?? null;
	};

	if (collectionKey) {
		const directMatch = searchCollection(data[collectionKey]);
		if (directMatch) return directMatch;
	}

	const linkedEntities = isPlainRecord(data.linked_entities) ? data.linked_entities : null;
	if (!linkedEntities) return null;

	const linkedKeys = [kind, collectionKey].filter(Boolean) as string[];
	for (const key of linkedKeys) {
		const linkedMatch = searchCollection(linkedEntities[key]);
		if (linkedMatch) return linkedMatch;
	}

	return null;
}

export function buildToolExecutionContextScope(params: {
	projectId?: string | null;
	projectName?: string | null;
	projectFocus?: ProjectFocus | null;
	promptContext?: FastChatResolvedPromptContext;
}): ServiceContext['contextScope'] {
	const projectId = readMetadataString(params.projectId ?? params.promptContext?.projectId);
	if (!projectId) return undefined;

	const projectName =
		readMetadataString(params.projectName) ??
		readMetadataString(params.promptContext?.projectName) ??
		undefined;
	const focusKind = normalizeToolExecutionEntityKind(
		params.projectFocus?.focusType === 'project-wide'
			? null
			: (params.projectFocus?.focusType ?? params.promptContext?.focusEntityType)
	);
	const focusId = readMetadataString(
		params.projectFocus?.focusEntityId ?? params.promptContext?.focusEntityId
	);
	const focusName =
		readMetadataString(params.projectFocus?.focusEntityName) ??
		readMetadataString(params.promptContext?.focusEntityName) ??
		undefined;

	return {
		projectId,
		projectName,
		...(focusKind && focusKind !== 'project' && focusId
			? {
					focus: {
						type: focusKind as Exclude<ToolExecutionEntityKind, 'project'>,
						id: focusId,
						name: focusName
					}
				}
			: {})
	};
}

function countToolExecutionDocumentTreeNodes(nodes: unknown): number {
	if (!Array.isArray(nodes)) return 0;
	let count = 0;
	for (const node of nodes) {
		if (!isPlainRecord(node)) continue;
		count += 1;
		count += countToolExecutionDocumentTreeNodes(node.children);
	}
	return count;
}

function buildFocusedToolExecutionEntityRecord(params: {
	data: Record<string, unknown> | null;
	focus: NonNullable<NonNullable<ServiceContext['contextScope']>['focus']>;
}): Record<string, unknown> {
	const existing = findToolExecutionEntityRecord({
		data: params.data,
		kind: params.focus.type,
		id: params.focus.id
	});
	return {
		...(existing ?? {}),
		id: params.focus.id,
		...(params.focus.name &&
		!readMetadataString(existing?.name) &&
		!readMetadataString(existing?.title)
			? { name: params.focus.name }
			: {})
	};
}

export function buildToolExecutionOntologyContext(params: {
	promptContext?: FastChatResolvedPromptContext;
	contextScope?: ServiceContext['contextScope'];
}): ServiceContext['ontologyContext'] | undefined {
	const projectId = readMetadataString(
		params.contextScope?.projectId ?? params.promptContext?.projectId
	);
	if (!projectId) return undefined;

	const rawData = isPlainRecord(params.promptContext?.data) ? params.promptContext.data : null;
	const rawDataProjectId =
		readMetadataString(isPlainRecord(rawData?.project) ? rawData.project.id : null) ??
		readMetadataString(params.promptContext?.projectId);
	const data = !rawDataProjectId || rawDataProjectId === projectId ? rawData : null;
	const entities: Record<string, any> = {};
	const projectName =
		readMetadataString(params.contextScope?.projectName ?? params.promptContext?.projectName) ??
		'Project';
	const focus = params.contextScope?.focus;
	const shouldUseFocusedNeighborhood = Boolean(focus?.id);

	if (data) {
		if (isPlainRecord(data.project)) {
			addToolExecutionEntityRecord(entities, 'project', {
				...data.project,
				id: readMetadataString(data.project.id) ?? projectId
			});
		}

		if (shouldUseFocusedNeighborhood && focus) {
			addToolExecutionEntityRecord(
				entities,
				focus.type,
				buildFocusedToolExecutionEntityRecord({ data, focus })
			);
		} else {
			addToolExecutionEntityCollection(entities, 'goal', data.goals);
			addToolExecutionEntityCollection(entities, 'milestone', data.milestones);
			addToolExecutionEntityCollection(entities, 'plan', data.plans);
			addToolExecutionEntityCollection(entities, 'task', data.tasks);
			addToolExecutionEntityCollection(entities, 'document', data.documents);
			addToolExecutionEntityCollection(entities, 'risk', data.risks);
		}

		const linkedEntities = isPlainRecord(data.linked_entities) ? data.linked_entities : null;
		if (linkedEntities) {
			for (const [key, value] of Object.entries(linkedEntities)) {
				const kind = normalizeToolExecutionEntityKind(key);
				if (kind) {
					addToolExecutionEntityCollection(entities, kind, value);
				}
			}
		}

		const focusKind = shouldUseFocusedNeighborhood
			? null
			: normalizeToolExecutionEntityKind(
					data.focus_entity_type ?? params.promptContext?.focusEntityType
				);
		const focusId = shouldUseFocusedNeighborhood
			? null
			: readMetadataString(data.focus_entity_id ?? params.promptContext?.focusEntityId);
		if (focusKind && focusId) {
			const focusFull = isPlainRecord(data.focus_entity_full) ? data.focus_entity_full : {};
			addToolExecutionEntityRecord(entities, focusKind, {
				...focusFull,
				id: readMetadataString(focusFull.id) ?? focusId
			});
		}
	}

	if (!entities.project) {
		addToolExecutionEntityRecord(entities, 'project', {
			id: projectId,
			name: projectName
		});
	}

	const docStructure = data && isPlainRecord(data.doc_structure) ? data.doc_structure : null;
	const documentRoot = docStructure?.root;
	const includeDocumentTree =
		!shouldUseFocusedNeighborhood ||
		params.contextScope?.focus?.type === 'document' ||
		Boolean(
			Array.isArray(documentRoot) &&
				params.contextScope?.focus?.id &&
				findToolExecutionEntityRecord({
					data,
					kind: 'document',
					id: params.contextScope.focus.id
				})
		);
	const metadata =
		includeDocumentTree && docStructure && Array.isArray(documentRoot)
			? {
					document_tree: {
						version:
							typeof docStructure.version === 'number' ? docStructure.version : 1,
						root: documentRoot,
						total_nodes: countToolExecutionDocumentTreeNodes(documentRoot)
					}
				}
			: {};

	return {
		type: 'project',
		entities: entities as NonNullable<ServiceContext['ontologyContext']>['entities'],
		metadata: metadata as NonNullable<ServiceContext['ontologyContext']>['metadata'],
		scope: {
			projectId,
			projectName,
			focus: params.contextScope?.focus
		}
	};
}

export function buildToolExecutionProjectFocus(params: {
	projectFocus?: ProjectFocus | null;
	promptContext?: FastChatResolvedPromptContext;
	latestContextShift?: ContextShiftPayload | null;
	projectId?: string | null;
}): ProjectFocus | null {
	const contextShift = params.latestContextShift;
	if (contextShift?.entity_type && contextShift.entity_type !== 'workspace') {
		const shiftedProjectId =
			contextShift.entity_type === 'project'
				? readMetadataString(contextShift.entity_id)
				: (readMetadataString(params.projectFocus?.projectId) ??
					readMetadataString(params.promptContext?.projectId) ??
					readMetadataString(params.projectId));
		if (!shiftedProjectId) return params.projectFocus ?? null;
		const shiftedProjectName =
			contextShift.entity_type === 'project'
				? contextShift.entity_name
				: (params.projectFocus?.projectName ??
					params.promptContext?.projectName ??
					'Project');
		return {
			focusType:
				contextShift.entity_type === 'project' ? 'project-wide' : contextShift.entity_type,
			focusEntityId: contextShift.entity_type === 'project' ? null : contextShift.entity_id,
			focusEntityName:
				contextShift.entity_type === 'project' ? null : contextShift.entity_name,
			projectId: shiftedProjectId,
			projectName: shiftedProjectName ?? 'Project'
		};
	}

	return params.projectFocus ?? null;
}
