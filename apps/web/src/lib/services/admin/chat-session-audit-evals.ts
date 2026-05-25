// apps/web/src/lib/services/admin/chat-session-audit-evals.ts
import { payloadField, stringValue } from './chat-session-audit-payload';

export function evalAssertionCount(summary: unknown, key: 'passed' | 'failed'): string {
	if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return '0';
	const assertionCounts = (summary as Record<string, unknown>).assertion_counts;
	if (!assertionCounts || typeof assertionCounts !== 'object' || Array.isArray(assertionCounts)) {
		return '0';
	}
	return stringValue((assertionCounts as Record<string, unknown>)[key] ?? 0);
}

export function payloadSummaryAssertionCount(
	payload: Record<string, unknown>,
	key: 'passed' | 'failed'
): string {
	return evalAssertionCount(payloadField(payload, 'summary'), key);
}
