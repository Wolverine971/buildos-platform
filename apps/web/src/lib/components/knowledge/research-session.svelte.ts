// apps/web/src/lib/components/knowledge/research-session.svelte.ts
//
// One research queue for the whole tab (tasker 160 follow-up). The /knowledge page, the task
// card's knowledge view and the app-wide dock all read the same KnowledgeResearchQueue, so
// research started from a task keeps showing (and pings when it lands) after you move on, and
// the tab polls once no matter how many places are watching. Polling still runs only while
// something is queued or running and pauses while the tab is hidden.

import { KnowledgeResearchQueue } from './research-queue.svelte';
import type { ResearchTarget } from './research-tray';
import { forgetResearchDock, researchDock, wantResearchDock } from './research-dock-flag.svelte';

type SettledListener = (targets: ResearchTarget[]) => void;
const listeners = new Set<SettledListener>();

export const knowledgeResearch = new KnowledgeResearchQueue({
	onSettled: (targets) => {
		for (const listener of listeners) listener(targets);
	}
});

let watching = false;

/** Load the queue once and keep polling while anything runs. Safe to call repeatedly. */
export function watchKnowledgeResearch(): void {
	if (watching && knowledgeResearch.live) return;
	watching = true;
	knowledgeResearch.start();
}

/** Research was just queued: open the tray, load the dock everywhere, and watch it run. */
export function knowledgeResearchStarted(): void {
	wantResearchDock();
	knowledgeResearch.expanded = true;
	watching = true;
	knowledgeResearch.start(); // loads right away, so the new run shows without waiting a tick
}

/** Called with the entries whose research just finished (done, failed, skipped or stopped). */
export function onKnowledgeResearchSettled(listener: SettledListener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

/** Signed out: stop polling, drop this user's runs, and don't load the dock again on reload. */
export function resetKnowledgeResearch(): void {
	watching = false;
	knowledgeResearch.reset();
	researchDock.wanted = false;
	forgetResearchDock();
}
