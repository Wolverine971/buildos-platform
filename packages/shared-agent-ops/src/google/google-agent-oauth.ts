// packages/shared-agent-ops/src/google/google-agent-oauth.ts
// Separate consent and credentials for AI access. Existing human tokens are never read here.
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { CodeChallengeMethod, OAuth2Client, type Credentials } from 'google-auth-library';
import {
	GOOGLE_CALENDAR_SCOPES,
	hasRequiredGoogleCalendarScopes
} from '../calendar/google-calendar-scopes';

export type GoogleAgentConnectionKind = 'gmail' | 'calendar' | 'calendar_legacy';
export type GoogleAgentTarget = {
	userId: string;
	kind: GoogleAgentConnectionKind;
	connectionId: string;
};
export type GoogleAgentEnv = (name: string) => string | undefined;
// Structural server-side database port, also used by the Calendar credential service.
export type GoogleAgentDatabase = {
	from(table: string): any;
	rpc(
		name: string,
		args: Record<string, unknown>
	): PromiseLike<{ data: unknown; error: unknown }>;
};
type AgentOAuthClient = Pick<
	OAuth2Client,
	| 'generateCodeVerifierAsync'
	| 'generateAuthUrl'
	| 'getToken'
	| 'verifyIdToken'
	| 'getTokenInfo'
	| 'setCredentials'
	| 'refreshAccessToken'
>;
type AgentState = {
	state_hash: string;
	user_id: string;
	connection_kind: GoogleAgentConnectionKind;
	connection_id: string;
	provider_account_id: string;
	oauth_client_id: string;
	redirect_uri: string;
	nonce: string;
	code_verifier: string;
};
type AgentGrant = {
	id: string;
	user_id: string;
	connection_kind: GoogleAgentConnectionKind;
	connection_id: string;
	provider_account_id: string;
	oauth_client_id: string;
	access_token_ciphertext: string;
	refresh_token_ciphertext: string;
	access_token_expires_at: string | null;
	refresh_token_expires_at: string | null;
	granted_scopes: string[];
	status: 'active' | 'reconnect_required';
	revision: string;
};
export class GoogleAgentOAuthError extends Error {
	constructor(
		public readonly code:
			| 'not_configured'
			| 'connection_not_found'
			| 'agent_authorization_required'
			| 'invalid_state'
			| 'account_mismatch'
			| 'scope_mismatch'
			| 'provider_error'
			| 'database_error',
		message: string
	) {
		super(message);
		this.name = 'GoogleAgentOAuthError';
	}
}
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const readEnv: GoogleAgentEnv = (name) => process.env[name];
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const scopesOf = (scopes: string[] | undefined) => [...new Set(scopes ?? [])].sort();
function validScopes(kind: GoogleAgentConnectionKind, scopes: string[]): boolean {
	if (kind !== 'gmail') return hasRequiredGoogleCalendarScopes(scopes);
	return (
		scopes.includes(GMAIL_SCOPE) &&
		!scopes.some(
			(scope) =>
				(scope.startsWith('https://www.googleapis.com/auth/gmail.') &&
					scope !== GMAIL_SCOPE) ||
				scope.replace(/\/+$/, '') === 'https://mail.google.com'
		)
	);
}
function refreshExpiry(tokens: Credentials, now: number): string | null {
	const seconds = Number(
		(tokens as Credentials & { refresh_token_expires_in?: number }).refresh_token_expires_in
	);
	return Number.isFinite(seconds) && seconds > 0
		? new Date(now + seconds * 1000).toISOString()
		: null;
}

export class GoogleAgentOAuthService {
	private readonly env: GoogleAgentEnv;
	private readonly now: () => number;
	private readonly createClient: (
		id: string,
		secret: string,
		redirectUri?: string
	) => AgentOAuthClient;
	constructor(
		private readonly db: GoogleAgentDatabase,
		options: {
			readEnv?: GoogleAgentEnv;
			now?: () => number;
			createOAuthClient?: (
				id: string,
				secret: string,
				redirectUri?: string
			) => AgentOAuthClient;
		} = {}
	) {
		this.env = options.readEnv ?? readEnv;
		this.now = options.now ?? Date.now;
		this.createClient =
			options.createOAuthClient ??
			((id, secret, redirectUri) => new OAuth2Client(id, secret, redirectUri));
	}
	private config(kind: GoogleAgentConnectionKind) {
		const prefix = kind === 'gmail' ? 'PRIVATE_GMAIL_AGENT' : 'PRIVATE_GOOGLE_CALENDAR_AGENT';
		const id = this.env(`${prefix}_CLIENT_ID`)?.trim();
		const secret = this.env(`${prefix}_CLIENT_SECRET`)?.trim();
		const keyName =
			kind === 'gmail'
				? 'PRIVATE_GMAIL_TOKEN_ENCRYPTION_KEY_V1'
				: 'PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1';
		const key = this.env(keyName)?.trim();
		// Never accept a human/login client, or reuse the other integration's agent client.
		const otherPrefix =
			kind === 'gmail' ? 'PRIVATE_GOOGLE_CALENDAR_AGENT' : 'PRIVATE_GMAIL_AGENT';
		const conflicts = [
			'GOOGLE_CLIENT_ID',
			'PRIVATE_GOOGLE_CLIENT_ID',
			'PUBLIC_GOOGLE_CLIENT_ID',
			'PRIVATE_GMAIL_READ_CLIENT_ID',
			'PRIVATE_GOOGLE_CALENDAR_CLIENT_ID',
			`${otherPrefix}_CLIENT_ID`
		];
		if (
			!id ||
			!secret ||
			!key ||
			Buffer.byteLength(key) < 32 ||
			conflicts.some((name) => this.env(name)?.trim() === id)
		) {
			throw new GoogleAgentOAuthError(
				'not_configured',
				`Separate Google agent access is not configured (${prefix}_CLIENT_ID / CLIENT_SECRET and ${keyName}).`
			);
		}
		return { id, secret, key };
	}
	isConfigured(kind: GoogleAgentConnectionKind): boolean {
		try {
			this.config(kind);
			return true;
		} catch {
			return false;
		}
	}
	private seal(
		value: string,
		grant: Pick<
			AgentGrant,
			| 'user_id'
			| 'connection_kind'
			| 'connection_id'
			| 'provider_account_id'
			| 'oauth_client_id'
		>
	): string {
		const key = createHash('sha256')
			.update(`buildos:google-agent:v1:${this.config(grant.connection_kind).key}`)
			.digest();
		const iv = randomBytes(12);
		const cipher = createCipheriv('aes-256-gcm', key, iv);
		cipher.setAAD(this.context(grant));
		const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
		return `enc:google-agent:v1.${Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url')}`;
	}
	private context(
		grant: Pick<
			AgentGrant,
			| 'user_id'
			| 'connection_kind'
			| 'connection_id'
			| 'provider_account_id'
			| 'oauth_client_id'
		>
	): Buffer {
		return Buffer.from(
			JSON.stringify([
				'buildos:google-agent:v1',
				grant.user_id,
				grant.connection_kind,
				grant.connection_id,
				grant.provider_account_id,
				grant.oauth_client_id
			])
		);
	}
	private open(value: string, grant: AgentGrant): string {
		if (!value.startsWith('enc:google-agent:v1.'))
			throw new GoogleAgentOAuthError(
				'database_error',
				'Stored agent credentials are invalid.'
			);
		try {
			const key = createHash('sha256')
				.update(`buildos:google-agent:v1:${this.config(grant.connection_kind).key}`)
				.digest();
			const bytes = Buffer.from(value.slice('enc:google-agent:v1.'.length), 'base64url');
			const cipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
			cipher.setAuthTag(bytes.subarray(12, 28));
			cipher.setAAD(this.context(grant));
			return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString(
				'utf8'
			);
		} catch {
			throw new GoogleAgentOAuthError(
				'database_error',
				'Stored agent credentials could not be decrypted.'
			);
		}
	}
	private async connection(
		target: GoogleAgentTarget
	): Promise<{ accountId: string; email: string | null }> {
		const legacy = target.kind === 'calendar_legacy';
		if (legacy && target.connectionId !== target.userId)
			throw new GoogleAgentOAuthError(
				'connection_not_found',
				'Calendar connection was not found.'
			);
		const table = legacy
			? 'user_calendar_tokens'
			: target.kind === 'gmail'
				? 'user_email_connections'
				: 'user_calendar_connections';
		let query = this.db
			.from(table)
			.select(
				legacy
					? 'google_user_id, google_email'
					: 'provider_account_id, email_address, status' +
							(target.kind === 'gmail' ? ', read_enabled' : '')
			)
			.eq('user_id', target.userId);
		if (!legacy)
			query = query
				.eq('id', target.connectionId)
				.eq('provider', target.kind === 'gmail' ? 'google_gmail' : 'google_calendar')
				.is('deleted_at', null);
		const { data, error } = await query.maybeSingle();
		const accountId = legacy ? data?.google_user_id : data?.provider_account_id;
		if (
			error ||
			!accountId ||
			data?.status === 'disabled' ||
			(target.kind === 'gmail' && !data.read_enabled)
		) {
			throw new GoogleAgentOAuthError(
				'connection_not_found',
				'Connect this Google account in Settings before enabling agent access.'
			);
		}
		return { accountId, email: legacy ? data.google_email : data.email_address };
	}
	private grantQuery(target: GoogleAgentTarget) {
		return this.db
			.from('google_agent_grants')
			.select('*')
			.eq('user_id', target.userId)
			.eq('connection_kind', target.kind)
			.eq('connection_id', target.connectionId);
	}
	async status(
		target: GoogleAgentTarget
	): Promise<{ configured: boolean; status: 'not_connected' | 'active' | 'reconnect_required' }> {
		const connection = await this.connection(target);
		const configured = this.isConfigured(target.kind);
		if (!configured) return { configured, status: 'not_connected' };
		const { data, error } = await this.grantQuery(target).maybeSingle();
		if (error)
			throw new GoogleAgentOAuthError(
				'database_error',
				'Unable to load Google agent access.'
			);
		if (!data) return { configured, status: 'not_connected' };
		return {
			configured,
			status:
				data.provider_account_id !== connection.accountId ||
				data.oauth_client_id !== this.config(target.kind).id ||
				(data.refresh_token_expires_at &&
					Date.parse(data.refresh_token_expires_at) <= this.now())
					? 'reconnect_required'
					: data.status
		};
	}
	async createAuthorizationUrl(target: GoogleAgentTarget, redirectUri: string): Promise<string> {
		const config = this.config(target.kind);
		const connection = await this.connection(target);
		const client = this.createClient(config.id, config.secret, redirectUri);
		const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
		if (!codeChallenge)
			throw new GoogleAgentOAuthError(
				'provider_error',
				'Unable to start secure Google consent.'
			);
		const state = randomBytes(32).toString('base64url');
		const nonce = randomBytes(32).toString('base64url');
		await this.db
			.from('google_agent_oauth_states')
			.delete()
			.lt('expires_at', new Date(this.now()).toISOString());
		const { error } = await this.db.from('google_agent_oauth_states').insert({
			state_hash: sha256(state),
			user_id: target.userId,
			connection_kind: target.kind,
			connection_id: target.connectionId,
			provider_account_id: connection.accountId,
			oauth_client_id: config.id,
			redirect_uri: redirectUri,
			nonce,
			code_verifier: codeVerifier,
			expires_at: new Date(this.now() + 10 * 60_000).toISOString()
		});
		if (error)
			throw new GoogleAgentOAuthError(
				'database_error',
				'Unable to start Google agent consent.'
			);
		return client.generateAuthUrl({
			access_type: 'offline',
			prompt: 'consent',
			include_granted_scopes: false,
			scope: [
				'openid',
				'email',
				...(target.kind === 'gmail' ? [GMAIL_SCOPE] : GOOGLE_CALENDAR_SCOPES)
			],
			state,
			nonce,
			code_challenge: codeChallenge,
			code_challenge_method: CodeChallengeMethod.S256,
			...(connection.email ? { login_hint: connection.email } : {})
		});
	}
	async consumeState(state: string | null, userId: string): Promise<AgentState> {
		if (!state)
			throw new GoogleAgentOAuthError(
				'invalid_state',
				'Google consent has expired. Please try again.'
			);
		const { data, error } = await this.db.rpc('consume_google_agent_oauth_state', {
			p_state_hash: sha256(state),
			p_user_id: userId
		});
		const row = Array.isArray(data) ? data[0] : null;
		if (error || !row)
			throw new GoogleAgentOAuthError(
				'invalid_state',
				'Google consent has expired. Please try again.'
			);
		return row as AgentState;
	}
	async exchangeCode(state: AgentState, code: string, redirectUri: string): Promise<void> {
		const target = {
			userId: state.user_id,
			kind: state.connection_kind,
			connectionId: state.connection_id
		};
		const config = this.config(target.kind);
		const connection = await this.connection(target);
		if (
			state.oauth_client_id !== config.id ||
			state.redirect_uri !== redirectUri ||
			state.provider_account_id !== connection.accountId
		) {
			throw new GoogleAgentOAuthError(
				'invalid_state',
				'The Google connection changed. Please start consent again.'
			);
		}
		const client = this.createClient(config.id, config.secret, redirectUri);
		let tokens: Credentials;
		try {
			tokens = (
				await client.getToken({
					code,
					codeVerifier: state.code_verifier,
					redirect_uri: redirectUri,
					client_id: config.id
				})
			).tokens;
		} catch {
			throw new GoogleAgentOAuthError(
				'provider_error',
				'Google could not complete agent consent.'
			);
		}
		if (!tokens.access_token || !tokens.id_token || !tokens.refresh_token)
			throw new GoogleAgentOAuthError(
				'agent_authorization_required',
				'Google did not grant offline agent access. Please approve access again.'
			);
		let identity;
		let info;
		try {
			identity = (
				await client.verifyIdToken({ idToken: tokens.id_token, audience: config.id })
			).getPayload();
			info = await client.getTokenInfo(tokens.access_token);
		} catch {
			throw new GoogleAgentOAuthError(
				'account_mismatch',
				'Unable to verify Google agent consent.'
			);
		}
		if (
			!identity ||
			identity.sub !== connection.accountId ||
			identity.email_verified !== true ||
			identity.nonce !== state.nonce ||
			!['accounts.google.com', 'https://accounts.google.com'].includes(identity.iss) ||
			info.aud !== config.id ||
			(info.sub && info.sub !== connection.accountId)
		) {
			throw new GoogleAgentOAuthError(
				'account_mismatch',
				'Approve agent access using the same Google account as this connection.'
			);
		}
		const scopes = scopesOf(info.scopes);
		if (!validScopes(target.kind, scopes))
			throw new GoogleAgentOAuthError(
				'scope_mismatch',
				'Google did not grant the requested agent permissions.'
			);
		const row = {
			user_id: target.userId,
			connection_kind: target.kind,
			connection_id: target.connectionId,
			provider_account_id: connection.accountId,
			oauth_client_id: config.id
		};
		const { error } = await this.db.rpc('save_google_agent_grant', {
			p_state_hash: state.state_hash,
			p_user_id: target.userId,
			p_access_token_ciphertext: this.seal(tokens.access_token, row),
			p_refresh_token_ciphertext: this.seal(tokens.refresh_token, row),
			p_access_token_expires_at: tokens.expiry_date
				? new Date(tokens.expiry_date).toISOString()
				: null,
			p_refresh_token_expires_at: refreshExpiry(tokens, this.now()),
			p_granted_scopes: scopes
		});
		if (error)
			throw new GoogleAgentOAuthError(
				'database_error',
				'Unable to save Google agent access.'
			);
	}
	async disconnect(target: GoogleAgentTarget): Promise<void> {
		await this.connection(target);
		// Removing pending state prevents a consent window from re-enabling a disabled grant.
		for (const table of ['google_agent_oauth_states', 'google_agent_grants']) {
			const { error } = await this.db
				.from(table)
				.delete()
				.eq('user_id', target.userId)
				.eq('connection_kind', target.kind)
				.eq('connection_id', target.connectionId);
			if (error)
				throw new GoogleAgentOAuthError(
					'database_error',
					'Unable to disable Google agent access.'
				);
		}
	}
	async getAccessToken(target: GoogleAgentTarget, forceRefresh = false): Promise<string> {
		const config = this.config(target.kind);
		const connection = await this.connection(target);
		const { data, error } = await this.grantQuery(target).maybeSingle();
		const grant = data as AgentGrant | null;
		if (error)
			throw new GoogleAgentOAuthError(
				'database_error',
				'Unable to load Google agent authorization.'
			);
		if (
			!grant ||
			grant.status !== 'active' ||
			grant.oauth_client_id !== config.id ||
			grant.provider_account_id !== connection.accountId ||
			!validScopes(target.kind, grant.granted_scopes)
		) {
			throw new GoogleAgentOAuthError(
				'agent_authorization_required',
				'Enable Agent access for this account in Settings. Your existing Google connection is unchanged.'
			);
		}
		const markExpired = async () => {
			await this.db
				.from('google_agent_grants')
				.update({ status: 'reconnect_required' })
				.eq('id', grant.id)
				.eq('revision', grant.revision);
		};
		if (
			grant.refresh_token_expires_at &&
			Date.parse(grant.refresh_token_expires_at) <= this.now()
		) {
			await markExpired();
			throw new GoogleAgentOAuthError(
				'agent_authorization_required',
				'Reconnect Agent access in Settings.'
			);
		}
		if (
			!forceRefresh &&
			grant.access_token_expires_at &&
			Date.parse(grant.access_token_expires_at) > this.now() + 5 * 60_000
		)
			return this.open(grant.access_token_ciphertext, grant);
		const client = this.createClient(config.id, config.secret);
		const refreshToken = this.open(grant.refresh_token_ciphertext, grant);
		client.setCredentials({ refresh_token: refreshToken });
		let tokens: Credentials;
		try {
			tokens = (await client.refreshAccessToken()).credentials;
		} catch (error) {
			const code = (error as { response?: { data?: { error?: string } } })?.response?.data
				?.error;
			if (code === 'invalid_grant' || code === 'invalid_client') {
				await markExpired();
				throw new GoogleAgentOAuthError(
					'agent_authorization_required',
					'Reconnect Agent access in Settings.'
				);
			}
			throw new GoogleAgentOAuthError(
				'provider_error',
				'Google agent access is temporarily unavailable.'
			);
		}
		if (!tokens.access_token)
			throw new GoogleAgentOAuthError(
				'provider_error',
				'Google returned incomplete agent credentials.'
			);
		let info;
		try {
			info = await client.getTokenInfo(tokens.access_token);
		} catch {
			throw new GoogleAgentOAuthError(
				'provider_error',
				'Unable to verify refreshed Google agent credentials.'
			);
		}
		const scopes = scopesOf(info.scopes);
		if (
			info.aud !== config.id ||
			(info.sub && info.sub !== connection.accountId) ||
			!validScopes(target.kind, scopes)
		) {
			await markExpired();
			throw new GoogleAgentOAuthError(
				'agent_authorization_required',
				'Reconnect Agent access in Settings.'
			);
		}
		const { data: updated, error: updateError } = await this.db
			.from('google_agent_grants')
			.update({
				access_token_ciphertext: this.seal(tokens.access_token, grant),
				refresh_token_ciphertext: this.seal(tokens.refresh_token ?? refreshToken, grant),
				access_token_expires_at: new Date(
					tokens.expiry_date ?? info.expiry_date
				).toISOString(),
				refresh_token_expires_at:
					refreshExpiry(tokens, this.now()) ?? grant.refresh_token_expires_at,
				granted_scopes: scopes,
				revision: randomUUID(),
				updated_at: new Date(this.now()).toISOString()
			})
			.eq('id', grant.id)
			.eq('revision', grant.revision)
			.eq('status', 'active')
			.select('id')
			.maybeSingle();
		if (updateError)
			throw new GoogleAgentOAuthError(
				'database_error',
				'Unable to save refreshed Google agent credentials.'
			);
		if (!updated)
			throw new GoogleAgentOAuthError(
				'agent_authorization_required',
				'Google agent access changed during this request. Please retry.'
			);
		return tokens.access_token;
	}
	async getCalendarClient(
		userId: string,
		connectionId: string,
		legacy = false
	): Promise<OAuth2Client> {
		const accessToken = await this.getAccessToken({
			userId,
			connectionId,
			kind: legacy ? 'calendar_legacy' : 'calendar'
		});
		// Access-token-only: googleapis cannot auto-refresh with a different/human grant.
		const client = new OAuth2Client();
		client.setCredentials({ access_token: accessToken });
		return client;
	}
}
