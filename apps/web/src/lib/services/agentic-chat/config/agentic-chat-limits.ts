// apps/web/src/lib/services/agentic-chat/config/agentic-chat-limits.ts
/**
 * Shared limits for agentic chat orchestration.
 */

export const AGENTIC_CHAT_LIMITS = {
	MAX_TOOL_CALLS_PER_TURN: 30,
	MAX_SESSION_DURATION_MS: 90_000
} as const;
