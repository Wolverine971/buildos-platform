// packages/shared-types/src/source-quote.test.ts
import { describe, expect, it } from 'vitest';
import { locateSourceQuote } from './source-quote';

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

	it('falls back to an in-order word match', () => {
		const found = locateSourceQuote(MESSAGE, 'order deck oven due tomorrow');
		expect(found?.match).toBe('fuzzy');
	});

	it('returns null for words that are not there', () => {
		expect(locateSourceQuote(MESSAGE, 'renew my passport')).toBeNull();
	});
});
