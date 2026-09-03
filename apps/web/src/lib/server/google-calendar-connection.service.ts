// apps/web/src/lib/server/google-calendar-connection.service.ts
import { env as privateEnv } from '$env/dynamic/private';
import {
	CodeChallengeMethod,
	OAuth2Client,
	type Credentials,
	type TokenInfo,
	type TokenPayload
} from 'google-auth-library';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { google, type calendar_v3 } from 'googleapis';
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import {
	GOOGLE_CALENDAR_SCOPE,
	GoogleCalendarConnectionError,
	GoogleCalendarCredentialService
} from '@buildos/shared-agent-ops/calendar/google-calendar-credential.service';
import {
	GoogleCalendarSourceService,
	type GoogleCalendarSourceRow as SourceRow
} from '@buildos/shared-agent-ops/calendar/google-calendar-runtime';
import { decodeStoredCalendarTokens } from './calendar-token-crypto';
import {
	decryptGoogleCalendarToken,
	encryptGoogleCalendarToken,
	getActiveGoogleCalendarTokenKeyVersion,
	resolveWebGoogleCalendarTokenKey,
	type GoogleCalendarOauthClientKind,
	type GoogleCalendarTokenContext
} from './google-calendar-token-crypto';
import type {
	GoogleCalendarConnectionStatus,
	GoogleCalendarConnectionSummary,
	GoogleCalendarConnectionsPayload,
	GoogleCalendarSourceSummary
} from '$lib/types/google-calendar-integration';

export { GOOGLE_CALENDAR_SCOPE, GoogleCalendarConnectionError };
export const MAX_GOOGLE_CALENDAR_CONNECTIONS = 5;

export type GoogleCalendarSourcePreferences = {
	readEnabled?: boolean;
	availabilityEnabled?: boolean;
	analysisEnabled?: boolean;
	syncEnabled?: boolean;
};

/**
 * Two-way sync consumes event bodies, so it cannot be enabled without event reads. Likewise,
 * disabling event reads must also disable sync. Keep this normalization shared by the route and
 * service so webhook orchestration and the database update always act on the same final state.
 */
export function normalizeGoogleCalendarSourcePreferences(
	preferences: GoogleCalendarSourcePreferences
): GoogleCalendarSourcePreferences {
	const normalized = { ...preferences };
	if (normalized.syncEnabled === true) {
		normalized.readEnabled = true;
	} else if (normalized.readEnabled === false) {
		normalized.syncEnabled = false;
	}
	return normalized;
}

type AnyResult<T> = {
	data: T | null;
	error: { code?: string; message?: string; details?: string } | null;
};

type CalendarDatabaseClient = TypedSupabaseClient & {
	from(table: string): any;
	rpc(name: string, args?: Record<string, unknown>): Promise<AnyResult<any>>;
};

type CalendarOAuthClient = Pick<
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

type OAuthStateRow = {
	state_id: string;
	redirect_path: string;
	nonce: string;
	code_verifier: string;
	connection_id: string | null;
};

type ConnectionRow = {
	id: string;
	user_id: string;
	provider_account_id: string;
	email_address: string;
	display_name: string | null;
	account_label: string;
	status: GoogleCalendarConnectionStatus;
	connected_at: string;
	last_verified_at: string | null;
	last_used_at: string | null;
	deleted_at: string | null;
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

type LegacyCalendarTokenRow = {
	user_id: string;
	access_token: string;
	refresh_token: string | null;
	expiry_date: number | null;
	google_email: string | null;
	google_user_id: string | null;
	scope: string | null;
	token_type: string | null;
	created_at: string | null;
	updated_at: string | null;
};

type CredentialsWithRefreshTokenExpiry = Credentials & {
	refresh_token_expires_in?: number | string | null;
};

type GoogleCalendarConnectionServiceOptions = {
	dedicatedClientId?: string;
	dedicatedClientSecret?: string;
	sharedLoginClientId?: string;
	sharedLoginClientSecret?: string;
	createOAuthClient?: (
		kind: GoogleCalendarOauthClientKind,
		redirectUri?: string
	) => CalendarOAuthClient;
	createCalendarApi?: (
		auth: CalendarOAuthClient
	) => Pick<calendar_v3.Calendar, 'calendarList' | 'calendars'>;
	now?: () => Date;
	randomToken?: () => string;
	randomUuid?: () => string;
};

function getPrivateEnv(name: string): string | undefined {
	const value = privateEnv[name] ?? process.env[name];
	return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function hashState(value: string): string {
	return createHash('sha256').update(value, 'utf8').digest('hex');
}

function normalizeRedirectPath(path: string | null | undefined): string {
	if (!path || !path.startsWith('/') || path.startsWith('//')) {
		return '/profile?tab=calendar';
	}

	try {
		const parsed = new URL(path, 'https://buildos.invalid');
		if (parsed.origin !== 'https://buildos.invalid') return '/profile?tab=calendar';
		return `${parsed.pathname}${parsed.search}${parsed.hash}`;
	} catch {
		return '/profile?tab=calendar';
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

function getRefreshTokenExpiresAt(credentials: Credentials, now: Date): string | null {
	const rawSeconds = (credentials as CredentialsWithRefreshTokenExpiry).refresh_token_expires_in;
	const seconds = typeof rawSeconds === 'string' ? Number(rawSeconds) : rawSeconds;
	if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return null;
	return new Date(now.getTime() + Math.floor(seconds * 1000)).toISOString();
}

function getDefaultLabel(emailAddress: string): string {
	return (emailAddress.split('@')[0] || 'Google Calendar').slice(0, 60);
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

export class GoogleCalendarConnectionService {
	private readonly admin: CalendarDatabaseClient;
	private readonly dedicatedClientId: string;
	private readonly dedicatedClientSecret: string;
	private readonly sharedLoginClientId: string;
	private readonly sharedLoginClientSecret: string;
	private readonly createOAuthClient: (
		kind: GoogleCalendarOauthClientKind,
		redirectUri?: string
	) => CalendarOAuthClient;
	private readonly createCalendarApi: (
		auth: CalendarOAuthClient
	) => Pick<calendar_v3.Calendar, 'calendarList'>;
	private readonly now: () => Date;
	private readonly randomToken: () => string;
	private readonly randomUuid: () => string;
	private readonly sourceService: GoogleCalendarSourceService;
	private readonly credentialService: GoogleCalendarCredentialService<CalendarOAuthClient>;

	constructor(
		admin: TypedSupabaseClient | CalendarDatabaseClient,
		options: GoogleCalendarConnectionServiceOptions = {}
	) {
		this.admin = admin as CalendarDatabaseClient;
		this.dedicatedClientId =
			options.dedicatedClientId ?? getPrivateEnv('PRIVATE_GOOGLE_CALENDAR_CLIENT_ID') ?? '';
		this.dedicatedClientSecret =
			options.dedicatedClientSecret ??
			getPrivateEnv('PRIVATE_GOOGLE_CALENDAR_CLIENT_SECRET') ??
			'';
		this.sharedLoginClientId =
			options.sharedLoginClientId ?? getPrivateEnv('PRIVATE_GOOGLE_CLIENT_ID') ?? '';
		this.sharedLoginClientSecret =
			options.sharedLoginClientSecret ?? getPrivateEnv('PRIVATE_GOOGLE_CLIENT_SECRET') ?? '';
		this.createOAuthClient =
			options.createOAuthClient ??
			((kind, redirectUri) => {
				const credentials = this.getOAuthClientCredentials(kind);
				return new OAuth2Client(
					credentials.clientId,
					credentials.clientSecret,
					redirectUri
				);
			});
		this.createCalendarApi =
			options.createCalendarApi ??
			((auth) => google.calendar({ version: 'v3', auth: auth as OAuth2Client }));
		this.now = options.now ?? (() => new Date());
		this.randomToken = options.randomToken ?? (() => randomBytes(32).toString('base64url'));
		this.randomUuid = options.randomUuid ?? (() => randomUUID());
		this.sourceService = new GoogleCalendarSourceService(this.admin);
		this.credentialService = new GoogleCalendarCredentialService(this.admin, {
			createOAuthClient: (kind) => this.createOAuthClient(kind),
			getOAuthClientCredentials: (kind) => this.getOAuthClientCredentials(kind),
			resolveTokenKey: resolveWebGoogleCalendarTokenKey,
			now: this.now
		});
	}

	isConfigured(): boolean {
		const tokenKey = getPrivateEnv('PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1');
		return Boolean(
			this.dedicatedClientId &&
				this.dedicatedClientSecret &&
				tokenKey &&
				Buffer.byteLength(tokenKey, 'utf8') >= 32 &&
				(!this.sharedLoginClientId || this.dedicatedClientId !== this.sharedLoginClientId)
		);
	}

	private requireConfigured(): void {
		if (!this.isConfigured()) {
			throw new GoogleCalendarConnectionError(
				'not_configured',
				'Multi-account Google Calendar is not configured'
			);
		}
	}

	private getOAuthClientCredentials(kind: GoogleCalendarOauthClientKind): {
		clientId: string;
		clientSecret: string;
	} {
		const credentials =
			kind === 'google_calendar'
				? {
						clientId: this.dedicatedClientId,
						clientSecret: this.dedicatedClientSecret
					}
				: {
						clientId: this.sharedLoginClientId,
						clientSecret: this.sharedLoginClientSecret
					};

		if (!credentials.clientId || !credentials.clientSecret) {
			throw new GoogleCalendarConnectionError(
				'not_configured',
				`OAuth credentials are unavailable for Calendar client kind ${kind}`
			);
		}
		return credentials;
	}

	private async audit(params: {
		userId: string;
		connectionId?: string | null;
		calendarSourceId?: string | null;
		operation: string;
		outcome: 'success' | 'failure' | 'blocked';
		reasonCode?: string;
		metadata?: Record<string, string | number | boolean | null>;
	}): Promise<void> {
		try {
			await this.admin.from('calendar_access_audit_events').insert({
				user_id: params.userId,
				connection_id: params.connectionId ?? null,
				calendar_source_id: params.calendarSourceId ?? null,
				operation: params.operation,
				outcome: params.outcome,
				reason_code: params.reasonCode ?? null,
				metadata: params.metadata ?? {}
			});
		} catch {
			// Auditing never stores OAuth material and must not replace the primary error path.
		}
	}

	async listConnections(userId: string): Promise<GoogleCalendarConnectionsPayload> {
		const { data: connectionData, error: connectionError } = await this.admin
			.from('user_calendar_connections')
			.select(
				'id, user_id, provider_account_id, email_address, display_name, account_label, status, connected_at, last_verified_at, last_used_at, deleted_at'
			)
			.eq('user_id', userId)
			.eq('provider', 'google_calendar')
			.is('deleted_at', null)
			.order('connected_at', { ascending: true });

		if (connectionError) {
			throw new GoogleCalendarConnectionError(
				'database_error',
				'Failed to load Google Calendar connections'
			);
		}

		const connections = (connectionData ?? []) as ConnectionRow[];
		const connectionIds = connections.map((connection) => connection.id);
		let sources: SourceRow[] = [];
		if (connectionIds.length > 0) {
			const { data: sourceData, error: sourceError } = await this.admin
				.from('user_calendar_sources')
				.select('*')
				.eq('user_id', userId)
				.in('connection_id', connectionIds)
				.is('provider_deleted_at', null)
				.is('deleted_at', null)
				.order('is_primary', { ascending: false })
				.order('summary', { ascending: true });
			if (sourceError) {
				throw new GoogleCalendarConnectionError(
					'database_error',
					'Failed to load Google Calendar sources'
				);
			}
			sources = (sourceData ?? []) as SourceRow[];
		}

		const { data: preferenceData } = await this.admin
			.from('user_calendar_preferences')
			.select('default_write_calendar_source_id')
			.eq('user_id', userId)
			.maybeSingle();
		const defaultSourceId = preferenceData?.default_write_calendar_source_id ?? null;

		return {
			available: this.isConfigured(),
			maxConnections: MAX_GOOGLE_CALENDAR_CONNECTIONS,
			defaultWriteCalendarSourceId: defaultSourceId,
			connections: connections.map(
				(connection): GoogleCalendarConnectionSummary => ({
					id: connection.id,
					emailAddress: connection.email_address,
					displayName: connection.display_name,
					accountLabel: connection.account_label,
					status: connection.status,
					connectedAt: connection.connected_at,
					lastVerifiedAt: connection.last_verified_at,
					lastUsedAt: connection.last_used_at,
					sources: sources
						.filter((source) => source.connection_id === connection.id)
						.map(
							(source): GoogleCalendarSourceSummary =>
								this.toSourceSummary(source, defaultSourceId)
						)
				})
			)
		};
	}

	private toSourceSummary(
		source: SourceRow,
		defaultSourceId: string | null
	): GoogleCalendarSourceSummary {
		return {
			id: source.id,
			providerCalendarId: source.provider_calendar_id,
			summary: source.summary,
			summaryOverride: source.summary_override,
			timezone: source.timezone,
			colorId: source.color_id,
			backgroundColor: source.background_color,
			foregroundColor: source.foreground_color,
			accessRole: source.access_role,
			isPrimary: source.is_primary,
			isHidden: source.is_hidden,
			isSelectedInGoogle: source.is_selected_in_google,
			readEnabled: source.read_enabled,
			availabilityEnabled: source.availability_enabled,
			analysisEnabled: source.analysis_enabled,
			syncEnabled: source.sync_enabled,
			providerDeletedAt: source.provider_deleted_at,
			lastSeenAt: source.last_seen_at,
			isDefaultWriteSource: source.id === defaultSourceId
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

		if (params.connectionId) {
			const { data, error } = await this.admin
				.from('user_calendar_connections')
				.select('id')
				.eq('id', params.connectionId)
				.eq('user_id', params.userId)
				.eq('provider', 'google_calendar')
				.is('deleted_at', null)
				.maybeSingle();
			if (error || !data) {
				throw new GoogleCalendarConnectionError(
					'connection_not_found',
					'Google Calendar connection was not found'
				);
			}
		} else {
			const { count, error } = await this.admin
				.from('user_calendar_connections')
				.select('id', { count: 'exact', head: true })
				.eq('user_id', params.userId)
				.eq('provider', 'google_calendar')
				.is('deleted_at', null);
			if (error) {
				throw new GoogleCalendarConnectionError(
					'database_error',
					'Unable to check the Calendar connection limit'
				);
			}
			if ((count ?? 0) >= MAX_GOOGLE_CALENDAR_CONNECTIONS) {
				throw new GoogleCalendarConnectionError(
					'connection_limit_exceeded',
					`You can connect up to ${MAX_GOOGLE_CALENDAR_CONNECTIONS} Google Calendar accounts`
				);
			}
		}

		const oauthClient = this.createOAuthClient('google_calendar', params.redirectUri);
		const { codeVerifier, codeChallenge } = await oauthClient.generateCodeVerifierAsync();
		if (!codeChallenge) {
			throw new GoogleCalendarConnectionError(
				'provider_error',
				'Unable to create a secure Google Calendar connection'
			);
		}

		const state = this.randomToken();
		const nonce = this.randomToken();
		const now = this.now();
		const { error: stateError } = await this.admin.from('calendar_oauth_states').insert({
			state_hash: hashState(state),
			user_id: params.userId,
			connection_id: params.connectionId ?? null,
			oauth_client_kind: 'google_calendar',
			redirect_path: redirectPath,
			nonce,
			code_verifier: codeVerifier,
			created_at: now.toISOString(),
			expires_at: new Date(now.getTime() + 10 * 60 * 1000).toISOString()
		});

		if (stateError) {
			throw new GoogleCalendarConnectionError(
				'database_error',
				'Unable to start the Google Calendar connection'
			);
		}

		return oauthClient.generateAuthUrl({
			access_type: 'offline',
			prompt: 'consent select_account',
			scope: ['openid', 'email', GOOGLE_CALENDAR_SCOPE],
			state,
			nonce,
			include_granted_scopes: false,
			code_challenge: codeChallenge,
			code_challenge_method: CodeChallengeMethod.S256
		});
	}

	async consumeAuthorizationState(state: string | null, userId: string): Promise<OAuthStateRow> {
		if (!state) {
			throw new GoogleCalendarConnectionError(
				'invalid_state',
				'Google Calendar authorization state is missing'
			);
		}

		const { data, error } = await this.admin.rpc('consume_calendar_oauth_state', {
			p_state_hash: hashState(state),
			p_user_id: userId,
			p_oauth_client_kind: 'google_calendar'
		});
		const row = firstRow(data as OAuthStateRow | OAuthStateRow[] | null);
		if (error || !row) {
			throw new GoogleCalendarConnectionError(
				'invalid_state',
				'Google Calendar authorization state is invalid or expired'
			);
		}
		return row;
	}

	async exchangeAuthorizationCode(params: {
		userId: string;
		code: string;
		redirectUri: string;
		state: OAuthStateRow;
	}): Promise<GoogleCalendarConnectionSummary> {
		this.requireConfigured();
		const clientKind: GoogleCalendarOauthClientKind = 'google_calendar';
		const clientCredentials = this.getOAuthClientCredentials(clientKind);
		const oauthClient = this.createOAuthClient(clientKind, params.redirectUri);
		let tokens: Credentials;
		try {
			const result = await oauthClient.getToken({
				code: params.code,
				codeVerifier: params.state.code_verifier,
				redirect_uri: params.redirectUri,
				client_id: clientCredentials.clientId
			});
			tokens = result.tokens;
		} catch {
			throw new GoogleCalendarConnectionError(
				'provider_error',
				'Google could not complete the Calendar connection',
				params.state.redirect_path
			);
		}

		if (!tokens.access_token || !tokens.id_token) {
			throw new GoogleCalendarConnectionError(
				'invalid_token_response',
				'Google returned an incomplete Calendar authorization',
				params.state.redirect_path
			);
		}

		let tokenInfo: TokenInfo;
		let payload: TokenPayload | undefined;
		try {
			const ticket = await oauthClient.verifyIdToken({
				idToken: tokens.id_token,
				audience: clientCredentials.clientId
			});
			payload = ticket.getPayload();
			tokenInfo = await oauthClient.getTokenInfo(tokens.access_token);
		} catch {
			throw new GoogleCalendarConnectionError(
				'identity_verification_failed',
				'Unable to verify the connected Google account',
				params.state.redirect_path
			);
		}

		if (
			!payload?.sub ||
			!payload.email ||
			payload.email_verified !== true ||
			payload.nonce !== params.state.nonce ||
			!['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss ?? '') ||
			(tokenInfo.sub && tokenInfo.sub !== payload.sub) ||
			tokenInfo.aud !== clientCredentials.clientId
		) {
			throw new GoogleCalendarConnectionError(
				'identity_verification_failed',
				'Google account identity did not match the Calendar connection request',
				params.state.redirect_path
			);
		}

		const grantedScopes = normalizeScopeList(tokenInfo.scopes ?? tokens.scope);
		if (!grantedScopes.includes(GOOGLE_CALENDAR_SCOPE)) {
			throw new GoogleCalendarConnectionError(
				'scope_mismatch',
				'Google did not grant Calendar access',
				params.state.redirect_path
			);
		}

		let connectionId = params.state.connection_id;
		let existingConnection: ConnectionRow | null = null;
		if (connectionId) {
			const { data } = await this.admin
				.from('user_calendar_connections')
				.select('*')
				.eq('id', connectionId)
				.eq('user_id', params.userId)
				.eq('provider', 'google_calendar')
				.is('deleted_at', null)
				.maybeSingle();
			existingConnection = (data as ConnectionRow | null) ?? null;
			if (!existingConnection) {
				throw new GoogleCalendarConnectionError(
					'connection_not_found',
					'Google Calendar connection was not found',
					params.state.redirect_path
				);
			}
			if (existingConnection.provider_account_id !== payload.sub) {
				throw new GoogleCalendarConnectionError(
					'account_mismatch',
					'Please reconnect using the same Google account',
					params.state.redirect_path
				);
			}
		} else {
			const { data } = await this.admin
				.from('user_calendar_connections')
				.select('*')
				.eq('user_id', params.userId)
				.eq('provider', 'google_calendar')
				.eq('provider_account_id', payload.sub)
				.is('deleted_at', null)
				.maybeSingle();
			existingConnection = (data as ConnectionRow | null) ?? null;
			connectionId = existingConnection?.id ?? this.randomUuid();
		}

		let refreshToken = tokens.refresh_token ?? null;
		let refreshTokenExpiresAt = getRefreshTokenExpiresAt(tokens, this.now());
		if (!refreshToken && existingConnection) {
			const { data } = await this.admin
				.from('calendar_connection_credentials')
				.select('*')
				.eq('connection_id', existingConnection.id)
				.is('revoked_at', null)
				.maybeSingle();
			const existingCredential = data as CredentialRow | null;
			if (
				existingCredential?.refresh_token_ciphertext &&
				existingCredential.oauth_client_kind === clientKind
			) {
				const existingContext = this.tokenContext(
					existingConnection,
					existingCredential.oauth_client_kind
				);
				refreshToken = decryptGoogleCalendarToken(
					existingCredential.refresh_token_ciphertext,
					existingContext
				);
				refreshTokenExpiresAt ??= existingCredential.refresh_token_expires_at;
			}
		}

		if (!refreshToken || !connectionId) {
			throw new GoogleCalendarConnectionError(
				'refresh_token_required',
				'Google did not return offline Calendar access. Please try connecting again.',
				params.state.redirect_path
			);
		}

		const tokenContext: GoogleCalendarTokenContext = {
			userId: params.userId,
			connectionId,
			providerAccountId: payload.sub,
			oauthClientKind: clientKind
		};
		const { data: upsertData, error: upsertError } = await this.admin.rpc(
			'upsert_google_calendar_connection',
			{
				p_user_id: params.userId,
				p_expected_connection_id: params.state.connection_id,
				p_new_connection_id: existingConnection ? null : connectionId,
				p_provider_account_id: payload.sub,
				p_email_address: payload.email,
				p_display_name: payload.name ?? null,
				p_default_account_label: getDefaultLabel(payload.email),
				p_oauth_client_kind: clientKind,
				p_access_token_ciphertext: encryptGoogleCalendarToken(
					tokens.access_token,
					tokenContext
				),
				p_refresh_token_ciphertext: encryptGoogleCalendarToken(refreshToken, tokenContext),
				p_access_token_expires_at: tokens.expiry_date
					? new Date(tokens.expiry_date).toISOString()
					: null,
				p_refresh_token_expires_at: refreshTokenExpiresAt,
				p_token_type: tokens.token_type ?? 'Bearer',
				p_granted_scopes: grantedScopes,
				p_key_version: getActiveGoogleCalendarTokenKeyVersion()
			}
		);

		if (upsertError) {
			const detail = `${upsertError.message ?? ''} ${upsertError.details ?? ''}`;
			if (detail.includes('calendar_connection_limit_exceeded')) {
				throw new GoogleCalendarConnectionError(
					'connection_limit_exceeded',
					`You can connect up to ${MAX_GOOGLE_CALENDAR_CONNECTIONS} Google Calendar accounts`,
					params.state.redirect_path
				);
			}
			if (
				upsertError.code === '23505' ||
				detail.includes('calendar_account_already_connected')
			) {
				throw new GoogleCalendarConnectionError(
					'account_already_connected',
					'This Google Calendar account is already connected to another BuildOS user',
					params.state.redirect_path
				);
			}
			throw new GoogleCalendarConnectionError(
				'database_error',
				'Unable to save the Google Calendar connection',
				params.state.redirect_path
			);
		}

		const connection = firstRow(upsertData as ConnectionRow | ConnectionRow[] | null);
		if (!connection) {
			throw new GoogleCalendarConnectionError(
				'database_error',
				'Google Calendar connection was not saved',
				params.state.redirect_path
			);
		}

		oauthClient.setCredentials({
			access_token: tokens.access_token,
			refresh_token: refreshToken,
			expiry_date: tokens.expiry_date,
			token_type: tokens.token_type,
			scope: grantedScopes.join(' ')
		});
		await this.discoverSources(params.userId, connection.id, oauthClient);
		const payloadResult = await this.listConnections(params.userId);
		const summary = payloadResult.connections.find((item) => item.id === connection.id);
		if (!summary) {
			throw new GoogleCalendarConnectionError(
				'database_error',
				'Google Calendar connection sources were not saved',
				params.state.redirect_path
			);
		}

		await this.audit({
			userId: params.userId,
			connectionId: connection.id,
			operation: 'calendar.oauth.complete',
			outcome: 'success',
			metadata: { reconnect: Boolean(params.state.connection_id) }
		});
		return summary;
	}

	async discoverSources(
		userId: string,
		connectionId: string,
		providedClient?: CalendarOAuthClient
	): Promise<GoogleCalendarSourceSummary[]> {
		const auth = providedClient ?? (await this.getAuthenticatedClient(userId, connectionId));
		const calendarApi = this.createCalendarApi(auth);
		let pageToken: string | undefined;
		const seenProviderIds: string[] = [];

		do {
			const response = await calendarApi.calendarList.list({
				maxResults: 250,
				pageToken,
				showDeleted: false,
				showHidden: true
			});
			for (const entry of response.data.items ?? []) {
				if (!entry.id || !entry.summary || !entry.accessRole) continue;
				seenProviderIds.push(entry.id);
				const { error } = await this.admin.rpc('upsert_google_calendar_source', {
					p_user_id: userId,
					p_connection_id: connectionId,
					p_provider_calendar_id: entry.id,
					p_summary: entry.summary,
					p_summary_override: entry.summaryOverride ?? null,
					p_description: entry.description ?? null,
					p_timezone: entry.timeZone ?? null,
					p_color_id: entry.colorId ?? null,
					p_background_color: entry.backgroundColor ?? null,
					p_foreground_color: entry.foregroundColor ?? null,
					p_access_role: entry.accessRole,
					p_is_primary: entry.primary ?? false,
					p_is_hidden: entry.hidden ?? false,
					p_is_selected_in_google: entry.selected ?? false
				});
				if (error) {
					throw new GoogleCalendarConnectionError(
						'database_error',
						'Unable to save Google Calendar sources'
					);
				}
			}
			pageToken = response.data.nextPageToken ?? undefined;
		} while (pageToken);

		const now = this.now().toISOString();
		const { data: knownSourceData, error: knownSourceError } = await this.admin
			.from('user_calendar_sources')
			.select('id, provider_calendar_id')
			.eq('user_id', userId)
			.eq('connection_id', connectionId)
			.is('deleted_at', null);
		if (knownSourceError) {
			throw new GoogleCalendarConnectionError(
				'database_error',
				'Unable to reconcile Google Calendar sources'
			);
		}
		const seenProviderIdSet = new Set(seenProviderIds);
		const missingSourceIds = (knownSourceData ?? [])
			.filter(
				(source: { provider_calendar_id: string }) =>
					!seenProviderIdSet.has(source.provider_calendar_id)
			)
			.map((source: { id: string }) => source.id);
		if (missingSourceIds.length > 0) {
			const { error: missingSourceError } = await this.admin
				.from('user_calendar_sources')
				.update({
					read_enabled: false,
					availability_enabled: false,
					analysis_enabled: false,
					sync_enabled: false,
					provider_deleted_at: now,
					updated_at: now
				})
				.eq('user_id', userId)
				.eq('connection_id', connectionId)
				.in('id', missingSourceIds);
			if (missingSourceError) {
				throw new GoogleCalendarConnectionError(
					'database_error',
					'Unable to reconcile Google Calendar sources'
				);
			}
		}

		await this.reconcileDefaultWriteSource(userId);

		const payload = await this.listConnections(userId);
		return (
			payload.connections.find((connection) => connection.id === connectionId)?.sources ?? []
		);
	}

	async registerCreatedSource(
		params: Parameters<GoogleCalendarSourceService['registerCreatedSourceRow']>[0]
	): Promise<GoogleCalendarSourceSummary> {
		return this.toSourceSummary(
			await this.sourceService.registerCreatedSourceRow(params),
			null
		);
	}

	async reconcileDefaultWriteSource(userId: string): Promise<string | null> {
		return this.sourceService.reconcileDefaultWriteSource(userId);
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

	async getAuthenticatedClient(
		userId: string,
		connectionId: string,
		options: { forceRefresh?: boolean } = {}
	): Promise<CalendarOAuthClient> {
		return this.credentialService.getAuthenticatedClient(userId, connectionId, options);
	}

	async renameConnection(
		userId: string,
		connectionId: string,
		accountLabel: string
	): Promise<void> {
		const normalizedLabel = accountLabel.trim();
		if (normalizedLabel.length < 1 || normalizedLabel.length > 60) {
			throw new GoogleCalendarConnectionError(
				'database_error',
				'Account label must be 1–60 characters'
			);
		}
		const { data, error } = await this.admin
			.from('user_calendar_connections')
			.update({ account_label: normalizedLabel, updated_at: this.now().toISOString() })
			.eq('id', connectionId)
			.eq('user_id', userId)
			.eq('provider', 'google_calendar')
			.is('deleted_at', null)
			.select('id')
			.maybeSingle();
		if (error || !data) {
			throw new GoogleCalendarConnectionError(
				'connection_not_found',
				'Google Calendar connection was not found'
			);
		}
	}

	async setSourcePreferences(
		userId: string,
		calendarSourceId: string,
		preferences: GoogleCalendarSourcePreferences
	): Promise<void> {
		const normalized = normalizeGoogleCalendarSourcePreferences(preferences);
		const { error } = await this.admin.rpc('set_calendar_source_preferences', {
			p_user_id: userId,
			p_calendar_source_id: calendarSourceId,
			p_read_enabled: normalized.readEnabled ?? null,
			p_availability_enabled: normalized.availabilityEnabled ?? null,
			p_analysis_enabled: normalized.analysisEnabled ?? null,
			p_sync_enabled: normalized.syncEnabled ?? null
		});
		if (error) {
			const detail = `${error.message ?? ''} ${error.details ?? ''}`;
			if (detail.includes('calendar_source_duplicate_enabled')) {
				throw new GoogleCalendarConnectionError(
					'source_conflict',
					'This calendar is already enabled through another connected account'
				);
			}
			if (detail.includes('calendar_source_freebusy_only')) {
				throw new GoogleCalendarConnectionError(
					'source_not_writable',
					'This calendar only exposes free/busy availability'
				);
			}
			if (detail.includes('calendar_source_not_writable')) {
				throw new GoogleCalendarConnectionError(
					'source_not_writable',
					'This calendar does not allow BuildOS to write changes'
				);
			}
			throw new GoogleCalendarConnectionError(
				detail.includes('calendar_source_not_active')
					? 'source_not_found'
					: 'database_error',
				error.message ?? 'Unable to update Google Calendar source'
			);
		}
	}

	async setDefaultWriteSource(userId: string, calendarSourceId: string): Promise<void> {
		const { error } = await this.admin.rpc('set_default_calendar_source', {
			p_user_id: userId,
			p_calendar_source_id: calendarSourceId
		});
		if (error) {
			const detail = `${error.message ?? ''} ${error.details ?? ''}`;
			throw new GoogleCalendarConnectionError(
				detail.includes('calendar_default_source_not_eligible')
					? 'source_not_writable'
					: 'database_error',
				error.message ?? 'Unable to set the default Google Calendar source'
			);
		}
	}

	async disconnectConnection(
		userId: string,
		connectionId: string
	): Promise<{ remoteRevocationSucceeded: boolean }> {
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

		const { data: credentialData } = await this.admin
			.from('calendar_connection_credentials')
			.select('*')
			.eq('connection_id', connectionId)
			.is('revoked_at', null)
			.maybeSingle();
		const credential = credentialData as CredentialRow | null;
		this.credentialService.invalidateClient(userId, connectionId);

		let revocation:
			| { oauthClientKind: GoogleCalendarOauthClientKind; refreshToken: string }
			| undefined;
		if (credential) {
			try {
				revocation = {
					oauthClientKind: credential.oauth_client_kind,
					refreshToken: decryptGoogleCalendarToken(
						credential.refresh_token_ciphertext,
						this.tokenContext(connection, credential.oauth_client_kind)
					)
				};
			} catch {
				revocation = undefined;
			}
		}

		const { error } = await this.admin.rpc('disable_calendar_connection', {
			p_user_id: userId,
			p_connection_id: connectionId
		});
		if (error) {
			throw new GoogleCalendarConnectionError(
				'database_error',
				'Unable to disable the Google Calendar connection'
			);
		}

		let remoteRevocationSucceeded = false;
		if (revocation) {
			try {
				await withTimeout(
					this.createOAuthClient(revocation.oauthClientKind).revokeToken(
						revocation.refreshToken
					),
					5000
				);
				remoteRevocationSucceeded = true;
			} catch {
				remoteRevocationSucceeded = false;
			}
		}

		await this.audit({
			userId,
			connectionId,
			operation: 'calendar.connection.disconnect',
			outcome: 'success',
			metadata: { remoteRevocationSucceeded }
		});
		return { remoteRevocationSucceeded };
	}

	async disconnectAllConnectionsForAccountDeletion(userId: string): Promise<{
		connectionsFound: number;
		connectionsDeleted: number;
		remoteRevocationsSucceeded: number;
		remoteRevocationsUnconfirmed: number;
		legacyTokenDeleted: boolean;
	}> {
		const [connectionResult, legacyResult] = await Promise.all([
			this.admin
				.from('user_calendar_connections')
				.select('*')
				.eq('user_id', userId)
				.eq('provider', 'google_calendar')
				.is('deleted_at', null),
			this.admin
				.from('user_calendar_tokens')
				.select(
					'user_id, access_token, refresh_token, expiry_date, google_email, google_user_id, scope, token_type, created_at, updated_at'
				)
				.eq('user_id', userId)
				.maybeSingle()
		]);
		if (connectionResult.error || legacyResult.error) {
			throw new GoogleCalendarConnectionError(
				'database_error',
				'Failed to load Google Calendar connections for deletion'
			);
		}

		const connections = (connectionResult.data ?? []) as ConnectionRow[];
		const legacyData = legacyResult.data as LegacyCalendarTokenRow | null;
		if (connections.length === 0 && !legacyData) {
			return {
				connectionsFound: 0,
				connectionsDeleted: 0,
				remoteRevocationsSucceeded: 0,
				remoteRevocationsUnconfirmed: 0,
				legacyTokenDeleted: false
			};
		}

		const connectionIds = connections.map((connection) => connection.id);
		let credentialData: unknown[] = [];
		if (connectionIds.length > 0) {
			const result = await this.admin
				.from('calendar_connection_credentials')
				.select('*')
				.in('connection_id', connectionIds)
				.is('revoked_at', null);
			credentialData = result.data ?? [];
		}
		const credentials = (credentialData ?? []) as CredentialRow[];
		const credentialsByConnection = new Map(
			credentials.map((credential) => [credential.connection_id, credential])
		);

		if (connectionIds.length > 0) {
			await this.admin
				.from('user_calendar_connections')
				.update({ status: 'disabled', updated_at: this.now().toISOString() })
				.eq('user_id', userId)
				.eq('provider', 'google_calendar')
				.in('id', connectionIds);
		}

		const revocationResults = await Promise.all(
			connections.map(async (connection) => {
				this.credentialService.invalidateClient(userId, connection.id);
				const credential = credentialsByConnection.get(connection.id);
				if (!credential) return false;

				try {
					const refreshToken = decryptGoogleCalendarToken(
						credential.refresh_token_ciphertext,
						this.tokenContext(connection, credential.oauth_client_kind)
					);
					await withTimeout(
						this.createOAuthClient(credential.oauth_client_kind).revokeToken(
							refreshToken
						),
						5000
					);
					return true;
				} catch {
					return false;
				}
			})
		);
		const migratedLegacyConnectionExists = Boolean(
			legacyData?.google_user_id &&
				connections.some(
					(connection) => connection.provider_account_id === legacyData.google_user_id
				)
		);
		if (legacyData && !migratedLegacyConnectionExists) {
			try {
				const legacy = decodeStoredCalendarTokens(legacyData);
				if (!legacy.refresh_token) throw new Error('missing_legacy_refresh_token');
				await withTimeout(
					this.createOAuthClient('google_shared_login').revokeToken(legacy.refresh_token),
					5000
				);
				revocationResults.push(true);
			} catch {
				revocationResults.push(false);
			}
		}

		if (connectionIds.length > 0) {
			const { error: deleteError } = await this.admin
				.from('user_calendar_connections')
				.delete()
				.eq('user_id', userId)
				.eq('provider', 'google_calendar')
				.in('id', connectionIds);
			if (deleteError) {
				throw new GoogleCalendarConnectionError(
					'database_error',
					'Failed to remove Google Calendar connections'
				);
			}
		}
		if (legacyData) {
			const { error: legacyDeleteError } = await this.admin
				.from('user_calendar_tokens')
				.delete()
				.eq('user_id', userId);
			if (legacyDeleteError) {
				throw new GoogleCalendarConnectionError(
					'database_error',
					'Failed to remove the legacy Google Calendar grant'
				);
			}
		}

		const remoteRevocationsSucceeded = revocationResults.filter(Boolean).length;
		const revocationsAttempted = revocationResults.length;
		await this.audit({
			userId,
			operation: 'calendar.connection.account_deletion',
			outcome: 'success',
			metadata: {
				connectionsDeleted: connections.length,
				legacyTokenDeleted: Boolean(legacyData),
				remoteRevocationsSucceeded,
				remoteRevocationsUnconfirmed: revocationsAttempted - remoteRevocationsSucceeded
			}
		});

		return {
			connectionsFound: connections.length,
			connectionsDeleted: connections.length,
			remoteRevocationsSucceeded,
			remoteRevocationsUnconfirmed: revocationsAttempted - remoteRevocationsSucceeded,
			legacyTokenDeleted: Boolean(legacyData)
		};
	}

	/**
	 * Idempotently copy a singleton Calendar grant into the connection model. Legacy rows stay in
	 * place for rollback until the retirement gate; this method never changes a dedicated-client
	 * connection back to the shared-login OAuth client.
	 */
	async migrateLegacyConnection(userId: string): Promise<{
		status: 'migrated' | 'already_migrated' | 'no_legacy_token' | 'reconnect_required';
		connectionId: string | null;
		reason?: string;
	}> {
		this.requireConfigured();
		const { data: legacyData, error: legacyError } = await this.admin
			.from('user_calendar_tokens')
			.select(
				'user_id, access_token, refresh_token, expiry_date, google_email, google_user_id, scope, token_type, created_at, updated_at'
			)
			.eq('user_id', userId)
			.maybeSingle();
		if (legacyError) {
			throw new GoogleCalendarConnectionError(
				'database_error',
				'Unable to load the legacy Google Calendar grant'
			);
		}
		if (!legacyData) {
			return { status: 'no_legacy_token', connectionId: null };
		}

		let legacy: LegacyCalendarTokenRow;
		try {
			legacy = decodeStoredCalendarTokens(
				legacyData as LegacyCalendarTokenRow
			) as LegacyCalendarTokenRow;
		} catch {
			await this.audit({
				userId,
				operation: 'calendar.connection.legacy_migration',
				outcome: 'blocked',
				reasonCode: 'legacy_token_decryption_failed'
			});
			return {
				status: 'reconnect_required',
				connectionId: null,
				reason: 'legacy_token_decryption_failed'
			};
		}

		if (!legacy.refresh_token || !legacy.google_user_id || !legacy.google_email) {
			await this.audit({
				userId,
				operation: 'calendar.connection.legacy_migration',
				outcome: 'blocked',
				reasonCode: 'legacy_identity_or_refresh_token_missing'
			});
			return {
				status: 'reconnect_required',
				connectionId: null,
				reason: 'legacy_identity_or_refresh_token_missing'
			};
		}

		const { data: existingData, error: existingError } = await this.admin
			.from('user_calendar_connections')
			.select('id')
			.eq('user_id', userId)
			.eq('provider', 'google_calendar')
			.eq('provider_account_id', legacy.google_user_id)
			.is('deleted_at', null)
			.maybeSingle();
		if (existingError) {
			throw new GoogleCalendarConnectionError(
				'database_error',
				'Unable to inspect existing Google Calendar connections'
			);
		}
		if (existingData?.id) {
			// A prior attempt may have committed the connection and credentials before source
			// discovery failed. Always reconcile sources so retries repair that partial state.
			const existingClient = await this.getAuthenticatedClient(userId, existingData.id);
			await this.discoverSources(userId, existingData.id, existingClient);
			return { status: 'already_migrated', connectionId: existingData.id };
		}

		const oauthClient = this.createOAuthClient('google_shared_login');
		oauthClient.setCredentials({
			access_token: legacy.access_token,
			refresh_token: legacy.refresh_token,
			expiry_date: legacy.expiry_date ?? undefined,
			token_type: legacy.token_type ?? 'Bearer',
			scope: legacy.scope ?? undefined
		});

		let refreshed: Credentials;
		let tokenInfo: TokenInfo;
		try {
			refreshed = (await oauthClient.refreshAccessToken()).credentials;
			if (!refreshed.access_token) throw new Error('missing_access_token');
			tokenInfo = await oauthClient.getTokenInfo(refreshed.access_token);
		} catch {
			await this.audit({
				userId,
				operation: 'calendar.connection.legacy_migration',
				outcome: 'blocked',
				reasonCode: 'legacy_grant_invalid'
			});
			return {
				status: 'reconnect_required',
				connectionId: null,
				reason: 'legacy_grant_invalid'
			};
		}

		const sharedCredentials = this.getOAuthClientCredentials('google_shared_login');
		const grantedScopes = normalizeScopeList(
			tokenInfo.scopes ?? refreshed.scope ?? legacy.scope
		);
		if (
			tokenInfo.aud !== sharedCredentials.clientId ||
			tokenInfo.sub !== legacy.google_user_id ||
			!grantedScopes.includes(GOOGLE_CALENDAR_SCOPE)
		) {
			await this.audit({
				userId,
				operation: 'calendar.connection.legacy_migration',
				outcome: 'blocked',
				reasonCode: 'legacy_identity_verification_failed'
			});
			return {
				status: 'reconnect_required',
				connectionId: null,
				reason: 'legacy_identity_verification_failed'
			};
		}

		const connectionId = this.randomUuid();
		const refreshToken = refreshed.refresh_token ?? legacy.refresh_token;
		const tokenContext: GoogleCalendarTokenContext = {
			userId,
			connectionId,
			providerAccountId: legacy.google_user_id,
			oauthClientKind: 'google_shared_login'
		};
		const { data: upsertData, error: upsertError } = await this.admin.rpc(
			'upsert_google_calendar_connection',
			{
				p_user_id: userId,
				p_expected_connection_id: null,
				p_new_connection_id: connectionId,
				p_provider_account_id: legacy.google_user_id,
				p_email_address: legacy.google_email,
				p_display_name: null,
				p_default_account_label: getDefaultLabel(legacy.google_email),
				p_oauth_client_kind: 'google_shared_login',
				p_access_token_ciphertext: encryptGoogleCalendarToken(
					refreshed.access_token!,
					tokenContext
				),
				p_refresh_token_ciphertext: encryptGoogleCalendarToken(refreshToken, tokenContext),
				p_access_token_expires_at: refreshed.expiry_date
					? new Date(refreshed.expiry_date).toISOString()
					: null,
				p_refresh_token_expires_at: getRefreshTokenExpiresAt(refreshed, this.now()),
				p_token_type: refreshed.token_type ?? legacy.token_type ?? 'Bearer',
				p_granted_scopes: grantedScopes,
				p_key_version: getActiveGoogleCalendarTokenKeyVersion()
			}
		);
		if (upsertError || !firstRow(upsertData as ConnectionRow | ConnectionRow[] | null)) {
			throw new GoogleCalendarConnectionError(
				'database_error',
				'Unable to migrate the legacy Google Calendar grant'
			);
		}

		oauthClient.setCredentials({
			...refreshed,
			refresh_token: refreshToken
		});
		await this.discoverSources(userId, connectionId, oauthClient);
		await this.audit({
			userId,
			connectionId,
			operation: 'calendar.connection.legacy_migration',
			outcome: 'success',
			metadata: { oauthClientKind: 'google_shared_login' }
		});

		return { status: 'migrated', connectionId };
	}
}
