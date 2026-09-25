// packages/shared-types/src/freshness-radar.types.ts
//
// Jev freshness radar (Tasker 88) frozen contracts.
// Plan: docs/architecture/jev-freshness-radar-v1-plan.md §3. Lanes code against
// these shapes; change them only through a plan amendment.

import type { LoopOperation, ProjectSuggestionStatus } from './project-loops.types';

// v2 (tasker 106): Jev targeting + document section dig; recorded START HERE decisions count as news.
export const FRESHNESS_QUESTION_SET_VERSION = 'freshness_questions_v2' as const;
export const FRESHNESS_POLICY_VERSION = 'freshness_policy_v2' as const;
export const FRESHNESS_UPDATE_SUGGESTION_KIND = 'freshness_update' as const;

export type FreshnessEntityKind = 'task' | 'document' | 'goal' | 'milestone';
export type FreshnessSubjectKind = FreshnessEntityKind | 'inbox_item';
export type FreshnessGauge = 'on_track' | 'at_risk' | 'off_track' | 'unknown';
export type FreshnessChangeKind =
	| 'mark_done'
	| 'mark_in_progress'
	| 'mark_blocked'
	| 'reschedule_due'
	| 'cancel_or_drop'
	| 'rewrite_details'
	| 'content_outdated'
	| 'superseded'
	| 'mark_achieved'
	| 'mark_abandoned'
	| 'retarget_date'
	| 'mark_completed'
	| 'mark_missed'
	| 'no_change_needed'
	| 'unclear';
export type FreshnessDisposition =
	| 'evaluated'
	| 'surfaced'
	| 'drafted'
	| 'auto_apply_pending'
	| 'auto_applied'
	| 'auto_apply_skipped'
	| 'retired'
	| 'marked_possibly_stale'
	| 'suppressed';
export type FreshnessFlagStatus =
	| 'open'
	| 'applied'
	| 'dismissed'
	| 'undone'
	| 'resolved_by_change'
	| 'superseded'
	| 'expired';
export type FreshnessOutcome = 'stale' | 'not_stale' | 'unknown';
export type FreshnessOutcomeSource =
	| 'user_approved'
	| 'user_dismissed'
	| 'user_marked_not_stale'
	| 'user_undid'
	| 'auto_applied_kept'
	| 'field_changed_within_horizon'
	| 'unchanged_within_horizon'
	| 'entity_deleted'
	| 'backtest_label'
	| 'manual_label';

/** Per-user cohort flags (feature_flags.feature_name). */
export const FRESHNESS_RADAR_FEATURES = [
	'freshness_radar',
	'freshness_radar.surfaces',
	'freshness_radar.auto_apply',
	'freshness_radar.inbox_cleanup'
] as const;
export type FreshnessRadarFeatureName = (typeof FRESHNESS_RADAR_FEATURES)[number];

/** Inbox item marker written by markInboxItemFreshness (inbox_items.freshness_state). */
export type InboxFreshnessState = 'fresh' | 'possibly_stale';

/** Queue job 'freshness_radar_scan'. Dedup: 'freshness-radar:<signalId>' (trigger) or '...:retry:<ISO minute>' (reschedule). */
export interface FreshnessScanJobMetadata {
	signalId: string;
	sessionId: string;
	userId: string;
	correlationId?: string;
}

export type FreshnessUndoPayload =
	| { kind: 'entity_field'; operation: LoopOperation; expectAfterUpdatedAt: string }
	| {
			kind: 'inbox_retire';
			suggestionId: string;
			inboxItemId: string;
			previousSuggestionStatus: 'pending';
			previousInboxStatus: 'pending' | 'deferred';
	  };

export interface FreshnessSubjectSnapshot {
	state_key: string | null;
	due_at?: string | null;
	start_at?: string | null;
	target_date?: string | null;
	title_sha256: string;
	details_sha256: string | null;
	source_type?: string;
	source_ref_id?: string;
}

export interface FreshnessEvidence {
	message_id: string;
	session_id: string;
	/** <=160 characters, the user's own words. */
	excerpt: string;
	date_literal?: string;
	date_iso?: string;
}

/** Mirrors public.freshness_flags 1:1. */
export interface FreshnessFlagRecord {
	id: string;
	scan_id: string;
	project_id: string;
	user_id: string;
	subject_kind: FreshnessSubjectKind;
	subject_id: string;
	subject_title: string;
	subject_updated_at: string | null;
	subject_snapshot: FreshnessSubjectSnapshot;
	question_set_version: string;
	model_used: string | null;
	probability: number;
	change_kind: FreshnessChangeKind | null;
	change_kind_probability: number | null;
	date_choice: string | null;
	date_choice_probability: number | null;
	answers: Record<string, unknown>;
	features: Record<string, unknown>;
	evidence: FreshnessEvidence | null;
	disposition: FreshnessDisposition;
	disposition_reason: string | null;
	status: FreshnessFlagStatus;
	proposed_operation: LoopOperation | null;
	undo_operation: FreshnessUndoPayload | null;
	suggestion_id: string | null;
	applied_via: 'auto' | 'bundle_approval' | null;
	applied_at: string | null;
	applied_after_updated_at: string | null;
	undone_at: string | null;
	undone_by: string | null;
	outcome: FreshnessOutcome | null;
	outcome_source: FreshnessOutcomeSource | null;
	outcome_at: string | null;
	created_at: string;
	updated_at: string;
}

export interface FreshnessCardItemV1 {
	flagId: string;
	entity: { kind: FreshnessEntityKind; id: string; title: string };
	probability: number;
	disposition: 'surfaced' | 'drafted';
	proposal: {
		summary: string;
		field: 'state_key' | 'due_at' | 'target_date';
		from: string | null;
		to: string;
	} | null;
	evidenceExcerpt: string | null;
	draftInChatPrompt: string | null;
	/** Code-authored reason line (e.g. which document sections look out of date). Optional (tasker 106). */
	reason?: string | null;
}

/** Chat card: persisted as an injected chat_messages row (role 'assistant', message_type 'assistant_message';
 *  the chat_messages message_type CHECK has no card type, so the card is identified by metadata.source + metadata.kind),
 *  metadata = { source:'freshness_radar', kind:'freshness_radar_card', freshness_scan_id, idempotency_key:'freshness-scan:<scanId>:card', card }.
 *  Delivered by the existing chat_messages realtime INSERT subscription and by session hydration. */
export interface FreshnessCardPayloadV1 {
	version: 'freshness_card_v1';
	scanId: string;
	projectId: string;
	projectName: string;
	createdAt: string;
	headline: string;
	moreCount: number;
	/** <=3 */
	items: FreshnessCardItemV1[];
	/** "Update these" */
	bundle: { suggestionId: string; operationCount: number } | null;
	autoApplied: Array<{
		flagId: string;
		entity: { kind: 'task'; id: string; title: string };
		summary: string;
		undoableUntil: string;
	}>;
	inboxCleanup: { retired: Array<{ flagId: string; title: string }>; possiblyStaleCount: number };
	gaugeChanges: Array<{
		entity: { kind: 'goal' | 'milestone'; id: string; title: string };
		from: FreshnessGauge | null;
		to: FreshnessGauge;
	}>;
}

// ---------------------------------------------------------------------------
// Roll-up (tasker 106): one living concern per (project, user, subject)
// ---------------------------------------------------------------------------

export type FreshnessConcernStatus = 'open' | 'resolved' | 'dismissed' | 'expired' | 'applied';
export type FreshnessConcernCloseReason =
	/** The subject changed where the concern pointed (its flagged sections or fields). */
	| 'resolved_by_update'
	/** Deleted, archived, or moved to a terminal state (done task, achieved goal…). */
	| 'subject_closed'
	| 'user_dismissed'
	| 'user_marked_not_stale'
	| 'applied'
	/** No new evidence within the policy's expiry window. */
	| 'aged_out';

/** A document section the radar judged out of date (anchor = gfm heading slug). */
export interface FreshnessConcernSection {
	anchor: string | null;
	heading: string;
	probability: number;
	/** SHA-256 of the section's own text when judged: a changed hash means it was edited. */
	textSha256: string;
}

/** A recorded START HERE decision newer than the subject's last change. */
export interface FreshnessConcernDecision {
	text: string;
	recorded: string | null;
}

/** One accumulated evidence item (one per independent scan observation). */
export interface FreshnessConcernEvidence {
	flagId: string | null;
	scanId: string;
	probability: number;
	at: string;
	/** Identity of the information the observation rested on; repeats of a key never accumulate. */
	key: string;
}

export interface FreshnessConcernDetail {
	changeKind: FreshnessChangeKind | null;
	sections: FreshnessConcernSection[];
	decisions: FreshnessConcernDecision[];
	evidenceExcerpt: string | null;
	proposal: {
		summary: string;
		field: 'state_key' | 'due_at' | 'target_date';
		from: string | null;
		to: string;
	} | null;
	/** Composer prefill for "Fix in chat" (the user's own voice; names sections and decisions). */
	fixInChatPrompt: string;
}

/** Mirrors public.freshness_concerns 1:1. */
export interface FreshnessConcernRecord {
	id: string;
	project_id: string;
	user_id: string;
	subject_kind: FreshnessEntityKind;
	subject_id: string;
	subject_title: string;
	status: FreshnessConcernStatus;
	close_reason: FreshnessConcernCloseReason | null;
	score: number;
	peak_probability: number;
	last_probability: number;
	evidence_count: number;
	seen_count: number;
	first_flag_id: string | null;
	last_flag_id: string | null;
	evidence: FreshnessConcernEvidence[];
	detail: FreshnessConcernDetail;
	subject_snapshot: FreshnessSubjectSnapshot | null;
	subject_updated_at: string | null;
	first_seen_at: string;
	last_seen_at: string;
	last_evidence_at: string;
	surfaced_at: string | null;
	surfaced_scan_id: string | null;
	closed_at: string | null;
	closed_scan_id: string | null;
	created_at: string;
	updated_at: string;
}

/** The stored message_type. Cards are identified by `FRESHNESS_CARD_METADATA_KIND`, not by this value. */
export const FRESHNESS_CARD_MESSAGE_TYPE = 'assistant_message' as const;
export const FRESHNESS_CARD_METADATA_KIND = 'freshness_radar_card' as const;
export const FRESHNESS_CARD_MAX_ITEMS = 3;

export interface FreshnessScanStatusV1 {
	version: 'freshness_scan_status_v1';
	scanId: string;
	flags: Record<
		string,
		{ status: FreshnessFlagStatus; disposition: FreshnessDisposition; undoable: boolean }
	>;
	bundle: { suggestionId: string; status: ProjectSuggestionStatus } | null;
}

/** GET /api/onto/projects/[id]/freshness — live scans only; flags whose entity changed since the flag are omitted. */
export interface FreshnessBadgeReadV1 {
	version: 'freshness_badges_v1';
	projectId: string;
	scannedAt: string | null;
	flags: Array<{
		flagId: string;
		scanId: string;
		entity: { kind: FreshnessEntityKind; id: string };
		probability: number;
		label: 'may_be_out_of_date' | 'updated_automatically';
		evidenceExcerpt: string | null;
		suggestionId: string | null;
		createdAt: string;
		undoableUntil: string | null;
		/** Roll-up reason line, e.g. which sections look out of date (tasker 106). */
		reason?: string | null;
		/** Composer prefill for "Fix in chat" (tasker 106). */
		fixInChatPrompt?: string | null;
	}>;
	gauges: Array<{
		entity: { kind: 'goal' | 'milestone'; id: string };
		gauge: FreshnessGauge;
		score: number | null;
		scoredAt: string;
		scanId: string;
	}>;
}

/** POST /api/onto/projects/[id]/freshness/scans/[scan_id]/undo  body { flag_ids?: string[] } (default: every undoable flag in the scan) */
export interface FreshnessUndoResultV1 {
	version: 'freshness_undo_v1';
	undone: string[];
	skipped: Array<{
		flagId: string;
		reason:
			| 'changed_since'
			| 'window_expired'
			| 'already_undone'
			| 'not_undoable'
			| 'execution_failed'
			| 'forbidden';
		message?: string;
	}>;
}
/** POST /api/onto/projects/[id]/freshness/flags/[flag_id]  body { action: 'not_stale' } -> { flag: FreshnessFlagRecord; suggestionId: string | null } */
export interface FreshnessFlagActionResultV1 {
	flag: FreshnessFlagRecord;
	suggestionId: string | null;
}

// ---------------------------------------------------------------------------
// Card payload parser (shared by worker tests and web)
// ---------------------------------------------------------------------------

const ENTITY_KINDS: ReadonlySet<string> = new Set(['task', 'document', 'goal', 'milestone']);
const GAUGES: ReadonlySet<string> = new Set(['on_track', 'at_risk', 'off_track', 'unknown']);
const PROPOSAL_FIELDS: ReadonlySet<string> = new Set(['state_key', 'due_at', 'target_date']);

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}

function isNullableString(value: unknown): value is string | null {
	return value === null || typeof value === 'string';
}

function isCount(value: unknown): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isProbability(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function parseItem(value: unknown): FreshnessCardItemV1 | null {
	if (!isRecord(value) || !isNonEmptyString(value.flagId)) return null;
	const entity = value.entity;
	if (
		!isRecord(entity) ||
		typeof entity.kind !== 'string' ||
		!ENTITY_KINDS.has(entity.kind) ||
		!isNonEmptyString(entity.id) ||
		typeof entity.title !== 'string'
	) {
		return null;
	}
	if (!isProbability(value.probability)) return null;
	if (value.disposition !== 'surfaced' && value.disposition !== 'drafted') return null;
	let proposal: FreshnessCardItemV1['proposal'] = null;
	if (value.proposal !== null && value.proposal !== undefined) {
		const raw = value.proposal;
		if (
			!isRecord(raw) ||
			typeof raw.summary !== 'string' ||
			typeof raw.field !== 'string' ||
			!PROPOSAL_FIELDS.has(raw.field) ||
			!isNullableString(raw.from ?? null) ||
			typeof raw.to !== 'string'
		) {
			return null;
		}
		proposal = {
			summary: raw.summary,
			field: raw.field as 'state_key' | 'due_at' | 'target_date',
			from: (raw.from ?? null) as string | null,
			to: raw.to
		};
	}
	const evidenceExcerpt = value.evidenceExcerpt ?? null;
	const draftInChatPrompt = value.draftInChatPrompt ?? null;
	const reason = value.reason ?? null;
	if (
		!isNullableString(evidenceExcerpt) ||
		!isNullableString(draftInChatPrompt) ||
		!isNullableString(reason)
	)
		return null;
	return {
		flagId: value.flagId,
		entity: {
			kind: entity.kind as FreshnessEntityKind,
			id: entity.id,
			title: entity.title
		},
		probability: value.probability,
		disposition: value.disposition,
		proposal,
		evidenceExcerpt,
		draftInChatPrompt,
		...(reason ? { reason } : {})
	};
}

function parseArray<T>(value: unknown, parse: (entry: unknown) => T | null): T[] | null {
	if (!Array.isArray(value)) return null;
	const parsed: T[] = [];
	for (const entry of value) {
		const item = parse(entry);
		if (item === null) return null;
		parsed.push(item);
	}
	return parsed;
}

/**
 * Validate an untrusted card payload (chat_messages.metadata.card). Returns a
 * normalized copy containing only contract fields, or null when any required
 * field is missing or malformed. Never throws.
 */
export function parseFreshnessCardPayloadV1(value: unknown): FreshnessCardPayloadV1 | null {
	if (!isRecord(value) || value.version !== 'freshness_card_v1') return null;
	if (
		!isNonEmptyString(value.scanId) ||
		!isNonEmptyString(value.projectId) ||
		typeof value.projectName !== 'string' ||
		!isNonEmptyString(value.createdAt) ||
		typeof value.headline !== 'string' ||
		!isCount(value.moreCount)
	) {
		return null;
	}

	const items = parseArray(value.items, parseItem);
	if (!items || items.length > FRESHNESS_CARD_MAX_ITEMS) return null;

	let bundle: FreshnessCardPayloadV1['bundle'] = null;
	if (value.bundle !== null && value.bundle !== undefined) {
		const raw = value.bundle;
		if (!isRecord(raw) || !isNonEmptyString(raw.suggestionId) || !isCount(raw.operationCount)) {
			return null;
		}
		bundle = { suggestionId: raw.suggestionId, operationCount: raw.operationCount };
	}

	const autoApplied = parseArray(value.autoApplied ?? [], (entry) => {
		if (!isRecord(entry) || !isNonEmptyString(entry.flagId)) return null;
		const entity = entry.entity;
		if (
			!isRecord(entity) ||
			entity.kind !== 'task' ||
			!isNonEmptyString(entity.id) ||
			typeof entity.title !== 'string' ||
			typeof entry.summary !== 'string' ||
			!isNonEmptyString(entry.undoableUntil)
		) {
			return null;
		}
		return {
			flagId: entry.flagId,
			entity: { kind: 'task' as const, id: entity.id, title: entity.title },
			summary: entry.summary,
			undoableUntil: entry.undoableUntil
		};
	});
	if (!autoApplied) return null;

	const cleanupRaw = value.inboxCleanup ?? { retired: [], possiblyStaleCount: 0 };
	if (!isRecord(cleanupRaw) || !isCount(cleanupRaw.possiblyStaleCount)) return null;
	const retired = parseArray(cleanupRaw.retired ?? [], (entry) => {
		if (!isRecord(entry) || !isNonEmptyString(entry.flagId) || typeof entry.title !== 'string') {
			return null;
		}
		return { flagId: entry.flagId, title: entry.title };
	});
	if (!retired) return null;

	const gaugeChanges = parseArray(value.gaugeChanges ?? [], (entry) => {
		if (!isRecord(entry)) return null;
		const entity = entry.entity;
		if (
			!isRecord(entity) ||
			(entity.kind !== 'goal' && entity.kind !== 'milestone') ||
			!isNonEmptyString(entity.id) ||
			typeof entity.title !== 'string'
		) {
			return null;
		}
		const from = entry.from ?? null;
		if (from !== null && (typeof from !== 'string' || !GAUGES.has(from))) return null;
		if (typeof entry.to !== 'string' || !GAUGES.has(entry.to)) return null;
		return {
			entity: {
				kind: entity.kind as 'goal' | 'milestone',
				id: entity.id,
				title: entity.title
			},
			from: from as FreshnessGauge | null,
			to: entry.to as FreshnessGauge
		};
	});
	if (!gaugeChanges) return null;

	return {
		version: 'freshness_card_v1',
		scanId: value.scanId,
		projectId: value.projectId,
		projectName: value.projectName,
		createdAt: value.createdAt,
		headline: value.headline,
		moreCount: value.moreCount,
		items,
		bundle,
		autoApplied,
		inboxCleanup: { retired, possiblyStaleCount: cleanupRaw.possiblyStaleCount },
		gaugeChanges
	};
}
