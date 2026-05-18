// apps/web/src/lib/services/agentic-chat/tools/skills/types.ts
export interface SkillExample {
	description: string;
	next_steps: string[];
}

export type SkillResourceVisibility = 'public' | 'internal';

export interface SkillLinkedResource {
	id: string;
	name?: string;
	summary: string;
	whenToLoad: string[];
	path?: string;
	visibility?: SkillResourceVisibility;
}

export interface SkillLinkedResourcePayload {
	id: string;
	name?: string;
	summary: string;
	when_to_load: string[];
	path?: string;
	visibility?: SkillResourceVisibility;
}

export interface SkillDefinition {
	id: string;
	name: string;
	summary: string;
	parentId?: string;
	depth?: number;
	bodyLineCount?: number;
	sourceMarkdown?: string;
	preserveMarkdown?: boolean;
	legacyPaths: string[];
	relatedOps: string[];
	whenToUse: string[];
	workflow: string[];
	childSkills?: SkillLinkedResource[];
	referenceModules?: SkillLinkedResource[];
	guardrails?: string[];
	examples?: SkillExample[];
	notes?: string[];
}

export interface SkillHelpPayload {
	type: 'skill';
	id: string;
	name: string;
	format: 'short' | 'full';
	version: string;
	description: string;
	summary: string;
	parent_id?: string;
	depth?: number;
	legacy_paths?: string[];
	markdown?: string;
	when_to_use: string[];
	workflow: string[];
	related_ops: string[];
	materialized_tools?: string[];
	child_skills?: SkillLinkedResourcePayload[];
	reference_modules?: SkillLinkedResourcePayload[];
	guardrails?: string[];
	examples?: SkillExample[];
	notes?: string[];
}

export function isSkillHelpPayload(value: unknown): value is SkillHelpPayload {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const record = value as Record<string, unknown>;
	return record.type === 'skill' && typeof record.id === 'string';
}
