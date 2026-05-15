// apps/web/src/lib/services/agentic-chat/tools/skills/skill-reference-load.ts
import { getToolRegistry } from '../registry/tool-registry';
import { getSkillByReference } from './registry';
import type { SkillDefinition, SkillLinkedResourcePayload } from './types';

const referenceContentModules = import.meta.glob<string>('./definitions/**/references/*.md', {
	eager: true,
	query: '?raw',
	import: 'default'
});

export type SkillReferenceLoadPayload = {
	type: 'skill_reference';
	skill_id: string;
	reference_id: string;
	name?: string;
	summary: string;
	when_to_load: string[];
	path: string;
	visibility?: SkillLinkedResourcePayload['visibility'];
	version: string;
	content: string;
};

function normalizeReference(value: string): string {
	return value.trim();
}

function isSafeRelativeReferencePath(path: string): boolean {
	if (!path || path.startsWith('/') || path.startsWith('\\')) return false;
	if (path.includes('\0')) return false;
	const segments = path.split(/[\\/]+/);
	return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

function findReferenceModule(skill: SkillDefinition, reference: string) {
	const normalized = normalizeReference(reference);
	return skill.referenceModules?.find((module) => {
		return module.id === normalized || module.path === normalized || module.name === normalized;
	});
}

function buildModuleKey(skillId: string, path: string): string | null {
	const normalizedPath = path.replace(/\\/g, '/').replace(/^\.\//, '');
	if (!isSafeRelativeReferencePath(normalizedPath)) return null;
	return `./definitions/${skillId}/${normalizedPath}`;
}

export function loadSkillReference(
	skillReference: string,
	reference: string
): SkillReferenceLoadPayload | Record<string, unknown> {
	const registry = getToolRegistry();
	const skill = getSkillByReference(skillReference.trim());
	if (!skill) {
		return {
			type: 'not_found',
			skill: skillReference.trim(),
			reference: reference.trim(),
			version: registry.version,
			message: 'No skill found for this reference.'
		};
	}

	const module = findReferenceModule(skill, reference);
	if (!module || !module.path) {
		return {
			type: 'not_found',
			skill_id: skill.id,
			reference: reference.trim(),
			version: registry.version,
			available_references:
				skill.referenceModules?.map((item) => ({
					id: item.id,
					name: item.name,
					path: item.path,
					summary: item.summary
				})) ?? [],
			message: 'No declared reference module found for this skill.'
		};
	}

	const moduleKey = buildModuleKey(skill.id, module.path);
	const content = moduleKey ? referenceContentModules[moduleKey] : undefined;
	if (typeof content !== 'string') {
		return {
			type: 'not_found',
			skill_id: skill.id,
			reference_id: module.id,
			path: module.path,
			version: registry.version,
			message: 'Declared reference module content was not bundled.'
		};
	}

	const payload: SkillReferenceLoadPayload = {
		type: 'skill_reference',
		skill_id: skill.id,
		reference_id: module.id,
		summary: module.summary,
		when_to_load: module.whenToLoad,
		path: module.path,
		version: registry.version,
		content
	};
	if (module.name) payload.name = module.name;
	if (module.visibility) payload.visibility = module.visibility;
	return payload;
}
