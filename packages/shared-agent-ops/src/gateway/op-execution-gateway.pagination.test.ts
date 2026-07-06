// packages/shared-agent-ops/src/gateway/op-execution-gateway.pagination.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildPaginationForRows,
	clampLimit,
	normalizeOffset
} from './op-execution-gateway.pagination';

describe('op execution gateway pagination helpers', () => {
	it('clamps finite numeric limits to integer min/max bounds', () => {
		expect(clampLimit(12.9, 20)).toBe(12);
		expect(clampLimit(0, 20)).toBe(1);
		expect(clampLimit(99, 20, 1, 50)).toBe(50);
	});

	it('uses fallback limits for non-finite or non-numeric values', () => {
		expect(clampLimit(undefined, 20)).toBe(20);
		expect(clampLimit(Number.NaN, 20)).toBe(20);
		expect(clampLimit('10', 20)).toBe(20);
	});

	it('normalizes offsets to non-negative integers with an upper cap', () => {
		expect(normalizeOffset(10.8)).toBe(10);
		expect(normalizeOffset(-5)).toBe(0);
		expect(normalizeOffset(6000)).toBe(5000);
		expect(normalizeOffset('10', 7)).toBe(7);
	});

	it('builds pagination metadata with next offset only when more rows exist', () => {
		expect(buildPaginationForRows(20, 10, 35, 10)).toEqual({
			offset: 20,
			limit: 10,
			returned: 10,
			total_available: 35,
			has_more: true,
			next_offset: 30
		});

		expect(buildPaginationForRows(30, 10, 35, 5)).toEqual({
			offset: 30,
			limit: 10,
			returned: 5,
			total_available: 35,
			has_more: false,
			next_offset: null
		});
	});
});
