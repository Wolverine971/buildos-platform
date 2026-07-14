<!-- packages/buildos-mcp-server/README.md -->

# @buildos/mcp-server

Local **stdio MCP bridge** for BuildOS. A local MCP client (Claude Desktop, Cursor, Codex, or any
client that launches a stdio MCP server) runs this process; it speaks MCP over stdio and proxies
tool listing/calls to the remote BuildOS connector at `https://build-os.com/mcp/buildos` over HTTPS.

Use this when your client only supports **local** MCP servers. Clients that support remote
Streamable HTTP MCP should connect to `https://build-os.com/mcp/buildos` directly with OAuth.

## How it works

```
local MCP client  ⇄ (stdio)  buildos-mcp-server  ⇄ (HTTPS + Bearer)  /mcp/buildos
```

- `initialize` is answered locally by the bridge.
- `tools/list`, `tools/call`, `resources/list`, and `resources/read` are forwarded to the remote
  connector.
- Auth is a single `Authorization: Bearer <token>` header — your BuildOS **agent key** (`boca_…`).
  `https` is required for any non-localhost `BUILDOS_BASE_URL`.
- The bridge never prompts for secrets and writes diagnostics to **stderr only**, so the stdio
  JSON-RPC stream stays clean.

## Configuration

Environment variables:

| Variable              | Required | Default                | Notes                                               |
| --------------------- | -------- | ---------------------- | --------------------------------------------------- |
| `BUILDOS_AGENT_TOKEN` | yes      | —                      | BuildOS agent key (`boca_…`) or OAuth access token. |
| `BUILDOS_BASE_URL`    | no       | `https://build-os.com` | Override for staging/self-host.                     |
| `BUILDOS_MCP_PROFILE` | no       | `general`              | `general` \| `chatgpt_data_app` \| `local_admin`.   |

## Client setup

> **Not yet on npm.** The package is currently `private`, so `npx -y @buildos/mcp-server` will
> not resolve. Build it locally and point your client at the bundled entrypoint:

```bash
git clone https://github.com/buildos/buildos-platform   # or use your existing checkout
cd buildos-platform
pnpm install
pnpm --filter @buildos/mcp-server build                  # produces packages/buildos-mcp-server/dist/index.js
```

### Claude Desktop / Cursor / generic MCP client

```json
{
	"mcpServers": {
		"buildos": {
			"command": "node",
			"args": [
				"/absolute/path/to/buildos-platform/packages/buildos-mcp-server/dist/index.js"
			],
			"env": {
				"BUILDOS_BASE_URL": "https://build-os.com",
				"BUILDOS_AGENT_TOKEN": "boca_your_agent_key"
			}
		}
	}
}
```

### Codex / other clients

Same shape — point the client's MCP server config at `node …/dist/index.js` with the two `env`
values above. Set `BUILDOS_MCP_PROFILE=chatgpt_data_app` for a read-only `search`/`fetch` surface.

Once the package is published to npm, `"command": "npx", "args": ["-y", "@buildos/mcp-server"]`
will work as a zero-install alternative.

## Development

```bash
pnpm --filter @buildos/mcp-server build      # bundle dist/index.js (tsup)
pnpm --filter @buildos/mcp-server test:run   # unit tests (SDK-free core)
pnpm --filter @buildos/mcp-server typecheck
```

`typecheck` uses native TypeScript 7 through the local `@typescript/native` alias. `build` remains
on the existing `tsup`/esbuild pipeline with TypeScript 5.9 retained as its compatibility
dependency.

The SDK-free core (`config.ts`, `client.ts`) is unit-tested. The stdio entrypoint (`index.ts`)
wires the official `@modelcontextprotocol/sdk` Server to the HTTP client and is verified by
running it against a real BuildOS endpoint.
