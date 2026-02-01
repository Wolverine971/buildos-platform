// apps/web/src/routes/api/agent/stream/services/access-check.ts
/**
 * Access Check Service for /api/agent/stream endpoint.
 *
 * Provides a fast, minimal-access validation before expensive ontology loads.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, ChatContextType } from '@buildos/shared-types';
import type { StreamRequest, AgentSessionMetadata } from '../types';
import { PROJECT_CONTEXT_TYPES } from '../constants';
import { normalizeContextType, normalizeProjectFocus } from '../utils';
import { createLogger } from '$lib/utils/logger';

const logger = createLogger('AccessCheck');

const ENTITY_TABLE_MAP: Record<string, keyof Database['public']['Tables']> = {
	task: 'onto_tasks',
	plan: 'onto_plans',
	goal: 'onto_goals',
	document: 'onto_documents',
	milestone: 'onto_milestones',
	risk: 'onto_risks',
	requirement: 'onto_requirements'
};

export class AccessCheckService {
	constructor(private supabase: SupabaseClient<Database>) {}

	async checkAccess(params: {
		request: StreamRequest;
		metadata: AgentSessionMetadata;
	}): Promise<{ allowed: boolean; reason?: string }> {
		const contextType = normalizeContextType(params.request.context_type);
		const normalizedFocus = normalizeProjectFocus(
			params.metadata.focus ?? params.request.project_focus ?? null
		);

		// Contexts that do not require access gating.
		if (contextType === 'global' || contextType === 'project_create') {
			return { allowed: true, reason: 'no_access_required' };
		}

		// Prefer project focus access when available.
		const projectId =
			normalizedFocus?.projectId ??
			((PROJECT_CONTEXT_TYPES as readonly ChatContextType[]).includes(contextType)
				? params.request.entity_id
				: undefined);

		if (projectId) {
			const hasAccess = await this.checkProjectAccess(projectId);
			return { allowed: hasAccess, reason: hasAccess ? 'project_access' : 'project_denied' };
		}

		// If an ontology entity type is provided, validate access via minimal row lookup.
		if (params.request.ontology_entity_type && params.request.entity_id) {
			const hasAccess = await this.checkEntityAccess(
				params.request.ontology_entity_type,
				params.request.entity_id
			);
			return { allowed: hasAccess, reason: hasAccess ? 'entity_access' : 'entity_denied' };
		}

		// No deterministic target to check; allow and let ontology loader enforce if needed.
		return { allowed: true, reason: 'no_target' };
	}

	private async checkProjectAccess(projectId: string): Promise<boolean> {
		try {
			const { data, error } = await this.supabase.rpc('current_actor_has_project_access', {
				p_project_id: projectId,
				p_required_access: 'read'
			});

			if (error) {
				logger.warn('Project access RPC failed; falling back to project lookup', {
					error,
					projectId
				});
				return this.fallbackProjectLookup(projectId);
			}

			return !!data;
		} catch (error) {
			logger.warn('Project access check failed', { error, projectId });
			return this.fallbackProjectLookup(projectId);
		}
	}

	private async fallbackProjectLookup(projectId: string): Promise<boolean> {
		const { data, error } = await this.supabase
			.from('onto_projects')
			.select('id')
			.eq('id', projectId)
			.maybeSingle();

		if (error) {
			logger.warn('Project fallback lookup failed', { error, projectId });
			return false;
		}

		return !!data;
	}

	private async checkEntityAccess(entityType: string, entityId: string): Promise<boolean> {
		const table = ENTITY_TABLE_MAP[entityType];
		if (!table) {
			logger.warn('Unknown entity type for access check', { entityType, entityId });
			return false;
		}

		const { data, error } = await this.supabase
			.from(table)
			.select('id')
			.eq('id', entityId)
			.maybeSingle();

		if (error) {
			logger.warn('Entity access lookup failed', { error, entityType, entityId });
			return false;
		}

		return !!data;
	}
}

export function createAccessCheckService(supabase: SupabaseClient<Database>): AccessCheckService {
	return new AccessCheckService(supabase);
}
