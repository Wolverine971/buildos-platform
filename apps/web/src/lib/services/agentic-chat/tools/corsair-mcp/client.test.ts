// apps/web/src/lib/services/agentic-chat/tools/corsair-mcp/client.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);

vi.mock('$env/dynamic/private', () => ({
	env: mockEnv
}));

import { callCorsairMcpTool, listCorsairMcpTools } from './client';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
	return new Response(JSON.stringify(body), {
		status: init.status ?? 200,
		headers: {
			'content-type': 'application/json',
			...(init.headers as Record<string, string> | undefined)
		}
	});
}

function configuredEnv(overrides: Record<string, string | undefined> = {}) {
	return {
		CORSAIR_MCP_ENABLED: 'true',
		CORSAIR_MCP_URL: 'https://api.corsair.dev/mcp/example?tenantId=test',
		CORSAIR_MCP_ACCESS_TOKEN: 'corsair-token',
		...overrides
	};
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('listCorsairMcpTools', () => {
	it('initializes a session and returns advertised tools', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				jsonResponse(
					{
						jsonrpc: '2.0',
						id: '1',
						result: { serverInfo: { name: 'corsair' } }
					},
					{ headers: { 'mcp-session-id': 'session-1' } }
				)
			)
			.mockResolvedValueOnce(
				jsonResponse({
					jsonrpc: '2.0',
					id: '2',
					result: {
						tools: [
							{
								name: 'search_contacts',
								description: 'Search contacts',
								inputSchema: { type: 'object', properties: {} }
							}
						]
					}
				})
			);
		const fetchFn = fetchMock as unknown as typeof fetch;

		const result = await listCorsairMcpTools({
			env: configuredEnv(),
			fetchFn
		});

		expect(result.status).toBe('ok');
		expect(result.tools).toEqual([
			expect.objectContaining({
				name: 'search_contacts',
				description: 'Search contacts'
			})
		]);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		const firstInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
		const secondInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
		expect(firstInit.headers).toMatchObject({
			Authorization: 'Bearer corsair-token',
			'MCP-Protocol-Version': '2025-06-18'
		});
		expect(secondInit.headers).toMatchObject({
			'mcp-session-id': 'session-1'
		});
		expect(JSON.parse(String(secondInit.body))).toMatchObject({
			method: 'tools/list'
		});
	});

	it('returns OAuth metadata when Corsair requires authentication', async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes('.well-known/oauth-protected-resource')) {
				return jsonResponse({
					resource: 'https://api.corsair.dev/mcp/example?tenantId=test',
					authorization_servers: ['https://api.corsair.dev/mcp/example']
				});
			}

			return jsonResponse(
				{ error: 'Unauthorized' },
				{
					status: 401,
					headers: {
						'www-authenticate':
							'Bearer realm="Corsair", resource_metadata="https://api.corsair.dev/.well-known/oauth-protected-resource/mcp/example?tenantId=test"'
					}
				}
			);
		});
		const fetchFn = fetchMock as unknown as typeof fetch;

		const result = await listCorsairMcpTools({
			env: configuredEnv({ CORSAIR_MCP_ACCESS_TOKEN: '' }),
			fetchFn
		});

		expect(result.status).toBe('auth_required');
		expect(result.auth).toMatchObject({
			resource: 'https://api.corsair.dev/mcp/example?tenantId=test',
			authorizationServers: ['https://api.corsair.dev/mcp/example']
		});
	});
});

describe('callCorsairMcpTool', () => {
	it('calls the selected remote MCP tool with arguments', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				jsonResponse(
					{
						jsonrpc: '2.0',
						id: '1',
						result: { serverInfo: { name: 'corsair' } }
					},
					{ headers: { 'mcp-session-id': 'session-1' } }
				)
			)
			.mockResolvedValueOnce(
				jsonResponse({
					jsonrpc: '2.0',
					id: '2',
					result: {
						content: [{ type: 'text', text: 'done' }],
						structuredContent: { ok: true }
					}
				})
			);
		const fetchFn = fetchMock as unknown as typeof fetch;

		const result = await callCorsairMcpTool(
			{
				name: 'search_contacts',
				arguments: { query: 'Wayne' },
				reason: 'User asked for a contact lookup.'
			},
			{
				env: configuredEnv(),
				fetchFn
			}
		);

		expect(result.status).toBe('ok');
		expect(result.tool_name).toBe('search_contacts');
		expect(result.result).toMatchObject({
			structuredContent: { ok: true }
		});

		const secondInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
		expect(JSON.parse(String(secondInit.body))).toMatchObject({
			method: 'tools/call',
			params: {
				name: 'search_contacts',
				arguments: { query: 'Wayne' }
			}
		});
	});
});
