// packages/buildos-mcp-server/src/client.test.ts
import { describe, expect, it, vi } from 'vitest';
import { BuildosRemoteMcpClient, type FetchLike } from './client';

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
	});

	it('throws on a JSON-RPC error response', async () => {
		const fetchFn = vi.fn(async () =>
			jsonResponse(
				{ jsonrpc: '2.0', id: 1, error: { code: -32001, message: 'unauthorized' } },
				401
			)
		) as unknown as FetchLike;
		const client = new BuildosRemoteMcpClient(CONFIG, fetchFn);

		await expect(client.listTools()).rejects.toThrow(/unauthorized/);
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
