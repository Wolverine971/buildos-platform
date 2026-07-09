// apps/web/src/lib/services/agentic-chat/tools/domains/domain-load.ts
import { getDomainById, listChildDomains, listDomains } from './catalog';
import type {
	DomainDefinition,
	DomainLoadPayload,
	DomainSearchMatch,
	DomainSearchPayload
} from './types';
import { listOutcomeCardsForDomain } from '../outcome-cards';

export type DomainSearchOptions = {
	query?: string;
	limit?: number;
};

function normalize(value: string): string {
	return value.trim().toLowerCase();
}

const QUERY_STOP_WORDS = new Set([
	'a',
	'an',
	'and',
	'are',
	'as',
	'at',
	'be',
	'can',
	'campaign',
	'create',
	'demo',
	'do',
	'document',
	'doc',
	'for',
	'from',
	'give',
	'help',
	'i',
	'in',
	'is',
	'it',
	'make',
	'me',
	'my',
	'need',
	'of',
	'on',
	'or',
	'outline',
	'please',
	'so',
	'summary',
	'status',
	'that',
	'the',
	'they',
	'this',
	'to',
	'want',
	'update',
	'video',
	'what',
	'with',
	'work',
	'write',
	'you'
]);

function tokenizeRaw(value: string): string[] {
	return normalize(value)
		.split(/[^a-z0-9]+/)
		.map((token) => token.trim())
		.filter((token) => token.length >= 2);
}

function tokenizeQuery(value: string): string[] {
	return tokenizeRaw(value).filter(
		(token) =>
			!QUERY_STOP_WORDS.has(token) && !QUERY_STOP_WORDS.has(normalizeTokenForMatch(token))
	);
}

function unique<T>(items: T[]): T[] {
	return Array.from(new Set(items));
}

function getSkillIds(domain: DomainDefinition): string[] {
	return unique(domain.skills.map((skill) => skill.id)).sort((a, b) => a.localeCompare(b));
}

// Aliases must match on whole-token boundaries, not substrings. The substring
// version made alias "ui" hit every message containing "build" or "BuildOS"
// (u-i inside b-u-i-l-d), which routed ordinary product mentions — and a
// narrative-arc craft prompt — to product_and_design (2026-07-02 rerun, turn 5).
function aliasMatchesQuery(alias: string, queryTokenText: string): boolean {
	const aliasTokens = tokenizeRaw(alias).map(normalizeTokenForMatch);
	if (aliasTokens.length === 0) return false;
	const queryTokens = new Set(tokenizeRaw(queryTokenText).map(normalizeTokenForMatch));
	return aliasTokens.every((token) => queryTokens.has(token));
}

function computeScore(
	domain: DomainDefinition,
	query: string
): { score: number; aliasesHit: string[] } {
	if (!query) return { score: 1, aliasesHit: [] };

	const normalizedQuery = normalize(query);
	const rawQueryTokens = tokenizeRaw(query);
	const tokens = tokenizeQuery(query);
	const queryTokenText = rawQueryTokens.join(' ');
	const aliasesHit = domain.aliases.filter((alias) => aliasMatchesQuery(alias, queryTokenText));
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
	const haystackTokens = new Set(tokenizeRaw(haystack));
	const normalizedHaystackTokens = new Set(
		Array.from(haystackTokens).map(normalizeTokenForMatch)
	);
	const domainIdTokens = new Set(tokenizeRaw(domain.id).map(normalizeTokenForMatch));
	const domainNameTokens = new Set(tokenizeRaw(domain.name).map(normalizeTokenForMatch));

	let score = 0;
	if (domain.id === normalizedQuery) score += 220;
	if (normalize(domain.name) === normalizedQuery) score += 180;
	if (domain.id.includes(normalizedQuery)) score += 90;
	if (normalize(domain.name).includes(normalizedQuery)) score += 80;
	score += aliasesHit.length * 70;

	for (const token of tokens) {
		const normalizedToken = normalizeTokenForMatch(token);
		if (domainIdTokens.has(normalizedToken)) score += 50;
		if (domainNameTokens.has(normalizedToken)) score += 40;
		if (normalizedHaystackTokens.has(normalizedToken)) score += 50;
	}

	return { score, aliasesHit };
}

function normalizeTokenForMatch(token: string): string {
	if (token.length > 5 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
	if (token.length > 5 && token.endsWith('ing')) return token.slice(0, -3);
	if (token.length > 4 && token.endsWith('ed')) return token.slice(0, -2);
	if (token.length > 4 && token.endsWith('es')) return token.slice(0, -2);
	if (token.length > 3 && token.endsWith('s')) return token.slice(0, -1);
	return token;
}

function confidenceFromScore(score: number): number {
	if (score <= 0) return 0;
	return Math.min(0.95, Math.max(0.35, Number((score / 220).toFixed(2))));
}

function nextStepForDomain(domain: DomainDefinition): string {
	if (domain.coverageStatus === 'strong') {
		return 'Load this domain, then load the closest outcome card or skill only if the user needs workflow guidance.';
	}
	if (domain.coverageStatus === 'partial') {
		return 'Load this domain to see available outcome cards, skills, and known gaps before choosing a general answer or skill.';
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
		outcome_card_ids: listOutcomeCardsForDomain(domain.id).map((card) => card.id),
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
	const outcomeCards = listOutcomeCardsForDomain(domain.id);

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
		outcome_card_ids: outcomeCards.map((card) => card.id),
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
			...(outcomeCards.length > 0 ? ['outcome_card_load', 'outcome_card_search'] : []),
			...(domain.skills.length > 0 ? ['skill_load'] : []),
			...((domain.resources?.length ?? 0) > 0 ? ['resource_search'] : [])
		],
		next_step:
			'Use the domain as routing context. Load an outcome card when the current task needs a pre-assembled skill stack, output contract, or quality bar; load a skill only when the turn needs its workflow playbook.'
	};

	if (payload.materialized_tools?.length === 0) {
		delete payload.materialized_tools;
	}

	if (domain.notes?.length) {
		payload.notes = domain.notes;
	}

	return payload;
}
