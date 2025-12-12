// apps/web/src/lib/services/agentic-chat/config/llm-cache-wrapper.ts
/**
 * LLM Response Caching Wrapper
 *
 * Caches deterministic LLM responses to reduce costs and latency
 * Particularly effective for:
 * - Plan reviews
 * - Tool definitions
 * - Context extractions
 * - Similar brain dumps
 */

import { CacheManager } from '$lib/services/base/cache-manager';
import { SmartLLMService } from '$lib/services/smart-llm-service';
import type { TextProfile } from '$lib/services/smart-llm-service';
import crypto from 'crypto';

export interface CachedLLMConfig {
	enableCache?: boolean;
	cacheTTL?: number; // milliseconds
	cacheableOperations?: string[];
}

export class LLMCacheWrapper {
	private cache: CacheManager<string>;
	private cacheableOps: Set<string>;

	// Operations that typically produce deterministic results
	private static DEFAULT_CACHEABLE = [
		'plan_review',
		'task_extraction',
		'context_extraction',
		'tool_definition_lookup',
		'chat_title_generation',
		'chat_segment_summary'
	];

	constructor(
		private smartLLM: SmartLLMService,
		config: CachedLLMConfig = {}
	) {
		this.cache = new CacheManager<string>(
			500, // Max 500 cached responses
			config.cacheTTL || 30 * 60 * 1000 // 30 minutes default
		);

		this.cacheableOps = new Set(
			config.cacheableOperations || LLMCacheWrapper.DEFAULT_CACHEABLE
		);
	}

	/**
	 * Generate text with caching
	 */
	async generateText(params: {
		systemPrompt: string;
		prompt: string;
		userId?: string;
		operationType?: string;
		temperature?: number;
		maxTokens?: number;
		profile?: TextProfile;
		useCache?: boolean; // Can be overridden per call
	}): Promise<string> {
		// Determine if we should cache this request
		const shouldCache =
			params.useCache !== false &&
			params.operationType &&
			this.cacheableOps.has(params.operationType) &&
			(params.temperature || 0.5) <= 0.3; // Only cache low-temperature requests

		if (shouldCache) {
			// Generate cache key
			const cacheKey = this.generateCacheKey(params);

			// Check cache
			const cached = this.cache.get(cacheKey);
			if (cached) {
				console.log(`[LLMCache] Cache hit for ${params.operationType}`);
				// Track cache hit in metrics
				await this.trackCacheHit(params.operationType!, params.userId);
				return cached;
			}
		}

		// Make actual LLM call
		const response = await this.smartLLM.generateText(params);

		// Cache the response if applicable
		if (shouldCache && response) {
			const cacheKey = this.generateCacheKey(params);
			this.cache.set(cacheKey, response);
			console.log(`[LLMCache] Cached response for ${params.operationType}`);
		}

		return response;
	}

	/**
	 * Generate deterministic cache key
	 */
	private generateCacheKey(params: any): string {
		const keyData = {
			systemPrompt: params.systemPrompt,
			prompt: params.prompt,
			operationType: params.operationType,
			temperature: params.temperature || 0.5,
			maxTokens: params.maxTokens || 1500,
			profile: params.profile || 'balanced'
		};

		const hash = crypto.createHash('sha256').update(JSON.stringify(keyData)).digest('hex');

		return `llm:${params.operationType}:${hash.substring(0, 16)}`;
	}

	/**
	 * Track cache hit for monitoring
	 */
	private async trackCacheHit(operationType: string, userId?: string): Promise<void> {
		// In production, this would log to your metrics system
		// For now, we'll just log it
		console.log(`[LLMCache] Cache hit tracked:`, {
			operationType,
			userId,
			timestamp: new Date().toISOString(),
			savedCost: this.estimateSavedCost(operationType)
		});
	}

	/**
	 * Estimate cost saved from cache hit
	 */
	private estimateSavedCost(operationType: string): number {
		// Based on your analysis, average costs per operation
		const costMap: Record<string, number> = {
			plan_review: 0.015,
			task_extraction: 0.02,
			context_extraction: 0.025,
			tool_definition_lookup: 0.005,
			chat_title_generation: 0.002,
			chat_segment_summary: 0.003
		};

		return costMap[operationType] || 0.01;
	}

	/**
	 * Clear cache for specific operation or all
	 */
	clearCache(operationType?: string): void {
		if (operationType) {
			this.cache.invalidatePattern(new RegExp(`^llm:${operationType}:`));
		} else {
			this.cache.clear();
		}
	}

	/**
	 * Get cache statistics
	 */
	getCacheStats(): {
		size: number;
		keys: string[];
		estimatedSavings: number;
	} {
		const keys = this.cache.keys();
		const estimatedSavings = keys.reduce((sum, key) => {
			const opType = key.split(':')[1] ?? 'unknown';
			return sum + this.estimateSavedCost(opType);
		}, 0);

		return {
			size: this.cache.size,
			keys,
			estimatedSavings
		};
	}
}
