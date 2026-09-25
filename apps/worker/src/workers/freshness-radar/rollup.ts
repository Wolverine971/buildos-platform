// apps/worker/src/workers/freshness-radar/rollup.ts
//
// The roll-up (tasker 106): one living concern per (project, user, subject),
// merged from every scan instead of a fresh pile of flags per scan.
// freshness_flags stays the append-only calibration ledger; freshness_concerns
// is the derived current state that the card, the inbox item and the badges
// read.
//
// Per scan, for each open concern:
//   1. subject gone or closed (done task, archived doc…)  -> resolved / subject_closed
//   2. subject edited where the concern points            -> resolved / resolved_by_update
//        documents: every flagged section's text changed (a partial edit keeps
//        the untouched sections open); other kinds: any snapshotted field changed
//   3. re-observed at or above the floor                  -> accumulate evidence
//   4. no new evidence for `expireDays`                   -> expired / aged_out
// New observations at or above the floor open a concern. A concern surfaces
// once, the first scan its score reaches the bar.
//
// Accumulation: score = max(decayed peak, 1 - prod(1 - discount * p_i * decay_i))
// over observations with distinct evidence keys. A key identifies the
// information an observation rested on (the subject's state, the decisions
// newer than it, and the chat messages when Jev said the chat bears on it), so
// re-judging the same evidence never counts twice.

import { createHash } from 'node:crypto';
import type {
	FreshnessChangeKind,
	FreshnessConcernCloseReason,
	FreshnessConcernDetail,
	FreshnessConcernEvidence,
	FreshnessConcernSection,
	FreshnessConcernStatus,
	FreshnessEntityKind,
	FreshnessSubjectSnapshot,
	Json
} from '@buildos/shared-types';
import { candidateSnapshot, entityKey, sameInstant, snapshotsMatch } from './context';
import type { FreshnessDb } from './dataPort';
import type { FreshnessPolicyV1 } from './freshnessPolicy';
import type { FreshnessCandidate } from './prefilter';

const DAY_MS = 86_400_000;

/** A freshness_concerns row as the worker reads it. */
export type ConcernRow = {
	id: string;
	subject_kind: FreshnessEntityKind;
	subject_id: string;
	subject_title: string;
	status: FreshnessConcernStatus;
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
};

export const CONCERN_COLUMNS =
	'id, subject_kind, subject_id, subject_title, status, score, peak_probability, last_probability, evidence_count, seen_count, first_flag_id, last_flag_id, evidence, detail, subject_snapshot, subject_updated_at, first_seen_at, last_seen_at, last_evidence_at, surfaced_at, surfaced_scan_id';

/** One evaluated subject in this scan (any probability). */
export type ConcernObservation = {
	candidate: FreshnessCandidate;
	flagId: string | null;
	probability: number;
	/** Suppressed by an earlier user decision (dismissed / not out of date) on an unchanged subject. */
	suppressed: boolean;
	/**
	 * Jev's own change verdict was no_change_needed: seen, but never evidence. A
	 * middling stale score with nothing to change must not accumulate into a nag.
	 */
	noChangeNeeded: boolean;
	evidenceKey: string;
	detail: FreshnessConcernDetail;
};

export type ConcernInsert = Omit<ConcernRow, 'id'> & { key: string };

export type ConcernUpdate = {
	id: string;
	key: string;
	patch: Partial<Omit<ConcernRow, 'id'>> & {
		close_reason?: FreshnessConcernCloseReason;
		closed_at?: string;
		closed_scan_id?: string;
	};
};

export type ConcernMergePlan = {
	inserts: ConcernInsert[];
	updates: ConcernUpdate[];
	/** Subject keys that crossed the bar for the first time in this scan. */
	newlySurfaced: string[];
	/** Every concern that is open and surfaced after the merge (for the inbox item). */
	surfacedOpen: Array<{ key: string; concernId: string | null }>;
};

function round4(value: number): number {
	return Math.round(value * 10_000) / 10_000;
}

function ageDays(at: string, now: Date): number {
	const ms = Date.parse(at);
	return Number.isFinite(ms) ? Math.max(0, (now.getTime() - ms) / DAY_MS) : 0;
}

export function concernScore(
	evidence: readonly FreshnessConcernEvidence[],
	now: Date,
	policy: FreshnessPolicyV1
): number {
	const rules = policy.rollup;
	let peak = 0;
	let miss = 1;
	for (const item of evidence) {
		const decay = 0.5 ** (ageDays(item.at, now) / rules.halfLifeDays);
		const p = Math.min(1, Math.max(0, item.probability));
		peak = Math.max(peak, p * decay);
		miss *= 1 - rules.discount * p * decay;
	}
	return round4(Math.max(peak, 1 - miss));
}

export function evidenceKey(parts: {
	snapshot: FreshnessSubjectSnapshot;
	subjectUpdatedAt: string | null;
	kind: FreshnessEntityKind;
	newerDecisionTexts: readonly string[];
	chatMessageIds: readonly string[];
}): string {
	return createHash('sha256')
		.update(
			JSON.stringify({
				s: parts.snapshot,
				// Documents snapshot only their description; content edits move updated_at.
				u: parts.kind === 'document' ? parts.subjectUpdatedAt : null,
				d: [...parts.newerDecisionTexts].sort(),
				m: [...parts.chatMessageIds].sort()
			})
		)
		.digest('hex')
		.slice(0, 32);
}

/** Documents: sections whose own text is unchanged since the concern flagged them. */
export function untouchedSections(
	sections: readonly FreshnessConcernSection[],
	currentHashes: ReadonlyMap<string, string> | undefined
): FreshnessConcernSection[] {
	if (!currentHashes) return [...sections];
	return sections.filter(
		(section) => currentHashes.get(section.anchor ?? '') === section.textSha256
	);
}

function subjectChanged(
	concern: ConcernRow,
	current: FreshnessCandidate,
	currentHashes: ReadonlyMap<string, string> | undefined
): { changed: boolean; remainingSections?: FreshnessConcernSection[] } {
	if (current.kind === 'document') {
		const flagged = concern.detail?.sections ?? [];
		if (flagged.length) {
			const remaining = untouchedSections(flagged, currentHashes);
			if (!remaining.length) return { changed: true };
			return remaining.length < flagged.length
				? { changed: false, remainingSections: remaining }
				: { changed: false };
		}
		return { changed: !sameInstant(concern.subject_updated_at, current.updatedAt) };
	}
	return {
		changed: !snapshotsMatch(
			concern.subject_snapshot as Partial<FreshnessSubjectSnapshot> | null,
			candidateSnapshot(current)
		)
	};
}

export function mergeConcerns(params: {
	open: readonly ConcernRow[];
	observations: readonly ConcernObservation[];
	/** Every loaded project entity (open or not), keyed `${kind}:${id}`. */
	current: ReadonlyMap<string, FreshnessCandidate>;
	/** Entities that are archived or in a terminal state. */
	isClosed: (candidate: FreshnessCandidate) => boolean;
	/** Current own-text hash per anchor for documents with open concerns. */
	sectionHashes: ReadonlyMap<string, ReadonlyMap<string, string>>;
	scanId: string;
	now: Date;
	policy: FreshnessPolicyV1;
}): ConcernMergePlan {
	const { now, policy } = params;
	const rules = policy.rollup;
	const nowIso = now.toISOString();
	const observed = new Map(
		params.observations.map((observation) => [
			entityKey(observation.candidate.kind, observation.candidate.id),
			observation
		])
	);
	const inserts: ConcernInsert[] = [];
	const updates: ConcernUpdate[] = [];
	const newlySurfaced: string[] = [];
	const surfacedOpen: ConcernMergePlan['surfacedOpen'] = [];
	const handled = new Set<string>();

	const close = (
		concern: ConcernRow,
		key: string,
		status: FreshnessConcernStatus,
		reason: FreshnessConcernCloseReason
	) =>
		updates.push({
			id: concern.id,
			key,
			patch: {
				status,
				close_reason: reason,
				closed_at: nowIso,
				closed_scan_id: params.scanId
			}
		});

	for (const concern of params.open) {
		const key = entityKey(concern.subject_kind, concern.subject_id);
		if (handled.has(key)) {
			// A duplicate open row cannot exist (unique index); be defensive anyway.
			close(concern, key, 'resolved', 'subject_closed');
			continue;
		}
		handled.add(key);
		const current = params.current.get(key);
		if (!current || params.isClosed(current)) {
			close(concern, key, 'resolved', 'subject_closed');
			continue;
		}
		const change = subjectChanged(concern, current, params.sectionHashes.get(current.id));
		if (change.changed) {
			close(concern, key, 'resolved', 'resolved_by_update');
			continue;
		}
		const observation = observed.get(key);
		if (observation?.suppressed) {
			close(concern, key, 'dismissed', 'user_dismissed');
			continue;
		}

		let evidence = concern.evidence ?? [];
		let detail: FreshnessConcernDetail = change.remainingSections
			? { ...concern.detail, sections: change.remainingSections }
			: concern.detail;
		const patch: ConcernUpdate['patch'] = {};
		if (change.remainingSections) patch.detail = detail;

		if (observation && !observation.noChangeNeeded && observation.probability >= rules.floor) {
			const isNew = !evidence.some((item) => item.key === observation.evidenceKey);
			if (isNew) {
				evidence = [
					...evidence,
					{
						flagId: observation.flagId,
						scanId: params.scanId,
						probability: round4(observation.probability),
						at: nowIso,
						key: observation.evidenceKey
					}
				].slice(-rules.maxEvidence);
				patch.evidence = evidence;
				patch.evidence_count = concern.evidence_count + 1;
				patch.last_evidence_at = nowIso;
			}
			detail = {
				...observation.detail,
				// A document re-observed without sections keeps what it had.
				sections: observation.detail.sections.length
					? observation.detail.sections
					: detail.sections
			};
			patch.detail = detail;
			patch.subject_title = observation.candidate.title;
			patch.last_probability = round4(observation.probability);
			patch.peak_probability = round4(
				Math.max(concern.peak_probability, observation.probability)
			);
			patch.seen_count = concern.seen_count + 1;
			patch.last_seen_at = nowIso;
			patch.last_flag_id = observation.flagId ?? concern.last_flag_id;
			patch.subject_snapshot = candidateSnapshot(observation.candidate);
			patch.subject_updated_at = observation.candidate.updatedAt;
		} else if (ageDays(concern.last_evidence_at, now) >= rules.expireDays) {
			close(concern, key, 'expired', 'aged_out');
			continue;
		}

		const score = concernScore(evidence, now, policy);
		if (score !== concern.score) patch.score = score;
		let surfaced = Boolean(concern.surfaced_at);
		if (!surfaced && score >= rules.bar) {
			patch.surfaced_at = nowIso;
			patch.surfaced_scan_id = params.scanId;
			newlySurfaced.push(key);
			surfaced = true;
		}
		if (Object.keys(patch).length) updates.push({ id: concern.id, key, patch });
		if (surfaced) surfacedOpen.push({ key, concernId: concern.id });
	}

	for (const [key, observation] of observed) {
		if (handled.has(key)) continue;
		if (
			observation.suppressed ||
			observation.noChangeNeeded ||
			observation.probability < rules.floor
		)
			continue;
		if (params.isClosed(observation.candidate)) continue;
		const evidence: FreshnessConcernEvidence[] = [
			{
				flagId: observation.flagId,
				scanId: params.scanId,
				probability: round4(observation.probability),
				at: nowIso,
				key: observation.evidenceKey
			}
		];
		const score = concernScore(evidence, now, policy);
		const surfaced = score >= rules.bar;
		inserts.push({
			key,
			subject_kind: observation.candidate.kind,
			subject_id: observation.candidate.id,
			subject_title: observation.candidate.title,
			status: 'open',
			score,
			peak_probability: round4(observation.probability),
			last_probability: round4(observation.probability),
			evidence_count: 1,
			seen_count: 1,
			first_flag_id: observation.flagId,
			last_flag_id: observation.flagId,
			evidence,
			detail: observation.detail,
			subject_snapshot: candidateSnapshot(observation.candidate),
			subject_updated_at: observation.candidate.updatedAt,
			first_seen_at: nowIso,
			last_seen_at: nowIso,
			last_evidence_at: nowIso,
			surfaced_at: surfaced ? nowIso : null,
			surfaced_scan_id: surfaced ? params.scanId : null
		});
		if (surfaced) {
			newlySurfaced.push(key);
			surfacedOpen.push({ key, concernId: null });
		}
	}

	return { inserts, updates, newlySurfaced, surfacedOpen };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export async function loadOpenConcerns(
	db: FreshnessDb,
	projectId: string,
	userId: string
): Promise<ConcernRow[]> {
	const result = await db
		.from('freshness_concerns')
		.select(CONCERN_COLUMNS)
		.eq('project_id', projectId)
		.eq('user_id', userId)
		.eq('status', 'open')
		.limit(500);
	if (result.error) throw new Error(`freshness concern read failed: ${result.error.message}`);
	return ((result.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
		...(row as unknown as ConcernRow),
		score: Number(row.score),
		peak_probability: Number(row.peak_probability),
		last_probability: Number(row.last_probability)
	}));
}

/**
 * Apply a merge plan. Updates are conditional on the row still being open (a
 * web action may have closed it meanwhile); inserts race only with another
 * scan, which the per-project running-scan lock already prevents. Returns
 * subject key -> concern id for every open surfaced concern.
 */
export async function applyConcernMerge(params: {
	db: FreshnessDb;
	projectId: string;
	userId: string;
	plan: ConcernMergePlan;
}): Promise<Map<string, string>> {
	const { db, plan } = params;
	const ids = new Map<string, string>();
	for (const update of plan.updates) {
		const result = await db
			.from('freshness_concerns')
			.update(update.patch as Record<string, unknown>)
			.eq('id', update.id)
			.eq('status', 'open')
			.select('id');
		if (result.error)
			throw new Error(`freshness concern update failed: ${result.error.message}`);
	}
	if (plan.inserts.length) {
		const rows = plan.inserts.map(({ key: _key, ...row }) => ({
			...row,
			project_id: params.projectId,
			user_id: params.userId,
			evidence: row.evidence as unknown as Json,
			detail: row.detail as unknown as Json,
			subject_snapshot: row.subject_snapshot as unknown as Json
		}));
		const result = await db
			.from('freshness_concerns')
			.insert(rows)
			.select('id, subject_kind, subject_id');
		if (result.error)
			throw new Error(`freshness concern insert failed: ${result.error.message}`);
		for (const row of (result.data ?? []) as Array<{
			id: string;
			subject_kind: string;
			subject_id: string;
		}>) {
			ids.set(entityKey(row.subject_kind, row.subject_id), row.id);
		}
	}
	for (const entry of plan.surfacedOpen) {
		const id = entry.concernId ?? ids.get(entry.key);
		if (id) ids.set(entry.key, id);
	}
	return ids;
}

/** The change kind shown for a concern (documents are always content_outdated). */
export function concernChangeKind(
	kind: FreshnessEntityKind,
	changeKind: FreshnessChangeKind | null
): FreshnessChangeKind | null {
	return kind === 'document' ? 'content_outdated' : changeKind;
}
