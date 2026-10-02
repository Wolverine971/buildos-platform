// apps/web/src/lib/components/project/emoji/project-emoji.ts
//
// A project's tile emojis (onto_projects.icon_emoji; docs/specs/PROJECT_EMOJI_PLAN_2026-10-01.md):
// reading the stored value, and what may be saved. Shared by the Projects and project-page
// loaders, the save endpoint, and the picker.

export const MAX_PROJECT_EMOJIS = 2;
const MAX_SUGGESTIONS = 8;
/** One emoji is at most a short ZWJ or tag sequence; anything longer is not a glyph. */
const MAX_GLYPH_LENGTH = 16;

export type ProjectEmojiSource = 'llm' | 'user';

export type ProjectEmoji = {
	/** What the tile shows, in order; empty means the owner chose initials. */
	glyphs: string[];
	/** 'llm' for the automatic pick, 'user' once someone chose; null when unknown. */
	source: ProjectEmojiSource | null;
	/** The automatic pick's alternates, best first, for the picker's Suggested row. */
	suggestions: string[];
};

let rgiEmoji: RegExp | null | undefined;

/** One standard (RGI) emoji, such as 💰, 🧑‍💻, 9️⃣ or 🇮🇷. Text and pairs fail. */
export function isEmojiGlyph(value: string): boolean {
	if (!value || value.length > MAX_GLYPH_LENGTH) return false;
	if (rgiEmoji === undefined) {
		try {
			// Built at runtime: the `v` flag postdates the compile target.
			rgiEmoji = new RegExp('^\\p{RGI_Emoji}$', 'v');
		} catch {
			rgiEmoji = null;
		}
	}
	return rgiEmoji ? rgiEmoji.test(value) : /^\p{Extended_Pictographic}/u.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The glyphs a tile shows from a stored list: at most two real emoji, or null for initials. */
export function tileGlyphs(value: unknown): string[] | null {
	if (!Array.isArray(value)) return null;
	const glyphs = value
		.filter((glyph): glyph is string => typeof glyph === 'string')
		.map((glyph) => glyph.trim())
		.filter(isEmojiGlyph)
		.slice(0, MAX_PROJECT_EMOJIS);
	return glyphs.length ? glyphs : null;
}

export function readProjectEmoji(value: unknown): ProjectEmoji | null {
	if (!isRecord(value)) return null;
	const glyphs = tileGlyphs(value.glyphs) ?? [];
	const source = value.source === 'llm' || value.source === 'user' ? value.source : null;
	const ranked = Array.isArray(value.ranked) ? value.ranked : [];
	const suggestions: string[] = [];
	for (const entry of ranked) {
		const glyph = Array.isArray(entry) ? entry[0] : entry;
		if (typeof glyph === 'string' && isEmojiGlyph(glyph) && !suggestions.includes(glyph)) {
			suggestions.push(glyph);
		}
		if (suggestions.length >= MAX_SUGGESTIONS) break;
	}
	return { glyphs, source, suggestions };
}

/** A chosen set to save: 0–2 distinct emoji (none = initials), or null when it isn't one. */
export function normalizeEmojiSelection(value: unknown): string[] | null {
	if (!Array.isArray(value) || value.length > MAX_PROJECT_EMOJIS) return null;
	const glyphs: string[] = [];
	for (const glyph of value) {
		if (typeof glyph !== 'string' || !isEmojiGlyph(glyph.trim())) return null;
		if (!glyphs.includes(glyph.trim())) glyphs.push(glyph.trim());
	}
	return glyphs;
}

/** The picker's two places: first and second emoji. */
export type EmojiSlots = [string | null, string | null];

export function slotsFrom(glyphs: readonly string[]): EmojiSlots {
	return [glyphs[0] ?? null, glyphs[1] ?? null];
}

/** What a set of slots saves: filled slots in order, without repeats. */
export function slotGlyphs(slots: EmojiSlots): string[] {
	return slots.filter((glyph, index): glyph is string =>
		Boolean(glyph && slots.indexOf(glyph) === index)
	);
}

/**
 * Put a picked emoji in the active slot. Picking the one already in the other slot moves it
 * here instead of doubling it. After filling the first slot, the empty second slot is next.
 */
export function placeEmoji(
	slots: EmojiSlots,
	active: 0 | 1,
	glyph: string
): { slots: EmojiSlots; active: 0 | 1 } {
	const other = active === 0 ? 1 : 0;
	const next: EmojiSlots = [...slots];
	if (next[other] === glyph) next[other] = null;
	next[active] = glyph;
	return { slots: next, active: active === 0 && !next[1] ? 1 : active };
}

export type CatalogEntry = { glyph: string; name: string; group: string };

/** Emoji whose name holds every word of the query ("money bag", "door"), catalog order. */
export function searchCatalog(
	catalog: readonly CatalogEntry[],
	query: string,
	limit = 160
): CatalogEntry[] {
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	if (!words.length) return [];
	const found: CatalogEntry[] = [];
	for (const entry of catalog) {
		const name = entry.name.toLowerCase();
		if (words.every((word) => name.includes(word))) found.push(entry);
		if (found.length >= limit) break;
	}
	return found;
}
