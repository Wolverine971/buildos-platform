// apps/worker/tests/agenticChatReviewDecisionCompletion.test.ts
//
// The approval tool schemas are static (no per-review `const` SHA), so the
// binding between an approval and the proposal the reviewer saw is enforced
// here, in code, and fails closed to the internal review fault.
import { describe, expect, it } from 'vitest';
import { approvalShaMatches } from '../src/workers/agentic-chat/provider/review/decision-completion';

describe('approvalShaMatches', () => {
	it('accepts only the exact expected string', () => {
		expect(approvalShaMatches('a'.repeat(64), 'a'.repeat(64))).toBe(true);
		expect(approvalShaMatches('b'.repeat(64), 'a'.repeat(64))).toBe(false);
		expect(approvalShaMatches(undefined, 'a'.repeat(64))).toBe(false);
		expect(approvalShaMatches(null, 'a'.repeat(64))).toBe(false);
		expect(approvalShaMatches(['a'.repeat(64)], 'a'.repeat(64))).toBe(false);
		expect(approvalShaMatches('', '')).toBe(false);
	});
});
