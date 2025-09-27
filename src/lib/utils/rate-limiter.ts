// src/lib/utils/rate-limiter.ts
import { browser } from '$app/environment';

interface RateLimitRule {
	requests: number;
	windowMs: number;
}

interface RateLimitEntry {
	count: number;
	windowStart: number;
}

class RateLimiter {
	private memory = new Map<string, RateLimitEntry>();
	private cleanupInterval: NodeJS.Timeout;

	constructor() {
		// Cleanup expired entries every minute
		this.cleanupInterval = setInterval(() => {
			this.cleanup();
		}, 60000);
	}

	private cleanup(): void {
		const now = Date.now();
		for (const [key, entry] of this.memory.entries()) {
			// If window has expired, remove entry
			if (now - entry.windowStart > 3600000) {
				// 1 hour cleanup
				this.memory.delete(key);
			}
		}
	}

	check(
		identifier: string,
		rule: RateLimitRule
	): {
		allowed: boolean;
		remaining: number;
		resetTime: number;
	} {
		const now = Date.now();
		const key = `${identifier}:${rule.windowMs}:${rule.requests}`;

		let entry = this.memory.get(key);

		// Initialize or reset window if expired
		if (!entry || now - entry.windowStart >= rule.windowMs) {
			entry = {
				count: 0,
				windowStart: now
			};
			this.memory.set(key, entry);
		}

		const remaining = Math.max(0, rule.requests - entry.count);
		const resetTime = entry.windowStart + rule.windowMs;

		if (entry.count >= rule.requests) {
			return {
				allowed: false,
				remaining: 0,
				resetTime
			};
		}

		entry.count++;

		return {
			allowed: true,
			remaining: Math.max(0, rule.requests - entry.count),
			resetTime
		};
	}

	destroy(): void {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
		}
		this.memory.clear();
	}
}

// Singleton instance
export const rateLimiter = new RateLimiter();

// Predefined rate limit rules
export const RATE_LIMITS = {
	// API endpoints
	API_GENERAL: { requests: 100, windowMs: 60000 }, // 100 req/min
	API_AUTH: { requests: 5, windowMs: 60000 }, // 5 req/min for auth
	API_AI: { requests: 10, windowMs: 60000 }, // 10 AI requests/min

	// User actions
	BRAIN_DUMP: { requests: 20, windowMs: 300000 }, // 20 brain dumps/5min
	PROJECT_CREATE: { requests: 10, windowMs: 300000 }, // 10 projects/5min
	TASK_CREATE: { requests: 50, windowMs: 300000 }, // 50 tasks/5min

	// Email/notifications
	EMAIL_SEND: { requests: 10, windowMs: 3600000 }, // 10 emails/hour

	// Expensive operations
	EXPORT_DATA: { requests: 3, windowMs: 3600000 }, // 3 exports/hour
	BULK_OPERATIONS: { requests: 5, windowMs: 300000 } // 5 bulk ops/5min
} as const;

// Helper function for server-side rate limiting
export function createRateLimitHandler(rule: RateLimitRule) {
	return (identifier: string) => {
		const result = rateLimiter.check(identifier, rule);

		if (!result.allowed) {
			const error = new Error('Rate limit exceeded');
			(error as any).status = 429;
			(error as any).headers = {
				'Retry-After': Math.ceil((result.resetTime - Date.now()) / 1000).toString(),
				'X-RateLimit-Limit': rule.requests.toString(),
				'X-RateLimit-Remaining': '0',
				'X-RateLimit-Reset': Math.ceil(result.resetTime / 1000).toString()
			};
			throw error;
		}

		return {
			headers: {
				'X-RateLimit-Limit': rule.requests.toString(),
				'X-RateLimit-Remaining': result.remaining.toString(),
				'X-RateLimit-Reset': Math.ceil(result.resetTime / 1000).toString()
			}
		};
	};
}

// Client-side rate limiting for UI feedback
export class ClientRateLimiter {
	private static instance: ClientRateLimiter;
	private storage = new Map<string, RateLimitEntry>();

	static getInstance(): ClientRateLimiter {
		if (!ClientRateLimiter.instance) {
			ClientRateLimiter.instance = new ClientRateLimiter();
		}
		return ClientRateLimiter.instance;
	}

	canPerformAction(action: string, rule: RateLimitRule): boolean {
		if (!browser) return true; // Allow on server

		const now = Date.now();
		let entry = this.storage.get(action);

		if (!entry || now - entry.windowStart >= rule.windowMs) {
			entry = { count: 0, windowStart: now };
			this.storage.set(action, entry);
		}

		if (entry.count >= rule.requests) {
			return false;
		}

		entry.count++;
		return true;
	}

	getRemainingActions(action: string, rule: RateLimitRule): number {
		if (!browser) return rule.requests;

		const entry = this.storage.get(action);
		if (!entry) return rule.requests;

		const now = Date.now();
		if (now - entry.windowStart >= rule.windowMs) {
			return rule.requests;
		}

		return Math.max(0, rule.requests - entry.count);
	}

	getResetTime(action: string, rule: RateLimitRule): number | null {
		if (!browser) return null;

		const entry = this.storage.get(action);
		if (!entry) return null;

		return entry.windowStart + rule.windowMs;
	}
}

// Global client rate limiter
export const clientRateLimiter = browser ? ClientRateLimiter.getInstance() : null;

// Rate limit decorator for actions
export function rateLimit(rule: RateLimitRule, action?: string) {
	return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
		const method = descriptor.value;
		const actionName = action || `${target.constructor.name}.${propertyName}`;

		descriptor.value = function (...args: any[]) {
			if (clientRateLimiter && !clientRateLimiter.canPerformAction(actionName, rule)) {
				throw new Error(`Rate limit exceeded for ${actionName}`);
			}

			return method.apply(this, args);
		};

		return descriptor;
	};
}

// Usage examples:
/*
// In a service class:
class ProjectService {
  @rateLimit(RATE_LIMITS.PROJECT_CREATE)
  async createProject(data: CreateProjectData) {
    // Project creation logic
  }
}

// In a component:
function handleBrainDump() {
  if (!clientRateLimiter?.canPerformAction('brain-dump', RATE_LIMITS.BRAIN_DUMP)) {
    toast.error('Please wait before creating another brain dump');
    return;
  }
  
  // Proceed with brain dump
}

// In an API route:
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  const ip = getClientAddress();
  const rateLimitHandler = createRateLimitHandler(RATE_LIMITS.API_AI);
  
  try {
    const { headers } = rateLimitHandler(ip);
    
    // Process request
    const result = await processAIRequest();
    
    return json(result, { headers });
  } catch (error: any) {
    if (error.status === 429) {
      return json(
        { error: 'Rate limit exceeded' },
        { status: 429, headers: error.headers }
      );
    }
    throw error;
  }
};
*/
