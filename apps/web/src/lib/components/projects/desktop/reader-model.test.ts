// apps/web/src/lib/components/projects/desktop/reader-model.test.ts
import { describe, expect, it } from 'vitest';
import { neighbors, paneMode, sheetAfterDrag, showsList } from './reader-model';

describe('paneMode', () => {
	it('shows the list alone until something opens', () => {
		expect(
			paneMode({ reading: false, layout: 'focus', chat: false, listWithChat: false })
		).toBe('list');
	});

	it('follows the remembered layout while reading', () => {
		expect(paneMode({ reading: true, layout: 'peek', chat: false, listWithChat: false })).toBe(
			'peek'
		);
		expect(paneMode({ reading: true, layout: 'focus', chat: false, listWithChat: true })).toBe(
			'focus'
		);
	});

	it('gives chat the list’s place unless the list is asked back', () => {
		const reader = paneMode({ reading: true, layout: 'peek', chat: true, listWithChat: false });
		const all = paneMode({ reading: true, layout: 'peek', chat: true, listWithChat: true });
		expect(reader).toBe('reader-chat');
		expect(showsList(reader)).toBe(false);
		expect(all).toBe('all');
		expect(showsList(all)).toBe(true);
	});

	it('keeps the list beside a project chat when nothing is open', () => {
		const mode = paneMode({ reading: false, layout: 'focus', chat: true, listWithChat: false });
		expect(mode).toBe('list-chat');
		expect(showsList(mode)).toBe(true);
	});
});

describe('neighbors', () => {
	it('walks the list and stops at both ends', () => {
		expect(neighbors(['a', 'b', 'c'], 'a')).toEqual({
			index: 0,
			total: 3,
			prev: null,
			next: 'b'
		});
		expect(neighbors(['a', 'b', 'c'], 'c')).toMatchObject({ prev: 'b', next: null });
		expect(neighbors(['a', 'b'], 'gone')).toMatchObject({ index: -1, prev: null, next: null });
	});
});

describe('sheetAfterDrag', () => {
	it('toggles on a tap', () => {
		expect(sheetAfterDrag('peek', 0, false)).toBe('full');
		expect(sheetAfterDrag('full', 0, false)).toBe('peek');
	});

	it('opens on a pull up and steps back one depth on a pull down', () => {
		expect(sheetAfterDrag('peek', -80, true)).toBe('full');
		expect(sheetAfterDrag('full', 120, true)).toBe('peek');
		expect(sheetAfterDrag('peek', 120, true)).toBe('closed');
		expect(sheetAfterDrag('full', 400, true)).toBe('closed');
	});

	it('snaps back after a short drag', () => {
		expect(sheetAfterDrag('peek', 20, true)).toBe('peek');
		expect(sheetAfterDrag('full', -20, true)).toBe('full');
	});
});
