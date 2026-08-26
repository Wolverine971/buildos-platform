// apps/web/src/lib/components/profile/profile-tabs.test.ts
import { describe, expect, it } from 'vitest';
import { getProfileTabHref, getVisibleProfileTabIds, resolveProfileTab } from './profile-tabs';

describe('profile tab routing', () => {
	const hiddenOptionalTabs = {
		cyclesProfileEnabled: false,
		stripeEnabled: false
	};

	it('keeps the legacy Brief Settings deep link valid', () => {
		expect(resolveProfileTab('briefs', hiddenOptionalTabs)).toBe('briefs');
	});

	it('does not select Cycles without the explicit profile flag', () => {
		expect(resolveProfileTab('cycles', hiddenOptionalTabs)).toBe('account');
		expect(getVisibleProfileTabIds(hiddenOptionalTabs)).not.toContain('cycles');
	});

	it('allows a flagged user to deep-link to Cycles', () => {
		expect(
			resolveProfileTab('cycles', {
				cyclesProfileEnabled: true,
				stripeEnabled: false
			})
		).toBe('cycles');
	});

	it('keeps Billing conditional on Stripe and falls back for unknown tabs', () => {
		expect(resolveProfileTab('billing', hiddenOptionalTabs)).toBe('account');
		expect(
			resolveProfileTab('billing', {
				cyclesProfileEnabled: false,
				stripeEnabled: true
			})
		).toBe('billing');
		expect(resolveProfileTab('worker-diagnostics', hiddenOptionalTabs)).toBe('account');
	});

	it('keeps Account at the query-free profile URL', () => {
		expect(getProfileTabHref('account')).toBe('/profile');
		expect(getProfileTabHref('notifications')).toBe('/profile?tab=notifications');
	});
});
