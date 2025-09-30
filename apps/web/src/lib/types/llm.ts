// apps/web/src/lib/types/llm.ts

// types.ts
export interface LLMProvider {
	id: string;
	name: string;
	url: string;
	apiKey?: string;
	models: LLMModel[];
	stream: boolean;
	priority: number; // Lower number = higher priority
	timeout?: number; // Optional timeout in ms
	healthCheckEndpoint?: string; // Optional health check
}

export interface LLMModel {
	id: string;
	name: string;
	maxOutputTokens?: number; // Maximum output tokens per request
	supportsJsonMode?: boolean;
	defaultTemperature?: number;
	supportsSystemPrompt?: boolean;
	supportsTemperature?: boolean;
	description?: string;
	smartness?: number;
	inputCost?: number; // Cost per 1M input tokens
	outputCost?: number; // Cost per 1M output tokens
	maxContextTokens: number; // Maximum context window (required)
	recommendedMaxTokens: number; // Safe limit to avoid timeouts (required)
	isReasoningModel?: boolean;
	timeoutMs?: number; // Model-specific timeout
	knowledgeCutoff?: string; // Knowledge cutoff date
}

export interface LLMRequest {
	systemPrompt: string;
	userPrompt: string;
	userId: string | null;
	temperature?: number;
	responseFormat?: 'json' | 'text';
	preferredModels?: string[]; // Optional: specific models to try first
	maxRetries?: number;
}

export interface LLMResponse<T = any> {
	result: T;
	provider: string;
	model: string;
	duration: number;
	attemptedProviders: string[];
	tokenUsage?: {
		promptTokens?: number;
		completionTokens?: number;
		totalTokens?: number;
	};
}
