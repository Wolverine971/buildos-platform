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

let pendingPop: Promise<void> | null = null;

/** A replacement modal must not push until the previous modal's Back has landed. */
export function waitForChatHistorySettled(): Promise<void> {
	return pendingPop ?? Promise.resolve();
}

function popChatEntry(): void {
	if (pendingPop) return;
	pendingPop = new Promise<void>((resolve) => {
		window.addEventListener(
			'popstate',
			() => {
				// SvelteKit registered its popstate listener first. Let its state update land.
				queueMicrotask(() => {
					pendingPop = null;
					syncChatUrl();
					resolve();
				});
			},
			{ once: true }
		);
	});
	history.back();
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

	function release() {
		releaseChatUrl(instanceId);
		claimedSession = null;
	}

	function close() {
		if (!visible) return;
		visible = false;
		closed = true;
		release();
		if (options.isEmbedded() || navigatingRoute || navigating.to) return;
		if (page.state.agentChat !== instanceId) return;
		if (page.state.agentChatPushed) {
			selfPopping = true;
			popChatEntry();
		} else {
			replaceState('', {
				...page.state,
				agentChat: undefined,
				agentChatPushed: undefined
			});
		}
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
			// Preserve the original pushed flag when walking Back through pages.
			// A fresh page entry belongs to the chat but was not pushed by it.
			if (
				visible &&
				!closed &&
				options.isVisible() &&
				!options.isEmbedded() &&
				navigation.type !== 'popstate' &&
				navigation.type !== 'enter' &&
				!isChatUrlSyncSuspended()
			) {
				replaceState('', {
					...page.state,
					agentChat: instanceId,
					agentChatPushed: undefined
				});
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
				close();
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
				}
			} else if (
				!embedded &&
				owner !== instanceId &&
				!inFlight &&
				!routeInFlight &&
				!selfPopping &&
				!isChatUrlSyncSuspended()
			) {
				// Back already removed our entry. Close through the normal X path without
				// popping again (which would also dismiss the underlying desktop card).
				visible = false;
				closed = true;
				release();
				options.onBack();
				return;
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
		close();
		release();
	});

	return { close };
}
