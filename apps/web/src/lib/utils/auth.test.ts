// apps/web/src/lib/utils/auth.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	calls: [] as string[],
	eq: vi.fn(),
	signOut: vi.fn()
}));

vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$lib/utils/onboarding-state', () => ({ clearOnboardingDrafts: vi.fn() }));
vi.mock('$lib/supabase', () => ({
	createSupabaseBrowser: () => ({
		auth: { signOut: mocks.signOut },
		from: (table: string) => ({
			update: (values: unknown) => ({
				eq: (column: string, value: string) => {
					mocks.calls.push(`update:${table}`);
					return mocks.eq(values, column, value);
				}
			})
		})
	})
}));

import { logout } from './auth';

describe('logout push cleanup', () => {
	beforeEach(() => {
		mocks.calls.length = 0;
		mocks.eq.mockReset();
		mocks.signOut.mockReset();
		mocks.eq.mockResolvedValue({ error: null });
		mocks.signOut.mockImplementation(async () => {
			mocks.calls.push('signOut');
			return { error: null };
		});
		vi.stubGlobal('sessionStorage', { setItem: vi.fn() });
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	it("deactivates this device's push subscription before signing out", async () => {
		const unsubscribe = vi.fn(async () => {
			mocks.calls.push('unsubscribe');
			return true;
		});
		vi.stubGlobal('navigator', {
			serviceWorker: {
				getRegistration: vi.fn().mockResolvedValue({
					pushManager: {
						getSubscription: vi.fn().mockResolvedValue({
							endpoint: 'https://push.example/abc',
							unsubscribe
						})
					}
				})
			}
		});

		await logout();

		expect(mocks.eq).toHaveBeenCalledWith(
			{ is_active: false },
			'endpoint',
			'https://push.example/abc'
		);
		expect(mocks.calls).toEqual(['update:push_subscriptions', 'unsubscribe', 'signOut']);
	});

	it('never blocks sign-out on a hung push cleanup', async () => {
		vi.useFakeTimers();
		vi.stubGlobal('navigator', {
			serviceWorker: { getRegistration: vi.fn(() => new Promise(() => {})) }
		});

		const pending = logout();
		await vi.advanceTimersByTimeAsync(2000);
		await pending;

		expect(mocks.signOut).toHaveBeenCalledTimes(1);
	});

	it('signs out normally when the browser has no push support', async () => {
		vi.stubGlobal('navigator', {});

		await logout();

		expect(mocks.eq).not.toHaveBeenCalled();
		expect(mocks.signOut).toHaveBeenCalledTimes(1);
	});
});
