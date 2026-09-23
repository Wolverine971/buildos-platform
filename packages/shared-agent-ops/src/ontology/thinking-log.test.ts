// packages/shared-agent-ops/src/ontology/thinking-log.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildThinkingLogDocument,
	buildThinkingLogEntry,
	faithfulPassage,
	passageFidelity,
	prependThinkingLogEntry,
	removeThinkingLogEntry,
	restoreParagraphBreaks
} from './thinking-log';

const source =
	"Stability or anti-fragility — I think those are two parts, um, two ways to say the same thing. That's where my head is at. Help me shape this.";

describe('thinking log', () => {
	it('keeps a lightly cleaned passage and falls back to the message for a paraphrase', () => {
		const cleaned =
			"Stability or anti-fragility — I think those are two parts, two ways to say the same thing. That's where my head is at.";
		expect(passageFidelity(cleaned, source)).toBe(1);
		expect(faithfulPassage(cleaned, source)).toBe(cleaned);
		const paraphrase = 'The user equates stability with antifragility as a single concept.';
		expect(passageFidelity(paraphrase, source)).toBeLessThan(0.9);
		expect(faithfulPassage(paraphrase, source)).toBe(source);
		expect(faithfulPassage(`${source} And an invented extra sentence here.`, source)).toBe(
			source
		);
	});

	it("puts back the user's paragraph breaks when cleanup merged them", () => {
		const written =
			"Stability or anti-fragility, um, same thing.\n\nWhat should a reader say? First, 'I want to tell you things.'\n\nThe way to approach life is with curiosity.";
		const merged =
			"Stability or anti-fragility, same thing. What should a reader say? First, 'I want to tell you things.' The way to approach life is with curiosity.";
		expect(faithfulPassage(merged, written)).toBe(
			"Stability or anti-fragility, same thing.\n\nWhat should a reader say? First, 'I want to tell you things.'\n\nThe way to approach life is with curiosity."
		);
		expect(restoreParagraphBreaks('One line.', 'One line.')).toBe('One line.');
		const kept = 'First.\n\nSecond.';
		expect(restoreParagraphBreaks(kept, 'First.\n\nSecond.')).toBe(kept);
	});

	it('formats an entry and keeps headings in user text from splitting the log', () => {
		expect(
			buildThinkingLogEntry({
				date: '2026-09-22',
				time: '3:50 PM',
				topic: '## Bridges, not *defenses*',
				chatTitle: 'Book "theme"',
				passages: [
					'# My heading\nFirst paragraph.',
					'  ',
					'Second <!-- hidden --> paragraph.'
				]
			})
		).toBe(
			[
				'## 2026-09-22 · Bridges, not defenses',
				'_From chat "Book theme" · 3:50 PM_',
				'**My heading**\nFirst paragraph.',
				'Second  paragraph.'
			].join('\n\n')
		);
	});

	it('puts the newest entry first and can remove it again', () => {
		const first = buildThinkingLogEntry({
			date: '2026-09-20',
			time: null,
			topic: 'Older',
			chatTitle: null,
			passages: ['Old words.']
		});
		const second = buildThinkingLogEntry({
			date: '2026-09-22',
			time: null,
			topic: 'Newer',
			chatTitle: null,
			passages: ['New words.']
		});
		const doc = buildThinkingLogDocument('Book', first);
		const next = prependThinkingLogEntry(doc, second);
		expect(next.indexOf('## 2026-09-22 · Newer')).toBeLessThan(
			next.indexOf('## 2026-09-20 · Older')
		);
		expect(next.startsWith('# Thinking log — Book\n\n_Your own words')).toBe(true);
		expect(removeThinkingLogEntry(next, second)).toBe(`${doc}\n`);
		expect(
			removeThinkingLogEntry(next.replace('New words.', 'Edited words.'), second)
		).toBeNull();
	});
});
