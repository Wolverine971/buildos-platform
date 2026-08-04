// apps/worker/tests/agenticChatReadOnlyProvider.test.ts
import type { AgenticChatTurnClaimResultV1, TurnInputArtifactV1 } from '@buildos/shared-types';
import { describe, expect, it, vi } from 'vitest';
import type { AgenticChatWorkerExecutionInputV1 } from '../src/workers/agentic-chat/executionInput';
import {
	AgenticChatProviderExecutionError,
	type AgenticChatProviderStepV1
} from '../src/workers/agentic-chat/providerContract';
import { AgenticChatProviderCapacity } from '../src/workers/agentic-chat/providerCapacity';
import {
	AgenticChatReadOnlyProviderAdapter,
	type AgenticChatReadOnlyProviderClientEventV1
} from '../src/workers/agentic-chat/readOnlyProvider';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const SESSION_ID = '20000000-0000-4000-8000-000000000002';
const TURN_RUN_ID = '30000000-0000-4000-8000-000000000003';
const QUEUE_JOB_ID = '40000000-0000-4000-8000-000000000004';

function executionInput(
	overrides: Partial<AgenticChatWorkerExecutionInputV1> = {}
): AgenticChatWorkerExecutionInputV1 {
	const claim = {
		outcome: 'claimed',
		executionMayStart: true,
		turnRunId: TURN_RUN_ID,
		queueJobId: QUEUE_JOB_ID,
		sessionId: SESSION_ID,
		userId: USER_ID,
		correlationId: '50000000-0000-4000-8000-000000000005',
		executionGeneration: 1,
		status: 'running',
		inputArtifactId: '60000000-0000-4000-8000-000000000006',
		userMessageId: '70000000-0000-4000-8000-000000000007'
	} satisfies Extract<
		AgenticChatTurnClaimResultV1,
		{ outcome: 'claimed' | 'matching_current_claim' }
	>;
	const artifact = {
		artifactVersion: 'agentic_chat_input_v2',
		historySource: 'admission_window',
		history: [
			{
				sourceMessageId: '80000000-0000-4000-8000-000000000008',
				role: 'assistant',
				content: 'Frozen reply',
				attachments: [],
				toolCalls: [],
				toolCallId: null
			}
		],
		prepared: {
			sourcePreparedPromptId: null,
			contextPayload: {},
			conversationSummary: null,
			surfaceProfile: 'project_default',
			systemPrompt: 'System prompt\n',
			promptSections: [],
			toolSurface: {}
		},
		createdAt: '2026-08-03T12:00:00.000Z',
		retainUntil: '2026-08-10T12:00:00.000Z',
		contentHash: '0'.repeat(64)
	} satisfies TurnInputArtifactV1;
	return {
		claim,
		streamRunId: 'stream-run-1',
		clientTurnId: 'client-turn-1',
		requestPayload: {
			clientTurnId: 'client-turn-1',
			streamRunId: 'stream-run-1',
			message: 'Current request',
			attachments: [],
			context: { type: 'project', entityId: 'project-1', projectId: 'project-1' }
		},
		timingBaseline: {
			admittedAt: '2026-08-03T11:59:57.000Z',
			startedAt: '2026-08-03T11:59:58.000Z',
			workerStartedAt: '2026-08-03T11:59:59.000Z',
			executionStartedAt: null,
			historyCutoffAt: '2026-08-03T11:59:58.000Z',
			requestPrewarmedContext: false,
			cacheSource: 'not_requested',
			cacheAgeSeconds: null,
			historyStrategy: 'raw_history',
			historyCompressed: false,
			rawHistoryCount: 1,
			historyForModelCount: 1,
			preparedPromptId: null,
			preparedPromptHit: false,
			preparedPromptMissReason: null,
			preparedSurfaceProfile: null
		},
		artifact,
		...overrides
	};
}

function clientWith(events: AgenticChatReadOnlyProviderClientEventV1[]) {
	return {
		stream: vi.fn(() =>
			(async function* () {
				for (const event of events) yield event;
			})()
		)
	};
}

async function collect(stream: AsyncIterable<AgenticChatProviderStepV1>) {
	const result: AgenticChatProviderStepV1[] = [];
	for await (const step of stream) result.push(step);
	return result;
}

describe('AgenticChatReadOnlyProviderAdapter', () => {
	it('reserves before start and defers the first client call until stream', async () => {
		const client = clientWith([
			{ type: 'reasoning', reasoning: 'private chain' },
			{ type: 'text', content: 'Visible answer' },
			{
				type: 'done',
				finishedReason: 'stop',
				usage: { prompt_tokens: 8, completion_tokens: 2, total_tokens: 10 }
			}
		]);
		const capacity = new AgenticChatProviderCapacity({ configured: true, concurrency: 1 });
		const adapter = new AgenticChatReadOnlyProviderAdapter({ client, capacity });
		const signal = new AbortController().signal;

		const invocation = await adapter.prepare({ executionInput: executionInput(), signal });
		expect(client.stream).not.toHaveBeenCalled();
		expect(capacity.getSnapshot()).toMatchObject({ available: false, activeRequests: 1 });

		await expect(collect(invocation.stream())).resolves.toEqual([
			{ type: 'text_delta', text: 'Visible answer' },
			{
				type: 'finish',
				finishedReason: 'stop',
				usage: { promptTokens: 8, completionTokens: 2, totalTokens: 10 }
			}
		]);
		expect(client.stream).toHaveBeenCalledWith({
			messages: [
				{ role: 'system', content: 'System prompt\n' },
				{ role: 'assistant', content: 'Frozen reply' },
				{ role: 'user', content: 'Current request' }
			],
			toolChoice: 'none',
			userId: USER_ID,
			sessionId: SESSION_ID,
			turnRunId: TURN_RUN_ID,
			streamRunId: 'stream-run-1',
			clientTurnId: 'client-turn-1',
			contextType: 'project',
			entityId: 'project-1',
			projectId: 'project-1',
			signal
		});
		expect(capacity.getSnapshot()).toMatchObject({ available: true, activeRequests: 0 });
	});

	it('rejects attachment and tool-call surfaces while always releasing capacity', async () => {
		const client = clientWith([{ type: 'tool_call', toolCall: { name: 'mutate' } }]);
		const capacity = new AgenticChatProviderCapacity({ configured: true, concurrency: 1 });
		const adapter = new AgenticChatReadOnlyProviderAdapter({ client, capacity });
		const invalid = executionInput({
			requestPayload: {
				message: 'Current request',
				attachments: [{ id: 'attachment-1' }],
				context: { type: 'project' }
			}
		});

		await expect(
			adapter.prepare({ executionInput: invalid, signal: new AbortController().signal })
		).rejects.toMatchObject({ code: 'attachments_disabled', failureClass: 'permanent' });
		expect(client.stream).not.toHaveBeenCalled();
		expect(capacity.getSnapshot().available).toBe(true);

		const invocation = await adapter.prepare({
			executionInput: executionInput(),
			signal: new AbortController().signal
		});
		await expect(collect(invocation.stream())).rejects.toMatchObject({
			code: 'provider_tool_call_disabled',
			failureClass: 'permanent'
		});
		expect(capacity.getSnapshot()).toMatchObject({ available: true, activeRequests: 0 });

		const finishToolCall = new AgenticChatReadOnlyProviderAdapter({
			client: clientWith([{ type: 'done', finishedReason: 'tool_calls' }]),
			capacity
		});
		const finishInvocation = await finishToolCall.prepare({
			executionInput: executionInput(),
			signal: new AbortController().signal
		});
		await expect(collect(finishInvocation.stream())).rejects.toMatchObject({
			code: 'provider_tool_call_disabled',
			failureClass: 'permanent'
		});
		expect(capacity.getSnapshot()).toMatchObject({ available: true, activeRequests: 0 });
	});

	it('turns retryable provider errors into bounded pressure evidence', async () => {
		let nowMs = 1_000;
		const client = clientWith([{ type: 'error', error: 'rate limited', retryable: true }]);
		const capacity = new AgenticChatProviderCapacity({
			configured: true,
			concurrency: 1,
			now: () => nowMs
		});
		const adapter = new AgenticChatReadOnlyProviderAdapter({ client, capacity }, 2_000);
		const invocation = await adapter.prepare({
			executionInput: executionInput(),
			signal: new AbortController().signal
		});

		await expect(collect(invocation.stream())).rejects.toMatchObject({
			code: 'provider_stream_error',
			failureClass: 'provider_throttle'
		});
		expect(capacity.getSnapshot()).toMatchObject({
			available: false,
			activeRequests: 0,
			degradedUntilMs: 3_000
		});
		nowMs = 3_000;
		expect(capacity.getSnapshot().available).toBe(true);
	});

	it('rejects malformed completion and single-use invocation violations', async () => {
		const capacity = new AgenticChatProviderCapacity({ configured: true, concurrency: 1 });
		const missingDone = new AgenticChatReadOnlyProviderAdapter({
			client: clientWith([{ type: 'text', content: 'partial' }]),
			capacity
		});
		const first = await missingDone.prepare({
			executionInput: executionInput(),
			signal: new AbortController().signal
		});
		await expect(collect(first.stream())).rejects.toMatchObject({
			code: 'provider_missing_done',
			failureClass: 'unknown'
		});
		expect(capacity.getSnapshot().available).toBe(true);

		const valid = new AgenticChatReadOnlyProviderAdapter({
			client: clientWith([{ type: 'done' }]),
			capacity
		});
		const released = await valid.prepare({
			executionInput: executionInput(),
			signal: new AbortController().signal
		});
		released.release();
		expect(() => released.stream()).toThrow(AgenticChatProviderExecutionError);

		const reused = await valid.prepare({
			executionInput: executionInput(),
			signal: new AbortController().signal
		});
		await collect(reused.stream());
		expect(() => reused.stream()).toThrow('released before streaming');
	});
});
