// apps/web/src/routes/api/public/site-icon/server.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './+server';

function call(host: string | null) {
	const url = new URL('https://build-os.com/api/public/site-icon');
	if (host !== null) url.searchParams.set('host', host);
	return GET({ url } as any) as Promise<Response>;
}

function upstream(body: BodyInit | null, init: ResponseInit) {
	const fetchMock = vi.fn(async () => new Response(body, init));
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('GET /api/public/site-icon', () => {
	it('refuses anything that is not a plain host name, without calling out', async () => {
		const fetchMock = upstream('x', { status: 200 });
		for (const bad of [
			null,
			'',
			'localhost',
			'127.0.0.1',
			'a.com/evil',
			'a.com?x=1',
			'ex ample.com'
		]) {
			expect((await call(bad)).status).toBe(400);
		}
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('returns a raster icon with long caching and no-script headers', async () => {
		const fetchMock = upstream(new Uint8Array([137, 80, 78, 71]), {
			status: 200,
			headers: { 'content-type': 'image/png' }
		});
		const res = await call('www.9takes.com');
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('image/png');
		expect(res.headers.get('cache-control')).toContain('s-maxage=604800');
		expect(res.headers.get('content-security-policy')).toBe("default-src 'none'");
		expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain('domain=9takes.com');
	});

	it('is a 404 when the site has no icon, the icon is SVG, or the call fails', async () => {
		upstream(new Uint8Array([1]), { status: 404, headers: { 'content-type': 'image/png' } });
		expect((await call('nothing-here.com')).status).toBe(404);
		upstream('<svg/>', { status: 200, headers: { 'content-type': 'image/svg+xml' } });
		expect((await call('svg.com')).status).toBe(404);
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => Promise.reject(new Error('timeout')))
		);
		expect((await call('slow.com')).status).toBe(404);
	});
});
