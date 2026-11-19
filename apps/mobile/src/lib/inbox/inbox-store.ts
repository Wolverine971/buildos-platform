// apps/mobile/src/lib/inbox/inbox-store.ts
//
// The inbox's app-wide state: the cleared pile (answers waiting to save) and what the screen
// hides or notes meanwhile. Module-level so leaving the inbox mid-hold neither loses an answer
// nor shows an answered item again on the way back in.
import { useSyncExternalStore } from 'react';

import { api } from '@/lib/api';

import type { InboxHidden } from './model';
import { createPile, type PileEntry } from './pile';

export const inboxPile = createPile({
	sendCleanup: (projectId, decisions) => api.inbox.decideCleanup(projectId, decisions),
	sendCheckIns: (answers) => api.inbox.answerCheckIns(answers)
});

export type InboxNote = { tone: 'warn' | 'info'; text: string };

export type HiddenKind = keyof InboxHidden;

type State = { hidden: InboxHidden; notes: Readonly<Record<string, InboxNote>> };

let state: State = {
	hidden: { items: new Set(), cleanupItems: new Set(), autoApplied: new Set() },
	notes: {}
};
const listeners = new Set<() => void>();

function set(next: State) {
	state = next;
	for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function hide(kind: HiddenKind, ids: string[]) {
	if (!ids.length) return;
	const next = new Set(state.hidden[kind]);
	ids.forEach((id) => next.add(id));
	set({ ...state, hidden: { ...state.hidden, [kind]: next } });
}

export function unhide(kind: HiddenKind, ids: string[]) {
	if (!ids.some((id) => state.hidden[kind].has(id))) return;
	const next = new Set(state.hidden[kind]);
	ids.forEach((id) => next.delete(id));
	set({ ...state, hidden: { ...state.hidden, [kind]: next } });
}

/** A line or card that came back from the pile says why. `null` clears it. */
export function setNote(key: string, note: InboxNote | null) {
	const { [key]: _old, ...rest } = state.notes;
	set({ ...state, notes: note ? { ...rest, [key]: note } : rest });
}

export function useInboxState(): State {
	return useSyncExternalStore(subscribe, () => state);
}

export function usePile(): PileEntry[] {
	return useSyncExternalStore(inboxPile.subscribe, inboxPile.snapshot);
}
