// apps/worker/src/lib/services/smart-llm-service.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';

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

export interface JSONRequestOptions<T> {
	systemPrompt: string;
	userPrompt: string;
	userId: string;
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
}

export interface TextGenerationOptions {
	prompt: string;
	userId: string;
	profile?: TextProfile;
	systemPrompt?: string;
	temperature?: number;
	maxTokens?: number;
	streaming?: boolean;
	requirements?: {
		maxLatency?: number;
		minQuality?: number;
		maxCost?: number;
	};
}

interface OpenRouterResponse {
	id: string;
	choices: Array<{
		message: {
			content: string;
			role: string;
		};
		finish_reason: string;
	}>;
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
	model: string;
}

// ============================================
// MODEL CONFIGURATIONS
// Updated 2026-01-01 - Synced with web SmartLLMService
// ============================================

const JSON_MODELS: Record<string, ModelProfile> = {
	// ============================================
	// Free tier - Use for non-critical operations
	// ============================================
	'x-ai/grok-4-fast:free': {
		id: 'x-ai/grok-4-fast:free',
		name: 'Grok 4 Fast (Free)',
		speed: 4.5,
		smartness: 4.2,
		cost: 0,
		outputCost: 0,
		provider: 'x-ai',
		bestFor: ['quick-tasks', 'non-critical', 'testing'],
		limitations: ['rate-limited', 'may-have-delays']
	},

	// ============================================
	// Ultra-fast tier (<1s) - Best for simple tasks
	// ============================================
	'openai/gpt-4.1-nano': {
		id: 'openai/gpt-4.1-nano',
		name: 'GPT-4.1 Nano',
		speed: 5,
		smartness: 3.8,
		cost: 0.1,
		outputCost: 0.4,
		provider: 'openai',
		bestFor: ['ultra-fast', 'simple-json', 'quick-decisions'],
		limitations: ['limited-reasoning']
	},
	'google/gemini-2.5-flash-lite': {
		id: 'google/gemini-2.5-flash-lite',
		name: 'Gemini 2.5 Flash Lite',
		speed: 5,
		smartness: 3.5,
		cost: 0.07,
		outputCost: 0.3,
		provider: 'google',
		bestFor: ['ultra-fast', 'simple-classification', 'quick-extraction']
	},

	// ============================================
	// Fast tier (1-2s) - Good balance of speed/quality
	// ============================================
	'deepseek/deepseek-chat': {
		id: 'deepseek/deepseek-chat',
		name: 'DeepSeek Chat V3',
		speed: 3.5,
		smartness: 4.5,
		cost: 0.27,
		outputCost: 1.1,
		provider: 'deepseek',
		bestFor: ['complex-json', 'instruction-following', 'nested-structures', 'coding']
	},
	'anthropic/claude-haiku-4.5': {
		id: 'anthropic/claude-haiku-4.5',
		name: 'Claude Haiku 4.5',
		speed: 4,
		smartness: 4.0,
		cost: 1.0,
		outputCost: 5.0,
		provider: 'anthropic',
		bestFor: ['fast-analysis', 'tool-calling', 'extended-thinking', 'parallel-tools']
	},
	'openai/gpt-4o-mini': {
		id: 'openai/gpt-4o-mini',
		name: 'GPT-4o Mini',
		speed: 4,
		smartness: 4.0,
		cost: 0.15,
		outputCost: 0.6,
		provider: 'openai',
		bestFor: ['reliable-json', 'general-purpose', 'cost-effective']
	},
	'google/gemini-2.5-flash': {
		id: 'google/gemini-2.5-flash',
		name: 'Gemini 2.5 Flash',
		speed: 3.5,
		smartness: 4.2,
		cost: 0.15,
		outputCost: 0.6,
		provider: 'google',
		bestFor: ['hybrid-reasoning', 'large-context', 'mixed-content']
	},

	// ============================================
	// Value tier (2-3s) - Best quality per dollar
	// ============================================
	'x-ai/grok-4.1-fast': {
		id: 'x-ai/grok-4.1-fast',
		name: 'Grok 4.1 Fast',
		speed: 4.5,
		smartness: 4.5,
		cost: 0.3,
		outputCost: 1.0,
		provider: 'x-ai',
		bestFor: ['tool-calling', 'agentic-workflows', '2M-context']
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
		bestFor: ['agentic-workflows', 'tool-calling', 'coding', 'terminal-tasks']
	},
	'qwen/qwen3-32b': {
		id: 'qwen/qwen3-32b',
		name: 'Qwen 3 32B',
		speed: 3.5,
		smartness: 4.5,
		cost: 0.3,
		outputCost: 0.6,
		provider: 'qwen',
		bestFor: ['multilingual', 'coding', 'tool-calling', 'creative-writing']
	},

	// ============================================
	// Quality tier (3-5s) - High quality
	// ============================================
	'anthropic/claude-sonnet-4': {
		id: 'anthropic/claude-sonnet-4',
		name: 'Claude Sonnet 4',
		speed: 2.5,
		smartness: 4.8,
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
		cost: 2.5,
		outputCost: 10.0,
		provider: 'openai',
		bestFor: ['general-purpose', 'reliable-fallback', 'multimodal']
	}
};

const TEXT_MODELS: Record<string, ModelProfile> = {
	// ============================================
	// Ultra-fast tier (<1s) - Best for simple tasks
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
		bestFor: ['ultra-fast', 'short-responses', 'quick-summaries']
	},
	'google/gemini-2.5-flash-lite': {
		id: 'google/gemini-2.5-flash-lite',
		name: 'Gemini 2.5 Flash Lite',
		speed: 5,
		smartness: 3.5,
		creativity: 3,
		cost: 0.07,
		outputCost: 0.3,
		provider: 'google',
		bestFor: ['ultra-fast', 'simple-generation', 'quick-responses']
	},

	// ============================================
	// Fast tier (1-2s) - Good balance
	// ============================================
	'anthropic/claude-haiku-4.5': {
		id: 'anthropic/claude-haiku-4.5',
		name: 'Claude Haiku 4.5',
		speed: 4,
		smartness: 4.0,
		creativity: 3.8,
		cost: 1.0,
		outputCost: 5.0,
		provider: 'anthropic',
		bestFor: ['fast-writing', 'explanations', 'extended-thinking']
	},
	'openai/gpt-4o-mini': {
		id: 'openai/gpt-4o-mini',
		name: 'GPT-4o Mini',
		speed: 4,
		smartness: 4.0,
		creativity: 3.8,
		cost: 0.15,
		outputCost: 0.6,
		provider: 'openai',
		bestFor: ['general-writing', 'reliable', 'cost-effective']
	},

	// ============================================
	// Value tier (2-3s) - Best quality per dollar
	// ============================================
	'deepseek/deepseek-chat': {
		id: 'deepseek/deepseek-chat',
		name: 'DeepSeek Chat V3',
		speed: 3.5,
		smartness: 4.5,
		creativity: 4.3,
		cost: 0.27,
		outputCost: 1.1,
		provider: 'deepseek',
		bestFor: ['briefs', 'reports', 'structured-content', 'coding']
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
		bestFor: ['general-purpose', 'long-content', '2M-context']
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
		bestFor: ['agentic-workflows', 'coding', 'technical-docs']
	},
	'google/gemini-2.5-flash': {
		id: 'google/gemini-2.5-flash',
		name: 'Gemini 2.5 Flash',
		speed: 3.5,
		smartness: 4.2,
		creativity: 4.0,
		cost: 0.15,
		outputCost: 0.6,
		provider: 'google',
		bestFor: ['hybrid-reasoning', 'long-content', 'analysis']
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
		bestFor: ['multilingual', 'coding', 'creative-writing']
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
		bestFor: ['high-quality-writing', 'complex-content', 'nuanced-text']
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
		bestFor: ['reasoning', 'analysis', 'technical-writing', 'complex-content']
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

// ============================================
// PROFILE MAPPINGS
// Updated 2026-01-01 - Optimized for cost-effectiveness and reliability
// ============================================

const JSON_PROFILE_MODELS: Record<JSONProfile, string[]> = {
	fast: [
		'openai/gpt-4.1-nano', // Fastest (speed:5) + native JSON schema
		'google/gemini-2.5-flash-lite', // Ultra-low cost
		'deepseek/deepseek-chat', // Native JSON mode + good value
		'anthropic/claude-haiku-4.5', // Fast + parallel tool calls
		'openai/gpt-4o-mini' // Reliable fallback with JSON mode
	],
	balanced: [
		'deepseek/deepseek-chat', // Best value + native JSON
		'x-ai/grok-4.1-fast', // Best tool-calling: 93% τ²-Bench
		'anthropic/claude-haiku-4.5', // Excellent tool calling, extended thinking
		'google/gemini-2.5-flash', // Hybrid reasoning model
		'openai/gpt-4o-mini' // Reliable fallback
	],
	powerful: [
		'deepseek/deepseek-r1', // Native JSON + highest smartness (4.9)
		'x-ai/grok-4.1-fast', // Best tool-calling
		'minimax/minimax-m2.1', // Best agentic: 77.2% τ²-Bench
		'openai/gpt-4o' // Strong general purpose + native JSON
	],
	maximum: [
		'deepseek/deepseek-r1', // Native JSON + highest smartness (4.9)
		'anthropic/claude-sonnet-4', // Strong tool calling fallback
		'minimax/minimax-m2.1', // Excellent agentic capabilities
		'openai/gpt-4o' // Reliable fallback with native JSON
	],
	custom: [] // Will be determined by requirements
};

const TEXT_PROFILE_MODELS: Record<TextProfile, string[]> = {
	speed: [
		'openai/gpt-4.1-nano', // Fastest (speed:5), 1M context
		'google/gemini-2.5-flash-lite', // Very fast + cheapest
		'anthropic/claude-haiku-4.5', // Fast with extended thinking
		'openai/gpt-4o-mini' // Reliable fallback
	],
	balanced: [
		'x-ai/grok-4.1-fast', // Best tool-calling, 2M context
		'deepseek/deepseek-chat', // Best value, smartness 4.5
		'anthropic/claude-haiku-4.5', // Good for agents, extended thinking
		'minimax/minimax-m2.1', // Strong agentic capabilities
		'google/gemini-2.5-flash', // Hybrid reasoning
		'openai/gpt-4o-mini' // Reliable fallback
	],
	quality: [
		'x-ai/grok-4.1-fast', // Best tool-calling, speed 4.5, smartness 4.5
		'anthropic/claude-haiku-4.5', // Excellent tool-calling, extended thinking
		'deepseek/deepseek-r1', // Highest reasoning (4.9), excellent for technical
		'minimax/minimax-m2.1', // 61 Intelligence Index, excellent coding
		'openai/gpt-4o' // Reliable fallback
	],
	creative: [
		'anthropic/claude-sonnet-4.5', // Best creative: highest creativity (4.7)
		'anthropic/claude-sonnet-4', // Strong creative: creativity 4.6
		'openai/gpt-4o', // Good creative: creativity 4.5
		'deepseek/deepseek-r1' // Good for creative reasoning
	],
	custom: []
};

// ============================================
// MAIN SERVICE CLASS
// ============================================

export class SmartLLMService {
	private apiKey: string;
	private apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
	private costTracking = new Map<string, number>();
	private performanceMetrics = new Map<string, number[]>();

	// Optional: For logging and metrics
	private supabase?: SupabaseClient<Database>;
	private userId?: string;

	// Configuration
	private httpReferer: string;
	private appName: string;

	constructor(config?: {
		httpReferer?: string;
		appName?: string;
		supabase?: SupabaseClient<Database>;
		apiKey?: string;
	}) {
		this.httpReferer = config?.httpReferer || 'https://yourdomain.com';
		this.appName = config?.appName || 'SmartLLMService';
		this.supabase = config?.supabase;
		this.apiKey = config?.apiKey || process.env.PRIVATE_OPENROUTER_API_KEY || '';

		if (!this.apiKey) {
			throw new Error('Missing PRIVATE_OPENROUTER_API_KEY for SmartLLMService');
		}
	}

	// ============================================
	// JSON RESPONSE METHOD
	// ============================================

	async getJSONResponse<T = any>(options: JSONRequestOptions<T>): Promise<T> {
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

		// Get provider preferences based on profile
		const providerPrefs = this.getProviderPreferences(profile);

		// Make the OpenRouter API call with model routing
		// We send all preferred models at once and let OpenRouter handle routing
		try {
			const response = await this.callOpenRouter({
				model: preferredModels[0], // Primary model
				models: preferredModels, // All models for fallback routing
				messages: [
					{ role: 'system', content: enhancedSystemPrompt },
					{ role: 'user', content: options.userPrompt }
				],
				temperature: options.temperature || 0.2,
				response_format: this.supportsJsonMode(preferredModels[0])
					? { type: 'json_object' }
					: undefined,
				max_tokens: 8192,
				route: 'fallback', // Use fallback routing strategy
				provider: providerPrefs
			});

			// Parse the response
			let result: T;
			const content = response.choices[0].message.content;

			try {
				// Clean and parse JSON
				const cleaned = this.cleanJSONResponse(content);
				result = JSON.parse(cleaned) as T;
			} catch (parseError) {
				// Log which model actually responded
				const actualModel = response.model || preferredModels[0];
				console.error(`JSON parse error with ${actualModel}:`, parseError);

				// If validation is enabled and parse failed, we can retry with a more powerful model
				if (options.validation?.retryOnParseError && retryCount < maxRetries) {
					retryCount++;
					// Try again with powerful profile
					const retryResponse = await this.callOpenRouter({
						model: 'deepseek/deepseek-chat',
						models: [
							'deepseek/deepseek-chat',
							'qwen/qwen-2.5-72b-instruct',
							'openai/gpt-4o'
						],
						messages: [
							{ role: 'system', content: enhancedSystemPrompt },
							{ role: 'user', content: options.userPrompt }
						],
						temperature: 0.1, // Lower temperature for retry
						response_format: { type: 'json_object' },
						max_tokens: 8192,
						route: 'fallback'
					});

					const retryContent = retryResponse.choices[0].message.content;
					const cleanedRetry = this.cleanJSONResponse(retryContent);
					result = JSON.parse(cleanedRetry) as T;
				} else {
					throw parseError;
				}
			}

			// Track metrics
			const duration = performance.now() - startTime;
			const actualModel = response.model || preferredModels[0];
			this.trackPerformance(actualModel, duration);
			this.trackCost(actualModel, response.usage);

			console.log(`JSON Response Success:
				Model: ${actualModel}
				Duration: ${duration.toFixed(0)}ms
				Tokens: ${response.usage?.total_tokens || 'unknown'}
				Cost: ${this.calculateCost(actualModel, response.usage)}
			`);

			return result;
		} catch (error) {
			lastError = error as Error;
			console.error(`OpenRouter request failed:`, error);
			throw new Error(`Failed to generate valid JSON: ${lastError?.message}`);
		}
	}

	// ============================================
	// TEXT GENERATION METHOD
	// ============================================

	async generateText(options: TextGenerationOptions): Promise<string> {
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

		// Get provider preferences based on profile
		const providerPrefs = this.getProviderPreferences(profile);

		// Make the OpenRouter API call with model routing
		try {
			const response = await this.callOpenRouter({
				model: preferredModels[0], // Primary model
				models: preferredModels, // All models for fallback routing
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
				stream: options.streaming || false,
				route: 'fallback', // Use fallback routing strategy
				provider: providerPrefs
			});

			const content = response.choices[0].message.content;
			const actualModel = response.model || preferredModels[0];

			// Track metrics
			const duration = performance.now() - startTime;
			this.trackPerformance(actualModel, duration);
			this.trackCost(actualModel, response.usage);

			console.log(`Text Generation Success:
				Model: ${actualModel}
				Duration: ${duration.toFixed(0)}ms
				Length: ${content.length} chars
				Cost: ${this.calculateCost(actualModel, response.usage)}
			`);

			return content;
		} catch (error) {
			console.error(`OpenRouter text generation failed:`, error);
			throw new Error('Failed to generate text');
		}
	}

	// ============================================
	// OPENROUTER API CALL WITH ROUTING
	// ============================================

	private async callOpenRouter(params: {
		model: string;
		models?: string[]; // Additional models for routing
		messages: Array<{ role: string; content: string }>;
		temperature?: number;
		max_tokens?: number;
		response_format?: { type: string };
		stream?: boolean;
		route?: 'fallback'; // Routing strategy
		provider?: any; // Provider preferences
	}): Promise<OpenRouterResponse> {
		const headers = {
			Authorization: `Bearer ${this.apiKey}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': this.httpReferer,
			'X-Title': this.appName
		};

		// Build request body with routing support
		const body: any = {
			model: params.model,
			messages: params.messages,
			temperature: params.temperature,
			max_tokens: params.max_tokens,
			stream: params.stream || false,
			// OpenRouter specific options
			transforms: ['middle-out'] // Compression for cost reduction
		};

		// Add response format if supported
		if (params.response_format) {
			body.response_format = params.response_format;
		}

		// Add model routing if multiple models provided
		if (params.models && params.models.length > 1) {
			body.models = params.models;
			body.route = params.route || 'fallback';
		}

		// Add provider routing preferences
		if (params.provider) {
			body.provider = params.provider;
		}

		try {
			const response = await fetch(this.apiUrl, {
				method: 'POST',
				headers,
				body: JSON.stringify(body),
				signal: AbortSignal.timeout(120000) // 2 minute timeout
			});

			if (!response.ok) {
				const error = await response.text();
				throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
			}

			const data = (await response.json()) as OpenRouterResponse;

			// Log OpenRouter metadata from headers
			const metadata = {
				model: response.headers.get('x-model'), // Actual model used
				provider: response.headers.get('x-provider'), // Actual provider used
				cacheStatus: response.headers.get('x-cache-status'),
				requestId: response.headers.get('x-request-id'),
				rateLimitRequests: response.headers.get('x-ratelimit-requests-remaining'),
				rateLimitTokens: response.headers.get('x-ratelimit-tokens-remaining')
			};

			console.debug('OpenRouter routing result:', metadata);

			// Add actual model to response for tracking
			(data as any).model = metadata.model || params.model;

			return data;
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') {
				throw new Error(`Request timeout for model ${params.model}`);
			}
			throw error;
		}
	}

	// ============================================
	// PROVIDER ROUTING PREFERENCES
	// ============================================

	private getProviderPreferences(profile: JSONProfile | TextProfile): any {
		// Provider routing configuration based on profile (updated 2026-01-01)
		switch (profile) {
			case 'fast':
			case 'speed':
				return {
					order: ['openai', 'google', 'x-ai', 'deepseek'],
					allow_fallbacks: true,
					data_collection: 'allow' // Allow for faster routing
				};

			case 'balanced':
				return {
					order: ['deepseek', 'x-ai', 'anthropic', 'google', 'openai'],
					allow_fallbacks: true,
					require_parameters: true, // Require providers to support our parameters
					data_collection: 'deny' // Privacy focused
				};

			case 'powerful':
			case 'quality':
				return {
					order: ['deepseek', 'x-ai', 'anthropic', 'minimax', 'openai'],
					allow_fallbacks: true,
					require_parameters: true,
					data_collection: 'deny'
				};

			case 'maximum':
			case 'creative':
				return {
					order: ['anthropic', 'deepseek', 'openai'],
					allow_fallbacks: true, // Allow fallbacks for better reliability
					require_parameters: true,
					data_collection: 'deny'
				};

			default:
				return {
					allow_fallbacks: true,
					data_collection: 'deny'
				};
		}
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
			const effectiveCost = model.cost > 0 ? model.cost : 0.01;

			if (type === 'json') {
				// For JSON: prioritize accuracy and speed
				score = (model.smartness * 2 + model.speed) / effectiveCost;
			} else {
				// For text: balance all factors
				const creativity = model.creativity || model.smartness;
				score = (model.smartness + model.speed + creativity) / effectiveCost;
			}

			return { model, score };
		});

		// Sort by score and return top 3
		scored.sort((a, b) => b.score - a.score);
		return scored.slice(0, 3).map((s) => s.model.id);
	}

	private supportsJsonMode(modelId: string): boolean {
		// Models that support native JSON mode (updated 2026-01-01)
		const jsonModeModels = [
			// OpenAI models - all support json_object
			'openai/gpt-4o',
			'openai/gpt-4o-mini',
			'openai/gpt-4.1-nano',
			// DeepSeek models - native JSON support
			'deepseek/deepseek-chat',
			'deepseek/deepseek-r1',
			// Google models - response_format support
			'google/gemini-2.5-flash',
			'google/gemini-2.5-flash-lite',
			// Qwen models - structured output
			'qwen/qwen3-32b',
			// X-AI models - JSON support
			'x-ai/grok-4.1-fast',
			'x-ai/grok-4-fast:free',
			// MiniMax - structured output
			'minimax/minimax-m2.1'
			// Note: Anthropic models (Claude) don't support native JSON mode but handle JSON well
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

		const result = (await response.json()) as {
			data: Array<{ embedding: number[] }>;
		};
		return result.data[0]?.embedding || [];
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

		const result = (await response.json()) as {
			data: Array<{ embedding: number[] }>;
		};
		return result.data.map((d) => d.embedding);
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

		// JSON profile selection - Always prefer DeepSeek for cost-effectiveness
		let jsonProfile: JSONProfile = 'balanced';
		if (priority === 'speed' && complexity === 'simple') {
			jsonProfile = 'fast';
		} else if (priority === 'quality' || complexity === 'complex') {
			// Use DeepSeek even for quality - it's both powerful and cost-effective
			jsonProfile = 'powerful'; // This now prioritizes DeepSeek
		} else if (taskCount > 20) {
			jsonProfile = 'balanced'; // DeepSeek handles scale well
		}

		// Text profile selection - Always prefer DeepSeek for cost-effectiveness
		let textProfile: TextProfile = 'balanced';
		if (priority === 'speed') {
			textProfile = 'speed';
		} else if (priority === 'quality') {
			// Use DeepSeek even for quality - it's both powerful and cost-effective
			textProfile = 'quality'; // This now prioritizes DeepSeek
		}

		return { json: jsonProfile, text: textProfile };
	}
}
