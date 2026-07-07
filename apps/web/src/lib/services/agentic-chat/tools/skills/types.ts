// apps/web/src/lib/services/agentic-chat/tools/skills/types.ts
import type { SkillActivation, SkillAltitude, SkillDependency, SkillType } from './skill.schema';

export interface SkillExample {
	description: string;
	next_steps: string[];
}

export type SkillLoadFormat = 'short' | 'full';

export type SkillResourceVisibility = 'public' | 'internal';

export type SkillReferenceLoadSurface = 'chat_internal' | 'public_portable' | 'external_agent';

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
	skillType?: SkillType;
	altitude?: SkillAltitude;
	activation?: SkillActivation;
	dependencies?: SkillDependency[];
	parentId?: string;
	depth?: number;
	bodyLineCount?: number;
	rawMarkdown?: string;
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
	outputContract?: string;
	recommendedLoadFormat?: SkillLoadFormat;
}

export interface SkillHelpPayload {
	type: 'skill';
	id: string;
	name: string;
	format: SkillLoadFormat;
	recommended_load_format: SkillLoadFormat;
	version: string;
	description: string;
	summary: string;
	skill_type?: SkillType;
	altitude?: SkillAltitude;
	activation?: SkillActivation;
	dependencies?: SkillDependency[];
	parent_id?: string;
	depth?: number;
	legacy_paths?: string[];
	markdown?: string;
	when_to_use: string[];
	workflow: string[];
	related_ops: string[];
	read_ops?: string[];
	write_ops?: string[];
	destructive_ops?: string[];
	materialized_tools?: string[];
	child_skills?: SkillLinkedResourcePayload[];
	reference_modules?: SkillLinkedResourcePayload[];
	guardrails?: string[];
	examples?: SkillExample[];
	notes?: string[];
	output_contract?: string;
}

export function isSkillHelpPayload(value: unknown): value is SkillHelpPayload {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const record = value as Record<string, unknown>;
	return record.type === 'skill' && typeof record.id === 'string';
}
