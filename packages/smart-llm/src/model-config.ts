// packages/smart-llm/src/model-config.ts

import type { JSONProfile, ModelCapabilities, ModelProfile, TextProfile } from './types';

export const KIMI_EXPERIMENT_MODEL = 'moonshotai/kimi-k2.6' as const;
export const KIMI_CODING_MODEL = 'moonshotai/kimi-k2.7-code' as const;
export const KIMI_EXPERIMENT_MODELS = [KIMI_EXPERIMENT_MODEL, KIMI_CODING_MODEL] as const;
export const KIMI_K3_MODEL = 'moonshotai/kimi-k3' as const;
export const QWEN_37_PLUS_EXPERIMENT_MODEL = 'qwen/qwen3.7-plus' as const;
export const GPT_56_LUNA_MODEL = 'openai/gpt-5.6-luna' as const;
export const GROK_45_MODEL = 'x-ai/grok-4.5' as const;
export const DEEPSEEK_V4_FLASH_MODEL = 'deepseek/deepseek-v4-flash' as const;
export const DEEPSEEK_V4_PRO_MODEL = 'deepseek/deepseek-v4-pro' as const;
export const MINIMAX_M3_MODEL = 'minimax/minimax-m3' as const;
export const XIAOMI_MIMO_V25_MODEL = 'xiaomi/mimo-v2.5' as const;
export const TENCENT_HY3_PREVIEW_MODEL = 'tencent/hy3-preview' as const;
export const TENCENT_HY3_MODEL = 'tencent/hy3' as const;
export const GLM_52_MODEL = 'z-ai/glm-5.2' as const;
export const NEX_N2_MINI_MODEL = 'nex-agi/nex-n2-mini' as const;
export const POOLSIDE_LAGUNA_XS_21_MODEL = 'poolside/laguna-xs-2.1' as const;
export const GEMINI_31_FLASH_LITE_MODEL = 'google/gemini-3.1-flash-lite' as const;
export const ACTIVE_EXPERIMENT_MODEL = GPT_56_LUNA_MODEL;
export const ACTIVE_EXPERIMENT_MODELS = [GPT_56_LUNA_MODEL, GROK_45_MODEL] as const;
export const MAXIMUM_WORK_MODEL = KIMI_K3_MODEL;
// Universal last-resort fallback used only when lane resolution yields no models.
// Deliberately decoupled from ACTIVE_EXPERIMENT_MODEL so rotating the current
// experiment never silently changes the global safety net. DeepSeek V4 Flash is a
// stable, widely available, strong tool-caller present across the text/json/tool lanes.
export const LAST_RESORT_MODEL = DEEPSEEK_V4_FLASH_MODEL;
export const AGENT_STATE_RECONCILIATION_MODEL = DEEPSEEK_V4_FLASH_MODEL;
export const AGENT_STATE_RECONCILIATION_MODELS = [AGENT_STATE_RECONCILIATION_MODEL] as const;

export const MODEL_CATALOG: Record<string, ModelProfile> = {
	[GEMINI_31_FLASH_LITE_MODEL]: {
		id: GEMINI_31_FLASH_LITE_MODEL,
		name: 'Gemini 3.1 Flash Lite',
		speed: 4.7,
		smartness: 4.5,
		creativity: 4.2,
		cost: 0.25,
		outputCost: 1.5,
		provider: 'google',
		bestFor: [
			'ultra-fast',
			'high-volume-text',
			'json-mode',
			'tool-calling',
			'classification',
			'lightweight-routing',
			'1m-context'
		],
		limitations: ['provider-availability-variable'],
		capabilities: {
			jsonMode: true,
			structuredOutputs: true,
			tools: true,
			reasoning: true,
			multimodal: true,
			longContext: true
		}
	},
	[DEEPSEEK_V4_FLASH_MODEL]: {
		id: DEEPSEEK_V4_FLASH_MODEL,
		name: 'DeepSeek V4 Flash',
		speed: 4.6,
		smartness: 4.85,
		creativity: 4.3,
		cost: 0.098,
		outputCost: 0.196,
		provider: 'deepseek',
		bestFor: [
			'low-cost-agentic-workflows',
			'coding-assistants',
			'json-mode',
			'tool-calling',
			'long-context',
			'1m-context',
			'high-throughput'
		],
		limitations: ['new-endpoint', 'text-only'],
		capabilities: {
			jsonMode: true,
			tools: true,
			reasoning: true,
			longContext: true
		}
	},
	[DEEPSEEK_V4_PRO_MODEL]: {
		id: DEEPSEEK_V4_PRO_MODEL,
		name: 'DeepSeek V4 Pro',
		speed: 2.8,
		smartness: 5,
		creativity: 4.5,
		cost: 0.435,
		outputCost: 0.87,
		provider: 'deepseek',
		bestFor: [
			'frontier-open-source-reasoning',
			'long-horizon-agentic-workflows',
			'full-codebase-analysis',
			'complex-coding',
			'large-scale-synthesis',
			'1m-context'
		],
		limitations: ['higher-cost-than-flash', 'text-only', 'reasoning-tokens-can-increase-cost'],
		capabilities: {
			jsonMode: true,
			tools: true,
			reasoning: true,
			longContext: true
		}
	},
	[GLM_52_MODEL]: {
		id: GLM_52_MODEL,
		name: 'GLM 5.2',
		speed: 3.1,
		smartness: 5,
		creativity: 4.6,
		cost: 0.9226,
		outputCost: 2.8996,
		provider: 'z-ai',
		bestFor: [
			'long-horizon-agentic-workflows',
			'project-level-software-engineering',
			'complex-multi-step-automation',
			'json-mode',
			'structured-output',
			'tool-calling',
			'parallel-tool-calls',
			'1m-context',
			'quality-profile'
		],
		limitations: [
			'higher-cost-than-defaults',
			'text-only',
			'reasoning-tokens-can-increase-cost'
		],
		capabilities: {
			jsonMode: true,
			structuredOutputs: true,
			tools: true,
			reasoning: true,
			longContext: true
		}
	},
	[TENCENT_HY3_PREVIEW_MODEL]: {
		id: TENCENT_HY3_PREVIEW_MODEL,
		name: 'Tencent Hy3 Preview',
		speed: 4.4,
		smartness: 4.65,
		creativity: 4.1,
		cost: 0.066,
		outputCost: 0.26,
		provider: 'tencent',
		bestFor: [
			'ultra-low-cost-agentic-workflows',
			'tool-calling',
			'coding-assistants',
			'fast-text-generation',
			'configurable-reasoning',
			'262k-context'
		],
		limitations: ['preview-model', 'text-only', 'no-json-response-format', '262k-context'],
		capabilities: {
			tools: true,
			reasoning: true,
			longContext: true
		}
	},
	[TENCENT_HY3_MODEL]: {
		id: TENCENT_HY3_MODEL,
		name: 'Tencent Hy3',
		speed: 4.4,
		smartness: 4.75,
		creativity: 4.2,
		cost: 0.2,
		outputCost: 0.8,
		provider: 'tencent',
		bestFor: [
			'low-cost-agentic-workflows',
			'tool-calling',
			'coding-assistants',
			'fast-text-generation',
			'configurable-reasoning',
			'262k-context'
		],
		limitations: [
			'text-only',
			'no-json-response-format',
			'single-provider-atlascloud',
			'262k-context'
		],
		capabilities: {
			tools: true,
			reasoning: true,
			longContext: true
		}
	},
	[MINIMAX_M3_MODEL]: {
		id: MINIMAX_M3_MODEL,
		name: 'MiniMax M3',
		speed: 3.8,
		smartness: 4.9,
		creativity: 4.5,
		cost: 0.3,
		outputCost: 1.2,
		provider: 'minimax',
		bestFor: [
			'long-horizon-agentic-workflows',
			'coding-assistants',
			'tool-calling',
			'multimodal',
			'image-video-understanding',
			'json-mode',
			'long-output',
			'1m-advertised-context'
		],
		limitations: ['new-model', 'openrouter-endpoint-512k-prompt-cap'],
		capabilities: {
			jsonMode: true,
			tools: true,
			reasoning: true,
			multimodal: true,
			longContext: true
		}
	},
	[NEX_N2_MINI_MODEL]: {
		id: NEX_N2_MINI_MODEL,
		name: 'Nex-N2-Mini',
		speed: 4.2,
		smartness: 4.65,
		creativity: 4.2,
		cost: 0.025,
		outputCost: 0.1,
		provider: 'nex-agi',
		bestFor: [
			'ultra-low-cost-json',
			'structured-output',
			'tool-calling',
			'lightweight-agentic-workflows',
			'image-understanding',
			'262k-context'
		],
		limitations: ['single-provider-nex-agi', 'new-model', 'limited-benchmark-history'],
		capabilities: {
			jsonMode: true,
			structuredOutputs: true,
			tools: true,
			reasoning: true,
			multimodal: true,
			longContext: true
		}
	},
	[POOLSIDE_LAGUNA_XS_21_MODEL]: {
		id: POOLSIDE_LAGUNA_XS_21_MODEL,
		name: 'Poolside Laguna XS 2.1',
		speed: 4.3,
		smartness: 4.4,
		creativity: 4.1,
		cost: 0.06,
		outputCost: 0.12,
		provider: 'poolside',
		bestFor: [
			'low-cost-coding-agent',
			'text-tool-calling',
			'fast-code-assistance',
			'262k-context'
		],
		limitations: [
			'single-provider-poolside',
			'no-json-response-format',
			'no-structured-outputs',
			'limited-benchmark-history'
		],
		capabilities: {
			tools: true,
			reasoning: true,
			longContext: true
		}
	},
	[XIAOMI_MIMO_V25_MODEL]: {
		id: XIAOMI_MIMO_V25_MODEL,
		name: 'Xiaomi MiMo-V2.5',
		speed: 4.2,
		smartness: 4.75,
		creativity: 4.3,
		cost: 0.14,
		outputCost: 0.28,
		provider: 'xiaomi',
		bestFor: [
			'low-cost-omnimodal',
			'agentic-workflows',
			'json-mode',
			'tool-calling',
			'image-video-audio-understanding',
			'long-document-context',
			'1m-context'
		],
		limitations: ['single-provider-xiaomi', 'uptime-variable'],
		capabilities: {
			jsonMode: true,
			tools: true,
			reasoning: true,
			multimodal: true,
			longContext: true
		}
	},
	[QWEN_37_PLUS_EXPERIMENT_MODEL]: {
		id: QWEN_37_PLUS_EXPERIMENT_MODEL,
		name: 'Qwen 3.7 Plus',
		speed: 3.5,
		smartness: 4.98,
		creativity: 4.6,
		cost: 0.32,
		outputCost: 1.28,
		provider: 'qwen',
		bestFor: [
			'agentic-coding',
			'repo-level-problem-solving',
			'front-end-development',
			'complex-reasoning',
			'multimodal',
			'structured-output',
			'tool-calling',
			'1m-context',
			'historical-comparison'
		],
		limitations: [
			'reasoning-tokens-can-increase-cost',
			'not-default-production-routing',
			'demoted-after-production-evaluation'
		],
		capabilities: {
			jsonMode: true,
			structuredOutputs: true,
			tools: true,
			reasoning: true,
			multimodal: true,
			longContext: true
		}
	},
	[GPT_56_LUNA_MODEL]: {
		id: GPT_56_LUNA_MODEL,
		name: 'GPT-5.6 Luna',
		speed: 4,
		smartness: 5,
		creativity: 4.8,
		cost: 1,
		outputCost: 6,
		provider: 'openai',
		bestFor: [
			'premium-reasoning',
			'agentic-coding',
			'complex-synthesis',
			'structured-output',
			'tool-calling',
			'multimodal',
			'1m-context',
			'quality-profile'
		],
		limitations: [
			'higher-cost-than-defaults',
			'no-temperature-parameter',
			'premium-evaluation-lane'
		],
		capabilities: {
			jsonMode: true,
			structuredOutputs: true,
			tools: true,
			reasoning: true,
			multimodal: true,
			longContext: true
		}
	},
	[GROK_45_MODEL]: {
		id: GROK_45_MODEL,
		name: 'Grok 4.5',
		speed: 3.8,
		smartness: 5,
		creativity: 4.8,
		cost: 2,
		outputCost: 6,
		provider: 'x-ai',
		bestFor: [
			'premium-reasoning',
			'agentic-coding',
			'complex-synthesis',
			'structured-output',
			'tool-calling',
			'multimodal',
			'500k-context',
			'quality-profile'
		],
		limitations: ['higher-cost-than-defaults', 'premium-evaluation-lane'],
		capabilities: {
			jsonMode: true,
			structuredOutputs: true,
			tools: true,
			reasoning: true,
			multimodal: true,
			longContext: true
		}
	},
	[KIMI_K3_MODEL]: {
		id: KIMI_K3_MODEL,
		name: 'Kimi K3',
		speed: 3,
		smartness: 5,
		creativity: 4.9,
		cost: 3,
		outputCost: 15,
		provider: 'moonshotai',
		bestFor: [
			'maximum-quality-reasoning',
			'long-horizon-agentic-workflows',
			'agentic-coding',
			'complex-synthesis',
			'structured-output',
			'tool-calling',
			'multimodal',
			'1m-context',
			'explicit-maximum-profile'
		],
		limitations: [
			'high-cost',
			'mandatory-max-reasoning',
			'no-temperature-parameter',
			'single-provider',
			'launch-capacity-variable',
			'requires-full-reasoning-history',
			'not-default-production-routing'
		],
		capabilities: {
			jsonMode: true,
			structuredOutputs: true,
			tools: true,
			reasoning: true,
			multimodal: true,
			longContext: true
		}
	},
	[KIMI_EXPERIMENT_MODEL]: {
		id: KIMI_EXPERIMENT_MODEL,
		name: 'Kimi K2.6',
		speed: 3.4,
		smartness: 5,
		creativity: 4.8,
		cost: 0.95,
		outputCost: 4,
		provider: 'moonshotai',
		bestFor: [
			'long-horizon-coding',
			'coding-driven-ui-generation',
			'multi-agent-orchestration',
			'agentic-workflows',
			'multimodal',
			'structured-output',
			'tool-calling',
			'262k-context'
		],
		capabilities: {
			jsonMode: true,
			structuredOutputs: true,
			tools: true,
			reasoning: true,
			multimodal: true,
			longContext: true
		}
	},
	[KIMI_CODING_MODEL]: {
		id: KIMI_CODING_MODEL,
		name: 'Kimi K2.7 Code',
		speed: 3.2,
		smartness: 5,
		creativity: 4.7,
		cost: 0.75,
		outputCost: 3.5,
		provider: 'moonshotai',
		bestFor: [
			'long-horizon-coding',
			'agentic-task-decomposition',
			'multi-turn-coding-dialogue',
			'complex-reasoning',
			'multimodal',
			'structured-output',
			'tool-calling',
			'262k-context'
		],
		limitations: ['high-output-cost', 'always-thinking', 'reserve-for-quality-profile'],
		capabilities: {
			jsonMode: true,
			structuredOutputs: true,
			tools: true,
			reasoning: true,
			multimodal: true,
			longContext: true
		}
	}
};

export function modelSupportsCapability(
	modelId: string,
	capability: keyof ModelCapabilities
): boolean {
	return MODEL_CATALOG[modelId]?.capabilities?.[capability] === true;
}

// Reviewed 2026-07-17 against OpenRouter model pages/API and production
// telemetry. Keep models without response_format out of JSON routes, keep
// premium candidates out of automatic lanes, and reserve K3 for an explicit
// maximum profile.
const OPENROUTER_TEXT_ROUTE = [
	DEEPSEEK_V4_FLASH_MODEL,
	TENCENT_HY3_MODEL,
	XIAOMI_MIMO_V25_MODEL,
	GEMINI_31_FLASH_LITE_MODEL,
	POOLSIDE_LAGUNA_XS_21_MODEL,
	DEEPSEEK_V4_PRO_MODEL
] as const;
const OPENROUTER_JSON_ROUTE = [
	DEEPSEEK_V4_FLASH_MODEL,
	XIAOMI_MIMO_V25_MODEL,
	NEX_N2_MINI_MODEL,
	GEMINI_31_FLASH_LITE_MODEL,
	DEEPSEEK_V4_PRO_MODEL,
	MINIMAX_M3_MODEL
] as const;
const OPENROUTER_TOOL_ROUTE = [
	DEEPSEEK_V4_FLASH_MODEL,
	TENCENT_HY3_MODEL,
	XIAOMI_MIMO_V25_MODEL,
	POOLSIDE_LAGUNA_XS_21_MODEL,
	DEEPSEEK_V4_PRO_MODEL,
	GLM_52_MODEL,
	MINIMAX_M3_MODEL
] as const;
const OPENROUTER_MULTIMODAL_ROUTE = [
	XIAOMI_MIMO_V25_MODEL,
	GEMINI_31_FLASH_LITE_MODEL,
	NEX_N2_MINI_MODEL,
	MINIMAX_M3_MODEL
] as const;
const EMERGENCY_TEXT_ROUTE = [
	DEEPSEEK_V4_FLASH_MODEL,
	XIAOMI_MIMO_V25_MODEL,
	GEMINI_31_FLASH_LITE_MODEL,
	TENCENT_HY3_MODEL,
	POOLSIDE_LAGUNA_XS_21_MODEL,
	DEEPSEEK_V4_PRO_MODEL
] as const;
const JSON_FAST_ROUTE = [
	DEEPSEEK_V4_FLASH_MODEL,
	XIAOMI_MIMO_V25_MODEL,
	NEX_N2_MINI_MODEL,
	GEMINI_31_FLASH_LITE_MODEL
] as const;
const JSON_POWERFUL_ROUTE = [
	GLM_52_MODEL,
	DEEPSEEK_V4_PRO_MODEL,
	GPT_56_LUNA_MODEL,
	GROK_45_MODEL,
	DEEPSEEK_V4_FLASH_MODEL
] as const;
const JSON_MAXIMUM_ROUTE = [
	KIMI_K3_MODEL,
	GPT_56_LUNA_MODEL,
	GROK_45_MODEL,
	GLM_52_MODEL,
	DEEPSEEK_V4_PRO_MODEL
] as const;
const TEXT_SPEED_ROUTE = [
	DEEPSEEK_V4_FLASH_MODEL,
	POOLSIDE_LAGUNA_XS_21_MODEL,
	TENCENT_HY3_MODEL,
	XIAOMI_MIMO_V25_MODEL,
	GEMINI_31_FLASH_LITE_MODEL,
	DEEPSEEK_V4_PRO_MODEL
] as const;
const TEXT_QUALITY_ROUTE = [
	GLM_52_MODEL,
	DEEPSEEK_V4_PRO_MODEL,
	GPT_56_LUNA_MODEL,
	GROK_45_MODEL,
	MINIMAX_M3_MODEL,
	DEEPSEEK_V4_FLASH_MODEL
] as const;
const TEXT_CREATIVE_ROUTE = [
	GLM_52_MODEL,
	GPT_56_LUNA_MODEL,
	GROK_45_MODEL,
	MINIMAX_M3_MODEL,
	DEEPSEEK_V4_PRO_MODEL
] as const;
const TEXT_MAXIMUM_ROUTE = [
	KIMI_K3_MODEL,
	GPT_56_LUNA_MODEL,
	GROK_45_MODEL,
	GLM_52_MODEL,
	DEEPSEEK_V4_PRO_MODEL
] as const;

export const ACTIVE_RUNTIME_MODEL_IDS = Array.from(
	new Set<string>([
		...OPENROUTER_TEXT_ROUTE,
		...OPENROUTER_JSON_ROUTE,
		...OPENROUTER_TOOL_ROUTE,
		...OPENROUTER_MULTIMODAL_ROUTE,
		...EMERGENCY_TEXT_ROUTE,
		...JSON_POWERFUL_ROUTE,
		...JSON_MAXIMUM_ROUTE,
		...TEXT_QUALITY_ROUTE,
		...TEXT_CREATIVE_ROUTE,
		...TEXT_MAXIMUM_ROUTE
	])
);
export const ACTIVE_RUNTIME_MODEL_SET = new Set<string>(ACTIVE_RUNTIME_MODEL_IDS);
export const JSON_MODELS: Record<string, ModelProfile> = Object.fromEntries(
	ACTIVE_RUNTIME_MODEL_IDS.filter((modelId) => {
		const capabilities = MODEL_CATALOG[modelId]?.capabilities;
		return capabilities?.jsonMode === true || capabilities?.structuredOutputs === true;
	}).map((modelId) => [modelId, MODEL_CATALOG[modelId]])
) as Record<string, ModelProfile>;
export const TEXT_MODELS: Record<string, ModelProfile> = Object.fromEntries(
	ACTIVE_RUNTIME_MODEL_IDS.map((modelId) => [modelId, MODEL_CATALOG[modelId]])
) as Record<string, ModelProfile>;

const PROVIDER_VERSION_SUFFIX_PATTERNS = [/-\d{8}$/, /-\d{4}-\d{2}-\d{2}$/, /-\d{2}-\d{2}$/];

export function normalizeProviderModelIdForPricing(modelId: string): string {
	let normalized = modelId.trim();
	for (const pattern of PROVIDER_VERSION_SUFFIX_PATTERNS) {
		normalized = normalized.replace(pattern, '');
	}
	return normalized;
}

export function resolveModelPricingProfile(
	modelId: string | null | undefined,
	fallbackModelIds: Array<string | null | undefined> = []
): { modelId: string; profile: ModelProfile } | null {
	const candidates = [modelId, ...fallbackModelIds]
		.filter((candidate): candidate is string => typeof candidate === 'string')
		.map((candidate) => candidate.trim())
		.filter(Boolean);

	for (const candidate of candidates) {
		const direct = MODEL_CATALOG[candidate];
		if (direct) {
			return { modelId: candidate, profile: direct };
		}

		const normalized = normalizeProviderModelIdForPricing(candidate);
		if (normalized !== candidate) {
			const normalizedProfile = MODEL_CATALOG[normalized];
			if (normalizedProfile) {
				return { modelId: normalized, profile: normalizedProfile };
			}

			for (const [catalogModelId, catalogProfile] of Object.entries(MODEL_CATALOG)) {
				if (normalizeProviderModelIdForPricing(catalogModelId) === normalized) {
					return { modelId: catalogModelId, profile: catalogProfile };
				}
			}
		}
	}

	return null;
}

const MODEL_ROUTES = {
	openRouterV2: {
		text: OPENROUTER_TEXT_ROUTE,
		json: OPENROUTER_JSON_ROUTE,
		toolCalling: OPENROUTER_TOOL_ROUTE,
		toolCallingExacto: OPENROUTER_TOOL_ROUTE,
		multimodal: OPENROUTER_MULTIMODAL_ROUTE
	},
	tasks: {
		projectNextStep: OPENROUTER_JSON_ROUTE
	},
	agentRecommendations: {
		brainDumps: {
			contextExtraction: OPENROUTER_JSON_ROUTE,
			taskExtraction: OPENROUTER_JSON_ROUTE,
			clarification: OPENROUTER_TEXT_ROUTE
		},
		// NOTE: there is intentionally no `agentChat` recommendation here. The live
		// agentic chat path (agentic-chat-v2 stream orchestrator) selects a lane purely
		// from message shape (tools present -> tool_calling, etc.), not from a
		// planner/executor/synthesis split. A descriptive split was removed 2026-06-15
		// because it described routing that does not exist and misled readers.
		dailyBriefs: {
			projectBrief: OPENROUTER_TEXT_ROUTE,
			generation: OPENROUTER_TEXT_ROUTE,
			summary: OPENROUTER_TEXT_ROUTE
		}
	},
	toolCalling: OPENROUTER_TOOL_ROUTE,
	emergencyTextFallbacks: EMERGENCY_TEXT_ROUTE,
	jsonProfiles: {
		fast: JSON_FAST_ROUTE,
		balanced: OPENROUTER_JSON_ROUTE,
		powerful: JSON_POWERFUL_ROUTE,
		maximum: JSON_MAXIMUM_ROUTE
	},
	textProfiles: {
		speed: TEXT_SPEED_ROUTE,
		balanced: OPENROUTER_TEXT_ROUTE,
		quality: TEXT_QUALITY_ROUTE,
		creative: TEXT_CREATIVE_ROUTE,
		maximum: TEXT_MAXIMUM_ROUTE
	}
} as const;

export const OPENROUTER_V2_TEXT_MODELS = [...MODEL_ROUTES.openRouterV2.text];
export const OPENROUTER_V2_JSON_MODELS = [...MODEL_ROUTES.openRouterV2.json];
export const OPENROUTER_V2_TOOL_MODELS = [...MODEL_ROUTES.openRouterV2.toolCalling];
export const OPENROUTER_V2_TOOL_MODELS_EXACTO = [...MODEL_ROUTES.openRouterV2.toolCallingExacto];
export const OPENROUTER_V2_MULTIMODAL_MODELS = [...MODEL_ROUTES.openRouterV2.multimodal];
export const PROJECT_NEXT_STEP_MODELS = [...MODEL_ROUTES.tasks.projectNextStep];
export const AGENTIC_MODEL_RECOMMENDATIONS = MODEL_ROUTES.agentRecommendations;

export const TOOL_CALLING_MODEL_ORDER = [...MODEL_ROUTES.toolCalling];
export const TOOL_CALLING_MODEL_SET = new Set<string>(
	ACTIVE_RUNTIME_MODEL_IDS.filter((modelId) => modelSupportsCapability(modelId, 'tools'))
);
export const MAXIMUM_WORK_MODEL_ORDER = [...MODEL_ROUTES.textProfiles.maximum];

export const EMPTY_CONTENT_RETRY_INSTRUCTION =
	'Return only the final answer. Do not include analysis or reasoning.';
export const EMPTY_CONTENT_RETRY_MIN_TOKENS = 1200;
export const EMPTY_CONTENT_RETRY_BUFFER_TOKENS = 256;
export const EMPTY_CONTENT_RETRY_MAX_TOKENS = 2048;
export const EMERGENCY_TEXT_FALLBACKS = [...MODEL_ROUTES.emergencyTextFallbacks];

export const JSON_PROFILE_MODELS: Record<JSONProfile, string[]> = {
	fast: [...MODEL_ROUTES.jsonProfiles.fast],
	balanced: [...MODEL_ROUTES.jsonProfiles.balanced],
	powerful: [...MODEL_ROUTES.jsonProfiles.powerful],
	maximum: [...MODEL_ROUTES.jsonProfiles.maximum],
	custom: []
};

export const TEXT_PROFILE_MODELS: Record<TextProfile, string[]> = {
	speed: [...MODEL_ROUTES.textProfiles.speed],
	balanced: [...MODEL_ROUTES.textProfiles.balanced],
	quality: [...MODEL_ROUTES.textProfiles.quality],
	creative: [...MODEL_ROUTES.textProfiles.creative],
	maximum: [...MODEL_ROUTES.textProfiles.maximum],
	custom: []
};
