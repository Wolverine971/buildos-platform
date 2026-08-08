// packages/agentic-chat-runtime/src/loop/no-tool-synthesis.ts
//
// Retry instructions shared by the legacy and worker finalization paths. Keep
// these byte-identical: they are answer-policy behavior, not host-specific
// orchestration text.

export const NO_TOOL_SYNTHESIS_TOOL_RETRY_MESSAGE =
	'The previous synthesis attempt still requested tool calls even though tools are unavailable. Ignore all pending or implied tool calls and write the final user-facing answer now from the existing tool results. Do not say you will check, search, pull up, inspect, load, or update anything else.';

export const NO_TOOL_SYNTHESIS_EMPTY_RETRY_MESSAGE =
	'The previous synthesis attempt produced no visible answer. Write the final user-facing answer now from the existing tool results. Include the concrete entities you found (with their titles and states) and directly answer any definition question the user asked. Do not call tools.';
