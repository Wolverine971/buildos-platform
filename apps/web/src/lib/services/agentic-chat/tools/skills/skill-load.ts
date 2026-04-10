// apps/web/src/lib/services/agentic-chat/tools/skills/skill-load.ts
import { getToolRegistry } from '../registry/tool-registry';
import { getSkillByReference } from './registry';
import type { SkillDefinition, SkillHelpPayload } from './types';

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

function renderSkillMarkdown(skill: SkillDefinition): string {
	const sections = [
		`# ${skill.name}`,
		skill.summary,
		renderBulletSection('When to Use', skill.whenToUse),
		renderNumberedSection('Workflow', skill.workflow),
		skill.relatedOps.length > 0
			? ['## Related Tools', ...skill.relatedOps.map((op) => `- \`${op}\``)].join('\n')
			: '',
		renderBulletSection('Guardrails', skill.guardrails ?? []),
		renderExamples(skill),
		renderBulletSection('Notes', skill.notes ?? [])
	].filter((section) => section.length > 0);

	return sections.join('\n\n');
}

export function buildSkillLoadPayload(
	skill: SkillDefinition,
	version: string,
	format: SkillLoadFormat,
	includeExamples: boolean
): SkillHelpPayload {
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
		related_ops: skill.relatedOps
	};

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
		payload.markdown = renderSkillMarkdown({
			...skill,
			examples: includeExamples ? skill.examples : undefined
		});
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
