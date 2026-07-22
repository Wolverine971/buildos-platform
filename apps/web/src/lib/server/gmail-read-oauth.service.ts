// apps/web/src/lib/server/gmail-read-oauth.service.ts
import { env as privateEnv } from '$env/dynamic/private';
import {
	CodeChallengeMethod,
	OAuth2Client,
	type Credentials,
	type TokenInfo,
	type TokenPayload
} from 'google-auth-library';
import { createHash, randomBytes } from 'node:crypto';
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type {
	ConsumedEmailOauthState,
	EmailConnectionCredentialRow,
	GmailSchemaClient,
	UserEmailConnectionRow
} from './gmail-database.types';
import {
	decryptGmailToken,
	encryptGmailToken,
	getActiveGmailTokenKeyVersion,
	type GmailTokenContext
} from './gmail-token-crypto';
import type {
	GmailConnectionCapability,
	GmailConnectionSummary,
	GmailConnectionsPayload
} from '$lib/types/gmail-integration';

export const GMAIL_READ_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
export const GMAIL_READ_CONSENT_POLICY_VERSION = 'gmail-read-v1-2026-07-22';
export const MAX_GMAIL_CONNECTIONS = 5;

const GMAIL_SCOPE_PREFIX = 'https://www.googleapis.com/auth/gmail.';
const GMAIL_FULL_ACCESS_SCOPE = 'https://mail.google.com';

type GmailOAuthClient = Pick<
	OAuth2Client,
	| 'generateCodeVerifierAsync'
	| 'generateAuthUrl'
	| 'getToken'
	| 'verifyIdToken'
	| 'getTokenInfo'
	| 'setCredentials'
	| 'refreshAccessToken'
	| 'revokeToken'
>;

type GmailReadOAuthServiceOptions = {
	clientId?: string;
	clientSecret?: string;
	createOAuthClient?: (redirectUri?: string) => GmailOAuthClient;
	now?: () => Date;
	randomToken?: () => string;
};

type OAuthStateRow = ConsumedEmailOauthState;

type EmailConnectionRow = UserEmailConnectionRow;

type EmailCredentialRow = Pick<
	EmailConnectionCredentialRow,
	| 'access_token_ciphertext'
	| 'refresh_token_ciphertext'
	| 'access_token_expires_at'
	| 'token_type'
	| 'granted_scopes'
>;

export class GmailOAuthError extends Error {
	constructor(
		public readonly code:
			| 'not_configured'
			| 'invalid_state'
			| 'invalid_token_response'
			| 'identity_verification_failed'
			| 'scope_mismatch'
			| 'refresh_token_required'
			| 'connection_not_found'
			| 'account_mismatch'
			| 'account_already_connected'
			| 'connection_limit_exceeded'
			| 'read_capability_disabled'
			| 'reconnect_required'
			| 'database_error'
			| 'provider_error',
		message: string,
		public readonly redirectPath = '/profile?tab=email'
	) {
		super(message);
		this.name = 'GmailOAuthError';
	}
}

function getPrivateEnv(name: string): string | undefined {
	const value = privateEnv[name] ?? process.env[name];
	return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function hashState(value: string): string {
	return createHash('sha256').update(value, 'utf8').digest('hex');
}

function normalizeRedirectPath(path: string | null | undefined): string {
	if (!path || !path.startsWith('/') || path.startsWith('//')) {
		return '/profile?tab=email';
	}

	try {
		const parsed = new URL(path, 'https://buildos.invalid');
		if (parsed.origin !== 'https://buildos.invalid') return '/profile?tab=email';
		return `${parsed.pathname}${parsed.search}${parsed.hash}`;
	} catch {
		return '/profile?tab=email';
	}
}

function firstRow<T>(data: T | T[] | null | undefined): T | null {
	if (Array.isArray(data)) return data[0] ?? null;
	return data ?? null;
}

function normalizeScopeList(scopes: string[] | string | null | undefined): string[] {
	const values = Array.isArray(scopes)
		? scopes
		: typeof scopes === 'string'
			? scopes.split(' ')
			: [];
	return Array.from(new Set(values.map((scope) => scope.trim()).filter(Boolean))).sort();
}

function isUnexpectedGmailScope(scope: string): boolean {
	return (
		scope.replace(/\/+$/, '') === GMAIL_FULL_ACCESS_SCOPE ||
		(scope.startsWith(GMAIL_SCOPE_PREFIX) && scope !== GMAIL_READ_SCOPE)
	);
}

function isReconnectRequiredRefreshError(error: unknown): boolean {
	if (!error || typeof error !== 'object') return false;
	const candidate = error as {
		code?: unknown;
		status?: unknown;
		message?: unknown;
		response?: { data?: { error?: unknown } };
	};
	const providerCode = candidate.response?.data?.error;
	const message = typeof candidate.message === 'string' ? candidate.message.toLowerCase() : '';

	return (
		providerCode === 'invalid_grant' ||
		providerCode === 'invalid_client' ||
		candidate.code === 400 ||
		candidate.status === 400 ||
		message.includes('invalid_grant') ||
		message.includes('expired or revoked')
	);
}

function getDefaultLabel(emailAddress: string): string {
	return (emailAddress.split('@')[0] || 'Gmail').slice(0, 60);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<T>((_, reject) => {
				timeout = setTimeout(() => reject(new Error('provider_timeout')), timeoutMs);
			})
		]);
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}

export class GmailReadOAuthService {
	private readonly admin: GmailSchemaClient;
	private readonly clientId: string;
	private readonly clientSecret: string;
	private readonly createOAuthClient: (redirectUri?: string) => GmailOAuthClient;
	private readonly now: () => Date;
	private readonly randomToken: () => string;

	constructor(
		admin: TypedSupabaseClient | GmailSchemaClient,
		options: GmailReadOAuthServiceOptions = {}
	) {
		// The Gmail tables are not in the generated Database types yet; every query in this class
		// is typed against the hand-authored schema in gmail-database.types.ts.
		this.admin = admin as GmailSchemaClient;
		this.clientId = options.clientId ?? getPrivateEnv('PRIVATE_GMAIL_READ_CLIENT_ID') ?? '';
		this.clientSecret =
			options.clientSecret ?? getPrivateEnv('PRIVATE_GMAIL_READ_CLIENT_SECRET') ?? '';
		this.createOAuthClient =
			options.createOAuthClient ??
			((redirectUri?: string) =>
				new OAuth2Client(this.clientId, this.clientSecret, redirectUri));
		this.now = options.now ?? (() => new Date());
		this.randomToken = options.randomToken ?? (() => randomBytes(32).toString('base64url'));
	}

	isConfigured(): boolean {
		const encryptionKey = getPrivateEnv('PRIVATE_GMAIL_TOKEN_ENCRYPTION_KEY_V1');
		const existingGoogleClientId = getPrivateEnv('PRIVATE_GOOGLE_CLIENT_ID');
		return Boolean(
			this.clientId &&
				this.clientSecret &&
				encryptionKey &&
				Buffer.byteLength(encryptionKey, 'utf8') >= 32 &&
				(!existingGoogleClientId || existingGoogleClientId !== this.clientId)
		);
	}

	private requireConfigured(): void {
		if (!this.isConfigured()) {
			throw new GmailOAuthError(
				'not_configured',
				'Gmail read-only integration is not configured'
			);
		}
	}

	private async audit(params: {
		userId: string;
		connectionId?: string | null;
		operation: string;
		outcome: 'success' | 'failure' | 'blocked';
		reasonCode?: string;
		metadata?: Record<string, string | number | boolean | null>;
	}): Promise<void> {
		try {
			await this.admin.from('email_access_audit_events').insert({
				user_id: params.userId,
				connection_id: params.connectionId ?? null,
				operation: params.operation,
				outcome: params.outcome,
				reason_code: params.reasonCode ?? null,
				metadata: params.metadata ?? {}
			});
		} catch {
			// Auditing must not leak OAuth material or replace the primary error path.
		}
	}

	async listConnections(userId: string): Promise<GmailConnectionsPayload> {
		const { data: connectionData, error: connectionError } = await this.admin
			.from('user_email_connections')
			.select(
				'id, email_address, display_name, account_label, status, read_enabled, connected_at, last_verified_at, last_used_at'
			)
			.eq('user_id', userId)
			.eq('provider', 'google_gmail')
			.is('deleted_at', null)
			.order('connected_at', { ascending: true });

		if (connectionError) {
			throw new GmailOAuthError('database_error', 'Failed to load Gmail connections');
		}

		const rows = (connectionData ?? []) as EmailConnectionRow[];
		const connectionIds = rows.map((row) => row.id);
		let capabilityRows: Array<{
			connection_id: string;
			capability: GmailConnectionCapability['capability'];
			status: GmailConnectionCapability['status'];
		}> = [];

		if (connectionIds.length > 0) {
			const { data, error } = await this.admin
				.from('email_capability_grants')
				.select('connection_id, capability, status')
				.in('connection_id', connectionIds);

			if (error) {
				throw new GmailOAuthError('database_error', 'Failed to load Gmail permissions');
			}
			capabilityRows = (data ?? []) as typeof capabilityRows;
		}

		return {
			available: this.isConfigured(),
			maxConnections: MAX_GMAIL_CONNECTIONS,
			readOnly: true,
			connections: rows.map(
				(row): GmailConnectionSummary => ({
					id: row.id,
					emailAddress: row.email_address,
					displayName: row.display_name,
					accountLabel: row.account_label,
					status: row.status,
					readEnabled: row.read_enabled,
					connectedAt: row.connected_at,
					lastVerifiedAt: row.last_verified_at,
					lastUsedAt: row.last_used_at,
					capabilities: capabilityRows
						.filter((capability) => capability.connection_id === row.id)
						.map(({ capability, status }) => ({ capability, status }))
				})
			)
		};
	}

	async createAuthorizationUrl(params: {
		userId: string;
		redirectUri: string;
		redirectPath?: string;
		connectionId?: string | null;
	}): Promise<string> {
		this.requireConfigured();
		const redirectPath = normalizeRedirectPath(params.redirectPath);
		let reconnectEmail: string | undefined;

		if (params.connectionId) {
			const { data, error } = await this.admin
				.from('user_email_connections')
				.select('id, email_address')
				.eq('id', params.connectionId)
				.eq('user_id', params.userId)
				.eq('provider', 'google_gmail')
				.is('deleted_at', null)
				.maybeSingle();

			if (error || !data) {
				throw new GmailOAuthError('connection_not_found', 'Gmail connection was not found');
			}
			reconnectEmail = data.email_address;
		}

		const oauthClient = this.createOAuthClient(params.redirectUri);
		const { codeVerifier, codeChallenge } = await oauthClient.generateCodeVerifierAsync();
		if (!codeChallenge) {
			throw new GmailOAuthError(
				'provider_error',
				'Unable to create a secure Gmail connection'
			);
		}

		const state = this.randomToken();
		const nonce = this.randomToken();
		const now = this.now();
		const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);

		await this.admin.from('email_oauth_states').delete().lt('expires_at', now.toISOString());

		const { error: stateError } = await this.admin.from('email_oauth_states').insert({
			state_hash: hashState(state),
			user_id: params.userId,
			oauth_client_kind: 'gmail_read',
			connection_id: params.connectionId ?? null,
			redirect_path: redirectPath,
			nonce,
			code_verifier: codeVerifier,
			created_at: now.toISOString(),
			expires_at: expiresAt.toISOString()
		});

		if (stateError) {
			await this.audit({
				userId: params.userId,
				connectionId: params.connectionId,
				operation: 'gmail.oauth.start',
				outcome: 'failure',
				reasonCode: 'state_storage_failed'
			});
			throw new GmailOAuthError('database_error', 'Unable to start Gmail connection');
		}

		await this.audit({
			userId: params.userId,
			connectionId: params.connectionId,
			operation: 'gmail.oauth.start',
			outcome: 'success',
			metadata: { reconnect: Boolean(params.connectionId) }
		});

		return oauthClient.generateAuthUrl({
			access_type: 'offline',
			prompt: params.connectionId ? 'consent' : 'consent select_account',
			scope: ['openid', 'email', GMAIL_READ_SCOPE],
			state,
			nonce,
			include_granted_scopes: false,
			code_challenge: codeChallenge,
			code_challenge_method: CodeChallengeMethod.S256,
			...(reconnectEmail ? { login_hint: reconnectEmail } : {})
		});
	}

	async consumeAuthorizationState(state: string | null, userId: string): Promise<OAuthStateRow> {
		if (!state) {
			throw new GmailOAuthError('invalid_state', 'Gmail authorization state is missing');
		}

		const { data, error } = await this.admin.rpc('consume_email_oauth_state', {
			p_state_hash: hashState(state),
			p_user_id: userId,
			p_oauth_client_kind: 'gmail_read'
		});
		const row = firstRow(data as OAuthStateRow | OAuthStateRow[] | null);

		if (error || !row) {
			await this.audit({
				userId,
				operation: 'gmail.oauth.state.consume',
				outcome: 'blocked',
				reasonCode: 'invalid_or_expired_state'
			});
			throw new GmailOAuthError(
				'invalid_state',
				'Gmail authorization state is invalid or expired'
			);
		}

		return row;
	}

	async exchangeAuthorizationCode(params: {
		userId: string;
		code: string;
		redirectUri: string;
		state: OAuthStateRow;
	}): Promise<GmailConnectionSummary> {
		this.requireConfigured();
		const oauthClient = this.createOAuthClient(params.redirectUri);
		let tokens: Credentials;

		try {
			const result = await oauthClient.getToken({
				code: params.code,
				codeVerifier: params.state.code_verifier,
				redirect_uri: params.redirectUri,
				client_id: this.clientId
			});
			tokens = result.tokens;
		} catch {
			throw new GmailOAuthError(
				'provider_error',
				'Google could not complete the Gmail connection',
				params.state.redirect_path
			);
		}

		if (!tokens.access_token || !tokens.id_token) {
			throw new GmailOAuthError(
				'invalid_token_response',
				'Google returned an incomplete Gmail authorization',
				params.state.redirect_path
			);
		}

		let payload: TokenPayload | undefined;
		let tokenInfo: TokenInfo;

		try {
			const ticket = await oauthClient.verifyIdToken({
				idToken: tokens.id_token,
				audience: this.clientId
			});
			payload = ticket.getPayload();
			tokenInfo = await oauthClient.getTokenInfo(tokens.access_token);
		} catch {
			throw new GmailOAuthError(
				'identity_verification_failed',
				'Unable to verify the connected Google account',
				params.state.redirect_path
			);
		}

		if (
			!payload ||
			!payload.sub ||
			!payload.email ||
			payload.email_verified !== true ||
			payload.nonce !== params.state.nonce ||
			!['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss)
		) {
			throw new GmailOAuthError(
				'identity_verification_failed',
				'Google account identity did not match the connection request',
				params.state.redirect_path
			);
		}

		if ((tokenInfo.sub && tokenInfo.sub !== payload.sub) || tokenInfo.aud !== this.clientId) {
			throw new GmailOAuthError(
				'identity_verification_failed',
				'Google token identity did not match the connected account',
				params.state.redirect_path
			);
		}

		const grantedScopes = normalizeScopeList(tokenInfo.scopes ?? tokens.scope);
		if (!grantedScopes.includes(GMAIL_READ_SCOPE)) {
			throw new GmailOAuthError(
				'scope_mismatch',
				'Google did not grant read-only Gmail access',
				params.state.redirect_path
			);
		}
		if (grantedScopes.some(isUnexpectedGmailScope)) {
			await this.audit({
				userId: params.userId,
				connectionId: params.state.connection_id,
				operation: 'gmail.oauth.complete',
				outcome: 'blocked',
				reasonCode: 'unexpected_action_scope'
			});
			throw new GmailOAuthError(
				'scope_mismatch',
				'Unexpected Gmail action permission was returned to the read-only connection',
				params.state.redirect_path
			);
		}

		let existingConnection: EmailConnectionRow | null = null;
		if (params.state.connection_id) {
			const { data, error } = await this.admin
				.from('user_email_connections')
				.select('*')
				.eq('id', params.state.connection_id)
				.eq('user_id', params.userId)
				.eq('provider', 'google_gmail')
				.is('deleted_at', null)
				.maybeSingle();
			if (error || !data) {
				throw new GmailOAuthError(
					'connection_not_found',
					'Gmail connection was not found',
					params.state.redirect_path
				);
			}
			existingConnection = data as EmailConnectionRow;
			if (existingConnection.provider_account_id !== payload.sub) {
				throw new GmailOAuthError(
					'account_mismatch',
					'Please reconnect using the same Google account',
					params.state.redirect_path
				);
			}
		} else {
			const { data } = await this.admin
				.from('user_email_connections')
				.select('*')
				.eq('user_id', params.userId)
				.eq('provider', 'google_gmail')
				.eq('provider_account_id', payload.sub)
				.is('deleted_at', null)
				.maybeSingle();
			existingConnection = (data as EmailConnectionRow | null) ?? null;
		}

		const tokenContext: GmailTokenContext = {
			userId: params.userId,
			providerAccountId: payload.sub,
			grantKind: 'read'
		};
		let refreshToken = tokens.refresh_token ?? null;

		if (!refreshToken && existingConnection) {
			const { data: existingCredential } = await this.admin
				.from('email_connection_credentials')
				.select('refresh_token_ciphertext')
				.eq('connection_id', existingConnection.id)
				.eq('grant_kind', 'read')
				.is('revoked_at', null)
				.maybeSingle();
			if (existingCredential?.refresh_token_ciphertext) {
				refreshToken = decryptGmailToken(
					existingCredential.refresh_token_ciphertext,
					tokenContext
				);
			}
		}

		if (!refreshToken) {
			throw new GmailOAuthError(
				'refresh_token_required',
				'Google did not return offline Gmail access. Please try connecting again.',
				params.state.redirect_path
			);
		}

		const accessTokenCiphertext = encryptGmailToken(tokens.access_token, tokenContext);
		const refreshTokenCiphertext = encryptGmailToken(refreshToken, tokenContext);
		const expiresAt = tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null;

		const { data: upsertedData, error: upsertError } = await this.admin.rpc(
			'upsert_gmail_read_connection',
			{
				p_user_id: params.userId,
				p_expected_connection_id: params.state.connection_id,
				p_provider_account_id: payload.sub,
				p_email_address: payload.email,
				p_display_name: payload.name ?? null,
				p_default_account_label: getDefaultLabel(payload.email),
				p_access_token_ciphertext: accessTokenCiphertext,
				p_refresh_token_ciphertext: refreshTokenCiphertext,
				p_access_token_expires_at: expiresAt,
				p_token_type: tokens.token_type ?? 'Bearer',
				p_granted_scopes: grantedScopes,
				p_key_version: getActiveGmailTokenKeyVersion(),
				p_consent_policy_version: GMAIL_READ_CONSENT_POLICY_VERSION
			}
		);

		if (upsertError) {
			const detail = `${upsertError.message ?? ''} ${upsertError.details ?? ''}`;
			if (detail.includes('gmail_connection_limit_exceeded')) {
				throw new GmailOAuthError(
					'connection_limit_exceeded',
					`You can connect up to ${MAX_GMAIL_CONNECTIONS} Gmail accounts`,
					params.state.redirect_path
				);
			}
			if (
				upsertError.code === '23505' ||
				detail.includes('user_email_connections_provider_account_active_idx')
			) {
				throw new GmailOAuthError(
					'account_already_connected',
					'This Gmail account is already connected to another BuildOS user',
					params.state.redirect_path
				);
			}
			throw new GmailOAuthError(
				'database_error',
				'Unable to save the Gmail connection',
				params.state.redirect_path
			);
		}

		const connection = firstRow(
			upsertedData as EmailConnectionRow | EmailConnectionRow[] | null
		);
		if (!connection) {
			throw new GmailOAuthError(
				'database_error',
				'Gmail connection was not saved',
				params.state.redirect_path
			);
		}

		await this.audit({
			userId: params.userId,
			connectionId: connection.id,
			operation: 'gmail.oauth.complete',
			outcome: 'success',
			metadata: { reconnect: Boolean(params.state.connection_id), grantKind: 'read' }
		});

		return {
			id: connection.id,
			emailAddress: connection.email_address,
			displayName: connection.display_name,
			accountLabel: connection.account_label,
			status: connection.status,
			readEnabled: connection.read_enabled,
			connectedAt: connection.connected_at,
			lastVerifiedAt: connection.last_verified_at,
			lastUsedAt: connection.last_used_at,
			capabilities: [{ capability: 'read', status: 'enabled' }]
		};
	}

	private async markReconnectRequired(
		userId: string,
		connectionId: string,
		reasonCode: string
	): Promise<void> {
		await this.admin.rpc('mark_gmail_read_connection_reconnect_required', {
			p_user_id: userId,
			p_connection_id: connectionId
		});

		await this.audit({
			userId,
			connectionId,
			operation: 'gmail.token.refresh',
			outcome: 'failure',
			reasonCode
		});
	}

	async getAuthorizedReadAccessToken(userId: string, connectionId: string): Promise<string> {
		this.requireConfigured();

		const { data: connectionData, error: connectionError } = await this.admin
			.from('user_email_connections')
			.select('*')
			.eq('id', connectionId)
			.eq('user_id', userId)
			.eq('provider', 'google_gmail')
			.is('deleted_at', null)
			.maybeSingle();

		if (connectionError || !connectionData) {
			throw new GmailOAuthError('connection_not_found', 'Gmail connection was not found');
		}

		const connection = connectionData as EmailConnectionRow;
		if (connection.status !== 'active' || !connection.read_enabled) {
			throw new GmailOAuthError(
				'reconnect_required',
				'This Gmail account must be reconnected before it can be read'
			);
		}

		const { data: capabilityData, error: capabilityError } = await this.admin
			.from('email_capability_grants')
			.select('status, granted_scopes')
			.eq('connection_id', connectionId)
			.eq('capability', 'read')
			.maybeSingle();

		const capability = capabilityData as {
			status: 'enabled' | 'disabled' | 'reconnect_required';
			granted_scopes: string[];
		} | null;
		const capabilityScopes = normalizeScopeList(capability?.granted_scopes);
		if (
			capabilityError ||
			!capability ||
			capability.status !== 'enabled' ||
			!capabilityScopes.includes(GMAIL_READ_SCOPE) ||
			capabilityScopes.some(isUnexpectedGmailScope)
		) {
			await this.audit({
				userId,
				connectionId,
				operation: 'gmail.read.authorize',
				outcome: 'blocked',
				reasonCode: 'read_capability_disabled'
			});
			throw new GmailOAuthError(
				'read_capability_disabled',
				'Read access is not enabled for this Gmail account'
			);
		}

		const { data: credentialData, error: credentialError } = await this.admin
			.from('email_connection_credentials')
			.select(
				'access_token_ciphertext, refresh_token_ciphertext, access_token_expires_at, token_type, granted_scopes'
			)
			.eq('connection_id', connectionId)
			.eq('grant_kind', 'read')
			.eq('oauth_client_kind', 'gmail_read')
			.is('revoked_at', null)
			.maybeSingle();

		if (credentialError || !credentialData) {
			await this.markReconnectRequired(userId, connectionId, 'read_credentials_unavailable');
			throw new GmailOAuthError(
				'reconnect_required',
				'This Gmail account must be reconnected before it can be read'
			);
		}

		const credential = credentialData as EmailCredentialRow;
		const credentialScopes = normalizeScopeList(credential.granted_scopes);
		if (
			!credentialScopes.includes(GMAIL_READ_SCOPE) ||
			credentialScopes.some(isUnexpectedGmailScope)
		) {
			await this.markReconnectRequired(userId, connectionId, 'stored_scope_policy_mismatch');
			throw new GmailOAuthError(
				'reconnect_required',
				'This Gmail account authorization no longer matches the read-only policy'
			);
		}
		const tokenContext: GmailTokenContext = {
			userId,
			providerAccountId: connection.provider_account_id,
			grantKind: 'read'
		};
		let accessToken: string;
		let refreshToken: string;

		try {
			accessToken = decryptGmailToken(credential.access_token_ciphertext, tokenContext);
			refreshToken = decryptGmailToken(credential.refresh_token_ciphertext, tokenContext);
		} catch {
			throw new GmailOAuthError('database_error', 'Stored Gmail credentials are unavailable');
		}

		const expiresAt = credential.access_token_expires_at
			? Date.parse(credential.access_token_expires_at)
			: Number.NaN;
		if (Number.isFinite(expiresAt) && expiresAt > this.now().getTime() + 5 * 60 * 1000) {
			await this.admin
				.from('user_email_connections')
				.update({
					last_used_at: this.now().toISOString(),
					updated_at: this.now().toISOString()
				})
				.eq('id', connectionId)
				.eq('user_id', userId);
			return accessToken;
		}

		const oauthClient = this.createOAuthClient();
		oauthClient.setCredentials({
			access_token: accessToken,
			refresh_token: refreshToken,
			token_type: credential.token_type,
			scope: credential.granted_scopes.join(' ')
		});

		let refreshed: Credentials;
		try {
			const result = await oauthClient.refreshAccessToken();
			refreshed = result.credentials;
		} catch (error) {
			if (isReconnectRequiredRefreshError(error)) {
				await this.markReconnectRequired(userId, connectionId, 'provider_grant_invalid');
				throw new GmailOAuthError(
					'reconnect_required',
					'This Gmail account authorization has expired. Please reconnect it.'
				);
			}
			throw new GmailOAuthError(
				'provider_error',
				'Google is temporarily unavailable. Gmail access was not attempted.'
			);
		}

		if (!refreshed.access_token) {
			throw new GmailOAuthError(
				'invalid_token_response',
				'Google returned an incomplete refreshed authorization'
			);
		}

		let tokenInfo: TokenInfo;
		try {
			tokenInfo = await oauthClient.getTokenInfo(refreshed.access_token);
		} catch {
			throw new GmailOAuthError(
				'identity_verification_failed',
				'Unable to verify the refreshed Gmail authorization'
			);
		}

		const grantedScopes = normalizeScopeList(
			tokenInfo.scopes ?? refreshed.scope ?? credential.granted_scopes
		);
		if (
			tokenInfo.aud !== this.clientId ||
			(tokenInfo.sub && tokenInfo.sub !== connection.provider_account_id) ||
			!grantedScopes.includes(GMAIL_READ_SCOPE) ||
			grantedScopes.some(isUnexpectedGmailScope)
		) {
			await this.markReconnectRequired(
				userId,
				connectionId,
				'refreshed_token_policy_mismatch'
			);
			throw new GmailOAuthError(
				'reconnect_required',
				'This Gmail account authorization no longer matches the read-only policy'
			);
		}

		const rotatedRefreshToken = refreshed.refresh_token ?? refreshToken;
		const refreshedExpiry = refreshed.expiry_date ?? tokenInfo.expiry_date ?? null;
		const { error: rotateError } = await this.admin.rpc('rotate_gmail_read_credentials', {
			p_user_id: userId,
			p_connection_id: connectionId,
			p_access_token_ciphertext: encryptGmailToken(refreshed.access_token, tokenContext),
			p_refresh_token_ciphertext: encryptGmailToken(rotatedRefreshToken, tokenContext),
			p_access_token_expires_at: refreshedExpiry
				? new Date(refreshedExpiry).toISOString()
				: null,
			p_token_type: refreshed.token_type ?? credential.token_type ?? 'Bearer',
			p_granted_scopes: grantedScopes,
			p_key_version: getActiveGmailTokenKeyVersion()
		});

		if (rotateError) {
			throw new GmailOAuthError(
				'database_error',
				'Unable to rotate Gmail credentials safely'
			);
		}

		await this.audit({
			userId,
			connectionId,
			operation: 'gmail.token.refresh',
			outcome: 'success'
		});

		return refreshed.access_token;
	}

	async disconnectAllConnectionsForAccountDeletion(userId: string): Promise<{
		connectionsFound: number;
		connectionsDeleted: number;
		remoteRevocationsSucceeded: number;
		remoteRevocationsUnconfirmed: number;
	}> {
		const { data: connectionData, error: connectionError } = await this.admin
			.from('user_email_connections')
			.select('*')
			.eq('user_id', userId)
			.eq('provider', 'google_gmail')
			.is('deleted_at', null);

		if (connectionError) {
			throw new GmailOAuthError(
				'database_error',
				'Failed to load Gmail connections for deletion'
			);
		}

		const connections = (connectionData ?? []) as EmailConnectionRow[];
		if (connections.length === 0) {
			return {
				connectionsFound: 0,
				connectionsDeleted: 0,
				remoteRevocationsSucceeded: 0,
				remoteRevocationsUnconfirmed: 0
			};
		}

		const connectionIds = connections.map((connection) => connection.id);
		const { data: credentialData } = await this.admin
			.from('email_connection_credentials')
			.select(
				'connection_id, access_token_ciphertext, refresh_token_ciphertext, access_token_expires_at, token_type, granted_scopes'
			)
			.in('connection_id', connectionIds)
			.eq('grant_kind', 'read')
			.is('revoked_at', null);

		await this.admin
			.from('user_email_connections')
			.update({
				status: 'disabled',
				read_enabled: false,
				updated_at: this.now().toISOString()
			})
			.eq('user_id', userId)
			.eq('provider', 'google_gmail')
			.in('id', connectionIds);

		const credentials = (credentialData ?? []) as Array<
			EmailCredentialRow & {
				connection_id: string;
			}
		>;
		const credentialsByConnection = new Map(
			credentials.map((credential) => [credential.connection_id, credential])
		);

		const revocationResults = await Promise.all(
			connections.map(async (connection) => {
				const credential = credentialsByConnection.get(connection.id);
				if (!credential) return false;

				try {
					const refreshToken = decryptGmailToken(credential.refresh_token_ciphertext, {
						userId,
						providerAccountId: connection.provider_account_id,
						grantKind: 'read'
					});
					await withTimeout(this.createOAuthClient().revokeToken(refreshToken), 5000);
					return true;
				} catch {
					return false;
				}
			})
		);

		const { error: deleteError } = await this.admin
			.from('user_email_connections')
			.delete()
			.eq('user_id', userId)
			.eq('provider', 'google_gmail')
			.in('id', connectionIds);

		if (deleteError) {
			throw new GmailOAuthError('database_error', 'Failed to remove Gmail connections');
		}

		const remoteRevocationsSucceeded = revocationResults.filter(Boolean).length;
		await this.audit({
			userId,
			operation: 'gmail.connection.account_deletion',
			outcome: 'success',
			metadata: {
				connectionsDeleted: connections.length,
				remoteRevocationsSucceeded,
				remoteRevocationsUnconfirmed: connections.length - remoteRevocationsSucceeded
			}
		});

		return {
			connectionsFound: connections.length,
			connectionsDeleted: connections.length,
			remoteRevocationsSucceeded,
			remoteRevocationsUnconfirmed: connections.length - remoteRevocationsSucceeded
		};
	}

	async renameConnection(
		userId: string,
		connectionId: string,
		accountLabel: string
	): Promise<void> {
		const normalizedLabel = accountLabel.trim();
		if (normalizedLabel.length < 1 || normalizedLabel.length > 60) {
			throw new GmailOAuthError('database_error', 'Account label must be 1–60 characters');
		}

		const { data, error } = await this.admin
			.from('user_email_connections')
			.update({ account_label: normalizedLabel, updated_at: this.now().toISOString() })
			.eq('id', connectionId)
			.eq('user_id', userId)
			.eq('provider', 'google_gmail')
			.is('deleted_at', null)
			.select('id')
			.maybeSingle();

		if (error || !data) {
			throw new GmailOAuthError('connection_not_found', 'Gmail connection was not found');
		}

		await this.audit({
			userId,
			connectionId,
			operation: 'gmail.connection.rename',
			outcome: 'success'
		});
	}

	async disconnectConnection(
		userId: string,
		connectionId: string
	): Promise<{ remoteRevocationSucceeded: boolean }> {
		const { data: connectionData, error: connectionError } = await this.admin
			.from('user_email_connections')
			.select('*')
			.eq('id', connectionId)
			.eq('user_id', userId)
			.eq('provider', 'google_gmail')
			.is('deleted_at', null)
			.maybeSingle();

		if (connectionError || !connectionData) {
			throw new GmailOAuthError('connection_not_found', 'Gmail connection was not found');
		}
		const connection = connectionData as EmailConnectionRow;

		const { data: credentialData } = await this.admin
			.from('email_connection_credentials')
			.select('access_token_ciphertext, refresh_token_ciphertext, granted_scopes')
			.eq('connection_id', connectionId)
			.eq('grant_kind', 'read')
			.is('revoked_at', null)
			.maybeSingle();

		await this.admin
			.from('user_email_connections')
			.update({
				status: 'disabled',
				read_enabled: false,
				updated_at: this.now().toISOString()
			})
			.eq('id', connectionId)
			.eq('user_id', userId);

		let remoteRevocationSucceeded = false;
		if (credentialData) {
			try {
				const credential = credentialData as EmailCredentialRow;
				const context: GmailTokenContext = {
					userId,
					providerAccountId: connection.provider_account_id,
					grantKind: 'read'
				};
				const refreshToken = decryptGmailToken(
					credential.refresh_token_ciphertext,
					context
				);
				await withTimeout(this.createOAuthClient().revokeToken(refreshToken), 5000);
				remoteRevocationSucceeded = true;
			} catch {
				remoteRevocationSucceeded = false;
			}
		}

		const { error: deleteError } = await this.admin
			.from('user_email_connections')
			.delete()
			.eq('id', connectionId)
			.eq('user_id', userId);

		if (deleteError) {
			throw new GmailOAuthError('database_error', 'Failed to remove Gmail connection');
		}

		await this.audit({
			userId,
			connectionId,
			operation: 'gmail.connection.disconnect',
			outcome: 'success',
			metadata: { remoteRevocationSucceeded }
		});

		return { remoteRevocationSucceeded };
	}
}
