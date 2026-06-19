// apps/web/src/lib/services/async-activity-logger.ts
/**
 * Async Activity Logger — web entry.
 *
 * The core param-taking logging functions moved to @buildos/shared-agent-ops (R2)
 * so the worker op layer can log activity without a SvelteKit request. The two
 * Request-header helpers below are web-only and stay here. Existing importers of
 * $lib/services/async-activity-logger are unaffected.
 */

import type { ProjectLogChangeSource } from '@buildos/shared-types';

// Re-export the moved core (functions + types).
export {
	logActivityAsync,
	logActivitiesAsync,
	logCreateAsync,
	logUpdateAsync,
	logDeleteAsync
} from '@buildos/shared-agent-ops/ops/async-activity-logger';
export type {
	ActivityLogParams,
	BulkActivityLogParams,
	ActivityLogActorContext
} from '@buildos/shared-agent-ops/ops/async-activity-logger';

// =============================================================================
// Web-only Request helpers (depend on the incoming Request)
// =============================================================================

/**
 * Extract change source from request headers.
 * Looks for X-Change-Source header to identify the source of the change.
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
