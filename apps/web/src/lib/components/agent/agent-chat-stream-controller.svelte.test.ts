// apps/web/src/lib/components/agent/agent-chat-stream-controller.svelte.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
	ChatAttachmentRef,
	ChatContextType,
	ChatSession,
	TurnHandleV1
} from '@buildos/shared-types';
import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';
import { buildAgentChatSessionSnapshot, type PreparedPromptClient } from './agent-chat-session';
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
		id: 'd2000000-0000-4000-8000-000000000002',
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

function admittedResponse(
	request: Record<string, unknown>,
	overrides: { sessionId?: string; turnRunId?: string } = {}
): Response {
	return Response.json(
		{
			success: true,
			data: {
				outcome: 'newly_admitted',
				...(request.reviewIntent ? { reviewMode: 'project_review' } : {}),
				handle: {
					contractVersion: 'agentic_chat_worker_v1',
					executionMode: 'worker_realtime',
					turnRunId: overrides.turnRunId ?? WORKER_TURN_RUN_ID,
					sessionId:
						overrides.sessionId ??
						(typeof request.sessionId === 'string'
							? request.sessionId
							: WORKER_SESSION_ID),
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
			// Current clients never negotiate a separate lease.
			transportCalls.push({ input, init });
			throw new Error('the lease endpoint must not be called');
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
		create: vi.fn((_options?: { renderKey?: string }) => 'thinking-1'),
		updateState: vi.fn(),
		finalize: vi.fn(),
		discard: vi.fn()
	};
	const assistant = {
		flushText: vi.fn(),
		finalizeMessage: vi.fn()
	};
	const haptic = vi.fn();
	const requestWorkerReconciliation = vi.fn();
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
			},
			update: (messageId, patch) => {
				const index = messages.findIndex((message) => message.id === messageId);
				if (index >= 0) messages[index] = { ...messages[index]!, ...patch };
			}
		},
		thinking,
		assistant,
		clearPendingToolState: vi.fn(),
		adoptWorkerAdmissionResponse,
		discoverWorkerSession,
		setUserHasScrolled: vi.fn(),
		setExistingImagePickerOpen: vi.fn(),
		haptic,
		requestWorkerReconciliation,
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
		requestWorkerReconciliation,
		messages,
		transportCalls,
		admissionCalls,
		cancelFetchCalls,
		defaultFetch,
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
	it('pins the selected published version at send time and reads the new selection on the next send', async () => {
		const selected = {
			draftId: 'd8000000-0000-4000-8000-000000000001',
			version: 1,
			snapshotHash: 'a'.repeat(64)
		};
		const originalSelection = { ...selected };
		const h = createHarness({
			inputValue: 'Review the launch documents.',
			admissionFetchImpl: async (_input, init) => {
				// Simulate a host selection changing while admission is in flight.
				selected.version = 2;
				selected.snapshotHash = 'b'.repeat(64);
				return admittedResponse(JSON.parse(String(init?.body)));
			}
		});
		h.deps.getPublishedSpecialist = () => selected;
		h.deps.getReviewIntent = () => 'document_organization';
		await h.controller.sendMessage();
		expect(h.controller.error).toBeNull();
		expect(h.admissionCalls).toHaveLength(1);
		expect(parseBody(h.admissionCalls[0]!)).toMatchObject({
			reviewIntent: 'document_organization',
			publishedSpecialist: originalSelection,
			message: 'Review the launch documents.',
			preparedPromptKey: null
		});
		const firstHandle = h.controller.activeTurnHandle;
		if (!firstHandle || firstHandle.executionMode !== 'worker_realtime')
			throw new Error('Expected an admitted worker turn');
		h.controller.finishWorkerTurn(firstHandle, 'completed');
		await h.controller.sendMessage('Review the updated launch documents.');
		expect(parseBody(h.admissionCalls[1]!).publishedSpecialist).toEqual(selected);
		expect(parseBody(h.admissionCalls[1]!).clientTurnId).not.toBe(
			parseBody(h.admissionCalls[0]!).clientTurnId
		);
		expect(h.transportCalls).toHaveLength(0);
	});

	it('never infers a review from a /workflow prefix: without a selection it is ordinary chat, sent verbatim', async () => {
		const h = createHarness({ inputValue: '/workflow Review the launch documents.' });
		h.deps.getPublishedSpecialist = () => ({
			draftId: 'd8000000-0000-4000-8000-000000000001',
			version: 1,
			snapshotHash: 'a'.repeat(64)
		});
		await h.controller.sendMessage();
		const body = parseBody(h.admissionCalls[0]!);
		expect(body).not.toHaveProperty('reviewIntent');
		expect(body).not.toHaveProperty('publishedSpecialist');
		expect(body.message).toBe('/workflow Review the launch documents.');
	});

	it('carries the recommendation and curated evidence only for the question they were made for', async () => {
		const question = 'What should we prioritize next?';
		const selected = {
			draftId: 'd8000000-0000-4000-8000-000000000001',
			version: 1,
			snapshotHash: 'a'.repeat(64),
			selectionDecisionId: 'd9000000-0000-4000-8000-000000000001',
			selectionQuestion: question,
			selectionProjectId: 'project-1',
			contextPlan: { version: 'plan', items: [] },
			contextPlanQuestion: question,
			contextPlanProjectId: 'project-1'
		};
		const h = createHarness({ inputValue: question });
		h.deps.getPublishedSpecialist = () => selected as never;
		h.deps.getReviewIntent = () => 'document_organization';
		await h.controller.sendMessage();
		expect(parseBody(h.admissionCalls[0]!)).toMatchObject({
			reviewIntent: 'document_organization',
			message: question,
			publishedSpecialist: {
				draftId: selected.draftId,
				selectionDecisionId: selected.selectionDecisionId,
				contextPlan: selected.contextPlan
			}
		});
		const handle = h.controller.activeTurnHandle;
		if (!handle || handle.executionMode !== 'worker_realtime')
			throw new Error('Expected an admitted worker turn');
		h.controller.finishWorkerTurn(handle, 'completed');
		await h.controller.sendMessage('A different question entirely.');
		const second = parseBody(h.admissionCalls[1]!).publishedSpecialist;
		expect(second).toMatchObject({ draftId: selected.draftId });
		expect(second).not.toHaveProperty('selectionDecisionId');
		expect(second).not.toHaveProperty('contextPlan');
	});

	it.each([null, 'project_review'] as const)(
		'does not attach the selected specialist to %s chat',
		async (reviewIntent) => {
			const h = createHarness();
			h.deps.getReviewIntent = () => reviewIntent;
			h.deps.getPublishedSpecialist = () => ({
				draftId: 'd8000000-0000-4000-8000-000000000001',
				version: 1,
				snapshotHash: 'a'.repeat(64)
			});
			await h.controller.sendMessage();
			expect(parseBody(h.admissionCalls[0]!)).not.toHaveProperty('publishedSpecialist');
		}
	);

	it('preserves the custom workflow draft and selection when publication admission is unavailable', async () => {
		const h = createHarness({
			currentSession: null,
			inputValue: 'Review our docs.',
			admissionFetchImpl: async () =>
				Response.json(
					{
						success: false,
						error: 'Specialist unavailable',
						code: 'WORKFLOW_REVIEW_UNAVAILABLE'
					},
					{ status: 409 }
				)
		});
		const selected = {
			draftId: 'd8000000-0000-4000-8000-000000000001',
			version: 1,
			snapshotHash: 'a'.repeat(64)
		};
		h.deps.getPublishedSpecialist = () => selected;
		h.deps.getReviewIntent = () => 'document_organization';
		h.deps.onReviewAdmitted = vi.fn();
		await h.controller.sendMessage();
		expect(h.inputValue).toBe('Review our docs.');
		expect(h.messages).toHaveLength(0);
		expect(h.controller.error).toBe('Specialist unavailable');
		expect(h.deps.getPublishedSpecialist()).toBe(selected);
		expect(h.deps.onReviewAdmitted).not.toHaveBeenCalled();
	});

	it.each(['project_review', 'document_organization'] as const)(
		'submits a fresh %s without prompt preparation or session bootstrap',
		async (reviewIntent) => {
			const wait = vi.fn();
			const h = createHarness({
				currentSession: null,
				waitForPreparedPrompt: wait,
				admissionFetchImpl: async (_input, init) =>
					admittedResponse(JSON.parse(String(init?.body)), {
						sessionId: WORKER_SESSION_ID
					})
			});
			h.deps.getReviewIntent = () => reviewIntent;
			h.deps.onReviewAdmitted = vi.fn();
			await h.controller.sendMessage();
			expect(h.controller.error).toBeNull();
			expect(h.prewarm.matchingFreshPreparedPrompt).not.toHaveBeenCalled();
			expect(wait).not.toHaveBeenCalled();
			expect(parseBody(h.admissionCalls[0]!)).toMatchObject({
				sessionId: null,
				reviewIntent,
				preparedPromptKey: null
			});
			expect(h.adoptWorkerAdmissionResponse).toHaveBeenCalledOnce();
			expect(h.adoptWorkerAdmissionResponse).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({ reviewMode: 'project_review' })
				})
			);
			expect(h.deps.onReviewAdmitted).toHaveBeenCalledOnce();
		}
	);

	it.each(['project_review', 'document_organization'] as const)(
		'keeps the %s draft and intent when the rollout is unavailable',
		async (reviewIntent) => {
			const h = createHarness({
				admissionFetchImpl: async () =>
					Response.json(
						{
							success: false,
							error: 'Review is unavailable',
							code: 'WORKFLOW_REVIEW_UNAVAILABLE'
						},
						{ status: 409 }
					)
			});
			h.deps.getReviewIntent = () => reviewIntent;
			h.deps.onReviewAdmitted = vi.fn();
			await h.controller.sendMessage();
			expect(h.inputValue).toBe('hello');
			expect(h.messages).toHaveLength(0);
			expect(h.controller.error).toBe('Review is unavailable');
			expect(h.deps.onReviewAdmitted).not.toHaveBeenCalled();
			expect(h.discoverWorkerSession).not.toHaveBeenCalled();
			expect(h.admissionCalls).toHaveLength(1);
		}
	);

	it('does not offer a duplicate draft when fresh-review admission loses its response', async () => {
		const h = createHarness({
			currentSession: null,
			admissionFetchImpl: async () => {
				throw new Error('connection lost');
			}
		});
		h.deps.getReviewIntent = () => 'project_review';
		await h.controller.sendMessage();
		expect(h.inputValue).toBe('');
		expect(h.messages).toHaveLength(1);
		expect(h.controller.error).toContain('Reopen it from chat history');
		expect(h.admissionCalls).toHaveLength(1);
	});

	it.each(['project_review', 'document_organization'] as const)(
		'rejects %s attachments before admission',
		async (reviewIntent) => {
			const h = createHarness({
				readyRefs: [makeAttachmentRef()],
				draftAttachments: [makeDraftAttachment()]
			});
			h.deps.getReviewIntent = () => reviewIntent;
			await h.controller.sendMessage();
			expect(h.controller.error).toContain('text-only');
			expect(h.admissionCalls).toHaveLength(0);
			expect(h.inputValue).toBe('hello');
		}
	);

	it.each(['global', 'document-focus', 'voice'] as const)(
		'rejects document organization in %s context before admission',
		async (context) => {
			const h = createHarness({ voiceNoteGroupId: context === 'voice' ? 'voice-1' : null });
			h.deps.getReviewIntent = () => 'document_organization';
			if (context === 'global') h.selectedContextType = 'global';
			if (context === 'document-focus')
				h.deps.getResolvedProjectFocus = () => ({
					focusType: 'document',
					focusEntityId: 'document-1',
					focusEntityName: 'Notes',
					projectId: 'project-1',
					projectName: 'Project'
				});
			await h.controller.sendMessage();
			expect(h.controller.error).toBe(
				'Document organization needs project-wide focus and a text-only message.'
			);
			expect(h.admissionCalls).toHaveLength(0);
			expect(h.inputValue).toBe('hello');
		}
	);

	it.each(['document', 'task', 'goal', 'plan', 'milestone', 'risk', 'requirement'] as const)(
		'sends the saved %s focus on the next turn after history restore',
		async (focusType) => {
			const focus: ProjectFocus = {
				focusType,
				focusEntityId: 'entity-1',
				focusEntityName: 'Current entity',
				projectId: 'project-1',
				projectName: 'Project One'
			};
			const snapshot = buildAgentChatSessionSnapshot({
				session: makeSession({ agent_metadata: { focus: { ...focus } } })
			});
			const h = createHarness({ currentSession: snapshot.session });
			h.deps.getSelectedContextType = () => snapshot.contextType;
			h.deps.getSelectedEntityId = () => snapshot.selectedEntityId;
			h.deps.getResolvedProjectFocus = () => snapshot.projectFocus;

			await h.controller.sendMessage('Continue working on this item');

			expect(h.admissionCalls).toHaveLength(1);
			expect(parseBody(h.admissionCalls[0]!)).toMatchObject({
				sessionId: snapshot.session.id,
				context: { type: 'project', entityId: 'project-1', projectId: 'project-1' },
				projectFocus: focus
			});
		}
	);

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

		// One request per turn: no separate lease negotiation.
		expect(h.defaultFetch.mock.calls.map(([input]) => String(input))).toEqual([TURNS_URL]);
		const admission = parseBody(h.admissionCalls[0]!);
		expect(admission).toMatchObject({
			message: 'Build the plan',
			sessionId: 'd2000000-0000-4000-8000-000000000002',
			context: { type: 'project', entityId: 'project-1', projectId: 'project-1' },
			preparedPromptKey: 'prepared-key'
		});
		expect(admission).not.toHaveProperty('leaseToken');
		expect(h.messages[0]).toMatchObject({
			delivery: 'sent',
			renderKey: `turn:${admission.clientTurnId}:user`
		});
		expect(h.thinking.create).toHaveBeenCalledWith({
			renderKey: `turn:${admission.clientTurnId}:thinking`
		});
		expect(h.adoptWorkerAdmissionResponse).toHaveBeenCalledOnce();
		expect(h.controller.activeTurnHandle).toEqual({
			contractVersion: 'agentic_chat_worker_v1',
			executionMode: 'worker_realtime',
			streamRunId: admission.streamRunId,
			clientTurnId: admission.clientTurnId,
			sessionId: 'd2000000-0000-4000-8000-000000000002',
			turnRunId: WORKER_TURN_RUN_ID
		});
	});

	it('lets admission create the session inline on a new chat first send', async () => {
		const wait = vi.fn();
		const h = createHarness({
			currentSession: null,
			inputValue: 'First turn',
			waitForPreparedPrompt: wait
		});

		await h.controller.sendMessage();

		expect(h.defaultFetch.mock.calls.map(([input]) => String(input))).toEqual([TURNS_URL]);
		// Prepared prompts are session-bound, so a sessionless first turn never waits.
		expect(wait).not.toHaveBeenCalled();
		expect(parseBody(h.admissionCalls[0]!)).toMatchObject({
			message: 'First turn',
			sessionId: null,
			preparedPromptKey: null
		});
		expect(h.messages[0]?.session_id).toBe(WORKER_SESSION_ID);
		expect(h.controller.activeTurnHandle).toMatchObject({
			executionMode: 'worker_realtime',
			sessionId: WORKER_SESSION_ID
		});
		expect(h.controller.activeStreamTiming?.inlineSession).toBe(true);
	});

	it('shows the bubble, clears the composer, and starts thinking before any network call', async () => {
		let resolveAdmission!: (response: Response) => void;
		const h = createHarness({
			inputValue: 'Instant',
			admissionFetchImpl: vi.fn(
				() =>
					new Promise<Response>((resolve) => {
						resolveAdmission = resolve;
					})
			) as unknown as typeof fetch
		});

		const send = h.controller.sendMessage();

		// Synchronous part of sendMessage has run; nothing has been awaited yet.
		expect(h.messages).toHaveLength(1);
		expect(h.messages[0]).toMatchObject({ content: 'Instant', delivery: 'sending' });
		expect(h.inputValue).toBe('');
		expect(h.thinking.create).toHaveBeenCalledOnce();
		expect(h.controller.isStartingStream).toBe(true);

		await vi.waitFor(() => expect(h.admissionCalls).toHaveLength(1));
		resolveAdmission(admittedResponse(parseBody(h.admissionCalls[0]!)));
		await send;
		expect(h.messages[0]?.delivery).toBe('sent');
	});

	it('waits briefly for an in-flight prepared prompt when the session exists', async () => {
		const prepared: PreparedPromptClient = {
			id: 'prepared-late',
			key: 'prepared-late-key',
			cache_key: 'cache-key',
			expires_at: '2099-01-01T00:00:00.000Z'
		};
		const waitForPreparedPrompt = vi.fn(async () => prepared);
		const h = createHarness({
			inputValue: 'Next turn',
			preparedPrompt: null,
			waitForPreparedPrompt
		});

		await h.controller.sendMessage();

		expect(waitForPreparedPrompt).toHaveBeenCalledWith('cache-key', { timeoutMs: 250 });
		expect(parseBody(h.admissionCalls[0]!)).toMatchObject({
			message: 'Next turn',
			preparedPromptKey: 'prepared-late-key'
		});
		expect(h.controller.activeStreamTiming?.preparedPromptUsed).toBe(true);
	});

	it.each(['WORKER_UNAVAILABLE', 'TRANSPORT_CONFLICT', 'AGENTIC_CHAT_RATE_LIMITED'])(
		'rolls the optimistic turn back when admission refuses before any write (%s)',
		async (code) => {
			const h = createHarness({
				inputValue: 'Keep this draft',
				admissionFetchImpl: async () =>
					Response.json(
						{ success: false, error: 'Try again shortly.', code },
						{ status: code === 'TRANSPORT_CONFLICT' ? 409 : 503 }
					)
			});

			await h.controller.sendMessage();

			expect(h.messages).toHaveLength(0);
			expect(h.thinking.discard).toHaveBeenCalledOnce();
			expect(h.inputValue).toBe('Keep this draft');
			expect(h.controller.error).toBe(
				code === 'TRANSPORT_CONFLICT'
					? 'Try again shortly.'
					: "Couldn't send that just now. Your message is back in the box — try again in a moment."
			);
			expect(h.discoverWorkerSession).not.toHaveBeenCalled();
		}
	);

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
			'Unable to start this response. BuildOS is checking its status.'
		);
		expect(h.messages[0]?.delivery).toBe('sent');
		expect(h.thinking.finalize).toHaveBeenCalledWith('error');
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
		expect(h.thinking.discard).toHaveBeenCalledOnce();
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

	it('queues a follow-up typed while admission is pending and sends it after the turn', async () => {
		let resolveAdmission!: (response: Response) => void;
		let admissions = 0;
		const h = createHarness({
			admissionFetchImpl: vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
				admissions += 1;
				if (admissions > 1)
					return Promise.resolve(
						admittedResponse(JSON.parse(String(init?.body)), {
							turnRunId: 'd4000000-0000-4000-8000-000000000002'
						})
					);
				return new Promise<Response>((resolve) => {
					resolveAdmission = resolve;
				});
			}) as typeof fetch
		});
		const send = h.controller.sendMessage();
		expect(h.controller.isStartingStream).toBe(true);
		await vi.waitFor(() => expect(h.admissionCalls).toHaveLength(1));
		h.inputValue = 'A second submit while waiting';
		await h.controller.sendMessage();
		expect(h.admissionCalls).toHaveLength(1);
		expect(h.controller.queuedMessage).toBe('A second submit while waiting');
		expect(h.inputValue).toBe('');
		resolveAdmission(admittedResponse(parseBody(h.admissionCalls[0]!)));
		await send;
		expect(h.controller.isStartingStream).toBe(false);

		// Still busy (the worker turn is running): flushing is a no-op.
		await h.controller.flushQueuedMessage();
		expect(h.admissionCalls).toHaveLength(1);

		const activeHandle = h.controller.activeTurnHandle;
		if (!activeHandle || activeHandle.executionMode !== 'worker_realtime')
			throw new Error('Expected an admitted worker turn');
		h.controller.finishWorkerTurn(activeHandle, 'completed');
		await h.controller.flushQueuedMessage();
		expect(h.controller.queuedMessage).toBeNull();
		expect(h.admissionCalls).toHaveLength(2);
		expect(parseBody(h.admissionCalls[1]!).message).toBe('A second submit while waiting');
	});

	it('queues a dictated follow-up mid-response and sends it with its recording', async () => {
		const voiceNoteGroupId = 'd6000000-0000-4000-8000-000000000009';
		const h = createHarness({ inputValue: 'Dictated while it was answering' });
		const handle = workerHandle();
		h.controller.adoptWorkerTurn(handle, 'running');
		h.voice.noteGroupId = voiceNoteGroupId;

		await h.controller.sendMessage();

		expect(h.controller.error).toBeNull();
		expect(h.controller.queuedMessage).toBe('Dictated while it was answering');
		expect(h.controller.queuedVoiceNoteGroupId).toBe(voiceNoteGroupId);
		// The composer is free for the next recording.
		expect(h.voice.noteGroupId).toBeNull();
		expect(h.admissionCalls).toHaveLength(0);

		h.controller.finishWorkerTurn(handle, 'completed');
		await h.controller.flushQueuedMessage();

		expect(h.admissionCalls).toHaveLength(1);
		const body = parseBody(h.admissionCalls[0]!);
		expect(body.message).toBe('Dictated while it was answering');
		expect(body.voiceNoteGroupId).toBe(voiceNoteGroupId);
		expect(h.controller.queuedVoiceNoteGroupId).toBeNull();
	});

	it('hands a queued follow-up back to the composer when the turn fails', () => {
		const h = createHarness({ inputValue: 'draft in progress' });
		const handle = workerHandle();
		h.controller.adoptWorkerTurn(handle, 'running');
		h.controller.queuedMessage = 'queued follow-up';

		h.controller.finishWorkerTurn(handle, 'failed');

		expect(h.controller.queuedMessage).toBeNull();
		expect(h.inputValue).toBe('queued follow-up\n\ndraft in progress');
	});

	it('hands a queued follow-up back to the composer when the turn times out in the queue', () => {
		const h = createHarness({ inputValue: '' });
		const handle = workerHandle();
		h.controller.adoptWorkerTurn(handle, 'queued');
		h.controller.queuedMessage = 'queued follow-up';

		h.controller.finishWorkerTurn(handle, 'cancelled', 'timeout');

		expect(h.controller.queuedMessage).toBeNull();
		expect(h.inputValue).toBe('queued follow-up');
	});

	it('warns that a change may already be saved when a turn fails mid-write', () => {
		const h = createHarness();
		const handle = workerHandle();
		h.controller.adoptWorkerTurn(handle, 'running');

		h.controller.finishWorkerTurn(handle, 'failed', null, 'uncertain_external_commit');

		expect(h.controller.error).toBe(
			'BuildOS stopped partway through a change, so it may already be saved. Check before trying again.'
		);
	});

	it('warns the same way when Stop ended a turn mid-write', () => {
		const h = createHarness();
		const handle = workerHandle();
		h.controller.adoptWorkerTurn(handle, 'running');

		h.controller.finishWorkerTurn(
			handle,
			'cancelled',
			'cancelled',
			'uncertain_external_commit'
		);

		expect(h.controller.error).toBe(
			'BuildOS stopped partway through a change, so it may already be saved. Check before trying again.'
		);
	});

	it('keeps a plain Stop silent', () => {
		const h = createHarness();
		const handle = workerHandle();
		h.controller.adoptWorkerTurn(handle, 'running');

		h.controller.finishWorkerTurn(handle, 'cancelled', 'cancelled', 'cancelled');

		expect(h.controller.error).toBeNull();
	});

	it('keeps the generic failure copy when no write was in flight', () => {
		const h = createHarness();
		const handle = workerHandle();
		h.controller.adoptWorkerTurn(handle, 'running');

		h.controller.finishWorkerTurn(handle, 'failed', null, 'provider_failure');

		expect(h.controller.error).toBe(
			'BuildOS could not finish this response. Please try again.'
		);
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
		// A live worker ends the turn itself; no extra reconcile is requested.
		expect(h.requestWorkerReconciliation).not.toHaveBeenCalled();
	});

	it('reconciles at once when Stop itself ended a turn whose worker is gone', async () => {
		const fetchImpl = vi.fn(async () =>
			Response.json({
				success: true,
				data: {
					outcome: 'cancelled',
					status: 'cancelled',
					terminalEventId: `${WORKER_TURN_RUN_ID}:1:4`
				}
			})
		) as unknown as typeof fetch;
		const h = createHarness({ fetchImpl });
		const handle = workerHandle();
		h.controller.adoptWorkerTurn(handle, 'running');

		await h.controller.stopGeneration('user_cancelled');

		expect(h.controller.lastCancelResult).toMatchObject({ outcome: 'cancelled' });
		expect(h.requestWorkerReconciliation).toHaveBeenCalledWith(WORKER_TURN_RUN_ID);
	});

	it('shows a long queue wait in the thinking block once, and only while queued', () => {
		const h = createHarness();
		const handle = workerHandle();
		h.controller.adoptWorkerTurn(handle, 'queued');
		expect(h.controller.currentActivity).toBe('Thinking…');

		// Unchanged wait text: no redundant block writes on every reconcile.
		h.controller.updateWorkerTurnState(handle, 'queued', 'Thinking…');
		expect(h.thinking.updateState).not.toHaveBeenCalled();

		h.controller.updateWorkerTurnState(handle, 'queued', 'Taking longer than usual…');
		h.controller.updateWorkerTurnState(handle, 'queued', 'Taking longer than usual…');
		expect(h.thinking.updateState).toHaveBeenCalledExactlyOnceWith(
			'thinking',
			'Taking longer than usual…'
		);
		expect(h.controller.currentActivity).toBe('Taking longer than usual…');
		expect(h.controller.isStreaming).toBe(true);

		// Claimed: the running turn's live events own the block from here.
		h.controller.updateWorkerTurnState(handle, 'running', 'Thinking…');
		expect(h.thinking.updateState).toHaveBeenCalledOnce();
		expect(h.controller.currentActivity).toBe('Thinking…');
	});

	it('keeps the timeout failure banner when the timed-out turn finishes as cancelled', () => {
		const h = createHarness();
		const handle = workerHandle();
		h.controller.adoptWorkerTurn(handle, 'queued');
		// The done event's handler sets the banner before the terminal lands.
		h.controller.error =
			"BuildOS couldn't start this reply because the chat service was unavailable. Please send it again.";

		h.controller.updateWorkerTurnState(handle, 'cancelled', '');
		h.controller.finishWorkerTurn(handle, 'cancelled');

		expect(h.thinking.updateState).not.toHaveBeenCalled();
		expect(h.controller.isStreaming).toBe(false);
		expect(h.controller.currentActivity).toBe('');
		expect(h.controller.error).toBe(
			"BuildOS couldn't start this reply because the chat service was unavailable. Please send it again."
		);
	});

	it('queues instead of dispatching a second turn while an adopted worker turn is active', async () => {
		const h = createHarness({ inputValue: 'do not double-dispatch' });
		h.controller.adoptWorkerTurn(workerHandle(), 'queued');

		await h.controller.sendMessage();

		expect(h.controller.error).toBeNull();
		expect(h.controller.queuedMessage).toBe('do not double-dispatch');
		expect(h.inputValue).toBe('');
		expect(h.messages).toHaveLength(0);
		expect(h.defaultFetch).not.toHaveBeenCalled();
	});

	it('refuses to queue attachments while a turn is active', async () => {
		const h = createHarness({
			readyRefs: [makeAttachmentRef()],
			draftAttachments: [makeDraftAttachment()]
		});
		h.controller.adoptWorkerTurn(workerHandle(), 'running');

		await h.controller.sendMessage();

		expect(h.controller.error).toBe('BuildOS is still finishing the latest response.');
		expect(h.controller.queuedMessage).toBeNull();
		expect(h.inputValue).toBe('hello');
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

	it('reports the client turn timeline when the worker turn finishes', async () => {
		const h = createHarness();
		const captureTurnTiming = vi.fn();
		h.deps.captureTurnTiming = captureTurnTiming;
		// Re-create so the controller picks up the capture dep.
		const controller = createAgentChatStreamController(h.deps);
		h.deps.adoptWorkerAdmissionResponse = (value: unknown) => {
			const data = (
				value as {
					data: {
						handle: Extract<TurnHandleV1, { executionMode: 'worker_realtime' }>;
						status: 'queued';
					};
				}
			).data;
			controller.adoptWorkerTurn(data.handle, data.status);
			return {
				handle: data.handle,
				status: data.status,
				executionGeneration: 0,
				terminalEventId: null,
				updatedAt: '2026-08-04T03:00:00.000Z'
			};
		};

		await controller.sendMessage();
		const handle = controller.activeTurnHandle;
		if (!handle || handle.executionMode !== 'worker_realtime')
			throw new Error('Expected an admitted worker turn');
		controller.recordClientStreamEvent(controller.activeStreamRunId, 'text_delta');
		controller.finishWorkerTurn(handle, 'completed');

		expect(captureTurnTiming).toHaveBeenCalledOnce();
		expect(captureTurnTiming.mock.calls[0]?.[0]).toMatchObject({
			terminalState: 'completed',
			inlineSession: false,
			preparedPromptUsed: true,
			timeToAdmittedMs: expect.any(Number),
			timeToFirstTextMs: expect.any(Number)
		});
	});
});
