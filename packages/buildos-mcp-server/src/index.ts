#!/usr/bin/env node
// packages/buildos-mcp-server/src/index.ts
//
// Local stdio MCP bridge for BuildOS. A local MCP client (Claude Desktop, Cursor,
// Codex, etc.) launches this process; it speaks MCP stdio to the client and
// proxies tool listing/calls to the remote BuildOS connector over HTTPS.
//
// All diagnostics go to stderr so they never corrupt the stdio JSON-RPC stream.
import {
	Server,
	type CallToolResult,
	type ListResourcesResult,
	type ListResourceTemplatesResult,
	type ListToolsResult,
	type ReadResourceResult
} from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { loadConfig, BRIDGE_VERSION } from './config';
import { BuildosRemoteMcpClient, translateRemoteMcpError } from './client';

const SUPPORTED_PROTOCOL_VERSIONS = [
	'2026-07-28',
	'2025-11-25',
	'2025-06-18',
	'2025-03-26',
	'2024-11-05',
	'2024-10-07'
];

async function forwardRemoteMcpRequest<T>(
	request: () => Promise<T>,
	resourceUri?: string
): Promise<T> {
	try {
		return await request();
	} catch (error) {
		throw translateRemoteMcpError(error, resourceUri) ?? error;
	}
}

function createBridgeServer(client: BuildosRemoteMcpClient, profile?: string): Server {
	const server = new Server(
		{ name: 'buildos', title: 'BuildOS', version: BRIDGE_VERSION },
		{
			supportedProtocolVersions: SUPPORTED_PROTOCOL_VERSIONS,
			capabilities: { tools: {}, resources: {} },
			instructions:
				profile === 'chatgpt_data_app'
					? 'Use search to find records in connected BuildOS projects. Pass the full result id to fetch and cite the returned title and URL. This profile is read-only.'
					: "Use the tools available on this BuildOS connection. For a project briefing, use get_onto_project_status with project_id or query when available. Save loose notes and tasks in the user's Workspace with workspace.project_id from get_buildos_permissions and tell the user where they went. If Workspace is unavailable, ask for a writable destination. Never create a project just to hold one item.",
			// Keep identity/schema calls cheap while live resource data remains fresh.
			cacheHints: {
				'tools/list': { ttlMs: 60_000, cacheScope: 'private' },
				'resources/list': { ttlMs: 0, cacheScope: 'private' },
				'resources/templates/list': { ttlMs: 300_000, cacheScope: 'private' },
				'resources/read': { ttlMs: 0, cacheScope: 'private' },
				'server/discover': { ttlMs: 300_000, cacheScope: 'private' }
			}
		}
	);

	server.setRequestHandler('tools/list', async () => {
		return (await forwardRemoteMcpRequest(() => client.listTools())) as ListToolsResult;
	});

	server.setRequestHandler('tools/call', async (request) => {
		const result = (await forwardRemoteMcpRequest(() =>
			client.callTool(request.params.name, request.params.arguments ?? {})
		)) as CallToolResult;
		return server.projectCallToolResult(result, { type: 'object' });
	});

	server.setRequestHandler('resources/list', async () => {
		return (await forwardRemoteMcpRequest(() => client.listResources())) as ListResourcesResult;
	});

	server.setRequestHandler('resources/templates/list', async () => {
		return (await forwardRemoteMcpRequest(() =>
			client.listResourceTemplates()
		)) as ListResourceTemplatesResult;
	});

	server.setRequestHandler('resources/read', async (request) => {
		return (await forwardRemoteMcpRequest(
			() => client.readResource(request.params.uri),
			request.params.uri
		)) as ReadResourceResult;
	});

	return server;
}

function main(): void {
	const config = loadConfig(process.env);
	const client = new BuildosRemoteMcpClient(config);

	serveStdio(() => createBridgeServer(client, config.profile), {
		legacy: 'serve',
		onerror: (error) => {
			console.error('[buildos-mcp] protocol error:', error.message);
		}
	});

	const profileNote = config.profile ? ` (profile: ${config.profile})` : '';
	console.error(`[buildos-mcp] bridging stdio → ${config.baseUrl}/mcp/buildos${profileNote}`);
}

try {
	main();
} catch (error) {
	console.error('[buildos-mcp] fatal:', error instanceof Error ? error.message : error);
	process.exit(1);
}
