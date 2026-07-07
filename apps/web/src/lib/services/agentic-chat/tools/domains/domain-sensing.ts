// apps/web/src/lib/services/agentic-chat/tools/domains/domain-sensing.ts
import { loadDomain, searchDomains } from './domain-load';
import type { DomainCoverageStatus, DomainLoadPayload, DomainSearchMatch } from './types';
import {
	getOutcomeCardById,
	searchOutcomeCards,
	type OutcomeCardCoverageStatus,
	type OutcomeCardDefinition
} from '../outcome-cards';
import { getSkillById } from '../skills/registry';
import { getRecommendedSkillLoadFormat } from '../skills/skill-load';
import type { SkillLoadFormat } from '../skills/types';

export type DomainSensingInput = {
	currentUserMessage?: string | null;
	conversationSummary?: string | null;
	priorDomainIds?: string[] | null;
	/** @deprecated Use priorOutcomeCardIds. */
	priorWorkCapabilityIds?: string[] | null;
	priorOutcomeCardIds?: string[] | null;
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
	outcome_card_ids: string[];
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

export type SensedOutcomeCard = {
	id: string;
	name: string;
	confidence: number;
	summary: string;
	domain_ids: string[];
	buildos_capability_ids: string[];
	default_skill_id?: string;
	skill_ids: string[];
	skill_load_formats: Record<string, SkillLoadFormat>;
	coverage_status: OutcomeCardCoverageStatus;
	load_hint: string;
};

export type DomainSensingResult = {
	type: 'domain_sensing';
	source: 'current_user_message' | 'conversation_summary' | 'session_state';
	query: string;
	active_domains: SensedDomain[];
	candidate_outcome_cards: SensedOutcomeCard[];
	candidate_outcome_card_ids: string[];
	recommended_skill_ids: string[];
	coverage_gap_skill_ids: string[];
	coverage_gap_resource_ids: string[];
	/**
	 * True when the current message matched skill-covered work strongly enough
	 * that the model must call skill_load before drafting the final answer.
	 * The gate binds the WHETHER, not the WHICH: confidence scores saturate and
	 * tie across candidate cards, so skill choice stays with the model.
	 */
	skill_load_required: boolean;
	next_step: string;
};

const MAX_QUERY_CHARS = 800;
const MIN_DOMAIN_CONFIDENCE = 0.45;
// Gate threshold: live prompts that should load a skill matched skill-bearing
// domains at >= 0.56 confidence, while trivial follow-ups and direct-tool asks
// returned no sensing result at all (2026-07-02 routing investigation).
const SKILL_GATE_MIN_CONFIDENCE = 0.55;

const ADVISORY_NEXT_STEP =
	'Use these domains and outcome cards as routing hints. Load an outcome card when output contract or quality criteria would help; load a skill only when the user needs workflow depth.';
const GATED_NEXT_STEP =
	"Skill-load gate is ACTIVE for this turn: the request matches skill-covered work. Before drafting the final answer, pick the best-matching skill for the user's actual ask (outcome-card default_skill_id first, then the recommended skill ids) and call skill_load for it. Skip the load only when that skill is already in the loaded-skills ledger, or the message is a clarification/acknowledgment that produces no new work product.";

function shouldRequireSkillLoad(
	source: DomainSensingResult['source'],
	activeDomains: SensedDomain[]
): boolean {
	// session_state means the current turn had no signal of its own and we fell
	// back to prior domains; do not force a load off a stale signal.
	if (source === 'session_state') return false;
	return activeDomains.some(
		(domain) =>
			domain.skill_ids.length > 0 &&
			(domain.confidence >= SKILL_GATE_MIN_CONFIDENCE || domain.aliases_hit.length > 0)
	);
}

function normalizeText(value: string | null | undefined): string {
	return (value ?? '').trim().replace(/\s+/g, ' ');
}

function unique(items: string[]): string[] {
	return Array.from(new Set(items));
}

function uniqueTrimmed(items: Array<string | null | undefined>): string[] {
	const result: string[] = [];
	const seen = new Set<string>();
	for (const item of items) {
		const normalized = typeof item === 'string' ? item.trim() : '';
		if (!normalized || seen.has(normalized)) continue;
		seen.add(normalized);
		result.push(normalized);
	}
	return result;
}

function buildSkillLoadFormats(
	defaultSkillId: string | undefined,
	skillIds: string[]
): Record<string, SkillLoadFormat> {
	const formats: Record<string, SkillLoadFormat> = {};
	for (const skillId of uniqueTrimmed([defaultSkillId, ...skillIds])) {
		const skill = getSkillById(skillId);
		if (skill) formats[skillId] = getRecommendedSkillLoadFormat(skill);
	}
	return formats;
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
		outcome_card_ids: loaded.outcome_card_ids,
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

function domainIdsOverlap(left: string[], right: string[]): boolean {
	if (left.length === 0 || right.length === 0) return false;
	const rightSet = new Set(right);
	return left.some((item) => rightSet.has(item));
}

function toSensedOutcomeCard(
	capability: OutcomeCardDefinition,
	confidence: number,
	loadHint = 'Reuse this prior outcome card when the follow-up still fits the same outcome lane.'
): SensedOutcomeCard {
	return {
		id: capability.id,
		name: capability.name,
		confidence,
		summary: capability.summary,
		domain_ids: capability.domainIds,
		buildos_capability_ids: capability.buildosCapabilityIds,
		default_skill_id: capability.defaultSkillId,
		skill_ids: capability.skillIds,
		skill_load_formats: buildSkillLoadFormats(capability.defaultSkillId, capability.skillIds),
		coverage_status: capability.coverageStatus,
		load_hint: loadHint
	};
}

function buildCandidateOutcomeCards(
	activeDomains: SensedDomain[],
	query: string,
	priorOutcomeCardIds: string[],
	limit: number
): SensedOutcomeCard[] {
	const byId = new Map<string, SensedOutcomeCard>();
	const activeDomainIds = activeDomains.map((domain) => domain.id);
	for (const id of priorOutcomeCardIds) {
		const capability = getOutcomeCardById(id);
		if (!capability) continue;
		if (!domainIdsOverlap(capability.domainIds, activeDomainIds)) continue;
		byId.set(capability.id, toSensedOutcomeCard(capability, 0.6));
	}

	for (const domain of activeDomains) {
		const result = searchOutcomeCards({
			query,
			domain: domain.id,
			limit: Math.max(2, Math.min(4, limit))
		});
		for (const match of result.matches) {
			const existing = byId.get(match.outcome_card_id);
			if (existing && existing.confidence >= match.confidence) continue;
			byId.set(match.outcome_card_id, {
				id: match.outcome_card_id,
				name: match.name,
				confidence: match.confidence,
				summary: match.summary,
				domain_ids: match.domain_ids,
				buildos_capability_ids: match.buildos_capability_ids,
				default_skill_id: match.default_skill_id,
				skill_ids: match.skill_ids,
				skill_load_formats: match.skill_load_formats,
				coverage_status: match.coverage_status,
				load_hint: match.load_hint
			});
		}
	}

	return Array.from(byId.values())
		.sort((a, b) => {
			if (b.confidence !== a.confidence) return b.confidence - a.confidence;
			return a.id.localeCompare(b.id);
		})
		.slice(0, limit);
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
	const priorOutcomeCardIds = unique(
		(input.priorOutcomeCardIds ?? input.priorWorkCapabilityIds ?? []).filter(
			(outcomeCardId): outcomeCardId is string =>
				typeof outcomeCardId === 'string' && outcomeCardId.trim().length > 0
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

	const candidateOutcomeCards = buildCandidateOutcomeCards(
		activeDomains,
		query,
		priorOutcomeCardIds,
		Math.max(2, Math.min(6, input.limit ?? 4))
	);
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

	const skillLoadRequired = shouldRequireSkillLoad(source, activeDomains);

	return {
		type: 'domain_sensing',
		source,
		query: query || priorDomainIds.join(', '),
		active_domains: activeDomains,
		candidate_outcome_cards: candidateOutcomeCards,
		candidate_outcome_card_ids: candidateOutcomeCards.map((capability) => capability.id),
		recommended_skill_ids: recommendedSkillIds,
		coverage_gap_skill_ids: coverageGapSkillIds,
		coverage_gap_resource_ids: coverageGapResourceIds,
		skill_load_required: skillLoadRequired,
		next_step: skillLoadRequired ? GATED_NEXT_STEP : ADVISORY_NEXT_STEP
	};
}

export function getSkillGateCandidateSkillIds(
	result: DomainSensingResult | null | undefined
): string[] {
	if (!result) return [];
	return uniqueTrimmed([
		...result.candidate_outcome_cards.flatMap((card) => [
			card.default_skill_id,
			...card.skill_ids
		]),
		...result.recommended_skill_ids,
		...result.active_domains.flatMap((domain) => domain.skill_ids)
	]);
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
			domain.outcome_card_ids.length
				? `outcome cards: ${domain.outcome_card_ids.slice(0, 5).join(', ')}`
				: null,
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
	const outcomeCardLines = result.candidate_outcome_cards.map((capability) => {
		const skillFormatEntries = Object.entries(capability.skill_load_formats)
			.slice(0, 5)
			.map(([skillId, format]) => `${skillId}:${format}`);
		const details = [
			`${capability.coverage_status} coverage`,
			`confidence ${capability.confidence}`,
			capability.default_skill_id ? `default skill: ${capability.default_skill_id}` : null,
			capability.skill_ids.length
				? `skills: ${capability.skill_ids.slice(0, 5).join(', ')}`
				: null,
			skillFormatEntries.length ? `skill formats: ${skillFormatEntries.join(', ')}` : null
		].filter((item): item is string => Boolean(item));
		return `- ${capability.id} (${capability.name}): ${details.join('; ')}. ${capability.summary}`;
	});

	return [
		`Source: ${result.source}.`,
		...(result.skill_load_required
			? [
					'',
					'Skill-load gate: ACTIVE. Do not draft the final answer until you have called skill_load for the best-matching skill below or confirmed it is already in the loaded-skills ledger. Answering skill-covered work from base knowledge is a routing failure.'
				]
			: []),
		'',
		'Candidate domains:',
		...domainLines,
		'',
		'Candidate outcome cards:',
		...(outcomeCardLines.length > 0 ? outcomeCardLines : ['- none']),
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
