// apps/web/src/lib/components/agent/agent-chat-stream-controller.svelte.ts
//
// Owns the client-side send / receive / cancel lifecycle for AgentChatModal.
// The modal still owns rendering and concrete message/thinking mutations; this
// controller coordinates stream state, transport, stale-run guards, and cleanup.

import type {
	AgentSSEMessage,
	AgentTimingSummary,
	ChatAttachmentRef,
	ChatContextType,
	ChatRole,
	ChatSession
} from '@buildos/shared-types';
import type { LastTurnContext, ProjectFocus } from '$lib/types/agent-chat-enhancement';
import { buildFastAgentStreamRequestBody } from '$lib/services/agentic-chat-v2/stream-request-client';
import { AgentStreamEventGuard } from '$lib/services/agentic-chat-v2/stream-protocol';
import {
	SSEProcessor,
	type StreamCallbacks,
	type SSEProcessorOptions
} from '$lib/utils/sse-processor';
import { AgentRequestError, buildAgentRequestError } from './agent-chat-session';
import type { PreparedPromptClient } from './agent-chat-session';
import { PREPARED_PROMPT_SEND_WAIT_MS } from './agent-chat.constants';
import type { AgentChatImageAttachment, UIMessage } from './agent-chat.types';

export interface SessionBootstrapTarget {
	contextType: ChatContextType;
	entityId?: string;
	projectFocus?: ProjectFocus | null;
}

export interface ClientStreamTimingState {
	runId: number;
	sendStartedAtMs: number;
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
export type StreamTurnReconcileReason = 'transport_error' | 'detached';

export interface StreamTurnReconcileRequest {
	sessionId: string;
	streamRunId: string;
	clientTurnId: string | null;
	reason: StreamTurnReconcileReason;
}

export interface StreamProcessorLike {
	processStream(
		response: Response,
		callbacks: StreamCallbacks,
		options?: SSEProcessorOptions
	): Promise<void>;
}

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
	setInputValue(value: string): void;
	getSelectedContextType(): ChatContextType | null;
	getSelectedEntityId(): string | undefined;
	getResolvedProjectFocus(): ProjectFocus | null;
	getCurrentSession(): ChatSession | null;
	ensureSessionReady(target: SessionBootstrapTarget): Promise<ChatSession | null>;
	getLastTurnContext(): LastTurnContext | null;
	getIsLoadingSession(): boolean;
	getActiveRestoredTurnRunId(): string | null;
	getPrewarm(): StreamControllerPrewarmDeps;
	attachments: StreamControllerAttachmentDeps;
	voice: StreamControllerVoiceDeps;
	messages: {
		append(message: UIMessage): void;
		removeById(messageId: string): void;
	};
	thinking: {
		create(): string;
		updateState(state: 'thinking' | 'waiting_on_user', details?: string): void;
		finalize(status?: 'completed' | 'interrupted' | 'cancelled' | 'error', note?: string): void;
	};
	assistant: {
		flushText(): void;
		finalizeMessage(): void;
		markInterrupted(reason: StreamStopReason, streamRunId: string | null): void;
	};
	clearPendingToolState(): void;
	handleSSEMessage(event: AgentSSEMessage): void;
	hydrateSessionFromEvent(session: ChatSession): void;
	reconcileTurnFromSession?(request: StreamTurnReconcileRequest): void | Promise<void>;
	setUserHasScrolled(value: boolean): void;
	setExistingImagePickerOpen(value: boolean): void;
	haptic?(style: 'light' | 'medium' | 'heavy'): void;
	fetchImpl?: typeof fetch;
	streamProcessor?: StreamProcessorLike;
	logError?(message: string, err: unknown): void;
	logDebug?(message: string, data?: unknown): void;
}

function buildSessionBootstrapTarget(
	contextType: ChatContextType,
	entityId?: string,
	projectFocusOverride?: ProjectFocus | null
): SessionBootstrapTarget {
	return {
		contextType,
		entityId: entityId ?? projectFocusOverride?.projectId ?? undefined,
		projectFocus: projectFocusOverride ?? null
	};
}

function buildClientStreamTimingState(runId: number): ClientStreamTimingState {
	return {
		runId,
		sendStartedAtMs: Date.now(),
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

// Inactivity guard for the SSE transport. The server heartbeats every 12s
// (SSE comments — the processor counts raw chunk bytes as activity), so a
// 45s gap means the connection is dead; the timeout error routes into the
// standard turn-reconciliation path instead of an infinite spinner.
const STREAM_INACTIVITY_TIMEOUT_MS = 45_000;

// Event types that prove the server started the turn proper (they are only
// emitted after turn admission + user-message persistence). The initial
// The acknowledgement `turn_phase` and `session` events can fire BEFORE the
// deny checks, so turn_phase intentionally does not count. Used as a SAFETY
// CHECK on the deny-rollback in sendMessage's
// onComplete — the rollback trigger itself is the server's explicit
// `turn_rejected` flag on the error event.
const TURN_EVIDENCE_EVENT_TYPES = new Set<string>([
	'context_usage',
	'text',
	'text_delta',
	'tool_call',
	'tool_result',
	'context_shift',
	'last_turn_context',
	'skill_activity',
	'operation'
]);

function diffMs(start: number | null, end: number | null): number | null {
	if (typeof start !== 'number' || typeof end !== 'number') return null;
	return Math.max(0, end - start);
}

function summarizeClientStreamTiming(timing: ClientStreamTimingState) {
	return {
		runId: timing.runId,
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

	// Run-guard tokens and timing telemetry. Deliberately NOT $state: nothing
	// reads them reactively (templates/effects), and they're written in the
	// per-SSE-event hot path where signal overhead adds up.
	activeStreamRunId = 0;
	activeTransportStreamRunId: string | null = null;
	activeClientTurnId: string | null = null;
	activeStreamTiming: ClientStreamTimingState | null = null;
	lastCompletedStreamTiming: ClientStreamTimingState | null = null;

	#currentStreamController: AbortController | null = null;
	#deps: StreamControllerDeps;
	#fetch: typeof fetch;
	#streamProcessor: StreamProcessorLike;
	#streamEventGuard = new AgentStreamEventGuard();

	constructor(deps: StreamControllerDeps) {
		this.#deps = deps;
		this.#fetch = deps.fetchImpl ?? fetch;
		this.#streamProcessor = deps.streamProcessor ?? SSEProcessor;
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

	#clearStreamEventOrderingState(): void {
		this.#streamEventGuard.reset();
	}

	#shouldAcceptStreamEvent(event: AgentSSEMessage): boolean {
		const decision = this.#streamEventGuard.inspect(event, {
			streamRunId: this.activeTransportStreamRunId,
			clientTurnId: this.activeClientTurnId
		});
		if (decision.accepted) return true;
		this.#deps.logDebug?.('[AgentChat] Dropping rejected stream event', {
			type: event.type,
			reason: decision.reason,
			eventKey: decision.eventKey,
			eventStreamRunId: decision.eventStreamRunId,
			activeStreamRunId: this.activeTransportStreamRunId,
			eventClientTurnId: decision.eventClientTurnId,
			activeClientTurnId: this.activeClientTurnId
		});
		return false;
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
		this.#deps.logDebug?.('[AgentChat] Stream timing', summarizeClientStreamTiming(finalized));
	}

	buildTurnReconcileRequest(
		reason: StreamTurnReconcileReason
	): StreamTurnReconcileRequest | null {
		const sessionId = this.#deps.getCurrentSession()?.id;
		const streamRunId = this.activeTransportStreamRunId;
		if (!sessionId || !streamRunId) return null;
		return {
			sessionId,
			streamRunId,
			clientTurnId: this.activeClientTurnId,
			reason
		};
	}

	startTurnReconciliation(
		runId: number,
		request: StreamTurnReconcileRequest,
		timingState: ClientStreamTimingState['terminalState'],
		cancelReason: ClientStreamTimingState['cancelReason'] = null
	): boolean {
		const reconcile = this.#deps.reconcileTurnFromSession;
		if (!reconcile) return false;

		this.error = null;
		this.isStreaming = false;
		this.currentActivity = 'Restoring latest response...';
		this.#currentStreamController = null;
		this.activeTransportStreamRunId = null;
		this.activeClientTurnId = null;
		this.#clearStreamEventOrderingState();
		this.#deps.thinking.finalize('interrupted', 'Restoring latest response');
		this.#deps.assistant.flushText();
		this.#deps.assistant.finalizeMessage();
		this.finalizeClientStreamTiming(runId, timingState, cancelReason);
		this.activeStreamRunId = this.activeStreamRunId + 1;

		Promise.resolve(reconcile(request)).catch((err) => {
			this.#deps.logError?.('[AgentChat] Failed to reconcile detached turn:', err);
			this.error = 'Connection lost before the latest response could be restored.';
			this.currentActivity = '';
		});

		return true;
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
		options: { senderType?: 'user' | 'agent_peer'; suppressInputClear?: boolean } = {}
	): Promise<void> {
		const { senderType = 'user', suppressInputClear = false } = options;
		const trimmed = (contentOverride ?? this.#deps.getInputValue()).trim();
		const streamAttachmentRefs =
			senderType === 'user' ? this.#deps.attachments.buildReadyRefs(false) : [];
		const optimisticAttachmentRefs =
			senderType === 'user' ? this.#deps.attachments.buildReadyRefs(true) : [];
		const sentImageAttachments = this.#deps.attachments.getDraftSnapshot();
		const activeVoiceNoteGroupId = this.#deps.voice.noteGroupId;
		if (
			(!trimmed && streamAttachmentRefs.length === 0) ||
			this.#deps.voice.isInitializing ||
			this.#deps.voice.isStopping ||
			this.#deps.voice.isTranscribing
		) {
			return;
		}
		if (senderType === 'user' && sentImageAttachments.length > streamAttachmentRefs.length) {
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
		if (this.#deps.getActiveRestoredTurnRunId()) {
			this.error = 'BuildOS is still finishing the latest response.';
			return;
		}
		if (this.isStartingStream) return;

		this.isStartingStream = true;
		let userMessage: UIMessage | null = null;
		let runId: number | null = null;
		let streamController: AbortController | null = null;
		let responseAccepted = false;

		try {
			if (this.isStreaming) {
				await this.stopGeneration('superseded', { awaitCancelHint: true });
			}

			const requestContextType = selectedContextType;
			const requestEntityId = this.#deps.getSelectedEntityId();
			const requestProjectFocus = this.#deps.getResolvedProjectFocus();
			const prewarm = this.#deps.getPrewarm();
			const currentPrewarmKey = prewarm.resolveCurrentKey();
			let matchingPreparedPrompt = await this.#resolvePreparedPromptForSend(
				prewarm,
				currentPrewarmKey
			);
			let sessionForTurn = this.#deps.getCurrentSession();
			const canUseStreamCreatedSession =
				senderType === 'user' && Boolean(matchingPreparedPrompt);

			if (!sessionForTurn?.id && !canUseStreamCreatedSession) {
				try {
					sessionForTurn = await this.#deps.ensureSessionReady(
						buildSessionBootstrapTarget(
							requestContextType,
							requestEntityId,
							requestProjectFocus
						)
					);
				} catch (sessionError) {
					if ((sessionError as DOMException)?.name === 'AbortError') {
						return;
					}
					this.error =
						sessionError instanceof Error
							? sessionError.message
							: 'Unable to prepare a chat session right now.';
					return;
				}

				matchingPreparedPrompt = await this.#resolvePreparedPromptForSend(
					prewarm,
					currentPrewarmKey
				);
			}

			if (!sessionForTurn?.id && !matchingPreparedPrompt) {
				this.error = 'Unable to prepare a chat session right now.';
				return;
			}

			const now = new Date();
			const clientTurnId = crypto.randomUUID();
			const transportStreamRunId = crypto.randomUUID();

			userMessage = {
				id: crypto.randomUUID(),
				session_id: sessionForTurn?.id,
				user_id: undefined,
				type: senderType as UIMessage['type'],
				role: 'user' as ChatRole,
				content:
					trimmed ||
					(streamAttachmentRefs.length === 1
						? 'Attached 1 image'
						: `Attached ${streamAttachmentRefs.length} images`),
				timestamp: now,
				created_at: now.toISOString(),
				attachments:
					optimisticAttachmentRefs.length > 0 ? optimisticAttachmentRefs : undefined,
				metadata: {
					...(activeVoiceNoteGroupId
						? { voice_note_group_id: activeVoiceNoteGroupId }
						: {}),
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
			if (activeVoiceNoteGroupId) {
				this.#deps.voice.noteGroupId = null;
			}
			this.error = null;

			this.activeStreamRunId = this.activeStreamRunId + 1;
			runId = this.activeStreamRunId;
			this.activeTransportStreamRunId = transportStreamRunId;
			this.activeClientTurnId = clientTurnId;
			this.#clearStreamEventOrderingState();
			this.activeStreamTiming = buildClientStreamTimingState(runId);

			this.isStreaming = true;
			this.#deps.clearPendingToolState();
			this.#deps.thinking.create();

			this.currentActivity = 'Analyzing request...';
			this.#deps.thinking.updateState('thinking', 'BuildOS is processing your request...');

			this.#deps.setUserHasScrolled(false);

			let receivedStreamEvent = false;
			let receivedTerminalEvent = false;

			streamController = new AbortController();
			this.#currentStreamController = streamController;
			this.isStartingStream = false;
			prewarm.clearPreparedPrompt();

			const response = await this.#fetch('/api/agent/v2/stream', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				signal: streamController.signal,
				body: JSON.stringify(
					buildFastAgentStreamRequestBody({
						message: trimmed,
						sessionId: sessionForTurn?.id,
						contextType: requestContextType,
						entityId: requestEntityId,
						attachments: streamAttachmentRefs,
						projectFocus: requestProjectFocus,
						lastTurnContext: this.#deps.getLastTurnContext(),
						streamRunId: transportStreamRunId,
						clientTurnId,
						voiceNoteGroupId: activeVoiceNoteGroupId,
						preparedPromptKey: matchingPreparedPrompt?.key
					})
				)
			});

			if (!response.ok) {
				throw await buildAgentRequestError(
					response,
					'Failed to send message. Please try again.'
				);
			}
			responseAccepted = true;
			let receivedTurnEvidence = false;
			let turnRejectedByServer = false;

			const callbacks: StreamCallbacks = {
				onProgress: (data: any) => {
					if (runId !== this.activeStreamRunId) {
						if (
							!this.#deps.getCurrentSession()?.id &&
							data?.type === 'session' &&
							data?.session
						) {
							this.#deps.hydrateSessionFromEvent(data.session as ChatSession);
						}
						return;
					}
					const event = data as AgentSSEMessage;
					if (!this.#shouldAcceptStreamEvent(event)) return;
					receivedStreamEvent = true;
					if (event?.type === 'done') receivedTerminalEvent = true;
					if (event?.type && TURN_EVIDENCE_EVENT_TYPES.has(event.type)) {
						receivedTurnEvidence = true;
					}
					if (
						event?.type === 'error' &&
						(event as { turn_rejected?: boolean }).turn_rejected === true
					) {
						turnRejectedByServer = true;
					}
					this.recordClientStreamEvent(
						runId,
						(event?.type as AgentSSEMessage['type']) ?? 'text'
					);
					this.#deps.handleSSEMessage(event);
				},
				onError: (err) => {
					if (runId !== this.activeStreamRunId) return;
					this.recordClientStreamEvent(runId, 'transport_error');
					this.#deps.logError?.('SSE error:', err);
					const reconcileRequest = this.buildTurnReconcileRequest('transport_error');
					if (
						reconcileRequest &&
						this.startTurnReconciliation(runId, reconcileRequest, 'error', 'error')
					) {
						return;
					}
					this.error =
						typeof err === 'string' ? err : 'Connection error occurred while streaming';
					this.isStreaming = false;
					this.currentActivity = '';
					this.#currentStreamController = null;
					this.activeTransportStreamRunId = null;
					this.activeClientTurnId = null;
					this.#clearStreamEventOrderingState();
					this.#deps.thinking.finalize('error');
					this.#deps.assistant.flushText();
					this.#deps.assistant.finalizeMessage();
					this.finalizeClientStreamTiming(runId, 'error', 'error');
				},
				onComplete: () => {
					if (runId !== this.activeStreamRunId) return;
					if (!receivedTerminalEvent) {
						const reconcileRequest = this.buildTurnReconcileRequest('transport_error');
						if (
							reconcileRequest &&
							this.startTurnReconciliation(runId, reconcileRequest, 'error', 'error')
						) {
							return;
						}
						this.error = 'The response ended before completion. Please try again.';
					}
					this.isStreaming = false;
					this.currentActivity = '';
					this.#currentStreamController = null;
					this.activeClientTurnId = null;
					if (!receivedStreamEvent && !this.error) {
						this.error = 'BuildOS did not return a response. Please try again.';
					}
					this.activeTransportStreamRunId = null;
					this.#clearStreamEventOrderingState();
					const terminalState = this.error ? 'error' : 'completed';
					this.#deps.thinking.finalize(terminalState);
					this.#deps.assistant.flushText();
					this.#deps.assistant.finalizeMessage();
					this.finalizeClientStreamTiming(runId, terminalState);

					// Denied turn: the server explicitly rejected it before the
					// user message persisted (`turn_rejected` on the error
					// event), so the optimistic bubble would silently vanish on
					// the next snapshot reload. Roll it back and restore the
					// draft. The evidence check is a safety net: never roll
					// back a turn that demonstrably did real work.
					if (turnRejectedByServer && !receivedTurnEvidence && userMessage) {
						this.#deps.messages.removeById(userMessage.id);
						if (!this.#deps.getInputValue().trim()) {
							this.#deps.setInputValue(trimmed);
						}
						if (!suppressInputClear && sentImageAttachments.length > 0) {
							this.#deps.attachments.restoreDraft(sentImageAttachments);
						}
					}
				}
			};

			await this.#streamProcessor.processStream(response, callbacks, {
				timeout: STREAM_INACTIVITY_TIMEOUT_MS,
				parseJSON: true,
				treatErrorEventsAsProgress: true,
				signal: streamController.signal
			});
		} catch (err) {
			this.#currentStreamController = null;
			if ((err as DOMException)?.name === 'AbortError') {
				if (runId === null || runId !== this.activeStreamRunId) {
					return;
				}
				this.isStreaming = false;
				this.currentActivity = '';
				this.activeTransportStreamRunId = null;
				this.activeClientTurnId = null;
				this.#clearStreamEventOrderingState();
				this.#deps.thinking.finalize('interrupted', 'Stopped');
				this.#deps.assistant.flushText();
				this.#deps.assistant.finalizeMessage();
				this.finalizeClientStreamTiming(runId, 'aborted');
				return;
			}
			if (runId !== null && runId !== this.activeStreamRunId) {
				return;
			}

			this.#deps.logError?.('Failed to send message:', err);
			const reconcileRequest =
				responseAccepted && runId !== null
					? this.buildTurnReconcileRequest('transport_error')
					: null;
			if (
				reconcileRequest &&
				this.startTurnReconciliation(runId!, reconcileRequest, 'error', 'error')
			) {
				return;
			}

			this.error =
				err instanceof AgentRequestError
					? err.message
					: 'Failed to send message. Please try again.';
			this.isStreaming = false;
			this.currentActivity = '';
			this.activeTransportStreamRunId = null;
			this.activeClientTurnId = null;
			this.#clearStreamEventOrderingState();
			this.#deps.thinking.finalize('error');
			this.#deps.assistant.flushText();
			this.#deps.assistant.finalizeMessage();
			if (runId !== null) {
				this.finalizeClientStreamTiming(runId, 'error', 'error');
			}

			const failedUserMessageId = userMessage?.id;
			if (failedUserMessageId) {
				this.#deps.messages.removeById(failedUserMessageId);
			}
			// Restore the failed draft, but never clobber text the user typed
			// while the request was in flight.
			if (!this.#deps.getInputValue().trim()) {
				this.#deps.setInputValue(trimmed);
			}
			if (!suppressInputClear && sentImageAttachments.length > 0) {
				this.#deps.attachments.restoreDraft(sentImageAttachments);
			}
		} finally {
			this.isStartingStream = false;
			if (this.#currentStreamController === streamController) {
				this.#currentStreamController = null;
			}
		}
	}

	async reportStreamCancellationReason(
		reason: 'user_cancelled' | 'superseded',
		streamRunId: string,
		options: { awaitAck?: boolean } = {}
	): Promise<void> {
		const payload = {
			session_id: this.#deps.getCurrentSession()?.id,
			stream_run_id: streamRunId,
			client_turn_id: this.activeClientTurnId ?? undefined,
			reason
		};
		const request = this.#fetch('/api/agent/v2/stream/cancel', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			keepalive: true,
			body: JSON.stringify(payload)
		}).catch((cancelError) => {
			this.#deps.logDebug?.(
				'[AgentChat] Failed to report stream cancellation reason',
				cancelError
			);
		});

		if (!options.awaitAck) {
			void request;
			return;
		}

		await Promise.race([
			request,
			new Promise<void>((resolve) => {
				setTimeout(resolve, 120);
			})
		]);
	}

	detachActiveStream(options: { reconcile?: boolean } = {}): void {
		if (!this.#currentStreamController) return;

		const runId = this.activeStreamRunId;
		const streamController = this.#currentStreamController;
		const reconcileRequest =
			options.reconcile === false ? null : this.buildTurnReconcileRequest('detached');

		this.#deps.assistant.flushText();
		this.finalizeClientStreamTiming(runId, 'aborted');
		this.activeStreamRunId = this.activeStreamRunId + 1;
		this.activeTransportStreamRunId = null;
		this.activeClientTurnId = null;
		this.#clearStreamEventOrderingState();

		try {
			streamController.abort();
		} catch (abortError) {
			this.#deps.logDebug?.('Stream detach failed (already closed)', abortError);
		}

		if (this.#currentStreamController === streamController) {
			this.#currentStreamController = null;
		}
		this.#deps.assistant.finalizeMessage();
		this.isStreaming = false;
		this.currentActivity = '';
		if (reconcileRequest) {
			Promise.resolve(this.#deps.reconcileTurnFromSession?.(reconcileRequest)).catch(
				(err) => {
					this.#deps.logError?.('[AgentChat] Failed to reconcile detached turn:', err);
				}
			);
		}
	}

	async stopGeneration(
		reason: StreamStopReason = 'user_cancelled',
		options: { awaitCancelHint?: boolean } = {}
	): Promise<void> {
		if (!this.isStreaming || !this.#currentStreamController) return;

		if (reason === 'user_cancelled') {
			this.#deps.haptic?.('heavy');
		}

		const runId = this.activeStreamRunId;
		const streamRunId = this.activeTransportStreamRunId;
		const shouldReportReason = reason === 'user_cancelled' || reason === 'superseded';
		const cancellationReasonPromise =
			shouldReportReason && streamRunId
				? this.reportStreamCancellationReason(reason, streamRunId, {
						awaitAck: Boolean(options.awaitCancelHint)
					})
				: null;

		this.#deps.assistant.flushText();
		this.#deps.assistant.markInterrupted(reason, streamRunId);
		this.finalizeClientStreamTiming(
			runId,
			'cancelled',
			reason === 'user_cancelled' || reason === 'superseded' ? reason : null
		);
		this.activeStreamRunId = this.activeStreamRunId + 1;
		this.activeTransportStreamRunId = null;
		this.activeClientTurnId = null;
		this.#clearStreamEventOrderingState();

		if (cancellationReasonPromise && options.awaitCancelHint) {
			await cancellationReasonPromise;
		}

		try {
			// Optional chain: the natural-completion path may have nulled the
			// controller while we awaited the cancel hint above.
			this.#currentStreamController?.abort();
		} catch (abortError) {
			this.#deps.logDebug?.('Abort failed (already closed)', abortError);
		}
		this.#currentStreamController = null;

		this.#deps.thinking.finalize(
			reason === 'superseded' ? 'cancelled' : 'interrupted',
			reason === 'user_cancelled' ? 'Stopped by you' : 'Stopped'
		);
		this.#deps.assistant.finalizeMessage();

		if (cancellationReasonPromise && !options.awaitCancelHint) {
			void cancellationReasonPromise;
		}

		this.isStreaming = false;
		this.currentActivity = '';
	}

	disposeActiveStream(options: { reconcile?: boolean } = {}): void {
		if (this.#currentStreamController && this.isStreaming) {
			this.detachActiveStream(options);
			return;
		}

		if (!this.#currentStreamController) return;

		try {
			this.#currentStreamController.abort();
		} catch (abortError) {
			this.#deps.logDebug?.('Stream abort failed (already closed)', abortError);
		}
		this.#currentStreamController = null;
		this.activeTransportStreamRunId = null;
		this.activeClientTurnId = null;
		this.#clearStreamEventOrderingState();
	}

	reset(): void {
		this.disposeActiveStream({ reconcile: false });
		this.activeStreamRunId = this.activeStreamRunId + 1;
		this.activeTransportStreamRunId = null;
		this.activeClientTurnId = null;
		this.#clearStreamEventOrderingState();
		this.isStreaming = false;
		this.isStartingStream = false;
		this.currentActivity = '';
		this.error = null;
		this.activeStreamTiming = null;
		this.lastCompletedStreamTiming = null;
	}
}

export function createAgentChatStreamController(
	deps: StreamControllerDeps
): AgentChatStreamController {
	return new AgentChatStreamController(deps);
}
