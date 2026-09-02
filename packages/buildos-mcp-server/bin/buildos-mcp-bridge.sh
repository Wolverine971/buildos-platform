#!/bin/sh
# packages/buildos-mcp-server/bin/buildos-mcp-bridge.sh
#
# Launcher for the BuildOS stdio MCP bridge. Point any local MCP client at this
# script (Claude Code, Codex, Claude Desktop, Cursor, Gemini CLI, OpenCode, ...):
#
#   claude mcp add --scope user --transport stdio buildos -- /abs/path/to/this/script
#   codex  mcp add buildos -- /abs/path/to/this/script
#
# Agent token resolution, first hit wins:
#   1. BUILDOS_AGENT_TOKEN already present in the environment
#   2. macOS Keychain generic password, service "buildos-agent-token"
#   3. macOS Keychain generic password, service "codex-buildos-agent-token" (legacy name)
#
# Store the token once (never in a config file) with:
#   security add-generic-password -a "$USER" -s buildos-agent-token -w 'boca_...'
#
# Optional overrides: BUILDOS_BASE_URL (default https://build-os.com) and
# BUILDOS_MCP_PROFILE (general | chatgpt_data_app | local_admin).
#
# Diagnostics go to stderr only. stdout is the MCP JSON-RPC stream.
set -eu

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
ENTRY="$SCRIPT_DIR/../dist/index.js"
ACCOUNT="${USER:-$(id -un)}"

if [ ! -f "$ENTRY" ]; then
	echo "[buildos-mcp] missing $ENTRY — build it with: pnpm --filter @buildos/mcp-server build" >&2
	exit 1
fi

if [ -z "${BUILDOS_AGENT_TOKEN:-}" ] && command -v security >/dev/null 2>&1; then
	for service in buildos-agent-token codex-buildos-agent-token; do
		if token=$(security find-generic-password -a "$ACCOUNT" -s "$service" -w 2>/dev/null); then
			BUILDOS_AGENT_TOKEN=$token
			break
		fi
	done
fi

if [ -z "${BUILDOS_AGENT_TOKEN:-}" ]; then
	echo "[buildos-mcp] no agent token found. Export BUILDOS_AGENT_TOKEN or store one with:" >&2
	echo "  security add-generic-password -a \"\$USER\" -s buildos-agent-token -w 'boca_...'" >&2
	exit 1
fi

export BUILDOS_AGENT_TOKEN
export BUILDOS_BASE_URL="${BUILDOS_BASE_URL:-https://build-os.com}"
export BUILDOS_MCP_PROFILE="${BUILDOS_MCP_PROFILE:-general}"

# GUI-launched clients (Codex desktop, Claude Desktop) start with a minimal PATH,
# so fall back to the usual Homebrew / local install locations.
NODE_BIN=$(command -v node 2>/dev/null || true)
for candidate in /opt/homebrew/bin/node /usr/local/bin/node; do
	[ -n "$NODE_BIN" ] && break
	[ -x "$candidate" ] && NODE_BIN=$candidate
done
if [ -z "$NODE_BIN" ]; then
	echo "[buildos-mcp] node not found on PATH, /opt/homebrew/bin, or /usr/local/bin" >&2
	exit 1
fi

exec "$NODE_BIN" "$ENTRY"
