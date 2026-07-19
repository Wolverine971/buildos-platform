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
});
