// apps/web/src/lib/services/admin/chat-session-audit-formatters.test.ts
import { describe, expect, it } from 'vitest';
import {
	formatCurrency,
	formatDuration,
	formatNumber,
	pluralize,
	prettyJson,
	truncateText
} from './chat-session-audit-formatters';

describe('chat-session-audit-formatters', () => {
	it('formats numbers, currency, and durations with stable en-US output', () => {
		expect(formatNumber(1234567)).toBe('1,234,567');
		expect(formatCurrency(0.0142)).toBe('$0.0142');
		expect(formatDuration(321)).toBe('321ms');
		expect(formatDuration(1234)).toBe('1.23s');
		expect(formatDuration(null)).toBe('-');
	});

	it('formats JSON, truncates text, and pluralizes labels', () => {
		expect(prettyJson({ ok: true })).toBe('{\n  "ok": true\n}');
		expect(truncateText('  a   b   c  ', 10)).toBe('a b c');
		expect(truncateText('abcdefghijklmnopqrstuvwxyz', 8)).toBe('abcde...');
		expect(pluralize(1, 'turn')).toBe('turn');
		expect(pluralize(2, 'turn')).toBe('turns');
		expect(pluralize(2, 'pass', 'passes')).toBe('passes');
	});
});
