// apps/worker/src/workers/freshness-radar/outcomes.ts
//
// Lazy implicit outcome labels (plan section 7, "Outcomes"), run at the start of
// each scan of a project. Explicit outcomes (approve, dismiss, not stale, undo)
// are written by the web actions; this module only labels what nobody decided:
// - entity flags older than the 7-day horizon: a relevant field changed since
//   the snapshot -> stale / field_changed_within_horizon; unchanged -> not_stale
//   / unchanged_within_horizon; entity gone -> unknown / entity_deleted. Flags a
//   radar write touched (applied_at, or a later radar apply on the same entity)
//   are left for their explicit labels;
// - auto-applies not undone within 72 hours -> stale / auto_applied_kept;
// - track scores whose target passed -> met / missed / changed_target.

import type { FreshnessSubjectSnapshot } from '@buildos/shared-types';
import { candidateSnapshot, entityKey, sameInstant } from './context';
import type { FreshnessDb } from './dataPort';
import type { FreshnessPolicyV1 } from './freshnessPolicy';
import type { FreshnessCandidate } from './prefilter';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const LABEL_BATCH = 200;

type UnlabeledFlag = {
	id: string;
	subject_kind: string;
	subject_id: string;
	subject_snapshot: Partial<FreshnessSubjectSnapshot> | null;
	subject_updated_at: string | null;
	disposition: string;
	status: string;
	applied_at: string | null;
	created_at: string;
};

export type OutcomeLabelSummary = {
	stale: number;
	notStale: number;
	deleted: number;
	autoKept: number;
	trackLabeled: number;
};

function relevantFieldChanged(
	before: Partial<FreshnessSubjectSnapshot>,
	after: FreshnessSubjectSnapshot
): boolean {
	return (
		(before.state_key ?? null) !== (after.state_key ?? null) ||
		(before.due_at ?? null) !== (after.due_at ?? null) ||
		(before.start_at ?? null) !== (after.start_at ?? null) ||
		(before.target_date ?? null) !== (after.target_date ?? null) ||
		(before.title_sha256 ?? null) !== (after.title_sha256 ?? null) ||
		(before.details_sha256 ?? null) !== (after.details_sha256 ?? null)
	);
}

export async function labelImplicitOutcomes(params: {
	db: FreshnessDb;
	projectId: string;
	/** Every loaded (non-deleted) project entity, keyed `${kind}:${id}`. */
	entitiesByKey: ReadonlyMap<string, FreshnessCandidate>;
	now: Date;
	policy: FreshnessPolicyV1;
}): Promise<OutcomeLabelSummary> {
	const { db, now, policy } = params;
	const nowIso = now.toISOString();
	const summary: OutcomeLabelSummary = {
		stale: 0,
		notStale: 0,
		deleted: 0,
		autoKept: 0,
		trackLabeled: 0
	};

	// Auto-applies kept past the undo window.
	const keptBefore = new Date(
		now.getTime() - policy.outcomes.autoKeptHours * HOUR_MS
	).toISOString();
	const kept = await db
		.from('freshness_flags')
		.update({
			outcome: 'stale',
			outcome_source: 'auto_applied_kept',
			outcome_at: nowIso,
			status: 'applied'
		})
		.eq('project_id', params.projectId)
		.eq('disposition', 'auto_applied')
		.eq('status', 'open')
		.is('outcome', null)
		.lt('applied_at', keptBefore)
		.select('id');
	if (!kept.error) summary.autoKept = Array.isArray(kept.data) ? kept.data.length : 0;

	// Entity flags past the horizon with no outcome yet.
	const horizon = new Date(now.getTime() - policy.outcomes.horizonDays * DAY_MS).toISOString();
	const flags = await db
		.from('freshness_flags')
		.select(
			'id, subject_kind, subject_id, subject_snapshot, subject_updated_at, disposition, status, applied_at, created_at'
		)
		.eq('project_id', params.projectId)
		.is('outcome', null)
		.lt('created_at', horizon)
		.in('subject_kind', ['task', 'document', 'goal', 'milestone'])
		.order('created_at', { ascending: true })
		.limit(LABEL_BATCH);
	const unlabeled = flags.error ? [] : ((flags.data ?? []) as UnlabeledFlag[]);
	if (unlabeled.length) {
		const rows = unlabeled;
		// A later radar apply on the same entity means the change was ours.
		const applies = await db
			.from('freshness_flags')
			.select('subject_kind, subject_id, applied_at')
			.eq('project_id', params.projectId)
			.in('subject_id', [...new Set(rows.map((row) => row.subject_id))])
			.gt('applied_at', rows[0]?.created_at ?? nowIso);
		const radarAppliedAfter = new Map<string, string[]>();
		for (const row of ((applies.error ? [] : applies.data) ?? []) as Array<{
			subject_kind: string;
			subject_id: string;
			applied_at: string | null;
		}>) {
			if (!row.applied_at) continue;
			const key = entityKey(row.subject_kind, row.subject_id);
			radarAppliedAfter.set(key, [...(radarAppliedAfter.get(key) ?? []), row.applied_at]);
		}
		const groups = { stale: [] as string[], notStale: [] as string[], deleted: [] as string[] };
		for (const row of rows) {
			if (row.applied_at) continue;
			const key = entityKey(row.subject_kind, row.subject_id);
			if (
				(radarAppliedAfter.get(key) ?? []).some(
					(at) => Date.parse(at) > Date.parse(row.created_at)
				)
			) {
				continue;
			}
			const current = params.entitiesByKey.get(key);
			if (!current) {
				groups.deleted.push(row.id);
				continue;
			}
			if (!row.subject_snapshot) continue;
			const documentEdited =
				current.kind === 'document' &&
				!sameInstant(row.subject_updated_at, current.updatedAt);
			if (
				documentEdited ||
				relevantFieldChanged(row.subject_snapshot, candidateSnapshot(current))
			) {
				groups.stale.push(row.id);
			} else groups.notStale.push(row.id);
		}
		const write = async (ids: string[], outcome: string, source: string) => {
			if (!ids.length) return 0;
			const result = await db
				.from('freshness_flags')
				.update({ outcome, outcome_source: source, outcome_at: nowIso })
				.in('id', ids)
				.is('outcome', null)
				.select('id');
			return result.error || !Array.isArray(result.data) ? 0 : result.data.length;
		};
		summary.stale = await write(groups.stale, 'stale', 'field_changed_within_horizon');
		summary.notStale = await write(groups.notStale, 'not_stale', 'unchanged_within_horizon');
		summary.deleted = await write(groups.deleted, 'unknown', 'entity_deleted');
	}

	// Track scores whose target has passed.
	const tracks = await db
		.from('freshness_track_scores')
		.select('id, subject_kind, subject_id, target_at')
		.eq('project_id', params.projectId)
		.is('outcome', null)
		.lt('target_at', nowIso)
		.limit(LABEL_BATCH);
	if (!tracks.error) {
		for (const row of (tracks.data ?? []) as Array<{
			id: string;
			subject_kind: string;
			subject_id: string;
			target_at: string;
		}>) {
			const current = params.entitiesByKey.get(entityKey(row.subject_kind, row.subject_id));
			if (!current) continue;
			const done =
				(current.kind === 'goal' && current.state === 'achieved') ||
				(current.kind === 'milestone' && current.state === 'completed');
			const currentRaw = current.kind === 'goal' ? current.targetDate : current.dueAt;
			const currentMs = currentRaw
				? Date.parse(
						/^\d{4}-\d{2}-\d{2}$/.test(currentRaw)
							? `${currentRaw}T00:00:00.000Z`
							: currentRaw
					)
				: Number.NaN;
			const moved =
				Number.isFinite(currentMs) && currentMs > Date.parse(row.target_at) + 12 * HOUR_MS;
			const outcome = done ? 'met' : moved ? 'changed_target' : 'missed';
			const result = await db
				.from('freshness_track_scores')
				.update({ outcome, outcome_at: nowIso })
				.eq('id', row.id)
				.is('outcome', null);
			if (!result.error) summary.trackLabeled += 1;
		}
	}
	return summary;
}
