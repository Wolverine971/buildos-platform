// apps/web/src/lib/services/agentic-chat-v2/stream-route/config.server.ts
import { dev } from '$app/environment';
import { resolveAgenticChatLegacyLiveVisionEnabled } from '../legacy-live-vision-config';
import {
	parseFastChatForcedSynthesisIgnoredProviderSlugs,
	parseFastChatForcedSynthesisModels,
	parseFastChatForcedSynthesisRoutingMode,
	parseFastChatPinnedModels,
	parseFastChatRoutingSampleRate
} from '../index';
import { resolveFastChatScaffoldConfigFromEnv } from '../scaffold-variant';

type Environment = Record<string, string | undefined>;

function positiveInt(value: string | undefined, fallback: number): number {
	if (!value) return fallback;
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function enabled(value: string | undefined): boolean {
	return ['1', 'true', 'yes', 'on', 'enabled'].includes((value ?? 'false').trim().toLowerCase());
}

/**
 * Immutable configuration for one FastChat stream process.
 *
 * Environment parsing and related invariants live here so the endpoint can read
 * named product concepts instead of repeatedly interpreting process.env values.
 */
export class FastChatStreamConfig {
	readonly endpoint = '/api/agent/v2/stream';
	readonly httpMethod = 'POST';
	readonly sseHeartbeatIntervalMs = 12_000;
	readonly storage = {
		attachmentBucket: 'onto-assets',
		temporaryAttachmentPathPrefix: 'users'
	} as const;

	readonly history;
	readonly gateway;
	readonly cancellation;
	readonly observability;
	readonly attachments;
	readonly liveVision;
	readonly routing;
	readonly scaffold;
	readonly contextShiftHintTtlMs;
	readonly detachedTurnMaxDurationMs;
	readonly supervisorResumingStaleAfterMs;

	private constructor(environment: Environment, isDevelopment: boolean) {
		this.history = Object.freeze({
			lookbackMessages: positiveInt(environment.FASTCHAT_HISTORY_LOOKBACK_MESSAGES, 10),
			compressionThresholdMessages: positiveInt(
				environment.FASTCHAT_HISTORY_COMPRESSION_THRESHOLD_MESSAGES,
				8
			),
			tailMessages: positiveInt(environment.FASTCHAT_HISTORY_TAIL_MESSAGES, 4),
			maxSummaryChars: positiveInt(environment.FASTCHAT_HISTORY_MAX_SUMMARY_CHARS, 420),
			maxMessageChars: positiveInt(environment.FASTCHAT_HISTORY_MAX_MESSAGE_CHARS, 1200)
		});

		// Lean discovery spends a round materializing write tools. These defaults
		// preserve enough headroom for a read-then-write turn to finish.
		this.gateway = Object.freeze({
			maxToolRounds: positiveInt(environment.FASTCHAT_GATEWAY_MAX_TOOL_ROUNDS, 12),
			nearLimitMaxToolRounds: positiveInt(
				environment.FASTCHAT_GATEWAY_NEAR_LIMIT_MAX_TOOL_ROUNDS,
				9
			)
		});

		this.contextShiftHintTtlMs = positiveInt(
			environment.FASTCHAT_CONTEXT_SHIFT_HINT_TTL_MS,
			120_000
		);
		this.detachedTurnMaxDurationMs = positiveInt(
			environment.FASTCHAT_DETACHED_TURN_MAX_DURATION_MS,
			285_000
		);
		this.supervisorResumingStaleAfterMs = positiveInt(
			environment.FASTCHAT_SUPERVISOR_RESUMING_STALE_AFTER_MS,
			15 * 60 * 1000
		);

		this.cancellation = Object.freeze({
			reasonRetryDelayMs: positiveInt(environment.FASTCHAT_CANCEL_REASON_RETRY_DELAY_MS, 70),
			watchIntervalMs: positiveInt(environment.FASTCHAT_CANCEL_WATCH_INTERVAL_MS, 750)
		});
		this.observability = Object.freeze({
			flushBudgetMs: positiveInt(environment.FASTCHAT_OBSERVABILITY_FLUSH_BUDGET_MS, 5000)
		});

		const maxAttachmentsPerTurn = positiveInt(
			environment.AGENT_CHAT_MAX_IMAGE_ATTACHMENTS_PER_TURN,
			4
		);
		this.attachments = Object.freeze({
			maxPerTurn: maxAttachmentsPerTurn,
			textMaxChars: positiveInt(environment.AGENT_CHAT_ATTACHMENT_TEXT_MAX_CHARS, 2200),
			contextMaxChars: positiveInt(environment.AGENT_CHAT_ATTACHMENT_CONTEXT_MAX_CHARS, 7000),
			temporaryImageMaxBytes: positiveInt(
				environment.AGENT_CHAT_IMAGE_MAX_BYTES,
				25 * 1024 * 1024
			)
		});

		const liveVisionEnabled = resolveAgenticChatLegacyLiveVisionEnabled({
			AGENT_CHAT_LEGACY_LIVE_VISION_ENABLED:
				environment.AGENT_CHAT_LEGACY_LIVE_VISION_ENABLED,
			AGENT_CHAT_LIVE_VISION_ENABLED: environment.AGENT_CHAT_LIVE_VISION_ENABLED
		});
		this.liveVision = Object.freeze({
			enabled: liveVisionEnabled,
			maxAttachmentsPerTurn: Math.min(
				maxAttachmentsPerTurn,
				positiveInt(environment.AGENT_CHAT_LIVE_VISION_MAX_IMAGES_PER_TURN, 2)
			),
			maxImageBytes: positiveInt(
				environment.AGENT_CHAT_LIVE_VISION_MAX_IMAGE_BYTES,
				8 * 1024 * 1024
			),
			renderWidth: positiveInt(environment.AGENT_CHAT_LIVE_VISION_RENDER_WIDTH, 1600),
			signedUrlTtlSeconds: positiveInt(
				environment.AGENT_CHAT_LIVE_VISION_SIGNED_URL_TTL_SECONDS,
				900
			)
		});

		const pinnedModels = parseFastChatPinnedModels(environment.FASTCHAT_EVAL_PINNED_MODELS);
		this.routing = Object.freeze({
			pinnedModels,
			useDevGlm53FlashTrial:
				isDevelopment &&
				pinnedModels.length === 0 &&
				enabled(environment.FASTCHAT_DEV_GLM_53_FLASH_TRIAL_ENABLED),
			forcedSynthesis: Object.freeze({
				mode: parseFastChatForcedSynthesisRoutingMode(
					environment.FASTCHAT_FORCED_SYNTHESIS_ROUTING
				),
				sampleRate: parseFastChatRoutingSampleRate(
					environment.FASTCHAT_FORCED_SYNTHESIS_ROUTING_SAMPLE_RATE,
					0.1
				),
				models: parseFastChatForcedSynthesisModels(
					environment.FASTCHAT_FORCED_SYNTHESIS_MODELS
				),
				ignoredProviderSlugs: parseFastChatForcedSynthesisIgnoredProviderSlugs(
					environment.FASTCHAT_FORCED_SYNTHESIS_IGNORE_PROVIDERS
				)
			})
		});
		this.scaffold = resolveFastChatScaffoldConfigFromEnv(environment);
	}

	static fromEnvironment(
		environment: Environment = process.env,
		isDevelopment = dev
	): FastChatStreamConfig {
		return new FastChatStreamConfig(environment, isDevelopment);
	}
}
