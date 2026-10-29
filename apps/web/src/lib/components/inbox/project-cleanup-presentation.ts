// apps/web/src/lib/components/inbox/project-cleanup-presentation.ts
//
// Pure helpers for the Project cleanup card (tasker 112). Kept out of the component so the
// selection, decision and receipt rules are testable without rendering.
import type {
	InboxAskKind,
	ProjectCleanupAnswer,
	ProjectCleanupAnswerAction,
	ProjectCleanupAsk,
	ProjectCleanupAutoApplied,
	ProjectCleanupClosedItem,
	ProjectCleanupItem,
	ProjectCleanupSection,
	ProjectCleanupSource,
	ProjectCleanupView
} from '@buildos/shared-types';

export type CleanupDecisionAction = 'approve' | 'dismiss' | 'address';

export type CleanupDismissReason =
	| 'not_relevant'
	| 'wrong_evidence'
	| 'intentional'
	| 'too_risky'
	| 'other';

export type CleanupDecision = {
	suggestion_id: string;
	action: CleanupDecisionAction;
	expected_fingerprint?: string | null;
	reason?: CleanupDismissReason;
	note?: string;
};

export type CleanupOutcomeStatus =
	| 'applied'
	| 'failed'
	| 'rejected'
	| 'addressed'
	| 'changed'
	| 'already_decided'
	| 'error';

export type CleanupOutcome = {
	suggestion_id: string;
	ok: boolean;
	status: CleanupOutcomeStatus;
	message?: string;
};

/** What happened to one card item, rolled up from its rows' outcomes. */
export type CleanupItemResult = {
	status: 'applied' | 'rejected' | 'addressed' | 'changed' | 'failed';
	message: string | null;
};

export const CLEANUP_CHANGED_MESSAGE =
	'This item changed since you opened it — review the new version.';

export const CLEANUP_SECTION_LABEL: Record<ProjectCleanupSection, string> = {
	safe_cleanup: 'Ready to apply',
	needs_call: 'Needs your call',
	note: 'Worth knowing'
};

export const CLEANUP_SOURCE_LABEL: Record<ProjectCleanupSource, string> = {
	review: 'Review',
	audit: 'Audit',
	radar: 'Freshness'
};

export const CLEANUP_DISMISS_REASONS: ReadonlyArray<{
	value: CleanupDismissReason;
	label: string;
}> = [
	{ value: 'not_relevant', label: 'Not relevant' },
	{ value: 'wrong_evidence', label: 'Wrong evidence' },
	{ value: 'intentional', label: 'Intentional' },
	{ value: 'too_risky', label: 'Too risky' },
	{ value: 'other', label: 'Other' }
];

export const CLEANUP_ADDRESS_NOTE = 'Handled from the project cleanup list';

/** "3 ready to apply · 2 need your call · 1 worth knowing" */
export function cleanupCountsLine(counts: ProjectCleanupView['counts']): string {
	const parts = [
		counts.safe_cleanup ? `${counts.safe_cleanup} ready to apply` : null,
		counts.needs_call
			? `${counts.needs_call} need${counts.needs_call === 1 ? 's' : ''} your call`
			: null,
		counts.note ? `${counts.note} worth knowing` : null
	].filter(Boolean);
	return parts.length ? parts.join(' · ') : 'Nothing open';
}

/** Only a verified change can be picked: every row re-resolved against the live project. */
export function isCleanupItemSelectable(item: ProjectCleanupItem): boolean {
	return (
		item.executable &&
		item.rows.length > 0 &&
		item.rows.every((row) => Boolean(row.verified_fingerprint))
	);
}

export function formatCleanupDate(value: string | null | undefined): string | null {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function cleanupSeenLine(item: ProjectCleanupItem): string | null {
	if (item.seen_count <= 1) return null;
	const since = formatCleanupDate(item.first_seen_at);
	return since
		? `Seen in ${item.seen_count} reviews since ${since}`
		: `Seen in ${item.seen_count} reviews`;
}

export function cleanupItemCautions(item: ProjectCleanupItem): string[] {
	return [...new Set(item.rows.flatMap((row) => row.cautions ?? []).filter(Boolean))];
}

export function cleanupCloseReasonText(closed: ProjectCleanupClosedItem): string {
	switch (closed.reason) {
		case 'subject_archived':
			return 'archived';
		case 'subject_deleted':
			return 'deleted';
		case 'already_done':
			return 'already done';
		case 'resolved':
			return closed.detail?.trim() || 'resolved';
		case 'merged':
			return 'merged into another item';
		case 'aged_out':
			return 'no longer flagged';
		case 'no_longer_applies':
			return 'no longer applies';
		case 'revised':
			return 'replaced by an updated version';
		default:
			return closed.detail?.trim() || 'closed';
	}
}

/** The view's groups in order, each with its items resolved (missing ids are skipped). */
export function orderedCleanupGroups(view: ProjectCleanupView | null): Array<{
	key: string;
	title: string;
	section: ProjectCleanupSection;
	recommendation: string | null;
	items: ProjectCleanupItem[];
}> {
	if (!view) return [];
	const byId = new Map(view.items.map((item) => [item.id, item]));
	const placed = new Set<string>();
	const groups = view.groups
		.map((group, index) => {
			const items = group.item_ids
				.map((id) => byId.get(id))
				.filter((item): item is ProjectCleanupItem => {
					if (!item || placed.has(item.id)) return false;
					placed.add(item.id);
					return true;
				});
			return {
				key: `${group.section}:${index}:${group.title}`,
				title: group.title,
				section: group.section,
				recommendation: group.recommendation,
				items
			};
		})
		.filter((group) => group.items.length > 0);
	// An item the groups missed still shows, under its own section.
	const loose = view.items.filter((item) => !placed.has(item.id));
	for (const section of ['safe_cleanup', 'needs_call', 'note'] as const) {
		const items = loose.filter((item) => item.section === section);
		if (items.length) {
			groups.push({
				key: `${section}:loose`,
				title: CLEANUP_SECTION_LABEL[section],
				section,
				recommendation: null,
				items
			});
		}
	}
	return groups;
}

/** Approve every row of every picked item against the fingerprint the card showed. */
export function approveDecisionsFor(items: ProjectCleanupItem[]): CleanupDecision[] {
	return items.flatMap((item) =>
		item.rows.map((row) => ({
			suggestion_id: row.suggestion_id,
			action: 'approve' as const,
			expected_fingerprint: row.verified_fingerprint
		}))
	);
}

export function dismissDecisionsFor(
	item: ProjectCleanupItem,
	reason: CleanupDismissReason,
	note?: string | null
): CleanupDecision[] {
	const trimmed = note?.trim();
	return item.rows.map((row) => ({
		suggestion_id: row.suggestion_id,
		action: 'dismiss' as const,
		reason,
		...(trimmed ? { note: trimmed } : {})
	}));
}

export function addressDecisionsFor(item: ProjectCleanupItem): CleanupDecision[] {
	return item.rows.map((row) => ({
		suggestion_id: row.suggestion_id,
		action: 'address' as const,
		note: CLEANUP_ADDRESS_NOTE
	}));
}

/** Roll one item's row outcomes up into what the card says about it. */
export function summarizeCleanupItemOutcome(
	item: ProjectCleanupItem,
	outcomes: CleanupOutcome[]
): CleanupItemResult | null {
	const rowIds = new Set(item.rows.map((row) => row.suggestion_id));
	const mine = outcomes.filter((outcome) => rowIds.has(outcome.suggestion_id));
	if (!mine.length) return null;
	if (mine.some((outcome) => outcome.status === 'changed')) {
		return { status: 'changed', message: CLEANUP_CHANGED_MESSAGE };
	}
	const failure = mine.find(
		(outcome) => outcome.status === 'failed' || outcome.status === 'error'
	);
	if (failure) {
		return { status: 'failed', message: failure.message?.trim() || 'Could not apply this.' };
	}
	const settled = mine.filter((outcome) => outcome.status !== 'already_decided');
	const lead = settled[0]?.status ?? 'applied';
	if (lead === 'rejected') return { status: 'rejected', message: null };
	if (lead === 'addressed') return { status: 'addressed', message: null };
	return { status: 'applied', message: null };
}

export function cleanupResultLabel(result: CleanupItemResult): string {
	switch (result.status) {
		case 'applied':
			return 'Applied';
		case 'rejected':
			return 'Marked not needed';
		case 'addressed':
			return 'Marked done';
		case 'changed':
			return 'Updated — review again';
		case 'failed':
			return 'Could not apply';
	}
}

export type CleanupOperationChange = {
	label: string;
	value: string;
	before?: string;
	textEdit: boolean;
};

export type CleanupOperationView = {
	key: string;
	label: string;
	target: string | null;
	summary: string | null;
	changes: CleanupOperationChange[];
};

function readText(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Normalizes a row's decoded operations (the verifier's summary shape) for display. */
export function cleanupRowOperations(
	operations: Array<Record<string, unknown>> | undefined
): CleanupOperationView[] {
	return (operations ?? []).map((operation, index) => {
		const actionLabel = readText(operation.actionLabel) ?? 'Change';
		const entityLabel = readText(operation.entityLabel);
		const changes = Array.isArray(operation.changes)
			? (operation.changes as unknown[]).flatMap((change): CleanupOperationChange[] => {
					if (!change || typeof change !== 'object') return [];
					const record = change as Record<string, unknown>;
					const label = readText(record.label);
					const value = typeof record.value === 'string' ? record.value : null;
					if (!label || value === null) return [];
					return [
						{
							label,
							value,
							...(typeof record.before === 'string' ? { before: record.before } : {}),
							textEdit: record.format === 'text_edit'
						}
					];
				})
			: [];
		return {
			key: readText(operation.key) ?? `op-${index}`,
			label: entityLabel ? `${actionLabel} ${entityLabel}` : actionLabel,
			target: readText(operation.target),
			summary: readText(operation.summary),
			changes
		};
	});
}

// ---------------------------------------------------------------------------------------------
// Blocks by what each item asks of the user (AI Inbox "Assistant's Desk", tasker 149).
// ---------------------------------------------------------------------------------------------

export type CleanupAskBlockKey = 'path' | 'tidy' | 'stale' | 'offer' | 'done';

export const CLEANUP_ASK_BLOCK: Record<CleanupAskBlockKey, { label: string; hint: string }> = {
	path: { label: 'Pick a path', hint: 'A fork only you can choose' },
	tidy: { label: 'Tidy-ups', hint: 'Safe filing and archiving. Nothing is deleted.' },
	stale: { label: 'Out of date', hint: 'Records that may no longer hold' },
	offer: { label: 'Want me to…?', hint: 'Work the assistant can take on, if you want it' },
	done: { label: 'Done for you', hint: 'Safe changes made without asking. Undo any of them.' }
};

/** What an item asks of the user; older views without `ask_kind` follow the server's rule. */
export function cleanupItemAskKind(item: ProjectCleanupItem): InboxAskKind {
	if (item.ask_kind) return item.ask_kind;
	if (item.source === 'audit') return 'offer';
	if (item.source === 'radar') return 'stale';
	if (item.section === 'safe_cleanup') return 'tidy';
	return item.executable ? 'path' : 'stale';
}

/** One "Pick a path" card: a pre-written question, or one change to make or not. */
export type CleanupAskEntry = {
	key: string;
	ask: ProjectCleanupAsk;
	items: ProjectCleanupItem[];
	/** Built from a single path item no pre-written question covers. */
	fromItem: boolean;
};

export type CleanupAskBlocks = {
	paths: CleanupAskEntry[];
	tidy: ProjectCleanupItem[];
	stale: ProjectCleanupItem[];
	offers: ProjectCleanupItem[];
	autoApplied: ProjectCleanupAutoApplied[];
};

const ANSWER_ACTIONS = new Set<ProjectCleanupAnswerAction>([
	'apply',
	'dismiss',
	'done',
	'note',
	'chat'
]);

export const CLEANUP_KEEP_EFFECT = 'Nothing changes.';

/** The default fork for a change no pre-written question covers. */
export function defaultPathAsk(item: ProjectCleanupItem): ProjectCleanupAsk {
	return {
		id: `item:${item.id}`,
		question: item.title,
		context: item.summary && item.summary !== item.title ? item.summary : null,
		item_ids: [item.id],
		answers: [
			{ label: 'Make this change', effect: null, action: 'apply', recommended: true },
			{
				label: 'Keep as is',
				effect: CLEANUP_KEEP_EFFECT,
				action: 'dismiss',
				recommended: false
			}
		]
	};
}

/**
 * The card's blocks, in the view's group order. Each item shows once: an item a pre-written
 * question covers is answered there, not in its own block.
 */
export function groupCleanupByAsk(view: ProjectCleanupView | null): CleanupAskBlocks {
	const blocks: CleanupAskBlocks = {
		paths: [],
		tidy: [],
		stale: [],
		offers: [],
		autoApplied: view?.auto_applied ?? []
	};
	if (!view) return blocks;
	const ordered = orderedCleanupGroups(view).flatMap((group) => group.items);
	const byId = new Map(ordered.map((item) => [item.id, item]));
	const covered = new Set<string>();

	for (const ask of view.asks ?? []) {
		const items = (ask.item_ids ?? [])
			.map((id) => byId.get(id))
			.filter((item): item is ProjectCleanupItem => Boolean(item && !covered.has(item.id)));
		let recommendedSeen = false;
		const answers = (ask.answers ?? [])
			.filter((answer) => answer?.label?.trim() && ANSWER_ACTIONS.has(answer.action))
			.map((answer) => {
				const recommended = Boolean(answer.recommended) && !recommendedSeen;
				if (recommended) recommendedSeen = true;
				return { ...answer, recommended };
			});
		if (!items.length || answers.length < 2 || !ask.question?.trim()) continue;
		items.forEach((item) => covered.add(item.id));
		blocks.paths.push({
			key: `ask:${ask.id}`,
			ask: { ...ask, item_ids: items.map((item) => item.id), answers },
			items,
			fromItem: false
		});
	}

	for (const item of ordered) {
		if (covered.has(item.id)) continue;
		switch (cleanupItemAskKind(item)) {
			case 'path':
				blocks.paths.push({
					key: `item:${item.id}`,
					ask: defaultPathAsk(item),
					items: [item],
					fromItem: true
				});
				break;
			case 'tidy':
				blocks.tidy.push(item);
				break;
			case 'offer':
				blocks.offers.push(item);
				break;
			default:
				blocks.stale.push(item);
		}
	}
	return blocks;
}

/** Header chips: how much is open in each block. */
export function cleanupAskCounts(
	blocks: CleanupAskBlocks
): Array<{ key: CleanupAskBlockKey; count: number; label: string }> {
	const chips: Array<{ key: CleanupAskBlockKey; count: number; label: string }> = [
		{
			key: 'path',
			count: blocks.paths.length,
			label: blocks.paths.length === 1 ? 'path to pick' : 'paths to pick'
		},
		{
			key: 'tidy',
			count: blocks.tidy.length,
			label: blocks.tidy.length === 1 ? 'tidy-up' : 'tidy-ups'
		},
		{ key: 'stale', count: blocks.stale.length, label: 'out of date' },
		{
			key: 'offer',
			count: blocks.offers.length,
			label: blocks.offers.length === 1 ? 'offer' : 'offers'
		},
		{ key: 'done', count: blocks.autoApplied.length, label: 'done for you' }
	];
	return chips.filter((chip) => chip.count > 0);
}

/** "2 paths to pick · 10 tidy-ups" (only open work; Done for you is not open). */
export function cleanupAskSummaryLine(blocks: CleanupAskBlocks): string {
	const parts = cleanupAskCounts(blocks)
		.filter((chip) => chip.key !== 'done')
		.map((chip) => `${chip.count} ${chip.label}`);
	return parts.length ? parts.join(' · ') : 'Nothing open';
}

/** What the note reader is handed when an answer's action is `note`. */
export function cleanupAnswerNote(question: string, answer: ProjectCleanupAnswer): string {
	const effect = answer.effect?.trim();
	return effect
		? `${question.trim()} — ${answer.label.trim()}: ${effect}`
		: `${question.trim()} — ${answer.label.trim()}`;
}

/** "On hold. Mark the goal on hold with a date." */
export function cleanupAnswerReceipt(answer: ProjectCleanupAnswer): string {
	const label = answer.label.trim();
	// Display punctuation only: avoid "It's over?." when a label already ends a sentence.
	const lead = /[.!?…]$/.test(label) ? label : `${label}.`;
	const effect = answer.effect?.trim();
	return effect ? `${lead} ${effect}` : lead;
}
