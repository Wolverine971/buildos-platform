// apps/web/src/lib/server/chat-session-seed-formatters.test.ts
import { describe, expect, it } from 'vitest';
import {
	appendSeedSection,
	compactSeedText,
	isRecord,
	normalizeRecordArray,
	readFiniteNumber,
	readTrimmedString
} from './chat-session-seed-formatters';

describe('compactSeedText', () => {
	it('normalizes whitespace and rejects empty or non-string values', () => {
		expect(compactSeedText('  one\n\t two  ', 20)).toBe('one two');
		expect(compactSeedText('   ', 20)).toBeNull();
		expect(compactSeedText(42, 20)).toBeNull();
	});

	it('locks both historical truncation-boundary policies', () => {
		expect(compactSeedText('hello world', 9)).toBe('hello...');
		expect(
			compactSeedText('hello world', 9, {
				trimTruncatedEnd: false
			})
		).toBe('hello ...');
	});

	it('preserves short text and the existing small-limit ellipsis behavior', () => {
		expect(compactSeedText('short', 5)).toBe('short');
		expect(compactSeedText('longer', 2)).toBe('...');
	});
});

describe('seed value formatters', () => {
	it('reads only trimmed strings and finite numbers', () => {
		expect(readTrimmedString(' value ')).toBe('value');
		expect(readTrimmedString(' ')).toBeNull();
		expect(readFiniteNumber(12)).toBe(12);
		expect(readFiniteNumber(Number.NaN)).toBeNull();
		expect(readFiniteNumber('12')).toBeNull();
	});

	it('recognizes records and filters record arrays', () => {
		const record = { id: 'one' };
		expect(isRecord(record)).toBe(true);
		expect(isRecord([])).toBe(false);
		expect(normalizeRecordArray([record, null, [], 'value'])).toEqual([record]);
		expect(normalizeRecordArray(null)).toEqual([]);
	});

	it('appends only non-empty sections', () => {
		const lines = ['Intro'];
		appendSeedSection(lines, 'Empty', []);
		appendSeedSection(lines, 'Details', ['First', '', 'Second']);
		expect(lines).toEqual(['Intro', '', '## Details', 'First', 'Second']);
	});
});
