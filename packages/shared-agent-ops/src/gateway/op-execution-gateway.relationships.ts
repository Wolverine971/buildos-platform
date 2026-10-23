// packages/shared-agent-ops/src/gateway/op-execution-gateway.relationships.ts
// Relationship reads shared by entity handlers and the external registry.
import { isValidUUID } from '@buildos/shared-types';
import {
	LINK_ENTITY_SELECTS,
	LINK_ENTITY_TABLES,
	ONTO_EDGE_SELECT,
	type ExternalLinkEntityKind
} from './op-execution-gateway.config';
import type { ToolExecutionContext } from './op-execution-gateway.types';
import { ExternalToolGatewayError } from './op-execution-gateway.responses';
import { assertValidId } from './op-execution-gateway.ids';
import {
	loadEntityForAccess,
	normalizeEntityKind,
	type EntityAccessResult
} from './op-execution-gateway.entity-access';
import { serializeExternalEntity } from './op-execution-gateway.serializers';
import { loadVisibleProjects } from './op-execution-gateway.access';

function normalizeRelationshipDirection(value: unknown): 'outgoing' | 'incoming' | 'both' {
	if (value === undefined || value === null || value === '') {
		return 'both';
	}
	if (typeof value !== 'string') {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			'direction must be one of: outgoing, incoming, both'
		);
	}
	const normalized = value.trim().toLowerCase();
	if (normalized === 'out' || normalized === 'outgoing') return 'outgoing';
	if (normalized === 'in' || normalized === 'incoming') return 'incoming';
	if (normalized === 'both') return 'both';
	throw new ExternalToolGatewayError(
		'VALIDATION_ERROR',
		'direction must be one of: outgoing, incoming, both'
	);
}

async function resolveVisibleEntityById(
	context: ToolExecutionContext,
	entityId: unknown,
	access: 'read' | 'write'
): Promise<EntityAccessResult> {
	const id = assertValidId(entityId, 'entity_id');
	const kinds: ExternalLinkEntityKind[] = [
		'project',
		'task',
		'plan',
		'goal',
		'milestone',
		'document',
		'risk',
		'event',
		'requirement',
		'metric',
		'source'
	];
	let lastError: unknown = null;

	for (const kind of kinds) {
		try {
			return await loadEntityForAccess(context, kind, id, access);
		} catch (error) {
			if (error instanceof ExternalToolGatewayError && error.code === 'NOT_FOUND') {
				lastError = error;
				continue;
			}
			throw error;
		}
	}

	throw lastError instanceof ExternalToolGatewayError
		? new ExternalToolGatewayError('NOT_FOUND', 'Entity not found')
		: new ExternalToolGatewayError('NOT_FOUND', 'Entity not found');
}

export async function getEntityRelationships(
	context: ToolExecutionContext,
	args: Record<string, unknown>
) {
	const direction = normalizeRelationshipDirection(args.direction);
	const entity = await resolveVisibleEntityById(context, args.entity_id, 'read');
	const relationships: Array<Record<string, unknown>> = [];

	if (direction === 'outgoing' || direction === 'both') {
		const { data, error } = await context.admin
			.from('onto_edges')
			.select(ONTO_EDGE_SELECT)
			.eq('project_id', entity.project.id)
			.eq('src_id', String(entity.entity.id))
			.limit(50);
		if (error) {
			throw new ExternalToolGatewayError(
				'INTERNAL',
				error.message || 'Failed to fetch outgoing relationships'
			);
		}
		relationships.push(
			...((data ?? []) as Array<Record<string, unknown>>).map((edge) => ({
				...edge,
				direction: 'outgoing'
			}))
		);
	}

	if (direction === 'incoming' || direction === 'both') {
		const { data, error } = await context.admin
			.from('onto_edges')
			.select(ONTO_EDGE_SELECT)
			.eq('project_id', entity.project.id)
			.eq('dst_id', String(entity.entity.id))
			.limit(50);
		if (error) {
			throw new ExternalToolGatewayError(
				'INTERNAL',
				error.message || 'Failed to fetch incoming relationships'
			);
		}
		relationships.push(
			...((data ?? []) as Array<Record<string, unknown>>).map((edge) => ({
				...edge,
				direction: 'incoming'
			}))
		);
	}

	return {
		relationships,
		message: `Found ${relationships.length} relationships for entity ${String(entity.entity.id)}.`
	};
}

function pluralKind(kind: string): string {
	if (kind === 'milestone') return 'milestones';
	if (kind === 'risk') return 'risks';
	return `${kind}s`;
}

type LinkedEntityRef = {
	kind: ExternalLinkEntityKind;
	id: string;
	edge: Record<string, unknown>;
};

export async function getLinkedEntities(
	context: ToolExecutionContext,
	args: Record<string, unknown>
) {
	const entityKind = normalizeEntityKind(args.entity_kind, 'entity_kind');
	const source = await loadEntityForAccess(context, entityKind, args.entity_id, 'read');
	const filterKind =
		typeof args.filter_kind === 'string' && args.filter_kind !== 'all'
			? normalizeEntityKind(args.filter_kind, 'filter_kind')
			: null;

	const { relationships } = await getEntityRelationships(context, {
		entity_id: source.entity.id,
		entity_kind: entityKind,
		direction: 'both'
	});

	const linkedRefs = (relationships as Array<Record<string, unknown>>)
		.map<LinkedEntityRef | null>((edge) => {
			const isOutgoing = edge.src_id === source.entity.id;
			const kind = String(isOutgoing ? edge.dst_kind : edge.src_kind);
			const id = String(isOutgoing ? edge.dst_id : edge.src_id);
			if (filterKind && kind !== filterKind) return null;
			if (!Object.prototype.hasOwnProperty.call(LINK_ENTITY_TABLES, kind)) return null;
			return {
				kind: kind as ExternalLinkEntityKind,
				id,
				edge
			};
		})
		.filter((ref): ref is LinkedEntityRef => ref !== null && isValidUUID(ref.id));

	const linkedByKind: Record<string, LinkedEntityRef[]> = {};
	for (const ref of linkedRefs) {
		if (!linkedByKind[ref.kind]) linkedByKind[ref.kind] = [];
		linkedByKind[ref.kind]!.push(ref);
	}

	// An edge row belongs to the source's project, but nothing in the database stops
	// its other end from sitting in another project (legacy rows, moves, folds). The
	// linked rows are read with the service client, so scope them here: entities to
	// the source's own project, linked projects to the ones this connector can see.
	const visibleProjectIds = linkedByKind.project
		? new Set((await loadVisibleProjects(context)).projectMap.keys())
		: null;
	const linkedEntities: Record<string, Array<Record<string, unknown>>> = {};
	for (const [kind, refs] of Object.entries(linkedByKind)) {
		const table = LINK_ENTITY_TABLES[kind as ExternalLinkEntityKind];
		const selectColumns = LINK_ENTITY_SELECTS[kind as ExternalLinkEntityKind];
		const ids =
			kind === 'project'
				? refs.map((ref) => ref.id).filter((id) => visibleProjectIds?.has(id))
				: refs.map((ref) => ref.id);
		if (ids.length === 0) continue;
		let query = context.admin.from(table).select(selectColumns).in('id', ids);
		if (kind !== 'project') query = query.eq('project_id', source.projectId);
		const { data, error } = await query;
		if (error) {
			throw new ExternalToolGatewayError(
				'INTERNAL',
				error.message || `Failed to fetch linked ${kind} entities`
			);
		}
		const rowsById = new Map(
			((data ?? []) as Array<Record<string, unknown>>).map((row) => [String(row.id), row])
		);
		linkedEntities[pluralKind(kind)] = refs
			.map<Record<string, unknown> | null>((ref) => {
				const row = rowsById.get(ref.id);
				if (!row) return null;
				return {
					...serializeExternalEntity(kind as ExternalLinkEntityKind, row),
					edge_id: ref.edge.id,
					edge_rel: ref.edge.rel,
					edge_direction: ref.edge.direction
				};
			})
			.filter((row): row is Record<string, unknown> => Boolean(row));
	}

	const counts = Object.fromEntries(
		Object.entries(linkedEntities).map(([kind, rows]) => [kind, rows.length])
	);
	const total = Object.values(counts).reduce(
		(sum, count) => sum + (typeof count === 'number' ? count : 0),
		0
	);

	return {
		linked_entities: linkedEntities,
		counts: {
			...counts,
			total
		},
		summary: `${total} linked entities`,
		message: `Found ${total} linked entities for ${entityKind} ${String(source.entity.id)}.`
	};
}
