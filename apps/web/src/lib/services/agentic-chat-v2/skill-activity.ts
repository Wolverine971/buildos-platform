// apps/web/src/lib/services/agentic-chat-v2/skill-activity.ts
import type { ChatToolCall, ChatToolResult, SkillActivityEvent } from '@buildos/shared-types';
import { normalizeGatewayHelpPath } from '$lib/services/agentic-chat/tools/registry/gateway-op-aliases';
import { isRegisteredSkillPath } from '$lib/services/agentic-chat/tools/skills/registry';
import { isSkillHelpPayload } from '$lib/services/agentic-chat/tools/skills/types';
export type { SkillActivityEvent } from '@buildos/shared-types';

function parseToolHelpPath(toolCall: ChatToolCall): string | null {
	if (toolCall.function?.name !== 'tool_help') return null;
	const rawArgs = toolCall.function.arguments;
	if (typeof rawArgs !== 'string') return null;

	try {
		const parsed = JSON.parse(rawArgs) as Record<string, unknown>;
		const rawPath = typeof parsed.path === 'string' ? parsed.path.trim() : '';
		if (!rawPath) return null;
		const normalized = normalizeGatewayHelpPath(rawPath);
		return normalized || null;
	} catch {
		return null;
	}
}

export function getRequestedSkillActivity(toolCall: ChatToolCall): SkillActivityEvent | null {
	const path = parseToolHelpPath(toolCall);
	if (!path || !isRegisteredSkillPath(path)) return null;
	return {
		type: 'skill_activity',
		action: 'requested',
		path,
		via: 'tool_help'
	};
}

export function getLoadedSkillActivity(
	toolCall: ChatToolCall,
	result: ChatToolResult
): SkillActivityEvent | null {
	if (toolCall.function?.name !== 'tool_help') return null;
	if (!result.success || !isSkillHelpPayload(result.result)) return null;
	if (!isRegisteredSkillPath(result.result.path)) return null;
	return {
		type: 'skill_activity',
		action: 'loaded',
		path: result.result.path,
		via: 'tool_help'
	};
}
