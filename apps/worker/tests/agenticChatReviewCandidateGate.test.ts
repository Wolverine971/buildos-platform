// apps/worker/tests/agenticChatReviewCandidateGate.test.ts

import { executeAgenticChatStandardControlToolV1 } from '@buildos/agentic-chat-runtime/loop';
import { describe, expect, it } from 'vitest';
import type { AgenticChatTurnProviderRequestV1 } from '../src/workers/agentic-chat/provider/contracts';
import { buildCandidateGateClarification } from '../src/workers/agentic-chat/provider/review/decision-handling';

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
