// apps/web/src/lib/server/public-content-review-core.test.ts
import { describe, expect, it } from 'vitest';
import { redactFixedFormatMatches, scanTextForFindings } from './public-content-review-core';

// The document detector exactly as it shipped under public_page_policy_v3 (07e0f60a2^).
// Changing document detection needs a PUBLIC_PAGE_CONTENT_POLICY_VERSION bump.
const POLICY_V3_CARD_REGEX = /(?:\b\d[ -]*?){13,19}\b/g;
const luhn = (value: string) => {
	const digits = value.replace(/\D/g, '');
	if (digits.length < 13 || digits.length > 19 || /^(\d)\1+$/.test(digits)) return false;
	let sum = 0;
	for (let i = digits.length - 1, double = false; i >= 0; i--, double = !double) {
		let digit = Number(digits[i]);
		if (double && (digit *= 2) > 9) digit -= 9;
		sum += digit;
	}
	return sum % 10 === 0;
};
const v3CardMatches = (text: string) =>
	[...text.matchAll(new RegExp(POLICY_V3_CARD_REGEX))].map((m) => m[0]).filter(luhn);

const SAMPLES = [
	'4111 1111 1111 1111',
	'4111111111111111',
	'4242-4242-4242-4242',
	'123-45-6789 4111 1111 1111 1111',
	'card 4 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1',
	'4 2 4 2 4 2 4 2 4 2 4 2 4 2 4 2 and 5 5 5 5 5 5 5 5 5 5 5 5 4 4 4 4',
	'order 1234567890123 shipped'
];

describe('public content review core', () => {
	it.each(SAMPLES)('documents keep the policy v3 card detector exactly: %s', (text) => {
		const found = scanTextForFindings(text, 'text', null).filter(
			(finding) => finding.code === 'pii_credit_card'
		);
		expect(found).toHaveLength(v3CardMatches(text).length);
	});
	it('documents redact card numbers exactly as policy v3 did', () => {
		// (Samples without an SSN, which has its own redaction.)
		for (const text of SAMPLES.filter((sample) => !/\d{3}-\d{2}-\d{4}/.test(sample))) {
			let expected = text;
			for (const match of v3CardMatches(text))
				expected = expected.replace(match, '[redacted-card-number]');
			expect(redactFixedFormatMatches(text)).toBe(expected);
		}
	});
	it('chat shares opt into the overlapping detector, which finds plain card formats', () => {
		for (const text of ['4111 1111 1111 1111', '4111111111111111', '4242-4242-4242-4242'])
			expect(
				scanTextForFindings(text, 'text', null, { cardDetector: 'overlapping' }).some(
					(finding) => finding.code === 'pii_credit_card'
				)
			).toBe(true);
		expect(
			redactFixedFormatMatches('pay 4111 1111 1111 1111', { cardDetector: 'overlapping' })
		).toBe('pay [redacted-card-number]');
	});
});
