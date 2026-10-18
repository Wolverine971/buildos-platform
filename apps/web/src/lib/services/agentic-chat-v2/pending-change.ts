// apps/web/src/lib/services/agentic-chat-v2/pending-change.ts
//
// The "didn't finish from earlier" strip above the chat composer. A failed
// write leaves a commission on the session (`fastchat_pending_turn_contract`),
// and every later turn in the same scope is told it is still owed. This module
// turns that structured commission into the strip's short lines. It reads only
// the commission's structured fields (action, entity kind, target ids, required
// field names), never user or model prose. Client-safe: no server imports.
import type { FastChatPendingTurnContract } from '@buildos/agentic-chat-runtime/loop';

/** What "Finish it" sends: an ordinary visible user message that runs a normal turn. */
export const PENDING_CHANGE_FINISH_MESSAGE = "Finish the changes that didn't go through earlier.";

export type PendingChangeViewV1 = {
	/** Identifies this exact commission, so Dismiss never clears a newer one. */
	key: string;
	createdAt: string;
	/** One line per action and kind, in the commission's order. */
	items: string[];
};

type Outcome = FastChatPendingTurnContract['contract']['outcomes'][number];

const VERBS: Record<string, string> = {
	create: 'Create',
	update: 'Update',
	move: 'Move',
	organize: 'Organize',
	link: 'Link',
	unlink: 'Unlink',
	delete: 'Delete',
	schedule: 'Schedule',
	set: 'Set',
	assign: 'Assign',
	complete: 'Complete',
	archive: 'Archive',
	restore: 'Restore',
	tag: 'Tag'
};

const NOUNS: Record<string, [singular: string, plural: string]> = {
	project: ['project', 'projects'],
	task: ['task', 'tasks'],
	document: ['doc', 'docs'],
	event: ['event', 'events'],
	goal: ['goal', 'goals'],
	plan: ['plan', 'plans'],
	milestone: ['milestone', 'milestones'],
	risk: ['risk', 'risks'],
	relationship: ['link', 'links'],
	calendar: ['calendar event', 'calendar events'],
	entity: ['item', 'items']
};

/** Entity kinds whose titles the session route can look up. */
const LOOKUP_KINDS = new Set([
	'project',
	'task',
	'document',
	'event',
	'goal',
	'plan',
	'milestone',
	'risk'
]);

const MAX_TITLE_CHARS = 40;

export function pendingChangeKey(
	pending: Pick<FastChatPendingTurnContract, 'originatingTurnRunId' | 'createdAt'>
): string {
	return `${pending.originatingTurnRunId ?? 'none'}@${pending.createdAt}`;
}

/**
 * An archive arrives as an update whose required fields include the archive
 * mode (the archive tools set it); show it as the archive the user asked for.
 */
function verbFor(outcome: Outcome): string {
	if (outcome.action === 'update' && outcome.requiredFields.includes('archive_mode')) {
		return VERBS.archive!;
	}
	return VERBS[outcome.action] ?? 'Change';
}

function targetCount(outcome: Outcome): number {
	return outcome.targetIds.length > 0
		? outcome.targetIds.length
		: Math.max(1, outcome.minimumSuccessfulEffects ?? 1);
}

function shortTitle(title: string): string {
	const trimmed = title.trim().replace(/\s+/g, ' ');
	return trimmed.length > MAX_TITLE_CHARS
		? `${trimmed.slice(0, MAX_TITLE_CHARS - 1).trimEnd()}…`
		: trimmed;
}

/** Every target id worth a title lookup, keyed by the lookup's entity kind. */
export function pendingChangeLookupIds(
	pending: FastChatPendingTurnContract
): Map<string, Set<string>> {
	const idsByKind = new Map<string, Set<string>>();
	for (const outcome of pending.contract.outcomes) {
		if (!LOOKUP_KINDS.has(outcome.entityKind)) continue;
		for (const id of outcome.targetIds) {
			const ids = idsByKind.get(outcome.entityKind) ?? new Set<string>();
			ids.add(id);
			idsByKind.set(outcome.entityKind, ids);
		}
	}
	return idsByKind;
}

/**
 * One line per (verb, kind) group: `Update doc "Launch plan"` for a single
 * named target, `Archive 6 docs` otherwise. Null when nothing is owed.
 */
export function buildPendingChangeView(
	pending: FastChatPendingTurnContract | null,
	titleFor: (entityKind: string, id: string) => string | null = () => null
): PendingChangeViewV1 | null {
	if (!pending || pending.contract.outcomes.length === 0) return null;
	const groups = new Map<string, { verb: string; kind: string; ids: string[]; count: number }>();
	for (const outcome of pending.contract.outcomes) {
		const verb = verbFor(outcome);
		const groupKey = `${verb}:${outcome.entityKind}`;
		const group = groups.get(groupKey) ?? {
			verb,
			kind: outcome.entityKind,
			ids: [],
			count: 0
		};
		for (const id of outcome.targetIds) {
			if (!group.ids.includes(id)) group.ids.push(id);
		}
		group.count += outcome.targetIds.length > 0 ? 0 : targetCount(outcome);
		groups.set(groupKey, group);
	}
	const items = [...groups.values()].map((group) => {
		const [singular, plural] = NOUNS[group.kind] ?? ['item', 'items'];
		const count = group.ids.length + group.count;
		const title = count === 1 && group.ids[0] ? titleFor(group.kind, group.ids[0]) : null;
		if (title) return `${group.verb} ${singular} "${shortTitle(title)}"`;
		return `${group.verb} ${count} ${count === 1 ? singular : plural}`;
	});
	return { key: pendingChangeKey(pending), createdAt: pending.createdAt, items };
}
