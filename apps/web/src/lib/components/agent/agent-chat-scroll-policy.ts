// apps/web/src/lib/components/agent/agent-chat-scroll-policy.ts
//
// Pure pieces of the conversation scroll policy owned by AgentMessageList:
// which list updates pin a turn, which are wholesale loads, and the scroll
// geometry. Kept DOM-free so the math is unit-testable; the component feeds
// it measured rects.
import type { UIMessage } from './agent-chat.types';

/** Stable row identity: survives optimistic → persisted id swaps. */
export function messageRenderKey(message: Pick<UIMessage, 'id' | 'renderKey'>): string {
	return message.renderKey ?? message.id;
}

export type MessageListUpdate =
	/** The list emptied (new chat / reset): drop the pin and the reply room. */
	| { kind: 'reset' }
	/** Empty → populated, or every row replaced (session restore/switch). */
	| { kind: 'load' }
	/** A user message sent from this client just appeared: pin it to the top. */
	| { kind: 'pin'; key: string }
	| { kind: 'none' };

/**
 * Classify a `messages` change against the keys rendered last time. A pin wins
 * over a load so a brand-new chat's first send still pins.
 */
export function classifyMessageListUpdate(
	previousKeys: ReadonlySet<string>,
	messages: readonly UIMessage[]
): { update: MessageListUpdate; keys: Set<string> } {
	const keys = new Set<string>();
	let pinKey: string | null = null;
	let overlaps = false;
	for (const message of messages) {
		const key = messageRenderKey(message);
		keys.add(key);
		if (previousKeys.has(key)) {
			overlaps = true;
			continue;
		}
		if (message.type === 'user' && message.delivery === 'sending') pinKey = key;
	}

	if (keys.size === 0) {
		return { update: previousKeys.size > 0 ? { kind: 'reset' } : { kind: 'none' }, keys };
	}
	if (pinKey) return { update: { kind: 'pin', key: pinKey }, keys };
	if (previousKeys.size === 0 || !overlaps) return { update: { kind: 'load' }, keys };
	return { update: { kind: 'none' }, keys };
}

export interface ScrollerGeometry {
	/** scroller.scrollTop */
	scrollTop: number;
	/** scroller.clientHeight (the viewport, padding included) */
	clientHeight: number;
	/** scroller.getBoundingClientRect().top */
	scrollerTop: number;
	/** Computed padding-top / padding-bottom of the scroller. */
	paddingTop: number;
	paddingBottom: number;
}

/** Scroll offset that puts `targetTop` (a viewport y) one padding below the top edge. */
export function pinScrollTop(geometry: ScrollerGeometry, targetTop: number): number {
	return Math.max(
		0,
		geometry.scrollTop + (targetTop - geometry.scrollerTop) - geometry.paddingTop
	);
}

/**
 * Where the reply-room floor must sit (scroll-content y of its bottom edge) so
 * the pinned offset stays reachable however short the turn is. This is the
 * "trailing spacer" of `max(0, viewport − turnHeight)`, expressed as a fixed
 * floor instead of a flow height: when the turn later shrinks (a thinking log
 * collapsing at turn end) the floor does not move, so the browser never clamps
 * scrollTop and the conversation cannot jump.
 */
export function replyRoomFloor(pinTop: number, clientHeight: number): number {
	return Math.max(0, pinTop + clientHeight);
}

/**
 * Scroll offset that shows the end of real content (`contentEndTop` = viewport
 * y of the end-of-content sentinel) at the bottom edge, bottom padding kept.
 * Never scrolls into the reply-room floor below the content.
 */
export function latestScrollTop(geometry: ScrollerGeometry, contentEndTop: number): number {
	return Math.max(
		0,
		geometry.scrollTop +
			(contentEndTop - geometry.scrollerTop) +
			geometry.paddingBottom -
			geometry.clientHeight
	);
}

/** Pixels of real content hidden below the viewport (negative when it all fits). */
export function hiddenContentBelow(geometry: ScrollerGeometry, contentEndTop: number): number {
	return latestScrollTop(geometry, contentEndTop) - geometry.scrollTop;
}

/**
 * Follow-after-tap: tapping "Jump to latest" while a reply streams keeps the
 * view on the growing end, Claude.ai-style. Only that tap starts following;
 * any real user input or scroll, the stream ending, a new pin, a load, or a
 * reset stops it (and the scroll is left where it is). Nothing else ever
 * auto-follows.
 */
export type FollowEvent =
	| 'jump-tap'
	| 'user-input'
	| 'user-scroll'
	| 'stream-end'
	| 'pin'
	| 'load'
	| 'reset';

export function followStateAfter(event: FollowEvent, streaming: boolean): boolean {
	return event === 'jump-tap' && streaming;
}

/**
 * Whether a measure pass should snap to the latest content. Waits out an
 * in-flight smooth scroll (the tap's own glide) instead of cutting it short.
 */
export function shouldFollowLatest(state: {
	following: boolean;
	smoothScrollInFlight: boolean;
	hiddenBelow: number;
}): boolean {
	return state.following && !state.smoothScrollInFlight && state.hiddenBelow > 1;
}
