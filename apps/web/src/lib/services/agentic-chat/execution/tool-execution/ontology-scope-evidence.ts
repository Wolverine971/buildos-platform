// apps/web/src/lib/services/agentic-chat/execution/tool-execution/ontology-scope-evidence.ts
import { isValidUUID } from '$lib/utils/operations/validation-utils';

export type ProjectScopedOntologyKind =
	| 'project'
	| 'task'
	| 'goal'
	| 'plan'
	| 'document'
	| 'event'
	| 'milestone'
	| 'risk'
	| 'requirement';

export interface OntologyScopeEvidence {
	kind: ProjectScopedOntologyKind;
	entityId: string;
	projectId: string;
}

const TRUSTED_ONTOLOGY_READ_TOOLS = new Set([
	'list_onto_tasks',
	'list_onto_goals',
	'list_onto_documents',
	'list_onto_milestones',
	'list_onto_risks',
	'list_onto_plans',
	'list_onto_projects',
	'list_task_documents',
	'search_all_projects',
	'search_project',
	'search_onto_tasks',
	'search_onto_projects',
	'search_onto_documents',
	'search_onto_goals',
	'search_onto_plans',
	'search_onto_milestones',
	'search_onto_risks',
	'search_ontology',
	'get_onto_project_details',
	'get_onto_project_graph',
	'get_onto_task_details',
	'get_onto_goal_details',
	'get_onto_plan_details',
	'get_onto_document_details',
	'get_onto_milestone_details',
	'get_onto_risk_details',
	'get_calendar_event_details',
	'get_document_tree',
	'get_document_outline',
	'read_document_section',
	'get_project_overview',
	'get_workspace_overview'
]);

const COLLECTION_KIND_BY_KEY: Record<string, ProjectScopedOntologyKind> = {
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
	context_document: 'document',
	event: 'event',
	events: 'event',
	milestone: 'milestone',
	milestones: 'milestone',
	risk: 'risk',
	risks: 'risk',
	requirement: 'requirement',
	requirements: 'requirement'
};

const ENTITY_KIND_ALIASES: Record<string, ProjectScopedOntologyKind> = {
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

const DETAIL_TOOL_EXPECTATIONS: Record<
	string,
	{ kind: ProjectScopedOntologyKind; resultKey: string; argumentKey: string }
> = {
	get_onto_project_details: {
		kind: 'project',
		resultKey: 'project',
		argumentKey: 'project_id'
	},
	get_onto_task_details: { kind: 'task', resultKey: 'task', argumentKey: 'task_id' },
	get_onto_goal_details: { kind: 'goal', resultKey: 'goal', argumentKey: 'goal_id' },
	get_onto_plan_details: { kind: 'plan', resultKey: 'plan', argumentKey: 'plan_id' },
	get_onto_document_details: {
		kind: 'document',
		resultKey: 'document',
		argumentKey: 'document_id'
	},
	get_onto_milestone_details: {
		kind: 'milestone',
		resultKey: 'milestone',
		argumentKey: 'milestone_id'
	},
	get_onto_risk_details: { kind: 'risk', resultKey: 'risk', argumentKey: 'risk_id' },
	get_calendar_event_details: {
		kind: 'event',
		resultKey: 'event',
		argumentKey: 'onto_event_id'
	}
};

const DOCUMENT_PROJECTION_TOOLS = new Set(['get_document_outline', 'read_document_section']);

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readUuid(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	return isValidUUID(trimmed) ? trimmed : undefined;
}

function normalizeKind(value: unknown): ProjectScopedOntologyKind | undefined {
	if (typeof value !== 'string') return undefined;
	return ENTITY_KIND_ALIASES[
		value
			.trim()
			.toLowerCase()
			.replace(/^onto\./, '')
	];
}

function readRecordId(
	record: Record<string, unknown>,
	kind: ProjectScopedOntologyKind,
	mapKey?: string
): string | undefined {
	return (
		readUuid(record.id) ??
		readUuid(record[`${kind}_id`]) ??
		(kind === 'project' ? readUuid(record.project_id) : undefined) ??
		readUuid(mapKey)
	);
}

function readRecordProjectId(
	record: Record<string, unknown>,
	kind: ProjectScopedOntologyKind,
	entityId: string,
	fallbackProjectId?: string
): string | undefined {
	if (kind === 'project') return entityId;
	return readUuid(record.project_id) ?? readUuid(record.projectId) ?? fallbackProjectId;
}

/**
 * Extract entity ownership only from successful, server-backed ontology reads.
 * This deliberately ignores arbitrary tools and arbitrary nested objects: scope
 * evidence is security-sensitive and must come from a typed result location.
 */
export function extractOntologyScopeEvidence(params: {
	toolName: string;
	args: Record<string, unknown>;
	result: unknown;
}): OntologyScopeEvidence[] {
	if (!TRUSTED_ONTOLOGY_READ_TOOLS.has(params.toolName) || !isRecord(params.result)) {
		return [];
	}
	if (params.result.status === 'not_found') {
		return [];
	}

	const evidence = new Map<string, OntologyScopeEvidence>();
	const addRecord = (
		value: unknown,
		kind: ProjectScopedOntologyKind,
		fallbackProjectId?: string,
		options: { expectedId?: string; mapKey?: string } = {}
	): void => {
		if (!isRecord(value)) return;
		const entityId = readRecordId(value, kind, options.mapKey);
		if (!entityId || (options.expectedId && entityId !== options.expectedId)) return;
		const projectId = readRecordProjectId(value, kind, entityId, fallbackProjectId);
		if (!projectId) return;
		evidence.set(`${kind}:${entityId}:${projectId}`, { kind, entityId, projectId });
	};
	const addCollection = (
		value: unknown,
		kind: ProjectScopedOntologyKind,
		fallbackProjectId?: string
	): void => {
		if (Array.isArray(value)) {
			for (const entry of value) addRecord(entry, kind, fallbackProjectId);
			return;
		}
		if (!isRecord(value)) return;
		if (readRecordId(value, kind)) {
			addRecord(value, kind, fallbackProjectId);
			return;
		}
		for (const [mapKey, entry] of Object.entries(value)) {
			addRecord(entry, kind, fallbackProjectId, { mapKey });
		}
	};

	const root = params.result;
	const argumentProjectId = readUuid(params.args.project_id);
	const explicitEnvelopeProjectIds = new Set(
		[
			readUuid(root.project_id),
			isRecord(root.project) ? readUuid(root.project.id) : undefined,
			isRecord(root.match) ? readUuid(root.match.project_id) : undefined,
			isRecord(root.graph) && isRecord(root.graph.project)
				? readUuid(root.graph.project.id)
				: undefined,
			isRecord(root.metadata) ? readUuid(root.metadata.projectId) : undefined
		].filter((value): value is string => Boolean(value))
	);
	// Project-scoped endpoints bind their result to the requested project. If
	// explicit response envelopes disagree with each other or with that request,
	// treat the entire payload as malformed rather than deriving authorization
	// evidence from whichever field happened to win a precedence check.
	if (
		explicitEnvelopeProjectIds.size > 1 ||
		(argumentProjectId &&
			explicitEnvelopeProjectIds.size === 1 &&
			!explicitEnvelopeProjectIds.has(argumentProjectId))
	) {
		return [];
	}
	const resolvedRootProjectId =
		explicitEnvelopeProjectIds.values().next().value ?? argumentProjectId;

	const detailExpectation = DETAIL_TOOL_EXPECTATIONS[params.toolName];
	if (detailExpectation) {
		const expectedId = readUuid(params.args[detailExpectation.argumentKey]);
		addRecord(root[detailExpectation.resultKey], detailExpectation.kind, undefined, {
			expectedId
		});
	}

	if (DOCUMENT_PROJECTION_TOOLS.has(params.toolName)) {
		const documentId = readUuid(root.document_id);
		const projectId = readUuid(root.project_id);
		if (documentId && projectId) {
			evidence.set(`document:${documentId}:${projectId}`, {
				kind: 'document',
				entityId: documentId,
				projectId
			});
		}
	}

	for (const [key, kind] of Object.entries(COLLECTION_KIND_BY_KEY)) {
		// Detail tools have an exact requested-id contract. Do not re-process the
		// singular entity through the broader collection path, which would discard
		// that equality check or infer ownership from an argument fallback.
		if (detailExpectation?.resultKey === key) continue;
		const value = root[key];
		if (value === undefined) continue;
		addCollection(value, kind, resolvedRootProjectId);
	}

	if (Array.isArray(root.results)) {
		for (const result of root.results) {
			if (!isRecord(result)) continue;
			const kind = normalizeKind(result.type ?? result.entity_type ?? result.kind);
			if (kind) addRecord(result, kind);
		}
	}

	if (params.toolName === 'list_task_documents' && Array.isArray(root.documents)) {
		for (const linked of root.documents) {
			if (isRecord(linked)) addRecord(linked.document, 'document');
		}
		if (isRecord(root.scratch_pad)) addRecord(root.scratch_pad.document, 'document');
	}

	if (params.toolName === 'get_onto_project_graph' && isRecord(root.graph)) {
		for (const [key, kind] of Object.entries(COLLECTION_KIND_BY_KEY)) {
			const value = root.graph[key];
			if (value !== undefined) addCollection(value, kind, resolvedRootProjectId);
		}
		if (Array.isArray(root.graph.nodes)) {
			for (const node of root.graph.nodes) {
				if (!isRecord(node)) continue;
				const kind = normalizeKind(node.kind ?? node.type ?? node.entity_type);
				if (kind) addRecord(node, kind, resolvedRootProjectId);
			}
		}
	}

	if (params.toolName === 'get_document_tree' && resolvedRootProjectId) {
		const addTreeNodes = (nodes: unknown): void => {
			if (!Array.isArray(nodes)) return;
			for (const node of nodes) {
				addRecord(node, 'document', resolvedRootProjectId);
				if (isRecord(node)) addTreeNodes(node.children);
			}
		};
		if (isRecord(root.structure)) addTreeNodes(root.structure.root);
	}

	if (params.toolName === 'get_workspace_overview' && Array.isArray(root.projects)) {
		for (const project of root.projects) {
			if (!isRecord(project)) continue;
			const projectId = readUuid(project.id) ?? readUuid(project.project_id);
			if (projectId) addRecord(project.next_milestone, 'milestone', projectId);
		}
	}

	return [...evidence.values()];
}
