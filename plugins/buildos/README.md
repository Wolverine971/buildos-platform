<!-- plugins/buildos/README.md -->

# BuildOS plugin

One plugin directory, two plugin systems. It connects an agent to the remote BuildOS MCP
connector at `https://build-os.com/mcp/buildos` and ships a skill that teaches the agent how
to work inside a BuildOS workspace.

| Client      | Manifest                     | Transport                                        |
| ----------- | ---------------------------- | ------------------------------------------------ |
| Claude Code | `.claude-plugin/plugin.json` | `.mcp.json` → remote HTTP MCP with OAuth         |
| Codex       | `.codex-plugin/plugin.json`  | `.app.json` → the BuildOS ChatGPT app (Apps SDK) |
| Both        | `skills/buildos-context/`    | Skill loaded by either plugin system             |

## Claude Code

```bash
claude plugin marketplace add buildos/buildos-platform   # or a local checkout path
claude plugin install buildos@buildos
```

Then run `/mcp` inside Claude Code, pick **buildos**, and approve the BuildOS consent screen
(scope and projects). Tools appear as `mcp__plugin_buildos_buildos__*`.

## Codex / ChatGPT

The Codex manifest references the published BuildOS app, so ChatGPT and Codex authenticate
through the BuildOS OAuth connector on first use. Register this repo as a marketplace and
enable `buildos`:

```bash
codex plugin marketplace add /absolute/path/to/buildos-platform
codex plugin add buildos@buildos
```

## Headless / personal use

If you would rather not go through OAuth on your own machine, point the client at the
stdio bridge launcher instead; it reads your agent key from the macOS Keychain:

```bash
security add-generic-password -a "$USER" -s buildos-agent-token -w 'boca_...'
claude mcp add --scope user --transport stdio buildos -- \
  /abs/path/to/buildos-platform/packages/buildos-mcp-server/bin/buildos-mcp-bridge.sh
```

See `packages/buildos-mcp-server/README.md` for the bridge itself.
