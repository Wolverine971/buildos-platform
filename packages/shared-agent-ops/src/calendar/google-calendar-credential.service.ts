// packages/shared-agent-ops/src/calendar/google-calendar-credential.service.ts
// Server-only credential loading and verified refresh, shared by web and workers.
// The caller supplies host-specific OAuth configuration; no SvelteKit dependency.
import type { Credentials, OAuth2Client, TokenInfo } from 'google-auth-library';
import {
	decryptGoogleCalendarToken,
	encryptGoogleCalendarToken,
	getActiveGoogleCalendarTokenKeyVersion,
	type GoogleCalendarOauthClientKind,
	type GoogleCalendarTokenContext,
	type GoogleCalendarTokenKeyResolver
} from './google-calendar-token-crypto';

export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';

export type GoogleCalendarCredentialClient = {
	from(table: string): any;
	rpc(
		name: string,
		args?: Record<string, unknown>
	): PromiseLike<{
		data: unknown;
		error: { code?: string; message?: string; details?: string } | null;
	}>;
};

export type CalendarCredentialOAuthClient = Pick<
	OAuth2Client,
	'setCredentials' | 'refreshAccessToken' | 'getTokenInfo'
>;

export type GoogleCalendarCredentialServiceOptions<TClient extends CalendarCredentialOAuthClient> =
	{
		createOAuthClient: (kind: GoogleCalendarOauthClientKind) => TClient;
		getOAuthClientCredentials: (kind: GoogleCalendarOauthClientKind) => {
			clientId: string;
			clientSecret: string;
		};
		resolveTokenKey?: GoogleCalendarTokenKeyResolver;
		now?: () => Date;
	};

type ConnectionRow = {
	id: string;
	user_id: string;
	provider_account_id: string;
	status: string;
};

type CredentialRow = {
	connection_id: string;
	oauth_client_kind: GoogleCalendarOauthClientKind;
	access_token_ciphertext: string;
	refresh_token_ciphertext: string;
	access_token_expires_at: string | null;
	refresh_token_expires_at: string | null;
	token_type: string;
	granted_scopes: string[];
	key_version: number;
};

type CredentialsWithRefreshTokenExpiry = Credentials & {
	refresh_token_expires_in?: number | string | null;
};

export class GoogleCalendarConnectionError extends Error {
	constructor(
		public readonly code:
			| 'not_configured'
			| 'invalid_state'
			| 'invalid_token_response'
			| 'identity_verification_failed'
			| 'scope_mismatch'
			| 'refresh_token_required'
			| 'connection_not_found'
			| 'source_not_found'
			| 'source_conflict'
			| 'source_not_writable'
			| 'account_mismatch'
			| 'account_already_connected'
			| 'connection_limit_exceeded'
			| 'reconnect_required'
			| 'database_error'
			| 'provider_error',
		message: string,
		public readonly redirectPath = '/profile?tab=calendar'
	) {
		super(message);
		this.name = 'GoogleCalendarConnectionError';
	}
}

function normalizeScopeList(scopes: string[] | string | null | undefined): string[] {
	const values = Array.isArray(scopes)
		? scopes
		: typeof scopes === 'string'
			? scopes.split(' ')
			: [];
	return Array.from(new Set(values.map((scope) => scope.trim()).filter(Boolean))).sort();
}

function getRefreshTokenExpiresAt(credentials: Credentials, now: Date): string | null {
	const rawSeconds = (credentials as CredentialsWithRefreshTokenExpiry).refresh_token_expires_in;
	const seconds = typeof rawSeconds === 'string' ? Number(rawSeconds) : rawSeconds;
	if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return null;
	return new Date(now.getTime() + Math.floor(seconds * 1000)).toISOString();
}

function isReconnectRequiredRefreshError(error: unknown): boolean {
	if (!error || typeof error !== 'object') return false;
	const candidate = error as {
		message?: unknown;
		response?: { data?: { error?: unknown } };
	};
	const providerCode = candidate.response?.data?.error;
	const message = typeof candidate.message === 'string' ? candidate.message.toLowerCase() : '';
	return (
		providerCode === 'invalid_grant' ||
		providerCode === 'invalid_client' ||
		message.includes('invalid_grant') ||
		message.includes('invalid_client') ||
		message.includes('expired or revoked')
	);
}

export class GoogleCalendarCredentialService<
	TClient extends CalendarCredentialOAuthClient = CalendarCredentialOAuthClient
> {
	private readonly createOAuthClient: (kind: GoogleCalendarOauthClientKind) => TClient;
	private readonly getOAuthClientCredentials: GoogleCalendarCredentialServiceOptions<TClient>['getOAuthClientCredentials'];
	private readonly resolveTokenKey: GoogleCalendarTokenKeyResolver | undefined;
	private readonly now: () => Date;
	private readonly clientCache = new Map<string, { client: TClient; expiresAt: number }>();

	constructor(
		private readonly admin: GoogleCalendarCredentialClient,
		options: GoogleCalendarCredentialServiceOptions<TClient>
	) {
		this.createOAuthClient = options.createOAuthClient;
		this.getOAuthClientCredentials = options.getOAuthClientCredentials;
		this.resolveTokenKey = options.resolveTokenKey;
		this.now = options.now ?? (() => new Date());
	}

	/** Disconnect/account deletion must invalidate the exact user+connection cache. */
	invalidateClient(userId: string, connectionId: string): void {
		this.clientCache.delete(this.clientCacheKey(userId, connectionId));
	}

	private decryptToken(value: string, context: GoogleCalendarTokenContext): string {
		return decryptGoogleCalendarToken(value, context, this.resolveTokenKey);
	}

	private encryptToken(value: string, context: GoogleCalendarTokenContext): string {
		return encryptGoogleCalendarToken(value, context, this.resolveTokenKey);
	}

	private tokenContext(
		connection: ConnectionRow,
		oauthClientKind: GoogleCalendarOauthClientKind
	): GoogleCalendarTokenContext {
		return {
			userId: connection.user_id,
			connectionId: connection.id,
			providerAccountId: connection.provider_account_id,
			oauthClientKind
		};
	}

	private async audit(params: {
		userId: string;
		connectionId: string;
		operation: string;
		outcome: 'failure';
		reasonCode: string;
	}): Promise<void> {
		try {
			await this.admin.from('calendar_access_audit_events').insert({
				user_id: params.userId,
				connection_id: params.connectionId,
				calendar_source_id: null,
				operation: params.operation,
				outcome: params.outcome,
				reason_code: params.reasonCode,
				metadata: {}
			});
		} catch {
			// Never store OAuth material or replace the primary error with an audit error.
		}
	}

	private clientCacheKey(userId: string, connectionId: string): string {
		return `${userId}:${connectionId}`;
	}

	private async loadConnectionAndCredential(
		userId: string,
		connectionId: string
	): Promise<{ connection: ConnectionRow; credential: CredentialRow }> {
		const { data: connectionData, error: connectionError } = await this.admin
			.from('user_calendar_connections')
			.select('*')
			.eq('id', connectionId)
			.eq('user_id', userId)
			.eq('provider', 'google_calendar')
			.is('deleted_at', null)
			.maybeSingle();
		const connection = connectionData as ConnectionRow | null;
		if (connectionError || !connection) {
			throw new GoogleCalendarConnectionError(
				'connection_not_found',
				'Google Calendar connection was not found'
			);
		}
		if (connection.status !== 'active') {
			throw new GoogleCalendarConnectionError(
				'reconnect_required',
				'This Google Calendar account must be reconnected'
			);
		}

		const { data: credentialData, error: credentialError } = await this.admin
			.from('calendar_connection_credentials')
			.select('*')
			.eq('connection_id', connectionId)
			.is('revoked_at', null)
			.maybeSingle();
		const credential = credentialData as CredentialRow | null;
		if (credentialError || !credential) {
			await this.markReconnectRequired(userId, connectionId, 'credentials_unavailable');
			throw new GoogleCalendarConnectionError(
				'reconnect_required',
				'This Google Calendar account must be reconnected'
			);
		}
		return { connection, credential };
	}

	async getAuthenticatedClient(
		userId: string,
		connectionId: string,
		options: { forceRefresh?: boolean } = {}
	): Promise<TClient> {
		const cacheKey = this.clientCacheKey(userId, connectionId);
		const cached = this.clientCache.get(cacheKey);
		if (!options.forceRefresh && cached && cached.expiresAt > this.now().getTime()) {
			return cached.client;
		}

		const { connection, credential } = await this.loadConnectionAndCredential(
			userId,
			connectionId
		);
		const context = this.tokenContext(connection, credential.oauth_client_kind);
		let accessToken: string;
		let refreshToken: string;
		try {
			accessToken = this.decryptToken(credential.access_token_ciphertext, context);
			refreshToken = this.decryptToken(credential.refresh_token_ciphertext, context);
		} catch {
			throw new GoogleCalendarConnectionError(
				'database_error',
				'Stored Google Calendar credentials are unavailable'
			);
		}

		const oauthClient = this.createOAuthClient(credential.oauth_client_kind);
		oauthClient.setCredentials({
			access_token: accessToken,
			refresh_token: refreshToken,
			token_type: credential.token_type,
			scope: credential.granted_scopes.join(' '),
			expiry_date: credential.access_token_expires_at
				? Date.parse(credential.access_token_expires_at)
				: undefined
		});

		const expiresAt = credential.access_token_expires_at
			? Date.parse(credential.access_token_expires_at)
			: Number.NaN;
		if (
			!options.forceRefresh &&
			Number.isFinite(expiresAt) &&
			expiresAt > this.now().getTime() + 5 * 60 * 1000
		) {
			this.clientCache.set(cacheKey, {
				client: oauthClient,
				expiresAt: Math.min(
					expiresAt - 5 * 60 * 1000,
					this.now().getTime() + 10 * 60 * 1000
				)
			});
			return oauthClient;
		}

		let refreshed: Credentials;
		try {
			refreshed = (await oauthClient.refreshAccessToken()).credentials;
		} catch (error) {
			if (isReconnectRequiredRefreshError(error)) {
				await this.markReconnectRequired(userId, connectionId, 'provider_grant_invalid');
				throw new GoogleCalendarConnectionError(
					'reconnect_required',
					'This Google Calendar account authorization has expired. Please reconnect it.'
				);
			}
			throw new GoogleCalendarConnectionError(
				'provider_error',
				'Google Calendar is temporarily unavailable'
			);
		}

		if (!refreshed.access_token) {
			throw new GoogleCalendarConnectionError(
				'invalid_token_response',
				'Google returned an incomplete refreshed Calendar authorization'
			);
		}

		const clientCredentials = this.getOAuthClientCredentials(credential.oauth_client_kind);
		let tokenInfo: TokenInfo;
		try {
			tokenInfo = await oauthClient.getTokenInfo(refreshed.access_token);
		} catch {
			throw new GoogleCalendarConnectionError(
				'identity_verification_failed',
				'Unable to verify the refreshed Calendar authorization'
			);
		}
		const grantedScopes = normalizeScopeList(
			tokenInfo.scopes ?? refreshed.scope ?? credential.granted_scopes
		);
		if (
			tokenInfo.aud !== clientCredentials.clientId ||
			(tokenInfo.sub && tokenInfo.sub !== connection.provider_account_id) ||
			!grantedScopes.includes(GOOGLE_CALENDAR_SCOPE)
		) {
			await this.markReconnectRequired(
				userId,
				connectionId,
				'refreshed_token_policy_mismatch'
			);
			throw new GoogleCalendarConnectionError(
				'reconnect_required',
				'This Google Calendar authorization no longer matches the connection'
			);
		}

		const rotatedRefreshToken = refreshed.refresh_token ?? refreshToken;
		const { error: rotateError } = await this.admin.rpc('rotate_google_calendar_credentials', {
			p_user_id: userId,
			p_connection_id: connectionId,
			p_oauth_client_kind: credential.oauth_client_kind,
			p_access_token_ciphertext: this.encryptToken(refreshed.access_token, context),
			p_refresh_token_ciphertext: this.encryptToken(rotatedRefreshToken, context),
			p_access_token_expires_at: refreshed.expiry_date
				? new Date(refreshed.expiry_date).toISOString()
				: null,
			p_refresh_token_expires_at:
				getRefreshTokenExpiresAt(refreshed, this.now()) ??
				credential.refresh_token_expires_at,
			p_token_type: refreshed.token_type ?? credential.token_type ?? 'Bearer',
			p_granted_scopes: grantedScopes,
			p_key_version: getActiveGoogleCalendarTokenKeyVersion()
		});
		if (rotateError) {
			throw new GoogleCalendarConnectionError(
				'database_error',
				'Unable to rotate Google Calendar credentials safely'
			);
		}

		oauthClient.setCredentials({
			...refreshed,
			refresh_token: rotatedRefreshToken
		});
		this.clientCache.set(cacheKey, {
			client: oauthClient,
			expiresAt: this.now().getTime() + 10 * 60 * 1000
		});
		return oauthClient;
	}

	private async markReconnectRequired(
		userId: string,
		connectionId: string,
		reasonCode: string
	): Promise<void> {
		this.clientCache.delete(this.clientCacheKey(userId, connectionId));
		await this.admin.rpc('mark_calendar_connection_reconnect_required', {
			p_user_id: userId,
			p_connection_id: connectionId
		});
		await this.audit({
			userId,
			connectionId,
			operation: 'calendar.token.refresh',
			outcome: 'failure',
			reasonCode
		});
	}
}
