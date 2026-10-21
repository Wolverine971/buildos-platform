// apps/web/src/lib/components/agent/agent-chat-history.svelte.ts
import { afterNavigate, beforeNavigate, pushState, replaceState } from '$app/navigation';
import { navigating, page } from '$app/state';
import { onDestroy, onMount, untrack } from 'svelte';
import {
	claimChatUrl,
	isChatUrlSyncSuspended,
	releaseChatUrl,
	syncChatUrl
} from './agent-chat-url.svelte';

// SvelteKit's per-entry history index. A push gets a new value; a replace keeps it.
// It is the only reliable way to tell "Back moved us to another entry" from "a page
// rewrote this entry's URL/state" (both change page.state the same way).
const HISTORY_INDEX_KEY = 'sveltekit:history';
// If a popstate never arrives (unload, browser quirk), stop waiting after this long.
const POP_SETTLE_FALLBACK_MS = 1000;

let pendingPop: Promise<void> | null = null;

function currentHistoryIndex(): unknown {
	try {
		return (history.state as Record<string, unknown> | null)?.[HISTORY_INDEX_KEY];
	} catch {
		return undefined;
	}
}

/** A replacement modal must not push until the previous modal's Back has landed. */
export function waitForChatHistorySettled(): Promise<void> {
	return pendingPop ?? Promise.resolve();
}

/**
 * Go Back one entry and resolve once SvelteKit has applied it. `beforeResolve` runs
 * before anyone awaiting waitForChatHistorySettled() continues, so a host's onClose
 * (which may start goto/invalidate) runs after the popstate that would otherwise
 * cancel that work.
 */
function popChatEntry(beforeResolve: () => void): Promise<void> {
	const pop = new Promise<void>((resolve) => {
		let settled = false;
		const settle = () => {
			if (settled) return;
			settled = true;
			window.removeEventListener('popstate', onPop);
			clearTimeout(fallback);
			if (pendingPop === pop) pendingPop = null;
			syncChatUrl();
			try {
				beforeResolve();
			} finally {
				resolve();
			}
		};
		// SvelteKit registered its popstate listener first. Let its state update land.
		const onPop = () => queueMicrotask(settle);
		const fallback = setTimeout(settle, POP_SETTLE_FALLBACK_MS);
		window.addEventListener('popstate', onPop);
	});
	pendingPop = pop;
	history.back();
	return pop;
}

type ChatHistoryOptions = {
	instanceId: string;
	isVisible: () => boolean;
	isEmbedded: () => boolean;
	sessionId: () => string | null;
	onBack: () => void;
};

/** Synchronizes one mounted surface with SvelteKit's shallow history and URL owner. */
export function createChatHistory(options: ChatHistoryOptions) {
	const { instanceId } = options;
	let ready = $state(false);
	let visible = false;
	let closed = false;
	let disposed = false;
	let navigatingRoute = $state(false);
	let navigationVersion = 0;
	let selfPopping = false;
	let claimedSession: string | null = null;
	// The history entry this chat currently lives on, and whether the chat pushed it.
	let ownEntry: unknown = undefined;
	let ownEntryPushed = false;

	function release() {
		releaseChatUrl(instanceId);
		claimedSession = null;
	}

	function rememberOwnEntry(pushed: boolean) {
		ownEntry = currentHistoryIndex();
		ownEntryPushed = pushed;
	}

	/**
	 * Leave history the way the chat found it. Resolves once any Back it started has been
	 * applied; `afterClose` runs at that point (or immediately when nothing was popped).
	 */
	function close(afterClose: () => void = () => {}): Promise<void> {
		if (!visible) {
			afterClose();
			return Promise.resolve();
		}
		visible = false;
		closed = true;
		release();
		if (options.isEmbedded() || navigatingRoute || navigating.to) {
			afterClose();
			return Promise.resolve();
		}
		const leaveEntry = (): Promise<void> => {
			if (page.state.agentChat !== instanceId) {
				afterClose();
				return Promise.resolve();
			}
			if (page.state.agentChatPushed) {
				selfPopping = true;
				return popChatEntry(afterClose);
			}
			replaceState('', {
				...page.state,
				agentChat: undefined,
				agentChatPushed: undefined
			});
			afterClose();
			return Promise.resolve();
		};
		// Another chat's Back is still landing: pop ours only once that one is applied.
		return pendingPop ? pendingPop.then(leaveEntry) : leaveEntry();
	}

	onMount(() => {
		// Hydration runs mount callbacks before the router accepts shallow writes.
		queueMicrotask(async () => {
			await waitForChatHistorySettled();
			if (!disposed) ready = true;
		});
	});

	beforeNavigate((navigation) => {
		const version = ++navigationVersion;
		navigatingRoute = true;
		// A cancelled navigation has no afterNavigate callback.
		void navigation.complete.catch(() => {
			if (!disposed && version === navigationVersion) navigatingRoute = false;
		});
	});

	afterNavigate((navigation) => {
		queueMicrotask(() => {
			if (disposed) return;
			if (
				visible &&
				!closed &&
				options.isVisible() &&
				!options.isEmbedded() &&
				navigation.type !== 'popstate' &&
				navigation.type !== 'enter' &&
				!isChatUrlSyncSuspended()
			) {
				// A page change while open: the chat now lives on this entry. A replacing
				// navigation keeps the entry the chat pushed, so it still owns a Back step.
				const sameEntry = ownEntry !== undefined && currentHistoryIndex() === ownEntry;
				const pushed = sameEntry && ownEntryPushed;
				replaceState('', {
					...page.state,
					agentChat: instanceId,
					agentChatPushed: pushed || undefined
				});
				rememberOwnEntry(pushed);
			}
			navigatingRoute = false;
			if (visible && !closed && !isChatUrlSyncSuspended()) syncChatUrl();
		});
	});

	$effect(() => {
		const onScreen = options.isVisible();
		const embedded = options.isEmbedded();
		const sessionId = options.sessionId();
		const owner = page.state.agentChat;
		const inFlight = navigating.to;
		const routeInFlight = navigatingRoute;
		if (!ready) return;
		untrack(() => {
			if (selfPopping && owner !== instanceId) selfPopping = false;
			if (!onScreen) {
				void close();
				closed = false;
				return;
			}
			if (closed) return;
			if (!visible) {
				if (inFlight || routeInFlight) return;
				if (pendingPop) {
					ready = false;
					void waitForChatHistorySettled().then(() => {
						if (!disposed) ready = true;
					});
					return;
				}
				visible = true;
				if (!embedded) {
					pushState('', { ...page.state, agentChat: instanceId, agentChatPushed: true });
					rememberOwnEntry(true);
				}
			} else if (!embedded && owner === instanceId) {
				// Walking Back through pages keeps the chat open; track the entry it is on.
				rememberOwnEntry(page.state.agentChatPushed === true);
			} else if (
				!embedded &&
				!inFlight &&
				!routeInFlight &&
				!selfPopping &&
				!isChatUrlSyncSuspended()
			) {
				if (ownEntry !== undefined && currentHistoryIndex() === ownEntry) {
					// Same entry, new state: a page rewrote its URL without carrying our
					// marker (e.g. replaceState(url, {})). That is not Back; put it back.
					replaceState('', {
						...page.state,
						agentChat: instanceId,
						agentChatPushed: ownEntryPushed || undefined
					});
					syncChatUrl();
				} else {
					// Back already removed our entry. Close through the normal X path without
					// popping again (which would also dismiss the underlying desktop card).
					visible = false;
					closed = true;
					release();
					options.onBack();
					return;
				}
			}
			if (sessionId !== claimedSession) {
				if (sessionId) claimChatUrl(instanceId, sessionId);
				else release();
				claimedSession = sessionId;
			}
		});
	});

	onDestroy(() => {
		disposed = true;
		if (!ready) return;
		void close();
		release();
	});

	return { close };
}
