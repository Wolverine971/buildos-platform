// apps/web/src/lib/services/agentic-chat/tools/work-capabilities/work-capability-search.ts
import { listWorkCapabilities } from './catalog';
import type {
	WorkCapabilityDefinition,
	WorkCapabilitySearchMatch,
	WorkCapabilitySearchPayload
} from './types';

export type WorkCapabilitySearchOptions = {
	query?: string;
	domain?: string;
	buildosCapability?: string;
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

function matchesDomain(capability: WorkCapabilityDefinition, domain?: string): boolean {
	if (!domain?.trim()) return true;
	return capability.domainIds.includes(normalize(domain));
}

function matchesBuildOSCapability(
	capability: WorkCapabilityDefinition,
	buildosCapability?: string
): boolean {
	if (!buildosCapability?.trim()) return true;
	const normalized = normalize(buildosCapability).replace(/^capabilities\./, '');
	return capability.buildosCapabilityIds.some((id) => normalize(id) === normalized);
}

function computeScore(capability: WorkCapabilityDefinition, query: string): number {
	if (!query) return 1;
	const normalizedQuery = normalize(query);
	const tokens = tokenize(query);
	const haystack = [
		capability.id,
		capability.name,
		capability.summary,
		capability.defaultSkillId,
		...capability.domainIds,
		...capability.buildosCapabilityIds,
		...capability.whenToUse,
		...capability.exampleRequests,
		...capability.skillIds,
		...(capability.resourceIds ?? []),
		...(capability.toolHints ?? []),
		...capability.outputs,
		...(capability.evaluationCriteria ?? []),
		...(capability.notes ?? [])
	]
		.filter((value): value is string => typeof value === 'string' && value.length > 0)
		.join(' ')
		.toLowerCase();

	let score = 0;
	if (capability.id === normalizedQuery) score += 220;
	if (normalize(capability.name) === normalizedQuery) score += 180;
	if (capability.id.includes(normalizedQuery)) score += 90;
	if (normalize(capability.name).includes(normalizedQuery)) score += 80;
	if (capability.domainIds.some((domainId) => domainId === normalizedQuery)) score += 60;
	if (capability.defaultSkillId && normalize(capability.defaultSkillId) === normalizedQuery) {
		score += 50;
	}

	for (const token of tokens) {
		if (capability.id.includes(token)) score += 30;
		if (haystack.includes(token)) score += 16;
	}

	return score;
}

function confidenceFromScore(score: number): number {
	if (score <= 0) return 0;
	return Math.min(0.95, Math.max(0.35, Number((score / 220).toFixed(2))));
}

function loadHintFor(capability: WorkCapabilityDefinition): string {
	if (capability.coverageStatus === 'strong') {
		return 'Load this work capability when the user needs the output contract, skill stack, or quality criteria.';
	}
	if (capability.coverageStatus === 'partial') {
		return 'Load this work capability to use available skills and expose known gaps before going deeper.';
	}
	return 'Load this work capability to confirm the coverage gap and avoid pretending a dedicated playbook exists.';
}

function toMatch(capability: WorkCapabilityDefinition, score: number): WorkCapabilitySearchMatch {
	return {
		work_capability_id: capability.id,
		name: capability.name,
		confidence: confidenceFromScore(score),
		summary: capability.summary,
		domain_ids: capability.domainIds,
		buildos_capability_ids: capability.buildosCapabilityIds,
		default_skill_id: capability.defaultSkillId,
		skill_ids: capability.skillIds,
		coverage_status: capability.coverageStatus,
		load_hint: loadHintFor(capability)
	};
}

export function searchWorkCapabilities(
	options: WorkCapabilitySearchOptions = {}
): WorkCapabilitySearchPayload {
	const query = typeof options.query === 'string' ? options.query.trim() : '';
	const domain = typeof options.domain === 'string' ? options.domain.trim() : '';
	const buildosCapability =
		typeof options.buildosCapability === 'string' ? options.buildosCapability.trim() : '';
	const limit = Math.max(1, Math.min(20, options.limit ?? 8));

	const matches = listWorkCapabilities()
		.filter((capability) => matchesDomain(capability, domain))
		.filter((capability) => matchesBuildOSCapability(capability, buildosCapability))
		.map((capability) => ({ capability, score: computeScore(capability, query) }))
		.filter(({ score }) => score > 0)
		.sort((a, b) => {
			if (b.score !== a.score) return b.score - a.score;
			return a.capability.id.localeCompare(b.capability.id);
		})
		.slice(0, limit)
		.map(({ capability, score }) => toMatch(capability, score));

	return {
		type: 'work_capability_search_results',
		query: query || null,
		filters: {
			domain: domain || null,
			buildos_capability: buildosCapability || null
		},
		total_matches: matches.length,
		matches,
		materialized_tools: matches.length > 0 ? ['work_capability_load'] : [],
		next_step:
			'Pick the closest outcome. Call work_capability_load when its skill stack, outputs, or quality criteria would improve the next answer.'
	};
}
