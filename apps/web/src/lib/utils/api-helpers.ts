// apps/web/src/lib/utils/api-helpers.ts
/**
 * Shared API Helper Utilities
 *
 * This module provides common utilities for API endpoints:
 * - Pagination validation and parsing
 * - Search query sanitization
 * - Project/entity authorization helpers
 *
 * Created: 2026-01-03 as part of security/performance audit fixes
 */

import type { SupabaseClient } from '@supabase/supabase-js';
type TypedSupabaseClient = SupabaseClient<any>;
import { ApiResponse } from './api-response';

// ============================================
// PAGINATION HELPERS
// ============================================

export interface PaginationParams {
	page: number;
	limit: number;
	offset: number;
}

export interface PaginationConfig {
	defaultLimit?: number;
	maxLimit?: number;
	defaultPage?: number;
}

const DEFAULT_PAGINATION_CONFIG: Required<PaginationConfig> = {
	defaultLimit: 20,
	maxLimit: 100,
	defaultPage: 1
};

/**
 * Validates and parses pagination parameters from URL search params.
 * Provides safe defaults and enforces maximum limits to prevent abuse.
 *
 * @param url - The URL object containing search params
 * @param config - Optional configuration for defaults and limits
 * @returns Validated pagination parameters
 *
 * @example
 * const { page, limit, offset } = validatePagination(url);
 * const { data } = await supabase.from('table').select().range(offset, offset + limit - 1);
 */
export function validatePagination(url: URL, config: PaginationConfig = {}): PaginationParams {
	const { defaultLimit, maxLimit, defaultPage } = {
		...DEFAULT_PAGINATION_CONFIG,
		...config
	};

	// Parse page parameter
	let page = parseInt(url.searchParams.get('page') || String(defaultPage), 10);
	if (isNaN(page) || page < 1) {
		page = defaultPage;
	}

	// Parse limit parameter with upper bound
	let limit = parseInt(url.searchParams.get('limit') || String(defaultLimit), 10);
	if (isNaN(limit) || limit < 1) {
		limit = defaultLimit;
	}
	if (limit > maxLimit) {
		limit = maxLimit;
	}

	// Calculate offset
	const offset = (page - 1) * limit;

	return { page, limit, offset };
}

/**
 * Validates pagination with custom parameter names (e.g., 'pageSize' instead of 'limit')
 */
export function validatePaginationCustom(
	params: { page?: string | null; limit?: string | null; offset?: string | null },
	config: PaginationConfig = {}
): PaginationParams {
	const { defaultLimit, maxLimit, defaultPage } = {
		...DEFAULT_PAGINATION_CONFIG,
		...config
	};

	// Parse page parameter
	let page = parseInt(params.page || String(defaultPage), 10);
	if (isNaN(page) || page < 1) {
		page = defaultPage;
	}

	// Parse limit parameter with upper bound
	let limit = parseInt(params.limit || String(defaultLimit), 10);
	if (isNaN(limit) || limit < 1) {
		limit = defaultLimit;
	}
	if (limit > maxLimit) {
		limit = maxLimit;
	}

	// If offset is directly provided, use it; otherwise calculate from page
	let offset: number;
	if (params.offset !== undefined && params.offset !== null) {
		offset = parseInt(params.offset, 10);
		if (isNaN(offset) || offset < 0) {
			offset = 0;
		}
	} else {
		offset = (page - 1) * limit;
	}

	return { page, limit, offset };
}

// ============================================
// SEARCH QUERY SANITIZATION
// ============================================
//
// Extracted to @buildos/shared-agent-ops (R1) so the worker op layer can build
// search filters without SvelteKit. Re-exported so $lib/utils/api-helpers importers
// stay unaffected.
export {
	sanitizeSearchQuery,
	buildSearchFilter
} from '@buildos/shared-agent-ops/utils/search-filter';

// ============================================
// AUTHORIZATION HELPERS
// ============================================

export interface AuthorizationResult {
	authorized: boolean;
	error?: Response;
	actorId?: string;
}

/**
 * Verifies that the current user owns or is an active member of a project.
 * Public project visibility is not treated as collaboration access here.
 *
 * @param supabase - The Supabase client
 * @param projectId - The project ID to verify
 * @param userId - The authenticated user's ID
 * @returns Authorization result with error response if unauthorized
 *
 * @example
 * const authResult = await verifyProjectAccess(supabase, projectId, user.id);
 * if (!authResult.authorized) {
 *   return authResult.error;
 * }
 */
export async function verifyProjectAccess(
	supabase: TypedSupabaseClient,
	projectId: string,
	userId: string
): Promise<AuthorizationResult> {
	// First, ensure we have an actor ID for this user
	const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
		p_user_id: userId
	});

	if (actorError || !actorId) {
		console.error('Failed to resolve user actor:', actorError);
		return {
			authorized: false,
			error: ApiResponse.error('Failed to resolve user actor', 500)
		};
	}

	const { data: hasAccess, error: accessError } = await supabase.rpc(
		'current_actor_has_project_member_access',
		{
			p_project_id: projectId,
			p_required_access: 'read'
		}
	);

	if (accessError) {
		console.error('Failed to check project access:', accessError);
		return {
			authorized: false,
			error: ApiResponse.error('Failed to check project access', 500)
		};
	}

	if (!hasAccess) {
		return {
			authorized: false,
			error: ApiResponse.forbidden('You do not have access to this project')
		};
	}

	// Check if the project exists (and is not soft-deleted)
	const { data: project, error: projectError } = await supabase
		.from('onto_projects')
		.select('id')
		.eq('id', projectId)
		.is('deleted_at', null)
		.maybeSingle();

	if (projectError || !project) {
		return {
			authorized: false,
			error: ApiResponse.notFound('Project')
		};
	}

	return {
		authorized: true,
		actorId
	};
}

// ============================================
// DATE VALIDATION HELPERS
// ============================================

// ============================================
// REQUEST BODY VALIDATION
// ============================================
