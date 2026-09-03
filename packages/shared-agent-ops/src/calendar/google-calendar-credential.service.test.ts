// packages/shared-agent-ops/src/calendar/google-calendar-credential.service.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	GOOGLE_CALENDAR_SCOPE,
	GoogleCalendarCredentialService
} from './google-calendar-credential.service';
import {
	decryptGoogleCalendarToken,
	encryptGoogleCalendarToken,
	type GoogleCalendarOauthClientKind,
	type GoogleCalendarTokenContext
} from './google-calendar-token-crypto';

const now = new Date('2026-09-03T18:00:00.000Z');
const key = 'shared-calendar-test-key-material-at-least-32-bytes';

function query(result: { data: unknown; error: unknown }) {
	const chain: any = {
		select: vi.fn(() => chain),
		eq: vi.fn(() => chain),
		is: vi.fn(() => chain),
		maybeSingle: vi.fn().mockResolvedValue(result),
		insert: vi.fn().mockResolvedValue({ error: null })
	};
	return chain;
}

function fixture(kind: GoogleCalendarOauthClientKind = 'google_calendar') {
	const tokenContext: GoogleCalendarTokenContext = {
		userId: 'user-1',
		connectionId: 'connection-1',
		providerAccountId: 'google-sub-1',
		oauthClientKind: kind
	};
	const connection = {
		id: 'connection-1',
		user_id: 'user-1',
		provider_account_id: 'google-sub-1',
		status: 'active'
	};
	const credential = {
		connection_id: 'connection-1',
		oauth_client_kind: kind,
		access_token_ciphertext: encryptGoogleCalendarToken('old-access', tokenContext, () => key),
		refresh_token_ciphertext: encryptGoogleCalendarToken(
			'old-refresh',
			tokenContext,
			() => key
		),
		access_token_expires_at: '2026-09-03T18:01:00.000Z',
		refresh_token_expires_at: '2026-09-10T18:00:00.000Z',
		token_type: 'Bearer',
		granted_scopes: [GOOGLE_CALENDAR_SCOPE],
		key_version: 1
	};
	const queries = {
		user_calendar_connections: query({ data: connection, error: null }),
		calendar_connection_credentials: query({ data: credential, error: null }),
		calendar_access_audit_events: query({ data: null, error: null })
	};
	const admin = {
		from: vi.fn((table: string) => queries[table as keyof typeof queries]),
		rpc: vi.fn().mockResolvedValue({ data: null, error: null })
	};
	const oauth = {
		setCredentials: vi.fn(),
		refreshAccessToken: vi.fn().mockResolvedValue({
			credentials: {
				access_token: 'new-access',
				refresh_token: 'rotated-refresh',
				expiry_date: Date.parse('2026-09-03T19:00:00.000Z'),
				token_type: 'Bearer'
			}
		}),
		getTokenInfo: vi.fn().mockResolvedValue({
			aud: kind === 'google_calendar' ? 'calendar-client' : 'shared-client',
			sub: 'google-sub-1',
			scopes: [GOOGLE_CALENDAR_SCOPE]
		})
	};
	const createOAuthClient = vi.fn(() => oauth);
	const service = new GoogleCalendarCredentialService(admin, {
		createOAuthClient,
		getOAuthClientCredentials: (clientKind) => ({
			clientId: clientKind === 'google_calendar' ? 'calendar-client' : 'shared-client',
			clientSecret: 'configured-secret'
		}),
		resolveTokenKey: () => key,
		now: () => now
	});
	return {
		service,
		admin,
		queries,
		oauth,
		createOAuthClient,
		connection,
		credential,
		tokenContext
	};
}

describe('GoogleCalendarCredentialService', () => {
	it.each(['google_calendar', 'google_shared_login'] as const)(
		'loads and durably rotates %s credentials with the exact connection context',
		async (kind) => {
			const { service, admin, queries, oauth, createOAuthClient, tokenContext } =
				fixture(kind);
			expect(await service.getAuthenticatedClient('user-1', 'connection-1')).toBe(oauth);
			expect(createOAuthClient).toHaveBeenCalledWith(kind);
			expect(queries.user_calendar_connections.eq).toHaveBeenCalledWith('user_id', 'user-1');
			expect(queries.user_calendar_connections.eq).toHaveBeenCalledWith('id', 'connection-1');
			expect(queries.calendar_connection_credentials.is).toHaveBeenCalledWith(
				'revoked_at',
				null
			);
			const [name, rotation] = admin.rpc.mock.calls[0]!;
			expect(name).toBe('rotate_google_calendar_credentials');
			expect(rotation).toMatchObject({
				p_user_id: 'user-1',
				p_connection_id: 'connection-1',
				p_oauth_client_kind: kind,
				p_key_version: 1,
				p_refresh_token_expires_at: '2026-09-10T18:00:00.000Z'
			});
			expect(
				decryptGoogleCalendarToken(
					rotation.p_access_token_ciphertext,
					tokenContext,
					() => key
				)
			).toBe('new-access');
			expect(
				decryptGoogleCalendarToken(
					rotation.p_refresh_token_ciphertext,
					tokenContext,
					() => key
				)
			).toBe('rotated-refresh');
			expect(JSON.stringify(rotation)).not.toContain('new-access');
			expect(JSON.stringify(rotation)).not.toContain('rotated-refresh');
			expect(queries.calendar_access_audit_events.insert).not.toHaveBeenCalled();
		}
	);

	it('keeps valid tokens cached and supports exact invalidation and force-refresh', async () => {
		const { service, admin, credential, oauth } = fixture();
		credential.access_token_expires_at = '2026-09-03T19:00:00.000Z';
		await service.getAuthenticatedClient('user-1', 'connection-1');
		await service.getAuthenticatedClient('user-1', 'connection-1');
		expect(oauth.refreshAccessToken).not.toHaveBeenCalled();
		expect(admin.from).toHaveBeenCalledTimes(2);
		service.invalidateClient('other-user', 'connection-1');
		await service.getAuthenticatedClient('user-1', 'connection-1');
		expect(admin.from).toHaveBeenCalledTimes(2);
		service.invalidateClient('user-1', 'connection-1');
		await service.getAuthenticatedClient('user-1', 'connection-1');
		expect(admin.from).toHaveBeenCalledTimes(4);
		await service.getAuthenticatedClient('user-1', 'connection-1', { forceRefresh: true });
		expect(oauth.refreshAccessToken).toHaveBeenCalledOnce();
	});

	it('does not reuse a cached client for a different user', async () => {
		const { service, credential, queries } = fixture();
		credential.access_token_expires_at = '2026-09-03T19:00:00.000Z';
		await service.getAuthenticatedClient('user-1', 'connection-1');
		queries.user_calendar_connections.maybeSingle.mockResolvedValueOnce({
			data: null,
			error: null
		});
		await expect(
			service.getAuthenticatedClient('other-user', 'connection-1')
		).rejects.toMatchObject({ code: 'connection_not_found' });
		expect(queries.user_calendar_connections.eq).toHaveBeenCalledWith('user_id', 'other-user');
	});

	it.each([
		{ aud: 'different-client', sub: 'google-sub-1', scopes: [GOOGLE_CALENDAR_SCOPE] },
		{ aud: 'calendar-client', sub: 'different-account', scopes: [GOOGLE_CALENDAR_SCOPE] },
		{ aud: 'calendar-client', sub: 'google-sub-1', scopes: ['openid'] }
	])('rejects a refreshed authorization with mismatched policy: %j', async (tokenInfo) => {
		const { service, admin, oauth, queries } = fixture();
		oauth.getTokenInfo.mockResolvedValueOnce(tokenInfo);
		await expect(
			service.getAuthenticatedClient('user-1', 'connection-1')
		).rejects.toMatchObject({ code: 'reconnect_required' });
		expect(admin.rpc).toHaveBeenCalledWith('mark_calendar_connection_reconnect_required', {
			p_user_id: 'user-1',
			p_connection_id: 'connection-1'
		});
		expect(
			admin.rpc.mock.calls.some(([name]) => name === 'rotate_google_calendar_credentials')
		).toBe(false);
		expect(queries.calendar_access_audit_events.insert).toHaveBeenCalledWith(
			expect.objectContaining({ reason_code: 'refreshed_token_policy_mismatch' })
		);
		expect(JSON.stringify(queries.calendar_access_audit_events.insert.mock.calls)).not.toMatch(
			/new-access|old-refresh|configured-secret/
		);
	});

	it('marks revoked grants for reconnect but leaves transient provider failures retryable', async () => {
		const revoked = fixture();
		revoked.oauth.refreshAccessToken.mockRejectedValueOnce({
			response: { data: { error: 'invalid_grant' } }
		});
		await expect(
			revoked.service.getAuthenticatedClient('user-1', 'connection-1')
		).rejects.toMatchObject({ code: 'reconnect_required' });
		expect(revoked.admin.rpc).toHaveBeenCalledWith(
			'mark_calendar_connection_reconnect_required',
			expect.any(Object)
		);

		const transient = fixture();
		transient.oauth.refreshAccessToken.mockRejectedValueOnce(new Error('network timeout'));
		await expect(
			transient.service.getAuthenticatedClient('user-1', 'connection-1')
		).rejects.toMatchObject({ code: 'provider_error' });
		expect(transient.admin.rpc).not.toHaveBeenCalled();
	});

	it('fails closed for inactive connections and missing credentials', async () => {
		const inactive = fixture();
		inactive.connection.status = 'disabled';
		await expect(
			inactive.service.getAuthenticatedClient('user-1', 'connection-1')
		).rejects.toMatchObject({ code: 'reconnect_required' });
		expect(inactive.oauth.setCredentials).not.toHaveBeenCalled();
		expect(inactive.queries.calendar_connection_credentials.maybeSingle).not.toHaveBeenCalled();

		const missing = fixture();
		missing.queries.calendar_connection_credentials.maybeSingle.mockResolvedValueOnce({
			data: null,
			error: null
		});
		await expect(
			missing.service.getAuthenticatedClient('user-1', 'connection-1')
		).rejects.toMatchObject({ code: 'reconnect_required' });
		expect(missing.admin.rpc).toHaveBeenCalledWith(
			'mark_calendar_connection_reconnect_required',
			expect.any(Object)
		);
	});

	it('never refreshes ciphertext bound to a different account', async () => {
		const { service, connection, oauth, admin } = fixture();
		connection.provider_account_id = 'different-account';
		await expect(
			service.getAuthenticatedClient('user-1', 'connection-1')
		).rejects.toMatchObject({
			code: 'database_error',
			message: 'Stored Google Calendar credentials are unavailable'
		});
		expect(oauth.setCredentials).not.toHaveBeenCalled();
		expect(oauth.refreshAccessToken).not.toHaveBeenCalled();
		expect(admin.rpc).not.toHaveBeenCalled();
	});

	it('does not cache a refreshed client when durable credential rotation fails', async () => {
		const { service, admin, queries, oauth } = fixture();
		admin.rpc.mockResolvedValueOnce({ data: null, error: { message: 'database unavailable' } });
		await expect(
			service.getAuthenticatedClient('user-1', 'connection-1')
		).rejects.toMatchObject({ code: 'database_error' });
		await service.getAuthenticatedClient('user-1', 'connection-1');
		expect(queries.calendar_connection_credentials.maybeSingle).toHaveBeenCalledTimes(2);
		expect(oauth.refreshAccessToken).toHaveBeenCalledTimes(2);
	});

	it('preserves the existing refresh token and computes an explicit rotated expiry', async () => {
		const { service, admin, oauth, tokenContext } = fixture();
		oauth.refreshAccessToken.mockResolvedValueOnce({
			credentials: {
				access_token: 'new-access',
				expiry_date: Date.parse('2026-09-03T19:00:00.000Z'),
				refresh_token_expires_in: '3600'
			}
		} as never);
		await service.getAuthenticatedClient('user-1', 'connection-1');
		const rotation = admin.rpc.mock.calls[0]![1];
		expect(
			decryptGoogleCalendarToken(rotation.p_refresh_token_ciphertext, tokenContext, () => key)
		).toBe('old-refresh');
		expect(rotation.p_refresh_token_expires_at).toBe('2026-09-03T19:00:00.000Z');
	});
});
