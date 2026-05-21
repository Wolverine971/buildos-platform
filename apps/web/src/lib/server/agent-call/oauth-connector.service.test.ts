// apps/web/src/lib/server/agent-call/oauth-connector.service.test.ts
import { describe, expect, it } from 'vitest';
import {
	isOAuthRedirectUriAllowed,
	mcpResourceUrl,
	OAuthConnectorError,
	parseOAuthScopes,
	protectedResourceMetadataUrl,
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

	it('rejects unsupported OAuth scopes', () => {
		expect(() => parseOAuthScopes('buildos.delete')).toThrow(OAuthConnectorError);
	});

	it('builds canonical MCP resource metadata URLs', () => {
		expect(mcpResourceUrl('https://build-os.com')).toBe('https://build-os.com/mcp/buildos');
		expect(protectedResourceMetadataUrl('https://build-os.com')).toBe(
			'https://build-os.com/.well-known/oauth-protected-resource/mcp/buildos'
		);
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
