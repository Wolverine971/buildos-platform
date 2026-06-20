// apps/web/src/lib/stores/agentOperativesStore.ts
import { writable } from 'svelte/store';
import type { AgentOperativeRowShape } from '@buildos/shared-types';

export type AgentOperativeRow = AgentOperativeRowShape;

export const agentOperativesStore = writable<Map<string, AgentOperativeRow>>(new Map());
export const agentOperativesLoading = writable(false);

let loading = false;

export async function loadAgentOperatives(limit = 100): Promise<void> {
	if (loading) return;
	loading = true;
	agentOperativesLoading.set(true);
	try {
		const res = await fetch(`/api/agent-operatives?limit=${limit}`, {
			headers: { accept: 'application/json' }
		});
		if (res.ok) {
			const body = await res.json().catch(() => null);
			const operatives: AgentOperativeRow[] = body?.data?.operatives ?? [];
			agentOperativesStore.set(new Map(operatives.map((o) => [o.id, o])));
		}
	} catch (error) {
		console.warn('[agentOperatives] load failed', error);
	} finally {
		loading = false;
		agentOperativesLoading.set(false);
	}
}

export function mergeAgentOperatives(operatives: Iterable<AgentOperativeRow>): void {
	agentOperativesStore.update((current) => {
		let mutated = false;
		const next = new Map(current);
		for (const operative of operatives) {
			if (!operative?.id) continue;
			const existing = next.get(operative.id);
			if (!existing || (operative.updated_at ?? '') >= (existing.updated_at ?? '')) {
				next.set(operative.id, operative);
				mutated = true;
			}
		}
		return mutated ? next : current;
	});
}

export function removeAgentOperative(id: string): void {
	agentOperativesStore.update((current) => {
		if (!current.has(id)) return current;
		const next = new Map(current);
		next.delete(id);
		return next;
	});
}
