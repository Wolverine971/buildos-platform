// packages/buildos-mcp-server/src/client.test.ts
import { describe, expect, it, vi } from 'vitest';
import { ProtocolError, ResourceNotFoundError } from '@modelcontextprotocol/server';
import {
	BuildosRemoteMcpClient,
	BuildosRemoteMcpError,
	translateRemoteMcpError,
	type FetchLike
} from './client';

const CONFIG = { baseUrl: 'https://build-os.com', token: 'boca_secret' };

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

describe('BuildosRemoteMcpClient', () => {
	it('targets /mcp/buildos and appends the profile query when set', () => {
		const base = new BuildosRemoteMcpClient(CONFIG);
		expect(base.endpoint()).toBe('https://build-os.com/mcp/buildos');

		const withProfile = new BuildosRemoteMcpClient({ ...CONFIG, profile: 'chatgpt_data_app' });
		expect(withProfile.endpoint()).toBe(
			'https://build-os.com/mcp/buildos?profile=chatgpt_data_app'
		);
	});

	it('sends the bearer token, JSON accept, and protocol headers', async () => {
		const fetchFn = vi.fn(async () =>
			jsonResponse({ jsonrpc: '2.0', id: 1, result: { tools: [] } })
		) as unknown as FetchLike;
		const client = new BuildosRemoteMcpClient(CONFIG, fetchFn);

		await client.listTools();

		const [, init] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
		const headers = init.headers as Record<string, string>;
		expect(headers.Authorization).toBe('Bearer boca_secret');
		expect(headers.Accept).toContain('application/json');
		expect(headers['MCP-Protocol-Version']).toBe('2025-06-18');
		expect(headers['Mcp-Method']).toBe('tools/list');
		const body = JSON.parse(init.body as string);
		expect(body).toMatchObject({ jsonrpc: '2.0', method: 'tools/list' });
	});

	it('returns the tools array from a tools/list result', async () => {
		const fetchFn = vi.fn(async () =>
			jsonResponse({ jsonrpc: '2.0', id: 1, result: { tools: [{ name: 'search' }] } })
		) as unknown as FetchLike;
		const client = new BuildosRemoteMcpClient(CONFIG, fetchFn);

		expect(await client.listTools()).toEqual({ tools: [{ name: 'search' }] });
	});

	it('forwards name and arguments on tools/call and returns the result', async () => {
		const fetchFn = vi.fn(async () =>
			jsonResponse({
				jsonrpc: '2.0',
				id: 1,
				result: { content: [{ type: 'text', text: 'ok' }] }
			})
		) as unknown as FetchLike;
		const client = new BuildosRemoteMcpClient(CONFIG, fetchFn);

		const result = await client.callTool('fetch', { id: 'task:t1' });

		expect(result).toEqual({ content: [{ type: 'text', text: 'ok' }] });
		const body = JSON.parse(
			(fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string
		);
		expect(body.method).toBe('tools/call');
		expect(body.params).toEqual({ name: 'fetch', arguments: { id: 'task:t1' } });
		const headers = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1]
			.headers as Record<string, string>;
		expect(headers['Mcp-Name']).toBe('fetch');
	});

	it('forwards resource template listing and resource operation names', async () => {
		const fetchFn = vi.fn(async (_input: string, init: RequestInit) => {
			const body = JSON.parse(init.body as string);
			return jsonResponse({
				jsonrpc: '2.0',
				id: body.id,
				result:
					body.method === 'resources/templates/list'
						? { resourceTemplates: [{ uriTemplate: 'buildos://tasks/{id}' }] }
						: { contents: [] }
			});
		}) as unknown as FetchLike;
		const client = new BuildosRemoteMcpClient(CONFIG, fetchFn);

		expect(await client.listResourceTemplates()).toEqual({
			resourceTemplates: [{ uriTemplate: 'buildos://tasks/{id}' }]
		});
		await client.readResource('buildos://tasks/t1');

		const calls = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls;
		expect((calls[0][1].headers as Record<string, string>)['Mcp-Method']).toBe(
			'resources/templates/list'
		);
		expect((calls[1][1].headers as Record<string, string>)['Mcp-Name']).toBe(
			'buildos://tasks/t1'
		);
	});

	it('preserves JSON-RPC error metadata from the remote response', async () => {
		const fetchFn = vi.fn(async () =>
			jsonResponse(
				{
					jsonrpc: '2.0',
					id: 1,
					error: { code: -32001, message: 'unauthorized', data: { reason: 'expired' } }
				},
				401
			)
		) as unknown as FetchLike;
		const client = new BuildosRemoteMcpClient(CONFIG, fetchFn);

		const error = await client.listTools().catch((caught) => caught);
		expect(error).toBeInstanceOf(BuildosRemoteMcpError);
		expect(error).toMatchObject({
			message: 'unauthorized',
			code: -32001,
			data: { reason: 'expired' },
			status: 401
		});
	});

	it('translates an old remote resource miss to the modern typed error', () => {
		const translated = translateRemoteMcpError(
			new BuildosRemoteMcpError('Document not found', -32002, undefined, 404),
			'buildos://document/doc-1'
		);

		expect(translated).toBeInstanceOf(ResourceNotFoundError);
		expect(translated).toMatchObject({
			code: -32602,
			data: { uri: 'buildos://document/doc-1' }
		});
	});

	it('preserves other remote protocol codes and data during translation', () => {
		const translated = translateRemoteMcpError(
			new BuildosRemoteMcpError('Method unavailable', -32601, { method: 'x' }, 404)
		);

		expect(translated).toBeInstanceOf(ProtocolError);
		expect(translated).toMatchObject({
			code: -32601,
			message: 'Method unavailable',
			data: { method: 'x' }
		});
	});

	it('throws a clear error on a non-JSON response', async () => {
		const fetchFn = vi.fn(
			async () => new Response('<html>502</html>', { status: 502 })
		) as unknown as FetchLike;
		const client = new BuildosRemoteMcpClient(CONFIG, fetchFn);

		await expect(client.listTools()).rejects.toThrow(/non-JSON response/);
	});

	it('increments the JSON-RPC id across calls', async () => {
		const fetchFn = vi.fn(async () =>
			jsonResponse({ jsonrpc: '2.0', id: 1, result: { tools: [] } })
		) as unknown as FetchLike;
		const client = new BuildosRemoteMcpClient(CONFIG, fetchFn);

		await client.listTools();
		await client.listTools();

		const calls = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls;
		expect(JSON.parse(calls[0][1].body as string).id).toBe(1);
		expect(JSON.parse(calls[1][1].body as string).id).toBe(2);
	});
});
