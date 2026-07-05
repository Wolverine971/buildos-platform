// apps/web/src/lib/components/agent/agent-chat-stream-controller.svelte.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
	AgentSSEMessage,
	ChatAttachmentRef,
	ChatContextType,
	ChatSession
} from '@buildos/shared-types';
import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';
import type { StreamCallbacks, SSEProcessorOptions } from '$lib/utils/sse-processor';
import type { PreparedPromptClient } from './agent-chat-session';
import type { AgentChatImageAttachment, UIMessage } from './agent-chat.types';
import {
	createAgentChatStreamController,
	type StreamControllerDeps,
	type StreamControllerPrewarmDeps,
	type StreamControllerVoiceDeps,
	type StreamProcessorLike
} from './agent-chat-stream-controller.svelte';

type ControlledRun = {
	callbacks: StreamCallbacks;
	signal?: AbortSignal;
	progress(data: AgentSSEMessage): void;
	error(error: string | Error): void;
	complete(): void;
	resolve(): void;
	reject(error: unknown): void;
};

function abortError(): DOMException {
	return new DOMException('Aborted', 'AbortError');
}

class ControlledStreamProcessor implements StreamProcessorLike {
	runs: ControlledRun[] = [];
	processStream = vi.fn(
		(_response: Response, callbacks: StreamCallbacks, options: SSEProcessorOptions = {}) => {
			let resolvePromise!: () => void;
			let rejectPromise!: (error: unknown) => void;
			const promise = new Promise<void>((resolve, reject) => {
				resolvePromise = resolve;
				rejectPromise = reject;
			});
			const run: ControlledRun = {
				callbacks,
				signal: options.signal,
				progress: (data) => callbacks.onProgress?.(data),
				error: (error) => callbacks.onError?.(error),
				complete: () => {
					callbacks.onComplete?.(undefined);
					resolvePromise();
				},
				resolve: () => resolvePromise(),
				reject: (error) => rejectPromise(error)
			};
			options.signal?.addEventListener(
				'abort',
				() => {
					rejectPromise(abortError());
				},
				{ once: true }
			);
			this.runs.push(run);
			return promise;
		}
	);
}

function makeSession(overrides: Partial<ChatSession> = {}): ChatSession {
	return {
		id: 'session-1',
		user_id: 'user-1',
		context_type: 'project',
		entity_id: 'project-1',
		title: 'Project chat',
		auto_title: null,
		agent_metadata: null,
		created_at: '2026-06-22T00:00:00.000Z',
		updated_at: '2026-06-22T00:00:00.000Z',
		...overrides
	} as ChatSession;
}

function makeAttachmentRef(overrides: Partial<ChatAttachmentRef> = {}): ChatAttachmentRef {
	return {
		kind: 'image',
		asset_id: 'asset-1',
		project_id: 'project-1',
		ocr_status: 'pending',
		...overrides
	} as ChatAttachmentRef;
}

function makeDraftAttachment(
	overrides: Partial<AgentChatImageAttachment> = {}
): AgentChatImageAttachment {
	return {
		id: 'draft-1',
		status: 'ready',
		statusLabel: 'Ready',
		attachmentKind: 'onto_asset',
		assetId: 'asset-1',
		projectId: 'project-1',
		storageBucket: 'assets',
		storagePath: 'asset-1.png',
		ocrStatus: 'pending',
		previewUrl: 'blob:preview',
		...overrides
	} as AgentChatImageAttachment;
}

async function flushMicrotasks(count = 4): Promise<void> {
	for (let index = 0; index < count; index += 1) {
		await Promise.resolve();
	}
}

function createHarness(
	overrides: {
		inputValue?: string;
		currentSession?: ChatSession | null;
		hydrateOnEnsure?: boolean;
		fetchImpl?: typeof fetch;
		readyRefs?: ChatAttachmentRef[];
		draftAttachments?: AgentChatImageAttachment[];
		preparedPrompt?: PreparedPromptClient | null;
	} = {}
) {
	let inputValue = overrides.inputValue ?? 'hello';
	let selectedContextType: ChatContextType | null = 'project';
	let selectedEntityId: string | undefined = 'project-1';
	let projectFocus: ProjectFocus | null = {
		focusType: 'project-wide',
		projectId: 'project-1',
		projectName: 'Project One'
	};
	let currentSession: ChatSession | null =
		overrides.currentSession === undefined ? makeSession() : overrides.currentSession;
	let lastTurnContext = null;
	let readyRefs = overrides.readyRefs ?? [];
	let draftAttachments = overrides.draftAttachments ?? [];
	let preparedPrompt: PreparedPromptClient | null =
		overrides.preparedPrompt === undefined
			? {
					id: 'prepared-1',
					key: 'prepared-key',
					cache_key: 'cache-key',
					expires_at: '2099-01-01T00:00:00.000Z'
				}
			: overrides.preparedPrompt;

	const messages: UIMessage[] = [];
	const sseEvents: AgentSSEMessage[] = [];
	const streamProcessor = new ControlledStreamProcessor();
	const streamFetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
	const cancelFetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
	const defaultFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		if (url.includes('/cancel')) {
			cancelFetchCalls.push({ input, init });
		} else {
			streamFetchCalls.push({ input, init });
		}
		return new Response('', { status: 200, statusText: 'OK' });
	});
	const fetchImpl = overrides.fetchImpl ?? (defaultFetch as unknown as typeof fetch);

	const voice: StreamControllerVoiceDeps = {
		isRecording: false,
		isInitializing: false,
		isStopping: false,
		isTranscribing: false,
		pendingSendAfterTranscription: false,
		noteGroupId: null,
		stop: vi.fn(async () => {
			voice.isRecording = false;
		})
	};

	const prewarm: StreamControllerPrewarmDeps = {
		resolveCurrentKey: vi.fn(() => 'cache-key'),
		matchingFreshPreparedPrompt: vi.fn(() => preparedPrompt),
		clearPreparedPrompt: vi.fn(() => {
			preparedPrompt = null;
		})
	};

	const thinking = {
		create: vi.fn(() => 'thinking-1'),
		updateState: vi.fn(),
		finalize: vi.fn()
	};
	const assistant = {
		flushText: vi.fn(),
		finalizeMessage: vi.fn(),
		markInterrupted: vi.fn()
	};
	const haptic = vi.fn();
	const hydrateSessionFromEvent = vi.fn((session: ChatSession) => {
		currentSession = session;
	});
	const reconcileTurnFromSession = vi.fn(async () => {});
	const ensureSessionReady = vi.fn(async () => {
		const ensured = makeSession({ id: 'ensured-session' });
		if (overrides.hydrateOnEnsure !== false) {
			currentSession = ensured;
		}
		return ensured;
	});
	const scheduleMessageOcrPoll = vi.fn();
	const clearDraft = vi.fn(() => {
		readyRefs = [];
		draftAttachments = [];
	});
	const restoreDraft = vi.fn((snapshot: AgentChatImageAttachment[]) => {
		draftAttachments = snapshot;
	});

	const deps: StreamControllerDeps = {
		getInputValue: () => inputValue,
		setInputValue: (value) => {
			inputValue = value;
		},
		getSelectedContextType: () => selectedContextType,
		getSelectedEntityId: () => selectedEntityId,
		getResolvedProjectFocus: () => projectFocus,
		getCurrentSession: () => currentSession,
		ensureSessionReady,
		getLastTurnContext: () => lastTurnContext,
		getIsLoadingSession: () => false,
		getActiveRestoredTurnRunId: () => null,
		getPrewarm: () => prewarm,
		attachments: {
			buildReadyRefs: vi.fn((includePreviewUrl = false) =>
				readyRefs.map((ref) => ({
					...ref,
					...(includePreviewUrl ? { preview_url: 'blob:preview' } : {})
				}))
			),
			getDraftSnapshot: () => draftAttachments,
			clearDraft,
			restoreDraft,
			scheduleMessageOcrPoll
		},
		voice,
		messages: {
			append: (message) => {
				messages.push(message);
			},
			removeById: (messageId) => {
				const index = messages.findIndex((message) => message.id === messageId);
				if (index >= 0) messages.splice(index, 1);
			}
		},
		thinking,
		assistant,
		clearPendingToolState: vi.fn(),
		handleSSEMessage: (event) => {
			sseEvents.push(event);
		},
		hydrateSessionFromEvent,
		reconcileTurnFromSession,
		setUserHasScrolled: vi.fn(),
		setExistingImagePickerOpen: vi.fn(),
		haptic,
		fetchImpl,
		streamProcessor,
		logError: vi.fn(),
		logDebug: vi.fn()
	};

	const controller = createAgentChatStreamController(deps);

	return {
		controller,
		deps,
		voice,
		prewarm,
		thinking,
		assistant,
		haptic,
		messages,
		sseEvents,
		streamProcessor,
		streamFetchCalls,
		cancelFetchCalls,
		defaultFetch,
		hydrateSessionFromEvent,
		reconcileTurnFromSession,
		ensureSessionReady,
		scheduleMessageOcrPoll,
		clearDraft,
		restoreDraft,
		get inputValue() {
			return inputValue;
		},
		set inputValue(value: string) {
			inputValue = value;
		},
		set readyRefs(value: ChatAttachmentRef[]) {
			readyRefs = value;
		},
		set draftAttachments(value: AgentChatImageAttachment[]) {
			draftAttachments = value;
		},
		set preparedPrompt(value: PreparedPromptClient | null) {
			preparedPrompt = value;
		},
		set currentSession(value: ChatSession | null) {
			currentSession = value;
		},
		set selectedContextType(value: ChatContextType | null) {
			selectedContextType = value;
		}
	};
}

function parseBody(call: { init?: RequestInit }): Record<string, any> {
	return JSON.parse(String(call.init?.body ?? '{}'));
}

describe('AgentChatStreamController', () => {
	beforeEach(() => {
		vi.useRealTimers();
	});

	it('sends a message with a prepared prompt key, routes SSE events, and completes', async () => {
		const h = createHarness({ inputValue: 'Build the plan' });

		const sendPromise = h.controller.sendMessage();
		await flushMicrotasks();

		expect(h.controller.isStreaming).toBe(true);
		expect(h.controller.isStartingStream).toBe(false);
		expect(h.messages).toHaveLength(1);
		expect(h.messages[0]?.content).toBe('Build the plan');
		expect(h.inputValue).toBe('');
		expect(h.prewarm.clearPreparedPrompt).toHaveBeenCalledOnce();

		const requestBody = parseBody(h.streamFetchCalls[0]!);
		expect(requestBody).toMatchObject({
			message: 'Build the plan',
			session_id: 'session-1',
			context_type: 'project',
			entity_id: 'project-1',
			preparedPromptKey: 'prepared-key'
		});
		expect(requestBody).not.toHaveProperty('prewarmedContext');

		const run = h.streamProcessor.runs[0]!;
		expect(h.streamProcessor.processStream.mock.calls[0]?.[2]).toMatchObject({
			timeout: 0,
			parseJSON: true,
			treatErrorEventsAsProgress: true
		});
		run.progress({ type: 'text_delta', content: 'Working' });
		run.progress({ type: 'done' });
		run.complete();
		await sendPromise;

		expect(h.sseEvents.map((event) => event.type)).toEqual(['text_delta', 'done']);
		expect(h.controller.isStreaming).toBe(false);
		expect(h.controller.currentActivity).toBe('');
		expect(h.controller.lastCompletedStreamTiming?.terminalState).toBe('completed');
		expect(h.thinking.finalize).toHaveBeenCalledWith('completed');
		expect(h.assistant.flushText).toHaveBeenCalled();
		expect(h.assistant.finalizeMessage).toHaveBeenCalled();
	});

	it('drops enveloped stream events from stale stream or client turns', async () => {
		const h = createHarness({ inputValue: 'Build the plan' });

		const sendPromise = h.controller.sendMessage();
		await flushMicrotasks();

		const requestBody = parseBody(h.streamFetchCalls[0]!);
		const streamRunId = requestBody.stream_run_id as string;
		const clientTurnId = requestBody.client_turn_id as string;
		const run = h.streamProcessor.runs[0]!;

		run.progress({
			type: 'text_delta',
			content: 'stale stream',
			stream_run_id: 'other-stream',
			client_turn_id: clientTurnId,
			event_id: 'other-stream:1',
			sequence_index: 1
		});
		run.progress({
			type: 'text_delta',
			content: 'stale client',
			stream_run_id: streamRunId,
			client_turn_id: 'other-client',
			event_id: `${streamRunId}:2`,
			sequence_index: 2
		});
		run.progress({
			type: 'text_delta',
			content: 'current',
			stream_run_id: streamRunId,
			client_turn_id: clientTurnId,
			event_id: `${streamRunId}:3`,
			sequence_index: 3
		});
		run.progress({
			type: 'done',
			stream_run_id: streamRunId,
			client_turn_id: clientTurnId,
			event_id: `${streamRunId}:4`,
			sequence_index: 4
		});
		run.complete();
		await sendPromise;

		expect(h.sseEvents.map((event) => event.type)).toEqual(['text_delta', 'done']);
		expect(h.sseEvents[0]).toMatchObject({ content: 'current' });
	});

	it('dedupes enveloped stream events by event id or stream sequence', async () => {
		const h = createHarness({ inputValue: 'Build the plan' });

		const sendPromise = h.controller.sendMessage();
		await flushMicrotasks();

		const requestBody = parseBody(h.streamFetchCalls[0]!);
		const streamRunId = requestBody.stream_run_id as string;
		const clientTurnId = requestBody.client_turn_id as string;
		const run = h.streamProcessor.runs[0]!;

		run.progress({
			type: 'text_delta',
			content: 'first',
			stream_run_id: streamRunId,
			client_turn_id: clientTurnId,
			event_id: `${streamRunId}:1`,
			sequence_index: 1
		});
		run.progress({
			type: 'text_delta',
			content: 'duplicate event id',
			stream_run_id: streamRunId,
			client_turn_id: clientTurnId,
			event_id: `${streamRunId}:1`,
			sequence_index: 1
		});
		run.progress({
			type: 'text_delta',
			content: 'second',
			stream_run_id: streamRunId,
			client_turn_id: clientTurnId,
			sequence_index: 2
		});
		run.progress({
			type: 'text_delta',
			content: 'duplicate sequence',
			stream_run_id: streamRunId,
			client_turn_id: clientTurnId,
			sequence_index: 2
		});
		run.progress({
			type: 'done',
			stream_run_id: streamRunId,
			client_turn_id: clientTurnId,
			event_id: `${streamRunId}:3`,
			sequence_index: 3
		});
		run.progress({
			type: 'done',
			stream_run_id: streamRunId,
			client_turn_id: clientTurnId,
			event_id: `${streamRunId}:3`,
			sequence_index: 3
		});
		run.complete();
		await sendPromise;

		expect(h.sseEvents.map((event) => event.type)).toEqual([
			'text_delta',
			'text_delta',
			'done'
		]);
		expect(
			h.sseEvents.slice(0, 2).map((event) => ('content' in event ? event.content : ''))
		).toEqual(['first', 'second']);
	});

	it('uses a sessionless prepared prompt on first send without bootstrapping a session', async () => {
		const h = createHarness({ currentSession: null, inputValue: 'First turn' });

		const sendPromise = h.controller.sendMessage();
		await flushMicrotasks();

		expect(h.ensureSessionReady).not.toHaveBeenCalled();
		expect(h.messages).toHaveLength(1);
		expect(h.messages[0]?.session_id).toBeUndefined();

		const requestBody = parseBody(h.streamFetchCalls[0]!);
		expect(requestBody).not.toHaveProperty('session_id');
		expect(requestBody).toMatchObject({
			message: 'First turn',
			context_type: 'project',
			entity_id: 'project-1',
			preparedPromptKey: 'prepared-key'
		});
		expect(requestBody).not.toHaveProperty('prewarmedContext');

		const run = h.streamProcessor.runs[0]!;
		const streamCreatedSession = makeSession({ id: 'stream-created-session' });
		run.progress({ type: 'session', session: streamCreatedSession } as AgentSSEMessage);
		run.progress({ type: 'done' });
		run.complete();
		await sendPromise;

		expect(h.sseEvents[0]).toMatchObject({
			type: 'session',
			session: expect.objectContaining({ id: 'stream-created-session' })
		});
		expect(h.controller.lastCompletedStreamTiming?.terminalState).toBe('completed');
	});

	it('bootstraps a session on first send when no prepared prompt is available', async () => {
		const h = createHarness({
			currentSession: null,
			inputValue: 'First turn',
			preparedPrompt: null
		});

		const sendPromise = h.controller.sendMessage();
		await flushMicrotasks();

		expect(h.ensureSessionReady).toHaveBeenCalledOnce();
		expect(h.messages[0]?.session_id).toBe('ensured-session');

		const requestBody = parseBody(h.streamFetchCalls[0]!);
		expect(requestBody.session_id).toBe('ensured-session');
		expect(requestBody.preparedPromptKey).toBeNull();
		expect(requestBody).not.toHaveProperty('prewarmedContext');

		h.streamProcessor.runs[0]!.progress({ type: 'done' });
		h.streamProcessor.runs[0]!.complete();
		await sendPromise;
	});

	it('bootstraps a session on first send when no reusable draft prewarm exists', async () => {
		const h = createHarness({
			currentSession: null,
			inputValue: 'First turn',
			preparedPrompt: null
		});

		const sendPromise = h.controller.sendMessage();
		await flushMicrotasks();

		expect(h.ensureSessionReady).toHaveBeenCalledOnce();
		expect(h.messages[0]?.session_id).toBe('ensured-session');

		const requestBody = parseBody(h.streamFetchCalls[0]!);
		expect(requestBody).toMatchObject({
			message: 'First turn',
			session_id: 'ensured-session',
			preparedPromptKey: null
		});
		expect(requestBody).not.toHaveProperty('prewarmedContext');

		h.streamProcessor.runs[0]!.progress({ type: 'done' });
		h.streamProcessor.runs[0]!.complete();
		await sendPromise;
	});

	it('rolls back the optimistic message and restores input/draft on HTTP errors', async () => {
		const draft = makeDraftAttachment();
		const ref = makeAttachmentRef();
		const fetchImpl = vi.fn(async () => new Response('', { status: 500, statusText: 'Nope' }));
		const h = createHarness({
			inputValue: 'with attachment',
			fetchImpl: fetchImpl as unknown as typeof fetch,
			readyRefs: [ref],
			draftAttachments: [draft]
		});

		await h.controller.sendMessage();

		expect(h.messages).toEqual([]);
		expect(h.inputValue).toBe('with attachment');
		expect(h.restoreDraft).toHaveBeenCalledWith([draft]);
		expect(h.controller.error).toBe('Failed to send message. Please try again.');
		expect(h.controller.isStreaming).toBe(false);
		expect(h.thinking.finalize).toHaveBeenCalledWith('error');
		expect(h.streamProcessor.runs).toHaveLength(0);
	});

	it('reconciles accepted streams after transport-level errors', async () => {
		const h = createHarness();
		const sendPromise = h.controller.sendMessage();
		await flushMicrotasks();

		const run = h.streamProcessor.runs[0]!;
		const streamRunId = h.messages[0]?.metadata?.stream_run_id;
		const clientTurnId = h.messages[0]?.metadata?.client_turn_id;
		run.error('transport lost');
		run.resolve();
		await sendPromise;

		expect(h.reconcileTurnFromSession).toHaveBeenCalledWith({
			sessionId: 'session-1',
			streamRunId,
			clientTurnId,
			reason: 'transport_error'
		});
		expect(h.controller.error).toBeNull();
		expect(h.controller.isStreaming).toBe(false);
		expect(h.controller.currentActivity).toBe('Restoring latest response...');
		expect(h.controller.lastCompletedStreamTiming?.terminalState).toBe('error');
		expect(h.thinking.finalize).toHaveBeenCalledWith(
			'interrupted',
			'Restoring latest response'
		);
		expect(h.assistant.finalizeMessage).toHaveBeenCalled();
	});

	it('reconciles accepted streams when the stream processor rejects', async () => {
		const h = createHarness();
		const sendPromise = h.controller.sendMessage();
		await flushMicrotasks();

		const streamRunId = h.messages[0]?.metadata?.stream_run_id;
		h.streamProcessor.runs[0]!.reject(new Error('reader failed'));
		await sendPromise;

		expect(h.reconcileTurnFromSession).toHaveBeenCalledWith(
			expect.objectContaining({
				sessionId: 'session-1',
				streamRunId,
				reason: 'transport_error'
			})
		);
		expect(h.messages).toHaveLength(1);
		expect(h.controller.error).toBeNull();
		expect(h.inputValue).toBe('');
		expect(h.restoreDraft).not.toHaveBeenCalled();
	});

	it('finalizes a normally closed empty stream as an error', async () => {
		const h = createHarness();
		const sendPromise = h.controller.sendMessage();
		await flushMicrotasks();

		h.streamProcessor.runs[0]!.complete();
		await sendPromise;

		expect(h.controller.error).toBe('BuildOS did not return a response. Please try again.');
		expect(h.controller.lastCompletedStreamTiming?.terminalState).toBe('error');
		expect(h.thinking.finalize).toHaveBeenCalledWith('error');
	});

	it('reports and aborts user cancellation', async () => {
		const h = createHarness();
		const sendPromise = h.controller.sendMessage();
		await flushMicrotasks();
		const run = h.streamProcessor.runs[0]!;

		await h.controller.stopGeneration('user_cancelled');
		await sendPromise;

		expect(run.signal?.aborted).toBe(true);
		expect(h.haptic).toHaveBeenCalledWith('heavy');
		expect(h.cancelFetchCalls).toHaveLength(1);
		expect(parseBody(h.cancelFetchCalls[0]!)).toMatchObject({
			session_id: 'session-1',
			stream_run_id: h.messages[0]?.metadata?.stream_run_id,
			client_turn_id: h.messages[0]?.metadata?.client_turn_id,
			reason: 'user_cancelled'
		});
		expect(h.assistant.markInterrupted).toHaveBeenCalledWith(
			'user_cancelled',
			h.messages[0]?.metadata?.stream_run_id
		);
		expect(h.controller.isStreaming).toBe(false);
		expect(h.controller.lastCompletedStreamTiming?.terminalState).toBe('cancelled');
		expect(h.controller.lastCompletedStreamTiming?.cancelReason).toBe('user_cancelled');
		expect(h.reconcileTurnFromSession).not.toHaveBeenCalled();
	});

	it('supersedes an active stream before sending a second message', async () => {
		const h = createHarness({ inputValue: 'first' });
		const firstSend = h.controller.sendMessage();
		await flushMicrotasks();
		const firstRun = h.streamProcessor.runs[0]!;

		h.inputValue = 'second';
		const secondSend = h.controller.sendMessage();
		await flushMicrotasks(8);

		expect(firstRun.signal?.aborted).toBe(true);
		expect(h.cancelFetchCalls).toHaveLength(1);
		expect(parseBody(h.cancelFetchCalls[0]!)).toMatchObject({ reason: 'superseded' });
		expect(h.messages.map((message) => message.content)).toEqual(['first', 'second']);
		expect(h.streamFetchCalls).toHaveLength(2);

		const secondRun = h.streamProcessor.runs[1]!;
		secondRun.progress({ type: 'done' });
		secondRun.complete();
		await Promise.all([firstSend, secondSend]);

		expect(h.controller.isStreaming).toBe(false);
		expect(h.controller.lastCompletedStreamTiming?.terminalState).toBe('completed');
	});

	it('requests reconciliation when disposing an active stream without explicit cancellation', async () => {
		const h = createHarness();
		const sendPromise = h.controller.sendMessage();
		await flushMicrotasks();
		const run = h.streamProcessor.runs[0]!;
		const streamRunId = h.messages[0]?.metadata?.stream_run_id;
		const clientTurnId = h.messages[0]?.metadata?.client_turn_id;

		h.controller.disposeActiveStream();
		await sendPromise;

		expect(run.signal?.aborted).toBe(true);
		expect(h.reconcileTurnFromSession).toHaveBeenCalledWith({
			sessionId: 'session-1',
			streamRunId,
			clientTurnId,
			reason: 'detached'
		});
		expect(h.controller.isStreaming).toBe(false);
		expect(h.controller.lastCompletedStreamTiming?.terminalState).toBe('aborted');
	});

	it('stops recording and sends after transcription finishes', async () => {
		const h = createHarness({ inputValue: '' });
		h.voice.isRecording = true;

		await h.controller.handleSendMessage();

		expect(h.voice.pendingSendAfterTranscription).toBe(true);
		expect(h.voice.stop).toHaveBeenCalledOnce();
		expect(h.streamFetchCalls).toHaveLength(0);

		h.inputValue = 'transcribed text';
		const pendingSend = h.controller.handlePendingSendAfterTranscription(false);
		await flushMicrotasks();
		expect(h.streamFetchCalls).toHaveLength(1);
		h.streamProcessor.runs[0]!.complete();
		await pendingSend;

		expect(h.voice.pendingSendAfterTranscription).toBe(false);
		expect(h.messages[0]?.content).toBe('transcribed text');
	});

	it('reset clears active stream state without clearing the sent-message summary flag', () => {
		const h = createHarness();
		h.controller.hasSentMessage = true;
		h.controller.error = 'visible error';
		h.controller.currentActivity = 'Working';
		h.controller.activeClientTurnId = 'turn-1';
		h.controller.activeTransportStreamRunId = 'stream-1';

		h.controller.reset();

		expect(h.controller.hasSentMessage).toBe(true);
		expect(h.controller.error).toBeNull();
		expect(h.controller.currentActivity).toBe('');
		expect(h.controller.activeClientTurnId).toBeNull();
		expect(h.controller.activeTransportStreamRunId).toBeNull();
	});

	it('hydrates a missing session from stale session events and drops stale text', async () => {
		const h = createHarness({
			currentSession: null,
			hydrateOnEnsure: false,
			inputValue: 'needs a session'
		});
		const sendPromise = h.controller.sendMessage();
		await flushMicrotasks();
		const staleRun = h.streamProcessor.runs[0]!;

		await h.controller.stopGeneration('superseded');
		staleRun.progress({ type: 'session', session: makeSession({ id: 'late-session' }) });
		staleRun.progress({ type: 'text_delta', content: 'late text' });
		await sendPromise;

		expect(h.hydrateSessionFromEvent).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'late-session' })
		);
		expect(h.sseEvents).toEqual([]);
	});
});
