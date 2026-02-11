// apps/web/src/lib/services/ontology/migration-llm.service.ts
// LLM Rate Limiter, Circuit Breaker, and Cost Estimation for Migration

export interface RateLimitConfig {
	maxRequestsPerMinute: number;
	maxTokensPerMinute: number;
	circuitBreakerThreshold: number;
	circuitBreakerResetMs: number;
}

export interface TokenCosts {
	input: number; // Cost per 1000 tokens
	output: number; // Cost per 1000 tokens
}

export interface CostEstimate {
	tokens: number;
	cost: number;
	breakdown: {
		inputTokens: number;
		outputTokens: number;
		inputCost: number;
		outputCost: number;
	};
	estimatedDuration: string;
	model: string;
}

export interface LLMUsageMetadata {
	provider: 'openai' | 'deepseek';
	model: string;
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
	estimatedCost: number;
	durationMs: number;
}

// Token costs per 1000 tokens (as of Dec 2025)
const TOKEN_COSTS: Record<string, TokenCosts> = {
	'gpt-4o': { input: 0.0025, output: 0.01 },
	'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
	'gpt-4-turbo': { input: 0.01, output: 0.03 },
	'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
	'deepseek-chat': { input: 0.00014, output: 0.00028 },
	'deepseek-coder': { input: 0.00014, output: 0.00028 }
};

// Estimated tokens per entity type (based on typical prompt/response sizes)
const TOKENS_PER_ENTITY: Record<'project' | 'task' | 'phase', { input: number; output: number }> = {
	project: { input: 800, output: 400 }, // Template inference + property extraction
	task: { input: 200, output: 100 }, // Work mode classification
	phase: { input: 300, output: 150 } // Plan type inference
};

// Average processing time per entity (ms)
const PROCESSING_TIME_PER_ENTITY: Record<'project' | 'task' | 'phase', number> = {
	project: 3000, // 3 seconds
	task: 500, // 0.5 seconds
	phase: 1000 // 1 second
};

const DEFAULT_CONFIG: RateLimitConfig = {
	maxRequestsPerMinute: 60,
	maxTokensPerMinute: 100000,
	circuitBreakerThreshold: 5,
	circuitBreakerResetMs: 60000
};

/**
 * LLM Rate Limiter with Circuit Breaker
 * Manages rate limiting and circuit breaking for LLM calls during migration
 */
export class LLMRateLimiter {
	private config: RateLimitConfig;
	private requestCount = 0;
	private tokenCount = 0;
	private errorCount = 0;
	private isCircuitOpen = false;
	private windowStart = Date.now();
	private circuitOpenedAt: number | null = null;

	constructor(config: Partial<RateLimitConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	/**
	 * Acquire permission to make an LLM request
	 * @throws Error if rate limited or circuit is open
	 */
	async acquire(estimatedTokens: number): Promise<void> {
		// Check circuit breaker
		if (this.isCircuitOpen) {
			const elapsed = Date.now() - (this.circuitOpenedAt ?? 0);
			if (elapsed >= this.config.circuitBreakerResetMs) {
				// Reset circuit breaker
				this.isCircuitOpen = false;
				this.circuitOpenedAt = null;
				this.errorCount = 0;
			} else {
				const remainingMs = this.config.circuitBreakerResetMs - elapsed;
				throw new Error(
					`Circuit breaker open. LLM requests paused for ${Math.ceil(remainingMs / 1000)} seconds.`
				);
			}
		}

		// Reset window if needed
		const now = Date.now();
		if (now - this.windowStart >= 60000) {
			this.requestCount = 0;
			this.tokenCount = 0;
			this.windowStart = now;
		}

		// Check request limit
		if (this.requestCount >= this.config.maxRequestsPerMinute) {
			const waitTime = 60000 - (now - this.windowStart);
			await this.sleep(waitTime);
			this.requestCount = 0;
			this.tokenCount = 0;
			this.windowStart = Date.now();
		}

		// Check token limit
		if (this.tokenCount + estimatedTokens >= this.config.maxTokensPerMinute) {
			const waitTime = 60000 - (now - this.windowStart);
			await this.sleep(waitTime);
			this.requestCount = 0;
			this.tokenCount = 0;
			this.windowStart = Date.now();
		}

		this.requestCount++;
		this.tokenCount += estimatedTokens;
	}

	/**
	 * Record a successful LLM request
	 */
	recordSuccess(): void {
		this.errorCount = Math.max(0, this.errorCount - 1);
	}

	/**
	 * Record a failed LLM request
	 */
	recordError(): void {
		this.errorCount++;
		if (this.errorCount >= this.config.circuitBreakerThreshold) {
			this.isCircuitOpen = true;
			this.circuitOpenedAt = Date.now();
		}
	}

	/**
	 * Get current rate limiter status
	 */
	getStatus(): {
		requestsRemaining: number;
		tokensRemaining: number;
		isCircuitOpen: boolean;
		circuitResetIn: number | null;
		windowResetIn: number;
	} {
		const now = Date.now();
		const windowResetIn = Math.max(0, 60000 - (now - this.windowStart));

		let circuitResetIn: number | null = null;
		if (this.isCircuitOpen && this.circuitOpenedAt) {
			circuitResetIn = Math.max(
				0,
				this.config.circuitBreakerResetMs - (now - this.circuitOpenedAt)
			);
		}

		return {
			requestsRemaining: Math.max(0, this.config.maxRequestsPerMinute - this.requestCount),
			tokensRemaining: Math.max(0, this.config.maxTokensPerMinute - this.tokenCount),
			isCircuitOpen: this.isCircuitOpen,
			circuitResetIn,
			windowResetIn
		};
	}

	/**
	 * Force reset the circuit breaker (admin action)
	 */
	forceResetCircuit(): void {
		this.isCircuitOpen = false;
		this.circuitOpenedAt = null;
		this.errorCount = 0;
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}

/**
 * Estimate migration cost for a given set of entities
 */
export function estimateMigrationCost(
	projectCount: number,
	avgTasksPerProject: number = 8,
	avgPhasesPerProject: number = 2,
	model: string = 'deepseek-chat'
): CostEstimate {
	const costs = TOKEN_COSTS[model] ?? TOKEN_COSTS['deepseek-chat']!;

	// Calculate total tokens
	const projectInputTokens = projectCount * TOKENS_PER_ENTITY.project.input;
	const projectOutputTokens = projectCount * TOKENS_PER_ENTITY.project.output;

	const taskCount = projectCount * avgTasksPerProject;
	const taskInputTokens = taskCount * TOKENS_PER_ENTITY.task.input;
	const taskOutputTokens = taskCount * TOKENS_PER_ENTITY.task.output;

	const phaseCount = projectCount * avgPhasesPerProject;
	const phaseInputTokens = phaseCount * TOKENS_PER_ENTITY.phase.input;
	const phaseOutputTokens = phaseCount * TOKENS_PER_ENTITY.phase.output;

	const totalInputTokens = projectInputTokens + taskInputTokens + phaseInputTokens;
	const totalOutputTokens = projectOutputTokens + taskOutputTokens + phaseOutputTokens;
	const totalTokens = totalInputTokens + totalOutputTokens;

	// Calculate costs (costs are per 1000 tokens)
	const inputCost = (totalInputTokens / 1000) * costs.input;
	const outputCost = (totalOutputTokens / 1000) * costs.output;
	const totalCost = inputCost + outputCost;

	// Estimate duration
	const processingTimeMs =
		projectCount * PROCESSING_TIME_PER_ENTITY.project +
		taskCount * PROCESSING_TIME_PER_ENTITY.task +
		phaseCount * PROCESSING_TIME_PER_ENTITY.phase;

	const estimatedDuration = formatDuration(processingTimeMs);

	return {
		tokens: totalTokens,
		cost: Math.round(totalCost * 1000) / 1000, // Round to 3 decimal places
		breakdown: {
			inputTokens: totalInputTokens,
			outputTokens: totalOutputTokens,
			inputCost: Math.round(inputCost * 1000) / 1000,
			outputCost: Math.round(outputCost * 1000) / 1000
		},
		estimatedDuration,
		model
	};
}

/**
 * Estimate cost for specific entity counts
 */
export function estimateCostForEntities(counts: {
	projects: number;
	tasks: number;
	phases: number;
	model?: string;
}): CostEstimate {
	const model = counts.model || 'deepseek-chat';
	const costs = TOKEN_COSTS[model] ?? TOKEN_COSTS['deepseek-chat']!;

	const projectInputTokens = counts.projects * TOKENS_PER_ENTITY.project.input;
	const projectOutputTokens = counts.projects * TOKENS_PER_ENTITY.project.output;
	const taskInputTokens = counts.tasks * TOKENS_PER_ENTITY.task.input;
	const taskOutputTokens = counts.tasks * TOKENS_PER_ENTITY.task.output;
	const phaseInputTokens = counts.phases * TOKENS_PER_ENTITY.phase.input;
	const phaseOutputTokens = counts.phases * TOKENS_PER_ENTITY.phase.output;

	const totalInputTokens = projectInputTokens + taskInputTokens + phaseInputTokens;
	const totalOutputTokens = projectOutputTokens + taskOutputTokens + phaseOutputTokens;
	const totalTokens = totalInputTokens + totalOutputTokens;

	const inputCost = (totalInputTokens / 1000) * costs.input;
	const outputCost = (totalOutputTokens / 1000) * costs.output;
	const totalCost = inputCost + outputCost;

	const processingTimeMs =
		counts.projects * PROCESSING_TIME_PER_ENTITY.project +
		counts.tasks * PROCESSING_TIME_PER_ENTITY.task +
		counts.phases * PROCESSING_TIME_PER_ENTITY.phase;

	return {
		tokens: totalTokens,
		cost: Math.round(totalCost * 1000) / 1000,
		breakdown: {
			inputTokens: totalInputTokens,
			outputTokens: totalOutputTokens,
			inputCost: Math.round(inputCost * 1000) / 1000,
			outputCost: Math.round(outputCost * 1000) / 1000
		},
		estimatedDuration: formatDuration(processingTimeMs),
		model
	};
}

/**
 * Format duration in human-readable format
 */
function formatDuration(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);

	if (hours > 0) {
		const remainingMinutes = minutes % 60;
		return `~${hours}h ${remainingMinutes}m`;
	} else if (minutes > 0) {
		return `~${minutes} minutes`;
	} else {
		return `~${seconds} seconds`;
	}
}

/**
 * Create LLM usage metadata for migration log
 */
export function createLLMUsageMetadata(
	provider: 'openai' | 'deepseek',
	model: string,
	inputTokens: number,
	outputTokens: number,
	durationMs: number
): LLMUsageMetadata {
	const costs = TOKEN_COSTS[model] ?? TOKEN_COSTS['deepseek-chat']!;
	const estimatedCost = (inputTokens / 1000) * costs.input + (outputTokens / 1000) * costs.output;

	return {
		provider,
		model,
		inputTokens,
		outputTokens,
		totalTokens: inputTokens + outputTokens,
		estimatedCost: Math.round(estimatedCost * 10000) / 10000, // 4 decimal places
		durationMs
	};
}

/**
 * Get available models with their costs
 */
export function getAvailableModels(): Array<{
	id: string;
	name: string;
	costs: TokenCosts;
	recommended: boolean;
}> {
	return [
		{
			id: 'deepseek-chat',
			name: 'DeepSeek Chat',
			costs: TOKEN_COSTS['deepseek-chat']!,
			recommended: true
		},
		{
			id: 'gpt-4o-mini',
			name: 'GPT-4o Mini',
			costs: TOKEN_COSTS['gpt-4o-mini']!,
			recommended: false
		},
		{
			id: 'gpt-4o',
			name: 'GPT-4o',
			costs: TOKEN_COSTS['gpt-4o']!,
			recommended: false
		},
		{
			id: 'gpt-4-turbo',
			name: 'GPT-4 Turbo',
			costs: TOKEN_COSTS['gpt-4-turbo']!,
			recommended: false
		}
	];
}

// Export singleton rate limiter for use across the migration system
let globalRateLimiter: LLMRateLimiter | null = null;

export function getGlobalRateLimiter(): LLMRateLimiter {
	if (!globalRateLimiter) {
		globalRateLimiter = new LLMRateLimiter();
	}
	return globalRateLimiter;
}

export function resetGlobalRateLimiter(): void {
	globalRateLimiter = null;
}
