// apps/web/src/lib/services/agentic-chat-v2/skill-activity.ts
import type { ChatToolCall, ChatToolResult, SkillActivityEvent } from '@buildos/shared-types';
import {
	getSkillByReference,
	isRegisteredSkillReference
} from '$lib/services/agentic-chat/tools/skills/registry';
import { isSkillHelpPayload } from '$lib/services/agentic-chat/tools/skills/types';
export type { SkillActivityEvent } from '@buildos/shared-types';

export type LoadedSkillToolingTelemetry = {
	materialized_tools?: string[];
	read_ops?: string[];
	write_ops?: string[];
	destructive_ops?: string[];
};

function compactSkillStringList(value: unknown, limit = 12): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((item) => (typeof item === 'string' ? item.trim() : ''))
		.filter((item) => item.length > 0)
		.slice(0, limit);
}

function parseSkillReference(
	toolCall: ChatToolCall
): { skillId: string; via: SkillActivityEvent['via'] } | null {
	const toolName = toolCall.function?.name;
	if (toolName !== 'skill_load') return null;
	const rawArgs = toolCall.function.arguments;
	if (typeof rawArgs !== 'string') return null;

	try {
		const parsed = JSON.parse(rawArgs) as Record<string, unknown>;
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
	if (toolName !== 'skill_load') return null;
	if (!result.success || !isSkillHelpPayload(result.result)) return null;
	if (!isRegisteredSkillReference(result.result.id)) return null;
	return {
		type: 'skill_activity',
		action: 'loaded',
		path: result.result.id,
		via: 'skill_load'
	};
}

export function getLoadedSkillToolingTelemetry(
	result: ChatToolResult
): LoadedSkillToolingTelemetry {
	if (!result.success || !isSkillHelpPayload(result.result)) return {};
	const materializedTools = compactSkillStringList(result.result.materialized_tools);
	const readOps = compactSkillStringList(result.result.read_ops);
	const writeOps = compactSkillStringList(result.result.write_ops);
	const destructiveOps = compactSkillStringList(result.result.destructive_ops);

	return {
		...(materializedTools.length ? { materialized_tools: materializedTools } : {}),
		...(readOps.length ? { read_ops: readOps } : {}),
		...(writeOps.length ? { write_ops: writeOps } : {}),
		...(destructiveOps.length ? { destructive_ops: destructiveOps } : {})
	};
}
