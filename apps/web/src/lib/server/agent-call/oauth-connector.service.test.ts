// apps/web/src/lib/server/agent-call/oauth-connector.service.test.ts
import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';
import {
	authenticateOAuthMcpRequest,
	BUILDOS_OAUTH_READ_WRITE_OPS,
	isOAuthRedirectUriAllowed,
	mcpResourceUrl,
	normalizeOAuthResource,
	OAuthConnectorError,
	parseOAuthScopes,
	protectedResourceMetadataUrl,
	scopesForOAuthApproval,
	scopeString
} from './oauth-connector.service';

describe('OAuth connector helpers', () => {
	it('defaults OAuth requests to read-only access with refresh support', () => {
		expect(parseOAuthScopes(null)).toEqual(['buildos.read', 'offline_access']);
	});

	it('normalizes scope strings in BuildOS order', () => {
		const scopes = parseOAuthScopes('offline_access buildos.write buildos.read');

		expect(scopeString(scopes)).toBe('buildos.read buildos.write offline_access');
	});

	it('grants project create and update in the OAuth read/write bundle', () => {
		expect(BUILDOS_OAUTH_READ_WRITE_OPS).toEqual(
			expect.arrayContaining(['onto.project.create', 'onto.project.update'])
		);
	});

	it('rejects unsupported OAuth scopes', () => {
		expect(() => parseOAuthScopes('buildos.delete')).toThrow(OAuthConnectorError);
	});

	it('never adds write access when the client did not request it', () => {
		expect(
			scopesForOAuthApproval(['buildos.read', 'offline_access'], 'read_write')
		).toEqual(['buildos.read', 'offline_access']);
	});

	it('removes requested write access when the user approves read-only access', () => {
		expect(
			scopesForOAuthApproval(
				['buildos.read', 'buildos.write', 'offline_access'],
				'read_only'
			)
		).toEqual(['buildos.read', 'offline_access']);
	});

	it('builds canonical MCP resource metadata URLs', () => {
		expect(mcpResourceUrl('https://build-os.com')).toBe('https://build-os.com/mcp/buildos');
		expect(protectedResourceMetadataUrl('https://build-os.com')).toBe(
			'https://build-os.com/.well-known/oauth-protected-resource/mcp/buildos'
		);
	});

	it('accepts the read-only ChatGPT profile resource and binds it to the canonical audience', () => {
		expect(
			normalizeOAuthResource(
				'https://build-os.com/mcp/buildos?profile=chatgpt_data_app',
				'https://build-os.com'
			)
		).toBe('https://build-os.com/mcp/buildos');
	});

	it('rejects unrecognized MCP resource profiles', () => {
		expect(() =>
			normalizeOAuthResource(
				'https://build-os.com/mcp/buildos?profile=read_write',
				'https://build-os.com'
			)
		).toThrow(OAuthConnectorError);
	});

	it('allows OAuth native-app loopback redirects to use runtime ports', () => {
		expect(
			isOAuthRedirectUriAllowed(
				['http://localhost/callback', 'http://127.0.0.1/callback'],
				'http://localhost:58233/callback'
			)
		).toBe(true);

		expect(
			isOAuthRedirectUriAllowed(
				['http://localhost/callback', 'http://127.0.0.1/callback'],
				'http://127.0.0.1:58233/callback'
			)
		).toBe(true);
	});

	it('does not let loopback redirect matching change host or path', () => {
		expect(
			isOAuthRedirectUriAllowed(
				['http://localhost/callback'],
				'http://127.0.0.1:58233/callback'
			)
		).toBe(false);

		expect(
			isOAuthRedirectUriAllowed(['http://localhost/callback'], 'http://localhost:58233/other')
		).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Token-authentication scope binding. The scope handed to the gateway must come
// from the grant the token was minted under, clamped by the token's immutable
// scope string — never from the shared caller row's policy, which is
// overwritten on every re-consent for the same client.
// ---------------------------------------------------------------------------

const RESOURCE = 'https://build-os.com/mcp/buildos';
const TOKEN = 'bo_at_test_token_value';

function sha256(value: string): string {
	return createHash('sha256').update(value).digest('hex');
}

function fakeOAuthAdmin(rows: {
	token: Record<string, unknown>;
	grant: Record<string, unknown>;
	caller: Record<string, unknown>;
}) {
	return {
		from(table: string) {
			const data =
				table === 'agent_oauth_access_tokens'
					? rows.token
					: table === 'agent_oauth_grants'
						? rows.grant
						: rows.caller;
			const builder = {
				select: () => builder,
				update: () => builder,
				eq: () => builder,
				maybeSingle: async () => ({ data, error: null }),
				// Update chains are awaited directly; make the builder thenable.
				then: (resolve: (value: { data: null; error: null }) => void) =>
					resolve({ data: null, error: null })
			};
			return builder;
		}
	};
}

function baseRows(overrides: {
	tokenScope: string;
	grant?: Record<string, unknown>;
	callerPolicy?: Record<string, unknown>;
}) {
	const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
	return {
		token: {
			id: 'token-1',
			grant_id: 'grant-1',
			external_agent_caller_id: 'caller-1',
			token_hash: sha256(TOKEN),
			resource: RESOURCE,
			scope: overrides.tokenScope,
			expires_at: future,
			revoked_at: null
		},
		grant: {
			id: 'grant-1',
			status: 'active',
			scope_mode: 'read_only',
			allowed_ops: ['onto.task.get', 'onto.task.list'],
			allowed_project_ids: ['project-a'],
			...(overrides.grant ?? {})
		},
		caller: {
			id: 'caller-1',
			user_id: 'user-1',
			status: 'trusted',
			policy: overrides.callerPolicy ?? {
				scope_mode: 'read_write',
				allowed_ops: ['onto.task.create'],
				allowed_project_ids: null
			}
		}
	};
}

function requestWithToken(): Request {
	return new Request(RESOURCE, {
		method: 'POST',
		headers: { authorization: `Bearer ${TOKEN}` }
	});
}

describe('authenticateOAuthMcpRequest scope binding', () => {
	it('derives scope from the grant, ignoring a broader caller policy', async () => {
		// Caller policy says read_write/unscoped (as after a later re-consent);
		// the grant this token belongs to is read-only on one project.
		const admin = fakeOAuthAdmin(baseRows({ tokenScope: 'buildos.read offline_access' }));

		const auth = await authenticateOAuthMcpRequest({
			admin,
			request: requestWithToken(),
			resource: RESOURCE
		});

		expect(auth.scope.mode).toBe('read_only');
		expect(auth.scope.allowed_ops).toEqual(['onto.task.get', 'onto.task.list']);
		expect(auth.scope.project_ids).toEqual(['project-a']);
	});

	it('never grants write mode to a token minted without buildos.write', async () => {
		// Grant later widened to read_write, but this token predates the widening.
		const admin = fakeOAuthAdmin(
			baseRows({
				tokenScope: 'buildos.read offline_access',
				grant: {
					scope_mode: 'read_write',
					allowed_ops: ['onto.task.get', 'onto.task.create'],
					allowed_project_ids: null
				}
			})
		);

		const auth = await authenticateOAuthMcpRequest({
			admin,
			request: requestWithToken(),
			resource: RESOURCE
		});

		expect(auth.scope.mode).toBe('read_only');
		expect(auth.scope.allowed_ops).toEqual(['onto.task.get']);
		expect(auth.scope.project_ids).toBeUndefined();
	});

	it('clamps a write-minted token when the grant has been narrowed to read-only', async () => {
		const admin = fakeOAuthAdmin(
			baseRows({
				tokenScope: 'buildos.read buildos.write offline_access',
				grant: {
					scope_mode: 'read_only',
					allowed_ops: ['onto.task.get', 'onto.task.create'],
					allowed_project_ids: null
				}
			})
		);

		const auth = await authenticateOAuthMcpRequest({
			admin,
			request: requestWithToken(),
			resource: RESOURCE
		});

		expect(auth.scope.mode).toBe('read_only');
		expect(auth.scope.allowed_ops).toEqual(['onto.task.get']);
	});

	it('keeps write mode when both the token and the grant allow it', async () => {
		const admin = fakeOAuthAdmin(
			baseRows({
				tokenScope: 'buildos.read buildos.write offline_access',
				grant: {
					scope_mode: 'read_write',
					allowed_ops: ['onto.task.get', 'onto.task.create'],
					allowed_project_ids: ['project-a']
				}
			})
		);

		const auth = await authenticateOAuthMcpRequest({
			admin,
			request: requestWithToken(),
			resource: RESOURCE
		});

		expect(auth.scope.mode).toBe('read_write');
		expect(auth.scope.allowed_ops).toEqual(['onto.task.get', 'onto.task.create']);
		expect(auth.scope.project_ids).toEqual(['project-a']);
	});
});
