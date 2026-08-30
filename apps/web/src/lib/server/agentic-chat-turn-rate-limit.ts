// apps/web/src/lib/server/agentic-chat-turn-rate-limit.ts
export interface AgenticChatTurnRateLimitDecision {
	allowed: boolean;
	headers: Record<string, string>;
	retryAfterSeconds?: number;
}

interface TokenBucketState {
	tokens: number;
	lastRefillAt: number;
}

export class AgenticChatTurnTokenBucket {
	private readonly buckets = new Map<string, TokenBucketState>();

	constructor(
		private readonly capacity: number,
		private readonly refillWindowMs: number
	) {}

	consume(identifier: string, nowMs = Date.now()): AgenticChatTurnRateLimitDecision {
		const refillPerMs = this.capacity / this.refillWindowMs;
		const previous = this.buckets.get(identifier) ?? {
			tokens: this.capacity,
			lastRefillAt: nowMs
		};
		const elapsedMs = Math.max(0, nowMs - previous.lastRefillAt);
		const tokens = Math.min(this.capacity, previous.tokens + elapsedMs * refillPerMs);
		const resetSeconds = Math.max(1, Math.ceil((this.capacity - tokens) / refillPerMs / 1000));

		if (tokens < 1) {
			this.buckets.set(identifier, { tokens, lastRefillAt: nowMs });
			return {
				allowed: false,
				headers: this.headers(0, nowMs, resetSeconds),
				retryAfterSeconds: Math.max(1, Math.ceil((1 - tokens) / refillPerMs / 1000))
			};
		}

		const remaining = tokens - 1;
		this.buckets.set(identifier, { tokens: remaining, lastRefillAt: nowMs });
		if (this.buckets.size > 10_000) this.pruneFullBuckets(nowMs);
		return {
			allowed: true,
			headers: this.headers(Math.floor(remaining), nowMs, resetSeconds)
		};
	}

	clear(): void {
		this.buckets.clear();
	}

	private headers(
		remaining: number,
		nowMs: number,
		resetSeconds: number
	): Record<string, string> {
		return {
			'X-RateLimit-Limit': String(this.capacity),
			'X-RateLimit-Remaining': String(Math.max(0, remaining)),
			'X-RateLimit-Reset': String(Math.ceil(nowMs / 1000) + resetSeconds)
		};
	}

	private pruneFullBuckets(nowMs: number): void {
		for (const [identifier, bucket] of this.buckets) {
			if (nowMs - bucket.lastRefillAt >= this.refillWindowMs) {
				this.buckets.delete(identifier);
			}
			if (this.buckets.size <= 8_000) return;
		}
	}
}

function positiveInteger(value: string | undefined, fallback: number): number {
	const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const turnBucket = new AgenticChatTurnTokenBucket(
	positiveInteger(process.env.AGENTIC_CHAT_TURN_RATE_LIMIT_MAX, 30),
	positiveInteger(process.env.AGENTIC_CHAT_TURN_RATE_LIMIT_WINDOW_MS, 60_000)
);

export function consumeAgenticChatTurnRateLimit(userId: string): AgenticChatTurnRateLimitDecision {
	return turnBucket.consume(`agentic-chat:turn:${userId}`);
}

export function resetAgenticChatTurnRateLimitForTests(): void {
	turnBucket.clear();
}
