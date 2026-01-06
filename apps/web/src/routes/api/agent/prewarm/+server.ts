// apps/web/src/routes/api/agent/prewarm/+server.ts
/**
 * Agent context prewarm endpoint.
 *
 * Best-effort cache warming for linked entities + location context.
 * Intended to run when the chat opens or focus changes.
 */

import type { RequestHandler } from './$types';
import type { ChatContextType, ProjectFocus } from '@buildos/shared-types';
import { ApiResponse } from '$lib/utils/api-response';
import { createLogger } from '$lib/utils/logger';
import { ChatContextService } from '$lib/services/chat-context-service';
import { OntologyContextLoader } from '$lib/services/ontology-context-loader';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';
import {
	buildLinkedEntitiesCacheKey,
	buildLocationCacheKey,
	isCacheFresh
} from '$lib/services/agentic-chat/context-prewarm';
import { normalizeContextType } from '../stream/utils/context-utils';
import { createSessionManager } from '../stream/services';
import type { AgentSessionMetadata } from '../stream/types';

const logger = createLogger('API:AgentPrewarm');

interface PrewarmRequestBody {
	session_id?: string;
	context_type?: ChatContextType;
	entity_id?: string;
	projectFocus?: ProjectFocus | null;
}

async function authenticateRequest(
	safeGetSession: () => Promise<{ user: { id: string } | null }>,
	supabase: any
): Promise<
	{ success: true; userId: string; actorId: string } | { success: false; response: Response }
> {
	const { user } = await safeGetSession();
	if (!user?.id) {
		return { success: false, response: ApiResponse.unauthorized() };
	}

	try {
		const actorId = await ensureActorId(supabase as any, user.id);
		return { success: true, userId: user.id, actorId };
	} catch (error) {
		logger.error('Failed to resolve actor for prewarm', { error, userId: user.id });
		return {
			success: false,
			response: ApiResponse.error('Failed to resolve actor', 500, 'ACTOR_RESOLUTION_FAILED')
		};
	}
}

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const authResult = await authenticateRequest(safeGetSession, supabase);
	if (!authResult.success) {
		return authResult.response;
	}
	const { userId, actorId } = authResult;

	let body: PrewarmRequestBody;
	try {
		body = (await request.json()) as PrewarmRequestBody;
	} catch (error) {
		return ApiResponse.badRequest('Invalid request body');
	}

	const { session_id, context_type, entity_id, projectFocus } = body;
	if (!session_id) {
		return ApiResponse.success({ warmed: false, reason: 'no_session' });
	}

	const normalizedContextType = normalizeContextType(context_type);
	const sessionManager = createSessionManager(supabase);

	const { data: session, error: sessionError } = await supabase
		.from('chat_sessions')
		.select('id, agent_metadata, context_type, entity_id')
		.eq('id', session_id)
		.eq('user_id', userId)
		.single();

	if (sessionError || !session) {
		return ApiResponse.notFound('Session');
	}

	const metadata: AgentSessionMetadata = (session.agent_metadata as AgentSessionMetadata) ?? {};
	const resolvedFocus = projectFocus ?? (metadata.focus as ProjectFocus | null) ?? null;
	const resolvedEntityId = entity_id ?? resolvedFocus?.projectId ?? session.entity_id ?? undefined;

	const locationCacheKey = buildLocationCacheKey(normalizedContextType, resolvedEntityId);
	const linkedEntitiesCacheKey = buildLinkedEntitiesCacheKey(resolvedFocus);

	const requiresEntityId =
		normalizedContextType === 'project' ||
		normalizedContextType === 'project_audit' ||
		normalizedContextType === 'project_forecast';
	const shouldWarmLocation = !requiresEntityId || !!resolvedEntityId;

	const hasFreshLocationCache =
		metadata.locationContextCache?.cacheKey === locationCacheKey &&
		isCacheFresh(metadata.locationContextCache.loadedAt);

	const hasFreshLinkedCache =
		linkedEntitiesCacheKey &&
		metadata.linkedEntitiesCache?.cacheKey === linkedEntitiesCacheKey &&
		isCacheFresh(metadata.linkedEntitiesCache.loadedAt);

	const locationPromise =
		shouldWarmLocation && !hasFreshLocationCache
			? new ChatContextService(supabase).loadLocationContext(
					normalizedContextType,
					resolvedEntityId,
					true,
					userId
				)
			: null;

	const linkedEntitiesPromise =
		linkedEntitiesCacheKey &&
		!hasFreshLinkedCache &&
		resolvedFocus?.focusType &&
		resolvedFocus.focusType !== 'project-wide' &&
		resolvedFocus.focusEntityId &&
		resolvedFocus.focusEntityName
			? new OntologyContextLoader(supabase, actorId).loadLinkedEntitiesContext(
					resolvedFocus.focusEntityId,
					resolvedFocus.focusType,
					resolvedFocus.focusEntityName,
					{ maxPerType: 3, includeDescriptions: false }
				)
			: null;

	const [locationContext, linkedEntitiesContext] = await Promise.all([
		locationPromise,
		linkedEntitiesPromise
	]);

	let updated = false;

	if (locationContext && !hasFreshLocationCache) {
		metadata.locationContextCache = {
			cacheKey: locationCacheKey,
			loadedAt: Date.now(),
			content: locationContext.content,
			metadata: locationContext.metadata
		};
		updated = true;
	}

	if (linkedEntitiesContext && linkedEntitiesCacheKey && !hasFreshLinkedCache) {
		metadata.linkedEntitiesCache = {
			cacheKey: linkedEntitiesCacheKey,
			loadedAt: Date.now(),
			context: linkedEntitiesContext
		};
		updated = true;
	}

	if (updated) {
		await sessionManager.updateSessionMetadata(session.id, metadata);
	}

	return ApiResponse.success({ warmed: updated });
};
