// apps/web/src/lib/services/ontology/migration-llm.service.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	LLMRateLimiter,
	estimateMigrationCost,
	estimateCostForEntities,
	createLLMUsageMetadata,
	getAvailableModels,
	getGlobalRateLimiter,
	resetGlobalRateLimiter
} from './migration-llm.service';

describe('LLMRateLimiter', () => {
	let rateLimiter: LLMRateLimiter;

	beforeEach(() => {
		rateLimiter = new LLMRateLimiter({
			maxRequestsPerMinute: 10,
			maxTokensPerMinute: 1000,
			circuitBreakerThreshold: 3,
			circuitBreakerResetMs: 1000
		});
	});

	describe('acquire', () => {
		it('should allow requests within limits', async () => {
			await expect(rateLimiter.acquire(100)).resolves.not.toThrow();
		});

		it('should track request count', async () => {
			await rateLimiter.acquire(100);
			await rateLimiter.acquire(100);

			const status = rateLimiter.getStatus();
			expect(status.requestsRemaining).toBe(8);
		});

		it('should track token count', async () => {
			await rateLimiter.acquire(500);

			const status = rateLimiter.getStatus();
			expect(status.tokensRemaining).toBe(500);
		});
	});

	describe('circuit breaker', () => {
		it('should open circuit after threshold errors', () => {
			rateLimiter.recordError();
			rateLimiter.recordError();
			rateLimiter.recordError();

			const status = rateLimiter.getStatus();
			expect(status.isCircuitOpen).toBe(true);
		});

		it('should block requests when circuit is open', async () => {
			rateLimiter.recordError();
			rateLimiter.recordError();
			rateLimiter.recordError();

			await expect(rateLimiter.acquire(100)).rejects.toThrow(/Circuit breaker open/);
		});

		it('should allow force reset of circuit', async () => {
			rateLimiter.recordError();
			rateLimiter.recordError();
			rateLimiter.recordError();

			expect(rateLimiter.getStatus().isCircuitOpen).toBe(true);

			rateLimiter.forceResetCircuit();

			expect(rateLimiter.getStatus().isCircuitOpen).toBe(false);
			await expect(rateLimiter.acquire(100)).resolves.not.toThrow();
		});

		it('should decrease error count on success', () => {
			rateLimiter.recordError();
			rateLimiter.recordError();

			const statusBefore = rateLimiter.getStatus();
			expect(statusBefore.isCircuitOpen).toBe(false);

			rateLimiter.recordSuccess();
			rateLimiter.recordSuccess();

			// After recording successes, errors should be decremented
			// Recording more errors should not immediately open circuit
			rateLimiter.recordError();
			expect(rateLimiter.getStatus().isCircuitOpen).toBe(false);
		});
	});

	describe('getStatus', () => {
		it('should return current status', () => {
			const status = rateLimiter.getStatus();

			expect(status).toHaveProperty('requestsRemaining');
			expect(status).toHaveProperty('tokensRemaining');
			expect(status).toHaveProperty('isCircuitOpen');
			expect(status).toHaveProperty('circuitResetIn');
			expect(status).toHaveProperty('windowResetIn');
		});

		it('should show correct initial values', () => {
			const status = rateLimiter.getStatus();

			expect(status.requestsRemaining).toBe(10);
			expect(status.tokensRemaining).toBe(1000);
			expect(status.isCircuitOpen).toBe(false);
			expect(status.circuitResetIn).toBeNull();
		});
	});
});

describe('estimateMigrationCost', () => {
	it('should calculate cost for projects', () => {
		const estimate = estimateMigrationCost(10, 8, 2, 'deepseek-chat');

		expect(estimate.tokens).toBeGreaterThan(0);
		expect(estimate.cost).toBeGreaterThan(0);
		expect(estimate.estimatedDuration).toBeTruthy();
		expect(estimate.model).toBe('deepseek-chat');
	});

	it('should include token breakdown', () => {
		const estimate = estimateMigrationCost(10, 8, 2);

		expect(estimate.breakdown.inputTokens).toBeGreaterThan(0);
		expect(estimate.breakdown.outputTokens).toBeGreaterThan(0);
		expect(estimate.breakdown.inputCost).toBeGreaterThan(0);
		expect(estimate.breakdown.outputCost).toBeGreaterThan(0);
	});

	it('should scale with project count', () => {
		const estimate10 = estimateMigrationCost(10);
		const estimate100 = estimateMigrationCost(100);

		expect(estimate100.tokens).toBeGreaterThan(estimate10.tokens);
		expect(estimate100.cost).toBeGreaterThan(estimate10.cost);
	});

	it('should use different rates for different models', () => {
		const deepseekEstimate = estimateMigrationCost(10, 8, 2, 'deepseek-chat');
		const gpt4oEstimate = estimateMigrationCost(10, 8, 2, 'gpt-4o');

		// GPT-4o is more expensive
		expect(gpt4oEstimate.cost).toBeGreaterThan(deepseekEstimate.cost);
		// Same tokens for same entity count
		expect(gpt4oEstimate.tokens).toBe(deepseekEstimate.tokens);
	});

	it('should return zero for zero projects', () => {
		const estimate = estimateMigrationCost(0);

		expect(estimate.tokens).toBe(0);
		expect(estimate.cost).toBe(0);
	});
});

describe('estimateCostForEntities', () => {
	it('should calculate cost for specific entity counts', () => {
		const estimate = estimateCostForEntities({
			projects: 5,
			tasks: 40,
			phases: 10
		});

		expect(estimate.tokens).toBeGreaterThan(0);
		expect(estimate.cost).toBeGreaterThan(0);
	});

	it('should handle only tasks', () => {
		const estimate = estimateCostForEntities({
			projects: 0,
			tasks: 100,
			phases: 0
		});

		expect(estimate.tokens).toBeGreaterThan(0);
		// Only task tokens should contribute
		expect(estimate.breakdown.inputTokens).toBe(100 * 200);
		expect(estimate.breakdown.outputTokens).toBe(100 * 100);
	});

	it('should handle only phases', () => {
		const estimate = estimateCostForEntities({
			projects: 0,
			tasks: 0,
			phases: 50
		});

		expect(estimate.tokens).toBeGreaterThan(0);
		expect(estimate.breakdown.inputTokens).toBe(50 * 300);
		expect(estimate.breakdown.outputTokens).toBe(50 * 150);
	});
});

describe('createLLMUsageMetadata', () => {
	it('should create metadata with correct structure', () => {
		const metadata = createLLMUsageMetadata('openai', 'gpt-4o', 1000, 500, 2500);

		expect(metadata.provider).toBe('openai');
		expect(metadata.model).toBe('gpt-4o');
		expect(metadata.inputTokens).toBe(1000);
		expect(metadata.outputTokens).toBe(500);
		expect(metadata.totalTokens).toBe(1500);
		expect(metadata.durationMs).toBe(2500);
	});

	it('should calculate estimated cost', () => {
		const metadata = createLLMUsageMetadata('deepseek', 'deepseek-chat', 1000, 500, 1000);

		// DeepSeek costs: $0.00014/1K input, $0.00028/1K output
		// Cost = (1000/1000 * 0.00014) + (500/1000 * 0.00028) = 0.00014 + 0.00014 = 0.00028
		expect(metadata.estimatedCost).toBeCloseTo(0.00028, 4);
	});
});

describe('getAvailableModels', () => {
	it('should return array of models', () => {
		const models = getAvailableModels();

		expect(Array.isArray(models)).toBe(true);
		expect(models.length).toBeGreaterThan(0);
	});

	it('should include recommended model', () => {
		const models = getAvailableModels();
		const recommendedModels = models.filter((m) => m.recommended);

		expect(recommendedModels.length).toBeGreaterThan(0);
	});

	it('should include cost information', () => {
		const models = getAvailableModels();

		for (const model of models) {
			expect(model.costs).toHaveProperty('input');
			expect(model.costs).toHaveProperty('output');
			expect(model.costs.input).toBeGreaterThan(0);
			expect(model.costs.output).toBeGreaterThan(0);
		}
	});

	it('should include deepseek-chat as recommended', () => {
		const models = getAvailableModels();
		const deepseek = models.find((m) => m.id === 'deepseek-chat');

		expect(deepseek).toBeDefined();
		expect(deepseek?.recommended).toBe(true);
	});
});

describe('globalRateLimiter', () => {
	beforeEach(() => {
		resetGlobalRateLimiter();
	});

	it('should return same instance', () => {
		const limiter1 = getGlobalRateLimiter();
		const limiter2 = getGlobalRateLimiter();

		expect(limiter1).toBe(limiter2);
	});

	it('should reset to new instance', () => {
		const limiter1 = getGlobalRateLimiter();
		resetGlobalRateLimiter();
		const limiter2 = getGlobalRateLimiter();

		expect(limiter1).not.toBe(limiter2);
	});
});
