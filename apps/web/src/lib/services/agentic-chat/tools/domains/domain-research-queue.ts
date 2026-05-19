// apps/web/src/lib/services/agentic-chat/tools/domains/domain-research-queue.ts
import {
	readDomainSessionState,
	type DomainResearchBacklogEntry,
	type DomainSessionState
} from './domain-session-state';

export type DomainResearchQueueKind =
	| 'domain'
	| 'work_capability'
	| 'skill'
	| 'micro_skill'
	| 'resource';

export type DomainResearchQueueStatus =
	| 'queued'
	| 'researching'
	| 'draft_ready'
	| 'reviewing'
	| 'approved'
	| 'rejected'
	| 'archived';

export type DomainResearchQueuePriority = 'high' | 'medium' | 'low';

export type DomainResearchBudget = {
	maxDepth: number;
	maxQueries: number;
	maxSourcesLoaded: number;
	maxTokensIn: number;
	maxTokensOut: number;
	maxWallClockMs: number;
	idempotencyKey: string;
};

export type DomainResearchQueueEvidence = {
	type: 'domain_session_backlog';
	session_id?: string;
	user_id?: string;
	domain_ids: string[];
	occurrences: number;
	first_seen_at: string;
	last_seen_at: string;
};

export type DomainResearchQueueCandidate = {
	queue_key: string;
	kind: DomainResearchQueueKind;
	status: Extract<DomainResearchQueueStatus, 'queued'>;
	priority: DomainResearchQueuePriority;
	domain_ids: string[];
	work_capability_id?: string;
	parent_skill_id?: string;
	missing_skill_id?: string;
	missing_resource_id?: string;
	user_need: string;
	summary: string;
	evidence: DomainResearchQueueEvidence[];
	source_session_ids: string[];
	source_user_count: number;
	occurrences: number;
	first_seen_at: string;
	last_seen_at: string;
	budget: DomainResearchBudget;
};

export type DomainResearchQueueStoredRow = Omit<DomainResearchQueueCandidate, 'status'> & {
	status: DomainResearchQueueStatus;
};

export type DomainResearchQueueUpsertRow = DomainResearchQueueStoredRow;

export type DomainResearchQueuePromotionPlan = {
	rows: DomainResearchQueueUpsertRow[];
	inserted_queue_keys: string[];
	updated_queue_keys: string[];
	skipped_terminal_queue_keys: string[];
};

export type DomainResearchQueuePromotionResult = DomainResearchQueuePromotionPlan & {
	requested_count: number;
	promoted_count: number;
};

export type DomainResearchQueueSessionRow = {
	id: string;
	user_id?: string | null;
	agent_metadata?: unknown;
};

export type BuildDomainResearchQueueCandidatesOptions = {
	sessionId?: string | null;
	userId?: string | null;
	budget?: Partial<Omit<DomainResearchBudget, 'idempotencyKey'>> & {
		idempotencyKey?: string;
	};
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVIDENCE_LIMIT = 20;
const TERMINAL_QUEUE_STATUSES = new Set<DomainResearchQueueStatus>([
	'approved',
	'rejected',
	'archived'
]);

const DEFAULT_DOMAIN_RESEARCH_BUDGET = {
	maxDepth: 2,
	maxQueries: 8,
	maxSourcesLoaded: 12,
	maxTokensIn: 80_000,
	maxTokensOut: 12_000,
	maxWallClockMs: 600_000
} satisfies Omit<DomainResearchBudget, 'idempotencyKey'>;

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readNonEmptyString(value: unknown): string | null {
	return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readUuid(value: unknown): string | null {
	const candidate = readNonEmptyString(value);
	return candidate && UUID_PATTERN.test(candidate) ? candidate.toLowerCase() : null;
}

function uniqueSorted(values: Iterable<string>): string[] {
	return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function minIso(left: string, right: string): string {
	return right.localeCompare(left) < 0 ? right : left;
}

function maxIso(left: string, right: string): string {
	return right.localeCompare(left) > 0 ? right : left;
}

function priorityRank(priority: DomainResearchQueuePriority): number {
	if (priority === 'high') return 0;
	if (priority === 'medium') return 1;
	return 2;
}

function highestPriority(
	left: DomainResearchQueuePriority,
	right: DomainResearchQueuePriority
): DomainResearchQueuePriority {
	return priorityRank(left) <= priorityRank(right) ? left : right;
}

function queueKeyForBacklogEntry(entry: DomainResearchBacklogEntry): string {
	if (entry.kind === 'skill' && entry.missing_skill_id) {
		return `skill:${entry.missing_skill_id}`;
	}
	if (entry.kind === 'resource' && entry.missing_resource_id) {
		return `resource:${entry.missing_resource_id}`;
	}
	return entry.id;
}

function budgetForQueueKey(
	queueKey: string,
	override?: BuildDomainResearchQueueCandidatesOptions['budget']
): DomainResearchBudget {
	return {
		...DEFAULT_DOMAIN_RESEARCH_BUDGET,
		...override,
		idempotencyKey: override?.idempotencyKey ?? queueKey
	};
}

function userIdsFromEvidence(evidence: DomainResearchQueueEvidence[]): Set<string> {
	const userIds = new Set<string>();
	for (const item of evidence) {
		if (item.user_id) userIds.add(item.user_id);
	}
	return userIds;
}

function mergeEvidence(
	left: DomainResearchQueueEvidence[],
	right: DomainResearchQueueEvidence[]
): DomainResearchQueueEvidence[] {
	const byKey = new Map<string, DomainResearchQueueEvidence>();
	for (const item of [...left, ...right]) {
		const key = [
			item.type,
			item.session_id ?? '',
			item.user_id ?? '',
			item.first_seen_at,
			item.last_seen_at,
			item.domain_ids.join(',')
		].join('|');
		byKey.set(key, item);
	}
	return [...byKey.values()]
		.sort((a, b) => b.last_seen_at.localeCompare(a.last_seen_at))
		.slice(0, EVIDENCE_LIMIT);
}

function readDomainStateFromAgentMetadata(metadata: unknown): DomainSessionState | null {
	if (!isRecord(metadata)) return readDomainSessionState(metadata);
	return (
		readDomainSessionState(metadata.fastchat_domain_state) ?? readDomainSessionState(metadata)
	);
}

function sourceSessionIdsFromEvidence(evidence: DomainResearchQueueEvidence[]): string[] {
	return uniqueSorted(
		evidence
			.map((item) => item.session_id)
			.filter((sessionId): sessionId is string => Boolean(sessionId))
	);
}

function additionalOccurrencesForCandidate(
	candidate: DomainResearchQueueCandidate,
	existing: DomainResearchQueueStoredRow
): number {
	const existingSessionIds = new Set(existing.source_session_ids);
	let total = 0;
	let sawSessionEvidence = false;

	for (const evidence of candidate.evidence) {
		if (!evidence.session_id) continue;
		sawSessionEvidence = true;
		if (!existingSessionIds.has(evidence.session_id)) {
			total += evidence.occurrences;
		}
	}

	if (sawSessionEvidence) return total;
	if (candidate.source_session_ids.some((sessionId) => !existingSessionIds.has(sessionId))) {
		return candidate.occurrences;
	}
	return Math.max(0, candidate.occurrences - existing.occurrences);
}

function mergeCandidateWithStoredRow(
	candidate: DomainResearchQueueCandidate,
	existing: DomainResearchQueueStoredRow
): DomainResearchQueueUpsertRow {
	const evidence = mergeEvidence(existing.evidence, candidate.evidence);
	const userIds = userIdsFromEvidence(evidence);
	const sourceSessionIds = uniqueSorted([
		...existing.source_session_ids,
		...candidate.source_session_ids,
		...sourceSessionIdsFromEvidence(evidence)
	]);

	return {
		queue_key: existing.queue_key,
		kind: existing.kind,
		status: existing.status,
		priority: highestPriority(existing.priority, candidate.priority),
		domain_ids: uniqueSorted([...existing.domain_ids, ...candidate.domain_ids]),
		work_capability_id: existing.work_capability_id ?? candidate.work_capability_id,
		parent_skill_id: existing.parent_skill_id ?? candidate.parent_skill_id,
		missing_skill_id: existing.missing_skill_id ?? candidate.missing_skill_id,
		missing_resource_id: existing.missing_resource_id ?? candidate.missing_resource_id,
		user_need: existing.user_need || candidate.user_need,
		summary: existing.summary || candidate.summary,
		evidence,
		source_session_ids: sourceSessionIds,
		source_user_count: Math.max(
			userIds.size,
			existing.source_user_count,
			candidate.source_user_count
		),
		occurrences: existing.occurrences + additionalOccurrencesForCandidate(candidate, existing),
		first_seen_at: minIso(existing.first_seen_at, candidate.first_seen_at),
		last_seen_at: maxIso(existing.last_seen_at, candidate.last_seen_at),
		budget: budgetForQueueKey(existing.queue_key, existing.budget)
	};
}

export function buildDomainResearchQueueCandidatesFromSessionState(
	state: DomainSessionState | null | undefined,
	options: BuildDomainResearchQueueCandidatesOptions = {}
): DomainResearchQueueCandidate[] {
	if (!state?.research_backlog.length) return [];

	const sessionId = readUuid(options.sessionId);
	const userId = readNonEmptyString(options.userId) ?? undefined;

	return mergeDomainResearchQueueCandidates(
		state.research_backlog.map((entry) => {
			const queueKey = queueKeyForBacklogEntry(entry);
			const sourceSessionIds = sessionId ? [sessionId] : [];
			const evidence: DomainResearchQueueEvidence[] = [
				{
					type: 'domain_session_backlog',
					...(sessionId ? { session_id: sessionId } : {}),
					...(userId ? { user_id: userId } : {}),
					domain_ids: uniqueSorted(entry.domain_ids),
					occurrences: entry.occurrences,
					first_seen_at: entry.first_seen_at,
					last_seen_at: entry.last_seen_at
				}
			];

			return {
				queue_key: queueKey,
				kind: entry.kind,
				status: 'queued',
				priority: entry.priority,
				domain_ids: uniqueSorted(entry.domain_ids),
				missing_skill_id: entry.missing_skill_id,
				missing_resource_id: entry.missing_resource_id,
				user_need: entry.user_need,
				summary: entry.summary,
				evidence,
				source_session_ids: sourceSessionIds,
				source_user_count: userId ? 1 : 0,
				occurrences: entry.occurrences,
				first_seen_at: entry.first_seen_at,
				last_seen_at: entry.last_seen_at,
				budget: budgetForQueueKey(queueKey, options.budget)
			} satisfies DomainResearchQueueCandidate;
		})
	);
}

export function buildDomainResearchQueueCandidatesFromSessionRows(
	rows: DomainResearchQueueSessionRow[],
	options: Pick<BuildDomainResearchQueueCandidatesOptions, 'budget'> = {}
): DomainResearchQueueCandidate[] {
	const candidates: DomainResearchQueueCandidate[] = [];
	for (const row of rows) {
		const state = readDomainStateFromAgentMetadata(row.agent_metadata);
		if (!state) continue;
		candidates.push(
			...buildDomainResearchQueueCandidatesFromSessionState(state, {
				sessionId: row.id,
				userId: row.user_id,
				budget: options.budget
			})
		);
	}
	return mergeDomainResearchQueueCandidates(candidates);
}

export function buildDomainResearchQueuePromotionPlan(
	candidates: DomainResearchQueueCandidate[],
	existingRows: DomainResearchQueueStoredRow[] = []
): DomainResearchQueuePromotionPlan {
	const existingByKey = new Map(existingRows.map((row) => [row.queue_key, row]));
	const rows: DomainResearchQueueUpsertRow[] = [];
	const insertedQueueKeys: string[] = [];
	const updatedQueueKeys: string[] = [];
	const skippedTerminalQueueKeys: string[] = [];

	for (const candidate of mergeDomainResearchQueueCandidates(candidates)) {
		const existing = existingByKey.get(candidate.queue_key);
		if (!existing) {
			rows.push(candidate);
			insertedQueueKeys.push(candidate.queue_key);
			continue;
		}
		if (TERMINAL_QUEUE_STATUSES.has(existing.status)) {
			skippedTerminalQueueKeys.push(candidate.queue_key);
			continue;
		}
		rows.push(mergeCandidateWithStoredRow(candidate, existing));
		updatedQueueKeys.push(candidate.queue_key);
	}

	return {
		rows,
		inserted_queue_keys: insertedQueueKeys,
		updated_queue_keys: updatedQueueKeys,
		skipped_terminal_queue_keys: skippedTerminalQueueKeys
	};
}

export async function promoteDomainResearchQueueCandidates(
	supabase: { from: (table: 'domain_research_queue') => any },
	candidates: DomainResearchQueueCandidate[]
): Promise<DomainResearchQueuePromotionResult> {
	const mergedCandidates = mergeDomainResearchQueueCandidates(candidates);
	if (!mergedCandidates.length) {
		return {
			requested_count: 0,
			promoted_count: 0,
			rows: [],
			inserted_queue_keys: [],
			updated_queue_keys: [],
			skipped_terminal_queue_keys: []
		};
	}

	const queueKeys = mergedCandidates.map((candidate) => candidate.queue_key);
	const { data: existingRows, error: selectError } = await supabase
		.from('domain_research_queue')
		.select(
			[
				'queue_key',
				'kind',
				'status',
				'priority',
				'domain_ids',
				'work_capability_id',
				'parent_skill_id',
				'missing_skill_id',
				'missing_resource_id',
				'user_need',
				'summary',
				'evidence',
				'source_session_ids',
				'source_user_count',
				'occurrences',
				'first_seen_at',
				'last_seen_at',
				'budget'
			].join(', ')
		)
		.in('queue_key', queueKeys);

	if (selectError) throw selectError;

	const plan = buildDomainResearchQueuePromotionPlan(
		mergedCandidates,
		(existingRows ?? []) as DomainResearchQueueStoredRow[]
	);
	if (plan.rows.length > 0) {
		const { error: upsertError } = await supabase
			.from('domain_research_queue')
			.upsert(plan.rows, { onConflict: 'queue_key' });
		if (upsertError) throw upsertError;
	}

	return {
		...plan,
		requested_count: mergedCandidates.length,
		promoted_count: plan.rows.length
	};
}

export function mergeDomainResearchQueueCandidates(
	candidates: DomainResearchQueueCandidate[]
): DomainResearchQueueCandidate[] {
	const byKey = new Map<string, DomainResearchQueueCandidate>();

	for (const candidate of candidates) {
		const existing = byKey.get(candidate.queue_key);
		if (!existing) {
			byKey.set(candidate.queue_key, {
				...candidate,
				domain_ids: uniqueSorted(candidate.domain_ids),
				source_session_ids: uniqueSorted(candidate.source_session_ids),
				evidence: candidate.evidence.slice(0, EVIDENCE_LIMIT)
			});
			continue;
		}

		const evidence = mergeEvidence(existing.evidence, candidate.evidence);
		const userIds = userIdsFromEvidence(evidence);
		byKey.set(candidate.queue_key, {
			queue_key: candidate.queue_key,
			kind: existing.kind,
			status: 'queued',
			priority: highestPriority(existing.priority, candidate.priority),
			domain_ids: uniqueSorted([...existing.domain_ids, ...candidate.domain_ids]),
			work_capability_id: existing.work_capability_id ?? candidate.work_capability_id,
			parent_skill_id: existing.parent_skill_id ?? candidate.parent_skill_id,
			missing_skill_id: existing.missing_skill_id ?? candidate.missing_skill_id,
			missing_resource_id: existing.missing_resource_id ?? candidate.missing_resource_id,
			user_need: existing.user_need || candidate.user_need,
			summary: existing.summary || candidate.summary,
			evidence,
			source_session_ids: uniqueSorted([
				...existing.source_session_ids,
				...candidate.source_session_ids
			]),
			source_user_count: Math.max(
				userIds.size,
				existing.source_user_count,
				candidate.source_user_count
			),
			occurrences: existing.occurrences + candidate.occurrences,
			first_seen_at: minIso(existing.first_seen_at, candidate.first_seen_at),
			last_seen_at: maxIso(existing.last_seen_at, candidate.last_seen_at),
			budget: budgetForQueueKey(candidate.queue_key, existing.budget)
		});
	}

	return [...byKey.values()].sort((a, b) => {
		const priorityDelta = priorityRank(a.priority) - priorityRank(b.priority);
		if (priorityDelta !== 0) return priorityDelta;
		if (b.occurrences !== a.occurrences) return b.occurrences - a.occurrences;
		const timeOrder = b.last_seen_at.localeCompare(a.last_seen_at);
		if (timeOrder !== 0) return timeOrder;
		return a.queue_key.localeCompare(b.queue_key);
	});
}
