// apps/web/src/lib/stores/projectDataMutations.ts
import { writable } from 'svelte/store';
import type { DataMutationSummary } from '$lib/components/agent/agent-chat.types';

/**
 * Global "data was mutated" signal.
 *
 * The agentic chat mutates entities (tasks, documents, projects, …) directly in the
 * database via tools. The surfaces that show those entities (project page, dashboard,
 * …) keep their lists in local `$state` refreshed by their own client-side refetch
 * (e.g. `refreshSilently()`), NOT via SvelteKit `invalidate()` — so `invalidate()`
 * can't reach them. Instead, whenever a chat session closes (or a staged change set is
 * applied) with successful mutations, it publishes here; interested surfaces subscribe
 * and refetch themselves.
 *
 * This decouples "something changed" from "who needs to refresh", so a single broadcast
 * from the chat covers every launch surface (global nav launcher, embedded edit-modal
 * chats, workspace-context chats, …) instead of each call site wiring its own refresh.
 */
export interface DataMutationEvent {
	summary: DataMutationSummary;
	/** Monotonic id so two identical summaries in a row still trigger subscribers. */
	nonce: number;
}

const store = writable<DataMutationEvent | null>(null);
let nonce = 0;

/** Subscribe to data-mutation events (latest event, or null before the first). */
export const dataMutationEvents = { subscribe: store.subscribe };

/**
 * Announce that a chat/agent-run mutated data. No-op when nothing changed.
 * `affectedProjectIds` is best-effort; an empty list means "scope unknown" and
 * subscribers should treat it as potentially relevant.
 */
export function notifyDataMutation(summary: DataMutationSummary): void {
	if (!summary?.hasChanges) return;
	store.set({ summary, nonce: ++nonce });
}

/**
 * True when an event is relevant to a given project: either the affected-project list
 * is empty (scope unknown → assume relevant) or it explicitly includes the project.
 */
export function mutationAffectsProject(
	summary: DataMutationSummary | undefined | null,
	projectId: string | undefined | null
): boolean {
	if (!summary?.hasChanges) return false;
	if (!projectId) return true;
	if (summary.affectedProjectIds.length === 0) return true;
	return summary.affectedProjectIds.includes(projectId);
}
