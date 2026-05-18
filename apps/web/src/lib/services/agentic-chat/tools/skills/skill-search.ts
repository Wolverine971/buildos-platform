// apps/web/src/lib/services/agentic-chat/tools/skills/skill-search.ts
import { loadDomain } from '../domains/domain-load';
import { listAllSkills } from './registry';
import type { SkillDefinition } from './types';

export type SkillSearchOptions = {
	query?: string;
	domain?: string;
	capability?: string;
	limit?: number;
};

type SkillSearchMatch = {
	skill_id: string;
	name: string;
	parent_id?: string;
	depth?: number;
	confidence: number;
	summary: string;
	when_to_use: string[];
	related_ops: string[];
	load_hint: string;
};

function normalize(value: string): string {
	return value.trim().toLowerCase();
}

function tokenize(value: string): string[] {
	return normalize(value)
		.split(/[^a-z0-9_]+/)
		.map((token) => token.trim())
		.filter((token) => token.length >= 2);
}

function unique(items: string[]): string[] {
	return Array.from(new Set(items));
}

function isDomainPayload(value: unknown): value is {
	type: 'domain';
	skills: Array<{ id: string }>;
	recommended_skill_stacks: Array<{ skill_ids: string[] }>;
	capability_ids: string[];
} {
	return (
		Boolean(value) &&
		typeof value === 'object' &&
		!Array.isArray(value) &&
		(value as Record<string, unknown>).type === 'domain' &&
		Array.isArray((value as Record<string, unknown>).skills)
	);
}

function getDomainSkillIds(domain?: string): Set<string> | null {
	if (!domain?.trim()) return null;
	const loaded = loadDomain(domain);
	if (!isDomainPayload(loaded)) return new Set();
	return new Set(
		unique([
			...loaded.skills.map((skill) => skill.id),
			...loaded.recommended_skill_stacks.flatMap((stack) => stack.skill_ids)
		])
	);
}

function skillMatchesCapability(skill: SkillDefinition, capability?: string): boolean {
	if (!capability?.trim()) return true;
	const normalized = normalize(capability);
	const haystack = [skill.id, skill.name, skill.summary, ...skill.relatedOps]
		.join(' ')
		.toLowerCase();
	return haystack.includes(normalized);
}

function computeScore(skill: SkillDefinition, query: string): number {
	if (!query) return 1;
	const normalizedQuery = normalize(query);
	const tokens = tokenize(query);
	const haystack = [
		skill.id,
		skill.name,
		skill.summary,
		skill.parentId,
		...skill.legacyPaths,
		...skill.whenToUse,
		...skill.relatedOps,
		...(skill.childSkills?.map((child) => child.id) ?? []),
		...(skill.referenceModules?.map((module) => module.id) ?? [])
	]
		.filter((value): value is string => typeof value === 'string' && value.length > 0)
		.join(' ')
		.toLowerCase();

	let score = 0;
	if (skill.id === normalizedQuery) score += 220;
	if (normalize(skill.name) === normalizedQuery) score += 180;
	if (skill.id.includes(normalizedQuery)) score += 90;
	if (normalize(skill.name).includes(normalizedQuery)) score += 80;
	if (skill.legacyPaths.some((path) => normalize(path) === normalizedQuery)) score += 140;

	for (const token of tokens) {
		if (skill.id.includes(token)) score += 30;
		if (haystack.includes(token)) score += 16;
	}

	return score;
}

function confidenceFromScore(score: number): number {
	if (score <= 0) return 0;
	return Math.min(0.95, Math.max(0.35, Number((score / 220).toFixed(2))));
}

function toMatch(skill: SkillDefinition, score: number): SkillSearchMatch {
	return {
		skill_id: skill.id,
		name: skill.name,
		parent_id: skill.parentId,
		depth: skill.depth,
		confidence: confidenceFromScore(score),
		summary: skill.summary,
		when_to_use: skill.whenToUse.slice(0, 4),
		related_ops: skill.relatedOps.slice(0, 8),
		load_hint: skill.parentId
			? 'Load only when this child skill is the specific needed lens.'
			: 'Load this root skill when the current task needs its workflow playbook.'
	};
}

export function searchSkills(options: SkillSearchOptions = {}): Record<string, unknown> {
	const query = typeof options.query === 'string' ? options.query.trim() : '';
	const domain = typeof options.domain === 'string' ? options.domain.trim() : '';
	const capability = typeof options.capability === 'string' ? options.capability.trim() : '';
	const domainSkillIds = getDomainSkillIds(domain);
	const limit = Math.max(1, Math.min(20, options.limit ?? 8));

	const matches = listAllSkills()
		.filter((skill) => {
			if (domainSkillIds && !domainSkillIds.has(skill.id)) return false;
			if (!skillMatchesCapability(skill, capability)) return false;
			return true;
		})
		.map((skill) => ({
			skill,
			score: computeScore(skill, query)
		}))
		.filter(({ score }) => score > 0)
		.sort((a, b) => {
			if (b.score !== a.score) return b.score - a.score;
			if (a.skill.parentId && !b.skill.parentId) return 1;
			if (!a.skill.parentId && b.skill.parentId) return -1;
			return a.skill.id.localeCompare(b.skill.id);
		})
		.slice(0, limit)
		.map(({ skill, score }) => toMatch(skill, score));

	return {
		type: 'skill_search_results',
		query: query || null,
		filters: {
			domain: domain || null,
			capability: capability || null
		},
		total_matches: matches.length,
		matches,
		next_step:
			'Pick the most relevant root skill by default. Load a child skill only when the user intent or loaded root skill makes that narrow lens clear.'
	};
}
