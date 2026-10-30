// apps/web/src/lib/components/inbox/cleanup-outbox.ts
//
// Project cleanup answers go through the Cleared pile (tasker 149): the item leaves its card
// at once, waits out Undo, then saves in the background. Answers for one project that are
// ready together share one POST .../cleanup; each answer still gets its own result, and
// anything that failed or changed goes back on the card.
import type { ProjectCleanupItem, ProjectCleanupView } from '@buildos/shared-types';
import {
	clearedPile,
	type PileOutcome,
	type PileRunOptions,
	type PileSettled
} from '$lib/stores/inbox-cleared-pile.svelte';
import { sendCleanupNote } from './cleanup-note.client';
import {
	CLEANUP_CHANGED_MESSAGE,
	summarizeCleanupItemOutcome,
	type CleanupDecision,
	type CleanupItemResult,
	type CleanupOutcome
} from './project-cleanup-presentation';

/** The server takes up to 40 decisions per request. */
const MAX_DECISIONS_PER_REQUEST = 40;

export type CleanupSendResult = {
	/** The project's fresh, verified view, when the server sent one. */
	view: ProjectCleanupView | null;
	/** Per item id: what happened (null when the server said nothing about it). */
	results: Map<string, CleanupItemResult | null>;
	/** Set when the whole request failed. */
	error: string | null;
};

type CleanupPayload = {
	projectId: string;
	items: ProjectCleanupItem[];
	decisions: CleanupDecision[];
	onResult?: (result: CleanupSendResult) => void;
};

export function cleanupPileKey(projectId: string, itemId: string): string {
	return `cleanup:${projectId}:${itemId}`;
}

/** The view without items the pile is holding, saving or has cleared, counts to match. */
export function withoutAnsweredItems(
	view: ProjectCleanupView | null,
	projectId: string
): ProjectCleanupView | null {
	if (!view) return view;
	const items = view.items.filter(
		(item) => !clearedPile.isHidden(cleanupPileKey(projectId, item.id))
	);
	if (items.length === view.items.length) return view;
	const counts = { total: items.length, safe_cleanup: 0, needs_call: 0, note: 0 };
	for (const item of items) counts[item.section] += 1;
	return { ...view, items, counts };
}

function cleanupLane(projectId: string): string {
	return `cleanup:${projectId}`;
}

// Display punctuation only: "Failed." + " It's back…" without a doubled period.
function backOnCard(message: string): string {
	return `${message.trim().replace(/[.\s]+$/, '')}. It's back on your card.`;
}

function cleanupUrl(projectId: string): string {
	return `/api/onto/projects/${encodeURIComponent(projectId)}/cleanup`;
}

async function postDecisions(
	projectId: string,
	decisions: CleanupDecision[],
	options: PileRunOptions
): Promise<{ outcomes: CleanupOutcome[]; view: ProjectCleanupView | null }> {
	const res = await fetch(cleanupUrl(projectId), {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ decisions }),
		keepalive: options.keepalive
	});
	const json = await res.json().catch(() => null);
	if (!res.ok) throw new Error(json?.error ?? 'Could not save your answer');
	return {
		outcomes: (json?.data?.outcomes ?? []) as CleanupOutcome[],
		view: (json?.data?.view ?? null) as ProjectCleanupView | null
	};
}

/** One POST for every ready answer in a project; each answer gets its own outcome. */
export async function runCleanupPayloads(
	payloads: CleanupPayload[],
	options: PileRunOptions
): Promise<PileOutcome[]> {
	const projectId = payloads[0]?.projectId;
	if (!projectId) return [];
	let outcomes: CleanupOutcome[] = [];
	let view: ProjectCleanupView | null = null;
	let error: string | null = null;
	try {
		({ outcomes, view } = await postDecisions(
			projectId,
			payloads.flatMap((payload) => payload.decisions),
			options
		));
	} catch (caught) {
		error = caught instanceof Error ? caught.message : 'Could not save your answer';
	}

	return payloads.map((payload): PileOutcome => {
		const results = new Map(
			payload.items.map((item) => [
				item.id,
				error ? null : summarizeCleanupItemOutcome(item, outcomes)
			])
		);
		payload.onResult?.({ view, results, error });
		if (error) return { failed: true, detail: backOnCard(error) };
		const back = payload.items.filter((item) => {
			const status = results.get(item.id)?.status;
			return status === 'failed' || status === 'changed';
		});
		if (!back.length) return {};
		const changed = back.some((item) => results.get(item.id)?.status === 'changed');
		const failure = back
			.map((item) => results.get(item.id))
			.find((result) => result?.status === 'failed');
		return {
			returnedKeys: back.map((item) => cleanupPileKey(projectId, item.id)),
			detail: backOnCard(
				changed ? CLEANUP_CHANGED_MESSAGE : (failure?.message ?? 'Could not apply this')
			)
		};
	});
}

/**
 * Hands a Project cleanup answer to the pile. The items hide from the card right away and
 * come back only if Undo is pressed or the save fails.
 */
export function queueCleanupAnswer(input: {
	projectId: string;
	projectName?: string | null;
	title: string;
	label: string;
	items: ProjectCleanupItem[];
	decisions: CleanupDecision[];
	holdMs?: number;
	keepalive?: boolean;
	onResult?: (result: CleanupSendResult) => void;
	onUndo?: () => void;
}): { id: string; settled: Promise<PileSettled> } {
	return clearedPile.add<CleanupPayload>({
		keepalive: input.keepalive,
		title: input.title,
		label: input.label,
		context: input.projectName ?? null,
		keys: input.items.map((item) => cleanupPileKey(input.projectId, item.id)),
		lane: cleanupLane(input.projectId),
		holdMs: input.holdMs,
		onUndo: input.onUndo,
		merge: {
			key: 'cleanup',
			payload: {
				projectId: input.projectId,
				items: input.items,
				decisions: input.decisions,
				onResult: input.onResult
			},
			weight: input.decisions.length,
			maxWeight: MAX_DECISIONS_PER_REQUEST,
			runMany: runCleanupPayloads
		}
	});
}

export type CleanupNoteSendResult = {
	replies: string[];
	view: ProjectCleanupView | null;
	failure: string | null;
};

/**
 * A note (typed, or an answer that is read as one) on one or more items. The note reader may
 * leave an item open, so the fresh view decides what shows afterwards.
 */
export function queueCleanupNote(input: {
	projectId: string;
	projectName?: string | null;
	title: string;
	label: string;
	items: ProjectCleanupItem[];
	note: string;
	holdMs?: number;
	onResult?: (result: CleanupNoteSendResult) => void;
	onUndo?: () => void;
}): { id: string; settled: Promise<PileSettled> } {
	return clearedPile.add({
		title: input.title,
		label: input.label,
		context: input.projectName ?? null,
		keys: input.items.map((item) => cleanupPileKey(input.projectId, item.id)),
		lane: cleanupLane(input.projectId),
		settles: false,
		holdMs: input.holdMs,
		onUndo: input.onUndo,
		run: async (): Promise<PileOutcome> => {
			const replies: string[] = [];
			let failure: string | null = null;
			let view: ProjectCleanupView | null = null;
			const failedIds: string[] = [];
			for (const item of input.items) {
				const result = await sendCleanupNote({
					projectId: input.projectId,
					item,
					note: input.note
				});
				if (result.ok) {
					replies.push(result.reply);
					if (result.view) view = result.view;
				} else {
					failure ??= result.message;
					failedIds.push(item.id);
				}
			}
			input.onResult?.({ replies, view, failure });
			const detail = [...new Set(replies)].join(' ') || null;
			if (!replies.length) {
				return { failed: true, detail: backOnCard(failure ?? 'Could not send the note') };
			}
			return {
				returnedKeys: failedIds.map((id) => cleanupPileKey(input.projectId, id)),
				detail: failure
					? `${detail ?? ''} Some could not be read: ${failure}`.trim()
					: detail
			};
		}
	});
}
