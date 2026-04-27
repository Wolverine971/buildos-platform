// apps/web/src/routes/api/agent/v2/prewarm/+server.ts
import type { RequestHandler } from './$types';
import type { ChatContextType, ChatSession, Json, ProjectFocus } from '@buildos/shared-types';
import { randomUUID } from 'node:crypto';
import { ApiResponse } from '$lib/utils/api-response';
import { createLogger } from '$lib/utils/logger';
import {
	composeFastChatHistory,
	createFastChatSessionService,
	loadFastChatPromptContext,
	normalizeFastContextType,
	selectFastChatTools,
	type FastAgentPrewarmRequest
} from '$lib/services/agentic-chat-v2';
import {
	buildLitePromptEnvelope,
	LITE_PROMPT_VARIANT
} from '$lib/services/agentic-chat-lite/prompt';
import {
	FASTCHAT_CONTEXT_CACHE_VERSION,
	buildFastChatContextCacheEntry,
	buildFastChatContextCacheKey,
	isFastChatContextCacheFresh,
	type FastChatContextCache
} from '$lib/services/agentic-chat-v2/context-cache';
import {
	buildPreparedPromptKey,
	buildPreparedPromptResponse,
	buildPreparedPromptSurface,
	getPreparedPromptTtlMs,
	isPreparedPromptPrewarmEnabled,
	resolveDefaultPreparedSurfaceProfile,
	resolvePreparedSurfaceProfiles,
	sha256Json,
	type PreparedPromptResponse,
	type PreparedPromptSurface
} from '$lib/services/agentic-chat-v2/prepared-prompt-cache';

const logger = createLogger('API:AgentPrewarmV2');
const FASTCHAT_HISTORY_LOOKBACK_MESSAGES = parsePositiveInt(
	process.env.FASTCHAT_HISTORY_LOOKBACK_MESSAGES,
	10
);
const FASTCHAT_HISTORY_COMPRESSION_THRESHOLD_MESSAGES = parsePositiveInt(
	process.env.FASTCHAT_HISTORY_COMPRESSION_THRESHOLD_MESSAGES,
	8
);
const FASTCHAT_HISTORY_TAIL_MESSAGES = parsePositiveInt(
	process.env.FASTCHAT_HISTORY_TAIL_MESSAGES,
	4
);
const FASTCHAT_HISTORY_MAX_SUMMARY_CHARS = parsePositiveInt(
	process.env.FASTCHAT_HISTORY_MAX_SUMMARY_CHARS,
	420
);
const FASTCHAT_HISTORY_MAX_MESSAGE_CHARS = parsePositiveInt(
	process.env.FASTCHAT_HISTORY_MAX_MESSAGE_CHARS,
	1200
);

function parsePositiveInt(value: string | undefined, fallback: number): number {
	if (!value) return fallback;
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
	return parsed;
}

function trimOptionalString(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function isProjectContext(contextType: ChatContextType): boolean {
	return contextType === 'project';
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

async function buildPreparedPrompt(params: {
	supabase: any;
	session: ChatSession | null;
	userId: string;
	contextType: ChatContextType;
	entityId?: string | null;
	projectFocus?: ProjectFocus | null;
	cacheKey: string;
	prewarmedContext: FastChatContextCache;
}): Promise<PreparedPromptResponse | null> {
	const rowId = randomUUID();
	const { key, nonceSha256 } = buildPreparedPromptKey(rowId);
	const createdAt = new Date();
	const expiresAt = new Date(createdAt.getTime() + getPreparedPromptTtlMs()).toISOString();
	const sessionService = createFastChatSessionService(params.supabase, {
		endpoint: '/api/agent/v2/prewarm',
		httpMethod: 'POST'
	});
	const history = params.session?.id
		? await sessionService.loadRecentMessages(
				params.session.id,
				FASTCHAT_HISTORY_LOOKBACK_MESSAGES
			)
		: [];
	const conversationSummary =
		typeof params.session?.summary === 'string' ? params.session.summary : null;
	const historyComposition = composeFastChatHistory({
		history,
		sessionSummary: conversationSummary,
		settings: {
			compressionThresholdMessages: FASTCHAT_HISTORY_COMPRESSION_THRESHOLD_MESSAGES,
			tailMessagesWhenCompressed: FASTCHAT_HISTORY_TAIL_MESSAGES,
			maxSummaryChars: FASTCHAT_HISTORY_MAX_SUMMARY_CHARS,
			maxMessageChars: FASTCHAT_HISTORY_MAX_MESSAGE_CHARS
		}
	});

	const promptContext = {
		...params.prewarmedContext.context,
		conversationSummary
	};
	const defaultSurfaceProfile = resolveDefaultPreparedSurfaceProfile(params.contextType);
	const preparedSurfaces: Record<string, PreparedPromptSurface> = {};
	for (const surfaceProfile of resolvePreparedSurfaceProfiles(params.contextType)) {
		const tools = selectFastChatTools({
			contextType: params.contextType,
			surfaceProfile
		});
		const envelope = buildLitePromptEnvelope({
			...promptContext,
			tools,
			productSurface: '/api/agent/v2/prewarm',
			conversationPosition: `prepared prompt ${rowId}`
		});
		preparedSurfaces[surfaceProfile] = buildPreparedPromptSurface({
			surfaceProfile,
			tools,
			envelope,
			createdAt: createdAt.toISOString()
		});
	}

	const { error } = await params.supabase.from('agentic_chat_prepared_prompts').insert({
		id: rowId,
		user_id: params.userId,
		session_id: params.session?.id ?? null,
		context_type: params.contextType,
		entity_id: params.prewarmedContext.context.entityId ?? params.entityId ?? null,
		project_id:
			params.prewarmedContext.context.projectId ??
			params.projectFocus?.projectId ??
			(params.contextType === 'project' ? (params.entityId ?? null) : null),
		project_focus: params.projectFocus ?? null,
		cache_key: params.cacheKey,
		nonce_sha256: nonceSha256,
		prompt_variant: LITE_PROMPT_VARIANT,
		context_cache_version: FASTCHAT_CONTEXT_CACHE_VERSION,
		context_payload: params.prewarmedContext.context,
		conversation_summary: conversationSummary,
		history_for_model: historyComposition.historyForModel,
		history_strategy: historyComposition.strategy,
		history_compressed: historyComposition.compressed,
		raw_history_count: historyComposition.rawHistoryCount,
		history_for_model_count: historyComposition.historyForModel.length,
		prepared_surfaces: preparedSurfaces,
		default_surface_profile: defaultSurfaceProfile,
		context_payload_sha256: sha256Json(params.prewarmedContext.context),
		expires_at: expiresAt
	});

	if (error) {
		logger.warn('Failed to insert prepared prompt during v2 prewarm', {
			error,
			sessionId: params.session?.id,
			contextType: params.contextType
		});
		return null;
	}

	return buildPreparedPromptResponse({
		rowId,
		key,
		expiresAt,
		cacheKey: params.cacheKey,
		promptVariant: LITE_PROMPT_VARIANT,
		defaultSurfaceProfile,
		preparedSurfaces
	});
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
	const shouldPreparePrompt = isPreparedPromptPrewarmEnabled() && body.prepare_prompt !== false;
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
		const preparedPrompt = shouldPreparePrompt
			? await buildPreparedPrompt({
					supabase,
					session,
					userId: user.id,
					contextType,
					entityId,
					projectFocus,
					cacheKey,
					prewarmedContext: cachedContext
				})
			: null;
		return ApiResponse.success({
			warmed: true,
			cache_source: 'session_cache',
			session,
			prewarmed_context: cachedContext,
			prepared_prompt: preparedPrompt
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

	const preparedPrompt = shouldPreparePrompt
		? await buildPreparedPrompt({
				supabase,
				session,
				userId: user.id,
				contextType,
				entityId,
				projectFocus,
				cacheKey,
				prewarmedContext
			})
		: null;

	return ApiResponse.success({
		warmed: true,
		cache_source: 'fresh_load',
		session,
		prewarmed_context: prewarmedContext,
		prepared_prompt: preparedPrompt
	});
};
