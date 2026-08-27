// apps/web/src/lib/services/agentic-chat-v2/model-tiering.ts
import type { TextProfile } from '$lib/services/smart-llm-service';
import {
	DEEPSEEK_V4_PRO_MODEL,
	GEMINI_37_FLASH_MODEL,
	GLM_52_MODEL,
	MINIMAX_M3_MODEL,
	OPENROUTER_V2_TOOL_MODELS,
	POOLSIDE_LAGUNA_XS_21_MODEL,
	XIAOMI_MIMO_V25_MODEL
} from '@buildos/smart-llm';

export const FASTCHAT_FORCED_SYNTHESIS_MODELS = [
	GLM_52_MODEL,
	DEEPSEEK_V4_PRO_MODEL,
	MINIMAX_M3_MODEL
] as const;
export const FASTCHAT_FORCED_SYNTHESIS_IGNORED_PROVIDER_SLUGS = ['digitalocean'] as const;

// Project creation emits one comparatively large, schema-constrained tool call.
// Production evidence from 2026-08-20 showed the generic fast tier spending 82s
// in Tencent reasoning without emitting a tool, followed by a 120s DeepSeek
// timeout. Keep this hot path on models that have completed the same structured
// call reliably, with Gemini first and no Tencent candidate in the route.
export const FASTCHAT_PROJECT_CREATE_TOOL_MODELS = [
	GEMINI_37_FLASH_MODEL,
	XIAOMI_MIMO_V25_MODEL,
	POOLSIDE_LAGUNA_XS_21_MODEL,
	DEEPSEEK_V4_PRO_MODEL
] as const;
export const FASTCHAT_PROJECT_CREATE_MAX_TOKENS = 6_500;

export type FastChatForcedSynthesisRoutingMode = 'off' | 'control' | 'dedicated' | 'ab';
// The variant/pass-role vocabulary is owned by the shared loop package.
export {
	type FastChatForcedSynthesisRoutingVariant,
	type FastChatLlmPassRole
} from '@buildos/agentic-chat-runtime/loop';
import type {
	FastChatForcedSynthesisRoutingVariant,
	FastChatLlmPassRole
} from '@buildos/agentic-chat-runtime/loop';

export type FastChatForcedSynthesisRoutingConfig = {
	variant: FastChatForcedSynthesisRoutingVariant;
	models: string[];
	ignoredProviderSlugs: string[];
	maxTokens: number;
};

export type FastChatPassModelRouting = {
	passRole: FastChatLlmPassRole;
	profile: TextProfile;
	models?: string[];
	forcedSynthesisRoutingVariant?: FastChatForcedSynthesisRoutingVariant;
	ignoredProviderSlugs?: string[];
	/**
	 * OpenRouter `provider.order` — upstream providers to try first. Set by the
	 * turn route pin so passes 2..N land on the provider that already holds the
	 * cached prefix (prefix caches are per-provider; see turn-route-health.ts).
	 */
	providerOrder?: string[];
	/**
	 * OpenRouter `provider.allow_fallbacks`. Only ever set to `false` alongside a
	 * `providerOrder` pin; a failure clears the pin and the next attempt routes
	 * normally with fallbacks back on.
	 */
	allowProviderFallbacks?: boolean;
	maxTokens?: number;
	retryModelRotation?: boolean;
};

export function parseFastChatForcedSynthesisRoutingMode(
	value: string | null | undefined
): FastChatForcedSynthesisRoutingMode {
	const normalized = value?.trim().toLowerCase();
	if (!normalized || normalized === 'false' || normalized === '0' || normalized === 'off') {
		return 'off';
	}
	if (normalized === 'control') return 'control';
	if (
		normalized === 'ab' ||
		normalized === 'a/b' ||
		normalized === 'experiment' ||
		normalized === 'canary'
	) {
		return 'ab';
	}
	if (
		normalized === 'true' ||
		normalized === '1' ||
		normalized === 'on' ||
		normalized === 'enabled' ||
		normalized === 'dedicated'
	) {
		return 'dedicated';
	}
	return 'off';
}

export function parseFastChatRoutingSampleRate(
	value: string | null | undefined,
	fallback = 0.5
): number {
	const normalized = value?.trim();
	if (!normalized) return clampSampleRate(fallback);
	const percent = normalized.endsWith('%');
	const parsed = Number.parseFloat(percent ? normalized.slice(0, -1) : normalized);
	if (!Number.isFinite(parsed)) return clampSampleRate(fallback);
	return clampSampleRate(percent ? parsed / 100 : parsed);
}

export function parseFastChatForcedSynthesisModels(
	value: string | null | undefined,
	fallback: readonly string[] = FASTCHAT_FORCED_SYNTHESIS_MODELS
): string[] {
	return parseUniqueCsv(value, fallback);
}

export function parseFastChatForcedSynthesisIgnoredProviderSlugs(
	value: string | null | undefined,
	fallback: readonly string[] = FASTCHAT_FORCED_SYNTHESIS_IGNORED_PROVIDER_SLUGS
): string[] {
	return Array.from(
		new Set(parseUniqueCsv(value, fallback).map((provider) => provider.toLowerCase()))
	);
}

export function parseFastChatPinnedModels(value: string | null | undefined): string[] {
	return Array.from(
		new Set(
			(value ?? '')
				.split(',')
				.map((model) => model.trim())
				.filter(Boolean)
		)
	);
}

export function resolveFastChatForcedSynthesisRoutingConfig(params: {
	mode: FastChatForcedSynthesisRoutingMode;
	sampleRate?: number;
	bucketKey?: string | null;
	models?: string[];
	ignoredProviderSlugs?: string[];
	maxTokens: number;
}): FastChatForcedSynthesisRoutingConfig | null {
	if (params.mode === 'off') return null;

	const models = params.models?.length
		? Array.from(new Set(params.models.map((model) => model.trim()).filter(Boolean)))
		: [...FASTCHAT_FORCED_SYNTHESIS_MODELS];
	const ignoredProviderSlugs = params.ignoredProviderSlugs?.length
		? Array.from(
				new Set(
					params.ignoredProviderSlugs
						.map((provider) => provider.trim().toLowerCase())
						.filter(Boolean)
				)
			)
		: [...FASTCHAT_FORCED_SYNTHESIS_IGNORED_PROVIDER_SLUGS];
	const maxTokens = Math.max(1, Math.floor(params.maxTokens));

	if (params.mode === 'control') {
		return { variant: 'control', models, ignoredProviderSlugs, maxTokens };
	}
	if (params.mode === 'dedicated') {
		return { variant: 'dedicated', models, ignoredProviderSlugs, maxTokens };
	}

	const sampleRate = clampSampleRate(params.sampleRate ?? 0.1);
	const bucket =
		typeof params.bucketKey === 'string' && params.bucketKey.trim()
			? stableBucket(params.bucketKey)
			: 1;
	return {
		variant: bucket < sampleRate ? 'dedicated' : 'control',
		models,
		ignoredProviderSlugs,
		maxTokens
	};
}

export function resolveFastChatPassModelRouting(params: {
	passNumber: number;
	hasTools: boolean;
	noToolSynthesisPass: boolean;
	writeIntentToolPass: boolean;
	projectCreateToolPass?: boolean;
	noToolSynthesisRetryCount?: number;
	forcedSynthesisRouting?: FastChatForcedSynthesisRoutingConfig | null;
	pinnedModels?: string[];
}): FastChatPassModelRouting {
	const passRole = resolvePassRole(params);
	const forcedSynthesisRouting = params.forcedSynthesisRouting;
	const useProjectCreateToolRoute =
		!params.pinnedModels?.length &&
		params.projectCreateToolPass === true &&
		params.hasTools &&
		!params.noToolSynthesisPass;
	const useDedicatedForcedSynthesis =
		!params.pinnedModels?.length &&
		params.noToolSynthesisPass &&
		forcedSynthesisRouting?.variant === 'dedicated';
	// OpenRouter can accept a streaming request and then hang after choosing the
	// primary provider/model. Its server-side fallback list cannot help once the
	// response has started, so give ordinary tool passes the same candidate list
	// explicitly and rotate it on the application-level retry. Attempt one keeps
	// the existing default order; only a transient retry changes the primary.
	const ordinaryToolModels =
		!params.pinnedModels?.length &&
		params.hasTools &&
		!useDedicatedForcedSynthesis &&
		!useProjectCreateToolRoute
			? [...OPENROUTER_V2_TOOL_MODELS]
			: [];
	const selectedModels = params.pinnedModels?.length
		? [...params.pinnedModels]
		: useProjectCreateToolRoute
			? [...FASTCHAT_PROJECT_CREATE_TOOL_MODELS]
			: useDedicatedForcedSynthesis
				? [...forcedSynthesisRouting.models]
				: ordinaryToolModels;
	const retryModelRotation =
		!params.pinnedModels?.length && selectedModels.length > 1 && params.hasTools;

	return {
		passRole,
		profile:
			useDedicatedForcedSynthesis ||
			(params.noToolSynthesisPass && (params.noToolSynthesisRetryCount ?? 0) > 0)
				? 'quality'
				: 'balanced',
		...(selectedModels.length > 0 ? { models: selectedModels } : {}),
		...(params.noToolSynthesisPass && forcedSynthesisRouting && !params.pinnedModels?.length
			? { forcedSynthesisRoutingVariant: forcedSynthesisRouting.variant }
			: {}),
		...(useProjectCreateToolRoute
			? {
					maxTokens: FASTCHAT_PROJECT_CREATE_MAX_TOKENS,
					retryModelRotation: true
				}
			: useDedicatedForcedSynthesis
				? {
						ignoredProviderSlugs: [...forcedSynthesisRouting.ignoredProviderSlugs],
						maxTokens: forcedSynthesisRouting.maxTokens,
						retryModelRotation: true
					}
				: retryModelRotation
					? { retryModelRotation: true }
					: {})
	};
}

function parseUniqueCsv(value: string | null | undefined, fallback: readonly string[]): string[] {
	const parsed = (value ?? '')
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean);
	return Array.from(new Set(parsed.length > 0 ? parsed : [...fallback]));
}

function resolvePassRole(params: {
	passNumber: number;
	hasTools: boolean;
	noToolSynthesisPass: boolean;
	writeIntentToolPass: boolean;
}): FastChatLlmPassRole {
	if (params.noToolSynthesisPass) return 'forced_synthesis';
	if (params.writeIntentToolPass) return 'write_intent';
	if (params.passNumber === 1 && params.hasTools) return 'initial_plan';
	if (params.hasTools) return 'tool_followup';
	return 'synthesis';
}

function clampSampleRate(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.min(1, Math.max(0, value));
}

function stableBucket(value: string): number {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0) / 0x100000000;
}
