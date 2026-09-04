// apps/worker/tests/agenticChatReviewCandidateGate.test.ts

import type { JsonObject } from '@buildos/shared-types';
import { executeAgenticChatStandardControlToolV1 } from '@buildos/agentic-chat-runtime/loop';
import { describe, expect, it } from 'vitest';
import type { AgenticChatTurnProviderRequestV1 } from '../src/workers/agentic-chat/provider/contracts';
import {
	buildCandidateGateClarification,
	findAmbiguousReferenceCandidatesForTargetIds,
	latestUserMessageText,
	recentUserMessageTexts
} from '../src/workers/agentic-chat/provider/review/decision-handling';

const request = {
	turnRunId: 'turn-run-1',
	logicalProviderRound: 3
} as AgenticChatTurnProviderRequestV1;

describe('buildCandidateGateClarification', () => {
	it('emits a clarification the deterministic executor accepts even with long titles', () => {
		const reference = 'the long email follow-up thing '.repeat(6).trim().slice(0, 160);
		const candidates = Array.from({ length: 6 }, (_, index) => ({
			id: `00000000-0000-4000-8000-00000000000${index}`,
			title: `Task ${index} — ${'follow up with the beta list about the launch email '.repeat(4)}`
				.trim()
				.slice(0, 160)
		}));
		const call = buildCandidateGateClarification(request, { reference, candidates });
		const question = String(call.arguments.question);
		expect(question.length).toBeLessThanOrEqual(500);
		expect(
			executeAgenticChatStandardControlToolV1({
				toolName: 'request_turn_clarification',
				arguments: call.arguments
			})
		).toMatchObject({ success: true, requiresUserAction: true });
		const emitted = call.arguments.candidates as Array<{ id: string; label: string }>;
		expect(emitted).toHaveLength(6);
		for (const [index, candidate] of emitted.entries()) {
			expect(candidate.id).toBe(candidates[index].id);
			expect(candidate.label.length).toBeGreaterThan(0);
			expect(question).toContain(candidate.label);
		}
	});

	it('keeps full titles when they fit the question budget', () => {
		const call = buildCandidateGateClarification(request, {
			reference: 'the email one',
			candidates: [
				{ id: 'task-a', title: 'Send the launch email to the beta list' },
				{ id: 'task-b', title: 'Draft the investor update email' }
			]
		});
		expect(call.arguments.candidates).toEqual([
			{ id: 'task-a', label: 'Send the launch email to the beta list', kind: 'entity' },
			{ id: 'task-b', label: 'Draft the investor update email', kind: 'entity' }
		]);
		expect(String(call.arguments.question)).toBe(
			'Which one did you mean by "the email one"? Send the launch email to the beta list · Draft the investor update email'
		);
		expect(
			executeAgenticChatStandardControlToolV1({
				toolName: 'request_turn_clarification',
				arguments: call.arguments
			})
		).toMatchObject({ success: true, requiresUserAction: true });
	});
});

// 2026-09-03 browser battery: the reviewer listed the Marketing Brief and the
// Context Document for a message that named the Marketing Brief, and the gate
// asked the user to choose between them. The gate now reads the user's own
// words and only clarifies what they left open.
describe('findAmbiguousReferenceCandidatesForTargetIds with the user message', () => {
	const marketingBriefId = '1d651834-5dee-4e08-9f62-3072c2e61f4d';
	const contextDocumentId = '2f8a1c40-6b21-4e3a-9a77-51c0b7e9d1aa';
	const reviewerArguments = {
		reference_candidates: [
			{
				reference: 'the document',
				candidates: [
					{ id: marketingBriefId, title: 'QA — Cedar House Marketing Brief' },
					{ id: contextDocumentId, title: 'QA — Cedar House Context Document' }
				]
			}
		]
	} satisfies JsonObject;

	it('clarifies when the user message is unavailable', () => {
		expect(
			findAmbiguousReferenceCandidatesForTargetIds(reviewerArguments, [marketingBriefId])
		).toMatchObject({ reference: 'the document' });
	});

	it('does not clarify when the user named exactly one candidate by title', () => {
		expect(
			findAmbiguousReferenceCandidatesForTargetIds(
				reviewerArguments,
				[marketingBriefId],
				'Please add a Risks section to the QA — Cedar House Marketing Brief.'
			)
		).toBeNull();
	});

	it('matches a title across NFKC, case and collapsed whitespace differences', () => {
		expect(
			findAmbiguousReferenceCandidatesForTargetIds(
				reviewerArguments,
				[marketingBriefId],
				'add a risks section to the\n  qa — cedar house MARKETING brief please'
			)
		).toBeNull();
	});

	it('does not clarify when the user pasted exactly one candidate id', () => {
		expect(
			findAmbiguousReferenceCandidatesForTargetIds(
				reviewerArguments,
				[marketingBriefId],
				`Update document ${marketingBriefId} with a risks section.`
			)
		).toBeNull();
	});

	it('still clarifies when the user referred to the document generically', () => {
		expect(
			findAmbiguousReferenceCandidatesForTargetIds(
				reviewerArguments,
				[marketingBriefId],
				'Add a risks section to the existing document.'
			)
		).toMatchObject({ reference: 'the document' });
	});

	// 2026-09-04 retest: "Please complete those exact three document edits now.
	// Use the same existing document" followed a message that named the
	// Marketing Brief; the gate bounced the choice back to the user.
	it('does not clarify a follow-up when an earlier user message named the targeted candidate', () => {
		expect(
			findAmbiguousReferenceCandidatesForTargetIds(
				reviewerArguments,
				[marketingBriefId],
				[
					'Please complete those exact three edits now. Use the same existing document.',
					'Update the existing "QA — Cedar House Marketing Brief" in place. Change only Audience.'
				]
			)
		).toBeNull();
	});

	it('still clarifies a follow-up when the earlier naming does not match the contract target', () => {
		expect(
			findAmbiguousReferenceCandidatesForTargetIds(
				reviewerArguments,
				[contextDocumentId],
				[
					'Use the same existing document.',
					'Update the existing "QA — Cedar House Marketing Brief" in place.'
				]
			)
		).toMatchObject({ reference: 'the document' });
	});

	it('still clarifies a follow-up when earlier messages named both candidates', () => {
		expect(
			findAmbiguousReferenceCandidatesForTargetIds(
				reviewerArguments,
				[marketingBriefId],
				[
					'Use the same existing document.',
					'Compare the QA — Cedar House Marketing Brief with the QA — Cedar House Context Document.'
				]
			)
		).toMatchObject({ reference: 'the document' });
	});

	it('still clarifies when the message names both candidates', () => {
		expect(
			findAmbiguousReferenceCandidatesForTargetIds(
				reviewerArguments,
				[marketingBriefId],
				'Compare QA — Cedar House Marketing Brief with QA — Cedar House Context Document and update it.'
			)
		).toMatchObject({ reference: 'the document' });
	});

	it('still clarifies when the message pastes both candidate ids', () => {
		expect(
			findAmbiguousReferenceCandidatesForTargetIds(
				reviewerArguments,
				[marketingBriefId],
				`Look at ${marketingBriefId} and ${contextDocumentId}, then update the document.`
			)
		).toMatchObject({ reference: 'the document' });
	});
});

describe('latestUserMessageText', () => {
	it('reads the last user turn, including multimodal text parts', () => {
		expect(
			latestUserMessageText({
				messages: [
					{ role: 'user', content: 'First ask' },
					{ role: 'assistant', content: 'Answer' },
					{
						role: 'user',
						content: [
							{ type: 'text', text: 'Second ask' },
							{
								type: 'image_url',
								image_url: { url: 'https://example.test/a.png', detail: 'auto' }
							}
						]
					},
					{ role: 'tool', content: 'tool payload', tool_call_id: 'call-1' }
				]
			} as AgenticChatTurnProviderRequestV1)
		).toBe('Second ask');
	});

	it('returns null when the request carries no user turn', () => {
		expect(
			latestUserMessageText({
				messages: [{ role: 'system', content: 'System prompt' }]
			} as AgenticChatTurnProviderRequestV1)
		).toBeNull();
	});

	it('lists recent user turns latest first within the window', () => {
		expect(
			recentUserMessageTexts({
				messages: [
					{ role: 'user', content: 'One' },
					{ role: 'assistant', content: 'A' },
					{ role: 'user', content: 'Two' },
					{ role: 'user', content: 'Three' },
					{ role: 'user', content: 'Four' }
				]
			} as AgenticChatTurnProviderRequestV1)
		).toEqual(['Four', 'Three', 'Two']);
	});
});
