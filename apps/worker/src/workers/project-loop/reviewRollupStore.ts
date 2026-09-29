// apps/worker/src/workers/project-loop/reviewRollupStore.ts
//
// Tasker 112: loads a project's open review findings as roll-up lineages and writes a pass's
// roll-up events back to project_suggestions. Rows are never rewritten under a change: an
// in-place confirmation only refreshes the wording and evidence; a new proposal is a new row,
// and the row it replaces is superseded with the reason recorded in `rollup.close`.
import type {
	Json,
	LoopOperation,
	ProjectCleanupCloseReason,
	ProjectCleanupSection,
	ProjectSuggestionEvidenceRef,
	ProjectSuggestionRollup
} from '@buildos/shared-types';
import {
	type RollupCandidate,
	type RollupCloseReason,
	type RollupEvent,
	type RollupItem,
	type RollupSubjectState,
	findingSubjects,
	rollupRowKey
} from './reviewRollup';

/** Review findings plus Complete Project Audit recommendations: the carried-forward kinds. */
export const ROLLUP_KINDS = [
	'doc_org',
	'doc_outdated',
	'drift',
	'task_conflict',
	'audit_recommendation'
] as const;

// project_suggestions.lineage_id / rollup are newer than the generated database types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RollupDb = { from: (table: string) => any };

export interface OpenReviewRow {
	id: string;
	run_id: string | null;
	kind: string;
	title: string;
	rationale: string | null;
	why_now: string | null;
	evidence_refs: ProjectSuggestionEvidenceRef[];
	operations: LoopOperation[];
	preview: Record<string, unknown> | null;
	reversible: boolean | null;
	lineage_id: string | null;
	rollup: ProjectSuggestionRollup | null;
	created_at: string;
	updated_at: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function asString(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeOpenRow(value: unknown): OpenReviewRow | null {
	const row = asRecord(value);
	const id = asString(row?.id);
	const kind = asString(row?.kind);
	if (!row || !id || !kind) return null;
	const createdAt = asString(row.created_at) ?? new Date(0).toISOString();
	return {
		id,
		run_id: asString(row.run_id),
		kind,
		title: asString(row.title) ?? 'Project review item',
		rationale: asString(row.rationale),
		why_now: asString(row.why_now),
		evidence_refs: Array.isArray(row.evidence_refs)
			? (row.evidence_refs as ProjectSuggestionEvidenceRef[])
			: [],
		operations: Array.isArray(row.operations) ? (row.operations as LoopOperation[]) : [],
		preview: asRecord(row.preview),
		reversible: typeof row.reversible === 'boolean' ? row.reversible : null,
		lineage_id: asString(row.lineage_id),
		rollup: (asRecord(row.rollup) as ProjectSuggestionRollup | null) ?? null,
		created_at: createdAt,
		updated_at: asString(row.updated_at) ?? createdAt
	};
}

export async function loadOpenReviewRows(
	db: RollupDb,
	projectId: string
): Promise<OpenReviewRow[]> {
	const { data, error } = await db
		.from('project_suggestions')
		.select(
			'id, run_id, kind, title, rationale, why_now, evidence_refs, operations, preview, reversible, lineage_id, rollup, created_at, updated_at'
		)
		.eq('project_id', projectId)
		.eq('status', 'pending')
		.in('kind', ROLLUP_KINDS as unknown as string[])
		.order('created_at', { ascending: true })
		.limit(300);
	if (error) throw new Error(`Failed to load open review findings: ${error.message}`);
	return ((data ?? []) as unknown[])
		.map(normalizeOpenRow)
		.filter((row): row is OpenReviewRow => Boolean(row));
}

export function rollupCandidateFromRow(row: OpenReviewRow): RollupCandidate {
	return {
		suggestionId: row.id,
		runId: row.run_id ?? '',
		kind: row.kind,
		title: row.title,
		operations: row.operations,
		evidenceRefs: row.evidence_refs
	};
}

/** Rebuild the open lineages from their live rows. A row from before the roll-up is its own. */
export function lineagesFromRows(rows: OpenReviewRow[]): RollupItem[] {
	const byLineage = new Map<string, OpenReviewRow[]>();
	for (const row of rows) {
		const lineageId = row.lineage_id ?? row.id;
		byLineage.set(lineageId, [...(byLineage.get(lineageId) ?? []), row]);
	}
	const items: RollupItem[] = [];
	for (const [lineageId, lineageRows] of byLineage) {
		const ordered = [...lineageRows].sort((a, b) => a.created_at.localeCompare(b.created_at));
		const first = ordered[0];
		const latest = [...ordered]
			.sort((a, b) => a.updated_at.localeCompare(b.updated_at))
			.at(-1)!;
		const shapes = ordered.map((row) => findingSubjects(rollupCandidateFromRow(row)));
		const rollups = ordered
			.map((row) => row.rollup)
			.filter(Boolean) as ProjectSuggestionRollup[];
		const seen = new Set<string>();
		for (const value of rollups) for (const id of value.seen_run_ids ?? []) seen.add(id);
		if (!seen.size) for (const row of ordered) if (row.run_id) seen.add(row.run_id);
		const firstSeen = [
			...rollups.map((value) => value.first_seen_at),
			...ordered.map((row) => row.created_at)
		]
			.filter(Boolean)
			.sort()[0]!;
		const lastConfirmed =
			rollups
				.map((value) => value.last_confirmed_at)
				.filter(Boolean)
				.sort()
				.at(-1) ?? latest.created_at;
		items.push({
			lineageId,
			kind: first.kind,
			title: latest.title,
			rows: ordered.map((row) => ({
				suggestionId: row.id,
				key: rollupRowKey(rollupCandidateFromRow(row)),
				targets: findingSubjects(rollupCandidateFromRow(row)).targets,
				executable: row.operations.length > 0
			})),
			revisionIds: ordered.map((row) => row.id),
			targets: [...new Set(shapes.flatMap((shape) => shape.targets))].sort(),
			subjects: [...new Set(shapes.flatMap((shape) => shape.subjects))].sort(),
			primarySubject: shapes[0]?.primarySubject ?? null,
			firstSeenAt: firstSeen,
			lastConfirmedAt: lastConfirmed,
			seenInRuns: [...seen],
			passesSinceConfirmed: rollups.length
				? Math.min(...rollups.map((value) => value.passes_since_confirmed ?? 0))
				: 0,
			status: 'open'
		});
	}
	return items;
}

const USER_CLOSE_REASONS = new Set(['user_applied', 'user_rejected', 'user_addressed']);

function cleanupCloseReason(reason: RollupCloseReason): ProjectCleanupCloseReason | null {
	return USER_CLOSE_REASONS.has(reason) ? null : (reason as ProjectCleanupCloseReason);
}

/** Plain words for a close, for the card's "closed since the last review" list. */
export function closeReasonDetail(reason: RollupCloseReason, detail: string): string {
	switch (reason) {
		case 'subject_archived':
			return 'Its subject was archived.';
		case 'subject_deleted':
			return 'Its subject was deleted.';
		case 'already_done':
			return 'Already done.';
		case 'merged':
			return 'Merged into another item.';
		case 'revised':
			return 'Replaced by an updated version.';
		case 'aged_out':
			return 'Not flagged again for a month.';
		default:
			return detail;
	}
}

export interface RollupWriteContext {
	db: RollupDb;
	projectId: string;
	runId: string;
	at: string;
	/** Insert payloads for this pass's candidates, by suggestion id. */
	insertRows: ReadonlyMap<string, Record<string, unknown>>;
	/** Wording and evidence to refresh on a row confirmed in place, by candidate id. */
	refreshFields: ReadonlyMap<string, Record<string, unknown>>;
	log?: (message: string) => Promise<unknown> | unknown;
}

export interface RollupWriteResult {
	inserted: string[];
	confirmedInPlace: string[];
	closedRows: Array<{ suggestionId: string; reason: RollupCloseReason }>;
	relabeled: string[];
}

async function supersedeRows(
	ctx: RollupWriteContext,
	rowIds: string[],
	reason: RollupCloseReason,
	detail: string,
	mergedInto?: string
): Promise<void> {
	if (!rowIds.length) return;
	const { data, error } = await ctx.db
		.from('project_suggestions')
		.select('id, rollup')
		.in('id', rowIds)
		.eq('status', 'pending');
	if (error) throw new Error(`Failed to load rows to close: ${error.message}`);
	for (const row of (data ?? []) as Array<{ id: string; rollup: unknown }>) {
		const previous = (asRecord(row.rollup) ?? {}) as Partial<ProjectSuggestionRollup>;
		const closeReason = cleanupCloseReason(reason) ?? 'resolved';
		const rollup: Record<string, unknown> = {
			...previous,
			close: {
				reason: closeReason,
				detail: closeReasonDetail(reason, detail),
				run_id: ctx.runId,
				at: ctx.at,
				...(mergedInto ? { merged_into: mergedInto } : {})
			}
		};
		const { error: updateError } = await ctx.db
			.from('project_suggestions')
			.update({
				status: 'superseded',
				decided_at: ctx.at,
				result: {
					ok: false,
					applied_operations: 0,
					errors: [
						{ tool: 'project_review_rollup', error: closeReasonDetail(reason, detail) }
					]
				} as unknown as Json,
				rollup: rollup as unknown as Json
			})
			.eq('id', row.id)
			.eq('status', 'pending');
		if (updateError) throw new Error(`Failed to close row ${row.id}: ${updateError.message}`);
	}
}

/**
 * Write one batch of roll-up events. Inserts first (so a lineage never points at a missing
 * row), then in-place refreshes, merges (rows move to the surviving lineage and stay open),
 * and closes.
 */
export async function writeRollupEvents(
	ctx: RollupWriteContext,
	events: RollupEvent[]
): Promise<RollupWriteResult> {
	const result: RollupWriteResult = {
		inserted: [],
		confirmedInPlace: [],
		closedRows: [],
		relabeled: []
	};

	const inserts: Record<string, unknown>[] = [];
	for (const event of events) {
		if (event.type === 'opened' || (event.type === 'confirmed' && !event.inPlaceRowId)) {
			const payload = ctx.insertRows.get(event.suggestionId);
			if (!payload) continue;
			inserts.push({ ...payload, id: event.suggestionId, lineage_id: event.lineageId });
		}
	}
	if (inserts.length) {
		const { error } = await ctx.db.from('project_suggestions').insert(inserts);
		if (error) {
			const wrapped = new Error(`Failed to insert suggestions: ${error.message}`) as Error & {
				code?: string;
			};
			if (error.code) wrapped.code = error.code;
			throw wrapped;
		}
		result.inserted.push(...inserts.map((row) => String(row.id)));
	}

	for (const event of events) {
		if (event.type === 'confirmed' && event.inPlaceRowId) {
			const fields = ctx.refreshFields.get(event.suggestionId);
			if (fields) {
				const { error } = await ctx.db
					.from('project_suggestions')
					.update(fields)
					.eq('id', event.inPlaceRowId)
					.eq('status', 'pending');
				if (error) throw new Error(`Failed to refresh row: ${error.message}`);
			}
			result.confirmedInPlace.push(event.inPlaceRowId);
		}
		if (event.type === 'confirmed' && event.supersededRowIds.length) {
			await supersedeRows(
				ctx,
				event.supersededRowIds,
				'revised',
				'Replaced by an updated version.'
			);
			result.closedRows.push(
				...event.supersededRowIds.map((id) => ({
					suggestionId: id,
					reason: 'revised' as const
				}))
			);
		}
		if (event.type === 'narrowed' && event.closedRowIds.length) {
			await supersedeRows(ctx, event.closedRowIds, event.reason, event.detail);
			result.closedRows.push(
				...event.closedRowIds.map((id) => ({ suggestionId: id, reason: event.reason }))
			);
		}
		if (event.type === 'closed') {
			if (event.reason === 'merged' && event.mergedInto) {
				if (event.rowIds.length) {
					const { error } = await ctx.db
						.from('project_suggestions')
						.update({ lineage_id: event.mergedInto })
						.in('id', event.rowIds)
						.eq('status', 'pending');
					if (error) throw new Error(`Failed to merge rows: ${error.message}`);
					result.relabeled.push(...event.rowIds);
				}
				continue;
			}
			// A user decision already moved its row out of pending; nothing to write.
			if (USER_CLOSE_REASONS.has(event.reason)) continue;
			await supersedeRows(ctx, event.rowIds, event.reason, event.detail);
			result.closedRows.push(
				...event.rowIds.map((id) => ({ suggestionId: id, reason: event.reason }))
			);
		}
	}
	return result;
}

/**
 * Stamp every open lineage's state onto its live rows, and backfill lineage_id on rows from
 * before the roll-up. `sections` / `summaries` come from the roll-up synthesis. One read for
 * all rows, then one write per lineage.
 */
export async function writeLineageState(
	ctx: Pick<RollupWriteContext, 'db'>,
	items: RollupItem[],
	extras: {
		sections?: ReadonlyMap<string, ProjectCleanupSection>;
		summaries?: ReadonlyMap<string, string>;
	} = {}
): Promise<void> {
	const open = items.filter((item) => item.status === 'open' && item.rows.length);
	const rowIds = open.flatMap((item) => item.rows.map((row) => row.suggestionId));
	if (!rowIds.length) return;
	const { data, error } = await ctx.db
		.from('project_suggestions')
		.select('id, rollup')
		.in('id', rowIds)
		.eq('status', 'pending');
	if (error) throw new Error(`Failed to load lineage rows: ${error.message}`);
	const previousById = new Map(
		((data ?? []) as Array<{ id: string; rollup: unknown }>).map((row) => [
			row.id,
			(asRecord(row.rollup) ?? {}) as Partial<ProjectSuggestionRollup>
		])
	);
	for (const item of open) {
		const ids = item.rows.map((row) => row.suggestionId).filter((id) => previousById.has(id));
		if (!ids.length) continue;
		const previous = ids.map((id) => previousById.get(id) ?? {});
		const rollup: ProjectSuggestionRollup = {
			first_seen_at: item.firstSeenAt,
			last_confirmed_at: item.lastConfirmedAt,
			seen_run_ids: item.seenInRuns.slice(-50),
			passes_since_confirmed: item.passesSinceConfirmed,
			summary:
				extras.summaries?.get(item.lineageId) ??
				previous.find((value) => value.summary)?.summary ??
				null,
			section:
				extras.sections?.get(item.lineageId) ??
				previous.find((value) => value.section)?.section ??
				null,
			close: null
		};
		const { error: updateError } = await ctx.db
			.from('project_suggestions')
			.update({ lineage_id: item.lineageId, rollup: rollup as unknown as Json })
			.in('id', ids)
			.eq('status', 'pending');
		if (updateError) {
			throw new Error(`Failed to stamp lineage ${item.lineageId}: ${updateError.message}`);
		}
	}
}

const SUBJECT_TABLES: Record<string, string> = {
	document: 'onto_documents',
	task: 'onto_tasks',
	goal: 'onto_goals',
	milestone: 'onto_milestones'
};

/**
 * Archived or deleted state for every subject key (`type:id`). Both archive forms count
 * (tasker 113): a tree-archived document has state_key 'archived' and no archived_at; an
 * archived task has deleted_at and archived_at both set. A record the project no longer has
 * is deleted. Unknown subject types stay live.
 */
export async function loadSubjectStates(
	db: RollupDb,
	projectId: string,
	subjectKeys: Iterable<string>
): Promise<Map<string, RollupSubjectState>> {
	const idsByType = new Map<string, Set<string>>();
	for (const key of subjectKeys) {
		const [type, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
		if (!SUBJECT_TABLES[type] || !id) continue;
		idsByType.set(type, (idsByType.get(type) ?? new Set()).add(id));
	}
	const states = new Map<string, RollupSubjectState>();
	await Promise.all(
		[...idsByType].map(async ([type, ids]) => {
			const { data, error } = await db
				.from(SUBJECT_TABLES[type])
				.select('id, project_id, state_key, archived_at, deleted_at')
				.in('id', [...ids]);
			if (error) throw new Error(`Failed to load ${type} state: ${error.message}`);
			const rows = new Map(
				((data ?? []) as Array<Record<string, unknown>>).map((row) => [String(row.id), row])
			);
			for (const id of ids) {
				const row = rows.get(id);
				const key = `${type}:${id}`;
				if (!row || row.project_id !== projectId) {
					states.set(key, { deleted: true });
					continue;
				}
				const archived =
					Boolean(row.archived_at) ||
					(type === 'document' && row.state_key === 'archived');
				if (archived) states.set(key, { archived: true });
				else if (row.deleted_at) states.set(key, { deleted: true });
			}
		})
	);
	return states;
}

/** Close reasons for a row whose change the integrity check can no longer resolve. */
export function closeReasonForIntegrityCode(code: string): RollupCloseReason {
	switch (code) {
		case 'NO_OP_OPERATION':
			return 'already_done';
		case 'ENTITY_INACTIVE':
			return 'subject_archived';
		case 'ENTITY_NOT_FOUND':
			return 'subject_deleted';
		default:
			return 'no_longer_applies';
	}
}
