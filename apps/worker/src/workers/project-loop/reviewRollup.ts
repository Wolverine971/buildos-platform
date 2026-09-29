// apps/worker/src/workers/project-loop/reviewRollup.ts
//
// Tasker 112: the Project Review roll-up. A finding carries forward across review passes
// instead of rotating out when a pass doesn't re-emit it word for word. Each finding is a
// lineage of project_suggestions rows. A pass re-confirms a row in place, revises it (a new
// row replaces an old one), adds a related row, merges two findings, or closes a finding with
// a recorded reason. Silence is never a close: only evidence (the subject was archived or
// deleted, the change is already done or no longer applies, a model verdict, a user decision)
// or the long age-out backstop ends a finding.
//
// Pure and synchronous. The worker persists the events it returns
// (reviewRollupStore.ts); the offline replay (scripts/project-review-rollup-replay.ts) drives
// it against the stored prod ledger.

import type { LoopOperation, ProjectSuggestionEvidenceRef } from '@buildos/shared-types';

export const REVIEW_ROLLUP_POLICY = Object.freeze({
	/** A finding with no confirmation for this long... */
	ageOutDays: 30,
	/** ...across at least this many passes ages out. Both must hold, so a project reviewed
	 * every two weeks doesn't lose findings to the calendar alone. */
	ageOutMinPasses: 3
});

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RollupCandidate {
	suggestionId: string;
	runId: string;
	kind: string;
	title: string;
	operations: LoopOperation[];
	evidenceRefs: ProjectSuggestionEvidenceRef[];
}

export type RollupCloseReason =
	| 'subject_archived'
	| 'subject_deleted'
	| 'already_done'
	| 'no_longer_applies'
	| 'resolved'
	| 'revised'
	| 'user_applied'
	| 'user_rejected'
	| 'user_addressed'
	| 'merged'
	| 'aged_out';

/** One live project_suggestions row of a finding. */
export interface RollupRow {
	suggestionId: string;
	key: string | null;
	targets: string[];
	executable: boolean;
}

export interface RollupItem {
	lineageId: string;
	kind: string;
	title: string;
	/** The rows that currently carry the finding. */
	rows: RollupRow[];
	/** Every row that has carried it, oldest first. */
	revisionIds: string[];
	/** `type:id` of every record the live changes would touch. */
	targets: string[];
	/** Targets plus every non-project record the finding has cited. */
	subjects: string[];
	/** The stale record: the first target, else the first cited non-project record. */
	primarySubject: string | null;
	firstSeenAt: string;
	lastConfirmedAt: string;
	seenInRuns: string[];
	passesSinceConfirmed: number;
	status: 'open' | 'closed';
	closedAt?: string;
	closedByRunId?: string;
	closeReason?: RollupCloseReason;
	closeDetail?: string;
	mergedInto?: string;
}

export interface RollupSubjectState {
	archived?: boolean;
	deleted?: boolean;
}

export type RollupVerdict =
	| { lineageId: string; verdict: 'still_true'; reason?: string }
	| { lineageId: string; verdict: 'resolved'; reason: string };

export type RollupUserDecision = 'applied' | 'rejected' | 'addressed';

export interface RollupPass {
	runId: string;
	at: string;
	candidates: RollupCandidate[];
	/** Subject state as of this pass; undefined means live. */
	subjectState: (key: string) => RollupSubjectState | undefined;
	/** Document ids above this document in the project's doc tree, nearest first. */
	ancestorsOf?: (documentId: string) => string[];
	/** Structured verdicts from the roll-up model call. A lineage it skips gets no opinion. */
	verdicts?: RollupVerdict[];
	/** Decisions the user made on a suggestion row since the last pass. */
	userDecisions?: ReadonlyMap<string, RollupUserDecision>;
}

export type RollupScopeChange = 'same' | 'wider' | 'narrower' | 'changed';

export type RollupEvent =
	| { type: 'opened'; lineageId: string; suggestionId: string; title: string }
	| {
			/**
			 * A candidate confirmed an open finding. `inPlaceRowId`: it matched a live row, which
			 * is updated with the new wording and the candidate is not inserted. Otherwise the
			 * candidate is inserted into the lineage, replacing `supersededRowIds`.
			 */
			type: 'confirmed';
			lineageId: string;
			suggestionId: string;
			seenCount: number;
			scopeChange: RollupScopeChange;
			inPlaceRowId: string | null;
			supersededRowIds: string[];
	  }
	| { type: 'reconfirmed'; lineageId: string; seenCount: number; reason?: string }
	| {
			type: 'narrowed';
			lineageId: string;
			removed: string[];
			closedRowIds: string[];
			reason: RollupCloseReason;
			detail: string;
	  }
	| {
			type: 'closed';
			lineageId: string;
			reason: RollupCloseReason;
			detail: string;
			rowIds: string[];
			mergedInto?: string;
	  };

const OP_TARGET_ARGS: Record<string, string> = {
	document_id: 'document',
	task_id: 'task',
	goal_id: 'goal',
	milestone_id: 'milestone'
};

function subjectKey(type: string, id: string): string {
	return `${type}:${id}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

/** Records the change would touch. Move destinations are not targets. */
export function findingTargets(operations: LoopOperation[]): string[] {
	const keys = new Set<string>();
	for (const operation of operations) {
		const args = asRecord(operation?.args) ?? {};
		for (const [arg, type] of Object.entries(OP_TARGET_ARGS)) {
			// A task update's goal_id links the task; only the goal tool targets the goal.
			if (arg === 'goal_id' && operation.tool !== 'update_onto_goal') continue;
			if (typeof args[arg] === 'string' && args[arg]) keys.add(subjectKey(type, args[arg]));
		}
		if (operation.tool === 'update_onto_project' && typeof args.project_id === 'string') {
			keys.add(subjectKey('project', args.project_id));
		}
		const other = asRecord(args.props)?.loop_conflict_with_task_id;
		if (typeof other === 'string' && other) keys.add(subjectKey('task', other));
	}
	return [...keys].sort();
}

export function findingSubjects(candidate: Pick<RollupCandidate, 'operations' | 'evidenceRefs'>): {
	targets: string[];
	subjects: string[];
	primarySubject: string | null;
} {
	const targets = findingTargets(candidate.operations);
	const cited: string[] = [];
	for (const ref of candidate.evidenceRefs ?? []) {
		if (!ref || ref.entity_type === 'project' || typeof ref.entity_id !== 'string') continue;
		if (!ref.entity_id) continue;
		cited.push(subjectKey(ref.entity_type, ref.entity_id));
	}
	const subjects = [...new Set([...targets, ...cited])].sort();
	return { targets, subjects, primarySubject: targets[0] ?? cited[0] ?? null };
}

/**
 * Identity of one row: what it would do to which records, or for a finding with no change,
 * which records it cites. Two rows with the same key are the same proposal.
 */
export function rollupRowKey(
	candidate: Pick<RollupCandidate, 'kind' | 'operations' | 'evidenceRefs'>
): string | null {
	const actions = candidate.operations
		.flatMap((operation) =>
			findingTargets([operation]).map(
				(target) => `${operation.tool}>${target}${operationShape(operation)}`
			)
		)
		.sort();
	if (actions.length) return `${candidate.kind}:${[...new Set(actions)].join('|')}`;
	const cited = findingSubjects(candidate).subjects;
	return cited.length ? `${candidate.kind}:ev:${cited.join('|')}` : null;
}

const SHAPE_IGNORED_ARGS = new Set([
	'project_id',
	'document_id',
	'task_id',
	'goal_id',
	'milestone_id',
	'label'
]);

/** Free-text notes the review writes beside a flag; rewording them is not a new change. */
const SHAPE_NOTE_PROPS = new Set(['loop_outdated_reason', 'loop_conflict_reason']);

/** Stable JSON: object keys sorted, so equal values always print the same. */
function stableJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
	const record = asRecord(value);
	if (record) {
		return `{${Object.keys(record)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
			.join(',')}}`;
	}
	return JSON.stringify(value ?? null);
}

/** FNV-1a, 32-bit: a short, stable tag for a value inside a key (not a security hash). */
function valueTag(value: unknown): string {
	let hash = 0x811c9dc5;
	const text = stableJson(value);
	for (let index = 0; index < text.length; index += 1) {
		hash ^= text.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(36);
}

/**
 * What a change does, without its wording: a move's destination, an archive's scope, the
 * values an update sets. Re-wording the same change keeps the same key, so the live row is
 * confirmed in place; a different value (another name, other edits) is a new revision, so a
 * stored operation never changes under the card that shows it.
 */
function operationShape(operation: LoopOperation): string {
	const args = asRecord(operation.args) ?? {};
	if (operation.tool === 'move_document_in_tree')
		return `>${String(args.new_parent_id ?? 'root')}`;
	if (operation.tool === 'archive_onto_document') {
		return `>${String(args.children ?? 'archive_children')}`;
	}
	const fields = Object.keys(args)
		.filter((key) => !SHAPE_IGNORED_ARGS.has(key) && args[key] !== undefined)
		.flatMap((key) => {
			if (key !== 'props') {
				return [
					key === 'state_key'
						? `state_key=${String(args.state_key)}`
						: `${key}=${valueTag(args[key])}`
				];
			}
			const props = asRecord(args.props) ?? {};
			return Object.keys(props).map((prop) =>
				SHAPE_NOTE_PROPS.has(prop)
					? `props.${prop}`
					: `props.${prop}=${valueTag(props[prop])}`
			);
		})
		.sort();
	return fields.length ? `{${fields.join(',')}}` : '';
}

export function rollupRowFor(candidate: RollupCandidate): RollupRow {
	return {
		suggestionId: candidate.suggestionId,
		key: rollupRowKey(candidate),
		targets: findingTargets(candidate.operations),
		executable: candidate.operations.length > 0
	};
}

function overlaps(a: readonly string[], b: readonly string[]): boolean {
	const set = new Set(a);
	return b.some((key) => set.has(key));
}

function documentIds(keys: readonly string[]): string[] {
	return keys.filter((key) => key.startsWith('document:')).map((key) => key.slice(9));
}

/** A folder and a document inside it are one concern at two scopes. */
function nestedDocuments(
	a: readonly string[],
	b: readonly string[],
	ancestorsOf: RollupPass['ancestorsOf']
): boolean {
	if (!ancestorsOf) return false;
	const aDocs = documentIds(a);
	const bDocs = documentIds(b);
	const inside = (children: string[], parents: string[]) =>
		children.some((child) => ancestorsOf(child).some((id) => parents.includes(id)));
	return inside(aDocs, bDocs) || inside(bDocs, aDocs);
}

/**
 * Whether a fresh candidate is the same concern as an open finding, from record ids only
 * (never from the wording). Conservative: when this says no, the roll-up model can still
 * merge the two by id.
 */
export function sameConcern(
	item: Pick<RollupItem, 'kind' | 'targets' | 'subjects' | 'primarySubject'>,
	candidate: {
		kind: string;
		targets: string[];
		subjects: string[];
		primarySubject: string | null;
	},
	ancestorsOf?: RollupPass['ancestorsOf']
): boolean {
	if (item.kind !== candidate.kind) return false;
	if (item.targets.length && candidate.targets.length) {
		// A conflict is a pair; a different pair is a different conflict.
		if (item.kind === 'task_conflict') {
			return item.targets.join('|') === candidate.targets.join('|');
		}
		if (overlaps(item.targets, candidate.targets)) return true;
		return (
			item.kind === 'doc_outdated' &&
			nestedDocuments(item.targets, candidate.targets, ancestorsOf)
		);
	}
	// Findings with no change attached (drift) match on the stale record they name.
	return Boolean(
		(candidate.primarySubject && item.subjects.includes(candidate.primarySubject)) ||
			(item.primarySubject && candidate.subjects.includes(item.primarySubject))
	);
}

function unionTargets(rows: RollupRow[]): string[] {
	return [...new Set(rows.flatMap((row) => row.targets))].sort();
}

function scopeChange(previous: string[], next: string[]): RollupScopeChange {
	const before = new Set(previous);
	const after = new Set(next);
	const added = next.some((key) => !before.has(key));
	const removed = previous.some((key) => !after.has(key));
	if (!added && !removed) return 'same';
	if (added && !removed) return 'wider';
	if (removed && !added) return 'narrower';
	return 'changed';
}

function cloneItems(items: readonly RollupItem[]): RollupItem[] {
	return items.map((item) => ({
		...item,
		rows: item.rows.map((row) => ({ ...row, targets: [...row.targets] })),
		revisionIds: [...item.revisionIds],
		targets: [...item.targets],
		subjects: [...item.subjects],
		seenInRuns: [...item.seenInRuns]
	}));
}

function close(
	item: RollupItem,
	at: { runId: string; at: string },
	reason: RollupCloseReason,
	detail: string,
	events: RollupEvent[],
	mergedInto?: string
): void {
	const rowIds = item.rows.map((row) => row.suggestionId);
	item.status = 'closed';
	item.closedAt = at.at;
	item.closedByRunId = at.runId;
	item.closeReason = reason;
	item.closeDetail = detail;
	if (mergedInto) item.mergedInto = mergedInto;
	events.push({ type: 'closed', lineageId: item.lineageId, reason, detail, rowIds, mergedInto });
}

function goneState(
	keys: string[],
	subjectState: RollupPass['subjectState']
): { live: string[]; archived: string[]; deleted: string[] } {
	const live: string[] = [];
	const archived: string[] = [];
	const deleted: string[] = [];
	for (const key of keys) {
		const state = subjectState(key);
		if (state?.deleted) deleted.push(key);
		else if (state?.archived) archived.push(key);
		else live.push(key);
	}
	return { live, archived, deleted };
}

function absorb(
	keeper: RollupItem,
	other: RollupItem,
	at: { runId: string; at: string },
	events: RollupEvent[]
): void {
	keeper.rows.push(...other.rows);
	keeper.revisionIds.push(...other.revisionIds);
	keeper.subjects = [...new Set([...keeper.subjects, ...other.subjects])].sort();
	keeper.targets = unionTargets(keeper.rows);
	keeper.seenInRuns = [...new Set([...keeper.seenInRuns, ...other.seenInRuns])];
	if (other.firstSeenAt < keeper.firstSeenAt) keeper.firstSeenAt = other.firstSeenAt;
	if (other.lastConfirmedAt > keeper.lastConfirmedAt)
		keeper.lastConfirmedAt = other.lastConfirmedAt;
	keeper.primarySubject ??= other.primarySubject;
	close(other, at, 'merged', `Same concern as ${keeper.lineageId}.`, events, keeper.lineageId);
}

/**
 * The deterministic half of a pass: user decisions, subjects that went away, then this pass's
 * candidates (confirm in place, revise, add a related row, merge, or open). With
 * `judgment: false` it stops there and returns the lineages it confirmed, so the worker can
 * ask the model for verdicts before `applyRollupJudgment` runs the age-out. Without it
 * (the replay's default) verdicts in `pass.verdicts` and the age-out run here too.
 */
export function applyRollupPass(
	previous: readonly RollupItem[],
	pass: RollupPass,
	options: { judgment?: boolean } = {}
): { items: RollupItem[]; events: RollupEvent[]; confirmed: Set<string> } {
	const items = cloneItems(previous);
	const events: RollupEvent[] = [];
	const open = () => items.filter((item) => item.status === 'open');

	for (const item of open()) {
		const decision = item.rows
			.map((row) => pass.userDecisions?.get(row.suggestionId))
			.find(Boolean);
		if (decision) close(item, pass, `user_${decision}`, `The user ${decision} it.`, events);
	}

	for (const item of open()) {
		// A finding with no change attached is about how its records relate, so losing one of
		// them doesn't settle it; only losing all of them does.
		const scope = item.targets.length ? item.targets : item.subjects;
		if (!scope.length) continue;
		const { live, archived, deleted } = goneState(scope, pass.subjectState);
		if (!live.length) {
			const reason = archived.length ? 'subject_archived' : 'subject_deleted';
			close(
				item,
				pass,
				reason,
				`${[...archived, ...deleted].join(', ')} ${archived.length ? 'archived' : 'deleted'}.`,
				events
			);
		} else if (item.targets.length && live.length < item.targets.length) {
			const removed = [...archived, ...deleted];
			const closedRowIds = item.rows
				.filter(
					(row) => row.targets.length && row.targets.every((key) => removed.includes(key))
				)
				.map((row) => row.suggestionId);
			item.rows = item.rows.filter((row) => !closedRowIds.includes(row.suggestionId));
			item.targets = unionTargets(item.rows).filter((key) => !removed.includes(key));
			item.subjects = item.subjects.filter((key) => !removed.includes(key));
			events.push({
				type: 'narrowed',
				lineageId: item.lineageId,
				removed,
				closedRowIds,
				reason: archived.length ? 'subject_archived' : 'subject_deleted',
				detail: `${removed.join(', ')} ${archived.length ? 'archived' : 'deleted'}.`
			});
		}
	}

	const confirmed = new Set<string>();
	for (const candidate of pass.candidates) {
		const shape = { kind: candidate.kind, ...findingSubjects(candidate) };
		const matches = open()
			.filter((item) => sameConcern(item, shape, pass.ancestorsOf))
			.sort((a, b) => a.firstSeenAt.localeCompare(b.firstSeenAt));
		const row = rollupRowFor(candidate);
		if (!matches.length) {
			items.push({
				lineageId: candidate.suggestionId,
				kind: candidate.kind,
				title: candidate.title,
				rows: [row],
				revisionIds: [candidate.suggestionId],
				targets: row.targets,
				subjects: shape.subjects,
				primarySubject: shape.primarySubject,
				firstSeenAt: pass.at,
				lastConfirmedAt: pass.at,
				seenInRuns: [pass.runId],
				passesSinceConfirmed: 0,
				status: 'open'
			});
			confirmed.add(candidate.suggestionId);
			events.push({
				type: 'opened',
				lineageId: candidate.suggestionId,
				suggestionId: candidate.suggestionId,
				title: candidate.title
			});
			continue;
		}

		const [keeper, ...others] = matches;
		for (const other of others) absorb(keeper, other, pass, events);

		const previousTargets = keeper.targets;
		const same = row.key ? keeper.rows.find((existing) => existing.key === row.key) : undefined;
		let supersededRowIds: string[] = [];
		if (same) {
			same.targets = row.targets;
		} else {
			// A newer proposal for the same records replaces the older one; a finding with
			// no change replaces the older observation. Anything else adds to the finding.
			supersededRowIds = keeper.rows
				.filter((existing) =>
					row.executable
						? existing.executable && overlaps(existing.targets, row.targets)
						: !existing.executable
				)
				.map((existing) => existing.suggestionId);
			keeper.rows = [
				...keeper.rows.filter(
					(existing) => !supersededRowIds.includes(existing.suggestionId)
				),
				row
			];
			keeper.revisionIds.push(candidate.suggestionId);
		}
		keeper.targets = unionTargets(keeper.rows);
		keeper.subjects = [...new Set([...keeper.subjects, ...shape.subjects])].sort();
		keeper.title = candidate.title;
		keeper.lastConfirmedAt = pass.at;
		keeper.passesSinceConfirmed = 0;
		if (!keeper.seenInRuns.includes(pass.runId)) keeper.seenInRuns.push(pass.runId);
		confirmed.add(keeper.lineageId);
		events.push({
			type: 'confirmed',
			lineageId: keeper.lineageId,
			suggestionId: candidate.suggestionId,
			seenCount: keeper.seenInRuns.length,
			scopeChange: scopeChange(previousTargets, keeper.targets),
			inPlaceRowId: same?.suggestionId ?? null,
			supersededRowIds
		});
	}

	if (options.judgment === false) return { items, events, confirmed };
	const judged = applyRollupJudgment(items, {
		runId: pass.runId,
		at: pass.at,
		verdicts: pass.verdicts ?? [],
		confirmed
	});
	return { items: judged.items, events: [...events, ...judged.events], confirmed };
}

/**
 * The judged half of a pass: merges and verdicts from the roll-up model, then the age-out
 * backstop for findings nothing confirmed this pass.
 */
export function applyRollupJudgment(
	previous: readonly RollupItem[],
	judgment: {
		runId: string;
		at: string;
		verdicts: RollupVerdict[];
		merges?: Array<{ lineageId: string; into: string }>;
		confirmed: ReadonlySet<string>;
	}
): { items: RollupItem[]; events: RollupEvent[] } {
	const items = cloneItems(previous);
	const events: RollupEvent[] = [];
	const openById = (id: string) =>
		items.find((item) => item.lineageId === id && item.status === 'open');
	const confirmed = new Set(judgment.confirmed);

	for (const merge of judgment.merges ?? []) {
		const keeper = openById(merge.into);
		const other = openById(merge.lineageId);
		if (!keeper || !other || keeper === other) continue;
		// The older finding keeps the lineage, whichever way the model phrased it.
		const [older, newer] =
			other.firstSeenAt < keeper.firstSeenAt ? [other, keeper] : [keeper, other];
		absorb(older, newer, judgment, events);
		if (confirmed.has(newer.lineageId)) confirmed.add(older.lineageId);
	}

	for (const verdict of judgment.verdicts) {
		const item = openById(verdict.lineageId);
		if (!item) continue;
		if (verdict.verdict === 'resolved') {
			close(item, judgment, 'resolved', verdict.reason, events);
			continue;
		}
		if (confirmed.has(item.lineageId)) continue;
		item.lastConfirmedAt = judgment.at;
		item.passesSinceConfirmed = 0;
		if (!item.seenInRuns.includes(judgment.runId)) item.seenInRuns.push(judgment.runId);
		confirmed.add(item.lineageId);
		events.push({
			type: 'reconfirmed',
			lineageId: item.lineageId,
			seenCount: item.seenInRuns.length,
			...(verdict.reason ? { reason: verdict.reason } : {})
		});
	}

	const nowMs = Date.parse(judgment.at);
	for (const item of items.filter((candidate) => candidate.status === 'open')) {
		if (confirmed.has(item.lineageId)) continue;
		item.passesSinceConfirmed += 1;
		const quietDays = (nowMs - Date.parse(item.lastConfirmedAt)) / DAY_MS;
		if (
			quietDays >= REVIEW_ROLLUP_POLICY.ageOutDays &&
			item.passesSinceConfirmed >= REVIEW_ROLLUP_POLICY.ageOutMinPasses
		) {
			close(
				item,
				judgment,
				'aged_out',
				`Not confirmed in ${item.passesSinceConfirmed} passes over ${Math.floor(quietDays)} days.`,
				events
			);
		}
	}

	return { items, events };
}

/**
 * Close individual rows whose change no longer applies (the integrity check's verdict). A
 * finding left with no rows closes with the first row's reason.
 */
export function closeRollupRows(
	previous: readonly RollupItem[],
	at: { runId: string; at: string },
	closes: ReadonlyMap<string, { reason: RollupCloseReason; detail: string }>
): { items: RollupItem[]; events: RollupEvent[] } {
	const items = cloneItems(previous);
	const events: RollupEvent[] = [];
	for (const item of items) {
		if (item.status !== 'open') continue;
		const closing = item.rows.filter((row) => closes.has(row.suggestionId));
		if (!closing.length) continue;
		if (closing.length === item.rows.length) {
			const first = closes.get(closing[0].suggestionId)!;
			close(item, at, first.reason, first.detail, events);
			continue;
		}
		item.rows = item.rows.filter((row) => !closes.has(row.suggestionId));
		item.targets = unionTargets(item.rows);
		const first = closes.get(closing[0].suggestionId)!;
		events.push({
			type: 'narrowed',
			lineageId: item.lineageId,
			removed: [],
			closedRowIds: closing.map((row) => row.suggestionId),
			reason: first.reason,
			detail: first.detail
		});
	}
	return { items, events };
}
