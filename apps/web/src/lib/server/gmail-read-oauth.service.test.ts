// apps/web/src/lib/server/gmail-read-oauth.service.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { decryptGmailToken, encryptGmailToken } from './gmail-token-crypto';
import {
	GMAIL_READ_SCOPE,
	GmailOAuthError,
	GmailReadOAuthService
} from './gmail-read-oauth.service';

type QueryResult = { data: any; error: any };

function createQuery(result: QueryResult = { data: null, error: null }) {
	const query: any = {
		select: vi.fn(() => query),
		eq: vi.fn(() => query),
		is: vi.fn(() => query),
		in: vi.fn(() => query),
		lt: vi.fn(() => query),
		order: vi.fn(() => query),
		update: vi.fn(() => query),
		delete: vi.fn(() => query),
		insert: vi.fn().mockResolvedValue({ error: null }),
		maybeSingle: vi.fn().mockResolvedValue(result),
		then: (resolve: (value: QueryResult) => unknown, reject: (reason: unknown) => unknown) =>
			Promise.resolve(result).then(resolve, reject)
	};
	return query;
}

function createAdmin(
	options: {
		connection?: QueryResult;
		credential?: QueryResult;
		capability?: QueryResult;
		consumeState?: QueryResult;
		upsertConnection?: QueryResult;
	} = {}
) {
	const queries = {
		user_email_connections: createQuery(options.connection),
		email_connection_credentials: createQuery(options.credential),
		email_oauth_states: createQuery(),
		email_access_audit_events: createQuery(),
		email_capability_grants: createQuery(
			options.capability ?? {
				data: { status: 'enabled', granted_scopes: [GMAIL_READ_SCOPE] },
				error: null
			}
		)
	};
	const rpc = vi.fn((name: string) => {
		if (name === 'consume_email_oauth_state') {
			return Promise.resolve(options.consumeState ?? { data: null, error: null });
		}
		if (name === 'upsert_gmail_read_connection') {
			return Promise.resolve(options.upsertConnection ?? { data: null, error: null });
		}
		if (
			name === 'rotate_gmail_read_credentials' ||
			name === 'mark_gmail_read_connection_reconnect_required'
		) {
			return Promise.resolve({ data: null, error: null });
		}
		return Promise.resolve({ data: null, error: new Error('Unexpected RPC') });
	});

	return {
		admin: {
			from: vi.fn((table: keyof typeof queries) => queries[table]),
			rpc
		} as any,
		queries,
		rpc
	};
}

function createOAuthClient(overrides: Record<string, unknown> = {}) {
	return {
		generateCodeVerifierAsync: vi.fn().mockResolvedValue({
			codeVerifier: 'pkce-verifier',
			codeChallenge: 'pkce-challenge'
		}),
		generateAuthUrl: vi.fn().mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth'),
		getToken: vi.fn().mockResolvedValue({
			tokens: {
				access_token: 'access-token',
				refresh_token: 'refresh-token',
				id_token: 'id-token',
				expiry_date: Date.parse('2026-07-22T18:00:00.000Z'),
				token_type: 'Bearer'
			}
		}),
		verifyIdToken: vi.fn().mockResolvedValue({
			getPayload: () => ({
				iss: 'https://accounts.google.com',
				aud: 'gmail-read-client',
				sub: 'google-sub-1',
				email: 'dj@example.com',
				email_verified: true,
				name: 'DJ Wayne',
				nonce: 'oauth-nonce',
				iat: 1,
				exp: 2
			})
		}),
		getTokenInfo: vi.fn().mockResolvedValue({
			aud: 'gmail-read-client',
			scopes: ['openid', 'email', GMAIL_READ_SCOPE],
			expiry_date: Date.parse('2026-07-22T18:00:00.000Z'),
			sub: 'google-sub-1',
			email: 'dj@example.com'
		}),
		setCredentials: vi.fn(),
		refreshAccessToken: vi.fn().mockResolvedValue({
			credentials: {
				access_token: 'refreshed-access-token',
				expiry_date: Date.parse('2026-07-22T19:00:00.000Z'),
				token_type: 'Bearer'
			}
		}),
		revokeToken: vi.fn().mockResolvedValue({}),
		...overrides
	} as any;
}

const originalEncryptionKey = process.env.PRIVATE_GMAIL_TOKEN_ENCRYPTION_KEY_V1;
const originalGoogleClientId = process.env.PRIVATE_GOOGLE_CLIENT_ID;

describe('GmailReadOAuthService', () => {
	beforeEach(() => {
		process.env.PRIVATE_GMAIL_TOKEN_ENCRYPTION_KEY_V1 =
			'gmail-read-test-encryption-key-with-at-least-32-bytes';
		process.env.PRIVATE_GOOGLE_CLIENT_ID = 'calendar-client';
	});

	afterEach(() => {
		vi.restoreAllMocks();
		if (originalEncryptionKey === undefined) {
			delete process.env.PRIVATE_GMAIL_TOKEN_ENCRYPTION_KEY_V1;
		} else {
			process.env.PRIVATE_GMAIL_TOKEN_ENCRYPTION_KEY_V1 = originalEncryptionKey;
		}
		if (originalGoogleClientId === undefined) {
			delete process.env.PRIVATE_GOOGLE_CLIENT_ID;
		} else {
			process.env.PRIVATE_GOOGLE_CLIENT_ID = originalGoogleClientId;
		}
	});

	it('creates a hashed, expiring state and requests only read-only Gmail access', async () => {
		const { admin, queries } = createAdmin();
		const oauthClient = createOAuthClient();
		const service = new GmailReadOAuthService(admin, {
			clientId: 'gmail-read-client',
			clientSecret: 'gmail-read-secret',
			createOAuthClient: () => oauthClient,
			now: () => new Date('2026-07-22T17:00:00.000Z'),
			randomToken: vi
				.fn()
				.mockReturnValueOnce('raw-state-token')
				.mockReturnValueOnce('oauth-nonce')
		});

		const authorizationUrl = await service.createAuthorizationUrl({
			userId: 'user-1',
			redirectUri: 'https://app.example.com/auth/google/gmail-read/callback',
			redirectPath: '/profile?tab=email&gmail=1'
		});

		expect(authorizationUrl).toBe('https://accounts.google.com/o/oauth2/v2/auth');
		expect(queries.email_oauth_states.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				state_hash: createHash('sha256').update('raw-state-token').digest('hex'),
				user_id: 'user-1',
				oauth_client_kind: 'gmail_read',
				nonce: 'oauth-nonce',
				code_verifier: 'pkce-verifier',
				expires_at: '2026-07-22T17:10:00.000Z'
			})
		);
		expect(queries.email_oauth_states.insert.mock.calls[0][0]).not.toHaveProperty(
			'state',
			'raw-state-token'
		);
		expect(oauthClient.generateAuthUrl).toHaveBeenCalledWith(
			expect.objectContaining({
				access_type: 'offline',
				prompt: 'consent select_account',
				scope: ['openid', 'email', GMAIL_READ_SCOPE],
				state: 'raw-state-token',
				include_granted_scopes: false,
				code_challenge: 'pkce-challenge'
			})
		);
	});

	it.each([
		'https://www.googleapis.com/auth/gmail.send',
		'https://www.googleapis.com/auth/gmail.labels'
	])('blocks a read callback if Google returns unexpected Gmail scope %s', async (scope) => {
		const { admin, rpc } = createAdmin();
		const oauthClient = createOAuthClient({
			getTokenInfo: vi.fn().mockResolvedValue({
				aud: 'gmail-read-client',
				scopes: [GMAIL_READ_SCOPE, scope],
				expiry_date: Date.now(),
				sub: 'google-sub-1'
			})
		});
		const service = new GmailReadOAuthService(admin, {
			clientId: 'gmail-read-client',
			clientSecret: 'gmail-read-secret',
			createOAuthClient: () => oauthClient
		});

		await expect(
			service.exchangeAuthorizationCode({
				userId: 'user-1',
				code: 'authorization-code',
				redirectUri: 'https://app.example.com/auth/google/gmail-read/callback',
				state: {
					state_id: 'state-1',
					redirect_path: '/profile?tab=email',
					nonce: 'oauth-nonce',
					code_verifier: 'pkce-verifier',
					connection_id: null
				}
			})
		).rejects.toMatchObject<GmailOAuthError>({ code: 'scope_mismatch' });
		expect(rpc).not.toHaveBeenCalledWith('upsert_gmail_read_connection', expect.anything());
	});

	it('saves only encrypted tokens through the service-role upsert', async () => {
		const connectionRow = {
			id: 'connection-1',
			user_id: 'user-1',
			provider: 'google_gmail',
			provider_account_id: 'google-sub-1',
			email_address: 'dj@example.com',
			display_name: 'DJ Wayne',
			account_label: 'dj',
			status: 'active',
			read_enabled: true,
			connected_at: '2026-07-22T17:00:00.000Z',
			last_verified_at: '2026-07-22T17:00:00.000Z',
			last_used_at: null
		};
		const { admin, rpc } = createAdmin({
			connection: { data: null, error: null },
			upsertConnection: { data: [connectionRow], error: null }
		});
		const oauthClient = createOAuthClient();
		const service = new GmailReadOAuthService(admin, {
			clientId: 'gmail-read-client',
			clientSecret: 'gmail-read-secret',
			createOAuthClient: () => oauthClient
		});

		const result = await service.exchangeAuthorizationCode({
			userId: 'user-1',
			code: 'authorization-code',
			redirectUri: 'https://app.example.com/auth/google/gmail-read/callback',
			state: {
				state_id: 'state-1',
				redirect_path: '/profile?tab=email',
				nonce: 'oauth-nonce',
				code_verifier: 'pkce-verifier',
				connection_id: null
			}
		});

		expect(result.id).toBe('connection-1');
		const upsertCall = rpc.mock.calls.find(
			([name]) => name === 'upsert_gmail_read_connection'
		)?.[1];
		expect(upsertCall.p_access_token_ciphertext).toMatch(/^enc:gmail:v1\./);
		expect(upsertCall.p_refresh_token_ciphertext).toMatch(/^enc:gmail:v1\./);
		expect(upsertCall.p_access_token_ciphertext).not.toContain('access-token');
		expect(upsertCall.p_granted_scopes).toEqual(['email', GMAIL_READ_SCOPE, 'openid'].sort());
		expect(
			decryptGmailToken(upsertCall.p_refresh_token_ciphertext, {
				userId: 'user-1',
				providerAccountId: 'google-sub-1',
				grantKind: 'read'
			})
		).toBe('refresh-token');
	});

	it('preserves an existing refresh token during a same-account reconnect', async () => {
		const connection = {
			id: 'connection-1',
			user_id: 'user-1',
			provider: 'google_gmail',
			provider_account_id: 'google-sub-1',
			email_address: 'dj@example.com',
			display_name: 'DJ Wayne',
			account_label: 'BuildOS',
			status: 'active',
			read_enabled: true,
			connected_at: '2026-07-22T17:00:00.000Z',
			last_verified_at: '2026-07-22T17:00:00.000Z',
			last_used_at: null
		};
		const encryptedRefreshToken = encryptGmailToken('preserved-refresh-token', {
			userId: 'user-1',
			providerAccountId: 'google-sub-1',
			grantKind: 'read'
		});
		const { admin, rpc } = createAdmin({
			connection: { data: connection, error: null },
			credential: {
				data: { refresh_token_ciphertext: encryptedRefreshToken },
				error: null
			},
			upsertConnection: { data: [connection], error: null }
		});
		const oauthClient = createOAuthClient({
			getToken: vi.fn().mockResolvedValue({
				tokens: {
					access_token: 'new-access-token',
					id_token: 'id-token',
					expiry_date: Date.now(),
					token_type: 'Bearer'
				}
			})
		});
		const service = new GmailReadOAuthService(admin, {
			clientId: 'gmail-read-client',
			clientSecret: 'gmail-read-secret',
			createOAuthClient: () => oauthClient
		});

		await service.exchangeAuthorizationCode({
			userId: 'user-1',
			code: 'authorization-code',
			redirectUri: 'https://app.example.com/auth/google/gmail-read/callback',
			state: {
				state_id: 'state-1',
				redirect_path: '/profile?tab=email',
				nonce: 'oauth-nonce',
				code_verifier: 'pkce-verifier',
				connection_id: 'connection-1'
			}
		});

		const upsertCall = rpc.mock.calls.find(
			([name]) => name === 'upsert_gmail_read_connection'
		)?.[1];
		expect(
			decryptGmailToken(upsertCall.p_refresh_token_ciphertext, {
				userId: 'user-1',
				providerAccountId: 'google-sub-1',
				grantKind: 'read'
			})
		).toBe('preserved-refresh-token');
	});

	it('rotates an expiring access token for only the selected Gmail connection', async () => {
		const connection = {
			id: 'connection-1',
			user_id: 'user-1',
			provider: 'google_gmail',
			provider_account_id: 'google-sub-1',
			email_address: 'dj@example.com',
			display_name: 'DJ Wayne',
			account_label: 'BuildOS',
			status: 'active',
			read_enabled: true,
			connected_at: '2026-07-22T17:00:00.000Z',
			last_verified_at: '2026-07-22T17:00:00.000Z',
			last_used_at: null
		};
		const tokenContext = {
			userId: 'user-1',
			providerAccountId: 'google-sub-1',
			grantKind: 'read' as const
		};
		const credential = {
			access_token_ciphertext: encryptGmailToken('old-access-token', tokenContext),
			refresh_token_ciphertext: encryptGmailToken('refresh-token', tokenContext),
			access_token_expires_at: '2026-07-22T17:01:00.000Z',
			token_type: 'Bearer',
			granted_scopes: [GMAIL_READ_SCOPE]
		};
		const { admin, rpc } = createAdmin({
			connection: { data: connection, error: null },
			credential: { data: credential, error: null }
		});
		const oauthClient = createOAuthClient();
		const service = new GmailReadOAuthService(admin, {
			clientId: 'gmail-read-client',
			clientSecret: 'gmail-read-secret',
			createOAuthClient: () => oauthClient,
			now: () => new Date('2026-07-22T17:00:00.000Z')
		});

		const accessToken = await service.getAuthorizedReadAccessToken('user-1', 'connection-1');

		expect(accessToken).toBe('refreshed-access-token');
		expect(oauthClient.setCredentials).toHaveBeenCalledWith(
			expect.objectContaining({ refresh_token: 'refresh-token' })
		);
		const rotateCall = rpc.mock.calls.find(
			([name]) => name === 'rotate_gmail_read_credentials'
		)?.[1];
		expect(rotateCall.p_user_id).toBe('user-1');
		expect(rotateCall.p_connection_id).toBe('connection-1');
		expect(decryptGmailToken(rotateCall.p_access_token_ciphertext, tokenContext)).toBe(
			'refreshed-access-token'
		);
	});

	it('blocks token access when the BuildOS read capability is disabled', async () => {
		const connection = {
			id: 'connection-1',
			user_id: 'user-1',
			provider: 'google_gmail',
			provider_account_id: 'google-sub-1',
			email_address: 'dj@example.com',
			display_name: 'DJ Wayne',
			account_label: 'BuildOS',
			status: 'active',
			read_enabled: true,
			connected_at: '2026-07-22T17:00:00.000Z',
			last_verified_at: '2026-07-22T17:00:00.000Z',
			last_used_at: null
		};
		const { admin, queries } = createAdmin({
			connection: { data: connection, error: null },
			capability: {
				data: { status: 'disabled', granted_scopes: [GMAIL_READ_SCOPE] },
				error: null
			}
		});
		const service = new GmailReadOAuthService(admin, {
			clientId: 'gmail-read-client',
			clientSecret: 'gmail-read-secret',
			createOAuthClient: () => createOAuthClient()
		});

		await expect(
			service.getAuthorizedReadAccessToken('user-1', 'connection-1')
		).rejects.toMatchObject<GmailOAuthError>({ code: 'read_capability_disabled' });
		expect(queries.email_connection_credentials.select).not.toHaveBeenCalled();
	});

	it('blocks a stored read credential that contains an action scope', async () => {
		const connection = {
			id: 'connection-1',
			user_id: 'user-1',
			provider: 'google_gmail',
			provider_account_id: 'google-sub-1',
			email_address: 'dj@example.com',
			display_name: 'DJ Wayne',
			account_label: 'BuildOS',
			status: 'active',
			read_enabled: true,
			connected_at: '2026-07-22T17:00:00.000Z',
			last_verified_at: '2026-07-22T17:00:00.000Z',
			last_used_at: null
		};
		const tokenContext = {
			userId: 'user-1',
			providerAccountId: 'google-sub-1',
			grantKind: 'read' as const
		};
		const { admin, rpc } = createAdmin({
			connection: { data: connection, error: null },
			credential: {
				data: {
					access_token_ciphertext: encryptGmailToken('access-token', tokenContext),
					refresh_token_ciphertext: encryptGmailToken('refresh-token', tokenContext),
					access_token_expires_at: '2026-07-22T18:00:00.000Z',
					token_type: 'Bearer',
					granted_scopes: [GMAIL_READ_SCOPE, 'https://www.googleapis.com/auth/gmail.send']
				},
				error: null
			}
		});
		const service = new GmailReadOAuthService(admin, {
			clientId: 'gmail-read-client',
			clientSecret: 'gmail-read-secret',
			createOAuthClient: () => createOAuthClient(),
			now: () => new Date('2026-07-22T17:00:00.000Z')
		});

		await expect(
			service.getAuthorizedReadAccessToken('user-1', 'connection-1')
		).rejects.toMatchObject<GmailOAuthError>({ code: 'reconnect_required' });
		expect(rpc).toHaveBeenCalledWith('mark_gmail_read_connection_reconnect_required', {
			p_user_id: 'user-1',
			p_connection_id: 'connection-1'
		});
	});

	it('marks only the selected Gmail connection reconnect-required after invalid_grant', async () => {
		const connection = {
			id: 'connection-1',
			user_id: 'user-1',
			provider: 'google_gmail',
			provider_account_id: 'google-sub-1',
			email_address: 'dj@example.com',
			display_name: 'DJ Wayne',
			account_label: 'BuildOS',
			status: 'active',
			read_enabled: true,
			connected_at: '2026-07-22T17:00:00.000Z',
			last_verified_at: '2026-07-22T17:00:00.000Z',
			last_used_at: null
		};
		const tokenContext = {
			userId: 'user-1',
			providerAccountId: 'google-sub-1',
			grantKind: 'read' as const
		};
		const { admin, rpc } = createAdmin({
			connection: { data: connection, error: null },
			credential: {
				data: {
					access_token_ciphertext: encryptGmailToken('old-access-token', tokenContext),
					refresh_token_ciphertext: encryptGmailToken('refresh-token', tokenContext),
					access_token_expires_at: '2026-07-22T17:01:00.000Z',
					token_type: 'Bearer',
					granted_scopes: [GMAIL_READ_SCOPE]
				},
				error: null
			}
		});
		const oauthClient = createOAuthClient({
			refreshAccessToken: vi.fn().mockRejectedValue({
				response: { data: { error: 'invalid_grant' } }
			})
		});
		const service = new GmailReadOAuthService(admin, {
			clientId: 'gmail-read-client',
			clientSecret: 'gmail-read-secret',
			createOAuthClient: () => oauthClient,
			now: () => new Date('2026-07-22T17:00:00.000Z')
		});

		await expect(
			service.getAuthorizedReadAccessToken('user-1', 'connection-1')
		).rejects.toMatchObject<GmailOAuthError>({ code: 'reconnect_required' });
		expect(rpc).toHaveBeenCalledWith('mark_gmail_read_connection_reconnect_required', {
			p_user_id: 'user-1',
			p_connection_id: 'connection-1'
		});
	});

	it('removes local credentials even when remote revocation cannot be confirmed', async () => {
		const connection = {
			id: 'connection-1',
			user_id: 'user-1',
			provider: 'google_gmail',
			provider_account_id: 'google-sub-1',
			email_address: 'dj@example.com',
			display_name: 'DJ Wayne',
			account_label: 'BuildOS',
			status: 'active',
			read_enabled: true,
			connected_at: '2026-07-22T17:00:00.000Z',
			last_verified_at: '2026-07-22T17:00:00.000Z',
			last_used_at: null
		};
		const credential = {
			access_token_ciphertext: encryptGmailToken('access-token', {
				userId: 'user-1',
				providerAccountId: 'google-sub-1',
				grantKind: 'read'
			}),
			refresh_token_ciphertext: encryptGmailToken('refresh-token', {
				userId: 'user-1',
				providerAccountId: 'google-sub-1',
				grantKind: 'read'
			}),
			granted_scopes: [GMAIL_READ_SCOPE]
		};
		const { admin, queries } = createAdmin({
			connection: { data: connection, error: null },
			credential: { data: credential, error: null }
		});
		const oauthClient = createOAuthClient({
			revokeToken: vi.fn().mockRejectedValue(new Error('Google unavailable'))
		});
		const service = new GmailReadOAuthService(admin, {
			clientId: 'gmail-read-client',
			clientSecret: 'gmail-read-secret',
			createOAuthClient: () => oauthClient
		});

		const result = await service.disconnectConnection('user-1', 'connection-1');

		expect(result.remoteRevocationSucceeded).toBe(false);
		expect(oauthClient.revokeToken).toHaveBeenCalledWith('refresh-token');
		expect(queries.user_email_connections.delete).toHaveBeenCalledOnce();
	});

	it('removes every Gmail connection during account deletion while bounding revocation failures', async () => {
		const connections = [
			{
				id: 'connection-1',
				user_id: 'user-1',
				provider: 'google_gmail',
				provider_account_id: 'google-sub-1',
				email_address: 'one@example.com',
				display_name: 'One',
				account_label: 'One',
				status: 'active',
				read_enabled: true,
				connected_at: '2026-07-22T17:00:00.000Z',
				last_verified_at: '2026-07-22T17:00:00.000Z',
				last_used_at: null
			},
			{
				id: 'connection-2',
				user_id: 'user-1',
				provider: 'google_gmail',
				provider_account_id: 'google-sub-2',
				email_address: 'two@example.com',
				display_name: 'Two',
				account_label: 'Two',
				status: 'active',
				read_enabled: true,
				connected_at: '2026-07-22T17:00:00.000Z',
				last_verified_at: '2026-07-22T17:00:00.000Z',
				last_used_at: null
			}
		];
		const credentials = connections.map((connection, index) => ({
			connection_id: connection.id,
			access_token_ciphertext: encryptGmailToken(`access-${index + 1}`, {
				userId: 'user-1',
				providerAccountId: connection.provider_account_id,
				grantKind: 'read'
			}),
			refresh_token_ciphertext: encryptGmailToken(`refresh-${index + 1}`, {
				userId: 'user-1',
				providerAccountId: connection.provider_account_id,
				grantKind: 'read'
			}),
			access_token_expires_at: '2026-07-22T18:00:00.000Z',
			token_type: 'Bearer',
			granted_scopes: [GMAIL_READ_SCOPE]
		}));
		const { admin, queries } = createAdmin({
			connection: { data: connections, error: null },
			credential: { data: credentials, error: null }
		});
		const oauthClient = createOAuthClient({
			revokeToken: vi.fn((token: string) =>
				token === 'refresh-1'
					? Promise.resolve({})
					: Promise.reject(new Error('Google unavailable'))
			)
		});
		const service = new GmailReadOAuthService(admin, {
			clientId: 'gmail-read-client',
			clientSecret: 'gmail-read-secret',
			createOAuthClient: () => oauthClient
		});

		const result = await service.disconnectAllConnectionsForAccountDeletion('user-1');

		expect(result).toEqual({
			connectionsFound: 2,
			connectionsDeleted: 2,
			remoteRevocationsSucceeded: 1,
			remoteRevocationsUnconfirmed: 1
		});
		expect(oauthClient.revokeToken).toHaveBeenCalledTimes(2);
		expect(queries.user_email_connections.delete).toHaveBeenCalledOnce();
	});
});
