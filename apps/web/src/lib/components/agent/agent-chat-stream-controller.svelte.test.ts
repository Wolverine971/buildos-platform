// apps/web/src/lib/components/agent/agent-chat-stream-controller.svelte.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
	ChatAttachmentRef,
	ChatContextType,
	ChatSession,
	TurnHandleV1
} from '@buildos/shared-types';
import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';
import type { PreparedPromptClient } from './agent-chat-session';
import type { AgentChatImageAttachment, UIMessage } from './agent-chat.types';
import {
	createAgentChatStreamController,
	type StreamControllerDeps,
	type StreamControllerPrewarmDeps,
	type StreamControllerVoiceDeps
} from './agent-chat-stream-controller.svelte';

const TRANSPORT_URL = '/api/agent/v2/transport';
const TURNS_URL = '/api/agent/v2/turns';
const WORKER_SESSION_ID = 'd2000000-0000-4000-8000-000000000001';
const WORKER_TURN_RUN_ID = 'd4000000-0000-4000-8000-000000000001';

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
		attachment_kind: 'onto_asset',
		media_type: 'image',
		asset_id: 'd5000000-0000-4000-8000-000000000001',
		project_id: 'd7000000-0000-4000-8000-000000000001',
		ocr_status: 'pending',
		...overrides
	};
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

function leaseResponse(token = 'actl1.claims.signature'): Response {
	return Response.json({
		success: true,
		data: {
			mode: 'worker_realtime',
			contractVersion: 'agentic_chat_worker_v1',
			decisionId: 'd3000000-0000-4000-8000-000000000001',
			token,
			expiresAt: '2099-01-01T00:00:00.000Z'
		}
	});
}

function admittedResponse(
	request: Record<string, unknown>,
	overrides: { sessionId?: string; turnRunId?: string } = {}
): Response {
	return Response.json(
		{
			success: true,
			data: {
				outcome: 'newly_admitted',
				handle: {
					contractVersion: 'agentic_chat_worker_v1',
					executionMode: 'worker_realtime',
					turnRunId: overrides.turnRunId ?? WORKER_TURN_RUN_ID,
					sessionId: overrides.sessionId ?? String(request.sessionId),
					streamRunId: request.streamRunId,
					clientTurnId: request.clientTurnId
				},
				status: 'queued'
			}
		},
		{ status: 202 }
	);
}

function createHarness(
	overrides: {
		inputValue?: string;
		currentSession?: ChatSession | null;
		hydrateOnEnsure?: boolean;
		fetchImpl?: typeof fetch;
		admissionFetchImpl?: typeof fetch;
		readyRefs?: ChatAttachmentRef[];
		draftAttachments?: AgentChatImageAttachment[];
		preparedPrompt?: PreparedPromptClient | null;
		waitForPreparedPrompt?: StreamControllerPrewarmDeps['waitForPreparedPrompt'];
		voiceNoteGroupId?: string | null;
	} = {}
) {
	let inputValue = overrides.inputValue ?? 'hello';
	let selectedContextType: ChatContextType | null = 'project';
	let selectedEntityId: string | undefined = 'project-1';
	let projectFocus: ProjectFocus | null = {
		focusType: 'project-wide',
		focusEntityId: null,
		focusEntityName: null,
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
	const transportCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
	const admissionCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
	const cancelFetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
	const defaultFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		if (url === TRANSPORT_URL) {
			transportCalls.push({ input, init });
			return leaseResponse();
		}
		if (url.includes('/cancel')) {
			cancelFetchCalls.push({ input, init });
			return Response.json({ success: true, data: { outcome: 'cancel_requested' } });
		}
		if (url === TURNS_URL) {
			admissionCalls.push({ input, init });
			if (overrides.admissionFetchImpl) return overrides.admissionFetchImpl(input, init);
			return admittedResponse(JSON.parse(String(init?.body ?? '{}')));
		}
		throw new Error(`unexpected request: ${url}`);
	});
	const fetchImpl = overrides.fetchImpl ?? (defaultFetch as unknown as typeof fetch);

	const voice: StreamControllerVoiceDeps = {
		isRecording: false,
		isInitializing: false,
		isStopping: false,
		isTranscribing: false,
		pendingSendAfterTranscription: false,
		noteGroupId: overrides.voiceNoteGroupId ?? null,
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
	if (overrides.waitForPreparedPrompt) {
		prewarm.waitForPreparedPrompt = overrides.waitForPreparedPrompt;
	}

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
	const discoverWorkerSession = vi.fn(async () => []);
	let controller!: ReturnType<typeof createAgentChatStreamController>;
	const adoptWorkerAdmissionResponse = vi.fn((value: unknown) => {
		const data = (
			value as { data: { handle: ReturnType<typeof workerHandle>; status: 'queued' } }
		).data;
		const descriptor = {
			handle: data.handle,
			status: data.status,
			executionGeneration: 0,
			terminalEventId: null,
			updatedAt: '2026-08-04T03:00:00.000Z'
		};
		controller.adoptWorkerTurn(descriptor.handle, descriptor.status);
		return descriptor;
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
		handleSSEMessage: vi.fn(),
		hydrateSessionFromEvent,
		adoptWorkerAdmissionResponse,
		discoverWorkerSession,
		reconcileTurnFromSession,
		setUserHasScrolled: vi.fn(),
		setExistingImagePickerOpen: vi.fn(),
		haptic,
		fetchImpl,
		logError: vi.fn(),
		logDebug: vi.fn()
	};

	controller = createAgentChatStreamController(deps);

	return {
		controller,
		deps,
		voice,
		prewarm,
		thinking,
		assistant,
		haptic,
		messages,
		transportCalls,
		admissionCalls,
		cancelFetchCalls,
		defaultFetch,
		hydrateSessionFromEvent,
		reconcileTurnFromSession,
		ensureSessionReady,
		scheduleMessageOcrPoll,
		clearDraft,
		restoreDraft,
		adoptWorkerAdmissionResponse,
		discoverWorkerSession,
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

function workerHandle(overrides: Partial<TurnHandleV1> = {}): TurnHandleV1 {
	return {
		contractVersion: 'agentic_chat_worker_v1',
		executionMode: 'worker_realtime',
		streamRunId: 'worker-stream-1',
		clientTurnId: 'worker-client-1',
		sessionId: WORKER_SESSION_ID,
		turnRunId: WORKER_TURN_RUN_ID,
		...overrides
	};
}

describe('AgentChatStreamController', () => {
	beforeEach(() => {
		vi.useRealTimers();
	});

	it('sends a message with a prepared prompt key and adopts the admitted worker turn', async () => {
		const h = createHarness({ inputValue: 'Build the plan' });

		await h.controller.sendMessage();

		expect(h.controller.isStreaming).toBe(true);
		expect(h.controller.isStartingStream).toBe(false);
		expect(h.messages).toHaveLength(1);
		expect(h.messages[0]?.content).toBe('Build the plan');
		expect(h.inputValue).toBe('');
		expect(h.prewarm.clearPreparedPrompt).toHaveBeenCalledOnce();

		expect(h.defaultFetch.mock.calls.map(([input]) => String(input))).toEqual([
			TRANSPORT_URL,
			TURNS_URL
		]);
		const negotiation = parseBody(h.transportCalls[0]!);
		expect(negotiation).toMatchObject({
			sessionId: 'session-1',
			supportedModes: ['worker_realtime'],
			supportedContractVersions: ['agentic_chat_worker_v1']
		});
		const admission = parseBody(h.admissionCalls[0]!);
		expect(admission).toMatchObject({
			message: 'Build the plan',
			sessionId: 'session-1',
			context: { type: 'project', entityId: 'project-1', projectId: 'project-1' },
			preparedPromptKey: 'prepared-key',
			leaseToken: 'actl1.claims.signature'
		});
		expect(h.adoptWorkerAdmissionResponse).toHaveBeenCalledOnce();
		expect(h.controller.activeTurnHandle).toEqual({
			contractVersion: 'agentic_chat_worker_v1',
			executionMode: 'worker_realtime',
			streamRunId: admission.streamRunId,
			clientTurnId: admission.clientTurnId,
			sessionId: 'session-1',
			turnRunId: WORKER_TURN_RUN_ID
		});
	});

	it('bootstraps a session before negotiating a lease on first send', async () => {
		const h = createHarness({ currentSession: null, inputValue: 'First turn' });

		await h.controller.sendMessage();

		expect(h.ensureSessionReady).toHaveBeenCalledOnce();
		expect(h.messages).toHaveLength(1);
		expect(h.messages[0]?.session_id).toBe('ensured-session');
		expect(parseBody(h.transportCalls[0]!)).toMatchObject({ sessionId: 'ensured-session' });
		expect(parseBody(h.admissionCalls[0]!)).toMatchObject({
			message: 'First turn',
			sessionId: 'ensured-session',
			preparedPromptKey: 'prepared-key'
		});
		expect(h.controller.activeTurnHandle).toMatchObject({
			executionMode: 'worker_realtime',
			sessionId: 'ensured-session'
		});
	});

	it('bootstraps a session on first send when no prepared prompt is available', async () => {
		const h = createHarness({
			currentSession: null,
			inputValue: 'First turn',
			preparedPrompt: null
		});

		await h.controller.sendMessage();

		expect(h.ensureSessionReady).toHaveBeenCalledOnce();
		expect(h.messages[0]?.session_id).toBe('ensured-session');
		expect(parseBody(h.admissionCalls[0]!)).toMatchObject({
			message: 'First turn',
			sessionId: 'ensured-session',
			preparedPromptKey: null
		});
	});

	it('waits briefly for an in-flight prepared prompt before first send', async () => {
		const prepared: PreparedPromptClient = {
			id: 'prepared-late',
			key: 'prepared-late-key',
			cache_key: 'cache-key',
			expires_at: '2099-01-01T00:00:00.000Z'
		};
		const waitForPreparedPrompt = vi.fn(async () => prepared);
		const h = createHarness({
			currentSession: null,
			inputValue: 'First turn',
			preparedPrompt: null,
			waitForPreparedPrompt
		});

		await h.controller.sendMessage();

		expect(waitForPreparedPrompt).toHaveBeenCalledWith('cache-key', { timeoutMs: 250 });
		expect(h.ensureSessionReady).toHaveBeenCalledOnce();
		expect(parseBody(h.admissionCalls[0]!)).toMatchObject({
			message: 'First turn',
			sessionId: 'ensured-session',
			preparedPromptKey: 'prepared-late-key'
		});
	});

	it('surfaces an outage instead of downgrading when negotiation is unavailable', async () => {
		const fetchImpl = vi.fn<typeof fetch>(async (input) => {
			if (String(input) === TRANSPORT_URL) {
				return Response.json(
					{ code: 'WORKER_UNAVAILABLE' },
					{ status: 503, headers: { 'Retry-After': '2' } }
				);
			}
			throw new Error(`unexpected request: ${String(input)}`);
		});
		const h = createHarness({
			inputValue: 'Keep this draft',
			currentSession: makeSession(),
			fetchImpl
		});

		await h.controller.sendMessage();

		expect(fetchImpl).toHaveBeenCalledOnce();
		expect(h.messages).toHaveLength(0);
		expect(h.inputValue).toBe('Keep this draft');
		expect(h.controller.error).toContain('temporarily unavailable');
	});

	// One engine: a stale lease (a kill-epoch bump, or plain expiry) is answered
	// by negotiating a fresh worker lease and re-admitting the same turn once.
	it('re-admits the turn once on the worker after a mid-turn kill-epoch bump', async () => {
		const urls: string[] = [];
		let admissionAttempts = 0;
		const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
			const url = String(input);
			urls.push(url);
			if (url === TRANSPORT_URL) return leaseResponse(`actl1.epoch-${urls.length}`);
			admissionAttempts += 1;
			if (admissionAttempts === 1) {
				return Response.json(
					{
						success: false,
						error: 'The worker transport lease must be renegotiated',
						code: 'TRANSPORT_RENEGOTIATE'
					},
					{ status: 409 }
				);
			}
			return admittedResponse(JSON.parse(String(init?.body ?? '{}')));
		});
		const h = createHarness({
			inputValue: 'Survive the epoch bump',
			currentSession: makeSession({ id: WORKER_SESSION_ID }),
			fetchImpl
		});

		await h.controller.sendMessage();

		expect(urls).toEqual([TRANSPORT_URL, TURNS_URL, TRANSPORT_URL, TURNS_URL]);
		// The re-admission carries the freshly minted lease, not the stale one.
		expect(JSON.parse(String(fetchImpl.mock.calls[3]?.[1]?.body)).leaseToken).toBe(
			'actl1.epoch-3'
		);
		expect(h.controller.error).toBeNull();
		expect(h.controller.activeTurnHandle?.executionMode).toBe('worker_realtime');
		expect(h.messages).toHaveLength(1);
	});

	it('fails the turn instead of looping when a second renegotiation is demanded', async () => {
		const urls: string[] = [];
		const fetchImpl = vi.fn<typeof fetch>(async (input) => {
			const url = String(input);
			urls.push(url);
			if (url === TRANSPORT_URL) return leaseResponse();
			return Response.json(
				{
					success: false,
					error: 'The worker transport lease must be renegotiated',
					code: 'TRANSPORT_RENEGOTIATE'
				},
				{ status: 409 }
			);
		});
		const h = createHarness({
			inputValue: 'Do not loop',
			currentSession: makeSession({ id: WORKER_SESSION_ID }),
			fetchImpl
		});

		await h.controller.sendMessage();

		expect(urls).toEqual([TRANSPORT_URL, TURNS_URL, TRANSPORT_URL, TURNS_URL]);
		expect(h.controller.error).toBe('The worker transport lease must be renegotiated');
		expect(h.controller.isStreaming).toBe(false);
		expect(h.controller.activeTurnHandle).toBeNull();
		// TRANSPORT_RENEGOTIATE proves the turn was never admitted, so the draft
		// comes back rather than leaving a bubble for a turn that never ran.
		expect(h.messages).toHaveLength(0);
		expect(h.inputValue).toBe('Do not loop');
		expect(h.discoverWorkerSession).not.toHaveBeenCalled();
	});

	it('admits attachments and voice-note context through the worker transport', async () => {
		const ref = makeAttachmentRef();
		const draft = makeDraftAttachment();
		const voiceNoteGroupId = 'd6000000-0000-4000-8000-000000000001';
		const h = createHarness({
			currentSession: makeSession({ id: WORKER_SESSION_ID }),
			readyRefs: [ref],
			draftAttachments: [draft],
			voiceNoteGroupId
		});

		await h.controller.sendMessage();

		expect(parseBody(h.admissionCalls[0]!)).toMatchObject({
			attachments: [
				{
					attachmentKind: 'onto_asset',
					mediaType: 'image',
					assetId: ref.asset_id,
					projectId: ref.project_id
				}
			],
			voiceNoteGroupId
		});
		expect(h.voice.noteGroupId).toBeNull();
		expect(h.controller.activeTurnHandle?.executionMode).toBe('worker_realtime');
	});

	it('keeps the optimistic bubble after worker admission becomes uncertain', async () => {
		const h = createHarness({
			inputValue: 'Do not duplicate me',
			currentSession: makeSession({ id: WORKER_SESSION_ID }),
			admissionFetchImpl: vi.fn<typeof fetch>(async () =>
				Response.json(
					{
						success: false,
						error: 'Worker admission is temporarily unavailable',
						code: 'WORKER_ADMISSION_UNAVAILABLE'
					},
					{ status: 503 }
				)
			) as unknown as typeof fetch
		});

		await h.controller.sendMessage();

		expect(h.admissionCalls).toHaveLength(1);
		expect(h.messages).toHaveLength(1);
		expect(h.inputValue).toBe('');
		expect(h.discoverWorkerSession).toHaveBeenCalledWith(WORKER_SESSION_ID);
		expect(h.controller.error).toBe(
			'Unable to start the worker response. BuildOS is checking its status.'
		);
	});

	it('rolls back a worker bubble only when the server proves admission did not occur', async () => {
		const h = createHarness({
			inputValue: 'Retry me safely',
			currentSession: makeSession({ id: WORKER_SESSION_ID }),
			admissionFetchImpl: vi.fn<typeof fetch>(async () =>
				Response.json(
					{
						success: false,
						error: 'Worker turn capacity is temporarily unavailable',
						code: 'WORKER_CAPACITY_EXCEEDED'
					},
					{ status: 503 }
				)
			) as unknown as typeof fetch
		});

		await h.controller.sendMessage();

		expect(h.messages).toHaveLength(0);
		expect(h.inputValue).toBe('Retry me safely');
		expect(h.discoverWorkerSession).not.toHaveBeenCalled();
	});

	it('never negotiates a sessionless turn when bootstrap fails with a prepared prompt', async () => {
		const h = createHarness({ currentSession: null, inputValue: 'First turn' });
		h.ensureSessionReady.mockRejectedValueOnce(new Error('session service down'));

		await h.controller.sendMessage();

		expect(h.ensureSessionReady).toHaveBeenCalledOnce();
		expect(h.defaultFetch).not.toHaveBeenCalled();
		expect(h.messages).toHaveLength(0);
		expect(h.inputValue).toBe('First turn');
		expect(h.controller.error).toContain('temporarily unavailable');
	});

	it('returns worker-unavailable when session bootstrap fails before negotiation', async () => {
		const h = createHarness({
			currentSession: null,
			preparedPrompt: null,
			inputValue: 'First turn'
		});
		h.ensureSessionReady.mockRejectedValueOnce(new Error('private session failure'));

		await h.controller.sendMessage();

		expect(h.defaultFetch).not.toHaveBeenCalled();
		expect(h.messages).toHaveLength(0);
		expect(h.inputValue).toBe('First turn');
		expect(h.controller.error).toContain('temporarily unavailable');
		expect(h.controller.error).not.toContain('private session failure');
	});

	it('rejects a malformed session bootstrap before transport negotiation', async () => {
		const h = createHarness({ currentSession: null });
		h.ensureSessionReady.mockResolvedValueOnce(null as unknown as ChatSession);

		await h.controller.sendMessage();

		expect(h.defaultFetch).not.toHaveBeenCalled();
		expect(h.reconcileTurnFromSession).not.toHaveBeenCalled();
		expect(h.messages).toHaveLength(0);
		expect(h.inputValue).toBe('hello');
		expect(h.controller.error).toBe('Unable to prepare a chat session right now.');
	});

	it('rolls back the optimistic message and restores input/draft on admission HTTP errors', async () => {
		const draft = makeDraftAttachment();
		const ref = makeAttachmentRef();
		const h = createHarness({
			inputValue: 'with attachment',
			readyRefs: [ref],
			draftAttachments: [draft],
			admissionFetchImpl: vi.fn(async () =>
				Response.json(
					{
						success: false,
						error: 'Worker turn command is invalid',
						code: 'INVALID_WORKER_COMMAND'
					},
					{ status: 422 }
				)
			) as unknown as typeof fetch
		});

		await h.controller.sendMessage();

		expect(h.messages).toEqual([]);
		expect(h.inputValue).toBe('with attachment');
		expect(h.restoreDraft).toHaveBeenCalledWith([draft]);
		expect(h.controller.isStreaming).toBe(false);
		expect(h.thinking.finalize).toHaveBeenCalledWith('error');
	});

	it('surfaces the server error body when admission is rejected (402 freeze)', async () => {
		const frozenMessage =
			'AI generation is paused until billing is activated. Your workspace remains readable.';
		const h = createHarness({
			admissionFetchImpl: vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							success: false,
							error: frozenMessage,
							code: 'UPGRADE_REQUIRED'
						}),
						{ status: 402, headers: { 'Content-Type': 'application/json' } }
					)
			) as unknown as typeof fetch
		});

		await h.controller.sendMessage();

		expect(h.controller.error).toBe(frozenMessage);
		// UPGRADE_REQUIRED is not a known not-admitted code, so the bubble stays.
		expect(h.messages).toHaveLength(1);
		expect(h.inputValue).toBe('');
	});

	it('does not clobber a newer draft when restoring a failed send', async () => {
		let resolveAdmission!: (response: Response) => void;
		const h = createHarness({
			admissionFetchImpl: vi.fn(
				() =>
					new Promise<Response>((resolve) => {
						resolveAdmission = resolve;
					})
			) as unknown as typeof fetch
		});

		const sendPromise = h.controller.sendMessage();
		await vi.waitFor(() => expect(h.admissionCalls).toHaveLength(1));
		// User starts typing a new message while the failed request is in flight.
		h.inputValue = 'newer draft typed mid-flight';
		resolveAdmission(Response.json({ success: false, code: 'INVALID_FIELD' }, { status: 400 }));
		await sendPromise;

		expect(h.controller.error).toEqual(expect.any(String));
		expect(h.inputValue).toBe('newer draft typed mid-flight');
	});

	it('routes a worker handle only through the owned worker cancellation endpoint', async () => {
		const h = createHarness();

		await expect(h.controller.cancelTurn(workerHandle(), 'user_cancelled')).resolves.toEqual({
			outcome: 'cancel_requested'
		});
		expect(h.cancelFetchCalls).toHaveLength(1);
		expect(String(h.cancelFetchCalls[0]?.input)).toBe(
			`${TURNS_URL}/${WORKER_TURN_RUN_ID}/cancel`
		);
		expect(parseBody(h.cancelFetchCalls[0]!)).toEqual({ reason: 'user_cancelled' });
	});

	it('keeps a worker turn active until durable terminal truth follows cancellation', async () => {
		const h = createHarness();
		const handle = workerHandle();
		h.controller.adoptWorkerTurn(handle, 'running');

		await h.controller.stopGeneration('user_cancelled');

		expect(h.haptic).toHaveBeenCalledWith('heavy');
		expect(h.cancelFetchCalls).toHaveLength(1);
		expect(h.controller.lastCancelResult).toEqual({ outcome: 'cancel_requested' });
		expect(h.controller.activeTurnHandle).toEqual(handle);
		expect(h.controller.isStreaming).toBe(true);
		expect(h.controller.currentActivity).toBe('Stopping response...');

		h.controller.finishWorkerTurn(handle, 'cancelled');
		expect(h.controller.activeTurnHandle).toBeNull();
		expect(h.controller.isStreaming).toBe(false);
		expect(h.controller.currentActivity).toBe('');
	});

	it('does not dispatch a second turn while an adopted worker turn is active', async () => {
		const h = createHarness({ inputValue: 'do not double-dispatch' });
		h.controller.adoptWorkerTurn(workerHandle(), 'queued');

		await h.controller.sendMessage();

		expect(h.controller.error).toBe('BuildOS is still finishing the latest response.');
		expect(h.inputValue).toBe('do not double-dispatch');
		expect(h.messages).toHaveLength(0);
		expect(h.defaultFetch).not.toHaveBeenCalled();
	});

	it('supersedes an active turn before sending a second message', async () => {
		const h = createHarness({ inputValue: 'first' });
		await h.controller.sendMessage();
		const firstHandle = h.controller.activeTurnHandle!;
		h.controller.finishWorkerTurn(firstHandle, 'completed');

		h.inputValue = 'second';
		await h.controller.sendMessage();

		expect(h.messages.map((message) => message.content)).toEqual(['first', 'second']);
		expect(h.admissionCalls).toHaveLength(2);
		expect(parseBody(h.admissionCalls[0]!).clientTurnId).not.toBe(
			parseBody(h.admissionCalls[1]!).clientTurnId
		);
	});

	it('stops recording and sends after transcription finishes', async () => {
		const h = createHarness({ inputValue: '' });
		h.voice.isRecording = true;

		await h.controller.handleSendMessage();

		expect(h.voice.pendingSendAfterTranscription).toBe(true);
		expect(h.voice.stop).toHaveBeenCalledOnce();
		expect(h.admissionCalls).toHaveLength(0);

		h.inputValue = 'transcribed text';
		await h.controller.handlePendingSendAfterTranscription(false);

		expect(h.admissionCalls).toHaveLength(1);
		expect(h.voice.pendingSendAfterTranscription).toBe(false);
		expect(h.messages[0]?.content).toBe('transcribed text');
	});

	it('reset clears active turn state without clearing the sent-message summary flag', () => {
		const h = createHarness();
		h.controller.hasSentMessage = true;
		h.controller.error = 'visible error';
		h.controller.currentActivity = 'Working';
		h.controller.activeTurnHandle = workerHandle();

		h.controller.reset();

		expect(h.controller.hasSentMessage).toBe(true);
		expect(h.controller.error).toBeNull();
		expect(h.controller.currentActivity).toBe('');
		expect(h.controller.activeTurnHandle).toBeNull();
		expect(h.controller.lastCancelResult).toBeNull();
	});
});
