// apps/web/src/lib/services/admin/domain-demand-analytics.ts
import {
	readDomainSessionState,
	type DomainResearchBacklogEntry
} from '$lib/services/agentic-chat/tools/domains/domain-session-state';
import {
	buildDomainResearchQueueCandidatesFromSessionRows,
	type DomainResearchQueueCandidate
} from '$lib/services/agentic-chat/tools/domains/domain-research-queue';
import type { DomainCoverageStatus } from '$lib/services/agentic-chat/tools/domains/types';

export interface DomainDemandSessionRow {
	id: string;
	user_id?: string | null;
	created_at?: string | null;
	updated_at?: string | null;
	agent_metadata?: unknown;
}

export interface DomainDemandMetric {
	domain_id: string;
	name: string;
	coverage_status: DomainCoverageStatus;
	total_occurrences: number;
	unique_sessions: number;
	unique_users: number;
	confidence_max: number;
	confidence_avg: number;
	first_seen_at: string | null;
	last_seen_at: string | null;
	skill_ids: string[];
	gap_skill_ids: string[];
	research_backlog_ids: string[];
}

export interface DomainResearchBacklogMetric {
	id: string;
	kind: DomainResearchBacklogEntry['kind'];
	status: DomainResearchBacklogEntry['status'];
	priority: DomainResearchBacklogEntry['priority'];
	total_occurrences: number;
	unique_sessions: number;
	unique_users: number;
	domain_ids: string[];
	missing_skill_id?: string;
	missing_resource_id?: string;
	user_need: string;
	summary: string;
	first_seen_at: string | null;
	last_seen_at: string | null;
}

export interface DomainCoverageGapMetric {
	id: string;
	missing_skill_id?: string;
	missing_resource_id?: string;
	total_occurrences: number;
	unique_sessions: number;
	unique_users: number;
	domain_ids: string[];
	first_seen_at: string | null;
	last_seen_at: string | null;
}

export interface DomainDemandAnalyticsPayload {
	data_source: {
		primary: 'chat_sessions.agent_metadata.fastchat_domain_state';
		row_count: number;
		sessions_with_domain_state: number;
		generated_at: string;
		start_date: string | null;
		end_date: string | null;
	};
	overview: {
		total_domains: number;
		total_domain_occurrences: number;
		total_research_backlog_items: number;
		total_coverage_gaps: number;
		partial_or_no_coverage_sessions: number;
		coverage_status_counts: Record<DomainCoverageStatus, number>;
		research_priority_counts: Record<DomainResearchBacklogEntry['priority'], number>;
	};
	domains: DomainDemandMetric[];
	research_backlog: DomainResearchBacklogMetric[];
	research_queue_candidates: DomainResearchQueueCandidate[];
	coverage_gaps: DomainCoverageGapMetric[];
}

type DomainAccumulator = {
	domain_id: string;
	name: string;
	coverage_status: DomainCoverageStatus;
	total_occurrences: number;
	sessionIds: Set<string>;
	userIds: Set<string>;
	confidenceTotal: number;
	confidenceCount: number;
	confidenceMax: number;
	first_seen_at: string | null;
	last_seen_at: string | null;
	skillIds: Set<string>;
	gapSkillIds: Set<string>;
	researchBacklogIds: Set<string>;
};

type BacklogAccumulator = {
	id: string;
	kind: DomainResearchBacklogEntry['kind'];
	status: DomainResearchBacklogEntry['status'];
	priority: DomainResearchBacklogEntry['priority'];
	total_occurrences: number;
	sessionIds: Set<string>;
	userIds: Set<string>;
	domainIds: Set<string>;
	missing_skill_id?: string;
	missing_resource_id?: string;
	user_need: string;
	summary: string;
	first_seen_at: string | null;
	last_seen_at: string | null;
};

type GapAccumulator = {
	id: string;
	missing_skill_id?: string;
	missing_resource_id?: string;
	total_occurrences: number;
	sessionIds: Set<string>;
	userIds: Set<string>;
	domainIds: Set<string>;
	first_seen_at: string | null;
	last_seen_at: string | null;
};

type BuildDomainDemandAnalyticsOptions = {
	now?: Date | string;
	startDate?: string | null;
	endDate?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readDomainStateFromMetadata(metadata: unknown): ReturnType<typeof readDomainSessionState> {
	if (!isRecord(metadata)) return null;
	return readDomainSessionState(metadata.fastchat_domain_state);
}

function uniqueSorted(values: Iterable<string>): string[] {
	return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function minIso(current: string | null, next: string | null | undefined): string | null {
	if (!next) return current;
	if (!current) return next;
	return next.localeCompare(current) < 0 ? next : current;
}

function maxIso(current: string | null, next: string | null | undefined): string | null {
	if (!next) return current;
	if (!current) return next;
	return next.localeCompare(current) > 0 ? next : current;
}

function gapId(gap: { missing_skill_id?: string; missing_resource_id?: string }): string | null {
	if (gap.missing_skill_id) return `skill:${gap.missing_skill_id}`;
	if (gap.missing_resource_id) return `resource:${gap.missing_resource_id}`;
	return null;
}

function priorityRank(priority: DomainResearchBacklogEntry['priority']): number {
	if (priority === 'high') return 0;
	if (priority === 'medium') return 1;
	return 2;
}

function hasDomainStateSignal(state: ReturnType<typeof readDomainSessionState>): boolean {
	if (!state) return false;
	return (
		state.active_domains.length > 0 ||
		state.active_outcome_cards.length > 0 ||
		state.coverage_gaps.length > 0 ||
		state.research_backlog.length > 0 ||
		state.recent_observations.length > 0
	);
}

export function buildDomainDemandAnalytics(
	rows: DomainDemandSessionRow[],
	options: BuildDomainDemandAnalyticsOptions = {}
): DomainDemandAnalyticsPayload {
	const generatedAt =
		options.now instanceof Date
			? options.now.toISOString()
			: typeof options.now === 'string'
				? options.now
				: new Date().toISOString();
	const domainsById = new Map<string, DomainAccumulator>();
	const backlogById = new Map<string, BacklogAccumulator>();
	const gapsById = new Map<string, GapAccumulator>();
	const partialOrNoCoverageSessions = new Set<string>();
	let sessionsWithDomainState = 0;

	for (const row of rows) {
		const state = readDomainStateFromMetadata(row.agent_metadata);
		if (!hasDomainStateSignal(state)) continue;
		sessionsWithDomainState += 1;
		const sessionId = row.id;
		const userId = row.user_id?.trim() || null;

		const backlogIdsByDomain = new Map<string, Set<string>>();
		for (const entry of state?.research_backlog ?? []) {
			const current = backlogById.get(entry.id) ?? {
				id: entry.id,
				kind: entry.kind,
				status: entry.status,
				priority: entry.priority,
				total_occurrences: 0,
				sessionIds: new Set<string>(),
				userIds: new Set<string>(),
				domainIds: new Set<string>(),
				missing_skill_id: entry.missing_skill_id,
				missing_resource_id: entry.missing_resource_id,
				user_need: entry.user_need,
				summary: entry.summary,
				first_seen_at: null,
				last_seen_at: null
			};
			current.total_occurrences += entry.occurrences;
			current.sessionIds.add(sessionId);
			if (userId) current.userIds.add(userId);
			for (const domainId of entry.domain_ids) {
				current.domainIds.add(domainId);
				const domainBacklogIds = backlogIdsByDomain.get(domainId) ?? new Set<string>();
				domainBacklogIds.add(entry.id);
				backlogIdsByDomain.set(domainId, domainBacklogIds);
			}
			current.first_seen_at = minIso(current.first_seen_at, entry.first_seen_at);
			current.last_seen_at = maxIso(current.last_seen_at, entry.last_seen_at);
			backlogById.set(entry.id, current);
		}

		for (const gap of state?.coverage_gaps ?? []) {
			const id = gapId(gap);
			if (!id) continue;
			const current = gapsById.get(id) ?? {
				id,
				missing_skill_id: gap.missing_skill_id,
				missing_resource_id: gap.missing_resource_id,
				total_occurrences: 0,
				sessionIds: new Set<string>(),
				userIds: new Set<string>(),
				domainIds: new Set<string>(),
				first_seen_at: null,
				last_seen_at: null
			};
			current.total_occurrences += gap.occurrences;
			current.sessionIds.add(sessionId);
			if (userId) current.userIds.add(userId);
			for (const domainId of gap.domain_ids) {
				current.domainIds.add(domainId);
			}
			current.first_seen_at = minIso(current.first_seen_at, gap.first_seen_at);
			current.last_seen_at = maxIso(current.last_seen_at, gap.last_seen_at);
			gapsById.set(id, current);
		}

		for (const domain of state?.active_domains ?? []) {
			if (domain.coverage_status !== 'strong') {
				partialOrNoCoverageSessions.add(sessionId);
			}
			const current = domainsById.get(domain.id) ?? {
				domain_id: domain.id,
				name: domain.name,
				coverage_status: domain.coverage_status,
				total_occurrences: 0,
				sessionIds: new Set<string>(),
				userIds: new Set<string>(),
				confidenceTotal: 0,
				confidenceCount: 0,
				confidenceMax: 0,
				first_seen_at: null,
				last_seen_at: null,
				skillIds: new Set<string>(),
				gapSkillIds: new Set<string>(),
				researchBacklogIds: new Set<string>()
			};
			current.total_occurrences += domain.occurrences;
			current.sessionIds.add(sessionId);
			if (userId) current.userIds.add(userId);
			current.confidenceTotal += domain.confidence;
			current.confidenceCount += 1;
			current.confidenceMax = Math.max(current.confidenceMax, domain.confidence);
			current.first_seen_at = minIso(current.first_seen_at, domain.first_seen_at);
			current.last_seen_at = maxIso(current.last_seen_at, domain.last_seen_at);
			for (const skillId of domain.skill_ids) current.skillIds.add(skillId);
			for (const skillId of domain.gap_skill_ids) current.gapSkillIds.add(skillId);
			for (const backlogId of backlogIdsByDomain.get(domain.id) ?? []) {
				current.researchBacklogIds.add(backlogId);
			}
			domainsById.set(domain.id, current);
		}
	}

	const domains = Array.from(domainsById.values())
		.map<DomainDemandMetric>((domain) => ({
			domain_id: domain.domain_id,
			name: domain.name,
			coverage_status: domain.coverage_status,
			total_occurrences: domain.total_occurrences,
			unique_sessions: domain.sessionIds.size,
			unique_users: domain.userIds.size,
			confidence_max: Number(domain.confidenceMax.toFixed(2)),
			confidence_avg:
				domain.confidenceCount > 0
					? Number((domain.confidenceTotal / domain.confidenceCount).toFixed(2))
					: 0,
			first_seen_at: domain.first_seen_at,
			last_seen_at: domain.last_seen_at,
			skill_ids: uniqueSorted(domain.skillIds),
			gap_skill_ids: uniqueSorted(domain.gapSkillIds),
			research_backlog_ids: uniqueSorted(domain.researchBacklogIds)
		}))
		.sort((a, b) => {
			if (b.total_occurrences !== a.total_occurrences) {
				return b.total_occurrences - a.total_occurrences;
			}
			return (b.last_seen_at ?? '').localeCompare(a.last_seen_at ?? '');
		});

	const researchBacklog = Array.from(backlogById.values())
		.map<DomainResearchBacklogMetric>((entry) => ({
			id: entry.id,
			kind: entry.kind,
			status: entry.status,
			priority: entry.priority,
			total_occurrences: entry.total_occurrences,
			unique_sessions: entry.sessionIds.size,
			unique_users: entry.userIds.size,
			domain_ids: uniqueSorted(entry.domainIds),
			missing_skill_id: entry.missing_skill_id,
			missing_resource_id: entry.missing_resource_id,
			user_need: entry.user_need,
			summary: entry.summary,
			first_seen_at: entry.first_seen_at,
			last_seen_at: entry.last_seen_at
		}))
		.sort((a, b) => {
			const priorityDelta = priorityRank(a.priority) - priorityRank(b.priority);
			if (priorityDelta !== 0) return priorityDelta;
			if (b.total_occurrences !== a.total_occurrences) {
				return b.total_occurrences - a.total_occurrences;
			}
			return (b.last_seen_at ?? '').localeCompare(a.last_seen_at ?? '');
		});

	const coverageGaps = Array.from(gapsById.values())
		.map<DomainCoverageGapMetric>((gap) => ({
			id: gap.id,
			missing_skill_id: gap.missing_skill_id,
			missing_resource_id: gap.missing_resource_id,
			total_occurrences: gap.total_occurrences,
			unique_sessions: gap.sessionIds.size,
			unique_users: gap.userIds.size,
			domain_ids: uniqueSorted(gap.domainIds),
			first_seen_at: gap.first_seen_at,
			last_seen_at: gap.last_seen_at
		}))
		.sort((a, b) => {
			if (b.total_occurrences !== a.total_occurrences) {
				return b.total_occurrences - a.total_occurrences;
			}
			return (b.last_seen_at ?? '').localeCompare(a.last_seen_at ?? '');
		});

	const coverageStatusCounts: Record<DomainCoverageStatus, number> = {
		none: 0,
		partial: 0,
		strong: 0
	};
	for (const domain of domains) {
		coverageStatusCounts[domain.coverage_status] += 1;
	}

	const researchPriorityCounts: Record<DomainResearchBacklogEntry['priority'], number> = {
		high: 0,
		medium: 0,
		low: 0
	};
	for (const entry of researchBacklog) {
		researchPriorityCounts[entry.priority] += 1;
	}

	return {
		data_source: {
			primary: 'chat_sessions.agent_metadata.fastchat_domain_state',
			row_count: rows.length,
			sessions_with_domain_state: sessionsWithDomainState,
			generated_at: generatedAt,
			start_date: options.startDate ?? null,
			end_date: options.endDate ?? null
		},
		overview: {
			total_domains: domains.length,
			total_domain_occurrences: domains.reduce(
				(total, domain) => total + domain.total_occurrences,
				0
			),
			total_research_backlog_items: researchBacklog.length,
			total_coverage_gaps: coverageGaps.length,
			partial_or_no_coverage_sessions: partialOrNoCoverageSessions.size,
			coverage_status_counts: coverageStatusCounts,
			research_priority_counts: researchPriorityCounts
		},
		domains,
		research_backlog: researchBacklog,
		research_queue_candidates: buildDomainResearchQueueCandidatesFromSessionRows(rows),
		coverage_gaps: coverageGaps
	};
}
