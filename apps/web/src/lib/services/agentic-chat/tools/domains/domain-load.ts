// apps/web/src/lib/services/agentic-chat/tools/domains/domain-load.ts
import { getDomainById, listChildDomains, listDomains } from './catalog';
import type {
	DomainDefinition,
	DomainLoadPayload,
	DomainSearchMatch,
	DomainSearchPayload
} from './types';
import { listWorkCapabilitiesForDomain } from '../work-capabilities';

export type DomainSearchOptions = {
	query?: string;
	limit?: number;
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

function unique<T>(items: T[]): T[] {
	return Array.from(new Set(items));
}

function getSkillIds(domain: DomainDefinition): string[] {
	return unique(domain.skills.map((skill) => skill.id)).sort((a, b) => a.localeCompare(b));
}

function computeScore(
	domain: DomainDefinition,
	query: string
): { score: number; aliasesHit: string[] } {
	if (!query) return { score: 1, aliasesHit: [] };

	const normalizedQuery = normalize(query);
	const tokens = tokenize(query);
	const aliasesHit = domain.aliases.filter((alias) => normalizedQuery.includes(normalize(alias)));
	const skillIds = getSkillIds(domain);
	const haystack = [
		domain.id,
		domain.name,
		domain.summary,
		...domain.aliases,
		...domain.capabilityIds,
		...skillIds
	]
		.join(' ')
		.toLowerCase();

	let score = 0;
	if (domain.id === normalizedQuery) score += 220;
	if (normalize(domain.name) === normalizedQuery) score += 180;
	if (domain.id.includes(normalizedQuery)) score += 90;
	if (normalize(domain.name).includes(normalizedQuery)) score += 80;
	score += aliasesHit.length * 70;

	for (const token of tokens) {
		if (domain.id.includes(token)) score += 30;
		if (haystack.includes(token)) score += 16;
	}

	return { score, aliasesHit };
}

function confidenceFromScore(score: number): number {
	if (score <= 0) return 0;
	return Math.min(0.95, Math.max(0.35, Number((score / 220).toFixed(2))));
}

function nextStepForDomain(domain: DomainDefinition): string {
	if (domain.coverageStatus === 'strong') {
		return 'Load this domain, then load the closest work capability or skill only if the user needs workflow guidance.';
	}
	if (domain.coverageStatus === 'partial') {
		return 'Load this domain to see available work capabilities, skills, and known gaps before choosing a general answer or skill.';
	}
	return 'Load this domain to confirm the gap, help from general context, and avoid pretending a dedicated skill exists.';
}

function toSearchMatch(
	domain: DomainDefinition,
	score: number,
	aliasesHit: string[]
): DomainSearchMatch {
	return {
		domain_id: domain.id,
		name: domain.name,
		confidence: confidenceFromScore(score),
		coverage_status: domain.coverageStatus,
		parent_ids: domain.parentIds,
		aliases_hit: aliasesHit,
		skill_ids: getSkillIds(domain),
		work_capability_ids: listWorkCapabilitiesForDomain(domain.id).map(
			(capability) => capability.id
		),
		related_domain_ids: domain.relatedDomainIds ?? [],
		next_step: nextStepForDomain(domain)
	};
}

export function searchDomains(options: DomainSearchOptions = {}): DomainSearchPayload {
	const query = typeof options.query === 'string' ? options.query.trim() : '';
	const limit = Math.max(1, Math.min(12, options.limit ?? 6));
	const matches = listDomains()
		.map((domain) => {
			const { score, aliasesHit } = computeScore(domain, query);
			return { domain, score, aliasesHit };
		})
		.filter(({ score }) => score > 0)
		.sort((a, b) => {
			if (b.score !== a.score) return b.score - a.score;
			return a.domain.id.localeCompare(b.domain.id);
		})
		.slice(0, limit)
		.map(({ domain, score, aliasesHit }) => toSearchMatch(domain, score, aliasesHit));

	return {
		type: 'domain_search_results',
		query: query || null,
		total_matches: matches.length,
		matches,
		materialized_tools: matches.length > 0 ? ['domain_load'] : [],
		next_step:
			'Pick the closest subject domain. Call domain_load with domain_id when domain boundaries, linked skills, or coverage gaps would help choose the next skill/tool.'
	};
}

export function loadDomain(domainId: string): DomainLoadPayload | Record<string, unknown> {
	const normalizedDomainId = domainId.trim().toLowerCase();
	const domain = getDomainById(normalizedDomainId);
	if (!domain) {
		return {
			type: 'not_found',
			domain: normalizedDomainId,
			available_domains: listDomains().map((item) => ({
				id: item.id,
				name: item.name,
				coverage_status: item.coverageStatus
			})),
			message: 'No domain found for this id.'
		};
	}

	const childDomains = listChildDomains(domain.id).map((child) => ({
		id: child.id,
		name: child.name,
		coverage_status: child.coverageStatus,
		summary: child.summary
	}));
	const workCapabilities = listWorkCapabilitiesForDomain(domain.id);

	const payload: DomainLoadPayload = {
		type: 'domain',
		domain_id: domain.id,
		name: domain.name,
		summary: domain.summary,
		coverage_status: domain.coverageStatus,
		parent_ids: domain.parentIds,
		child_domains: childDomains,
		related_domain_ids: domain.relatedDomainIds ?? [],
		boundaries: domain.boundaries,
		capability_ids: domain.capabilityIds,
		work_capability_ids: workCapabilities.map((capability) => capability.id),
		skills: domain.skills.map((skill) => ({
			id: skill.id,
			use_when: skill.useWhen
		})),
		recommended_skill_stacks:
			domain.recommendedSkillStacks?.map((stack) => ({
				id: stack.id,
				name: stack.name,
				use_when: stack.useWhen,
				skill_ids: stack.skillIds
			})) ?? [],
		resources:
			domain.resources?.map((resource) => ({
				id: resource.id,
				title: resource.title,
				summary: resource.summary,
				when_to_load: resource.whenToLoad
			})) ?? [],
		gaps:
			domain.gaps?.map((gap) => ({
				missing_skill_id: gap.missingSkillId,
				missing_resource_id: gap.missingResourceId,
				user_need: gap.userNeed,
				summary: gap.summary
			})) ?? [],
		materialized_tools: [
			...(workCapabilities.length > 0
				? ['work_capability_load', 'work_capability_search']
				: []),
			...(domain.skills.length > 0 ? ['skill_load'] : []),
			...((domain.resources?.length ?? 0) > 0 ? ['resource_search'] : [])
		],
		next_step:
			'Use the domain as routing context. Load a work capability when the current task needs an outcome card; load a skill only when the turn needs its workflow playbook.'
	};

	if (payload.materialized_tools?.length === 0) {
		delete payload.materialized_tools;
	}

	if (domain.notes?.length) {
		payload.notes = domain.notes;
	}

	return payload;
}
