// apps/web/src/lib/services/agentic-chat/tools/skills/markdown-skill.ts
import { parse as parseYaml } from 'yaml';
import { ACTIVATIONS, ALTITUDES, SKILL_TYPES } from './skill.schema';
import type { SkillActivation, SkillAltitude, SkillDependency, SkillType } from './skill.schema';
import type {
	SkillDefinition,
	SkillExample,
	SkillLinkedResource,
	SkillLoadFormat,
	SkillResourceVisibility
} from './types';

type MarkdownSkillOptions = {
	id: string;
	markdown: string;
};

type MarkdownSkillFrontmatter = {
	name?: unknown;
	description?: unknown;
	catalog_line?: unknown;
	skill_type?: unknown;
	altitude?: unknown;
	activation?: unknown;
	dependencies?: unknown;
	parent_id?: unknown;
	depth?: unknown;
	preserve_markdown?: unknown;
	recommended_load_format?: unknown;
	legacy_paths?: unknown;
	child_skills?: unknown;
	reference_modules?: unknown;
};

function extractFrontmatter(markdown: string): {
	frontmatter: MarkdownSkillFrontmatter;
	body: string;
} {
	const trimmed = markdown.trim();
	const match = trimmed.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);

	if (!match) {
		throw new Error('Skill markdown is missing YAML frontmatter.');
	}

	const [, frontmatterSource] = match;
	if (typeof frontmatterSource !== 'string') {
		throw new Error('Skill markdown frontmatter could not be read.');
	}

	const parsed = parseYaml(frontmatterSource);
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error('Skill frontmatter must be a YAML object.');
	}

	return {
		frontmatter: parsed as MarkdownSkillFrontmatter,
		body: trimmed.slice(match[0].length).trim()
	};
}

function normalizeHeading(value: string): string {
	return value.trim().toLowerCase();
}

function collectSections(body: string): Record<string, string[]> {
	const sections: Record<string, string[]> = {};
	let currentSection: string | null = null;

	for (const line of body.split(/\r?\n/)) {
		const sectionMatch = line.match(/^##\s+(.+?)\s*$/);
		if (sectionMatch) {
			const [, title] = sectionMatch;
			if (typeof title !== 'string') continue;
			currentSection = normalizeHeading(title);
			sections[currentSection] = [];
			continue;
		}

		if (currentSection) {
			const currentLines = sections[currentSection];
			if (currentLines) {
				currentLines.push(line);
			}
		}
	}

	return sections;
}

function parseStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.filter((item): item is string => typeof item === 'string')
		.map((item) => item.trim())
		.filter((item) => item.length > 0);
}

function parseStringList(value: unknown): string[] {
	if (typeof value === 'string') {
		const trimmed = value.trim();
		return trimmed.length > 0 ? [trimmed] : [];
	}
	return parseStringArray(value);
}

function parseOptionalString(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function parseOptionalNumber(value: unknown): number | undefined {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value !== 'string') return undefined;
	const parsed = Number(value.trim());
	return Number.isFinite(parsed) ? parsed : undefined;
}

function parseOptionalBoolean(value: unknown): boolean {
	if (typeof value === 'boolean') return value;
	if (typeof value !== 'string') return false;
	return value.trim().toLowerCase() === 'true';
}

function parseVisibility(value: unknown): SkillResourceVisibility | undefined {
	const normalized = parseOptionalString(value);
	return normalized === 'public' || normalized === 'internal' ? normalized : undefined;
}

function parseSkillLoadFormat(value: unknown): SkillLoadFormat | undefined {
	const normalized = parseOptionalString(value);
	return normalized === 'short' || normalized === 'full' ? normalized : undefined;
}

function parseEnumValue<T extends string>(
	value: unknown,
	allowedValues: readonly T[]
): T | undefined {
	const normalized = parseOptionalString(value);
	return normalized && allowedValues.includes(normalized as T) ? (normalized as T) : undefined;
}

function parseSkillType(value: unknown): SkillType | undefined {
	return parseEnumValue(value, SKILL_TYPES);
}

function parseSkillAltitude(value: unknown): SkillAltitude | undefined {
	return parseEnumValue(value, ALTITUDES);
}

function parseSkillActivation(value: unknown): SkillActivation | undefined {
	return parseEnumValue(value, ACTIVATIONS);
}

function parseSkillDependencies(value: unknown): SkillDependency[] {
	if (!Array.isArray(value)) return [];

	return value
		.map((item): SkillDependency | null => {
			if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
			const record = item as Record<string, unknown>;
			const id = parseOptionalString(record.id);
			const owns = parseOptionalString(record.owns);
			if (!id || !owns) return null;
			return { id, owns };
		})
		.filter((item): item is SkillDependency => Boolean(item));
}

function parseLinkedResources(value: unknown): SkillLinkedResource[] {
	if (!Array.isArray(value)) return [];

	return value
		.map((item): SkillLinkedResource | null => {
			if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
			const record = item as Record<string, unknown>;
			const id = parseOptionalString(record.id);
			const summary = parseOptionalString(record.summary ?? record.description);
			if (!id || !summary) return null;

			return {
				id,
				name: parseOptionalString(record.name),
				summary,
				whenToLoad: parseStringList(record.when_to_load ?? record.whenToLoad),
				path: parseOptionalString(record.path),
				visibility: parseVisibility(record.visibility)
			};
		})
		.filter((item): item is SkillLinkedResource => Boolean(item));
}

function parseListItems(lines: string[], marker: RegExp): string[] {
	const items: string[] = [];
	let current: string | null = null;

	const flush = () => {
		if (!current) return;
		const value = current.trim();
		if (value.length > 0) {
			items.push(value);
		}
		current = null;
	};

	for (const line of lines) {
		const itemMatch = line.match(marker);
		if (itemMatch) {
			const [, itemValue] = itemMatch;
			if (typeof itemValue !== 'string') continue;
			flush();
			current = itemValue.trim();
			continue;
		}

		if (!current) continue;

		if (line.trim().length === 0) {
			flush();
			continue;
		}

		if (/^\s{2,}\S/.test(line)) {
			current = `${current} ${line.trim()}`;
			continue;
		}

		flush();
	}

	flush();
	return items;
}

function parseBulletList(lines: string[]): string[] {
	return parseListItems(lines, /^\s*[-*]\s+(.*)$/);
}

function parseOrderedList(lines: string[]): string[] {
	return parseListItems(lines, /^\s*\d+[.)]\s+(.*)$/);
}

function parseRelatedOps(lines: string[]): string[] {
	return parseBulletList(lines)
		.map((item) => {
			const match = item.match(/^`([^`]+)`$/);
			const codeValue = match?.[1];
			return typeof codeValue === 'string' ? codeValue.trim() : item.trim();
		})
		.filter((item) => item.length > 0);
}

// Canonical block ontology renames several H2 headers. Accept both the legacy
// header and its canonical-block alias so pre- and post-refactor skills parse
// identically during the rollout.
function pickSection(sections: Record<string, string[]>, headings: string[]): string[] {
	for (const heading of headings) {
		const lines = sections[heading];
		if (lines && lines.length > 0) return lines;
	}
	return [];
}

function parseWorkflowSections(sections: Record<string, string[]>): string[] {
	// Legacy "Workflow" and canonical "Procedure" both hold the ordered step list.
	const directWorkflow = parseOrderedList(pickSection(sections, ['workflow', 'procedure']));
	if (directWorkflow.length > 0) return directWorkflow;

	return Object.entries(sections).flatMap(([heading, lines]) => {
		if (
			!heading.startsWith('workflow') &&
			!heading.endsWith('workflow') &&
			heading !== 'procedure'
		)
			return [];
		return parseOrderedList(lines);
	});
}

function parseExamples(lines: string[]): SkillExample[] {
	const examples: SkillExample[] = [];
	let current: SkillExample | null = null;
	let currentStep: string | null = null;

	const flushStep = () => {
		if (!current || !currentStep) return;
		const value = currentStep.trim();
		if (value.length > 0) {
			current.next_steps.push(value);
		}
		currentStep = null;
	};

	const flushExample = () => {
		flushStep();
		if (!current) return;
		examples.push(current);
		current = null;
	};

	for (const line of lines) {
		const titleMatch = line.match(/^###\s+(.+?)\s*$/);
		if (titleMatch) {
			const [, title] = titleMatch;
			if (typeof title !== 'string') continue;
			flushExample();
			current = {
				description: title.trim(),
				next_steps: []
			};
			continue;
		}

		if (!current) continue;

		const itemMatch = line.match(/^\s*[-*]\s+(.*)$/);
		if (itemMatch) {
			const [, itemValue] = itemMatch;
			if (typeof itemValue !== 'string') continue;
			flushStep();
			currentStep = itemValue.trim();
			continue;
		}

		if (!currentStep) continue;

		if (line.trim().length === 0) {
			flushStep();
			continue;
		}

		if (/^\s{2,}\S/.test(line)) {
			currentStep = `${currentStep} ${line.trim()}`;
			continue;
		}

		flushStep();
	}

	flushExample();
	return examples;
}

export function defineMarkdownSkill({ id, markdown }: MarkdownSkillOptions): SkillDefinition {
	const { frontmatter, body } = extractFrontmatter(markdown);
	const sections = collectSections(body);

	if (typeof frontmatter.name !== 'string' || frontmatter.name.trim().length === 0) {
		throw new Error(`Skill "${id}" is missing a valid frontmatter name.`);
	}

	if (
		typeof frontmatter.description !== 'string' ||
		frontmatter.description.trim().length === 0
	) {
		throw new Error(`Skill "${id}" is missing a valid frontmatter description.`);
	}

	// Legacy header ?? canonical-block alias (Guardrails→Policy, Notes→Provenance, Output→Contract).
	const guardrails = parseBulletList(pickSection(sections, ['guardrails', 'policy']));
	const examples = parseExamples(sections['examples'] ?? []);
	const notes = parseBulletList(pickSection(sections, ['notes', 'provenance']));
	const outputContract = pickSection(sections, ['output', 'output contract', 'contract'])
		.join('\n')
		.trim();
	const catalogLine = parseOptionalString(frontmatter.catalog_line);
	const skillType = parseSkillType(frontmatter.skill_type);
	const altitude = parseSkillAltitude(frontmatter.altitude);
	const activation = parseSkillActivation(frontmatter.activation);
	const dependencies = parseSkillDependencies(frontmatter.dependencies);
	const parentId = parseOptionalString(frontmatter.parent_id);
	const depth = parseOptionalNumber(frontmatter.depth);
	const recommendedLoadFormat = parseSkillLoadFormat(frontmatter.recommended_load_format);
	const childSkills = parseLinkedResources(frontmatter.child_skills);
	const referenceModules = parseLinkedResources(frontmatter.reference_modules);

	const skill: SkillDefinition = {
		id,
		name: frontmatter.name.trim(),
		summary: frontmatter.description.trim(),
		bodyLineCount: body.split(/\r?\n/).length,
		rawMarkdown: markdown.trim(),
		sourceMarkdown: body,
		preserveMarkdown: parseOptionalBoolean(frontmatter.preserve_markdown),
		legacyPaths: parseStringArray(frontmatter.legacy_paths),
		relatedOps: parseRelatedOps(sections['related tools'] ?? []),
		whenToUse: parseBulletList(pickSection(sections, ['when to use', 'activation'])),
		workflow: parseWorkflowSections(sections),
		guardrails: guardrails.length > 0 ? guardrails : undefined,
		examples: examples.length > 0 ? examples : undefined,
		notes: notes.length > 0 ? notes : undefined,
		outputContract: outputContract.length > 0 ? outputContract : undefined
	};

	if (catalogLine) skill.catalogLine = catalogLine;
	if (skillType) skill.skillType = skillType;
	if (altitude) skill.altitude = altitude;
	if (activation) skill.activation = activation;
	if (dependencies.length > 0) skill.dependencies = dependencies;
	if (parentId) skill.parentId = parentId;
	if (typeof depth === 'number') skill.depth = depth;
	if (recommendedLoadFormat) skill.recommendedLoadFormat = recommendedLoadFormat;
	if (childSkills.length > 0) skill.childSkills = childSkills;
	if (referenceModules.length > 0) skill.referenceModules = referenceModules;

	return skill;
}
