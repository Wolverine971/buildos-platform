// apps/web/src/routes/api/integrations/google/agent-access/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
const service = vi.hoisted(() => ({
	status: vi.fn(),
	createAuthorizationUrl: vi.fn(),
	disconnect: vi.fn()
}));
vi.mock('$lib/server/google-agent-oauth', () => ({ createGoogleAgentOAuthService: () => service }));
import { DELETE, GET, POST } from './+server';

const userId = '11111111-1111-4111-8111-111111111111';
const connectionId = '22222222-2222-4222-8222-222222222222';
function event(
	method: string,
	body: unknown = { kind: 'gmail', connectionId },
	origin: string | null = 'https://build-os.com',
	signedIn = true
) {
	const url = new URL('https://build-os.com/api/integrations/google/agent-access');
	if (method === 'GET')
		url.search = new URLSearchParams(body as Record<string, string>).toString();
	return {
		url,
		request: new Request(url, {
			method,
			headers: { 'Content-Type': 'application/json', ...(origin ? { origin } : {}) },
			...(method !== 'GET' ? { body: JSON.stringify(body) } : {})
		}),
		locals: { safeGetSession: async () => ({ user: signedIn ? { id: userId } : null }) }
	} as any;
}
beforeEach(() => {
	vi.clearAllMocks();
	service.status.mockResolvedValue({ configured: true, status: 'not_connected' });
	service.createAuthorizationUrl.mockResolvedValue('https://accounts.google.com/consent');
	service.disconnect.mockResolvedValue(undefined);
});
describe('agent consent boundary', () => {
	it('requires an authenticated user', async () => {
		expect((await GET(event('GET', {}, null, false))).status).toBe(401);
		expect(service.status).not.toHaveBeenCalled();
	});
	it.each(['https://attacker.example', null])(
		'rejects state changes from origin %s',
		async (origin) => {
			expect((await POST(event('POST', undefined, origin))).status).toBe(403);
			expect((await DELETE(event('DELETE', undefined, origin))).status).toBe(403);
			expect(service.createAuthorizationUrl).not.toHaveBeenCalled();
			expect(service.disconnect).not.toHaveBeenCalled();
		}
	);
	it('binds consent to the session and a fixed callback', async () => {
		const response = await POST(event('POST'));
		expect(response.status).toBe(200);
		expect(service.createAuthorizationUrl).toHaveBeenCalledWith(
			{ userId, kind: 'gmail', connectionId },
			'https://build-os.com/auth/google/agent/callback'
		);
		expect(response.headers.get('cache-control')).toBe('no-store');
	});
	it('does not accept a caller-supplied user or redirect', async () => {
		expect(
			(
				await POST(
					event('POST', {
						kind: 'gmail',
						connectionId,
						userId: connectionId,
						redirect: 'https://attacker.example'
					})
				)
			).status
		).toBe(422);
		expect(service.createAuthorizationUrl).not.toHaveBeenCalled();
	});
	it('requires an account selection for Gmail', async () => {
		expect((await POST(event('POST', { kind: 'gmail' }))).status).toBe(422);
	});
	it('uses the signed-in identity for the legacy connection', async () => {
		expect((await GET(event('GET', { kind: 'calendar_legacy' }))).status).toBe(200);
		expect(service.status).toHaveBeenCalledWith({
			userId,
			kind: 'calendar_legacy',
			connectionId: userId
		});
	});
	it('disables only the selected companion grant', async () => {
		expect((await DELETE(event('DELETE'))).status).toBe(200);
		expect(service.disconnect).toHaveBeenCalledWith({ userId, kind: 'gmail', connectionId });
	});
});
