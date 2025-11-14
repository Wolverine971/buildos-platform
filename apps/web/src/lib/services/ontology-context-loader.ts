// apps/web/src/lib/services/ontology-context-loader.ts
/**
 * Ontology Context Loader Service
 * Loads project ontology data (projects, tasks, goals, etc.) for chat context
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import type { OntologyContext, EntityRelationships } from '$lib/types/agent-chat-enhancement';

export class OntologyContextLoader {
	// Simple in-memory cache with TTL
	private cache = new Map<string, { data: any; timestamp: number }>();
	private readonly CACHE_TTL = 60000; // 1 minute cache

	constructor(private supabase: SupabaseClient<Database>) {}

	/**
	 * Get cached data if still valid
	 */
	private getCached<T>(key: string): T | null {
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
	private setCache(key: string, data: any): void {
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
			.select('id, name, description, state_key, type_key')
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
			data: {
				recent_projects: projects || [],
				total_projects: totalProjects || 0,
				available_types: ['project', 'task', 'plan', 'goal', 'document', 'output']
			},
			metadata: {
				entity_count: entityCounts,
				last_updated: new Date().toISOString()
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
			data: {
				id: project.id,
				name: project.name,
				description: project.description,
				state_key: project.state_key,
				type_key: project.type_key,
				props: project.props,
				created_at: project.created_at
			},
			relationships,
			metadata: {
				entity_count: entityCounts,
				context_document_id: contextDocumentId,
				facets: facets,
				last_updated: new Date().toISOString()
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
		elementType: 'task' | 'plan' | 'goal' | 'document' | 'output',
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

		return {
			type: 'element',
			data: {
				element_type: elementType,
				element: element,
				parent_project: parentProject
					? {
							id: parentProject.id,
							name: parentProject.name,
							state: parentProject.state_key
						}
					: null
			},
			relationships,
			metadata: {
				hierarchy_level: await this.getHierarchyLevel(elementId),
				last_updated: new Date().toISOString()
			}
		};
	}

	/**
	 * Load a specific element from its table
	 */
	private async loadElement(
		type: 'task' | 'plan' | 'goal' | 'document' | 'output',
		id: string
	): Promise<any> {
		// Type-safe table mapping
		type TableName =
			| 'onto_tasks'
			| 'onto_plans'
			| 'onto_goals'
			| 'onto_documents'
			| 'onto_outputs';

		const tableMap: Record<typeof type, TableName> = {
			task: 'onto_tasks',
			plan: 'onto_plans',
			goal: 'onto_goals',
			document: 'onto_documents',
			output: 'onto_outputs'
		};

		const table = tableMap[type];
		if (!table) {
			throw new Error(`Unknown element type: ${type}`);
		}

		try {
			// Load from the appropriate table
			const query = this.supabase
				.from(table as 'onto_tasks')
				.select('*')
				.eq('id', id)
				.single();

			const { data, error } = await query;

			if (error) {
				console.error(`[OntologyLoader] Failed to load ${type}:`, error);
				return null;
			}

			return data;
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
	private async findParentProject(elementId: string): Promise<any> {
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
					.select('id, name, state_key')
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
	private async traverseToProject(elementId: string, maxDepth: number): Promise<any> {
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
						.select('id, name, state_key')
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

		// Count each entity type
		const tables = [
			'onto_projects',
			'onto_tasks',
			'onto_goals',
			'onto_plans',
			'onto_documents',
			'onto_outputs'
		];

		for (const table of tables) {
			const { count } = await this.supabase
				.from(table as any)
				.select('*', { count: 'exact', head: true });

			const entityType = table.replace('onto_', '').replace(/s$/, '');
			counts[entityType] = count || 0;
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
}
