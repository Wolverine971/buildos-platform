// apps/web/src/lib/services/openrouter-v2/types.ts

export type ModelLane = 'text' | 'json' | 'tool_calling';

export type OpenRouterChatRole = 'system' | 'user' | 'assistant' | 'tool';

export type OpenRouterChatMessage = {
	role: OpenRouterChatRole | string;
	content: unknown;
	tool_calls?: unknown[];
	tool_call_id?: string;
	reasoning_content?: string;
};

export type OpenRouterToolChoice = 'auto' | 'none' | 'required';

export type OpenRouterReasoningConfig = {
	effort?: 'low' | 'medium' | 'high';
	max_tokens?: number;
	exclude?: boolean;
};

export type OpenRouterProviderConfig = {
	require_parameters?: boolean;
};

export type OpenRouterUsage = {
	prompt_tokens?: number;
	completion_tokens?: number;
	total_tokens?: number;
	prompt_tokens_details?: {
		cached_tokens?: number;
	};
	completion_tokens_details?: {
		reasoning_tokens?: number;
	};
};

export type OpenRouterChoice = {
	index?: number;
	message?: {
		role?: string;
		content?: unknown;
		tool_calls?: unknown[];
	};
	text?: string;
	delta?: {
		content?: unknown;
		tool_calls?: OpenRouterToolCallDelta[];
	};
	finish_reason?: string;
	native_finish_reason?: string;
	usage?: OpenRouterUsage;
};

export type OpenRouterChatResponse = {
	id?: string;
	provider?: string;
	model?: string;
	system_fingerprint?: string;
	choices?: OpenRouterChoice[];
	usage?: OpenRouterUsage;
	error?: {
		message?: string;
		type?: string;
		code?: string | number;
		param?: string;
		metadata?: Record<string, unknown>;
	};
};

export type OpenRouterToolCallDelta = {
	id?: string;
	index?: number;
	type?: string;
	function?: {
		name?: string;
		arguments?: unknown;
	};
};

export type OpenRouterToolCall = {
	id: string;
	type: 'function';
	function: {
		name: string;
		arguments: string;
	};
};

export type OpenRouterStreamEvent =
	| {
			type: 'text';
			content: string;
	  }
	| {
			type: 'tool_call';
			tool_call: OpenRouterToolCall;
	  }
	| {
			type: 'done';
			usage?: OpenRouterUsage;
			finished_reason?: string;
			model?: string;
			provider?: string;
			request_id?: string;
			requestId?: string;
			system_fingerprint?: string;
			systemFingerprint?: string;
			reasoning_tokens?: number;
			reasoningTokens?: number;
			cache_status?: string;
			cacheStatus?: string;
	  }
	| {
			type: 'error';
			error: string;
	  };

export type OpenRouterChatRequest = {
	model: string;
	messages: OpenRouterChatMessage[];
	models?: string[];
	tools?: unknown[];
	tool_choice?: OpenRouterToolChoice;
	temperature?: number;
	max_tokens?: number;
	response_format?: { type: 'json_object' } | Record<string, unknown>;
	reasoning?: OpenRouterReasoningConfig;
	provider?: OpenRouterProviderConfig;
	stream?: boolean;
	timeoutMs?: number;
	signal?: AbortSignal;
};

export type OpenRouterV2Config = {
	apiKey: string;
	baseUrl?: string;
	httpReferer: string;
	appName: string;
	fetchImpl?: typeof fetch;
	defaultTimeoutMs?: number;
};
