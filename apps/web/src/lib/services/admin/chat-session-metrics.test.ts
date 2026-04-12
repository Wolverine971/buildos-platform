// apps/web/src/lib/services/admin/chat-session-metrics.test.ts
import { describe, expect, it } from 'vitest';
import { resolveBillableTokenTotal } from './chat-session-metrics';

describe('resolveBillableTokenTotal', () => {
	it('prefers usage ledger tokens over session counters', () => {
		expect(
			resolveBillableTokenTotal({
				usageTokenTotal: 89_656,
				sessionTokenTotal: 76_038,
				messageTokenTotal: 76_038
			})
		).toBe(89_656);
	});

	it('falls back to session and message totals when usage rows are absent', () => {
		expect(
			resolveBillableTokenTotal({
				usageTokenTotal: 0,
				sessionTokenTotal: 1200,
				messageTokenTotal: 1100
			})
		).toBe(1200);

		expect(
			resolveBillableTokenTotal({
				usageTokenTotal: 0,
				sessionTokenTotal: 0,
				messageTokenTotal: 1100
			})
		).toBe(1100);
	});
});
