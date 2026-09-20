// packages/shared-types/src/agentic-chat-workflow-contract.test.ts
import { describe, expect, it } from 'vitest';
import {
	AGENTIC_CHAT_INPUT_ARTIFACT_VERSION_V4,
	AGENTIC_CHAT_WORKFLOW_POLICY_V1,
	AGENTIC_CHAT_DOCUMENT_READ_POLICY_V1,
	AGENTIC_CHAT_DOCUMENT_READ_POLICY_REF,
	AGENTIC_CHAT_WORKFLOW_REQUEST_HASH_VERSION,
	buildAgenticChatWorkflowReviewIntentV1,
	computeAgenticChatWorkflowReservationMicroUsdV1,
	hashAgenticChatRawWorkflowInputV4,
	hashAgenticChatWorkflowRequestV1,
	validateAgenticChatRawWorkflowInputV4,
	type AgenticChatRawWorkflowInputV4,
	type AgenticChatRawWorkflowRequestV4,
	type AgenticChatWorkflowHistoryMessageV1
} from './agentic-chat-workflow-contract';

const EXPECTED = {
	artifactId: '60000000-0000-4000-8000-000000000006',
	turnRunId: '30000000-0000-4000-8000-000000000003',
	sessionId: '20000000-0000-4000-8000-000000000002',
	userId: '10000000-0000-4000-8000-000000000001'
};
const PROJECT_ID = '40000000-0000-4000-8000-000000000004';
const USER_MESSAGE_ID = '80000000-0000-4000-8000-000000000008';
const MESSAGE = 'Review Café 🚀 — what "must" happen next?';
const HISTORY: AgenticChatWorkflowHistoryMessageV1[] = [
	{
		sourceMessageId: '90000000-0000-4000-8000-000000000009',
		role: 'assistant',
		content: 'Earlier:\n\tbook the venue \\ then "permits" \u2028 done.',
		attachments: [],
		toolCalls: [],
		toolCallId: null
	}
];

function request(
	overrides: Partial<AgenticChatRawWorkflowRequestV4> = {}
): AgenticChatRawWorkflowRequestV4 {
	const message = overrides.message ?? MESSAGE;
	return {
		requestId: EXPECTED.artifactId,
		turnRunId: EXPECTED.turnRunId,
		sessionId: EXPECTED.sessionId,
		userId: EXPECTED.userId,
		userMessageId: USER_MESSAGE_ID,
		clientTurnId: 'client-turn-1',
		streamRunId: 'stream-run-1',
		message,
		context: { type: 'project', entityId: PROJECT_ID, projectId: PROJECT_ID },
		reviewIntent: buildAgenticChatWorkflowReviewIntentV1(message),
		policy: AGENTIC_CHAT_WORKFLOW_POLICY_V1,
		policyRef: 'policy-ref-1',
		cacheRef: null,
		...overrides
	};
}

async function rawInput(
	requestValue = request(),
	history = HISTORY
): Promise<AgenticChatRawWorkflowInputV4> {
	return {
		artifactVersion: AGENTIC_CHAT_INPUT_ARTIFACT_VERSION_V4,
		request: requestValue,
		historySource: 'admission_window',
		history,
		requestHashVersion: AGENTIC_CHAT_WORKFLOW_REQUEST_HASH_VERSION,
		...(await hashAgenticChatRawWorkflowInputV4(requestValue, history)),
		createdAt: '2026-09-14T12:00:00.000+00:00',
		retainUntil: '2026-09-21T12:00:00.000+00:00'
	};
}

async function codeFor(input: AgenticChatRawWorkflowInputV4, expected = EXPECTED) {
	const result = await validateAgenticChatRawWorkflowInputV4(input, expected);
	return result.ok ? 'ok' : result.code;
}

describe('agentic chat workflow v1 contract', () => {
	it('binds document-read permission to its explicit policy reference', async () => {
		const policy = AGENTIC_CHAT_DOCUMENT_READ_POLICY_V1;
		expect(
			await codeFor(
				await rawInput(
					request({ policy, policyRef: AGENTIC_CHAT_DOCUMENT_READ_POLICY_REF })
				)
			)
		).toBe('ok');
		expect(await codeFor(await rawInput(request({ policy })))).not.toBe('ok');
		expect(
			await codeFor(
				await rawInput(request({ policyRef: AGENTIC_CHAT_DOCUMENT_READ_POLICY_REF }))
			)
		).not.toBe('ok');
		expect(policy.maxSpendMicroUsd).toBe(AGENTIC_CHAT_WORKFLOW_POLICY_V1.maxSpendMicroUsd);
	});
	it('pins the fixed read-only pilot policy the database stores', () => {
		expect(AGENTIC_CHAT_WORKFLOW_POLICY_V1).toEqual({
			version: 'agentic_chat_project_review_policy_v1',
			workflowVersion: 'agentic_chat_workflow_v1',
			scope: 'project_text',
			domainAccess: 'read_only',
			modelTools: 'none',
			domainWrites: 'forbidden',
			recoveryPolicy: 'durable_read_only_v1',
			maxSpecialistConcurrency: 2,
			maxStepAttempts: 2,
			maxPhysicalDispatches: 16,
			maxSpendMicroUsd: 250_000,
			synthesisHeadroomMicroUsd: 50_000,
			wholeRunLifetimeMs: 900_000
		});
	});

	it('reserves integer micro-USD at the admitted maximum rates, rounded up', () => {
		expect(computeAgenticChatWorkflowReservationMicroUsdV1(2_000, 1_200)).toBe(2_348);
		expect(computeAgenticChatWorkflowReservationMicroUsdV1(131_072, 4_000)).toBe(44_429);
		expect(computeAgenticChatWorkflowReservationMicroUsdV1(1, 1)).toBe(309);
		for (const [bytes, tokens] of [
			[0, 1],
			[131_073, 1],
			[1, 0],
			[1.5, 1]
		]) {
			expect(() => computeAgenticChatWorkflowReservationMicroUsdV1(bytes!, tokens!)).toThrow(
				RangeError
			);
		}
	});

	it('keeps cache references out of request semantics but inside content integrity', async () => {
		const cached = request({
			cacheRef: { id: '70000000-0000-4000-8000-000000000007', generation: 'g1' }
		});
		expect(await hashAgenticChatWorkflowRequestV1(cached)).toBe(
			await hashAgenticChatWorkflowRequestV1(request())
		);
		expect((await rawInput(cached)).contentHash).not.toBe((await rawInput()).contentHash);
		await expect(codeFor(await rawInput(cached))).resolves.toBe('ok');
	});

	it('accepts a server-shaped raw request with Unicode message and history', async () => {
		await expect(codeFor(await rawInput())).resolves.toBe('ok');
		await expect(codeFor(await rawInput(request(), []))).resolves.toBe('ok');
	});

	it('fails closed on every tampered or unsupported field', async () => {
		const valid = await rawInput();
		const mutate = (change: (input: AgenticChatRawWorkflowInputV4) => void) => {
			const copy = structuredClone(valid);
			change(copy);
			return copy;
		};

		await expect(
			codeFor(mutate((input) => (input.artifactVersion = 'agentic_chat_input_v3' as never)))
		).resolves.toBe('invalid_version');
		await expect(
			codeFor(mutate((input) => ((input.request as Record<string, unknown>).extra = true)))
		).resolves.toBe('invalid_request');
		await expect(codeFor(valid, { ...EXPECTED, artifactId: USER_MESSAGE_ID })).resolves.toBe(
			'invalid_request'
		);
		await expect(
			codeFor(await rawInput(request({ message: ' padded question ' })))
		).resolves.toBe('invalid_message');
		await expect(
			codeFor(
				await rawInput(
					request({
						policy: { ...AGENTIC_CHAT_WORKFLOW_POLICY_V1, maxSpendMicroUsd: 1 } as never
					})
				)
			)
		).resolves.toBe('invalid_policy');
		await expect(
			codeFor(mutate((input) => (input.request.message = 'A different admitted question?')))
		).resolves.toBe('invalid_review_intent');
		await expect(
			codeFor(
				await rawInput(request(), [
					{ ...HISTORY[0]!, attachments: [{ id: 'file' }] as never }
				])
			)
		).resolves.toBe('invalid_history');
		await expect(
			codeFor(
				await rawInput(request(), [{ ...HISTORY[0]!, sourceMessageId: USER_MESSAGE_ID }])
			)
		).resolves.toBe('admitted_message_in_history');
		await expect(
			codeFor(mutate((input) => (input.requestHash = '0'.repeat(64))))
		).resolves.toBe('request_hash_mismatch');
		await expect(
			codeFor(mutate((input) => (input.history[0]!.content = 'Rewritten history')))
		).resolves.toBe('history_hash_mismatch');
		await expect(
			codeFor(mutate((input) => (input.contentHash = 'f'.repeat(64))))
		).resolves.toBe('content_hash_mismatch');
		await expect(codeFor(mutate((input) => (input.historyBytes += 1)))).resolves.toBe(
			'byte_count_mismatch'
		);
		await expect(
			codeFor(mutate((input) => (input.retainUntil = '2026-09-20T12:00:00.000+00:00')))
		).resolves.toBe('invalid_retention');
	});
});
