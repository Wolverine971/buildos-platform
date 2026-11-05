// apps/web/src/lib/server/dump-sort/dump-sort-core.ts
//
// "Watch it sort" prototype (DJ, 2026-11-04). Stage 1 (this file's router): one streamed
// call says which project each piece of a brain dump belongs to, one JSON line per piece, so
// the page can highlight each phrase and fly it to its project while the model still writes.
// Stage 2 (dump-sort-thread-core.ts) then looks inside each project and decides what to
// update, create, or answer.
//
// This file is pure: sentence numbering, the prompt, reading one streamed line, and
// finding the model's quoted words in the dump. The model decides what the words mean (a
// structured answer, no keyword rules, AGENTS.md). Finding a quote is string matching on a
// span the model copied, not classification.

export const DUMP_SORT_OPERATION = 'dump_sort_lab';
export const DUMP_SORT_MAX_CHARS = 6000;

export type DumpSentence = { n: number; start: number; end: number };

export type DumpKind =
	| 'project'
	| 'context'
	| 'goal'
	| 'milestone'
	| 'task'
	| 'doc'
	| 'risk'
	| 'update'
	| 'ask'
	/** Chat lab only: a bigger job for a thread (research what a project holds, draft a plan). */
	| 'work';

export const DUMP_KINDS: readonly DumpKind[] = [
	'project',
	'context',
	'goal',
	'milestone',
	'task',
	'doc',
	'risk',
	'update',
	'ask',
	'work'
];

export type DumpMatch = 'exact' | 'close' | 'fuzzy' | 'sentence' | 'none';

export type DumpProject = {
	alias: string;
	id: string | null;
	name: string;
	description: string | null;
};

export type DumpFocus = { focus: string[]; created: { alias: string; name: string }[] };

export type DumpItem = {
	n: number;
	sentence: number;
	kind: DumpKind;
	to: string;
	title: string;
	quote: string;
	due: string | null;
	start: number;
	end: number;
	match: DumpMatch;
};

export type DumpLine =
	| { type: 'focus'; focus: DumpFocus }
	| { type: 'item'; item: Omit<DumpItem, 'n' | 'start' | 'end' | 'match'> }
	| { type: 'skip'; reason: string };

// ---------------------------------------------------------------------------
// Sentences
// ---------------------------------------------------------------------------

/** Numbers the dump by sentence (and by line, since dumps are often lists). Offsets point
 * into the original text so highlights land on exactly what the person typed. */
export function splitSentences(text: string): DumpSentence[] {
	// Split at end punctuation followed by space, and at line breaks. Brain dumps often start
	// sentences in lowercase, which Intl.Segmenter won't split on. Over-splitting (e.g. "e.g.")
	// only makes the numbering finer.
	const sentences: DumpSentence[] = [];
	const push = (start: number, end: number) => {
		const raw = text.slice(start, end);
		const lead = raw.length - raw.trimStart().length;
		const body = raw.trim();
		if (!body) return;
		sentences.push({
			n: sentences.length + 1,
			start: start + lead,
			end: start + lead + body.length
		});
	};
	let start = 0;
	for (const boundary of text.matchAll(/[.!?]+["')\]]*(?=\s)|\n/g)) {
		const end = (boundary.index ?? 0) + (boundary[0] === '\n' ? 0 : boundary[0].length);
		push(start, end);
		start = (boundary.index ?? 0) + boundary[0].length;
	}
	push(start, text.length);
	return sentences;
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

export const DUMP_SORT_SYSTEM_PROMPT = `You sort a person's brain dump into their BuildOS projects. The dump's sentences are numbered [1], [2], ...

Output JSON Lines only: one JSON object per line. No prose, no code fences, no array.

First line, always: {"focus":["P2"],"new":[{"id":"N1","name":"Kitchen remodel"}]}
- focus: listed projects (P#) the dump talks about, most important first.
- new: projects the dump clearly starts that are not listed. Usually []. Never a new project for a single loose task; that goes to "W".

Then one line per item, in the order they appear in the dump:
{"s":3,"q":"email Priya about the cover","kind":"task","to":"P2","title":"Email Priya about the cover sketches"}
- s: the sentence number the item comes from.
- q: the person's exact words this item comes from, copied character for character from sentence s (typos included), usually 2 to 12 words. Never paraphrase q.
- kind, pick one:
  project: the words that name a new project (to = its N#).
  context: a fact about what the project is or why it matters.
  goal: an outcome they want.
  milestone: a checkpoint, phase, or dated target.
  task: a single thing to do. Title starts with a verb.
  doc: an idea, plan, list, or reference worth keeping as a document.
  risk: a worry or something that could go wrong.
  update: news about something that probably already exists in the project: progress, something finished, a date that moved, a change of plan.
  ask: a question the person wants answered from what the project already holds.
- to: P#, N#, or "W" for the person's Workspace (loose items that fit no project).
- title: how the item reads once filed, at most 80 characters, in the person's words where possible.
- due (optional on any item): "YYYY-MM-DD" only when the dump states or clearly implies a date.

Rules: skip filler and repeats. One phrase becomes at most one item. Use only aliases that are listed or that you declared in "new". Keep going until every useful piece of the dump is placed. You only route: a later step looks inside each project and decides whether a piece updates something that exists, so don't guess about existing items.`;

export function buildDumpSortPrompt(input: {
	text: string;
	sentences: DumpSentence[];
	projects: DumpProject[];
	today: string;
}): string {
	const lines: string[] = [`Today is ${input.today}.`, '', 'Projects:'];
	for (const project of input.projects) {
		const about = project.description ? ` (${clip(project.description, 90)})` : '';
		lines.push(`${project.alias} · ${project.name}${about}`);
	}
	lines.push('', 'Dump:');
	for (const sentence of input.sentences) {
		lines.push(`[${sentence.n}] ${input.text.slice(sentence.start, sentence.end)}`);
	}
	return lines.join('\n');
}

export function clip(value: string, max: number): string {
	const flat = value.replace(/\s+/g, ' ').trim();
	return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

// ---------------------------------------------------------------------------
// Streamed lines
// ---------------------------------------------------------------------------

/** Collects streamed text and hands back each complete line. */
export class LineBuffer {
	private pending = '';

	push(chunk: string): string[] {
		this.pending += chunk;
		const parts = this.pending.split('\n');
		this.pending = parts.pop() ?? '';
		return parts.map((part) => part.trim()).filter(Boolean);
	}

	flush(): string[] {
		const rest = this.pending.trim();
		this.pending = '';
		return rest ? [rest] : [];
	}
}

/** Reads one line of the model's answer. Anything that isn't a usable object is a skip. */
export function readDumpLine(
	line: string,
	known: { aliases: Set<string>; sentenceCount: number }
): DumpLine {
	const trimmed = line.trim().replace(/,$/, '');
	if (!trimmed.startsWith('{')) return { type: 'skip', reason: 'not json' };
	let raw: Record<string, unknown>;
	try {
		raw = JSON.parse(trimmed) as Record<string, unknown>;
	} catch {
		return { type: 'skip', reason: 'bad json' };
	}

	if (Array.isArray(raw.focus) || Array.isArray(raw.new)) {
		const created = (Array.isArray(raw.new) ? raw.new : [])
			.map((entry) => entry as Record<string, unknown>)
			.filter((entry) => typeof entry?.id === 'string' && typeof entry?.name === 'string')
			.map((entry) => ({ alias: String(entry.id), name: clip(String(entry.name), 60) }));
		for (const project of created) known.aliases.add(project.alias);
		const focus = (Array.isArray(raw.focus) ? raw.focus : [])
			.filter((alias): alias is string => typeof alias === 'string')
			.filter((alias) => known.aliases.has(alias));
		return { type: 'focus', focus: { focus, created } };
	}

	const kind = raw.kind;
	if (typeof kind !== 'string' || !DUMP_KINDS.includes(kind as DumpKind)) {
		return { type: 'skip', reason: `unknown kind ${String(kind)}` };
	}
	const to = typeof raw.to === 'string' ? raw.to : '';
	if (!known.aliases.has(to)) {
		return { type: 'skip', reason: `unknown destination ${to}` };
	}
	const sentence = Number(raw.s);
	const quote = typeof raw.q === 'string' ? raw.q : '';
	const title = clip(typeof raw.title === 'string' ? raw.title : quote, 80);
	if (!title && !quote) return { type: 'skip', reason: 'empty item' };
	const due = typeof raw.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.due) ? raw.due : null;
	return {
		type: 'item',
		item: {
			sentence:
				Number.isInteger(sentence) && sentence >= 1 && sentence <= known.sentenceCount
					? sentence
					: 0,
			kind: kind as DumpKind,
			to,
			title,
			quote,
			due
		}
	};
}

// ---------------------------------------------------------------------------
// Finding the quote in the dump
// ---------------------------------------------------------------------------

type Span = { start: number; end: number };

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

function overlaps(span: Span, used: Span[]): boolean {
	return used.some((other) => span.start < other.end && other.start < span.end);
}

function findNormalized(text: string, window: Span, quote: string, used: Span[]): Span | null {
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

function words(text: string, offset: number): Word[] {
	const segmenter = new Intl.Segmenter('en', { granularity: 'word' });
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

/** In-order word match: at least 75% of the quote's words found, close together. */
function findFuzzy(text: string, window: Span, quote: string, used: Span[]): Span | null {
	const target = words(quote, 0).map((entry) => entry.word);
	if (target.length === 0) return null;
	const source = words(text.slice(window.start, window.end), window.start);
	const maxGap = Math.ceil(target.length * 1.5) + 2;
	let best: { span: Span; score: number } | null = null;
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
	return best?.span ?? null;
}

/** Finds the quoted words: in the named sentence first, then anywhere in the dump. Falls
 * back to the whole sentence so a highlight always lands somewhere real. */
export function locateQuote(
	text: string,
	sentences: DumpSentence[],
	sentenceNumber: number,
	quote: string,
	used: Span[]
): Span & { match: DumpMatch } {
	const sentence = sentences.find((entry) => entry.n === sentenceNumber) ?? null;
	const whole = { start: 0, end: text.length };
	if (quote.trim()) {
		for (const window of sentence ? [sentence, whole] : [whole]) {
			const exactAt = text.slice(window.start, window.end).indexOf(quote);
			if (exactAt >= 0) {
				const span = {
					start: window.start + exactAt,
					end: window.start + exactAt + quote.length
				};
				if (!overlaps(span, used)) return { ...span, match: 'exact' };
			}
			const close = findNormalized(text, window, quote, used);
			if (close) return { ...close, match: 'close' };
		}
		for (const window of sentence ? [sentence, whole] : [whole]) {
			const fuzzy = findFuzzy(text, window, quote, used);
			if (fuzzy) return { ...fuzzy, match: 'fuzzy' };
		}
	}
	if (sentence) return { start: sentence.start, end: sentence.end, match: 'sentence' };
	return { start: 0, end: 0, match: 'none' };
}
