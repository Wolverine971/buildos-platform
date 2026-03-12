// apps/web/src/lib/services/agentic-chat/tools/skills/types.ts
export interface SkillExample {
	description: string;
	next_steps: string[];
}

export interface SkillDefinition {
	path: string;
	id: string;
	name: string;
	summary: string;
	relatedOps: string[];
	whenToUse: string[];
	workflow: string[];
	guardrails?: string[];
	examples?: SkillExample[];
	notes?: string[];
}

export interface SkillHelpPayload {
	type: 'skill';
	path: string;
	name: string;
	format: 'short' | 'full';
	version: string;
	summary: string;
	when_to_use: string[];
	workflow: string[];
	related_ops: string[];
	guardrails?: string[];
	examples?: SkillExample[];
	notes?: string[];
}

export function isSkillHelpPayload(value: unknown): value is SkillHelpPayload {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const record = value as Record<string, unknown>;
	return record.type === 'skill' && typeof record.path === 'string';
}
