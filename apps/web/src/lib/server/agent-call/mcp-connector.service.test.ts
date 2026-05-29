// apps/web/src/lib/server/agent-call/mcp-connector.service.test.ts
import { describe, expect, it } from 'vitest';
import { handleBuildosMcpGet, handleBuildosMcpPost } from './mcp-connector.service';

/**
 * Minimal chainable Supabase admin stub. Each `from(table)` resolves to the
 * configured result for that table, supporting `.select().eq().maybeSingle()`
 * and `.update().eq()` (awaited directly).
 */
function makeAdmin(results: Record<string, { data: unknown; error: unknown }>) {
	return {
		from(table: string) {
			const result = results[table] ?? { data: null, error: null };
			const builder: Record<string, unknown> = {
				select: () => builder,
				update: () => builder,
				insert: () => builder,
				eq: () => builder,
				maybeSingle: async () => result,
				single: async () => result,
				then: (resolve: (value: unknown) => unknown) => resolve(result)
			};
			return builder;
		}
	};
}

describe('BuildOS MCP connector endpoint helpers', () => {
	it('returns an OAuth challenge from GET', async () => {
		const response = handleBuildosMcpGet(new URL('https://build-os.com/mcp/buildos'));

		expect(response.status).toBe(401);
		expect(response.headers.get('WWW-Authenticate')).toContain(
			'https://build-os.com/.well-known/oauth-protected-resource/mcp/buildos'
		);
		expect(response.headers.get('WWW-Authenticate')).toContain(
			'scope="buildos.read offline_access"'
		);
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
		expect(response.headers.get('WWW-Authenticate')).toContain(
			'scope="buildos.read offline_access"'
		);
		const body = await response.json();
		expect(body.error.code).toBe(-32001);
	});

	it('authenticates a static BuildOS agent key (boca_) that is unknown to OAuth', async () => {
		// OAuth lookup misses (no access token row); the static-key fallback finds a
		// trusted external_agent_caller and tools/list succeeds.
		const admin = makeAdmin({
			agent_oauth_access_tokens: { data: null, error: null },
			external_agent_callers: {
				data: {
					id: 'caller-1',
					user_id: 'user-1',
					provider: 'claude-code',
					caller_key: 'claude-code:local:test',
					status: 'trusted',
					policy: { scope_mode: 'read_only' }
				},
				error: null
			}
		});

		const response = await handleBuildosMcpPost({
			admin,
			request: new Request('https://build-os.com/mcp/buildos', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: 'Bearer boca_static_test_key'
				},
				body: JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/list' })
			}),
			url: new URL('https://build-os.com/mcp/buildos')
		});

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.error).toBeUndefined();
		expect(Array.isArray(body.result.tools)).toBe(true);
		expect(body.result.tools.length).toBeGreaterThan(0);
	});

	it('still returns an OAuth challenge when both OAuth and static-key auth miss', async () => {
		const admin = makeAdmin({
			agent_oauth_access_tokens: { data: null, error: null },
			external_agent_callers: { data: null, error: null }
		});

		const response = await handleBuildosMcpPost({
			admin,
			request: new Request('https://build-os.com/mcp/buildos', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: 'Bearer boca_unknown_key'
				},
				body: JSON.stringify({ jsonrpc: '2.0', id: 8, method: 'tools/list' })
			}),
			url: new URL('https://build-os.com/mcp/buildos')
		});

		expect(response.status).toBe(401);
		const body = await response.json();
		expect(body.error.code).toBe(-32001);
	});
});
