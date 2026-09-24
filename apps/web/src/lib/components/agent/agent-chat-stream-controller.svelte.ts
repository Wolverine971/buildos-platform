// apps/web/src/lib/components/agent/agent-chat-stream-controller.svelte.ts
//
// Owns the client-side send / receive / cancel lifecycle for AgentChatModal.
// The modal still owns rendering and concrete message/thinking mutations; this
// controller coordinates turn state, admission, cancellation, and cleanup.

import type {
	AgentSSEMessage,
	AgentTimingSummary,
	CancelTurnResultV1,
	ChatAttachmentRef,
	ChatContextType,
	ChatRole,
	ChatSession,
	ChatTurnStatusV1,
	AgenticChatWorkerTurnDescriptorV1,
	TurnHandleV1
} from '@buildos/shared-types';
import type { LastTurnContext, ProjectFocus } from '$lib/types/agent-chat-enhancement';
import {
	normalizeFastContextType,
	resolveEffectiveEntityId,
	resolveEffectiveProjectId
} from '$lib/services/agentic-chat-v2/scope';
import {
	requestAgenticChatWorkerAdmission,
	type AgenticChatWorkerCommand,
	type PublishedSpecialistSelection
} from '$lib/services/agentic-chat-v2/worker-transport-client';
import { AgentRequestError, buildAgentRequestError } from './agent-chat-session';
import type { PreparedPromptClient } from './agent-chat-session';
import { PREPARED_PROMPT_SEND_WAIT_MS } from './agent-chat.constants';
import type { AgentChatImageAttachment, UIMessage } from './agent-chat.types';
import { isWorkerQueueTimeout, workerActivityForStatus } from './agent-chat-worker-status';
import { parseAdmissionResponse } from '$lib/services/agentic-chat-v2/worker-turn-adoption';

export interface ClientStreamTimingState {
	runId: number;
	sendStartedAtMs: number;
	/** Send press → worker admission accepted (the turn is durably queued). */
	admittedAtMs: number | null;
	/** True when admission created the session inline (first turn of a new chat). */
	inlineSession: boolean;
	preparedPromptUsed: boolean;
	firstEventAtMs: number | null;
	firstTextAtMs: number | null;
	lastTextAtMs: number | null;
	doneEventAtMs: number | null;
	streamClosedAtMs: number | null;
	terminalState: 'completed' | 'error' | 'cancelled' | 'aborted' | null;
	cancelReason: 'user_cancelled' | 'superseded' | 'error' | null;
	serverTiming: AgentTimingSummary | null;
}

export type StreamStopReason = 'user_cancelled' | 'superseded' | 'error';

export interface StreamControllerAttachmentDeps {
	buildReadyRefs(includePreviewUrl?: boolean): ChatAttachmentRef[];
	getDraftSnapshot(): AgentChatImageAttachment[];
	clearDraft(): void;
	restoreDraft(snapshot: AgentChatImageAttachment[]): void;
	scheduleMessageOcrPoll(messageId: string, assetId: string, status: unknown): void;
}

export interface StreamControllerVoiceDeps {
	isRecording: boolean;
	isInitializing: boolean;
	isStopping: boolean;
	isTranscribing: boolean;
	pendingSendAfterTranscription: boolean;
	noteGroupId: string | null;
	stop(): Promise<void>;
}

export interface StreamControllerPrewarmDeps {
	resolveCurrentKey(): string | null;
	matchingFreshPreparedPrompt(key: string | null | undefined): PreparedPromptClient | null;
	waitForPreparedPrompt?(
		key: string | null | undefined,
		options?: { timeoutMs?: number }
	): Promise<PreparedPromptClient | null>;
	clearPreparedPrompt(): void;
}

export interface StreamControllerDeps {
	getInputValue(): string;
	getReviewIntent?(): AgenticChatWorkerCommand['reviewIntent'];
	getPublishedSpecialist?(): PublishedSpecialistSelection | null | undefined;
	onReviewAdmitted?(): void;
	setInputValue(value: string): void;
	getSelectedContextType(): ChatContextType | null;
	getSelectedEntityId(): string | undefined;
	getResolvedProjectFocus(): ProjectFocus | null;
	getCurrentSession(): ChatSession | null;
	getLastTurnContext(): LastTurnContext | null;
	getIsLoadingSession(): boolean;
	getActiveRestoredTurnRunId(): string | null;
	getPrewarm(): StreamControllerPrewarmDeps;
	attachments: StreamControllerAttachmentDeps;
	voice: StreamControllerVoiceDeps;
	messages: {
		append(message: UIMessage): void;
		removeById(messageId: string): void;
		/** Copy-on-replace patch of one message (never mutate in place). */
		update?(messageId: string, patch: Partial<UIMessage>): void;
	};
	thinking: {
		create(options?: { renderKey?: string }): string;
		updateState(state: 'thinking' | 'waiting_on_user', details?: string): void;
		finalize(status?: 'completed' | 'interrupted' | 'cancelled' | 'error', note?: string): void;
		/** Remove the current thinking block entirely (turn proven never admitted). */
		discard?(): void;
	};
	assistant: {
		flushText(): void;
		finalizeMessage(): void;
	};
	clearPendingToolState(): void;
	adoptWorkerAdmissionResponse(
		value: unknown
	): AgenticChatWorkerTurnDescriptorV1 | Promise<AgenticChatWorkerTurnDescriptorV1>;
	discoverWorkerSession?(sessionId: string): Promise<unknown>;
	setUserHasScrolled(value: boolean): void;
	setExistingImagePickerOpen(value: boolean): void;
	haptic?(style: 'light' | 'medium' | 'heavy'): void;
	/**
	 * Reconcile one worker turn now. Stop can end a turn whose worker is gone;
	 * no worker will broadcast that terminal, so the UI fetches it at once
	 * instead of waiting for its next reconcile tick.
	 */
	requestWorkerReconciliation?(turnRunId: string): void;
	/** Product telemetry sink for the finished send timeline (PostHog in the modal). */
	captureTurnTiming?(summary: ClientTurnTimingSummary): void;
	fetchImpl?: typeof fetch;
	logError?(message: string, err: unknown): void;
	logDebug?(message: string, data?: unknown): void;
}

export type ClientTurnTimingSummary = ReturnType<typeof summarizeClientStreamTiming>;

function buildClientStreamTimingState(
	runId: number,
	options: { sendStartedAtMs?: number; inlineSession?: boolean } = {}
): ClientStreamTimingState {
	return {
		runId,
		sendStartedAtMs: options.sendStartedAtMs ?? Date.now(),
		admittedAtMs: null,
		inlineSession: options.inlineSession ?? false,
		preparedPromptUsed: false,
		firstEventAtMs: null,
		firstTextAtMs: null,
		lastTextAtMs: null,
		doneEventAtMs: null,
		streamClosedAtMs: null,
		terminalState: null,
		cancelReason: null,
		serverTiming: null
	};
}

/**
 * Rejections that prove the worker never accepted the turn, so the optimistic
 * message may be removed and the draft (text + images) restored. Anything not
 * listed here is treated as possibly-admitted and the draft is preserved as
 * sent, because a duplicate turn is worse than a lost one.
 *
 * `INVALID_FIELD` and `FORBIDDEN` are the two rejections an attachment turn is
 * most likely to hit — request-schema failure and asset access denial — and
 * both are decided before any durable write.
 */
const WORKER_KNOWN_NOT_ADMITTED_CODES = new Set([
	// Decided before any durable write in the admission route: auth, rate
	// limit, and the inline transport decision (conflict / outage).
	'UNAUTHORIZED',
	'SESSION_EXPIRED',
	'AGENTIC_CHAT_RATE_LIMITED',
	'TRANSPORT_CONFLICT',
	'WORKER_UNAVAILABLE',
	'WORKER_CAPABILITY_UNAVAILABLE',
	'WORKER_CAPACITY_EXCEEDED',
	'WORKER_ADMISSION_CONFLICT',
	'INVALID_WORKER_COMMAND',
	'WORKFLOW_REVIEW_UNAVAILABLE',
	'INVALID_FIELD',
	'FORBIDDEN',
	'WORKER_SESSION_CONFLICT'
]);

function diffMs(start: number | null, end: number | null): number | null {
	if (typeof start !== 'number' || typeof end !== 'number') return null;
	return Math.max(0, end - start);
}

function summarizeClientStreamTiming(timing: ClientStreamTimingState) {
	return {
		runId: timing.runId,
		timeToAdmittedMs: diffMs(timing.sendStartedAtMs, timing.admittedAtMs),
		inlineSession: timing.inlineSession,
		preparedPromptUsed: timing.preparedPromptUsed,
		timeToFirstStreamEventMs: diffMs(timing.sendStartedAtMs, timing.firstEventAtMs),
		timeToFirstTextMs: diffMs(timing.sendStartedAtMs, timing.firstTextAtMs),
		timeFromFirstEventToFirstTextMs: diffMs(timing.firstEventAtMs, timing.firstTextAtMs),
		timeFromLastTextToDoneMs: diffMs(timing.lastTextAtMs, timing.doneEventAtMs),
		timeToDoneMs: diffMs(timing.sendStartedAtMs, timing.doneEventAtMs),
		totalStreamMs: diffMs(
			timing.sendStartedAtMs,
			timing.streamClosedAtMs ?? timing.doneEventAtMs
		),
		terminalState: timing.terminalState,
		cancelReason: timing.cancelReason,
		serverTiming: timing.serverTiming
	};
}

export class AgentChatStreamController {
	isStreaming = $state(false);
	isStartingStream = $state(false);
	currentActivity = $state('');
	error = $state<string | null>(null);
	hasSentMessage = $state(false);
	/**
	 * Text the user sent while a turn was still running. It goes out on its own
	 * as soon as the active turn completes or is stopped; a failed turn hands it
	 * back to the composer instead so the user decides.
	 */
	queuedMessage = $state<string | null>(null);
	/** Voice recording attached to the queued follow-up (dictated mid-response). */
	queuedVoiceNoteGroupId: string | null = null;

	// Run-guard tokens and timing telemetry. Deliberately NOT $state: nothing
	// reads them reactively (templates/effects), and they're written in the
	// per-SSE-event hot path where signal overhead adds up.
	activeStreamRunId = 0;
	activeTurnHandle: TurnHandleV1 | null = null;
	lastCancelResult: CancelTurnResultV1 | null = null;
	activeStreamTiming: ClientStreamTimingState | null = null;
	lastCompletedStreamTiming: ClientStreamTimingState | null = null;

	#deps: StreamControllerDeps;
	#fetch: typeof fetch;

	constructor(deps: StreamControllerDeps) {
		this.#deps = deps;
		this.#fetch = deps.fetchImpl ?? fetch;
	}

	adoptWorkerTurn(
		handle: Extract<TurnHandleV1, { executionMode: 'worker_realtime' }>,
		status: ChatTurnStatusV1
	): void {
		const active = this.activeTurnHandle;
		if (
			active &&
			(active.executionMode !== 'worker_realtime' || active.turnRunId !== handle.turnRunId)
		) {
			throw new Error('Cannot replace an active turn with a different worker handle');
		}
		this.activeTurnHandle = handle;
		this.isStartingStream = false;
		this.isStreaming = status === 'queued' || status === 'running';
		this.error = null;
		this.currentActivity = workerActivityForStatus(status);
	}

	updateWorkerTurnState(
		handle: Extract<TurnHandleV1, { executionMode: 'worker_realtime' }>,
		status: ChatTurnStatusV1,
		currentActivity: string
	): void {
		if (!this.#isActiveWorkerHandle(handle)) return;
		this.isStreaming = status === 'queued' || status === 'running';
		const nextActivity = this.isStreaming ? currentActivity : '';
		// A queued turn has no live phases of its own, so its wait message is also
		// the thinking block's status line ("Thinking…" → "Taking longer than
		// usual…"). Only a change is written. A running turn's block belongs to
		// its live semantic events and keeps its text.
		if (status === 'queued' && nextActivity && nextActivity !== this.currentActivity) {
			this.#deps.thinking.updateState('thinking', nextActivity);
		}
		this.currentActivity = nextActivity;
	}

	finishWorkerTurn(
		handle: Extract<TurnHandleV1, { executionMode: 'worker_realtime' }>,
		status: Extract<ChatTurnStatusV1, 'completed' | 'failed' | 'cancelled'>,
		finishedReason: string | null = null,
		failureCode: string | null = null
	): void {
		if (!this.#isActiveWorkerHandle(handle)) return;
		this.finalizeClientStreamTiming(
			this.activeStreamRunId,
			status === 'completed' ? 'completed' : status === 'failed' ? 'error' : 'cancelled'
		);
		this.activeTurnHandle = null;
		this.isStreaming = false;
		this.isStartingStream = false;
		this.currentActivity = '';
		if (status !== 'completed' && failureCode === 'uncertain_external_commit') {
			// A write had started when the turn ended (failed, or stopped by the
			// user), so it may have landed; a blind retry could make it twice.
			this.error =
				'BuildOS stopped partway through a change, so it may already be saved. Check before trying again.';
			this.returnQueuedMessageToComposer();
		} else if (status === 'failed') {
			this.error = 'BuildOS could not finish this response. Please try again.';
			// Don't fire a queued follow-up into a turn that just failed.
			this.returnQueuedMessageToComposer();
		} else if (isWorkerQueueTimeout(status, finishedReason)) {
			// The chat service never picked the turn up; a follow-up would queue
			// behind the same outage, so hand it back to the composer.
			this.returnQueuedMessageToComposer();
		} else if (status !== 'cancelled') {
			this.error = null;
		}
	}

	/** Busy = a send is in flight, a worker turn is running, or a detached turn is restoring. */
	get isTurnBusy(): boolean {
		return (
			this.isStartingStream ||
			this.isStreaming ||
			this.activeTurnHandle !== null ||
			this.#deps.getActiveRestoredTurnRunId() !== null
		);
	}

	/** Send the queued follow-up once the conversation is idle. Safe to call repeatedly. */
	async flushQueuedMessage(): Promise<void> {
		const queued = this.queuedMessage;
		if (!queued || this.isTurnBusy || this.#deps.getIsLoadingSession()) return;
		const voiceNoteGroupId = this.queuedVoiceNoteGroupId;
		this.queuedMessage = null;
		this.queuedVoiceNoteGroupId = null;
		await this.sendMessage(queued, { suppressInputClear: true, voiceNoteGroupId });
	}

	/** Cancel the queued follow-up and put its text back in the composer. */
	returnQueuedMessageToComposer(): void {
		const queued = this.queuedMessage;
		if (!queued) return;
		this.queuedMessage = null;
		if (this.queuedVoiceNoteGroupId && !this.#deps.voice.noteGroupId) {
			this.#deps.voice.noteGroupId = this.queuedVoiceNoteGroupId;
		}
		this.queuedVoiceNoteGroupId = null;
		const draft = this.#deps.getInputValue().trim();
		this.#deps.setInputValue(draft ? `${queued}\n\n${draft}` : queued);
	}

	releaseWorkerTurn(handle: Extract<TurnHandleV1, { executionMode: 'worker_realtime' }>): void {
		if (!this.#isActiveWorkerHandle(handle)) return;
		this.finalizeClientStreamTiming(this.activeStreamRunId, 'aborted');
		this.activeTurnHandle = null;
		this.isStreaming = false;
		this.isStartingStream = false;
		this.currentActivity = '';
	}

	recordClientStreamEvent(
		runId: number,
		eventType: AgentSSEMessage['type'] | 'transport_error'
	): void {
		const timing = this.activeStreamTiming;
		if (!timing || timing.runId !== runId) return;

		// Mutated in place: this runs once per SSE event (incl. every
		// text_delta) and the struct is non-reactive telemetry.
		const now = Date.now();
		if (timing.firstEventAtMs === null) {
			timing.firstEventAtMs = now;
		}
		if (eventType === 'text' || eventType === 'text_delta') {
			timing.firstTextAtMs ??= now;
			timing.lastTextAtMs = now;
		}
		if (eventType === 'done' && timing.doneEventAtMs === null) {
			timing.doneEventAtMs = now;
		}
	}

	attachServerTiming(runId: number, timing: AgentTimingSummary): void {
		const active = this.activeStreamTiming;
		if (!active || active.runId !== runId) return;
		active.serverTiming = timing;
	}

	finalizeClientStreamTiming(
		runId: number,
		terminalState: ClientStreamTimingState['terminalState'],
		cancelReason: ClientStreamTimingState['cancelReason'] = null
	): void {
		if (!this.activeStreamTiming || this.activeStreamTiming.runId !== runId) return;
		const finalized: ClientStreamTimingState = {
			...this.activeStreamTiming,
			streamClosedAtMs: Date.now(),
			terminalState,
			cancelReason
		};
		this.lastCompletedStreamTiming = finalized;
		this.activeStreamTiming = null;
		const summary = summarizeClientStreamTiming(finalized);
		this.#deps.logDebug?.('[AgentChat] Stream timing', summary);
		try {
			this.#deps.captureTurnTiming?.(summary);
		} catch (err) {
			this.#deps.logDebug?.('[AgentChat] Turn timing capture failed', err);
		}
	}

	async handleSendMessage(): Promise<void> {
		this.#deps.haptic?.('medium');

		if (this.#deps.voice.isRecording) {
			this.#deps.voice.pendingSendAfterTranscription = true;
			await this.#deps.voice.stop();
			return;
		}

		await this.sendMessage();
	}

	async handlePendingSendAfterTranscription(
		hasSendableImageAttachments: boolean
	): Promise<boolean> {
		const { voice } = this.#deps;
		if (!voice.pendingSendAfterTranscription) return false;
		if (voice.isRecording || voice.isStopping || voice.isTranscribing || voice.isInitializing) {
			return false;
		}

		if (this.#deps.getInputValue().trim() || hasSendableImageAttachments) {
			voice.pendingSendAfterTranscription = false;
			await this.sendMessage();
			return true;
		}

		voice.pendingSendAfterTranscription = false;
		return false;
	}

	async #resolvePreparedPromptForSend(
		prewarm: StreamControllerPrewarmDeps,
		key: string | null
	): Promise<PreparedPromptClient | null> {
		const prepared = prewarm.matchingFreshPreparedPrompt(key);
		if (prepared || !prewarm.waitForPreparedPrompt) return prepared;
		return (
			(await prewarm.waitForPreparedPrompt(key, {
				timeoutMs: PREPARED_PROMPT_SEND_WAIT_MS
			})) ?? prewarm.matchingFreshPreparedPrompt(key)
		);
	}

	async sendMessage(
		contentOverride?: string,
		options: {
			suppressInputClear?: boolean;
			/** Voice group to attach instead of the composer's (a queued follow-up's own). */
			voiceNoteGroupId?: string | null;
		} = {}
	): Promise<void> {
		const { suppressInputClear = false } = options;
		const sendStartedAtMs = Date.now();
		const trimmed = (contentOverride ?? this.#deps.getInputValue()).trim();
		const streamAttachmentRefs = this.#deps.attachments.buildReadyRefs(false);
		const optimisticAttachmentRefs = this.#deps.attachments.buildReadyRefs(true);
		const sentImageAttachments = this.#deps.attachments.getDraftSnapshot();
		const activeVoiceNoteGroupId =
			options.voiceNoteGroupId !== undefined
				? options.voiceNoteGroupId
				: this.#deps.voice.noteGroupId;
		const selectedSpecialist = this.#deps.getPublishedSpecialist?.();
		// Only an explicit selection (Review / Organize documents, or a host's launched
		// review) makes a review turn; message text never does.
		const reviewIntent = this.#deps.getReviewIntent?.() ?? null;
		const effectiveProjectId = selectedSpecialist
			? resolveEffectiveProjectId({
					contextType: normalizeFastContextType(
						this.#deps.getSelectedContextType() ?? 'global'
					),
					entityId: this.#deps.getSelectedEntityId(),
					projectFocus: this.#deps.getResolvedProjectFocus()
				})
			: null;
		const selectionDecisionId =
			selectedSpecialist?.selectionDecisionId &&
			selectedSpecialist.selectionQuestion === trimmed &&
			selectedSpecialist.selectionProjectId === effectiveProjectId
				? selectedSpecialist.selectionDecisionId
				: undefined;
		// Curated evidence belongs to the question it was found for, like a recommendation.
		const contextPlan =
			selectedSpecialist?.contextPlan &&
			selectedSpecialist.contextPlanQuestion === trimmed &&
			selectedSpecialist.contextPlanProjectId === effectiveProjectId
				? selectedSpecialist.contextPlan
				: undefined;
		// Take a value copy before any await: a picker change must never replace
		// the immutable version chosen for this submission.
		const publishedSpecialist =
			reviewIntent === 'document_organization' && selectedSpecialist
				? {
						draftId: selectedSpecialist.draftId,
						version: selectedSpecialist.version,
						snapshotHash: selectedSpecialist.snapshotHash,
						...(selectionDecisionId ? { selectionDecisionId } : {}),
						// Plain JSON copy: the plan may arrive as a reactive proxy.
						...(contextPlan
							? { contextPlan: JSON.parse(JSON.stringify(contextPlan)) }
							: {})
					}
				: null;
		if (
			(!trimmed && streamAttachmentRefs.length === 0) ||
			this.#deps.voice.isInitializing ||
			this.#deps.voice.isStopping ||
			this.#deps.voice.isTranscribing
		) {
			return;
		}
		if (sentImageAttachments.length > streamAttachmentRefs.length) {
			this.error =
				'Wait for image upload and OCR queueing to finish, or remove failed images.';
			return;
		}
		const selectedContextType = this.#deps.getSelectedContextType();
		if (!selectedContextType) {
			this.error = 'Select a focus before starting the conversation.';
			return;
		}
		if (this.#deps.getIsLoadingSession()) {
			this.error = 'Wait for the existing session to finish loading.';
			return;
		}
		if (this.isTurnBusy) {
			// A text or dictated follow-up waits its turn instead of being refused;
			// it sends on its own the moment the active response finishes.
			if (!trimmed || reviewIntent || streamAttachmentRefs.length > 0) {
				this.error = 'BuildOS is still finishing the latest response.';
				return;
			}
			this.queuedMessage = this.queuedMessage
				? `${this.queuedMessage}\n\n${trimmed}`
				: trimmed;
			if (activeVoiceNoteGroupId) {
				// One recording group rides with the queued message; a second
				// recording's text still queues, its audio stays in Voice notes.
				this.queuedVoiceNoteGroupId ??= activeVoiceNoteGroupId;
				if (this.#deps.voice.noteGroupId === activeVoiceNoteGroupId) {
					this.#deps.voice.noteGroupId = null;
				}
			}
			if (!suppressInputClear) this.#deps.setInputValue('');
			this.error = null;
			this.#deps.haptic?.('light');
			return;
		}
		if (
			reviewIntent &&
			(selectedContextType !== 'project' ||
				(this.#deps.getResolvedProjectFocus()?.focusType ?? 'project-wide') !==
					'project-wide' ||
				sentImageAttachments.length > 0 ||
				activeVoiceNoteGroupId ||
				this.#deps.voice.isRecording)
		) {
			this.error =
				reviewIntent === 'document_organization'
					? 'Document organization needs project-wide focus and a text-only message.'
					: 'Project review needs project-wide focus and a text-only message.';
			return;
		}

		// Everything the user sees on Send happens here, synchronously, before any
		// network work: the bubble lands, the composer clears, and the thinking
		// block starts. Admission then runs behind it; a turn the server proves it
		// never accepted is rolled back below (bubble removed, draft restored).
		this.isStartingStream = true;
		const requestContextType = selectedContextType;
		const requestEntityId = this.#deps.getSelectedEntityId();
		const requestProjectFocus = this.#deps.getResolvedProjectFocus();
		const sessionAtSend = this.#deps.getCurrentSession();
		const clientTurnId = crypto.randomUUID();
		const transportStreamRunId = crypto.randomUUID();
		const sentAt = new Date(sendStartedAtMs);
		const userMessage: UIMessage = {
			id: crypto.randomUUID(),
			renderKey: `turn:${clientTurnId}:user`,
			delivery: 'sending',
			session_id: sessionAtSend?.id,
			user_id: undefined,
			type: 'user',
			role: 'user' as ChatRole,
			content:
				trimmed ||
				(streamAttachmentRefs.length === 1
					? 'Attached 1 image'
					: `Attached ${streamAttachmentRefs.length} images`),
			timestamp: sentAt,
			created_at: sentAt.toISOString(),
			attachments: optimisticAttachmentRefs.length > 0 ? optimisticAttachmentRefs : undefined,
			metadata: {
				...(activeVoiceNoteGroupId ? { voice_note_group_id: activeVoiceNoteGroupId } : {}),
				...(optimisticAttachmentRefs.length > 0
					? {
							attachment_count: optimisticAttachmentRefs.length,
							attachment_only: !trimmed,
							attachments: optimisticAttachmentRefs
						}
					: {}),
				client_turn_id: clientTurnId,
				stream_run_id: transportStreamRunId
			}
		};
		this.#deps.messages.append(userMessage);
		for (const attachment of optimisticAttachmentRefs) {
			if (attachment.asset_id) {
				this.#deps.attachments.scheduleMessageOcrPoll(
					userMessage.id,
					attachment.asset_id,
					attachment.ocr_status ?? 'pending'
				);
			}
		}
		this.hasSentMessage = true;
		if (!suppressInputClear) {
			this.#deps.setInputValue('');
			this.#deps.attachments.clearDraft();
			this.#deps.setExistingImagePickerOpen(false);
		}
		if (activeVoiceNoteGroupId && this.#deps.voice.noteGroupId === activeVoiceNoteGroupId) {
			this.#deps.voice.noteGroupId = null;
		}
		this.error = null;
		this.lastCancelResult = null;
		this.isStreaming = false;
		// Client-side turn telemetry runs on the worker lane too: the modal's
		// realtime projection feeds recordClientStreamEvent/attachServerTiming
		// against this run id, and finishWorkerTurn closes it out.
		this.activeStreamRunId = this.activeStreamRunId + 1;
		const runId = this.activeStreamRunId;
		this.activeStreamTiming = buildClientStreamTimingState(runId, {
			sendStartedAtMs,
			inlineSession: !sessionAtSend?.id
		});
		this.#deps.clearPendingToolState();
		this.#deps.thinking.create({ renderKey: `turn:${clientTurnId}:thinking` });
		this.currentActivity = 'Sending…';
		this.#deps.thinking.updateState('thinking', 'Thinking…');
		this.#deps.setUserHasScrolled(false);

		let workerAdmissionAttempted = false;
		let workerAdmissionSessionId: string | null = null;
		try {
			// Prepared prompts are session-bound. A new chat's first turn has no
			// session yet — admission creates it inline in the same request — so
			// there is nothing to wait for or reuse.
			const prewarm = this.#deps.getPrewarm();
			const matchingPreparedPrompt =
				reviewIntent || !sessionAtSend?.id
					? null
					: await this.#resolvePreparedPromptForSend(
							prewarm,
							prewarm.resolveCurrentKey()
						);
			prewarm.clearPreparedPrompt();
			if (this.activeStreamTiming?.runId === runId) {
				this.activeStreamTiming.preparedPromptUsed = matchingPreparedPrompt !== null;
			}

			const normalizedContextType = normalizeFastContextType(requestContextType);
			workerAdmissionAttempted = true;
			workerAdmissionSessionId = sessionAtSend?.id ?? null;
			// One request per turn: the server resolves the transport decision
			// inline, so there is no separate lease round trip.
			const admission = await requestAgenticChatWorkerAdmission({
				fetchImpl: this.#fetch,
				command: {
					clientTurnId,
					streamRunId: transportStreamRunId,
					sessionId: sessionAtSend?.id ?? null,
					context: {
						type: normalizedContextType,
						entityId: resolveEffectiveEntityId({
							contextType: normalizedContextType,
							entityId: requestEntityId,
							projectFocus: requestProjectFocus
						}),
						projectId: resolveEffectiveProjectId({
							contextType: normalizedContextType,
							entityId: requestEntityId,
							projectFocus: requestProjectFocus
						})
					},
					message: trimmed,
					attachments: streamAttachmentRefs,
					projectFocus: requestProjectFocus,
					lastTurnContext: this.#deps.getLastTurnContext(),
					voiceNoteGroupId: activeVoiceNoteGroupId,
					preparedPromptKey: matchingPreparedPrompt?.key ?? null,
					reviewIntent,
					publishedSpecialist
				}
			});

			if (!admission.response.ok) {
				const admissionError = await buildAgentRequestError(
					admission.response,
					'Unable to start this response. BuildOS is checking its status.'
				);
				if (
					admissionError.code &&
					WORKER_KNOWN_NOT_ADMITTED_CODES.has(admissionError.code)
				) {
					workerAdmissionAttempted = false;
					workerAdmissionSessionId = null;
				}
				throw admissionError;
			}

			const { descriptor } = parseAdmissionResponse(admission.payload);
			if (
				descriptor.handle.clientTurnId !== clientTurnId ||
				descriptor.handle.streamRunId !== transportStreamRunId
			) {
				throw new Error('Worker admission did not return the negotiated turn handle');
			}
			workerAdmissionSessionId = descriptor.handle.sessionId;
			if (this.activeStreamTiming?.runId === runId) {
				this.activeStreamTiming.admittedAtMs = Date.now();
			}
			this.#deps.messages.update?.(userMessage.id, {
				delivery: 'sent',
				session_id: descriptor.handle.sessionId
			});
			await this.#deps.adoptWorkerAdmissionResponse(admission.payload);
			if (reviewIntent) this.#deps.onReviewAdmitted?.();
		} catch (err) {
			if ((err as DOMException)?.name === 'AbortError') return;

			this.#deps.logError?.('Failed to send message:', err);
			this.error =
				err instanceof AgentRequestError
					? err.message
					: 'Failed to send message. Please try again.';
			if (reviewIntent && workerAdmissionAttempted && !this.#deps.getCurrentSession()) {
				this.error =
					'The review may have started. Reopen it from chat history before sending again.';
			}
			this.isStreaming = false;
			this.currentActivity = '';
			this.activeTurnHandle = null;
			this.#deps.assistant.flushText();
			this.#deps.assistant.finalizeMessage();
			this.finalizeClientStreamTiming(runId, 'error');

			if (workerAdmissionAttempted) {
				// Possibly admitted: keep the bubble (a duplicate turn is worse than
				// a lost one) and let discovery adopt the turn if it exists.
				this.#deps.thinking.finalize('error');
				this.#deps.messages.update?.(userMessage.id, { delivery: 'sent' });
				if (workerAdmissionSessionId) {
					void this.#deps
						.discoverWorkerSession?.(workerAdmissionSessionId)
						.catch((discoveryError) => {
							this.#deps.logDebug?.(
								'[AgentChat] Worker admission recovery discovery failed',
								discoveryError
							);
						});
				}
			} else {
				// Proven never admitted: undo the optimistic turn and hand the draft
				// back, without clobbering anything typed since.
				if (err instanceof AgentRequestError && (err.status === 429 || err.status >= 500)) {
					this.error =
						"Couldn't send that just now. Your message is back in the box — try again in a moment.";
				}
				if (this.#deps.thinking.discard) this.#deps.thinking.discard();
				else this.#deps.thinking.finalize('error');
				this.#deps.messages.removeById(userMessage.id);
				if (!suppressInputClear && !this.#deps.getInputValue().trim()) {
					this.#deps.setInputValue(trimmed);
				}
				if (
					!suppressInputClear &&
					sentImageAttachments.length > 0 &&
					this.#deps.attachments.getDraftSnapshot().length === 0
				) {
					this.#deps.attachments.restoreDraft(sentImageAttachments);
				}
				if (suppressInputClear && contentOverride && !this.#deps.getInputValue().trim()) {
					// A queued/programmatic follow-up that never landed goes back to
					// the composer rather than vanishing.
					this.#deps.setInputValue(trimmed);
				}
			}
		} finally {
			this.isStartingStream = false;
		}
	}

	/**
	 * Stop. One engine since one-engine stage S8: the durable worker
	 * cancellation signal carries both the turn identity and the reason, so
	 * there is no second hint channel to write.
	 */
	async cancelTurn(
		handle: TurnHandleV1,
		reason: 'user_cancelled' | 'superseded'
	): Promise<CancelTurnResultV1> {
		const response = await this.#fetch(
			`/api/agent/v2/turns/${encodeURIComponent(handle.turnRunId)}/cancel`,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json'
				},
				credentials: 'same-origin',
				cache: 'no-store',
				body: JSON.stringify({ reason })
			}
		);
		if (!response.ok) {
			throw await buildAgentRequestError(response, 'Unable to stop this response right now.');
		}
		return parseWorkerCancelResponse(await response.json());
	}

	async stopGeneration(reason: StreamStopReason = 'user_cancelled'): Promise<void> {
		if (!this.isStreaming) return;
		const handle = this.activeTurnHandle;
		if (!handle) return;
		if (reason === 'error') return;
		if (reason === 'user_cancelled') this.#deps.haptic?.('heavy');
		try {
			this.currentActivity = 'Stopping response...';
			this.lastCancelResult = await this.cancelTurn(handle, reason);
			// The turn already ended (a queued turn, or one whose worker is gone):
			// show that terminal now rather than "Stopping response..." until the
			// next reconcile tick.
			if (this.lastCancelResult.outcome !== 'cancel_requested') {
				this.#deps.requestWorkerReconciliation?.(handle.turnRunId);
			}
		} catch (error) {
			this.#deps.logError?.('[AgentChat] Worker cancellation failed:', error);
			this.error =
				error instanceof Error ? error.message : 'Unable to stop this response right now.';
			this.currentActivity = workerActivityForStatus('running');
		}
	}

	reset(): void {
		this.activeStreamRunId = this.activeStreamRunId + 1;
		this.activeTurnHandle = null;
		this.isStreaming = false;
		this.isStartingStream = false;
		this.currentActivity = '';
		this.error = null;
		this.activeStreamTiming = null;
		this.lastCompletedStreamTiming = null;
		this.lastCancelResult = null;
		this.queuedMessage = null;
		this.queuedVoiceNoteGroupId = null;
	}

	#isActiveWorkerHandle(
		handle: Extract<TurnHandleV1, { executionMode: 'worker_realtime' }>
	): boolean {
		const active = this.activeTurnHandle;
		return (
			active?.executionMode === 'worker_realtime' &&
			active.turnRunId === handle.turnRunId &&
			active.sessionId === handle.sessionId &&
			active.streamRunId === handle.streamRunId &&
			active.clientTurnId === handle.clientTurnId
		);
	}
}

function parseWorkerCancelResponse(value: unknown): CancelTurnResultV1 {
	if (!isRecord(value) || value.success !== true || !isRecord(value.data)) {
		throw new Error('Worker cancellation returned an invalid response');
	}
	const result = value.data;
	if (result.outcome === 'cancel_requested') return { outcome: 'cancel_requested' };
	if (
		result.outcome === 'cancelled' &&
		result.status === 'cancelled' &&
		canonicalText(result.terminalEventId)
	) {
		return {
			outcome: 'cancelled',
			status: 'cancelled',
			terminalEventId: result.terminalEventId
		};
	}
	if (
		result.outcome === 'already_terminal' &&
		(result.status === 'completed' ||
			result.status === 'failed' ||
			result.status === 'cancelled') &&
		canonicalText(result.terminalEventId)
	) {
		return {
			outcome: 'already_terminal',
			status: result.status,
			terminalEventId: result.terminalEventId
		};
	}
	throw new Error('Worker cancellation returned an invalid receipt');
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function canonicalText(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0 && value === value.trim();
}

export function createAgentChatStreamController(
	deps: StreamControllerDeps
): AgentChatStreamController {
	return new AgentChatStreamController(deps);
}
