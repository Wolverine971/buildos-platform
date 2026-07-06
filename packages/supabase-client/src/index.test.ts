// packages/supabase-client/src/index.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseMocks = vi.hoisted(() => ({
	createClient: vi.fn(() => ({ kind: 'service-client' })),
	createSSRBrowserClient: vi.fn(() => ({ kind: 'browser-client' })),
	createSSRServerClient: vi.fn(() => ({ kind: 'server-client' }))
}));

vi.mock('@supabase/supabase-js', () => ({
	SupabaseClient: class SupabaseClient {},
	createClient: supabaseMocks.createClient
}));

vi.mock('@supabase/ssr', () => ({
	createBrowserClient: supabaseMocks.createSSRBrowserClient,
	createServerClient: supabaseMocks.createSSRServerClient
}));

const {
	createCustomClient,
	createServiceClient,
	createSupabaseBrowser,
	createSupabaseServer,
	getRedirectURL
} = await import('./index');

describe('supabase-client factories', () => {
	const originalEnv = { ...process.env };
	const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

	beforeEach(() => {
		vi.clearAllMocks();
		process.env = { ...originalEnv };
	});

	afterEach(() => {
		process.env = originalEnv;
		if (originalWindow) {
			Object.defineProperty(globalThis, 'window', originalWindow);
		} else {
			Reflect.deleteProperty(globalThis, 'window');
		}
	});

	it('requires service-role Supabase environment variables', () => {
		delete process.env.PUBLIC_SUPABASE_URL;
		delete process.env.PRIVATE_SUPABASE_SERVICE_KEY;

		expect(() => createServiceClient()).toThrow('Missing Supabase environment variables');
		expect(supabaseMocks.createClient).not.toHaveBeenCalled();
	});

	it('creates a service client with non-persistent auth settings', () => {
		process.env.PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
		process.env.PRIVATE_SUPABASE_SERVICE_KEY = 'service-key';

		expect(createServiceClient()).toEqual({ kind: 'service-client' });
		expect(supabaseMocks.createClient).toHaveBeenCalledWith(
			'https://example.supabase.co',
			'service-key',
			{
				auth: {
					autoRefreshToken: false,
					persistSession: false
				}
			}
		);
	});

	it('creates browser and server clients with SSR helpers', () => {
		const cookies = {
			getAll: vi.fn(() => []),
			setAll: vi.fn()
		};

		expect(createSupabaseBrowser('https://example.supabase.co', 'anon-key')).toEqual({
			kind: 'browser-client'
		});
		expect(createSupabaseServer('https://example.supabase.co', 'anon-key', cookies)).toEqual({
			kind: 'server-client'
		});

		expect(supabaseMocks.createSSRBrowserClient).toHaveBeenCalledWith(
			'https://example.supabase.co',
			'anon-key',
			expect.objectContaining({
				auth: expect.objectContaining({
					flowType: 'pkce',
					persistSession: true
				})
			})
		);
		expect(supabaseMocks.createSSRServerClient).toHaveBeenCalledWith(
			'https://example.supabase.co',
			'anon-key',
			expect.objectContaining({
				cookies,
				auth: expect.objectContaining({
					flowType: 'pkce',
					persistSession: false
				})
			})
		);
	});

	it('rejects missing public credentials for browser and server clients', () => {
		expect(() => createSupabaseBrowser('', 'anon-key')).toThrow(
			'Missing public Supabase environment variables'
		);
		expect(() =>
			createSupabaseServer('https://example.supabase.co', '', { getAll: () => [] })
		).toThrow('Missing public Supabase environment variables');
	});

	it('delegates custom clients directly to the base Supabase client', () => {
		expect(createCustomClient('https://example.supabase.co', 'custom-key')).toEqual({
			kind: 'service-client'
		});
		expect(supabaseMocks.createClient).toHaveBeenCalledWith(
			'https://example.supabase.co',
			'custom-key'
		);
	});

	it('builds redirect URLs from browser or server context', () => {
		Object.defineProperty(globalThis, 'window', {
			configurable: true,
			value: {
				location: {
					origin: 'https://app.example.com'
				}
			}
		});

		expect(getRedirectURL('/auth/callback')).toBe('https://app.example.com/auth/callback');

		Reflect.deleteProperty(globalThis, 'window');
		expect(getRedirectURL('/auth/callback', true)).toBe('http://localhost:5173/auth/callback');
		expect(getRedirectURL('/auth/callback')).toBe('https://build-os.com/auth/callback');
	});
});
