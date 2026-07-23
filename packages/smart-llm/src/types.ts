// packages/smart-llm/src/types.ts

export type JSONProfile = 'fast' | 'balanced' | 'powerful' | 'maximum' | 'custom';
export type TextProfile = 'speed' | 'balanced' | 'quality' | 'creative' | 'maximum' | 'custom';
export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface ReasoningOptions {
	effort?: ReasoningEffort;
	/** Keep reasoning details available to providers/models that support them. */
	exclude?: boolean;
}

export interface ModelCapabilities {
	jsonMode?: boolean;
	structuredOutputs?: boolean;
	tools?: boolean;
	reasoning?: boolean;
	multimodal?: boolean;
	longContext?: boolean;
}

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
	capabilities?: ModelCapabilities;
}

export interface JSONSpendReservationEvent {
	model: string;
	/** Billing gateway that will receive the request (for example openrouter). */
	provider: string;
	maxTokens: number;
	estimatedInputTokens: number;
	reservedCostUsd: number;
	providerMaxPrice: {
		prompt: number;
		completion: number;
		request: 0;
	};
}

export interface JSONUsageEvent {
	model: string;
	billingProvider?: string;
	/** Upstream inference provider reported in the response, when available. */
	provider?: string;
	providerRequestId?: string;
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
	inputCost: number;
	outputCost: number;
	totalCost: number;
	costSource: 'provider_reported' | 'catalog_estimate' | 'reservation';
	/** How a strict reservation should terminate in the durable cost ledger. */
	billingDisposition?: 'settled' | 'released' | 'uncertain';
}

export interface JSONRequestOptions<T = unknown> {
	systemPrompt: string;
	userPrompt: string;
	userId?: string; // Made optional to match LLMService interface expectations
	profile?: JSONProfile;
	model?: string;
	models?: string[];
	temperature?: number;
	maxTokens?: number;
	timeoutMs?: number;
	/**
	 * Caller-owned cancellation (e.g. worker timeout/shutdown). An aborted
	 * signal cancels the in-flight provider request and suppresses retries.
	 */
	signal?: AbortSignal;
	/** Provider-supported reasoning controls (for example OpenRouter `reasoning.effort`). */
	reasoning?: ReasoningOptions;
	/**
	 * Hardens a single paid request against in-flight overshoot. SmartLLM chooses
	 * one catalog-priced model, conservatively reserves prompt cost, caps output
	 * tokens, and disables model/parse retries for this request.
	 */
	spendLimit?: {
		maxCostUsd: number;
		minOutputTokens?: number;
		safetyMultiplier?: number;
	};
	validation?: {
		retryOnParseError?: boolean;
		validateSchema?: boolean;
		maxRetries?: number;
		allowTruncatedJsonRecovery?: boolean;
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
	turnRunId?: string;
	streamRunId?: string;
	clientTurnId?: string;
	metadata?: Record<string, unknown>;
	/** Called after a strict spend plan exists and before provider dispatch. */
	onSpendReservation?: (event: JSONSpendReservationEvent) => void | Promise<void>;
	onUsage?: (event: JSONUsageEvent) => void | Promise<void>;
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
	turnRunId?: string;
	streamRunId?: string;
	clientTurnId?: string;
	metadata?: Record<string, unknown>;
	onUsage?: (event: {
		model: string;
		promptTokens: number;
		completionTokens: number;
		totalTokens: number;
		inputCost: number;
		outputCost: number;
		totalCost: number;
	}) => void | Promise<void>;
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

export type AudioInput =
	| { kind: 'file'; file: File }
	| { kind: 'buffer'; data: Uint8Array; format: string; filename?: string };

export interface TranscriptionOptions {
	audio?: AudioInput;
	audioFile?: File; // Backwards compatibility (prefer `audio`)
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

export interface OpenRouterTranscriptionResponse {
	text: string;
	model?: string;
	requestId?: string;
	usage?: {
		cost?: number;
		input_tokens?: number;
		output_tokens?: number;
		seconds?: number;
		total_tokens?: number;
	};
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
			cache_write_tokens?: number;
			audio_tokens?: number;
			video_tokens?: number;
		};
		completion_tokens_details?: {
			reasoning_tokens?: number;
			audio_tokens?: number;
			image_tokens?: number;
		};
		cost?: number;
		is_byok?: boolean;
		cost_details?: {
			upstream_inference_cost?: number;
			upstream_inference_prompt_cost?: number;
			upstream_inference_completions_cost?: number;
		};
		server_tool_use?: {
			web_search_requests?: number;
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

export interface ErrorLogger {
	logAPIError(
		error: unknown,
		url: string,
		method: string,
		userId?: string,
		metadata?: Record<string, unknown>
	): Promise<unknown>;
	logDatabaseError?(
		error: unknown,
		operation: string,
		tableName: string,
		recordId?: string,
		payload?: unknown
	): Promise<unknown>;
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
