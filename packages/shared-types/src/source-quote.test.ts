// packages/shared-types/src/source-quote.test.ts
import { describe, expect, it } from 'vitest';
import { findQuoteFuzzy, locateSourceQuote } from './source-quote';

const MESSAGE = 'Push the lease signing to Monday. Also, order the deck oven — it’s due tomorrow!';

describe('locateSourceQuote', () => {
	it('finds an exact quote as offsets', () => {
		const found = locateSourceQuote(MESSAGE, 'order the deck oven');
		expect(found?.match).toBe('exact');
		expect(MESSAGE.slice(found!.start, found!.end)).toBe('order the deck oven');
	});

	it('forgives case, curly quotes and spacing', () => {
		const found = locateSourceQuote(MESSAGE, 'PUSH the lease  signing to monday.');
		expect(found?.match).toBe('close');
		expect(MESSAGE.slice(found!.start, found!.end)).toBe('Push the lease signing to Monday');
	});

	it('ignores punctuation between the same words', () => {
		const found = locateSourceQuote(MESSAGE, 'order the deck oven, it’s due tomorrow');
		expect(found?.match).toBe('close');
		expect(MESSAGE.slice(found!.start, found!.end)).toBe(
			'order the deck oven — it’s due tomorrow'
		);
	});

	it('does not accept words that are only similar', () => {
		// Missing words: the old 75% rule lit this up.
		expect(locateSourceQuote(MESSAGE, 'order deck oven due tomorrow')).toBeNull();
		// The lab's loose matcher still finds it when asked by name.
		expect(
			findQuoteFuzzy(
				MESSAGE,
				{ start: 0, end: MESSAGE.length },
				'order deck oven due tomorrow'
			)?.match
		).toBe('fuzzy');
	});

	it('never lights a different phrase when the quoted one is taken', () => {
		const text = 'mark the oven task done, mark the lease task done';
		const first = locateSourceQuote(text, 'mark the oven task done');
		expect(text.slice(first!.start, first!.end)).toBe('mark the oven task done');
		// A second change quoting the same words must not land on the lease phrase.
		expect(locateSourceQuote(text, 'mark the oven task done', [first!])).toBeNull();
	});

	it('matches whole words only', () => {
		expect(locateSourceQuote('Book a meeting with my business partner', 'art')).toBeNull();
		expect(locateSourceQuote('Buy art for the partner office', 'art')?.start).toBe(4);
	});

	it('returns null for words that are not there', () => {
		expect(locateSourceQuote(MESSAGE, 'renew my passport')).toBeNull();
	});
});
