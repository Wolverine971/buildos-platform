// apps/web/src/lib/services/agentic-chat/tools/registry/gateway-config.ts

import { env } from '$env/dynamic/private';

export const TOOL_GATEWAY_ENV = 'AGENTIC_CHAT_TOOL_GATEWAY';

export function isToolGatewayEnabled(): boolean {
	const raw = env[TOOL_GATEWAY_ENV];
	if (!raw) return false;
	const normalized = String(raw).trim().toLowerCase();
	return ['1', 'true', 'yes', 'on'].includes(normalized);
}
