// apps/web/src/lib/components/inbox/inbox-activity.ts
//
// "What happened / what's suggested" for the AI Inbox (tasker 156): a bottom-line-up-front
// summary of the last week's reviews, then every item grouped by project, each one a line
// that opens into its trail (records, changes, the check, a timeline). Pure: built from the
// stored suggestion rows and review runs. An item's state comes from its status and result
// fields, never from its wording.

import { buildEntityHref, type RecordLinkKind } from '@buildos/shared-types';
import {
	buildAppliedCheck,
	buildHeldCheck,
	buildTrailRecords,
	type TrailCheck,
	type TrailRecord
} from './inbox-item-trail';

export const INBOX_ACTIVITY_DAYS = 7;
/** A waiting suggestion no review has touched for this long is left out. */
export const INBOX_WAITING_DAYS = 30;

/** A project_suggestions row as GET /api/inbox/activity returns it. */
export type ActivitySuggestionRow = {
	id: string;
	project_id: string;
	project_name: string | null;
	/** The finding this row belongs to; several rows can make up one inbox item. */
	lineage_id?: string | null;
	kind: string;
	status: string;
	title: string;
	rationale: string | null;
	why_now: string | null;
	evidence_refs: unknown;
	preview: unknown;
	operations: unknown;
	result: unknown;
	user_feedback: unknown;
	rollup: unknown;
	created_at: string;
	decided_at: string | null;
	applied_at: string | null;
	updated_at: string;
};

export type ActivityRunRow = {
	id: string;
	project_id: string;
	project_name: string | null;
	trigger_reason: string | null;
	status: string | null;
	suggestion_count: number | null;
	cost_usd: number | null;
	created_at: string;
};

/** An email_project_updates row ("From your email"). */
export type ActivityEmailRow = {
	id: string;
	project_id: string;
	project_name: string | null;
	action: 'create_task' | 'update_task';
	task_id: string | null;
	title: string;
	why: string | null;
	proposal: { title?: string; due_date?: string; state_key?: string } | null;
	status: string;
	subject: string | null;
	from: string | null;
	created_at: string;
	decided_at: string | null;
};

/** A project log row for a task or project the user changed themselves. */
export type ActivityLogRow = {
	id: string;
	project_id: string;
	project_name: string | null;
	entity_type: 'task' | 'project';
	entity_id: string;
	action: string;
	before: Record<string, unknown> | null;
	after: Record<string, unknown> | null;
	created_at: string;
};

export type ActivityPayload = {
	since: string;
	suggestions: ActivitySuggestionRow[];
	runs: ActivityRunRow[];
	emails?: ActivityEmailRow[];
	/** Newest first. Only the user's own direct changes (not chat or agents). */
	logs?: ActivityLogRow[];
};

export type ActivityState =
	| 'waiting'
	| 'applied_for_you'
	| 'undone'
	| 'you_applied'
	| 'you_handled'
	| 'you_dismissed'
	| 'you_settled'
	| 'closed'
	| 'in_progress'
	| 'failed';

/** One change, as a line; with the record's link and before → after rows when known. */
export type ActivityChange = {
	text: string;
	href: string | null;
	rows: Array<{ label: string; before: string | null; after: string }>;
};

export type ActivityStep = { key: string; label: string; at: string | null; detail: string | null };

export type ActivityEntry = {
	id: string;
	headline: string;
	state: ActivityState;
	/** "Applied for you", "You said not needed", "Waiting on you". */
	stateLabel: string;
	tone: 'done' | 'ask' | 'quiet' | 'warn';
	/** When its latest event happened. */
	at: string;
	source: string;
	summary: string | null;
	whyNow: string | null;
	records: TrailRecord[];
	/** What it changed or would change. */
	changes: ActivityChange[];
	check: TrailCheck | null;
	steps: ActivityStep[];
};

export type ActivityProject = {
	id: string;
	name: string;
	/** "1 applied for you · 2 you answered". */
	bluf: string;
	entries: ActivityEntry[];
};

export type InboxActivity = {
	/** The bottom line, one or two sentences. */
	bluf: string[];
	lastReview: { at: string; projects: number; suggested: number; appliedForYou: number } | null;
	happened: ActivityProject[];
	suggested: ActivityProject[];
	counts: { happened: number; suggested: number; reviews: number; costUsd: number };
};

const STATE_COPY: Record<ActivityState, { label: string; tone: ActivityEntry['tone'] }> = {
	waiting: { label: 'Waiting on you', tone: 'ask' },
	applied_for_you: { label: 'Applied for you', tone: 'done' },
	undone: { label: 'You undid it', tone: 'quiet' },
	you_applied: { label: 'You applied it', tone: 'done' },
	you_handled: { label: 'You marked it handled', tone: 'done' },
	you_dismissed: { label: 'You said not needed', tone: 'quiet' },
	you_settled: { label: 'You settled it', tone: 'done' },
	closed: { label: 'Closed by a later review', tone: 'quiet' },
	in_progress: { label: 'In progress', tone: 'quiet' },
	failed: { label: "Didn't apply", tone: 'warn' }
};

const CLOSE_REASONS: Record<string, string> = {
	subject_archived: 'The record was archived',
	subject_deleted: 'The record was deleted',
	already_done: 'It was already done',
	no_longer_applies: 'It no longer applies',
	resolved: 'It was resolved',
	revised: 'A newer version replaced it',
	merged: 'Merged into another item',
	aged_out: 'No longer flagged'
};

const LINK_KINDS: ReadonlySet<string> = new Set([
	'project',
	'task',
	'document',
	'goal',
	'milestone',
	'plan',
	'risk'
]);

/** Reviews this close together are one night's pass. */
const SAME_PASS_MS = 3 * 3_600_000;

function record(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function text(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function list(value: unknown): Array<Record<string, unknown>> {
	return Array.isArray(value)
		? value.flatMap((entry) => {
				const item = record(entry);
				return item ? [item] : [];
			})
		: [];
}

function sourceLabel(kind: string): string {
	if (kind === 'audit_recommendation') return 'Project audit';
	if (kind === 'freshness_update') return 'From your recent chats';
	return 'Project review';
}

function stateOf(row: ActivitySuggestionRow): ActivityState {
	const result = record(row.result);
	const feedback = record(row.user_feedback);
	switch (row.status) {
		case 'pending':
			return 'waiting';
		case 'applied':
			return result?.applied_via === 'auto' ? 'applied_for_you' : 'you_applied';
		case 'addressed':
			return 'you_handled';
		case 'rejected':
			return feedback?.reason === 'undone_auto_apply' ? 'undone' : 'you_dismissed';
		case 'superseded':
			return 'closed';
		case 'failed':
			return 'failed';
		default:
			return 'in_progress';
	}
}

function plural(count: number, one: string, many = `${one}s`): string {
	return `${count} ${count === 1 ? one : many}`;
}

function entryFrom(row: ActivitySuggestionRow): ActivityEntry {
	const state = stateOf(row);
	const result = record(row.result);
	const feedback = record(row.user_feedback);
	const rollup = record(row.rollup);
	const preview = record(row.preview);
	const autoApply = record(result?.auto_apply);
	const close = record(rollup?.close);
	const heldCheck = record(rollup?.auto_check);
	const source = sourceLabel(row.kind);

	// An applied change has a receipt of what was written; otherwise each step's label.
	const receipt = list(result?.receipt);
	const changes: ActivityChange[] = receipt.length
		? receipt.map((step) => {
				const entity = record(step.entity);
				const kind = text(entity?.kind);
				const id = text(entity?.id);
				const target = text(step.target);
				const action = text(step.action_label) ?? 'Change';
				return {
					text: target ? `${action} · ${target}` : action,
					href:
						kind && id && LINK_KINDS.has(kind)
							? buildEntityHref(
									kind as RecordLinkKind,
									id,
									kind === 'project' ? id : row.project_id
								)
							: null,
					rows: list(step.changes).flatMap((change) => {
						const label = text(change.label);
						const after = text(change.value);
						return label && after
							? [{ label, before: text(change.before), after }]
							: [];
					})
				};
			})
		: list(row.operations).flatMap((operation) => {
				const label = text(operation.label);
				return label ? [{ text: label, href: null, rows: [] }] : [];
			});
	if (!changes.length && list(row.operations).length) {
		const summary = text(preview?.summary);
		if (summary) changes.push({ text: summary, href: null, rows: [] });
	}

	let check: TrailCheck | null = null;
	if (state === 'applied_for_you' || state === 'undone') {
		check = buildAppliedCheck(autoApply?.scores as never, (autoApply?.bar as never) ?? null);
	} else if (state === 'waiting' && heldCheck?.scores && heldCheck?.bar) {
		check = buildHeldCheck(heldCheck as never);
	}

	const firstSeen = text(rollup?.first_seen_at) ?? row.created_at;
	const lastConfirmed = text(rollup?.last_confirmed_at);
	const seenRuns = Array.isArray(rollup?.seen_run_ids) ? rollup.seen_run_ids.length : 0;
	const steps: ActivityStep[] = [
		{ key: 'seen', label: `${source} raised it`, at: firstSeen, detail: null }
	];
	if (lastConfirmed && lastConfirmed !== firstSeen) {
		steps.push({
			key: 'confirmed',
			label: 'A later review confirmed it',
			at: lastConfirmed,
			detail: seenRuns > 1 ? `Seen in ${seenRuns} reviews` : null
		});
	}
	if (check && state === 'waiting') {
		steps.push({
			key: 'check',
			label: 'Checked whether to apply it without asking',
			at: text(heldCheck?.at),
			detail: check.verdict
		});
	}
	const decidedAt = row.applied_at ?? row.decided_at;
	if (state === 'applied_for_you' || state === 'undone') {
		steps.push({
			key: 'auto',
			label: 'Applied for you',
			at: row.applied_at ?? row.decided_at,
			detail: text(autoApply?.reason)
		});
	}
	if (state === 'undone') {
		steps.push({
			key: 'undone',
			label: 'You undid it',
			at: text(result?.undone_at) ?? row.decided_at,
			detail: null
		});
	} else if (state === 'closed') {
		const reason = text(close?.reason);
		steps.push({
			key: 'closed',
			label: 'Closed by a later review',
			at: text(close?.at) ?? row.updated_at,
			detail: text(close?.detail) ?? (reason ? (CLOSE_REASONS[reason] ?? null) : null)
		});
	} else if (state === 'failed') {
		const error = list(result?.errors)
			.map((entry) => text(entry.error))
			.find(Boolean);
		steps.push({ key: 'failed', label: "Didn't apply", at: decidedAt, detail: error ?? null });
	} else if (state === 'you_applied' || state === 'you_handled' || state === 'you_dismissed') {
		steps.push({
			key: 'answer',
			label: STATE_COPY[state].label,
			at: decidedAt,
			detail: text(feedback?.note)
		});
	}
	const last = steps[steps.length - 1];

	return {
		id: row.id,
		headline: text(result?.headline) ?? row.title,
		state,
		stateLabel: STATE_COPY[state].label,
		tone: STATE_COPY[state].tone,
		at: state === 'waiting' ? row.updated_at : (last?.at ?? row.updated_at),
		source,
		summary: text(rollup?.summary) ?? text(row.rationale),
		whyNow: text(row.why_now),
		records: buildTrailRecords(
			list(row.evidence_refs) as never,
			list(preview?.review_items) as never,
			row.project_id
		).slice(0, 8),
		changes,
		check,
		steps
	};
}

type Placed = { projectId: string; projectName: string | null; entry: ActivityEntry };

function placed(row: ActivitySuggestionRow): Placed {
	return { projectId: row.project_id, projectName: row.project_name, entry: entryFrom(row) };
}

function byProject(items: Placed[], bluf: (entries: ActivityEntry[]) => string): ActivityProject[] {
	const groups = new Map<string, { name: string; entries: ActivityEntry[] }>();
	for (const item of items) {
		const group = groups.get(item.projectId) ?? {
			name: item.projectName ?? 'Project',
			entries: []
		};
		group.entries.push(item.entry);
		groups.set(item.projectId, group);
	}
	return [...groups.entries()]
		.map(([id, group]) => {
			const entries = group.entries.sort((a, b) => b.at.localeCompare(a.at));
			return { id, name: group.name, bluf: bluf(entries), entries };
		})
		.sort((a, b) => (b.entries[0]?.at ?? '').localeCompare(a.entries[0]?.at ?? ''));
}

const ANSWERED: readonly ActivityState[] = [
	'you_applied',
	'you_handled',
	'you_dismissed',
	'you_settled',
	'undone'
];

// Display only: a status key as words ("in_progress" → "In progress").
function stateWords(stateKey: unknown): string | null {
	const words = (text(stateKey) ?? '').replaceAll('_', ' ').trim();
	if (!words) return null;
	if (words === 'todo') return 'To do';
	return words.charAt(0).toUpperCase() + words.slice(1);
}

// A civil date ("2026-11-13") or a timestamp, as "Nov 13". Civil dates stay on their day.
function dayWords(value: unknown): string | null {
	const raw = text(value);
	if (!raw) return null;
	const civil = raw.length === 10;
	const date = new Date(civil ? `${raw}T12:00:00Z` : raw);
	if (Number.isNaN(date.getTime())) return null;
	return date.toLocaleDateString(undefined, {
		month: 'short',
		day: 'numeric',
		...(civil ? { timeZone: 'UTC' } : {})
	});
}

function senderName(from: string | null): string | null {
	if (!from) return null;
	// "Jane Doe <jane@acme.com>" → "Jane Doe" (a header format, not language).
	const name = from.split('<')[0]?.trim().replace(/^"|"$/g, '');
	return name || from;
}

/** A "From your email" card: waiting, applied, set aside, or expired unanswered. */
function emailEntry(row: ActivityEmailRow): Placed | null {
	const states: Record<string, { state: ActivityState; label?: string }> = {
		pending: { state: 'waiting' },
		applied: { state: 'you_applied' },
		dismissed: { state: 'you_dismissed', label: 'You said not now' },
		expired: { state: 'closed', label: 'Expired unanswered' },
		failed: { state: 'failed' }
	};
	const known = states[row.status];
	if (!known) return null;
	const proposal = row.proposal ?? {};
	const rows: ActivityChange['rows'] = [];
	const due = dayWords(proposal.due_date);
	if (due) rows.push({ label: 'Due', before: null, after: due });
	const status = stateWords(proposal.state_key);
	if (status) rows.push({ label: 'Status', before: null, after: status });
	const taskHref = row.task_id ? buildEntityHref('task', row.task_id, row.project_id) : null;
	const sender = senderName(row.from);
	const steps: ActivityStep[] = [
		{
			key: 'seen',
			label: 'Found in your email',
			at: row.created_at,
			detail:
				[sender, row.subject ? `“${row.subject}”` : null].filter(Boolean).join(': ') || null
		}
	];
	if (known.state !== 'waiting') {
		steps.push({
			key: 'answer',
			label: known.label ?? STATE_COPY[known.state].label,
			at: row.decided_at,
			detail: null
		});
	}
	return {
		projectId: row.project_id,
		projectName: row.project_name,
		entry: {
			id: `email:${row.id}`,
			headline: row.title,
			state: known.state,
			stateLabel: known.label ?? STATE_COPY[known.state].label,
			tone: STATE_COPY[known.state].tone,
			at: row.decided_at ?? row.created_at,
			source: 'From your email',
			summary: row.why,
			whyNow: null,
			records: [],
			changes: [
				{
					text: row.action === 'create_task' ? 'New task' : 'Update task',
					href: taskHref,
					rows
				}
			],
			check: null,
			steps
		}
	};
}

/**
 * Overdue tasks the user settled themselves, and projects they paused or finished: what the
 * inbox's "Did this happen?" and "Still on?" cards ask for. Read from each record's latest
 * project log row, by its before and after fields. A change that was later put back (the
 * latest row matches no rule) is left out.
 */
function settledEntries(logs: ActivityLogRow[]): Placed[] {
	const latest = new Map<string, ActivityLogRow>();
	for (const log of [...logs].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
		const key = `${log.entity_type}:${log.entity_id}`;
		if (!latest.has(key)) latest.set(key, log);
	}
	const out: Placed[] = [];
	for (const log of latest.values()) {
		const before = log.before ?? {};
		const after = log.after ?? {};
		let label: string | null = null;
		let rows: ActivityChange['rows'] = [];
		let headline: string | null = null;
		let wasDue: string | null = null;

		if (log.entity_type === 'project') {
			const next = text(after.state_key);
			if (next === text(before.state_key)) continue;
			if (next === 'paused') label = 'You paused the project';
			else if (next === 'completed') label = 'You marked the project finished';
			else continue;
			headline = log.project_name ?? 'Project';
			rows = [
				{ label: 'Status', before: stateWords(before.state_key), after: stateWords(next)! }
			];
		} else {
			const due = text(before.due_at);
			const dueMs = due ? Date.parse(due) : Number.NaN;
			const overdue = dueMs < Date.parse(log.created_at) && before.state_key !== 'done';
			if (!overdue) continue;
			wasDue = dayWords(due);
			const nextDue = text(after.due_at);
			if (log.action === 'deleted' || text(after.archived_at)) {
				label = 'You dropped it';
				rows = [
					{ label: 'Status', before: stateWords(before.state_key), after: 'Archived' }
				];
			} else if (after.state_key === 'done') {
				label = 'You marked it done';
				rows = [{ label: 'Status', before: stateWords(before.state_key), after: 'Done' }];
			} else if (nextDue && Date.parse(nextDue) > dueMs) {
				label = 'You moved it';
				rows = [{ label: 'Due', before: wasDue, after: dayWords(nextDue) ?? nextDue }];
			} else continue;
			headline = text(before.title) ?? text(after.title) ?? 'Task';
		}

		out.push({
			projectId: log.project_id,
			projectName: log.project_name,
			entry: {
				id: `log:${log.id}`,
				headline,
				state: 'you_settled',
				stateLabel: label,
				tone: 'done',
				at: log.created_at,
				source:
					log.entity_type === 'project' ? 'Overdue work, gone quiet' : 'Past its date',
				summary: null,
				whyNow: null,
				records: [],
				changes: [
					{
						text: log.entity_type === 'project' ? 'Project' : 'Task',
						href: buildEntityHref(log.entity_type, log.entity_id, log.project_id),
						rows
					}
				],
				check: null,
				steps: [
					...(wasDue
						? [{ key: 'due', label: `Was due ${wasDue}`, at: null, detail: null }]
						: []),
					{ key: 'answer', label, at: log.created_at, detail: null }
				]
			}
		});
	}
	return out;
}

/**
 * One waiting item per finding, as the inbox card shows it: the newest row leads and carries
 * every row's changes.
 */
function mergeLineages(rows: ActivitySuggestionRow[]): ActivitySuggestionRow[] {
	const byKey = new Map<string, ActivitySuggestionRow[]>();
	for (const row of rows) {
		const key = row.lineage_id ? `${row.project_id}:${row.lineage_id}` : row.id;
		byKey.set(key, [...(byKey.get(key) ?? []), row]);
	}
	return [...byKey.values()].map((group) => {
		const ordered = [...group].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
		const lead = ordered[0]!;
		if (ordered.length === 1) return lead;
		return {
			...lead,
			operations: ordered.flatMap((row) => list(row.operations)),
			evidence_refs: ordered.flatMap((row) => list(row.evidence_refs))
		};
	});
}

function happenedBluf(entries: ActivityEntry[]): string {
	const count = (states: ActivityState[]) =>
		entries.filter((entry) => states.includes(entry.state)).length;
	const parts = [
		[count(['applied_for_you']), 'applied for you'],
		[count([...ANSWERED]), 'you answered'],
		[count(['closed']), 'closed on their own'],
		[count(['failed']), "didn't apply"]
	] as const;
	return parts
		.filter(([n]) => n > 0)
		.map(([n, label]) => `${n} ${label}`)
		.join(' · ');
}

export function buildInboxActivity(payload: ActivityPayload): InboxActivity {
	const waiting = mergeLineages(payload.suggestions.filter((row) => row.status === 'pending'));
	const settled = payload.suggestions.filter(
		(row) => row.status !== 'pending' && stateOf(row) !== 'in_progress'
	);
	const emails = (payload.emails ?? []).flatMap((row) => {
		const item = emailEntry(row);
		return item ? [item] : [];
	});
	const happened = byProject(
		[
			...settled.map(placed),
			...emails.filter((item) => item.entry.state !== 'waiting'),
			...settledEntries(payload.logs ?? [])
		],
		happenedBluf
	);
	const waitingItems = [
		...waiting.map(placed),
		...emails.filter((item) => item.entry.state === 'waiting')
	];
	const suggested = byProject(waitingItems, (entries) => plural(entries.length, 'suggestion'));

	const runs = [...payload.runs].sort((a, b) => b.created_at.localeCompare(a.created_at));
	const newest = runs[0];
	const pass = newest
		? runs.filter(
				(run) => Date.parse(newest.created_at) - Date.parse(run.created_at) <= SAME_PASS_MS
			)
		: [];
	const passIds = new Set(pass.map((run) => run.id));
	const lastReview = newest
		? {
				at: newest.created_at,
				projects: new Set(pass.map((run) => run.project_id)).size,
				suggested: pass.reduce((sum, run) => sum + (run.suggestion_count ?? 0), 0),
				appliedForYou: payload.suggestions.filter((row) => {
					const autoApply = record(record(row.result)?.auto_apply);
					return (
						stateOf(row) === 'applied_for_you' &&
						passIds.has(text(autoApply?.run_id) ?? '')
					);
				}).length
			}
		: null;

	const all = happened.flatMap((project) => project.entries);
	const forYou = all.filter((entry) => entry.state === 'applied_for_you').length;
	const answered = all.filter((entry) => ANSWERED.includes(entry.state)).length;
	const closed = all.filter((entry) => entry.state === 'closed').length;
	const did = [
		forYou ? `${plural(forYou, 'change')} made for you` : null,
		answered ? `you answered ${answered}` : null,
		closed ? `${closed} closed on their own` : null
	].filter(Boolean);
	const bluf = [
		did.length
			? `In the last ${INBOX_ACTIVITY_DAYS} days: ${did.join(', ')}.`
			: `Nothing changed in the last ${INBOX_ACTIVITY_DAYS} days.`,
		waitingItems.length
			? `${plural(waitingItems.length, 'suggestion')} waiting on you across ${plural(suggested.length, 'project')}.`
			: 'Nothing is waiting on you.'
	];

	return {
		bluf,
		lastReview,
		happened,
		suggested,
		counts: {
			happened: all.length,
			suggested: waitingItems.length,
			reviews: runs.length,
			costUsd: runs.reduce((sum, run) => sum + (run.cost_usd ?? 0), 0)
		}
	};
}
