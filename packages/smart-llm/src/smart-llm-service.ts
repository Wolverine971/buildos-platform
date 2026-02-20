// packages/smart-llm/src/smart-llm-service.ts

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import type {
	ErrorLogger,
	JSONProfile,
	JSONRequestOptions,
	OpenRouterResponse,
	TextGenerationOptions,
	TextGenerationResult,
	TextGenerationUsage,
	TextProfile,
	TranscriptionOptions,
	TranscriptionResult
} from './types';
import {
	JSON_MODELS,
	TEXT_MODELS,
	EMPTY_CONTENT_RETRY_INSTRUCTION,
	EMPTY_CONTENT_RETRY_MIN_TOKENS,
	EMPTY_CONTENT_RETRY_BUFFER_TOKENS,
	EMPTY_CONTENT_RETRY_MAX_TOKENS
} from './model-config';
import {
	OpenRouterEmptyContentError,
	buildOpenRouterEmptyContentError,
	isRetryableOpenRouterError
} from './errors';
import {
	analyzeComplexity,
	ensureMinimumTextModels,
	ensureToolCompatibleModels,
	estimateResponseLength,
	pickEmergencyTextModel,
	selectJSONModels,
	selectTextModels,
	supportsJsonMode
} from './model-selection';
import { OpenRouterClient } from './openrouter-client';
import {
	cleanJSONResponse,
	enhanceSystemPromptForJSON,
	extractTextFromChoice,
	normalizeStreamingContent,
	repairTruncatedJSONResponse
} from './response-parsing';
import { ToolCallAssembler, resolveToolCallAssemblerProfile } from './tool-call-assembler';
import {
	buildTranscriptionVocabulary,
	coerceAudioInput,
	encodeAudioToBase64,
	getAudioFormatForInput,
	isRetryableTranscriptionError,
	sleep
} from './transcription-utils';
import { LLMUsageLogger, type UsageLogger } from './usage-logger';

export type {
	AudioInput,
	ErrorLogger,
	JSONProfile,
	ModelProfile,
	JSONRequestOptions,
	TextGenerationOptions,
	TextGenerationUsage,
	TextGenerationResult,
	TextProfile,
	TranscriptionProvider,
	TranscriptionOptions,
	TranscriptionResult
} from './types';

export type SmartLLMConfig = {
	apiKey: string;
	httpReferer?: string;
	appName?: string;
	supabase?: SupabaseClient<Database>;
	errorLogger?: ErrorLogger;
	usageLogger?: UsageLogger;
	fetch?: typeof fetch;
	enforceUserId?: boolean;
	openrouter?: {
		timeoutMs?: number;
		transforms?: string[];
		middleOutEnabled?: boolean;
		middleOutMinChars?: number;
	};
};

// ============================================
// MAIN SERVICE CLASS
// ============================================

export class SmartLLMService {
	private apiKey: string;
	private apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
	private costTracking = new Map<string, number>();
	private performanceMetrics = new Map<string, number[]>();
	private errorLogger?: ErrorLogger;
	private openRouterClient: OpenRouterClient;
	private usageLogger: UsageLogger;
	private fetchImpl: typeof fetch;
	private enforceUserId: boolean;
	private middleOutEnabled: boolean;
	private middleOutMinChars: number;
	private baseTransforms: string[];
	private defaultTimeoutMs?: number;

	// Optional: For logging and metrics
	private supabase?: SupabaseClient<Database>;

	// Configuration
	private httpReferer: string;
	private appName: string;

	constructor(config: SmartLLMConfig) {
		this.httpReferer = config.httpReferer || 'https://yourdomain.com';
		this.appName = config.appName || 'SmartLLMService';
		this.supabase = config.supabase;
		this.errorLogger = config.errorLogger;
		this.apiKey = config.apiKey;
		if (!this.apiKey) {
			throw new Error('Missing apiKey for SmartLLMService');
		}
		this.fetchImpl = config.fetch ?? globalThis.fetch;
		this.enforceUserId = config.enforceUserId ?? false;
		this.middleOutEnabled = config.openrouter?.middleOutEnabled ?? true;
		this.middleOutMinChars = config.openrouter?.middleOutMinChars ?? 60000;
		this.baseTransforms = config.openrouter?.transforms ?? [];
		this.defaultTimeoutMs = config.openrouter?.timeoutMs;

		this.openRouterClient = new OpenRouterClient({
			apiKey: this.apiKey,
			apiUrl: this.apiUrl,
			httpReferer: this.httpReferer,
			appName: this.appName,
			errorLogger: this.errorLogger,
			fetchImpl: this.fetchImpl
		});
		this.usageLogger =
			config.usageLogger ||
			new LLMUsageLogger({
				supabase: this.supabase,
				errorLogger: this.errorLogger
			});
	}

	private async yieldToEventLoop(): Promise<void> {
		const setImmediateFn =
			typeof (globalThis as typeof globalThis & { setImmediate?: unknown }).setImmediate ===
			'function'
				? (globalThis as typeof globalThis & { setImmediate: (cb: () => void) => void })
						.setImmediate
				: null;
		if (setImmediateFn) {
			await new Promise<void>((resolve) => setImmediateFn(resolve));
			return;
		}
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
	}

	private requireUserId(userId: string | undefined, operation: string): void {
		if (!this.enforceUserId) return;
		if (userId && userId.trim().length > 0) return;
		throw new Error(`SmartLLMService requires userId for ${operation}`);
	}

	private getContentLength(content: unknown): number {
		if (typeof content === 'string') {
			return content.length;
		}
		if (Array.isArray(content)) {
			let total = 0;
			for (const part of content) {
				total += this.getContentLength(part);
			}
			return total;
		}
		if (!content || typeof content !== 'object') {
			return 0;
		}
		const value = content as {
			type?: string;
			text?: string | { value?: string };
			value?: string;
			content?: string;
		};
		if (typeof value.text === 'string') return value.text.length;
		if (value.text && typeof value.text.value === 'string') return value.text.value.length;
		if (typeof value.value === 'string') return value.value.length;
		if (typeof value.content === 'string') return value.content.length;
		return 0;
	}

	private resolveTransforms(messages: Array<{ content: unknown }>): string[] | undefined {
		const transforms = [...this.baseTransforms];
		if (this.middleOutEnabled) {
			const totalLength = messages.reduce(
				(sum, message) => sum + this.getContentLength(message.content),
				0
			);
			if (totalLength >= this.middleOutMinChars) {
				if (!transforms.includes('middle-out')) {
					transforms.push('middle-out');
				}
			}
		}
		return transforms.length > 0 ? transforms : undefined;
	}

	private isLikelyTruncatedJSONError(error: unknown, cleaned: string): boolean {
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

	private parseCleanedJSON<T = unknown>(options: {
		cleaned: string;
		allowTruncatedJsonRecovery: boolean;
	}): { value: T; cleaned: string; repaired: boolean } {
		const { cleaned, allowTruncatedJsonRecovery } = options;

		try {
			return {
				value: JSON.parse(cleaned) as T,
				cleaned,
				repaired: false
			};
		} catch (error) {
			if (
				allowTruncatedJsonRecovery &&
				this.isLikelyTruncatedJSONError(error, cleaned)
			) {
				const repaired = repairTruncatedJSONResponse(cleaned);
				if (repaired) {
					try {
						return {
							value: JSON.parse(repaired) as T,
							cleaned: repaired,
							repaired: true
						};
					} catch {
						// Fall through to throw the original parse error.
					}
				}
			}
			throw error;
		}
	}

	// ============================================
	// JSON RESPONSE METHOD
	// ============================================

	async getJSONResponse<T = any>(options: JSONRequestOptions<T>): Promise<T> {
		this.requireUserId(options.userId, 'getJSONResponse');
		const requestStartedAt = new Date();
		const startTime = performance.now();
		const profile = options.profile || 'balanced';

		// Analyze prompt complexity
		const complexity = analyzeComplexity(options.systemPrompt + options.userPrompt);

		// Select models based on profile and requirements
		const preferredModels = selectJSONModels(profile, complexity, options.requirements);

		// Add JSON-specific instructions to system prompt
		const enhancedSystemPrompt = enhanceSystemPromptForJSON(options.systemPrompt);
		const messages = [
			{ role: 'system', content: enhancedSystemPrompt },
			{ role: 'user', content: options.userPrompt }
		];
		const transforms = this.resolveTransforms(messages);

		let lastError: Error | null = null;
		let retryCount = 0;
		const maxRetries = options.validation?.maxRetries || 2;
		const allowTruncatedJsonRecovery =
			options.validation?.allowTruncatedJsonRecovery === true;
		const baseModel = preferredModels[0] || 'openai/gpt-4o-mini';
		const maxAttempts = Math.min(Math.max(preferredModels.length, 1), 4);
		const attemptedModels = new Set<string>();
		let lastResponse: OpenRouterResponse | null = null;
		let lastRequestedModel = baseModel;

		// Make the OpenRouter API call with model routing + local fallbacks
		try {
			for (let attempt = 0; attempt < maxAttempts; attempt++) {
				const remainingModels = preferredModels.filter(
					(model) => !attemptedModels.has(model)
				);
				const requestedModel = remainingModels[0] || baseModel;
				lastRequestedModel = requestedModel;

				const routingCandidates = [
					requestedModel,
					...remainingModels.filter((model) => model !== requestedModel)
				];
				const useJsonMode = supportsJsonMode(requestedModel);
				const routingModels = useJsonMode
					? routingCandidates.filter((model) => supportsJsonMode(model))
					: routingCandidates;
				const modelsForRequest =
					routingModels.length > 0 ? routingModels : [requestedModel];

				try {
					const response = await this.openRouterClient.callOpenRouter({
						model: requestedModel, // Primary model with fallback
						models: modelsForRequest, // Filtered models for fallback routing
						messages,
						temperature: options.temperature || 0.2,
						response_format: useJsonMode ? { type: 'json_object' } : undefined,
						max_tokens: 8192,
						timeoutMs: options.timeoutMs ?? this.defaultTimeoutMs,
						transforms
					});

					lastResponse = response;

					// Guard against malformed response
					if (!response.choices || response.choices.length === 0) {
						throw new Error('OpenRouter returned empty choices array');
					}

					const choice = response.choices[0];
					const content = extractTextFromChoice(choice);
					if (!content || content.trim().length === 0) {
						throw buildOpenRouterEmptyContentError({
							operation: 'getJSONResponse',
							requestedModel,
							response,
							choice,
							extractedText: content
						});
					}

					// Parse the response
					let result: T;
					let cleaned = ''; // Declare outside try block for error logging
					let responseForLogging = response;
					let actualModel = response.model || requestedModel;
					let retryModelUsed: string | null = null;

					try {
						// Clean and parse JSON
						cleaned = cleanJSONResponse(content);
						const parsed = this.parseCleanedJSON<T>({
							cleaned,
							allowTruncatedJsonRecovery
						});
						result = parsed.value;
						cleaned = parsed.cleaned;
						if (parsed.repaired) {
							console.warn(
								`Recovered truncated JSON response from ${actualModel}`
							);
						}
					} catch (parseError) {
						// Log which model actually responded
						const actualModelForError = response.model || requestedModel || 'unknown';
						console.error(`JSON parse error with ${actualModelForError}:`, parseError);

						// Enhanced error logging with context
						if (
							parseError instanceof SyntaxError &&
							parseError.message.includes('position')
						) {
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
							let retryModel = 'anthropic/claude-sonnet-4';
							const retryModels = ['anthropic/claude-sonnet-4', 'openai/gpt-4o'];
							try {
								// Try again with powerful profile
								const retryResponse = await this.openRouterClient.callOpenRouter({
									model: retryModel,
									models: retryModels,
									messages,
									temperature: 0.1, // Lower temperature for retry
									response_format: supportsJsonMode(retryModel)
										? { type: 'json_object' }
										: undefined,
									max_tokens: 8192,
									timeoutMs: options.timeoutMs ?? this.defaultTimeoutMs,
									transforms
								});

								// Guard against malformed retry response
								if (!retryResponse.choices || retryResponse.choices.length === 0) {
									throw new Error(
										'Retry: OpenRouter returned empty choices array'
									);
								}

								const retryChoice = retryResponse.choices[0];
								const retryContent = extractTextFromChoice(retryChoice);
								if (!retryContent || retryContent.trim().length === 0) {
									throw buildOpenRouterEmptyContentError({
										operation: 'getJSONResponse_retry',
										requestedModel: retryModel,
										response: retryResponse,
										choice: retryChoice,
										extractedText: retryContent
									});
								}

								cleanedRetry = cleanJSONResponse(retryContent);
								const parsedRetry = this.parseCleanedJSON<T>({
									cleaned: cleanedRetry,
									allowTruncatedJsonRecovery
								});
								result = parsedRetry.value;
								cleanedRetry = parsedRetry.cleaned;
								if (parsedRetry.repaired) {
									console.warn(
										`Recovered truncated JSON response from retry model ${
											retryResponse.model || retryModel
										}`
									);
								}
								responseForLogging = retryResponse;
								actualModel = retryResponse.model || retryModel;
								retryModelUsed = retryModel;
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
											modelRequested: baseModel,
											retryModel,
											retryAttempt: retryCount,
											maxRetries,
											responseLength: cleanedRetry.length || 0
										}
									);
								}
								throw parseError;
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
										modelUsed: actualModelForError,
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
					this.trackPerformance(actualModel, duration);
					this.trackCost(actualModel, responseForLogging.usage);

					// Calculate costs
					const modelConfig = JSON_MODELS[actualModel];
					const inputCost = modelConfig
						? ((responseForLogging.usage?.prompt_tokens || 0) / 1_000_000) *
							modelConfig.cost
						: 0;
					const outputCost = modelConfig
						? ((responseForLogging.usage?.completion_tokens || 0) / 1_000_000) *
							modelConfig.outputCost
						: 0;

					console.log(`JSON Response Success:
				Model: ${actualModel}
				Duration: ${duration.toFixed(0)}ms
				Tokens: ${responseForLogging.usage?.total_tokens || 'unknown'}
				Cost: ${this.calculateCost(actualModel, responseForLogging.usage)}
			`);

					const usageEvent = {
						model: actualModel,
						promptTokens: responseForLogging.usage?.prompt_tokens || 0,
						completionTokens: responseForLogging.usage?.completion_tokens || 0,
						totalTokens: responseForLogging.usage?.total_tokens || 0,
						inputCost,
						outputCost,
						totalCost: inputCost + outputCost
					};

					if (typeof options.onUsage === 'function') {
						await options.onUsage(usageEvent);
					}

					// Log to database (async, non-blocking)
					const cachedTokens =
						responseForLogging.usage?.prompt_tokens_details?.cached_tokens || 0;
					const modelsAttempted = Array.from(
						new Set<string>([
							...attemptedModels,
							requestedModel,
							actualModel,
							...(retryModelUsed ? [retryModelUsed] : [])
						])
					);
					this.usageLogger
						.logUsageToDatabase({
							userId: options.userId,
							operationType: options.operationType || 'other',
							modelRequested: baseModel,
							modelUsed: actualModel,
							provider: responseForLogging.provider || modelConfig?.provider,
							promptTokens: responseForLogging.usage?.prompt_tokens || 0,
							completionTokens: responseForLogging.usage?.completion_tokens || 0,
							totalTokens: responseForLogging.usage?.total_tokens || 0,
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
							openrouterRequestId: responseForLogging.id,
							openrouterCacheStatus: cachedTokens > 0 ? 'hit' : 'miss',
							metadata: {
								...options.metadata,
								complexity,
								retryCount,
								preferredModels,
								requestedModel,
								modelsAttempted,
								attempts: attempt + 1,
								retryModelUsed,
								cachedTokens,
								reasoningTokens:
									responseForLogging.usage?.completion_tokens_details
										?.reasoning_tokens || 0,
								systemFingerprint: responseForLogging.system_fingerprint
							}
						})
						.catch((err) => console.error('Failed to log usage:', err));

					return result;
				} catch (error) {
					lastError = error as Error;
					attemptedModels.add(requestedModel);
					const shouldRetry =
						error instanceof OpenRouterEmptyContentError ||
						error instanceof SyntaxError ||
						isRetryableOpenRouterError(error);

					if (attempt < maxAttempts - 1 && shouldRetry) {
						console.warn('OpenRouter JSON response retrying after failure', {
							attempt: attempt + 1,
							maxAttempts,
							model: requestedModel,
							error: lastError.message
						});
						continue;
					}

					throw error;
				}
			}

			throw lastError ?? new Error('OpenRouter JSON response failed');
		} catch (error) {
			lastError = error as Error;
			const duration = performance.now() - startTime;
			const requestCompletedAt = new Date();
			const modelsAttempted = Array.from(attemptedModels);
			const lastModel = lastResponse?.model || lastRequestedModel || baseModel;
			const emptyContentDetails =
				error instanceof OpenRouterEmptyContentError ? error.details : undefined;
			const openrouterErrorDetails =
				(error as any)?.openrouter && typeof (error as any).openrouter === 'object'
					? (error as any).openrouter
					: undefined;

			console.error(`OpenRouter request failed:`, error);

			// Log to error tracking system
			if (this.errorLogger) {
				await this.errorLogger.logAPIError(error, this.apiUrl, 'POST', options.userId, {
					operation: 'getJSONResponse',
					errorType: 'llm_api_request_failure',
					modelRequested: baseModel,
					profile,
					complexity,
					isTimeout: lastError.message.includes('timeout'),
					projectId: options.projectId,
					brainDumpId: options.brainDumpId,
					taskId: options.taskId,
					attempts: modelsAttempted.length,
					modelsAttempted,
					lastRequestedModel,
					lastModel,
					openrouterRequestId: lastResponse?.id,
					openrouterProvider: lastResponse?.provider,
					openrouterErrorDetails: openrouterErrorDetails ?? null,
					emptyContentDetails: emptyContentDetails ?? null
				});
			}

			// Log failure to database
			this.usageLogger
				.logUsageToDatabase({
					userId: options.userId,
					operationType: options.operationType || 'other',
					modelRequested: baseModel,
					modelUsed: lastModel,
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
						...options.metadata,
						complexity,
						preferredModels,
						attempts: modelsAttempted.length,
						modelsAttempted,
						lastRequestedModel,
						lastModel,
						openrouterRequestId: lastResponse?.id,
						openrouterProvider: lastResponse?.provider,
						openrouterErrorDetails: openrouterErrorDetails ?? null,
						emptyContentDetails: emptyContentDetails ?? null
					}
				})
				.catch((err) => console.error('Failed to log error:', err));

			throw new Error(`Failed to generate valid JSON: ${lastError?.message}`);
		}
	}

	// ============================================
	// TEXT GENERATION METHOD
	// ============================================

	private async performTextGeneration(
		options: TextGenerationOptions
	): Promise<TextGenerationResult> {
		this.requireUserId(options.userId, 'generateText');
		const requestStartedAt = new Date();
		const startTime = performance.now();
		const profile = options.profile || 'balanced';
		const baseSystemPrompt =
			options.systemPrompt ||
			'You are an expert writer who creates clear, engaging, and well-structured content.';
		let forceFinalAnswerOnly = false;
		let maxTokensOverride = options.maxTokens || 4096;
		let overrideModel: string | null = null;

		// Estimate response length
		const estimatedLength = estimateResponseLength(options.prompt);

		// Select models based on profile and requirements
		const preferredModels = ensureMinimumTextModels(
			selectTextModels(profile, estimatedLength, options.requirements)
		);

		// Make the OpenRouter API call with model routing
		const baseModel = preferredModels[0] || 'openai/gpt-4o-mini';
		const maxAttempts = Math.min(Math.max(preferredModels.length, 1), 3);
		const attemptedModels = new Set<string>();
		let lastResponse: OpenRouterResponse | null = null;
		let lastFinishReason: string | undefined;
		let lastError: Error | null = null;

		try {
			for (let attempt = 0; attempt < maxAttempts; attempt++) {
				const remainingModels = preferredModels.filter(
					(model) => !attemptedModels.has(model)
				);
				const requestedModel =
					overrideModel && !attemptedModels.has(overrideModel)
						? overrideModel
						: remainingModels[0] || baseModel;
				const routingModels = [
					requestedModel,
					...remainingModels.filter((model) => model !== requestedModel)
				];

				let attemptResponse: OpenRouterResponse | null = null;

				try {
					const systemPrompt = forceFinalAnswerOnly
						? `${baseSystemPrompt}\n\n${EMPTY_CONTENT_RETRY_INSTRUCTION}`
						: baseSystemPrompt;
					const messages = [
						{
							role: 'system',
							content: systemPrompt
						},
						{ role: 'user', content: options.prompt }
					];
					const transforms = this.resolveTransforms(messages);
					attemptResponse = await this.openRouterClient.callOpenRouter({
						model: requestedModel, // Primary model with fallback
						models: routingModels.length > 0 ? routingModels : [requestedModel],
						messages,
						temperature: options.temperature || 0.7,
						max_tokens: maxTokensOverride,
						timeoutMs: options.timeoutMs ?? this.defaultTimeoutMs,
						stream: options.streaming || false,
						transforms
					});

					lastResponse = attemptResponse;
					lastFinishReason = attemptResponse.choices?.[0]?.finish_reason;

					// Guard against malformed response
					if (!attemptResponse.choices || attemptResponse.choices.length === 0) {
						throw new Error('OpenRouter returned empty choices array');
					}

					const choice = attemptResponse.choices[0];
					const content = extractTextFromChoice(choice);
					if (!content || content.trim().length === 0) {
						throw buildOpenRouterEmptyContentError({
							operation: 'generateText',
							requestedModel,
							response: attemptResponse,
							choice,
							extractedText: content
						});
					}

					const actualModel = attemptResponse.model || requestedModel;
					const modelsAttempted = Array.from(new Set([...attemptedModels, actualModel]));

					// Track metrics
					const duration = performance.now() - startTime;
					const requestCompletedAt = new Date();
					this.trackPerformance(actualModel, duration);
					this.trackCost(actualModel, attemptResponse.usage);

					// Calculate costs
					const modelConfig = TEXT_MODELS[actualModel];
					const inputCost = modelConfig
						? ((attemptResponse.usage?.prompt_tokens || 0) / 1_000_000) *
							modelConfig.cost
						: 0;
					const outputCost = modelConfig
						? ((attemptResponse.usage?.completion_tokens || 0) / 1_000_000) *
							modelConfig.outputCost
						: 0;

					console.log(`Text Generation Success:
				Model: ${actualModel}
				Duration: ${duration.toFixed(0)}ms
				Length: ${content.length} chars
				Cost: ${this.calculateCost(actualModel, attemptResponse.usage)}
			`);

					const usageEvent = {
						model: actualModel,
						promptTokens: attemptResponse.usage?.prompt_tokens || 0,
						completionTokens: attemptResponse.usage?.completion_tokens || 0,
						totalTokens: attemptResponse.usage?.total_tokens || 0,
						inputCost,
						outputCost,
						totalCost: inputCost + outputCost
					};

					if (typeof options.onUsage === 'function') {
						await options.onUsage(usageEvent);
					}

					// Log to database (async, non-blocking)
					const cachedTokens =
						attemptResponse.usage?.prompt_tokens_details?.cached_tokens || 0;
					this.usageLogger
						.logUsageToDatabase({
							userId: options.userId,
							operationType: options.operationType || 'other',
							modelRequested: baseModel,
							modelUsed: actualModel,
							provider: attemptResponse.provider || modelConfig?.provider,
							promptTokens: attemptResponse.usage?.prompt_tokens || 0,
							completionTokens: attemptResponse.usage?.completion_tokens || 0,
							totalTokens: attemptResponse.usage?.total_tokens || 0,
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
							openrouterRequestId: attemptResponse.id,
							openrouterCacheStatus: cachedTokens > 0 ? 'hit' : 'miss',
							metadata: {
								...options.metadata,
								estimatedLength,
								preferredModels,
								contentLength: content.length,
								cachedTokens,
								attempts: attempt + 1,
								modelsAttempted,
								finishReason: attemptResponse.choices?.[0]?.finish_reason ?? null,
								reasoningTokens:
									attemptResponse.usage?.completion_tokens_details
										?.reasoning_tokens || 0,
								systemFingerprint: attemptResponse.system_fingerprint
							}
						})
						.catch((err) => console.error('Failed to log usage:', err));

					const usage: TextGenerationUsage | undefined = attemptResponse.usage
						? {
								promptTokens: attemptResponse.usage.prompt_tokens || 0,
								completionTokens: attemptResponse.usage.completion_tokens || 0,
								totalTokens: attemptResponse.usage.total_tokens || 0
							}
						: undefined;

					return {
						text: content,
						usage,
						model: actualModel
					};
				} catch (error) {
					lastError = error as Error;
					attemptedModels.add(requestedModel);
					if (attemptResponse?.model && attemptResponse.model !== requestedModel) {
						attemptedModels.add(attemptResponse.model);
					}
					const failedModel = attemptResponse?.model || requestedModel;
					const emptyContentDetails =
						error instanceof OpenRouterEmptyContentError
							? (error.details as {
									inferredCause?: string;
									finishReason?: string;
									usage?: { reasoning_tokens?: number };
								})
							: undefined;
					const inferredCause =
						typeof emptyContentDetails?.inferredCause === 'string'
							? emptyContentDetails.inferredCause
							: null;
					const finishReason =
						typeof emptyContentDetails?.finishReason === 'string'
							? emptyContentDetails.finishReason
							: null;

					if (error instanceof OpenRouterEmptyContentError) {
						forceFinalAnswerOnly = true;
						const reasoningTokens =
							typeof emptyContentDetails?.usage?.reasoning_tokens === 'number'
								? emptyContentDetails.usage.reasoning_tokens
								: null;
						const targetMaxTokens =
							reasoningTokens && reasoningTokens > 0
								? Math.min(
										Math.max(
											reasoningTokens + EMPTY_CONTENT_RETRY_BUFFER_TOKENS,
											EMPTY_CONTENT_RETRY_MIN_TOKENS
										),
										EMPTY_CONTENT_RETRY_MAX_TOKENS
									)
								: EMPTY_CONTENT_RETRY_MIN_TOKENS;
						if (maxTokensOverride < targetMaxTokens) {
							maxTokensOverride = targetMaxTokens;
						}
						if (!overrideModel || attemptedModels.has(overrideModel)) {
							overrideModel = pickEmergencyTextModel(
								preferredModels,
								attemptedModels
							);
						}
					}

					if (attempt < maxAttempts - 1) {
						console.warn('OpenRouter text generation retrying after failure', {
							attempt: attempt + 1,
							maxAttempts,
							model: failedModel,
							error: lastError.message,
							inferredCause,
							finishReason,
							overrideModel,
							maxTokens: maxTokensOverride,
							forceFinalAnswerOnly
						});
						continue;
					}

					throw lastError;
				}
			}

			throw lastError ?? new Error('OpenRouter text generation failed');
		} catch (error) {
			const duration = performance.now() - startTime;
			const requestCompletedAt = new Date();
			const modelsAttempted = Array.from(attemptedModels);
			const lastModel =
				lastResponse?.model || modelsAttempted[modelsAttempted.length - 1] || baseModel;
			const emptyContentDetails =
				error instanceof OpenRouterEmptyContentError ? error.details : undefined;
			const openrouterErrorDetails =
				(error as any)?.openrouter && typeof (error as any).openrouter === 'object'
					? (error as any).openrouter
					: undefined;

			console.error(`OpenRouter text generation failed:`, error);

			// Log to error tracking system
			if (this.errorLogger) {
				await this.errorLogger.logAPIError(error, this.apiUrl, 'POST', options.userId, {
					operation: 'generateText',
					errorType: 'llm_text_generation_failure',
					modelRequested: baseModel,
					profile,
					estimatedLength,
					isTimeout: (error as Error).message.includes('timeout'),
					projectId: options.projectId,
					brainDumpId: options.brainDumpId,
					taskId: options.taskId,
					attempts: modelsAttempted.length,
					modelsAttempted,
					lastModel,
					lastFinishReason,
					openrouterRequestId: lastResponse?.id,
					openrouterProvider: lastResponse?.provider,
					openrouterNativeFinishReason:
						lastResponse?.choices?.[0]?.native_finish_reason ?? null,
					openrouterResponseError: lastResponse?.error ?? null,
					openrouterErrorDetails: openrouterErrorDetails ?? null,
					emptyContentDetails: emptyContentDetails ?? null
				});
			}

			// Log failure to database
			this.usageLogger
				.logUsageToDatabase({
					userId: options.userId,
					operationType: options.operationType || 'other',
					modelRequested: baseModel,
					modelUsed: lastModel,
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
						...options.metadata,
						estimatedLength,
						preferredModels,
						attempts: modelsAttempted.length,
						modelsAttempted,
						lastFinishReason,
						openrouterRequestId: lastResponse?.id,
						openrouterProvider: lastResponse?.provider,
						openrouterNativeFinishReason:
							lastResponse?.choices?.[0]?.native_finish_reason ?? null,
						openrouterResponseError: lastResponse?.error ?? null,
						openrouterErrorDetails: openrouterErrorDetails ?? null,
						emptyContentDetails: emptyContentDetails ?? null
					}
				})
				.catch((err) => console.error('Failed to log error:', err));

			throw new Error('Failed to generate text');
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

	private describePromptCacheStatus(usage: any): string | undefined {
		if (!usage || typeof usage !== 'object') return undefined;

		const promptTokens =
			typeof usage.prompt_tokens === 'number' && Number.isFinite(usage.prompt_tokens)
				? usage.prompt_tokens
				: undefined;
		const cachedTokens =
			typeof usage?.prompt_tokens_details?.cached_tokens === 'number' &&
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

	async transcribeAudio(options: TranscriptionOptions): Promise<TranscriptionResult> {
		this.requireUserId(options.userId, 'transcribeAudio');
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

		const vocabularyPrompt = buildTranscriptionVocabulary(options.vocabularyTerms);
		const audioInput = coerceAudioInput(options.audio, options.audioFile);
		const audioFormat = getAudioFormatForInput(audioInput);
		const base64Audio = await encodeAudioToBase64(audioInput);

		const systemPrompt =
			'You are a transcription engine. Return only the transcript text. Do not add labels, timestamps, or commentary.';
		const userPrompt = `Transcribe the following audio. Use these vocabulary terms if they appear: ${vocabularyPrompt}.`;

		let lastError: Error | null = null;

		for (const model of models) {
			for (let attempt = 0; attempt <= maxRetries; attempt++) {
				try {
					if (attempt > 0) {
						const delay = initialRetryDelayMs * Math.pow(2, attempt - 1);
						await sleep(delay);
					}

					const response = await this.openRouterClient.callOpenRouterAudio({
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

					const choice = response.choices[0];
					const content = extractTextFromChoice(choice);
					if (!content || content.trim().length === 0) {
						throw buildOpenRouterEmptyContentError({
							operation: 'transcribeAudio',
							requestedModel: model,
							response,
							choice,
							extractedText: content
						});
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

					if (!isRetryableTranscriptionError(error) || attempt === maxRetries) {
						break;
					}
				}
			}
		}

		if (this.errorLogger) {
			const emptyContentDetails =
				lastError instanceof OpenRouterEmptyContentError ? lastError.details : undefined;
			const openrouterErrorDetails =
				(lastError as any)?.openrouter && typeof (lastError as any).openrouter === 'object'
					? (lastError as any).openrouter
					: undefined;

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
					requestStartedAt: requestStartedAt.toISOString(),
					openrouterErrorDetails: openrouterErrorDetails ?? null,
					emptyContentDetails: emptyContentDetails ?? null
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
		const response = await this.fetchImpl('https://api.openai.com/v1/embeddings', {
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
		const response = await this.fetchImpl('https://api.openai.com/v1/embeddings', {
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
			reasoning_content?: string;
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
		operationType?: string;
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
	}> {
		this.requireUserId(options.userId, 'streamText');
		const requestStartedAt = new Date();
		const startTime = performance.now();
		const profile = options.profile || 'speed'; // Default to speed for chat

		const needsToolSupport = Array.isArray(options.tools) && options.tools.length > 0;

		// Estimate total input length from all messages
		const totalInputLength = options.messages.reduce(
			(sum, msg) => sum + (msg.content?.length || 0),
			0
		);
		const estimatedLength = estimateResponseLength(
			totalInputLength > 0 ? 'x'.repeat(totalInputLength) : 'default chat message'
		);

		// Select models optimized for chat streaming
		let preferredModels = selectTextModels(
			profile,
			estimatedLength,
			{ maxLatency: 2000 } // Fast response for chat
		);

		if (needsToolSupport) {
			preferredModels = ensureToolCompatibleModels(preferredModels);
		}
		const baseModel = preferredModels[0] || 'openai/gpt-4o-mini';
		let resolvedModel = baseModel;
		let modelResolvedFromStream = false;
		let resolvedProvider = TEXT_MODELS[resolvedModel]?.provider;
		let providerResolvedFromStream = false;

		try {
			const headers = {
				Authorization: `Bearer ${this.apiKey}`,
				'Content-Type': 'application/json',
				'HTTP-Referer': this.httpReferer,
				'X-Title': this.appName
			};

			const maxAttempts = Math.min(Math.max(preferredModels.length, 1), 3);
			const attemptedModels = new Set<string>();
			let response: Response | null = null;
			let lastError: Error | null = null;
			let lastErrorText: string | null = null;

			for (let attempt = 0; attempt < maxAttempts; attempt++) {
				const remainingModels = preferredModels.filter(
					(model) => !attemptedModels.has(model)
				);
				const requestedModel = remainingModels[0] || baseModel;
				const routingModels = [
					requestedModel,
					...remainingModels.filter((model) => model !== requestedModel)
				];

				const messagesForRequest = this.prepareMessagesForModel(
					options.messages,
					routingModels
				);
				const transforms = this.resolveTransforms(messagesForRequest);
				const body: any = {
					model: requestedModel,
					messages: messagesForRequest,
					temperature: options.temperature ?? 0.7,
					max_tokens: options.maxTokens ?? 2000,
					stream: true
				};

				// Add fallback models using extra_body if we have multiple models
				if (routingModels.length > 1) {
					body.extra_body = {
						models: routingModels.slice(1)
					};
				}

				if (transforms && transforms.length > 0) {
					body.transforms = transforms;
				}

				// Add tools if provided
				if (needsToolSupport) {
					body.tools = this.normalizeToolsForRequest(options.tools);
					body.tool_choice = options.tool_choice || 'auto';
				}

				try {
					response = await this.fetchImpl(this.apiUrl, {
						method: 'POST',
						headers,
						body: JSON.stringify(body),
						signal: options.signal
					});
				} catch (error) {
					lastError = error as Error;
					attemptedModels.add(requestedModel);
					if (attempt < maxAttempts - 1 && isRetryableOpenRouterError(error)) {
						console.warn('OpenRouter stream retrying after fetch error', {
							attempt: attempt + 1,
							maxAttempts,
							model: requestedModel,
							error: lastError.message
						});
						continue;
					}
					throw error;
				}

				if (response.ok) {
					resolvedModel = requestedModel;
					resolvedProvider = TEXT_MODELS[requestedModel]?.provider;
					modelResolvedFromStream = false;
					providerResolvedFromStream = false;
					break;
				}

				const errorText = await response.text();
				const statusError = new Error(
					`OpenRouter API error: ${response.status} - ${errorText}`
				) as Error & { status?: number };
				statusError.status = response.status;
				lastError = statusError;
				lastErrorText = errorText;
				attemptedModels.add(requestedModel);

				if (attempt < maxAttempts - 1 && isRetryableOpenRouterError(statusError)) {
					console.warn('OpenRouter stream retrying after failure', {
						attempt: attempt + 1,
						maxAttempts,
						model: requestedModel,
						error: statusError.message
					});
					continue;
				}

				yield {
					type: 'error',
					error: statusError.message
				};
				return;
			}

			if (!response || !response.ok) {
				const message =
					lastError?.message ||
					(lastErrorText
						? `OpenRouter API error: ${lastErrorText}`
						: 'OpenRouter stream request failed');
				const operationType =
					options.operationType || this.buildChatStreamOperationType(options.contextType);

				if (this.errorLogger) {
					await this.errorLogger.logAPIError(
						lastError ?? message,
						this.apiUrl,
						'POST',
						options.userId,
						{
							operation: 'streamText',
							errorType: 'llm_streaming_failure',
							sessionId: options.sessionId,
							messageId: options.messageId,
							statusCode: (lastError as any)?.status ?? response?.status,
							errorText: lastErrorText ?? null
						}
					);
				}

				this.usageLogger
					.logUsageToDatabase({
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
						responseTimeMs: Math.round(performance.now() - startTime),
						requestStartedAt,
						requestCompletedAt: new Date(),
						status: (lastError as Error)?.message?.includes('timeout')
							? 'timeout'
							: 'failure',
						errorMessage: message,
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
							providerResolvedFromStream,
							statusCode: (lastError as any)?.status ?? response?.status,
							errorText: lastErrorText ?? null
						}
					})
					.catch((err) => console.error('Failed to log error:', err));

				yield {
					type: 'error',
					error: message
				};
				return;
			}

			const responseRequestId =
				response.headers.get('x-request-id') ||
				response.headers.get('x-openrouter-request-id') ||
				undefined;
			const responseModelHeader =
				response.headers.get('x-openrouter-model') ||
				response.headers.get('x-model') ||
				undefined;
			const responseProviderHeader =
				response.headers.get('x-openrouter-provider') ||
				response.headers.get('x-provider') ||
				undefined;
			const responseSystemFingerprintHeader =
				response.headers.get('x-openrouter-system-fingerprint') || undefined;

			if (typeof responseModelHeader === 'string' && responseModelHeader.trim().length > 0) {
				resolvedModel = responseModelHeader.trim();
				modelResolvedFromStream = true;
			}
			if (
				typeof responseProviderHeader === 'string' &&
				responseProviderHeader.trim().length > 0
			) {
				resolvedProvider = responseProviderHeader.trim();
				providerResolvedFromStream = true;
			}

			// Process SSE stream
			const reader = response.body?.getReader();
			if (!reader) {
				const operationType =
					options.operationType || this.buildChatStreamOperationType(options.contextType);

				if (this.errorLogger) {
					await this.errorLogger.logAPIError(
						'No response stream available',
						this.apiUrl,
						'POST',
						options.userId,
						{
							operation: 'streamText',
							errorType: 'llm_streaming_failure',
							sessionId: options.sessionId,
							messageId: options.messageId
						}
					);
				}

				this.usageLogger
					.logUsageToDatabase({
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
						responseTimeMs: Math.round(performance.now() - startTime),
						requestStartedAt,
						requestCompletedAt: new Date(),
						status: 'failure',
						errorMessage: 'No response stream available',
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
					})
					.catch((err) => console.error('Failed to log error:', err));

				yield {
					type: 'error',
					error: 'No response stream available'
				};
				return;
			}

			const decoder = new TextDecoder();
			let buffer = '';
			let accumulatedContent = '';
			const toolCallAssembler = new ToolCallAssembler({
				profile: resolveToolCallAssemblerProfile(resolvedProvider, resolvedModel),
				isCompleteJSON: (value) => this.isCompleteJSON(value)
			});
			let usage: any = null;
			let inThinkingBlock = false;
			let linesSinceYield = 0;
			let lastYieldAt = Date.now();
			let streamRequestId: string | undefined = responseRequestId;
			let streamSystemFingerprint: string | undefined = responseSystemFingerprintHeader;

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

						// Yield any pending tool calls that weren't completed
						// This can happen if the stream ends without a finish_reason
						if (toolCallAssembler.hasPending()) {
							for (const pending of toolCallAssembler.drain()) {
								if (!pending?.function?.name) continue;
								const { toolCall: sanitizedToolCall } =
									this.coerceToolCallArguments(pending);
								if (this.shouldLogKimiToolCalls(resolvedModel, needsToolSupport)) {
									void this.writeKimiToolCallLog({
										model: resolvedModel,
										provider: resolvedProvider,
										sessionId: options.sessionId,
										messageId: options.messageId,
										toolCall: sanitizedToolCall
									});
								}
								yield {
									type: 'tool_call',
									tool_call: sanitizedToolCall
								};
							}
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
							const operationType =
								options.operationType ||
								this.buildChatStreamOperationType(options.contextType);

							this.usageLogger
								.logUsageToDatabase({
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
								})
								.catch((err) => console.error('Failed to log usage:', err));
						}

						const reasoningTokens =
							typeof usage?.completion_tokens_details?.reasoning_tokens ===
								'number' &&
							Number.isFinite(usage.completion_tokens_details.reasoning_tokens)
								? usage.completion_tokens_details.reasoning_tokens
								: undefined;
						const cacheStatus = this.describePromptCacheStatus(usage);

						yield {
							type: 'done',
							usage,
							finished_reason: 'stop',
							model: resolvedModel,
							provider: resolvedProvider,
							request_id: streamRequestId,
							requestId: streamRequestId,
							system_fingerprint: streamSystemFingerprint,
							systemFingerprint: streamSystemFingerprint,
							reasoning_tokens: reasoningTokens,
							reasoningTokens,
							cache_status: cacheStatus,
							cacheStatus
						};
						break;
					}

					try {
						const chunk = JSON.parse(data);

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
							resolvedModel = chunk.model;
							modelResolvedFromStream = true;
							if (!providerResolvedFromStream) {
								resolvedProvider = TEXT_MODELS[resolvedModel]?.provider;
							}
							toolCallAssembler.setProfile(
								resolveToolCallAssemblerProfile(resolvedProvider, resolvedModel)
							);
						}
						if (
							typeof chunk?.provider === 'string' &&
							chunk.provider.trim().length > 0
						) {
							resolvedProvider = chunk.provider;
							providerResolvedFromStream = true;
							toolCallAssembler.setProfile(
								resolveToolCallAssemblerProfile(resolvedProvider, resolvedModel)
							);
						}

						// Handle different chunk types
						if (chunk.choices && chunk.choices[0]) {
							const choice = chunk.choices[0];
							const delta = choice.delta;

							if (delta.content) {
								const {
									text: filteredContent,
									inThinkingBlock: nextThinkingState
								} = normalizeStreamingContent(delta.content, inThinkingBlock);

								inThinkingBlock = nextThinkingState;

								if (filteredContent) {
									accumulatedContent += filteredContent;
									yield {
										type: 'text',
										content: filteredContent
									};
								}
							}

							if (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) {
								for (const toolCallDelta of delta.tool_calls) {
									if (!toolCallDelta) continue;
									toolCallAssembler.ingest(toolCallDelta);
								}
							}

							if (choice.finish_reason === 'tool_calls') {
								for (const pending of toolCallAssembler.drain()) {
									if (!pending?.function?.name) continue;
									const { toolCall: sanitizedToolCall } =
										this.coerceToolCallArguments(pending);
									if (
										this.shouldLogKimiToolCalls(resolvedModel, needsToolSupport)
									) {
										void this.writeKimiToolCallLog({
											model: resolvedModel,
											provider: resolvedProvider,
											sessionId: options.sessionId,
											messageId: options.messageId,
											toolCall: sanitizedToolCall
										});
									}
									yield {
										type: 'tool_call',
										tool_call: sanitizedToolCall
									};
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

					linesSinceYield++;
					if (linesSinceYield >= 64 || Date.now() - lastYieldAt >= 16) {
						await this.yieldToEventLoop();
						linesSinceYield = 0;
						lastYieldAt = Date.now();
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
			const operationType =
				options.operationType || this.buildChatStreamOperationType(options.contextType);

			this.usageLogger
				.logUsageToDatabase({
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
				})
				.catch((err) => console.error('Failed to log error:', err));

			yield {
				type: 'error',
				error: `Stream failed: ${(error as Error).message}`
			};
		}
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

	private isKimiK25Model(model?: string): boolean {
		if (!model) return false;
		return model.toLowerCase().startsWith('moonshotai/kimi-k2.5');
	}

	private shouldLogKimiToolCalls(model: string | undefined, hasTools: boolean): boolean {
		return hasTools && this.isKimiK25Model(model);
	}

	private async writeKimiToolCallLog(payload: {
		model?: string;
		provider?: string;
		sessionId?: string;
		messageId?: string;
		toolCall: unknown;
	}): Promise<void> {
		if (typeof process === 'undefined' || !process.versions || !process.versions.node) {
			return;
		}

		try {
			const [{ appendFile, mkdir, access }, path] = await Promise.all([
				import('node:fs/promises'),
				import('node:path')
			]);

			const exists = async (target: string): Promise<boolean> => {
				try {
					await access(target);
					return true;
				} catch {
					return false;
				}
			};

			const resolveBaseDir = async (): Promise<string> => {
				const override =
					process.env.KIMI_TOOL_CALL_LOG_DIR || process.env.BUILDOS_PROMPT_DUMPS_DIR;
				if (override) {
					return path.resolve(override);
				}

				const markers = ['pnpm-workspace.yaml', 'turbo.json', '.git'];
				let current = process.cwd();
				for (let i = 0; i < 8; i++) {
					for (const marker of markers) {
						if (await exists(path.join(current, marker))) {
							return path.join(current, 'apps', 'web', '.prompt-dumps');
						}
					}
					const parent = path.dirname(current);
					if (parent === current) break;
					current = parent;
				}

				return path.resolve(process.cwd(), 'apps', 'web', '.prompt-dumps');
			};

			const baseDir = await resolveBaseDir();
			await mkdir(baseDir, { recursive: true });

			const date = new Date();
			const dateStamp = date.toISOString().slice(0, 10);
			const filePath = path.join(baseDir, `kimi-tool-calls-${dateStamp}.jsonl`);
			const record = {
				timestamp: date.toISOString(),
				model: payload.model ?? null,
				provider: payload.provider ?? null,
				sessionId: payload.sessionId ?? null,
				messageId: payload.messageId ?? null,
				toolCall: payload.toolCall
			};

			await appendFile(filePath, `${JSON.stringify(record)}\n`, 'utf8');
			if (process.env.KIMI_TOOL_CALL_LOG_DEBUG === '1') {
				console.debug('[SmartLLMService] Logged Kimi tool call', {
					baseDir,
					filePath
				});
			}
		} catch (e) {
			// Ignore logging failures to avoid disrupting streaming.
			if (process.env.KIMI_TOOL_CALL_LOG_DEBUG === '1') {
				console.warn('[SmartLLMService] Failed to log Kimi tool call', e);
			}
		}
	}

	private prepareMessagesForModel(
		messages: Array<{
			role: string;
			content: string;
			tool_calls?: any[];
			tool_call_id?: string;
			reasoning_content?: string;
		}>,
		models: string[]
	): Array<{
		role: string;
		content: string;
		tool_calls?: any[];
		tool_call_id?: string;
		reasoning_content?: string;
	}> {
		const needsReasoningContent = this.requiresToolCallReasoningContent(models);
		let mutated = false;
		const updated = messages.map((message) => {
			let next = message;
			let localMutated = false;

			if (message.tool_calls !== undefined) {
				const normalizedToolCalls = this.normalizeToolCallsForRequest(message.tool_calls);
				if (normalizedToolCalls.mutated) {
					next = {
						...next,
						tool_calls: normalizedToolCalls.toolCalls
					};
					localMutated = true;
				}
			}

			if (
				needsReasoningContent &&
				next.role === 'assistant' &&
				Array.isArray(next.tool_calls) &&
				next.tool_calls.length > 0
			) {
				if (typeof next.reasoning_content !== 'string') {
					next = {
						...next,
						reasoning_content: ''
					};
					localMutated = true;
				}
			}

			if (localMutated) {
				mutated = true;
			}
			return next;
		});

		return mutated ? updated : messages;
	}

	private normalizeToolCallsForRequest(toolCalls: unknown): {
		toolCalls?: any[];
		mutated: boolean;
	} {
		if (toolCalls === undefined || toolCalls === null) {
			return { toolCalls: undefined, mutated: false };
		}

		let calls = toolCalls;
		let mutated = false;

		if (!Array.isArray(calls)) {
			if (typeof calls === 'string') {
				try {
					const parsed = JSON.parse(calls);
					if (Array.isArray(parsed)) {
						calls = parsed;
						mutated = true;
					} else {
						return { toolCalls: undefined, mutated: true };
					}
				} catch {
					return { toolCalls: undefined, mutated: true };
				}
			} else {
				return { toolCalls: undefined, mutated: true };
			}
		}

		const sanitized = (calls as any[]).map((call) => {
			const { toolCall, mutated: callMutated } = this.coerceToolCallArguments(call);
			if (callMutated) {
				mutated = true;
			}
			return toolCall;
		});

		return mutated ? { toolCalls: sanitized, mutated } : { toolCalls: calls as any[], mutated };
	}

	private coerceToolCallArguments(toolCall: any): { toolCall: any; mutated: boolean } {
		if (!toolCall || typeof toolCall !== 'object') {
			return { toolCall, mutated: false };
		}

		const fn = toolCall.function;
		if (!fn || typeof fn !== 'object') {
			return { toolCall, mutated: false };
		}

		const args = fn.arguments;
		let nextArgs = args;
		let mutated = false;

		const setArgs = (value: string) => {
			nextArgs = value;
			mutated = true;
		};

		if (args === undefined || args === null) {
			setArgs('{}');
		} else if (typeof args === 'string') {
			const trimmed = args.trim();
			if (!trimmed) {
				setArgs('{}');
			} else if (this.isCompleteJSON(trimmed)) {
				if (trimmed !== args) {
					setArgs(trimmed);
				}
			} else {
				let fixed = trimmed;
				if (fixed.includes('{') && !fixed.endsWith('}')) {
					fixed = fixed.replace(/,\s*$/, '') + '}';
				}
				if (this.isCompleteJSON(fixed)) {
					setArgs(fixed);
				} else {
					setArgs('{}');
				}
			}
		} else if (typeof args === 'object') {
			try {
				setArgs(JSON.stringify(args));
			} catch {
				setArgs('{}');
			}
		} else {
			setArgs('{}');
		}

		if (!mutated) {
			return { toolCall, mutated: false };
		}

		return {
			toolCall: {
				...toolCall,
				function: {
					...fn,
					arguments: nextArgs
				}
			},
			mutated: true
		};
	}

	private requiresToolCallReasoningContent(models: string[]): boolean {
		return models.some(
			(model) => model === 'moonshotai/kimi-k2.5' || model === 'moonshotai/kimi-k2-thinking'
		);
	}

	private normalizeToolsForRequest(tools: any[] | undefined): any[] {
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
							description: tool.function.description ?? '',
							parameters: tool.function.parameters ?? {
								type: 'object',
								properties: {}
							}
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

				const description =
					typeof tool.description === 'string'
						? tool.description
						: typeof tool.function?.description === 'string'
							? tool.function.description
							: '';
				const parameters =
					tool.parameters && typeof tool.parameters === 'object'
						? tool.parameters
						: tool.function?.parameters && typeof tool.function.parameters === 'object'
							? tool.function.parameters
							: { type: 'object', properties: {} };

				return {
					type: 'function',
					function: {
						name,
						description,
						parameters
					}
				};
			})
			.filter(Boolean);

		return normalized.length > 0 ? (normalized as any[]) : tools;
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
