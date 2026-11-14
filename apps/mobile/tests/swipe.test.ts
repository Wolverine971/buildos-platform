// apps/mobile/tests/swipe.test.ts
import { describe, expect, it } from 'vitest';

import { claimsSwipe, SWIPE, swipeOffset, swipeOutcome } from '@/components/kit/math';

const both = { right: true, left: true };

describe('row swipes', () => {
	it('claims only clearly sideways drags, so scrolling never swipes', () => {
		expect(claimsSwipe(8, 0)).toBe(false); // too short
		expect(claimsSwipe(20, 18)).toBe(false); // diagonal: a scroll that wobbles
		expect(claimsSwipe(20, 4)).toBe(true);
		expect(claimsSwipe(-30, 10)).toBe(true);
	});

	it('acts only past the trigger, and only on a side that has an action', () => {
		expect(swipeOutcome(SWIPE.trigger - 1, both)).toBeNull();
		expect(swipeOutcome(SWIPE.trigger, both)).toBe('right');
		expect(swipeOutcome(-SWIPE.trigger, both)).toBe('left');
		expect(swipeOutcome(-200, { right: true, left: false })).toBeNull();
	});

	it('follows the finger, resists past the max, and barely moves toward a missing action', () => {
		expect(swipeOffset(60, both)).toBe(60);
		expect(swipeOffset(SWIPE.max + 40, both)).toBe(SWIPE.max + 20);
		expect(swipeOffset(-(SWIPE.max + 40), both)).toBe(-(SWIPE.max + 20));
		expect(swipeOffset(100, { right: false, left: true })).toBeCloseTo(15);
	});
});
