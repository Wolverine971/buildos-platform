import { afterEach, describe, expect, it, vi } from 'vitest';
const config = vi.hoisted(() => ({
	PRIVATE_LIBRI_UPLOAD_PUBLICATION_ENABLED: undefined as string | undefined,
	PRIVATE_LIBRI_ASSET_BROKER_TOKEN: 'route-fixture-token-abcdefghijklmnopqrstuvwxyz'
}));
vi.mock('$env/dynamic/private', () => ({ env: config }));
vi.mock('$env/static/public', () => ({
	PUBLIC_SUPABASE_URL: 'https://iwifjtlebphefldmwbkh.supabase.co'
}));
vi.mock('$env/static/private', () => ({ PRIVATE_SUPABASE_SERVICE_KEY: 'server-only-test-key' }));
import { POST } from './+server';
afterEach(() => vi.unstubAllGlobals());
describe('publication route activation boundary', () => {
	it.each([undefined, 'false', 'TRUE', '1'])('does not activate for flag %s', async (flag) => {
		config.PRIVATE_LIBRI_UPLOAD_PUBLICATION_ENABLED = flag;
		const fetch = vi.fn();
		vi.stubGlobal('fetch', fetch);
		const r = await POST({
			request: new Request('https://build-os.com/api/internal/libri/uploads/publish', {
				method: 'POST',
				body: '{}'
			})
		} as never);
		expect(r.status).toBe(404);
		expect(await r.json()).toEqual({ error: 'Upload publication unavailable' });
		expect(r.headers.get('cache-control')).toBe('private, no-store');
		expect(fetch).not.toHaveBeenCalled();
	});
	it('requires machine authentication even after activation', async () => {
		config.PRIVATE_LIBRI_UPLOAD_PUBLICATION_ENABLED = 'true';
		const fetch = vi.fn();
		vi.stubGlobal('fetch', fetch);
		const r = await POST({
			request: new Request('https://build-os.com/api/internal/libri/uploads/publish', {
				method: 'POST',
				body: '{}'
			})
		} as never);
		expect(r.status).toBe(401);
		expect(fetch).not.toHaveBeenCalled();
	});
});
