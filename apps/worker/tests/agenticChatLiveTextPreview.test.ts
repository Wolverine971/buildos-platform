// apps/worker/tests/agenticChatLiveTextPreview.test.ts

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	AGENTIC_CHAT_LIVE_TEXT_PREVIEW_MAX_BYTES,
	AGENTIC_CHAT_STREAM_TEXT_MAX_BYTES,
	type AgenticChatTextBatchFlushRpcResultV1,
	type AgenticChatTurnClaimResultV1,
	type TurnInputArtifactV1
} from '@buildos/shared-types';
import type {
	AgenticChatLiveTextPreviewPortV1,
	AgenticChatLiveTextPreviewUpdateV1,
	AgenticChatProviderStepV1,
	AgenticChatTurnProviderClientEventV1,
	AgenticChatTurnProviderClientPortV1,
	AgenticChatTurnProviderRequestV1
} from '../src/workers/agentic-chat/provider/contracts';
import {
	LIVE_TEXT_PREVIEW_INTERVAL_MS,
	livePreviewPortFor,
	streamBufferedProviderPass
} from '../src/workers/agentic-chat/provider/provider-pass';
import { AgenticChatProviderCapacity } from '../src/workers/agentic-chat/provider/provider-capacity';
import { AgenticChatTurnProviderAdapter } from '../src/workers/agentic-chat/provider/turn-provider';
import type { AgenticChatWorkerExecutionInputV1 } from '../src/workers/agentic-chat/turn/execution-input';
import {
	AgenticChatLiveTextPreviewBroadcaster,
	withAgenticChatLiveTextPreviewV1
} from '../src/workers/agentic-chat/stream/live-text-preview';
import {
	AgenticChatPublisherOverloadError,
	AgenticChatStreamPublisher,
	type AgenticChatBroadcastMessageV1,
	type AgenticChatPersistencePortV1,
	type AgenticChatPublisherTurnV1
} from '../src/workers/agentic-chat/stream/stream-publisher';
import { deferred } from './helpers/deferred';

afterEach(() => {
	vi.useRealTimers();
});

type ScriptStep = AgenticChatTurnProviderClientEventV1 | { advanceMs: number };

function request(
	overrides: Partial<AgenticChatTurnProviderRequestV1> = {}
): AgenticChatTurnProviderRequestV1 {
	return {
		messages: [{ role: 'user', content: 'What is on my plate?' }],
		tools: [],
		toolChoice: 'auto',
		userId: 'user-1',
		sessionId: 'session-1',
		turnRunId: 'turn-1',
		streamRunId: 'stream-1',
		clientTurnId: 'client-1',
		contextType: 'project',
		entityId: null,
		projectId: null,
		queueJobId: 'job-1',
		processingToken: 'token-1',
		executionGeneration: 3,
		providerRound: 'initial',
		logicalProviderRound: 1,
		passRole: 'acting',
		signal: new AbortController().signal,
		...overrides
	};
}

/** One scripted attempt per `stream()` call; `advanceMs` moves fake time mid-stream. */
function scriptedClient(attempts: ScriptStep[][], log?: string[]) {
	return {
		stream: vi.fn<AgenticChatTurnProviderClientPortV1['stream']>(() => {
			const steps = attempts.shift() ?? [];
			return (async function* () {
				for (const step of steps) {
					if ('advanceMs' in step) {
						vi.advanceTimersByTime(step.advanceMs);
						continue;
					}
					log?.push(`client:${step.type}`);
					yield step;
				}
			})();
		})
	};
}

function recordingPort(log?: string[]) {
	const updates: AgenticChatLiveTextPreviewUpdateV1[] = [];
	const port: AgenticChatLiveTextPreviewPortV1 = {
		publish: vi.fn((update: AgenticChatLiveTextPreviewUpdateV1) => {
			updates.push(update);
			log?.push(`preview:${update.state}:${update.text}`);
		})
	};
	return { port, updates };
}

const capacity = { markTemporarilyUnavailable: vi.fn() };

async function drain(
	pass: AsyncIterable<AgenticChatTurnProviderClientEventV1>,
	log?: string[]
): Promise<AgenticChatTurnProviderClientEventV1[]> {
	const events: AgenticChatTurnProviderClientEventV1[] = [];
	for await (const event of pass) {
		log?.push(`released:${event.type}`);
		events.push(event);
	}
	return events;
}

describe('provider pass live text preview', () => {
	it('sends the first delta at once, throttles the rest, and flushes before release', async () => {
		vi.useFakeTimers({ now: 1_000_000 });
		const log: string[] = [];
		const { port, updates } = recordingPort(log);
		const client = scriptedClient(
			[
				[
					{ type: 'text', content: 'Hel' },
					{ advanceMs: 30 },
					{ type: 'text', content: 'lo' },
					{ advanceMs: 30 },
					{ type: 'text', content: ' wor' },
					// The trailing timer fires at the 100ms mark with the latest text.
					{ advanceMs: 50 },
					{ type: 'text', content: 'ld' },
					{ type: 'done', finishedReason: 'stop' }
				]
			],
			log
		);

		const events = await drain(
			streamBufferedProviderPass(
				request(),
				{ ...client, livePreview: port },
				capacity,
				2_000
			),
			log
		);

		expect(updates.map(({ state, text }) => [state, text])).toEqual([
			['streaming', 'Hel'],
			['streaming', 'Hello wor'],
			['streaming', 'Hello world']
		]);
		expect(new Set(updates.map((update) => update.passKey)).size).toBe(1);
		expect(updates[0]).toMatchObject({ turnRunId: 'turn-1', executionGeneration: 3 });
		// Nothing is released before the pass ends, and the final flush precedes release.
		expect(log.indexOf('preview:streaming:Hello world')).toBeLessThan(
			log.indexOf('released:text')
		);
		expect(log.filter((entry) => entry.startsWith('released:'))).toEqual([
			'released:text',
			'released:text',
			'released:text',
			'released:text',
			'released:done'
		]);
		expect(events).toHaveLength(5);
	});

	it('never sends more than one update per interval while text keeps arriving', async () => {
		vi.useFakeTimers({ now: 2_000_000 });
		const { port } = recordingPort();
		const steps: ScriptStep[] = [];
		for (let index = 0; index < 50; index += 1) {
			steps.push({ type: 'text', content: `w${index} ` }, { advanceMs: 10 });
		}
		steps.push({ type: 'done', finishedReason: 'stop' });
		const sentAt: number[] = [];
		const timedPort: AgenticChatLiveTextPreviewPortV1 = {
			publish: (update) => {
				sentAt.push(Date.now());
				port.publish(update);
			}
		};

		await drain(
			streamBufferedProviderPass(
				request(),
				{ ...scriptedClient([steps]), livePreview: timedPort },
				capacity,
				2_000
			)
		);

		// 500ms of streaming: the first update, ~one per 100ms, and the final flush.
		expect(sentAt.length).toBeGreaterThanOrEqual(5);
		expect(sentAt.length).toBeLessThanOrEqual(7);
		const streamingGaps = sentAt.slice(1, -1).map((at, index) => at - sentAt[index]!);
		for (const gap of streamingGaps) expect(gap).toBeGreaterThanOrEqual(LIVE_TEXT_PREVIEW_INTERVAL_MS);
	});

	it('discards a retried attempt and previews the retry under a new pass key', async () => {
		vi.useFakeTimers({ now: 3_000_000 });
		const { port, updates } = recordingPort();
		const client = scriptedClient([
			[
				{ type: 'text', content: 'Draft answer' },
				{ type: 'error', error: 'rate limited', retryable: true }
			],
			[
				{ type: 'text', content: 'Final answer' },
				{ type: 'done', finishedReason: 'stop' }
			]
		]);

		const events = await drain(
			streamBufferedProviderPass(request(), { ...client, livePreview: port }, capacity, 2_000)
		);

		expect(events).toEqual([
			{ type: 'text', content: 'Final answer' },
			{ type: 'done', finishedReason: 'stop' }
		]);
		expect(updates.map(({ state, text }) => [state, text])).toEqual([
			['streaming', 'Draft answer'],
			['discard', ''],
			['streaming', 'Final answer']
		]);
		expect(updates[1]!.passKey).toBe(updates[0]!.passKey);
		expect(updates[2]!.passKey).not.toBe(updates[0]!.passKey);
	});

	it('discards a truncated tool-call pass before its retry', async () => {
		vi.useFakeTimers({ now: 3_500_000 });
		const { port, updates } = recordingPort();
		// Streamed calls that end on a non-tool finish reason cannot be trusted complete.
		const toolCall = [
			{
				index: 0,
				id: 'call-1',
				type: 'function',
				function: { name: 'read_things', arguments: '{}' }
			}
		];
		const client = scriptedClient([
			[
				{ type: 'text', content: 'Let me look.' },
				{ type: 'tool_call', toolCall },
				{ type: 'done', finishedReason: 'stop' }
			],
			[
				{ type: 'text', content: 'Here it is.' },
				{ type: 'done', finishedReason: 'stop' }
			]
		]);

		await drain(
			streamBufferedProviderPass(request(), { ...client, livePreview: port }, capacity, 2_000)
		);

		expect(updates.map(({ state, text }) => [state, text])).toEqual([
			['streaming', 'Let me look.'],
			['discard', ''],
			['streaming', 'Here it is.']
		]);
	});

	it('discards a failed last attempt before the partial is released', async () => {
		vi.useFakeTimers({ now: 4_000_000 });
		const log: string[] = [];
		const { port } = recordingPort(log);
		const client = scriptedClient([
			[
				{ type: 'text', content: 'First try' },
				{ type: 'error', error: 'overloaded', retryable: true }
			],
			[
				{ type: 'text', content: 'Partial synthesis' },
				{ type: 'error', error: 'dead', retryable: false }
			]
		]);

		const events = await drain(
			streamBufferedProviderPass(
				request({ toolChoice: 'none', passRole: 'final_response' }),
				{ ...client, livePreview: port },
				capacity,
				2_000
			),
			log
		);

		expect(events.map((event) => event.type)).toEqual(['text', 'error']);
		expect(log.filter((entry) => !entry.startsWith('client:'))).toEqual([
			'preview:streaming:First try',
			'preview:discard:',
			'preview:streaming:Partial synthesis',
			'preview:discard:',
			'released:text',
			'released:error'
		]);
	});

	it('discards when the turn aborts mid-pass', async () => {
		vi.useFakeTimers({ now: 5_000_000 });
		const { port, updates } = recordingPort();
		const controller = new AbortController();
		const client = {
			stream: vi.fn<AgenticChatTurnProviderClientPortV1['stream']>(() =>
				(async function* () {
					yield { type: 'text', content: 'Half an answer' } as const;
					controller.abort(new Error('cancelled'));
					yield { type: 'text', content: ' and more' } as const;
				})()
			)
		};

		await expect(
			drain(
				streamBufferedProviderPass(
					request({ signal: controller.signal }),
					{ ...client, livePreview: port },
					capacity,
					2_000
				)
			)
		).rejects.toThrow();
		expect(updates.map(({ state }) => state)).toEqual(['streaming', 'discard']);
	});

	it('previews only user-facing passes, decided from structured pass state', () => {
		const { port } = recordingPort();
		const client = { stream: vi.fn(), livePreview: port };
		expect(livePreviewPortFor(request({ passRole: 'acting' }), client)).toBe(port);
		expect(livePreviewPortFor(request({ passRole: undefined }), client)).toBe(port);
		expect(livePreviewPortFor(request({ passRole: 'repair' }), client)).toBe(port);
		expect(
			livePreviewPortFor(request({ passRole: 'final_response', toolChoice: 'none' }), client)
		).toBe(port);
		expect(livePreviewPortFor(request({ passRole: 'contract_review' }), client)).toBeNull();
		expect(livePreviewPortFor(request({ passRole: 'mutation_review' }), client)).toBeNull();
		expect(livePreviewPortFor(request({ passRole: 'research_review' }), client)).toBeNull();
		expect(livePreviewPortFor(request({ toolChoice: 'required' }), client)).toBeNull();
		expect(livePreviewPortFor(request(), { stream: vi.fn() })).toBeNull();
	});

	it('sends nothing for a reviewer pass', async () => {
		const { port } = recordingPort();
		const client = scriptedClient([
			[
				{ type: 'text', content: 'Reviewer notes' },
				{ type: 'done', finishedReason: 'stop' }
			]
		]);
		await drain(
			streamBufferedProviderPass(
				request({ passRole: 'mutation_review' }),
				{ ...client, livePreview: port },
				capacity,
				2_000
			)
		);
		expect(port.publish).not.toHaveBeenCalled();
	});

	it('releases identical events and sends identical requests with or without the port', async () => {
		const script = (): ScriptStep[][] => [
			[
				{ type: 'text', content: 'Draft' },
				{ type: 'error', error: 'rate limited', retryable: true }
			],
			[
				{ type: 'text', content: 'Same answer' },
				{ type: 'done', finishedReason: 'stop', usage: { total_tokens: 3 } }
			]
		];
		const sharedRequest = request();
		vi.useFakeTimers({ now: 6_000_000 });
		const plain = scriptedClient(script());
		const withPort = scriptedClient(script());
		const { port } = recordingPort();

		const plainEvents = await drain(
			streamBufferedProviderPass(sharedRequest, plain, capacity, 2_000)
		);
		const previewEvents = await drain(
			streamBufferedProviderPass(
				sharedRequest,
				{ ...withPort, livePreview: port },
				capacity,
				2_000
			)
		);

		expect(previewEvents).toEqual(plainEvents);
		expect(withPort.stream.mock.calls).toEqual(plain.stream.mock.calls);
		expect(JSON.stringify(withPort.stream.mock.calls[0]![0])).not.toContain('livePreview');
	});

	it('never lets a throwing port touch the pass', async () => {
		const client = scriptedClient([
			[
				{ type: 'text', content: 'Still delivered' },
				{ type: 'done', finishedReason: 'stop' }
			]
		]);
		const port: AgenticChatLiveTextPreviewPortV1 = {
			publish: () => {
				throw new Error('socket exploded');
			}
		};
		await expect(
			drain(streamBufferedProviderPass(request(), { ...client, livePreview: port }, capacity, 2_000))
		).resolves.toEqual([
			{ type: 'text', content: 'Still delivered' },
			{ type: 'done', finishedReason: 'stop' }
		]);
	});

	it('caps cumulative text without splitting a code point', async () => {
		const { port, updates } = recordingPort();
		const nearlyFull = 'a'.repeat(AGENTIC_CHAT_LIVE_TEXT_PREVIEW_MAX_BYTES - 1);
		const client = scriptedClient([
			[
				{ type: 'text', content: nearlyFull },
				{ type: 'text', content: '😀 tail' },
				{ type: 'text', content: ' ignored' },
				{ type: 'done', finishedReason: 'stop' }
			]
		]);

		const events = await drain(
			streamBufferedProviderPass(request(), { ...client, livePreview: port }, capacity, 2_000)
		);

		expect(events).toHaveLength(4);
		const last = updates.at(-1)!;
		expect(last.text).toBe(nearlyFull);
		expect(Buffer.byteLength(last.text)).toBeLessThanOrEqual(
			AGENTIC_CHAT_LIVE_TEXT_PREVIEW_MAX_BYTES
		);
	});
});

const USER_ID = '10000000-0000-4000-8000-000000000001';
const SESSION_ID = '20000000-0000-4000-8000-000000000002';
const TURN_RUN_ID = '30000000-0000-4000-8000-000000000003';

function executionInput(): AgenticChatWorkerExecutionInputV1 {
	const claim = {
		outcome: 'claimed',
		executionMayStart: true,
		turnRunId: TURN_RUN_ID,
		queueJobId: '40000000-0000-4000-8000-000000000004',
		sessionId: SESSION_ID,
		userId: USER_ID,
		correlationId: '50000000-0000-4000-8000-000000000005',
		executionGeneration: 2,
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
		history: [],
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
			rawHistoryCount: 0,
			historyForModelCount: 0,
			preparedPromptId: null,
			preparedPromptHit: false,
			preparedPromptMissReason: null,
			preparedSurfaceProfile: null
		},
		artifact
	};
}

async function runTurn(client: AgenticChatTurnProviderClientPortV1) {
	const invocation = await new AgenticChatTurnProviderAdapter({
		client,
		capacity: new AgenticChatProviderCapacity({ configured: true, concurrency: 1 })
	}).prepare({
		executionInput: executionInput(),
		processingToken: '90000000-0000-4000-8000-000000000009',
		signal: new AbortController().signal
	});
	const steps: AgenticChatProviderStepV1[] = [];
	for await (const step of invocation.stream()) steps.push(step);
	return steps;
}

describe('turn provider with the live preview port', () => {
	it('previews the acting pass through the coordinator without changing its steps', async () => {
		const answer = (): AgenticChatTurnProviderClientEventV1[] => [
			{ type: 'text', content: 'Here is ' },
			{ type: 'text', content: 'your plan.' },
			{ type: 'done', finishedReason: 'stop' }
		];
		const plainStream = vi.fn<AgenticChatTurnProviderClientPortV1['stream']>(() =>
			(async function* () {
				yield* answer();
			})()
		);
		const previewStream = vi.fn<AgenticChatTurnProviderClientPortV1['stream']>(() =>
			(async function* () {
				yield* answer();
			})()
		);
		const { port, updates } = recordingPort();

		const plainSteps = await runTurn({ stream: plainStream });
		const previewSteps = await runTurn(
			withAgenticChatLiveTextPreviewV1({ stream: previewStream }, port)
		);

		expect(previewSteps).toEqual(plainSteps);
		// Each run owns its own abort signal; everything else sent must match exactly.
		const sent = (calls: typeof plainStream.mock.calls) =>
			calls.map(([input]) => JSON.stringify({ ...input, signal: null }));
		expect(sent(previewStream.mock.calls)).toEqual(sent(plainStream.mock.calls));
		expect(updates.at(-1)).toMatchObject({
			turnRunId: TURN_RUN_ID,
			executionGeneration: 2,
			state: 'streaming',
			text: 'Here is your plan.'
		});
		expect(updates.every((update) => update.state === 'streaming')).toBe(true);
	});
});

function publisherTurn(overrides: Partial<AgenticChatPublisherTurnV1> = {}): AgenticChatPublisherTurnV1 {
	return {
		turnRunId: 'turn-p',
		queueJobId: 'job-p',
		processingToken: 'token-p',
		userId: 'user-p',
		sessionId: 'session-p',
		streamRunId: 'stream-p',
		clientTurnId: 'client-p',
		executionGeneration: 1,
		...overrides
	};
}

/** Persistence that holds every write until the test releases it. */
function gatedPersistence(context: AgenticChatPublisherTurnV1, startSequence: number) {
	let sequence = startSequence;
	const textGates: Array<ReturnType<typeof deferred<void>>> = [];
	const persistence: AgenticChatPersistencePortV1 = {
		async flushTextBatches(inputs) {
			const gate = deferred<void>();
			textGates.push(gate);
			await gate.promise;
			return {
				outcome: 'flushed',
				input_count: inputs.length,
				persisted_count: inputs.length,
				rejected_count: 0,
				results: inputs.map((input, inputIndex) => {
					sequence += 1;
					return {
						outcome: 'persisted',
						publish_allowed: true,
						turn_run_id: input.turn_run_id,
						queue_job_id: input.queue_job_id,
						session_id: context.sessionId,
						user_id: context.userId,
						stream_run_id: context.streamRunId,
						client_turn_id: context.clientTurnId,
						execution_generation: input.execution_generation,
						sequence_index: sequence,
						event_id: `${input.turn_run_id}:1:${sequence}`,
						phase: 'llm',
						event_type: 'text_delta',
						durable: true,
						batch_id: input.batch_id,
						text_delta: input.text_delta,
						assistant_text_bytes: Buffer.byteLength(input.assistant_text),
						reconcile_required: true,
						persisted_at: '2026-09-23T12:00:00.000Z',
						input_index: inputIndex
					} as const;
				})
			} satisfies AgenticChatTextBatchFlushRpcResultV1;
		},
		persistSemantic: () => new Promise(() => undefined),
		acknowledge: () => new Promise(() => undefined)
	};
	return { persistence, textGates };
}

describe('publisher live preview target', () => {
	it('floors at the last sequence already-enqueued writes will occupy', async () => {
		vi.useFakeTimers({ now: 7_000_000 });
		const context = publisherTurn({ initialSequence: 4 });
		const { persistence, textGates } = gatedPersistence(context, 4);
		const publisher = new AgenticChatStreamPublisher({
			persistence,
			broadcast: { publish: async () => 'sent' }
		});
		publisher.start();
		publisher.registerTurn(context);

		expect(publisher.getLiveTextPreviewTarget('turn-p')).toEqual({
			topic: 'chat-user:user-p',
			sessionId: 'session-p',
			executionGeneration: 1,
			durableSequenceFloor: 4
		});

		// A pending text batch can still absorb later text: not below the floor yet.
		publisher.appendText('turn-p', 'Earlier pass text.');
		expect(publisher.getLiveTextPreviewTarget('turn-p')?.durableSequenceFloor).toBe(4);

		// A semantic event seals it (and starts its flush): both count now.
		publisher.enqueueSemantic('turn-p', {
			transitionId: 'transition-1',
			phase: 'tool',
			eventType: 'tool_call',
			projection: {},
			eventPayload: { type: 'tool_call' }
		});
		await Promise.resolve();
		expect(textGates).toHaveLength(1);
		expect(publisher.getLiveTextPreviewTarget('turn-p')?.durableSequenceFloor).toBe(6);

		// New text after the floor was read lands above it.
		publisher.appendText('turn-p', 'Next pass text.');
		expect(publisher.getLiveTextPreviewTarget('turn-p')?.durableSequenceFloor).toBe(6);

		textGates[0]!.resolve();
		await vi.waitFor(() => expect(publisher.getSnapshot('turn-p').durableSequence).toBe(5));
		expect(publisher.getLiveTextPreviewTarget('turn-p')?.durableSequenceFloor).toBe(6);

		publisher.abandonTurn('turn-p');
		expect(publisher.getLiveTextPreviewTarget('turn-p')).toBeNull();
		expect(publisher.getLiveTextPreviewTarget('turn-unknown')).toBeNull();
	});

	it('counts appended text bytes incrementally, joining a split surrogate pair exactly', () => {
		vi.useFakeTimers({ now: 8_000_000 });
		const context = publisherTurn({
			initialSequence: 1,
			initialAssistantText: 'a'.repeat(AGENTIC_CHAT_STREAM_TEXT_MAX_BYTES - 4)
		});
		const publisher = new AgenticChatStreamPublisher({
			persistence: {
				flushTextBatches: () => new Promise(() => undefined),
				persistSemantic: () => new Promise(() => undefined),
				acknowledge: () => new Promise(() => undefined)
			},
			broadcast: { publish: async () => 'sent' }
		});
		publisher.start();
		publisher.registerTurn(context);

		// A lone high surrogate encodes as 3 bytes; its low half completes one
		// 4-byte code point, landing exactly on the bound (6 would overflow).
		publisher.appendText('turn-p', '\uD83D');
		publisher.appendText('turn-p', '\uDE00');
		expect(Buffer.byteLength(publisher.getSnapshot('turn-p').assistantText)).toBe(
			AGENTIC_CHAT_STREAM_TEXT_MAX_BYTES
		);
		expect(() => publisher.appendText('turn-p', 'a')).toThrow(
			AgenticChatPublisherOverloadError
		);
	});
});

describe('live text preview broadcaster', () => {
	function broadcaster(
		target: ReturnType<AgenticChatStreamPublisher['getLiveTextPreviewTarget']>,
		publish: (message: AgenticChatBroadcastMessageV1) => Promise<'sent' | 'failed'>,
		onFirstFailure = vi.fn()
	) {
		return {
			onFirstFailure,
			instance: new AgenticChatLiveTextPreviewBroadcaster({
				publisher: { getLiveTextPreviewTarget: () => target },
				broadcast: { publish },
				now: () => 1_000,
				onFirstFailure
			})
		};
	}

	const update: AgenticChatLiveTextPreviewUpdateV1 = {
		turnRunId: 'turn-b',
		executionGeneration: 2,
		passKey: '1.acting.1.9',
		text: 'Here is',
		state: 'streaming'
	};

	it('broadcasts on the user channel with a strictly increasing seq and the durable floor', async () => {
		const sent: AgenticChatBroadcastMessageV1[] = [];
		const { instance } = broadcaster(
			{
				topic: 'chat-user:user-b',
				sessionId: 'session-b',
				executionGeneration: 2,
				durableSequenceFloor: 7
			},
			async (message) => {
				sent.push(message);
				return 'sent';
			}
		);

		instance.publish(update);
		instance.publish({ ...update, text: 'Here is more' });
		instance.publish({ ...update, text: '', state: 'discard' });
		await vi.waitFor(() => expect(instance.getStats().sent).toBe(3));

		expect(sent[0]).toEqual({
			kind: 'live_text_preview',
			topic: 'chat-user:user-b',
			event: 'agentic_chat_preview',
			payload: {
				contract_version: 'agentic_chat_worker_v1',
				turn_run_id: 'turn-b',
				session_id: 'session-b',
				execution_generation: 2,
				pass_key: '1.acting.1.9',
				seq: 1_000,
				text: 'Here is',
				state: 'streaming',
				durable_sequence_floor: 7
			}
		});
		const seqs = sent.map((message) => (message.payload as { seq: number }).seq);
		expect(seqs).toEqual([1_000, 1_001, 1_002]);
		expect(sent[2]!.payload).toMatchObject({ state: 'discard', text: '' });
	});

	it('skips unregistered turns and stale generations without broadcasting', () => {
		const publish = vi.fn(async () => 'sent' as const);
		const unregistered = broadcaster(null, publish).instance;
		unregistered.publish(update);
		const stale = broadcaster(
			{ topic: 't', sessionId: 's', executionGeneration: 3, durableSequenceFloor: 0 },
			publish
		).instance;
		stale.publish(update);

		expect(publish).not.toHaveBeenCalled();
		expect(unregistered.getStats().skipped).toBe(1);
		expect(stale.getStats().skipped).toBe(1);
	});

	it('counts every failed broadcast, reports only the first, and never throws', async () => {
		let call = 0;
		const { instance, onFirstFailure } = broadcaster(
			{ topic: 't', sessionId: 's', executionGeneration: 2, durableSequenceFloor: 0 },
			(() => {
				call += 1;
				if (call === 1) return Promise.resolve('failed');
				if (call === 2) return Promise.reject(new Error('socket closed'));
				throw new Error('synchronous failure');
			}) as never
		);

		expect(() => {
			instance.publish(update);
			instance.publish(update);
			instance.publish(update);
		}).not.toThrow();
		await vi.waitFor(() => expect(instance.getStats().failed).toBe(3));
		expect(onFirstFailure).toHaveBeenCalledTimes(1);
	});
});
