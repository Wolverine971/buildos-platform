// apps/worker/src/workers/freshness-radar/ledger.ts
//
// Stage [4]: the calibration ledger (plan section 7). Every scan gets a
// freshness_scans row (including skipped and failed scans), every evaluated
// subject gets a freshness_flags row, every scored goal or milestone gets a
// freshness_track_scores row. The ledger is written in shadow and live mode
// alike; only stage [5] is live-only.

import {
	FRESHNESS_QUESTION_SET_VERSION,
	type FreshnessDisposition,
	type FreshnessEvidence,
	type FreshnessFlagStatus,
	type FreshnessSubjectKind,
	type FreshnessSubjectSnapshot,
	type FreshnessUndoPayload,
	type Json,
	type LoopOperation
} from '@buildos/shared-types';
import type { FreshnessDb } from './dataPort';
import type { FreshnessPolicyV1 } from './freshnessPolicy';
import { FRESHNESS_QUESTION_SET_SHA256 } from './questions';

export type ScanTrigger = 'chat_turn' | 'chat_close' | 'manual';
export type ScanMode = 'shadow' | 'live';

export type ScanRow = {
	id: string;
	project_id: string;
	user_id: string;
	signal_id: string | null;
	status: 'running' | 'completed' | 'skipped' | 'failed';
	mode: ScanMode;
	card_message_id: string | null;
};

export type BeginScanResult =
	| { kind: 'started'; scan: ScanRow }
	| { kind: 'existing'; scan: ScanRow }
	| { kind: 'locked'; scan: ScanRow | null };

const SCAN_COLUMNS = 'id, project_id, user_id, signal_id, status, mode, card_message_id';
/** Far above any real scan (Jev 5s deadline, a few dozen queries). */
export const STALE_RUNNING_SCAN_MS = 15 * 60_000;

function isUniqueViolation(error: { code?: string } | null | undefined): boolean {
	return error?.code === '23505';
}

function fail(what: string, error: { message?: string } | null | undefined): never {
	throw new Error(
		`freshness radar ledger write failed (${what}): ${error?.message ?? 'unknown'}`
	);
}

/**
 * Insert the running scan row. The unique indexes make this the retry guard
 * (one scan per signal and project) and the per-project lock (one running
 * scan per project). A lost lock still gets a ledger row: a skipped scan.
 */
export async function beginScan(params: {
	db: FreshnessDb;
	signalId: string | null;
	projectId: string;
	userId: string;
	trigger: ScanTrigger;
	mode: ScanMode;
	triggerSessionId: string | null;
	policy: FreshnessPolicyV1;
	modelRequested: string;
	now: string;
}): Promise<BeginScanResult> {
	const base = {
		project_id: params.projectId,
		user_id: params.userId,
		signal_id: params.signalId,
		trigger: params.trigger,
		mode: params.mode,
		trigger_session_id: params.triggerSessionId,
		question_set_version: FRESHNESS_QUESTION_SET_VERSION,
		question_set_sha256: FRESHNESS_QUESTION_SET_SHA256,
		policy_version: params.policy.version,
		policy: params.policy as unknown as Json,
		model_requested: params.modelRequested,
		started_at: params.now
	};
	const inserted = await params.db
		.from('freshness_scans')
		.insert({ ...base, status: 'running' })
		.select(SCAN_COLUMNS)
		.single();
	if (!inserted.error) return { kind: 'started', scan: inserted.data as ScanRow };
	if (!isUniqueViolation(inserted.error)) fail('freshness_scans insert', inserted.error);

	if (params.signalId) {
		const existing = await params.db
			.from('freshness_scans')
			.select(SCAN_COLUMNS)
			.eq('signal_id', params.signalId)
			.eq('project_id', params.projectId)
			.maybeSingle();
		if (existing.error) fail('freshness_scans read', existing.error);
		if (existing.data) return { kind: 'existing', scan: existing.data as ScanRow };
	}

	// Another scan is running for this project. A scan running far longer than
	// any real scan was abandoned (worker killed, no retry left): fail it so the
	// project lock cannot wedge, then take the lock once.
	const running = await params.db
		.from('freshness_scans')
		.select('id, started_at, created_at')
		.eq('project_id', params.projectId)
		.eq('status', 'running')
		.maybeSingle();
	const runningRow = (running.error ? null : running.data) as {
		id: string;
		started_at: string | null;
		created_at: string;
	} | null;
	const runningSince = Date.parse(runningRow?.started_at ?? runningRow?.created_at ?? '');
	if (
		runningRow &&
		Number.isFinite(runningSince) &&
		Date.parse(params.now) - runningSince > STALE_RUNNING_SCAN_MS
	) {
		await params.db
			.from('freshness_scans')
			.update({
				status: 'failed',
				error_message: 'stale_running_scan',
				finished_at: params.now
			})
			.eq('id', runningRow.id)
			.eq('status', 'running');
		const retried = await params.db
			.from('freshness_scans')
			.insert({ ...base, status: 'running' })
			.select(SCAN_COLUMNS)
			.single();
		if (!retried.error) return { kind: 'started', scan: retried.data as ScanRow };
		if (!isUniqueViolation(retried.error)) fail('freshness_scans insert', retried.error);
	}

	// Record a skipped scan: every scan attempt gets a ledger row.
	const skipped = await params.db
		.from('freshness_scans')
		.insert({
			...base,
			status: 'skipped',
			skip_reason: 'project_scan_running',
			finished_at: params.now
		})
		.select(SCAN_COLUMNS)
		.single();
	if (skipped.error && !isUniqueViolation(skipped.error))
		fail('freshness_scans skip', skipped.error);
	return { kind: 'locked', scan: (skipped.data as ScanRow | null) ?? null };
}

export type ScanJevStats = {
	modelUsed: string | null;
	requests: number;
	inputTokens: number;
	costUsd: number;
	latencyMs: number[];
};

export type FinishScanPatch = {
	status: 'completed' | 'skipped' | 'failed';
	skipReason?: string | null;
	errorMessage?: string | null;
	window?: {
		sessionIds: string[];
		messageIds: string[];
		start: string | null;
		cursorAt: string | null;
		chars: number;
		truncated: boolean;
	};
	candidatesTotal?: number;
	candidatesEvaluated?: number;
	jev?: ScanJevStats;
	counts?: Record<string, number>;
	cardMessageId?: string | null;
	now: string;
};

export async function finishScan(db: FreshnessDb, scanId: string, patch: FinishScanPatch) {
	const update: Record<string, unknown> = {
		status: patch.status,
		finished_at: patch.now,
		skip_reason: patch.skipReason ?? null,
		error_message: patch.errorMessage ? patch.errorMessage.slice(0, 500) : null
	};
	if (patch.window) {
		update.info_session_ids = patch.window.sessionIds;
		update.info_message_ids = patch.window.messageIds;
		update.info_window_start = patch.window.start;
		// Only a completed scan advances the cursor; a failed scan must re-read.
		update.info_cursor_at = patch.status === 'completed' ? patch.window.cursorAt : null;
		update.info_chars = patch.window.chars;
		update.info_truncated = patch.window.truncated;
	}
	if (patch.candidatesTotal !== undefined) update.candidates_total = patch.candidatesTotal;
	if (patch.candidatesEvaluated !== undefined)
		update.candidates_evaluated = patch.candidatesEvaluated;
	if (patch.jev) {
		update.model_used = patch.jev.modelUsed;
		update.jev_requests = patch.jev.requests;
		update.jev_input_tokens = patch.jev.inputTokens;
		update.jev_cost_usd = Math.round(patch.jev.costUsd * 1e8) / 1e8;
		update.jev_latency_ms = patch.jev.latencyMs.map((value) => Math.max(0, Math.round(value)));
	}
	if (patch.counts) update.counts = patch.counts;
	if (patch.cardMessageId !== undefined) update.card_message_id = patch.cardMessageId;
	const result = await db.from('freshness_scans').update(update).eq('id', scanId);
	if (result.error) fail('freshness_scans finish', result.error);
}

export type FlagInsert = {
	subject_kind: FreshnessSubjectKind;
	subject_id: string;
	subject_title: string;
	subject_updated_at: string | null;
	subject_snapshot: FreshnessSubjectSnapshot;
	probability: number;
	change_kind: string | null;
	change_kind_probability: number | null;
	date_choice: string | null;
	date_choice_probability: number | null;
	answers: Record<string, unknown>;
	features: Record<string, unknown>;
	evidence: FreshnessEvidence | null;
	disposition: FreshnessDisposition;
	disposition_reason: string | null;
	status?: FreshnessFlagStatus;
	proposed_operation: LoopOperation | null;
	undo_operation?: FreshnessUndoPayload | null;
};

export type InsertedFlag = {
	id: string;
	subject_kind: FreshnessSubjectKind;
	subject_id: string;
	disposition: FreshnessDisposition;
};

function clampProbability(value: number | null): number | null {
	if (value === null || !Number.isFinite(value)) return null;
	return Math.min(1, Math.max(0, Math.round(value * 10_000) / 10_000));
}

export async function insertFlags(params: {
	db: FreshnessDb;
	scanId: string;
	projectId: string;
	userId: string;
	modelUsed: string | null;
	flags: readonly FlagInsert[];
}): Promise<InsertedFlag[]> {
	if (!params.flags.length) return [];
	const rows = params.flags.map((flag) => ({
		scan_id: params.scanId,
		project_id: params.projectId,
		user_id: params.userId,
		subject_kind: flag.subject_kind,
		subject_id: flag.subject_id,
		subject_title: flag.subject_title.slice(0, 500),
		subject_updated_at: flag.subject_updated_at,
		subject_snapshot: flag.subject_snapshot as unknown as Json,
		question_set_version: FRESHNESS_QUESTION_SET_VERSION,
		model_used: params.modelUsed,
		probability: clampProbability(flag.probability) ?? 0,
		change_kind: flag.change_kind,
		change_kind_probability: clampProbability(flag.change_kind_probability),
		date_choice: flag.date_choice,
		date_choice_probability: clampProbability(flag.date_choice_probability),
		answers: flag.answers as unknown as Json,
		features: flag.features as unknown as Json,
		evidence: (flag.evidence ?? null) as unknown as Json,
		disposition: flag.disposition,
		disposition_reason: flag.disposition_reason,
		status: flag.status ?? 'open',
		proposed_operation: (flag.proposed_operation ?? null) as unknown as Json,
		undo_operation: (flag.undo_operation ?? null) as unknown as Json
	}));
	const result = await params.db
		.from('freshness_flags')
		.insert(rows)
		.select('id, subject_kind, subject_id, disposition');
	if (result.error) fail('freshness_flags insert', result.error);
	const inserted = (result.data ?? []) as InsertedFlag[];
	// Map back in input order (PostgREST returns insert order; be defensive).
	const byKey = new Map(inserted.map((row) => [`${row.subject_kind}:${row.subject_id}`, row]));
	return params.flags
		.map((flag) => byKey.get(`${flag.subject_kind}:${flag.subject_id}`)!)
		.filter(Boolean);
}

export async function updateFlag(
	db: FreshnessDb,
	flagId: string,
	patch: Record<string, unknown>,
	guard?: Record<string, string>
): Promise<boolean> {
	let query = db.from('freshness_flags').update(patch).eq('id', flagId);
	for (const [column, value] of Object.entries(guard ?? {})) query = query.eq(column, value);
	const result = await query.select('id');
	if (result.error) fail('freshness_flags update', result.error);
	return Array.isArray(result.data) && result.data.length > 0;
}

export type TrackScoreInsert = {
	subject_kind: 'goal' | 'milestone';
	subject_id: string;
	subject_title: string;
	gauge: string;
	previous_gauge: string | null;
	score: number | null;
	score_confidence: number | null;
	evidence_probability: number | null;
	answers: Record<string, unknown>;
	facts: string[];
	target_at: string | null;
};

export async function insertTrackScores(params: {
	db: FreshnessDb;
	scanId: string;
	projectId: string;
	userId: string;
	modelUsed: string | null;
	rows: readonly TrackScoreInsert[];
}): Promise<void> {
	if (!params.rows.length) return;
	const result = await params.db.from('freshness_track_scores').insert(
		params.rows.map((row) => ({
			scan_id: params.scanId,
			project_id: params.projectId,
			user_id: params.userId,
			subject_kind: row.subject_kind,
			subject_id: row.subject_id,
			subject_title: row.subject_title.slice(0, 500),
			gauge: row.gauge,
			previous_gauge: row.previous_gauge,
			score: row.score,
			score_confidence: row.score_confidence,
			evidence_probability: row.evidence_probability,
			answers: row.answers as unknown as Json,
			facts: row.facts as unknown as Json,
			target_at: normalizeTargetAt(row.target_at),
			question_set_version: FRESHNESS_QUESTION_SET_VERSION,
			model_used: params.modelUsed
		}))
	);
	if (result.error) fail('freshness_track_scores insert', result.error);
}

/** Goals store a civil target_date; the ledger column is a timestamptz. */
function normalizeTargetAt(value: string | null): string | null {
	if (!value) return null;
	return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value;
}
