// apps/web/src/lib/server/agent-call/oauth-credential-exchange.test.ts
import { describe, expect, it, vi } from 'vitest';
import { exchangeOAuthRefreshToken } from './oauth-connector.service';
import { logSecurityEvent } from '$lib/server/security-event-logger';

vi.mock('$lib/server/security-event-logger', () => ({ logSecurityEvent: vi.fn(async () => {}) }));

function fixture(result: any) {
	const rpc = vi.fn(async () => result);
	const rows: Record<string, unknown> = {
		agent_oauth_clients: {
			client_id: 'test-client',
			status: 'active',
			redirect_uris: [],
			allowed_scopes: ['buildos.read', 'offline_access']
		},
		agent_oauth_refresh_tokens: {
			id: 'refresh',
			client_id: 'test-client',
			grant_id: 'grant',
			family_id: 'family',
			external_agent_caller_id: 'caller',
			user_id: 'owner',
			used_at: '2000-01-01',
			expires_at: '2000-01-01'
		},
		agent_oauth_grants: {
			id: 'grant',
			status: 'active',
			resource: 'https://example.test/mcp',
			user_id: 'owner',
			external_agent_caller_id: 'caller'
		}
	};
	const admin = {
		rpc,
		from: (table: string) => {
			const b: any = {
				select: () => b,
				eq: () => b,
				maybeSingle: async () => ({ data: rows[table], error: null })
			};
			return b;
		}
	};
	return {
		rpc,
		run: () =>
			exchangeOAuthRefreshToken({
				admin,
				request: new Request('https://example.test/oauth/token'),
				form: new URLSearchParams({
					client_id: 'test-client',
					refresh_token: 'fixture-secret',
					scope: 'buildos.read'
				})
			})
	};
}

describe('atomic refresh exchange adapter', () => {
	it('sends expired used tokens to the transaction and audits only committed reuse', async () => {
		vi.mocked(logSecurityEvent).mockClear();
		const { rpc, run } = fixture({
			data: { error: 'invalid_grant', reuse_detected: true },
			error: null
		});
		await expect(run()).rejects.toMatchObject({ code: 'invalid_grant' });
		expect(rpc).toHaveBeenCalledWith(
			'exchange_agent_oauth_credential',
			expect.objectContaining({
				p_kind: 'refresh',
				p_id: 'refresh',
				p_requested_scope: 'buildos.read'
			})
		);
		expect(logSecurityEvent).toHaveBeenCalledWith(
			expect.objectContaining({ eventType: 'agent.oauth.refresh.reuse_detected' }),
			expect.anything()
		);
	});
	it('does not report committed revocation when the transaction fails', async () => {
		vi.mocked(logSecurityEvent).mockClear();
		const { run } = fixture({
			data: null,
			error: { code: 'XX000', message: 'database failure' }
		});
		await expect(run()).rejects.toThrow();
		expect(logSecurityEvent).not.toHaveBeenCalled();
	});
});
