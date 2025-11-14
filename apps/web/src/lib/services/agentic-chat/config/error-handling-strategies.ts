// apps/web/src/lib/services/agentic-chat/config/error-handling-strategies.ts
/**
 * Error Handling and Retry Strategies for Agentic Chat
 *
 * Implements intelligent retry logic with exponential backoff
 * and model fallback strategies for improved reliability
 */

export interface RetryConfig {
	maxRetries: number;
	initialDelayMs: number;
	maxDelayMs: number;
	backoffMultiplier: number;
	retryableErrors: Set<string>;
	fallbackOnError: boolean;
}

export interface ErrorMetadata {
	error: any;
	attempt: number;
	model: string;
	operationType: string;
	timestamp: Date;
	userId?: string;
}

export class ErrorHandler {
	private static readonly DEFAULT_CONFIG: RetryConfig = {
		maxRetries: 3,
		initialDelayMs: 1000,
		maxDelayMs: 10000,
		backoffMultiplier: 2,
		retryableErrors: new Set([
			'rate_limit_exceeded',
			'timeout',
			'service_unavailable',
			'model_overloaded',
			'connection_error'
		]),
		fallbackOnError: true
	};

	/**
	 * Intelligent retry with exponential backoff
	 */
	static async retryWithBackoff<T>(
		fn: () => Promise<T>,
		config: Partial<RetryConfig> = {},
		metadata: Omit<ErrorMetadata, 'error' | 'attempt' | 'timestamp'>
	): Promise<T> {
		const cfg = { ...this.DEFAULT_CONFIG, ...config };
		let lastError: any;

		for (let attempt = 1; attempt <= cfg.maxRetries; attempt++) {
			try {
				return await fn();
			} catch (error: any) {
				lastError = error;

				// Log error for monitoring
				await this.logError({
					...metadata,
					error,
					attempt,
					timestamp: new Date()
				});

				// Check if error is retryable
				if (!this.isRetryableError(error, cfg.retryableErrors)) {
					throw error;
				}

				// Check if we've exhausted retries
				if (attempt === cfg.maxRetries) {
					break;
				}

				// Calculate delay with exponential backoff
				const delay = Math.min(
					cfg.initialDelayMs * Math.pow(cfg.backoffMultiplier, attempt - 1),
					cfg.maxDelayMs
				);

				console.log(
					`[ErrorHandler] Retry ${attempt}/${cfg.maxRetries} after ${delay}ms for ${metadata.operationType}`
				);

				// Add jitter to prevent thundering herd
				const jitter = Math.random() * 0.3 * delay;
				await this.sleep(delay + jitter);
			}
		}

		// All retries exhausted
		throw new Error(`Failed after ${cfg.maxRetries} retries: ${lastError?.message}`);
	}

	/**
	 * Model-specific error handling
	 */
	static handleModelError(
		error: any,
		model: string
	): {
		shouldRetry: boolean;
		shouldFallback: boolean;
		suggestedFallback?: string;
		waitTime?: number;
	} {
		const errorMessage = error.message?.toLowerCase() || '';

		// Rate limiting
		if (errorMessage.includes('rate') || error.code === 429) {
			// Different models have different rate limits
			const waitTimes: Record<string, number> = {
				'anthropic/claude-3-5-sonnet': 10000,
				'anthropic/claude-3-5-haiku': 5000,
				'openai/gpt-4o': 8000,
				'deepseek/deepseek-chat': 3000,
				'google/gemini-2.5-flash-lite': 2000
			};

			return {
				shouldRetry: true,
				shouldFallback: false,
				waitTime: waitTimes[model] || 5000
			};
		}

		// Model overload
		if (errorMessage.includes('overload') || errorMessage.includes('capacity')) {
			// Suggest fallback to less loaded model
			const fallbacks: Record<string, string> = {
				'anthropic/claude-3-5-sonnet': 'deepseek/deepseek-reasoner',
				'anthropic/claude-3-5-haiku': 'deepseek/deepseek-chat',
				'openai/gpt-4o': 'openai/gpt-4o-mini',
				'deepseek/deepseek-reasoner': 'deepseek/deepseek-chat'
			};

			return {
				shouldRetry: false,
				shouldFallback: true,
				suggestedFallback: fallbacks[model]
			};
		}

		// Context length exceeded
		if (errorMessage.includes('context') || errorMessage.includes('token')) {
			return {
				shouldRetry: false,
				shouldFallback: true,
				suggestedFallback: 'google/gemini-2.5-flash-lite' // Has 200k context
			};
		}

		// Default: retry with backoff
		return {
			shouldRetry: true,
			shouldFallback: false,
			waitTime: 3000
		};
	}

	/**
	 * Operation-specific error recovery
	 */
	static async recoverFromError(error: any, operationType: string, context: any): Promise<any> {
		console.log(`[ErrorHandler] Attempting recovery for ${operationType}`, error);

		switch (operationType) {
			case 'planner_stream':
				// For planner errors, provide a safe default response
				return {
					type: 'error_recovery',
					message:
						'I encountered an issue processing your request. Let me try a simpler approach.',
					suggestedAction: 'retry_simplified'
				};

			case 'tool_execution':
				// For tool errors, skip the tool and continue
				return {
					type: 'tool_skipped',
					reason: error.message,
					continueWithoutTool: true
				};

			case 'plan_generation':
				// For plan generation, provide a basic fallback plan
				return {
					type: 'fallback_plan',
					steps: [
						{ action: 'analyze_request', status: 'pending' },
						{ action: 'gather_information', status: 'pending' },
						{ action: 'execute_task', status: 'pending' }
					]
				};

			default:
				// Generic recovery
				return {
					type: 'generic_recovery',
					message: 'Operation failed but can continue',
					skipOperation: true
				};
		}
	}

	/**
	 * Check if error is retryable
	 */
	private static isRetryableError(error: any, retryableErrors: Set<string>): boolean {
		const errorMessage = error.message?.toLowerCase() || '';
		const errorCode = error.code?.toLowerCase() || '';

		// Check against retryable error set
		for (const retryable of retryableErrors) {
			if (errorMessage.includes(retryable) || errorCode.includes(retryable)) {
				return true;
			}
		}

		// Check HTTP status codes
		if (error.status) {
			const retryableStatuses = [429, 500, 502, 503, 504];
			return retryableStatuses.includes(error.status);
		}

		return false;
	}

	/**
	 * Log error for monitoring
	 */
	private static async logError(metadata: ErrorMetadata): Promise<void> {
		// In production, this would send to your monitoring service
		console.error('[ErrorHandler] Error logged:', {
			...metadata,
			errorMessage: metadata.error?.message,
			errorCode: metadata.error?.code,
			errorStatus: metadata.error?.status
		});

		// Track in database for analysis
		// await supabase.from('llm_errors').insert({...})
	}

	/**
	 * Sleep utility
	 */
	private static sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	/**
	 * Circuit breaker pattern for failing services
	 */
	static createCircuitBreaker(threshold: number = 5, resetTimeMs: number = 60000) {
		let failures = 0;
		let lastFailureTime = 0;
		let isOpen = false;

		return {
			async execute<T>(fn: () => Promise<T>): Promise<T> {
				// Check if circuit should be reset
				if (isOpen && Date.now() - lastFailureTime > resetTimeMs) {
					isOpen = false;
					failures = 0;
					console.log('[CircuitBreaker] Reset after timeout');
				}

				// If circuit is open, fail fast
				if (isOpen) {
					throw new Error('Circuit breaker is open - service unavailable');
				}

				try {
					const result = await fn();
					// Success - reset failure count
					failures = 0;
					return result;
				} catch (error) {
					failures++;
					lastFailureTime = Date.now();

					if (failures >= threshold) {
						isOpen = true;
						console.log(`[CircuitBreaker] Opened after ${failures} failures`);
					}

					throw error;
				}
			},

			getState() {
				return {
					isOpen,
					failures,
					lastFailureTime
				};
			}
		};
	}
}
