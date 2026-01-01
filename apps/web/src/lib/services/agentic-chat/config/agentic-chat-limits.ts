// apps/web/src/lib/services/agentic-chat/config/agentic-chat-limits.ts
/**
 * Shared limits for agentic chat orchestration.
 */

export const AGENTIC_CHAT_LIMITS = {
	MAX_TOOL_CALLS_PER_TURN: 40,
	MAX_SESSION_DURATION_MS: Number.POSITIVE_INFINITY
} as const;
