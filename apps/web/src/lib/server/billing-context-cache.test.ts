// apps/web/src/lib/server/billing-context-cache.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import {
	_clearBillingContextCacheForTests,
	getCachedBillingContext,
	invalidateBillingContextCache,
	setCachedBillingContext,
	type CachedBillingContext
} from './billing-context-cache';

const context: CachedBillingContext = {
	subscription: null,
	trialStatus: null,
	paymentWarnings: [],
	isReadOnly: false,
	consumptionGate: null,
	loading: false
};

describe('billing-context-cache', () => {
	afterEach(() => {
		_clearBillingContextCacheForTests();
	});

	it('returns cached billing context before expiry', () => {
		setCachedBillingContext('user-1', context, 1_000);

		expect(getCachedBillingContext('user-1', 1_001)).toEqual(context);
	});

	it('drops cached billing context when invalidated', () => {
		setCachedBillingContext('user-1', context, 1_000);

		invalidateBillingContextCache('user-1');

		expect(getCachedBillingContext('user-1', 1_001)).toBeNull();
	});

	it('expires cached billing context after the ttl', () => {
		setCachedBillingContext('user-1', context, 1_000);

		expect(getCachedBillingContext('user-1', 301_000)).toBeNull();
	});
});
