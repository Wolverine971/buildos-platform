// apps/web/src/lib/utils/blog.test.ts
import { describe, expect, it } from 'vitest';

import { formatBlogDate, parseBlogDate } from './blog';

describe('blog date helpers', () => {
	it('formats date-only strings without shifting the calendar day', () => {
		expect(formatBlogDate('2026-03-29')).toBe('Mar 29, 2026');
	});

	it('returns a fallback label for invalid dates', () => {
		expect(parseBlogDate('not-a-date')).toBeNull();
		expect(formatBlogDate('not-a-date')).toBe('Date unavailable');
		expect(formatBlogDate('', 'MMM dd, yyyy', 'Unknown')).toBe('Unknown');
	});

	it('supports Date instances directly', () => {
		const value = new Date('2026-03-29T12:34:56Z');

		expect(parseBlogDate(value)?.toISOString()).toBe(value.toISOString());
		expect(formatBlogDate(value, 'yyyy-MM-dd')).toBe('2026-03-29');
	});
});
