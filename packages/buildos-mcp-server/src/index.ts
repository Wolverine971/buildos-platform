#!/usr/bin/env node
// packages/buildos-mcp-server/src/index.ts
//
// Local stdio MCP bridge for BuildOS. A local MCP client (Claude Desktop, Cursor,
// Codex, etc.) launches this process; it speaks MCP stdio to the client and
// proxies tool listing/calls to the remote BuildOS connector over HTTPS.
//
// All diagnostics go to stderr so they never corrupt the stdio JSON-RPC stream.
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
	CallToolRequestSchema,
	ListResourcesRequestSchema,
	ListToolsRequestSchema,
	ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { loadConfig, BRIDGE_VERSION } from './config';
import { BuildosRemoteMcpClient } from './client';

async function main(): Promise<void> {
	const config = loadConfig(process.env);
	const client = new BuildosRemoteMcpClient(config);

	const server = new Server(
		{ name: 'buildos', version: BRIDGE_VERSION },
		{ capabilities: { tools: {}, resources: {} } }
	);

	server.setRequestHandler(ListToolsRequestSchema, async () => {
		const { tools } = await client.listTools();
		return { tools } as Awaited<ReturnType<typeof client.listTools>>;
	});

	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		return client.callTool(request.params.name, request.params.arguments ?? {});
	});

	server.setRequestHandler(ListResourcesRequestSchema, async () => {
		const { resources } = await client.listResources();
		return { resources } as Awaited<ReturnType<typeof client.listResources>>;
	});

	server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
		return client.readResource(request.params.uri);
	});

	const transport = new StdioServerTransport();
	await server.connect(transport);

	const profileNote = config.profile ? ` (profile: ${config.profile})` : '';
	console.error(`[buildos-mcp] bridging stdio → ${config.baseUrl}/mcp/buildos${profileNote}`);
}

main().catch((error) => {
	console.error('[buildos-mcp] fatal:', error instanceof Error ? error.message : error);
	process.exit(1);
});
