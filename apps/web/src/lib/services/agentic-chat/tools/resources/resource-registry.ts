// apps/web/src/lib/services/agentic-chat/tools/resources/resource-registry.ts
import { listDomains } from '../domains/catalog';
import { listAllSkills } from '../skills/registry';
import { loadSkillReference } from '../skills/skill-reference-load';

export type ResourceKind = 'domain_resource' | 'skill_reference';

export type ResourceDefinition = {
	id: string;
	kind: ResourceKind;
	title?: string;
	summary: string;
	whenToLoad: string[];
	domainIds: string[];
	skillIds: string[];
	skillId?: string;
	path?: string;
	visibility?: 'public' | 'internal';
};

export type ResourceSearchOptions = {
	query?: string;
	domain?: string;
	skill?: string;
	limit?: number;
};

function unique(items: string[]): string[] {
	return Array.from(new Set(items));
}

function normalize(value: string): string {
	return value.trim().toLowerCase();
}

function tokenize(value: string): string[] {
	return normalize(value)
		.split(/[^a-z0-9_]+/)
		.map((token) => token.trim())
		.filter((token) => token.length >= 2);
}

function buildSkillDomainMap(): Map<string, string[]> {
	const map = new Map<string, string[]>();
	for (const domain of listDomains()) {
		const skillIds = unique([
			...domain.skills.map((skill) => skill.id),
			...(domain.recommendedSkillStacks?.flatMap((stack) => stack.skillIds) ?? [])
		]);
		for (const skillId of skillIds) {
			map.set(skillId, unique([...(map.get(skillId) ?? []), domain.id]));
		}
	}
	return map;
}

export function listResources(): ResourceDefinition[] {
	const skillDomainMap = buildSkillDomainMap();
	const domainResources = listDomains().flatMap<ResourceDefinition>((domain) =>
		(domain.resources ?? []).map((resource) => ({
			id: resource.id,
			kind: 'domain_resource',
			title: resource.title,
			summary: resource.summary,
			whenToLoad: resource.whenToLoad,
			domainIds: [domain.id],
			skillIds: domain.skills.map((skill) => skill.id)
		}))
	);
	const skillReferences = listAllSkills().flatMap<ResourceDefinition>((skill) =>
		(skill.referenceModules ?? []).map((resource) => ({
			id: resource.id,
			kind: 'skill_reference',
			title: resource.name,
			summary: resource.summary,
			whenToLoad: resource.whenToLoad,
			domainIds: skillDomainMap.get(skill.id) ?? [],
			skillIds: [skill.id],
			skillId: skill.id,
			path: resource.path,
			visibility: resource.visibility
		}))
	);

	return [...domainResources, ...skillReferences].sort((a, b) => a.id.localeCompare(b.id));
}

function computeScore(resource: ResourceDefinition, query: string): number {
	if (!query) return 1;
	const normalizedQuery = normalize(query);
	const tokens = tokenize(query);
	const haystack = [
		resource.id,
		resource.title,
		resource.summary,
		resource.kind,
		resource.path,
		...resource.whenToLoad,
		...resource.domainIds,
		...resource.skillIds
	]
		.filter((value): value is string => typeof value === 'string' && value.length > 0)
		.join(' ')
		.toLowerCase();

	let score = 0;
	if (resource.id === normalizedQuery) score += 220;
	if (resource.title && normalize(resource.title) === normalizedQuery) score += 160;
	if (resource.id.includes(normalizedQuery)) score += 90;
	if (resource.title && normalize(resource.title).includes(normalizedQuery)) score += 70;
	for (const token of tokens) {
		if (resource.id.includes(token)) score += 30;
		if (haystack.includes(token)) score += 16;
	}
	return score;
}

function confidenceFromScore(score: number): number {
	if (score <= 0) return 0;
	return Math.min(0.95, Math.max(0.35, Number((score / 220).toFixed(2))));
}

export function searchResources(options: ResourceSearchOptions = {}): Record<string, unknown> {
	const query = typeof options.query === 'string' ? options.query.trim() : '';
	const domain = typeof options.domain === 'string' ? options.domain.trim() : '';
	const skill = typeof options.skill === 'string' ? options.skill.trim() : '';
	const limit = Math.max(1, Math.min(20, options.limit ?? 8));
	const matches = listResources()
		.filter((resource) => {
			if (domain && !resource.domainIds.includes(domain)) return false;
			if (skill && !resource.skillIds.includes(skill)) return false;
			return true;
		})
		.map((resource) => ({
			resource,
			score: computeScore(resource, query)
		}))
		.filter(({ score }) => score > 0)
		.sort((a, b) => {
			if (b.score !== a.score) return b.score - a.score;
			return a.resource.id.localeCompare(b.resource.id);
		})
		.slice(0, limit)
		.map(({ resource, score }) => ({
			resource_id: resource.id,
			kind: resource.kind,
			title: resource.title,
			confidence: confidenceFromScore(score),
			summary: resource.summary,
			when_to_load: resource.whenToLoad.slice(0, 4),
			domain_ids: resource.domainIds.slice(0, 6),
			skill_ids: resource.skillIds.slice(0, 6),
			skill_id: resource.skillId,
			path: resource.path,
			visibility: resource.visibility
		}));

	return {
		type: 'resource_search_results',
		query: query || null,
		filters: {
			domain: domain || null,
			skill: skill || null
		},
		total_matches: matches.length,
		matches,
		materialized_tools: matches.length > 0 ? ['resource_load'] : [],
		next_step:
			'Load a resource only when source detail, examples, templates, or provenance would change the answer.'
	};
}

export function loadResource(resourceId: string): Record<string, unknown> {
	const id = resourceId.trim();
	const resource = listResources().find((item) => item.id === id);
	if (!resource) {
		return {
			type: 'not_found',
			resource: id,
			available_resources: listResources()
				.slice(0, 20)
				.map((item) => ({ id: item.id, kind: item.kind, title: item.title })),
			message: 'No resource found for this id.'
		};
	}

	if (resource.kind === 'skill_reference' && resource.skillId) {
		return loadSkillReference(resource.skillId, resource.id);
	}

	return {
		type: 'resource',
		resource_id: resource.id,
		kind: resource.kind,
		title: resource.title,
		summary: resource.summary,
		when_to_load: resource.whenToLoad,
		domain_ids: resource.domainIds,
		skill_ids: resource.skillIds,
		message:
			'This resource is indexed for routing, but no bundled content loader is registered yet.'
	};
}
