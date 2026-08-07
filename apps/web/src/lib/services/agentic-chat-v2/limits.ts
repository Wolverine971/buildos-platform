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

export type FastChatLimits = {
	MAX_TOOL_CALLS: number;
	MAX_TOOL_ROUNDS: number;
	SYNTHESIS_MAX_TOKENS: number;
	FORCED_SYNTHESIS_MAX_TOKENS: number;
	MAX_LENGTH_CONTINUATIONS: number;
};

/** Injectable loader (Slice 18 S2): never read module-scope env in new call sites. */
export function loadFastChatLimits(environment: NodeJS.ProcessEnv = process.env): FastChatLimits {
	return {
		MAX_TOOL_CALLS: parsePositiveInt(
			environment.FASTCHAT_MAX_TOOL_CALLS,
			DEFAULT_FASTCHAT_MAX_TOOL_CALLS
		),
		MAX_TOOL_ROUNDS: parsePositiveInt(
			environment.FASTCHAT_MAX_TOOL_ROUNDS,
			DEFAULT_FASTCHAT_MAX_TOOL_ROUNDS
		),
		SYNTHESIS_MAX_TOKENS: parsePositiveInt(
			environment.FASTCHAT_SYNTHESIS_MAX_TOKENS,
			DEFAULT_FASTCHAT_SYNTHESIS_MAX_TOKENS
		),
		FORCED_SYNTHESIS_MAX_TOKENS: parsePositiveInt(
			environment.FASTCHAT_FORCED_SYNTHESIS_MAX_TOKENS,
			DEFAULT_FASTCHAT_FORCED_SYNTHESIS_MAX_TOKENS
		),
		MAX_LENGTH_CONTINUATIONS: parsePositiveInt(
			environment.FASTCHAT_MAX_LENGTH_CONTINUATIONS,
			DEFAULT_FASTCHAT_MAX_LENGTH_CONTINUATIONS
		)
	};
}

export const FASTCHAT_LIMITS: FastChatLimits = loadFastChatLimits();
