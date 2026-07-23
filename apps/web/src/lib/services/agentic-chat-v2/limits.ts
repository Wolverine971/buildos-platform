// apps/web/src/lib/services/agentic-chat-v2/limits.ts
const DEFAULT_FASTCHAT_MAX_TOOL_CALLS = 40;
const DEFAULT_FASTCHAT_MAX_TOOL_ROUNDS = 16;
// D8: the streaming chat/synthesis pass output cap. The service default is 2000,
// which silently truncates real answers and half-built tool-call arguments. The
// orchestrator passes this explicit, higher cap on every LLM pass.
const DEFAULT_FASTCHAT_SYNTHESIS_MAX_TOKENS = 8000;
// Phase 3 canary: dedicated forced-synthesis passes should be large enough for
// substantive list/report answers without inheriting the tool-call payload cap.
// This only applies to the dedicated route; control/off traffic remains at the
// existing 8k cap so the experiment has an honest baseline.
const DEFAULT_FASTCHAT_FORCED_SYNTHESIS_MAX_TOKENS = 6000;
// D8: how many times we ask the model to continue a `finish_reason: 'length'`
// answer before we give up and flag the turn as truncated. Bounded so a model
// that keeps hitting the cap can never spin the turn forever.
const DEFAULT_FASTCHAT_MAX_LENGTH_CONTINUATIONS = 2;

function parsePositiveInt(value: string | undefined, fallback: number): number {
	if (!value) return fallback;
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
	return parsed;
}

export const FASTCHAT_LIMITS = {
	MAX_TOOL_CALLS: parsePositiveInt(
		process.env.FASTCHAT_MAX_TOOL_CALLS,
		DEFAULT_FASTCHAT_MAX_TOOL_CALLS
	),
	MAX_TOOL_ROUNDS: parsePositiveInt(
		process.env.FASTCHAT_MAX_TOOL_ROUNDS,
		DEFAULT_FASTCHAT_MAX_TOOL_ROUNDS
	),
	SYNTHESIS_MAX_TOKENS: parsePositiveInt(
		process.env.FASTCHAT_SYNTHESIS_MAX_TOKENS,
		DEFAULT_FASTCHAT_SYNTHESIS_MAX_TOKENS
	),
	FORCED_SYNTHESIS_MAX_TOKENS: parsePositiveInt(
		process.env.FASTCHAT_FORCED_SYNTHESIS_MAX_TOKENS,
		DEFAULT_FASTCHAT_FORCED_SYNTHESIS_MAX_TOKENS
	),
	MAX_LENGTH_CONTINUATIONS: parsePositiveInt(
		process.env.FASTCHAT_MAX_LENGTH_CONTINUATIONS,
		DEFAULT_FASTCHAT_MAX_LENGTH_CONTINUATIONS
	)
} as const;
