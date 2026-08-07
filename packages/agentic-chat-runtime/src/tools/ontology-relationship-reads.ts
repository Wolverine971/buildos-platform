// packages/agentic-chat-runtime/src/tools/ontology-relationship-reads.ts
// Phase 4 Slice 18 S3-T11: project-fenced ontology relationship reads.

import { AgenticChatToolAccessDeniedError } from './access-port';
import type { AgenticChatSharedReadContextV1 } from './ontology-reads';

export type SharedRelationshipEntityKind =
	| 'project'
	| 'task'
	| 'plan'
	| 'goal'
	| 'document'
	| 'milestone'
	| 'risk'
	| 'requirement';

export interface SharedGetEntityRelationshipsArgs {
	entity_id: string;
	direction?: 'outgoing' | 'incoming' | 'both';
}

type RelationshipEntityConfig = {
	table: string;
	displaySelection: string;
	displayFields: readonly string[];
};

const RELATIONSHIP_ENTITY_CONFIG: Record<SharedRelationshipEntityKind, RelationshipEntityConfig> = {
	project: {
		table: 'onto_projects',
		displaySelection: 'id, name',
		displayFields: ['name']
	},
	task: {
		table: 'onto_tasks',
		displaySelection: 'id, project_id, title',
		displayFields: ['title']
	},
	plan: {
		table: 'onto_plans',
		displaySelection: 'id, project_id, name',
		displayFields: ['name']
	},
	goal: {
		table: 'onto_goals',
		displaySelection: 'id, project_id, name',
		displayFields: ['name']
	},
	document: {
		table: 'onto_documents',
		displaySelection: 'id, project_id, title',
		displayFields: ['title']
	},
	milestone: {
		table: 'onto_milestones',
		displaySelection: 'id, project_id, title',
		displayFields: ['title']
	},
	risk: {
		table: 'onto_risks',
		displaySelection: 'id, project_id, title',
		displayFields: ['title']
	},
	requirement: {
		table: 'onto_requirements',
		displaySelection: 'id, project_id, text',
		displayFields: ['text']
	}
};

const RELATIONSHIP_ENTITY_KINDS = Object.keys(
	RELATIONSHIP_ENTITY_CONFIG
) as SharedRelationshipEntityKind[];

export class AgenticChatRelationshipReadQueryError extends Error {
	readonly name = 'AgenticChatRelationshipReadQueryError';
	readonly table: string;
	readonly cause: unknown;

	constructor(table: string, cause: unknown, fallbackMessage: string) {
		const message =
			typeof (cause as { message?: unknown } | null)?.message === 'string'
				? String((cause as { message: string }).message)
				: fallbackMessage;
		super(message);
		this.table = table;
		this.cause = cause;
	}
}

export type ReadableRelationshipEntityRef = {
	entityId: string;
	entityKind: SharedRelationshipEntityKind;
	projectId: string;
};

async function loadEntityProjectRef(
	context: AgenticChatSharedReadContextV1,
	entityId: string,
	entityKind: SharedRelationshipEntityKind
): Promise<ReadableRelationshipEntityRef | null> {
	const config = RELATIONSHIP_ENTITY_CONFIG[entityKind] as RelationshipEntityConfig | undefined;
	if (!config) {
		throw new AgenticChatToolAccessDeniedError('Unsupported relationship entity kind');
	}
	const client = context.client as any;

	if (entityKind === 'project') {
		const { data, error } = await client
			.from(config.table)
			.select('id')
			.eq('id', entityId)
			.maybeSingle();
		if (error) {
			throw new AgenticChatRelationshipReadQueryError(
				config.table,
				error,
				'Failed to resolve relationship entity project'
			);
		}
		if (!data?.id) return null;
		return { entityId, entityKind, projectId: String(data.id) };
	}

	const { data, error } = await client
		.from(config.table)
		.select('id, project_id')
		.eq('id', entityId)
		.maybeSingle();
	if (error) {
		throw new AgenticChatRelationshipReadQueryError(
			config.table,
			error,
			'Failed to resolve relationship entity project'
		);
	}
	if (!data?.id || !data.project_id) return null;
	return {
		entityId,
		entityKind,
		projectId: String(data.project_id)
	};
}

/**
 * Resolve an ontology entity to a real project and assert membership before any
 * relationship fan-out. Project-less rows are deliberately denied: this path
 * must never inherit the legacy web adapter's `created_by` escape hatch.
 */
export async function resolveReadableRelationshipEntity(
	context: AgenticChatSharedReadContextV1,
	input: { entityId: string; entityKind?: SharedRelationshipEntityKind }
): Promise<ReadableRelationshipEntityRef> {
	const kinds = input.entityKind ? [input.entityKind] : RELATIONSHIP_ENTITY_KINDS;
	for (const kind of kinds) {
		const ref = await loadEntityProjectRef(context, input.entityId, kind);
		if (!ref) continue;
		await context.access.assertProjectAccess(ref.projectId, 'read');
		return ref;
	}

	throw new AgenticChatToolAccessDeniedError('Entity not found or access denied');
}

/** Fetch the raw edge envelope used by the legacy web tool. */
export async function getEntityRelationships(
	context: AgenticChatSharedReadContextV1,
	args: SharedGetEntityRelationshipsArgs
): Promise<{ relationships: Record<string, any>[]; message: string }> {
	const entity = await resolveReadableRelationshipEntity(context, {
		entityId: args.entity_id
	});
	const direction = args.direction ?? 'both';
	const relationships: Record<string, any>[] = [];

	const loadEdges = async (edgeDirection: 'outgoing' | 'incoming') => {
		const idColumn = edgeDirection === 'outgoing' ? 'src_id' : 'dst_id';
		const { data, error } = await (context.client as any)
			.from('onto_edges')
			.select('*')
			.eq('project_id', entity.projectId)
			.eq(idColumn, args.entity_id)
			.limit(50);
		if (error) {
			throw new AgenticChatRelationshipReadQueryError(
				'onto_edges',
				error,
				`Failed to fetch ${edgeDirection} relationships`
			);
		}
		if (Array.isArray(data)) {
			relationships.push(
				...data.map((edge) => ({
					...edge,
					direction: edgeDirection
				}))
			);
		}
	};

	if (direction === 'outgoing' || direction === 'both') await loadEdges('outgoing');
	if (direction === 'incoming' || direction === 'both') await loadEdges('incoming');

	return {
		relationships,
		message: `Found ${relationships.length} relationships for entity ${args.entity_id}.`
	};
}

/** Resolve the source entity's name through the same authorized project fence. */
export async function getReadableRelationshipEntityDisplayName(
	context: AgenticChatSharedReadContextV1,
	input: { entityId: string; entityKind: SharedRelationshipEntityKind }
): Promise<{ displayName: string; projectId: string }> {
	const entity = await resolveReadableRelationshipEntity(context, input);
	const config = RELATIONSHIP_ENTITY_CONFIG[entity.entityKind];
	let query = (context.client as any)
		.from(config.table)
		.select(config.displaySelection)
		.eq('id', entity.entityId);
	if (entity.entityKind !== 'project') {
		query = query.eq('project_id', entity.projectId);
	}
	const { data, error } = await query.maybeSingle();
	if (error) {
		throw new AgenticChatRelationshipReadQueryError(
			config.table,
			error,
			'Failed to load relationship entity display name'
		);
	}

	for (const field of config.displayFields) {
		const value = data?.[field];
		if (typeof value === 'string' && value.trim()) {
			return { displayName: value, projectId: entity.projectId };
		}
	}
	return { displayName: entity.entityId, projectId: entity.projectId };
}
