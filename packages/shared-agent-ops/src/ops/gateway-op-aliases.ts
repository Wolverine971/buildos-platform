// packages/shared-agent-ops/src/ops/gateway-op-aliases.ts
/**
 * Canonical gateway op names.
 *
 * One op name space (2026-09-04, one-engine stage S9). The 33-entry
 * `GATEWAY_OP_ALIASES` table that lived here is gone: it had already stopped
 * translating (the external gateway answered every alias form with NOT_FOUND),
 * and 90 days of production traffic — 964 ops in `agent_call_tool_executions`
 * and 3,537 tool names in `chat_tool_executions` — contain no alias form at all.
 *
 * What remains is the one place an op name is canonicalized before it is looked
 * up in the registry. Op names are the EXTERNAL contract for MCP and agent-call,
 * so the canonical name IS the requested name; an unrecognized op is rejected by
 * the caller's own unknown-op guard, which names it.
 */
export function normalizeGatewayOpName(op: string): string {
	return typeof op === 'string' ? op.trim() : '';
}
