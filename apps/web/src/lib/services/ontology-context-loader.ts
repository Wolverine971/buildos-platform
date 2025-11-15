// apps/web/src/lib/services/ontology-context-loader.ts
/**
 * Ontology Context Loader Service
 * Loads project ontology data (projects, tasks, goals, etc.) for chat context
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import type {
	OntologyContext,
	EntityRelationships,
	OntologyEntityType
} from '$lib/types/agent-chat-enhancement';

type ProjectRow = Database['public']['Tables']['onto_projects']['Row'];
type ElementType = Exclude<OntologyEntityType, 'project'>;

type ElementRowMap = {
	task: Database['public']['Tables']['onto_tasks']['Row'];
	plan: Database['public']['Tables']['onto_plans']['Row'];
	goal: Database['public']['Tables']['onto_goals']['Row'];
	document: Database['public']['Tables']['onto_documents']['Row'];
	output: Database['public']['Tables']['onto_outputs']['Row'];
	milestone: Database['public']['Tables']['onto_milestones']['Row'];
};

type ElementTableNameMap = {
	[K in ElementType]: `onto_${K extends 'document'
		? 'documents'
		: K extends 'goal'
			? 'goals'
			: K extends 'plan'
				? 'plans'
				: K extends 'task'
					? 'tasks'
					: K extends 'output'
						? 'outputs'
						: 'milestones'}`;
};

type ContextEntityMap = Partial<Record<ElementType, ElementRowMap[ElementType]>> & {
	project?: ProjectRow;
};

type OntologyEntityRow = ProjectRow | ElementRowMap[ElementType];

export class OntologyContextLoader {
	// Simple in-memory cache with TTL
	private cache = new Map<string, { data: OntologyContext; timestamp: number }>();
	private readonly CACHE_TTL = 60000; // 1 minute cache

	constructor(private supabase: SupabaseClient<Database>) {}

	private static readonly ELEMENT_TABLE_MAP: ElementTableNameMap = {
		task: 'onto_tasks',
		plan: 'onto_plans',
		goal: 'onto_goals',
		document: 'onto_documents',
		output: 'onto_outputs',
		milestone: 'onto_milestones'
	} as const;

	/**
	 * Get cached data if still valid
	 */
	private getCached<T extends OntologyContext>(key: string): T | null {
		const cached = this.cache.get(key);
		if (!cached) return null;

		const now = Date.now();
		if (now - cached.timestamp > this.CACHE_TTL) {
			this.cache.delete(key);
			return null;
		}

		return cached.data as T;
	}

	/**
	 * Set cache with current timestamp
	 */
	private setCache(key: string, data: OntologyContext): void {
		this.cache.set(key, {
			data,
			timestamp: Date.now()
		});

		// Cleanup old cache entries periodically
		if (this.cache.size > 100) {
			const now = Date.now();
			for (const [k, v] of this.cache.entries()) {
				if (now - v.timestamp > this.CACHE_TTL) {
					this.cache.delete(k);
				}
			}
		}
	}

	/**
	 * Load global context - overview of all projects
	 */
	async loadGlobalContext(): Promise<OntologyContext> {
		console.log('[OntologyLoader] Loading global context');

		// Get recent projects
		const { data: projects, error: projectError } = await this.supabase
			.from('onto_projects')
			.select('*')
			.limit(10)
			.order('created_at', { ascending: false });

		if (projectError) {
			console.error('[OntologyLoader] Failed to load projects:', projectError);
		}

		// Get total counts
		const { count: totalProjects } = await this.supabase
			.from('onto_projects')
			.select('*', { count: 'exact', head: true });

		// Get entity type counts
		const entityCounts = await this.getGlobalEntityCounts();

		return {
			type: 'global',
			entities: {
				projects: projects || []
			},
			metadata: {
				entity_count: entityCounts,
				last_updated: new Date().toISOString(),
				total_projects: totalProjects || 0,
				available_entity_types: ['project', 'task', 'plan', 'goal', 'document', 'output'],
				recent_project_ids: (projects || []).map((project) => project.id)
			}
		};
	}

	/**
	 * Load project-specific context with relationships
	 */
	async loadProjectContext(projectId: string): Promise<OntologyContext> {
		console.log('[OntologyLoader] Loading project context for:', projectId);

		// Check cache first
		const cacheKey = `project:${projectId}`;
		const cached = this.getCached<OntologyContext>(cacheKey);
		if (cached) {
			console.log('[OntologyLoader] Using cached project context');
			return cached;
		}

		// Load project with props
		const { data: project, error } = await this.supabase
			.from('onto_projects')
			.select('*')
			.eq('id', projectId)
			.single();

		if (error || !project) {
			console.error('[OntologyLoader] Failed to load project:', error);
			throw new Error(`Project ${projectId} not found`);
		}

		// Extract facets and context document reference (column takes precedence, props kept for back-compat)
		const props = (project.props as any) || {};
		const facets = props.facets || null;
		const contextDocumentId = project.context_document_id || props.context_document_id || null;

		// Load relationships
		const relationships = await this.loadProjectRelationships(projectId);

		// Get entity counts
		const entityCounts = await this.getProjectEntityCounts(projectId);

		const context: OntologyContext = {
			type: 'project',
			entities: {
				project
			},
			relationships,
			metadata: {
				entity_count: entityCounts,
				context_document_id: contextDocumentId,
				facets: facets,
				last_updated: new Date().toISOString()
			},
			scope: {
				projectId: project.id,
				projectName: project.name
			}
		};

		// Cache the result
		this.setCache(cacheKey, context);

		return context;
	}

	/**
	 * Load element-specific context (task, goal, plan, etc.)
	 */
	async loadElementContext(
		elementType: ElementType,
		elementId: string
	): Promise<OntologyContext> {
		console.log('[OntologyLoader] Loading element context:', elementType, elementId);

		// Load the element
		const element = await this.loadElement(elementType, elementId);

		if (!element) {
			throw new Error(`${elementType} ${elementId} not found`);
		}

		// Find parent project
		const parentProject = await this.findParentProject(elementId);

		// Load element relationships
		const relationships = await this.loadElementRelationships(elementId);

		const entities: OntologyContext['entities'] = {};
		const singularEntities = this.asContextEntityMap(entities);
		singularEntities[elementType] = element;

		if (parentProject) {
			singularEntities.project = parentProject;
		}

		return {
			type: 'element',
			entities,
			relationships,
			metadata: {
				hierarchy_level: await this.getHierarchyLevel(elementId),
				last_updated: new Date().toISOString()
			},
			scope: {
				projectId: parentProject?.id,
				projectName: parentProject?.name,
				focus: {
					type: elementType,
					id: element.id,
					name: this.getEntityDisplayName(element, elementType)
				}
			}
		};
	}

	/**
	 * Load combined project + element context for focus mode
	 */
	async loadCombinedProjectElementContext(
		projectId: string,
		elementType: 'task' | 'goal' | 'plan' | 'document' | 'output' | 'milestone',
		elementId: string
	): Promise<OntologyContext> {
		console.log('[OntologyLoader] Loading combined context', {
			projectId,
			elementType,
			elementId
		});

		const [projectContext, elementContext] = await Promise.all([
			this.loadProjectContext(projectId),
			this.loadElementContext(elementType, elementId)
		]);

		if (
			elementContext.data?.parent_project?.id &&
			elementContext.data.parent_project.id !== projectId
		) {
			console.warn(
				'[OntologyLoader] Focus element parent mismatch. Expected project',
				projectId,
				'but found',
				elementContext.data.parent_project.id
			);
		}

		const combinedEdges = [
			...(projectContext.relationships?.edges ?? []),
			...(elementContext.relationships?.edges ?? [])
		];

		const combinedEntities: OntologyContext['entities'] = {
			...(projectContext.entities || {}),
			...(elementContext.entities || {})
		};

		const focusType: ElementType = elementContext.scope?.focus?.type ?? elementType;
		const elementEntityMap = this.asContextEntityMap(elementContext.entities);
		const focusEntity = elementEntityMap[focusType];

		if (focusEntity) {
			const combinedEntityMap = this.asContextEntityMap(combinedEntities);
			combinedEntityMap[focusType] = focusEntity;
		}

		return {
			type: 'combined',
			entities: combinedEntities,
			relationships: {
				edges: combinedEdges,
				hierarchy_level: Math.max(
					projectContext.relationships?.hierarchy_level ?? 0,
					elementContext.relationships?.hierarchy_level ?? 1
				)
			},
			metadata: {
				...projectContext.metadata,
				...elementContext.metadata
			},
			scope: {
				projectId: projectContext.scope?.projectId ?? projectId,
				projectName: projectContext.scope?.projectName,
				focus: elementContext.scope?.focus ?? {
					type: focusType,
					id: focusEntity?.id ?? elementId,
					name: this.getEntityDisplayName(focusEntity, focusType)
				}
			}
		};
	}

	/**
	 * Load a specific element from its table
	 */
	private async loadElement<T extends ElementType>(
		type: T,
		id: string
	): Promise<ElementRowMap[T] | null> {
		const table = OntologyContextLoader.ELEMENT_TABLE_MAP[type];

		try {
			const { data, error } = await this.supabase
				.from(table)
				.select('*')
				.eq('id', id)
				.single();

			if (error) {
				console.error(`[OntologyLoader] Failed to load ${type}:`, error);
				return null;
			}

			return data as ElementRowMap[T];
		} catch (error) {
			console.error(`[OntologyLoader] Error loading ${type} ${id}:`, error);
			return null;
		}
	}

	/**
	 * Load relationships for a project
	 */
	private async loadProjectRelationships(projectId: string): Promise<EntityRelationships> {
		const { data: edges, error } = await this.supabase
			.from('onto_edges')
			.select('*')
			.eq('src_id', projectId)
			.limit(50); // Limit to prevent overwhelming context

		if (error) {
			console.error('[OntologyLoader] Failed to load edges:', error);
			return { edges: [], hierarchy_level: 0 };
		}

		return {
			edges: (edges || []).map((e) => ({
				relation: e.rel,
				target_kind: e.dst_kind,
				target_id: e.dst_id,
				target_name: undefined // Will be resolved on demand
			})),
			hierarchy_level: 0
		};
	}

	/**
	 * Load relationships for an element
	 */
	private async loadElementRelationships(elementId: string): Promise<EntityRelationships> {
		// Get both incoming and outgoing edges
		const { data: edges, error } = await this.supabase
			.from('onto_edges')
			.select('*')
			.or(`src_id.eq.${elementId},dst_id.eq.${elementId}`)
			.limit(20);

		if (error) {
			console.error('[OntologyLoader] Failed to load element edges:', error);
			return { edges: [], hierarchy_level: 1 };
		}

		const relationships = (edges || []).map((e) => {
			const isSource = e.src_id === elementId;
			return {
				relation: isSource ? e.rel : `inverse_${e.rel}`,
				target_kind: isSource ? e.dst_kind : e.src_kind,
				target_id: isSource ? e.dst_id : e.src_id,
				target_name: undefined
			};
		});

		return {
			edges: relationships,
			hierarchy_level: 1
		};
	}

	/**
	 * Find parent project for an element
	 */
	private async findParentProject(
		elementId: string
	): Promise<Database['public']['Tables']['onto_projects']['Row'] | null> {
		try {
			// Direct check - is there a project->element edge?
			const { data: directEdge, error: edgeError } = await this.supabase
				.from('onto_edges')
				.select('src_id, src_kind')
				.eq('dst_id', elementId)
				.eq('src_kind', 'project')
				.single();

			if (!edgeError && directEdge) {
				const { data: project, error: projectError } = await this.supabase
					.from('onto_projects')
					.select('*')
					.eq('id', directEdge.src_id)
					.single();

				if (!projectError && project) {
					return project;
				}
			}

			// Traverse up through intermediate nodes (max 3 levels)
			return this.traverseToProject(elementId, 3);
		} catch (error) {
			console.error('[OntologyLoader] Error finding parent project:', error);
			return null;
		}
	}

	/**
	 * Traverse up the hierarchy to find a project
	 * Optimized to avoid N+1 queries
	 */
	private async traverseToProject(
		elementId: string,
		maxDepth: number
	): Promise<Database['public']['Tables']['onto_projects']['Row'] | null> {
		if (maxDepth <= 0) return null;

		const visited = new Set<string>();
		let currentLevelIds = [elementId];

		// Breadth-first search to avoid deep recursion
		for (let depth = 0; depth < maxDepth && currentLevelIds.length > 0; depth++) {
			try {
				// Batch load all edges for current level
				const { data: edges, error } = await this.supabase
					.from('onto_edges')
					.select('src_id, src_kind, dst_id')
					.in('dst_id', currentLevelIds);

				if (error) {
					console.error('[OntologyLoader] Error traversing to project:', error);
					return null;
				}

				const nextLevelIds: string[] = [];
				const projectIds: string[] = [];

				for (const edge of edges || []) {
					// Skip if we've already visited this node (avoid cycles)
					if (visited.has(edge.src_id)) continue;
					visited.add(edge.src_id);

					if (edge.src_kind === 'project') {
						projectIds.push(edge.src_id);
					} else {
						nextLevelIds.push(edge.src_id);
					}
				}

				// If we found any projects, load and return the first one
				if (projectIds.length > 0) {
					const { data: project, error: projectError } = await this.supabase
						.from('onto_projects')
						.select('*')
						.eq('id', projectIds[0])
						.single();

					if (!projectError && project) {
						return project;
					}
				}

				currentLevelIds = nextLevelIds;
			} catch (error) {
				console.error('[OntologyLoader] Error in traverseToProject:', error);
				return null;
			}
		}

		return null;
	}

	/**
	 * Get entity counts for a project
	 */
	private async getProjectEntityCounts(projectId: string): Promise<Record<string, number>> {
		const { data: edges, error } = await this.supabase
			.from('onto_edges')
			.select('dst_kind')
			.eq('src_id', projectId);

		if (error) {
			console.error('[OntologyLoader] Error getting project entity counts:', error);
			return {};
		}

		const counts: Record<string, number> = {};
		(edges || []).forEach((edge) => {
			if (edge.dst_kind) {
				counts[edge.dst_kind] = (counts[edge.dst_kind] || 0) + 1;
			}
		});

		return counts;
	}

	/**
	 * Get global entity counts
	 */
	private async getGlobalEntityCounts(): Promise<Record<string, number>> {
		const counts: Record<string, number> = {};

		const tableMappings: Array<{ table: keyof Database['public']['Tables']; key: string }> = [
			{ table: 'onto_projects', key: 'project' },
			{ table: 'onto_tasks', key: 'task' },
			{ table: 'onto_goals', key: 'goal' },
			{ table: 'onto_plans', key: 'plan' },
			{ table: 'onto_documents', key: 'document' },
			{ table: 'onto_outputs', key: 'output' },
			{ table: 'onto_milestones', key: 'milestone' }
		];

		for (const { table, key } of tableMappings) {
			const { count } = await this.supabase
				.from(table)
				.select('*', { count: 'exact', head: true });
			counts[key] = count || 0;
		}

		return counts;
	}

	/**
	 * Get hierarchy level for an element
	 */
	private async getHierarchyLevel(elementId: string, currentLevel: number = 0): Promise<number> {
		if (currentLevel > 5) return currentLevel; // Max depth

		const { data: edge } = await this.supabase
			.from('onto_edges')
			.select('src_id, src_kind')
			.eq('dst_id', elementId)
			.single();

		if (!edge) return currentLevel;
		if (edge.src_kind === 'project') return currentLevel + 1;

		return this.getHierarchyLevel(edge.src_id, currentLevel + 1);
	}

	private asContextEntityMap(entities: OntologyContext['entities']): ContextEntityMap {
		return entities as ContextEntityMap;
	}

	private getEntityDisplayName(
		entity: OntologyEntityRow | null | undefined,
		type: OntologyEntityType
	): string | undefined {
		if (!entity) {
			return undefined;
		}

		if ('name' in entity && entity.name) {
			return entity.name;
		}

		if ('title' in entity && entity.title) {
			return entity.title;
		}

		if ('summary' in entity && entity.summary) {
			return entity.summary;
		}

		if ('display_name' in entity && entity.display_name) {
			return entity.display_name;
		}

		if ('id' in entity && entity.id) {
			return `${type}:${entity.id}`;
		}

		return undefined;
	}
}
