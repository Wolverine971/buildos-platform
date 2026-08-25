// apps/web/src/lib/services/agentic-chat-v2/turn-preparation.ts
import type { ChatContextType, ChatToolDefinition, ProjectFocus } from '@buildos/shared-types';
import type {
	GatewaySurfaceProfileName,
	ProjectCreateExecutionWorkflow
} from '$lib/services/agentic-chat/tools/core/gateway-surface';
import {
	getActiveDomainIds,
	getActiveOutcomeCardIds,
	readDomainSessionState,
	type DomainSessionState
} from '$lib/services/agentic-chat/tools/domains/domain-session-state';
import {
	senseDomains,
	type DomainSensingResult
} from '$lib/services/agentic-chat/tools/domains/domain-sensing';
import { buildFastChatContextCacheKey, type FastChatContextCache } from './context-cache';
import {
	shouldBypassContextCacheForShiftHint,
	type FastChatContextShiftHint
} from './context-cache-routing';
import { normalizeFastContextType } from './scope';
import { resolveFastChatSurfaceProfileForTurn, selectFastChatTools } from './tool-selector';
import {
	FASTCHAT_PENDING_TURN_INTENT_METADATA_KEY,
	readFastChatPendingTurnIntent,
	resolveFastChatTurnIntent,
	type FastChatPendingTurnIntent,
	type FastChatTurnIntent
} from './turn-intent';
import {
	FASTCHAT_PENDING_TURN_CONTRACT_METADATA_KEY,
	isPendingTurnContractInScope,
	readFastChatPendingTurnContract,
	type FastChatPendingTurnContract
} from './turn-contract';
import type { FastChatScaffoldConfig } from './scaffold-variant';

export type FastChatTurnPreparation = {
	sessionMetadata: Record<string, unknown>;
	pendingTurnIntent: FastChatPendingTurnIntent | null;
	pendingTurnContract: FastChatPendingTurnContract | null;
	turnIntent: FastChatTurnIntent;
	previousDomainState: DomainSessionState | null;
	priorDomainIds: string[];
	priorOutcomeCardIds: string[];
	domainSensingBypassed: boolean;
	turnDomainSensing: DomainSensingResult | null;
	recentContextShiftHint: FastChatContextShiftHint | null;
	bypassContextCacheForShiftHint: boolean;
	cacheKey: string;
	cachedContext: FastChatContextCache | undefined;
	selectedSurfaceProfile: GatewaySurfaceProfileName;
	tools: ChatToolDefinition[];
	toolSelectionMs: number;
};

type ResolveFastChatTurnPreparationParams = {
	contextType: ChatContextType;
	entityId?: string | null;
	projectId?: string | null;
	projectFocus?: ProjectFocus | null;
	latestUserMessage?: string | null;
	conversationSummary?: string | null;
	agentMetadata: unknown;
	contextShiftHintTtlMs: number;
	nowMs?: number;
	measureNow?: () => number;
	scaffold?: FastChatScaffoldConfig;
	projectCreateWorkflow?: ProjectCreateExecutionWorkflow;
};

function readMetadataRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

export function readRecentFastChatContextShiftHint(
	metadata: Record<string, unknown>,
	options: { ttlMs: number; nowMs?: number }
): FastChatContextShiftHint | null {
	const raw = metadata.fastchat_last_context_shift;
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
	const record = raw as Record<string, unknown>;
	const contextType =
		typeof record.context_type === 'string'
			? (normalizeFastContextType(record.context_type as ChatContextType) as ChatContextType)
			: null;
	if (!contextType) return null;
	const shiftedAtRaw = typeof record.shifted_at === 'string' ? record.shifted_at : '';
	const shiftedAtMs = Date.parse(shiftedAtRaw);
	if (!Number.isFinite(shiftedAtMs)) return null;
	if ((options.nowMs ?? Date.now()) - shiftedAtMs > options.ttlMs) return null;

	return {
		context_type: contextType,
		entity_id: typeof record.entity_id === 'string' ? record.entity_id : null,
		project_id: typeof record.project_id === 'string' ? record.project_id : null,
		shifted_at: shiftedAtRaw
	};
}

/** Resolves the deterministic launch decisions needed before async prompt preparation. */
export function resolveFastChatTurnPreparation({
	contextType,
	entityId,
	projectId,
	projectFocus,
	latestUserMessage,
	conversationSummary,
	agentMetadata,
	contextShiftHintTtlMs,
	nowMs = Date.now(),
	measureNow = Date.now,
	scaffold,
	projectCreateWorkflow = 'web_compound'
}: ResolveFastChatTurnPreparationParams): FastChatTurnPreparation {
	const sessionMetadata = readMetadataRecord(agentMetadata);
	const pendingTurnIntent = readFastChatPendingTurnIntent(
		sessionMetadata[FASTCHAT_PENDING_TURN_INTENT_METADATA_KEY],
		{ now: new Date(nowMs) }
	);
	const parsedPendingTurnContract = readFastChatPendingTurnContract(
		sessionMetadata[FASTCHAT_PENDING_TURN_CONTRACT_METADATA_KEY]
	);
	const pendingTurnContract = isPendingTurnContractInScope(
		parsedPendingTurnContract,
		contextType,
		projectId ?? null
	)
		? parsedPendingTurnContract
		: null;
	const turnIntent = resolveFastChatTurnIntent({
		contextType,
		projectId: projectId ?? null,
		latestUserMessage,
		pendingIntent: pendingTurnIntent
	});
	const previousDomainState = readDomainSessionState(sessionMetadata.fastchat_domain_state);
	const priorDomainIds = getActiveDomainIds(previousDomainState);
	const priorOutcomeCardIds = getActiveOutcomeCardIds(previousDomainState);

	// Lexical mutation inference is shadow/compatibility data, not semantic
	// routing authority. Domain sensing therefore does not change because a
	// string classifier happened to see a verb.
	const domainSensingBypassed = scaffold?.routing.domainSensing === false;
	const turnDomainSensing = domainSensingBypassed
		? null
		: senseDomains({
				currentUserMessage: latestUserMessage,
				conversationSummary,
				priorDomainIds,
				priorOutcomeCardIds,
				limit: 3
			});

	const recentContextShiftHint = readRecentFastChatContextShiftHint(sessionMetadata, {
		ttlMs: contextShiftHintTtlMs,
		nowMs
	});
	const bypassContextCacheForShiftHint = shouldBypassContextCacheForShiftHint({
		requestContextType: contextType,
		requestEntityId: entityId,
		requestProjectFocus: projectFocus,
		shiftHint: recentContextShiftHint
	});
	const cacheKey = buildFastChatContextCacheKey({ contextType, entityId, projectFocus });
	const cachedContext = sessionMetadata.fastchat_context_cache as
		| FastChatContextCache
		| undefined;

	const toolSelectionStartedAtMs = measureNow();
	const selectedSurfaceProfile =
		contextType === 'project_create' && projectCreateWorkflow === 'reviewed_shell'
			? 'project_create_minimal'
			: resolveFastChatSurfaceProfileForTurn({
					contextType,
					latestUserMessage,
					turnIntent,
					allowLegacySurfaceFallback: scaffold?.routing.legacySurfaceFallback
				});
	const tools = selectFastChatTools({
		contextType,
		surfaceProfile: selectedSurfaceProfile,
		latestUserMessage,
		turnIntent,
		leanDiscovery: scaffold?.routing.leanDiscovery,
		projectCreateWorkflow
	});
	const toolSelectionMs = Math.max(0, measureNow() - toolSelectionStartedAtMs);

	return {
		sessionMetadata,
		pendingTurnIntent,
		pendingTurnContract,
		turnIntent,
		previousDomainState,
		priorDomainIds,
		priorOutcomeCardIds,
		domainSensingBypassed,
		turnDomainSensing,
		recentContextShiftHint,
		bypassContextCacheForShiftHint,
		cacheKey,
		cachedContext,
		selectedSurfaceProfile,
		tools,
		toolSelectionMs
	};
}
