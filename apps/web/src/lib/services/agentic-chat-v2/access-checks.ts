// apps/web/src/lib/services/agentic-chat-v2/access-checks.ts
/**
 * Access-control checks for the FastChat v2 stream route.
 *
 * Verifies that the acting user may read a given project or daily brief before
 * the turn proceeds. Extracted from the route file so the orchestration spine
 * stays focused on flow.
 *
 * Security note: `checkProjectAccess` is authoritative via the
 * `current_actor_has_project_member_access` RPC. When that RPC is unavailable
 * it fails CLOSED (`checkProjectAccessFallback`) rather than approximating the
 * grant with a bare row lookup — an RLS-visible row does not prove the actor
 * holds the required 'read' grant.
 */

import type { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { createLogger } from '$lib/utils/logger';

const logger = createLogger('API:AgentStreamV2:AccessChecks');

const FASTCHAT_STREAM_ENDPOINT = '/api/agent/v2/stream';
const FASTCHAT_STREAM_METHOD = 'POST';

export async function checkProjectAccessFallback(
	supabase: any,
	projectId: string,
	errorLogger?: ErrorLoggerService,
	context?: {
		userId?: string;
		endpoint?: string;
		httpMethod?: string;
	},
	fallbackReason: 'rpc_failed' | 'exception' = 'rpc_failed'
): Promise<{ allowed: boolean; reason: string }> {
	// Security note: this fallback runs only when the authoritative access RPC
	// (`current_actor_has_project_member_access`) fails. We intentionally fail closed
	// rather than approximate the access check with a bare row lookup — an
	// RLS-visible row does not prove the actor has the required ('read') grant
	// on the project. Log the failure so we can investigate RPC outages.
	logger.warn('Project access RPC unavailable; denying by default', {
		projectId,
		fallbackReason,
		userId: context?.userId
	});
	if (errorLogger) {
		void errorLogger.logError(new Error('project_access_rpc_unavailable'), {
			userId: context?.userId,
			endpoint: context?.endpoint ?? FASTCHAT_STREAM_ENDPOINT,
			httpMethod: context?.httpMethod ?? FASTCHAT_STREAM_METHOD,
			operationType: 'fastchat_project_access_fallback',
			metadata: { projectId, fallbackReason, reason: 'rpc_unavailable_fail_closed' }
		});
	}
	return { allowed: false, reason: 'rpc_unavailable_fail_closed' };
}

export async function checkProjectAccess(
	supabase: any,
	projectId: string,
	errorLogger?: ErrorLoggerService,
	context?: {
		userId?: string;
		endpoint?: string;
		httpMethod?: string;
	}
): Promise<{ allowed: boolean; reason?: string }> {
	try {
		if (context?.userId) {
			const { data: actorId, error: actorError } = await supabase.rpc(
				'ensure_actor_for_user',
				{
					p_user_id: context.userId
				}
			);
			if (actorError || !actorId) {
				logger.warn('Project access actor resolution failed', {
					error: actorError,
					projectId
				});
				return { allowed: false, reason: 'actor_resolution_failed' };
			}
		}

		const { data, error } = await supabase.rpc('current_actor_has_project_member_access', {
			p_project_id: projectId,
			p_required_access: 'read'
		});

		if (error) {
			logger.warn('Project access RPC failed; falling back to project lookup', {
				error,
				projectId
			});
			if (errorLogger) {
				void errorLogger.logError(error, {
					userId: context?.userId,
					endpoint: context?.endpoint ?? FASTCHAT_STREAM_ENDPOINT,
					httpMethod: context?.httpMethod ?? FASTCHAT_STREAM_METHOD,
					operationType: 'fastchat_project_access',
					metadata: { projectId, reason: 'rpc_failed' }
				});
			}
			return checkProjectAccessFallback(
				supabase,
				projectId,
				errorLogger,
				context,
				'rpc_failed'
			);
		}

		return { allowed: !!data, reason: data ? 'ok' : 'denied' };
	} catch (error) {
		logger.warn('Project access check failed; falling back to project lookup', {
			error,
			projectId
		});
		if (errorLogger) {
			void errorLogger.logError(error, {
				userId: context?.userId,
				endpoint: context?.endpoint ?? FASTCHAT_STREAM_ENDPOINT,
				httpMethod: context?.httpMethod ?? FASTCHAT_STREAM_METHOD,
				operationType: 'fastchat_project_access',
				metadata: { projectId, reason: 'exception' }
			});
		}
		return checkProjectAccessFallback(supabase, projectId, errorLogger, context, 'exception');
	}
}

export async function checkDailyBriefAccess(
	supabase: any,
	briefId: string,
	userId: string,
	errorLogger?: ErrorLoggerService,
	context?: {
		endpoint?: string;
		httpMethod?: string;
	}
): Promise<{ allowed: boolean; reason?: string }> {
	try {
		const { data, error } = await supabase
			.from('ontology_daily_briefs')
			.select('id')
			.eq('id', briefId)
			.eq('user_id', userId)
			.maybeSingle();

		if (error) {
			logger.warn('Daily brief access check failed', { error, briefId, userId });
			if (errorLogger) {
				void errorLogger.logError(error, {
					userId,
					endpoint: context?.endpoint ?? FASTCHAT_STREAM_ENDPOINT,
					httpMethod: context?.httpMethod ?? FASTCHAT_STREAM_METHOD,
					operationType: 'fastchat_daily_brief_access',
					metadata: { briefId, reason: 'query_failed' }
				});
			}
			return { allowed: false, reason: 'query_failed' };
		}

		return { allowed: Boolean(data), reason: data ? 'ok' : 'not_found' };
	} catch (error) {
		logger.warn('Daily brief access check exception', { error, briefId, userId });
		if (errorLogger) {
			void errorLogger.logError(error, {
				userId,
				endpoint: context?.endpoint ?? FASTCHAT_STREAM_ENDPOINT,
				httpMethod: context?.httpMethod ?? FASTCHAT_STREAM_METHOD,
				operationType: 'fastchat_daily_brief_access',
				metadata: { briefId, reason: 'exception' }
			});
		}
		return { allowed: false, reason: 'exception' };
	}
}
