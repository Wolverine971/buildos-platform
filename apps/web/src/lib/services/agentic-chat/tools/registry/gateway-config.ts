// apps/web/src/lib/services/agentic-chat/tools/registry/gateway-config.ts

import { env } from '$env/dynamic/private';

export const TOOL_GATEWAY_ENV = 'AGENTIC_CHAT_TOOL_GATEWAY';
export const COMPACT_TOOL_PROMPT_ENV = 'FASTCHAT_COMPACT_TOOL_PROMPT';

export function isToolGatewayEnabled(): boolean {
	const raw = env[TOOL_GATEWAY_ENV];
	return parseBooleanEnv(raw);
}

export function isFastChatCompactToolPromptEnabled(): boolean {
	const raw = env[COMPACT_TOOL_PROMPT_ENV];
	return parseBooleanEnv(raw);
}

function parseBooleanEnv(raw: unknown): boolean {
	if (!raw) return false;
	const normalized = String(raw).trim().toLowerCase();
	return ['1', 'true', 'yes', 'on'].includes(normalized);
}
