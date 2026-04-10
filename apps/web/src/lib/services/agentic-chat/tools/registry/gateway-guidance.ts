// apps/web/src/lib/services/agentic-chat/tools/registry/gateway-guidance.ts
export const GATEWAY_TOOL_DISCOVERY_LINES = [
	'Start with the current context, BuildOS capabilities, and skill metadata to choose the most likely path before searching.',
	'If the workflow is multi-step or easy to get wrong, load the relevant skill first.',
	'Use the preloaded direct tools first whenever one already fits the job.',
	'Use tool_search only when the exact op is still unknown after context and skill guidance. Search for the operation you need, not workspace data. Good examples: {"capability":"overview"}, {"entity":"task","kind":"write","query":"update existing task state"}, or {"group":"onto","entity":"document","kind":"write","query":"move document in tree"}.',
	'tool_search returns canonical ops plus direct tool names. If a matching tool is not already loaded, it becomes available for the next response in the same turn.',
	'Once you have an exact op, use tool_schema({ op: "<canonical op>" }) when the op is new in-turn or any write arguments are uncertain.',
	'After tool_schema, call the direct tool by name with concrete arguments. Do not route normal work through a generic executor.',
	'Reuse exact IDs from context and prior tool results. If required IDs or fields are still missing, resolve them with read/search ops or ask one concise question instead of guessing or sending incomplete writes.'
];

export function formatGatewayGuidanceLines(prefix = '- '): string {
	return GATEWAY_TOOL_DISCOVERY_LINES.map((line) => `${prefix}${line}`).join('\n');
}
