// apps/web/src/lib/services/agentic-chat/tools/skills/skill-load.ts
import { getToolRegistry } from '../registry/tool-registry';
import { getSkillByReference, listChildSkillsForSkill } from './registry';
import type { SkillDefinition, SkillHelpPayload, SkillLinkedResourcePayload } from './types';

export type SkillLoadFormat = 'short' | 'full';

export type SkillLoadOptions = {
	format?: SkillLoadFormat;
	include_examples?: boolean;
};

function renderBulletSection(title: string, items: string[]): string {
	if (items.length === 0) return '';
	return [`## ${title}`, ...items.map((item) => `- ${item}`)].join('\n');
}

function renderNumberedSection(title: string, items: string[]): string {
	if (items.length === 0) return '';
	return [`## ${title}`, ...items.map((item, index) => `${index + 1}. ${item}`)].join('\n');
}

function renderExamples(skill: SkillDefinition): string {
	if (!skill.examples?.length) return '';

	return [
		'## Examples',
		...skill.examples.flatMap((example) => [
			`### ${example.description}`,
			...example.next_steps.map((step) => `- ${step}`)
		])
	].join('\n');
}

function renderLinkedResourcesSection(
	title: string,
	resources: SkillLinkedResourcePayload[]
): string {
	if (!resources?.length) return '';
	return [
		`## ${title}`,
		...resources.map((resource) => {
			const details = [
				resource.summary,
				resource.when_to_load.length > 0
					? `Load when: ${resource.when_to_load.join(' ')}`
					: '',
				resource.path ? `Path: \`${resource.path}\`` : '',
				resource.visibility ? `Visibility: ${resource.visibility}` : ''
			].filter((part) => part.length > 0);
			return `- \`${resource.id}\`: ${details.join(' ')}`;
		})
	].join('\n');
}

function renderSkillMarkdown(
	skill: SkillDefinition,
	childSkills: SkillLinkedResourcePayload[],
	referenceModules: SkillLinkedResourcePayload[]
): string {
	const sections = [
		`# ${skill.name}`,
		skill.summary,
		renderBulletSection('When to Use', skill.whenToUse),
		renderNumberedSection('Workflow', skill.workflow),
		renderLinkedResourcesSection('Child Skills', childSkills),
		renderLinkedResourcesSection('Reference Modules', referenceModules),
		skill.relatedOps.length > 0
			? ['## Related Tools', ...skill.relatedOps.map((op) => `- \`${op}\``)].join('\n')
			: '',
		renderBulletSection('Guardrails', skill.guardrails ?? []),
		renderExamples(skill),
		renderBulletSection('Notes', skill.notes ?? [])
	].filter((section) => section.length > 0);

	return sections.join('\n\n');
}

function mapLinkedResource(
	resource: NonNullable<SkillDefinition['childSkills']>[number]
): SkillLinkedResourcePayload {
	const payload: SkillLinkedResourcePayload = {
		id: resource.id,
		summary: resource.summary,
		when_to_load: resource.whenToLoad
	};
	if (resource.name) payload.name = resource.name;
	if (resource.path) payload.path = resource.path;
	if (resource.visibility) payload.visibility = resource.visibility;
	return payload;
}

function mapRegisteredChildSkill(skill: SkillDefinition): SkillLinkedResourcePayload {
	return {
		id: skill.id,
		name: skill.name,
		summary: skill.summary,
		when_to_load: skill.whenToUse.slice(0, 4)
	};
}

function mergeLinkedResourcePayloads(
	explicitResources: SkillLinkedResourcePayload[],
	inferredResources: SkillLinkedResourcePayload[]
): SkillLinkedResourcePayload[] {
	const resourcesById = new Map<string, SkillLinkedResourcePayload>();
	for (const resource of [...inferredResources, ...explicitResources]) {
		resourcesById.set(resource.id, resource);
	}
	return [...resourcesById.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function resolveRelatedOpToolNames(relatedOps: string[]): string[] {
	const registry = getToolRegistry();
	const toolNames = new Set<string>();
	for (const op of relatedOps) {
		const toolName = registry.ops[op]?.tool_name;
		if (toolName) {
			toolNames.add(toolName);
		}
	}
	return Array.from(toolNames).sort((a, b) => a.localeCompare(b));
}

export function buildSkillLoadPayload(
	skill: SkillDefinition,
	version: string,
	format: SkillLoadFormat,
	includeExamples: boolean
): SkillHelpPayload {
	const childSkillPayloads = mergeLinkedResourcePayloads(
		skill.childSkills?.map(mapLinkedResource) ?? [],
		listChildSkillsForSkill(skill).map(mapRegisteredChildSkill)
	);
	const referenceModulePayloads = skill.referenceModules?.map(mapLinkedResource) ?? [];
	const payload: SkillHelpPayload = {
		type: 'skill',
		id: skill.id,
		name: skill.name,
		format,
		version,
		description: skill.summary,
		summary: skill.summary,
		legacy_paths: skill.legacyPaths,
		when_to_use: skill.whenToUse,
		workflow: skill.workflow.map((step, index) => `${index + 1}) ${step}`),
		related_ops: skill.relatedOps,
		materialized_tools: resolveRelatedOpToolNames(skill.relatedOps)
	};

	if (payload.materialized_tools?.length === 0) {
		delete payload.materialized_tools;
	}

	if (skill.parentId) {
		payload.parent_id = skill.parentId;
	}

	if (typeof skill.depth === 'number') {
		payload.depth = skill.depth;
	}

	if (childSkillPayloads.length) {
		payload.child_skills = childSkillPayloads;
	}

	if (referenceModulePayloads.length) {
		payload.reference_modules = referenceModulePayloads;
	}

	if (skill.guardrails?.length) {
		payload.guardrails = skill.guardrails;
	}

	if (includeExamples && skill.examples?.length) {
		payload.examples = skill.examples;
	}

	if (format === 'full' && skill.notes?.length) {
		payload.notes = skill.notes;
	}

	if (format === 'full') {
		payload.markdown = renderSkillMarkdown(
			{
				...skill,
				examples: includeExamples ? skill.examples : undefined
			},
			childSkillPayloads,
			referenceModulePayloads
		);
	}

	return payload;
}

export function loadSkill(
	reference: string,
	options: SkillLoadOptions = {}
): SkillHelpPayload | Record<string, unknown> {
	const registry = getToolRegistry();
	const trimmedReference = reference.trim();
	const skill = getSkillByReference(trimmedReference);
	const format: SkillLoadFormat = options.format ?? 'short';
	const includeExamples = options.include_examples !== false;

	if (!skill) {
		return {
			type: 'not_found',
			skill: trimmedReference,
			format,
			version: registry.version,
			message: 'No skill found for this reference.'
		};
	}

	return buildSkillLoadPayload(skill, registry.version, format, includeExamples);
}
