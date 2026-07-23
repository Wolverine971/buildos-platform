// apps/web/src/lib/services/agentic-chat-v2/model-tiering.ts
import type { TextProfile } from '$lib/services/smart-llm-service';
import { DEEPSEEK_V4_PRO_MODEL, GLM_52_MODEL, MINIMAX_M3_MODEL } from '@buildos/smart-llm';

export const FASTCHAT_INITIAL_PLAN_FAST_MODELS = [
	'tencent/hy3',
	'xiaomi/mimo-v2.5',
	'poolside/laguna-xs-2.1',
	'deepseek/deepseek-v4-flash'
] as const;

export const FASTCHAT_FORCED_SYNTHESIS_MODELS = [
	GLM_52_MODEL,
	DEEPSEEK_V4_PRO_MODEL,
	MINIMAX_M3_MODEL
] as const;
export const FASTCHAT_FORCED_SYNTHESIS_IGNORED_PROVIDER_SLUGS = ['digitalocean'] as const;

export type FastChatModelTieringMode = 'off' | 'control' | 'fast_initial_plan' | 'ab';
export type FastChatModelTieringVariant = 'control' | 'fast_initial_plan';
export type FastChatForcedSynthesisRoutingMode = 'off' | 'control' | 'dedicated' | 'ab';
export type FastChatForcedSynthesisRoutingVariant = 'control' | 'dedicated';
export type FastChatLlmPassRole =
	| 'initial_plan'
	| 'tool_followup'
	| 'forced_synthesis'
	| 'write_intent'
	| 'synthesis';

export type FastChatModelTieringConfig = {
	variant: FastChatModelTieringVariant;
	initialPlanModels: string[];
};

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
	modelTieringVariant?: FastChatModelTieringVariant;
	forcedSynthesisRoutingVariant?: FastChatForcedSynthesisRoutingVariant;
	ignoredProviderSlugs?: string[];
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

export function parseFastChatModelTieringMode(
	value: string | null | undefined
): FastChatModelTieringMode {
	const normalized = value?.trim().toLowerCase();
	if (!normalized || normalized === 'false' || normalized === '0' || normalized === 'off') {
		return 'off';
	}
	if (normalized === 'control') {
		return 'control';
	}
	if (
		normalized === 'ab' ||
		normalized === 'a/b' ||
		normalized === 'experiment' ||
		normalized === 'rollout'
	) {
		return 'ab';
	}
	if (
		normalized === 'true' ||
		normalized === '1' ||
		normalized === 'on' ||
		normalized === 'enabled' ||
		normalized === 'fast' ||
		normalized === 'fast_initial_plan' ||
		normalized === 'fast_initial_pass'
	) {
		return 'fast_initial_plan';
	}
	return 'off';
}

export function parseFastChatModelTieringSampleRate(
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

export function parseFastChatInitialPlanModels(
	value: string | null | undefined,
	fallback: readonly string[] = FASTCHAT_INITIAL_PLAN_FAST_MODELS
): string[] {
	const parsed = (value ?? '')
		.split(',')
		.map((model) => model.trim())
		.filter(Boolean);
	const models = parsed.length > 0 ? parsed : [...fallback];
	return Array.from(new Set(models));
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

export function resolveFastChatModelTieringConfig(params: {
	mode: FastChatModelTieringMode;
	sampleRate?: number;
	bucketKey?: string | null;
	initialPlanModels?: string[];
}): FastChatModelTieringConfig | null {
	if (params.mode === 'off') return null;

	const initialPlanModels =
		params.initialPlanModels && params.initialPlanModels.length > 0
			? params.initialPlanModels
			: [...FASTCHAT_INITIAL_PLAN_FAST_MODELS];

	if (params.mode === 'control') {
		return { variant: 'control', initialPlanModels };
	}
	if (params.mode === 'fast_initial_plan') {
		return { variant: 'fast_initial_plan', initialPlanModels };
	}

	const sampleRate = clampSampleRate(params.sampleRate ?? 0.5);
	const bucket =
		typeof params.bucketKey === 'string' && params.bucketKey.trim()
			? stableBucket(params.bucketKey)
			: 1;
	return {
		variant: bucket < sampleRate ? 'fast_initial_plan' : 'control',
		initialPlanModels
	};
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
	noToolSynthesisRetryCount?: number;
	modelTiering?: FastChatModelTieringConfig | null;
	forcedSynthesisRouting?: FastChatForcedSynthesisRoutingConfig | null;
	pinnedModels?: string[];
}): FastChatPassModelRouting {
	const passRole = resolvePassRole(params);
	const modelTieringVariant = params.modelTiering?.variant;
	const fastInitialPlanModels = params.modelTiering?.initialPlanModels ?? [];
	const forcedSynthesisRouting = params.forcedSynthesisRouting;
	const useFastInitialPlan =
		!params.pinnedModels?.length &&
		modelTieringVariant === 'fast_initial_plan' &&
		passRole === 'initial_plan' &&
		fastInitialPlanModels.length > 0;
	const useDedicatedForcedSynthesis =
		!params.pinnedModels?.length &&
		params.noToolSynthesisPass &&
		forcedSynthesisRouting?.variant === 'dedicated';

	return {
		passRole,
		profile:
			useDedicatedForcedSynthesis ||
			(params.noToolSynthesisPass && (params.noToolSynthesisRetryCount ?? 0) > 0)
				? 'quality'
				: useFastInitialPlan
					? 'speed'
					: 'balanced',
		...(params.pinnedModels?.length
			? { models: [...params.pinnedModels] }
			: useDedicatedForcedSynthesis
				? { models: [...forcedSynthesisRouting.models] }
				: useFastInitialPlan
					? { models: fastInitialPlanModels }
					: {}),
		...(modelTieringVariant && !params.pinnedModels?.length ? { modelTieringVariant } : {}),
		...(params.noToolSynthesisPass && forcedSynthesisRouting && !params.pinnedModels?.length
			? { forcedSynthesisRoutingVariant: forcedSynthesisRouting.variant }
			: {}),
		...(useDedicatedForcedSynthesis
			? {
					ignoredProviderSlugs: [...forcedSynthesisRouting.ignoredProviderSlugs],
					maxTokens: forcedSynthesisRouting.maxTokens,
					retryModelRotation: true
				}
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
