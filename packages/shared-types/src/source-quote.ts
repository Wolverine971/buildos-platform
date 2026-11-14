// packages/shared-types/src/source-quote.ts
//
// Finds a model-supplied quote inside the user's own text, as character offsets. This is
// string matching on words the model copied out, not a guess at what the text means. Used by
// the dump-sort lab and by chat writes' `from_quote` (tasker 155).
//
// `locateSourceQuote` only accepts the same words in the same order (exact, then ignoring case,
// spacing and punctuation), on whole words. A quote that is merely similar gets no match: a
// missed highlight is harmless, a highlight on the wrong words is a false claim. The looser
// in-order word match (`findQuoteFuzzy`) is kept for the lab, which asks for it by name.

export type SourceQuoteSpan = { start: number; end: number };
export type SourceQuoteMatch = 'exact' | 'close' | 'fuzzy';

/** Lowercases, straightens quotes and dashes, and collapses whitespace, keeping a map from
 * each normalized character back to its index in the original. */
function normalizeWithMap(text: string): { value: string; map: number[] } {
	let value = '';
	const map: number[] = [];
	let lastWasSpace = false;
	for (let index = 0; index < text.length; index++) {
		let char = (text[index] ?? '').toLowerCase();
		if (char === '‘' || char === '’') char = "'";
		else if (char === '“' || char === '”') char = '"';
		else if (char === '–' || char === '—') char = '-';
		if (/\s/.test(char)) {
			if (lastWasSpace) continue;
			char = ' ';
			lastWasSpace = true;
		} else lastWasSpace = false;
		value += char;
		map.push(index);
	}
	return { value, map };
}

function overlaps(span: SourceQuoteSpan, used: readonly SourceQuoteSpan[]): boolean {
	return used.some((other) => span.start < other.end && other.start < span.end);
}

function findNormalized(
	text: string,
	window: SourceQuoteSpan,
	quote: string,
	used: readonly SourceQuoteSpan[],
	sourceWords: readonly Word[]
): SourceQuoteSpan | null {
	const source = normalizeWithMap(text.slice(window.start, window.end));
	const needle = normalizeWithMap(quote.trim()).value.replace(/^[\s"'.,]+|[\s"'.,]+$/g, '');
	if (!needle) return null;
	let from = 0;
	while (from <= source.value.length) {
		const at = source.value.indexOf(needle, from);
		if (at < 0) return null;
		const span = {
			start: window.start + (source.map[at] ?? 0),
			end: window.start + (source.map[at + needle.length - 1] ?? 0) + 1
		};
		if (!overlaps(span, used) && !cutsWord(span, sourceWords)) return span;
		from = at + 1;
	}
	return null;
}

type Word = { word: string; start: number; end: number };

// This package compiles against an older lib, so Intl.Segmenter is typed here.
type WordSegmenter = {
	segment(text: string): Iterable<{ segment: string; index: number; isWordLike?: boolean }>;
};
const IntlWithSegmenter = Intl as unknown as {
	Segmenter: new (locale: string, options: { granularity: 'word' }) => WordSegmenter;
};

function words(text: string, offset: number): Word[] {
	const segmenter = new IntlWithSegmenter.Segmenter('en', { granularity: 'word' });
	const out: Word[] = [];
	for (const part of segmenter.segment(text)) {
		if (!part.isWordLike) continue;
		out.push({
			word: part.segment.toLowerCase(),
			start: offset + part.index,
			end: offset + part.index + part.segment.length
		});
	}
	return out;
}

/** True when the span starts or ends inside a word ("art" inside "partner"). */
function cutsWord(span: SourceQuoteSpan, source: readonly Word[]): boolean {
	return source.some(
		(word) =>
			(word.start < span.start && span.start < word.end) ||
			(word.start < span.end && span.end < word.end)
	);
}

const sameWord = (left: string, right: string) =>
	left.replace(/[‘’]/g, "'") === right.replace(/[‘’]/g, "'");

/** The quote's words, all of them, in order and next to each other; punctuation between ignored. */
function findWordRun(
	source: readonly Word[],
	quote: string,
	used: readonly SourceQuoteSpan[]
): SourceQuoteSpan | null {
	const target = words(quote, 0).map((entry) => entry.word);
	if (target.length === 0) return null;
	for (let begin = 0; begin + target.length <= source.length; begin++) {
		let matched = 0;
		while (matched < target.length && sameWord(source[begin + matched]!.word, target[matched]!))
			matched++;
		if (matched < target.length) continue;
		const span = {
			start: source[begin]!.start,
			end: source[begin + target.length - 1]!.end
		};
		if (!overlaps(span, used)) return span;
	}
	return null;
}

/**
 * Exact, then the same words ignoring case, spacing and punctuation, inside `window`. Whole
 * words only; skips spans in `used`.
 */
export function findQuoteExactOrClose(
	text: string,
	window: SourceQuoteSpan,
	quote: string,
	used: readonly SourceQuoteSpan[] = []
): (SourceQuoteSpan & { match: SourceQuoteMatch }) | null {
	if (!quote.trim()) return null;
	const haystack = text.slice(window.start, window.end);
	const source = words(haystack, window.start);
	let from = 0;
	while (from <= haystack.length) {
		const exactAt = haystack.indexOf(quote, from);
		if (exactAt < 0) break;
		const span = { start: window.start + exactAt, end: window.start + exactAt + quote.length };
		if (!overlaps(span, used) && !cutsWord(span, source)) return { ...span, match: 'exact' };
		from = exactAt + 1;
	}
	const close = findNormalized(text, window, quote, used, source);
	if (close) return { ...close, match: 'close' };
	const run = findWordRun(source, quote, used);
	return run ? { ...run, match: 'close' } : null;
}

/**
 * In-order word match: at least 75% of the quote's words found, close together. Loose on
 * purpose and able to land on different words than the quote; only the dump-sort lab uses it.
 * Never used for chat highlights (`locateSourceQuote`).
 */
export function findQuoteFuzzy(
	text: string,
	window: SourceQuoteSpan,
	quote: string,
	used: readonly SourceQuoteSpan[] = []
): (SourceQuoteSpan & { match: SourceQuoteMatch }) | null {
	const target = words(quote, 0).map((entry) => entry.word);
	if (target.length === 0) return null;
	const source = words(text.slice(window.start, window.end), window.start);
	const maxGap = Math.ceil(target.length * 1.5) + 2;
	let best: { span: SourceQuoteSpan; score: number } | null = null;
	for (let begin = 0; begin < source.length; begin++) {
		if (!target.includes(source[begin]!.word)) continue;
		let ti = 0;
		let matched = 0;
		let first = -1;
		let last = -1;
		for (let si = begin; si < source.length && si - begin <= maxGap; si++) {
			const found = target.indexOf(source[si]!.word, ti);
			if (found < 0) continue;
			matched += 1;
			ti = found + 1;
			if (first < 0) first = si;
			last = si;
			if (ti >= target.length) break;
		}
		const score = matched / target.length;
		if (first < 0 || score < 0.75) continue;
		const span = { start: source[first]!.start, end: source[last]!.end };
		if (overlaps(span, used)) continue;
		if (!best || score > best.score) best = { span, score };
	}
	return best ? { ...best.span, match: 'fuzzy' } : null;
}

/**
 * The quote's place in the whole text, or null when those words aren't there. Exact or the same
 * words ignoring case, spacing and punctuation; never a "similar enough" match.
 */
export function locateSourceQuote(
	text: string,
	quote: string,
	used: readonly SourceQuoteSpan[] = []
): (SourceQuoteSpan & { match: SourceQuoteMatch }) | null {
	return findQuoteExactOrClose(text, { start: 0, end: text.length }, quote, used);
}
