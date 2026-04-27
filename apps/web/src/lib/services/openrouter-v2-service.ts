// apps/web/src/lib/services/openrouter-v2-service.ts

import { PRIVATE_OPENROUTER_API_KEY } from '$env/static/private';
import { env as dynamicEnv } from '$env/dynamic/private';
import {
	analyzeComplexity,
	estimateResponseLength,
	ACTIVE_EXPERIMENT_MODEL,
	KIMI_EXPERIMENT_MODEL,
	resolveModelPricingProfile,
	repairTruncatedJSONResponse,
	shouldFailoverToNextOpenRouterModel
} from '@buildos/smart-llm';
import {
	SmartLLMService,
	type JSONRequestOptions,
	type TextGenerationOptions,
	type TextGenerationResult,
	type TextGenerationUsage,
	type WebSmartLLMConfig
} from '$lib/services/smart-llm-service';
import {
	cleanJSONResponse,
	extractVisibleText,
	normalizeStreamingContent
} from '$lib/services/smart-llm/response-parsing';
import { OpenRouterV2Client } from '$lib/services/openrouter-v2/client';
import { resolveLaneModels, resolveLaneReasoning } from '$lib/services/openrouter-v2/model-lanes';
import {
	isValidJsonObject,
	ToolCallAssembler
} from '$lib/services/openrouter-v2/tool-call-assembler';
import type {
	ModelLane,
	OpenRouterChatMessage,
	OpenRouterChatResponse,
	OpenRouterProviderConfig,
	OpenRouterToolCall,
	OpenRouterToolChoice,
	OpenRouterUsage,
	OpenRouterStreamEvent
} from '$lib/services/openrouter-v2/types';

const DEFAULT_MOONSHOT_CHAT_COMPLETIONS_URL = 'https://api.moonshot.ai/v1/chat/completions';
const DEFAULT_MOONSHOT_FALLBACK_MODEL = 'kimi-k2.6';
const DEFAULT_OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_OPENAI_FALLBACK_MODEL = 'gpt-4o-mini';
const MOONSHOT_REASONING_CONTENT_FALLBACK = '[reasoning omitted]';

type DirectFallbackProvider = 'moonshot' | 'openai';

type DirectFallbackProviderConfig = {
	apiKey?: string;
	apiUrl?: string;
	model?: string;
};

type OpenRouterV2ServiceConfig = WebSmartLLMConfig & {
	openai?: DirectFallbackProviderConfig;
	directFallbacks?: {
		enabled?: boolean;
		providers?: DirectFallbackProvider[];
	};
};

type DirectProviderRoute = {
	provider: DirectFallbackProvider;
	providerLabel: 'Moonshot' | 'OpenAI';
	providerName: 'moonshotai' | 'openai';
	apiKey: string;
	apiUrl: string;
	requestModel: string;
	canonicalModel: string;
};

class DirectProviderApiError extends Error {
	status?: number;
	provider: DirectFallbackProvider;
	requestId?: string;

	constructor(
		provider: DirectFallbackProvider,
		message: string,
		params?: { status?: number; requestId?: string }
	) {
		super(message);
		this.name = 'DirectProviderApiError';
		this.provider = provider;
		this.status = params?.status;
		this.requestId = params?.requestId;
	}
}

function parseBooleanFlag(value: string | undefined, fallback: boolean): boolean {
	if (!value) return fallback;
	const normalized = value.trim().toLowerCase();
	if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
	if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
	return fallback;
}

function readPrivateEnv(name: string): string | undefined {
	return dynamicEnv[name] || process.env[name];
}

function parseDirectFallbackProviderOrder(
	value: string | undefined,
	fallback: DirectFallbackProvider[]
): DirectFallbackProvider[] {
	if (!value) return fallback;

	const parsed = value
		.split(',')
		.map((entry) => entry.trim().toLowerCase())
		.filter(
			(entry): entry is DirectFallbackProvider => entry === 'moonshot' || entry === 'openai'
		);

	return parsed.length > 0 ? Array.from(new Set(parsed)) : fallback;
}

function buildMergedAbortSignal(params: { external?: AbortSignal; timeoutMs?: number }): {
	signal?: AbortSignal;
	cleanup: () => void;
} {
	const timeoutMs = params.timeoutMs;
	const external = params.external;

	if (!timeoutMs || timeoutMs <= 0) {
		return { signal: external, cleanup: () => undefined };
	}

	const controller = new AbortController();
	const onExternalAbort = () => controller.abort(external?.reason);
	if (external) {
		if (external.aborted) {
			controller.abort(external.reason);
		} else {
			external.addEventListener('abort', onExternalAbort, { once: true });
		}
	}

	const timeoutId = setTimeout(() => {
		controller.abort(new Error(`Direct provider request timeout after ${timeoutMs}ms`));
	}, timeoutMs);

	return {
		signal: controller.signal,
		cleanup: () => {
			clearTimeout(timeoutId);
			if (external) {
				external.removeEventListener('abort', onExternalAbort);
			}
		}
	};
}

function extractProviderErrorMessage(rawText: string, parsed: unknown): string {
	if (parsed && typeof parsed === 'object') {
		const root = parsed as Record<string, unknown>;
		const error =
			root.error && typeof root.error === 'object'
				? (root.error as Record<string, unknown>)
				: root;
		const message = error.message;
		if (typeof message === 'string' && message.trim().length > 0) {
			return message;
		}
	}
	if (rawText.trim().length > 0) {
		return rawText;
	}
	return 'Unknown provider error';
}

function contentToText(content: unknown): string {
	return extractVisibleText(content) ?? '';
}

function normalizeMessageContent(content: unknown): string {
	if (typeof content === 'string') {
		return content;
	}
	const asText = contentToText(content);
	if (asText.trim().length > 0) {
		return asText;
	}
	if (content === undefined || content === null) {
		return '';
	}
	try {
		return JSON.stringify(content);
	} catch {
		return String(content);
	}
}

function normalizeMessages(
	messages: Array<{
		role: string;
		content: unknown;
		tool_calls?: any[];
		tool_call_id?: string;
		reasoning_content?: string;
	}>
): OpenRouterChatMessage[] {
	return messages.map((message) => ({
		role: message.role,
		content: normalizeMessageContent(message.content),
		...(Array.isArray(message.tool_calls) ? { tool_calls: message.tool_calls } : {}),
		...(typeof message.tool_call_id === 'string' ? { tool_call_id: message.tool_call_id } : {}),
		...(typeof message.reasoning_content === 'string'
			? { reasoning_content: message.reasoning_content }
			: {})
	}));
}

function normalizeTools(tools: any[] | undefined): any[] {
	if (!Array.isArray(tools) || tools.length === 0) {
		return [];
	}

	const normalized = tools
		.map((tool) => {
			if (!tool || typeof tool !== 'object') {
				return null;
			}

			if (tool.type === 'function' && tool.function?.name) {
				return {
					type: 'function',
					function: {
						name: tool.function.name,
						description:
							typeof tool.function.description === 'string'
								? tool.function.description
								: '',
						parameters:
							tool.function.parameters && typeof tool.function.parameters === 'object'
								? tool.function.parameters
								: { type: 'object', properties: {} }
					}
				};
			}

			const name =
				typeof tool.name === 'string'
					? tool.name
					: typeof tool.function?.name === 'string'
						? tool.function.name
						: '';
			if (!name) {
				return null;
			}

			return {
				type: 'function',
				function: {
					name,
					description:
						typeof tool.description === 'string'
							? tool.description
							: typeof tool.function?.description === 'string'
								? tool.function.description
								: '',
					parameters:
						tool.parameters && typeof tool.parameters === 'object'
							? tool.parameters
							: tool.function?.parameters &&
								  typeof tool.function.parameters === 'object'
								? tool.function.parameters
								: { type: 'object', properties: {} }
				}
			};
		})
		.filter(Boolean);

	return normalized.length > 0 ? (normalized as any[]) : tools;
}

function stringifyReasoningDeltaPart(value: unknown): string {
	if (typeof value === 'string') {
		return value;
	}
	if (Array.isArray(value)) {
		return value.map(stringifyReasoningDeltaPart).filter(Boolean).join('');
	}
	if (value && typeof value === 'object') {
		const record = value as Record<string, unknown>;
		const text = record.text ?? record.content ?? record.value;
		if (typeof text === 'string') {
			return text;
		}
	}
	return '';
}

function extractReasoningDelta(
	delta: unknown
): { reasoning?: string; reasoning_details?: unknown[] } | null {
	if (!delta || typeof delta !== 'object') {
		return null;
	}

	const record = delta as Record<string, unknown>;
	const reasoning = [record.reasoning, record.reasoning_content, record.thinking]
		.map(stringifyReasoningDeltaPart)
		.filter(Boolean)
		.join('');
	const reasoningDetails = Array.isArray(record.reasoning_details)
		? record.reasoning_details
		: undefined;

	if (!reasoning && !reasoningDetails) {
		return null;
	}

	return {
		...(reasoning ? { reasoning } : {}),
		...(reasoningDetails ? { reasoning_details: reasoningDetails } : {})
	};
}

function resolveCacheStatus(usage: OpenRouterUsage | undefined): string | undefined {
	if (!usage) return undefined;
	const promptTokens =
		typeof usage.prompt_tokens === 'number' && Number.isFinite(usage.prompt_tokens)
			? usage.prompt_tokens
			: undefined;
	const cachedTokens =
		typeof usage.prompt_tokens_details?.cached_tokens === 'number' &&
		Number.isFinite(usage.prompt_tokens_details.cached_tokens)
			? usage.prompt_tokens_details.cached_tokens
			: 0;

	if (cachedTokens <= 0) {
		return promptTokens !== undefined ? 'no cache' : undefined;
	}

	if (!promptTokens || promptTokens <= 0) {
		return `cached ${cachedTokens} prompt tokens`;
	}

	const hitRate = Math.round((cachedTokens / promptTokens) * 1000) / 10;
	return `${hitRate}% cache hit`;
}

function resolveReasoningTokens(usage: OpenRouterUsage | undefined): number | undefined {
	const value = usage?.completion_tokens_details?.reasoning_tokens;
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function resolveCachedPromptTokens(usage: OpenRouterUsage | undefined): number | undefined {
	const value = usage?.prompt_tokens_details?.cached_tokens;
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function resolveCacheWriteTokens(usage: OpenRouterUsage | undefined): number | undefined {
	const value = usage?.prompt_tokens_details?.cache_write_tokens;
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function resolveUsageNumber(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function buildOpenRouterUsageMetadata(
	usage: OpenRouterUsage | undefined,
	costSource?: string
): Record<string, unknown> {
	if (!usage) return {};

	const metadata: Record<string, unknown> = {};
	const assign = (key: string, value: unknown) => {
		if (value !== undefined) metadata[key] = value;
	};

	assign('costSource', costSource);
	assign('openrouterUsageCost', resolveUsageNumber(usage.cost));
	assign('openrouterByok', typeof usage.is_byok === 'boolean' ? usage.is_byok : undefined);
	assign('reasoningTokens', resolveReasoningTokens(usage));
	assign('cachedPromptTokens', resolveCachedPromptTokens(usage));
	assign('cacheWriteTokens', resolveCacheWriteTokens(usage));
	if (usage.cost_details && typeof usage.cost_details === 'object') {
		assign('openrouterCostDetails', usage.cost_details);
	}
	if (usage.server_tool_use && typeof usage.server_tool_use === 'object') {
		assign('openrouterServerToolUse', usage.server_tool_use);
	}

	return metadata;
}

function mapUsage(usage: OpenRouterUsage | undefined): TextGenerationUsage | undefined {
	if (!usage) return undefined;
	return {
		promptTokens: usage.prompt_tokens || 0,
		completionTokens: usage.completion_tokens || 0,
		totalTokens: usage.total_tokens || 0
	};
}

function isAbortError(error: unknown): boolean {
	if (!error || typeof error !== 'object') return false;
	const maybeError = error as { name?: string; message?: string };
	return (
		maybeError.name === 'AbortError' ||
		(typeof maybeError.message === 'string' &&
			maybeError.message.toLowerCase().includes('aborted'))
	);
}

function extractTextFromResponse(response: OpenRouterChatResponse): string {
	const firstChoice = response.choices?.[0];
	if (!firstChoice) return '';

	const messageText = contentToText(firstChoice.message?.content);
	if (messageText.trim().length > 0) {
		return messageText;
	}

	if (typeof firstChoice.text === 'string') {
		return contentToText(firstChoice.text);
	}

	return '';
}

type JSONRequestWithFallbackModels<T = any> = JSONRequestOptions<T> & {
	model?: string;
	models?: string[];
	allowedModelIds?: string[];
	includeDefaultModels?: boolean;
};

function isLikelyTruncatedJSONError(error: unknown, cleaned: string): boolean {
	if (!(error instanceof SyntaxError)) return false;

	const normalizedMessage = error.message.toLowerCase();
	if (
		normalizedMessage.includes('unterminated string') ||
		normalizedMessage.includes('unexpected end of json input') ||
		normalizedMessage.includes('unexpected end of data')
	) {
		return true;
	}

	const positionMatch = normalizedMessage.match(/position (\d+)/);
	if (!positionMatch?.[1]) return false;
	const position = Number.parseInt(positionMatch[1], 10);
	if (!Number.isFinite(position)) return false;

	return cleaned.length - position <= 8;
}

function parseJSONContent<T>(
	content: string,
	options?: JSONRequestWithFallbackModels<T>['validation']
): T {
	const cleaned = cleanJSONResponse(content);

	try {
		return JSON.parse(cleaned) as T;
	} catch (error) {
		if (
			options?.allowTruncatedJsonRecovery === true &&
			isLikelyTruncatedJSONError(error, cleaned)
		) {
			const repaired = repairTruncatedJSONResponse(cleaned);
			if (repaired) {
				try {
					return JSON.parse(repaired) as T;
				} catch {
					// Keep the original parse error so retry and logging paths retain the root cause.
				}
			}
		}

		throw error;
	}
}

type TextRequestWithFallbackModels = TextGenerationOptions & {
	model?: string;
	models?: string[];
};

export class OpenRouterV2Service extends SmartLLMService {
	private client: OpenRouterV2Client;
	private exactoToolsEnabled: boolean;
	private v2DefaultTimeoutMs?: number;
	private directFallbacksEnabled: boolean;
	private directFallbackProviderOrder: DirectFallbackProvider[];
	private moonshotFallbackApiKey?: string;
	private moonshotFallbackApiUrl: string;
	private moonshotFallbackModel: string;
	private openAiFallbackApiKey?: string;
	private openAiFallbackApiUrl: string;
	private openAiFallbackModel: string;

	constructor(config?: OpenRouterV2ServiceConfig) {
		super({
			...config,
			apiKey: config?.apiKey || PRIVATE_OPENROUTER_API_KEY
		});

		const apiKey = config?.apiKey || PRIVATE_OPENROUTER_API_KEY;
		if (!apiKey) {
			throw new Error('Missing OpenRouter API key');
		}

		this.exactoToolsEnabled = parseBooleanFlag(
			process.env.OPENROUTER_V2_EXACTO_TOOLS_ENABLED,
			false
		);

		const timeoutRaw = process.env.OPENROUTER_V2_TIMEOUT_MS;
		const timeoutParsed = timeoutRaw ? Number.parseInt(timeoutRaw, 10) : NaN;
		this.v2DefaultTimeoutMs =
			Number.isFinite(timeoutParsed) && timeoutParsed > 0 ? timeoutParsed : undefined;

		const directFallbacksEnabledRaw = readPrivateEnv('OPENROUTER_V2_DIRECT_FALLBACKS_ENABLED');
		this.directFallbacksEnabled =
			config?.directFallbacks?.enabled ?? parseBooleanFlag(directFallbacksEnabledRaw, true);
		this.directFallbackProviderOrder =
			config?.directFallbacks?.providers ??
			parseDirectFallbackProviderOrder(
				readPrivateEnv('OPENROUTER_V2_DIRECT_FALLBACK_ORDER'),
				['moonshot', 'openai']
			);

		this.moonshotFallbackApiKey =
			config?.moonshot?.apiKey ||
			readPrivateEnv('PRIVATE_MOONSHOT_API_KEY') ||
			readPrivateEnv('MOONSHOT_API_KEY');
		this.moonshotFallbackApiUrl =
			config?.moonshot?.apiUrl ||
			readPrivateEnv('PRIVATE_MOONSHOT_API_URL') ||
			DEFAULT_MOONSHOT_CHAT_COMPLETIONS_URL;
		this.moonshotFallbackModel =
			config?.moonshot?.modelMap?.[KIMI_EXPERIMENT_MODEL] ||
			readPrivateEnv('PRIVATE_MOONSHOT_CHAT_FALLBACK_MODEL') ||
			readPrivateEnv('MOONSHOT_CHAT_FALLBACK_MODEL') ||
			DEFAULT_MOONSHOT_FALLBACK_MODEL;

		this.openAiFallbackApiKey =
			config?.openai?.apiKey ||
			readPrivateEnv('PRIVATE_OPENAI_API_KEY') ||
			readPrivateEnv('OPENAI_API_KEY');
		this.openAiFallbackApiUrl =
			config?.openai?.apiUrl ||
			readPrivateEnv('PRIVATE_OPENAI_CHAT_API_URL') ||
			DEFAULT_OPENAI_CHAT_COMPLETIONS_URL;
		this.openAiFallbackModel =
			config?.openai?.model ||
			readPrivateEnv('PRIVATE_OPENAI_CHAT_FALLBACK_MODEL') ||
			DEFAULT_OPENAI_FALLBACK_MODEL;

		this.client = new OpenRouterV2Client({
			apiKey,
			baseUrl: process.env.OPENROUTER_V2_BASE_URL || 'https://openrouter.ai/api/v1',
			httpReferer: config?.httpReferer || 'https://build-os.com',
			appName: config?.appName || 'BuildOS OpenRouter V2',
			defaultTimeoutMs: this.v2DefaultTimeoutMs
		});
	}

	private resolveModels(
		lane: ModelLane,
		model?: string,
		models?: string[],
		selection?: {
			profile?: JSONRequestOptions['profile'] | TextGenerationOptions['profile'];
			estimatedLength?: number;
			complexity?: 'simple' | 'moderate' | 'complex';
			allowedModelIds?: string[];
			includeDefaultModels?: boolean;
		}
	): string[] {
		return resolveLaneModels({
			lane,
			model,
			models,
			exactoToolsEnabled: this.exactoToolsEnabled,
			profile: selection?.profile,
			estimatedLength: selection?.estimatedLength,
			complexity: selection?.complexity,
			allowedModelIds: selection?.allowedModelIds,
			includeDefaultModels: selection?.includeDefaultModels
		});
	}

	private resolveTimeout(timeoutMs: number | undefined): number | undefined {
		return timeoutMs ?? this.v2DefaultTimeoutMs;
	}

	private resolveOpenRouterProviderConfig(lane: ModelLane): OpenRouterProviderConfig {
		if (lane === 'json' || lane === 'tool_calling') {
			return {
				allow_fallbacks: true,
				require_parameters: true
			};
		}

		return {
			allow_fallbacks: true
		};
	}

	private isKimiDirectModel(model: string): boolean {
		const normalized = model.trim().toLowerCase();
		return normalized.startsWith('kimi-k') || normalized.startsWith('moonshotai/kimi-k');
	}

	private normalizeMoonshotModelForRequest(model: string): string {
		const normalized = model.trim();
		if (normalized.toLowerCase().startsWith('moonshotai/')) {
			return normalized.slice('moonshotai/'.length);
		}
		return normalized || DEFAULT_MOONSHOT_FALLBACK_MODEL;
	}

	private normalizeMoonshotModelForLogging(model: string): string {
		const requestModel = this.normalizeMoonshotModelForRequest(model);
		return requestModel.includes('/') ? requestModel : `moonshotai/${requestModel}`;
	}

	private normalizeOpenAiModelForRequest(model: string): string {
		const normalized = model.trim();
		if (normalized.toLowerCase().startsWith('openai/')) {
			return normalized.slice('openai/'.length);
		}
		return normalized || DEFAULT_OPENAI_FALLBACK_MODEL;
	}

	private normalizeOpenAiModelForLogging(model: string): string {
		const requestModel = this.normalizeOpenAiModelForRequest(model);
		return requestModel.includes('/') ? requestModel : `openai/${requestModel}`;
	}

	private resolveDirectFallbackRoutes(): DirectProviderRoute[] {
		if (!this.directFallbacksEnabled) return [];

		const routes: DirectProviderRoute[] = [];
		for (const provider of this.directFallbackProviderOrder) {
			if (provider === 'moonshot' && this.moonshotFallbackApiKey) {
				const requestModel = this.normalizeMoonshotModelForRequest(
					this.moonshotFallbackModel
				);
				routes.push({
					provider,
					providerLabel: 'Moonshot',
					providerName: 'moonshotai',
					apiKey: this.moonshotFallbackApiKey,
					apiUrl: this.moonshotFallbackApiUrl,
					requestModel,
					canonicalModel: this.normalizeMoonshotModelForLogging(requestModel)
				});
			}
			if (provider === 'openai' && this.openAiFallbackApiKey) {
				const requestModel = this.normalizeOpenAiModelForRequest(this.openAiFallbackModel);
				routes.push({
					provider,
					providerLabel: 'OpenAI',
					providerName: 'openai',
					apiKey: this.openAiFallbackApiKey,
					apiUrl: this.openAiFallbackApiUrl,
					requestModel,
					canonicalModel: this.normalizeOpenAiModelForLogging(requestModel)
				});
			}
		}

		return routes;
	}

	private ensureDirectMoonshotReasoningContent(
		messages: OpenRouterChatMessage[]
	): OpenRouterChatMessage[] {
		let mutated = false;
		const updated = messages.map((message) => {
			if (!message || typeof message !== 'object' || message.role !== 'assistant') {
				return message;
			}

			const hasToolCalls = Array.isArray(message.tool_calls) && message.tool_calls.length > 0;
			if (!hasToolCalls) {
				return message;
			}

			if (typeof message.reasoning_content === 'string' && message.reasoning_content.trim()) {
				return message;
			}

			mutated = true;
			return {
				...message,
				reasoning_content: MOONSHOT_REASONING_CONTENT_FALLBACK
			};
		});

		return mutated ? updated : messages;
	}

	private resolveDirectTemperature(
		route: DirectProviderRoute,
		temperature: number | undefined,
		fallback: number
	): number {
		if (route.provider === 'moonshot' && this.isKimiDirectModel(route.requestModel)) {
			return 1;
		}
		return temperature ?? fallback;
	}

	private getModelConfig(model: string, _lane: ModelLane, fallbackModels: string[] = []) {
		return resolveModelPricingProfile(model, fallbackModels)?.profile;
	}

	private calculateUsageCost(
		model: string,
		lane: ModelLane,
		usage: OpenRouterUsage | undefined,
		fallbackModels: string[] = []
	) {
		const modelConfig = this.getModelConfig(model, lane, fallbackModels);
		const estimatedInputCost = modelConfig
			? ((usage?.prompt_tokens || 0) / 1_000_000) * modelConfig.cost
			: 0;
		const estimatedOutputCost = modelConfig
			? ((usage?.completion_tokens || 0) / 1_000_000) * modelConfig.outputCost
			: 0;
		const estimatedTotalCost = estimatedInputCost + estimatedOutputCost;
		const openrouterUsageCost = resolveUsageNumber(usage?.cost);
		const upstreamPromptCost = resolveUsageNumber(
			usage?.cost_details?.upstream_inference_prompt_cost
		);
		const upstreamCompletionCost = resolveUsageNumber(
			usage?.cost_details?.upstream_inference_completions_cost
		);

		if (openrouterUsageCost !== undefined) {
			if (upstreamPromptCost !== undefined || upstreamCompletionCost !== undefined) {
				return {
					inputCost: upstreamPromptCost ?? 0,
					outputCost: upstreamCompletionCost ?? 0,
					totalCost: openrouterUsageCost,
					costSource: 'openrouter_usage'
				};
			}

			if (estimatedTotalCost > 0) {
				const scale = openrouterUsageCost / estimatedTotalCost;
				return {
					inputCost: estimatedInputCost * scale,
					outputCost: estimatedOutputCost * scale,
					totalCost: openrouterUsageCost,
					costSource: 'openrouter_usage'
				};
			}

			return {
				inputCost: 0,
				outputCost: 0,
				totalCost: openrouterUsageCost,
				costSource: 'openrouter_usage'
			};
		}

		return {
			inputCost: estimatedInputCost,
			outputCost: estimatedOutputCost,
			totalCost: estimatedTotalCost,
			costSource: modelConfig ? 'model_pricing_estimate' : 'unknown'
		};
	}

	private buildDirectChatCompletionBody(params: {
		route: DirectProviderRoute;
		messages: OpenRouterChatMessage[];
		tools?: unknown[];
		tool_choice?: OpenRouterToolChoice;
		temperature?: number;
		max_tokens?: number;
		response_format?: { type: 'json_object' } | Record<string, unknown>;
		stream?: boolean;
		stream_options?: { include_usage?: boolean };
		prompt_cache_key?: string;
	}): Record<string, unknown> {
		const messages =
			params.route.provider === 'moonshot'
				? this.ensureDirectMoonshotReasoningContent(params.messages)
				: params.messages;
		const body: Record<string, unknown> = {
			model: params.route.requestModel,
			messages,
			temperature: this.resolveDirectTemperature(params.route, params.temperature, 0.7)
		};

		if (typeof params.max_tokens === 'number') body.max_tokens = params.max_tokens;
		if (params.response_format) body.response_format = params.response_format;
		if (typeof params.stream === 'boolean') body.stream = params.stream;
		if (params.stream_options) body.stream_options = params.stream_options;
		if (Array.isArray(params.tools) && params.tools.length > 0) body.tools = params.tools;
		if (params.tool_choice) body.tool_choice = params.tool_choice;
		if (params.prompt_cache_key && params.route.provider === 'moonshot') {
			body.prompt_cache_key = params.prompt_cache_key;
		}

		return body;
	}

	private async requestDirectChatCompletion(params: {
		route: DirectProviderRoute;
		messages: OpenRouterChatMessage[];
		tools?: unknown[];
		tool_choice?: OpenRouterToolChoice;
		temperature?: number;
		max_tokens?: number;
		response_format?: { type: 'json_object' } | Record<string, unknown>;
		stream?: boolean;
		stream_options?: { include_usage?: boolean };
		timeoutMs?: number;
		signal?: AbortSignal;
		prompt_cache_key?: string;
	}): Promise<Response> {
		const body = this.buildDirectChatCompletionBody(params);
		const { signal, cleanup } = buildMergedAbortSignal({
			external: params.signal,
			timeoutMs: params.timeoutMs
		});

		try {
			const response = await fetch(params.route.apiUrl, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${params.route.apiKey}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(body),
				signal
			});

			if (response.ok) {
				return response;
			}

			const rawText = await response.text();
			let parsed: unknown = null;
			try {
				parsed = JSON.parse(rawText);
			} catch {
				parsed = null;
			}
			const message = extractProviderErrorMessage(rawText, parsed);
			const requestId =
				response.headers.get('x-request-id') ||
				response.headers.get('msh-request-id') ||
				undefined;

			throw new DirectProviderApiError(
				params.route.provider,
				`${params.route.providerLabel} API error: ${response.status} - ${message}`,
				{
					status: response.status,
					requestId
				}
			);
		} finally {
			cleanup();
		}
	}

	private async createDirectChatCompletion(params: {
		route: DirectProviderRoute;
		messages: OpenRouterChatMessage[];
		tools?: unknown[];
		tool_choice?: OpenRouterToolChoice;
		temperature?: number;
		max_tokens?: number;
		response_format?: { type: 'json_object' } | Record<string, unknown>;
		timeoutMs?: number;
		prompt_cache_key?: string;
	}): Promise<OpenRouterChatResponse> {
		const response = await this.requestDirectChatCompletion({
			...params,
			stream: false
		});
		const parsed = (await response.json()) as OpenRouterChatResponse;
		if (parsed.error?.message) {
			throw new DirectProviderApiError(
				params.route.provider,
				`${params.route.providerLabel} API error: ${parsed.error.message}`,
				{
					requestId:
						response.headers.get('x-request-id') ||
						response.headers.get('msh-request-id') ||
						undefined
				}
			);
		}

		return {
			...parsed,
			model: parsed.model
				? this.normalizeDirectResponseModel(params.route, parsed.model)
				: params.route.canonicalModel,
			provider: params.route.providerName
		};
	}

	private normalizeDirectResponseModel(route: DirectProviderRoute, model: string): string {
		if (route.provider === 'moonshot') {
			return this.normalizeMoonshotModelForLogging(model);
		}
		return this.normalizeOpenAiModelForLogging(model);
	}

	private logOpenRouterV2Usage(params: {
		lane: ModelLane;
		options: JSONRequestWithFallbackModels | TextGenerationOptions;
		response: OpenRouterChatResponse;
		requestedModel: string;
		requestStartedAt: Date;
		startTime: number;
		maxTokens?: number;
		defaultOperationType: string;
		metadata?: Record<string, unknown>;
	}): void {
		if (!params.response.usage || !this.hasUsageLoggingBackend()) return;

		const actualModel = params.response.model || params.requestedModel;
		const pricing = resolveModelPricingProfile(actualModel, [params.requestedModel]);
		const modelConfig = pricing?.profile;
		const { inputCost, outputCost, totalCost, costSource } = this.calculateUsageCost(
			actualModel,
			params.lane,
			params.response.usage,
			[params.requestedModel]
		);
		const optionsRecord = params.options as JSONRequestWithFallbackModels &
			TextGenerationOptions;

		this.logUsageToDatabase({
			userId: optionsRecord.userId,
			operationType: optionsRecord.operationType || params.defaultOperationType,
			modelRequested: params.requestedModel,
			modelUsed: actualModel,
			provider: params.response.provider || modelConfig?.provider,
			promptTokens: params.response.usage.prompt_tokens || 0,
			completionTokens: params.response.usage.completion_tokens || 0,
			totalTokens: params.response.usage.total_tokens || 0,
			inputCost,
			outputCost,
			totalCost,
			responseTimeMs: Math.round(performance.now() - params.startTime),
			requestStartedAt: params.requestStartedAt,
			requestCompletedAt: new Date(),
			status: 'success',
			temperature: optionsRecord.temperature,
			maxTokens: params.maxTokens,
			profile: optionsRecord.profile,
			streaming: false,
			projectId: optionsRecord.projectId,
			brainDumpId: optionsRecord.brainDumpId,
			taskId: optionsRecord.taskId,
			briefId: optionsRecord.briefId,
			chatSessionId: optionsRecord.chatSessionId,
			agentSessionId: optionsRecord.agentSessionId,
			agentPlanId: optionsRecord.agentPlanId,
			agentExecutionId: optionsRecord.agentExecutionId,
			turnRunId: optionsRecord.turnRunId,
			streamRunId: optionsRecord.streamRunId,
			clientTurnId: optionsRecord.clientTurnId,
			openrouterRequestId: params.response.id,
			openrouterCacheStatus: resolveCacheStatus(params.response.usage),
			reasoningTokens: resolveReasoningTokens(params.response.usage),
			cachedPromptTokens: resolveCachedPromptTokens(params.response.usage),
			cacheWriteTokens: resolveCacheWriteTokens(params.response.usage),
			openrouterUsageCost: resolveUsageNumber(params.response.usage.cost),
			openrouterByok:
				typeof params.response.usage.is_byok === 'boolean'
					? params.response.usage.is_byok
					: undefined,
			openrouterUpstreamInferenceCost: resolveUsageNumber(
				params.response.usage.cost_details?.upstream_inference_cost
			),
			metadata: {
				...optionsRecord.metadata,
				...params.metadata,
				...buildOpenRouterUsageMetadata(params.response.usage, costSource),
				lane: params.lane,
				pricingModel: pricing?.modelId ?? null
			}
		}).catch((error) => console.error('Failed to log OpenRouter V2 usage:', error));
	}

	async getJSONResponse<T = any>(options: JSONRequestWithFallbackModels<T>): Promise<T> {
		const requestStartedAt = new Date();
		const startTime = performance.now();
		const laneModels = this.resolveModels('json', options.model, options.models, {
			profile: options.profile,
			complexity: analyzeComplexity(options.userPrompt),
			allowedModelIds: options.allowedModelIds,
			includeDefaultModels: options.includeDefaultModels
		});
		const maxTokens = options.maxTokens ?? 8192;
		const messages: OpenRouterChatMessage[] = [
			{ role: 'system', content: options.systemPrompt },
			{ role: 'user', content: options.userPrompt }
		];

		const maxModelAttempts = Math.max(laneModels.length, 1);
		const maxParseRetries =
			options.validation?.retryOnParseError === true
				? (options.validation.maxRetries ?? 2)
				: 0;
		const maxAttempts = maxModelAttempts + maxParseRetries;
		let modelAttempt = 0;
		let parseRetriesUsed = 0;
		let lastError: Error | null = null;
		const openRouterModelsAttempted = new Set<string>();
		const providersAttempted = new Set<string>();

		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			const model = laneModels[modelAttempt] || laneModels[0] || ACTIVE_EXPERIMENT_MODEL;
			const models = [
				model,
				...laneModels.slice(modelAttempt + 1).filter((entry) => entry !== model)
			];
			openRouterModelsAttempted.add(model);
			providersAttempted.add('openrouter');

			try {
				const response = await this.client.createChatCompletion({
					model,
					models,
					messages,
					temperature:
						parseRetriesUsed > 0
							? Math.min(options.temperature ?? 0.2, 0.1)
							: (options.temperature ?? 0.2),
					max_tokens: maxTokens,
					response_format: { type: 'json_object' },
					reasoning: resolveLaneReasoning('json'),
					provider: this.resolveOpenRouterProviderConfig('json'),
					timeoutMs: this.resolveTimeout(options.timeoutMs)
				});
				const content = extractTextFromResponse(response);
				if (!content || content.trim().length === 0) {
					throw new Error('OpenRouter V2 returned empty JSON content');
				}

				const parsed = parseJSONContent<T>(content, options.validation);
				const actualModel = response.model || model;
				const usageCost = this.calculateUsageCost(actualModel, 'json', response.usage, [
					model
				]);
				if (typeof options.onUsage === 'function') {
					await options.onUsage({
						model: actualModel,
						promptTokens: response.usage?.prompt_tokens || 0,
						completionTokens: response.usage?.completion_tokens || 0,
						totalTokens: response.usage?.total_tokens || 0,
						inputCost: usageCost.inputCost,
						outputCost: usageCost.outputCost,
						totalCost: usageCost.totalCost
					});
				}
				this.logOpenRouterV2Usage({
					lane: 'json',
					options,
					response,
					requestedModel: model,
					requestStartedAt,
					startTime,
					maxTokens,
					defaultOperationType: 'other',
					metadata: {
						models,
						attempts: attempt + 1,
						parseRetriesUsed,
						providerRoute: 'openrouter',
						providersAttempted: Array.from(providersAttempted)
					}
				});
				return parsed;
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));
				const shouldRetryParseError =
					lastError instanceof SyntaxError &&
					options.validation?.retryOnParseError === true &&
					parseRetriesUsed < maxParseRetries;
				if (shouldRetryParseError) {
					parseRetriesUsed++;
					continue;
				}

				const shouldFailoverModel =
					(lastError instanceof SyntaxError ||
						lastError.message === 'OpenRouter V2 returned empty JSON content' ||
						shouldFailoverToNextOpenRouterModel(lastError)) &&
					modelAttempt < maxModelAttempts - 1;
				if (shouldFailoverModel) {
					modelAttempt++;
					continue;
				}

				break;
			}
		}

		let directFallbackError: Error | null = null;
		for (const route of this.resolveDirectFallbackRoutes()) {
			providersAttempted.add(route.provider);
			try {
				const response = await this.createDirectChatCompletion({
					route,
					messages,
					temperature: options.temperature ?? 0.2,
					max_tokens: maxTokens,
					response_format: { type: 'json_object' },
					timeoutMs: this.resolveTimeout(options.timeoutMs),
					prompt_cache_key: options.chatSessionId
				});
				const content = extractTextFromResponse(response);
				if (!content || content.trim().length === 0) {
					throw new Error(`${route.providerLabel} returned empty JSON content`);
				}

				const parsed = parseJSONContent<T>(content, options.validation);
				const actualModel = response.model || route.canonicalModel;
				const usageCost = this.calculateUsageCost(actualModel, 'json', response.usage, [
					route.canonicalModel
				]);
				if (typeof options.onUsage === 'function') {
					await options.onUsage({
						model: actualModel,
						promptTokens: response.usage?.prompt_tokens || 0,
						completionTokens: response.usage?.completion_tokens || 0,
						totalTokens: response.usage?.total_tokens || 0,
						inputCost: usageCost.inputCost,
						outputCost: usageCost.outputCost,
						totalCost: usageCost.totalCost
					});
				}
				this.logOpenRouterV2Usage({
					lane: 'json',
					options,
					response,
					requestedModel: route.canonicalModel,
					requestStartedAt,
					startTime,
					maxTokens,
					defaultOperationType: 'other',
					metadata: {
						models: [route.canonicalModel],
						openRouterModelsAttempted: Array.from(openRouterModelsAttempted),
						providerRoute: 'direct',
						fallbackFrom: 'openrouter',
						fallbackProvider: route.provider,
						fallbackReason: lastError?.message ?? null,
						providersAttempted: Array.from(providersAttempted),
						parseRetriesUsed
					}
				});
				return parsed;
			} catch (error) {
				if (isAbortError(error)) {
					throw error;
				}
				directFallbackError = error instanceof Error ? error : new Error(String(error));
			}
		}

		throw new Error(
			`Failed to generate valid JSON with OpenRouter V2: ${
				directFallbackError?.message || lastError?.message || 'unknown error'
			}`
		);
	}

	async generateText(options: TextRequestWithFallbackModels): Promise<string>;
	async generateText(params: {
		systemPrompt: string;
		prompt: string;
		temperature?: number;
		maxTokens?: number;
		timeoutMs?: number;
		userId?: string;
		operationType?: string;
		profile?: TextGenerationOptions['profile'];
		model?: string;
		models?: string[];
	}): Promise<string>;
	async generateText(optionsOrParams: any): Promise<string> {
		const normalized: TextRequestWithFallbackModels =
			'systemPrompt' in optionsOrParams
				? {
						prompt: optionsOrParams.prompt,
						systemPrompt: optionsOrParams.systemPrompt,
						temperature: optionsOrParams.temperature,
						maxTokens: optionsOrParams.maxTokens,
						timeoutMs: optionsOrParams.timeoutMs,
						userId: optionsOrParams.userId,
						operationType: optionsOrParams.operationType,
						profile: optionsOrParams.profile,
						model: optionsOrParams.model,
						models: optionsOrParams.models
					}
				: optionsOrParams;

		const detailed = await this.generateTextDetailed(normalized);
		return detailed.text;
	}

	async generateTextDetailed(
		options: TextRequestWithFallbackModels
	): Promise<TextGenerationResult> {
		const requestStartedAt = new Date();
		const startTime = performance.now();
		const laneModels = this.resolveModels('text', options.model, options.models, {
			profile: options.profile,
			estimatedLength: estimateResponseLength(options.prompt)
		});
		const systemPrompt =
			typeof options.systemPrompt === 'string' && options.systemPrompt.trim().length > 0
				? options.systemPrompt
				: 'You are a precise, concise assistant.';
		const messages: OpenRouterChatMessage[] = [
			{ role: 'system', content: systemPrompt },
			{ role: 'user', content: options.prompt }
		];

		const maxAttempts = Math.max(laneModels.length, 1);
		let lastError: Error | null = null;
		const openRouterModelsAttempted = new Set<string>();
		const providersAttempted = new Set<string>();

		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			const model = laneModels[attempt] || laneModels[0] || ACTIVE_EXPERIMENT_MODEL;
			const models = [
				model,
				...laneModels.slice(attempt + 1).filter((entry) => entry !== model)
			];
			openRouterModelsAttempted.add(model);
			providersAttempted.add('openrouter');

			try {
				const response = await this.client.createChatCompletion({
					model,
					models,
					messages,
					temperature: options.temperature ?? 0.7,
					max_tokens: options.maxTokens ?? 4096,
					reasoning: resolveLaneReasoning('text'),
					provider: this.resolveOpenRouterProviderConfig('text'),
					timeoutMs: this.resolveTimeout(options.timeoutMs)
				});

				const text = extractTextFromResponse(response);
				if (!text || text.trim().length === 0) {
					throw new Error('OpenRouter V2 returned empty text content');
				}

				const actualModel = response.model || model;
				const usageCost = this.calculateUsageCost(actualModel, 'text', response.usage, [
					model
				]);
				if (typeof options.onUsage === 'function') {
					await options.onUsage({
						model: actualModel,
						promptTokens: response.usage?.prompt_tokens || 0,
						completionTokens: response.usage?.completion_tokens || 0,
						totalTokens: response.usage?.total_tokens || 0,
						inputCost: usageCost.inputCost,
						outputCost: usageCost.outputCost,
						totalCost: usageCost.totalCost
					});
				}
				this.logOpenRouterV2Usage({
					lane: 'text',
					options,
					response,
					requestedModel: model,
					requestStartedAt,
					startTime,
					maxTokens: options.maxTokens ?? 4096,
					defaultOperationType: 'other',
					metadata: {
						models,
						attempts: attempt + 1,
						contentLength: text.length,
						providerRoute: 'openrouter',
						providersAttempted: Array.from(providersAttempted)
					}
				});

				return {
					text,
					usage: mapUsage(response.usage),
					model: actualModel
				};
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));
				if (attempt >= maxAttempts - 1) break;
			}
		}

		let directFallbackError: Error | null = null;
		for (const route of this.resolveDirectFallbackRoutes()) {
			providersAttempted.add(route.provider);
			try {
				const response = await this.createDirectChatCompletion({
					route,
					messages,
					temperature: options.temperature ?? 0.7,
					max_tokens: options.maxTokens ?? 4096,
					timeoutMs: this.resolveTimeout(options.timeoutMs),
					prompt_cache_key: options.chatSessionId
				});

				const text = extractTextFromResponse(response);
				if (!text || text.trim().length === 0) {
					throw new Error(`${route.providerLabel} returned empty text content`);
				}

				const actualModel = response.model || route.canonicalModel;
				const usageCost = this.calculateUsageCost(actualModel, 'text', response.usage, [
					route.canonicalModel
				]);
				if (typeof options.onUsage === 'function') {
					await options.onUsage({
						model: actualModel,
						promptTokens: response.usage?.prompt_tokens || 0,
						completionTokens: response.usage?.completion_tokens || 0,
						totalTokens: response.usage?.total_tokens || 0,
						inputCost: usageCost.inputCost,
						outputCost: usageCost.outputCost,
						totalCost: usageCost.totalCost
					});
				}
				this.logOpenRouterV2Usage({
					lane: 'text',
					options,
					response,
					requestedModel: route.canonicalModel,
					requestStartedAt,
					startTime,
					maxTokens: options.maxTokens ?? 4096,
					defaultOperationType: 'other',
					metadata: {
						models: [route.canonicalModel],
						openRouterModelsAttempted: Array.from(openRouterModelsAttempted),
						providerRoute: 'direct',
						fallbackFrom: 'openrouter',
						fallbackProvider: route.provider,
						fallbackReason: lastError?.message ?? null,
						providersAttempted: Array.from(providersAttempted),
						contentLength: text.length
					}
				});

				return {
					text,
					usage: mapUsage(response.usage),
					model: actualModel
				};
			} catch (error) {
				if (isAbortError(error)) {
					throw error;
				}
				directFallbackError = error instanceof Error ? error : new Error(String(error));
			}
		}

		throw new Error(
			`Failed to generate text with OpenRouter V2: ${
				directFallbackError?.message || lastError?.message || 'unknown error'
			}`
		);
	}

	async *streamText(options: {
		messages: Array<{
			role: string;
			content: string;
			tool_calls?: any[];
			tool_call_id?: string;
			reasoning_content?: string;
		}>;
		tools?: any[];
		tool_choice?: OpenRouterToolChoice;
		userId: string;
		profile?: TextGenerationOptions['profile'];
		temperature?: number;
		maxTokens?: number;
		sessionId?: string;
		messageId?: string;
		chatSessionId?: string;
		agentSessionId?: string;
		agentPlanId?: string;
		agentExecutionId?: string;
		turnRunId?: string;
		streamRunId?: string;
		clientTurnId?: string;
		model?: string;
		models?: string[];
		signal?: AbortSignal;
		operationType?: string;
		contextType?: string;
		entityId?: string;
		projectId?: string;
	}): AsyncGenerator<OpenRouterStreamEvent> {
		const needsTools = Array.isArray(options.tools) && options.tools.length > 0;
		const lane: ModelLane = needsTools ? 'tool_calling' : 'text';
		const totalInputLength = options.messages.reduce(
			(sum, message) => sum + (message.content?.length || 0),
			0
		);
		const laneModels = this.resolveModels(lane, options.model, options.models, {
			profile: options.profile,
			estimatedLength: estimateResponseLength(
				totalInputLength > 0 ? 'x'.repeat(Math.min(totalInputLength, 5001)) : ''
			)
		});
		const maxAttempts = Math.max(laneModels.length, 1);
		let lastError: Error | null = null;
		let streamResponse: Response | null = null;
		let resolvedModel = laneModels[0] || ACTIVE_EXPERIMENT_MODEL;
		let resolvedProvider: string | undefined;
		let requestModelForStartedStream = resolvedModel;
		let routingModelsForStartedStream = [...laneModels];
		let startedStreamAttempt = 0;
		let providerRoute: 'openrouter' | 'direct' = 'openrouter';
		let fallbackProvider: DirectFallbackProvider | undefined;
		let fallbackReason: string | undefined;
		let directRouteForStartedStream: DirectProviderRoute | null = null;
		const openRouterModelsAttempted = new Set<string>();
		const providersAttempted = new Set<string>();
		const requestMessages = normalizeMessages(options.messages);
		const requestTools = needsTools ? normalizeTools(options.tools) : undefined;
		const requestStartedAt = new Date();
		const startTime = performance.now();

		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			const model = laneModels[attempt] || laneModels[0] || ACTIVE_EXPERIMENT_MODEL;
			const models = [
				model,
				...laneModels.slice(attempt + 1).filter((entry) => entry !== model)
			];
			resolvedModel = model;
			openRouterModelsAttempted.add(model);
			providersAttempted.add('openrouter');

			try {
				streamResponse = await this.client.openChatCompletionStream({
					model,
					models,
					messages: requestMessages,
					tools: requestTools,
					tool_choice: needsTools ? options.tool_choice || 'auto' : undefined,
					temperature: options.temperature ?? (needsTools ? 0.2 : 0.7),
					max_tokens: options.maxTokens ?? 2000,
					reasoning: resolveLaneReasoning(lane),
					provider: this.resolveOpenRouterProviderConfig(lane),
					timeoutMs: this.resolveTimeout(undefined),
					signal: options.signal
				});
				requestModelForStartedStream = model;
				routingModelsForStartedStream = models;
				startedStreamAttempt = attempt + 1;
				break;
			} catch (error) {
				if (isAbortError(error)) {
					return;
				}
				lastError = error instanceof Error ? error : new Error(String(error));
				if (attempt >= maxAttempts - 1) {
					break;
				}
			}
		}

		if (!streamResponse) {
			fallbackReason = lastError?.message;
			let directFallbackError: Error | null = null;
			for (const route of this.resolveDirectFallbackRoutes()) {
				providersAttempted.add(route.provider);
				try {
					streamResponse = await this.requestDirectChatCompletion({
						route,
						messages: requestMessages,
						tools: requestTools,
						tool_choice: needsTools ? options.tool_choice || 'auto' : undefined,
						temperature: options.temperature ?? (needsTools ? 0.2 : 0.7),
						max_tokens: options.maxTokens ?? 2000,
						stream: true,
						stream_options: { include_usage: true },
						timeoutMs: this.resolveTimeout(undefined),
						signal: options.signal,
						prompt_cache_key:
							options.chatSessionId || options.sessionId || options.agentSessionId
					});
					providerRoute = 'direct';
					fallbackProvider = route.provider;
					directRouteForStartedStream = route;
					requestModelForStartedStream = route.canonicalModel;
					routingModelsForStartedStream = [route.canonicalModel];
					startedStreamAttempt = maxAttempts + providersAttempted.size - 1;
					resolvedModel = route.canonicalModel;
					resolvedProvider = route.providerName;
					break;
				} catch (error) {
					if (isAbortError(error)) {
						return;
					}
					directFallbackError = error instanceof Error ? error : new Error(String(error));
				}
			}
			if (!streamResponse) {
				yield {
					type: 'error',
					error:
						directFallbackError?.message ||
						lastError?.message ||
						'OpenRouter V2 stream failed to start'
				};
				return;
			}
		}

		if (!streamResponse) {
			yield {
				type: 'error',
				error: lastError?.message || 'OpenRouter V2 stream failed to start'
			};
			return;
		}

		const requestId =
			streamResponse.headers.get('x-request-id') ||
			streamResponse.headers.get('x-openrouter-request-id') ||
			undefined;
		const responseModel = streamResponse.headers.get('x-openrouter-model') || undefined;
		const responseProvider = streamResponse.headers.get('x-openrouter-provider') || undefined;
		const responseSystemFingerprint =
			streamResponse.headers.get('x-openrouter-system-fingerprint') || undefined;
		if (responseModel && responseModel.trim().length > 0) {
			resolvedModel =
				providerRoute === 'direct' && directRouteForStartedStream
					? this.normalizeDirectResponseModel(
							directRouteForStartedStream,
							responseModel.trim()
						)
					: responseModel.trim();
		}
		if (responseProvider && responseProvider.trim().length > 0) {
			resolvedProvider = responseProvider.trim();
		}

		const reader = streamResponse.body?.getReader();
		if (!reader) {
			yield { type: 'error', error: 'No response stream available' };
			return;
		}

		const decoder = new TextDecoder();
		const assembler = new ToolCallAssembler();
		let buffer = '';
		let inThinkingBlock = false;
		let usage: OpenRouterUsage | undefined;
		let terminalFinishReason: string | undefined;
		let streamRequestId = requestId;
		let streamSystemFingerprint = responseSystemFingerprint;
		let usageLogged = false;
		const logUsage = (usageForLog: OpenRouterUsage | undefined): void => {
			if (!usageForLog || usageLogged || !this.hasUsageLoggingBackend()) return;
			usageLogged = true;
			const actualModel = resolvedModel || requestModelForStartedStream;
			const pricing = resolveModelPricingProfile(actualModel, [
				requestModelForStartedStream,
				...routingModelsForStartedStream
			]);
			const modelConfig = pricing?.profile;
			const usageCost = this.calculateUsageCost(actualModel, lane, usageForLog, [
				requestModelForStartedStream,
				...routingModelsForStartedStream
			]);
			const requestCompletedAt = new Date();

			this.logUsageToDatabase({
				userId: options.userId,
				operationType: options.operationType || 'agentic_chat_v2_stream',
				modelRequested: requestModelForStartedStream,
				modelUsed: actualModel,
				provider: resolvedProvider ?? modelConfig?.provider,
				promptTokens: usageForLog.prompt_tokens || 0,
				completionTokens: usageForLog.completion_tokens || 0,
				totalTokens: usageForLog.total_tokens || 0,
				inputCost: usageCost.inputCost,
				outputCost: usageCost.outputCost,
				totalCost: usageCost.totalCost,
				responseTimeMs: Math.round(performance.now() - startTime),
				requestStartedAt,
				requestCompletedAt,
				status: 'success',
				temperature: options.temperature,
				maxTokens: options.maxTokens,
				profile: options.profile,
				streaming: true,
				projectId: options.projectId,
				chatSessionId: options.chatSessionId || options.sessionId,
				agentSessionId: options.agentSessionId,
				agentPlanId: options.agentPlanId,
				agentExecutionId: options.agentExecutionId,
				turnRunId: options.turnRunId,
				streamRunId: options.streamRunId,
				clientTurnId: options.clientTurnId,
				openrouterRequestId: streamRequestId,
				openrouterCacheStatus: resolveCacheStatus(usageForLog),
				reasoningTokens: resolveReasoningTokens(usageForLog),
				cachedPromptTokens: resolveCachedPromptTokens(usageForLog),
				cacheWriteTokens: resolveCacheWriteTokens(usageForLog),
				openrouterUsageCost: resolveUsageNumber(usageForLog.cost),
				openrouterByok:
					typeof usageForLog.is_byok === 'boolean' ? usageForLog.is_byok : undefined,
				openrouterUpstreamInferenceCost: resolveUsageNumber(
					usageForLog.cost_details?.upstream_inference_cost
				),
				metadata: {
					sessionId: options.sessionId,
					messageId: options.messageId,
					turnRunId: options.turnRunId,
					streamRunId: options.streamRunId,
					clientTurnId: options.clientTurnId,
					contextType: options.contextType,
					entityId: options.entityId,
					hasTools: needsTools,
					lane,
					modelRequested: requestModelForStartedStream,
					modelsAttempted: routingModelsForStartedStream,
					openRouterModelsAttempted: Array.from(openRouterModelsAttempted),
					attempts: startedStreamAttempt || 1,
					providerRoute,
					fallbackFrom: providerRoute === 'direct' ? 'openrouter' : undefined,
					fallbackProvider,
					fallbackReason: fallbackReason ?? null,
					providersAttempted: Array.from(providersAttempted),
					pricingModel: pricing?.modelId ?? null,
					...buildOpenRouterUsageMetadata(usageForLog, usageCost.costSource)
				}
			}).catch((error) => console.error('Failed to log OpenRouter V2 usage:', error));
		};

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					if (!line.trim() || !line.startsWith('data:')) continue;
					const payload = line.slice(5).trimStart();

					if (payload === '[DONE]') {
						for (const pending of assembler.drain()) {
							if (!pending.function.name) continue;
							if (!isValidJsonObject(pending.function.arguments)) continue;
							yield { type: 'tool_call', tool_call: pending };
						}

						const reasoningTokens = resolveReasoningTokens(usage);
						const cacheStatus = resolveCacheStatus(usage);
						logUsage(usage);
						yield {
							type: 'done',
							usage,
							finished_reason: terminalFinishReason ?? 'stop',
							model: resolvedModel,
							provider: resolvedProvider,
							request_id: streamRequestId,
							requestId: streamRequestId,
							system_fingerprint: streamSystemFingerprint,
							systemFingerprint: streamSystemFingerprint,
							reasoning_tokens: reasoningTokens,
							reasoningTokens,
							cache_status: cacheStatus,
							cacheStatus: cacheStatus
						};
						return;
					}

					let chunk: any;
					try {
						chunk = JSON.parse(payload);
					} catch {
						continue;
					}

					if (typeof chunk?.id === 'string' && chunk.id.trim().length > 0) {
						streamRequestId = chunk.id;
					}
					if (
						typeof chunk?.system_fingerprint === 'string' &&
						chunk.system_fingerprint.trim().length > 0
					) {
						streamSystemFingerprint = chunk.system_fingerprint;
					}
					if (typeof chunk?.model === 'string' && chunk.model.trim().length > 0) {
						resolvedModel =
							providerRoute === 'direct' && directRouteForStartedStream
								? this.normalizeDirectResponseModel(
										directRouteForStartedStream,
										chunk.model.trim()
									)
								: chunk.model.trim();
					}
					if (typeof chunk?.provider === 'string' && chunk.provider.trim().length > 0) {
						resolvedProvider = chunk.provider.trim();
					}
					if (chunk?.usage && typeof chunk.usage === 'object') {
						usage = chunk.usage as OpenRouterUsage;
					}

					const choice = chunk?.choices?.[0];
					if (!choice) continue;

					if (choice?.usage && typeof choice.usage === 'object') {
						usage = choice.usage as OpenRouterUsage;
					}

					if (
						typeof choice.finish_reason === 'string' &&
						choice.finish_reason.trim().length > 0
					) {
						terminalFinishReason = choice.finish_reason;
					}

					const delta = choice.delta;
					const reasoningDelta = extractReasoningDelta(delta);
					if (reasoningDelta) {
						yield { type: 'reasoning', ...reasoningDelta };
					}
					if (delta?.content !== undefined) {
						const normalizedChunk = normalizeStreamingContent(
							delta.content,
							inThinkingBlock
						);
						inThinkingBlock = normalizedChunk.inThinkingBlock;
						const text = normalizedChunk.text;
						if (text.length > 0) {
							yield { type: 'text', content: text };
						}
					}

					if (Array.isArray(delta?.tool_calls) && delta.tool_calls.length > 0) {
						for (const toolCallDelta of delta.tool_calls) {
							if (!toolCallDelta) continue;
							assembler.ingest(toolCallDelta);
						}
					}

					if (choice.finish_reason === 'tool_calls') {
						for (const pending of assembler.drain()) {
							if (!pending.function.name) continue;
							yield {
								type: 'tool_call',
								tool_call: pending as OpenRouterToolCall
							};
						}
					}
				}
			}

			for (const pending of assembler.drain()) {
				if (!pending.function.name) continue;
				if (!isValidJsonObject(pending.function.arguments)) continue;
				yield { type: 'tool_call', tool_call: pending };
			}

			const reasoningTokens = resolveReasoningTokens(usage);
			const cacheStatus = resolveCacheStatus(usage);
			logUsage(usage);
			yield {
				type: 'done',
				usage,
				finished_reason: terminalFinishReason ?? 'stop',
				model: resolvedModel,
				provider: resolvedProvider,
				request_id: streamRequestId,
				requestId: streamRequestId,
				system_fingerprint: streamSystemFingerprint,
				systemFingerprint: streamSystemFingerprint,
				reasoning_tokens: reasoningTokens,
				reasoningTokens,
				cache_status: cacheStatus,
				cacheStatus: cacheStatus
			};
		} catch (error) {
			if (isAbortError(error)) {
				return;
			}
			yield {
				type: 'error',
				error: error instanceof Error ? error.message : String(error)
			};
		}
	}
}
