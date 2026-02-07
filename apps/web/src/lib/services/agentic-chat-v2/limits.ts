// apps/web/src/lib/services/agentic-chat-v2/limits.ts
const DEFAULT_FASTCHAT_MAX_TOOL_CALLS = 40;
const DEFAULT_FASTCHAT_MAX_TOOL_ROUNDS = 8;

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
	)
} as const;
