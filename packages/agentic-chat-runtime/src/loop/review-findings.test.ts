// packages/agentic-chat-runtime/src/loop/review-findings.test.ts
import { describe, expect, it } from 'vitest';
import { parseMutationReviewFindings, renderMutationReviewFindings } from './review-findings';
import { buildAgenticChatCompletionReceiptV1 } from './completion-receipt';
import type { FastToolExecution } from './shared';

const findings = [
	{
		code: 'uncommissioned_change',
		target_ids: ['doc-1'],
		message: 'The cleanup included an unrequested public document.',
		required_correction: 'ACTOR_ONLY_REMOVE_DOC'
	},
	{
		code: 'wrong_value',
		target_ids: ['task-1'],
		message: 'The payment task was marked done instead of archived.',
		required_correction: 'ACTOR_ONLY_ARCHIVE_TASK'
	},
	{
		code: 'protected_target',
		target_ids: ['doc-2'],
		message: 'The project context document is protected.',
		required_correction: 'ACTOR_ONLY_REMOVE_CONTEXT'
	}
];
describe('structured review findings', () => {
	it('keeps complete bounded messages beyond the previous paragraph cap', () => {
		const value = [{ ...findings[0], message: 'A'.repeat(500) }];
		expect(parseMutationReviewFindings(value)?.[0]!.message).toHaveLength(500);
		expect(
			parseMutationReviewFindings([{ ...findings[0], message: 'A'.repeat(601) }])
		).toBeNull();
		expect(parseMutationReviewFindings([{ ...findings[0], code: 'invented_code' }])).toBeNull();
	});
	it('renders all explanations and excludes actor correction instructions', () => {
		const parsed = parseMutationReviewFindings(findings)!;
		const text = renderMutationReviewFindings(parsed)!;
		for (const finding of findings) expect(text).toContain(finding.message);
		expect(text).not.toContain('ACTOR_ONLY');
	});
	it('persists only findings echoed by a durable review decision, even with zero writes', () => {
		const revision: FastToolExecution = {
			toolCall: {
				id: 'revision',
				type: 'function',
				function: {
					name: 'request_proposal_revision',
					arguments: JSON.stringify({ findings })
				}
			},
			result: {
				tool_call_id: 'revision',
				success: true,
				result: { status: 'revision_required', findings }
			}
		};
		const input = {
			contract: null,
			contractSha256: null,
			toolExecutions: [revision],
			finishedReason: 'semantic_review_failed'
		};
		const receipt = buildAgenticChatCompletionReceiptV1(input);
		expect(receipt.reviewFindings).toEqual(findings);
		expect(receipt.request.disposition).toBe('request_unverified');
		revision.result.result!.findings = [];
		expect(buildAgenticChatCompletionReceiptV1(input)).not.toHaveProperty('reviewFindings');
	});
});
