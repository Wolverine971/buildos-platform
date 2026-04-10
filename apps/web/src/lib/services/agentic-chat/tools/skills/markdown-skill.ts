// apps/web/src/lib/services/agentic-chat/tools/skills/markdown-skill.ts
import { parse as parseYaml } from 'yaml';
import type { SkillDefinition, SkillExample } from './types';

type MarkdownSkillOptions = {
	id: string;
	markdown: string;
};

type MarkdownSkillFrontmatter = {
	name?: unknown;
	description?: unknown;
	legacy_paths?: unknown;
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

	const guardrails = parseBulletList(sections['guardrails'] ?? []);
	const examples = parseExamples(sections['examples'] ?? []);
	const notes = parseBulletList(sections['notes'] ?? []);

	return {
		id,
		name: frontmatter.name.trim(),
		summary: frontmatter.description.trim(),
		legacyPaths: parseStringArray(frontmatter.legacy_paths),
		relatedOps: parseRelatedOps(sections['related tools'] ?? []),
		whenToUse: parseBulletList(sections['when to use'] ?? []),
		workflow: parseOrderedList(sections['workflow'] ?? []),
		guardrails: guardrails.length > 0 ? guardrails : undefined,
		examples: examples.length > 0 ? examples : undefined,
		notes: notes.length > 0 ? notes : undefined
	};
}
