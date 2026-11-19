// apps/mobile/src/lib/inbox/model.ts
//
// What the phone's inbox shows, from GET /api/inbox: one section per project (Account first,
// then the most recently touched projects), each with its project cleanup list (in the web's
// blocks: Pick a path, Tidy-ups, Out of date, Want me to…?, Done for you) and its other cards.
// Answers waiting in the pile are hidden by id so a card shrinks the moment it's answered.
import {
	cleanupAskSummaryLine,
	groupCleanupByAsk,
	isCleanupItemSelectable,
	type CleanupAskBlocks
} from '@buildos/agentic-chat-client/inbox-cleanup-presentation';
import type { CheckInProject, InboxItem, InboxSourceType } from '@buildos/api-client';
import type { ProjectCleanupItem, ProjectCleanupView } from '@buildos/shared-types';

export type InboxCleanup = {
	item: InboxItem;
	view: ProjectCleanupView;
	blocks: CleanupAskBlocks;
	/** "2 paths to pick · 10 tidy-ups" */
	summary: string;
	/** Tidy-ups that can be applied right now. */
	ready: ProjectCleanupItem[];
	openCount: number;
};

export type InboxSection = {
	key: string;
	projectId: string | null;
	label: string;
	cleanups: InboxCleanup[];
	cards: InboxItem[];
	/** "Did this happen?" / "Still on?" for this project; shown first, as on the web. */
	checkIns: CheckInProject[];
	/** Lines and cards to answer (a cleanup list counts each open line). */
	openCount: number;
};

/** Hidden while an answer waits in the pile or after it saved, until the next load. */
export type InboxHidden = {
	/** Inbox item ids (whole cards). */
	items: ReadonlySet<string>;
	/** Cleanup lineage ids (one line of a cleanup list). */
	cleanupItems: ReadonlySet<string>;
	/** Done-for-you suggestion ids that were undone. */
	autoApplied: ReadonlySet<string>;
};

export const NOTHING_HIDDEN: InboxHidden = {
	items: new Set(),
	cleanupItems: new Set(),
	autoApplied: new Set()
};

/** The kinds the phone answers in place. Anything else gets Talk it through and Snooze. */
export const NATIVE_CARD_KINDS: ReadonlySet<InboxSourceType> = new Set([
	'project_suggestion',
	'calendar_suggestion',
	'agent_run',
	'project_review',
	'project_audit',
	'integration_attention'
]);

function isCleanupView(value: unknown): value is ProjectCleanupView {
	return Boolean(
		value &&
			typeof value === 'object' &&
			Array.isArray((value as ProjectCleanupView).items) &&
			typeof (value as ProjectCleanupView).project_id === 'string'
	);
}

/** The cleanup view with answered lines (and undone done-for-you entries) taken out. */
export function visibleCleanupView(
	view: ProjectCleanupView,
	hidden: InboxHidden
): ProjectCleanupView {
	const items = view.items.filter((item) => !hidden.cleanupItems.has(item.id));
	const autoApplied = (view.auto_applied ?? []).filter(
		(entry) => !hidden.autoApplied.has(entry.suggestion_id)
	);
	return { ...view, items, auto_applied: autoApplied };
}

export function buildCleanup(item: InboxItem, hidden: InboxHidden): InboxCleanup | null {
	if (item.source_type !== 'project_cleanup' || !isCleanupView(item.source_payload)) return null;
	const view = visibleCleanupView(item.source_payload, hidden);
	const blocks = groupCleanupByAsk(view);
	const openCount =
		blocks.paths.length + blocks.tidy.length + blocks.stale.length + blocks.offers.length;
	return {
		item,
		view,
		blocks,
		summary: cleanupAskSummaryLine(blocks),
		ready: blocks.tidy.filter((line) => isCleanupItemSelectable(line)),
		openCount
	};
}

function touchedAt(item: InboxItem): number {
	const value = item.project?.updated_at ?? item.updated_at ?? item.created_at ?? null;
	const time = value ? Date.parse(value) : NaN;
	return Number.isNaN(time) ? 0 : time;
}

export function buildInboxSections(
	items: InboxItem[],
	hidden: InboxHidden = NOTHING_HIDDEN
): InboxSection[] {
	const byKey = new Map<string, InboxSection & { touched: number }>();
	for (const item of items) {
		if (item.status !== 'pending' || hidden.items.has(item.id)) continue;
		const projectId = item.project_id ?? null;
		const key = projectId ?? 'account';
		let section = byKey.get(key);
		if (!section) {
			section = {
				key,
				projectId,
				label: projectId ? item.project?.name?.trim() || 'Project' : 'Account',
				cleanups: [],
				cards: [],
				checkIns: [],
				openCount: 0,
				touched: 0
			};
			byKey.set(key, section);
		}
		section.touched = Math.max(section.touched, touchedAt(item));
		if (item.source_type === 'project_cleanup') {
			const cleanup = buildCleanup(item, hidden);
			// A list with nothing open left (and nothing to undo) leaves the inbox.
			if (cleanup && (cleanup.openCount > 0 || cleanup.blocks.autoApplied.length > 0)) {
				section.cleanups.push(cleanup);
				section.openCount += cleanup.openCount;
			}
			continue;
		}
		section.cards.push(item);
		section.openCount += 1;
	}
	return [...byKey.values()]
		.filter((section) => section.cleanups.length || section.cards.length)
		.sort((a, b) => {
			if (a.projectId === null) return -1;
			if (b.projectId === null) return 1;
			return b.touched - a.touched;
		})
		.map(({ touched: _touched, ...section }) => section);
}

/**
 * Each check-in goes in its project's section, first; a project with only check-ins gets a
 * section of its own after the rest.
 */
export function attachCheckIns(
	sections: InboxSection[],
	checkIns: CheckInProject[]
): InboxSection[] {
	const byProject = new Map(checkIns.map((project) => [project.project_id, project]));
	const merged = sections.map((section) => {
		const own = section.projectId ? byProject.get(section.projectId) : undefined;
		if (!own) return section;
		byProject.delete(own.project_id);
		return { ...section, checkIns: [own], openCount: section.openCount + checkInCount(own) };
	});
	for (const project of byProject.values()) {
		merged.push({
			key: project.project_id,
			projectId: project.project_id,
			label: project.project_name,
			cleanups: [],
			cards: [],
			checkIns: [project],
			openCount: checkInCount(project)
		});
	}
	return merged;
}

function checkInCount(project: CheckInProject): number {
	return project.quiet
		? 1
		: project.groups.reduce((total, group) => total + group.tasks.length, 0);
}

/** Cards, counted the way the server's badge counts them (a cleanup list or check-in is one). */
export function inboxCardCount(sections: InboxSection[], emailUpdates = 0): number {
	return (
		sections.reduce(
			(total, section) =>
				total + section.cleanups.length + section.cards.length + section.checkIns.length,
			0
		) + emailUpdates
	);
}

/** The web's header line: "Inbox is clear" / "1 item needs attention" / "4 items need attention". */
export function inboxSummaryLine(cards: number): string {
	if (cards <= 0) return 'Inbox is clear';
	return `${cards} ${cards === 1 ? 'item needs' : 'items need'} attention`;
}

/** What a simple card offers, in key order (the web's controls per kind). */
export type CardAction = 'approve' | 'dismiss' | 'snooze' | 'talk' | 'reconnect';

export function isFinding(item: InboxItem): boolean {
	const payload = item.source_payload ?? {};
	const kind = typeof payload.kind === 'string' ? payload.kind : null;
	if (kind === 'drift' || kind === 'audit_recommendation') return true;
	const operations = payload.operations ?? payload.proposed_operations;
	return !Array.isArray(operations) || operations.length === 0;
}

export function cardActions(item: InboxItem): CardAction[] {
	if (!item.can_decide) return item.source_type === 'integration_attention' ? ['reconnect'] : [];
	switch (item.source_type) {
		case 'project_suggestion':
			return isFinding(item)
				? ['dismiss', 'talk', 'snooze']
				: ['approve', 'dismiss', 'talk', 'snooze'];
		case 'calendar_suggestion':
			return ['approve', 'dismiss', 'talk', 'snooze'];
		case 'agent_run':
		case 'project_review':
			// The change set or brief needs reading; the chat walks through it.
			return ['talk', 'dismiss', 'snooze'];
		case 'project_audit':
			return ['talk', 'snooze'];
		case 'integration_attention':
			return ['reconnect', 'snooze'];
		default:
			return ['snooze'];
	}
}

export const CARD_ACTION_LABEL: Record<CardAction, string> = {
	approve: 'Approve change',
	dismiss: 'Dismiss',
	snooze: 'Snooze',
	talk: 'Talk it through',
	reconnect: 'Reconnect'
};

export const SOURCE_LABEL: Partial<Record<InboxSourceType, string>> = {
	agent_run: 'Agent proposal',
	project_suggestion: 'Review item',
	project_review: 'Project brief',
	project_audit: 'Project audit',
	calendar_suggestion: 'Calendar suggestion',
	integration_attention: 'Account'
};

/** The card's lead line: why now, or the summary. */
export function cardBody(item: InboxItem): string | null {
	const payload = item.source_payload ?? {};
	const whyNow = typeof payload.why_now === 'string' ? payload.why_now.trim() : '';
	if (whyNow) return `Why now: ${whyNow}`;
	const summary = item.summary?.trim() || '';
	if (summary && summary !== item.title) return summary;
	const rationale = typeof payload.rationale === 'string' ? payload.rationale.trim() : '';
	return rationale || null;
}
