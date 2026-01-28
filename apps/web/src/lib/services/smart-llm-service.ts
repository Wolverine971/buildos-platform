// apps/web/src/lib/services/smart-llm-service.ts

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { PRIVATE_OPENROUTER_API_KEY } from '$env/static/private';
import { ErrorLoggerService } from './errorLogger.service';
import type {
	JSONProfile,
	TextProfile,
	JSONRequestOptions,
	TextGenerationOptions,
	TextGenerationUsage,
	TextGenerationResult,
	TranscriptionOptions,
	TranscriptionResult,
	OpenRouterResponse
} from './smart-llm/types';
import {
	JSON_MODELS,
	TEXT_MODELS,
	EMPTY_CONTENT_RETRY_INSTRUCTION,
	EMPTY_CONTENT_RETRY_MIN_TOKENS,
	EMPTY_CONTENT_RETRY_BUFFER_TOKENS,
	EMPTY_CONTENT_RETRY_MAX_TOKENS
} from './smart-llm/model-config';
import {
	OpenRouterEmptyContentError,
	buildOpenRouterEmptyContentError,
	isRetryableOpenRouterError
} from './smart-llm/errors';
import {
	analyzeComplexity,
	ensureMinimumTextModels,
	ensureToolCompatibleModels,
	estimateResponseLength,
	pickEmergencyTextModel,
	selectJSONModels,
	selectTextModels,
	supportsJsonMode
} from './smart-llm/model-selection';
import { OpenRouterClient } from './smart-llm/openrouter-client';
import {
	cleanJSONResponse,
	enhanceSystemPromptForJSON,
	extractTextFromChoice,
	normalizeStreamingContent
} from './smart-llm/response-parsing';
import {
	buildTranscriptionVocabulary,
	encodeAudioToBase64,
	getAudioFormat,
	isRetryableTranscriptionError,
	sleep
} from './smart-llm/transcription-utils';
import { LLMUsageLogger } from './smart-llm/usage-logger';

export type {
	JSONProfile,
	TextProfile,
	ModelProfile,
	JSONRequestOptions,
	TextGenerationOptions,
	TextGenerationUsage,
	TextGenerationResult,
	TranscriptionProvider,
	TranscriptionOptions,
	TranscriptionResult
} from './smart-llm/types';

// ============================================
// MAIN SERVICE CLASS
// ============================================

export class SmartLLMService {
	private apiKey: string = PRIVATE_OPENROUTER_API_KEY;
	private apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
	private costTracking = new Map<string, number>();
	private performanceMetrics = new Map<string, number[]>();
	private errorLogger?: ErrorLoggerService;
	private openRouterClient: OpenRouterClient;
	private usageLogger: LLMUsageLogger;

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
		this.openRouterClient = new OpenRouterClient({
			apiKey: this.apiKey,
			apiUrl: this.apiUrl,
			httpReferer: this.httpReferer,
			appName: this.appName,
			errorLogger: this.errorLogger
		});
		this.usageLogger = new LLMUsageLogger({
			supabase: this.supabase,
			errorLogger: this.errorLogger
		});
	}

	// ============================================
	// JSON RESPONSE METHOD
	// ============================================

	async getJSONResponse<T = any>(options: JSONRequestOptions): Promise<T> {
		const requestStartedAt = new Date();
		const startTime = performance.now();
		const profile = options.profile || 'balanced';

		// Analyze prompt complexity
		const complexity = analyzeComplexity(options.systemPrompt + options.userPrompt);

		// Select models based on profile and requirements
		const preferredModels = selectJSONModels(profile, complexity, options.requirements);

		// Add JSON-specific instructions to system prompt
		const enhancedSystemPrompt = enhanceSystemPromptForJSON(options.systemPrompt);

		let lastError: Error | null = null;
		let retryCount = 0;
		const maxRetries = options.validation?.maxRetries || 2;
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
						messages: [
							{ role: 'system', content: enhancedSystemPrompt },
							{ role: 'user', content: options.userPrompt }
						],
						temperature: options.temperature || 0.2,
						response_format: useJsonMode ? { type: 'json_object' } : undefined,
						max_tokens: 8192
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
						result = JSON.parse(cleaned) as T;
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
									messages: [
										{ role: 'system', content: enhancedSystemPrompt },
										{ role: 'user', content: options.userPrompt }
									],
									temperature: 0.1, // Lower temperature for retry
									response_format: supportsJsonMode(retryModel)
										? { type: 'json_object' }
										: undefined,
									max_tokens: 8192
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
								result = JSON.parse(cleanedRetry) as T;
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
					attemptResponse = await this.openRouterClient.callOpenRouter({
						model: requestedModel, // Primary model with fallback
						models: routingModels.length > 0 ? routingModels : [requestedModel],
						messages: [
							{
								role: 'system',
								content: systemPrompt
							},
							{ role: 'user', content: options.prompt }
						],
						temperature: options.temperature || 0.7,
						max_tokens: maxTokensOverride,
						timeoutMs: options.timeoutMs,
						stream: options.streaming || false
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

		const vocabularyPrompt = buildTranscriptionVocabulary(options.vocabularyTerms);
		const audioFormat = getAudioFormat(options.audioFile.type, options.audioFile.name);
		const base64Audio = await encodeAudioToBase64(options.audioFile);

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

				// Add tools if provided
				if (needsToolSupport) {
					body.tools = this.normalizeToolsForRequest(options.tools);
					body.tool_choice = options.tool_choice || 'auto';
				}

				try {
					response = await fetch(this.apiUrl, {
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
				yield {
					type: 'error',
					error: message
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
		if (!this.requiresToolCallReasoningContent(models)) {
			return messages;
		}

		let mutated = false;
		const updated = messages.map((message) => {
			if (
				message.role === 'assistant' &&
				Array.isArray(message.tool_calls) &&
				message.tool_calls.length > 0
			) {
				if (typeof message.reasoning_content !== 'string') {
					mutated = true;
					return {
						...message,
						reasoning_content: ''
					};
				}
			}
			return message;
		});

		return mutated ? updated : messages;
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
