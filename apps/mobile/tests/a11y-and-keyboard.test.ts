// apps/mobile/tests/a11y-and-keyboard.test.ts
import { describe, expect, it, vi } from 'vitest';

import { announcementFor, createAnnouncer, spokenText } from '@/lib/announce';
import { measuredBarOverlap, screenBottomOverlap } from '@/lib/keyboard-lift';

describe('VoiceOver announcements', () => {
	it('speaks a status line when it appears or changes, not on a re-render', () => {
		expect(announcementFor(null, 'No connection. That change was not saved.')).toBe(
			'No connection. That change was not saved.'
		);
		expect(announcementFor('Could not save that.', 'Could not save that.')).toBeNull();
		expect(announcementFor('Could not save that.', 'Too short to keep.')).toBe(
			'Too short to keep.'
		);
		expect(announcementFor('Could not save that.', null)).toBeNull();
		expect(announcementFor(null, '   ')).toBeNull();
		expect(announcementFor(null, undefined)).toBeNull();
	});

	it("reads a note's plain text out of its children", () => {
		expect(spokenText('  Saved  ')).toBe('Saved');
		expect(spokenText(['Updated ', 3, ' tasks'])).toBe('Updated 3 tasks');
		expect(spokenText([['a', ['b']], null, false])).toBe('a b');
		expect(spokenText({ type: 'View' })).toBeNull();
		expect(spokenText('')).toBeNull();
	});

	it('speaks a result shared by both tabs once, and a new one again', () => {
		const speak = vi.fn();
		const once = createAnnouncer(speak, 2);
		expect(once('sorted:c1', 'Task added to Launch')).toBe(true);
		expect(once('sorted:c1', 'Task added to Launch')).toBe(false);
		expect(once('sorted:c2', 'Note saved')).toBe(true);
		expect(speak.mock.calls).toEqual([['Task added to Launch'], ['Note saved']]);
		// Memory is bounded: the oldest key is forgotten.
		once('sorted:c3', 'x');
		expect(once('sorted:c1', 'again')).toBe(true);
	});
});

describe('keyboard lift', () => {
	// iPhone 15: 852pt window, keyboard with QuickType ~336pt, top at 516.
	const WINDOW = 852;
	const KEYBOARD_TOP = 516;

	it('a bar on the screen bottom (full-height reader sheet) rises the keyboard height', () => {
		expect(screenBottomOverlap(WINDOW, KEYBOARD_TOP)).toBe(336);
		expect(screenBottomOverlap(WINDOW, WINDOW)).toBe(0);
		expect(screenBottomOverlap(WINDOW, 900)).toBe(0);
	});

	it('a measured bar adds back the lift it is drawn with to find where it rests', () => {
		// Docked above an 83pt tab bar: resting bottom 769.
		expect(measuredBarOverlap(769, 0, KEYBOARD_TOP)).toBe(253);
		// Already lifted by 253: measured at 516, still rests at 769.
		expect(measuredBarOverlap(516, 253, KEYBOARD_TOP)).toBe(253);
		// Above the keyboard: no lift.
		expect(measuredBarOverlap(400, 0, KEYBOARD_TOP)).toBe(0);
	});
});
