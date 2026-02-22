// apps/web/src/lib/services/openrouter-v2-service.ts

import { PRIVATE_OPENROUTER_API_KEY } from '$env/static/private';
import {
	SmartLLMService,
	type JSONRequestOptions,
	type TextGenerationOptions,
	type TextGenerationResult,
	type TextGenerationUsage,
	type WebSmartLLMConfig
} from '$lib/services/smart-llm-service';
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
	OpenRouterToolCall,
	OpenRouterToolChoice,
	OpenRouterUsage,
	OpenRouterStreamEvent
} from '$lib/services/openrouter-v2/types';

function parseBooleanFlag(value: string | undefined, fallback: boolean): boolean {
	if (!value) return fallback;
	const normalized = value.trim().toLowerCase();
	if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
	if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
	return fallback;
}

function contentToText(content: unknown): string {
	if (typeof content === 'string') {
		return content;
	}
	if (Array.isArray(content)) {
		const parts = content
			.map((part) => {
				if (typeof part === 'string') return part;
				if (!part || typeof part !== 'object') return '';
				const record = part as Record<string, unknown>;
				if (typeof record.text === 'string') return record.text;
				if (record.text && typeof record.text === 'object') {
					const nested = record.text as Record<string, unknown>;
					if (typeof nested.value === 'string') return nested.value;
				}
				if (typeof record.content === 'string') return record.content;
				if (typeof record.value === 'string') return record.value;
				return '';
			})
			.filter((part) => part.length > 0);
		return parts.join('');
	}
	if (content && typeof content === 'object') {
		const record = content as Record<string, unknown>;
		if (typeof record.text === 'string') return record.text;
		if (typeof record.content === 'string') return record.content;
		if (typeof record.value === 'string') return record.value;
	}
	return '';
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

	if (typeof firstChoice.text === 'string') {
		return firstChoice.text;
	}

	const messageContent = firstChoice.message?.content;
	return contentToText(messageContent);
}

export class OpenRouterV2Service extends SmartLLMService {
	private client: OpenRouterV2Client;
	private exactoToolsEnabled: boolean;
	private v2DefaultTimeoutMs?: number;

	constructor(config?: WebSmartLLMConfig) {
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

		this.client = new OpenRouterV2Client({
			apiKey,
			baseUrl: process.env.OPENROUTER_V2_BASE_URL || 'https://openrouter.ai/api/v1',
			httpReferer: config?.httpReferer || 'https://buildos.com',
			appName: config?.appName || 'BuildOS OpenRouter V2',
			defaultTimeoutMs: this.v2DefaultTimeoutMs
		});
	}

	private resolveModels(lane: ModelLane, model?: string, models?: string[]): string[] {
		return resolveLaneModels({
			lane,
			model,
			models,
			exactoToolsEnabled: this.exactoToolsEnabled
		});
	}

	private resolveTimeout(timeoutMs: number | undefined): number | undefined {
		return timeoutMs ?? this.v2DefaultTimeoutMs;
	}

	async getJSONResponse<T = any>(options: JSONRequestOptions<T>): Promise<T> {
		const laneModels = this.resolveModels('json');
		const messages: OpenRouterChatMessage[] = [
			{ role: 'system', content: options.systemPrompt },
			{ role: 'user', content: options.userPrompt }
		];

		const maxAttempts = Math.min(Math.max(laneModels.length, 1), 3);
		let lastError: Error | null = null;

		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			const model = laneModels[attempt] || laneModels[0] || 'openai/gpt-4o-mini';
			const models = [
				model,
				...laneModels.slice(attempt + 1).filter((entry) => entry !== model)
			];

			try {
				const response = await this.client.createChatCompletion({
					model,
					models,
					messages,
					temperature: options.temperature ?? 0.2,
					max_tokens: 8192,
					response_format: { type: 'json_object' },
					reasoning: resolveLaneReasoning('json'),
					timeoutMs: this.resolveTimeout(options.timeoutMs)
				});
				const content = extractTextFromResponse(response);
				if (!content || content.trim().length === 0) {
					throw new Error('OpenRouter V2 returned empty JSON content');
				}

				const parsed = JSON.parse(content) as T;
				if (typeof options.onUsage === 'function') {
					await options.onUsage({
						model: response.model || model,
						promptTokens: response.usage?.prompt_tokens || 0,
						completionTokens: response.usage?.completion_tokens || 0,
						totalTokens: response.usage?.total_tokens || 0,
						inputCost: 0,
						outputCost: 0,
						totalCost: 0
					});
				}
				return parsed;
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));
				if (!options.validation?.retryOnParseError || attempt >= maxAttempts - 1) {
					break;
				}
			}
		}

		throw new Error(
			`Failed to generate valid JSON with OpenRouter V2: ${lastError?.message || 'unknown error'}`
		);
	}

	async generateText(options: TextGenerationOptions): Promise<string>;
	async generateText(params: {
		systemPrompt: string;
		prompt: string;
		temperature?: number;
		maxTokens?: number;
		timeoutMs?: number;
		userId?: string;
		operationType?: string;
		profile?: TextGenerationOptions['profile'];
	}): Promise<string>;
	async generateText(optionsOrParams: any): Promise<string> {
		const normalized: TextGenerationOptions =
			'systemPrompt' in optionsOrParams
				? {
						prompt: optionsOrParams.prompt,
						systemPrompt: optionsOrParams.systemPrompt,
						temperature: optionsOrParams.temperature,
						maxTokens: optionsOrParams.maxTokens,
						timeoutMs: optionsOrParams.timeoutMs,
						userId: optionsOrParams.userId,
						operationType: optionsOrParams.operationType,
						profile: optionsOrParams.profile
					}
				: optionsOrParams;

		const detailed = await this.generateTextDetailed(normalized);
		return detailed.text;
	}

	async generateTextDetailed(options: TextGenerationOptions): Promise<TextGenerationResult> {
		const laneModels = this.resolveModels('text');
		const systemPrompt =
			typeof options.systemPrompt === 'string' && options.systemPrompt.trim().length > 0
				? options.systemPrompt
				: 'You are a precise, concise assistant.';
		const messages: OpenRouterChatMessage[] = [
			{ role: 'system', content: systemPrompt },
			{ role: 'user', content: options.prompt }
		];

		const maxAttempts = Math.min(Math.max(laneModels.length, 1), 3);
		let lastError: Error | null = null;

		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			const model = laneModels[attempt] || laneModels[0] || 'openai/gpt-4o-mini';
			const models = [
				model,
				...laneModels.slice(attempt + 1).filter((entry) => entry !== model)
			];

			try {
				const response = await this.client.createChatCompletion({
					model,
					models,
					messages,
					temperature: options.temperature ?? 0.7,
					max_tokens: options.maxTokens ?? 4096,
					reasoning: resolveLaneReasoning('text'),
					timeoutMs: this.resolveTimeout(options.timeoutMs)
				});

				const text = extractTextFromResponse(response);
				if (!text || text.trim().length === 0) {
					throw new Error('OpenRouter V2 returned empty text content');
				}

				if (typeof options.onUsage === 'function') {
					await options.onUsage({
						model: response.model || model,
						promptTokens: response.usage?.prompt_tokens || 0,
						completionTokens: response.usage?.completion_tokens || 0,
						totalTokens: response.usage?.total_tokens || 0,
						inputCost: 0,
						outputCost: 0,
						totalCost: 0
					});
				}

				return {
					text,
					usage: mapUsage(response.usage),
					model: response.model || model
				};
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));
				if (attempt >= maxAttempts - 1) break;
			}
		}

		throw new Error(
			`Failed to generate text with OpenRouter V2: ${lastError?.message || 'unknown error'}`
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
		signal?: AbortSignal;
		operationType?: string;
		contextType?: string;
		entityId?: string;
		projectId?: string;
	}): AsyncGenerator<OpenRouterStreamEvent> {
		const needsTools = Array.isArray(options.tools) && options.tools.length > 0;
		const lane: ModelLane = needsTools ? 'tool_calling' : 'text';
		const laneModels = this.resolveModels(lane);
		const maxAttempts = Math.min(Math.max(laneModels.length, 1), 3);
		let lastError: Error | null = null;
		let streamResponse: Response | null = null;
		let resolvedModel = laneModels[0] || 'openai/gpt-4o-mini';
		let resolvedProvider: string | undefined;

		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			const model = laneModels[attempt] || laneModels[0] || 'openai/gpt-4o-mini';
			const models = [
				model,
				...laneModels.slice(attempt + 1).filter((entry) => entry !== model)
			];
			resolvedModel = model;

			try {
				streamResponse = await this.client.openChatCompletionStream({
					model,
					models,
					messages: normalizeMessages(options.messages),
					tools: needsTools ? normalizeTools(options.tools) : undefined,
					tool_choice: needsTools ? options.tool_choice || 'auto' : undefined,
					temperature: options.temperature ?? (needsTools ? 0.2 : 0.7),
					max_tokens: options.maxTokens ?? 2000,
					reasoning: resolveLaneReasoning(lane),
					timeoutMs: this.resolveTimeout(undefined),
					signal: options.signal
				});
				break;
			} catch (error) {
				if (isAbortError(error)) {
					return;
				}
				lastError = error instanceof Error ? error : new Error(String(error));
				if (attempt >= maxAttempts - 1) {
					yield { type: 'error', error: lastError.message };
					return;
				}
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
			resolvedModel = responseModel.trim();
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
		let usage: OpenRouterUsage | undefined;
		let terminalFinishReason: string | undefined;
		let streamRequestId = requestId;
		let streamSystemFingerprint = responseSystemFingerprint;

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
						resolvedModel = chunk.model.trim();
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
					if (delta?.content !== undefined) {
						const text = contentToText(delta.content);
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
