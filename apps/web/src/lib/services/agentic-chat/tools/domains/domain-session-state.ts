// apps/web/src/lib/services/agentic-chat/tools/domains/domain-session-state.ts
import type { DomainCoverageStatus } from './types';
import type { DomainSensingResult } from './domain-sensing';
import { getOutcomeCardById } from '../outcome-cards/catalog';

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

export type UsedDomainSignalSource =
	| 'domain_load'
	| 'outcome_card_load'
	| 'resource_load'
	| 'skill_load'
	| 'skill_loaded_event';

export type UsedDomainSessionEntry = {
	domain_id: string;
	source: UsedDomainSignalSource;
	tool_name?: string;
	skill_id?: string;
	outcome_card_id?: string;
	resource_id?: string;
	turn_run_id?: string;
	first_seen_at: string;
	last_seen_at: string;
	occurrences: number;
};

export type UsedDomainSignal = Omit<
	UsedDomainSessionEntry,
	'first_seen_at' | 'last_seen_at' | 'occurrences'
> &
	Partial<Pick<UsedDomainSessionEntry, 'first_seen_at' | 'last_seen_at' | 'occurrences'>>;

export type UnknownDomainInterestReason =
	| 'no_catalog_match'
	| 'low_confidence_catalog_match'
	| 'ambiguous_many_domains';

export type UnknownDomainInterestSessionEntry = {
	interest_key: string;
	label: string;
	query_preview: string;
	reason: UnknownDomainInterestReason;
	confidence: number;
	first_seen_at: string;
	last_seen_at: string;
	occurrences: number;
	example_queries: string[];
};

export type UnknownDomainInterestSignal = Omit<
	UnknownDomainInterestSessionEntry,
	'first_seen_at' | 'last_seen_at' | 'occurrences' | 'example_queries'
> &
	Partial<
		Pick<
			UnknownDomainInterestSessionEntry,
			'first_seen_at' | 'last_seen_at' | 'occurrences' | 'example_queries'
		>
	>;

export type WorkflowGapCandidateSessionEntry = {
	queue_key: string;
	kind: 'domain' | 'work_capability' | 'skill' | 'resource';
	domain_ids: string[];
	label: string;
	user_need: string;
	summary: string;
	source: 'partial_domain_without_gap' | 'unknown_domain_interest' | 'missing_process';
	priority: DomainResearchBacklogEntry['priority'];
	first_seen_at: string;
	last_seen_at: string;
	occurrences: number;
};

export type WorkflowGapCandidateSignal = Omit<
	WorkflowGapCandidateSessionEntry,
	'first_seen_at' | 'last_seen_at' | 'occurrences'
> &
	Partial<
		Pick<WorkflowGapCandidateSessionEntry, 'first_seen_at' | 'last_seen_at' | 'occurrences'>
	>;

export type LoadedOutcomeCardGapSignal = {
	outcome_card_id?: string;
	domain_ids: string[];
	coverage_status: DomainCoverageStatus;
	missing_skill_id?: string;
	missing_resource_id?: string;
	user_need: string;
	summary: string;
};

export type LoadedOutcomeCardGapToolExecution = {
	toolCall?: {
		function?: {
			name?: unknown;
		};
	};
	result?: {
		success?: unknown;
		result?: unknown;
	};
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
	used_domains: UsedDomainSessionEntry[];
	unknown_domain_interests: UnknownDomainInterestSessionEntry[];
	workflow_gap_candidates: WorkflowGapCandidateSessionEntry[];
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
const USED_DOMAIN_LIMIT = 24;
const UNKNOWN_DOMAIN_INTEREST_LIMIT = 16;
const UNKNOWN_DOMAIN_INTEREST_EXAMPLE_LIMIT = 5;
const WORKFLOW_GAP_CANDIDATE_LIMIT = 16;
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

function sortPriorityEntries<
	T extends {
		priority: DomainResearchBacklogEntry['priority'];
		last_seen_at: string;
		occurrences: number;
	}
>(entries: T[]): T[] {
	return entries.sort((a, b) => {
		const priorityDelta = priorityRank(a.priority) - priorityRank(b.priority);
		if (priorityDelta !== 0) return priorityDelta;
		const timeOrder = b.last_seen_at.localeCompare(a.last_seen_at);
		if (timeOrder !== 0) return timeOrder;
		return b.occurrences - a.occurrences;
	});
}

function sortResearchBacklog(entries: DomainResearchBacklogEntry[]): DomainResearchBacklogEntry[] {
	return sortPriorityEntries(entries);
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

function readOccurrences(value: unknown): number {
	return Math.max(1, Math.floor(readNumber(value) ?? 1));
}

function readConfidence(value: unknown): number {
	const confidence = readNumber(value) ?? 0.5;
	return Math.max(0, Math.min(1, confidence));
}

function isUsedDomainSource(value: string | null): value is UsedDomainSignalSource {
	return (
		value === 'domain_load' ||
		value === 'outcome_card_load' ||
		value === 'resource_load' ||
		value === 'skill_load' ||
		value === 'skill_loaded_event'
	);
}

function isUnknownDomainInterestReason(value: string | null): value is UnknownDomainInterestReason {
	return (
		value === 'no_catalog_match' ||
		value === 'low_confidence_catalog_match' ||
		value === 'ambiguous_many_domains'
	);
}

function isWorkflowGapCandidateKind(
	value: string | null
): value is WorkflowGapCandidateSessionEntry['kind'] {
	return (
		value === 'domain' ||
		value === 'work_capability' ||
		value === 'skill' ||
		value === 'resource'
	);
}

function isWorkflowGapCandidateSource(
	value: string | null
): value is WorkflowGapCandidateSessionEntry['source'] {
	return (
		value === 'partial_domain_without_gap' ||
		value === 'unknown_domain_interest' ||
		value === 'missing_process'
	);
}

function isPriority(value: string | null): value is DomainResearchBacklogEntry['priority'] {
	return value === 'high' || value === 'medium' || value === 'low';
}

function readCoverageStatus(value: unknown): DomainCoverageStatus {
	const status = readString(value);
	if (status === 'strong' || status === 'partial' || status === 'none') return status;
	return 'partial';
}

function readUsedDomain(value: unknown): UsedDomainSessionEntry | null {
	if (!isRecord(value)) return null;
	const domainId = readString(value.domain_id);
	const source = readString(value.source);
	const firstSeenAt = readString(value.first_seen_at);
	const lastSeenAt = readString(value.last_seen_at);
	if (!domainId || !isUsedDomainSource(source) || !firstSeenAt || !lastSeenAt) return null;

	return {
		domain_id: domainId,
		source,
		tool_name: readString(value.tool_name) ?? undefined,
		skill_id: readString(value.skill_id) ?? undefined,
		outcome_card_id: readString(value.outcome_card_id) ?? undefined,
		resource_id: readString(value.resource_id) ?? undefined,
		turn_run_id: readString(value.turn_run_id) ?? undefined,
		first_seen_at: firstSeenAt,
		last_seen_at: lastSeenAt,
		occurrences: readOccurrences(value.occurrences)
	};
}

function readUnknownDomainInterest(value: unknown): UnknownDomainInterestSessionEntry | null {
	if (!isRecord(value)) return null;
	const interestKey = readString(value.interest_key);
	const label = readString(value.label);
	const queryPreview = readString(value.query_preview);
	const reason = readString(value.reason);
	const firstSeenAt = readString(value.first_seen_at);
	const lastSeenAt = readString(value.last_seen_at);
	if (
		!interestKey ||
		!label ||
		!queryPreview ||
		!isUnknownDomainInterestReason(reason) ||
		!firstSeenAt ||
		!lastSeenAt
	) {
		return null;
	}

	const exampleQueries = unique(readStringArray(value.example_queries)).slice(
		0,
		UNKNOWN_DOMAIN_INTEREST_EXAMPLE_LIMIT
	);

	return {
		interest_key: interestKey,
		label,
		query_preview: queryPreview,
		reason,
		confidence: readConfidence(value.confidence),
		first_seen_at: firstSeenAt,
		last_seen_at: lastSeenAt,
		occurrences: readOccurrences(value.occurrences),
		example_queries: exampleQueries.length > 0 ? exampleQueries : [queryPreview]
	};
}

function readWorkflowGapCandidate(value: unknown): WorkflowGapCandidateSessionEntry | null {
	if (!isRecord(value)) return null;
	const queueKey = readString(value.queue_key);
	const kind = readString(value.kind);
	const label = readString(value.label);
	const userNeed = readString(value.user_need);
	const summary = readString(value.summary);
	const source = readString(value.source);
	const priority = readString(value.priority);
	const firstSeenAt = readString(value.first_seen_at);
	const lastSeenAt = readString(value.last_seen_at);
	if (
		!queueKey ||
		!isWorkflowGapCandidateKind(kind) ||
		!label ||
		!userNeed ||
		!summary ||
		!isWorkflowGapCandidateSource(source) ||
		!isPriority(priority) ||
		!firstSeenAt ||
		!lastSeenAt
	) {
		return null;
	}

	return {
		queue_key: queueKey,
		kind,
		domain_ids: readStringArray(value.domain_ids).slice(0, 8),
		label,
		user_need: userNeed,
		summary,
		source,
		priority,
		first_seen_at: firstSeenAt,
		last_seen_at: lastSeenAt,
		occurrences: readOccurrences(value.occurrences)
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
		used_domains: Array.isArray(value.used_domains)
			? value.used_domains
					.map(readUsedDomain)
					.filter((item): item is UsedDomainSessionEntry => Boolean(item))
			: [],
		unknown_domain_interests: Array.isArray(value.unknown_domain_interests)
			? value.unknown_domain_interests
					.map(readUnknownDomainInterest)
					.filter((item): item is UnknownDomainInterestSessionEntry => Boolean(item))
			: [],
		workflow_gap_candidates: Array.isArray(value.workflow_gap_candidates)
			? value.workflow_gap_candidates
					.map(readWorkflowGapCandidate)
					.filter((item): item is WorkflowGapCandidateSessionEntry => Boolean(item))
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

function createEmptyDomainSessionState(now: string): DomainSessionState {
	return {
		version: 1,
		updated_at: now,
		active_domains: [],
		active_outcome_cards: [],
		coverage_gaps: [],
		research_backlog: [],
		used_domains: [],
		unknown_domain_interests: [],
		workflow_gap_candidates: [],
		recent_observations: []
	};
}

function normalizeStateForMerge(
	state: DomainSessionState | null | undefined,
	now: string
): DomainSessionState {
	const base = state ?? createEmptyDomainSessionState(now);
	return {
		...base,
		version: 1,
		updated_at: now,
		active_domains: base.active_domains ?? [],
		active_outcome_cards: base.active_outcome_cards ?? [],
		coverage_gaps: base.coverage_gaps ?? [],
		research_backlog: base.research_backlog ?? [],
		used_domains: base.used_domains ?? [],
		unknown_domain_interests: base.unknown_domain_interests ?? [],
		workflow_gap_candidates: base.workflow_gap_candidates ?? [],
		recent_observations: base.recent_observations ?? []
	};
}

function sortRecentEntries<T extends { last_seen_at: string; occurrences: number }>(
	entries: T[]
): T[] {
	return entries.sort((a, b) => {
		const timeOrder = b.last_seen_at.localeCompare(a.last_seen_at);
		if (timeOrder !== 0) return timeOrder;
		return b.occurrences - a.occurrences;
	});
}

function usedDomainKey(
	entry: Pick<UsedDomainSessionEntry, 'domain_id' | 'source'> & {
		tool_name?: string;
		skill_id?: string;
		outcome_card_id?: string;
		resource_id?: string;
	}
): string {
	return [
		entry.domain_id,
		entry.source,
		entry.skill_id ?? '',
		entry.outcome_card_id ?? '',
		entry.resource_id ?? '',
		entry.tool_name ?? ''
	].join('|');
}

function normalizeUsedDomainSignal(
	signal: UsedDomainSignal,
	now: string
): UsedDomainSessionEntry | null {
	const domainId = readString(signal.domain_id);
	const source = readString(signal.source);
	if (!domainId || !isUsedDomainSource(source)) return null;
	return {
		domain_id: domainId,
		source,
		tool_name: readString(signal.tool_name) ?? undefined,
		skill_id: readString(signal.skill_id) ?? undefined,
		outcome_card_id: readString(signal.outcome_card_id) ?? undefined,
		resource_id: readString(signal.resource_id) ?? undefined,
		turn_run_id: readString(signal.turn_run_id) ?? undefined,
		first_seen_at: readString(signal.first_seen_at) ?? now,
		last_seen_at: readString(signal.last_seen_at) ?? now,
		occurrences: readOccurrences(signal.occurrences)
	};
}

function normalizeUnknownDomainInterestSignal(
	signal: UnknownDomainInterestSignal,
	now: string
): UnknownDomainInterestSessionEntry | null {
	const interestKey = readString(signal.interest_key);
	const label = readString(signal.label);
	const queryPreview = readString(signal.query_preview);
	const reason = readString(signal.reason);
	if (!interestKey || !label || !queryPreview || !isUnknownDomainInterestReason(reason)) {
		return null;
	}
	const exampleQueries = unique([queryPreview, ...readStringArray(signal.example_queries)]).slice(
		0,
		UNKNOWN_DOMAIN_INTEREST_EXAMPLE_LIMIT
	);
	return {
		interest_key: interestKey,
		label,
		query_preview: queryPreview,
		reason,
		confidence: readConfidence(signal.confidence),
		first_seen_at: readString(signal.first_seen_at) ?? now,
		last_seen_at: readString(signal.last_seen_at) ?? now,
		occurrences: readOccurrences(signal.occurrences),
		example_queries: exampleQueries
	};
}

function normalizeWorkflowGapCandidateSignal(
	signal: WorkflowGapCandidateSignal,
	now: string
): WorkflowGapCandidateSessionEntry | null {
	const queueKey = readString(signal.queue_key);
	const kind = readString(signal.kind);
	const label = readString(signal.label);
	const userNeed = readString(signal.user_need);
	const summary = readString(signal.summary);
	const source = readString(signal.source);
	const priority = readString(signal.priority);
	if (
		!queueKey ||
		!isWorkflowGapCandidateKind(kind) ||
		!label ||
		!userNeed ||
		!summary ||
		!isWorkflowGapCandidateSource(source) ||
		!isPriority(priority)
	) {
		return null;
	}

	return {
		queue_key: queueKey,
		kind,
		domain_ids: readStringArray(signal.domain_ids).slice(0, 8),
		label,
		user_need: userNeed,
		summary,
		source,
		priority,
		first_seen_at: readString(signal.first_seen_at) ?? now,
		last_seen_at: readString(signal.last_seen_at) ?? now,
		occurrences: readOccurrences(signal.occurrences)
	};
}

function upsertGapMergeCandidate(
	candidates: Map<string, DomainGapMergeCandidate>,
	gap: DomainGapCandidate,
	domainIds: string[],
	priority: DomainResearchBacklogEntry['priority']
): void {
	const key = gapKey(gap);
	if (!key) return;
	const existing = candidates.get(key);
	if (existing) {
		existing.domain_ids = unique([...existing.domain_ids, ...domainIds]).slice(0, 8);
		existing.priority = highestPriority(existing.priority, priority);
		return;
	}
	candidates.set(key, {
		id: key,
		...gap,
		domain_ids: unique(domainIds).slice(0, 8),
		priority
	});
}

function mergeCoverageGapCandidates(
	previous: Pick<DomainSessionState, 'coverage_gaps' | 'research_backlog'> | null | undefined,
	candidates: Iterable<DomainGapMergeCandidate>,
	now: string
): Pick<DomainSessionState, 'coverage_gaps' | 'research_backlog'> {
	const gapsById = new Map<string, DomainGapSessionEntry>();
	for (const gap of previous?.coverage_gaps ?? []) {
		const key = gapKey(gap);
		if (key) gapsById.set(key, gap);
	}
	const researchBacklogById = new Map<string, DomainResearchBacklogEntry>();
	for (const entry of previous?.research_backlog ?? []) {
		researchBacklogById.set(entry.id, entry);
	}

	for (const gap of candidates) {
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

	return {
		coverage_gaps: [...gapsById.values()]
			.sort((a, b) => b.last_seen_at.localeCompare(a.last_seen_at))
			.slice(0, COVERAGE_GAP_LIMIT),
		research_backlog: sortResearchBacklog([...researchBacklogById.values()]).slice(
			0,
			RESEARCH_BACKLOG_LIMIT
		)
	};
}

function readLoadedOutcomeCardGap(value: unknown): DomainGapCandidate | null {
	if (!isRecord(value)) return null;
	const missingSkillId = readString(value.missing_skill_id);
	const missingResourceId = readString(value.missing_resource_id);
	if (!missingSkillId && !missingResourceId) return null;
	const missingId = missingSkillId ?? missingResourceId ?? 'unknown';
	return {
		missing_skill_id: missingSkillId ?? undefined,
		missing_resource_id: missingResourceId ?? undefined,
		user_need: readString(value.user_need) ?? `Coverage for ${missingId}.`,
		summary: readString(value.summary) ?? 'Queued from loaded outcome-card coverage gaps.'
	};
}

function readCatalogOutcomeCardGap(value: {
	missingSkillId?: string;
	missingResourceId?: string;
	userNeed: string;
	summary: string;
}): DomainGapCandidate | null {
	if (!value.missingSkillId && !value.missingResourceId) return null;
	return {
		missing_skill_id: value.missingSkillId,
		missing_resource_id: value.missingResourceId,
		user_need: value.userNeed,
		summary: value.summary
	};
}

function isOutcomeCardLoadToolName(value: string | null): boolean {
	return value === 'outcome_card_load' || value === 'work_capability_load';
}

function isLoadedOutcomeCardPayload(value: unknown): value is Record<string, unknown> {
	if (!isRecord(value)) return false;
	const type = readString(value.type);
	return type !== 'not_found' && type !== 'forbidden';
}

export function deriveLoadedOutcomeCardGapSignalsFromToolExecutions(
	executions: LoadedOutcomeCardGapToolExecution[]
): LoadedOutcomeCardGapSignal[] {
	const signals: LoadedOutcomeCardGapSignal[] = [];

	for (const execution of executions) {
		const toolName = readString(execution.toolCall?.function?.name)?.toLowerCase() ?? null;
		if (!isOutcomeCardLoadToolName(toolName) || execution.result?.success !== true) continue;
		const payload = execution.result.result;
		if (!isLoadedOutcomeCardPayload(payload)) continue;
		const outcomeCardId =
			readString(payload.id) ??
			readString(payload.outcome_card_id) ??
			readString(payload.work_capability_id);
		const catalogOutcomeCard = outcomeCardId ? getOutcomeCardById(outcomeCardId) : undefined;
		const payloadGaps = Array.isArray(payload.gaps)
			? payload.gaps
					.map(readLoadedOutcomeCardGap)
					.filter((gap): gap is DomainGapCandidate => Boolean(gap))
			: [];
		const gaps =
			payloadGaps.length > 0
				? payloadGaps
				: (catalogOutcomeCard?.gaps ?? [])
						.map(readCatalogOutcomeCardGap)
						.filter((gap): gap is DomainGapCandidate => Boolean(gap));
		if (gaps.length === 0) continue;
		const explicitDomainIds = readStringArray(payload.domain_ids);
		const domainIds = (
			explicitDomainIds.length > 0 ? explicitDomainIds : (catalogOutcomeCard?.domainIds ?? [])
		).slice(0, 8);
		const coverageStatus = readCoverageStatus(
			payload.coverage_status ?? catalogOutcomeCard?.coverageStatus
		);
		for (const gap of gaps) {
			signals.push({
				...(outcomeCardId ? { outcome_card_id: outcomeCardId } : {}),
				domain_ids: domainIds,
				coverage_status: coverageStatus,
				missing_skill_id: gap.missing_skill_id,
				missing_resource_id: gap.missing_resource_id,
				user_need: gap.user_need,
				summary: gap.summary
			});
		}
	}

	return signals;
}

export function mergeLoadedOutcomeCardGapsIntoSessionState(
	previous: DomainSessionState | null | undefined,
	signals: LoadedOutcomeCardGapSignal[],
	options: { now?: Date | string } = {}
): DomainSessionState {
	const now = toIso(options.now);
	const base = normalizeStateForMerge(previous, now);
	if (signals.length === 0) return base;
	const gapCandidatesById = new Map<string, DomainGapMergeCandidate>();
	for (const signal of signals) {
		upsertGapMergeCandidate(
			gapCandidatesById,
			{
				missing_skill_id: signal.missing_skill_id,
				missing_resource_id: signal.missing_resource_id,
				user_need: signal.user_need,
				summary: signal.summary
			},
			signal.domain_ids,
			priorityForCoverageStatus(signal.coverage_status)
		);
	}
	const mergedGaps = mergeCoverageGapCandidates(base, gapCandidatesById.values(), now);
	return {
		...base,
		updated_at: now,
		...mergedGaps
	};
}

export function mergeUsedDomainSignalsIntoSessionState(
	previous: DomainSessionState | null | undefined,
	signals: UsedDomainSignal[],
	options: { now?: Date | string } = {}
): DomainSessionState {
	const now = toIso(options.now);
	const base = normalizeStateForMerge(previous, now);
	const byKey = new Map<string, UsedDomainSessionEntry>();
	for (const entry of base.used_domains) {
		byKey.set(usedDomainKey(entry), entry);
	}

	for (const signal of signals) {
		const normalized = normalizeUsedDomainSignal(signal, now);
		if (!normalized) continue;
		const key = usedDomainKey(normalized);
		const existing = byKey.get(key);
		byKey.set(key, {
			...normalized,
			first_seen_at: existing?.first_seen_at ?? normalized.first_seen_at,
			last_seen_at: normalized.last_seen_at,
			occurrences: (existing?.occurrences ?? 0) + normalized.occurrences,
			turn_run_id: normalized.turn_run_id ?? existing?.turn_run_id
		});
	}

	return {
		...base,
		updated_at: now,
		used_domains: sortRecentEntries([...byKey.values()]).slice(0, USED_DOMAIN_LIMIT)
	};
}

export function mergeUnknownDomainInterestsIntoSessionState(
	previous: DomainSessionState | null | undefined,
	signals: UnknownDomainInterestSignal[],
	options: { now?: Date | string } = {}
): DomainSessionState {
	const now = toIso(options.now);
	const base = normalizeStateForMerge(previous, now);
	const byKey = new Map<string, UnknownDomainInterestSessionEntry>();
	for (const entry of base.unknown_domain_interests) {
		byKey.set(entry.interest_key, entry);
	}

	for (const signal of signals) {
		const normalized = normalizeUnknownDomainInterestSignal(signal, now);
		if (!normalized) continue;
		const existing = byKey.get(normalized.interest_key);
		byKey.set(normalized.interest_key, {
			...normalized,
			first_seen_at: existing?.first_seen_at ?? normalized.first_seen_at,
			last_seen_at: normalized.last_seen_at,
			occurrences: (existing?.occurrences ?? 0) + normalized.occurrences,
			confidence: Math.max(existing?.confidence ?? 0, normalized.confidence),
			example_queries: unique([
				...normalized.example_queries,
				...(existing?.example_queries ?? [])
			]).slice(0, UNKNOWN_DOMAIN_INTEREST_EXAMPLE_LIMIT)
		});
	}

	return {
		...base,
		updated_at: now,
		unknown_domain_interests: sortRecentEntries([...byKey.values()]).slice(
			0,
			UNKNOWN_DOMAIN_INTEREST_LIMIT
		)
	};
}

export function mergeWorkflowGapCandidatesIntoSessionState(
	previous: DomainSessionState | null | undefined,
	signals: WorkflowGapCandidateSignal[],
	options: { now?: Date | string } = {}
): DomainSessionState {
	const now = toIso(options.now);
	const base = normalizeStateForMerge(previous, now);
	const byKey = new Map<string, WorkflowGapCandidateSessionEntry>();
	for (const entry of base.workflow_gap_candidates) {
		byKey.set(entry.queue_key, entry);
	}

	for (const signal of signals) {
		const normalized = normalizeWorkflowGapCandidateSignal(signal, now);
		if (!normalized) continue;
		const existing = byKey.get(normalized.queue_key);
		byKey.set(normalized.queue_key, {
			...normalized,
			first_seen_at: existing?.first_seen_at ?? normalized.first_seen_at,
			last_seen_at: normalized.last_seen_at,
			occurrences: (existing?.occurrences ?? 0) + normalized.occurrences,
			priority: existing?.priority
				? highestPriority(existing.priority, normalized.priority)
				: normalized.priority,
			domain_ids: unique([...(existing?.domain_ids ?? []), ...normalized.domain_ids]).slice(
				0,
				8
			)
		});
	}

	return {
		...base,
		updated_at: now,
		workflow_gap_candidates: sortPriorityEntries([...byKey.values()]).slice(
			0,
			WORKFLOW_GAP_CANDIDATE_LIMIT
		)
	};
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
			upsertGapMergeCandidate(
				gapCandidatesById,
				gap,
				[domain.id],
				priorityForCoverageStatus(domain.coverage_status)
			);
		}
	}

	for (const capability of result.candidate_outcome_cards) {
		for (const gap of capability.gaps) {
			upsertGapMergeCandidate(
				gapCandidatesById,
				gap,
				capability.domain_ids,
				priorityForCoverageStatus(capability.coverage_status)
			);
		}
	}
	const mergedGaps = mergeCoverageGapCandidates(previous, gapCandidatesById.values(), now);

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
		coverage_gaps: mergedGaps.coverage_gaps,
		research_backlog: mergedGaps.research_backlog,
		used_domains: sortRecentEntries([...(previous?.used_domains ?? [])]).slice(
			0,
			USED_DOMAIN_LIMIT
		),
		unknown_domain_interests: sortRecentEntries([
			...(previous?.unknown_domain_interests ?? [])
		]).slice(0, UNKNOWN_DOMAIN_INTEREST_LIMIT),
		workflow_gap_candidates: sortPriorityEntries([
			...(previous?.workflow_gap_candidates ?? [])
		]).slice(0, WORKFLOW_GAP_CANDIDATE_LIMIT),
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
