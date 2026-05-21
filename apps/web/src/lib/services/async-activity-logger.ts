// apps/web/src/lib/services/async-activity-logger.ts
/**
 * Async Activity Logger - Non-blocking activity logging utility
 *
 * This module provides a fire-and-forget-compatible pattern for logging activity
 * changes to the onto_project_logs table. Callers may ignore the returned
 * promise for non-blocking behavior, or await it when the log must be attempted
 * before the request completes.
 *
 * Usage:
 * ```ts
 * import { logActivityAsync } from '$lib/services/async-activity-logger';
 *
 * // Fire and forget - doesn't block the main thread
 * logActivityAsync(supabase, {
 *   projectId: 'project-123',
 *   entityType: 'task',
 *   entityId: 'task-456',
 *   action: 'created',
 *   afterData: { title: 'New Task' },
 *   changedBy: userId,
 *   changeSource: 'form'
 * });
 * ```
 *
 * @see /apps/web/src/lib/services/project-activity-log.service.ts
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import type {
	ProjectLogEntityType,
	ProjectLogAction,
	ProjectLogChangeSource
} from '@buildos/shared-types';

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Extract change source from request headers.
 * Looks for X-Change-Source header to identify the source of the change.
 *
 * @param request - The incoming request object
 * @returns The change source ('chat', 'api', 'form', 'brain_dump', 'agent_call') or default 'api'
 */
export function getChangeSourceFromRequest(request: Request): ProjectLogChangeSource {
	const headerValue = request.headers.get('X-Change-Source');
	if (headerValue && ['chat', 'api', 'form', 'brain_dump', 'agent_call'].includes(headerValue)) {
		return headerValue as ProjectLogChangeSource;
	}
	return 'api';
}

/**
 * Extract chat session ID from request headers.
 * Looks for X-Chat-Session-Id header to link activity logs to agentic chat sessions.
 */
export function getChatSessionIdFromRequest(request: Request): string | undefined {
	const headerValue = request.headers.get('X-Chat-Session-Id');
	if (headerValue && headerValue.trim().length > 0) {
		return headerValue.trim();
	}
	return undefined;
}

// =============================================================================
// Types
// =============================================================================

export interface ActivityLogParams {
	projectId: string;
	entityType: ProjectLogEntityType;
	entityId: string;
	action: ProjectLogAction;
	beforeData?: Record<string, unknown> | null;
	afterData?: Record<string, unknown> | null;
	changedBy: string;
	changedByActorId?: string | null;
	changeSource?: ProjectLogChangeSource;
	chatSessionId?: string;
	externalAgentCallerId?: string | null;
	agentCallSessionId?: string | null;
}

export interface BulkActivityLogParams {
	logs: ActivityLogParams[];
}

export interface ActivityLogActorContext {
	changedByActorId?: string | null;
	externalAgentCallerId?: string | null;
	agentCallSessionId?: string | null;
}

// =============================================================================
// Core Async Logging Functions
// =============================================================================

/**
 * Log a single activity change asynchronously.
 *
 * Errors are logged to console but do not throw. Ignore the returned promise for
 * fire-and-forget behavior, or await it to ensure the insert attempt completes.
 *
 * @param supabase - Supabase client
 * @param params - Activity log parameters
 */
export function logActivityAsync(
	supabase: SupabaseClient<Database>,
	params: ActivityLogParams
): Promise<void> {
	return performLogInsert(supabase, params).catch((error) => {
		console.error('[AsyncActivityLogger] Failed to log activity:', error, {
			entityType: params.entityType,
			entityId: params.entityId,
			action: params.action
		});
	});
}

/**
 * Log multiple activity changes asynchronously.
 *
 * Errors are logged to console but do not throw. Ignore the returned promise for
 * fire-and-forget behavior, or await it to ensure the insert attempt completes.
 *
 * @param supabase - Supabase client
 * @param params - Bulk activity log parameters
 */
export function logActivitiesAsync(
	supabase: SupabaseClient<Database>,
	params: BulkActivityLogParams
): Promise<void> {
	if (params.logs.length === 0) return Promise.resolve();

	return performBulkLogInsert(supabase, params.logs).catch((error) => {
		console.error('[AsyncActivityLogger] Failed to log bulk activities:', error, {
			count: params.logs.length
		});
	});
}

// =============================================================================
// Internal Implementation
// =============================================================================

async function performLogInsert(
	supabase: SupabaseClient<Database>,
	params: ActivityLogParams
): Promise<void> {
	// Use any to bypass Supabase's strict type inference issues
	// The structure is correct and matches onto_project_logs schema
	const insertData = {
		project_id: params.projectId,
		entity_type: params.entityType,
		entity_id: params.entityId,
		action: params.action,
		before_data: params.beforeData ?? null,
		after_data: params.afterData ?? null,
		changed_by: params.changedBy,
		changed_by_actor_id: params.changedByActorId ?? null,
		external_agent_caller_id: params.externalAgentCallerId ?? null,
		agent_call_session_id: params.agentCallSessionId ?? null,
		change_source: params.changeSource ?? null,
		chat_session_id: params.chatSessionId ?? null
	};

	const { error } = await supabase.from('onto_project_logs').insert(insertData as any);

	if (error) {
		throw error;
	}
}

async function performBulkLogInsert(
	supabase: SupabaseClient<Database>,
	logs: ActivityLogParams[]
): Promise<void> {
	// Use any to bypass Supabase's strict type inference issues
	// The structure is correct and matches onto_project_logs schema
	const insertData = logs.map((log) => ({
		project_id: log.projectId,
		entity_type: log.entityType,
		entity_id: log.entityId,
		action: log.action,
		before_data: log.beforeData ?? null,
		after_data: log.afterData ?? null,
		changed_by: log.changedBy,
		changed_by_actor_id: log.changedByActorId ?? null,
		external_agent_caller_id: log.externalAgentCallerId ?? null,
		agent_call_session_id: log.agentCallSessionId ?? null,
		change_source: log.changeSource ?? null,
		chat_session_id: log.chatSessionId ?? null
	}));

	const { error } = await supabase.from('onto_project_logs').insert(insertData as any);

	if (error) {
		throw error;
	}
}

// =============================================================================
// Convenience Functions for Common Operations
// =============================================================================

/**
 * Log entity creation asynchronously
 */
export function logCreateAsync(
	supabase: SupabaseClient<Database>,
	projectId: string,
	entityType: ProjectLogEntityType,
	entityId: string,
	entityData: Record<string, unknown>,
	changedBy: string,
	changeSource?: ProjectLogChangeSource,
	chatSessionId?: string,
	actorContext?: ActivityLogActorContext
): Promise<void> {
	return logActivityAsync(supabase, {
		projectId,
		entityType,
		entityId,
		action: 'created',
		beforeData: null,
		afterData: entityData,
		changedBy,
		changedByActorId: actorContext?.changedByActorId,
		changeSource,
		chatSessionId,
		externalAgentCallerId: actorContext?.externalAgentCallerId,
		agentCallSessionId: actorContext?.agentCallSessionId
	});
}

/**
 * Log entity update asynchronously
 */
export function logUpdateAsync(
	supabase: SupabaseClient<Database>,
	projectId: string,
	entityType: ProjectLogEntityType,
	entityId: string,
	beforeData: Record<string, unknown>,
	afterData: Record<string, unknown>,
	changedBy: string,
	changeSource?: ProjectLogChangeSource,
	chatSessionId?: string,
	actorContext?: ActivityLogActorContext
): Promise<void> {
	return logActivityAsync(supabase, {
		projectId,
		entityType,
		entityId,
		action: 'updated',
		beforeData,
		afterData,
		changedBy,
		changedByActorId: actorContext?.changedByActorId,
		changeSource,
		chatSessionId,
		externalAgentCallerId: actorContext?.externalAgentCallerId,
		agentCallSessionId: actorContext?.agentCallSessionId
	});
}

/**
 * Log entity deletion asynchronously
 */
export function logDeleteAsync(
	supabase: SupabaseClient<Database>,
	projectId: string,
	entityType: ProjectLogEntityType,
	entityId: string,
	entityData: Record<string, unknown>,
	changedBy: string,
	changeSource?: ProjectLogChangeSource,
	chatSessionId?: string,
	actorContext?: ActivityLogActorContext
): Promise<void> {
	return logActivityAsync(supabase, {
		projectId,
		entityType,
		entityId,
		action: 'deleted',
		beforeData: entityData,
		afterData: null,
		changedBy,
		changedByActorId: actorContext?.changedByActorId,
		changeSource,
		chatSessionId,
		externalAgentCallerId: actorContext?.externalAgentCallerId,
		agentCallSessionId: actorContext?.agentCallSessionId
	});
}
