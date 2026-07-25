// apps/web/src/lib/services/admin/analytics-primitives.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	averageTotal,
	averageValues,
	dateMs,
	fetchAllRows,
	numberValue,
	percentile,
	roundedPercentileOrNull,
	textValue
} from './analytics-primitives';

describe('admin analytics value primitives', () => {
	it('coerces only finite numbers and numeric strings', () => {
		expect(numberValue(12)).toBe(12);
		expect(numberValue(' 12.5 ')).toBe(12.5);
		expect(numberValue('12px')).toBe(0);
		expect(numberValue(' ')).toBe(0);
		expect(numberValue(Number.POSITIVE_INFINITY)).toBe(0);
	});

	it('reads trimmed non-empty text and valid date milliseconds', () => {
		expect(textValue(' value ')).toBe('value');
		expect(textValue(' ')).toBeNull();
		expect(dateMs('2026-07-24T00:00:00.000Z')).toBe(Date.parse('2026-07-24T00:00:00.000Z'));
		expect(dateMs('invalid')).toBeNull();
		expect(dateMs(null)).toBeNull();
	});

	it('uses explicit average policies for values and precomputed totals', () => {
		expect(averageValues([2, 4, 6])).toBe(4);
		expect(averageValues([])).toBe(0);
		expect(averageTotal(12, 3)).toBe(4);
		expect(averageTotal(12, 0)).toBe(0);
	});

	it('calculates finite nearest-rank percentiles without mutating input', () => {
		const values = [30, Number.NaN, 10, 20];
		expect(percentile(values, 50)).toBe(20);
		expect(percentile(values, 95)).toBe(30);
		expect(percentile([], 95)).toBe(0);
		expect(values).toEqual([30, Number.NaN, 10, 20]);
		expect(roundedPercentileOrNull([10.2, 20.8], 95)).toBe(21);
		expect(roundedPercentileOrNull([], 95)).toBeNull();
	});
});

describe('fetchAllRows', () => {
	it('fetches ordered pages until a short page is returned', async () => {
		const query = vi
			.fn()
			.mockResolvedValueOnce({ data: ['a', 'b'], error: null })
			.mockResolvedValueOnce({ data: ['c'], error: null });

		await expect(fetchAllRows<string>(query, { pageSize: 2, maxRows: 6 })).resolves.toEqual({
			rows: ['a', 'b', 'c'],
			truncated: false
		});
		expect(query.mock.calls).toEqual([
			[0, 1],
			[2, 3]
		]);
	});

	it('reports truncation when every permitted page is full', async () => {
		const query = vi.fn().mockResolvedValue({ data: ['a', 'b'], error: null });
		await expect(fetchAllRows<string>(query, { pageSize: 2, maxRows: 4 })).resolves.toEqual({
			rows: ['a', 'b', 'a', 'b'],
			truncated: true
		});
	});

	it('propagates query errors and rejects invalid pagination limits', async () => {
		const failure = new Error('query failed');
		await expect(
			fetchAllRows(() => Promise.resolve({ data: null, error: failure }))
		).rejects.toBe(failure);
		await expect(
			fetchAllRows(() => Promise.resolve({ data: [], error: null }), { pageSize: 0 })
		).rejects.toThrow('positive integer');
	});
});
