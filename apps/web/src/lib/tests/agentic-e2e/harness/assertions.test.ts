// apps/web/src/lib/tests/agentic-e2e/harness/assertions.test.ts
import { describe, expect, it } from 'vitest';
import {
	assertIsoDate,
	assertMarkdownSectionBullets,
	assertNumericPriorityAtMost,
	extractMarkdownSection,
	nextWeekdayDate,
	normalizeComparableText
} from './assertions';

describe('scenario assertion helpers', () => {
	it('computes this Friday without rolling an existing Friday forward', () => {
		expect(nextWeekdayDate(new Date(2026, 6, 12, 9), 5)).toBe('2026-07-17');
		expect(nextWeekdayDate(new Date(2026, 6, 17, 9), 5)).toBe('2026-07-17');
		expect(nextWeekdayDate(new Date('2026-07-18T02:00:00.000Z'), 5)).toBe('2026-07-17');
	});

	it('requires the exact persisted ISO date', () => {
		expect(() => assertIsoDate('2026-07-17T17:00:00.000Z', '2026-07-17', 'task')).not.toThrow();
		expect(() => assertIsoDate('2026-07-18T02:00:00.000Z', '2026-07-17', 'task')).not.toThrow();
		expect(() => assertIsoDate('2026-07-18T12:00:00.000Z', '2026-07-17', 'task')).toThrow(
			'expected 2026-07-17'
		);
	});

	it('treats lower numeric values as higher task priority', () => {
		expect(() => assertNumericPriorityAtMost(1, 2, 'task')).not.toThrow();
		expect(() => assertNumericPriorityAtMost(3, 2, 'task')).toThrow('expected 2');
	});

	it('extracts markdown and bold sections and enforces bullet counts', () => {
		const content = `## Pre-flight\n- One\n- Two\n\n**Launch Day**\n- Three\n- Four`;
		expect(assertMarkdownSectionBullets(content, 'Pre-flight', 2, 3)).toContain('- One');
		expect(extractMarkdownSection(content, 'Launch Day')).toContain('- Three');
		expect(() => assertMarkdownSectionBullets(content, 'Rollback', 2, 3)).toThrow('missing');
	});

	it('normalizes text for preservation comparisons', () => {
		expect(normalizeComparableText(' A\n  B ')).toBe('a b');
	});
});
