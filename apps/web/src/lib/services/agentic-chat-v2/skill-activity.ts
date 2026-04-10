// apps/web/src/lib/services/agentic-chat-v2/skill-activity.ts
import type { ChatToolCall, ChatToolResult, SkillActivityEvent } from '@buildos/shared-types';
import { normalizeGatewayHelpPath } from '$lib/services/agentic-chat/tools/registry/gateway-op-aliases';
import {
	getSkillByReference,
	isRegisteredSkillReference
} from '$lib/services/agentic-chat/tools/skills/registry';
import { isSkillHelpPayload } from '$lib/services/agentic-chat/tools/skills/types';
export type { SkillActivityEvent } from '@buildos/shared-types';

function parseSkillReference(
	toolCall: ChatToolCall
): { skillId: string; via: SkillActivityEvent['via'] } | null {
	const toolName = toolCall.function?.name;
	if (toolName !== 'tool_help' && toolName !== 'skill_load') return null;
	const rawArgs = toolCall.function.arguments;
	if (typeof rawArgs !== 'string') return null;

	try {
		const parsed = JSON.parse(rawArgs) as Record<string, unknown>;
		if (toolName === 'skill_load') {
			const rawSkill =
				typeof parsed.skill === 'string'
					? parsed.skill.trim()
					: typeof parsed.id === 'string'
						? parsed.id.trim()
						: typeof parsed.path === 'string'
							? parsed.path.trim()
							: '';
			if (!rawSkill) return null;
			const skill = getSkillByReference(rawSkill);
			if (!skill) return null;
			return { skillId: skill.id, via: 'skill_load' };
		}

		const rawPath = typeof parsed.path === 'string' ? parsed.path.trim() : '';
		if (!rawPath) return null;
		const normalized = normalizeGatewayHelpPath(rawPath);
		if (!normalized) return null;
		const skill = getSkillByReference(normalized);
		if (!skill) return null;
		return { skillId: skill.id, via: 'tool_help' };
	} catch {
		return null;
	}
}

export function getRequestedSkillActivity(toolCall: ChatToolCall): SkillActivityEvent | null {
	const reference = parseSkillReference(toolCall);
	if (!reference || !isRegisteredSkillReference(reference.skillId)) return null;
	return {
		type: 'skill_activity',
		action: 'requested',
		path: reference.skillId,
		via: reference.via
	};
}

export function getLoadedSkillActivity(
	toolCall: ChatToolCall,
	result: ChatToolResult
): SkillActivityEvent | null {
	const toolName = toolCall.function?.name;
	if (toolName !== 'tool_help' && toolName !== 'skill_load') return null;
	if (!result.success || !isSkillHelpPayload(result.result)) return null;
	if (!isRegisteredSkillReference(result.result.id)) return null;
	return {
		type: 'skill_activity',
		action: 'loaded',
		path: result.result.id,
		via: toolName === 'skill_load' ? 'skill_load' : 'tool_help'
	};
}
