// packages/buildos-mcp-server/src/client.ts
import { ProtocolError, ResourceNotFoundError } from '@modelcontextprotocol/server';
import { BRIDGE_NAME, BRIDGE_VERSION, type BridgeConfig } from './config';

const MCP_PROTOCOL_VERSION = '2025-06-18';

type JsonRpcResponse = {
	jsonrpc?: '2.0';
	id?: string | number | null;
	result?: unknown;
	error?: { code?: number; message?: string; data?: unknown };
};

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

const REQUEST_TIMEOUT_MS = 60_000;

export class BuildosRemoteMcpError extends Error {
	constructor(
		message: string,
		public readonly code: number | undefined,
		public readonly data: unknown,
		public readonly status: number
	) {
		super(message);
		this.name = 'BuildosRemoteMcpError';
	}
}

export function translateRemoteMcpError(
	error: unknown,
	resourceUri?: string
): ProtocolError | null {
	if (!(error instanceof BuildosRemoteMcpError)) return null;

	// Older MCP servers emitted -32002 without URI data for resource misses.
	// The 2026 protocol requires -32602 plus the requested URI.
	if (resourceUri && error.code === -32002) {
		return new ResourceNotFoundError(resourceUri, error.message);
	}

	if (typeof error.code !== 'number') {
		return new ProtocolError(-32603, 'BuildOS MCP request failed');
	}

	return ProtocolError.fromError(error.code, error.message, error.data);
}

/**
 * Thin JSON-RPC proxy to the remote BuildOS connector (`/mcp/buildos`). The local
 * SDK server handles the stdio protocol lifecycle itself and forwards tool and
 * resource operations through here. The remote leg deliberately stays on the
 * stable 2025 protocol during the dual-era rollout. Auth is a single bearer
 * header; nothing is logged.
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

	async listResourceTemplates(): Promise<{ resourceTemplates: unknown[] }> {
		const result = (await this.rpc('resources/templates/list')) as
			| { resourceTemplates?: unknown[] }
			| undefined;
		return {
			resourceTemplates: Array.isArray(result?.resourceTemplates)
				? result.resourceTemplates
				: []
		};
	}

	async readResource(uri: string): Promise<Record<string, unknown>> {
		const result = (await this.rpc('resources/read', { uri })) as
			| Record<string, unknown>
			| undefined;
		return result ?? {};
	}

	private async rpc(method: string, params?: Record<string, unknown>): Promise<unknown> {
		let response: Response;
		try {
			response = await this.fetchFn(this.endpoint(), {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json, text/event-stream',
					Authorization: `Bearer ${this.config.token}`,
					'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
					'Mcp-Method': method,
					...this.namedOperationHeader(method, params)
				},
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: this.nextId++,
					method,
					...(params ? { params } : {})
				}),
				// A hung remote must not hang the local client's tool call forever.
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
			});
		} catch (error) {
			if (error instanceof Error && error.name === 'TimeoutError') {
				throw new Error(
					`BuildOS MCP request timed out after ${REQUEST_TIMEOUT_MS / 1000}s for ${method}`
				);
			}
			throw error;
		}

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
			throw new BuildosRemoteMcpError(
				payload.error.message ?? 'BuildOS MCP request failed',
				payload.error.code,
				payload.error.data,
				response.status
			);
		}

		if (!response.ok) {
			throw new Error(`BuildOS MCP request failed: HTTP ${response.status} for ${method}`);
		}

		return payload.result;
	}

	private namedOperationHeader(
		method: string,
		params?: Record<string, unknown>
	): Record<string, string> {
		if (method === 'tools/call' && typeof params?.name === 'string') {
			return { 'Mcp-Name': params.name };
		}
		if (method === 'resources/read' && typeof params?.uri === 'string') {
			return { 'Mcp-Name': params.uri };
		}
		return {};
	}
}

export const CLIENT_INFO = { name: BRIDGE_NAME, version: BRIDGE_VERSION } as const;
