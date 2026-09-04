// apps/web/src/routes/api/agent/v2/prewarm/+server.ts
// Prewarm is best-effort but can legitimately cross the app-wide 10 second
// function default while loading project context. Give it a dedicated Vercel
// function and keep an application deadline well inside this platform limit.
export const config = {
	maxDuration: 60,
	memory: 1024,
	split: true
};

import type { RequestHandler } from './$types';
import type {
	ChatContextType,
	ChatSession,
	Json,
	LastTurnContext,
	ProjectFocus
} from '@buildos/shared-types';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { ApiResponse } from '$lib/utils/api-response';
import { createLogger } from '$lib/utils/logger';
import {
	composeFastChatHistory,
	createFastChatSessionService,
	loadFastChatPromptContext,
	type FastAgentPrewarmRequest
} from '$lib/services/agentic-chat-v2';
import { getGatewaySurfaceForProfile } from '@buildos/agentic-chat-runtime/catalog';
import {
	applyEmailSurfaceMount,
	hasActiveEmailConnection
} from '$lib/services/agentic-chat-v2/email-surface-mount.server';
import {
	isProjectScopedContext,
	normalizeFastContextType,
	resolveEffectiveEntityId,
	resolveEffectiveProjectId
} from '$lib/services/agentic-chat-v2/scope';
import {
	buildLitePromptEnvelope,
	LITE_PROMPT_VARIANT
} from '$lib/services/agentic-chat-lite/prompt';
import {
	FASTCHAT_CONTEXT_CACHE_VERSION,
	buildFastChatContextCacheKey,
	type FastChatContextCache
} from '$lib/services/agentic-chat-v2/context-cache';
import {
	buildPreparedPromptKey,
	buildPreparedPromptResponse,
	buildPreparedPromptSurface,
	compactPreparedPromptContextPayload,
	getPreparedPromptTtlMs,
	isPreparedPromptPrewarmEnabled,
	resolveDefaultPreparedSurfaceProfile,
	resolvePreparedSurfaceProfiles,
	sha256Json,
	type PreparedPromptResponse,
	type PreparedPromptSurface
} from '$lib/services/agentic-chat-v2/prepared-prompt-cache';
import { writePreparedPromptContent } from '$lib/services/agentic-chat-v2/prepared-prompt-store.server';
import { loadWorkerSkillPreloadLedgerMessage } from '$lib/services/agentic-chat-v2/worker-turn-preparation.server';
import { buildLastTurnContinuityHint } from '$lib/services/agentic-chat-v2/last-turn-context';
import { parseJsonRequest } from '$lib/utils/request-validation';
import { resolveFastChatScaffoldConfigFromEnv } from '$lib/services/agentic-chat-v2/scaffold-variant';
import { agenticChatProjectFocusSchema } from '$lib/services/agentic-chat-v2/stream-request';
import { resolveMaterializedFastChatContext } from '$lib/services/agentic-chat-v2/materialized-context-cache.server';
import {
	buildWorkerPromptScaffold,
	resolveWorkerPromptTools
} from '$lib/services/agentic-chat-v2/worker-prompt-surface';

const logger = createLogger('API:AgentPrewarmV2');
const FASTCHAT_SCAFFOLD = resolveFastChatScaffoldConfigFromEnv(process.env);
const PREWARM_BUDGET_EXCEEDED = Symbol('prewarm_budget_exceeded');
const PREWARM_RESPONSE_BUDGET_MS = Math.min(
	parsePositiveInt(process.env.FASTCHAT_PREWARM_RESPONSE_BUDGET_MS, 20_000),
	config.maxDuration * 1000 - 5_000
);
const fastAgentPrewarmRequestSchema = z
	.object({
		context_type: z.string().optional(),
		projectFocus: agenticChatProjectFocusSchema.nullable().optional(),
		entity_id: z.string().nullable().optional(),
		prepare_prompt: z.boolean().optional(),
		session_id: z.string().optional(),
		ensure_session: z.boolean().optional(),
		// Same loose shape the turns route accepts. The admission-window path
		// composes history with the last-turn continuity hint; the prepared
		// history must carry the same hint or a prepared hit silently drops it.
		lastTurnContext: z.record(z.string(), z.unknown()).nullish()
	})
	.strict()
	.superRefine((value, context) => {
		const contextType = normalizeFastContextType(value.context_type);
		const entityId = value.entity_id?.trim();
		if (
			entityId &&
			(isProjectScopedContext(contextType) ||
				contextType === 'ontology' ||
				contextType === 'daily_brief') &&
			!z.string().uuid().safeParse(entityId).success
		) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['entity_id'],
				message: 'Project and focus entity identifiers must be UUIDs'
			});
		}
	});

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

async function runWithPrewarmResponseBudget<T>(
	operation: Promise<T>
): Promise<T | typeof PREWARM_BUDGET_EXCEEDED> {
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<typeof PREWARM_BUDGET_EXCEEDED>((resolve) => {
		timeoutId = setTimeout(() => resolve(PREWARM_BUDGET_EXCEEDED), PREWARM_RESPONSE_BUDGET_MS);
	});

	try {
		return await Promise.race([operation, timeout]);
	} finally {
		if (timeoutId) clearTimeout(timeoutId);
	}
}

async function checkProjectAccess(
	supabase: any,
	projectId: string,
	userId: string
): Promise<boolean> {
	const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
		p_user_id: userId
	});
	if (actorError || !actorId) {
		logger.warn('Actor resolution failed during v2 prewarm', { error: actorError, projectId });
		return false;
	}

	const { data, error } = await supabase.rpc('current_actor_has_project_member_access', {
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
	sourceSupabase: any;
	storeSupabase: any;
	session: ChatSession | null;
	userId: string;
	contextType: ChatContextType;
	entityId?: string | null;
	projectFocus?: ProjectFocus | null;
	lastTurnContext?: LastTurnContext | null;
	cacheKey: string;
	prewarmedContext: FastChatContextCache;
	contextInvalidationToken?: string | null;
	emailToolsMounted: boolean;
}): Promise<PreparedPromptResponse | null> {
	const rowId = randomUUID();
	const { key, nonceSha256 } = buildPreparedPromptKey(rowId);
	const createdAt = new Date();
	const expiresAt = new Date(createdAt.getTime() + getPreparedPromptTtlMs()).toISOString();
	// Captured BEFORE the history query below: the history-currency guards
	// compare persisted message timestamps against this cutoff, and the row's
	// own created_at lands after surface assembly — late enough to hide a
	// message that arrived while this prompt was being built.
	const historyCutoffAt = createdAt.toISOString();
	const sessionService = createFastChatSessionService(params.sourceSupabase, {
		endpoint: '/api/agent/v2/prewarm',
		httpMethod: 'POST'
	});
	const loadedHistory = params.session?.id
		? await sessionService.loadRecentMessages(
				params.session.id,
				FASTCHAT_HISTORY_LOOKBACK_MESSAGES
			)
		: [];
	// Worker-lane skill preloads leave no skill_load execution; the admission
	// path projects them from user-message metadata into the loaded-skills
	// ledger. The prepared history must carry the same ledger, or a prepared
	// hit and a miss would dedupe differently (turn executor audit, P0-2).
	const skillPreloadLedger = params.session?.id
		? await loadWorkerSkillPreloadLedgerMessage({
				supabase: params.sourceSupabase,
				userId: params.userId,
				sessionId: params.session.id,
				limit: FASTCHAT_HISTORY_LOOKBACK_MESSAGES
			})
		: null;
	const history = skillPreloadLedger
		? [...loadedHistory, { role: 'system' as const, content: skillPreloadLedger }]
		: loadedHistory;
	const conversationSummary =
		typeof params.session?.summary === 'string' ? params.session.summary : null;
	const historyComposition = composeFastChatHistory({
		history,
		continuityHint: buildLastTurnContinuityHint(params.lastTurnContext ?? null),
		sessionSummary: conversationSummary,
		settings: {
			compressionThresholdMessages: FASTCHAT_HISTORY_COMPRESSION_THRESHOLD_MESSAGES,
			tailMessagesWhenCompressed: FASTCHAT_HISTORY_TAIL_MESSAGES,
			maxSummaryChars: FASTCHAT_HISTORY_MAX_SUMMARY_CHARS,
			maxMessageChars: FASTCHAT_HISTORY_MAX_MESSAGE_CHARS
		}
	});

	const preparedContextPayload = compactPreparedPromptContextPayload(
		params.prewarmedContext.context
	);
	const promptContext = {
		...preparedContextPayload,
		conversationSummary
	};
	const defaultSurfaceProfile = resolveDefaultPreparedSurfaceProfile(params.contextType);
	const preparedSurfaces: Record<string, PreparedPromptSurface> = {};
	for (const surfaceProfile of resolvePreparedSurfaceProfiles(params.contextType)) {
		const tools = applyEmailSurfaceMount(
			getGatewaySurfaceForProfile(surfaceProfile, {
				leanDiscovery: FASTCHAT_SCAFFOLD.routing.leanDiscovery
			}),
			params.emailToolsMounted
		);
		const envelope = buildLitePromptEnvelope({
			...promptContext,
			tools,
			productSurface: '/api/agent/v2/prewarm',
			conversationPosition: `prepared prompt ${rowId}`,
			domainSensingResult: null,
			scaffold: FASTCHAT_SCAFFOLD.prompt
		});
		const surface = buildPreparedPromptSurface({
			surfaceProfile,
			executionMode: 'legacy_sse',
			contextType: params.contextType,
			contextPayload: preparedContextPayload,
			conversationSummary,
			tools,
			envelope,
			scaffold: FASTCHAT_SCAFFOLD.prompt,
			createdAt: createdAt.toISOString()
		});
		preparedSurfaces[surface.surface_profile] = surface;
	}

	const workerScaffold = buildWorkerPromptScaffold(FASTCHAT_SCAFFOLD.prompt);
	for (const surfaceProfile of resolvePreparedSurfaceProfiles(params.contextType)) {
		const selectedTools = applyEmailSurfaceMount(
			getGatewaySurfaceForProfile(surfaceProfile, {
				leanDiscovery: FASTCHAT_SCAFFOLD.routing.leanDiscovery
			}),
			params.emailToolsMounted
		);
		const workerToolResolution = resolveWorkerPromptTools(selectedTools);
		if (workerToolResolution.unavailableToolNames.length > 0) {
			logger.warn('Skipping unavailable worker prepared-prompt surface', {
				contextType: params.contextType,
				surfaceProfile,
				unavailableToolNames: workerToolResolution.unavailableToolNames
			});
			continue;
		}
		const envelope = buildLitePromptEnvelope({
			...promptContext,
			tools: workerToolResolution.tools,
			projectCreateWorkflow: 'reviewed_shell',
			productSurface: '/api/agent/v2/turns',
			conversationPosition: `worker prepared prompt ${rowId}`,
			domainSensingResult: null,
			scaffold: workerScaffold
		});
		const surface = buildPreparedPromptSurface({
			surfaceProfile,
			executionMode: 'worker_realtime',
			contextType: params.contextType,
			contextPayload: preparedContextPayload,
			conversationSummary,
			tools: workerToolResolution.tools,
			envelope,
			scaffold: workerScaffold,
			createdAt: createdAt.toISOString()
		});
		preparedSurfaces[surface.surface_profile] = surface;
	}

	const { error } = await writePreparedPromptContent({
		supabase: params.storeSupabase,
		userId: params.userId,
		row: {
			id: rowId,
			user_id: params.userId,
			session_id: params.session?.id ?? null,
			context_type: params.contextType,
			entity_id: params.prewarmedContext.context.entityId ?? params.entityId ?? null,
			project_id:
				params.prewarmedContext.context.projectId ??
				resolveEffectiveProjectId({
					contextType: params.contextType,
					entityId: params.entityId,
					projectFocus: params.projectFocus
				}),
			project_focus: (params.projectFocus ?? null) as unknown as Json,
			cache_key: params.cacheKey,
			nonce_sha256: nonceSha256,
			prompt_variant: LITE_PROMPT_VARIANT,
			context_cache_version: FASTCHAT_CONTEXT_CACHE_VERSION,
			context_payload: preparedContextPayload as unknown as Json,
			conversation_summary: conversationSummary,
			history_for_model: historyComposition.historyForModel as unknown as Json,
			history_strategy: historyComposition.strategy,
			history_compressed: historyComposition.compressed,
			raw_history_count: historyComposition.rawHistoryCount,
			history_for_model_count: historyComposition.historyForModel.length,
			prepared_surfaces: preparedSurfaces as unknown as Json,
			default_surface_profile: defaultSurfaceProfile,
			context_payload_sha256: sha256Json(preparedContextPayload),
			context_invalidation_token: params.contextInvalidationToken ?? null,
			history_cutoff_at: historyCutoffAt,
			expires_at: expiresAt
		}
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

const handlePrewarmRequest: RequestHandler = async ({
	request,
	locals: { supabase, safeGetSession }
}) => {
	const { user } = await safeGetSession();
	if (!user?.id) {
		return ApiResponse.unauthorized();
	}

	const parsed = await parseJsonRequest(request, fastAgentPrewarmRequestSchema);
	if (!parsed.ok) return parsed.response;
	const body = parsed.data as FastAgentPrewarmRequest;

	const contextType = normalizeFastContextType(body.context_type);
	const projectFocus = body.projectFocus ?? null;
	const entityId = resolveEffectiveEntityId({
		contextType,
		entityId: body.entity_id,
		projectFocus
	});
	const projectId = resolveEffectiveProjectId({ contextType, entityId, projectFocus });
	const shouldPreparePrompt = isPreparedPromptPrewarmEnabled() && body.prepare_prompt !== false;
	const serverStore = createAdminSupabaseClient();
	const preparedPromptStore = shouldPreparePrompt ? serverStore : null;
	const requiresEntityId = isProjectScopedContext(contextType) || contextType === 'daily_brief';
	if (requiresEntityId && !entityId) {
		return ApiResponse.success({ warmed: false, reason: 'missing_entity' });
	}

	if (projectId) {
		const allowed = await checkProjectAccess(supabase, projectId, user.id);
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
			entityId: entityId ?? undefined,
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
	const contextResolution = await resolveMaterializedFastChatContext({
		sourceSupabase: supabase,
		storeSupabase: serverStore,
		userId: user.id,
		contextType,
		entityId,
		projectId,
		projectFocus,
		cacheKey,
		sessionCache: cachedContext,
		loadFresh: () =>
			loadFastChatPromptContext({
				supabase,
				userId: user.id,
				contextType,
				entityId,
				projectFocus
			}),
		onWarning: (message, error) =>
			logger.warn(message, { error, contextType, projectId, cacheKey })
	});
	const prewarmedContext = contextResolution.cache;

	if (session) {
		await mergeFastChatContextCache({
			supabase,
			sessionId: session.id,
			cache: prewarmedContext
		});
	}

	// Prepared prompts are a latency optimization — any failure here must
	// degrade to a normal prewarm response, never fail the request.
	let preparedPrompt = null;
	if (shouldPreparePrompt && preparedPromptStore) {
		try {
			preparedPrompt = await buildPreparedPrompt({
				sourceSupabase: supabase,
				storeSupabase: preparedPromptStore,
				session,
				userId: user.id,
				contextType,
				entityId,
				projectFocus,
				lastTurnContext: (parsed.data.lastTurnContext ?? null) as LastTurnContext | null,
				cacheKey,
				prewarmedContext,
				contextInvalidationToken: contextResolution.invalidationToken,
				// Must match what worker admission decides, or every prepared
				// prompt for a Gmail-connected user misses on a tool-list diff.
				emailToolsMounted: await hasActiveEmailConnection({
					supabase: serverStore,
					userId: user.id
				})
			});
		} catch (error) {
			logger.warn('Prepared prompt build failed during v2 prewarm; continuing without it', {
				error,
				sessionId: session?.id,
				contextType
			});
		}
	}

	return ApiResponse.success({
		warmed: true,
		cache_source: contextResolution.cacheSource,
		session,
		prewarmed_context: prewarmedContext,
		prepared_prompt: preparedPrompt
	});
};

export const POST: RequestHandler = async (event) => {
	const result = await runWithPrewarmResponseBudget(Promise.resolve(handlePrewarmRequest(event)));
	if (result !== PREWARM_BUDGET_EXCEEDED) return result;

	logger.warn(
		'V2 prewarm exceeded its response budget; returning the normal cold-path fallback',
		{
			budgetMs: PREWARM_RESPONSE_BUDGET_MS
		}
	);
	return ApiResponse.success({
		warmed: false,
		reason: 'time_budget_exceeded'
	});
};
