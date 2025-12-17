// apps/web/src/lib/services/agentic-chat/tools/core/executors/utility-executor.ts
/**
 * Utility Executor
 *
 * Handles utility tool operations:
 * - get_field_info: Schema information for entity types
 * - get_entity_relationships: Edge relationships for an entity
 * - get_linked_entities: Full linked entity details
 */

import { BaseExecutor } from './base-executor';
import { ENTITY_FIELD_INFO } from '../tools.config';
import { OntologyContextLoader } from '$lib/services/ontology-context-loader';
import {
	formatLinkedEntitiesFullDetail,
	getLinkedEntitiesSummary
} from '$lib/services/linked-entity-context-formatter';
import type { OntologyEntityType } from '$lib/types/agent-chat-enhancement';
import type {
	ExecutorContext,
	GetFieldInfoArgs,
	GetEntityRelationshipsArgs,
	GetLinkedEntitiesArgs
} from './types';

/**
 * Executor for utility tool operations.
 *
 * Provides schema information and relationship queries.
 */
export class UtilityExecutor extends BaseExecutor {
	constructor(context: ExecutorContext) {
		super(context);
	}

	// ============================================
	// FIELD INFO
	// ============================================

	/**
	 * Get field schema information for an entity type.
	 */
	async getFieldInfo(args: GetFieldInfoArgs): Promise<{
		entity_type: string;
		fields: Record<string, unknown>;
		message: string;
	}> {
		const { entity_type, field_name } = args;

		// Validate entity_type is provided
		if (!entity_type || entity_type === 'undefined' || entity_type === 'null') {
			const validTypes = Object.keys(ENTITY_FIELD_INFO).join(', ');
			throw new Error(
				`The 'entity_type' parameter is required to specify which entity's field schema to return. ` +
					`This helps you understand what properties are available when creating or updating entities. ` +
					`Valid types: ${validTypes}. Example: get_field_info({ entity_type: "ontology_project" })`
			);
		}

		const schema = ENTITY_FIELD_INFO[entity_type];
		if (!schema) {
			throw new Error(
				`Unknown entity type: ${entity_type}. Valid types: ${Object.keys(ENTITY_FIELD_INFO).join(', ')}`
			);
		}

		if (field_name) {
			const field = schema[field_name];
			if (!field) {
				throw new Error(
					`Field "${field_name}" not found for entity "${entity_type}". Available fields: ${Object.keys(schema).join(', ')}`
				);
			}

			return {
				entity_type,
				fields: { [field_name]: field },
				message: `Field information for ${entity_type}.${field_name}`
			};
		}

		return {
			entity_type,
			fields: schema,
			message: `Commonly-used fields for ${entity_type}`
		};
	}

	// ============================================
	// RELATIONSHIPS
	// ============================================

	/**
	 * Get edge relationships for an entity.
	 */
	async getEntityRelationships(args: GetEntityRelationshipsArgs): Promise<{
		relationships: any[];
		message: string;
	}> {
		await this.assertEntityOwnership(args.entity_id);
		const direction = args.direction ?? 'both';
		const relationships: any[] = [];

		if (direction === 'outgoing' || direction === 'both') {
			const { data } = await this.supabase
				.from('onto_edges')
				.select('*')
				.eq('src_id', args.entity_id)
				.limit(50);

			if (data) {
				relationships.push(
					...data.map((edge) => ({
						...edge,
						direction: 'outgoing'
					}))
				);
			}
		}

		if (direction === 'incoming' || direction === 'both') {
			const { data } = await this.supabase
				.from('onto_edges')
				.select('*')
				.eq('dst_id', args.entity_id)
				.limit(50);

			if (data) {
				relationships.push(
					...data.map((edge) => ({
						...edge,
						direction: 'incoming'
					}))
				);
			}
		}

		return {
			relationships,
			message: `Found ${relationships.length} relationships for entity ${args.entity_id}.`
		};
	}

	// ============================================
	// LINKED ENTITIES
	// ============================================

	/**
	 * Get detailed linked entities for a specific entity.
	 * Returns full information about all linked entities including descriptions.
	 */
	async getLinkedEntities(args: GetLinkedEntitiesArgs): Promise<{
		linked_entities: string;
		summary: string;
		counts: Record<string, number>;
		message: string;
	}> {
		const actorId = await this.getActorId();
		await this.assertEntityOwnership(args.entity_id);

		// Get entity name for context
		const entityName = await this.getEntityDisplayName(args.entity_id, args.entity_kind);

		// Load linked entities with full details
		const ontologyLoader = new OntologyContextLoader(this.supabase, actorId);
		const linkedContext = await ontologyLoader.loadLinkedEntitiesContext(
			args.entity_id,
			args.entity_kind as OntologyEntityType,
			entityName,
			{
				maxPerType: 50, // Full mode - get all
				includeDescriptions: true,
				priorityOrder: 'active_first'
			}
		);

		// Filter by kind if specified
		if (args.filter_kind && args.filter_kind !== 'all') {
			const kindKey = `${args.filter_kind}s` as keyof typeof linkedContext.linkedEntities;
			const filteredEntities = linkedContext.linkedEntities[kindKey] || [];
			const filteredContext = {
				...linkedContext,
				linkedEntities: {
					plans: kindKey === 'plans' ? filteredEntities : [],
					goals: kindKey === 'goals' ? filteredEntities : [],
					tasks: kindKey === 'tasks' ? filteredEntities : [],
					milestones: kindKey === 'milestones' ? filteredEntities : [],
					documents: kindKey === 'documents' ? filteredEntities : [],
					outputs: kindKey === 'outputs' ? filteredEntities : [],
					risks: kindKey === 'risks' ? filteredEntities : []
				},
				counts: {
					...linkedContext.counts,
					total: filteredEntities.length
				}
			};

			const formattedOutput = formatLinkedEntitiesFullDetail(filteredContext);
			const summary = `${filteredEntities.length} ${args.filter_kind}(s) linked`;

			return {
				linked_entities: formattedOutput,
				summary,
				counts: { [args.filter_kind]: filteredEntities.length },
				message: `Found ${filteredEntities.length} linked ${args.filter_kind}(s) for ${args.entity_kind} "${entityName}".`
			};
		}

		// Return all linked entities
		const formattedOutput = formatLinkedEntitiesFullDetail(linkedContext);
		const summary = getLinkedEntitiesSummary(linkedContext);

		return {
			linked_entities: formattedOutput,
			summary,
			counts: linkedContext.counts,
			message: `Found ${linkedContext.counts.total} linked entities for ${args.entity_kind} "${entityName}".`
		};
	}

	/**
	 * Get display name for an entity by its kind.
	 */
	private async getEntityDisplayName(entityId: string, entityKind: string): Promise<string> {
		const tableMap: Record<string, string> = {
			task: 'onto_tasks',
			plan: 'onto_plans',
			goal: 'onto_goals',
			milestone: 'onto_milestones',
			document: 'onto_documents',
			output: 'onto_outputs'
		};

		const table = tableMap[entityKind];
		if (!table) return entityId;

		const { data } = await this.supabase
			.from(table as any)
			.select('name, title, summary')
			.eq('id', entityId)
			.single();

		if (!data) return entityId;
		return (data as any).name || (data as any).title || (data as any).summary || entityId;
	}
}
