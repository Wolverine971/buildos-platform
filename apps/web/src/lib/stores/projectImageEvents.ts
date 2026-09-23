// apps/web/src/lib/stores/projectImageEvents.ts
import { writable } from 'svelte/store';

/**
 * "A project's images changed" signal. A chat attachment becomes a durable
 * project image the moment its upload completes, before any turn runs, so the
 * document tree's Images shelf listens here instead of waiting for a mutation
 * receipt that an upload never produces.
 */
export interface ProjectImagesChangedEvent {
	projectId: string;
	/** Monotonic id so two changes to one project in a row still notify. */
	nonce: number;
}

const store = writable<ProjectImagesChangedEvent | null>(null);
let nonce = 0;

export const projectImageEvents = { subscribe: store.subscribe };

export function notifyProjectImagesChanged(projectId: string | null | undefined): void {
	if (!projectId) return;
	store.set({ projectId, nonce: ++nonce });
}
