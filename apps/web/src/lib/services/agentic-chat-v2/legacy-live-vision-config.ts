// apps/web/src/lib/services/agentic-chat-v2/legacy-live-vision-config.ts

type AgenticChatLiveVisionEnvironment = {
	AGENT_CHAT_LEGACY_LIVE_VISION_ENABLED?: string;
	AGENT_CHAT_LIVE_VISION_ENABLED?: string;
};

/**
 * Legacy SSE must be able to serve image turns while worker vision remains
 * disabled. The dedicated value wins when configured; the shared value is a
 * backwards-compatible fallback for environments that have not split the two
 * execution surfaces yet.
 */
export function resolveAgenticChatLegacyLiveVisionEnabled(
	environment: AgenticChatLiveVisionEnvironment
): boolean {
	const dedicatedValue = environment.AGENT_CHAT_LEGACY_LIVE_VISION_ENABLED?.trim();
	if (dedicatedValue) return parseBooleanFlag(dedicatedValue, false);

	return parseBooleanFlag(environment.AGENT_CHAT_LIVE_VISION_ENABLED, false);
}

function parseBooleanFlag(value: string | undefined, fallback: boolean): boolean {
	if (!value) return fallback;
	const normalized = value.trim().toLowerCase();
	if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
	if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
	return fallback;
}
