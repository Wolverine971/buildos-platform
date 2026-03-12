// apps/web/src/routes/api/agent/v2/prewarm/+server.ts
import type { RequestHandler } from './$types';
import type { ChatContextType, ChatSession, Json, ProjectFocus } from '@buildos/shared-types';
import { ApiResponse } from '$lib/utils/api-response';
import { createLogger } from '$lib/utils/logger';
import {
	createFastChatSessionService,
	loadFastChatPromptContext,
	normalizeFastContextType,
	type FastAgentPrewarmRequest
} from '$lib/services/agentic-chat-v2';
import {
	FASTCHAT_CONTEXT_CACHE_VERSION,
	buildFastChatContextCacheEntry,
	buildFastChatContextCacheKey,
	isFastChatContextCacheFresh,
	type FastChatContextCache
} from '$lib/services/agentic-chat-v2/context-cache';

const logger = createLogger('API:AgentPrewarmV2');

function trimOptionalString(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function isProjectContext(contextType: ChatContextType): boolean {
	return (
		contextType === 'project' ||
		contextType === 'project_audit' ||
		contextType === 'project_forecast'
	);
}

async function checkProjectAccess(supabase: any, projectId: string): Promise<boolean> {
	const { data, error } = await supabase.rpc('current_actor_has_project_access', {
		p_project_id: projectId,
		p_required_access: 'read'
	});
	if (error) {
		logger.warn('Project access check failed during v2 prewarm', { error, projectId });
		return false;
	}
	return Boolean(data);
}

async function checkDailyBriefAccess(
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
		logger.warn('Daily brief access check failed during v2 prewarm', {
			error,
			briefId,
			userId
		});
		return false;
	}
	return Boolean(data?.id);
}

async function mergeFastChatContextCache(params: {
	supabase: any;
	sessionId: string;
	cache: FastChatContextCache;
}): Promise<void> {
	const { error } = await params.supabase.rpc('merge_chat_session_agent_metadata', {
		p_session_id: params.sessionId,
		p_patch: {
			fastchat_context_cache: params.cache
		} as Json
	});
	if (error) {
		logger.warn('Failed to merge fastchat context cache during v2 prewarm', {
			error,
			sessionId: params.sessionId
		});
	}
}

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user?.id) {
		return ApiResponse.unauthorized();
	}

	let body: FastAgentPrewarmRequest;
	try {
		body = (await request.json()) as FastAgentPrewarmRequest;
	} catch (_error) {
		return ApiResponse.badRequest('Invalid request body');
	}

	const contextType = normalizeFastContextType(body.context_type);
	const projectFocus = body.projectFocus ?? null;
	const entityId = trimOptionalString(body.entity_id) ?? projectFocus?.projectId ?? undefined;
	const requiresEntityId = isProjectContext(contextType) || contextType === 'daily_brief';
	if (requiresEntityId && !entityId) {
		return ApiResponse.success({ warmed: false, reason: 'missing_entity' });
	}

	if (isProjectContext(contextType) && entityId) {
		const allowed = await checkProjectAccess(supabase, entityId);
		if (!allowed) {
			return ApiResponse.success({ warmed: false, reason: 'project_not_accessible' });
		}
	}

	if (contextType === 'daily_brief' && entityId) {
		const allowed = await checkDailyBriefAccess(supabase, entityId, user.id);
		if (!allowed) {
			return ApiResponse.success({ warmed: false, reason: 'brief_not_accessible' });
		}
	}

	const sessionId = trimOptionalString(body.session_id);
	const ensureSession = body.ensure_session === true;
	let session: ChatSession | null = null;
	if (sessionId || ensureSession) {
		if (sessionId) {
			const { data } = await supabase
				.from('chat_sessions')
				.select('*')
				.eq('id', sessionId)
				.eq('user_id', user.id)
				.maybeSingle();
			if (!data && !ensureSession) {
				return ApiResponse.success({ warmed: false, reason: 'session_not_found' });
			}
		}

		const sessionService = createFastChatSessionService(supabase, {
			endpoint: '/api/agent/v2/prewarm',
			httpMethod: 'POST'
		});
		const resolved = await sessionService.resolveSession({
			sessionId,
			userId: user.id,
			contextType,
			entityId,
			projectFocus
		});
		session = resolved.session;
	}

	const cacheKey = buildFastChatContextCacheKey({
		contextType,
		entityId,
		projectFocus
	});
	const cachedContext = (session?.agent_metadata as Record<string, unknown> | null | undefined)
		?.fastchat_context_cache as FastChatContextCache | undefined;
	if (
		cachedContext &&
		cachedContext.version === FASTCHAT_CONTEXT_CACHE_VERSION &&
		cachedContext.key === cacheKey &&
		isFastChatContextCacheFresh(cachedContext)
	) {
		return ApiResponse.success({
			warmed: true,
			cache_source: 'session_cache',
			session,
			prewarmed_context: cachedContext
		});
	}

	const promptContext = await loadFastChatPromptContext({
		supabase,
		userId: user.id,
		contextType,
		entityId,
		projectFocus
	});
	const prewarmedContext = buildFastChatContextCacheEntry({
		cacheKey,
		context: {
			contextType: promptContext.contextType,
			entityId: promptContext.entityId ?? null,
			projectId: promptContext.projectId ?? null,
			projectName: promptContext.projectName ?? null,
			focusEntityType: promptContext.focusEntityType ?? null,
			focusEntityId: promptContext.focusEntityId ?? null,
			focusEntityName: promptContext.focusEntityName ?? null,
			data: promptContext.data ?? null
		}
	});

	if (session) {
		await mergeFastChatContextCache({
			supabase,
			sessionId: session.id,
			cache: prewarmedContext
		});
	}

	return ApiResponse.success({
		warmed: true,
		cache_source: 'fresh_load',
		session,
		prewarmed_context: prewarmedContext
	});
};
