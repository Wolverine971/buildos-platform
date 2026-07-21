// packages/shared-agent-ops/src/web/safe-fetch.test.ts
import { describe, expect, it, vi } from 'vitest';
import { fetchPublicUrl } from './safe-fetch';

describe('fetchPublicUrl', () => {
	it('rejects a hostname when any DNS answer is private before making a request', async () => {
		const fetchFn = vi.fn();
		const dnsLookup = vi.fn(async () => [
			{ address: '93.184.216.34', family: 4 },
			{ address: '10.0.0.12', family: 4 }
		]);

		await expect(
			fetchPublicUrl('https://research.example/page', {
				fetchFn: fetchFn as typeof fetch,
				dnsLookup
			})
		).rejects.toThrow('Blocked private or reserved IP address');
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('rejects IPv4-mapped IPv6 private addresses before making a request', async () => {
		const fetchFn = vi.fn();

		await expect(
			fetchPublicUrl('http://[::ffff:127.0.0.1]/metadata', {
				fetchFn: fetchFn as typeof fetch
			})
		).rejects.toThrow('Blocked private or reserved IP address');
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('allows a public DNS answer and enforces the streamed response size limit', async () => {
		const dnsLookup = vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]);
		const fetchFn = vi.fn(async () => {
			return new Response('123456', {
				status: 200,
				headers: { 'content-type': 'text/plain' }
			});
		});

		await expect(
			fetchPublicUrl('https://research.example/page', {
				fetchFn: fetchFn as typeof fetch,
				dnsLookup,
				maxBytes: 5
			})
		).rejects.toThrow('Response body exceeds size limit');
		expect(fetchFn).toHaveBeenCalledTimes(1);
	});

	it('resolves each hop exactly once and pins the connection against DNS rebinding', async () => {
		// A rebinding attacker answers the vetting lookup with a public IP and a
		// SECOND lookup with a private one. There must be no second resolution:
		// the connection is pinned via a dispatcher to the already-vetted IP, so
		// the private answer is never consulted and can never be connected to.
		const dnsLookup = vi
			.fn()
			.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }])
			.mockResolvedValueOnce([{ address: '10.0.0.5', family: 4 }]);

		let capturedDispatcher: unknown;
		const fetchFn = vi.fn(async (_url: unknown, init: Record<string, unknown>) => {
			capturedDispatcher = init?.dispatcher;
			return new Response('ok', {
				status: 200,
				headers: { 'content-type': 'text/plain' }
			});
		});

		const result = await fetchPublicUrl('https://research.example/page', {
			fetchFn: fetchFn as unknown as typeof fetch,
			dnsLookup
		});

		expect(result.status).toBe(200);
		expect(result.body).toBe('ok');
		// The private second answer was never requested by our code.
		expect(dnsLookup).toHaveBeenCalledTimes(1);
		// A pinning dispatcher was handed to fetch so undici cannot re-resolve.
		expect(capturedDispatcher).toBeDefined();
	});

	it('re-vets and blocks a redirect hop that resolves to a private address', async () => {
		const dnsLookup = vi.fn(async (hostname: string) =>
			hostname === 'internal.example'
				? [{ address: '10.0.0.9', family: 4 }]
				: [{ address: '93.184.216.34', family: 4 }]
		);
		const fetchFn = vi.fn(async () => {
			return new Response(null, {
				status: 302,
				headers: { location: 'https://internal.example/secret' }
			});
		});

		await expect(
			fetchPublicUrl('https://research.example/start', {
				fetchFn: fetchFn as typeof fetch,
				dnsLookup
			})
		).rejects.toThrow('Blocked private or reserved IP address');
		// The redirect target was vetted before any second fetch was attempted.
		expect(fetchFn).toHaveBeenCalledTimes(1);
	});

	it('blocks a hostname that resolves only to private space before connecting', async () => {
		const fetchFn = vi.fn();
		const dnsLookup = vi.fn(async () => [
			{ address: '10.1.2.3', family: 4 },
			{ address: 'fd00::1', family: 6 }
		]);

		await expect(
			fetchPublicUrl('https://intranet.example/page', {
				fetchFn: fetchFn as typeof fetch,
				dnsLookup
			})
		).rejects.toThrow('Blocked private or reserved IP address');
		expect(fetchFn).not.toHaveBeenCalled();
		expect(dnsLookup).toHaveBeenCalledTimes(1);
	});
});
