// apps/web/src/lib/services/agentic-chat/tools/registry/gateway-guidance.ts
export const GATEWAY_TOOL_DISCOVERY_LINES = [
	'Start with the current context, BuildOS capabilities, and skill metadata to choose the most likely path before searching.',
	'If the workflow is multi-step or easy to get wrong, load the relevant skill first.',
	'If the skill or current context already identifies the exact op, skip tool_search and go straight to tool_schema or buildos_call.',
	'Use tool_search only when the exact op is still unknown after context and skill guidance. Search for the operation you need, not workspace data. Good examples: {"capability":"overview"}, {"entity":"task","kind":"write","query":"update existing task state"}, or {"group":"onto","entity":"document","kind":"write","query":"move document in tree"}.',
	'Once you have an exact op, use tool_schema({ op: "<canonical op>" }) when the op is new in-turn or any write arguments are uncertain.',
	'Execute only through buildos_call({ op: "<canonical op>", args: { ... } }) once the canonical op and concrete args are known. In gateway mode, overview and other canonical ops run through buildos_call, not as top-level tools.',
	'Reuse exact IDs from context and prior tool results. If required IDs or fields are still missing, resolve them with read/search ops or ask one concise question instead of guessing or sending incomplete writes.'
];

export function formatGatewayGuidanceLines(prefix = '- '): string {
	return GATEWAY_TOOL_DISCOVERY_LINES.map((line) => `${prefix}${line}`).join('\n');
}
