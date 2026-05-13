// apps/web/src/lib/server/agent-call/mcp-connector.service.test.ts
import { describe, expect, it } from 'vitest';
import { handleBuildosMcpGet, handleBuildosMcpPost } from './mcp-connector.service';

describe('BuildOS MCP connector endpoint helpers', () => {
	it('returns an OAuth challenge from GET', async () => {
		const response = handleBuildosMcpGet(new URL('https://build-os.com/mcp/buildos'));

		expect(response.status).toBe(401);
		expect(response.headers.get('WWW-Authenticate')).toContain(
			'https://build-os.com/.well-known/oauth-protected-resource/mcp/buildos'
		);
		expect(response.headers.get('WWW-Authenticate')).toContain('scope="buildos.read"');
	});

	it('returns an OAuth challenge for JSON-RPC calls without a bearer token', async () => {
		const response = await handleBuildosMcpPost({
			admin: {},
			request: new Request('https://build-os.com/mcp/buildos', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 1,
					method: 'tools/list'
				})
			}),
			url: new URL('https://build-os.com/mcp/buildos')
		});

		expect(response.status).toBe(401);
		expect(response.headers.get('WWW-Authenticate')).toContain('scope="buildos.read"');
		const body = await response.json();
		expect(body.error.code).toBe(-32001);
	});
});
