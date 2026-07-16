// apps/web/src/lib/server/agent-call/oauth-connector.service.ts
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import type {
	AgentCallScope,
	AgentOAuthAccessTokenRecord,
	AgentOAuthAuthorizationCodeRecord,
	AgentOAuthClientRecord,
	AgentOAuthGrantRecord,
	AgentOAuthRefreshTokenRecord,
	BuildosAgentAllowedOp,
	BuildosAgentOAuthScope,
	ExternalAgentCallerRecord
} from '@buildos/shared-types';
import { BUILDOS_AGENT_READ_OPS, OPENCLAW_DEFAULT_WRITE_OPS } from '@buildos/shared-types';
import {
	ensureActorId,
	fetchProjectSummaries
} from '$lib/services/ontology/ontology-projects.service';
import { logSecurityEvent, type SecurityEventLogOptions } from '$lib/server/security-event-logger';
import { buildCallerPolicy, isWriteOp } from './agent-call-policy';
import { ensureUserBuildosAgent } from './callee-resolution';
import { hashAgentCallerToken } from './caller-auth';

export const BUILDOS_MCP_PATH = '/mcp/buildos';
export const BUILDOS_MCP_CLIENT_PROFILE_ID = 'claude-browser';
export const BUILDOS_CONNECTOR_PUBLIC_NAME = 'BuildOS Connector';
export const BUILDOS_MCP_SERVER_NAME = 'BuildOS MCP';
export const BUILDOS_CONNECTOR_SUPPORT_EMAIL = 'dj@build-os.com';
export const BUILDOS_CONNECTOR_ICON_PATH = '/brain-bolt-80.png';
export const BUILDOS_OAUTH_SCOPES = [
	'buildos.read',
	'buildos.write',
	'offline_access'
] as const satisfies readonly BuildosAgentOAuthScope[];

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60;
const AUTHORIZATION_CODE_TTL_SECONDS = 5 * 60;
const DEFAULT_SCOPES: BuildosAgentOAuthScope[] = ['buildos.read', 'offline_access'];
export const BUILDOS_OAUTH_READ_WRITE_OPS = [
	...BUILDOS_AGENT_READ_OPS,
	...OPENCLAW_DEFAULT_WRITE_OPS,
	'onto.project.create',
	'onto.project.update'
] as BuildosAgentAllowedOp[];

type OAuthTokenIssueResult = {
	accessToken: string;
	refreshToken: string | null;
	scope: string;
	expiresIn: number;
};

export type OAuthAuthorizationRequest = {
	client: AgentOAuthClientRecord;
	clientId: string;
	redirectUri: string;
	responseType: 'code';
	scope: string;
	scopes: BuildosAgentOAuthScope[];
	state: string | null;
	codeChallenge: string;
	codeChallengeMethod: 'S256';
	resource: string;
};

export type AuthenticatedOAuthMcpCaller = {
	accessToken: AgentOAuthAccessTokenRecord;
	grant: AgentOAuthGrantRecord;
	caller: ExternalAgentCallerRecord;
	scope: AgentCallScope;
};

export class OAuthConnectorError extends Error {
	constructor(
		message: string,
		public readonly status = 400,
		public readonly code = 'invalid_request',
		public readonly description = message
	) {
		super(message);
		this.name = 'OAuthConnectorError';
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function addSeconds(seconds: number): string {
	return new Date(Date.now() + seconds * 1000).toISOString();
}

function randomToken(prefix: string): string {
	return `${prefix}_${randomBytes(32).toString('base64url')}`;
}

function hashSecret(value: string): string {
	return createHash('sha256').update(value).digest('hex');
}

/**
 * Constant-time string comparison for secret material (hashed client secrets,
 * PKCE challenges). Falls back to `false` on length mismatch — for the
 * fixed-length digests we compare this leaks nothing useful, and it avoids the
 * early-exit timing signal of `===`/`!==`.
 */
function timingSafeStringEqual(a: string, b: string): boolean {
	const bufferA = Buffer.from(a);
	const bufferB = Buffer.from(b);
	if (bufferA.length !== bufferB.length) {
		return false;
	}
	return timingSafeEqual(bufferA, bufferB);
}

function pkceChallenge(verifier: string): string {
	return createHash('sha256').update(verifier).digest('base64url');
}

function normalizeJsonStringArray(value: unknown, fieldName: string): string[] {
	if (!Array.isArray(value)) {
		throw new OAuthConnectorError(`${fieldName} must be an array`);
	}

	const values: string[] = [];
	const seen = new Set<string>();
	for (const item of value) {
		if (typeof item !== 'string' || !item.trim()) {
			throw new OAuthConnectorError(`${fieldName} must contain non-empty strings`);
		}
		const normalized = item.trim();
		if (seen.has(normalized)) continue;
		seen.add(normalized);
		values.push(normalized);
	}

	return values;
}

function normalizeRedirectUri(value: string): string {
	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		throw new OAuthConnectorError('redirect_uris must contain absolute URLs');
	}

	const isLocalHttp =
		parsed.protocol === 'http:' &&
		(parsed.hostname === 'localhost' ||
			parsed.hostname === '127.0.0.1' ||
			parsed.hostname === '[::1]');
	if (parsed.protocol !== 'https:' && !isLocalHttp) {
		throw new OAuthConnectorError('redirect_uris must use HTTPS, except localhost development');
	}

	return parsed.toString();
}

function normalizeRedirectUris(value: unknown): string[] {
	const redirectUris = normalizeJsonStringArray(value, 'redirect_uris').map(normalizeRedirectUri);
	if (redirectUris.length === 0) {
		throw new OAuthConnectorError('redirect_uris is required');
	}
	return redirectUris;
}

function isLoopbackRedirectHost(hostname: string): boolean {
	const normalized = hostname.toLowerCase();
	return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '[::1]';
}

function parseRedirectUri(value: string): URL | null {
	try {
		return new URL(value);
	} catch {
		return null;
	}
}

function isLoopbackRedirectUriMatch(registeredUri: string, requestedUri: string): boolean {
	const registered = parseRedirectUri(registeredUri);
	const requested = parseRedirectUri(requestedUri);
	if (!registered || !requested) return false;
	if (registered.protocol !== 'http:' || requested.protocol !== 'http:') return false;
	if (
		!isLoopbackRedirectHost(registered.hostname) ||
		!isLoopbackRedirectHost(requested.hostname)
	) {
		return false;
	}
	if (registered.hostname.toLowerCase() !== requested.hostname.toLowerCase()) return false;
	if (registered.port) return false;

	return (
		registered.pathname === requested.pathname &&
		registered.search === requested.search &&
		registered.hash === requested.hash
	);
}

export function isOAuthRedirectUriAllowed(
	registeredRedirectUris: readonly string[],
	requestedRedirectUri: string
): boolean {
	if (registeredRedirectUris.includes(requestedRedirectUri)) {
		return true;
	}

	return registeredRedirectUris.some((registeredUri) =>
		isLoopbackRedirectUriMatch(registeredUri, requestedRedirectUri)
	);
}

function normalizeClientName(value: unknown): string {
	if (typeof value !== 'string' || !value.trim()) {
		return BUILDOS_CONNECTOR_PUBLIC_NAME;
	}
	return value.trim().slice(0, 120);
}

function normalizeOptionalUrl(value: unknown): string | null {
	if (typeof value !== 'string' || !value.trim()) {
		return null;
	}

	try {
		const parsed = new URL(value.trim());
		if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
		return parsed.toString();
	} catch {
		return null;
	}
}

function normalizeAllowedScopes(value: unknown): BuildosAgentOAuthScope[] {
	if (value === undefined || value === null) {
		return [...BUILDOS_OAUTH_SCOPES];
	}

	const rawScopes = Array.isArray(value)
		? value
		: typeof value === 'string'
			? value.split(/\s+/)
			: [];
	const allowed = new Set(BUILDOS_OAUTH_SCOPES);
	const scopes: BuildosAgentOAuthScope[] = [];
	for (const rawScope of rawScopes) {
		if (typeof rawScope !== 'string') continue;
		const normalized = rawScope.trim() as BuildosAgentOAuthScope;
		if (!allowed.has(normalized) || scopes.includes(normalized)) continue;
		scopes.push(normalized);
	}

	return scopes.length > 0 ? scopes : [...BUILDOS_OAUTH_SCOPES];
}

export function parseOAuthScopes(
	scopeValue: string | null | undefined,
	allowedScopes: readonly BuildosAgentOAuthScope[] = BUILDOS_OAUTH_SCOPES
): BuildosAgentOAuthScope[] {
	const allowed = new Set(allowedScopes);
	const requested = scopeValue?.trim() ? scopeValue.trim().split(/\s+/) : [...DEFAULT_SCOPES];
	const scopes: BuildosAgentOAuthScope[] = [];

	for (const entry of requested) {
		if (!BUILDOS_OAUTH_SCOPES.includes(entry as BuildosAgentOAuthScope)) {
			throw new OAuthConnectorError(`Unsupported scope: ${entry}`, 400, 'invalid_scope');
		}
		const scope = entry as BuildosAgentOAuthScope;
		if (!allowed.has(scope)) {
			throw new OAuthConnectorError(
				`Scope is not allowed for this client: ${scope}`,
				400,
				'invalid_scope'
			);
		}
		if (!scopes.includes(scope)) scopes.push(scope);
	}

	if (!scopes.includes('buildos.read') && !scopes.includes('buildos.write')) {
		scopes.unshift('buildos.read');
	}

	return scopes;
}

export function scopeString(scopes: readonly BuildosAgentOAuthScope[]): string {
	const order: BuildosAgentOAuthScope[] = ['buildos.read', 'buildos.write', 'offline_access'];
	return order.filter((scope) => scopes.includes(scope)).join(' ');
}

function scopeModeFromScopes(scopes: readonly BuildosAgentOAuthScope[]): AgentCallScope['mode'] {
	return scopes.includes('buildos.write') ? 'read_write' : 'read_only';
}

function allowedOpsForScopes(scopes: readonly BuildosAgentOAuthScope[]): BuildosAgentAllowedOp[] {
	return scopeModeFromScopes(scopes) === 'read_write'
		? [...BUILDOS_OAUTH_READ_WRITE_OPS]
		: [...BUILDOS_AGENT_READ_OPS];
}

export function scopesForOAuthApproval(
	requestedScopes: readonly BuildosAgentOAuthScope[],
	scopeMode: AgentCallScope['mode']
): BuildosAgentOAuthScope[] {
	return requestedScopes.filter(
		(scope) => scope !== 'buildos.write' || scopeMode === 'read_write'
	);
}

export function mcpResourceUrl(origin: string): string {
	return `${origin}${BUILDOS_MCP_PATH}`;
}

export function protectedResourceMetadataUrl(origin: string): string {
	return `${origin}/.well-known/oauth-protected-resource/mcp/buildos`;
}

export function normalizeOAuthResource(value: string | null, origin: string): string {
	const expected = mcpResourceUrl(origin);
	if (!value?.trim()) {
		return expected;
	}

	let resource: URL;
	try {
		resource = new URL(value.trim());
	} catch {
		throw new OAuthConnectorError('Unsupported OAuth resource', 400, 'invalid_target');
	}

	const queryEntries = [...resource.searchParams.entries()];
	const [profileEntry] = queryEntries;
	const isCanonicalResource =
		resource.origin === origin &&
		resource.pathname === BUILDOS_MCP_PATH &&
		!resource.username &&
		!resource.password &&
		!resource.hash;
	const isSupportedProfile =
		queryEntries.length === 0 ||
		(queryEntries.length === 1 &&
			profileEntry?.[0] === 'profile' &&
			profileEntry[1] === 'chatgpt_data_app');

	if (!isCanonicalResource || !isSupportedProfile) {
		throw new OAuthConnectorError('Unsupported OAuth resource', 400, 'invalid_target');
	}

	return expected;
}

function mapClientRecord(record: Record<string, unknown>): AgentOAuthClientRecord {
	return {
		...(record as unknown as AgentOAuthClientRecord),
		redirect_uris: normalizeJsonStringArray(record.redirect_uris, 'redirect_uris'),
		allowed_scopes: normalizeAllowedScopes(record.allowed_scopes)
	};
}

function mapGrantRecord(record: Record<string, unknown>): AgentOAuthGrantRecord {
	const grant = record as unknown as AgentOAuthGrantRecord;
	return {
		...grant,
		allowed_ops: Array.isArray(grant.allowed_ops)
			? grant.allowed_ops
			: ([] as BuildosAgentAllowedOp[]),
		allowed_project_ids: Array.isArray(grant.allowed_project_ids)
			? grant.allowed_project_ids.filter((id): id is string => typeof id === 'string')
			: null
	};
}

function inferOAuthClientProvider(client: AgentOAuthClientRecord): string {
	const haystack =
		`${client.client_id} ${client.client_name} ${client.client_uri ?? ''} ${client.redirect_uris.join(' ')}`.toLowerCase();
	if (haystack.includes('claude.ai') || haystack.includes('anthropic')) {
		return 'claude';
	}
	if (haystack.includes('chatgpt') || haystack.includes('openai')) {
		return 'chatgpt';
	}
	return 'remote_mcp';
}

function callerKeyForOAuthClient(client: AgentOAuthClientRecord): string {
	return `oauth:${client.client_id}`.slice(0, 255);
}

function isAllowedClientMetadataHost(url: URL): boolean {
	const hostname = url.hostname.toLowerCase();
	return (
		hostname === 'claude.ai' ||
		hostname.endsWith('.claude.ai') ||
		hostname === 'anthropic.com' ||
		hostname.endsWith('.anthropic.com')
	);
}

async function fetchClientIdMetadataDocument(
	clientId: string,
	fetchFn: typeof fetch
): Promise<Record<string, unknown> | null> {
	let url: URL;
	try {
		url = new URL(clientId);
	} catch {
		return null;
	}

	if (url.protocol !== 'https:' || !isAllowedClientMetadataHost(url)) {
		return null;
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 2500);
	try {
		const response = await fetchFn(url, {
			headers: { Accept: 'application/json' },
			redirect: 'error',
			signal: controller.signal
		});
		if (!response.ok) return null;
		const contentType = response.headers.get('content-type') ?? '';
		if (!contentType.includes('json')) return null;
		const text = await response.text();
		if (text.length > 64_000) return null;
		const metadata = JSON.parse(text) as unknown;
		return isRecord(metadata) ? metadata : null;
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
}

export async function resolveOAuthClient(
	admin: any,
	clientId: string,
	fetchFn: typeof fetch = fetch
): Promise<AgentOAuthClientRecord | null> {
	const { data, error } = await admin
		.from('agent_oauth_clients')
		.select('*')
		.eq('client_id', clientId)
		.maybeSingle();

	if (error) {
		throw new OAuthConnectorError('Failed to resolve OAuth client', 500, 'server_error');
	}

	if (data) {
		const client = mapClientRecord(data as Record<string, unknown>);
		return client.status === 'active' ? client : null;
	}

	const metadata = await fetchClientIdMetadataDocument(clientId, fetchFn);
	if (!metadata) {
		return null;
	}

	const redirectUris = normalizeRedirectUris(metadata.redirect_uris);
	const inserted = await insertOAuthClient(admin, {
		clientId,
		clientName: normalizeClientName(metadata.client_name),
		clientUri: normalizeOptionalUrl(metadata.client_uri),
		logoUri: normalizeOptionalUrl(metadata.logo_uri),
		redirectUris,
		allowedScopes: normalizeAllowedScopes(metadata.scope),
		clientType: 'public',
		registrationSource: 'cimd',
		metadata: {
			source: 'client_id_metadata_document',
			client_id_metadata_document: clientId
		}
	});

	return inserted;
}

async function insertOAuthClient(
	admin: any,
	params: {
		clientId: string;
		clientName: string;
		clientUri: string | null;
		logoUri: string | null;
		redirectUris: string[];
		allowedScopes: BuildosAgentOAuthScope[];
		clientType: 'public' | 'confidential';
		registrationSource: 'dynamic' | 'cimd' | 'static' | 'admin' | 'anthropic_held';
		metadata?: Record<string, unknown>;
		clientSecretHash?: string | null;
	}
): Promise<AgentOAuthClientRecord> {
	const { data, error } = await admin
		.from('agent_oauth_clients')
		.insert({
			client_id: params.clientId,
			client_secret_hash: params.clientSecretHash ?? null,
			client_name: params.clientName,
			client_uri: params.clientUri,
			logo_uri: params.logoUri,
			redirect_uris: params.redirectUris,
			allowed_scopes: params.allowedScopes,
			client_type: params.clientType,
			registration_source: params.registrationSource,
			status: 'active',
			metadata: params.metadata ?? {}
		})
		.select('*')
		.single();

	if (error || !data) {
		throw new OAuthConnectorError('Failed to register OAuth client', 500, 'server_error');
	}

	return mapClientRecord(data as Record<string, unknown>);
}

export async function registerDynamicOAuthClient(
	admin: any,
	body: unknown
): Promise<AgentOAuthClientRecord & { client_id_issued_at: number }> {
	if (!isRecord(body)) {
		throw new OAuthConnectorError('Registration body must be an object');
	}

	const redirectUris = normalizeRedirectUris(body.redirect_uris);
	const clientId = `bo_cl_${randomBytes(24).toString('base64url')}`;

	const client = await insertOAuthClient(admin, {
		clientId,
		clientName: normalizeClientName(body.client_name),
		clientUri: normalizeOptionalUrl(body.client_uri),
		logoUri: normalizeOptionalUrl(body.logo_uri),
		redirectUris,
		allowedScopes: normalizeAllowedScopes(body.scope),
		clientType: 'public',
		registrationSource: 'dynamic',
		metadata: {
			raw_registration_name: typeof body.client_name === 'string' ? body.client_name : null,
			software_id: typeof body.software_id === 'string' ? body.software_id : null,
			software_version:
				typeof body.software_version === 'string' ? body.software_version : null
		}
	});

	return {
		...client,
		client_id_issued_at: Math.floor(Date.now() / 1000)
	};
}

export async function loadOAuthAuthorizationRequest(
	admin: any,
	url: URL,
	fetchFn: typeof fetch = fetch
): Promise<OAuthAuthorizationRequest> {
	const clientId = url.searchParams.get('client_id')?.trim();
	const redirectUri = url.searchParams.get('redirect_uri')?.trim();
	const responseType = url.searchParams.get('response_type');
	const codeChallenge = url.searchParams.get('code_challenge')?.trim();
	const codeChallengeMethod = url.searchParams.get('code_challenge_method') ?? 'plain';

	if (!clientId) throw new OAuthConnectorError('client_id is required');
	if (!redirectUri) throw new OAuthConnectorError('redirect_uri is required');
	if (responseType !== 'code') {
		throw new OAuthConnectorError(
			'Only response_type=code is supported',
			400,
			'unsupported_response_type'
		);
	}
	if (!codeChallenge) throw new OAuthConnectorError('code_challenge is required');
	if (codeChallengeMethod !== 'S256') {
		throw new OAuthConnectorError('Only PKCE S256 is supported', 400, 'invalid_request');
	}

	const client = await resolveOAuthClient(admin, clientId, fetchFn);
	if (!client) {
		throw new OAuthConnectorError('Unknown OAuth client', 400, 'unauthorized_client');
	}

	if (!isOAuthRedirectUriAllowed(client.redirect_uris, redirectUri)) {
		throw new OAuthConnectorError(
			'redirect_uri is not registered for this client',
			400,
			'invalid_request'
		);
	}

	const scopes = parseOAuthScopes(url.searchParams.get('scope'), client.allowed_scopes);
	const resource = normalizeOAuthResource(url.searchParams.get('resource'), url.origin);

	return {
		client,
		clientId,
		redirectUri,
		responseType: 'code',
		scope: scopeString(scopes),
		scopes,
		state: url.searchParams.get('state'),
		codeChallenge,
		codeChallengeMethod: 'S256',
		resource
	};
}

export function buildOAuthRedirect(params: {
	redirectUri: string;
	code?: string;
	state?: string | null;
	error?: string;
	errorDescription?: string;
}): string {
	const url = new URL(params.redirectUri);
	if (params.code) url.searchParams.set('code', params.code);
	if (params.state) url.searchParams.set('state', params.state);
	if (params.error) url.searchParams.set('error', params.error);
	if (params.errorDescription) url.searchParams.set('error_description', params.errorDescription);
	return url.toString();
}

async function createOrUpdateOAuthCaller(params: {
	admin: any;
	userId: string;
	client: AgentOAuthClientRecord;
	scope: AgentCallScope;
	scopes: BuildosAgentOAuthScope[];
}): Promise<ExternalAgentCallerRecord> {
	const provider = inferOAuthClientProvider(params.client);
	const callerKey = callerKeyForOAuthClient(params.client);
	const metadata = {
		auth_scheme: 'oauth',
		client_id: params.client.client_id,
		client_name: params.client.client_name,
		client_profile_id: BUILDOS_MCP_CLIENT_PROFILE_ID,
		connector_name: BUILDOS_CONNECTOR_PUBLIC_NAME,
		installation_name: params.client.client_name || BUILDOS_CONNECTOR_PUBLIC_NAME,
		oauth_scopes: params.scopes
	};

	const { data: existing, error: existingError } = await params.admin
		.from('external_agent_callers')
		.select('*')
		.eq('user_id', params.userId)
		.eq('provider', provider)
		.eq('caller_key', callerKey)
		.maybeSingle();

	if (existingError) {
		throw new OAuthConnectorError('Failed to load OAuth caller', 500, 'server_error');
	}

	if (existing) {
		const { data: updated, error } = await params.admin
			.from('external_agent_callers')
			.update({
				status: 'trusted',
				policy: buildCallerPolicy({
					scopeMode: params.scope.mode,
					allowedProjectIds: params.scope.project_ids,
					allowedOps: params.scope.allowed_ops
				}),
				metadata: {
					...((existing.metadata as Record<string, unknown> | null) ?? {}),
					...metadata
				}
			})
			.eq('id', existing.id)
			.select('*')
			.single();

		if (error || !updated) {
			throw new OAuthConnectorError('Failed to update OAuth caller', 500, 'server_error');
		}
		return updated as ExternalAgentCallerRecord;
	}

	const internalCredential = randomToken('bo_oauth_caller');
	const { data: inserted, error } = await params.admin
		.from('external_agent_callers')
		.insert({
			user_id: params.userId,
			provider,
			caller_key: callerKey,
			token_prefix: 'oauth',
			token_hash: hashAgentCallerToken(internalCredential),
			status: 'trusted',
			policy: buildCallerPolicy({
				scopeMode: params.scope.mode,
				allowedProjectIds: params.scope.project_ids,
				allowedOps: params.scope.allowed_ops
			}),
			metadata
		})
		.select('*')
		.single();

	if (error || !inserted) {
		throw new OAuthConnectorError('Failed to create OAuth caller', 500, 'server_error');
	}

	return inserted as ExternalAgentCallerRecord;
}

async function createOrUpdateOAuthGrant(params: {
	admin: any;
	userId: string;
	client: AgentOAuthClientRecord;
	caller: ExternalAgentCallerRecord;
	resource: string;
	scopes: BuildosAgentOAuthScope[];
	scope: AgentCallScope;
}): Promise<AgentOAuthGrantRecord> {
	const { data: existing, error: existingError } = await params.admin
		.from('agent_oauth_grants')
		.select('*')
		.eq('user_id', params.userId)
		.eq('client_id', params.client.client_id)
		.eq('resource', params.resource)
		.eq('status', 'active')
		.maybeSingle();

	if (existingError) {
		throw new OAuthConnectorError('Failed to load OAuth grant', 500, 'server_error');
	}

	const payload = {
		user_id: params.userId,
		client_id: params.client.client_id,
		external_agent_caller_id: params.caller.id,
		client_profile_id: BUILDOS_MCP_CLIENT_PROFILE_ID,
		resource: params.resource,
		scope: scopeString(params.scopes),
		scope_mode: params.scope.mode,
		allowed_ops: params.scope.allowed_ops ?? allowedOpsForScopes(params.scopes),
		allowed_project_ids: params.scope.project_ids ?? null,
		status: 'active'
	};

	if (existing) {
		const { data: updated, error } = await params.admin
			.from('agent_oauth_grants')
			.update(payload)
			.eq('id', existing.id)
			.select('*')
			.single();
		if (error || !updated) {
			throw new OAuthConnectorError('Failed to update OAuth grant', 500, 'server_error');
		}
		return mapGrantRecord(updated as Record<string, unknown>);
	}

	const { data: inserted, error } = await params.admin
		.from('agent_oauth_grants')
		.insert(payload)
		.select('*')
		.single();

	if (error || !inserted) {
		throw new OAuthConnectorError('Failed to create OAuth grant', 500, 'server_error');
	}

	return mapGrantRecord(inserted as Record<string, unknown>);
}

export async function loadVisibleProjectsForOAuth(admin: any, userId: string) {
	const actorId = await ensureActorId(admin, userId);
	return fetchProjectSummaries(admin, actorId);
}

export async function approveOAuthAuthorization(params: {
	admin: any;
	userId: string;
	authorizationRequest: OAuthAuthorizationRequest;
	scopeMode: AgentCallScope['mode'];
	allowedProjectIds?: string[];
	securityEventOptions?: SecurityEventLogOptions;
	request?: Request;
}): Promise<{ code: string; grant: AgentOAuthGrantRecord; caller: ExternalAgentCallerRecord }> {
	const scopes = scopesForOAuthApproval(
		params.authorizationRequest.scopes,
		params.scopeMode
	);
	const normalizedScopes = parseOAuthScopes(
		scopeString(scopes),
		params.authorizationRequest.client.allowed_scopes
	);

	let allowedProjectIds = params.allowedProjectIds;
	if (allowedProjectIds !== undefined) {
		const visibleProjects = await loadVisibleProjectsForOAuth(params.admin, params.userId);
		const visibleProjectIds = new Set(visibleProjects.map((project) => project.id));
		const uniqueProjectIds = Array.from(new Set(allowedProjectIds));
		const invalidProjectIds = uniqueProjectIds.filter(
			(projectId) => !visibleProjectIds.has(projectId)
		);

		if (invalidProjectIds.length > 0) {
			throw new OAuthConnectorError(
				'Selected project is not available to this BuildOS account',
				400,
				'invalid_request'
			);
		}

		allowedProjectIds = uniqueProjectIds;
	}

	const scope: AgentCallScope = {
		mode: scopeModeFromScopes(normalizedScopes),
		allowed_ops: allowedOpsForScopes(normalizedScopes),
		...(allowedProjectIds === undefined ? {} : { project_ids: allowedProjectIds })
	};
	const caller = await createOrUpdateOAuthCaller({
		admin: params.admin,
		userId: params.userId,
		client: params.authorizationRequest.client,
		scope,
		scopes: normalizedScopes
	});
	const grant = await createOrUpdateOAuthGrant({
		admin: params.admin,
		userId: params.userId,
		client: params.authorizationRequest.client,
		caller,
		resource: params.authorizationRequest.resource,
		scopes: normalizedScopes,
		scope
	});
	const code = randomToken('bo_code');
	const { error } = await params.admin.from('agent_oauth_authorization_codes').insert({
		code_hash: hashSecret(code),
		client_id: params.authorizationRequest.client.client_id,
		user_id: params.userId,
		grant_id: grant.id,
		external_agent_caller_id: caller.id,
		redirect_uri: params.authorizationRequest.redirectUri,
		resource: params.authorizationRequest.resource,
		scope: grant.scope,
		code_challenge: params.authorizationRequest.codeChallenge,
		code_challenge_method: 'S256',
		expires_at: addSeconds(AUTHORIZATION_CODE_TTL_SECONDS)
	});

	if (error) {
		throw new OAuthConnectorError('Failed to issue authorization code', 500, 'server_error');
	}

	await logSecurityEvent(
		{
			eventType: 'agent.oauth.authorized',
			category: 'agent',
			outcome: 'success',
			severity: 'info',
			actorType: 'user',
			actorUserId: params.userId,
			externalAgentCallerId: caller.id,
			metadata: {
				client_id: params.authorizationRequest.client.client_id,
				client_name: params.authorizationRequest.client.client_name,
				resource: params.authorizationRequest.resource,
				scope: grant.scope
			}
		},
		{ ...(params.securityEventOptions ?? {}), supabase: params.admin }
	);

	return { code, grant, caller };
}

function extractClientSecret(request: Request, form: URLSearchParams): string | null {
	const auth = request.headers.get('authorization') ?? '';
	if (auth.startsWith('Basic ')) {
		try {
			const decoded = Buffer.from(auth.slice('Basic '.length), 'base64').toString('utf8');
			const separator = decoded.indexOf(':');
			return separator >= 0 ? decoded.slice(separator + 1) : null;
		} catch {
			return null;
		}
	}

	return form.get('client_secret');
}

async function validateTokenEndpointClient(
	admin: any,
	request: Request,
	form: URLSearchParams
): Promise<AgentOAuthClientRecord> {
	const formClientId = form.get('client_id')?.trim();
	let basicClientId: string | null = null;
	const auth = request.headers.get('authorization') ?? '';
	if (auth.startsWith('Basic ')) {
		try {
			const decoded = Buffer.from(auth.slice('Basic '.length), 'base64').toString('utf8');
			const separator = decoded.indexOf(':');
			basicClientId = separator >= 0 ? decoded.slice(0, separator) : decoded;
		} catch {
			throw new OAuthConnectorError('Invalid client authentication', 401, 'invalid_client');
		}
	}

	const clientId = (basicClientId || formClientId)?.trim();
	if (!clientId) throw new OAuthConnectorError('client_id is required', 401, 'invalid_client');

	const client = await resolveOAuthClient(admin, clientId);
	if (!client) throw new OAuthConnectorError('Unknown OAuth client', 401, 'invalid_client');

	if (client.client_secret_hash) {
		const secret = extractClientSecret(request, form);
		if (!secret || !timingSafeStringEqual(hashSecret(secret), client.client_secret_hash)) {
			throw new OAuthConnectorError('Invalid client secret', 401, 'invalid_client');
		}
	}

	return client;
}

async function issueOAuthTokens(params: {
	admin: any;
	grant: AgentOAuthGrantRecord;
	client: AgentOAuthClientRecord;
	includeRefreshToken: boolean;
	rotatedFromRefreshToken?: AgentOAuthRefreshTokenRecord;
}): Promise<OAuthTokenIssueResult> {
	const accessToken = randomToken('bo_at');
	const accessTokenHash = hashSecret(accessToken);
	const { error: accessError } = await params.admin.from('agent_oauth_access_tokens').insert({
		grant_id: params.grant.id,
		client_id: params.client.client_id,
		user_id: params.grant.user_id,
		external_agent_caller_id: params.grant.external_agent_caller_id,
		token_hash: accessTokenHash,
		token_prefix: accessToken.slice(0, 12),
		resource: params.grant.resource,
		scope: params.grant.scope,
		expires_at: addSeconds(ACCESS_TOKEN_TTL_SECONDS)
	});

	if (accessError) {
		throw new OAuthConnectorError('Failed to issue access token', 500, 'server_error');
	}

	let refreshToken: string | null = null;
	if (params.includeRefreshToken) {
		refreshToken = randomToken('bo_rt');
		const familyId = params.rotatedFromRefreshToken?.family_id ?? randomUUID();
		const { error: refreshError } = await params.admin
			.from('agent_oauth_refresh_tokens')
			.insert({
				grant_id: params.grant.id,
				client_id: params.client.client_id,
				user_id: params.grant.user_id,
				external_agent_caller_id: params.grant.external_agent_caller_id,
				token_hash: hashSecret(refreshToken),
				token_prefix: refreshToken.slice(0, 12),
				family_id: familyId,
				rotated_from_id: params.rotatedFromRefreshToken?.id ?? null,
				resource: params.grant.resource,
				scope: params.grant.scope,
				expires_at: addSeconds(REFRESH_TOKEN_TTL_SECONDS)
			});

		if (refreshError) {
			throw new OAuthConnectorError('Failed to issue refresh token', 500, 'server_error');
		}
	}

	return {
		accessToken,
		refreshToken,
		scope: params.grant.scope,
		expiresIn: ACCESS_TOKEN_TTL_SECONDS
	};
}

export async function exchangeOAuthAuthorizationCode(params: {
	admin: any;
	request: Request;
	form: URLSearchParams;
	securityEventOptions?: SecurityEventLogOptions;
}): Promise<OAuthTokenIssueResult> {
	const client = await validateTokenEndpointClient(params.admin, params.request, params.form);
	const code = params.form.get('code')?.trim();
	const redirectUri = params.form.get('redirect_uri')?.trim();
	const codeVerifier = params.form.get('code_verifier')?.trim();
	if (!code) throw new OAuthConnectorError('code is required');
	if (!redirectUri) throw new OAuthConnectorError('redirect_uri is required');
	if (!codeVerifier) throw new OAuthConnectorError('code_verifier is required');

	const { data, error } = await params.admin
		.from('agent_oauth_authorization_codes')
		.select('*')
		.eq('code_hash', hashSecret(code))
		.maybeSingle();
	if (error)
		throw new OAuthConnectorError('Failed to load authorization code', 500, 'server_error');
	if (!data) throw new OAuthConnectorError('Invalid authorization code', 400, 'invalid_grant');

	const authCode = data as AgentOAuthAuthorizationCodeRecord;
	if (authCode.client_id !== client.client_id || authCode.redirect_uri !== redirectUri) {
		throw new OAuthConnectorError(
			'Authorization code does not match client',
			400,
			'invalid_grant'
		);
	}
	if (authCode.used_at)
		throw new OAuthConnectorError('Authorization code already used', 400, 'invalid_grant');
	if (new Date(authCode.expires_at).getTime() <= Date.now()) {
		throw new OAuthConnectorError('Authorization code expired', 400, 'invalid_grant');
	}
	if (!timingSafeStringEqual(pkceChallenge(codeVerifier), authCode.code_challenge)) {
		throw new OAuthConnectorError('Invalid PKCE code verifier', 400, 'invalid_grant');
	}

	const { data: grantData, error: grantError } = await params.admin
		.from('agent_oauth_grants')
		.select('*')
		.eq('id', authCode.grant_id)
		.maybeSingle();
	if (grantError || !grantData) {
		throw new OAuthConnectorError('OAuth grant not found', 400, 'invalid_grant');
	}
	const grant = mapGrantRecord(grantData as Record<string, unknown>);
	if (grant.status !== 'active')
		throw new OAuthConnectorError('OAuth grant revoked', 400, 'invalid_grant');

	const { data: consumedCode, error: consumeCodeError } = await params.admin
		.from('agent_oauth_authorization_codes')
		.update({ used_at: new Date().toISOString() })
		.eq('id', authCode.id)
		.is('used_at', null)
		.select('id')
		.maybeSingle();
	if (consumeCodeError) {
		throw new OAuthConnectorError('Failed to consume authorization code', 500, 'server_error');
	}
	if (!consumedCode) {
		throw new OAuthConnectorError('Authorization code already used', 400, 'invalid_grant');
	}

	const tokens = await issueOAuthTokens({
		admin: params.admin,
		grant,
		client,
		includeRefreshToken: grant.scope.split(/\s+/).includes('offline_access')
	});

	await logSecurityEvent(
		{
			eventType: 'agent.oauth.token.exchanged',
			category: 'agent',
			outcome: 'success',
			severity: 'info',
			actorType: 'external_agent',
			actorUserId: grant.user_id,
			externalAgentCallerId: grant.external_agent_caller_id,
			metadata: {
				client_id: client.client_id,
				resource: grant.resource,
				scope: grant.scope
			}
		},
		{ ...(params.securityEventOptions ?? {}), supabase: params.admin }
	);

	return tokens;
}

export async function exchangeOAuthRefreshToken(params: {
	admin: any;
	request: Request;
	form: URLSearchParams;
	securityEventOptions?: SecurityEventLogOptions;
}): Promise<OAuthTokenIssueResult> {
	const client = await validateTokenEndpointClient(params.admin, params.request, params.form);
	const refreshToken = params.form.get('refresh_token')?.trim();
	if (!refreshToken)
		throw new OAuthConnectorError('refresh_token is required', 400, 'invalid_request');

	const { data, error } = await params.admin
		.from('agent_oauth_refresh_tokens')
		.select('*')
		.eq('token_hash', hashSecret(refreshToken))
		.maybeSingle();
	if (error) throw new OAuthConnectorError('Failed to load refresh token', 500, 'server_error');
	if (!data) throw new OAuthConnectorError('Invalid refresh token', 400, 'invalid_grant');

	const current = data as AgentOAuthRefreshTokenRecord;
	if (current.client_id !== client.client_id) {
		throw new OAuthConnectorError('Refresh token does not match client', 400, 'invalid_grant');
	}

	// Reuse detection: a refresh token that was already rotated (`used_at`) or
	// explicitly revoked is being presented again — a theft signal. Burn the
	// whole family + grant + caller (RFC 9700 §4.14.2) and surface it loudly.
	// NOTE: plain expiry below is NOT reuse and must not nuke the family.
	if (current.used_at || current.revoked_at) {
		await revokeRefreshTokenFamily({
			admin: params.admin,
			familyId: current.family_id,
			grantId: current.grant_id,
			externalAgentCallerId: current.external_agent_caller_id
		});
		await logSecurityEvent(
			{
				eventType: 'agent.oauth.refresh.reuse_detected',
				category: 'agent',
				outcome: 'blocked',
				severity: 'high',
				actorType: 'external_agent',
				actorUserId: current.user_id,
				externalAgentCallerId: current.external_agent_caller_id,
				reason: 'refresh_token_reuse',
				metadata: {
					client_id: current.client_id,
					grant_id: current.grant_id,
					family_id: current.family_id,
					token_prefix: current.token_prefix
				}
			},
			{ ...(params.securityEventOptions ?? {}), supabase: params.admin }
		);
		throw new OAuthConnectorError('Refresh token is no longer valid', 400, 'invalid_grant');
	}

	if (new Date(current.expires_at).getTime() <= Date.now()) {
		throw new OAuthConnectorError('Refresh token is no longer valid', 400, 'invalid_grant');
	}

	const { data: grantData, error: grantError } = await params.admin
		.from('agent_oauth_grants')
		.select('*')
		.eq('id', current.grant_id)
		.maybeSingle();
	if (grantError || !grantData) {
		throw new OAuthConnectorError('OAuth grant not found', 400, 'invalid_grant');
	}
	const grant = mapGrantRecord(grantData as Record<string, unknown>);
	if (grant.status !== 'active')
		throw new OAuthConnectorError('OAuth grant revoked', 400, 'invalid_grant');

	const { data: rotatedToken, error: rotateError } = await params.admin
		.from('agent_oauth_refresh_tokens')
		.update({ used_at: new Date().toISOString(), revoked_at: new Date().toISOString() })
		.eq('id', current.id)
		.is('used_at', null)
		.is('revoked_at', null)
		.select('id')
		.maybeSingle();
	if (rotateError) {
		throw new OAuthConnectorError('Failed to rotate refresh token', 500, 'server_error');
	}
	if (!rotatedToken) {
		throw new OAuthConnectorError('Refresh token is no longer valid', 400, 'invalid_grant');
	}

	return issueOAuthTokens({
		admin: params.admin,
		grant,
		client,
		includeRefreshToken: true,
		rotatedFromRefreshToken: current
	});
}

/**
 * Refresh-token reuse response. Presenting a refresh token that was already
 * rotated (`used_at`) or revoked signals theft (OAuth 2.1 / RFC 9700 §4.14.2):
 * revoke the ENTIRE token family plus the grant, its outstanding access tokens,
 * and the external caller — not just the single replayed token. This forces the
 * legitimate client to re-authorize, which is the correct fail-safe when we
 * cannot distinguish the real client from an attacker.
 */
async function revokeRefreshTokenFamily(params: {
	admin: any;
	familyId: string;
	grantId: string;
	externalAgentCallerId: string;
}): Promise<void> {
	const now = new Date().toISOString();
	await Promise.all([
		params.admin
			.from('agent_oauth_refresh_tokens')
			.update({ revoked_at: now })
			.eq('family_id', params.familyId)
			.is('revoked_at', null),
		params.admin
			.from('agent_oauth_access_tokens')
			.update({ revoked_at: now })
			.eq('grant_id', params.grantId)
			.is('revoked_at', null),
		params.admin
			.from('agent_oauth_grants')
			.update({ status: 'revoked' })
			.eq('id', params.grantId),
		params.admin
			.from('external_agent_callers')
			.update({ status: 'revoked' })
			.eq('id', params.externalAgentCallerId)
	]);
}

export async function revokeOAuthToken(params: {
	admin: any;
	token: string;
	client?: AgentOAuthClientRecord | null;
}): Promise<void> {
	const tokenHash = hashSecret(params.token);

	const revokeGrantCredentials = async (credential: {
		grant_id: string;
		external_agent_caller_id: string;
	}) => {
		const now = new Date().toISOString();
		await Promise.all([
			params.admin
				.from('agent_oauth_access_tokens')
				.update({ revoked_at: now })
				.eq('grant_id', credential.grant_id)
				.is('revoked_at', null),
			params.admin
				.from('agent_oauth_refresh_tokens')
				.update({ revoked_at: now })
				.eq('grant_id', credential.grant_id)
				.is('revoked_at', null),
			params.admin
				.from('agent_oauth_grants')
				.update({ status: 'revoked' })
				.eq('id', credential.grant_id),
			params.admin
				.from('external_agent_callers')
				.update({ status: 'revoked' })
				.eq('id', credential.external_agent_caller_id)
		]);
	};

	const { data: access } = await params.admin
		.from('agent_oauth_access_tokens')
		.select('*')
		.eq('token_hash', tokenHash)
		.maybeSingle();
	if (access) {
		if (params.client && access.client_id !== params.client.client_id) {
			return;
		}
		await revokeGrantCredentials(access);
		return;
	}

	const { data: refresh } = await params.admin
		.from('agent_oauth_refresh_tokens')
		.select('*')
		.eq('token_hash', tokenHash)
		.maybeSingle();
	if (refresh) {
		if (params.client && refresh.client_id !== params.client.client_id) {
			return;
		}
		await revokeGrantCredentials(refresh);
	}
}

function bearerTokenFromRequest(request: Request): string | null {
	const auth = request.headers.get('authorization') ?? '';
	const match = auth.match(/^Bearer\s+(.+)$/i);
	return match?.[1]?.trim() || null;
}

export async function authenticateOAuthMcpRequest(params: {
	admin: any;
	request: Request;
	resource: string;
	securityEventOptions?: SecurityEventLogOptions;
}): Promise<AuthenticatedOAuthMcpCaller> {
	const token = bearerTokenFromRequest(params.request);
	if (!token) {
		throw new OAuthConnectorError('Missing bearer token', 401, 'invalid_token');
	}

	const { data: accessData, error } = await params.admin
		.from('agent_oauth_access_tokens')
		.select('*')
		.eq('token_hash', hashSecret(token))
		.maybeSingle();
	if (error) throw new OAuthConnectorError('Failed to authenticate token', 500, 'server_error');
	if (!accessData) throw new OAuthConnectorError('Unknown bearer token', 401, 'invalid_token');

	const accessToken = accessData as AgentOAuthAccessTokenRecord;
	if (
		accessToken.resource !== params.resource ||
		accessToken.revoked_at ||
		new Date(accessToken.expires_at).getTime() <= Date.now()
	) {
		throw new OAuthConnectorError('Bearer token is expired or revoked', 401, 'invalid_token');
	}

	const [{ data: grantData }, { data: callerData }] = await Promise.all([
		params.admin
			.from('agent_oauth_grants')
			.select('*')
			.eq('id', accessToken.grant_id)
			.maybeSingle(),
		params.admin
			.from('external_agent_callers')
			.select('*')
			.eq('id', accessToken.external_agent_caller_id)
			.maybeSingle()
	]);

	if (!grantData || !callerData) {
		throw new OAuthConnectorError('OAuth grant is unavailable', 401, 'invalid_token');
	}
	const grant = mapGrantRecord(grantData as Record<string, unknown>);
	const caller = callerData as ExternalAgentCallerRecord;
	if (grant.status !== 'active' || caller.status !== 'trusted') {
		throw new OAuthConnectorError('OAuth grant is revoked', 403, 'insufficient_scope');
	}

	// Effective scope binds to the grant the token was minted under, clamped by
	// the token's own immutable scope string — NOT the caller row's policy. The
	// caller row is shared per client and overwritten on every re-consent, so
	// deriving scope from it would let an outstanding token silently assume a
	// later, broader consent (a read-only-era token becoming read_write). The
	// grant can still narrow live (revocation semantics), but a token can never
	// exceed the mode it was minted with.
	const tokenMode: AgentCallScope['mode'] = accessToken.scope
		.split(/\s+/)
		.includes('buildos.write')
		? 'read_write'
		: 'read_only';
	const scopeMode: AgentCallScope['mode'] =
		tokenMode === 'read_write' && grant.scope_mode === 'read_write'
			? 'read_write'
			: 'read_only';
	const scope: AgentCallScope = {
		mode: scopeMode,
		allowed_ops: grant.allowed_ops.filter((op) => scopeMode === 'read_write' || !isWriteOp(op)),
		...(Array.isArray(grant.allowed_project_ids)
			? { project_ids: grant.allowed_project_ids }
			: {})
	};
	const now = new Date().toISOString();
	await Promise.all([
		params.admin
			.from('agent_oauth_access_tokens')
			.update({ last_used_at: now })
			.eq('id', accessToken.id),
		params.admin.from('agent_oauth_grants').update({ last_used_at: now }).eq('id', grant.id),
		params.admin
			.from('external_agent_callers')
			.update({ last_used_at: now })
			.eq('id', caller.id)
	]);

	return { accessToken, grant, caller, scope };
}

export async function createMcpCallSession(params: {
	admin: any;
	caller: ExternalAgentCallerRecord;
	scope: AgentCallScope;
}): Promise<string> {
	const buildosAgent = await ensureUserBuildosAgent(params.admin, params.caller.user_id);
	const { data, error } = await params.admin
		.from('agent_call_sessions')
		.insert({
			user_id: params.caller.user_id,
			user_buildos_agent_id: buildosAgent.id,
			external_agent_caller_id: params.caller.id,
			direction: 'inbound',
			status: 'active',
			requested_scope: params.scope,
			granted_scope: params.scope,
			metadata: {
				transport: 'remote_mcp',
				connector_name: BUILDOS_CONNECTOR_PUBLIC_NAME,
				server_name: BUILDOS_MCP_SERVER_NAME
			}
		})
		.select('id')
		.single();

	if (error || !data?.id) {
		throw new OAuthConnectorError('Failed to create MCP call session', 500, 'server_error');
	}

	return data.id as string;
}

/**
 * Housekeeping: delete OAuth artifacts that are past their expiry. Lookups
 * already reject expired rows, so this only bounds table growth — it changes no
 * behavior. Meant to be called from the daily security-events-retention cron.
 *
 * IMPORTANT: refresh tokens are deleted ONLY when expired, never merely
 * used/revoked, so refresh-token reuse detection (family burn) keeps working for
 * the full lifetime of a token. Grants/clients are never reaped (audit trail).
 */
export async function reapExpiredOAuthArtifacts(admin: any): Promise<{
	authorization_codes: number;
	access_tokens: number;
	refresh_tokens: number;
}> {
	const nowIso = new Date().toISOString();
	const countOf = (result: { data?: unknown[] | null }): number =>
		Array.isArray(result?.data) ? result.data.length : 0;

	const [codes, accessTokens, refreshTokens] = await Promise.all([
		admin
			.from('agent_oauth_authorization_codes')
			.delete()
			.lt('expires_at', nowIso)
			.select('id'),
		admin.from('agent_oauth_access_tokens').delete().lt('expires_at', nowIso).select('id'),
		admin.from('agent_oauth_refresh_tokens').delete().lt('expires_at', nowIso).select('id')
	]);

	return {
		authorization_codes: countOf(codes),
		access_tokens: countOf(accessTokens),
		refresh_tokens: countOf(refreshTokens)
	};
}
