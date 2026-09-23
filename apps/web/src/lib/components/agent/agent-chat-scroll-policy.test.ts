// apps/web/src/lib/components/agent/agent-chat-scroll-policy.test.ts
import { describe, expect, it } from 'vitest';
import type { UIMessage } from './agent-chat.types';
import {
	classifyMessageListUpdate,
	followStateAfter,
	hiddenContentBelow,
	latestScrollTop,
	messageRenderKey,
	pinScrollTop,
	replyRoomFloor,
	shouldFollowLatest,
	type FollowEvent,
	type ScrollerGeometry
} from './agent-chat-scroll-policy';
import {
	REVEAL_MAX_BACKLOG_CHARS,
	nextRevealLength,
	nextRevealWindow
} from './agent-chat-stream-reveal';

function message(overrides: Partial<UIMessage> & Pick<UIMessage, 'id'>): UIMessage {
	return {
		type: 'assistant',
		content: '',
		timestamp: new Date('2026-09-22T12:00:00Z'),
		...overrides
	};
}

describe('classifyMessageListUpdate', () => {
	it('pins a user message sent from this client, even as the first message', () => {
		const sending = message({ id: 'u1', renderKey: 'rk-1', type: 'user', delivery: 'sending' });
		expect(classifyMessageListUpdate(new Set(), [sending]).update).toEqual({
			kind: 'pin',
			key: 'rk-1'
		});
	});

	it('treats a restored snapshot as a load, never a pin', () => {
		const restored = [
			message({ id: 'u1', type: 'user' }),
			message({ id: 'a1', type: 'assistant' })
		];
		expect(classifyMessageListUpdate(new Set(), restored).update).toEqual({ kind: 'load' });
		// Every key replaced (session switch without passing through empty).
		expect(classifyMessageListUpdate(new Set(['old-1', 'old-2']), restored).update).toEqual({
			kind: 'load'
		});
	});

	it('does not re-pin when an optimistic message swaps to its persisted id', () => {
		const { keys } = classifyMessageListUpdate(new Set(), [
			message({ id: 'tmp-1', renderKey: 'rk-1', type: 'user', delivery: 'sending' })
		]);
		const { update } = classifyMessageListUpdate(keys, [
			message({ id: 'db-1', renderKey: 'rk-1', type: 'user', delivery: 'sent' }),
			message({ id: 'a1', type: 'assistant' })
		]);
		expect(update).toEqual({ kind: 'none' });
	});

	it('resets when the list empties', () => {
		expect(classifyMessageListUpdate(new Set(['a']), []).update).toEqual({ kind: 'reset' });
		expect(classifyMessageListUpdate(new Set(), []).update).toEqual({ kind: 'none' });
	});

	it('keys rows by renderKey, falling back to id', () => {
		expect(messageRenderKey({ id: 'x', renderKey: 'stable' })).toBe('stable');
		expect(messageRenderKey({ id: 'x' })).toBe('x');
	});
});

describe('scroll geometry', () => {
	const geometry: ScrollerGeometry = {
		scrollTop: 400,
		clientHeight: 600,
		scrollerTop: 100,
		paddingTop: 12,
		paddingBottom: 16
	};

	it('pins a row one padding below the top edge', () => {
		// Row is 250px below the scroller's top edge on screen.
		expect(pinScrollTop(geometry, 350)).toBe(400 + 250 - 12);
		expect(pinScrollTop({ ...geometry, scrollTop: 0 }, 105)).toBe(0);
	});

	it('keeps a full viewport of reply room below the pin', () => {
		expect(replyRoomFloor(638, 600)).toBe(1238);
	});

	it('scrolls to the end of real content, not the reply room', () => {
		// Content ends 900px below the scroller's top edge on screen.
		expect(latestScrollTop(geometry, 1000)).toBe(400 + 900 + 16 - 600);
		expect(hiddenContentBelow(geometry, 1000)).toBe(316);
		// Content that already fits reports nothing hidden.
		expect(hiddenContentBelow(geometry, 500)).toBeLessThan(0);
	});
});

describe('stream reveal', () => {
	it('drains a chunk over roughly one window, whole words at a time', () => {
		const text = 'The quick brown fox jumps over the lazy dog and keeps running.';
		let shown = 0;
		const seen: number[] = [];
		for (let frame = 0; frame < 12 && shown < text.length; frame += 1) {
			shown = nextRevealLength(text, shown, 32, 150);
			seen.push(shown);
			if (shown < text.length) expect(`${text[shown - 1]}${text[shown]}`).toMatch(/\s/);
		}
		expect(shown).toBe(text.length);
		expect(seen.length).toBeGreaterThan(2);
	});

	it('never exceeds the received text and catches up on a huge backlog', () => {
		const text = 'x'.repeat(REVEAL_MAX_BACKLOG_CHARS + 5000);
		const next = nextRevealLength(text, 0, 16, 150);
		expect(next).toBeGreaterThanOrEqual(text.length - REVEAL_MAX_BACKLOG_CHARS);
		expect(nextRevealLength('abc', 10, 16)).toBe(3);
	});

	it('does not split an emoji surrogate pair', () => {
		const text = `${'a'.repeat(9)}😀${'b'.repeat(40)}`;
		for (let shown = 0; shown < text.length; ) {
			shown = nextRevealLength(text, shown, 1, 100000);
			const code = text.charCodeAt(shown - 1);
			if (shown < text.length) expect(code >= 0xd800 && code <= 0xdbff).toBe(false);
		}
	});

	it('adapts the window toward observed chunk gaps within bounds', () => {
		expect(nextRevealWindow(150, 300)).toBeCloseTo(195);
		expect(nextRevealWindow(150, 5000)).toBeLessThanOrEqual(150 * 0.7 + 360 * 0.3);
		expect(nextRevealWindow(150, 0)).toBeGreaterThanOrEqual(150 * 0.7 + 60 * 0.3);
	});
});

describe('follow-after-tap', () => {
	it('starts only from a jump tap while a reply is streaming', () => {
		expect(followStateAfter('jump-tap', true)).toBe(true);
		expect(followStateAfter('jump-tap', false)).toBe(false);
	});

	it.each<FollowEvent>(['user-input', 'user-scroll', 'stream-end', 'pin', 'load', 'reset'])(
		'%s ends following',
		(event) => {
			expect(followStateAfter(event, true)).toBe(false);
		}
	);

	it('snaps only when following, not mid-glide, and content is hidden', () => {
		const base = { following: true, smoothScrollInFlight: false, hiddenBelow: 40 };
		expect(shouldFollowLatest(base)).toBe(true);
		expect(shouldFollowLatest({ ...base, following: false })).toBe(false);
		expect(shouldFollowLatest({ ...base, smoothScrollInFlight: true })).toBe(false);
		expect(shouldFollowLatest({ ...base, hiddenBelow: 0 })).toBe(false);
	});
});
