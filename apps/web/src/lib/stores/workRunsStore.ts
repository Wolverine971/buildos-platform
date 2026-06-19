// apps/web/src/lib/stores/workRunsStore.ts
//
// Backing store for the Work Panel (UI-P2): the user's recent Agent Runs across
// ALL statuses (active + history), unlike `agentRunsStore` which prunes terminal
// runs after a minute. Loaded on demand from GET /api/agent-runs and merged with
// the live `agentRunsStore` so in-flight runs update in real time.

import { writable } from 'svelte/store';
import type { AgentRunRow } from '$lib/services/agentRunsRealtime.service';

export const workRunsStore = writable<Map<string, AgentRunRow>>(new Map());

let loading = false;
export const workRunsLoading = writable(false);

export async function loadWorkRuns(limit = 100): Promise<void> {
	if (loading) return;
	loading = true;
	workRunsLoading.set(true);
	try {
		const res = await fetch(`/api/agent-runs?limit=${limit}`, {
			headers: { accept: 'application/json' }
		});
		if (res.ok) {
			const body = await res.json().catch(() => null);
			const runs: AgentRunRow[] = body?.data?.runs ?? [];
			workRunsStore.set(new Map(runs.map((r) => [r.id, r])));
		}
	} catch (error) {
		console.warn('[workRuns] load failed', error);
	} finally {
		loading = false;
		workRunsLoading.set(false);
	}
}

/** Merge fresher rows (by updated_at) from the live store into the Work Panel set. */
export function mergeWorkRuns(runs: Iterable<AgentRunRow>): void {
	workRunsStore.update((current) => {
		let mutated = false;
		const next = new Map(current);
		for (const r of runs) {
			if (!r?.id) continue;
			const existing = next.get(r.id);
			if (!existing || (r.updated_at ?? '') >= (existing.updated_at ?? '')) {
				next.set(r.id, r);
				mutated = true;
			}
		}
		return mutated ? next : current;
	});
}
