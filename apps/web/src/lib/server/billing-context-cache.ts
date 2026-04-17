// apps/web/src/lib/server/billing-context-cache.ts
import type { BillingContextPayload } from '$lib/server/billing-context';

export type CachedBillingContext = BillingContextPayload & { loading: boolean };

type CacheEntry = {
	expiresAt: number;
	value: CachedBillingContext;
};

const BILLING_CONTEXT_TTL_MS = 5 * 60_000;
const billingContextCache = new Map<string, CacheEntry>();

export function getCachedBillingContext(
	userId: string,
	nowMs = Date.now()
): CachedBillingContext | null {
	const entry = billingContextCache.get(userId);
	if (!entry) return null;

	if (entry.expiresAt <= nowMs) {
		billingContextCache.delete(userId);
		return null;
	}

	return entry.value;
}

export function setCachedBillingContext(
	userId: string,
	value: CachedBillingContext,
	nowMs = Date.now()
) {
	billingContextCache.set(userId, {
		value,
		expiresAt: nowMs + BILLING_CONTEXT_TTL_MS
	});
}

export function invalidateBillingContextCache(userId: string | null | undefined) {
	if (!userId) return;
	billingContextCache.delete(userId);
}

export function _clearBillingContextCacheForTests() {
	billingContextCache.clear();
}
