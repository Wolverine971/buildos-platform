// apps/web/src/lib/components/inbox/cleanup-triage.ts
//
// Pure rules for AI Inbox triage mode: one cleanup item at a time across every project's
// Project cleanup card. Ready-to-apply changes come first as one batch step, then the
// calls, then the notes. Kept out of the component so the order, verdicts and batching
// are testable without rendering.
import type { ProjectCleanupItem, ProjectCleanupView } from '@buildos/shared-types';
import {
	addressDecisionsFor,
	approveDecisionsFor,
	dismissDecisionsFor,
	isCleanupItemSelectable,
	type CleanupDecision
} from './project-cleanup-presentation';

export type TriageProject = {
	projectId: string;
	projectName: string;
	inboxItemId: string;
	view: ProjectCleanupView;
};

export type TriageStep =
	| { kind: 'batch'; key: string; project: TriageProject; items: ProjectCleanupItem[] }
	| { kind: 'item'; key: string; project: TriageProject; item: ProjectCleanupItem };

export type TriageNoteResult = { ok: boolean; message?: string | null };
export type TriageSummary = { handled: number; projectIds: string[] };

/** What the user decided on one item. `note` hands the item to Jev with their words. */
export type TriageVerdict = 'apply' | 'done' | 'not_needed' | 'note' | 'skip';

const SECTION_ORDER = { safe_cleanup: 0, needs_call: 1, note: 2 } as const;

/**
 * Every project's open items as one run. A project with two or more verified changes gets a
 * batch step so they apply in one tap; everything else is one step per item.
 */
export function buildTriageSteps(projects: TriageProject[]): TriageStep[] {
	const steps: TriageStep[] = [];
	for (const project of projects) {
		const items = [...project.view.items].sort(
			(a, b) => SECTION_ORDER[a.section] - SECTION_ORDER[b.section]
		);
		const ready = items.filter(
			(item) => item.section === 'safe_cleanup' && isCleanupItemSelectable(item)
		);
		const batched = ready.length >= 2 ? new Set(ready.map((item) => item.id)) : new Set();
		if (batched.size) {
			steps.push({
				kind: 'batch',
				key: `${project.projectId}:batch`,
				project,
				items: ready
			});
		}
		for (const item of items) {
			if (batched.has(item.id)) continue;
			steps.push({ kind: 'item', key: `${project.projectId}:${item.id}`, project, item });
		}
	}
	return steps;
}

/** Item-level steps a batch step expands into when the user goes one by one. */
export function expandBatchStep(step: Extract<TriageStep, { kind: 'batch' }>): TriageStep[] {
	return step.items.map((item) => ({
		kind: 'item' as const,
		key: `${step.project.projectId}:${item.id}`,
		project: step.project,
		item
	}));
}

/** The verdicts one item offers, in button order. */
export function triageVerdictsFor(item: ProjectCleanupItem): TriageVerdict[] {
	if (isCleanupItemSelectable(item)) return ['apply', 'not_needed', 'note', 'skip'];
	if (!item.executable) return ['done', 'not_needed', 'note', 'skip'];
	// An executable change the integrity check couldn't verify can't be applied as shown.
	return ['not_needed', 'note', 'skip'];
}

/** Keyboard shortcuts. Letters are matched case-insensitively. */
export const TRIAGE_KEYS: Record<TriageVerdict, string> = {
	apply: 'a',
	done: 'a',
	not_needed: 'n',
	note: 'd',
	skip: 's'
};

export const TRIAGE_VERDICT_LABEL: Record<TriageVerdict, string> = {
	apply: 'Apply',
	done: 'Done',
	not_needed: 'Not needed',
	note: 'Note to Jev',
	skip: 'Skip for now'
};

/** One-tap "Not needed" carries the default reason; nobody is asked to explain. */
export function triageDecisionsFor(
	item: ProjectCleanupItem,
	verdict: TriageVerdict
): CleanupDecision[] {
	switch (verdict) {
		case 'apply':
			return isCleanupItemSelectable(item) ? approveDecisionsFor([item]) : [];
		case 'done':
			return addressDecisionsFor(item);
		case 'not_needed':
			return dismissDecisionsFor(item, 'not_relevant');
		default:
			return [];
	}
}

export type QueuedTriageDecision = {
	stepKey: string;
	projectId: string;
	items: ProjectCleanupItem[];
	decisions: CleanupDecision[];
};

/** Group queued decisions into one request per project, in first-queued order. */
export function groupQueuedByProject(
	queue: QueuedTriageDecision[]
): Array<{ projectId: string; entries: QueuedTriageDecision[]; decisions: CleanupDecision[] }> {
	const byProject = new Map<string, QueuedTriageDecision[]>();
	for (const entry of queue) {
		const list = byProject.get(entry.projectId) ?? [];
		list.push(entry);
		byProject.set(entry.projectId, list);
	}
	return [...byProject.entries()].map(([projectId, entries]) => ({
		projectId,
		entries,
		decisions: entries.flatMap((entry) => entry.decisions)
	}));
}

/** The cleanup endpoint takes at most this many decisions per request. */
export const MAX_DECISIONS_PER_REQUEST = 40;

export function chunkDecisions<T>(list: T[], size = MAX_DECISIONS_PER_REQUEST): T[][] {
	const chunks: T[][] = [];
	for (let index = 0; index < list.length; index += size) {
		chunks.push(list.slice(index, index + size));
	}
	return chunks;
}

/**
 * Whole entries per request, so one item's rows never split across two saves. An item with
 * more rows than one request takes is the only thing split, by its decisions.
 */
export function chunkQueuedEntries(
	entries: QueuedTriageDecision[],
	size = MAX_DECISIONS_PER_REQUEST
): QueuedTriageDecision[][] {
	const chunks: QueuedTriageDecision[][] = [];
	let current: QueuedTriageDecision[] = [];
	let count = 0;
	for (const entry of entries) {
		if (entry.decisions.length > size) {
			if (current.length) chunks.push(current);
			current = [];
			count = 0;
			for (const decisions of chunkDecisions(entry.decisions, size)) {
				chunks.push([{ ...entry, decisions }]);
			}
			continue;
		}
		if (current.length && count + entry.decisions.length > size) {
			chunks.push(current);
			current = [];
			count = 0;
		}
		current.push(entry);
		count += entry.decisions.length;
	}
	if (current.length) chunks.push(current);
	return chunks;
}

/** Items a run covers, for "4 of 19". A batch counts every change in it. */
export function triageItemCount(steps: TriageStep[]): number {
	return steps.reduce(
		(total, step) => total + (step.kind === 'batch' ? step.items.length : 1),
		0
	);
}
