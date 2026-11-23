// packages/shared-agent-ops/src/knowledge/mentions.ts
//
// Where a person or organization is named in a task or document, and what happened to that
// place after an edit (tasker 167). Pure: no database, no model.
//
// A mention is a span of the stored field text (task title/description, document title/content)
// plus the exact characters and ~32 characters on each side (quote + prefix/suffix anchoring, the
// way web annotations survive edits). After an edit each mention is re-anchored:
//
//   same     the exact text is still at the old offsets
//   moved    the exact text is found elsewhere (best match by surrounding words, then distance)
//   edited   the words around it are found but the text between them changed: a spelling fix
//            ("Phil Valeo" → "Phillip Velayo") or a rename
//   deleted  neither the text nor its surroundings are found
//
// Everything here compares structure: character spans, surrounding characters, and the spelling
// of two names (Jaro-Winkler). Nothing reads what the prose means.

import { normalizeKnowledgeName } from './normalize';

export const MENTION_CONTEXT_CHARS = 32;
export const MENTION_MAX_TEXT_CHARS = 120;

export type MentionField = 'title' | 'description' | 'content';
export type MentionRecordKind = 'task' | 'document';

export interface MentionSpan {
	start: number;
	end: number;
}

export interface MentionAnchor extends MentionSpan {
	field: MentionField;
	text: string;
	prefix: string;
	suffix: string;
}

export type MentionFields = Partial<Record<MentionField, string>>;

// ---------------------------------------------------------------------------
// Finding names

const WORD_CHAR = /[\p{L}\p{N}]/u;

function isWordChar(char: string | undefined): boolean {
	return Boolean(char) && WORD_CHAR.test(char!);
}

/**
 * Every place `name` appears in `text` on word boundaries, case-insensitive, left to right,
 * non-overlapping. "Phil" matches "Phil’s" and "(Phil)" but not "Philip".
 */
export function findNameSpans(text: string, name: string): MentionSpan[] {
	const needle = name.trim();
	if (!text || needle.length < 2) return [];
	const haystack = text.toLowerCase();
	const lower = needle.toLowerCase();
	// Lower-casing can change length for a few scripts; fall back to exact matching there.
	const sameLength = haystack.length === text.length && lower.length === needle.length;
	const source = sameLength ? haystack : text;
	const target = sameLength ? lower : needle;
	const spans: MentionSpan[] = [];
	let at = source.indexOf(target);
	while (at !== -1) {
		const end = at + target.length;
		const startsWord = !isWordChar(target[0]) || !isWordChar(text[at - 1]);
		const endsWord = !isWordChar(target[target.length - 1]) || !isWordChar(text[end]);
		if (startsWord && endsWord) {
			spans.push({ start: at, end });
			at = source.indexOf(target, end);
		} else {
			at = source.indexOf(target, at + 1);
		}
	}
	return spans;
}

/** The anchor for a span of `text`: its characters plus ~32 characters each side. */
export function anchorAt(
	text: string,
	span: MentionSpan,
	field: MentionField,
	context = MENTION_CONTEXT_CHARS
): MentionAnchor {
	return {
		field,
		start: span.start,
		end: span.end,
		text: text.slice(span.start, span.end),
		prefix: text.slice(Math.max(0, span.start - context), span.start),
		suffix: text.slice(span.end, span.end + context)
	};
}

/**
 * An anchor recovered from an older quote of the record ("…referred by Phil Valeo from
 * thecadretraining.com…"): the name's place in the quote gives its prefix and suffix. The offsets
 * are unknown (-1), so re-anchoring searches the current text. Null when the quote doesn't
 * contain the name.
 */
export function anchorFromQuote(
	quote: string,
	name: string,
	field: MentionField
): MentionAnchor | null {
	const clean = quote.replace(/^…|…$/g, '');
	const span = findNameSpans(clean, name)[0];
	if (!span) return null;
	const anchor = anchorAt(clean, span, field);
	return { ...anchor, start: -1, end: -1 };
}

// ---------------------------------------------------------------------------
// Context comparison on folded text (letters and digits only, lower case), so markdown markers,
// punctuation and spacing changes don't break an anchor.

interface Folded {
	text: string;
	/** For each folded character, its index in the original text. */
	index: number[];
}

function fold(text: string): Folded {
	const chars: string[] = [];
	const index: number[] = [];
	for (let i = 0; i < text.length; i++) {
		const char = text[i]!;
		if (!isWordChar(char)) continue;
		const lower = char.toLowerCase();
		if (lower.length !== 1) continue;
		chars.push(lower);
		index.push(i);
	}
	return { text: chars.join(''), index };
}

function foldString(text: string): string {
	return fold(text).text;
}

function commonSuffixLength(a: string, b: string): number {
	let n = 0;
	while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
	return n;
}

function commonPrefixLength(a: string, b: string): number {
	let n = 0;
	while (n < a.length && n < b.length && a[n] === b[n]) n++;
	return n;
}

/** 0..1: how much of the anchor's prefix/suffix surrounds `span` in `text`. Null with no context. */
function contextScore(text: string, span: MentionSpan, anchor: MentionAnchor): number | null {
	const prefix = foldString(anchor.prefix);
	const suffix = foldString(anchor.suffix);
	if (!prefix && !suffix) return null;
	const before = foldString(
		text.slice(Math.max(0, span.start - anchor.prefix.length - 16), span.start)
	);
	const after = foldString(text.slice(span.end, span.end + anchor.suffix.length + 16));
	const matched = commonSuffixLength(prefix, before) + commonPrefixLength(suffix, after);
	return matched / (prefix.length + suffix.length);
}

// ---------------------------------------------------------------------------
// Re-anchoring

export type MentionOutcome =
	| { status: 'same' | 'moved'; anchor: MentionAnchor }
	| { status: 'edited'; anchor: MentionAnchor; from: string }
	| { status: 'deleted' };

export interface MentionToAnchor {
	id: string;
	anchor: MentionAnchor;
}

/** A matched occurrence needs at least this share of its old surroundings (when it had any). */
const MIN_CONTEXT = 0.3;
/** Prefix/suffix keys shorter than this (folded) are too common to locate an edit. */
const MIN_KEY = 5;
const MAX_KEY = 24;
const KEY_LENGTHS = [MAX_KEY, 16, 10, MIN_KEY];

function overlaps(a: MentionSpan, b: MentionSpan): boolean {
	return a.start < b.end && b.start < a.end;
}

/**
 * Re-anchor every mention against the current field texts. Mentions are matched jointly, so two
 * mentions of the same name never claim the same place, and an occurrence claimed by one mention
 * isn't mistaken for another's.
 */
export function reanchorMentions(
	fields: MentionFields,
	mentions: MentionToAnchor[]
): Map<string, MentionOutcome> {
	const out = new Map<string, MentionOutcome>();
	const byField = new Map<MentionField, MentionToAnchor[]>();
	for (const mention of mentions) {
		const list = byField.get(mention.anchor.field) ?? [];
		list.push(mention);
		byField.set(mention.anchor.field, list);
	}
	for (const [field, list] of byField) {
		const text = fields[field];
		if (typeof text !== 'string') {
			for (const m of list) out.set(m.id, { status: 'deleted' });
			continue;
		}
		const claimed: MentionSpan[] = [];
		const free = (span: MentionSpan) => claimed.every((c) => !overlaps(c, span));
		const settle = (m: MentionToAnchor, span: MentionSpan) => {
			claimed.push(span);
			const anchor = anchorAt(text, span, field);
			const same = span.start === m.anchor.start && span.end === m.anchor.end;
			out.set(m.id, { status: same ? 'same' : 'moved', anchor });
		};

		// 1. Exact text still at the old offsets.
		const open: MentionToAnchor[] = [];
		for (const m of list) {
			const { start, end } = m.anchor;
			if (start >= 0 && text.slice(start, end) === m.anchor.text && free({ start, end })) {
				settle(m, { start, end });
			} else {
				open.push(m);
			}
		}

		// 2. The same text elsewhere: best surroundings first, then nearest to the old place.
		type Option = { m: MentionToAnchor; span: MentionSpan; score: number; distance: number };
		const options: Option[] = [];
		const occurrences = new Map<string, MentionSpan[]>();
		for (const m of open) {
			const key = m.anchor.text.toLowerCase();
			if (!occurrences.has(key)) occurrences.set(key, findNameSpans(text, m.anchor.text));
			for (const span of occurrences.get(key)!) {
				const score = contextScore(text, span, m.anchor);
				const exactCase = text.slice(span.start, span.end) === m.anchor.text ? 0.01 : 0;
				options.push({
					m,
					span,
					score: (score ?? 0.5) + exactCase,
					distance: m.anchor.start >= 0 ? Math.abs(span.start - m.anchor.start) : 0
				});
			}
		}
		// With no context to go on, a lone mention of a name takes its lone occurrence.
		const noContext = (m: MentionToAnchor) =>
			!foldString(m.anchor.prefix) && !foldString(m.anchor.suffix);
		// Longer names claim first among equals, so "Craig" never takes the "Craig" inside
		// "Craig's Equipment Repair" from that name.
		options.sort(
			(a, b) =>
				b.score - a.score ||
				b.m.anchor.text.length - a.m.anchor.text.length ||
				a.distance - b.distance
		);
		const done = new Set<string>();
		for (const option of options) {
			if (done.has(option.m.id) || !free(option.span)) continue;
			if (!noContext(option.m) && option.score < MIN_CONTEXT) continue;
			done.add(option.m.id);
			settle(option.m, option.span);
		}

		// 3. The surroundings without the text: edited in place, or deleted.
		const folded = fold(text);
		for (const m of open) {
			if (done.has(m.id)) continue;
			const edited = findEditedSpan(text, folded, m.anchor, free);
			if (!edited) {
				out.set(m.id, { status: 'deleted' });
				continue;
			}
			claimed.push(edited);
			out.set(m.id, {
				status: 'edited',
				anchor: anchorAt(text, edited, field),
				from: m.anchor.text
			});
		}
	}
	return out;
}

function allIndexes(haystack: string, needle: string): number[] {
	const out: number[] = [];
	if (!needle) return out;
	let at = haystack.indexOf(needle);
	while (at !== -1) {
		out.push(at);
		at = haystack.indexOf(needle, at + 1);
	}
	return out;
}

/** Trim a span to its first and last letter or digit (drops `**`, quotes, spaces). */
function trimSpan(text: string, span: MentionSpan): MentionSpan | null {
	let { start, end } = span;
	while (start < end && !isWordChar(text[start])) start++;
	while (end > start && !isWordChar(text[end - 1])) end--;
	if (end <= start) return null;
	// Keep a closing ")" or "." only when its pair is inside ("Inc.", "(US)") — simple: drop them.
	return { start, end };
}

/** The `count` words after `from` (or before `to`) in `text`. */
function adjacentWords(
	text: string,
	count: number,
	side: { from: number } | { to: number }
): MentionSpan | null {
	const words: MentionSpan[] = [];
	const re = /[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu;
	if ('from' in side) {
		re.lastIndex = side.from;
		let match: RegExpExecArray | null;
		while (words.length < count && (match = re.exec(text))) {
			// Stop at a line break: a name never runs across one.
			if (text.slice(words.at(-1)?.end ?? side.from, match.index).includes('\n')) break;
			words.push({ start: match.index, end: match.index + match[0].length });
		}
	} else {
		const all: MentionSpan[] = [];
		let match: RegExpExecArray | null;
		while ((match = re.exec(text)) && match.index < side.to) {
			all.push({ start: match.index, end: Math.min(match.index + match[0].length, side.to) });
		}
		for (let i = all.length - 1; i >= 0 && words.length < count; i--) {
			if (text.slice(all[i]!.end, words[0]?.start ?? side.to).includes('\n')) break;
			words.unshift(all[i]!);
		}
	}
	if (!words.length) return null;
	return { start: words[0]!.start, end: words[words.length - 1]!.end };
}

function findEditedSpan(
	text: string,
	folded: Folded,
	anchor: MentionAnchor,
	free: (span: MentionSpan) => boolean
): MentionSpan | null {
	const prefix = foldString(anchor.prefix);
	const suffix = foldString(anchor.suffix);
	// The longest key that still occurs: the far end of the old context may have been edited too
	// (or was markdown the quote didn't keep), the words next to the name usually survive.
	const pickKey = (side: string, tail: boolean): { key: string; hits: number[] } => {
		const tried = new Set<string>();
		for (const length of KEY_LENGTHS) {
			const key = tail ? side.slice(-length) : side.slice(0, length);
			if (key.length < MIN_KEY) break;
			if (tried.has(key)) continue;
			tried.add(key);
			const hits = allIndexes(folded.text, key);
			if (hits.length) return { key, hits };
		}
		return { key: tail ? side.slice(-MAX_KEY) : side.slice(0, MAX_KEY), hits: [] };
	};
	const pre = pickKey(prefix, true);
	const suf = pickKey(suffix, false);
	const preKey = pre.key;
	const sufKey = suf.key;
	const preEnds = pre.hits.map((i) => i + preKey.length);
	const sufStarts = suf.hits;
	const oldLength = Math.max(foldString(anchor.text).length, 1);
	const maxGap = Math.max(3 * oldLength, 40);
	const near = (at: number) => (anchor.start >= 0 ? Math.abs(at - anchor.start) : 0);
	const toOriginal = (foldedIndex: number) =>
		foldedIndex < folded.index.length ? folded.index[foldedIndex]! : text.length;

	// Both sides: the text between the end of the prefix and the start of the suffix.
	let best: { span: MentionSpan; distance: number } | null = null;
	let bothSidesFoundButEmpty = false;
	for (const pe of preEnds) {
		for (const ss of sufStarts) {
			if (ss < pe || ss - pe > maxGap) continue;
			if (ss === pe) {
				bothSidesFoundButEmpty = true;
				continue;
			}
			const from = folded.index[pe - 1]! + 1;
			const to = toOriginal(ss);
			const span = trimSpan(text, { start: from, end: to });
			if (!span || span.end - span.start > MENTION_MAX_TEXT_CHARS || !free(span)) continue;
			const distance = near(span.start);
			if (!best || distance < best.distance) best = { span, distance };
		}
	}
	if (best) return best.span;
	// The prefix runs straight into the suffix: the name was cut out.
	if (bothSidesFoundButEmpty) return null;

	// One side: as many words as the old text had, next to it.
	const words = Math.max(1, anchor.text.trim().split(/\s+/).length);
	if (preEnds.length && !sufStarts.length && sufKey.length < MIN_KEY) {
		const pe = preEnds.sort(
			(a, b) => near(folded.index[a - 1]!) - near(folded.index[b - 1]!)
		)[0]!;
		const span = adjacentWords(text, words, { from: folded.index[pe - 1]! + 1 });
		return span && free(span) ? span : null;
	}
	if (sufStarts.length && !preEnds.length && preKey.length < MIN_KEY) {
		const ss = sufStarts.sort((a, b) => near(toOriginal(a)) - near(toOriginal(b)))[0]!;
		const span = adjacentWords(text, words, { to: toOriginal(ss) });
		return span && free(span) ? span : null;
	}
	return null;
}

// ---------------------------------------------------------------------------
// Name similarity (spelling only)

/** Jaro-Winkler similarity of two strings, 0..1. */
export function jaroWinkler(a: string, b: string): number {
	if (a === b) return a.length ? 1 : 0;
	if (!a.length || !b.length) return 0;
	const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
	const aMatch = new Array<boolean>(a.length).fill(false);
	const bMatch = new Array<boolean>(b.length).fill(false);
	let matches = 0;
	for (let i = 0; i < a.length; i++) {
		const from = Math.max(0, i - window);
		const to = Math.min(i + window + 1, b.length);
		for (let j = from; j < to; j++) {
			if (bMatch[j] || a[i] !== b[j]) continue;
			aMatch[i] = bMatch[j] = true;
			matches++;
			break;
		}
	}
	if (!matches) return 0;
	let t = 0;
	let k = 0;
	for (let i = 0; i < a.length; i++) {
		if (!aMatch[i]) continue;
		while (!bMatch[k]) k++;
		if (a[i] !== b[k]) t++;
		k++;
	}
	const jaro = (matches / a.length + matches / b.length + (matches - t / 2) / matches) / 3;
	let prefix = 0;
	while (prefix < 4 && prefix < a.length && prefix < b.length && a[prefix] === b[prefix])
		prefix++;
	return jaro + prefix * 0.1 * (1 - jaro);
}

/** Lower-case letter/digit tokens, accents removed; single-letter initials dropped. */
export function nameTokens(name: string): string[] {
	const tokens = name
		.normalize('NFKD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.split(/[^\p{L}\p{N}]+/u)
		.filter(Boolean);
	const long = tokens.filter((t) => t.length > 1);
	return long.length ? long : tokens;
}

/**
 * How two names relate by spelling:
 *   same      the same letters ("Magnum-LPL" / "Magnum/LPL")
 *   spelling  a spelling variant: compatible first names and a close last name
 *             ("Phil Valeo" / "Phillip Velayo", "Phil Velayo" / "Phillip Velayo")
 *   possible  compatible first names, last names start alike but differ more
 *             ("Phil Vallejo" / "Phil Velayo")
 *   short     one is a one-word name that fits the other's first name ("Phil" / "Phil Velayo")
 *   none      unrelated
 */
export type NameRelation = 'same' | 'spelling' | 'possible' | 'short' | 'none';

export const NAME_SPELLING_MIN = 0.85;
export const NAME_POSSIBLE_MIN = 0.65;
const ORG_SPELLING_MIN = 0.94;

function firstNamesCompatible(a: string, b: string): boolean {
	if (a === b) return true;
	const [short, long] = a.length <= b.length ? [a, b] : [b, a];
	if (short.length >= 3 && long.startsWith(short)) return true;
	return jaroWinkler(a, b) >= 0.9;
}

export function nameRelation(
	kind: string,
	a: string,
	b: string
): { relation: NameRelation; score: number } {
	const ta = nameTokens(a);
	const tb = nameTokens(b);
	if (!ta.length || !tb.length) return { relation: 'none', score: 0 };
	if (ta.join('') === tb.join('')) return { relation: 'same', score: 1 };
	if (kind !== 'person') {
		const score = jaroWinkler(ta.join(' '), tb.join(' '));
		const long = Math.min(ta.join('').length, tb.join('').length) >= 6;
		return score >= ORG_SPELLING_MIN && long
			? { relation: 'spelling', score }
			: { relation: 'none', score };
	}
	if (ta.length === 1 || tb.length === 1) {
		const [single, full] = ta.length === 1 ? [ta, tb] : [tb, ta];
		if (full.length > 1 && firstNamesCompatible(single[0]!, full[0]!))
			return { relation: 'short', score: 0.5 };
		return { relation: 'none', score: 0 };
	}
	if (!firstNamesCompatible(ta[0]!, tb[0]!)) return { relation: 'none', score: 0 };
	const lastA = ta[ta.length - 1]!;
	const lastB = tb[tb.length - 1]!;
	const score = jaroWinkler(lastA, lastB);
	if (score >= NAME_SPELLING_MIN) return { relation: 'spelling', score };
	if (score >= NAME_POSSIBLE_MIN && lastA[0] === lastB[0]) return { relation: 'possible', score };
	return { relation: 'none', score };
}

// ---------------------------------------------------------------------------
// Planning one record's mentions after a read

export interface StoredMention {
	id: string;
	entity_id: string;
	field: MentionField;
	start_offset: number;
	end_offset: number;
	text: string;
	prefix: string;
	suffix: string;
	made_by: 'reader' | 'user';
	status: 'active' | 'removed';
}

/** What a reader reports for the record: an entry and the words it may appear as. */
export interface MentionReaderName {
	entityId: string;
	kind: string;
	/** Name variants as written (display, value, short quote); longest is tried first. */
	names: string[];
}

export interface MentionDraft {
	/** Existing row id when the mention was re-anchored. */
	id?: string;
	entity_id: string | null;
	field: MentionField;
	start_offset: number;
	end_offset: number;
	text: string;
	prefix: string;
	suffix: string;
	made_by: 'reader' | 'user';
	status: 'active' | 'removed';
	/** For an edited mention whose new name has no entry yet: the name to file. */
	pending_name?: string;
}

export interface MentionCorrection {
	mentionId: string;
	oldEntityId: string;
	from: string;
	to: string;
	/** The reader's entry at the edited place, when it reported one. */
	newEntityId: string | null;
	relation: NameRelation;
	score: number;
	field: MentionField;
}

export interface MentionPlan {
	mentions: MentionDraft[];
	counts: {
		same: number;
		moved: number;
		edited: number;
		deleted: number;
		added: number;
		/** Tags grown to the fuller name around them ("Strategies" → "Wayne Strategies"). */
		widened: number;
	};
	corrections: MentionCorrection[];
	deleted: Array<{ mentionId: string; entityId: string; text: string; field: MentionField }>;
	/** Entries with at least one active mention after the plan. */
	present: Set<string>;
	/** Entries the user removed every tag of here. */
	removedByUser: Set<string>;
	/**
	 * Entries left with no tag here because each of theirs sat inside a fuller name ("Strategies"
	 * inside "Wayne Strategies"): the reader saw only part of that name.
	 */
	absorbed: Set<string>;
}

export interface PlanMentionsInput {
	fields: MentionFields;
	existing: StoredMention[];
	/** Old anchors recovered from link quotes (no offsets), for records anchored before 167. */
	seeds?: Array<{ entityId: string; anchor: MentionAnchor }>;
	/** What the reader found this time. */
	reader: MentionReaderName[];
	/** Other entries linked to the record: every place their name appears is tagged too. */
	linked?: MentionReaderName[];
	/**
	 * The owner's other entries whose names could complete a tag ("Wayne Strategies" for a tag on
	 * "Strategies"). Used only to widen tags already placed, never to tag a new place.
	 */
	fuller?: MentionReaderName[];
	/** The kind of each entry id (for spelling rules). */
	kinds: Map<string, string>;
}

function draftFrom(
	anchor: MentionAnchor,
	entityId: string | null,
	extra: Partial<MentionDraft> = {}
): MentionDraft {
	return {
		entity_id: entityId,
		field: anchor.field,
		start_offset: anchor.start,
		end_offset: anchor.end,
		text: anchor.text.slice(0, 300),
		prefix: anchor.prefix.slice(-64),
		suffix: anchor.suffix.slice(0, 64),
		made_by: 'reader',
		status: 'active',
		...extra
	};
}

/**
 * One record's mentions after a read: re-anchor what was there, turn edited places into
 * corrections (or deletions when the new words aren't a name), and tag every place the reader's
 * names (and other linked entries' names) appear that isn't tagged yet. A spot the user removed
 * a tag from stays removed.
 */
export function planRecordMentions(input: PlanMentionsInput): MentionPlan {
	const seeds = (input.seeds ?? []).map((seed, i) => ({
		id: `seed:${i}`,
		entityId: seed.entityId,
		anchor: seed.anchor
	}));
	const toAnchor: MentionToAnchor[] = [
		...input.existing.map((m) => ({
			id: m.id,
			anchor: {
				field: m.field,
				start: m.start_offset,
				end: m.end_offset,
				text: m.text,
				prefix: m.prefix,
				suffix: m.suffix
			}
		})),
		...seeds.map((s) => ({ id: s.id, anchor: s.anchor }))
	];
	const outcomes = reanchorMentions(input.fields, toAnchor);
	const stored = new Map(input.existing.map((m) => [m.id, m]));
	const seedById = new Map(seeds.map((s) => [s.id, s]));

	const counts = { same: 0, moved: 0, edited: 0, deleted: 0, added: 0, widened: 0 };
	const mentions: MentionDraft[] = [];
	const corrections: MentionCorrection[] = [];
	const deleted: MentionPlan['deleted'] = [];

	// Reader spans, computed once: entry → spans per field.
	const readerSpans: Array<{
		entityId: string;
		field: MentionField;
		span: MentionSpan;
		length: number;
	}> = [];
	const addSpans = (names: MentionReaderName[], target: typeof readerSpans) => {
		for (const name of names) {
			const variants = [
				...new Set(name.names.map((n) => n.trim()).filter((n) => n.length >= 2))
			].sort((a, b) => b.length - a.length);
			for (const field of Object.keys(input.fields) as MentionField[]) {
				const text = input.fields[field] ?? '';
				const taken: MentionSpan[] = [];
				for (const variant of variants) {
					// A one-word name counts only as written ("Pistol", not "pistol"): ordinary
					// words share spellings with one-word entries. Full names match any case.
					const oneWord = !/\s/.test(variant);
					for (const span of findNameSpans(text, variant)) {
						if (oneWord && text.slice(span.start, span.end) !== variant) continue;
						if (taken.some((t) => overlaps(t, span))) continue;
						taken.push(span);
						target.push({
							entityId: name.entityId,
							field,
							span,
							length: span.end - span.start
						});
					}
				}
			}
		}
	};
	addSpans(input.reader, readerSpans);
	const linkedSpans: typeof readerSpans = [];
	addSpans(input.linked ?? [], linkedSpans);
	const readerAt = (field: MentionField, span: MentionSpan) =>
		readerSpans
			.filter((r) => r.field === field && overlaps(r.span, span))
			.sort((a, b) => b.length - a.length)[0];

	for (const item of toAnchor) {
		const outcome = outcomes.get(item.id)!;
		const row = stored.get(item.id);
		const seed = seedById.get(item.id);
		const entityId = row?.entity_id ?? seed!.entityId;
		const madeBy = row?.made_by ?? 'reader';
		const status = row?.status ?? 'active';
		const keepId = row ? { id: row.id } : {};
		if (outcome.status === 'deleted') {
			if (row) counts.deleted++;
			if (status === 'active') {
				deleted.push({
					mentionId: item.id,
					entityId,
					text: item.anchor.text,
					field: item.anchor.field
				});
			}
			continue;
		}
		if (outcome.status === 'same' || outcome.status === 'moved') {
			counts[outcome.status]++;
			mentions.push(
				draftFrom(outcome.anchor, entityId, { ...keepId, made_by: madeBy, status })
			);
			continue;
		}
		// Edited in place.
		const from = (outcome as Extract<MentionOutcome, { status: 'edited' }>).from;
		counts.edited++;
		if (status === 'removed') {
			// The user removed this tag; the spot keeps that answer whatever it now says.
			mentions.push(
				draftFrom(outcome.anchor, entityId, { ...keepId, made_by: madeBy, status })
			);
			continue;
		}
		const kind = input.kinds.get(entityId) ?? 'person';
		const reader = readerAt(outcome.anchor.field, outcome.anchor);
		if (reader && reader.entityId === entityId) {
			// The reader still files the new words under the same entry (an alias): just follow.
			const span = reader.span;
			const text = input.fields[outcome.anchor.field] ?? '';
			mentions.push(
				draftFrom(anchorAt(text, span, outcome.anchor.field), entityId, {
					...keepId,
					made_by: madeBy
				})
			);
			continue;
		}
		const newText =
			reader && input.fields[outcome.anchor.field]
				? input.fields[outcome.anchor.field]!.slice(reader.span.start, reader.span.end)
				: outcome.anchor.text;
		const { relation, score } = nameRelation(kind, from, newText);
		if (relation === 'none') {
			// The new words aren't a spelling of the old name: either ordinary words ("Phil Valeo"
			// → "a friend") or a different name the reader tags below. The old tag was deleted.
			deleted.push({ mentionId: item.id, entityId, text: from, field: outcome.anchor.field });
			continue;
		}
		const anchor = reader
			? anchorAt(input.fields[outcome.anchor.field]!, reader.span, outcome.anchor.field)
			: outcome.anchor;
		corrections.push({
			mentionId: item.id,
			oldEntityId: entityId,
			from: from,
			to: anchor.text,
			newEntityId: reader?.entityId ?? null,
			relation,
			score,
			field: anchor.field
		});
		mentions.push(
			draftFrom(anchor, reader?.entityId ?? null, {
				...keepId,
				made_by: madeBy,
				...(reader ? {} : { pending_name: anchor.text })
			})
		);
	}

	// New tags: every reader/linked occurrence not already tagged (or removed) at that spot.
	const taken = () =>
		mentions.map((m) => ({
			field: m.field,
			span: { start: m.start_offset, end: m.end_offset }
		}));
	const candidates = [...readerSpans, ...linkedSpans].sort((a, b) => b.length - a.length);
	for (const candidate of candidates) {
		const clash = taken().some(
			(t) => t.field === candidate.field && overlaps(t.span, candidate.span)
		);
		if (clash) continue;
		const text = input.fields[candidate.field] ?? '';
		mentions.push(
			draftFrom(anchorAt(text, candidate.span, candidate.field), candidate.entityId)
		);
		counts.added++;
	}

	const fullerSpans: typeof readerSpans = [];
	addSpans(input.fuller ?? [], fullerSpans);
	const absorbedFrom = widenToFullerNames(input.fields, mentions, [
		...readerSpans,
		...linkedSpans,
		...fullerSpans
	]);
	counts.widened = absorbedFrom.widened;

	mentions.sort((a, b) => a.field.localeCompare(b.field) || a.start_offset - b.start_offset);
	// A spot still tagged with the same name under another entry (two entries for one person)
	// wasn't deleted; it was claimed by the other entry.
	const taggedNames = new Set(
		mentions.filter((m) => m.status === 'active').map((m) => normalizeKnowledgeName(m.text))
	);
	const reallyDeleted = deleted.filter((d) => !taggedNames.has(normalizeKnowledgeName(d.text)));
	deleted.splice(0, deleted.length, ...reallyDeleted);
	const present = new Set(
		mentions.filter((m) => m.status === 'active' && m.entity_id).map((m) => m.entity_id!)
	);
	const removedByUser = new Set(
		mentions
			.filter((m) => m.status === 'removed' && m.entity_id && !present.has(m.entity_id))
			.map((m) => m.entity_id!)
	);
	const absorbed = new Set([...absorbedFrom.entities].filter((id) => !present.has(id)));
	return { mentions, counts, corrections, deleted, present, removedByUser, absorbed };
}

/**
 * The fuller span adds at least one word to the tag: not just a possessive ("Cindy" → "Cindy's")
 * or punctuation ("Jr" → "Jr."), which are the same name written differently, not a longer one.
 */
export function addsWords(text: string, inner: MentionSpan, outer: MentionSpan): boolean {
	const extra = `${text.slice(outer.start, inner.start)} ${text.slice(inner.end, outer.end)}`;
	return /[\p{L}\p{N}]/u.test(extra.replace(/['’]s(?![\p{L}\p{N}])/gu, ''));
}

/**
 * A reader often sees only part of a name: the doc model reads "Wayne Strategies" as the person
 * "Wayne" and the organization "Strategies". When a reader-made tag sits inside a longer name
 * the owner already has an entry for (or a longer spelling of its own entry, after a rename),
 * the tag grows to cover that name and moves to that entry. Other reader tags inside the same
 * name fold into it. The user's own tags and spots they removed a tag from are never touched.
 * Pure span arithmetic on names from the database; nothing here reads what the prose means.
 * Mutates `mentions`; returns the entries that gave up tags.
 */
function widenToFullerNames(
	fields: MentionFields,
	mentions: MentionDraft[],
	names: Array<{ entityId: string; field: MentionField; span: MentionSpan; length: number }>
): { entities: Set<string>; widened: number } {
	const entities = new Set<string>();
	let widened = 0;
	const spanOf = (m: MentionDraft) => ({ start: m.start_offset, end: m.end_offset });
	for (const m of [...mentions]) {
		if (!mentions.includes(m)) continue;
		if (m.status !== 'active' || m.made_by !== 'reader' || !m.entity_id || m.pending_name)
			continue;
		const text = fields[m.field] ?? '';
		const best = names
			.filter(
				(n) =>
					n.field === m.field &&
					n.span.start <= m.start_offset &&
					n.span.end >= m.end_offset &&
					n.length > m.end_offset - m.start_offset &&
					addsWords(text, spanOf(m), n.span)
			)
			.sort((a, b) => b.length - a.length)[0];
		if (!best) continue;
		const others = mentions.filter(
			(o) => o !== m && o.field === m.field && overlaps(spanOf(o), best.span)
		);
		const blocked = others.some(
			(o) =>
				o.made_by !== 'reader' ||
				o.status !== 'active' ||
				Boolean(o.pending_name) ||
				o.start_offset < best.span.start ||
				o.end_offset > best.span.end
		);
		if (blocked) continue;
		for (const o of others) {
			mentions.splice(mentions.indexOf(o), 1);
			if (o.entity_id && o.entity_id !== best.entityId) entities.add(o.entity_id);
		}
		if (m.entity_id !== best.entityId) entities.add(m.entity_id);
		Object.assign(
			m,
			draftFrom(anchorAt(text, best.span, m.field), best.entityId, {
				...(m.id ? { id: m.id } : {}),
				made_by: 'reader',
				status: 'active'
			})
		);
		widened++;
	}
	return { entities, widened };
}

// ---------------------------------------------------------------------------
// Renaming the words in place (the explicit "Update the name in N places" action)

export interface MentionRename {
	/** Where the mention is now (re-anchored just before). */
	start: number;
	end: number;
	/** The characters expected there; the change is skipped if they differ. */
	expect: string;
	to: string;
}

/**
 * Replace exactly the given spans of `text` (right to left, so offsets stay valid). Spans that
 * overlap or whose characters no longer match are skipped and reported.
 */
export function applyMentionRenames(
	text: string,
	renames: MentionRename[]
): {
	text: string;
	applied: MentionRename[];
	skipped: MentionRename[];
	shifted: Map<MentionRename, MentionSpan>;
} {
	const sorted = [...renames].sort((a, b) => a.start - b.start);
	const applied: MentionRename[] = [];
	const skipped: MentionRename[] = [];
	let last = -1;
	for (const rename of sorted) {
		if (rename.start < last || text.slice(rename.start, rename.end) !== rename.expect) {
			skipped.push(rename);
			continue;
		}
		applied.push(rename);
		last = rename.end;
	}
	let out = text;
	for (const rename of [...applied].reverse()) {
		out = out.slice(0, rename.start) + rename.to + out.slice(rename.end);
	}
	// New spans: each applied rename shifts the ones after it.
	const shifted = new Map<MentionRename, MentionSpan>();
	let delta = 0;
	for (const rename of applied) {
		const start = rename.start + delta;
		shifted.set(rename, { start, end: start + rename.to.length });
		delta += rename.to.length - (rename.end - rename.start);
	}
	return { text: out, applied, skipped, shifted };
}

/** Normalized name key, shared with the store's exact-name matching. */
export function mentionNameKey(name: string): string {
	return normalizeKnowledgeName(name);
}

// ---------------------------------------------------------------------------
// "Update the name in N places": which tags still spell an entry differently

/** The sentence (or line) around a span, trimmed to ~160 characters, with the span's offsets in it. */
export function sentenceAround(
	text: string,
	span: MentionSpan,
	max = 160
): { text: string; start: number; end: number } {
	// A sentence ends at ! ? or a line break, or at a full stop followed by a space ("….com" and
	// "Inc." mid-sentence don't end it).
	const endsAt = (i: number) =>
		/[!?\n]/.test(text[i] ?? '') ||
		(text[i] === '.' && (i + 1 >= text.length || /\s/.test(text[i + 1]!)));
	let from = span.start;
	while (from > 0 && !endsAt(from - 1) && span.start - from < max / 2) from--;
	let to = span.end;
	while (to < text.length && !endsAt(to) && to - span.end < max / 2) to++;
	if (to < text.length && /[.!?]/.test(text[to]!)) to++;
	const raw = text.slice(from, to);
	const lead = raw.length - raw.trimStart().length;
	const sentence = raw.trim();
	const prefix = from > 0 && !endsAt(from - 1) ? '…' : '';
	const suffix = to < text.length && !endsAt(to - 1) ? '…' : '';
	const start = span.start - from - lead + prefix.length;
	return {
		text: `${prefix}${sentence}${suffix}`,
		start,
		end: start + (span.end - span.start)
	};
}

/**
 * Whether a tag's words should be offered for renaming to the entry's current name: they spell
 * a different full name. Short references (one word: "Phil", "Velayo") are left alone, since
 * people write those on purpose.
 */
export function offersRename(mentionText: string, entryName: string): boolean {
	const words = nameTokens(mentionText);
	if (words.length < 2) return false;
	return words.join(' ') !== nameTokens(entryName).join(' ');
}
