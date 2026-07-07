// apps/web/src/lib/services/agentic-chat/tools/skills/skill-load.ts
import { getToolRegistry } from '../registry/tool-registry';
import { normalizeGatewayOpName } from '../registry/gateway-op-aliases';
import { getSkillByReference, listChildSkillsForSkill } from './registry';
import { canReadSkillReference } from './skill-reference-visibility';
import type {
	SkillDefinition,
	SkillHelpPayload,
	SkillLinkedResourcePayload,
	SkillLoadFormat,
	SkillReferenceLoadSurface
} from './types';
export type { SkillLoadFormat } from './types';

export type SkillLoadOptions = {
	format?: SkillLoadFormat;
	include_examples?: boolean;
	surface?: SkillReferenceLoadSurface;
};

type RelatedOpsResolution = {
	materializedToolNames: string[];
	readOps: string[];
	writeOps: string[];
	destructiveOps: string[];
};

const DESTRUCTIVE_RELATED_OP_ACTIONS = new Set([
	'delete',
	'archive',
	'restore',
	'unlink',
	'reorganize'
]);

const DESTRUCTIVE_TOOL_PREFIXES = ['delete_', 'archive_', 'restore_', 'unlink_', 'reorganize_'];

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

function renderPreservedSkillMarkdown(
	skill: SkillDefinition,
	childSkills: SkillLinkedResourcePayload[],
	referenceModules: SkillLinkedResourcePayload[]
): string {
	const body = skill.sourceMarkdown?.trim();
	const sections = [
		body ?? renderSkillMarkdown(skill, childSkills, referenceModules),
		renderLinkedResourcesSection('Child Skills', childSkills),
		renderLinkedResourcesSection('Reference Modules', referenceModules),
		skill.relatedOps.length > 0
			? ['## Related Tools', ...skill.relatedOps.map((op) => `- \`${op}\``)].join('\n')
			: ''
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

function isDestructiveRelatedOp(entry: {
	action?: string;
	op: string;
	tool_name: string;
}): boolean {
	if (entry.action && DESTRUCTIVE_RELATED_OP_ACTIONS.has(entry.action)) return true;
	if (DESTRUCTIVE_TOOL_PREFIXES.some((prefix) => entry.tool_name.startsWith(prefix))) {
		return true;
	}
	const normalizedOp = entry.op.toLowerCase();
	return (
		normalizedOp.endsWith('.delete') ||
		normalizedOp.endsWith('.archive') ||
		normalizedOp.endsWith('.restore') ||
		normalizedOp.endsWith('.unlink') ||
		normalizedOp.endsWith('.reorganize')
	);
}

function resolveRelatedOps(relatedOps: string[]): RelatedOpsResolution {
	const registry = getToolRegistry();
	const materializedToolNames = new Set<string>();
	const readOps = new Set<string>();
	const writeOps = new Set<string>();
	const destructiveOps = new Set<string>();

	for (const op of relatedOps) {
		const normalizedOp = normalizeGatewayOpName(op);
		const entry = registry.ops[normalizedOp];
		if (!entry) continue;

		if (entry.kind === 'write') {
			if (isDestructiveRelatedOp(entry)) {
				destructiveOps.add(entry.op);
			} else {
				writeOps.add(entry.op);
			}
			continue;
		}

		readOps.add(entry.op);
		materializedToolNames.add(entry.tool_name);
	}

	return {
		materializedToolNames: Array.from(materializedToolNames).sort((a, b) => a.localeCompare(b)),
		readOps: Array.from(readOps).sort((a, b) => a.localeCompare(b)),
		writeOps: Array.from(writeOps).sort((a, b) => a.localeCompare(b)),
		destructiveOps: Array.from(destructiveOps).sort((a, b) => a.localeCompare(b))
	};
}

export function getRecommendedSkillLoadFormat(skill: SkillDefinition): SkillLoadFormat {
	if (skill.recommendedLoadFormat) return skill.recommendedLoadFormat;
	return skill.preserveMarkdown ? 'full' : 'short';
}

export function buildSkillLoadPayload(
	skill: SkillDefinition,
	version: string,
	format: SkillLoadFormat,
	includeExamples: boolean,
	surface: SkillReferenceLoadSurface = 'chat_internal'
): SkillHelpPayload {
	const childSkillPayloads = mergeLinkedResourcePayloads(
		skill.childSkills?.map(mapLinkedResource) ?? [],
		listChildSkillsForSkill(skill).map(mapRegisteredChildSkill)
	);
	const referenceModulePayloads =
		skill.referenceModules
			?.filter((resource) => canReadSkillReference(resource, surface))
			.map(mapLinkedResource) ?? [];
	const relatedOpsResolution = resolveRelatedOps(skill.relatedOps);
	const payload: SkillHelpPayload = {
		type: 'skill',
		id: skill.id,
		name: skill.name,
		format,
		recommended_load_format: getRecommendedSkillLoadFormat(skill),
		version,
		description: skill.summary,
		summary: skill.summary,
		legacy_paths: skill.legacyPaths,
		when_to_use: skill.whenToUse,
		workflow: skill.workflow.map((step, index) => `${index + 1}) ${step}`),
		related_ops: skill.relatedOps,
		materialized_tools: relatedOpsResolution.materializedToolNames
	};

	if (payload.materialized_tools?.length === 0) {
		delete payload.materialized_tools;
	}

	if (relatedOpsResolution.readOps.length) {
		payload.read_ops = relatedOpsResolution.readOps;
	}

	if (relatedOpsResolution.writeOps.length) {
		payload.write_ops = relatedOpsResolution.writeOps;
	}

	if (relatedOpsResolution.destructiveOps.length) {
		payload.destructive_ops = relatedOpsResolution.destructiveOps;
	}

	if (skill.parentId) {
		payload.parent_id = skill.parentId;
	}

	if (typeof skill.depth === 'number') {
		payload.depth = skill.depth;
	}

	if (skill.skillType) {
		payload.skill_type = skill.skillType;
	}

	if (skill.altitude) {
		payload.altitude = skill.altitude;
	}

	if (skill.activation) {
		payload.activation = skill.activation;
	}

	if (skill.dependencies?.length) {
		payload.dependencies = skill.dependencies.map((dependency) => ({ ...dependency }));
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

	if (skill.outputContract) {
		payload.output_contract = skill.outputContract;
	}

	if (includeExamples && skill.examples?.length) {
		payload.examples = skill.examples;
	}

	if (format === 'full' && skill.notes?.length) {
		payload.notes = skill.notes;
	}

	if (format === 'full') {
		const markdownSkill = {
			...skill,
			examples: includeExamples ? skill.examples : undefined
		};
		payload.markdown = skill.preserveMarkdown
			? renderPreservedSkillMarkdown(
					markdownSkill,
					childSkillPayloads,
					referenceModulePayloads
				)
			: renderSkillMarkdown(markdownSkill, childSkillPayloads, referenceModulePayloads);
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
	const includeExamples = options.include_examples !== false;

	if (!skill) {
		return {
			type: 'not_found',
			skill: trimmedReference,
			format: options.format ?? 'short',
			version: registry.version,
			message: 'No skill found for this reference.'
		};
	}

	const format: SkillLoadFormat = options.format ?? getRecommendedSkillLoadFormat(skill);

	return buildSkillLoadPayload(
		skill,
		registry.version,
		format,
		includeExamples,
		options.surface ?? 'chat_internal'
	);
}
