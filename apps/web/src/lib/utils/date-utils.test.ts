// apps/web/src/lib/utils/date-utils.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { formatDateForInput, parseDateFromInput } from './date-utils';

describe('date-only input round trip', () => {
	const originalTz = process.env.TZ;

	beforeAll(() => {
		// East of UTC: local midnight is the previous UTC day.
		process.env.TZ = 'Asia/Tokyo';
	});

	afterAll(() => {
		if (originalTz === undefined) delete process.env.TZ;
		else process.env.TZ = originalTz;
	});

	it('reads back the same calendar day it wrote, save after save', () => {
		let value = '2026-09-23';
		for (let save = 0; save < 3; save++) {
			const stored = parseDateFromInput(value);
			expect(stored).toBe('2026-09-22T15:00:00.000Z');
			value = formatDateForInput(stored);
			expect(value).toBe('2026-09-23');
		}
	});

	it('keeps legacy UTC-midnight sentinels on their calendar date', () => {
		expect(formatDateForInput('2026-09-23T00:00:00.000Z')).toBe('2026-09-23');
		expect(formatDateForInput('2026-09-23T00:00:00+00:00')).toBe('2026-09-23');
	});

	it('passes through plain dates and rejects invalid input', () => {
		expect(formatDateForInput('2026-09-23')).toBe('2026-09-23');
		expect(formatDateForInput('not a date')).toBe('');
		expect(formatDateForInput(null)).toBe('');
	});
});
