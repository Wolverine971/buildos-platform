// apps/web/src/lib/supabase/context.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	env: { browser: true },
	contextClient: undefined as unknown,
	singleton: { name: 'browser-singleton' },
	createSupabaseBrowser: vi.fn()
}));

vi.mock('$app/environment', () => ({
	get browser() {
		return mocks.env.browser;
	}
}));
vi.mock('svelte', async (importOriginal) => ({
	...(await importOriginal<typeof import('svelte')>()),
	getContext: (key: string) => (key === 'supabase' ? mocks.contextClient : undefined)
}));
vi.mock('./index', () => ({ createSupabaseBrowser: mocks.createSupabaseBrowser }));

import { getSupabaseContext } from './context';

describe('getSupabaseContext', () => {
	beforeEach(() => {
		mocks.env.browser = true;
		mocks.contextClient = undefined;
		mocks.createSupabaseBrowser.mockReset().mockReturnValue(mocks.singleton);
	});

	it('uses the layout context client when there is one', () => {
		const layoutClient = { name: 'layout' };
		mocks.contextClient = layoutClient;

		expect(getSupabaseContext()).toBe(layoutClient);
		expect(mocks.createSupabaseBrowser).not.toHaveBeenCalled();
	});

	it('falls back to the browser singleton when the layout never set context (signed in after a public page)', () => {
		expect(getSupabaseContext()).toBe(mocks.singleton);
	});

	it('returns null during SSR', () => {
		mocks.env.browser = false;

		expect(getSupabaseContext()).toBeNull();
		expect(mocks.createSupabaseBrowser).not.toHaveBeenCalled();
	});

	it('returns null instead of throwing when the public env is missing', () => {
		mocks.createSupabaseBrowser.mockImplementation(() => {
			throw new Error('Missing public Supabase environment variables');
		});

		expect(getSupabaseContext()).toBeNull();
	});
});
