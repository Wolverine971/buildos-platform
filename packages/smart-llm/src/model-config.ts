// packages/smart-llm/src/model-config.ts

import type { JSONProfile, ModelCapabilities, ModelProfile, TextProfile } from './types';

export const MODEL_CATALOG: Record<string, ModelProfile> = {
	'google/gemini-2.5-flash-lite': {
		id: 'google/gemini-2.5-flash-lite',
		name: 'Gemini 2.5 Flash Lite',
		speed: 4.5,
		smartness: 4.2,
		creativity: 4,
		cost: 0.1,
		outputCost: 0.4,
		provider: 'google',
		bestFor: ['ultra-fast', 'json-mode', 'classification', 'autocomplete', 'ultra-low-cost'],
		limitations: ['reasoning-disabled-by-default'],
		capabilities: {
			jsonMode: true,
			structuredOutputs: true,
			tools: true,
			reasoning: true,
			multimodal: true,
			longContext: true
		}
	},
	'google/gemini-3.1-flash-lite-preview': {
		id: 'google/gemini-3.1-flash-lite-preview',
		name: 'Gemini 3.1 Flash Lite Preview',
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
		limitations: ['preview-model', 'provider-availability-variable'],
		capabilities: {
			jsonMode: true,
			structuredOutputs: true,
			tools: true,
			reasoning: true,
			multimodal: true,
			longContext: true
		}
	},
	'qwen/qwen3.5-flash-02-23': {
		id: 'qwen/qwen3.5-flash-02-23',
		name: 'Qwen 3.5 Flash',
		speed: 4.8,
		smartness: 4.55,
		creativity: 4.2,
		cost: 0.065,
		outputCost: 0.26,
		provider: 'qwen',
		bestFor: [
			'cheap-long-context',
			'fast-multimodal',
			'json-mode',
			'structured-output',
			'tool-calling',
			'classification',
			'routing',
			'1m-context'
		],
		limitations: ['single-provider-alibaba'],
		capabilities: {
			jsonMode: true,
			structuredOutputs: true,
			tools: true,
			reasoning: true,
			multimodal: true,
			longContext: true
		}
	},
	'openai/gpt-4o-mini': {
		id: 'openai/gpt-4o-mini',
		name: 'GPT-4o Mini',
		speed: 4,
		smartness: 4,
		creativity: 4,
		cost: 0.15,
		outputCost: 0.6,
		provider: 'openai',
		bestFor: ['json-mode', 'cost-effective', 'structured-output', 'general-purpose'],
		capabilities: { jsonMode: true, structuredOutputs: true, tools: true, multimodal: true }
	},
	'openai/gpt-4.1-nano': {
		id: 'openai/gpt-4.1-nano',
		name: 'GPT-4.1 Nano',
		speed: 4.7,
		smartness: 4.3,
		creativity: 4,
		cost: 0.1,
		outputCost: 0.4,
		provider: 'openai',
		bestFor: [
			'low-latency',
			'classification',
			'autocomplete',
			'stable-provider-fallback',
			'structured-output',
			'tool-calling',
			'1m-context'
		],
		capabilities: {
			jsonMode: true,
			structuredOutputs: true,
			tools: true,
			multimodal: true,
			longContext: true
		}
	},
	'openai/gpt-oss-120b': {
		id: 'openai/gpt-oss-120b',
		name: 'GPT-OSS 120B',
		speed: 4.1,
		smartness: 4.65,
		creativity: 4.2,
		cost: 0.039,
		outputCost: 0.19,
		provider: 'openai',
		bestFor: [
			'ultra-low-cost-reasoning',
			'agentic-workflows',
			'json-mode',
			'structured-output',
			'tool-calling',
			'multi-provider-fallback',
			'131k-context'
		],
		limitations: ['open-weight-provider-variance', 'text-only'],
		capabilities: {
			jsonMode: true,
			structuredOutputs: true,
			tools: true,
			reasoning: true,
			longContext: true
		}
	},
	'openai/gpt-oss-20b': {
		id: 'openai/gpt-oss-20b',
		name: 'GPT-OSS 20B',
		speed: 4.5,
		smartness: 4.35,
		creativity: 4,
		cost: 0.03,
		outputCost: 0.11,
		provider: 'openai',
		bestFor: [
			'cheapest-project-briefs',
			'ultra-low-cost-json',
			'structured-output',
			'short-synthesis',
			'131k-context'
		],
		limitations: ['open-weight-provider-variance', 'text-only'],
		capabilities: {
			jsonMode: true,
			structuredOutputs: true,
			tools: true,
			reasoning: true,
			longContext: true
		}
	},
	'x-ai/grok-4.1-fast': {
		id: 'x-ai/grok-4.1-fast',
		name: 'Grok 4.1 Fast',
		speed: 4.5,
		smartness: 4.5,
		creativity: 4.2,
		cost: 0.2,
		outputCost: 0.5,
		provider: 'x-ai',
		bestFor: [
			'best-agentic-tool-calling',
			'tool-calling',
			'json-mode',
			'agentic-workflows',
			'deep-research',
			'2m-context',
			'tau2-bench-100%'
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
	'deepseek/deepseek-v3.2': {
		id: 'deepseek/deepseek-v3.2',
		name: 'DeepSeek V3.2',
		speed: 3.6,
		smartness: 4.7,
		creativity: 4.2,
		cost: 0.26,
		outputCost: 0.38,
		provider: 'deepseek',
		bestFor: [
			'complex-json',
			'structured-output',
			'instruction-following',
			'tool-calling',
			'agentic-tool-use',
			'best-value'
		],
		capabilities: {
			jsonMode: true,
			structuredOutputs: true,
			tools: true,
			reasoning: true,
			longContext: true
		}
	},
	'minimax/minimax-m2.7': {
		id: 'minimax/minimax-m2.7',
		name: 'MiniMax M2.7',
		speed: 3.4,
		smartness: 4.8,
		creativity: 4.4,
		cost: 0.3,
		outputCost: 1.2,
		provider: 'minimax',
		bestFor: [
			'agentic-workflows',
			'tool-calling',
			'autonomous-productivity',
			'multi-agent-workflows',
			'live-debugging',
			'root-cause-analysis',
			'long-output',
			'204k-context'
		],
		limitations: ['reasoning-tokens-can-increase-cost'],
		capabilities: { jsonMode: true, tools: true, reasoning: true, longContext: true }
	},
	'anthropic/claude-haiku-4.5': {
		id: 'anthropic/claude-haiku-4.5',
		name: 'Claude Haiku 4.5',
		speed: 4.5,
		smartness: 4.3,
		creativity: 4.2,
		cost: 1.0,
		outputCost: 5.0,
		provider: 'anthropic',
		bestFor: [
			'fast-generation',
			'excellent-tool-calling',
			'agent-chat',
			'briefs',
			'extended-thinking'
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
	'qwen/qwen3-32b': {
		id: 'qwen/qwen3-32b',
		name: 'Qwen3 32B',
		speed: 4.1,
		smartness: 4.4,
		creativity: 4.1,
		cost: 0.08,
		outputCost: 0.24,
		provider: 'qwen',
		bestFor: [
			'cheap-reasoning',
			'tool-calling',
			'instruction-following',
			'multilingual',
			'medium-context',
			'fallback-chat'
		],
		limitations: ['provider-availability-variable'],
		capabilities: {
			jsonMode: true,
			structuredOutputs: true,
			tools: true,
			reasoning: true,
			multimodal: false,
			longContext: true
		}
	},
	'qwen/qwen3.6-plus': {
		id: 'qwen/qwen3.6-plus',
		name: 'Qwen 3.6 Plus',
		speed: 3.3,
		smartness: 4.95,
		creativity: 4.6,
		cost: 0.325,
		outputCost: 1.95,
		provider: 'qwen',
		bestFor: [
			'agentic-coding',
			'repo-level-problem-solving',
			'front-end-development',
			'3d-scenes-games',
			'complex-reasoning',
			'multimodal',
			'structured-output',
			'tool-calling',
			'1m-context',
			'swe-bench-verified-78.8%'
		],
		limitations: ['reasoning-tokens-can-increase-cost'],
		capabilities: {
			jsonMode: true,
			structuredOutputs: true,
			tools: true,
			reasoning: true,
			multimodal: true,
			longContext: true
		}
	},
	'deepseek/deepseek-v3.1-terminus:exacto': {
		id: 'deepseek/deepseek-v3.1-terminus:exacto',
		name: 'DeepSeek V3.1 Terminus Exacto',
		speed: 3.5,
		smartness: 4.6,
		creativity: 4.1,
		cost: 0.21,
		outputCost: 0.79,
		provider: 'deepseek',
		bestFor: ['exacto-tool-calling', 'provider-pinned-routing', 'argument-fidelity'],
		limitations: ['route-only', 'exacto-provider-pinned'],
		capabilities: { jsonMode: true, structuredOutputs: true, tools: true, reasoning: true }
	},
	'qwen/qwen3-coder:exacto': {
		id: 'qwen/qwen3-coder:exacto',
		name: 'Qwen 3 Coder Exacto',
		speed: 3.8,
		smartness: 4.6,
		creativity: 4.2,
		cost: 0.22,
		outputCost: 1,
		provider: 'qwen',
		bestFor: ['exacto-tool-calling', 'coding-tools', 'provider-pinned-routing'],
		limitations: ['route-only', 'exacto-provider-pinned'],
		capabilities: { jsonMode: true, structuredOutputs: true, tools: true }
	},
	'moonshotai/kimi-k2.5': {
		id: 'moonshotai/kimi-k2.5',
		name: 'Kimi K2.5',
		speed: 3.5,
		smartness: 4.9,
		creativity: 4.6,
		cost: 0.3827,
		outputCost: 1.72,
		provider: 'moonshotai',
		bestFor: [
			'agentic-workflows',
			'visual-coding',
			'multimodal',
			'agent-swarm-100-agents',
			'office-productivity',
			'research-workflows',
			'1500-parallel-tool-calls',
			'262k-context',
			'cost-effective-reasoning'
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
	'moonshotai/kimi-k2-0905:exacto': {
		id: 'moonshotai/kimi-k2-0905:exacto',
		name: 'Kimi K2 0905 Exacto',
		speed: 3.4,
		smartness: 4.7,
		creativity: 4.4,
		cost: 0.4,
		outputCost: 2,
		provider: 'moonshotai',
		bestFor: ['exacto-tool-calling', 'agentic-workflows', 'provider-pinned-routing'],
		limitations: ['route-only', 'exacto-provider-pinned'],
		capabilities: { jsonMode: true, structuredOutputs: true, tools: true, longContext: true }
	},
	'nvidia/nemotron-3-super-120b-a12b:free': {
		id: 'nvidia/nemotron-3-super-120b-a12b:free',
		name: 'NVIDIA Nemotron 3 Super Free',
		speed: 3.2,
		smartness: 4.6,
		creativity: 4.1,
		cost: 0,
		outputCost: 0,
		provider: 'nvidia',
		bestFor: [
			'zero-cost-long-context',
			'multi-agent-workflows',
			'agentic-reasoning',
			'structured-output',
			'tool-calling',
			'262k-context',
			'long-output'
		],
		limitations: [
			'free-tier-rate-limits',
			'provider-availability-variable',
			'text-only',
			'explicit-free-tier-only',
			'not-default-production-routing'
		],
		capabilities: {
			jsonMode: true,
			structuredOutputs: true,
			tools: true,
			reasoning: true,
			longContext: true
		}
	},
	'anthropic/claude-sonnet-4.6': {
		id: 'anthropic/claude-sonnet-4.6',
		name: 'Claude Sonnet 4.6',
		speed: 2,
		smartness: 4.95,
		creativity: 4.7,
		cost: 3.0,
		outputCost: 15.0,
		provider: 'anthropic',
		bestFor: [
			'extended-thinking',
			'complex-reasoning',
			'creative-writing',
			'agentic-workflows',
			'1m-context'
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
	'anthropic/claude-opus-4.6': {
		id: 'anthropic/claude-opus-4.6',
		name: 'Claude Opus 4.6',
		speed: 1.5,
		smartness: 5.0,
		creativity: 4.8,
		cost: 5.0,
		outputCost: 25.0,
		provider: 'anthropic',
		bestFor: [
			'best-coding',
			'agents',
			'computer-use',
			'deep-research',
			'frontier-reasoning',
			'1m-context'
		],
		limitations: ['expensive'],
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

export const JSON_MODELS: Record<string, ModelProfile> = MODEL_CATALOG;
export const TEXT_MODELS: Record<string, ModelProfile> = MODEL_CATALOG;

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
		text: [
			'qwen/qwen3.5-flash-02-23',
			'google/gemini-3.1-flash-lite-preview',
			'openai/gpt-4.1-nano'
		],
		json: [
			'qwen/qwen3.6-plus',
			'deepseek/deepseek-v3.2',
			'openai/gpt-oss-120b',
			'openai/gpt-4.1-nano'
		],
		toolCalling: [
			'x-ai/grok-4.1-fast',
			'minimax/minimax-m2.7',
			'qwen/qwen3.6-plus',
			'openai/gpt-oss-120b'
		],
		toolCallingExacto: [
			'deepseek/deepseek-v3.1-terminus:exacto',
			'qwen/qwen3-coder:exacto',
			'moonshotai/kimi-k2-0905:exacto',
			'openai/gpt-4o-mini'
		]
	},
	tasks: {
		projectNextStep: [
			'qwen/qwen3.5-flash-02-23',
			'openai/gpt-oss-20b',
			'deepseek/deepseek-v3.2',
			'qwen/qwen3.6-plus',
			'openai/gpt-oss-120b',
			'openai/gpt-4.1-nano'
		]
	},
	agentRecommendations: {
		brainDumps: {
			contextExtraction: ['qwen/qwen3.5-flash-02-23', 'openai/gpt-4.1-nano'],
			taskExtraction: ['deepseek/deepseek-v3.2', 'openai/gpt-oss-120b'],
			clarification: ['qwen/qwen3.6-plus', 'openai/gpt-oss-120b']
		},
		agentChat: {
			planner: {
				simple: ['x-ai/grok-4.1-fast', 'qwen/qwen3.5-flash-02-23'],
				complex: ['qwen/qwen3.6-plus', 'deepseek/deepseek-v3.2', 'openai/gpt-oss-120b'],
				toolHeavy: ['x-ai/grok-4.1-fast', 'minimax/minimax-m2.7', 'qwen/qwen3.6-plus']
			},
			executor: {
				default: ['qwen/qwen3.5-flash-02-23', 'openai/gpt-4.1-nano'],
				toolHeavy: ['x-ai/grok-4.1-fast', 'minimax/minimax-m2.7', 'openai/gpt-oss-120b']
			},
			synthesis: {
				simple: ['qwen/qwen3.5-flash-02-23', 'openai/gpt-oss-120b'],
				complex: ['qwen/qwen3.6-plus', 'deepseek/deepseek-v3.2', 'openai/gpt-oss-120b']
			}
		},
		dailyBriefs: {
			projectBrief: [
				'openai/gpt-oss-20b',
				'qwen/qwen3.5-flash-02-23',
				'openai/gpt-oss-120b',
				'openai/gpt-4.1-nano'
			],
			generation: ['qwen/qwen3.6-plus', 'deepseek/deepseek-v3.2', 'openai/gpt-oss-120b'],
			summary: ['qwen/qwen3.5-flash-02-23', 'openai/gpt-4.1-nano']
		}
	},
	toolCalling: [
		'x-ai/grok-4.1-fast',
		'minimax/minimax-m2.7',
		'qwen/qwen3.6-plus',
		'deepseek/deepseek-v3.2',
		'openai/gpt-oss-120b',
		'openai/gpt-4.1-nano',
		'qwen/qwen3.5-flash-02-23',
		'openai/gpt-4o-mini',
		'anthropic/claude-haiku-4.5',
		'moonshotai/kimi-k2.5',
		'anthropic/claude-sonnet-4.6',
		'anthropic/claude-opus-4.6'
	],
	emergencyTextFallbacks: [
		'openai/gpt-4.1-nano',
		'openai/gpt-4o-mini',
		'anthropic/claude-haiku-4.5'
	],
	jsonProfiles: {
		fast: [
			'openai/gpt-oss-20b',
			'qwen/qwen3.5-flash-02-23',
			'openai/gpt-4.1-nano',
			'google/gemini-2.5-flash-lite',
			'openai/gpt-4o-mini',
			'openai/gpt-oss-120b'
		],
		balanced: [
			'qwen/qwen3.6-plus',
			'deepseek/deepseek-v3.2',
			'openai/gpt-oss-120b',
			'x-ai/grok-4.1-fast',
			'qwen/qwen3.5-flash-02-23',
			'minimax/minimax-m2.7',
			'anthropic/claude-haiku-4.5'
		],
		powerful: [
			'qwen/qwen3.6-plus',
			'deepseek/deepseek-v3.2',
			'openai/gpt-oss-120b',
			'minimax/minimax-m2.7',
			'moonshotai/kimi-k2.5',
			'anthropic/claude-sonnet-4.6'
		],
		maximum: [
			'anthropic/claude-opus-4.6',
			'qwen/qwen3.6-plus',
			'anthropic/claude-sonnet-4.6',
			'moonshotai/kimi-k2.5',
			'deepseek/deepseek-v3.2'
		]
	},
	textProfiles: {
		speed: [
			'openai/gpt-oss-20b',
			'qwen/qwen3.5-flash-02-23',
			'openai/gpt-4.1-nano',
			'google/gemini-2.5-flash-lite',
			'x-ai/grok-4.1-fast',
			'openai/gpt-4o-mini',
			'openai/gpt-oss-120b'
		],
		balanced: [
			'x-ai/grok-4.1-fast',
			'qwen/qwen3.5-flash-02-23',
			'qwen/qwen3.6-plus',
			'openai/gpt-oss-120b',
			'deepseek/deepseek-v3.2',
			'minimax/minimax-m2.7',
			'anthropic/claude-haiku-4.5',
			'openai/gpt-4.1-nano'
		],
		quality: [
			'qwen/qwen3.6-plus',
			'deepseek/deepseek-v3.2',
			'openai/gpt-oss-120b',
			'minimax/minimax-m2.7',
			'moonshotai/kimi-k2.5',
			'anthropic/claude-sonnet-4.6',
			'anthropic/claude-haiku-4.5'
		],
		creative: [
			'anthropic/claude-opus-4.6',
			'anthropic/claude-sonnet-4.6',
			'qwen/qwen3.6-plus',
			'moonshotai/kimi-k2.5',
			'anthropic/claude-haiku-4.5'
		]
	}
} as const;

export const OPENROUTER_V2_TEXT_MODELS = [...MODEL_ROUTES.openRouterV2.text];
export const OPENROUTER_V2_JSON_MODELS = [...MODEL_ROUTES.openRouterV2.json];
export const OPENROUTER_V2_TOOL_MODELS = [...MODEL_ROUTES.openRouterV2.toolCalling];
export const OPENROUTER_V2_TOOL_MODELS_EXACTO = [...MODEL_ROUTES.openRouterV2.toolCallingExacto];
export const PROJECT_NEXT_STEP_MODELS = [...MODEL_ROUTES.tasks.projectNextStep];
export const AGENTIC_MODEL_RECOMMENDATIONS = MODEL_ROUTES.agentRecommendations;

export const TOOL_CALLING_MODEL_ORDER = [...MODEL_ROUTES.toolCalling];
export const TOOL_CALLING_MODEL_SET = new Set<string>(TOOL_CALLING_MODEL_ORDER);

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
	custom: []
};
