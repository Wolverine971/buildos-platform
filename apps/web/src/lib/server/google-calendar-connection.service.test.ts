// apps/web/src/lib/server/google-calendar-connection.service.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import {
	decryptGoogleCalendarToken,
	encryptGoogleCalendarToken,
	type GoogleCalendarTokenContext
} from './google-calendar-token-crypto';
import {
	GOOGLE_CALENDAR_SCOPE,
	GoogleCalendarConnectionService,
	normalizeGoogleCalendarSourcePreferences
} from './google-calendar-connection.service';

type QueryResult = { data: unknown; error: unknown; count?: number | null };

function createQuery(result: QueryResult = { data: null, error: null }) {
	const query: any = {
		select: vi.fn(() => query),
		eq: vi.fn(() => query),
		is: vi.fn(() => query),
		in: vi.fn(() => query),
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

function createAdmin(options: {
	connection?: QueryResult;
	credential?: QueryResult;
	connectionCount?: number;
	sources?: QueryResult;
	preferences?: QueryResult;
	legacy?: QueryResult;
}) {
	const queries = {
		user_calendar_connections: createQuery(
			options.connection ?? {
				data: null,
				error: null,
				count: options.connectionCount ?? 0
			}
		),
		calendar_connection_credentials: createQuery(options.credential),
		calendar_oauth_states: createQuery(),
		calendar_access_audit_events: createQuery(),
		user_calendar_sources: createQuery(options.sources ?? { data: [], error: null }),
		user_calendar_preferences: createQuery(options.preferences ?? { data: null, error: null }),
		user_calendar_tokens: createQuery(options.legacy)
	};
	const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
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
			codeVerifier: 'calendar-pkce-verifier',
			codeChallenge: 'calendar-pkce-challenge'
		}),
		generateAuthUrl: vi.fn().mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth'),
		getToken: vi.fn(),
		verifyIdToken: vi.fn(),
		getTokenInfo: vi.fn().mockResolvedValue({
			aud: 'shared-login-client',
			sub: 'google-sub-1',
			scopes: [GOOGLE_CALENDAR_SCOPE],
			expiry_date: Date.parse('2026-08-11T19:00:00.000Z')
		}),
		setCredentials: vi.fn(),
		refreshAccessToken: vi.fn().mockResolvedValue({
			credentials: {
				access_token: 'refreshed-access-token',
				refresh_token: 'shared-refresh-token',
				expiry_date: Date.parse('2026-08-11T19:00:00.000Z'),
				token_type: 'Bearer'
			}
		}),
		revokeToken: vi.fn(),
		...overrides
	} as any;
}

const originalTokenKey = process.env.PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1;

describe('GoogleCalendarConnectionService', () => {
	beforeEach(() => {
		process.env.PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1 =
			'test-google-calendar-connection-key-material';
	});

	afterEach(() => {
		vi.restoreAllMocks();
		if (originalTokenKey === undefined) {
			delete process.env.PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1;
		} else {
			process.env.PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1 = originalTokenKey;
		}
	});

	it('stores hashed state and starts new grants only with the dedicated Calendar client', async () => {
		const { admin, queries } = createAdmin({ connectionCount: 0 });
		const oauthClient = createOAuthClient();
		const oauthClientFactory = vi.fn().mockReturnValue(oauthClient);
		const service = new GoogleCalendarConnectionService(admin, {
			dedicatedClientId: 'calendar-client',
			dedicatedClientSecret: 'calendar-secret',
			sharedLoginClientId: 'shared-login-client',
			sharedLoginClientSecret: 'shared-login-secret',
			createOAuthClient: oauthClientFactory,
			now: () => new Date('2026-08-11T17:00:00.000Z'),
			randomToken: vi
				.fn()
				.mockReturnValueOnce('opaque-calendar-state')
				.mockReturnValueOnce('calendar-nonce')
		});

		const authorizationUrl = await service.createAuthorizationUrl({
			userId: 'user-1',
			redirectUri: 'https://app.example.com/auth/google/calendar-callback'
		});

		expect(authorizationUrl).toBe('https://accounts.google.com/o/oauth2/v2/auth');
		expect(oauthClientFactory).toHaveBeenCalledWith(
			'google_calendar',
			'https://app.example.com/auth/google/calendar-callback'
		);
		expect(queries.calendar_oauth_states.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				state_hash: createHash('sha256').update('opaque-calendar-state').digest('hex'),
				user_id: 'user-1',
				oauth_client_kind: 'google_calendar',
				nonce: 'calendar-nonce',
				code_verifier: 'calendar-pkce-verifier',
				expires_at: '2026-08-11T17:10:00.000Z'
			})
		);
		expect(oauthClient.generateAuthUrl).toHaveBeenCalledWith(
			expect.objectContaining({
				access_type: 'offline',
				prompt: 'consent select_account',
				scope: ['openid', 'email', GOOGLE_CALENDAR_SCOPE],
				state: 'opaque-calendar-state',
				include_granted_scopes: false,
				code_challenge: 'calendar-pkce-challenge'
			})
		);
	});

	it('does not expose calendars that disappeared from the provider', async () => {
		const { admin, queries } = createAdmin({
			connection: {
				data: [
					{
						id: 'connection-1',
						user_id: 'user-1',
						provider_account_id: 'google-sub-1',
						email_address: 'calendar@example.com',
						display_name: null,
						account_label: 'Calendar',
						status: 'active',
						connected_at: '2026-08-11T16:00:00.000Z',
						last_verified_at: null,
						last_used_at: null,
						deleted_at: null
					}
				],
				error: null
			},
			sources: { data: [], error: null }
		});
		const service = new GoogleCalendarConnectionService(admin, {
			dedicatedClientId: 'calendar-client',
			dedicatedClientSecret: 'calendar-secret'
		});

		await service.listConnections('user-1');

		expect(queries.user_calendar_sources.is).toHaveBeenCalledWith('provider_deleted_at', null);
	});

	it('refreshes a migrated credential with the shared login client and preserves its client kind', async () => {
		const connection = {
			id: 'connection-1',
			user_id: 'user-1',
			provider_account_id: 'google-sub-1',
			email_address: 'calendar@example.com',
			display_name: 'Calendar User',
			account_label: 'Legacy calendar',
			status: 'active',
			connected_at: '2026-08-11T16:00:00.000Z',
			last_verified_at: null,
			last_used_at: null,
			deleted_at: null
		};
		const tokenContext: GoogleCalendarTokenContext = {
			userId: 'user-1',
			connectionId: 'connection-1',
			providerAccountId: 'google-sub-1',
			oauthClientKind: 'google_shared_login'
		};
		const credential = {
			connection_id: 'connection-1',
			oauth_client_kind: 'google_shared_login',
			access_token_ciphertext: encryptGoogleCalendarToken('old-access-token', tokenContext),
			refresh_token_ciphertext: encryptGoogleCalendarToken(
				'shared-refresh-token',
				tokenContext
			),
			access_token_expires_at: '2026-08-11T17:01:00.000Z',
			refresh_token_expires_at: null,
			token_type: 'Bearer',
			granted_scopes: [GOOGLE_CALENDAR_SCOPE],
			key_version: 1
		};
		const { admin, rpc } = createAdmin({
			connection: { data: connection, error: null },
			credential: { data: credential, error: null }
		});
		const sharedClient = createOAuthClient();
		const oauthClientFactory = vi.fn().mockReturnValue(sharedClient);
		const service = new GoogleCalendarConnectionService(admin, {
			dedicatedClientId: 'calendar-client',
			dedicatedClientSecret: 'calendar-secret',
			sharedLoginClientId: 'shared-login-client',
			sharedLoginClientSecret: 'shared-login-secret',
			createOAuthClient: oauthClientFactory,
			now: () => new Date('2026-08-11T17:00:00.000Z')
		});

		await service.getAuthenticatedClient('user-1', 'connection-1');

		expect(oauthClientFactory).toHaveBeenCalledWith('google_shared_login');
		expect(sharedClient.setCredentials).toHaveBeenCalledWith(
			expect.objectContaining({ refresh_token: 'shared-refresh-token' })
		);
		const rotateCall = rpc.mock.calls.find(
			([name]) => name === 'rotate_google_calendar_credentials'
		)?.[1];
		expect(rotateCall.p_oauth_client_kind).toBe('google_shared_login');
		expect(decryptGoogleCalendarToken(rotateCall.p_access_token_ciphertext, tokenContext)).toBe(
			'refreshed-access-token'
		);
	});

	it('keeps the authenticated-client cache scoped to both the user and connection', async () => {
		const connection = {
			id: 'connection-1',
			user_id: 'user-1',
			provider_account_id: 'google-sub-1',
			status: 'active'
		};
		const tokenContext: GoogleCalendarTokenContext = {
			userId: 'user-1',
			connectionId: 'connection-1',
			providerAccountId: 'google-sub-1',
			oauthClientKind: 'google_calendar'
		};
		const { admin, queries } = createAdmin({
			connection: { data: connection, error: null },
			credential: {
				data: {
					connection_id: 'connection-1',
					oauth_client_kind: 'google_calendar',
					access_token_ciphertext: encryptGoogleCalendarToken(
						'access-token',
						tokenContext
					),
					refresh_token_ciphertext: encryptGoogleCalendarToken(
						'refresh-token',
						tokenContext
					),
					access_token_expires_at: '2026-08-11T18:00:00.000Z',
					refresh_token_expires_at: null,
					token_type: 'Bearer',
					granted_scopes: [GOOGLE_CALENDAR_SCOPE],
					key_version: 1
				},
				error: null
			}
		});
		const service = new GoogleCalendarConnectionService(admin, {
			dedicatedClientId: 'calendar-client',
			dedicatedClientSecret: 'calendar-secret',
			createOAuthClient: () => createOAuthClient(),
			now: () => new Date('2026-08-11T17:00:00.000Z')
		});

		await service.getAuthenticatedClient('user-1', 'connection-1');
		queries.user_calendar_connections.eq.mockClear();
		await service.getAuthenticatedClient('user-2', 'connection-1');

		expect(queries.user_calendar_connections.eq).toHaveBeenCalledWith('user_id', 'user-2');
	});

	it('normalizes source settings so sync and event reads cannot diverge', () => {
		expect(normalizeGoogleCalendarSourcePreferences({ syncEnabled: true })).toEqual({
			syncEnabled: true,
			readEnabled: true
		});
		expect(normalizeGoogleCalendarSourcePreferences({ readEnabled: false })).toEqual({
			readEnabled: false,
			syncEnabled: false
		});
	});

	it('promotes the earliest connected writable primary when the stored default is invalid', async () => {
		const { admin, rpc } = createAdmin({
			connection: {
				data: [
					{ id: 'connection-early', connected_at: '2026-08-10T10:00:00.000Z' },
					{ id: 'connection-late', connected_at: '2026-08-11T10:00:00.000Z' }
				],
				error: null
			},
			sources: {
				data: [
					{
						id: 'source-late',
						connection_id: 'connection-late',
						is_primary: true,
						created_at: '2026-08-11T10:01:00.000Z'
					},
					{
						id: 'source-early',
						connection_id: 'connection-early',
						is_primary: true,
						created_at: '2026-08-10T10:01:00.000Z'
					}
				],
				error: null
			},
			preferences: {
				data: { default_write_calendar_source_id: 'no-longer-writable' },
				error: null
			}
		});
		const service = new GoogleCalendarConnectionService(admin, {
			dedicatedClientId: 'calendar-client',
			dedicatedClientSecret: 'calendar-secret',
			sharedLoginClientId: 'shared-login-client',
			sharedLoginClientSecret: 'shared-login-secret'
		});

		await expect(service.reconcileDefaultWriteSource('user-1')).resolves.toBe('source-early');
		expect(rpc).toHaveBeenCalledWith('set_default_calendar_source', {
			p_user_id: 'user-1',
			p_calendar_source_id: 'source-early'
		});
	});

	it('disconnects a reconnect-required connection even when no active credential remains', async () => {
		const { admin, rpc } = createAdmin({
			connection: {
				data: {
					id: 'connection-1',
					user_id: 'user-1',
					provider_account_id: 'google-sub-1',
					status: 'reconnect_required'
				},
				error: null
			},
			credential: { data: null, error: null }
		});
		const oauthClient = createOAuthClient();
		const service = new GoogleCalendarConnectionService(admin, {
			dedicatedClientId: 'calendar-client',
			dedicatedClientSecret: 'calendar-secret',
			createOAuthClient: () => oauthClient
		});

		await expect(service.disconnectConnection('user-1', 'connection-1')).resolves.toEqual({
			remoteRevocationSucceeded: false
		});
		expect(rpc).toHaveBeenCalledWith('disable_calendar_connection', {
			p_user_id: 'user-1',
			p_connection_id: 'connection-1'
		});
		expect(oauthClient.revokeToken).not.toHaveBeenCalled();
	});

	it('disables an active connection locally and then revokes its Google grant', async () => {
		const connection = {
			id: 'connection-1',
			user_id: 'user-1',
			provider_account_id: 'google-sub-1',
			status: 'active'
		};
		const tokenContext: GoogleCalendarTokenContext = {
			userId: 'user-1',
			connectionId: 'connection-1',
			providerAccountId: 'google-sub-1',
			oauthClientKind: 'google_calendar'
		};
		const { admin, rpc } = createAdmin({
			connection: { data: connection, error: null },
			credential: {
				data: {
					connection_id: 'connection-1',
					oauth_client_kind: 'google_calendar',
					access_token_ciphertext: encryptGoogleCalendarToken(
						'access-token',
						tokenContext
					),
					refresh_token_ciphertext: encryptGoogleCalendarToken(
						'refresh-token',
						tokenContext
					),
					access_token_expires_at: null,
					refresh_token_expires_at: null,
					token_type: 'Bearer',
					granted_scopes: [GOOGLE_CALENDAR_SCOPE],
					key_version: 1
				},
				error: null
			}
		});
		const oauthClient = createOAuthClient();
		const service = new GoogleCalendarConnectionService(admin, {
			dedicatedClientId: 'calendar-client',
			dedicatedClientSecret: 'calendar-secret',
			createOAuthClient: () => oauthClient
		});

		await expect(service.disconnectConnection('user-1', 'connection-1')).resolves.toEqual({
			remoteRevocationSucceeded: true
		});
		expect(rpc).toHaveBeenCalledWith('disable_calendar_connection', {
			p_user_id: 'user-1',
			p_connection_id: 'connection-1'
		});
		expect(oauthClient.revokeToken).toHaveBeenCalledWith('refresh-token');
	});

	it('removes every Calendar connection during account deletion and bounds revocation failures', async () => {
		const connections = [
			{
				id: 'connection-1',
				user_id: 'user-1',
				provider_account_id: 'google-sub-1',
				oauth_client_kind: 'google_shared_login',
				status: 'active'
			},
			{
				id: 'connection-2',
				user_id: 'user-1',
				provider_account_id: 'google-sub-2',
				oauth_client_kind: 'google_calendar',
				status: 'active'
			}
		];
		const credentials = connections.map((connection, index) => {
			const oauthClientKind = connection.oauth_client_kind as
				| 'google_calendar'
				| 'google_shared_login';
			const context: GoogleCalendarTokenContext = {
				userId: 'user-1',
				connectionId: connection.id,
				providerAccountId: connection.provider_account_id,
				oauthClientKind
			};
			return {
				connection_id: connection.id,
				oauth_client_kind: oauthClientKind,
				access_token_ciphertext: encryptGoogleCalendarToken(`access-${index + 1}`, context),
				refresh_token_ciphertext: encryptGoogleCalendarToken(
					`refresh-${index + 1}`,
					context
				),
				access_token_expires_at: null,
				refresh_token_expires_at: null,
				token_type: 'Bearer',
				granted_scopes: [GOOGLE_CALENDAR_SCOPE],
				key_version: 1
			};
		});
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
		const service = new GoogleCalendarConnectionService(admin, {
			dedicatedClientId: 'calendar-client',
			dedicatedClientSecret: 'calendar-secret',
			sharedLoginClientId: 'shared-login-client',
			sharedLoginClientSecret: 'shared-login-secret',
			createOAuthClient: () => oauthClient
		});

		await expect(service.disconnectAllConnectionsForAccountDeletion('user-1')).resolves.toEqual(
			{
				connectionsFound: 2,
				connectionsDeleted: 2,
				remoteRevocationsSucceeded: 1,
				remoteRevocationsUnconfirmed: 1,
				legacyTokenDeleted: false
			}
		);
		expect(oauthClient.revokeToken).toHaveBeenCalledTimes(2);
		expect(queries.user_calendar_connections.delete).toHaveBeenCalledOnce();
	});

	it('revokes and deletes an unmigrated singleton grant during account deletion', async () => {
		const { admin, queries } = createAdmin({
			connection: { data: [], error: null },
			legacy: {
				data: {
					user_id: 'user-1',
					access_token: 'legacy-access-token',
					refresh_token: 'legacy-refresh-token',
					expiry_date: null,
					google_email: 'calendar@example.com',
					google_user_id: 'google-sub-1',
					scope: GOOGLE_CALENDAR_SCOPE,
					token_type: 'Bearer',
					created_at: null,
					updated_at: null
				},
				error: null
			}
		});
		const oauthClient = createOAuthClient();
		const service = new GoogleCalendarConnectionService(admin, {
			dedicatedClientId: 'calendar-client',
			dedicatedClientSecret: 'calendar-secret',
			sharedLoginClientId: 'shared-login-client',
			sharedLoginClientSecret: 'shared-login-secret',
			createOAuthClient: () => oauthClient
		});

		await expect(service.disconnectAllConnectionsForAccountDeletion('user-1')).resolves.toEqual(
			{
				connectionsFound: 0,
				connectionsDeleted: 0,
				remoteRevocationsSucceeded: 1,
				remoteRevocationsUnconfirmed: 0,
				legacyTokenDeleted: true
			}
		);
		expect(oauthClient.revokeToken).toHaveBeenCalledWith('legacy-refresh-token');
		expect(queries.user_calendar_tokens.delete).toHaveBeenCalledOnce();
	});

	it('migrates a verified singleton grant without changing its issuing OAuth client', async () => {
		const { admin, rpc } = createAdmin({
			connection: { data: null, error: null },
			legacy: {
				data: {
					user_id: 'user-1',
					access_token: 'legacy-access-token',
					refresh_token: 'legacy-refresh-token',
					expiry_date: Date.parse('2026-08-11T17:01:00.000Z'),
					google_email: 'calendar@example.com',
					google_user_id: 'google-sub-1',
					scope: GOOGLE_CALENDAR_SCOPE,
					token_type: 'Bearer',
					created_at: '2026-01-01T00:00:00.000Z',
					updated_at: '2026-08-11T16:00:00.000Z'
				},
				error: null
			}
		});
		rpc.mockImplementation((name: string) =>
			Promise.resolve(
				name === 'upsert_google_calendar_connection'
					? {
							data: [
								{
									id: 'migrated-connection',
									user_id: 'user-1',
									provider_account_id: 'google-sub-1'
								}
							],
							error: null
						}
					: { data: null, error: null }
			)
		);
		const oauthClient = createOAuthClient({
			getTokenInfo: vi.fn().mockResolvedValue({
				aud: 'shared-login-client',
				sub: 'google-sub-1',
				scopes: [GOOGLE_CALENDAR_SCOPE]
			}),
			refreshAccessToken: vi.fn().mockResolvedValue({
				credentials: {
					access_token: 'migrated-access-token',
					expiry_date: Date.parse('2026-08-11T19:00:00.000Z'),
					token_type: 'Bearer'
				}
			})
		});
		const service = new GoogleCalendarConnectionService(admin, {
			dedicatedClientId: 'calendar-client',
			dedicatedClientSecret: 'calendar-secret',
			sharedLoginClientId: 'shared-login-client',
			sharedLoginClientSecret: 'shared-login-secret',
			createOAuthClient: () => oauthClient,
			createCalendarApi: () =>
				({
					calendarList: {
						list: vi.fn().mockResolvedValue({ data: { items: [] } })
					}
				}) as any,
			randomUuid: () => 'migrated-connection'
		});

		await expect(service.migrateLegacyConnection('user-1')).resolves.toEqual({
			status: 'migrated',
			connectionId: 'migrated-connection'
		});
		const upsertCall = rpc.mock.calls.find(
			([name]) => name === 'upsert_google_calendar_connection'
		)?.[1];
		expect(upsertCall.p_oauth_client_kind).toBe('google_shared_login');
		expect(upsertCall.p_new_connection_id).toBe('migrated-connection');
	});

	it('repairs source discovery when a previous migration already created the connection', async () => {
		const { admin } = createAdmin({
			connection: { data: { id: 'existing-connection' }, error: null },
			legacy: {
				data: {
					user_id: 'user-1',
					access_token: 'legacy-access-token',
					refresh_token: 'legacy-refresh-token',
					expiry_date: Date.parse('2026-08-11T17:01:00.000Z'),
					google_email: 'calendar@example.com',
					google_user_id: 'google-sub-1',
					scope: GOOGLE_CALENDAR_SCOPE,
					token_type: 'Bearer',
					created_at: '2026-01-01T00:00:00.000Z',
					updated_at: '2026-08-11T16:00:00.000Z'
				},
				error: null
			}
		});
		const service = new GoogleCalendarConnectionService(admin, {
			dedicatedClientId: 'calendar-client',
			dedicatedClientSecret: 'calendar-secret',
			sharedLoginClientId: 'shared-login-client',
			sharedLoginClientSecret: 'shared-login-secret'
		});
		const authenticatedClient = createOAuthClient();
		const getAuthenticatedClient = vi
			.spyOn(service, 'getAuthenticatedClient')
			.mockResolvedValue(authenticatedClient);
		const discoverSources = vi.spyOn(service, 'discoverSources').mockResolvedValue([]);

		await expect(service.migrateLegacyConnection('user-1')).resolves.toEqual({
			status: 'already_migrated',
			connectionId: 'existing-connection'
		});
		expect(getAuthenticatedClient).toHaveBeenCalledWith('user-1', 'existing-connection');
		expect(discoverSources).toHaveBeenCalledWith(
			'user-1',
			'existing-connection',
			authenticatedClient
		);
	});
});
