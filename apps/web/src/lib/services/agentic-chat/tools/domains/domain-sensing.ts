// apps/web/src/lib/services/agentic-chat/tools/domains/domain-sensing.ts
import { loadDomain, searchDomains } from './domain-load';
import type { DomainCoverageStatus, DomainLoadPayload, DomainSearchMatch } from './types';

export type DomainSensingInput = {
	currentUserMessage?: string | null;
	conversationSummary?: string | null;
	priorDomainIds?: string[] | null;
	limit?: number;
};

export type SensedDomain = {
	id: string;
	name: string;
	confidence: number;
	coverage_status: DomainCoverageStatus;
	parent_ids: string[];
	aliases_hit: string[];
	skill_ids: string[];
	recommended_skill_stack_ids: string[];
	gaps: Array<{
		missing_skill_id?: string;
		missing_resource_id?: string;
		user_need: string;
		summary: string;
	}>;
	gap_skill_ids: string[];
	gap_resource_ids: string[];
};

export type DomainSensingResult = {
	type: 'domain_sensing';
	source: 'current_user_message' | 'conversation_summary' | 'session_state';
	query: string;
	active_domains: SensedDomain[];
	recommended_skill_ids: string[];
	coverage_gap_skill_ids: string[];
	coverage_gap_resource_ids: string[];
	next_step: string;
};

const MAX_QUERY_CHARS = 800;
const MIN_DOMAIN_CONFIDENCE = 0.45;

function normalizeText(value: string | null | undefined): string {
	return (value ?? '').trim().replace(/\s+/g, ' ');
}

function unique(items: string[]): string[] {
	return Array.from(new Set(items));
}

function isDomainPayload(
	value: DomainLoadPayload | Record<string, unknown>
): value is DomainLoadPayload {
	return value.type === 'domain';
}

function shouldKeepMatch(match: DomainSearchMatch): boolean {
	return match.confidence >= MIN_DOMAIN_CONFIDENCE || match.aliases_hit.length > 0;
}

function toSensedDomain(domainId: string, match?: DomainSearchMatch): SensedDomain | null {
	const loaded = loadDomain(domainId);
	if (!isDomainPayload(loaded)) return null;

	return {
		id: loaded.domain_id,
		name: loaded.name,
		confidence: match?.confidence ?? 0.55,
		coverage_status: loaded.coverage_status,
		parent_ids: loaded.parent_ids,
		aliases_hit: match?.aliases_hit ?? [],
		skill_ids: loaded.skills.map((skill) => skill.id),
		recommended_skill_stack_ids: loaded.recommended_skill_stacks.map((stack) => stack.id),
		gaps: loaded.gaps.map((gap) => ({
			missing_skill_id: gap.missing_skill_id,
			missing_resource_id: gap.missing_resource_id,
			user_need: gap.user_need,
			summary: gap.summary
		})),
		gap_skill_ids: loaded.gaps
			.map((gap) => gap.missing_skill_id)
			.filter((skillId): skillId is string => Boolean(skillId)),
		gap_resource_ids: loaded.gaps
			.map((gap) => gap.missing_resource_id)
			.filter((resourceId): resourceId is string => Boolean(resourceId))
	};
}

export function senseDomains(input: DomainSensingInput): DomainSensingResult | null {
	const currentUserMessage = normalizeText(input.currentUserMessage);
	const conversationSummary = normalizeText(input.conversationSummary);
	const priorDomainIds = unique(
		(input.priorDomainIds ?? []).filter(
			(domainId): domainId is string =>
				typeof domainId === 'string' && domainId.trim().length > 0
		)
	).slice(0, input.limit ?? 4);
	let source: DomainSensingResult['source'] = currentUserMessage
		? 'current_user_message'
		: conversationSummary
			? 'conversation_summary'
			: 'session_state';
	const querySource = currentUserMessage || conversationSummary;
	if (!querySource && priorDomainIds.length === 0) return null;

	const query = querySource.slice(0, MAX_QUERY_CHARS);
	const searchResult = searchDomains({ query, limit: input.limit ?? 4 });
	const activeDomains = searchResult.matches
		.filter(shouldKeepMatch)
		.map((match) => toSensedDomain(match.domain_id, match))
		.filter((domain): domain is SensedDomain => Boolean(domain));
	if (activeDomains.length === 0 && priorDomainIds.length > 0) {
		source = 'session_state';
		activeDomains.push(
			...priorDomainIds
				.map((domainId) => toSensedDomain(domainId))
				.filter((domain): domain is SensedDomain => Boolean(domain))
		);
	}

	if (activeDomains.length === 0) return null;

	const recommendedSkillIds = unique(activeDomains.flatMap((domain) => domain.skill_ids)).slice(
		0,
		10
	);
	const coverageGapSkillIds = unique(
		activeDomains.flatMap((domain) => domain.gap_skill_ids)
	).slice(0, 8);
	const coverageGapResourceIds = unique(
		activeDomains.flatMap((domain) => domain.gap_resource_ids)
	).slice(0, 8);

	return {
		type: 'domain_sensing',
		source,
		query: query || priorDomainIds.join(', '),
		active_domains: activeDomains,
		recommended_skill_ids: recommendedSkillIds,
		coverage_gap_skill_ids: coverageGapSkillIds,
		coverage_gap_resource_ids: coverageGapResourceIds,
		next_step:
			'Use these domains as routing hints. Prefer a linked root skill when the user needs a workflow; call domain_load only when boundaries, stacks, or gaps would change the next step.'
	};
}

export function renderDomainSensingPromptContent(
	result: DomainSensingResult | null
): string | null {
	if (!result) return null;

	const domainLines = result.active_domains.map((domain) => {
		const details = [
			`${domain.coverage_status} coverage`,
			`confidence ${domain.confidence}`,
			domain.aliases_hit.length ? `aliases: ${domain.aliases_hit.join(', ')}` : null,
			domain.skill_ids.length ? `skills: ${domain.skill_ids.slice(0, 6).join(', ')}` : null,
			domain.recommended_skill_stack_ids.length
				? `stacks: ${domain.recommended_skill_stack_ids.slice(0, 4).join(', ')}`
				: null,
			domain.gap_skill_ids.length
				? `gaps: ${domain.gap_skill_ids.slice(0, 4).join(', ')}`
				: null
		].filter((item): item is string => Boolean(item));
		return `- ${domain.id} (${domain.name}): ${details.join('; ')}`;
	});

	return [
		`Source: ${result.source}.`,
		'',
		'Candidate domains:',
		...domainLines,
		'',
		'Recommended skill ids:',
		`- ${result.recommended_skill_ids.length ? result.recommended_skill_ids.join(', ') : 'none'}`,
		'',
		'Coverage gap skill ids:',
		`- ${result.coverage_gap_skill_ids.length ? result.coverage_gap_skill_ids.join(', ') : 'none'}`,
		'',
		'Coverage gap resource ids:',
		`- ${result.coverage_gap_resource_ids.length ? result.coverage_gap_resource_ids.join(', ') : 'none'}`,
		'',
		`Next step: ${result.next_step}`
	].join('\n');
}

export function renderDomainSensingPromptBlock(result: DomainSensingResult | null): string | null {
	const content = renderDomainSensingPromptContent(result);
	return content ? ['## Active Domain Signals', '', content].join('\n') : null;
}
