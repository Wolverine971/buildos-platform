// apps/web/src/lib/services/admin/chat-session-audit-payload.test.ts
import { describe, expect, it } from 'vitest';
import {
	firstNonEmptyString,
	metadataEntries,
	metadataValueLabel,
	numberArray,
	payloadField,
	recordArray,
	recordFromUnknown,
	stringArray,
	stringValue,
	toNumericValue
} from './chat-session-audit-payload';

describe('chat-session-audit-payload', () => {
	it('reads primitive payload values safely', () => {
		expect(payloadField({ a: 1 }, 'a')).toBe(1);
		expect(stringValue(null)).toBe('');
		expect(stringValue(12)).toBe('12');
		expect(toNumericValue('12.5')).toBe(12.5);
		expect(toNumericValue('nope')).toBeNull();
		expect(firstNonEmptyString(null, '', 'value', 'later')).toBe('value');
	});

	it('normalizes records and arrays', () => {
		expect(recordFromUnknown({ ok: true })).toEqual({ ok: true });
		expect(recordFromUnknown([])).toBeNull();
		expect(recordArray([{ a: 1 }, null, [], { b: 2 }])).toEqual([{ a: 1 }, { b: 2 }]);
		expect(stringArray(['a', null, 3, ''])).toEqual(['a', '3']);
		expect(numberArray(['1', 2, 'bad'])).toEqual([1, 2]);
	});

	it('formats metadata labels and removes empty metadata entries', () => {
		expect(metadataEntries({ a: 1, b: null, c: '', d: false })).toEqual([
			['a', 1],
			['d', false]
		]);
		expect(metadataValueLabel(false)).toBe('false');
		expect(metadataValueLabel(1234)).toBe('1,234');
		expect(metadataValueLabel({ ok: true })).toBe('{\n  "ok": true\n}');
	});
});
