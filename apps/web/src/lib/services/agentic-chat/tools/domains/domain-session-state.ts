// apps/web/src/lib/services/agentic-chat/tools/domains/domain-session-state.ts
import type { DomainCoverageStatus } from './types';
import type { DomainSensingResult } from './domain-sensing';

export type DomainSessionStateEntry = {
	id: string;
	name: string;
	coverage_status: DomainCoverageStatus;
	confidence: number;
	first_seen_at: string;
	last_seen_at: string;
	occurrences: number;
	skill_ids: string[];
	gap_skill_ids: string[];
};

export type OutcomeCardSessionEntry = {
	id: string;
	name: string;
	coverage_status: DomainCoverageStatus;
	confidence: number;
	first_seen_at: string;
	last_seen_at: string;
	occurrences: number;
	domain_ids: string[];
	default_skill_id?: string;
	skill_ids: string[];
};

export type DomainGapSessionEntry = {
	missing_skill_id?: string;
	missing_resource_id?: string;
	domain_ids: string[];
	first_seen_at: string;
	last_seen_at: string;
	occurrences: number;
};

export type DomainResearchBacklogEntry = {
	id: string;
	kind: 'skill' | 'resource';
	status: 'queued';
	priority: 'high' | 'medium' | 'low';
	domain_ids: string[];
	missing_skill_id?: string;
	missing_resource_id?: string;
	user_need: string;
	summary: string;
	first_seen_at: string;
	last_seen_at: string;
	occurrences: number;
};

export type DomainSessionObservation = {
	at: string;
	turn_run_id?: string | null;
	stream_run_id?: string | null;
	source: DomainSensingResult['source'];
	query_preview: string;
	domain_ids: string[];
	candidate_outcome_card_ids: string[];
	recommended_skill_ids: string[];
	coverage_gap_skill_ids: string[];
	coverage_gap_resource_ids: string[];
};

export type DomainSessionState = {
	version: 1;
	updated_at: string;
	active_domains: DomainSessionStateEntry[];
	active_outcome_cards: OutcomeCardSessionEntry[];
	coverage_gaps: DomainGapSessionEntry[];
	research_backlog: DomainResearchBacklogEntry[];
	recent_observations: DomainSessionObservation[];
};

export type MergeDomainSessionStateOptions = {
	now?: Date | string;
	turnRunId?: string | null;
	streamRunId?: string | null;
};

type DomainGapCandidate = {
	missing_skill_id?: string;
	missing_resource_id?: string;
	user_need: string;
	summary: string;
};

type DomainGapMergeCandidate = DomainGapCandidate & {
	id: string;
	domain_ids: string[];
	priority: DomainResearchBacklogEntry['priority'];
};

const ACTIVE_DOMAIN_LIMIT = 6;
const ACTIVE_OUTCOME_CARD_LIMIT = 6;
const COVERAGE_GAP_LIMIT = 12;
const RESEARCH_BACKLOG_LIMIT = 16;
const RECENT_OBSERVATION_LIMIT = 8;

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown): string | null {
	return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
		.map((item) => item.trim());
}

function unique(items: string[]): string[] {
	return Array.from(new Set(items));
}

function gapKey(gap: { missing_skill_id?: string; missing_resource_id?: string }): string | null {
	if (gap.missing_skill_id) return `skill:${gap.missing_skill_id}`;
	if (gap.missing_resource_id) return `resource:${gap.missing_resource_id}`;
	return null;
}

function toIso(value: Date | string | undefined): string {
	if (value instanceof Date) return value.toISOString();
	if (typeof value === 'string' && value.trim()) return value;
	return new Date().toISOString();
}

function priorityForCoverageStatus(
	status: DomainCoverageStatus
): DomainResearchBacklogEntry['priority'] {
	if (status === 'none') return 'high';
	if (status === 'partial') return 'medium';
	return 'low';
}

function priorityRank(priority: DomainResearchBacklogEntry['priority']): number {
	if (priority === 'high') return 0;
	if (priority === 'medium') return 1;
	return 2;
}

function highestPriority(
	left: DomainResearchBacklogEntry['priority'],
	right: DomainResearchBacklogEntry['priority']
): DomainResearchBacklogEntry['priority'] {
	return priorityRank(left) <= priorityRank(right) ? left : right;
}

function sortResearchBacklog(entries: DomainResearchBacklogEntry[]): DomainResearchBacklogEntry[] {
	return entries.sort((a, b) => {
		const priorityDelta = priorityRank(a.priority) - priorityRank(b.priority);
		if (priorityDelta !== 0) return priorityDelta;
		const timeOrder = b.last_seen_at.localeCompare(a.last_seen_at);
		if (timeOrder !== 0) return timeOrder;
		return b.occurrences - a.occurrences;
	});
}

function readActiveDomain(value: unknown): DomainSessionStateEntry | null {
	if (!isRecord(value)) return null;
	const id = readString(value.id);
	const name = readString(value.name);
	const coverageStatus = readString(value.coverage_status);
	const firstSeenAt = readString(value.first_seen_at);
	const lastSeenAt = readString(value.last_seen_at);
	if (
		!id ||
		!name ||
		!firstSeenAt ||
		!lastSeenAt ||
		(coverageStatus !== 'none' && coverageStatus !== 'partial' && coverageStatus !== 'strong')
	) {
		return null;
	}

	return {
		id,
		name,
		coverage_status: coverageStatus,
		confidence: readNumber(value.confidence) ?? 0.5,
		first_seen_at: firstSeenAt,
		last_seen_at: lastSeenAt,
		occurrences: Math.max(1, Math.floor(readNumber(value.occurrences) ?? 1)),
		skill_ids: readStringArray(value.skill_ids),
		gap_skill_ids: readStringArray(value.gap_skill_ids)
	};
}

function readActiveOutcomeCard(value: unknown): OutcomeCardSessionEntry | null {
	if (!isRecord(value)) return null;
	const id = readString(value.id);
	const name = readString(value.name);
	const coverageStatus = readString(value.coverage_status);
	const firstSeenAt = readString(value.first_seen_at);
	const lastSeenAt = readString(value.last_seen_at);
	if (
		!id ||
		!name ||
		!firstSeenAt ||
		!lastSeenAt ||
		(coverageStatus !== 'none' && coverageStatus !== 'partial' && coverageStatus !== 'strong')
	) {
		return null;
	}

	return {
		id,
		name,
		coverage_status: coverageStatus,
		confidence: readNumber(value.confidence) ?? 0.5,
		first_seen_at: firstSeenAt,
		last_seen_at: lastSeenAt,
		occurrences: Math.max(1, Math.floor(readNumber(value.occurrences) ?? 1)),
		domain_ids: readStringArray(value.domain_ids),
		default_skill_id: readString(value.default_skill_id) ?? undefined,
		skill_ids: readStringArray(value.skill_ids)
	};
}

function readGap(value: unknown): DomainGapSessionEntry | null {
	if (!isRecord(value)) return null;
	const missingSkillId = readString(value.missing_skill_id);
	const missingResourceId = readString(value.missing_resource_id);
	const firstSeenAt = readString(value.first_seen_at);
	const lastSeenAt = readString(value.last_seen_at);
	if ((!missingSkillId && !missingResourceId) || !firstSeenAt || !lastSeenAt) return null;
	return {
		missing_skill_id: missingSkillId ?? undefined,
		missing_resource_id: missingResourceId ?? undefined,
		domain_ids: readStringArray(value.domain_ids),
		first_seen_at: firstSeenAt,
		last_seen_at: lastSeenAt,
		occurrences: Math.max(1, Math.floor(readNumber(value.occurrences) ?? 1))
	};
}

function readResearchBacklogEntry(value: unknown): DomainResearchBacklogEntry | null {
	if (!isRecord(value)) return null;
	const id = readString(value.id);
	const kind = readString(value.kind);
	const status = readString(value.status);
	const priority = readString(value.priority);
	const firstSeenAt = readString(value.first_seen_at);
	const lastSeenAt = readString(value.last_seen_at);
	if (
		!id ||
		(kind !== 'skill' && kind !== 'resource') ||
		status !== 'queued' ||
		(priority !== 'high' && priority !== 'medium' && priority !== 'low') ||
		!firstSeenAt ||
		!lastSeenAt
	) {
		return null;
	}

	const missingSkillId = readString(value.missing_skill_id);
	const missingResourceId = readString(value.missing_resource_id);
	if (kind === 'skill' && !missingSkillId) return null;
	if (kind === 'resource' && !missingResourceId) return null;

	return {
		id,
		kind,
		status,
		priority,
		domain_ids: readStringArray(value.domain_ids),
		missing_skill_id: missingSkillId ?? undefined,
		missing_resource_id: missingResourceId ?? undefined,
		user_need: readString(value.user_need) ?? '',
		summary: readString(value.summary) ?? '',
		first_seen_at: firstSeenAt,
		last_seen_at: lastSeenAt,
		occurrences: Math.max(1, Math.floor(readNumber(value.occurrences) ?? 1))
	};
}

function readObservation(value: unknown): DomainSessionObservation | null {
	if (!isRecord(value)) return null;
	const at = readString(value.at);
	const source = readString(value.source);
	if (
		!at ||
		(source !== 'current_user_message' &&
			source !== 'conversation_summary' &&
			source !== 'session_state')
	) {
		return null;
	}
	return {
		at,
		turn_run_id: readString(value.turn_run_id),
		stream_run_id: readString(value.stream_run_id),
		source,
		query_preview: readString(value.query_preview) ?? '',
		domain_ids: readStringArray(value.domain_ids),
		candidate_outcome_card_ids:
			readStringArray(value.candidate_outcome_card_ids).length > 0
				? readStringArray(value.candidate_outcome_card_ids)
				: readStringArray(value.candidate_work_capability_ids),
		recommended_skill_ids: readStringArray(value.recommended_skill_ids),
		coverage_gap_skill_ids: readStringArray(value.coverage_gap_skill_ids),
		coverage_gap_resource_ids: readStringArray(value.coverage_gap_resource_ids)
	};
}

export function readDomainSessionState(value: unknown): DomainSessionState | null {
	if (!isRecord(value)) return null;
	const activeOutcomeCardsRaw = Array.isArray(value.active_outcome_cards)
		? value.active_outcome_cards
		: Array.isArray(value.active_work_capabilities)
			? value.active_work_capabilities
			: [];
	return {
		version: 1,
		updated_at: readString(value.updated_at) ?? new Date(0).toISOString(),
		active_domains: Array.isArray(value.active_domains)
			? value.active_domains
					.map(readActiveDomain)
					.filter((item): item is DomainSessionStateEntry => Boolean(item))
			: [],
		active_outcome_cards: activeOutcomeCardsRaw
			.map(readActiveOutcomeCard)
			.filter((item): item is OutcomeCardSessionEntry => Boolean(item)),
		coverage_gaps: Array.isArray(value.coverage_gaps)
			? value.coverage_gaps
					.map(readGap)
					.filter((item): item is DomainGapSessionEntry => Boolean(item))
			: [],
		research_backlog: Array.isArray(value.research_backlog)
			? value.research_backlog
					.map(readResearchBacklogEntry)
					.filter((item): item is DomainResearchBacklogEntry => Boolean(item))
			: [],
		recent_observations: Array.isArray(value.recent_observations)
			? value.recent_observations
					.map(readObservation)
					.filter((item): item is DomainSessionObservation => Boolean(item))
			: []
	};
}

export function getActiveDomainIds(
	state: DomainSessionState | null | undefined,
	limit = 3
): string[] {
	if (!state) return [];
	return state.active_domains
		.slice()
		.sort((a, b) => {
			const timeOrder = b.last_seen_at.localeCompare(a.last_seen_at);
			if (timeOrder !== 0) return timeOrder;
			return b.occurrences - a.occurrences;
		})
		.map((domain) => domain.id)
		.slice(0, limit);
}

export function getActiveOutcomeCardIds(
	state: DomainSessionState | null | undefined,
	limit = 3
): string[] {
	if (!state) return [];
	return state.active_outcome_cards
		.slice()
		.sort((a, b) => {
			const timeOrder = b.last_seen_at.localeCompare(a.last_seen_at);
			if (timeOrder !== 0) return timeOrder;
			return b.occurrences - a.occurrences;
		})
		.map((capability) => capability.id)
		.slice(0, limit);
}

/** @deprecated Use getActiveOutcomeCardIds. */
export function getActiveWorkCapabilityIds(
	state: DomainSessionState | null | undefined,
	limit = 3
): string[] {
	return getActiveOutcomeCardIds(state, limit);
}

export function mergeDomainSessionState(
	previous: DomainSessionState | null | undefined,
	result: DomainSensingResult,
	options: MergeDomainSessionStateOptions = {}
): DomainSessionState {
	const now = toIso(options.now);
	const activeById = new Map<string, DomainSessionStateEntry>();
	for (const domain of previous?.active_domains ?? []) {
		activeById.set(domain.id, domain);
	}

	for (const domain of result.active_domains) {
		const existing = activeById.get(domain.id);
		activeById.set(domain.id, {
			id: domain.id,
			name: domain.name,
			coverage_status: domain.coverage_status,
			confidence: domain.confidence,
			first_seen_at: existing?.first_seen_at ?? now,
			last_seen_at: now,
			occurrences: (existing?.occurrences ?? 0) + 1,
			skill_ids: domain.skill_ids.slice(0, 12),
			gap_skill_ids: domain.gap_skill_ids.slice(0, 8)
		});
	}

	const activeOutcomeCardsById = new Map<string, OutcomeCardSessionEntry>();
	for (const capability of previous?.active_outcome_cards ?? []) {
		activeOutcomeCardsById.set(capability.id, capability);
	}
	for (const capability of result.candidate_outcome_cards) {
		const existing = activeOutcomeCardsById.get(capability.id);
		activeOutcomeCardsById.set(capability.id, {
			id: capability.id,
			name: capability.name,
			coverage_status: capability.coverage_status,
			confidence: capability.confidence,
			first_seen_at: existing?.first_seen_at ?? now,
			last_seen_at: now,
			occurrences: (existing?.occurrences ?? 0) + 1,
			domain_ids: capability.domain_ids.slice(0, 8),
			default_skill_id: capability.default_skill_id,
			skill_ids: capability.skill_ids.slice(0, 12)
		});
	}

	const gapsById = new Map<string, DomainGapSessionEntry>();
	for (const gap of previous?.coverage_gaps ?? []) {
		const key = gapKey(gap);
		if (key) gapsById.set(key, gap);
	}
	const researchBacklogById = new Map<string, DomainResearchBacklogEntry>();
	for (const entry of previous?.research_backlog ?? []) {
		researchBacklogById.set(entry.id, entry);
	}
	const gapCandidatesById = new Map<string, DomainGapMergeCandidate>();
	for (const domain of result.active_domains) {
		const domainGaps: DomainGapCandidate[] =
			domain.gaps.length > 0
				? domain.gaps
				: domain.gap_skill_ids.map((missingSkillId) => ({
						missing_skill_id: missingSkillId,
						user_need: `Dedicated skill coverage for ${missingSkillId}.`,
						summary: 'Queued from domain sensing coverage gaps.'
					}));

		for (const gap of domainGaps) {
			const key = gapKey(gap);
			if (!key) continue;
			const existingCandidate = gapCandidatesById.get(key);
			if (existingCandidate) {
				existingCandidate.domain_ids = unique([
					...existingCandidate.domain_ids,
					domain.id
				]).slice(0, 8);
				existingCandidate.priority = highestPriority(
					existingCandidate.priority,
					priorityForCoverageStatus(domain.coverage_status)
				);
				continue;
			}
			gapCandidatesById.set(key, {
				id: key,
				...gap,
				domain_ids: [domain.id],
				priority: priorityForCoverageStatus(domain.coverage_status)
			});
		}
	}

	for (const gap of gapCandidatesById.values()) {
		const existingGap = gapsById.get(gap.id);
		gapsById.set(gap.id, {
			missing_skill_id: gap.missing_skill_id,
			missing_resource_id: gap.missing_resource_id,
			domain_ids: unique([...(existingGap?.domain_ids ?? []), ...gap.domain_ids]).slice(0, 8),
			first_seen_at: existingGap?.first_seen_at ?? now,
			last_seen_at: now,
			occurrences: (existingGap?.occurrences ?? 0) + 1
		});

		const existingBacklog = researchBacklogById.get(gap.id);
		researchBacklogById.set(gap.id, {
			id: gap.id,
			kind: gap.missing_skill_id ? 'skill' : 'resource',
			status: 'queued',
			priority: existingBacklog?.priority
				? highestPriority(existingBacklog.priority, gap.priority)
				: gap.priority,
			domain_ids: unique([...(existingBacklog?.domain_ids ?? []), ...gap.domain_ids]).slice(
				0,
				8
			),
			missing_skill_id: gap.missing_skill_id,
			missing_resource_id: gap.missing_resource_id,
			user_need: existingBacklog?.user_need || gap.user_need,
			summary: existingBacklog?.summary || gap.summary,
			first_seen_at: existingBacklog?.first_seen_at ?? now,
			last_seen_at: now,
			occurrences: (existingBacklog?.occurrences ?? 0) + 1
		});
	}

	const observation: DomainSessionObservation = {
		at: now,
		turn_run_id: options.turnRunId ?? null,
		stream_run_id: options.streamRunId ?? null,
		source: result.source,
		query_preview:
			result.query.length > 220 ? `${result.query.slice(0, 217).trim()}...` : result.query,
		domain_ids: result.active_domains.map((domain) => domain.id).slice(0, 8),
		candidate_outcome_card_ids: result.candidate_outcome_card_ids.slice(0, 8),
		recommended_skill_ids: result.recommended_skill_ids.slice(0, 12),
		coverage_gap_skill_ids: result.coverage_gap_skill_ids.slice(0, 8),
		coverage_gap_resource_ids: result.coverage_gap_resource_ids.slice(0, 8)
	};

	return {
		version: 1,
		updated_at: now,
		active_domains: [...activeById.values()]
			.sort((a, b) => b.last_seen_at.localeCompare(a.last_seen_at))
			.slice(0, ACTIVE_DOMAIN_LIMIT),
		active_outcome_cards: [...activeOutcomeCardsById.values()]
			.sort((a, b) => b.last_seen_at.localeCompare(a.last_seen_at))
			.slice(0, ACTIVE_OUTCOME_CARD_LIMIT),
		coverage_gaps: [...gapsById.values()]
			.sort((a, b) => b.last_seen_at.localeCompare(a.last_seen_at))
			.slice(0, COVERAGE_GAP_LIMIT),
		research_backlog: sortResearchBacklog([...researchBacklogById.values()]).slice(
			0,
			RESEARCH_BACKLOG_LIMIT
		),
		recent_observations: [observation, ...(previous?.recent_observations ?? [])].slice(
			0,
			RECENT_OBSERVATION_LIMIT
		)
	};
}

export function getNewDomainResearchBacklogEntries(
	next: DomainSessionState,
	previous: DomainSessionState | null | undefined
): DomainResearchBacklogEntry[] {
	const previousIds = new Set((previous?.research_backlog ?? []).map((entry) => entry.id));
	return next.research_backlog.filter((entry) => !previousIds.has(entry.id));
}
