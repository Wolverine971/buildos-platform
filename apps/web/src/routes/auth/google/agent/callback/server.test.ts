import { beforeEach, describe, expect, it, vi } from 'vitest';
const service = vi.hoisted(() => ({ consumeState: vi.fn(), exchangeCode: vi.fn() }));
vi.mock('$lib/server/google-agent-oauth', () => ({ createGoogleAgentOAuthService: () => service }));
import { GoogleAgentOAuthError } from '@buildos/shared-agent-ops/google/google-agent-oauth';
import { GET } from './+server';
const state = { connection_kind: 'gmail', connection_id: 'connection', state_hash: 'hashed' };
function event(query: string, signedIn = true) {
	return {
		url: new URL(`https://build-os.com/auth/google/agent/callback?${query}`),
		locals: { safeGetSession: async () => ({ user: signedIn ? { id: 'user' } : null }) }
	} as any;
}
beforeEach(() => {
	vi.clearAllMocks();
	service.consumeState.mockResolvedValue(state);
	service.exchangeCode.mockResolvedValue(undefined);
});
describe('agent consent callback', () => {
	it('requires login before claiming state', async () => {
		await expect(GET(event('state=s&code=c', false))).rejects.toMatchObject({
			status: 303,
			location: '/auth/login?redirect=/profile'
		});
		expect(service.consumeState).not.toHaveBeenCalled();
	});
	it('claims the session-bound state before exchanging a code', async () => {
		await expect(GET(event('state=s&code=c'))).rejects.toMatchObject({
			status: 303,
			location: expect.stringContaining('google_agent=connected')
		});
		expect(service.consumeState).toHaveBeenCalledWith('s', 'user');
		expect(service.exchangeCode).toHaveBeenCalledWith(
			state,
			'c',
			'https://build-os.com/auth/google/agent/callback'
		);
	});
	it('does not exchange cancelled consent', async () => {
		await expect(GET(event('state=s&error=access_denied&code=c'))).rejects.toMatchObject({
			location: expect.stringContaining('google_agent_error=access_denied')
		});
		expect(service.exchangeCode).not.toHaveBeenCalled();
	});
	it('rejects replayed or expired state before using the code', async () => {
		service.consumeState.mockRejectedValue(
			new GoogleAgentOAuthError('invalid_state', 'Expired')
		);
		await expect(GET(event('state=s&code=c'))).rejects.toMatchObject({
			location: expect.stringContaining('google_agent_error=invalid_state')
		});
		expect(service.exchangeCode).not.toHaveBeenCalled();
	});
});
