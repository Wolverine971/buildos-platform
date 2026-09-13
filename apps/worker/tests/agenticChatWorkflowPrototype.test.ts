// apps/worker/tests/agenticChatWorkflowPrototype.test.ts
import { describe, expect, it, vi } from 'vitest';
import { setTimeout as delay } from 'node:timers/promises';
import type { AgenticChatTurnClaimResultV1, TurnInputArtifactV1 } from '@buildos/shared-types';
import { parseChatWorkflowPrototypeUsers, readChatWorkflowProgress } from '@buildos/shared-types';
import type { MasterPromptContext } from '@buildos/agentic-chat-runtime/context';
import type { AgenticChatWorkerExecutionInputV1 } from '../src/workers/agentic-chat/executionInput';
import type {
	AgenticChatProviderInputV1,
	AgenticChatProviderStepV1,
	AgenticChatTurnProviderClientRequestV1,
	AgenticChatTurnProviderClientPortV1
} from '../src/workers/agentic-chat/provider/contracts';
import { AgenticChatProviderCapacity } from '../src/workers/agentic-chat/providerCapacity';
import {
	ChatWorkflowPrototypeProvider,
	buildWorkflowProjectBrief
} from '../src/workers/agentic-chat/workflow/prototype-provider';
const USER_ID = '10000000-0000-4000-8000-000000000001';
const SESSION_ID = '20000000-0000-4000-8000-000000000002';
const TURN_RUN_ID = '30000000-0000-4000-8000-000000000003';
const QUEUE_JOB_ID = '40000000-0000-4000-8000-000000000004';
const PROCESSING_TOKEN = '90000000-0000-4000-8000-000000000009';

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

const context: MasterPromptContext = {
	contextType: 'project',
	contextLoadSource: 'rpc',
	data: {
		project: { id: 'project-1', name: 'Workshop launch' },
		tasks: [{ id: 'task-1', title: 'Book venue' }]
	}
};
function harness(
	concurrency = 2,
	failRounds: number[] = [],
	malformedPlan = false,
	finalStream?: AgenticChatTurnProviderClientPortV1['stream']
) {
	const controller = new AbortController();
	const input: AgenticChatProviderInputV1 = {
		executionInput: executionInput(),
		processingToken: PROCESSING_TOKEN,
		signal: controller.signal
	};
	input.executionInput.requestPayload.message = '/workflow What should we do next?';
	const capacity = new AgenticChatProviderCapacity({ configured: true, concurrency });
	let active = 0,
		peak = 0;
	const calls: AgenticChatTurnProviderClientRequestV1[] = [];
	const client: AgenticChatTurnProviderClientPortV1 = {
		async *stream(request) {
			calls.push(request);
			active++;
			peak = Math.max(peak, active);
			try {
				if (request.logicalProviderRound === 4 && finalStream) {
					yield* finalStream(request);
					return;
				}
				await delay(20, undefined, { signal: request.signal });
				if (failRounds.includes(request.logicalProviderRound!))
					throw new Error('Unavailable');
				yield {
					type: 'text',
					content:
						request.logicalProviderRound === 1
							? malformedPlan
								? 'not JSON'
								: JSON.stringify({
										analyst: 'Review next actions',
										reviewer: 'Find hidden risks'
									})
							: request.logicalProviderRound === 4
								? 'Book the venue first, after confirming its capacity.'
								: `Findings from specialist ${request.logicalProviderRound}: task-1 needs a venue.`
				};
				yield {
					type: 'done',
					finishedReason: 'stop',
					usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30 }
				};
			} finally {
				active--;
			}
		}
	};
	const directInvocation = { async *stream() {}, release() {} };
	const direct = { prepare: vi.fn(async () => directInvocation) };
	const loadContext = vi.fn(async () => context);
	const provider = new ChatWorkflowPrototypeProvider({
		direct,
		client,
		capacity,
		allowedUserIds: [USER_ID],
		loadContext
	});
	return {
		provider,
		input,
		calls,
		capacity,
		controller,
		direct,
		directInvocation,
		loadContext,
		peak: () => peak
	};
}
async function collect(stream: AsyncIterable<AgenticChatProviderStepV1>) {
	const events: AgenticChatProviderStepV1[] = [];
	for await (const event of stream) events.push(event);
	return events;
}
function progress(events: AgenticChatProviderStepV1[]) {
	return events
		.filter((event) => event.type === 'semantic')
		.map((event) => readChatWorkflowProgress(event.eventPayload.workflow))
		.filter(Boolean);
}
describe('workflow prototype', () => {
	it.each([1, 2])(
		'runs four bounded passes with distinct roles at capacity %s',
		async (concurrency) => {
			const h = harness(concurrency);
			const invocation = await h.provider.prepare(h.input);
			expect(h.calls).toHaveLength(0);
			expect(h.loadContext).not.toHaveBeenCalled();
			expect(invocation.automaticDomainCapture).toBe('disabled');
			const events = await collect(invocation.stream());
			expect(h.calls.map((call) => call.logicalProviderRound)).toEqual([1, 2, 3, 4]);
			expect(h.peak()).toBe(concurrency);
			expect(
				h.calls.every((call) => call.tools.length === 0 && call.toolChoice === 'none')
			).toBe(true);
			expect(h.calls.map((call) => call.maxOutputTokens)).toEqual([900, 3200, 3200, 3200]);
			expect(h.calls[1]!.messages[0]!.content).toContain('ROLE: Project analyst');
			expect(h.calls[2]!.messages[0]!.content).toContain(
				'ROLE: Risk and alternatives reviewer'
			);
			expect(h.calls[2]!.messages[1]!.content).not.toContain('Findings from specialist 2');
			expect(h.calls[3]!.messages[1]!.content).toContain('Findings from specialist 2');
			expect(h.calls[3]!.messages[1]!.content).toContain('Findings from specialist 3');
			expect(events.filter((event) => event.type === 'text_delta')).toHaveLength(1);
			expect(events.at(-1)).toMatchObject({ type: 'finish', usage: { totalTokens: 120 } });
			expect(
				progress(events)
					.at(-1)!
					.steps.every((step) => step.status === 'completed')
			).toBe(true);
			expect(invocation.promptSnapshot).toBeDefined();
			expect(h.capacity.getSnapshot().activeRequests).toBe(0);
		}
	);
	it('keeps ordinary chat on the direct provider', async () => {
		const h = harness();
		h.input.executionInput.requestPayload.message = 'Hello';
		expect(await h.provider.prepare(h.input)).toBe(h.directInvocation);
		expect(h.loadContext).not.toHaveBeenCalled();
	});
	it('delivers editor chunks before completion while keeping specialist drafts private', async () => {
		let modelFinished = false;
		const h = harness(2, [], false, async function* () {
			yield { type: 'text', content: 'First recommendation. ' };
			yield { type: 'text', content: 'Second recommendation.' };
			modelFinished = true;
			yield { type: 'done', finishedReason: 'stop' };
		});
		const iterator = (await h.provider.prepare(h.input)).stream()[Symbol.asyncIterator]();
		const events: AgenticChatProviderStepV1[] = [];
		while (true) {
			const next = await iterator.next();
			expect(next.done).toBe(false);
			events.push(next.value!);
			if (next.value?.type === 'text_delta') break;
		}
		expect(modelFinished).toBe(false);
		expect(events.at(-1)).toEqual({ type: 'text_delta', text: 'First recommendation. ' });
		expect(progress(events).at(-1)!.steps[4]!.status).toBe('running');
		while (true) {
			const next = await iterator.next();
			if (next.done) break;
			events.push(next.value);
		}
		expect(events.filter((event) => event.type === 'text_delta')).toEqual([
			{ type: 'text_delta', text: 'First recommendation. ' },
			{ type: 'text_delta', text: 'Second recommendation.' }
		]);
		expect(events.at(-1)?.type).toBe('finish');
		expect(progress(events).at(-1)!.steps[4]!.status).toBe('completed');
		expect(h.capacity.getSnapshot().activeRequests).toBe(0);
	});
	it('prefixes a partial review only once across multiple editor chunks', async () => {
		const h = harness(2, [3], false, async function* () {
			yield { type: 'text', content: 'First. ' };
			yield { type: 'text', content: 'Second.' };
			yield { type: 'done', finishedReason: 'stop' };
		});
		const events = await collect((await h.provider.prepare(h.input)).stream());
		const text = events
			.filter((event) => event.type === 'text_delta')
			.map((event) => event.text)
			.join('');
		expect(text).toBe('Partial review: one specialist could not finish.\n\nFirst. Second.');
	});
	it.each(['disconnect', 'length'] as const)(
		'fails a %s after visible text without replay or a successful finish',
		async (failure) => {
			const h = harness(2, [], false, async function* () {
				yield { type: 'text', content: 'Incomplete recommendation.' };
				if (failure === 'disconnect') throw new Error('Connection lost');
				yield { type: 'done', finishedReason: 'length' };
			});
			const events: AgenticChatProviderStepV1[] = [];
			await expect(
				(async () => {
					for await (const event of (await h.provider.prepare(h.input)).stream())
						events.push(event);
				})()
			).rejects.toThrow(
				failure === 'disconnect' ? 'Connection lost' : 'workflow_incomplete_response'
			);
			expect(events.filter((event) => event.type === 'text_delta')).toEqual([
				{ type: 'text_delta', text: 'Incomplete recommendation.' }
			]);
			expect(events.some((event) => event.type === 'finish')).toBe(false);
			expect(progress(events).at(-1)!.steps[4]!.status).toBe('failed');
			expect(h.calls.filter((call) => call.logicalProviderRound === 4)).toHaveLength(1);
			expect(h.capacity.getSnapshot().activeRequests).toBe(0);
		}
	);
	it('stops synthesis immediately after cancellation without another chunk or a completion claim', async () => {
		const h = harness(2, [], false, async function* () {
			yield { type: 'text', content: 'First chunk.' };
			yield { type: 'text', content: 'Must not be shown.' };
			yield { type: 'done', finishedReason: 'stop' };
		});
		const events: AgenticChatProviderStepV1[] = [];
		await expect(
			(async () => {
				for await (const event of (await h.provider.prepare(h.input)).stream()) {
					events.push(event);
					if (event.type === 'text_delta') h.controller.abort(new Error('Stopped'));
				}
			})()
		).rejects.toThrow('Stopped');
		expect(events.filter((event) => event.type === 'text_delta')).toHaveLength(1);
		expect(events.some((event) => event.type === 'finish')).toBe(false);
		expect(progress(events).at(-1)!.steps[4]!.status).toBe('running');
		expect(h.capacity.getSnapshot().activeRequests).toBe(0);
	});
	it.each(['cohort', 'scope', 'attachments', 'empty'])(
		'rejects invalid %s without ordinary fallback or model dispatch',
		async (mode) => {
			const h = harness();
			if (mode === 'cohort')
				h.input.executionInput.claim = {
					...h.input.executionInput.claim,
					userId: SESSION_ID
				};
			if (mode === 'scope')
				h.input.executionInput.requestPayload.context = { type: 'global' };
			if (mode === 'attachments') h.input.executionInput.requestPayload.attachments = [{}];
			if (mode === 'empty') h.input.executionInput.requestPayload.message = '/workflow';
			const invocation = await h.provider.prepare(h.input);
			await collect(invocation.stream());
			expect(invocation.automaticDomainCapture).toBe('disabled');
			expect(h.calls).toHaveLength(0);
			expect(h.direct.prepare).not.toHaveBeenCalled();
		}
	);
	it('fails closed when current context access fails', async () => {
		const h = harness();
		h.loadContext.mockRejectedValue(new Error('Access denied'));
		await expect(collect((await h.provider.prepare(h.input)).stream())).rejects.toThrow(
			'Access denied'
		);
		expect(h.calls).toHaveLength(0);
	});
	it('labels a failed specialist as partial and synthesizes the surviving report', async () => {
		const h = harness(2, [3]);
		const events = await collect((await h.provider.prepare(h.input)).stream());
		expect(events.find((event) => event.type === 'text_delta')).toMatchObject({
			text: expect.stringContaining('Partial review:')
		});
		expect(progress(events).at(-1)!.steps[3]!.status).toBe('failed');
	});
	it('stops if both specialists fail instead of inventing a synthesis', async () => {
		const h = harness(2, [2, 3]);
		await expect(collect((await h.provider.prepare(h.input)).stream())).rejects.toThrow(
			'Neither'
		);
		expect(h.calls).toHaveLength(3);
		expect(h.capacity.getSnapshot().activeRequests).toBe(0);
	});
	it('reports planner fallback explicitly', async () => {
		const h = harness(2, [], true);
		const events = await collect((await h.provider.prepare(h.input)).stream());
		expect(progress(events).at(-1)!.steps[1]!.result).toContain(
			'using the fixed two-specialist plan'
		);
	});
	it('cancels running specialists and frees every capacity slot', async () => {
		const h = harness();
		const invocation = await h.provider.prepare(h.input);
		const work = collect(invocation.stream());
		while (h.calls.length < 3) await delay(1);
		h.controller.abort(new Error('Stopped'));
		await expect(work).rejects.toThrow();
		expect(h.calls).toHaveLength(3);
		expect(h.capacity.getSnapshot().activeRequests).toBe(0);
	});
	it('bounds evidence and rejects mismatched or fallback context', () => {
		expect(() => buildWorkflowProjectBrief(context, 'other')).toThrow();
		expect(() =>
			buildWorkflowProjectBrief({ ...context, contextLoadSource: 'none' }, 'project-1')
		).toThrow();
		expect(buildWorkflowProjectBrief(context, 'project-1')).toContain('Book venue');
	});
	it('does not accept wildcard pilot access or malformed progress', () => {
		expect(parseChatWorkflowPrototypeUsers(`*, ${USER_ID},${USER_ID}`)).toEqual([USER_ID]);
		expect(
			readChatWorkflowProgress({ version: 'chat_workflow_prototype_v1', steps: [] })
		).toBeNull();
	});
});
