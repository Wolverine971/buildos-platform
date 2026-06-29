// apps/web/src/lib/server/agent-call/mcp-connector.service.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Spies for the two collaborators that touch the database. The connector test
// owns the MCP protocol layer (auth dispatch, response shaping, error codes);
// gateway execution and call-session creation have their own coverage, so we
// stub them here and keep the rest of each module real via importActual.
const gatewayMocks = vi.hoisted(() => ({
	executeBuildosAgentGatewayTool: vi.fn()
}));
const sessionMocks = vi.hoisted(() => ({
	createMcpCallSession: vi.fn()
}));

vi.mock('./external-tool-gateway', async (importActual) => {
	const actual = await importActual<typeof import('./external-tool-gateway')>();
	return {
		...actual,
		executeBuildosAgentGatewayTool: gatewayMocks.executeBuildosAgentGatewayTool
	};
});

vi.mock('./oauth-connector.service', async (importActual) => {
	const actual = await importActual<typeof import('./oauth-connector.service')>();
	return {
		...actual,
		createMcpCallSession: sessionMocks.createMcpCallSession
	};
});

import {
	handleBuildosMcpGet,
	handleBuildosMcpPost,
	isAllowedMcpOrigin
} from './mcp-connector.service';

const MCP_URL = new URL('https://build-os.com/mcp/buildos');
const STATIC_KEY_HEADER = { Authorization: 'Bearer boca_static_test_key' };
const WRITE_BUNDLE_TOOLS = [
	'create_onto_task',
	'update_onto_task',
	'create_onto_document',
	'update_onto_document'
];

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

/**
 * Admin stub where the OAuth access-token lookup misses and the static-key
 * fallback finds a trusted external_agent_caller carrying `policy`.
 */
function staticKeyAdmin(policy: Record<string, unknown>) {
	return makeAdmin({
		agent_oauth_access_tokens: { data: null, error: null },
		external_agent_callers: {
			data: {
				id: 'caller-1',
				user_id: 'user-1',
				provider: 'claude-code',
				caller_key: 'claude-code:local:test',
				status: 'trusted',
				policy
			},
			error: null
		}
	});
}

function mcpPost(
	admin: unknown,
	body: unknown,
	headers: Record<string, string> = {}
): Promise<Response> {
	return handleBuildosMcpPost({
		admin,
		request: new Request(MCP_URL.href, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...headers },
			body: typeof body === 'string' ? body : JSON.stringify(body)
		}),
		url: MCP_URL
	});
}

function mcpGet(admin: unknown, headers: Record<string, string> = {}): Promise<Response> {
	return handleBuildosMcpGet({
		admin,
		request: new Request(MCP_URL.href, { method: 'GET', headers }),
		url: MCP_URL
	});
}

function mcpPostProfile(
	admin: unknown,
	body: unknown,
	profile: string,
	headers: Record<string, string> = {}
): Promise<Response> {
	const url = new URL(`https://build-os.com/mcp/buildos?profile=${profile}`);
	return handleBuildosMcpPost({
		admin,
		request: new Request(url.href, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...headers },
			body: JSON.stringify(body)
		}),
		url
	});
}

/** Admin stub where both the OAuth and static-key lookups miss. */
function missAdmin() {
	return makeAdmin({
		agent_oauth_access_tokens: { data: null, error: null },
		external_agent_callers: { data: null, error: null }
	});
}

describe('BuildOS MCP connector endpoint helpers', () => {
	beforeEach(() => {
		gatewayMocks.executeBuildosAgentGatewayTool.mockReset();
		sessionMocks.createMcpCallSession.mockReset();
		sessionMocks.createMcpCallSession.mockResolvedValue('session-test');
	});

	describe('authentication', () => {
		it('returns an OAuth challenge from an unauthenticated GET', async () => {
			const response = await mcpGet(missAdmin());

			expect(response.status).toBe(401);
			expect(response.headers.get('WWW-Authenticate')).toContain(
				'https://build-os.com/.well-known/oauth-protected-resource/mcp/buildos'
			);
			expect(response.headers.get('WWW-Authenticate')).toContain(
				'scope="buildos.read offline_access"'
			);
		});

		it('returns 405 for an authenticated GET because v1 offers no SSE stream', async () => {
			const response = await mcpGet(
				staticKeyAdmin({ scope_mode: 'read_only' }),
				STATIC_KEY_HEADER
			);

			expect(response.status).toBe(405);
			expect(response.headers.get('Allow')).toContain('POST');
		});

		it('returns an OAuth challenge for JSON-RPC calls without a bearer token', async () => {
			const response = await mcpPost({}, { jsonrpc: '2.0', id: 1, method: 'tools/list' });

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
			const response = await mcpPost(
				staticKeyAdmin({ scope_mode: 'read_only' }),
				{ jsonrpc: '2.0', id: 7, method: 'tools/list' },
				STATIC_KEY_HEADER
			);

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

			const response = await mcpPost(
				admin,
				{ jsonrpc: '2.0', id: 8, method: 'tools/list' },
				{ Authorization: 'Bearer boca_unknown_key' }
			);

			expect(response.status).toBe(401);
			const body = await response.json();
			expect(body.error.code).toBe(-32001);
		});
	});

	describe('tools/call', () => {
		it('returns content + structuredContent for a successful read tool and wires the gateway correctly', async () => {
			const result = { ok: true, projects: [{ id: 'p1', name: 'Demo' }] };
			gatewayMocks.executeBuildosAgentGatewayTool.mockResolvedValue(result);

			const response = await mcpPost(
				staticKeyAdmin({ scope_mode: 'read_only' }),
				{
					jsonrpc: '2.0',
					id: 10,
					method: 'tools/call',
					params: { name: 'list_onto_projects', arguments: { limit: 5 } }
				},
				STATIC_KEY_HEADER
			);

			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body.error).toBeUndefined();
			expect(body.result.content).toEqual([
				{ type: 'text', text: JSON.stringify(result, null, 2) }
			]);
			expect(body.result.structuredContent).toEqual(result);
			expect(body.result.isError).toBeUndefined();

			// A call session is created and the gateway is invoked with the scoped caller.
			expect(sessionMocks.createMcpCallSession).toHaveBeenCalledTimes(1);
			expect(gatewayMocks.executeBuildosAgentGatewayTool).toHaveBeenCalledTimes(1);
			const callArgs = gatewayMocks.executeBuildosAgentGatewayTool.mock.calls[0][0];
			expect(callArgs.toolName).toBe('list_onto_projects');
			expect(callArgs.arguments).toEqual({ limit: 5 });
			expect(callArgs.userId).toBe('user-1');
			expect(callArgs.callerId).toBe('caller-1');
			expect(callArgs.callSessionId).toBe('session-test');
			expect(callArgs.scope.mode).toBe('read_only');
		});

		it('sets isError when the gateway returns a tool-level failure', async () => {
			gatewayMocks.executeBuildosAgentGatewayTool.mockResolvedValue({
				ok: false,
				error: { code: 'NOT_FOUND', message: 'missing' }
			});

			const response = await mcpPost(
				staticKeyAdmin({ scope_mode: 'read_only' }),
				{
					jsonrpc: '2.0',
					id: 11,
					method: 'tools/call',
					params: { name: 'get_onto_project', arguments: { project_id: 'x' } }
				},
				STATIC_KEY_HEADER
			);

			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body.result.isError).toBe(true);
			expect(body.result.structuredContent).toEqual({
				ok: false,
				error: { code: 'NOT_FOUND', message: 'missing' }
			});
		});

		it('rejects tools/call without a tool name as an invalid params error', async () => {
			const response = await mcpPost(
				staticKeyAdmin({ scope_mode: 'read_only' }),
				{ jsonrpc: '2.0', id: 12, method: 'tools/call', params: {} },
				STATIC_KEY_HEADER
			);

			expect(response.status).toBe(400);
			const body = await response.json();
			expect(body.error.code).toBe(-32602);
			expect(gatewayMocks.executeBuildosAgentGatewayTool).not.toHaveBeenCalled();
		});
	});

	describe('scope-based tool visibility', () => {
		it('hides the write bundle from tools/list under a read-only grant', async () => {
			const response = await mcpPost(
				staticKeyAdmin({ scope_mode: 'read_only' }),
				{ jsonrpc: '2.0', id: 20, method: 'tools/list' },
				STATIC_KEY_HEADER
			);

			expect(response.status).toBe(200);
			const body = await response.json();
			const names: string[] = body.result.tools.map((tool: { name: string }) => tool.name);

			for (const writeTool of WRITE_BUNDLE_TOOLS) {
				expect(names).not.toContain(writeTool);
			}
			// Every exposed tool is annotated read-only under a read-only grant.
			for (const tool of body.result.tools) {
				expect(tool.annotations.readOnlyHint).toBe(true);
			}
		});

		it('exposes the default write bundle under a read-write grant', async () => {
			const response = await mcpPost(
				staticKeyAdmin({ scope_mode: 'read_write' }),
				{ jsonrpc: '2.0', id: 21, method: 'tools/list' },
				STATIC_KEY_HEADER
			);

			expect(response.status).toBe(200);
			const body = await response.json();
			const names: string[] = body.result.tools.map((tool: { name: string }) => tool.name);

			for (const writeTool of WRITE_BUNDLE_TOOLS) {
				expect(names).toContain(writeTool);
			}
		});
	});

	describe('JSON-RPC protocol errors', () => {
		it('returns -32700 on an unparseable JSON body', async () => {
			const response = await mcpPost({}, '{ not valid json');

			expect(response.status).toBe(400);
			const body = await response.json();
			expect(body.error.code).toBe(-32700);
		});

		it('rejects JSON-RPC batch requests with -32600', async () => {
			const response = await mcpPost({}, [{ jsonrpc: '2.0', id: 1, method: 'tools/list' }]);

			expect(response.status).toBe(400);
			const body = await response.json();
			expect(body.error.code).toBe(-32600);
		});

		it('rejects a request with no method with -32600', async () => {
			const response = await mcpPost({}, { jsonrpc: '2.0', id: 1 });

			expect(response.status).toBe(400);
			const body = await response.json();
			expect(body.error.code).toBe(-32600);
		});

		it('returns -32601 for an authenticated unknown method', async () => {
			const response = await mcpPost(
				staticKeyAdmin({ scope_mode: 'read_only' }),
				{ jsonrpc: '2.0', id: 14, method: 'buildos/not_a_real_method' },
				STATIC_KEY_HEADER
			);

			expect(response.status).toBe(400);
			const body = await response.json();
			expect(body.error.code).toBe(-32601);
		});

		it('echoes a supported requested protocolVersion on initialize', async () => {
			const response = await mcpPost(
				staticKeyAdmin({ scope_mode: 'read_only' }),
				{
					jsonrpc: '2.0',
					id: 20,
					method: 'initialize',
					params: { protocolVersion: '2025-03-26' }
				},
				STATIC_KEY_HEADER
			);

			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body.result.protocolVersion).toBe('2025-03-26');
			expect(body.result.capabilities.resources).toEqual({ listChanged: false });
		});

		it('falls back to the server protocolVersion when the requested one is unsupported', async () => {
			const response = await mcpPost(
				staticKeyAdmin({ scope_mode: 'read_only' }),
				{
					jsonrpc: '2.0',
					id: 21,
					method: 'initialize',
					params: { protocolVersion: '1999-01-01' }
				},
				STATIC_KEY_HEADER
			);

			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body.result.protocolVersion).toBe('2025-06-18');
		});

		it('answers ping with an empty result', async () => {
			const response = await mcpPost(
				staticKeyAdmin({ scope_mode: 'read_only' }),
				{ jsonrpc: '2.0', id: 22, method: 'ping' },
				STATIC_KEY_HEADER
			);

			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body.result).toEqual({});
		});

		it('answers resources/templates/list with an empty list', async () => {
			const response = await mcpPost(
				staticKeyAdmin({ scope_mode: 'read_only' }),
				{ jsonrpc: '2.0', id: 23, method: 'resources/templates/list' },
				STATIC_KEY_HEADER
			);

			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body.result.resourceTemplates).toEqual([]);
		});

		it('rejects an invalid tools/list cursor with -32602', async () => {
			const response = await mcpPost(
				staticKeyAdmin({ scope_mode: 'read_only' }),
				{
					jsonrpc: '2.0',
					id: 24,
					method: 'tools/list',
					params: { cursor: '!!!not-base64!!!' }
				},
				STATIC_KEY_HEADER
			);

			expect(response.status).toBe(400);
			const body = await response.json();
			expect(body.error.code).toBe(-32602);
		});

		it('accepts notifications/initialized with 202 and an empty body before auth', async () => {
			const response = await mcpPost(
				{},
				{ jsonrpc: '2.0', method: 'notifications/initialized' }
			);

			expect(response.status).toBe(202);
			expect(await response.text()).toBe('');
			expect(gatewayMocks.executeBuildosAgentGatewayTool).not.toHaveBeenCalled();
		});
	});

	describe('transport hardening', () => {
		it('echoes an allowed browser Origin and exposes MCP headers', async () => {
			const response = await mcpPost(
				staticKeyAdmin({ scope_mode: 'read_only' }),
				{ jsonrpc: '2.0', id: 30, method: 'tools/list' },
				{ ...STATIC_KEY_HEADER, Origin: 'https://app.build-os.com' }
			);

			expect(response.status).toBe(200);
			expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
				'https://app.build-os.com'
			);
			expect(response.headers.get('Access-Control-Expose-Headers')).toContain(
				'WWW-Authenticate'
			);
			expect(response.headers.get('Vary')).toBe('Origin');
		});

		it('rejects a disallowed browser Origin with 403 and no ACAO header', async () => {
			const response = await mcpPost(
				staticKeyAdmin({ scope_mode: 'read_only' }),
				{ jsonrpc: '2.0', id: 31, method: 'tools/list' },
				{ ...STATIC_KEY_HEADER, Origin: 'https://evil.example.com' }
			);

			expect(response.status).toBe(403);
			expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
			const body = await response.json();
			expect(body.error.code).toBe(-32600);
			// The attacker never reaches the auth/gateway layer.
			expect(gatewayMocks.executeBuildosAgentGatewayTool).not.toHaveBeenCalled();
		});

		it('rejects a non-JSON Content-Type with 415', async () => {
			const response = await mcpPost(
				{},
				{ jsonrpc: '2.0', id: 32, method: 'tools/list' },
				{ 'Content-Type': 'text/plain' }
			);

			expect(response.status).toBe(415);
		});

		it('rejects an Accept header that excludes json and event-stream with 406', async () => {
			const response = await mcpPost(
				{},
				{ jsonrpc: '2.0', id: 33, method: 'tools/list' },
				{ Accept: 'text/plain' }
			);

			expect(response.status).toBe(406);
		});

		it('rejects an unsupported MCP-Protocol-Version with 400', async () => {
			const response = await mcpPost(
				{},
				{ jsonrpc: '2.0', id: 34, method: 'tools/list' },
				{ 'MCP-Protocol-Version': '1999-01-01' }
			);

			expect(response.status).toBe(400);
			const body = await response.json();
			expect(body.error.code).toBe(-32600);
		});

		it('accepts a supported MCP-Protocol-Version', async () => {
			const response = await mcpPost(
				staticKeyAdmin({ scope_mode: 'read_only' }),
				{ jsonrpc: '2.0', id: 35, method: 'tools/list' },
				{ ...STATIC_KEY_HEADER, 'MCP-Protocol-Version': '2025-06-18' }
			);

			expect(response.status).toBe(200);
		});
	});

	describe('tool profiles', () => {
		const DISCOVERY_TOOLS = ['skill_load', 'tool_search', 'tool_schema'];

		it('hides discovery tools in the default (general) profile', async () => {
			const response = await mcpPost(
				staticKeyAdmin({ scope_mode: 'read_only' }),
				{ jsonrpc: '2.0', id: 40, method: 'tools/list' },
				STATIC_KEY_HEADER
			);

			const names: string[] = (await response.json()).result.tools.map(
				(tool: { name: string }) => tool.name
			);
			for (const discovery of DISCOVERY_TOOLS) {
				expect(names).not.toContain(discovery);
			}
			expect(names.length).toBeGreaterThan(0);
		});

		it('exposes discovery tools in the local_admin profile', async () => {
			const response = await mcpPostProfile(
				staticKeyAdmin({ scope_mode: 'read_only' }),
				{ jsonrpc: '2.0', id: 41, method: 'tools/list' },
				'local_admin',
				STATIC_KEY_HEADER
			);

			const names: string[] = (await response.json()).result.tools.map(
				(tool: { name: string }) => tool.name
			);
			for (const discovery of DISCOVERY_TOOLS) {
				expect(names).toContain(discovery);
			}
		});

		it('exposes only search and fetch in the chatgpt_data_app profile', async () => {
			const response = await mcpPostProfile(
				staticKeyAdmin({ scope_mode: 'read_write' }),
				{ jsonrpc: '2.0', id: 42, method: 'tools/list' },
				'chatgpt_data_app',
				STATIC_KEY_HEADER
			);

			const names: string[] = (await response.json()).result.tools.map(
				(tool: { name: string }) => tool.name
			);
			expect(names).toEqual(['search', 'fetch']);
		});

		it('search transforms gateway results into the ChatGPT result shape', async () => {
			gatewayMocks.executeBuildosAgentGatewayTool.mockResolvedValue({
				query: 'roadmap',
				results: [
					{
						type: 'task',
						id: 't1',
						title: 'Roadmap task',
						snippet: 'do the thing',
						project_id: 'p1'
					}
				]
			});

			const response = await mcpPostProfile(
				staticKeyAdmin({ scope_mode: 'read_only' }),
				{
					jsonrpc: '2.0',
					id: 43,
					method: 'tools/call',
					params: { name: 'search', arguments: { query: 'roadmap' } }
				},
				'chatgpt_data_app',
				STATIC_KEY_HEADER
			);

			const body = await response.json();
			expect(body.result.structuredContent.results).toEqual([
				{
					id: 'task:t1',
					title: 'Roadmap task',
					url: 'https://build-os.com/projects/p1',
					text: 'do the thing'
				}
			]);
			const callArgs = gatewayMocks.executeBuildosAgentGatewayTool.mock.calls[0][0];
			expect(callArgs.scope.mode).toBe('read_only');
		});

		it('fetch normalizes a gateway get result by composite id', async () => {
			gatewayMocks.executeBuildosAgentGatewayTool.mockResolvedValue({
				task: {
					id: 't1',
					project_id: 'p1',
					title: 'Roadmap task',
					description: 'full body',
					state_key: 'todo',
					type_key: 'task.default',
					updated_at: '2026-06-12T00:00:00Z'
				}
			});

			const response = await mcpPostProfile(
				staticKeyAdmin({ scope_mode: 'read_only' }),
				{
					jsonrpc: '2.0',
					id: 44,
					method: 'tools/call',
					params: { name: 'fetch', arguments: { id: 'task:t1' } }
				},
				'chatgpt_data_app',
				STATIC_KEY_HEADER
			);

			const body = await response.json();
			expect(body.result.structuredContent).toMatchObject({
				id: 'task:t1',
				title: 'Roadmap task',
				text: 'full body',
				url: 'https://build-os.com/projects/p1',
				metadata: { type: 'task', project_id: 'p1', state_key: 'todo' }
			});
			const callArgs = gatewayMocks.executeBuildosAgentGatewayTool.mock.calls[0][0];
			expect(callArgs.arguments).toEqual({ task_id: 't1' });
		});

		it('rejects a malformed fetch id without calling the gateway', async () => {
			const response = await mcpPostProfile(
				staticKeyAdmin({ scope_mode: 'read_only' }),
				{
					jsonrpc: '2.0',
					id: 45,
					method: 'tools/call',
					params: { name: 'fetch', arguments: { id: 'not-a-valid-id' } }
				},
				'chatgpt_data_app',
				STATIC_KEY_HEADER
			);

			const body = await response.json();
			expect(body.result.isError).toBe(true);
			expect(body.result.structuredContent.error.code).toBe('VALIDATION_ERROR');
			expect(gatewayMocks.executeBuildosAgentGatewayTool).not.toHaveBeenCalled();
		});

		it('denies non-search/fetch tools in the data profile even with a write grant', async () => {
			const response = await mcpPostProfile(
				staticKeyAdmin({ scope_mode: 'read_write' }),
				{
					jsonrpc: '2.0',
					id: 46,
					method: 'tools/call',
					params: {
						name: 'create_onto_task',
						arguments: { project_id: 'p1', title: 'x' }
					}
				},
				'chatgpt_data_app',
				STATIC_KEY_HEADER
			);

			const body = await response.json();
			expect(body.result.isError).toBe(true);
			expect(body.result.structuredContent.error.code).toBe('FORBIDDEN');
			expect(gatewayMocks.executeBuildosAgentGatewayTool).not.toHaveBeenCalled();
		});
	});
});

describe('isAllowedMcpOrigin', () => {
	const server = 'https://build-os.com';

	it('allows an absent Origin (server-side cloud caller)', () => {
		expect(isAllowedMcpOrigin(null, server)).toBe(true);
	});

	it('allows build-os.com and its subdomains over https', () => {
		expect(isAllowedMcpOrigin('https://build-os.com', server)).toBe(true);
		expect(isAllowedMcpOrigin('https://app.build-os.com', server)).toBe(true);
		expect(isAllowedMcpOrigin('https://claude.ai', server)).toBe(false);
	});

	it('rejects look-alike hosts and non-https origins', () => {
		expect(isAllowedMcpOrigin('https://build-os.com.evil.com', server)).toBe(false);
		expect(isAllowedMcpOrigin('https://evilbuild-os.com', server)).toBe(false);
		expect(isAllowedMcpOrigin('http://build-os.com', server)).toBe(false);
	});

	it('allows localhost browser clients only when the server runs on loopback', () => {
		expect(isAllowedMcpOrigin('http://localhost:6274', 'http://localhost:5173')).toBe(true);
		expect(isAllowedMcpOrigin('http://localhost:6274', server)).toBe(false);
	});
});
