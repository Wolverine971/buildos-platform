// apps/web/src/lib/server/dump-sort/dump-sort-core.test.ts
import { describe, expect, it } from 'vitest';
import {
	LineBuffer,
	buildDumpSortPrompt,
	locateQuote,
	readDumpLine,
	splitSentences
} from './dump-sort-core';
import { REPLAY_ANSWER, REPLAY_PROJECTS, REPLAY_TEXT } from './dump-sort-replay';

const known = () => ({
	aliases: new Set(['P1', 'P2', 'W']),
	sentenceCount: 3
});

describe('splitSentences', () => {
	it('numbers sentences and lines with offsets into the original text', () => {
		const text = 'Finish the draft. Email Priya!\n- buy flour\n\n  call mom';
		const sentences = splitSentences(text);
		expect(sentences.map((s) => text.slice(s.start, s.end))).toEqual([
			'Finish the draft.',
			'Email Priya!',
			'- buy flour',
			'call mom'
		]);
		expect(sentences.map((s) => s.n)).toEqual([1, 2, 3, 4]);
	});
});

describe('LineBuffer', () => {
	it('returns only complete lines until flushed', () => {
		const buffer = new LineBuffer();
		expect(buffer.push('{"a":1}\n{"b"')).toEqual(['{"a":1}']);
		expect(buffer.push(':2}\n\n{"c":3')).toEqual(['{"b":2}']);
		expect(buffer.flush()).toEqual(['{"c":3']);
	});
});

describe('readDumpLine', () => {
	it('reads the focus line and registers new project aliases', () => {
		const k = known();
		const read = readDumpLine('{"focus":["P1","P9"],"new":[{"id":"N1","name":"Kitchen"}]}', k);
		expect(read).toEqual({
			type: 'focus',
			focus: { focus: ['P1'], created: [{ alias: 'N1', name: 'Kitchen' }] }
		});
		expect(k.aliases.has('N1')).toBe(true);
	});

	it('reads an item and rejects unknown destinations, kinds and tasks', () => {
		const ok = readDumpLine(
			'{"s":2,"q":"email Priya","kind":"task","to":"P1","title":"Email Priya","due":"2026-11-07"}',
			known()
		);
		expect(ok).toMatchObject({
			type: 'item',
			item: { sentence: 2, kind: 'task', to: 'P1', due: '2026-11-07' }
		});
		expect(readDumpLine('{"s":1,"q":"x","kind":"task","to":"P7"}', known()).type).toBe('skip');
		expect(readDumpLine('{"s":1,"q":"x","kind":"vibe","to":"P1"}', known()).type).toBe('skip');
		expect(readDumpLine('{"s":1,"q":"x","kind":"done","task":"T9"}', known()).type).toBe(
			'skip'
		);
		expect(readDumpLine('```json', known()).type).toBe('skip');
	});
});

describe('locateQuote', () => {
	const text =
		'ok so Fading Crown.  I need to “finish the  draft” soon. Then finish the draft again.';
	const sentences = splitSentences(text);

	it('finds exact words inside the named sentence', () => {
		const span = locateQuote(text, sentences, 1, 'Fading Crown', []);
		expect(span.match).toBe('exact');
		expect(text.slice(span.start, span.end)).toBe('Fading Crown');
	});

	it('matches through case, curly quotes and extra spaces', () => {
		const span = locateQuote(text, sentences, 2, '"Finish the draft"', []);
		expect(span.match).toBe('close');
		expect(text.slice(span.start, span.end)).toBe('finish the  draft');
	});

	it('takes the next free occurrence when the first is already used', () => {
		const first = locateQuote(text, sentences, 0, 'finish the draft', []);
		const second = locateQuote(text, sentences, 0, 'finish the draft', [first]);
		expect(second.start).not.toBe(first.start);
		expect(second.end <= first.start || second.start >= first.end).toBe(true);
	});

	it('falls back to an in-order word match, then the whole sentence', () => {
		const fuzzy = locateQuote(text, sentences, 2, 'need to finish draft', []);
		expect(fuzzy.match).toBe('fuzzy');
		expect(text.slice(fuzzy.start, fuzzy.end)).toContain('need to');
		const sentence = locateQuote(text, sentences, 2, 'buy a horse', []);
		expect(sentence.match).toBe('sentence');
	});
});

describe('replay answer', () => {
	it('places every replay line on real words in the replay dump', () => {
		const sentences = splitSentences(REPLAY_TEXT);
		const k = {
			aliases: new Set(REPLAY_PROJECTS.map((p) => p.alias)),
			sentenceCount: sentences.length
		};
		const used: { start: number; end: number }[] = [];
		const matches: string[] = [];
		for (const line of REPLAY_ANSWER.split('\n')) {
			const read = readDumpLine(line, k);
			expect(read.type).not.toBe('skip');
			if (read.type !== 'item') continue;
			const span = locateQuote(
				REPLAY_TEXT,
				sentences,
				read.item.sentence,
				read.item.quote,
				used
			);
			used.push(span);
			matches.push(span.match);
		}
		expect(matches).toHaveLength(11);
		expect(new Set(matches)).toEqual(new Set(['exact']));
		expect(
			buildDumpSortPrompt({
				text: REPLAY_TEXT,
				sentences,
				projects: REPLAY_PROJECTS,
				today: 'Wed 2026-11-04'
			})
		).toContain('[9] and random but');
	});
});
