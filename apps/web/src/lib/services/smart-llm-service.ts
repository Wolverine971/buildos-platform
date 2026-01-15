// apps/web/src/lib/services/smart-llm-service.ts

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { PRIVATE_OPENROUTER_API_KEY } from '$env/static/private';
import { ErrorLoggerService } from './errorLogger.service';

// ============================================
// TYPE DEFINITIONS
// ============================================

export type JSONProfile = 'fast' | 'balanced' | 'powerful' | 'maximum' | 'custom';
export type TextProfile = 'speed' | 'balanced' | 'quality' | 'creative' | 'custom';

export interface ModelProfile {
	id: string;
	name: string;
	speed: number; // 1-5 (5 = fastest)
	smartness: number; // 1-5 (5 = smartest)
	creativity?: number; // 1-5 (for text generation)
	cost: number; // per 1M input tokens
	outputCost: number; // per 1M output tokens
	provider: string;
	bestFor: string[];
	limitations?: string[];
}

export interface JSONRequestOptions {
	systemPrompt: string;
	userPrompt: string;
	userId?: string; // Made optional to match LLMService interface expectations
	profile?: JSONProfile;
	temperature?: number;
	validation?: {
		retryOnParseError?: boolean;
		validateSchema?: boolean;
		maxRetries?: number;
	};
	requirements?: {
		maxLatency?: number;
		minAccuracy?: number;
		maxCost?: number;
	};
	// Optional context for usage tracking
	operationType?: string;
	projectId?: string;
	brainDumpId?: string;
	taskId?: string;
	briefId?: string;
	chatSessionId?: string;
	agentSessionId?: string;
	agentPlanId?: string;
	agentExecutionId?: string;
}

export interface TextGenerationOptions {
	prompt: string;
	userId?: string; // Made optional to match LLMService interface expectations
	profile?: TextProfile;
	systemPrompt?: string;
	temperature?: number;
	maxTokens?: number;
	timeoutMs?: number;
	streaming?: boolean;
	requirements?: {
		maxLatency?: number;
		minQuality?: number;
		maxCost?: number;
	};
	// Optional context for usage tracking
	operationType?: string;
	projectId?: string;
	brainDumpId?: string;
	taskId?: string;
	briefId?: string;
	chatSessionId?: string;
	agentSessionId?: string;
	agentPlanId?: string;
	agentExecutionId?: string;
}

export interface TextGenerationUsage {
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
}

export interface TextGenerationResult {
	text: string;
	usage?: TextGenerationUsage;
	model?: string;
}

export type TranscriptionProvider = 'openrouter' | 'openai' | 'auto';

export interface TranscriptionOptions {
	audioFile: File;
	userId?: string;
	vocabularyTerms?: string;
	models?: string[]; // Ordered OpenRouter model list
	timeoutMs?: number;
	maxRetries?: number;
	initialRetryDelayMs?: number;
}

export interface TranscriptionResult {
	text: string;
	durationMs: number;
	audioDuration?: number | null;
	model: string;
	service: 'openrouter' | 'openai';
	requestId?: string;
}

interface OpenRouterResponse {
	id: string;
	provider?: string;
	model: string;
	object: string;
	created: number;
	choices: Array<{
		message: {
			content: string;
			role: string;
		};
		finish_reason: string;
		native_finish_reason?: string;
	}>;
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
		prompt_tokens_details?: {
			cached_tokens?: number;
			audio_tokens?: number;
		};
		completion_tokens_details?: {
			reasoning_tokens?: number;
		};
	};
	system_fingerprint?: string;
}

// ============================================
// MODEL CONFIGURATIONS
// ============================================

const JSON_MODELS: Record<string, ModelProfile> = {
	// ============================================
	// Ultra-fast tier (1-2s) - Free models
	// ============================================
	'x-ai/grok-4-fast:free': {
		id: 'x-ai/grok-4-fast:free',
		name: 'Grok 4 Fast (Free)',
		speed: 4.5,
		smartness: 4.3,
		cost: 0.0,
		outputCost: 0.0,
		provider: 'x-ai',
		bestFor: ['json-mode', 'free-tier', 'fast-prototyping', 'reasoning'],
		limitations: ['limited-time-free', 'data-used-for-training', 'privacy-concerns']
	},

	// ============================================
	// Fast tier (2-3s) - Budget options
	// ============================================
	'google/gemini-2.5-flash-lite': {
		id: 'google/gemini-2.5-flash-lite',
		name: 'Gemini 2.5 Flash Lite',
		speed: 4.5,
		smartness: 4.2,
		cost: 0.07,
		outputCost: 0.3,
		provider: 'google',
		bestFor: ['ultra-low-cost', 'lightweight-reasoning', 'json-mode', 'structured-output'],
		limitations: ['reasoning-disabled-by-default']
	},
	'openai/gpt-4.1-nano': {
		id: 'openai/gpt-4.1-nano',
		name: 'GPT-4.1 Nano',
		speed: 5,
		smartness: 3.8,
		cost: 0.1,
		outputCost: 0.4,
		provider: 'openai',
		bestFor: ['ultra-fast', 'json-mode', 'structured-output', 'classification', '1m-context'],
		limitations: ['less-reasoning-depth']
	},
	'google/gemini-2.5-flash': {
		id: 'google/gemini-2.5-flash',
		name: 'Gemini 2.5 Flash',
		speed: 4.5,
		smartness: 4.5,
		cost: 0.15,
		outputCost: 0.6,
		provider: 'google',
		bestFor: [
			'hybrid-reasoning',
			'json-mode',
			'structured-output',
			'thinking-model',
			'swe-bench'
		],
		limitations: []
	},
	'google/gemini-2.0-flash-001': {
		id: 'google/gemini-2.0-flash-001',
		name: 'Gemini 2.0 Flash',
		speed: 4,
		smartness: 4.3,
		cost: 0.1,
		outputCost: 0.4,
		provider: 'google',
		bestFor: ['fast-ttft', 'complex-instructions', 'function-calling', 'multimodal'],
		limitations: ['superseded-by-2.5-flash']
	},
	'openai/gpt-4o-mini': {
		id: 'openai/gpt-4o-mini',
		name: 'GPT-4o Mini',
		speed: 4,
		smartness: 4,
		cost: 0.15,
		outputCost: 0.6,
		provider: 'openai',
		bestFor: ['json-mode', 'cost-effective', 'structured-output', 'general-purpose'],
		limitations: []
	},
	'deepseek/deepseek-chat': {
		id: 'deepseek/deepseek-chat',
		name: 'DeepSeek Chat V3',
		speed: 3.5,
		smartness: 4.5,
		cost: 0.27,
		outputCost: 1.1,
		provider: 'deepseek',
		bestFor: ['complex-json', 'instruction-following', 'nested-structures', 'best-value'],
		limitations: []
	},
	'x-ai/grok-4.1-fast': {
		id: 'x-ai/grok-4.1-fast',
		name: 'Grok 4.1 Fast',
		speed: 4.5,
		smartness: 4.5,
		cost: 0.3,
		outputCost: 1.0,
		provider: 'x-ai',
		bestFor: ['tool-calling', 'json-mode', 'agentic-workflows', '2m-context', 'tau-bench-93%'],
		limitations: []
	},
	'x-ai/grok-code-fast-1': {
		id: 'x-ai/grok-code-fast-1',
		name: 'Grok Code Fast',
		speed: 3.5,
		smartness: 4.4,
		cost: 0.2,
		outputCost: 1.5,
		provider: 'x-ai',
		bestFor: ['agentic-coding', 'json-mode', 'structured-output', 'reasoning-traces'],
		limitations: []
	},
	'z-ai/glm-4.6': {
		id: 'z-ai/glm-4.6',
		name: 'GLM 4.6',
		speed: 3.5,
		smartness: 4.4,
		cost: 0.5,
		outputCost: 1.75,
		provider: 'z-ai',
		bestFor: ['coding', 'long-context', 'reasoning', 'structured-output', 'tool-use'],
		limitations: ['fp8-quantization']
	},
	'qwen/qwen3-32b': {
		id: 'qwen/qwen3-32b',
		name: 'Qwen 3 32B',
		speed: 3.5,
		smartness: 4.5,
		cost: 0.3,
		outputCost: 0.6,
		provider: 'qwen',
		bestFor: ['structured-output', 'multilingual', 'coding', 'tool-calling', 'tau-bench-69.6%'],
		limitations: []
	},
	'minimax/minimax-m2.1': {
		id: 'minimax/minimax-m2.1',
		name: 'MiniMax M2.1',
		speed: 3.5,
		smartness: 4.6,
		cost: 0.3,
		outputCost: 1.2,
		provider: 'minimax',
		bestFor: [
			'agentic-workflows',
			'tool-calling',
			'coding',
			'terminal-tasks',
			'swe-bench-69.4%',
			'tau-bench-77.2%'
		],
		limitations: ['verbose-output', 'requires-reasoning-tokens']
	},

	// ============================================
	// Balanced tier (3-4s) - Quality + Speed
	// ============================================
	'anthropic/claude-haiku-4.5': {
		id: 'anthropic/claude-haiku-4.5',
		name: 'Claude Haiku 4.5',
		speed: 4.5,
		smartness: 4.3,
		cost: 1.0,
		outputCost: 5.0,
		provider: 'anthropic',
		bestFor: [
			'fast-json',
			'excellent-tool-calling',
			'parallel-tools',
			'agent-chat',
			'extended-thinking'
		],
		limitations: ['no-native-json-mode']
	},

	// ============================================
	// Powerful tier (4-5s) - High quality
	// ============================================
	'anthropic/claude-sonnet-4': {
		id: 'anthropic/claude-sonnet-4',
		name: 'Claude Sonnet 4',
		speed: 2.5,
		smartness: 4.8,
		cost: 3.0,
		outputCost: 15.0,
		provider: 'anthropic',
		bestFor: [
			'complex-reasoning',
			'nuanced-instructions',
			'tool-calling-92%',
			'swe-bench-72.7%',
			'1m-context'
		],
		limitations: ['no-native-json-mode']
	},
	'deepseek/deepseek-r1': {
		id: 'deepseek/deepseek-r1',
		name: 'DeepSeek R1',
		speed: 3.5,
		smartness: 4.9,
		cost: 0.55,
		outputCost: 2.19,
		provider: 'deepseek',
		bestFor: [
			'complex-reasoning',
			'math',
			'coding',
			'tool-calling',
			'advanced-analysis',
			'best-reasoning-value'
		],
		limitations: ['slower-than-chat', 'verbose-output']
	},

	// ============================================
	// Maximum tier (5-7s) - Best quality
	// ============================================
	'anthropic/claude-sonnet-4.5': {
		id: 'anthropic/claude-sonnet-4.5',
		name: 'Claude Sonnet 4.5',
		speed: 2,
		smartness: 4.9,
		cost: 3.0,
		outputCost: 15.0,
		provider: 'anthropic',
		bestFor: [
			'best-overall',
			'extended-thinking',
			'osworld-61.4%',
			'complex-reasoning',
			'nuanced-tasks'
		],
		limitations: ['no-native-json-mode']
	},
	'openai/gpt-4o': {
		id: 'openai/gpt-4o',
		name: 'GPT-4o',
		speed: 2,
		smartness: 4.5,
		cost: 2.5,
		outputCost: 10.0,
		provider: 'openai',
		bestFor: ['json-mode', 'general-purpose', 'reliable-fallback']
	}
};

const TEXT_MODELS: Record<string, ModelProfile> = {
	// ============================================
	// Ultra-speed tier (<1s) - Free models
	// ============================================
	'x-ai/grok-4-fast:free': {
		id: 'x-ai/grok-4-fast:free',
		name: 'Grok 4 Fast (Free)',
		speed: 4.8,
		smartness: 4.3,
		creativity: 4.2,
		cost: 0.0,
		outputCost: 0.0,
		provider: 'x-ai',
		bestFor: ['free-tier', 'fast-generation', 'reasoning', 'multimodal'],
		limitations: ['data-used-for-training', 'limited-requests', 'privacy-concerns']
	},

	// ============================================
	// Speed tier (<1s) - Budget options
	// ============================================
	'openai/gpt-4.1-nano': {
		id: 'openai/gpt-4.1-nano',
		name: 'GPT-4.1 Nano',
		speed: 5,
		smartness: 3.8,
		creativity: 3.5,
		cost: 0.1,
		outputCost: 0.4,
		provider: 'openai',
		bestFor: ['ultra-fast', 'classification', 'autocomplete', '1m-context'],
		limitations: ['less-reasoning-depth']
	},
	'google/gemini-2.5-flash-lite': {
		id: 'google/gemini-2.5-flash-lite',
		name: 'Gemini 2.5 Flash Lite',
		speed: 4.5,
		smartness: 4.2,
		creativity: 4,
		cost: 0.07,
		outputCost: 0.3,
		provider: 'google',
		bestFor: ['ultra-low-latency', 'lightweight-reasoning', 'cost-efficient']
	},
	'google/gemini-2.5-flash': {
		id: 'google/gemini-2.5-flash',
		name: 'Gemini 2.5 Flash',
		speed: 4.5,
		smartness: 4.5,
		creativity: 4.3,
		cost: 0.15,
		outputCost: 0.6,
		provider: 'google',
		bestFor: ['hybrid-reasoning', 'thinking-model', 'fast-quality', 'multimodal']
	},
	'google/gemini-2.0-flash-001': {
		id: 'google/gemini-2.0-flash-001',
		name: 'Gemini 2.0 Flash',
		speed: 4.2,
		smartness: 4.3,
		creativity: 4,
		cost: 0.1,
		outputCost: 0.4,
		provider: 'google',
		bestFor: ['fast-ttft', 'complex-instructions', 'multimodal', 'function-calling'],
		limitations: ['superseded-by-2.5-flash']
	},

	// ============================================
	// Balanced tier (1-3s) - Quality + Speed
	// ============================================
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
		]
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
		bestFor: ['cost-effective', 'general-purpose', 'balanced-quality']
	},
	'deepseek/deepseek-chat': {
		id: 'deepseek/deepseek-chat',
		name: 'DeepSeek Chat V3',
		speed: 3,
		smartness: 4.5,
		creativity: 4,
		cost: 0.27,
		outputCost: 1.1,
		provider: 'deepseek',
		bestFor: ['briefs', 'reports', 'structured-content', 'best-value']
	},
	'x-ai/grok-4.1-fast': {
		id: 'x-ai/grok-4.1-fast',
		name: 'Grok 4.1 Fast',
		speed: 4.5,
		smartness: 4.5,
		creativity: 4.2,
		cost: 0.3,
		outputCost: 1.0,
		provider: 'x-ai',
		bestFor: ['tool-calling', 'agentic-workflows', '2m-context', 'fast-quality']
	},
	'z-ai/glm-4.6': {
		id: 'z-ai/glm-4.6',
		name: 'GLM 4.6',
		speed: 3.5,
		smartness: 4.4,
		creativity: 4.2,
		cost: 0.5,
		outputCost: 1.75,
		provider: 'z-ai',
		bestFor: ['coding', 'long-content', 'reasoning', 'refined-writing', 'technical-docs']
	},
	'qwen/qwen3-32b': {
		id: 'qwen/qwen3-32b',
		name: 'Qwen 3 32B',
		speed: 3.5,
		smartness: 4.5,
		creativity: 4.3,
		cost: 0.3,
		outputCost: 0.6,
		provider: 'qwen',
		bestFor: ['multilingual', 'coding', 'tool-calling', 'creative-writing']
	},
	'minimax/minimax-m2.1': {
		id: 'minimax/minimax-m2.1',
		name: 'MiniMax M2.1',
		speed: 3.5,
		smartness: 4.6,
		creativity: 4.3,
		cost: 0.3,
		outputCost: 1.2,
		provider: 'minimax',
		bestFor: ['agentic-workflows', 'tool-calling', 'coding', 'terminal-tasks'],
		limitations: ['verbose-output', 'requires-reasoning-tokens']
	},

	// ============================================
	// Quality tier (3-5s) - High quality
	// ============================================
	'anthropic/claude-sonnet-4': {
		id: 'anthropic/claude-sonnet-4',
		name: 'Claude Sonnet 4',
		speed: 2.5,
		smartness: 4.8,
		creativity: 4.6,
		cost: 3.0,
		outputCost: 15.0,
		provider: 'anthropic',
		bestFor: ['high-quality-writing', 'complex-content', 'nuanced-text', 'tool-calling']
	},
	'deepseek/deepseek-r1': {
		id: 'deepseek/deepseek-r1',
		name: 'DeepSeek R1',
		speed: 3.5,
		smartness: 4.9,
		creativity: 4.4,
		cost: 0.55,
		outputCost: 2.19,
		provider: 'deepseek',
		bestFor: ['reasoning', 'analysis', 'technical-writing', 'complex-content', 'coding']
	},

	// ============================================
	// Maximum tier - Best quality
	// ============================================
	'anthropic/claude-sonnet-4.5': {
		id: 'anthropic/claude-sonnet-4.5',
		name: 'Claude Sonnet 4.5',
		speed: 2,
		smartness: 4.9,
		creativity: 4.7,
		cost: 3.0,
		outputCost: 15.0,
		provider: 'anthropic',
		bestFor: ['best-overall', 'extended-thinking', 'complex-reasoning', 'creative-writing']
	},
	'openai/gpt-4o': {
		id: 'openai/gpt-4o',
		name: 'GPT-4o',
		speed: 2,
		smartness: 4.5,
		creativity: 4.5,
		cost: 2.5,
		outputCost: 10.0,
		provider: 'openai',
		bestFor: ['general-purpose', 'reliable-fallback', 'multimodal']
	}
};

// Models that have reliable tool-calling support when routed through OpenRouter.
// The order doubles as our fallback priority list whenever we must guarantee tool support.
// Updated 2025-12-23 based on latest benchmark data (τ²-Bench, SWE-bench, tool-calling success rates)
// Priority: Highest reliability first, then cost-effectiveness as tiebreaker
const TOOL_CALLING_MODEL_ORDER = [
	'x-ai/grok-4.1-fast', // Best τ²-Bench: 93%, 2M context, optimized for agents: $0.30/$1.00
	// 'anthropic/claude-sonnet-4', // Excellent: ~92% success, 72.7% SWE-bench, 1M context: $3/$15
	'anthropic/claude-haiku-4.5', // Fast + reliable: parallel tool calls, extended thinking: $1/$5
	'openai/gpt-4o-mini', // Very good: 88% success rate, fast + cheap: $0.15/$0.60
	'openai/gpt-4o', // Strong: 87%+ success rate: $2.50/$10
	'minimax/minimax-m2.1', // Excellent agentic: 77.2% τ²-Bench, 69.4% SWE-bench: $0.30/$1.20
	// 'anthropic/claude-sonnet-4.5', // Best overall quality: 61.4% OSWorld, extended thinking: $3/$15
	'qwen/qwen3-32b', // Good: 69.6% τ²-Bench, excellent multilingual: $0.30/$0.60
	'deepseek/deepseek-r1', // Good reasoning, slower: $0.55/$2.19
	'deepseek/deepseek-chat', // Good for sequential tasks: $0.27/$1.10
	'z-ai/glm-4.6', // Good tool use, strong coding: $0.50/$1.75
	'google/gemini-2.5-flash', // Improved: hybrid reasoning model: $0.15/$0.60
	'google/gemini-2.0-flash-001' // Fallback: 75-76% success rate: $0.10/$0.40
] as const;
const TOOL_CALLING_MODEL_SET = new Set<string>(TOOL_CALLING_MODEL_ORDER);

// ============================================
// PROFILE MAPPINGS
// ============================================

const JSON_PROFILE_MODELS: Record<JSONProfile, string[]> = {
	fast: [
		'openai/gpt-4.1-nano', // Fastest (speed:5) + native JSON schema: $0.10/$0.40
		'google/gemini-2.5-flash-lite', // Ultra-low cost: $0.07/$0.30
		'deepseek/deepseek-chat', // Native JSON mode + good value: $0.27/$1.10
		'anthropic/claude-haiku-4.5', // Fast + parallel tool calls (no native JSON)
		'openai/gpt-4o-mini' // Reliable fallback with JSON mode
	],
	balanced: [
		'deepseek/deepseek-chat', // Best value + native JSON: $0.27/$1.10
		'minimax/minimax-m2.1', // Strong agentic + structured output: 77.2% τ²-Bench
		'anthropic/claude-haiku-4.5', // Excellent tool calling, extended thinking
		'google/gemini-2.5-flash', // Hybrid reasoning model
		'openai/gpt-4o-mini', // Reliable fallback
		'google/gemini-2.5-flash-lite' // Cost fallback
	],
	powerful: [
		'deepseek/deepseek-r1', // Native JSON + highest smartness (4.9): $0.55/$2.19
		// 'anthropic/claude-sonnet-4', // Best tool calling ~92%, 72.7% SWE-bench (no native JSON)
		'minimax/minimax-m2.1', // Best agentic: 77.2% τ²-Bench, 69.4% SWE-bench
		'openai/gpt-4o', // Strong general purpose + native JSON
		'z-ai/glm-4.6' // Strong coding + native JSON, MIT license
	],
	maximum: [
		'deepseek/deepseek-r1', // Native JSON + highest smartness (4.9) - best for complex JSON
		// 'anthropic/claude-sonnet-4.5', // Best overall: 61.4% OSWorld, extended thinking
		// 'anthropic/claude-sonnet-4', // Strong tool calling fallback
		'minimax/minimax-m2.1', // Excellent agentic capabilities
		'openai/gpt-4o' // Reliable fallback with native JSON
	],
	custom: [] // Will be determined by requirements
};

const TEXT_PROFILE_MODELS: Record<TextProfile, string[]> = {
	speed: [
		'openai/gpt-4.1-nano', // Fastest (speed:5), 1M context: $0.10/$0.40
		'google/gemini-2.5-flash-lite', // Very fast + cheapest: $0.07/$0.30
		'anthropic/claude-haiku-4.5', // Fast with extended thinking
		'openai/gpt-4o-mini' // Reliable fallback
	],
	balanced: [
		'x-ai/grok-4.1-fast', // Best tool-calling: 93% τ²-Bench, 2M context: $0.30/$1.00
		'deepseek/deepseek-chat', // Best value: $0.27/$1.10, smartness 4.5
		'anthropic/claude-haiku-4.5', // Good for agents, extended thinking
		'minimax/minimax-m2.1', // Strong agentic capabilities, smartness 4.6
		'google/gemini-2.5-flash', // Hybrid reasoning
		'openai/gpt-4o-mini' // Reliable fallback
	],
	quality: [
		'x-ai/grok-4.1-fast', // Best tool-calling: 93% τ²-Bench, speed 4.5, smartness 4.5: $0.30/$1.00
		'anthropic/claude-haiku-4.5', // Excellent tool-calling, parallel tools, extended thinking: $1/$5
		'deepseek/deepseek-r1', // Highest reasoning (4.9), excellent for technical content
		'minimax/minimax-m2.1', // 61 Intelligence Index, excellent coding
		'openai/gpt-4o' // Reliable fallback
	],
	creative: [
		// 'anthropic/claude-sonnet-4.5', // Best creative: highest creativity (4.7), extended thinking
		// 'anthropic/claude-sonnet-4', // Strong creative: creativity 4.6
		'openai/gpt-4o', // Good creative: creativity 4.5
		'deepseek/deepseek-r1' // Good for creative reasoning
	],
	custom: []
};

// ============================================
// MAIN SERVICE CLASS
// ============================================

export class SmartLLMService {
	private apiKey: string = PRIVATE_OPENROUTER_API_KEY;
	private apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
	private costTracking = new Map<string, number>();
	private performanceMetrics = new Map<string, number[]>();
	private errorLogger?: ErrorLoggerService;

	// Optional: For logging and metrics
	private supabase?: SupabaseClient<Database>;

	// Configuration
	private httpReferer: string;
	private appName: string;

	constructor(config?: {
		httpReferer?: string;
		appName?: string;
		supabase?: SupabaseClient<Database>;
	}) {
		this.httpReferer = config?.httpReferer || 'https://yourdomain.com';
		this.appName = config?.appName || 'SmartLLMService';
		this.supabase = config?.supabase;
		if (config?.supabase) {
			this.errorLogger = ErrorLoggerService.getInstance(config.supabase);
		}
	}

	// ============================================
	// DATABASE LOGGING
	// ============================================

	private async logUsageToDatabase(params: {
		userId?: string; // Made optional to match TextGenerationOptions
		operationType: string;
		modelRequested: string;
		modelUsed: string;
		provider?: string;
		promptTokens: number;
		completionTokens: number;
		totalTokens: number;
		inputCost: number;
		outputCost: number;
		totalCost: number;
		responseTimeMs: number;
		requestStartedAt: Date;
		requestCompletedAt: Date;
		status: 'success' | 'failure' | 'timeout' | 'rate_limited' | 'invalid_response';
		errorMessage?: string;
		temperature?: number;
		maxTokens?: number;
		profile?: string;
		streaming?: boolean;
		projectId?: string;
		brainDumpId?: string;
		taskId?: string;
		briefId?: string;
		chatSessionId?: string;
		agentSessionId?: string;
		agentPlanId?: string;
		agentExecutionId?: string;
		openrouterRequestId?: string;
		openrouterCacheStatus?: string;
		rateLimitRemaining?: number;
		metadata?: any;
	}): Promise<void> {
		if (!this.supabase) {
			console.warn('Supabase client not configured, skipping usage logging');
			return;
		}

		try {
			const sanitizedUserId = this.normalizeUserIdForLogging(params.userId);

			// Defensive check: Skip logging if user_id is invalid
			// This prevents foreign key constraint violations
			if (!sanitizedUserId) {
				console.warn('Invalid user_id for LLM usage logging, skipping database insert', {
					providedUserId: params.userId,
					operationType: params.operationType,
					modelUsed: params.modelUsed,
					status: params.status
				});
				return;
			}

			const projectId = this.normalizeProjectIdForLogging(params.projectId);
			const chatSessionId = this.normalizeOptionalIdForLogging(
				params.chatSessionId || this.getMetadataId(params.metadata, 'sessionId')
			);
			const agentSessionId = this.normalizeOptionalIdForLogging(
				params.agentSessionId || this.getMetadataId(params.metadata, 'agentSessionId')
			);
			const agentPlanId = this.normalizeOptionalIdForLogging(
				params.agentPlanId || this.getMetadataId(params.metadata, 'planId')
			);
			const agentExecutionId = this.normalizeOptionalIdForLogging(
				params.agentExecutionId || this.getMetadataId(params.metadata, 'executionId')
			);
			const payload = {
				user_id: sanitizedUserId,
				operation_type: params.operationType,
				model_requested: params.modelRequested,
				model_used: params.modelUsed,
				provider: params.provider,
				prompt_tokens: params.promptTokens,
				completion_tokens: params.completionTokens,
				total_tokens: params.totalTokens,
				input_cost_usd: params.inputCost,
				output_cost_usd: params.outputCost,
				total_cost_usd: params.totalCost,
				response_time_ms: params.responseTimeMs,
				request_started_at: params.requestStartedAt.toISOString(),
				request_completed_at: params.requestCompletedAt.toISOString(),
				status: params.status,
				error_message: params.errorMessage,
				temperature: params.temperature,
				max_tokens: params.maxTokens,
				profile: params.profile,
				streaming: params.streaming,
				project_id: projectId ?? undefined,
				chat_session_id: chatSessionId ?? undefined,
				agent_session_id: agentSessionId ?? undefined,
				agent_plan_id: agentPlanId ?? undefined,
				agent_execution_id: agentExecutionId ?? undefined,
				brain_dump_id: params.brainDumpId,
				task_id: params.taskId,
				brief_id: params.briefId,
				openrouter_request_id: params.openrouterRequestId,
				openrouter_cache_status: params.openrouterCacheStatus,
				rate_limit_remaining: params.rateLimitRemaining,
				metadata: params.metadata
			};

			const { error } = await this.supabase.from('llm_usage_logs').insert(payload);

			if (error) {
				if (
					error.code === '23503' &&
					error.message?.includes('llm_usage_logs_project_id_fkey')
				) {
					const { error: retryError } = await this.supabase
						.from('llm_usage_logs')
						.insert({ ...payload, project_id: null });
					if (retryError) {
						console.error(
							'Failed to log LLM usage (retry without project_id):',
							retryError
						);
					}
					return;
				}

				console.error('Failed to log LLM usage to database:', error);
			}
		} catch (error) {
			console.error('Exception while logging LLM usage:', error);
			if (this.errorLogger) {
				await this.errorLogger.logDatabaseError(
					error,
					'INSERT',
					'llm_usage_logs',
					params.userId,
					{
						operation: 'logUsageToDatabase',
						errorType: 'llm_usage_logging_failure',
						operationType: params.operationType,
						modelUsed: params.modelUsed,
						status: params.status
					}
				);
			}
		}
	}

	private normalizeUserIdForLogging(userId?: string | null): string | null {
		if (!userId) return null;
		const trimmed = userId.trim();
		return this.isUUID(trimmed) ? trimmed : null;
	}

	private normalizeProjectIdForLogging(projectId?: string | null): string | null {
		if (!projectId) return null;
		const trimmed = projectId.trim();
		return this.isUUID(trimmed) ? trimmed : null;
	}

	private normalizeOptionalIdForLogging(value?: string | null): string | null {
		if (!value) return null;
		const trimmed = value.trim();
		return this.isUUID(trimmed) ? trimmed : null;
	}

	private getMetadataId(metadata: any, key: string): string | undefined {
		if (!metadata || typeof metadata !== 'object') {
			return undefined;
		}
		const value = metadata[key];
		return typeof value === 'string' ? value : undefined;
	}

	private isUUID(value: string): boolean {
		const uuidRegex =
			/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
		return uuidRegex.test(value);
	}

	// ============================================
	// JSON RESPONSE METHOD
	// ============================================

	async getJSONResponse<T = any>(options: JSONRequestOptions): Promise<T> {
		const requestStartedAt = new Date();
		const startTime = performance.now();
		const profile = options.profile || 'balanced';

		// Analyze prompt complexity
		const complexity = this.analyzeComplexity(options.systemPrompt + options.userPrompt);

		// Select models based on profile and requirements
		const preferredModels = this.selectJSONModels(profile, complexity, options.requirements);

		// Add JSON-specific instructions to system prompt
		const enhancedSystemPrompt = this.enhanceSystemPromptForJSON(options.systemPrompt);

		let lastError: Error | null = null;
		let retryCount = 0;
		const maxRetries = options.validation?.maxRetries || 2;

		// Make the OpenRouter API call with model routing
		// Primary model is first in preferredModels, others are fallbacks
		try {
			const response = await this.callOpenRouter({
				model: preferredModels[0] || 'openai/gpt-4o-mini', // Primary model with fallback
				models: preferredModels, // All models for fallback routing (via extra_body)
				messages: [
					{ role: 'system', content: enhancedSystemPrompt },
					{ role: 'user', content: options.userPrompt }
				],
				temperature: options.temperature || 0.2,
				response_format: this.supportsJsonMode(preferredModels[0] || 'openai/gpt-4o-mini')
					? { type: 'json_object' }
					: undefined,
				max_tokens: 8192
			});

			// Guard against malformed response
			if (!response.choices || response.choices.length === 0) {
				throw new Error('OpenRouter returned empty choices array');
			}

			const content = response.choices[0]?.message?.content;
			if (!content) {
				throw new Error('OpenRouter returned empty content');
			}

			// Parse the response
			let result: T;
			let cleaned = ''; // Declare outside try block for error logging

			try {
				// Clean and parse JSON
				cleaned = this.cleanJSONResponse(content);
				result = JSON.parse(cleaned) as T;
			} catch (parseError) {
				// Log which model actually responded
				const actualModel = response.model || preferredModels[0] || 'unknown';
				console.error(`JSON parse error with ${actualModel}:`, parseError);

				// Enhanced error logging with context
				if (parseError instanceof SyntaxError && parseError.message.includes('position')) {
					// Extract position from error message (e.g., "at position 1618")
					const posMatch = parseError.message.match(/position (\d+)/);
					if (posMatch && posMatch[1]) {
						const errorPos = parseInt(posMatch[1], 10);
						const contextStart = Math.max(0, errorPos - 100);
						const contextEnd = Math.min(cleaned.length, errorPos + 100);
						console.error(
							`Context around error position ${errorPos}:`,
							'\n' + cleaned.substring(contextStart, contextEnd)
						);
						console.error(
							`Full response length: ${cleaned.length} characters, Error at: ${errorPos}`
						);
					}
				}

				// If validation is enabled and parse failed, we can retry with a more powerful model
				if (options.validation?.retryOnParseError && retryCount < maxRetries) {
					retryCount++;
					console.log(
						`Retrying with powerful model (attempt ${retryCount}/${maxRetries})`
					);

					let cleanedRetry = ''; // Declare outside try block for error logging
					try {
						// Try again with powerful profile
						const retryResponse = await this.callOpenRouter({
							model: 'anthropic/claude-sonnet-4',
							models: ['anthropic/claude-sonnet-4', 'openai/gpt-4o'],
							messages: [
								{ role: 'system', content: enhancedSystemPrompt },
								{ role: 'user', content: options.userPrompt }
							],
							temperature: 0.1, // Lower temperature for retry
							response_format: { type: 'json_object' },
							max_tokens: 8192
						});

						// Guard against malformed retry response
						if (!retryResponse.choices || retryResponse.choices.length === 0) {
							throw new Error('Retry: OpenRouter returned empty choices array');
						}

						const retryContent = retryResponse.choices[0]?.message?.content;
						if (!retryContent) {
							throw new Error('Retry: OpenRouter returned empty content');
						}

						cleanedRetry = this.cleanJSONResponse(retryContent);
						result = JSON.parse(cleanedRetry) as T;
					} catch (retryError) {
						// If retry also fails, throw original error with context
						console.error(
							`Retry also failed after ${retryCount} attempts:`,
							retryError
						);
						// Log critical parse failure
						if (this.errorLogger) {
							await this.errorLogger.logAPIError(
								retryError,
								this.apiUrl,
								'POST',
								options.userId,
								{
									operation: 'getJSONResponse_retry_parse_failure',
									errorType: 'llm_json_parse_failure_after_retry',
									modelRequested: preferredModels[0] || 'openai/gpt-4o-mini',
									retryModel: 'anthropic/claude-sonnet-4',
									retryAttempt: retryCount,
									maxRetries,
									responseLength: cleanedRetry.length || 0
								}
							);
						}
						throw new Error(
							`Failed to parse JSON after ${retryCount} retries. Original error: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`
						);
					}
				} else {
					// Log parse failure without retry
					if (this.errorLogger) {
						await this.errorLogger.logAPIError(
							parseError,
							this.apiUrl,
							'POST',
							options.userId,
							{
								operation: 'getJSONResponse_parse_failure',
								errorType: 'llm_json_parse_failure',
								modelUsed: actualModel,
								responseLength: cleaned.length,
								retryDisabled: !options.validation?.retryOnParseError
							}
						);
					}
					throw parseError;
				}
			}

			// Track metrics
			const duration = performance.now() - startTime;
			const requestCompletedAt = new Date();
			const actualModel = response.model || preferredModels[0] || 'openai/gpt-4o-mini';
			this.trackPerformance(actualModel, duration);
			this.trackCost(actualModel, response.usage);

			// Calculate costs
			const modelConfig = JSON_MODELS[actualModel];
			const inputCost = modelConfig
				? ((response.usage?.prompt_tokens || 0) / 1_000_000) * modelConfig.cost
				: 0;
			const outputCost = modelConfig
				? ((response.usage?.completion_tokens || 0) / 1_000_000) * modelConfig.outputCost
				: 0;

			console.log(`JSON Response Success:
				Model: ${actualModel}
				Duration: ${duration.toFixed(0)}ms
				Tokens: ${response.usage?.total_tokens || 'unknown'}
				Cost: ${this.calculateCost(actualModel, response.usage)}
			`);

			// Log to database (async, non-blocking)
			const cachedTokens = response.usage?.prompt_tokens_details?.cached_tokens || 0;
			this.logUsageToDatabase({
				userId: options.userId,
				operationType: options.operationType || 'other',
				modelRequested: preferredModels[0] || 'openai/gpt-4o-mini',
				modelUsed: actualModel,
				provider: response.provider || modelConfig?.provider,
				promptTokens: response.usage?.prompt_tokens || 0,
				completionTokens: response.usage?.completion_tokens || 0,
				totalTokens: response.usage?.total_tokens || 0,
				inputCost,
				outputCost,
				totalCost: inputCost + outputCost,
				responseTimeMs: Math.round(duration),
				requestStartedAt,
				requestCompletedAt,
				status: 'success',
				temperature: options.temperature,
				maxTokens: 8192,
				profile,
				streaming: false,
				projectId: options.projectId,
				brainDumpId: options.brainDumpId,
				taskId: options.taskId,
				briefId: options.briefId,
				chatSessionId: options.chatSessionId,
				agentSessionId: options.agentSessionId,
				agentPlanId: options.agentPlanId,
				agentExecutionId: options.agentExecutionId,
				openrouterRequestId: response.id,
				openrouterCacheStatus: cachedTokens > 0 ? 'hit' : 'miss',
				metadata: {
					complexity,
					retryCount,
					preferredModels,
					cachedTokens,
					reasoningTokens:
						response.usage?.completion_tokens_details?.reasoning_tokens || 0,
					systemFingerprint: response.system_fingerprint
				}
			}).catch((err) => console.error('Failed to log usage:', err));

			return result;
		} catch (error) {
			lastError = error as Error;
			const duration = performance.now() - startTime;
			const requestCompletedAt = new Date();

			console.error(`OpenRouter request failed:`, error);

			// Log to error tracking system
			if (this.errorLogger) {
				await this.errorLogger.logAPIError(error, this.apiUrl, 'POST', options.userId, {
					operation: 'getJSONResponse',
					errorType: 'llm_api_request_failure',
					modelRequested: preferredModels[0] || 'openai/gpt-4o-mini',
					profile,
					complexity,
					isTimeout: lastError.message.includes('timeout'),
					projectId: options.projectId,
					brainDumpId: options.brainDumpId,
					taskId: options.taskId
				});
			}

			// Log failure to database
			this.logUsageToDatabase({
				userId: options.userId,
				operationType: options.operationType || 'other',
				modelRequested: preferredModels[0] || 'openai/gpt-4o-mini',
				modelUsed: preferredModels[0] || 'openai/gpt-4o-mini',
				promptTokens: 0,
				completionTokens: 0,
				totalTokens: 0,
				inputCost: 0,
				outputCost: 0,
				totalCost: 0,
				responseTimeMs: Math.round(duration),
				requestStartedAt,
				requestCompletedAt,
				status: lastError.message.includes('timeout') ? 'timeout' : 'failure',
				errorMessage: lastError.message,
				temperature: options.temperature,
				maxTokens: 8192,
				profile,
				streaming: false,
				projectId: options.projectId,
				brainDumpId: options.brainDumpId,
				taskId: options.taskId,
				briefId: options.briefId,
				chatSessionId: options.chatSessionId,
				agentSessionId: options.agentSessionId,
				agentPlanId: options.agentPlanId,
				agentExecutionId: options.agentExecutionId,
				metadata: {
					complexity,
					preferredModels
				}
			}).catch((err) => console.error('Failed to log error:', err));

			throw new Error(`Failed to generate valid JSON: ${lastError?.message}`);
		}
	}

	// ============================================
	// TEXT GENERATION METHOD
	// ============================================

	private async performTextGeneration(
		options: TextGenerationOptions
	): Promise<TextGenerationResult> {
		const requestStartedAt = new Date();
		const startTime = performance.now();
		const profile = options.profile || 'balanced';

		// Estimate response length
		const estimatedLength = this.estimateResponseLength(options.prompt);

		// Select models based on profile and requirements
		const preferredModels = this.selectTextModels(
			profile,
			estimatedLength,
			options.requirements
		);

		// Make the OpenRouter API call with model routing
		try {
			const response = await this.callOpenRouter({
				model: preferredModels[0] || 'openai/gpt-4o-mini', // Primary model with fallback
				models: preferredModels, // All models for fallback routing (via extra_body)
				messages: [
					{
						role: 'system',
						content:
							options.systemPrompt ||
							'You are an expert writer who creates clear, engaging, and well-structured content.'
					},
					{ role: 'user', content: options.prompt }
				],
				temperature: options.temperature || 0.7,
				max_tokens: options.maxTokens || 4096,
				timeoutMs: options.timeoutMs,
				stream: options.streaming || false
			});

			// Guard against malformed response
			if (!response.choices || response.choices.length === 0) {
				throw new Error('OpenRouter returned empty choices array');
			}

			const content = response.choices[0]?.message?.content;
			if (!content) {
				throw new Error('OpenRouter returned empty content');
			}

			const actualModel = response.model || preferredModels[0] || 'openai/gpt-4o-mini';

			// Track metrics
			const duration = performance.now() - startTime;
			const requestCompletedAt = new Date();
			this.trackPerformance(actualModel, duration);
			this.trackCost(actualModel, response.usage);

			// Calculate costs
			const modelConfig = TEXT_MODELS[actualModel];
			const inputCost = modelConfig
				? ((response.usage?.prompt_tokens || 0) / 1_000_000) * modelConfig.cost
				: 0;
			const outputCost = modelConfig
				? ((response.usage?.completion_tokens || 0) / 1_000_000) * modelConfig.outputCost
				: 0;

			console.log(`Text Generation Success:
				Model: ${actualModel}
				Duration: ${duration.toFixed(0)}ms
				Length: ${content.length} chars
				Cost: ${this.calculateCost(actualModel, response.usage)}
			`);

			// Log to database (async, non-blocking)
			const cachedTokens = response.usage?.prompt_tokens_details?.cached_tokens || 0;
			this.logUsageToDatabase({
				userId: options.userId,
				operationType: options.operationType || 'other',
				modelRequested: preferredModels[0] || 'openai/gpt-4o-mini',
				modelUsed: actualModel,
				provider: response.provider || modelConfig?.provider,
				promptTokens: response.usage?.prompt_tokens || 0,
				completionTokens: response.usage?.completion_tokens || 0,
				totalTokens: response.usage?.total_tokens || 0,
				inputCost,
				outputCost,
				totalCost: inputCost + outputCost,
				responseTimeMs: Math.round(duration),
				requestStartedAt,
				requestCompletedAt,
				status: 'success',
				temperature: options.temperature,
				maxTokens: options.maxTokens,
				profile,
				streaming: options.streaming,
				projectId: options.projectId,
				brainDumpId: options.brainDumpId,
				taskId: options.taskId,
				briefId: options.briefId,
				chatSessionId: options.chatSessionId,
				agentSessionId: options.agentSessionId,
				agentPlanId: options.agentPlanId,
				agentExecutionId: options.agentExecutionId,
				openrouterRequestId: response.id,
				openrouterCacheStatus: cachedTokens > 0 ? 'hit' : 'miss',
				metadata: {
					estimatedLength,
					preferredModels,
					contentLength: content.length,
					cachedTokens,
					reasoningTokens:
						response.usage?.completion_tokens_details?.reasoning_tokens || 0,
					systemFingerprint: response.system_fingerprint
				}
			}).catch((err) => console.error('Failed to log usage:', err));

			const usage: TextGenerationUsage | undefined = response.usage
				? {
						promptTokens: response.usage.prompt_tokens || 0,
						completionTokens: response.usage.completion_tokens || 0,
						totalTokens: response.usage.total_tokens || 0
					}
				: undefined;

			return {
				text: content,
				usage,
				model: actualModel
			};
		} catch (error) {
			const duration = performance.now() - startTime;
			const requestCompletedAt = new Date();

			console.error(`OpenRouter text generation failed:`, error);

			// Log to error tracking system
			if (this.errorLogger) {
				await this.errorLogger.logAPIError(error, this.apiUrl, 'POST', options.userId, {
					operation: 'generateText',
					errorType: 'llm_text_generation_failure',
					modelRequested: preferredModels[0] || 'openai/gpt-4o-mini',
					profile,
					estimatedLength,
					isTimeout: (error as Error).message.includes('timeout'),
					projectId: options.projectId,
					brainDumpId: options.brainDumpId,
					taskId: options.taskId
				});
			}

			// Log failure to database
			this.logUsageToDatabase({
				userId: options.userId,
				operationType: options.operationType || 'other',
				modelRequested: preferredModels[0] || 'openai/gpt-4o-mini',
				modelUsed: preferredModels[0] || 'openai/gpt-4o-mini',
				promptTokens: 0,
				completionTokens: 0,
				totalTokens: 0,
				inputCost: 0,
				outputCost: 0,
				totalCost: 0,
				responseTimeMs: Math.round(duration),
				requestStartedAt,
				requestCompletedAt,
				status: (error as Error).message.includes('timeout') ? 'timeout' : 'failure',
				errorMessage: (error as Error).message,
				temperature: options.temperature,
				maxTokens: options.maxTokens,
				profile,
				streaming: options.streaming,
				projectId: options.projectId,
				brainDumpId: options.brainDumpId,
				taskId: options.taskId,
				briefId: options.briefId,
				chatSessionId: options.chatSessionId,
				agentSessionId: options.agentSessionId,
				agentPlanId: options.agentPlanId,
				agentExecutionId: options.agentExecutionId,
				metadata: {
					estimatedLength,
					preferredModels
				}
			}).catch((err) => console.error('Failed to log error:', err));

			throw new Error('Failed to generate text');
		}
	}

	// ============================================
	// OPENROUTER API CALL WITH ROUTING
	// ============================================

	private async callOpenRouter(params: {
		model: string;
		models?: string[]; // Additional models for fallback (OpenRouter extension)
		messages: Array<{ role: string; content: string }>;
		temperature?: number;
		max_tokens?: number;
		timeoutMs?: number;
		response_format?: { type: string };
		stream?: boolean;
		route?: 'fallback'; // NOTE: Not used - kept for backwards compatibility
		provider?: any; // NOTE: Not used - kept for backwards compatibility
	}): Promise<OpenRouterResponse> {
		const headers = {
			Authorization: `Bearer ${this.apiKey}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': this.httpReferer,
			'X-Title': this.appName
		};

		// Build request body following OpenRouter API v1 spec
		// See: https://openrouter.ai/docs/api-reference/chat/send-chat-completion-request
		const body: any = {
			model: params.model,
			messages: params.messages,
			temperature: params.temperature,
			max_tokens: params.max_tokens,
			stream: params.stream || false
		};

		// Add response format if supported (e.g., json_object for compatible models)
		if (params.response_format) {
			body.response_format = params.response_format;
		}

		// Add fallback models using extra_body (OpenRouter convention)
		// The primary model is in 'model', fallbacks go in extra_body.models
		if (params.models && params.models.length > 1) {
			body.extra_body = {
				models: params.models.slice(1) // All models except the first (primary)
			};
		}

		try {
			const timeoutMs = params.timeoutMs ?? 120000;
			const response = await fetch(this.apiUrl, {
				method: 'POST',
				headers,
				body: JSON.stringify(body),
				signal: AbortSignal.timeout(timeoutMs)
			});

			if (!response.ok) {
				const error = await response.text();
				throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
			}

			const data = (await response.json()) as OpenRouterResponse;

			// Log OpenRouter routing result with all available metadata
			const cachedTokens = data.usage?.prompt_tokens_details?.cached_tokens || 0;
			const cacheHitRate = data.usage?.prompt_tokens
				? ((cachedTokens / data.usage.prompt_tokens) * 100).toFixed(1)
				: '0.0';

			console.debug('OpenRouter routing result:', {
				model: data.model || params.model,
				provider: data.provider || 'Unknown',
				cacheStatus:
					cachedTokens > 0
						? `${cacheHitRate}% cached (${cachedTokens} tokens)`
						: 'no cache',
				requestId: data.id,
				systemFingerprint: data.system_fingerprint,
				reasoningTokens: data.usage?.completion_tokens_details?.reasoning_tokens || 0
			});

			return data;
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') {
				if (this.errorLogger) {
					await this.errorLogger.logAPIError(error, this.apiUrl, 'POST', undefined, {
						operation: 'callOpenRouter_timeout',
						errorType: 'llm_api_timeout',
						modelRequested: params.model,
						alternativeModels: params.models?.join(', ') || 'none',
						timeoutMs: params.timeoutMs ?? 120000,
						temperature: params.temperature,
						maxTokens: params.max_tokens
					});
				}
				throw new Error(`Request timeout for model ${params.model}`);
			}
			throw error;
		}
	}

	// Overload signatures for compatibility with LLMService interface
	async generateText(params: {
		systemPrompt: string;
		prompt: string;
		temperature?: number;
		maxTokens?: number;
		timeoutMs?: number;
		userId?: string;
		operationType?: string;
		profile?: TextProfile; // Added profile parameter
	}): Promise<string>;
	async generateText(options: TextGenerationOptions): Promise<string>;
	async generateText(
		optionsOrParams:
			| TextGenerationOptions
			| {
					systemPrompt: string;
					prompt: string;
					temperature?: number;
					maxTokens?: number;
					timeoutMs?: number;
					userId?: string;
					operationType?: string;
					profile?: TextProfile; // Added profile parameter
			  }
	): Promise<string> {
		// Normalize parameters to TextGenerationOptions format
		const options: TextGenerationOptions =
			'systemPrompt' in optionsOrParams
				? {
						prompt: optionsOrParams.prompt,
						userId: optionsOrParams.userId,
						systemPrompt: optionsOrParams.systemPrompt,
						temperature: optionsOrParams.temperature,
						maxTokens: optionsOrParams.maxTokens,
						timeoutMs: optionsOrParams.timeoutMs,
						operationType: optionsOrParams.operationType,
						profile: optionsOrParams.profile // Pass through profile
					}
				: optionsOrParams;

		const result = await this.performTextGeneration(options);
		return result.text;
	}

	async generateTextDetailed(options: TextGenerationOptions): Promise<TextGenerationResult> {
		return this.performTextGeneration(options);
	}

	// ============================================
	// PROVIDER ROUTING PREFERENCES
	// ============================================
	// NOTE: These methods are deprecated as OpenRouter does not support
	// the provider parameter with order/allow_fallbacks/require_parameters/data_collection fields.
	// Kept for backwards compatibility but not used in API calls.
	// See: https://openrouter.ai/docs/api-reference/chat/send-chat-completion-request

	/**
	 * @deprecated OpenRouter API does not support provider routing preferences.
	 * This method is kept for backwards compatibility but is not used.
	 */
	private getProviderPreferences(
		profile: JSONProfile | TextProfile,
		options?: { requireToolSupport?: boolean }
	): any {
		const requireToolSupport = options?.requireToolSupport ?? false;

		// Provider routing configuration based on profile
		let baseConfig: any;

		switch (profile) {
			case 'fast':
			case 'speed':
				baseConfig = {
					order: ['x-ai', 'google', 'openai', 'groq', 'deepseek'],
					allow_fallbacks: true,
					data_collection: 'allow' // Allow for faster routing
					// Note: quantization field removed - not supported by OpenRouter API
				};
				break;

			case 'balanced':
				baseConfig = {
					order: ['openai', 'google', 'deepseek', 'x-ai', 'anthropic'],
					allow_fallbacks: true,
					require_parameters: true, // Require providers to support our parameters
					data_collection: 'deny' // Privacy focused
				};
				break;

			case 'powerful':
			case 'quality':
				baseConfig = {
					order: ['anthropic', 'openai', 'x-ai', 'google', 'deepseek'],
					allow_fallbacks: true,
					require_parameters: true,
					data_collection: 'deny'
					// Exclude certain providers for quality
					// exclude: ['groq', 'together']
				};
				break;

			case 'maximum':
			case 'creative':
				baseConfig = {
					order: ['anthropic', 'openai'],
					allow_fallbacks: false, // Only use premium providers
					require_parameters: true,
					data_collection: 'deny'
				};
				break;

			default:
				baseConfig = {
					allow_fallbacks: true,
					data_collection: 'deny'
				};
		}

		return requireToolSupport ? this.enforceToolSafeProviderPrefs(baseConfig) : baseConfig;
	}

	/**
	 * @deprecated OpenRouter API does not support provider routing preferences.
	 * This method is kept for backwards compatibility but is not used.
	 */
	private enforceToolSafeProviderPrefs(config: any): any {
		const enriched = { ...config };

		enriched.require_parameters = true;
		enriched.allow_fallbacks = enriched.allow_fallbacks ?? true;

		const priorityOrder = ['openai', 'deepseek', 'google', 'anthropic', 'x-ai'];
		const existingOrder: string[] = Array.isArray(enriched.order) ? enriched.order : [];

		const reordered = [
			...priorityOrder.filter((provider) => existingOrder.includes(provider)),
			...existingOrder.filter((provider) => !priorityOrder.includes(provider))
		];

		enriched.order = reordered.length > 0 ? reordered : priorityOrder;

		enriched.data_collection = enriched.data_collection ?? 'deny';

		return enriched;
	}

	private ensureToolCompatibleModels(models: string[]): string[] {
		const toolReadyModels = models.filter((model) => TOOL_CALLING_MODEL_SET.has(model));

		if (toolReadyModels.length > 0) {
			return toolReadyModels;
		}

		console.warn(
			'No tool-capable models found in preferred list. Falling back to default tool-calling models.',
			{ requestedModels: models }
		);

		// Use fallback order while keeping values unique
		return Array.from(
			new Set<string>([
				...models.filter((model) => TOOL_CALLING_MODEL_SET.has(model)),
				...TOOL_CALLING_MODEL_ORDER
			])
		);
	}

	// ============================================
	// HELPER METHODS
	// ============================================

	private analyzeComplexity(text: string): 'simple' | 'moderate' | 'complex' {
		const length = text.length;
		const hasNestedStructure = /\[\{|\{\[|":\s*\{|":\s*\[/.test(text);
		const hasComplexLogic = /if|when|decision|analyze|evaluate|extract/i.test(text);
		const hasMultipleSteps = /step \d|first.*then|phase|stage/i.test(text);

		if (length > 8000 || (hasNestedStructure && hasComplexLogic)) return 'complex';
		if (length > 3000 || hasComplexLogic || hasMultipleSteps) return 'moderate';
		return 'simple';
	}

	private selectJSONModels(
		profile: JSONProfile,
		complexity: string,
		requirements?: any
	): string[] {
		// If custom requirements, calculate best models
		if (profile === 'custom' && requirements) {
			return this.selectModelsByRequirements(JSON_MODELS, requirements, 'json');
		}

		// Validate profile and provide fallback
		const profileModels = JSON_PROFILE_MODELS[profile];
		if (!profileModels || !Array.isArray(profileModels)) {
			console.warn(`Invalid JSON profile: ${profile}, falling back to balanced`);
			return [...JSON_PROFILE_MODELS.balanced];
		}

		// Get base models for profile
		let models = [...profileModels];

		// Adjust based on complexity
		if (complexity === 'complex' && profile === 'fast') {
			// Upgrade to balanced for complex tasks
			models = [...JSON_PROFILE_MODELS.balanced];
		} else if (complexity === 'simple' && profile === 'powerful') {
			// Can use faster models for simple tasks
			models = ['deepseek/deepseek-chat', ...models];
		}

		return models;
	}

	private selectTextModels(
		profile: TextProfile,
		estimatedLength: number,
		requirements?: any
	): string[] {
		// If custom requirements, calculate best models
		if (profile === 'custom' && requirements) {
			return this.selectModelsByRequirements(TEXT_MODELS, requirements, 'text');
		}

		// Validate profile and provide fallback
		const profileModels = TEXT_PROFILE_MODELS[profile];
		if (!profileModels || !Array.isArray(profileModels)) {
			console.warn(`Invalid text profile: ${profile}, falling back to balanced`);
			return [...TEXT_PROFILE_MODELS.balanced];
		}

		// Get base models for profile
		let models = [...profileModels];

		// Adjust based on length
		if (estimatedLength > 3000 && profile === 'speed') {
			// Need more capable models for long content
			models = [...TEXT_PROFILE_MODELS.balanced];
		} else if (estimatedLength < 500 && profile === 'quality') {
			// Can use faster models for short content
			models = ['deepseek/deepseek-chat', ...models];
		}

		return models;
	}

	private selectModelsByRequirements(
		modelPool: Record<string, ModelProfile>,
		requirements: any,
		type: 'json' | 'text'
	): string[] {
		const models = Object.values(modelPool);

		// Filter by requirements
		let eligible = models.filter((model) => {
			if (requirements.maxCost && model.cost > requirements.maxCost) return false;
			if (requirements.minAccuracy && model.smartness < requirements.minAccuracy)
				return false;
			if (requirements.minQuality && model.smartness < requirements.minQuality) return false;
			return true;
		});

		// Calculate value score for each model
		const scored = eligible.map((model) => {
			let score: number;

			if (type === 'json') {
				// For JSON: prioritize accuracy and speed
				score = (model.smartness * 2 + model.speed) / model.cost;
			} else {
				// For text: balance all factors
				const creativity = model.creativity || model.smartness;
				score = (model.smartness + model.speed + creativity) / model.cost;
			}

			return { model, score };
		});

		// Sort by score and return top 3
		scored.sort((a, b) => b.score - a.score);
		return scored.slice(0, 3).map((s) => s.model.id);
	}

	private supportsJsonMode(modelId: string): boolean {
		// Models that support native JSON mode (response_format: { type: 'json_object' })
		// Updated 2025-12-23 with latest model support
		const jsonModeModels = [
			// OpenAI models - excellent JSON mode support
			'openai/gpt-4o',
			'openai/gpt-4o-mini',
			'openai/gpt-4.1-nano', // Native JSON schema support
			// DeepSeek models
			'deepseek/deepseek-chat',
			'deepseek/deepseek-r1',
			// Qwen models
			'qwen/qwen3-32b', // Excellent structured output
			// Google Gemini models
			'google/gemini-2.5-flash', // Hybrid reasoning with JSON support
			'google/gemini-2.5-flash-lite',
			'google/gemini-2.0-flash-001',
			// xAI Grok models
			'x-ai/grok-4-fast',
			'x-ai/grok-4-fast:free',
			'x-ai/grok-4.1-fast', // Tool-calling optimized
			'x-ai/grok-code-fast-1',
			// Other models
			'z-ai/glm-4.6', // Good structured output
			'minimax/minimax-m2.1' // Supports structured outputs
			// Note: Anthropic Claude models do NOT support native JSON mode
			// They require prompt-based JSON instructions
		];

		return jsonModeModels.includes(modelId);
	}

	private enhanceSystemPromptForJSON(originalPrompt: string): string {
		const jsonInstructions = `
You must respond with valid JSON only. Follow these rules:
1. Output ONLY valid JSON - no text before or after
2. Ensure all strings are properly escaped
3. Use null for missing values, not undefined
4. Numbers should not be quoted unless they're meant to be strings
5. Boolean values should be true/false (lowercase, not quoted)
6. CRITICAL: NO trailing commas after the last item in objects or arrays

`;
		return jsonInstructions + originalPrompt;
	}

	private cleanJSONResponse(raw: string): string {
		// Remove markdown code blocks if present
		let cleaned = raw.trim();
		if (cleaned.startsWith('```json')) {
			cleaned = cleaned.slice(7);
		}
		if (cleaned.startsWith('```')) {
			cleaned = cleaned.slice(3);
		}
		if (cleaned.endsWith('```')) {
			cleaned = cleaned.slice(0, -3);
		}

		// Remove any non-JSON prefix
		const jsonStart = cleaned.indexOf('{');
		if (jsonStart > 0) {
			cleaned = cleaned.slice(jsonStart);
		}

		// Remove any non-JSON suffix
		const jsonEnd = cleaned.lastIndexOf('}');
		if (jsonEnd > -1 && jsonEnd < cleaned.length - 1) {
			cleaned = cleaned.slice(0, jsonEnd + 1);
		}

		// Fix common LLM JSON errors
		// Remove trailing commas before closing braces/brackets (e.g., {key: "value",} -> {key: "value"})
		cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');

		return cleaned.trim();
	}

	private estimateResponseLength(prompt: string): number {
		// Simple heuristic based on prompt length
		const promptLength = prompt.length;

		if (promptLength < 200) return 500;
		if (promptLength < 1000) return 1500;
		if (promptLength < 5000) return 3000;
		return 5000;
	}

	private trackPerformance(model: string, duration: number): void {
		const history = this.performanceMetrics.get(model) || [];
		history.push(duration);

		// Keep last 20 measurements
		if (history.length > 20) {
			history.shift();
		}

		this.performanceMetrics.set(model, history);
	}

	private trackCost(model: string, usage?: any): void {
		if (!usage) return;

		const modelConfig = JSON_MODELS[model] || TEXT_MODELS[model];
		if (!modelConfig) return;

		const inputCost = ((usage.prompt_tokens || 0) / 1_000_000) * modelConfig.cost;
		const outputCost = ((usage.completion_tokens || 0) / 1_000_000) * modelConfig.outputCost;
		const totalCost = inputCost + outputCost;

		const current = this.costTracking.get(model) || 0;
		this.costTracking.set(model, current + totalCost);
	}

	private calculateCost(model: string, usage?: any): string {
		if (!usage) return 'N/A';

		const modelConfig = JSON_MODELS[model] || TEXT_MODELS[model];
		if (!modelConfig) return 'Unknown';

		const inputCost = ((usage.prompt_tokens || 0) / 1_000_000) * modelConfig.cost;
		const outputCost = ((usage.completion_tokens || 0) / 1_000_000) * modelConfig.outputCost;
		const totalCost = inputCost + outputCost;

		return `$${totalCost.toFixed(6)}`;
	}

	// ============================================
	// REPORTING METHODS
	// ============================================

	getPerformanceReport(): Map<
		string,
		{
			avg: number;
			min: number;
			max: number;
			count: number;
		}
	> {
		const report = new Map();

		this.performanceMetrics.forEach((history, model) => {
			if (history.length === 0) return;

			report.set(model, {
				avg: history.reduce((a, b) => a + b, 0) / history.length,
				min: Math.min(...history),
				max: Math.max(...history),
				count: history.length
			});
		});

		return report;
	}

	getCostReport(): { byModel: Map<string, number>; total: number } {
		let total = 0;
		this.costTracking.forEach((cost) => (total += cost));

		return {
			byModel: new Map(this.costTracking),
			total
		};
	}

	// ============================================
	// TRANSCRIPTION METHODS (OPENROUTER AUDIO INPUT)
	// ============================================

	private buildTranscriptionVocabulary(customTerms?: string): string {
		const baseVocabulary = 'BuildOS, brain dump, ontology, daily brief, phase, project context';
		return customTerms ? `${baseVocabulary}, ${customTerms}` : baseVocabulary;
	}

	private getAudioFormat(mimeType?: string, filename?: string): string {
		const cleaned = mimeType?.split(';')[0]?.trim().toLowerCase();
		const mapping: Record<string, string> = {
			'audio/webm': 'webm',
			'audio/ogg': 'ogg',
			'audio/wav': 'wav',
			'audio/mp4': 'm4a',
			'audio/mpeg': 'mp3',
			'audio/mp3': 'mp3',
			'audio/flac': 'flac',
			'audio/x-flac': 'flac',
			'audio/aac': 'm4a'
		};

		if (cleaned && mapping[cleaned]) {
			return mapping[cleaned];
		}

		if (filename && filename.includes('.')) {
			const ext = filename.split('.').pop()?.toLowerCase();
			if (ext) {
				return ext === 'mp4' ? 'm4a' : ext;
			}
		}

		return 'webm';
	}

	private async encodeAudioToBase64(audioFile: File): Promise<string> {
		const buffer = Buffer.from(await audioFile.arrayBuffer());
		return buffer.toString('base64');
	}

	private isRetryableTranscriptionError(error: any): boolean {
		if (error?.name === 'TranscriptionTimeoutError') {
			return true;
		}

		if (
			error?.code === 'ENOTFOUND' ||
			error?.code === 'ETIMEDOUT' ||
			error?.code === 'ECONNRESET'
		) {
			return true;
		}

		const status = error?.status;
		if (status === 429) return true;
		if (status && status >= 500 && status < 600) return true;

		return false;
	}

	private async sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	private async callOpenRouterAudio(params: {
		model: string;
		messages: Array<{
			role: string;
			content:
				| string
				| Array<
						| { type: 'text'; text: string }
						| { type: 'input_audio'; input_audio: { data: string; format: string } }
				  >;
		}>;
		temperature?: number;
		max_tokens?: number;
		timeoutMs: number;
	}): Promise<OpenRouterResponse> {
		const headers = {
			Authorization: `Bearer ${this.apiKey}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': this.httpReferer,
			'X-Title': this.appName
		};

		const body = {
			model: params.model,
			messages: params.messages,
			temperature: params.temperature,
			max_tokens: params.max_tokens,
			stream: false
		};

		try {
			const response = await fetch(this.apiUrl, {
				method: 'POST',
				headers,
				body: JSON.stringify(body),
				signal: AbortSignal.timeout(params.timeoutMs)
			});

			if (!response.ok) {
				const errorText = await response.text();
				const error = new Error(
					`OpenRouter API error: ${response.status} - ${errorText}`
				) as Error & { status?: number };
				error.status = response.status;
				throw error;
			}

			return (await response.json()) as OpenRouterResponse;
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') {
				const timeoutError = new Error(
					`Transcription request timed out after ${params.timeoutMs}ms`
				) as Error & { name: string };
				timeoutError.name = 'TranscriptionTimeoutError';
				throw timeoutError;
			}
			throw error;
		}
	}

	async transcribeAudio(options: TranscriptionOptions): Promise<TranscriptionResult> {
		const requestStartedAt = new Date();
		const startTime = performance.now();
		const timeoutMs = options.timeoutMs ?? 30000;
		const maxRetries = options.maxRetries ?? 2;
		const initialRetryDelayMs = options.initialRetryDelayMs ?? 1000;
		const models = (options.models || []).map((model) => model.trim()).filter(Boolean);

		if (!this.apiKey) {
			throw new Error('OpenRouter API key not configured');
		}
		if (models.length === 0) {
			throw new Error('OpenRouter transcription models not configured');
		}

		const vocabularyPrompt = this.buildTranscriptionVocabulary(options.vocabularyTerms);
		const audioFormat = this.getAudioFormat(options.audioFile.type, options.audioFile.name);
		const base64Audio = await this.encodeAudioToBase64(options.audioFile);

		const systemPrompt =
			'You are a transcription engine. Return only the transcript text. Do not add labels, timestamps, or commentary.';
		const userPrompt = `Transcribe the following audio. Use these vocabulary terms if they appear: ${vocabularyPrompt}.`;

		let lastError: Error | null = null;

		for (const model of models) {
			for (let attempt = 0; attempt <= maxRetries; attempt++) {
				try {
					if (attempt > 0) {
						const delay = initialRetryDelayMs * Math.pow(2, attempt - 1);
						await this.sleep(delay);
					}

					const response = await this.callOpenRouterAudio({
						model,
						messages: [
							{ role: 'system', content: systemPrompt },
							{
								role: 'user',
								content: [
									{ type: 'text', text: userPrompt },
									{
										type: 'input_audio',
										input_audio: {
											data: base64Audio,
											format: audioFormat
										}
									}
								]
							}
						],
						temperature: 0,
						max_tokens: 4096,
						timeoutMs
					});

					if (!response.choices || response.choices.length === 0) {
						throw new Error('OpenRouter returned empty choices array');
					}

					const content = response.choices[0]?.message?.content;
					if (!content) {
						throw new Error('OpenRouter returned empty content');
					}

					const transcript = content.trim();
					if (!transcript) {
						throw new Error('OpenRouter returned empty transcript');
					}

					return {
						text: transcript,
						durationMs: Math.round(performance.now() - startTime),
						audioDuration: null,
						model: response.model || model,
						service: 'openrouter',
						requestId: response.id
					};
				} catch (error) {
					lastError = error as Error;

					if (!this.isRetryableTranscriptionError(error) || attempt === maxRetries) {
						break;
					}
				}
			}
		}

		if (this.errorLogger) {
			await this.errorLogger.logAPIError(
				lastError || new Error('OpenRouter transcription failed'),
				this.apiUrl,
				'POST',
				options.userId,
				{
					operation: 'transcribeAudio',
					errorType: 'openrouter_transcription_failure',
					modelsTried: models.join(', '),
					timeoutMs,
					requestStartedAt: requestStartedAt.toISOString()
				}
			);
		}

		throw lastError || new Error('OpenRouter transcription failed');
	}

	// ============================================
	// EMBEDDING METHODS
	// ============================================

	/**
	 * Generate embeddings using OpenAI API
	 * Note: This requires a separate OpenAI API key as OpenRouter doesn't support embeddings
	 */
	async generateEmbedding(text: string, openAIApiKey: string): Promise<number[]> {
		const response = await fetch('https://api.openai.com/v1/embeddings', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${openAIApiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model: 'text-embedding-3-small',
				input: text
			})
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`OpenAI Embedding API error: ${response.status} - ${error}`);
		}

		const result = await response.json();
		return result.data[0].embedding;
	}

	/**
	 * Generate multiple embeddings using OpenAI API
	 */
	async generateEmbeddings(texts: string[], openAIApiKey: string): Promise<number[][]> {
		const response = await fetch('https://api.openai.com/v1/embeddings', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${openAIApiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model: 'text-embedding-3-small',
				input: texts
			})
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`OpenAI Embedding API error: ${response.status} - ${error}`);
		}

		const result = await response.json();
		return result.data.map((d: any) => d.embedding);
	}

	// ============================================
	// STATIC HELPER FOR QUICK PROFILE SELECTION
	// ============================================

	static selectProfile(context: {
		taskCount?: number;
		complexity?: 'simple' | 'moderate' | 'complex';
		priority?: 'speed' | 'quality' | 'cost';
		isProduction?: boolean;
	}): { json: JSONProfile; text: TextProfile } {
		const {
			taskCount = 5,
			complexity = 'moderate',
			priority = 'cost',
			isProduction = true
		} = context;

		// JSON profile selection
		let jsonProfile: JSONProfile = 'balanced';
		if (priority === 'speed' && complexity === 'simple') {
			jsonProfile = 'fast';
		} else if (priority === 'quality' || complexity === 'complex') {
			jsonProfile = isProduction ? 'powerful' : 'balanced';
		} else if (taskCount > 20) {
			jsonProfile = 'balanced'; // DeepSeek handles scale well
		}

		// Text profile selection
		let textProfile: TextProfile = 'balanced';
		if (priority === 'speed') {
			textProfile = 'speed';
		} else if (priority === 'quality') {
			textProfile = isProduction ? 'quality' : 'balanced';
		}

		return { json: jsonProfile, text: textProfile };
	}

	// ============================================
	// STREAMING TEXT METHOD FOR CHAT
	// ============================================

	/**
	 * Stream text responses for chat system with tool support
	 * Returns an async generator for real-time streaming
	 */
	async *streamText(options: {
		messages: Array<{
			role: string;
			content: string;
			tool_calls?: any[];
			tool_call_id?: string;
		}>;
		tools?: any[];
		tool_choice?: 'auto' | 'none' | 'required';
		userId: string;
		profile?: TextProfile;
		temperature?: number;
		maxTokens?: number;
		sessionId?: string;
		messageId?: string;
		chatSessionId?: string;
		agentSessionId?: string;
		agentPlanId?: string;
		agentExecutionId?: string;
		signal?: AbortSignal;
		// Context tracking for usage logging
		contextType?: string; // e.g., 'project', 'general', 'project_create', 'ontology'
		entityId?: string; // Optional entity ID for additional tracking
		projectId?: string; // Optional project ID for additional tracking
	}): AsyncGenerator<{
		type: 'text' | 'tool_call' | 'done' | 'error';
		content?: string;
		tool_call?: any;
		usage?: any;
		error?: string;
		finished_reason?: string;
	}> {
		const requestStartedAt = new Date();
		const startTime = performance.now();
		const profile = options.profile || 'speed'; // Default to speed for chat

		const needsToolSupport = Array.isArray(options.tools) && options.tools.length > 0;

		// Estimate total input length from all messages
		const totalInputLength = options.messages.reduce(
			(sum, msg) => sum + (msg.content?.length || 0),
			0
		);
		const estimatedLength = this.estimateResponseLength(
			totalInputLength > 0 ? 'x'.repeat(totalInputLength) : 'default chat message'
		);

		// Select models optimized for chat streaming
		let preferredModels = this.selectTextModels(
			profile,
			estimatedLength,
			{ maxLatency: 2000 } // Fast response for chat
		);

		if (needsToolSupport) {
			preferredModels = this.ensureToolCompatibleModels(preferredModels);
		}
		let resolvedModel = preferredModels[0] || 'openai/gpt-4o-mini';
		let modelResolvedFromStream = false;
		let resolvedProvider = TEXT_MODELS[resolvedModel]?.provider;
		let providerResolvedFromStream = false;

		try {
			// Build request with streaming enabled following OpenRouter API v1 spec
			const headers = {
				Authorization: `Bearer ${this.apiKey}`,
				'Content-Type': 'application/json',
				'HTTP-Referer': this.httpReferer,
				'X-Title': this.appName
			};

			const body: any = {
				model: preferredModels[0],
				messages: options.messages,
				temperature: options.temperature ?? 0.7,
				max_tokens: options.maxTokens ?? 2000,
				stream: true
			};

			// Add fallback models using extra_body if we have multiple models
			if (preferredModels.length > 1) {
				body.extra_body = {
					models: preferredModels.slice(1)
				};
			}

			// Add tools if provided
			if (needsToolSupport) {
				body.tools = options.tools;
				body.tool_choice = options.tool_choice || 'auto';
			}

			// Make streaming request
			const response = await fetch(this.apiUrl, {
				method: 'POST',
				headers,
				body: JSON.stringify(body),
				signal: options.signal
			});

			if (!response.ok) {
				const error = await response.text();
				yield {
					type: 'error',
					error: `OpenRouter API error: ${response.status} - ${error}`
				};
				return;
			}

			// Process SSE stream
			const reader = response.body?.getReader();
			if (!reader) {
				yield {
					type: 'error',
					error: 'No response stream available'
				};
				return;
			}

			const decoder = new TextDecoder();
			let buffer = '';
			let accumulatedContent = '';
			let currentToolCall: any = null;
			let usage: any = null;
			let inThinkingBlock = false;

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					if (!line.trim() || !line.startsWith('data: ')) continue;

					const data = line.slice(6); // Remove 'data: ' prefix
					if (data === '[DONE]') {
						// Stream completed
						const duration = performance.now() - startTime;
						const requestCompletedAt = new Date();

						// Yield any pending tool call that wasn't completed
						// This can happen if the stream ends without a finish_reason
						if (currentToolCall && currentToolCall.function.name) {
							// Try to parse incomplete arguments as valid JSON, or use empty object
							if (!this.isCompleteJSON(currentToolCall.function.arguments)) {
								// Try to fix common incomplete JSON patterns
								let fixedArgs = currentToolCall.function.arguments;
								if (fixedArgs && !fixedArgs.endsWith('}')) {
									// Attempt to close incomplete JSON
									fixedArgs = fixedArgs.replace(/,\s*$/, '') + '}';
								}
								if (this.isCompleteJSON(fixedArgs)) {
									currentToolCall.function.arguments = fixedArgs;
								} else {
									// Fall back to empty object if we can't fix it
									console.warn(
										'Tool call arguments incomplete at stream end:',
										currentToolCall.function.arguments
									);
									currentToolCall.function.arguments = '{}';
								}
							}
							yield {
								type: 'tool_call',
								tool_call: currentToolCall
							};
							currentToolCall = null;
						}

						// Log usage if available
						if (usage) {
							const actualModel =
								resolvedModel || preferredModels[0] || 'openai/gpt-4o-mini';
							const modelConfig = TEXT_MODELS[actualModel];
							const inputCost = modelConfig
								? ((usage.prompt_tokens || 0) / 1_000_000) * modelConfig.cost
								: 0;
							const outputCost = modelConfig
								? ((usage.completion_tokens || 0) / 1_000_000) *
									modelConfig.outputCost
								: 0;
							const provider = modelConfig?.provider ?? resolvedProvider;

							// Log to database (async, non-blocking)
							// Build operation type with context: chat_stream_${contextType}
							const operationType = this.buildChatStreamOperationType(
								options.contextType
							);

							this.logUsageToDatabase({
								userId: options.userId,
								operationType,
								modelRequested: preferredModels[0] || 'openai/gpt-4o-mini',
								modelUsed: actualModel,
								provider,
								promptTokens: usage.prompt_tokens || 0,
								completionTokens: usage.completion_tokens || 0,
								totalTokens: usage.total_tokens || 0,
								inputCost,
								outputCost,
								totalCost: inputCost + outputCost,
								responseTimeMs: Math.round(duration),
								requestStartedAt,
								requestCompletedAt,
								status: 'success',
								temperature: options.temperature,
								maxTokens: options.maxTokens,
								profile,
								streaming: true,
								projectId: options.projectId,
								chatSessionId: options.chatSessionId || options.sessionId,
								agentSessionId: options.agentSessionId,
								agentPlanId: options.agentPlanId,
								agentExecutionId: options.agentExecutionId,
								metadata: {
									sessionId: options.sessionId,
									messageId: options.messageId,
									hasTools: !!options.tools,
									contextType: options.contextType,
									entityId: options.entityId,
									modelResolvedFromStream,
									providerResolvedFromStream
								}
							}).catch((err) => console.error('Failed to log usage:', err));
						}

						yield {
							type: 'done',
							usage,
							finished_reason: 'stop'
						};
						break;
					}

					try {
						const chunk = JSON.parse(data);

						if (typeof chunk?.model === 'string' && chunk.model.trim().length > 0) {
							resolvedModel = chunk.model;
							modelResolvedFromStream = true;
							if (!providerResolvedFromStream) {
								resolvedProvider = TEXT_MODELS[resolvedModel]?.provider;
							}
						}
						if (
							typeof chunk?.provider === 'string' &&
							chunk.provider.trim().length > 0
						) {
							resolvedProvider = chunk.provider;
							providerResolvedFromStream = true;
						}

						// Handle different chunk types
						if (chunk.choices && chunk.choices[0]) {
							const choice = chunk.choices[0];
							const delta = choice.delta;

							if (delta.content) {
								const {
									text: filteredContent,
									inThinkingBlock: nextThinkingState
								} = this.normalizeStreamingContent(delta.content, inThinkingBlock);

								inThinkingBlock = nextThinkingState;

								if (filteredContent) {
									accumulatedContent += filteredContent;
									yield {
										type: 'text',
										content: filteredContent
									};
								}
							}

							if (delta.tool_calls && delta.tool_calls[0]) {
								// Tool call
								const toolCallDelta = delta.tool_calls[0];

								if (!currentToolCall) {
									currentToolCall = {
										id: toolCallDelta.id,
										type: 'function',
										function: {
											name: toolCallDelta.function?.name || '',
											arguments: ''
										}
									};
								}

								if (toolCallDelta.function?.arguments) {
									currentToolCall.function.arguments +=
										toolCallDelta.function.arguments;
								}

								// Check if tool call is complete
								if (
									choice.finish_reason === 'tool_calls' ||
									(currentToolCall.function.name &&
										currentToolCall.function.arguments &&
										this.isCompleteJSON(currentToolCall.function.arguments))
								) {
									yield {
										type: 'tool_call',
										tool_call: currentToolCall
									};
									currentToolCall = null;
								}
							}

							// Track usage
							if (chunk.usage) {
								usage = chunk.usage;
							}
						}
					} catch (parseError) {
						console.error('Failed to parse SSE chunk:', parseError);
						// Continue processing other chunks
					}
				}
			}
		} catch (error) {
			if (this.isAbortError(error)) {
				return;
			}

			const duration = performance.now() - startTime;
			const requestCompletedAt = new Date();

			console.error('Streaming failed:', error);

			// Log error
			if (this.errorLogger) {
				await this.errorLogger.logAPIError(error, this.apiUrl, 'POST', options.userId, {
					operation: 'streamText',
					errorType: 'llm_streaming_failure',
					sessionId: options.sessionId,
					messageId: options.messageId
				});
			}

			// Log failure with context-aware operation type
			const operationType = this.buildChatStreamOperationType(options.contextType);

			this.logUsageToDatabase({
				userId: options.userId,
				operationType,
				modelRequested: preferredModels[0] || 'openai/gpt-4o-mini',
				modelUsed: resolvedModel || preferredModels[0] || 'openai/gpt-4o-mini',
				promptTokens: 0,
				completionTokens: 0,
				totalTokens: 0,
				inputCost: 0,
				outputCost: 0,
				totalCost: 0,
				responseTimeMs: Math.round(duration),
				requestStartedAt,
				requestCompletedAt,
				status: 'failure',
				errorMessage: (error as Error).message,
				temperature: options.temperature,
				maxTokens: options.maxTokens,
				profile,
				streaming: true,
				projectId: options.projectId || options.entityId,
				chatSessionId: options.chatSessionId || options.sessionId,
				agentSessionId: options.agentSessionId,
				agentPlanId: options.agentPlanId,
				agentExecutionId: options.agentExecutionId,
				metadata: {
					sessionId: options.sessionId,
					messageId: options.messageId,
					contextType: options.contextType,
					entityId: options.entityId,
					modelResolvedFromStream,
					providerResolvedFromStream
				}
			}).catch((err) => console.error('Failed to log error:', err));

			yield {
				type: 'error',
				error: `Stream failed: ${(error as Error).message}`
			};
		}
	}

	private normalizeStreamingContent(
		content: unknown,
		inThinkingBlock: boolean
	): { text: string; inThinkingBlock: boolean } {
		const textParts: string[] = [];

		const pushText = (value?: string) => {
			if (value) {
				textParts.push(value);
			}
		};

		const handleContentPart = (part: any) => {
			if (!part) return;

			if (typeof part === 'string') {
				pushText(part);
				return;
			}

			if (typeof part === 'object') {
				const type = typeof part.type === 'string' ? part.type.toLowerCase() : '';
				if (type && ['reasoning', 'analysis', 'thinking', 'system'].includes(type)) {
					return;
				}

				if (typeof part.text === 'string') {
					pushText(part.text);
				} else if (part.text && typeof part.text.value === 'string') {
					pushText(part.text.value);
				} else if (typeof part.value === 'string') {
					pushText(part.value);
				}
			}
		};

		if (Array.isArray(content)) {
			content.forEach(handleContentPart);
		} else if (typeof content === 'string') {
			pushText(content);
		} else if (typeof content === 'object' && content !== null) {
			handleContentPart(content);
		}

		if (textParts.length === 0) {
			return { text: '', inThinkingBlock };
		}

		let combined = textParts.join('');

		// Strip invisible padding and normalize whitespace without collapsing intentional spacing
		combined = combined.replace(/[\u3164\u200B\uFEFF]/g, '');
		combined = combined.replace(/\u00A0/g, ' ');
		combined = combined.replace(/\r\n?/g, '\n');

		const { text, inThinkingBlock: thinkingState } = this.filterThinkingTokens(
			combined,
			inThinkingBlock
		);

		const trimmed = text.trim();
		// Skip obvious filler punctuation bursts often used for "thinking" animations
		if (trimmed && /^[.,;·•…]+$/.test(trimmed) && trimmed.length >= 6) {
			return { text: '', inThinkingBlock: thinkingState };
		}

		return { text, inThinkingBlock: thinkingState };
	}

	private filterThinkingTokens(
		text: string,
		inThinkingBlock: boolean
	): { text: string; inThinkingBlock: boolean } {
		let output = text;
		let thinking = inThinkingBlock;

		const startRegex = /<\s*(think|thinking|analysis|reasoning)\s*>/i;
		const endRegex = /<\s*\/\s*(think|thinking|analysis|reasoning)\s*>/i;

		// If already inside a thinking block, drop content until a closing tag appears
		if (thinking) {
			const endMatch = output.match(endRegex);
			if (endMatch?.index !== undefined) {
				output = output.slice(endMatch.index + endMatch[0].length);
				thinking = false;
			} else {
				return { text: '', inThinkingBlock: true };
			}
		}

		// Remove any complete thinking blocks inside this chunk
		while (true) {
			const startMatch = output.match(startRegex);
			if (!startMatch || startMatch.index === undefined) break;

			const afterStart = output.slice(startMatch.index + startMatch[0].length);
			const endMatch = afterStart.match(endRegex);

			if (endMatch?.index !== undefined) {
				output =
					output.slice(0, startMatch.index) +
					afterStart.slice(endMatch.index + endMatch[0].length);
			} else {
				// Start marker without an end - drop trailing content and keep state
				output = output.slice(0, startMatch.index);
				thinking = true;
				break;
			}
		}

		// Remove bracket-based markers that can leak thinking output
		output = output.replace(/【\s*(thinking|reasoning|analysis)\s*】/gi, '');

		return { text: output, inThinkingBlock: thinking };
	}

	private isAbortError(error: unknown): boolean {
		if (!error || typeof error !== 'object') {
			return false;
		}
		const maybeError = error as { name?: string; message?: string };
		return (
			maybeError.name === 'AbortError' ||
			(typeof maybeError.message === 'string' &&
				maybeError.message.toLowerCase().includes('aborted'))
		);
	}

	/**
	 * Check if a string is complete valid JSON
	 */
	private isCompleteJSON(str: string): boolean {
		try {
			JSON.parse(str);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Build the operation type string for chat streaming based on context
	 *
	 * Format: chat_stream_${contextType}
	 * Examples:
	 *   - chat_stream_general
	 *   - chat_stream_project
	 *   - chat_stream_project_create
	 *   - chat_stream_project_task
	 *   - chat_stream_global
	 */
	private buildChatStreamOperationType(contextType?: string): string {
		if (!contextType) {
			return 'chat_stream';
		}

		// Normalize context type to lowercase and replace any invalid characters
		const normalizedContext = contextType.toLowerCase().replace(/[^a-z0-9_]/g, '_');

		return `chat_stream_${normalizedContext}`;
	}
}
