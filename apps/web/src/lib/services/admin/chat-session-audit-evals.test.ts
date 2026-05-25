// apps/web/src/lib/services/admin/chat-session-audit-evals.test.ts
import { describe, expect, it } from 'vitest';
import { evalAssertionCount, payloadSummaryAssertionCount } from './chat-session-audit-evals';

describe('chat-session-audit-evals', () => {
	it('reads assertion counts from eval summaries and payloads', () => {
		const summary = { assertion_counts: { passed: 3, failed: 1 } };
		expect(evalAssertionCount(summary, 'passed')).toBe('3');
		expect(evalAssertionCount(summary, 'failed')).toBe('1');
		expect(payloadSummaryAssertionCount({ summary }, 'passed')).toBe('3');
		expect(evalAssertionCount(null, 'passed')).toBe('0');
	});
});
