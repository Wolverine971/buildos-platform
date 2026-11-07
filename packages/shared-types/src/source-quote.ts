// packages/shared-types/src/source-quote.ts
//
// Finds a model-supplied quote inside the user's own text, as character offsets. This is
// string matching on words the model copied out (exact → close → fuzzy), not a guess at what
// the text means. Used by the dump-sort lab and by chat writes' `from_quote` (tasker 155).

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
	used: readonly SourceQuoteSpan[]
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
		if (!overlaps(span, used)) return span;
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

/** Exact, then case/space/punctuation-insensitive, inside `window`; skips spans in `used`. */
export function findQuoteExactOrClose(
	text: string,
	window: SourceQuoteSpan,
	quote: string,
	used: readonly SourceQuoteSpan[] = []
): (SourceQuoteSpan & { match: SourceQuoteMatch }) | null {
	if (!quote.trim()) return null;
	const exactAt = text.slice(window.start, window.end).indexOf(quote);
	if (exactAt >= 0) {
		const span = { start: window.start + exactAt, end: window.start + exactAt + quote.length };
		if (!overlaps(span, used)) return { ...span, match: 'exact' };
	}
	const close = findNormalized(text, window, quote, used);
	return close ? { ...close, match: 'close' } : null;
}

/** In-order word match: at least 75% of the quote's words found, close together. */
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

/** The quote's place in the whole text, or null when it isn't there. */
export function locateSourceQuote(
	text: string,
	quote: string,
	used: readonly SourceQuoteSpan[] = []
): (SourceQuoteSpan & { match: SourceQuoteMatch }) | null {
	const whole = { start: 0, end: text.length };
	return (
		findQuoteExactOrClose(text, whole, quote, used) ?? findQuoteFuzzy(text, whole, quote, used)
	);
}
