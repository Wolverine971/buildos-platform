// worker-queue/src/lib/services/llm-pool.ts
import type { LLMProvider, LLMRequest, LLMResponse, LLMModel } from '../types/llm';
import type { ActivityLogger } from '../utils/activityLogger';

export interface LLMGenerationOptions {
	systemPrompt?: string;
	temperature?: number;
	maxTokens?: number;
	metadata?: any;
}

export class LLMPool {
	private providers: LLMProvider[];
	private activityLogger: ActivityLogger;

	constructor(providers: LLMProvider[], activityLogger: ActivityLogger) {
		// Sort providers by priority
		this.providers = [...providers].sort((a, b) => a.priority - b.priority);
		this.activityLogger = activityLogger;
	}

	async makeRequest<T = any>(request: LLMRequest): Promise<LLMResponse<T>> {
		const startTime = Date.now();
		const attemptedProviders: string[] = [];
		let lastError: Error | null = null;

		// Get ordered list of providers to try
		const providersToTry = this.getProvidersToTry(request.preferredModels);

		for (const { provider, model } of providersToTry) {
			attemptedProviders.push(`${provider.name}/${model.name}`);

			try {
				// Check if provider is healthy (optional)
				if (provider.healthCheckEndpoint) {
					const isHealthy = await this.checkProviderHealth(provider);
					if (!isHealthy) {
						console.log(`Provider ${provider.name} is not healthy, skipping...`);
						continue;
					}
				}

				const result = await this.callProvider<T>(provider, model, request);

				// Log success
				const duration = Date.now() - startTime;
				await this.activityLogger.logActivity(request.userId || 'unknown-user', 'llm_request_success', {
					provider: provider.name,
					model: model.id,
					duration_ms: duration,
					input_length: request.userPrompt.length,
					attempted_providers: attemptedProviders
				});

				return {
					result,
					provider: provider.name,
					model: model.id,
					duration,
					attemptedProviders
				};
			} catch (error) {
				lastError = error instanceof Error ? error : new Error('Unknown error');
				console.error(`Failed to call ${provider.name}/${model.name}:`, error);

				// Continue to next provider
				continue;
			}
		}

		// All providers failed
		const duration = Date.now() - startTime;
		await this.activityLogger.logActivity(request.userId || 'unknown-user', 'llm_request_failed', {
			error: lastError?.message || 'All providers failed',
			duration_ms: duration,
			input_length: request.userPrompt.length,
			attempted_providers: attemptedProviders
		});

		throw new Error(`All LLM providers failed. Last error: ${lastError?.message}`);
	}

	private getProvidersToTry(
		preferredModels?: string[]
	): Array<{ provider: LLMProvider; model: LLMModel }> {
		const result: Array<{ provider: LLMProvider; model: LLMModel }> = [];

		// First, add preferred models if specified
		if (preferredModels?.length) {
			for (const modelId of preferredModels) {
				for (const provider of this.providers) {
					const model = provider.models.find((m) => m.id === modelId);
					if (model) {
						result.push({ provider, model });
					}
				}
			}
		}

		// Then add all other models by provider priority
		for (const provider of this.providers) {
			for (const model of provider.models) {
				// Skip if already in preferred list
				if (!result.some((r) => r.provider.id === provider.id && r.model.id === model.id)) {
					result.push({ provider, model });
				}
			}
		}

		return result;
	}

	private async checkProviderHealth(provider: LLMProvider): Promise<boolean> {
		if (!provider.healthCheckEndpoint) return true;

		try {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 5000); // 5s health check timeout
			let headers: any = {};
			if (provider.apiKey) {
				headers.Authorization = `Bearer ${provider.apiKey}`;
			}

			const response = await fetch(`${provider.healthCheckEndpoint}`, {
				headers,
				signal: controller.signal
			});

			clearTimeout(timeout);
			return response.ok;
		} catch {
			return false;
		}
	}

	private async callProvider<T>(
		provider: LLMProvider,
		model: LLMModel,
		request: LLMRequest
	): Promise<T> {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), provider.timeout || 30000);

		try {
			// Determine if this is a generate or chat endpoint
			const isGenerateEndpoint = provider.url.includes('/api/generate');
			const isChatEndpoint = provider.url.includes('/chat/completions');

			const headers: any = {
				'Content-Type': 'application/json'
			};

			if (provider.apiKey) {
				headers.Authorization = `Bearer ${provider.apiKey}`;
			}

			let body: any;

			if (isGenerateEndpoint) {
				// Ollama generate endpoint - merge prompts if needed
				const prompt = request.systemPrompt
					? `${request.systemPrompt}\n\n${request.userPrompt}`
					: request.userPrompt;

				body = {
					model: model.id,
					prompt: prompt,
					stream: false
				};

				if (model.supportsTemperature === true) {
					body.temperature = request.temperature ?? model.defaultTemperature ?? 0.7;
				}

				// Handle JSON mode for generate endpoint
				if (request.responseFormat === 'json' && model.supportsJsonMode) {
					body.format = 'json';
				}
			} else if (isChatEndpoint) {
				// Chat completions endpoint (OpenAI-compatible)
				const messages = [];

				// Add system message if provided
				if (request.systemPrompt) {
					messages.push({ role: 'system', content: request.systemPrompt });
				}

				// Add user message
				messages.push({ role: 'user', content: request.userPrompt });

				// If no system prompt support, merge into user message
				if (!request.systemPrompt) {
					messages[0] = { role: 'user', content: request.userPrompt };
				} else if (model?.supportsSystemPrompt === false) {
					// Merge system and user prompts
					messages.length = 0;
					messages.push({
						role: 'user',
						content: `${request.systemPrompt}\n\n${request.userPrompt}`
					});
				}

				body = {
					model: model.id,
					messages: messages
				};

				if (model.supportsTemperature === true) {
					body.temperature = request.temperature ?? model.defaultTemperature ?? 0.7;
				}

				// Handle JSON mode for chat endpoint
				if (request.responseFormat === 'json' && model.supportsJsonMode) {
					if (provider.id === 'openai') {
						body.response_format = { type: 'json_object' };
					} else {
						// Most OpenAI-compatible APIs use 'format'
						body.format = 'json';
					}
				}
			} else {
				throw new Error(`Unknown endpoint type for provider ${provider.name}`);
			}

			const response = await fetch(provider.url, {
				method: 'POST',
				headers,
				body: JSON.stringify(body),
				signal: controller.signal
			});

			clearTimeout(timeout);

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
			}

			const result: any = await response.json();

			let content: string;

			if (isGenerateEndpoint) {
				// Ollama generate endpoint returns response directly
				content = result.response;
			} else if (isChatEndpoint) {
				// Chat completions format
				if (!result.choices?.[0]?.message?.content) {
					throw new Error('Invalid response from LLM API: no content in choices');
				}
				content = result.choices[0].message.content;
			} else {
				throw new Error('Unable to parse response from LLM');
			}

			if (request.responseFormat === 'json') {
				try {
					const cleanedContent = this.cleanLLMJsonResponse(content);
					return JSON.parse(cleanedContent) as T;
				} catch (parseError: any) {
					console.error('Failed to parse JSON response:', content);
					throw new Error(
						`Invalid JSON response from ${provider.name}: ${parseError.message}`
					);
				}
			}

			return content as T;
		} catch (error: any) {
			clearTimeout(timeout);
			if (error.name === 'AbortError') {
				throw new Error(`Request to ${provider.name} timed out`);
			}
			throw error;
		}
	}

	cleanLLMJsonResponse(raw: string): string {
		// Trim leading/trailing whitespace
		let cleaned = raw.trim();

		// Regex to remove code fences if they exist
		const codeFenceRegex = /^```(?:json)?\n([\s\S]*?)\n```$/i;
		const match = cleaned.match(codeFenceRegex);

		if (match) {
			cleaned = match[1].trim();
		}

		return cleaned;
	}

	// Utility methods
	addProvider(provider: LLMProvider): void {
		this.providers.push(provider);
		this.providers.sort((a, b) => a.priority - b.priority);
	}

	/**
	 * Convenience method for generating content (similar to the old LLMService)
	 */
	async generateContent(
		prompt: string,
		userId: string,
		options: LLMGenerationOptions = {}
	): Promise<string> {
		const startTime = Date.now();

		try {
			const systemPrompt =
				options.systemPrompt ||
				'You are an expert at creating actionable, insightful daily briefs for personal productivity and life management.';

			const response = await this.makeRequest({
				systemPrompt,
				userPrompt: prompt,
				userId,
				temperature: options.temperature || 0.7,
				preferredModels: ['mistral:7b-instruct-q4_K_M', 'gpt-4o-mini']
			});

			const content = await response?.result;

			// Log metrics
			const duration = Date.now() - startTime;
			await this.activityLogger.logSystemMetric(
				`llm_call_duration_${response?.provider || 'unknown'}`,
				duration,
				'milliseconds',
				`LLM call for ${options.metadata?.context || 'content generation'}`
			);

			return content;
		} catch (error) {
			console.error('Error generating content:', error);
			throw error;
		}
	}

	/**
	 * Generate embeddings using OpenAI API
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

		const result: any = await response.json();
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

		const result: any = await response.json();
		return result?.data.map((d: any) => d.embedding);
	}

	removeProvider(providerId: string): void {
		this.providers = this.providers.filter((p) => p.id !== providerId);
	}

	updateProviderPriority(providerId: string, newPriority: number): void {
		const provider = this.providers.find((p) => p.id === providerId);
		if (provider) {
			provider.priority = newPriority;
			this.providers.sort((a, b) => a.priority - b.priority);
		}
	}

	getProviders(): LLMProvider[] {
		return [...this.providers];
	}
}
