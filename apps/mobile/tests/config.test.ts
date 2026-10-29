// apps/mobile/tests/config.test.ts
import { describe, expect, it } from 'vitest';
import { devServerHint, readMobileConfig } from '@/lib/config';

const valid = {
	supabaseUrl: 'https://abc.supabase.co/',
	supabaseAnonKey: 'sb_publishable_123',
	apiBaseUrl: 'https://build-os.com/'
};

describe('readMobileConfig', () => {
	it('normalizes the Supabase origin and strips the API trailing slash', () => {
		expect(readMobileConfig(valid)).toEqual({
			supabaseUrl: 'https://abc.supabase.co',
			supabaseAnonKey: 'sb_publishable_123',
			apiBaseUrl: 'https://build-os.com'
		});
	});

	it('defaults the API to production when unset', () => {
		expect(readMobileConfig({ ...valid, apiBaseUrl: undefined }).apiBaseUrl).toBe(
			'https://build-os.com'
		);
	});

	it('allows plain http only for a LAN dev server', () => {
		expect(
			readMobileConfig({ ...valid, apiBaseUrl: 'http://192.168.1.20:5173' }).apiBaseUrl
		).toBe('http://192.168.1.20:5173');
		expect(() => readMobileConfig({ ...valid, apiBaseUrl: 'http://build-os.com' })).toThrow(
			/LAN dev server/
		);
	});

	it.each([
		['missing url', { ...valid, supabaseUrl: '' }, /EXPO_PUBLIC_SUPABASE_URL/],
		['missing key', { ...valid, supabaseAnonKey: ' ' }, /EXPO_PUBLIC_SUPABASE_ANON_KEY/],
		['http supabase', { ...valid, supabaseUrl: 'http://abc.supabase.co' }, /HTTPS/],
		['secret key', { ...valid, supabaseAnonKey: 'sb_secret_123' }, /never a secret key/]
	])('rejects %s', (_label, env, message) => {
		expect(() => readMobileConfig(env)).toThrow(message);
	});
});

describe('devServerHint', () => {
	it('names a LAN dev server and how to start it', () => {
		const hint = devServerHint('http://192.168.1.154:5199');
		expect(hint).toContain('192.168.1.154:5199');
		expect(hint).toContain('--port 5199');
	});

	it('stays quiet for the real HTTPS server or a bad URL', () => {
		expect(devServerHint('https://build-os.com')).toBeNull();
		expect(devServerHint('not a url')).toBeNull();
	});
});
