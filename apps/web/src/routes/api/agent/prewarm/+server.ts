// apps/web/src/routes/api/agent/prewarm/+server.ts
/**
 * Agent context prewarm endpoint.
 *
 * Best-effort cache warming for linked entities + location context.
 * Intended to run when the chat opens or focus changes.
 */

import type { RequestHandler } from './$types';
import type { ChatContextType, ChatSession, ProjectFocus } from '@buildos/shared-types';
import { ApiResponse } from '$lib/utils/api-response';
import { createLogger } from '$lib/utils/logger';
import { ChatContextService } from '$lib/services/chat-context-service';
import { OntologyContextLoader } from '$lib/services/ontology-context-loader';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';
import {
	buildLinkedEntitiesCacheKey,
	buildLocationCacheKey,
	isCacheFresh,
	buildDocStructureCacheKey,
	DOC_STRUCTURE_CACHE_TTL_MS
} from '$lib/services/agentic-chat/context-prewarm';
import { getDocTree } from '$lib/services/ontology/doc-structure.service';
import { normalizeContextType } from '../stream/utils/context-utils';
import { createSessionManager } from '../stream/services';
import type { AgentSessionMetadata, DocStructureCache } from '../stream/types';

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

async function hasProjectAccess(
	supabase: any,
	projectId: string,
	_actorId: string
): Promise<boolean> {
	const { data, error } = await supabase.rpc('current_actor_has_project_access', {
		p_project_id: projectId,
		p_required_access: 'read'
	});

	if (error) {
		logger.debug('Project access lookup failed for prewarm', { error, projectId });
		return false;
	}

	return Boolean(data);
}

async function hasDailyBriefAccess(
	supabase: any,
	briefId: string,
	userId: string
): Promise<boolean> {
	const { data, error } = await supabase
		.from('ontology_daily_briefs')
		.select('id')
		.eq('id', briefId)
		.eq('user_id', userId)
		.maybeSingle();

	if (error) {
		logger.debug('Daily brief access lookup failed for prewarm', { error, briefId, userId });
		return false;
	}

	return Boolean(data?.id);
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
	} catch (_error) {
		return ApiResponse.badRequest('Invalid request body');
	}

	const { session_id, context_type, entity_id, projectFocus } = body;

	const normalizedContextType = normalizeContextType(context_type);
	const sessionManager = createSessionManager(supabase);

	let session: ChatSession | null = null;
	let createdSession = false;

	const focusProvided = Object.prototype.hasOwnProperty.call(body, 'projectFocus');
	const rawCandidateEntityId = entity_id ?? projectFocus?.projectId ?? undefined;
	const candidateEntityId =
		typeof rawCandidateEntityId === 'string' && rawCandidateEntityId.trim().length > 0
			? rawCandidateEntityId.trim()
			: undefined;
	const isProjectScopedContext =
		normalizedContextType === 'project' ||
		normalizedContextType === 'project_audit' ||
		normalizedContextType === 'project_forecast';
	const isDailyBriefContext = normalizedContextType === 'daily_brief';
	const requiresEntityId = isProjectScopedContext || isDailyBriefContext;

	if (!session_id) {
		if (requiresEntityId && !candidateEntityId) {
			return ApiResponse.success({ warmed: false, reason: 'missing_entity' });
		}

		if (isDailyBriefContext && candidateEntityId) {
			const hasBriefAccess = await hasDailyBriefAccess(supabase, candidateEntityId, userId);
			if (!hasBriefAccess) {
				return ApiResponse.success({ warmed: false, reason: 'brief_not_accessible' });
			}

			const { data: existingBriefSession, error: existingBriefSessionError } = await supabase
				.from('chat_sessions')
				.select('*')
				.eq('user_id', userId)
				.eq('context_type', 'daily_brief')
				.eq('entity_id', candidateEntityId)
				.eq('status', 'active')
				.order('updated_at', { ascending: false })
				.limit(1)
				.maybeSingle();

			if (existingBriefSessionError) {
				logger.warn('Failed to resolve canonical prewarm brief session', {
					error: existingBriefSessionError,
					userId,
					briefId: candidateEntityId
				});
			} else if (existingBriefSession) {
				session = existingBriefSession;
			}
		}

		if (!session) {
			try {
				const created = await sessionManager.createSession({
					userId,
					contextType: normalizedContextType,
					entityId: candidateEntityId
				});
				session = created;
				createdSession = true;
			} catch (error) {
				logger.error('Failed to create session for prewarm', {
					error,
					userId,
					contextType: normalizedContextType
				});
				return ApiResponse.error('Failed to create session', 500, 'SESSION_CREATE_FAILED');
			}
		}
	} else {
		const { data: existing, error: sessionError } = await supabase
			.from('chat_sessions')
			.select('*')
			.eq('id', session_id)
			.eq('user_id', userId)
			.single();

		if (sessionError || !existing) {
			return ApiResponse.notFound('Session');
		}

		session = existing;
	}

	if (!session) {
		return ApiResponse.error('Failed to resolve session', 500, 'SESSION_RESOLUTION_FAILED');
	}

	const metadata: AgentSessionMetadata = (session.agent_metadata as AgentSessionMetadata) ?? {};
	const resolvedFocus = focusProvided
		? (projectFocus ?? null)
		: ((metadata.focus as ProjectFocus | null) ?? null);
	const resolvedEntityId =
		candidateEntityId ?? resolvedFocus?.projectId ?? session.entity_id ?? undefined;

	const locationCacheKey = buildLocationCacheKey(normalizedContextType, resolvedEntityId);
	const linkedEntitiesCacheKey = buildLinkedEntitiesCacheKey(resolvedFocus);
	const docStructureProjectId =
		resolvedFocus?.projectId ?? (isProjectScopedContext ? (resolvedEntityId ?? null) : null);
	const docStructureCacheKey = docStructureProjectId
		? buildDocStructureCacheKey(docStructureProjectId)
		: null;

	let shouldWarmLocation = !requiresEntityId || !!resolvedEntityId;
	let locationSkipReason: string | null = null;

	if (isProjectScopedContext) {
		if (!resolvedEntityId) {
			shouldWarmLocation = false;
			locationSkipReason = 'missing_entity';
		} else {
			const hasAccess = await hasProjectAccess(supabase, resolvedEntityId, actorId);
			if (!hasAccess) {
				shouldWarmLocation = false;
				locationSkipReason = 'project_not_accessible';
				logger.debug('Skipping location prewarm for inaccessible project', {
					contextType: normalizedContextType,
					entityId: resolvedEntityId
				});
			}
		}
	} else if (isDailyBriefContext) {
		if (!resolvedEntityId) {
			shouldWarmLocation = false;
			locationSkipReason = 'missing_entity';
		} else {
			const hasBriefAccess = await hasDailyBriefAccess(supabase, resolvedEntityId, userId);
			if (!hasBriefAccess) {
				shouldWarmLocation = false;
				locationSkipReason = 'brief_not_accessible';
				logger.debug('Skipping location prewarm for inaccessible daily brief', {
					contextType: normalizedContextType,
					briefId: resolvedEntityId
				});
			}
		}
	}

	const hasFreshLocationCache =
		shouldWarmLocation &&
		metadata.locationContextCache?.cacheKey === locationCacheKey &&
		isCacheFresh(metadata.locationContextCache.loadedAt);

	const hasFreshLinkedCache =
		linkedEntitiesCacheKey &&
		metadata.linkedEntitiesCache?.cacheKey === linkedEntitiesCacheKey &&
		isCacheFresh(metadata.linkedEntitiesCache.loadedAt);

	const hasFreshDocStructureCache =
		docStructureCacheKey &&
		metadata.docStructureCache?.cacheKey === docStructureCacheKey &&
		isCacheFresh(metadata.docStructureCache.loadedAt, DOC_STRUCTURE_CACHE_TTL_MS);
	if (hasFreshDocStructureCache) {
		logger.debug('Doc structure cache hit', {
			projectId: docStructureProjectId ?? resolvedEntityId ?? null,
			cacheKey: docStructureCacheKey
		});
	} else if (docStructureCacheKey && docStructureProjectId) {
		logger.debug('Doc structure cache miss', {
			projectId: docStructureProjectId,
			cacheKey: docStructureCacheKey
		});
	}

	const locationPromise =
		shouldWarmLocation && !hasFreshLocationCache
			? new ChatContextService(supabase)
					.loadLocationContext(normalizedContextType, resolvedEntityId, true, userId)
					.catch((error) => {
						logger.warn('Location context prewarm failed', {
							error,
							contextType: normalizedContextType,
							entityId: resolvedEntityId
						});
						return null;
					})
			: null;

	const linkedEntitiesPromise =
		linkedEntitiesCacheKey &&
		!hasFreshLinkedCache &&
		resolvedFocus?.focusType &&
		resolvedFocus.focusType !== 'project-wide' &&
		resolvedFocus.focusEntityId &&
		resolvedFocus.focusEntityName
			? new OntologyContextLoader(supabase, actorId)
					.loadLinkedEntitiesContext(
						resolvedFocus.focusEntityId,
						resolvedFocus.focusType,
						resolvedFocus.focusEntityName,
						{ maxPerType: 3, includeDescriptions: false }
					)
					.catch((error) => {
						logger.warn('Linked entities prewarm failed', {
							error,
							focusType: resolvedFocus.focusType,
							focusEntityId: resolvedFocus.focusEntityId
						});
						return null;
					})
			: null;

	const docStructurePromise =
		docStructureCacheKey && !hasFreshDocStructureCache && docStructureProjectId
			? (async (): Promise<DocStructureCache | null> => {
					try {
						const { data: project } = await supabase
							.from('onto_projects')
							.select('id')
							.eq('id', docStructureProjectId)
							.eq('created_by', actorId)
							.maybeSingle();

						if (!project?.id) {
							return null;
						}

						const tree = await getDocTree(supabase, docStructureProjectId, {
							includeContent: false,
							includeDocuments: false
						});

						return {
							cacheKey: docStructureCacheKey,
							loadedAt: Date.now(),
							projectId: docStructureProjectId,
							structure: tree.structure,
							documents: {},
							unlinked: []
						};
					} catch (error) {
						logger.warn('Doc structure prewarm failed', {
							error,
							projectId: resolvedEntityId
						});
						return null;
					}
				})()
			: null;

	const [locationContext, linkedEntitiesContext, docStructureCache] = await Promise.all([
		locationPromise,
		linkedEntitiesPromise,
		docStructurePromise
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

	if (docStructureCache && docStructureCacheKey && !hasFreshDocStructureCache) {
		metadata.docStructureCache = docStructureCache;
		updated = true;
	}

	if (updated) {
		await sessionManager.updateSessionMetadata(session.id, metadata);
		session.agent_metadata = metadata as ChatSession['agent_metadata'];
	}

	return ApiResponse.success({
		warmed: updated,
		session: session ?? undefined,
		created: createdSession,
		locationSkippedReason: updated ? null : locationSkipReason
	});
};
