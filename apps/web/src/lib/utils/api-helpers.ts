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

import type { TypedSupabaseClient } from '$lib/supabase/client';
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

/**
 * Sanitizes a search query for use in Supabase ilike/or filters.
 * Escapes special characters that could cause issues in pattern matching.
 *
 * @param query - The raw search query from user input
 * @returns Sanitized query safe for use in filter strings
 *
 * @example
 * const sanitized = sanitizeSearchQuery(userInput);
 * query = query.ilike('name', `%${sanitized}%`);
 */
export function sanitizeSearchQuery(query: string): string {
	const normalized = normalizeSearchQuery(query);
	if (!normalized) {
		return '';
	}

	return escapeLikePattern(normalized);
}

/**
 * Builds a safe search filter string for Supabase .or() queries
 *
 * @param query - The raw search query
 * @param fields - Array of field names to search
 * @returns Filter string for use with .or(), or null if query is empty
 *
 * @example
 * const filter = buildSearchFilter(query, ['name', 'description']);
 * if (filter) {
 *   dbQuery = dbQuery.or(filter);
 * }
 */
export function buildSearchFilter(query: string, fields: string[]): string | null {
	const normalized = normalizeSearchQuery(query);
	if (!normalized) {
		return null;
	}

	const pattern = escapeLikePattern(normalized);
	const quotedValue = `"${escapePostgrestValue(`%${pattern}%`)}"`;
	return fields.map((field) => `${field}.ilike.${quotedValue}`).join(',');
}

function normalizeSearchQuery(query: string): string {
	if (!query || typeof query !== 'string') {
		return '';
	}

	let normalized = query.trim();

	// Remove control characters to keep filters predictable
	normalized = normalized.replace(/[\u0000-\u001f\u007f]/g, '');

	// Limit length to prevent abuse (reasonable search query length)
	if (normalized.length > 200) {
		normalized = normalized.substring(0, 200);
	}

	return normalized;
}

function escapeLikePattern(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function escapePostgrestValue(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// ============================================
// AUTHORIZATION HELPERS
// ============================================

export interface AuthorizationResult {
	authorized: boolean;
	error?: Response;
	actorId?: string;
}

/**
 * Verifies that the current user owns/has access to a project.
 * Uses the onto_projects table to check created_by matches the user's actor.
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
		'current_actor_has_project_access',
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

/**
 * Verifies project access for legacy projects table (non-ontology).
 * Uses user_id field instead of created_by/actor.
 *
 * @param supabase - The Supabase client
 * @param projectId - The project ID to verify
 * @param userId - The authenticated user's ID
 * @returns Authorization result with error response if unauthorized
 */
export async function verifyLegacyProjectAccess(
	supabase: TypedSupabaseClient,
	projectId: string,
	userId: string
): Promise<AuthorizationResult> {
	const { data: project, error: projectError } = await supabase
		.from('projects')
		.select('id, user_id')
		.eq('id', projectId)
		.single();

	if (projectError || !project) {
		return {
			authorized: false,
			error: ApiResponse.notFound('Project')
		};
	}

	if (project.user_id !== userId) {
		return {
			authorized: false,
			error: ApiResponse.forbidden('You do not have access to this project')
		};
	}

	return {
		authorized: true
	};
}

/**
 * Verifies access to an entity within a project.
 * First checks project access, then entity existence.
 *
 * @param supabase - The Supabase client
 * @param table - The entity table name (e.g., 'onto_tasks', 'onto_outputs')
 * @param entityId - The entity ID to verify
 * @param projectId - The project ID the entity should belong to
 * @param userId - The authenticated user's ID
 * @returns Authorization result
 */
export async function verifyEntityAccess(
	supabase: TypedSupabaseClient,
	table: string,
	entityId: string,
	projectId: string,
	userId: string
): Promise<AuthorizationResult> {
	// First verify project access
	const projectAuth = await verifyProjectAccess(supabase, projectId, userId);
	if (!projectAuth.authorized) {
		return projectAuth;
	}

	// Then verify entity belongs to this project
	const { data: entity, error: entityError } = await supabase
		.from(table)
		.select('id, project_id')
		.eq('id', entityId)
		.is('deleted_at', null)
		.single();

	if (entityError || !entity) {
		return {
			authorized: false,
			error: ApiResponse.notFound('Entity')
		};
	}

	if (entity.project_id !== projectId) {
		return {
			authorized: false,
			error: ApiResponse.forbidden('Entity does not belong to this project')
		};
	}

	return {
		authorized: true,
		actorId: projectAuth.actorId
	};
}

// ============================================
// DATE VALIDATION HELPERS
// ============================================

/**
 * Validates and normalizes a date string input.
 * Accepts YYYY-MM-DD or ISO datetime strings.
 *
 * @param value - The date string to validate
 * @param fallback - Value to return if invalid (default: null)
 * @returns ISO datetime string or fallback
 */
export function validateDateInput(value: unknown, fallback: string | null = null): string | null {
	if (value === null || value === undefined) {
		return null;
	}

	if (typeof value !== 'string') {
		return fallback;
	}

	const trimmed = value.trim();
	if (!trimmed) {
		return null;
	}

	// Accept YYYY-MM-DD format with stricter validation
	const dateOnlyPattern = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
	if (dateOnlyPattern.test(trimmed)) {
		const date = new Date(`${trimmed}T00:00:00Z`);
		// Verify the date is actually valid (e.g., not Feb 30)
		if (!isNaN(date.getTime())) {
			const [year, month, day] = trimmed.split('-').map(Number);
			if (
				date.getUTCFullYear() === year &&
				date.getUTCMonth() + 1 === month &&
				date.getUTCDate() === day
			) {
				return date.toISOString();
			}
		}
		return fallback;
	}

	// Accept ISO datetime strings
	const parsed = new Date(trimmed);
	if (!isNaN(parsed.getTime())) {
		return parsed.toISOString();
	}

	return fallback;
}

// ============================================
// REQUEST BODY VALIDATION
// ============================================

/**
 * Safely parses and validates an array of update objects.
 * Used for batch update endpoints.
 *
 * @param updates - Array of update objects to validate
 * @param requiredFields - Fields required in each update object
 * @returns Validation result with sanitized data or error
 */
export function validateBatchUpdates<T extends Record<string, unknown>>(
	updates: unknown,
	requiredFields: string[] = ['id']
): { valid: true; data: T[] } | { valid: false; error: string } {
	if (!Array.isArray(updates)) {
		return { valid: false, error: 'Updates must be an array' };
	}

	if (updates.length === 0) {
		return { valid: false, error: 'No updates provided' };
	}

	// Cap the number of batch updates to prevent abuse
	if (updates.length > 100) {
		return { valid: false, error: 'Maximum 100 updates per batch' };
	}

	// Validate each update object
	for (let i = 0; i < updates.length; i++) {
		const update = updates[i];

		if (!update || typeof update !== 'object') {
			return { valid: false, error: `Update at index ${i} is not a valid object` };
		}

		for (const field of requiredFields) {
			if (!(field in update) || update[field] === undefined || update[field] === null) {
				return {
					valid: false,
					error: `Update at index ${i} is missing required field: ${field}`
				};
			}
		}
	}

	return { valid: true, data: updates as T[] };
}
