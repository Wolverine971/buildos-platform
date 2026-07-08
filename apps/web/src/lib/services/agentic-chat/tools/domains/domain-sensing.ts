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
const SKILL_GATE_CANDIDATE_LIMIT = 3;
// Gate threshold: live prompts that should load a skill matched skill-bearing
// domains at >= 0.56 confidence, while trivial follow-ups and direct-tool asks
// returned no sensing result at all (2026-07-02 routing investigation).
const SKILL_GATE_MIN_CONFIDENCE = 0.55;
const NATIVE_PROJECT_SIGNAL_CONFIDENCE = 0.9;

type NativeOutcomeCardSignal = {
	outcomeCardId: string;
	confidence: number;
	loadHint: string;
	matches: (query: string, activeDomains: SensedDomain[]) => boolean;
};

const EXPLICIT_PROJECT_SCOPE_PATTERN =
	/\b(project|initiative|roadmap|milestone|milestones|deadline|timeline|sprint|tasks?|blocked|blockers?|dependency|dependencies|stale|slip|slipping|delayed?|schedule|on track)\b/i;
const PROJECT_CONTAINER_SCOPE_PATTERN =
	/\b(project|initiative|roadmap|milestone|milestones|deadline|timeline|sprint|tasks?|dependency|dependencies|planning|execution)\b/i;
const PROJECT_AUDIT_INTENT_PATTERN =
	/\b(audit|review|assess|inspect|stress[- ]?test|health check)\b/i;
const PROJECT_DIAGNOSE_INTENT_PATTERN = /\b(diagnose|diagnosis)\b/i;
const PROJECT_AUDIT_SIGNAL_PATTERN =
	/\b(project|initiative|blocked|blockers?|stale|risks?|risky|gaps?|dependencies|milestones?|planning|execution)\b/i;
const PROJECT_HEALTH_SIGNAL_PATTERN = /\b(project health|health of|health check)\b/i;
const PROJECT_FORECAST_INTENT_PATTERN = /\b(forecast|predict|estimate)\b/i;
const PROJECT_FORECAST_SIGNAL_PATTERN =
	/\b(slip|slipping|delays?|delayed|deadline|timeline|schedule|milestones?|eta|on track|at risk|risks?|uncertainty|miss)\b/i;
const PROJECT_FORECAST_DIRECT_PATTERN =
	/\b(project|initiative|roadmap|milestone|milestones|deadline|timeline|schedule)\b.*\b(slip|slipping|delays?|delayed|late|on track|miss)\b|\b(slip|slipping|delays?|delayed|late|on track|miss)\b.*\b(project|initiative|roadmap|milestone|milestones|deadline|timeline|schedule)\b/i;

const ADVISORY_NEXT_STEP =
	'Use these domains and outcome cards as routing hints. Load an outcome card when output contract or quality criteria would help; load a skill only when the user needs workflow depth.';
const GATED_NEXT_STEP =
	'Skill-load gate is ACTIVE for this turn: the request matches skill-covered work. Before drafting the final answer, pick the best-matching id from the ranked Skill-load candidates and call skill_load for it. Skip the load only when that skill is already in the loaded-skills ledger, or the message is a clarification/acknowledgment that produces no new work product.';

const NATIVE_OUTCOME_CARD_SIGNALS: NativeOutcomeCardSignal[] = [
	{
		outcomeCardId: 'project_health_audit',
		confidence: NATIVE_PROJECT_SIGNAL_CONFIDENCE,
		loadHint:
			'BuildOS-native project audit signal. Load project_audit before assessing blockers, stale work, risks, or project health.',
		matches: matchesNativeProjectAudit
	},
	{
		outcomeCardId: 'project_slip_forecast',
		confidence: NATIVE_PROJECT_SIGNAL_CONFIDENCE,
		loadHint:
			'BuildOS-native project forecast signal. Load project_forecast before estimating slippage, timeline risk, or schedule uncertainty.',
		matches: (query, activeDomains) =>
			shouldAllowNativeProjectSignal(query, activeDomains) &&
			(PROJECT_FORECAST_INTENT_PATTERN.test(query) ||
				PROJECT_FORECAST_DIRECT_PATTERN.test(query) ||
				/\b(likely to slip|will slip|could slip|going to slip|on track|at risk)\b/i.test(
					query
				)) &&
			PROJECT_FORECAST_SIGNAL_PATTERN.test(query)
	}
];

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

function shouldAllowNativeProjectSignal(query: string, activeDomains: SensedDomain[]): boolean {
	if (!query.trim()) return false;
	if (activeDomains.length === 0) return true;
	return EXPLICIT_PROJECT_SCOPE_PATTERN.test(query);
}

function matchesNativeProjectAudit(query: string, activeDomains: SensedDomain[]): boolean {
	if (!shouldAllowNativeProjectSignal(query, activeDomains)) return false;
	if (
		PROJECT_AUDIT_INTENT_PATTERN.test(query) &&
		(PROJECT_AUDIT_SIGNAL_PATTERN.test(query) || PROJECT_HEALTH_SIGNAL_PATTERN.test(query))
	) {
		return true;
	}
	if (
		PROJECT_DIAGNOSE_INTENT_PATTERN.test(query) &&
		PROJECT_CONTAINER_SCOPE_PATTERN.test(query) &&
		PROJECT_AUDIT_SIGNAL_PATTERN.test(query)
	) {
		return true;
	}
	return (
		PROJECT_CONTAINER_SCOPE_PATTERN.test(query) &&
		/\b(blocked|blockers?|stale|risks?|risky|gaps?)\b/i.test(query)
	);
}

function buildNativeOutcomeCards(
	query: string,
	activeDomains: SensedDomain[]
): SensedOutcomeCard[] {
	if (!query.trim()) return [];
	return NATIVE_OUTCOME_CARD_SIGNALS.map((signal) => {
		if (!signal.matches(query, activeDomains)) return null;
		const outcomeCard = getOutcomeCardById(signal.outcomeCardId);
		if (!outcomeCard) return null;
		return toSensedOutcomeCard(outcomeCard, signal.confidence, signal.loadHint);
	}).filter((card): card is SensedOutcomeCard => Boolean(card));
}

function buildPriorDomainlessOutcomeCards(priorOutcomeCardIds: string[]): SensedOutcomeCard[] {
	const cards: SensedOutcomeCard[] = [];
	for (const id of priorOutcomeCardIds) {
		const outcomeCard = getOutcomeCardById(id);
		if (!outcomeCard) continue;
		if (outcomeCard.domainIds.length > 0) {
			return cards.length > 0 ? cards : [];
		}
		cards.push(toSensedOutcomeCard(outcomeCard, 0.6));
	}
	return cards;
}

function mergeSensedOutcomeCards(cards: SensedOutcomeCard[], limit: number): SensedOutcomeCard[] {
	const byId = new Map<string, SensedOutcomeCard>();
	for (const card of cards) {
		const existing = byId.get(card.id);
		if (existing && existing.confidence >= card.confidence) continue;
		byId.set(card.id, card);
	}
	return Array.from(byId.values()).sort(compareOutcomeCardsForSkillGate).slice(0, limit);
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

type RankedSkillGateCandidate = {
	id: string;
	confidence: number;
	isPrimaryDefault: boolean;
	sourceRank: number;
	sequence: number;
};

function normalizeConfidence(value: number | null | undefined): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function compareOutcomeCardsForSkillGate(a: SensedOutcomeCard, b: SensedOutcomeCard): number {
	if (b.confidence !== a.confidence) return b.confidence - a.confidence;
	return a.id.localeCompare(b.id);
}

function isBetterSkillGateCandidate(
	next: RankedSkillGateCandidate,
	current: RankedSkillGateCandidate
): boolean {
	if (next.isPrimaryDefault !== current.isPrimaryDefault) return next.isPrimaryDefault;
	if (next.confidence !== current.confidence) return next.confidence > current.confidence;
	if (next.sourceRank !== current.sourceRank) return next.sourceRank < current.sourceRank;
	return next.sequence < current.sequence;
}

function upsertSkillGateCandidate(
	candidates: Map<string, RankedSkillGateCandidate>,
	input: {
		id: string | null | undefined;
		confidence: number | null | undefined;
		isPrimaryDefault?: boolean;
		sourceRank: number;
		sequence: number;
	}
): void {
	const id = typeof input.id === 'string' ? input.id.trim() : '';
	if (!id) return;
	const next: RankedSkillGateCandidate = {
		id,
		confidence: normalizeConfidence(input.confidence),
		isPrimaryDefault: input.isPrimaryDefault === true,
		sourceRank: input.sourceRank,
		sequence: input.sequence
	};
	const current = candidates.get(id);
	if (!current || isBetterSkillGateCandidate(next, current)) {
		candidates.set(id, next);
	}
}

function getDomainSkillConfidenceById(activeDomains: SensedDomain[]): Map<string, number> {
	const confidenceById = new Map<string, number>();
	for (const domain of activeDomains) {
		for (const skillId of domain.skill_ids) {
			const normalized = skillId.trim();
			if (!normalized) continue;
			const current = confidenceById.get(normalized) ?? 0;
			confidenceById.set(
				normalized,
				Math.max(current, normalizeConfidence(domain.confidence))
			);
		}
	}
	return confidenceById;
}

function formatSkillIdPreview(skillIds: string[], limit: number): string {
	const visible = skillIds.slice(0, limit);
	if (visible.length === 0) return 'none';
	const remaining = Math.max(0, skillIds.length - visible.length);
	return remaining > 0 ? `${visible.join(', ')} (+${remaining} more)` : visible.join(', ');
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
	const nativeOutcomeCards = buildNativeOutcomeCards(query, activeDomains);
	const priorDomainlessOutcomeCards =
		activeDomains.length === 0 && nativeOutcomeCards.length === 0
			? buildPriorDomainlessOutcomeCards(priorOutcomeCardIds)
			: [];
	if (
		activeDomains.length === 0 &&
		nativeOutcomeCards.length === 0 &&
		priorDomainlessOutcomeCards.length > 0
	) {
		source = 'session_state';
	}
	if (
		activeDomains.length === 0 &&
		nativeOutcomeCards.length === 0 &&
		priorDomainlessOutcomeCards.length === 0 &&
		priorDomainIds.length > 0
	) {
		source = 'session_state';
		activeDomains.push(
			...priorDomainIds
				.map((domainId) => toSensedDomain(domainId))
				.filter((domain): domain is SensedDomain => Boolean(domain))
		);
	}

	if (
		activeDomains.length === 0 &&
		nativeOutcomeCards.length === 0 &&
		priorDomainlessOutcomeCards.length === 0
	) {
		return null;
	}

	const outcomeCardLimit = Math.max(2, Math.min(6, input.limit ?? 4));
	const candidateOutcomeCards = mergeSensedOutcomeCards(
		[
			...nativeOutcomeCards,
			...priorDomainlessOutcomeCards,
			...buildCandidateOutcomeCards(
				activeDomains,
				query,
				priorOutcomeCardIds,
				outcomeCardLimit
			)
		],
		outcomeCardLimit
	);
	const recommendedSkillIds = unique(
		[
			...activeDomains.flatMap((domain) => domain.skill_ids),
			...candidateOutcomeCards.flatMap((card) =>
				uniqueTrimmed([card.default_skill_id, ...card.skill_ids])
			)
		].filter((skillId): skillId is string => typeof skillId === 'string' && skillId.length > 0)
	).slice(0, 10);
	const coverageGapSkillIds = unique(
		activeDomains.flatMap((domain) => domain.gap_skill_ids)
	).slice(0, 8);
	const coverageGapResourceIds = unique(
		activeDomains.flatMap((domain) => domain.gap_resource_ids)
	).slice(0, 8);

	const skillLoadRequired =
		shouldRequireSkillLoad(source, activeDomains) ||
		(source !== 'session_state' && nativeOutcomeCards.length > 0);

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
	const candidates = new Map<string, RankedSkillGateCandidate>();
	const outcomeCards = [...result.candidate_outcome_cards].sort(compareOutcomeCardsForSkillGate);
	const primaryOutcomeCard = outcomeCards.find((card) => card.default_skill_id?.trim());
	const domainSkillConfidenceById = getDomainSkillConfidenceById(result.active_domains);
	let sequence = 0;

	upsertSkillGateCandidate(candidates, {
		id: primaryOutcomeCard?.default_skill_id,
		confidence: primaryOutcomeCard?.confidence,
		isPrimaryDefault: true,
		sourceRank: 0,
		sequence: sequence++
	});

	for (const card of outcomeCards) {
		upsertSkillGateCandidate(candidates, {
			id: card.default_skill_id,
			confidence: card.confidence,
			sourceRank: 1,
			sequence: sequence++
		});
		for (const skillId of card.skill_ids) {
			upsertSkillGateCandidate(candidates, {
				id: skillId,
				confidence: card.confidence,
				sourceRank: 2,
				sequence: sequence++
			});
		}
	}

	for (const skillId of result.recommended_skill_ids) {
		const normalized = skillId.trim();
		upsertSkillGateCandidate(candidates, {
			id: normalized,
			confidence: domainSkillConfidenceById.get(normalized) ?? 0,
			sourceRank: 3,
			sequence: sequence++
		});
	}

	for (const domain of result.active_domains) {
		for (const skillId of domain.skill_ids) {
			upsertSkillGateCandidate(candidates, {
				id: skillId,
				confidence: domain.confidence,
				sourceRank: 4,
				sequence: sequence++
			});
		}
	}

	return Array.from(candidates.values())
		.sort((a, b) => {
			if (a.isPrimaryDefault !== b.isPrimaryDefault) return a.isPrimaryDefault ? -1 : 1;
			if (b.confidence !== a.confidence) return b.confidence - a.confidence;
			if (a.sourceRank !== b.sourceRank) return a.sourceRank - b.sourceRank;
			return a.sequence - b.sequence;
		})
		.slice(0, SKILL_GATE_CANDIDATE_LIMIT)
		.map((candidate) => candidate.id);
}

export function getSkillGateCandidateSkillLoadFormats(
	result: DomainSensingResult | null | undefined
): Record<string, SkillLoadFormat> {
	if (!result) return {};
	const formats: Record<string, SkillLoadFormat> = {};
	const candidateSkillIds = getSkillGateCandidateSkillIds(result);
	const outcomeCards = [...result.candidate_outcome_cards].sort(compareOutcomeCardsForSkillGate);
	for (const capability of outcomeCards) {
		for (const [skillId, format] of Object.entries(capability.skill_load_formats)) {
			if (
				(format === 'short' || format === 'full') &&
				skillId.trim() &&
				!formats[skillId.trim()]
			) {
				formats[skillId.trim()] = format;
			}
		}
	}
	for (const skillId of candidateSkillIds) {
		if (formats[skillId] === 'short' || formats[skillId] === 'full') continue;
		const skill = getSkillById(skillId);
		if (skill) {
			formats[skillId] = getRecommendedSkillLoadFormat(skill);
		}
	}
	return Object.fromEntries(
		candidateSkillIds
			.map((skillId) => [skillId, formats[skillId]] as const)
			.filter((entry): entry is readonly [string, SkillLoadFormat] => Boolean(entry[1]))
	);
}

export function renderDomainSensingPromptContent(
	result: DomainSensingResult | null
): string | null {
	if (!result) return null;
	const skillGateCandidateSkillIds = getSkillGateCandidateSkillIds(result);

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
		...(result.skill_load_required
			? [
					'',
					'Skill-load candidates (ranked, max 3):',
					`- ${skillGateCandidateSkillIds.length ? skillGateCandidateSkillIds.join(', ') : 'none'}`
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
		`- ${formatSkillIdPreview(result.recommended_skill_ids, SKILL_GATE_CANDIDATE_LIMIT)}`,
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
