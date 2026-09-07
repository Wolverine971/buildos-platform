import { afterEach, describe, expect, it, vi } from 'vitest';

const config = vi.hoisted(() => ({
	PRIVATE_LIBRI_UPLOAD_DOWNLOAD_SIGNING_ENABLED: undefined as string | undefined,
	PRIVATE_LIBRI_ASSET_BROKER_TOKEN: 'route-fixture-token-abcdefghijklmnopqrstuvwxyz'
}));
vi.mock('$env/dynamic/private', () => ({ env: config }));
vi.mock('$env/static/public', () => ({
	PUBLIC_SUPABASE_URL: 'https://iwifjtlebphefldmwbkh.supabase.co'
}));
vi.mock('$env/static/private', () => ({ PRIVATE_SUPABASE_SERVICE_KEY: 'server-only-test-key' }));
import { POST } from './+server';

afterEach(() => vi.unstubAllGlobals());
describe('upload download route activation boundary', () => {
	it.each([undefined, 'false', 'TRUE', '1'])(
		'does not enable signing for flag %s',
		async (flag) => {
			config.PRIVATE_LIBRI_UPLOAD_DOWNLOAD_SIGNING_ENABLED = flag;
			const fetch = vi.fn();
			vi.stubGlobal('fetch', fetch);
			const result = await POST({
				request: new Request('https://build-os.com/api/internal/libri/uploads/download', {
					method: 'POST',
					body: '{}'
				})
			} as never);
			expect(result.status).toBe(404);
			expect(await result.json()).toEqual({ error: 'Upload download unavailable' });
			expect(result.headers.get('Cache-Control')).toBe('private, no-store');
			expect(fetch).not.toHaveBeenCalled();
		}
	);
	it('still requires the dedicated machine credential after explicit activation', async () => {
		config.PRIVATE_LIBRI_UPLOAD_DOWNLOAD_SIGNING_ENABLED = 'true';
		const fetch = vi.fn();
		vi.stubGlobal('fetch', fetch);
		const result = await POST({
			request: new Request('https://build-os.com/api/internal/libri/uploads/download', {
				method: 'POST',
				body: '{}'
			})
		} as never);
		expect(result.status).toBe(401);
		expect(fetch).not.toHaveBeenCalled();
	});
});
