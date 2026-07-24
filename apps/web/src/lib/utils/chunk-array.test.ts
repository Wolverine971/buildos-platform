import { describe, expect, it } from 'vitest';
import { chunkArray } from './chunk-array';

describe('chunkArray', () => {
	it('splits values into ordered chunks without mutating the input', () => {
		const values = [1, 2, 3, 4, 5] as const;

		expect(chunkArray(values, 2)).toEqual([[1, 2], [3, 4], [5]]);
		expect(values).toEqual([1, 2, 3, 4, 5]);
	});

	it('returns no chunks for an empty input', () => {
		expect(chunkArray([], 3)).toEqual([]);
	});

	it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
		'rejects invalid chunk size %s',
		(size) => {
			expect(() => chunkArray([1, 2], size)).toThrow(
				new RangeError('chunkArray size must be a positive integer')
			);
		}
	);
});
