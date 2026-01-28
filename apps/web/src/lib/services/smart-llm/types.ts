// apps/web/src/lib/services/smart-llm/types.ts

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

export interface OpenRouterResponse {
	id: string;
	provider?: string;
	model?: string;
	object?: string;
	created?: number;
	choices: Array<{
		message?: {
			content?: unknown;
			role?: string;
			tool_calls?: any[];
		};
		text?: string;
		finish_reason?: string;
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
	error?: {
		message?: string;
		type?: string;
		param?: string;
		code?: string | number;
		metadata?: Record<string, unknown>;
	};
}

export type OpenRouterMessageContentSummary = {
	contentType:
		| 'undefined'
		| 'null'
		| 'string'
		| 'array'
		| 'object'
		| 'number'
		| 'boolean'
		| 'bigint'
		| 'function'
		| 'symbol';
	stringLength?: number;
	trimmedStringLength?: number;
	objectKeys?: string[];
	partCount?: number;
	partTypeCounts?: Record<string, number>;
	textLengthByType?: Record<string, number>;
	reasoningTextLength?: number;
	nonReasoningTextLength?: number;
};
