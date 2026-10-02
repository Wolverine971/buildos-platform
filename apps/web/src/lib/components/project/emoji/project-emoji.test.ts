// apps/web/src/lib/components/project/emoji/project-emoji.test.ts
import { describe, expect, it } from 'vitest';
import {
	isEmojiGlyph,
	normalizeEmojiSelection,
	placeEmoji,
	readProjectEmoji,
	searchCatalog,
	slotGlyphs,
	tileGlyphs
} from './project-emoji';
import { EMOJI_CATALOG } from './emoji-catalog.generated';

describe('isEmojiGlyph', () => {
	it('accepts one standard emoji and nothing else', () => {
		for (const glyph of ['💰', '🧑‍💻', '9️⃣', '🇮🇷', '👍🏽', '🏴󠁧󠁢󠁷󠁬󠁳󠁿'])
			expect(isEmojiGlyph(glyph)).toBe(true);
		for (const text of ['', 'a', 'BE', '💰💰', '💰 ', '<b>'])
			expect(isEmojiGlyph(text)).toBe(false);
	});

	it('accepts every catalog emoji', () => {
		expect(EMOJI_CATALOG.filter(([glyph]) => !isEmojiGlyph(glyph))).toEqual([]);
	});
});

describe('readProjectEmoji', () => {
	it('reads glyphs, source and ranked suggestions from the stored value', () => {
		expect(
			readProjectEmoji({
				glyphs: ['📖', '🔚'],
				source: 'llm',
				ranked: [
					['📖', 0.3],
					['📘', 0.26],
					['📖', 0.1],
					['nope', 0.1]
				]
			})
		).toEqual({ glyphs: ['📖', '🔚'], source: 'llm', suggestions: ['📖', '📘'] });
	});

	it('keeps an owner’s choice of initials as an empty list', () => {
		expect(readProjectEmoji({ glyphs: [], source: 'user' })?.glyphs).toEqual([]);
		expect(tileGlyphs([])).toBeNull();
		expect(readProjectEmoji(null)).toBeNull();
	});
});

describe('normalizeEmojiSelection', () => {
	it('allows none, one or two distinct emoji', () => {
		expect(normalizeEmojiSelection([])).toEqual([]);
		expect(normalizeEmojiSelection(['💰'])).toEqual(['💰']);
		expect(normalizeEmojiSelection(['💰', '💰'])).toEqual(['💰']);
		expect(normalizeEmojiSelection([' 💰', '🚪'])).toEqual(['💰', '🚪']);
	});

	it('refuses text, extra emoji and non-lists', () => {
		expect(normalizeEmojiSelection(['💰', '🚪', '📖'])).toBeNull();
		expect(normalizeEmojiSelection(['money'])).toBeNull();
		expect(normalizeEmojiSelection('💰')).toBeNull();
		expect(normalizeEmojiSelection(undefined)).toBeNull();
	});
});

describe('picker slots', () => {
	it('fills the first slot, then moves on to an empty second', () => {
		const first = placeEmoji([null, null], 0, '💰');
		expect(first).toEqual({ slots: ['💰', null], active: 1 });
		expect(placeEmoji(first.slots, first.active, '🚪')).toEqual({
			slots: ['💰', '🚪'],
			active: 1
		});
	});

	it('moves an emoji instead of doubling it', () => {
		expect(placeEmoji(['💰', '🚪'], 0, '🚪').slots).toEqual(['🚪', null]);
	});

	it('saves filled slots in order', () => {
		expect(slotGlyphs([null, '🚪'])).toEqual(['🚪']);
		expect(slotGlyphs([null, null])).toEqual([]);
	});
});

describe('searchCatalog', () => {
	const catalog = EMOJI_CATALOG.map(([glyph, name, group]) => ({ glyph, name, group }));

	it('finds emoji by every word of their name', () => {
		expect(searchCatalog(catalog, 'money bag').map((entry) => entry.glyph)).toEqual(['💰']);
		expect(searchCatalog(catalog, 'DOOR').map((entry) => entry.glyph)).toContain('🚪');
		expect(searchCatalog(catalog, '  ')).toEqual([]);
	});
});
