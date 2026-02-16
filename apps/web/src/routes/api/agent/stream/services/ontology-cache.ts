// apps/web/src/routes/api/agent/stream/services/ontology-cache.ts
/**
 * Ontology Cache Service for /api/agent/stream endpoint.
 *
 * Manages session-level ontology caching.
 * WRAPS the existing OntologyContextLoader - does NOT replace it.
 *
 * Two caching layers exist:
 * - OntologyContextLoader internal cache: 60s TTL, in-memory Map
 * - Session agent_metadata.ontologyCache: 5min TTL, stored in database
 *
 * Session-level cache takes precedence; loader cache is secondary optimization.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, ChatContextType } from '@buildos/shared-types';
import { OntologyContextLoader } from '$lib/services/ontology-context-loader';
import type { OntologyContext } from '$lib/types/agent-chat-enhancement';
import { createLogger } from '$lib/utils/logger';
import type {
	AgentSessionMetadata,
	OntologyCache,
	OntologyLoadResult,
	StreamRequest
} from '../types';
import {
	ONTOLOGY_CACHE_TTL_MS,
	PROJECT_SNAPSHOT_TTL_MS,
	PROJECT_CONTEXT_TYPES,
	VALID_ONTOLOGY_ENTITY_TYPES
} from '../constants';
import { generateOntologyCacheKey, normalizeContextType, normalizeProjectFocus } from '../utils';
import { queueProjectContextSnapshot } from '$lib/server/project-context-snapshot.service';

const logger = createLogger('OntologyCache');

// ============================================
// ONTOLOGY CACHE SERVICE
// ============================================

/**
 * Manages session-level ontology caching.
 * Wraps OntologyContextLoader with session-level caching.
 */
export class OntologyCacheService {
	private loader: OntologyContextLoader;

	constructor(
		private supabase: SupabaseClient<Database>,
		private actorId: string,
		private userId?: string
	) {
		this.loader = new OntologyContextLoader(supabase, actorId);
	}

	/**
	 * Load ontology context with session-level caching.
	 *
	 * @param request - The parsed stream request
	 * @param metadata - The session metadata (contains cache)
	 * @returns OntologyLoadResult with context and cache metadata
	 */
	async loadWithSessionCache(
		request: StreamRequest,
		metadata: AgentSessionMetadata
	): Promise<OntologyLoadResult> {
		const contextType = normalizeContextType(request.context_type);
		const resolvedFocus = normalizeProjectFocus(
			metadata.focus ?? request.project_focus ?? null
		);
		const useProjectFocus = this.shouldUseProjectFocus(contextType, request);

		// Generate cache key
		const cacheKey = generateOntologyCacheKey(
			useProjectFocus ? resolvedFocus : null,
			contextType,
			request.entity_id
		);

		// Check session-level cache
		const cached = metadata.ontologyCache;
		const cacheAge = cached ? Date.now() - cached.loadedAt : Infinity;
		const isCacheValid =
			cached && cached.cacheKey === cacheKey && cacheAge < ONTOLOGY_CACHE_TTL_MS;

		if (isCacheValid) {
			logger.debug('Using cached ontology context', {
				cacheKey,
				cacheAgeMs: cacheAge,
				cacheAgeSec: Math.round(cacheAge / 1000)
			});

			return {
				success: true,
				context: cached.context,
				cacheUpdated: false
			};
		}

		// Load fresh context
		const context = await this.loadFreshContext(request, contextType, resolvedFocus);

		// Prepare cache metadata (will be persisted by caller at stream end)
		let cacheMetadata: OntologyCache | undefined;
		if (context) {
			cacheMetadata = {
				context,
				loadedAt: Date.now(),
				cacheKey
			};

			logger.debug('Ontology cache updated in memory, will persist at stream end', {
				cacheKey
			});
		}

		return {
			success: true,
			context,
			cacheUpdated: !!cacheMetadata,
			cacheMetadata
		};
	}

	/**
	 * Load fresh ontology context without caching.
	 *
	 * @param request - The parsed stream request
	 * @param contextType - Normalized context type
	 * @param resolvedFocus - Resolved project focus
	 * @returns OntologyContext or null
	 */
	private async loadFreshContext(
		request: StreamRequest,
		contextType: ChatContextType,
		resolvedFocus: StreamRequest['project_focus']
	): Promise<OntologyContext | null> {
		// Validate ontology entity type if provided
		let validatedOntologyEntityType: (typeof VALID_ONTOLOGY_ENTITY_TYPES)[number] | undefined;

		if (request.ontology_entity_type) {
			if (
				(VALID_ONTOLOGY_ENTITY_TYPES as readonly string[]).includes(
					request.ontology_entity_type
				)
			) {
				validatedOntologyEntityType =
					request.ontology_entity_type as (typeof VALID_ONTOLOGY_ENTITY_TYPES)[number];
			} else {
				logger.warn('Invalid ontologyEntityType provided', {
					provided: request.ontology_entity_type,
					validTypes: VALID_ONTOLOGY_ENTITY_TYPES
				});
			}
		}

		// Check if this is a project-related context type or explicitly focused
		const useProjectFocus = this.shouldUseProjectFocus(contextType, request);

		// Load based on context type and focus
		if (resolvedFocus?.projectId && useProjectFocus) {
			// Project-focused loading
			if (resolvedFocus.focusType !== 'project-wide' && resolvedFocus.focusEntityId) {
				// Load combined project + element context
				return await this.loader.loadCombinedProjectElementContext(
					resolvedFocus.projectId,
					resolvedFocus.focusType as
						| 'task'
						| 'goal'
						| 'plan'
						| 'document'
						| 'milestone'
						| 'risk',
					resolvedFocus.focusEntityId
				);
			} else {
				// Load project-level context (prefer snapshot if available)
				const snapshot = await this.loadProjectSnapshot(resolvedFocus.projectId, {
					reason: 'project_focus'
				});
				if (snapshot) {
					return snapshot;
				}
				return await this.loader.loadProjectContext(resolvedFocus.projectId);
			}
		}

		// Non-project context loading
		if (contextType === 'project_create') {
			// No ontology context for project creation
			return null;
		}

		// Load based on entity type or context type
		return await this.loadOntologyContext(
			contextType,
			request.entity_id,
			validatedOntologyEntityType
		);
	}

	private async loadProjectSnapshot(
		projectId: string,
		options?: { reason?: string }
	): Promise<OntologyContext | null> {
		const { data, error } = await (this.supabase as any)
			.from('project_context_snapshot')
			.select('snapshot, computed_at')
			.eq('project_id', projectId)
			.maybeSingle();

		if (error) {
			logger.warn('Failed to read project context snapshot', { error, projectId });
			return null;
		}

		if (!data?.snapshot) {
			this.queueSnapshotBuild(projectId, options?.reason ?? 'missing');
			return null;
		}

		const computedAt = data.computed_at ? Date.parse(data.computed_at) : 0;
		if (computedAt && Date.now() - computedAt > PROJECT_SNAPSHOT_TTL_MS) {
			this.queueSnapshotBuild(projectId, options?.reason ?? 'stale');
		}

		return data.snapshot as OntologyContext;
	}

	private queueSnapshotBuild(projectId: string, reason: string): void {
		if (!this.userId) {
			return;
		}
		void queueProjectContextSnapshot({
			projectId,
			userId: this.userId,
			reason
		});
	}

	/**
	 * Load ontology context based on context type and optional entity.
	 *
	 * @param contextType - The context type
	 * @param entityId - Optional entity ID
	 * @param ontologyEntityType - Optional entity type for element-level context
	 * @returns OntologyContext or null
	 */
	private async loadOntologyContext(
		contextType: ChatContextType,
		entityId?: string,
		ontologyEntityType?: 'task' | 'plan' | 'goal' | 'document' | 'milestone' | 'risk'
	): Promise<OntologyContext | null> {
		logger.debug('Loading ontology context', {
			contextType,
			entityId,
			ontologyEntityType
		});

		try {
			// If entity type is specified, load element context
			if (ontologyEntityType && entityId) {
				logger.debug('Loading element-level ontology context');
				return await this.loader.loadElementContext(ontologyEntityType, entityId);
			}

			// If project context, load project-level ontology
			if (
				(contextType === 'project' ||
					contextType === 'project_audit' ||
					contextType === 'project_forecast') &&
				entityId
			) {
				logger.debug('Loading project-level ontology context');
				const snapshot = await this.loadProjectSnapshot(entityId, {
					reason: 'project_context'
				});
				if (snapshot) {
					return snapshot;
				}
				return await this.loader.loadProjectContext(entityId);
			}

			// Otherwise, load global context
			if (contextType === 'global') {
				logger.debug('Loading global ontology context');
				return await this.loader.loadGlobalContext();
			}

			// No ontology context applicable
			logger.debug('No ontology context applicable for context type', { contextType });
			return null;
		} catch (error) {
			logger.error('Failed to load ontology context', { error, contextType, entityId });
			throw error;
		}
	}

	private shouldUseProjectFocus(contextType: ChatContextType, request: StreamRequest): boolean {
		const isProjectContext = (PROJECT_CONTEXT_TYPES as readonly string[]).includes(contextType);
		const focusExplicit = request.project_focus !== undefined;
		return isProjectContext || focusExplicit;
	}

	/**
	 * Check if cache is valid for given key.
	 *
	 * @param cache - The cached data
	 * @param expectedKey - The expected cache key
	 * @returns True if cache is valid
	 */
	isCacheValid(cache: OntologyCache | undefined, expectedKey: string): boolean {
		if (!cache) return false;
		if (cache.cacheKey !== expectedKey) return false;

		const cacheAge = Date.now() - cache.loadedAt;
		return cacheAge < ONTOLOGY_CACHE_TTL_MS;
	}

	/**
	 * Generate cache key for given parameters.
	 * Exposed for external use if needed.
	 */
	getCacheKey(
		focus: StreamRequest['project_focus'],
		contextType: ChatContextType,
		entityId?: string
	): string {
		return generateOntologyCacheKey(focus ?? null, contextType, entityId);
	}
}

// ============================================
// FACTORY FUNCTION
// ============================================

/**
 * Create an OntologyCacheService instance.
 *
 * @param supabase - Supabase client
 * @param actorId - The actor ID for ownership checks
 * @returns OntologyCacheService instance
 */
export function createOntologyCacheService(
	supabase: SupabaseClient<Database>,
	actorId: string,
	userId?: string
): OntologyCacheService {
	return new OntologyCacheService(supabase, actorId, userId);
}
