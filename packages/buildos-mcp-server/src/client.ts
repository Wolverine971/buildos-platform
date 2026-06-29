// packages/buildos-mcp-server/src/client.ts
import { BRIDGE_NAME, BRIDGE_VERSION, type BridgeConfig } from './config';

const MCP_PROTOCOL_VERSION = '2025-06-18';

type JsonRpcResponse = {
	jsonrpc?: '2.0';
	id?: string | number | null;
	result?: unknown;
	error?: { code?: number; message?: string };
};

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/**
 * Thin JSON-RPC proxy to the remote BuildOS connector (`/mcp/buildos`). The local
 * SDK server handles `initialize` itself and forwards only `tools/list` and
 * `tools/call` through here. Auth is a single bearer header; nothing is logged.
 */
export class BuildosRemoteMcpClient {
	private nextId = 1;

	constructor(
		private readonly config: BridgeConfig,
		private readonly fetchFn: FetchLike = fetch
	) {}

	endpoint(): string {
		const url = new URL(`${this.config.baseUrl}/mcp/buildos`);
		if (this.config.profile) {
			url.searchParams.set('profile', this.config.profile);
		}
		return url.toString();
	}

	async listTools(): Promise<{ tools: unknown[] }> {
		const result = (await this.rpc('tools/list')) as { tools?: unknown[] } | undefined;
		return { tools: Array.isArray(result?.tools) ? result!.tools : [] };
	}

	async callTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
		const result = (await this.rpc('tools/call', { name, arguments: args })) as
			| Record<string, unknown>
			| undefined;
		return result ?? {};
	}

	async listResources(): Promise<{ resources: unknown[] }> {
		const result = (await this.rpc('resources/list')) as { resources?: unknown[] } | undefined;
		return { resources: Array.isArray(result?.resources) ? result!.resources : [] };
	}

	async readResource(uri: string): Promise<Record<string, unknown>> {
		const result = (await this.rpc('resources/read', { uri })) as
			| Record<string, unknown>
			| undefined;
		return result ?? {};
	}

	private async rpc(method: string, params?: Record<string, unknown>): Promise<unknown> {
		const response = await this.fetchFn(this.endpoint(), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json, text/event-stream',
				Authorization: `Bearer ${this.config.token}`,
				'MCP-Protocol-Version': MCP_PROTOCOL_VERSION
			},
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: this.nextId++,
				method,
				...(params ? { params } : {})
			})
		});

		const text = await response.text();
		let payload: JsonRpcResponse;
		try {
			payload = text ? (JSON.parse(text) as JsonRpcResponse) : {};
		} catch {
			throw new Error(
				`BuildOS MCP returned a non-JSON response (HTTP ${response.status}) for ${method}`
			);
		}

		if (payload.error) {
			throw new Error(
				`BuildOS MCP error ${payload.error.code ?? ''}: ${payload.error.message ?? 'request failed'}`.trim()
			);
		}

		if (!response.ok) {
			throw new Error(`BuildOS MCP request failed: HTTP ${response.status} for ${method}`);
		}

		return payload.result;
	}
}

export const CLIENT_INFO = { name: BRIDGE_NAME, version: BRIDGE_VERSION } as const;
