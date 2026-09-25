// apps/web/src/lib/server/freshness-radar.service.ts
/**
 * Jev freshness radar, web side (Tasker 88; docs/architecture/jev-freshness-radar-v1-plan.md
 * §3, §4 undo, §5 decide path, §6 inbox undo).
 *
 * Reads use the caller's user-scoped client: RLS limits freshness rows to the user whose brain
 * dump produced them (evidence quotes private chat). Writes to the ledger and the bundle use the
 * admin client, only after the route's project-access check and an ownership read through RLS.
 * Entity undo replays through the caller's own ChatToolExecutor path (injected `replay`), so the
 * gateway still enforces write access and Project Review stays suppressed.
 */
import type {
	FreshnessBadgeReadV1,
	FreshnessDisposition,
	FreshnessEntityKind,
	FreshnessFlagRecord,
	FreshnessFlagStatus,
	FreshnessGauge,
	FreshnessScanStatusV1,
	FreshnessUndoPayload,
	FreshnessUndoResultV1,
	Json,
	LoopOperation,
	ProjectSuggestionEvidenceRef,
	ProjectSuggestionPreview,
	ProjectSuggestionResult,
	ProjectSuggestionStatus
} from '@buildos/shared-types';
import { FRESHNESS_UPDATE_SUGGESTION_KIND } from '@buildos/shared-types';
import {
	applyProjectAttentionBudget,
	computeProjectSuggestionFreshnessFingerprint,
	syncInboxItemForProjectSuggestion,
	verifyProjectSuggestionIntegrity
} from '@buildos/shared-agent-ops';

type AnySupabase = any;

export const FRESHNESS_UNDO_WINDOW_MS = 72 * 60 * 60 * 1000;
/** Badges come from live scans this recent; older flags are stale signal. */
export const FRESHNESS_BADGE_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;
const FRESHNESS_BADGE_SCAN_LIMIT = 20;

const ENTITY_TABLE: Record<FreshnessEntityKind, string> = {
	task: 'onto_tasks',
	document: 'onto_documents',
	goal: 'onto_goals',
	milestone: 'onto_milestones'
};
const ENTITY_KINDS = Object.keys(ENTITY_TABLE) as FreshnessEntityKind[];
const OP_ENTITY_ARG: Record<string, string> = {
	update_onto_task: 'task_id',
	update_onto_goal: 'goal_id',
	update_onto_milestone: 'milestone_id',
	update_onto_document: 'document_id'
};
const CARD_DISPOSITIONS: FreshnessDisposition[] = [
	'surfaced',
	'drafted',
	'auto_applied',
	'retired'
];
const UNDOABLE_DISPOSITIONS = new Set<FreshnessDisposition>(['auto_applied', 'retired']);
const CLOSED_FOR_UNDO = new Set<FreshnessFlagStatus>([
	'undone',
	'resolved_by_change',
	'superseded',
	'expired',
	'dismissed'
]);

type FlagRow = Record<string, unknown> & {
	id: string;
	scan_id: string;
	project_id: string;
	user_id: string;
	subject_kind: string;
	subject_id: string;
	disposition: FreshnessDisposition;
	status: FreshnessFlagStatus;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function str(value: unknown): string | null {
	return typeof value === 'string' && value ? value : null;
}

function num(value: unknown): number | null {
	if (value === null || value === undefined || value === '') return null;
	const parsed = typeof value === 'number' ? value : Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function ms(value: unknown): number | null {
	const text = str(value);
	if (!text) return null;
	const parsed = Date.parse(text);
	return Number.isFinite(parsed) ? parsed : null;
}

function isEntityKind(value: unknown): value is FreshnessEntityKind {
	return typeof value === 'string' && value in ENTITY_TABLE;
}

/** Normalize a ledger row (numeric columns may arrive as strings) to the frozen record. */
export function toFreshnessFlagRecord(row: Record<string, unknown>): FreshnessFlagRecord {
	return {
		...(row as unknown as FreshnessFlagRecord),
		probability: num(row.probability) ?? 0,
		change_kind_probability: num(row.change_kind_probability),
		date_choice_probability: num(row.date_choice_probability)
	};
}

function undoWindowStart(flag: Record<string, unknown>): number | null {
	return ms(flag.applied_at) ?? ms(flag.created_at);
}

function undoableUntilMs(flag: Record<string, unknown>): number | null {
	const start = undoWindowStart(flag);
	return start === null ? null : start + FRESHNESS_UNDO_WINDOW_MS;
}

function readUndoPayload(value: unknown): FreshnessUndoPayload | null {
	if (!isRecord(value)) return null;
	if (value.kind === 'entity_field') {
		const operation = value.operation;
		if (
			!isRecord(operation) ||
			typeof operation.tool !== 'string' ||
			!isRecord(operation.args) ||
			typeof value.expectAfterUpdatedAt !== 'string'
		) {
			return null;
		}
		return value as unknown as FreshnessUndoPayload;
	}
	if (value.kind === 'inbox_retire') {
		if (typeof value.suggestionId !== 'string' || typeof value.inboxItemId !== 'string') {
			return null;
		}
		return value as unknown as FreshnessUndoPayload;
	}
	return null;
}

/** Whether a card/badge may still offer Undo for this flag. */
export function isFreshnessFlagUndoable(flag: Record<string, unknown>, now: number): boolean {
	const disposition = flag.disposition as FreshnessDisposition;
	if (!UNDOABLE_DISPOSITIONS.has(disposition)) return false;
	if (CLOSED_FOR_UNDO.has(flag.status as FreshnessFlagStatus) || flag.undone_at) return false;
	if (!readUndoPayload(flag.undo_operation)) return false;
	const until = undoableUntilMs(flag);
	return until !== null && now < until;
}

// ---------------------------------------------------------------------------
// Entity state (badge omission, undo compare-and-set)
// ---------------------------------------------------------------------------

type EntityState = { updatedAt: string | null; deleted: boolean };

async function loadEntityStates(
	supabase: AnySupabase,
	projectId: string,
	refs: Array<{ kind: FreshnessEntityKind; id: string }>
): Promise<Map<string, EntityState>> {
	const states = new Map<string, EntityState>();
	for (const kind of ENTITY_KINDS) {
		const ids = [...new Set(refs.filter((ref) => ref.kind === kind).map((ref) => ref.id))];
		if (!ids.length) continue;
		const { data, error } = await supabase
			.from(ENTITY_TABLE[kind])
			.select('id, updated_at, created_at, deleted_at')
			.eq('project_id', projectId)
			.in('id', ids);
		if (error) throw new Error(`Failed to load ${kind} state: ${error.message}`);
		for (const row of (data ?? []) as Array<Record<string, unknown>>) {
			states.set(`${kind}:${row.id}`, {
				updatedAt: str(row.updated_at) ?? str(row.created_at),
				deleted: Boolean(row.deleted_at)
			});
		}
	}
	return states;
}

/** True when the entity moved past the reference timestamp (or vanished). */
function changedSince(state: EntityState | undefined, reference: unknown): boolean {
	if (!state || state.deleted) return true;
	const current = ms(state.updatedAt);
	const ref = ms(reference);
	if (current === null) return false;
	if (ref === null) return true;
	return current > ref;
}

// ---------------------------------------------------------------------------
// Roll-up concerns (tasker 106)
// ---------------------------------------------------------------------------

type ConcernBadgeRow = {
	id: string;
	subject_kind: string;
	subject_id: string;
	score: number | string;
	last_flag_id: string | null;
	surfaced_at: string | null;
	surfaced_scan_id: string | null;
	first_seen_at: string | null;
	evidence_count: number | null;
	evidence: unknown;
	detail: unknown;
};

/**
 * Open, surfaced concerns for the badge read (RLS: the user's own). Returns null
 * when the roll-up table is unavailable (deploy before migration), so the caller
 * falls back to per-scan flags.
 */
async function loadSurfacedConcerns(
	supabase: AnySupabase,
	projectId: string,
	userId: string
): Promise<ConcernBadgeRow[] | null> {
	const { data, error } = await supabase
		.from('freshness_concerns')
		.select(
			'id, subject_kind, subject_id, score, last_flag_id, surfaced_at, surfaced_scan_id, first_seen_at, evidence_count, evidence, detail'
		)
		.eq('project_id', projectId)
		.eq('user_id', userId)
		.eq('status', 'open')
		.order('score', { ascending: false })
		.limit(200);
	if (error) {
		console.warn('[FreshnessRadar] Roll-up concerns unavailable:', error.message);
		return null;
	}
	// Only concerns that crossed the bar are shown; the rest are still accruing evidence.
	return ((data ?? []) as ConcernBadgeRow[]).filter((row) => Boolean(row.surfaced_at));
}

/** One line for the badge panel (mirrors the worker's concernReason, shortened). */
function concernBadgeReason(concern: ConcernBadgeRow): string | null {
	const detail = isRecord(concern.detail) ? concern.detail : {};
	const sections = (Array.isArray(detail.sections) ? detail.sections : []).filter(
		(section): section is Record<string, unknown> =>
			isRecord(section) && typeof section.heading === 'string' && section.anchor !== null
	);
	const decided = Array.isArray(detail.decisions) && detail.decisions.length > 0;
	if (sections.length) {
		const list = sections
			.slice(0, 3)
			.map((section) => `“${String(section.heading).slice(0, 80)}”`)
			.join(', ');
		return decided
			? `Older than decisions you recorded since: ${list}.`
			: `Looks out of date: ${list}.`;
	}
	const proposal = isRecord(detail.proposal) ? str(detail.proposal.summary) : null;
	if (proposal) return `${proposal}.`;
	return decided ? 'Older than decisions you recorded since.' : null;
}

/**
 * Close open concerns after a user decision, and label each one's latest flag the
 * same way so the scanner's suppression (14 days while unchanged) stops it
 * re-surfacing. Admin client; call only after the route's access check. Never throws.
 */
export async function closeFreshnessConcerns(params: {
	admin: AnySupabase;
	projectId: string;
	userId?: string | null;
	concernIds?: string[];
	subjects?: Array<{ kind: string; id: string }>;
	status: 'dismissed' | 'applied';
	reason: 'user_dismissed' | 'user_marked_not_stale' | 'applied';
	now?: number;
}): Promise<string[]> {
	const nowIso = new Date(params.now ?? Date.now()).toISOString();
	const closed: string[] = [];
	try {
		const byId = (params.concernIds ?? []).filter(Boolean);
		const subjects = params.subjects ?? [];
		if (!byId.length && !subjects.length) return closed;
		const queries: Array<Promise<{ data: unknown; error: { message: string } | null }>> = [];
		const patch = {
			status: params.status,
			close_reason: params.reason,
			closed_at: nowIso
		};
		if (byId.length) {
			let query = params.admin
				.from('freshness_concerns')
				.update(patch)
				.eq('project_id', params.projectId)
				.eq('status', 'open')
				.in('id', byId);
			if (params.userId) query = query.eq('user_id', params.userId);
			queries.push(query.select('id, last_flag_id'));
		}
		for (const subject of subjects) {
			let query = params.admin
				.from('freshness_concerns')
				.update(patch)
				.eq('project_id', params.projectId)
				.eq('status', 'open')
				.eq('subject_kind', subject.kind)
				.eq('subject_id', subject.id);
			if (params.userId) query = query.eq('user_id', params.userId);
			queries.push(query.select('id, last_flag_id'));
		}
		const flagIds: string[] = [];
		for (const result of await Promise.all(queries)) {
			if (result.error) throw new Error(result.error.message);
			for (const row of (result.data ?? []) as Array<{
				id: string;
				last_flag_id: string | null;
			}>) {
				closed.push(row.id);
				if (row.last_flag_id) flagIds.push(row.last_flag_id);
			}
		}
		if (flagIds.length && params.status === 'dismissed') {
			const { error } = await params.admin
				.from('freshness_flags')
				.update({
					status: 'dismissed',
					outcome: params.reason === 'user_marked_not_stale' ? 'not_stale' : 'unknown',
					outcome_source: params.reason,
					outcome_at: nowIso
				})
				.in('id', flagIds)
				.eq('status', 'open');
			if (error) throw new Error(error.message);
		}
	} catch (error) {
		console.warn(
			'[FreshnessRadar] Failed to close roll-up concerns:',
			error instanceof Error ? error.message : error
		);
	}
	return closed;
}

/** Concern ids of a bundle's review items (preview.review_items). */
function bundleReviewConcernIds(suggestion: Record<string, unknown>): string[] {
	const preview = isRecord(suggestion.preview) ? suggestion.preview : null;
	const items = preview && Array.isArray(preview.review_items) ? preview.review_items : [];
	return items
		.map((item) => (isRecord(item) ? str(item.concern_id) : null))
		.filter((id): id is string => Boolean(id));
}

// ---------------------------------------------------------------------------
// GET badges and gauges
// ---------------------------------------------------------------------------

export async function loadFreshnessBadges(params: {
	supabase: AnySupabase;
	projectId: string;
	userId: string;
	now?: number;
}): Promise<FreshnessBadgeReadV1> {
	const now = params.now ?? Date.now();
	const empty: FreshnessBadgeReadV1 = {
		version: 'freshness_badges_v1',
		projectId: params.projectId,
		scannedAt: null,
		flags: [],
		gauges: []
	};

	const { data: scans, error: scanError } = await params.supabase
		.from('freshness_scans')
		.select('id, created_at, finished_at')
		.eq('project_id', params.projectId)
		.eq('user_id', params.userId)
		.eq('mode', 'live')
		.eq('status', 'completed')
		.gte('created_at', new Date(now - FRESHNESS_BADGE_LOOKBACK_MS).toISOString())
		.order('created_at', { ascending: false })
		.limit(FRESHNESS_BADGE_SCAN_LIMIT);
	if (scanError) throw new Error(`Failed to load freshness scans: ${scanError.message}`);
	const scanRows = (scans ?? []) as Array<Record<string, unknown>>;
	if (!scanRows.length) return empty;
	const scanIds = scanRows.map((scan) => String(scan.id));
	const scannedAt = str(scanRows[0]!.finished_at) ?? str(scanRows[0]!.created_at);

	const [{ data: flagData, error: flagError }, { data: gaugeData, error: gaugeError }] =
		await Promise.all([
			params.supabase
				.from('freshness_flags')
				.select(
					'id, scan_id, subject_kind, subject_id, subject_updated_at, probability, disposition, status, evidence, suggestion_id, created_at, applied_at, applied_after_updated_at, undone_at, undo_operation'
				)
				.in('scan_id', scanIds)
				.eq('user_id', params.userId)
				.in('disposition', ['surfaced', 'drafted', 'auto_applied'])
				.in('status', ['open', 'applied'])
				.order('created_at', { ascending: false }),
			params.supabase
				.from('freshness_track_scores')
				.select('scan_id, subject_kind, subject_id, gauge, score, created_at')
				.in('scan_id', scanIds)
				.eq('user_id', params.userId)
				.order('created_at', { ascending: false })
		]);
	if (flagError) throw new Error(`Failed to load freshness flags: ${flagError.message}`);
	if (gaugeError) throw new Error(`Failed to load on-track scores: ${gaugeError.message}`);

	// Tasker 106: "May be out of date" comes from the roll-up (one open, surfaced
	// concern per entity) when it exists; the per-scan flags are the fallback.
	const concerns = await loadSurfacedConcerns(params.supabase, params.projectId, params.userId);
	const flagRows = ((flagData ?? []) as Array<Record<string, unknown>>).filter((row) => {
		if (!isEntityKind(row.subject_kind)) return false;
		if (row.disposition === 'auto_applied') {
			// "Updated automatically" lasts as long as its undo window, then fades.
			return !row.undone_at && isFreshnessFlagUndoable(row, now);
		}
		return concerns === null && row.status === 'open';
	});

	const states = await loadEntityStates(
		params.supabase,
		params.projectId,
		flagRows.map((row) => ({
			kind: row.subject_kind as FreshnessEntityKind,
			id: String(row.subject_id)
		}))
	);

	const seen = new Set<string>();
	const flags: FreshnessBadgeReadV1['flags'] = [];
	for (const concern of concerns ?? []) {
		const kind = concern.subject_kind as FreshnessEntityKind;
		const key = `${kind}:${concern.subject_id}:may_be_out_of_date`;
		if (!isEntityKind(kind) || seen.has(key) || !concern.last_flag_id) continue;
		seen.add(key);
		const detail = isRecord(concern.detail) ? concern.detail : {};
		const evidence = Array.isArray(concern.evidence) ? concern.evidence : [];
		const last = evidence.at(-1);
		flags.push({
			flagId: concern.last_flag_id,
			scanId: str(isRecord(last) ? last.scanId : null) ?? str(concern.surfaced_scan_id) ?? '',
			entity: { kind, id: concern.subject_id },
			probability: num(concern.score) ?? 0,
			label: 'may_be_out_of_date',
			evidenceExcerpt: str(detail.evidenceExcerpt),
			suggestionId: null,
			createdAt: str(concern.surfaced_at) ?? str(concern.first_seen_at) ?? '',
			undoableUntil: null,
			reason: concernBadgeReason(concern),
			fixInChatPrompt: str(detail.fixInChatPrompt)
		});
	}
	for (const row of flagRows) {
		const kind = row.subject_kind as FreshnessEntityKind;
		const entityId = String(row.subject_id);
		const automatic = row.disposition === 'auto_applied';
		const label = automatic ? 'updated_automatically' : 'may_be_out_of_date';
		const key = `${kind}:${entityId}:${label}`;
		if (seen.has(key)) continue; // newest flag per entity and label wins
		const reference = automatic ? row.applied_after_updated_at : row.subject_updated_at;
		if (changedSince(states.get(`${kind}:${entityId}`), reference)) continue;
		seen.add(key);
		const until = automatic ? undoableUntilMs(row) : null;
		flags.push({
			flagId: String(row.id),
			scanId: String(row.scan_id),
			entity: { kind, id: entityId },
			probability: num(row.probability) ?? 0,
			label,
			evidenceExcerpt: isRecord(row.evidence) ? (str(row.evidence.excerpt) ?? null) : null,
			suggestionId: str(row.suggestion_id),
			createdAt: String(row.created_at),
			undoableUntil: until === null ? null : new Date(until).toISOString()
		});
	}

	const gaugeSeen = new Set<string>();
	const gauges: FreshnessBadgeReadV1['gauges'] = [];
	for (const row of (gaugeData ?? []) as Array<Record<string, unknown>>) {
		const kind = row.subject_kind;
		if (kind !== 'goal' && kind !== 'milestone') continue;
		const key = `${kind}:${row.subject_id}`;
		if (gaugeSeen.has(key)) continue; // newest score per subject
		gaugeSeen.add(key);
		gauges.push({
			entity: { kind, id: String(row.subject_id) },
			gauge: row.gauge as FreshnessGauge,
			score: num(row.score),
			scoredAt: String(row.created_at),
			scanId: String(row.scan_id)
		});
	}

	return { ...empty, scannedAt, flags, gauges };
}

// ---------------------------------------------------------------------------
// GET scan status (the chat card's live state)
// ---------------------------------------------------------------------------

export async function loadFreshnessScanStatus(params: {
	supabase: AnySupabase;
	projectId: string;
	scanId: string;
	userId: string;
	now?: number;
}): Promise<FreshnessScanStatusV1 | null> {
	const now = params.now ?? Date.now();
	const { data: scan, error: scanError } = await params.supabase
		.from('freshness_scans')
		.select('id')
		.eq('id', params.scanId)
		.eq('project_id', params.projectId)
		.eq('user_id', params.userId)
		.maybeSingle();
	if (scanError) throw new Error(`Failed to load freshness scan: ${scanError.message}`);
	if (!scan) return null;

	const [{ data: flagData, error: flagError }, { data: bundleData, error: bundleError }] =
		await Promise.all([
			params.supabase
				.from('freshness_flags')
				.select(
					'id, disposition, status, undo_operation, applied_at, created_at, undone_at'
				)
				.eq('scan_id', params.scanId)
				.eq('user_id', params.userId)
				.in('disposition', CARD_DISPOSITIONS),
			params.supabase
				.from('project_suggestions')
				.select('id, status')
				.eq('project_id', params.projectId)
				.eq('freshness_scan_id', params.scanId)
				.order('created_at', { ascending: false })
				.limit(1)
		]);
	if (flagError) throw new Error(`Failed to load freshness flags: ${flagError.message}`);
	if (bundleError) throw new Error(`Failed to load freshness bundle: ${bundleError.message}`);

	const flags: FreshnessScanStatusV1['flags'] = {};
	for (const row of (flagData ?? []) as Array<Record<string, unknown>>) {
		flags[String(row.id)] = {
			status: row.status as FreshnessFlagStatus,
			disposition: row.disposition as FreshnessDisposition,
			undoable: isFreshnessFlagUndoable(row, now)
		};
	}
	const bundleRow = ((bundleData ?? []) as Array<Record<string, unknown>>)[0];
	return {
		version: 'freshness_scan_status_v1',
		scanId: params.scanId,
		flags,
		bundle: bundleRow
			? {
					suggestionId: String(bundleRow.id),
					status: bundleRow.status as ProjectSuggestionStatus
				}
			: null
	};
}

// ---------------------------------------------------------------------------
// POST undo
// ---------------------------------------------------------------------------

export type FreshnessReplay = (params: {
	operations: LoopOperation[];
	operationId: string;
	chatSessionId: string | null;
}) => Promise<{ appliedCount: number; errors: Array<{ tool: string; error: string }> }>;

export type FreshnessInboxRestore = (params: {
	projectId: string;
	flagId: string;
	payload: Extract<FreshnessUndoPayload, { kind: 'inbox_retire' }>;
}) => Promise<{ ok: true } | { ok: false; reason: 'changed_since' | 'failed'; message?: string }>;

type UndoSkip = FreshnessUndoResultV1['skipped'][number];

function entityRefFromOperation(
	operation: LoopOperation
): { kind: FreshnessEntityKind; id: string } | null {
	const argName = OP_ENTITY_ARG[operation.tool];
	if (!argName) return null;
	const id = str(operation.args?.[argName]);
	const kind = operation.tool.replace('update_onto_', '');
	return id && isEntityKind(kind) ? { kind, id } : null;
}

export async function undoFreshnessFlags(params: {
	supabase: AnySupabase;
	admin: AnySupabase;
	userId: string;
	projectId: string;
	scanId: string;
	flagIds?: string[];
	replay: FreshnessReplay;
	restoreInbox?: FreshnessInboxRestore;
	chatSessionId?: string | null;
	now?: number;
}): Promise<FreshnessUndoResultV1 | null> {
	const now = params.now ?? Date.now();
	const nowIso = new Date(now).toISOString();

	const { data: scan, error: scanError } = await params.supabase
		.from('freshness_scans')
		.select('id, trigger_session_id')
		.eq('id', params.scanId)
		.eq('project_id', params.projectId)
		.eq('user_id', params.userId)
		.maybeSingle();
	if (scanError) throw new Error(`Failed to load freshness scan: ${scanError.message}`);
	if (!scan) return null;

	let query = params.supabase
		.from('freshness_flags')
		.select('*')
		.eq('scan_id', params.scanId)
		.eq('user_id', params.userId);
	if (params.flagIds?.length) query = query.in('id', params.flagIds);
	else query = query.in('disposition', [...UNDOABLE_DISPOSITIONS]);
	const { data: flagData, error: flagError } = await query;
	if (flagError) throw new Error(`Failed to load freshness flags: ${flagError.message}`);
	const rows = (flagData ?? []) as FlagRow[];

	const undone: string[] = [];
	const skipped: UndoSkip[] = [];
	const byId = new Map(rows.map((row) => [row.id, row]));
	const targets = params.flagIds?.length ? params.flagIds : rows.map((row) => row.id);

	for (const flagId of targets) {
		const flag = byId.get(flagId);
		if (!flag) {
			skipped.push({ flagId, reason: 'forbidden' });
			continue;
		}
		if (flag.status === 'undone' || flag.undone_at) {
			skipped.push({ flagId, reason: 'already_undone' });
			continue;
		}
		const payload = readUndoPayload(flag.undo_operation);
		if (
			!UNDOABLE_DISPOSITIONS.has(flag.disposition) ||
			!payload ||
			CLOSED_FOR_UNDO.has(flag.status)
		) {
			skipped.push({ flagId, reason: 'not_undoable' });
			continue;
		}
		const until = undoableUntilMs(flag);
		if (until === null || now >= until) {
			skipped.push({ flagId, reason: 'window_expired' });
			continue;
		}

		// Claim before acting, so a double tap never replays twice.
		const previousStatus = flag.status;
		const { data: claimed, error: claimError } = await params.admin
			.from('freshness_flags')
			.update({
				status: 'undone',
				undone_at: nowIso,
				undone_by: params.userId,
				outcome: 'unknown',
				outcome_source: 'user_undid',
				outcome_at: nowIso
			})
			.eq('id', flagId)
			.eq('user_id', params.userId)
			.eq('status', previousStatus)
			.is('undone_at', null)
			.select('id')
			.maybeSingle();
		if (claimError) {
			skipped.push({ flagId, reason: 'execution_failed', message: claimError.message });
			continue;
		}
		if (!claimed) {
			skipped.push({ flagId, reason: 'already_undone' });
			continue;
		}

		const release = async () => {
			await params.admin
				.from('freshness_flags')
				.update({
					status: previousStatus,
					undone_at: null,
					undone_by: null,
					outcome: flag.outcome ?? null,
					outcome_source: flag.outcome_source ?? null,
					outcome_at: flag.outcome_at ?? null
				})
				.eq('id', flagId)
				.eq('status', 'undone');
		};

		try {
			if (payload.kind === 'entity_field') {
				const ref = entityRefFromOperation(payload.operation);
				if (!ref) {
					await release();
					skipped.push({ flagId, reason: 'not_undoable' });
					continue;
				}
				const states = await loadEntityStates(params.supabase, params.projectId, [ref]);
				if (
					changedSince(states.get(`${ref.kind}:${ref.id}`), payload.expectAfterUpdatedAt)
				) {
					await release();
					skipped.push({ flagId, reason: 'changed_since' });
					continue;
				}
				const replayed = await params.replay({
					operations: [payload.operation],
					operationId: `freshness_undo:${flagId}`,
					chatSessionId:
						params.chatSessionId ??
						str((scan as Record<string, unknown>).trigger_session_id)
				});
				if (replayed.errors.length || replayed.appliedCount === 0) {
					await release();
					skipped.push({
						flagId,
						reason: 'execution_failed',
						message: replayed.errors[0]?.error
					});
					continue;
				}
			} else {
				if (!params.restoreInbox) {
					await release();
					skipped.push({
						flagId,
						reason: 'execution_failed',
						message: 'Inbox restore is not available yet'
					});
					continue;
				}
				const restored = await params.restoreInbox({
					projectId: params.projectId,
					flagId,
					payload
				});
				if (!restored.ok) {
					await release();
					skipped.push({
						flagId,
						reason:
							restored.reason === 'changed_since'
								? 'changed_since'
								: 'execution_failed',
						message: restored.message
					});
					continue;
				}
			}
			undone.push(flagId);
		} catch (error) {
			await release().catch(() => undefined);
			skipped.push({
				flagId,
				reason: 'execution_failed',
				message: error instanceof Error ? error.message : 'Undo failed'
			});
		}
	}

	return { version: 'freshness_undo_v1', undone, skipped };
}

// ---------------------------------------------------------------------------
// POST flag action: "Not out of date"
// ---------------------------------------------------------------------------

function bundleTitle(count: number): string {
	return `${count} thing${count === 1 ? ' looks' : 's look'} out of date`;
}

const KIND_PLURAL: Record<string, [string, string]> = {
	task: ['task', 'tasks'],
	milestone: ['milestone', 'milestones'],
	goal: ['goal', 'goals'],
	document: ['document', 'documents']
};

/** Keep the worker's "From your update on <date> · …" summary true after a removal. */
function bundleWhyNow(previous: unknown, refs: ProjectSuggestionEvidenceRef[]): string | null {
	const date =
		typeof previous === 'string' ? previous.match(/From your update on (\S+)/)?.[1] : null;
	const counts = new Map<string, number>();
	for (const ref of refs) counts.set(ref.entity_type, (counts.get(ref.entity_type) ?? 0) + 1);
	const parts = ['task', 'milestone', 'goal', 'document']
		.filter((kind) => counts.get(kind))
		.map((kind) => {
			const count = counts.get(kind)!;
			return `${count} ${KIND_PLURAL[kind]![count === 1 ? 0 : 1]}`;
		});
	if (!date) return parts.length ? parts.join(', ') : null;
	return parts.length ? `From your update on ${date} · ${parts.join(', ')}` : null;
}

/** Same shape as the worker's bundle rationale (the Discuss chat's seed). */
function bundleRationale(items: Array<Record<string, unknown>>): string {
	return [
		'To fix in chat (no automatic change is proposed for these):',
		...items.map(
			(item) =>
				`- ${str(item.title) ?? 'Item'}: ${str(item.reason) ?? ''} Suggested request: ${str(item.fix_in_chat_prompt) ?? ''}`
		)
	].join('\n');
}

function operationTargets(operation: unknown, subjectId: string): boolean {
	if (!isRecord(operation) || typeof operation.tool !== 'string' || !isRecord(operation.args)) {
		return false;
	}
	const ref = entityRefFromOperation(operation as unknown as LoopOperation);
	return ref?.id === subjectId;
}

type RebuildOutcome = { suggestionId: string | null };

/**
 * Supersede the pending bundle and insert a copy without the flag's operation (plan §5).
 * Verified before insert and fails closed: on any problem the original bundle stays pending.
 */
async function rebuildBundleWithout(params: {
	admin: AnySupabase;
	projectId: string;
	suggestionId: string;
	subjectId: string;
	flagId: string;
	now: string;
}): Promise<RebuildOutcome> {
	const { admin } = params;
	const { data: current, error } = await admin
		.from('project_suggestions')
		.select('*')
		.eq('id', params.suggestionId)
		.eq('project_id', params.projectId)
		.maybeSingle();
	if (error) throw new Error(`Failed to load freshness bundle: ${error.message}`);
	if (
		!current ||
		current.kind !== FRESHNESS_UPDATE_SUGGESTION_KIND ||
		current.status !== 'pending'
	) {
		return { suggestionId: null };
	}

	const operations: unknown[] = Array.isArray(current.operations) ? current.operations : [];
	const index = operations.findIndex((operation) =>
		operationTargets(operation, params.subjectId)
	);
	const currentPreview: Record<string, unknown> = isRecord(current.preview)
		? current.preview
		: {};
	const reviewItems: Array<Record<string, unknown>> = (
		Array.isArray(currentPreview.review_items) ? (currentPreview.review_items as unknown[]) : []
	).filter(isRecord);
	const nextReviewItems = reviewItems.filter((item) => item.entity_id !== params.subjectId);
	if (index < 0 && nextReviewItems.length === reviewItems.length) {
		return { suggestionId: String(current.id) };
	}

	const keep = (_: unknown, i: number) => i !== index;
	const nextOperations = operations.filter(keep) as LoopOperation[];
	const undoOperations: unknown[] = Array.isArray(current.undo_operations)
		? current.undo_operations
		: [];
	const evidenceRefs = (
		Array.isArray(current.evidence_refs) ? current.evidence_refs : []
	) as ProjectSuggestionEvidenceRef[];
	const nextEvidence = evidenceRefs.filter((ref) => ref?.entity_id !== params.subjectId);
	const supersedeResult = {
		ok: false,
		applied_operations: 0,
		freshness_rebuild: { removed_flag_id: params.flagId }
	} as unknown as Json;

	if (nextOperations.length === 0 && nextReviewItems.length === 0) {
		const { data: superseded, error: supersedeError } = await admin
			.from('project_suggestions')
			.update({ status: 'superseded', decided_at: params.now, result: supersedeResult })
			.eq('id', current.id)
			.eq('status', 'pending')
			.select('*')
			.maybeSingle();
		if (supersedeError)
			throw new Error(`Failed to close freshness bundle: ${supersedeError.message}`);
		if (superseded) {
			await syncInboxItemForProjectSuggestion({ supabase: admin, suggestion: superseded });
			await applyProjectAttentionBudget({ supabase: admin, projectId: params.projectId });
		}
		return { suggestionId: null };
	}

	const title = bundleTitle(nextOperations.length + nextReviewItems.length);
	const preview: ProjectSuggestionPreview = {
		kind: 'generic',
		summary: title,
		after: [
			...nextOperations.map((operation) => operation.label ?? operation.tool),
			...nextReviewItems.map(
				(item) => `${str(item.title) ?? 'Item'}: ${str(item.reason) ?? ''}`
			)
		],
		...(nextReviewItems.length
			? {
					review_items:
						nextReviewItems as unknown as ProjectSuggestionPreview['review_items']
				}
			: {})
	};
	if (nextOperations.length) {
		const verification = await verifyProjectSuggestionIntegrity(admin, {
			projectId: params.projectId,
			operations: nextOperations,
			title,
			preview,
			checkModelAlignment: true
		});
		if (!verification.ok) {
			throw new Error(`Rebuilt bundle failed verification (${verification.diagnostic.code})`);
		}
	}
	const sourceFingerprint = nextOperations.length
		? await computeProjectSuggestionFreshnessFingerprint(
				admin,
				params.projectId,
				nextOperations
			)
		: null;

	const { data: superseded, error: supersedeError } = await admin
		.from('project_suggestions')
		.update({ status: 'superseded', decided_at: params.now, result: supersedeResult })
		.eq('id', current.id)
		.eq('status', 'pending')
		.select('*')
		.maybeSingle();
	if (supersedeError)
		throw new Error(`Failed to supersede freshness bundle: ${supersedeError.message}`);
	if (!superseded) return { suggestionId: null }; // decided concurrently

	const {
		id: _id,
		created_at: _createdAt,
		updated_at: _updatedAt,
		decided_at: _decidedAt,
		applied_at: _appliedAt,
		result: _result,
		user_feedback: _feedback,
		...rest
	} = current as Record<string, unknown>;
	const { data: inserted, error: insertError } = await admin
		.from('project_suggestions')
		.insert({
			...rest,
			status: 'pending',
			title,
			preview: preview as unknown as Json,
			why_now: bundleWhyNow(current.why_now, nextEvidence),
			rationale: nextReviewItems.length ? bundleRationale(nextReviewItems) : null,
			operations: nextOperations as unknown as Json,
			undo_operations: (undoOperations.length === operations.length
				? undoOperations.filter(keep)
				: undoOperations) as unknown as Json,
			evidence_refs: nextEvidence as unknown as Json,
			source_fingerprint: sourceFingerprint,
			freshness_state: 'fresh'
		})
		.select('*')
		.single();
	if (insertError || !inserted) {
		// Put the original back rather than lose every draft.
		await admin
			.from('project_suggestions')
			.update({ status: 'pending', decided_at: null, result: null })
			.eq('id', current.id)
			.eq('status', 'superseded');
		throw new Error(`Failed to insert rebuilt bundle: ${insertError?.message ?? 'no row'}`);
	}

	const newId = String(inserted.id);
	const { error: relinkError } = await admin
		.from('freshness_flags')
		.update({ suggestion_id: newId })
		.eq('suggestion_id', current.id)
		.eq('status', 'open')
		.neq('id', params.flagId);
	if (relinkError) {
		console.warn(`[FreshnessRadar] Failed to relink flags to ${newId}:`, relinkError.message);
	}
	await syncInboxItemForProjectSuggestion({ supabase: admin, suggestion: superseded });
	await syncInboxItemForProjectSuggestion({ supabase: admin, suggestion: inserted });
	await applyProjectAttentionBudget({ supabase: admin, projectId: params.projectId });
	return { suggestionId: newId };
}

async function currentPendingBundleId(
	supabase: AnySupabase,
	projectId: string
): Promise<string | null> {
	const { data, error } = await supabase
		.from('project_suggestions')
		.select('id')
		.eq('project_id', projectId)
		.eq('kind', FRESHNESS_UPDATE_SUGGESTION_KIND)
		.eq('status', 'pending')
		.maybeSingle();
	if (error) return null;
	return str(data?.id);
}

export type FreshnessFlagActionOutcome =
	| { ok: true; flag: FreshnessFlagRecord; suggestionId: string | null }
	| { ok: false; status: number; message: string };

export async function markFreshnessFlagNotStale(params: {
	supabase: AnySupabase;
	admin: AnySupabase;
	userId: string;
	projectId: string;
	flagId: string;
	now?: number;
}): Promise<FreshnessFlagActionOutcome> {
	const nowIso = new Date(params.now ?? Date.now()).toISOString();
	// Ownership through RLS: only the dumping user can read (and so act on) the flag.
	const { data: flag, error } = await params.supabase
		.from('freshness_flags')
		.select('*')
		.eq('id', params.flagId)
		.eq('project_id', params.projectId)
		.eq('user_id', params.userId)
		.maybeSingle();
	if (error) return { ok: false, status: 500, message: error.message };
	if (!flag) return { ok: false, status: 404, message: 'Flag not found' };
	if (flag.subject_kind === 'inbox_item') {
		return { ok: false, status: 422, message: 'Inbox items are restored with Undo' };
	}
	if (flag.disposition !== 'surfaced' && flag.disposition !== 'drafted') {
		return { ok: false, status: 409, message: 'This record was already changed' };
	}

	if (flag.status !== 'open') {
		// Idempotent: a second tap reports the current state.
		return {
			ok: true,
			flag: toFreshnessFlagRecord(flag),
			suggestionId: await currentPendingBundleId(params.supabase, params.projectId)
		};
	}

	const { data: updated, error: updateError } = await params.admin
		.from('freshness_flags')
		.update({
			status: 'dismissed',
			outcome: 'not_stale',
			outcome_source: 'user_marked_not_stale',
			outcome_at: nowIso
		})
		.eq('id', params.flagId)
		.eq('user_id', params.userId)
		.eq('status', 'open')
		.select('*')
		.maybeSingle();
	if (updateError) return { ok: false, status: 500, message: updateError.message };
	const record = toFreshnessFlagRecord((updated ?? flag) as Record<string, unknown>);
	// The roll-up concern for this subject closes too (tasker 106).
	await closeFreshnessConcerns({
		admin: params.admin,
		projectId: params.projectId,
		userId: params.userId,
		subjects: [{ kind: String(flag.subject_kind), id: String(flag.subject_id) }],
		status: 'dismissed',
		reason: 'user_marked_not_stale',
		now: params.now
	});

	let suggestionId: string | null = null;
	const bundleId =
		str(flag.suggestion_id) ??
		(await currentPendingBundleId(params.supabase, params.projectId));
	if (bundleId) {
		try {
			const rebuilt = await rebuildBundleWithout({
				admin: params.admin,
				projectId: params.projectId,
				suggestionId: bundleId,
				subjectId: String(flag.subject_id),
				flagId: params.flagId,
				now: nowIso
			});
			suggestionId = rebuilt.suggestionId;
		} catch (rebuildError) {
			// The outcome is recorded; the stale draft stays approvable until the next scan.
			console.warn(
				`[FreshnessRadar] Bundle rebuild after not-stale failed for ${bundleId}:`,
				rebuildError instanceof Error ? rebuildError.message : rebuildError
			);
			suggestionId = await currentPendingBundleId(params.supabase, params.projectId);
		}
	} else {
		suggestionId = await currentPendingBundleId(params.supabase, params.projectId);
	}

	return { ok: true, flag: record, suggestionId };
}

// ---------------------------------------------------------------------------
// Decide-path outcome hook (called by decideProjectSuggestion)
// ---------------------------------------------------------------------------

/**
 * Label the bundle's drafted flags from the user's decision. Approval marks the flags whose
 * operation applied; a dismissal closes them with an unknown outcome. Never throws.
 */
export async function recordFreshnessBundleOutcome(params: {
	admin: AnySupabase;
	suggestion: Record<string, unknown>;
	/** 'address': the user marked the roll-up item handled (tasker 106). */
	action: 'approve' | 'dismiss' | 'address';
	result?: ProjectSuggestionResult;
	/** Per-operation success, aligned with suggestion.operations (approve only). */
	operationOutcomes?: boolean[];
	now?: number;
}): Promise<void> {
	if (params.suggestion.kind !== FRESHNESS_UPDATE_SUGGESTION_KIND) return;
	const suggestionId = str(params.suggestion.id);
	if (!suggestionId) return;
	const nowIso = new Date(params.now ?? Date.now()).toISOString();
	const projectId = str(params.suggestion.project_id);
	const operationSubjects = (
		Array.isArray(params.suggestion.operations) ? params.suggestion.operations : []
	)
		.map((operation) =>
			isRecord(operation)
				? entityRefFromOperation(operation as unknown as LoopOperation)
				: null
		)
		.filter((ref): ref is NonNullable<typeof ref> => Boolean(ref));
	try {
		if (params.action === 'dismiss' || params.action === 'address') {
			if (projectId) {
				await closeFreshnessConcerns({
					admin: params.admin,
					projectId,
					concernIds: bundleReviewConcernIds(params.suggestion),
					subjects: operationSubjects.map((ref) => ({ kind: ref.kind, id: ref.id })),
					status: 'dismissed',
					reason: 'user_dismissed',
					now: params.now
				});
			}
			const { error } = await params.admin
				.from('freshness_flags')
				.update({
					status: 'dismissed',
					outcome: 'unknown',
					outcome_source: 'user_dismissed',
					outcome_at: nowIso
				})
				.eq('suggestion_id', suggestionId)
				.eq('status', 'open');
			if (error) throw new Error(error.message);
			return;
		}

		const operations: unknown[] = Array.isArray(params.suggestion.operations)
			? params.suggestion.operations
			: [];
		const appliedSubjects = new Set<string>();
		operations.forEach((operation, index) => {
			const applied = params.operationOutcomes
				? params.operationOutcomes[index] === true
				: params.result?.ok === true;
			if (!applied || !isRecord(operation)) return;
			const ref = entityRefFromOperation(operation as unknown as LoopOperation);
			if (ref) appliedSubjects.add(ref.id);
		});
		if (!appliedSubjects.size) return;
		if (projectId) {
			await closeFreshnessConcerns({
				admin: params.admin,
				projectId,
				subjects: operationSubjects
					.filter((ref) => appliedSubjects.has(ref.id))
					.map((ref) => ({ kind: ref.kind, id: ref.id })),
				status: 'applied',
				reason: 'applied',
				now: params.now
			});
		}
		const { error } = await params.admin
			.from('freshness_flags')
			.update({
				status: 'applied',
				applied_via: 'bundle_approval',
				applied_at: nowIso,
				outcome: 'stale',
				outcome_source: 'user_approved',
				outcome_at: nowIso
			})
			.eq('suggestion_id', suggestionId)
			.eq('status', 'open')
			.in('subject_id', [...appliedSubjects]);
		if (error) throw new Error(error.message);
	} catch (error) {
		console.warn(
			`[FreshnessRadar] Failed to record bundle outcome for ${suggestionId}:`,
			error instanceof Error ? error.message : error
		);
	}
}
