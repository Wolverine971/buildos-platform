// apps/web/src/lib/server/agent-call/oauth-credential-exchange.test.ts
import { createHash } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	exchangeOAuthAuthorizationCode,
	exchangeOAuthRefreshToken
} from './oauth-connector.service';
import { logSecurityEvent } from '$lib/server/security-event-logger';

vi.mock('$lib/server/security-event-logger', () => ({ logSecurityEvent: vi.fn(async () => {}) }));

function fixture(result: any, kind: 'authorization_code' | 'refresh_token' = 'refresh_token') {
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
		agent_oauth_authorization_codes: {
			id: 'code',
			client_id: 'test-client',
			grant_id: 'grant',
			redirect_uri: 'https://client.example.test/callback',
			code_challenge: createHash('sha256').update('fixture-verifier').digest('base64url'),
			expires_at: '2999-01-01'
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
			(kind === 'authorization_code'
				? exchangeOAuthAuthorizationCode
				: exchangeOAuthRefreshToken)({
				admin,
				request: new Request('https://example.test/oauth/token'),
				form: new URLSearchParams({
					client_id: 'test-client',
					code: 'fixture-code',
					code_verifier: 'fixture-verifier',
					redirect_uri: 'https://client.example.test/callback',
					refresh_token: 'fixture-secret',
					scope: 'buildos.read'
				})
			})
	};
}

describe('atomic credential exchange adapter', () => {
	beforeEach(() => vi.clearAllMocks());

	it.each(['authorization_code', 'refresh_token'] as const)(
		'returns issued credentials after a successful %s exchange',
		async (kind) => {
			const { run } = fixture(
				{
					data: { scope: 'buildos.read offline_access', refresh: true },
					error: null
				},
				kind
			);
			await expect(run()).resolves.toMatchObject({
				accessToken: expect.stringMatching(/^bo_at_/),
				refreshToken: expect.stringMatching(/^bo_rt_/),
				scope: 'buildos.read offline_access',
				expiresIn: 3600
			});
		}
	);

	it.each(['42725', 'PGRST202', '57014', '23505', 'XX000', 'P0001'])(
		'keeps database failure %s a server error without reconnect advice or raw details',
		async (code) => {
			for (const kind of ['authorization_code', 'refresh_token'] as const) {
				const { run } = fixture(
					{
						data: null,
						error: {
							code,
							message: 'internal detail with fixture-secret',
							details: 'fixture-secret'
						}
					},
					kind
				);
				await expect(run()).rejects.toMatchObject({
					status: 500,
					code: 'server_error',
					databaseCode: code,
					description: 'BuildOS could not complete the token exchange. Try again later.'
				});
			}
			expect(logSecurityEvent).not.toHaveBeenCalled();
		}
	);

	it.each([
		['invalid_scope', 'invalid_scope'],
		['invalid_grant', 'invalid_grant'],
		['invalid_grant: consent changed', 'invalid_grant'],
		['invalid_grant: consent invalidated', 'invalid_grant']
	])('preserves explicit credential rejection %s', async (message, code) => {
		const { run } = fixture({ data: null, error: { code: 'P0001', message } });
		await expect(run()).rejects.toMatchObject({ status: 400, code });
	});

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
