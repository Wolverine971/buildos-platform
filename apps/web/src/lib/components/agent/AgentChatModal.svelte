<!-- apps/web/src/lib/components/agent/AgentChatModal.svelte -->
<!--
  AgentChatModal Component - INKPRINT Design System

  BuildOS chat interface showing planner-executor conversations.
  Displays BuildOS activity, plan steps, and iterative conversations.

  README: apps/web/docs/features/agentic-chat/README.md
  Design: INKPRINT texture-based design language - ink on paper,
  semantic textures, high information density, tactile controls.
-->

<script lang="ts">
	import { onDestroy } from 'svelte';
	import { browser, dev } from '$app/environment';
	import Modal from '$lib/components/ui/Modal.svelte';
	import ContextSelectionScreen from '../chat/ContextSelectionScreen.svelte';
	import ProjectFocusSelector from './ProjectFocusSelector.svelte';
	import ProjectActionSelector from './ProjectActionSelector.svelte';
	import AgentChatHeader from './AgentChatHeader.svelte';
	import AgentComposer from './AgentComposer.svelte';
	import AgentAutomationWizard from './AgentAutomationWizard.svelte';
	import AgentMessageList from './AgentMessageList.svelte';
	import ProjectImageLibrary from '$lib/components/ontology/ProjectImageLibrary.svelte';
	import type { OntologyImageAsset } from '$lib/components/ontology/image-assets/types';
	import { SSEProcessor, type StreamCallbacks } from '$lib/utils/sse-processor';
	import type {
		ChatSession,
		ChatContextType,
		ChatRole,
		ChatAttachmentRef,
		AgentSSEMessage,
		ContextUsageSnapshot,
		AgentTimingSummary,
		SkillActivityEvent
	} from '@buildos/shared-types';
	import {
		requestAgentToAgentMessage,
		type AgentToAgentMessageHistory
	} from '$lib/services/agentic-chat/agent-to-agent-service';
	import type { LastTurnContext, ProjectFocus } from '$lib/types/agent-chat-enhancement';
	import { CONTEXT_DESCRIPTORS } from './agent-chat.constants';
	import { buildLiveContextUsageSnapshot } from './agent-chat-formatters';
	import {
		findThinkingBlockById,
		type ActivityEntry,
		type ActivityType,
		type AgentLoopState,
		type AgentChatImageAttachment,
		type AgentProjectSummary,
		type AgentToAgentStep,
		type DataMutationSummary,
		type ProjectAction,
		type ThinkingBlockMessage,
		type UIMessage
	} from './agent-chat.types';
	import { toastService } from '$lib/stores/toast.store';
	import { haptic } from '$lib/utils/haptic';
	import { initKeyboardAvoiding } from '$lib/utils/keyboard-avoiding';
	import { createProjectInvalidation } from '$lib/utils/invalidation';
	import {
		buildProjectWideFocus,
		deriveSessionTitle,
		isProjectContext,
		loadAgentChatSessionSnapshot,
		normalizeSessionContextType,
		prewarmAgentContext,
		warmAgentChatStreamTransport
	} from './agent-chat-session';
	import {
		buildSkillLoadActivityEvent,
		upsertSkillActivityEntries
	} from './agent-chat-skill-activity';
	import { upsertOperationActivityEntries } from './agent-chat-operation-activity';
	import {
		createToolPresenter,
		type OntologyEntityKind,
		type ToolPresenter
	} from './agent-chat-tool-presenter';
	import {
		createSSEHandler,
		type PendingToolStatus,
		type SSEHandlerDeps
	} from './agent-chat-sse-handler';
	import { createVoiceAdapter } from './agent-chat-voice.svelte';
	import { createPrewarmController } from './agent-chat-prewarm.svelte';

	interface AutoInitProjectConfig {
		projectId: string;
		projectName: string;
		showActionSelector?: boolean;
		initialAction?: ProjectAction;
	}

	interface Props {
		isOpen?: boolean;
		contextType?: ChatContextType;
		entityId?: string;
		onClose?: (summary?: DataMutationSummary) => void;
		autoInitProject?: AutoInitProjectConfig | null;
		initialChatSessionId?: string | null;
		initialProjectFocus?: ProjectFocus | null;
		embedded?: boolean;
		/** Reports the active chat session id so embedding surfaces can render
		 * session-level chrome (e.g. ChatSessionAuditActions) in their own header. */
		onSessionChange?: (sessionId: string | null) => void;
	}

	type ContextSelectionType = ChatContextType | 'agent_to_agent';

	interface ContextSelectionDetail {
		contextType: ContextSelectionType;
		entityId?: string;
		label?: string;
	}

	interface SessionBootstrapTarget {
		contextType: ChatContextType;
		entityId?: string;
		projectFocus?: ProjectFocus | null;
	}

	const AGENT_CHAT_MAX_IMAGE_ATTACHMENTS = 4;
	const AGENT_CHAT_MAX_IMAGE_BYTES = 25 * 1024 * 1024;
	const AGENT_CHAT_MAX_CONCURRENT_IMAGE_UPLOADS = 2;
	const AGENT_CHAT_OCR_POLL_INITIAL_DELAY_MS = 2500;
	const AGENT_CHAT_OCR_POLL_MAX_DELAY_MS = 10_000;
	const AGENT_CHAT_OCR_POLL_MAX_ATTEMPTS = 10;

	interface ClientStreamTimingState {
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

	let {
		isOpen = false,
		contextType: _initialContextType = 'global',
		entityId: _initialEntityId,
		onClose,
		autoInitProject = null,
		initialChatSessionId = null,
		initialProjectFocus = null,
		embedded = false,
		onSessionChange
	}: Props = $props();

	// Context selection state
	let selectedContextType = $state<ChatContextType | null>(null);
	let selectedEntityId = $state<string | undefined>(undefined);
	let selectedContextLabel = $state<string | null>(null);
	let projectFocus = $state<ProjectFocus | null>(null);
	let showFocusSelector = $state(false);
	let showProjectActionSelector = $state(false);
	let autoInitDismissed = $state(false);
	let lastAutoInitProjectId = $state<string | null>(null);
	let wasOpen = $state(false);
	// Prewarm state lives in the PrewarmController instance created below,
	// once all dependent state and helpers are declared.

	const contextDescriptor = $derived(
		selectedContextType ? CONTEXT_DESCRIPTORS[selectedContextType] : null
	);

	const displayContextLabel = $derived.by(() => {
		if (!selectedContextType) {
			return 'Select a focus to begin';
		}
		return selectedContextLabel ?? contextDescriptor?.title ?? 'Selected focus';
	});

	const displayContextSubtitle = $derived.by(() => {
		if (!selectedContextType) {
			return 'Choose what you want to work on before starting the conversation.';
		}
		return contextDescriptor?.subtitle ?? '';
	});

	const defaultProjectFocus = $derived.by<ProjectFocus | null>(() => {
		if (isProjectContext(selectedContextType) && selectedEntityId) {
			return buildProjectWideFocus(selectedEntityId, selectedContextLabel);
		}
		return null;
	});

	const resolvedProjectFocus = $derived.by<ProjectFocus | null>(() => {
		if (!isProjectContext(selectedContextType)) {
			return null;
		}
		return projectFocus ?? defaultProjectFocus;
	});

	const attachmentProjectId = $derived.by(() => {
		return (
			resolvedProjectFocus?.projectId ??
			(isProjectContext(selectedContextType) ? selectedEntityId : null) ??
			null
		);
	});

	// Device detection for mobile UX
	// On mobile/touch devices, Enter should not send messages (allows natural line breaks)
	const isTouchDevice = $derived(
		browser && ('ontouchstart' in window || navigator.maxTouchPoints > 0)
	);

	// Conversation state
	let messages = $state<UIMessage[]>([]);
	let currentSession = $state<ChatSession | null>(null);
	let isStreaming = $state(false);
	let currentStreamController: AbortController | null = null;
	let activeStreamRunId = $state(0);
	let activeTransportStreamRunId = $state<string | null>(null);
	let activeClientTurnId = $state<string | null>(null);
	let inputValue = $state('');
	let imageAttachments = $state<AgentChatImageAttachment[]>([]);
	let showExistingImagePicker = $state(false);
	let error = $state<string | null>(null);
	let currentActivity = $state<string>('');
	let userHasScrolled = $state(false);
	let currentAssistantMessageId = $state<string | null>(null);
	let currentAssistantMessageIndex = $state<number | null>(null);
	let pendingAssistantText = '';
	let pendingAssistantTextFlushHandle: number | null = null;
	let currentThinkingBlockId = $state<string | null>(null);
	let hasSentMessage = $state(false);
	const pendingToolResults = new Map<string, PendingToolStatus>(); // Tool results that arrive before tool_call
	const hiddenToolCallIds = new Set<string>();
	const activeImagePreviewUrls = new Set<string>();
	const imageUploadQueue: Array<() => Promise<void>> = [];
	let activeImageUploadCount = 0;
	let imageAttachmentUploadGeneration = 0;

	const selectedAttachmentAssetIds = $derived.by(() =>
		imageAttachments
			.map((attachment) => attachment.assetId)
			.filter((id): id is string => Boolean(id))
	);

	// Track setTimeout IDs for cleanup to prevent memory leaks
	const pendingTimeouts = new Set<ReturnType<typeof setTimeout>>();

	let messagesContainer = $state<HTMLElement | undefined>(undefined);
	let composerContainer = $state<HTMLElement | undefined>(undefined);
	let keyboardAvoidingCleanup = $state<(() => void) | null>(null);
	let hasFinalizedSession = false;

	// Ontology integration state
	let lastTurnContext = $state<LastTurnContext | null>(null);
	let ontologyLoaded = $state(false);
	let contextUsage = $state<ContextUsageSnapshot | null>(null);
	let contextUsageOverheadTokens = $state(0);
	let activeStreamTiming = $state<ClientStreamTimingState | null>(null);
	let _lastCompletedStreamTiming = $state<ClientStreamTimingState | null>(null);

	// Let embedding surfaces (e.g. BriefChatModal) mirror the active session id
	// into their own header chrome.
	$effect(() => {
		onSessionChange?.(currentSession?.id ?? null);
	});

	const displayContextUsage = $derived.by(() => {
		if (!selectedContextType) {
			return null;
		}

		const hasConversation =
			messages.some((message) => message.role === 'user' || message.role === 'assistant') ||
			inputValue.trim().length > 0 ||
			Boolean(contextUsage);
		if (!hasConversation) {
			return null;
		}

		return buildLiveContextUsageSnapshot({
			messages,
			draft: inputValue,
			serverSnapshot: contextUsage,
			overheadTokens: contextUsageOverheadTokens
		});
	});

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

	function diffMs(start: number | null, end: number | null): number | null {
		if (typeof start !== 'number' || typeof end !== 'number') return null;
		return Math.max(0, end - start);
	}

	function recordClientStreamEvent(
		runId: number,
		eventType: AgentSSEMessage['type'] | 'transport_error'
	) {
		if (!activeStreamTiming || activeStreamTiming.runId !== runId) return;

		const now = Date.now();
		let next = activeStreamTiming;
		if (next.firstEventAtMs === null) {
			next = { ...next, firstEventAtMs: now };
		}
		if (eventType === 'text' || eventType === 'text_delta') {
			next = {
				...next,
				firstTextAtMs: next.firstTextAtMs ?? now,
				lastTextAtMs: now
			};
		}
		if (eventType === 'done' && next.doneEventAtMs === null) {
			next = { ...next, doneEventAtMs: now };
		}
		activeStreamTiming = next;
	}

	function attachServerTiming(runId: number, timing: AgentTimingSummary) {
		if (!activeStreamTiming || activeStreamTiming.runId !== runId) return;
		activeStreamTiming = {
			...activeStreamTiming,
			serverTiming: timing
		};
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

	function finalizeClientStreamTiming(
		runId: number,
		terminalState: ClientStreamTimingState['terminalState'],
		cancelReason: ClientStreamTimingState['cancelReason'] = null
	) {
		if (!activeStreamTiming || activeStreamTiming.runId !== runId) return;
		const finalized: ClientStreamTimingState = {
			...activeStreamTiming,
			streamClosedAtMs: Date.now(),
			terminalState,
			cancelReason
		};
		_lastCompletedStreamTiming = finalized;
		activeStreamTiming = null;
		if (dev) {
			console.debug('[AgentChat] Stream timing', summarizeClientStreamTiming(finalized));
		}
	}

	const AGENT_STATE_MESSAGES: Record<AgentLoopState, string> = {
		thinking: 'BuildOS is thinking...',
		waiting_on_user: 'Waiting on your direction...'
	};

	// Actionable Insight agent identifier (used for agent-to-agent bridge)
	const RESEARCH_AGENT_ID = 'actionable_insight_agent';
	// Today there is exactly one helper, so the wizard skips the "Pick a helper"
	// step. Flip this to true once a second helper ships and the agent step
	// becomes a real choice instead of a forced click-through.
	const HAS_MULTIPLE_AGENT_HELPERS = false;
	const ACTIVE_TURN_SESSION_REFRESH_MS = 2000;

	let agentToAgentMode = $state(false);
	let agentToAgentStep = $state<AgentToAgentStep | null>(null);
	let agentGoal = $state('');
	let selectedAgentId = $state<string | null>(null);
	let agentLoopActive = $state(false);
	let agentMessageLoading = $state(false);
	let agentTurnBudget = $state(5);
	let agentTurnsRemaining = $state(5);
	let agentProjects = $state<AgentProjectSummary[]>([]);
	let agentProjectsError = $state<string | null>(null);
	let agentProjectsLoading = $state(false);

	// Voice recording adapter — see agent-chat-voice.svelte.ts
	const voice = createVoiceAdapter({
		toastError: (msg) => toastService.error(msg),
		logWarn: (msg, err) => {
			console.error(msg, err);
		}
	});

	// Session resumption state
	let isLoadingSession = $state(false);
	let isPreparingSession = $state(false);
	let sessionLoadError = $state<string | null>(null);
	let lastLoadedSessionId = $state<string | null>(null);
	let sessionLoadRequestId = 0;
	let sessionLoadController: AbortController | null = null;
	let sessionRefreshTimeout: ReturnType<typeof setTimeout> | null = null;
	let activeRestoredTurnRunId = $state<string | null>(null);
	let isStartingStream = $state(false);
	let sessionBootstrapRequestId = 0;
	let sessionBootstrapController: AbortController | null = null;
	let sessionBootstrapPromise: Promise<ChatSession | null> | null = null;
	const isSessionBusy = $derived(isLoadingSession || isPreparingSession);
	const canAttachExistingProjectImages = $derived(
		Boolean(attachmentProjectId) && !isSessionBusy && !isStreaming
	);
	const sessionStatusLabel = $derived.by(() => {
		if (isLoadingSession) return 'Loading session';
		if (isPreparingSession) return 'Preparing session';
		return null;
	});

	// Controls whether the context selection screen is visible (keeps state alive for back nav)
	let showContextSelection = $state(true);
	let contextSelectionView = $state<'primary' | 'project-selection'>('primary');
	let contextSelectionRef = $state<any>(null);

	// Unified back navigation logic
	const shouldShowBackButton = $derived.by(() => {
		// Show back button when in context selection sub-views (not primary)
		if (showContextSelection && contextSelectionView !== 'primary') {
			return true;
		}
		// Show back button in all other views except the initial context selection primary view
		if (showContextSelection && contextSelectionView === 'primary') {
			return false;
		}
		return true;
	});

	const shouldShowSessionLoadingState = $derived.by(() => {
		if (!isSessionBusy || messages.length > 0) return false;
		if (showContextSelection || showProjectActionSelector || showFocusSelector) return false;
		if (agentToAgentMode && agentToAgentStep !== 'chat') return false;
		return true;
	});

	const shouldShowSessionLoadErrorState = $derived.by(() => {
		if (!sessionLoadError || isSessionBusy || messages.length > 0) return false;
		if (showContextSelection || showProjectActionSelector || showFocusSelector) return false;
		if (agentToAgentMode && agentToAgentStep !== 'chat') return false;
		return true;
	});

	const shouldShowComposer = $derived(
		!showContextSelection &&
			!showProjectActionSelector &&
			!showFocusSelector &&
			!agentToAgentMode
	);

	const chatComposerVocabularyTerms = $derived(
		resolvedProjectFocus?.projectName ?? displayContextLabel
	);

	const canPrimeActiveChatSession = $derived.by(() => {
		if (!selectedContextType || !isOpen || currentSession?.id) return false;
		if (showContextSelection || showProjectActionSelector) return false;
		if (agentToAgentMode && agentToAgentStep !== 'chat') return false;
		return true;
	});

	// Prewarm controller — owns the context-cache prewarm lifecycle.
	// See agent-chat-prewarm.svelte.ts.
	const prewarm = createPrewarmController({
		getIsOpen: () => isOpen,
		getIsBrowser: () => browser,
		getSelectedContextType: () => selectedContextType,
		getSelectedEntityId: () => selectedEntityId,
		getResolvedProjectFocus: () => resolvedProjectFocus,
		getIsPreparingSession: () => isPreparingSession,
		getCurrentSession: () => currentSession,
		getCanPrimeActiveChatSession: () => canPrimeActiveChatSession,
		getInputValue: () => inputValue,
		getIsVoiceBusy: () => voice.isBusy,
		getIsVoicePending: () => voice.pendingSendAfterTranscription,
		prewarmAgentContext: (payload, options) => prewarmAgentContext(payload, options),
		warmStreamTransport: (options) => warmAgentChatStreamTransport(options),
		hydrateSessionFromEvent: (session) => hydrateSessionFromEvent(session),
		logWarn: (msg, err) => {
			if (dev) {
				console.warn(msg, err);
			}
		}
	});

	function cancelSessionBootstrap() {
		sessionBootstrapRequestId += 1;
		if (sessionBootstrapController) {
			sessionBootstrapController.abort();
			sessionBootstrapController = null;
		}
		sessionBootstrapPromise = null;
		isPreparingSession = false;
	}

	function clearSessionRefreshTimeout() {
		if (!sessionRefreshTimeout) return;
		clearTimeout(sessionRefreshTimeout);
		sessionRefreshTimeout = null;
	}

	function scheduleActiveTurnSessionRefresh(sessionId: string) {
		clearSessionRefreshTimeout();
		if (!browser || !isOpen) return;

		sessionRefreshTimeout = setTimeout(() => {
			sessionRefreshTimeout = null;
			if (!isOpen) return;
			void loadChatSession(sessionId, { backgroundRefresh: true });
		}, ACTIVE_TURN_SESSION_REFRESH_MS);
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

	async function ensureSessionReady(target: SessionBootstrapTarget): Promise<ChatSession | null> {
		if (currentSession?.id) {
			return currentSession;
		}

		if (isProjectContext(target.contextType) && !target.entityId) {
			throw new Error('Select a project before starting the conversation.');
		}

		if (sessionBootstrapPromise) {
			return sessionBootstrapPromise;
		}

		sessionBootstrapRequestId += 1;
		const requestId = sessionBootstrapRequestId;
		const controller = new AbortController();
		sessionBootstrapController = controller;
		isPreparingSession = true;

		let bootstrapPromise: Promise<ChatSession | null>;
		bootstrapPromise = (async () => {
			const warmed = await prewarmAgentContext(
				{
					session_id: currentSession?.id ?? undefined,
					context_type: target.contextType,
					entity_id: target.entityId,
					projectFocus: target.projectFocus,
					ensure_session: true
				},
				{ signal: controller.signal }
			);

			if (requestId !== sessionBootstrapRequestId || controller.signal.aborted) {
				throw new DOMException('Session bootstrap aborted', 'AbortError');
			}

			if (!warmed?.session?.id) {
				throw new Error('Unable to prepare a chat session right now.');
			}

			hydrateSessionFromEvent(warmed.session);
			prewarm.adopt(warmed.prewarmedContext);
			prewarm.adoptPrepared(warmed.preparedPrompt);

			return warmed.session;
		})().finally(() => {
			if (requestId === sessionBootstrapRequestId) {
				isPreparingSession = false;
			}
			if (sessionBootstrapController === controller) {
				sessionBootstrapController = null;
			}
			if (sessionBootstrapPromise === bootstrapPromise) {
				sessionBootstrapPromise = null;
			}
		});

		sessionBootstrapPromise = bootstrapPromise;
		return bootstrapPromise;
	}

	function handleBackNavigation() {
		if (isStreaming) return;
		voice.stop();

		// Handle back based on current view state
		if (showContextSelection && contextSelectionView !== 'primary') {
			// Delegate to ContextSelectionScreen's internal navigation
			contextSelectionRef?.handleBackNavigation?.();
		} else if (showFocusSelector) {
			// From inline focus selector → back to active chat (no focus change)
			showFocusSelector = false;
		} else if (showProjectActionSelector) {
			// From project action selector → back to context selection
			autoInitDismissed = true;
			showProjectActionSelector = false;
			resetConversation({ preserveContext: false });
			showContextSelection = true;
		} else if (agentToAgentMode && agentToAgentStep === 'goal') {
			// From goal step → back to project selection
			backToAgentProjectSelection();
		} else if (agentToAgentMode && agentToAgentStep === 'project') {
			// With a single helper, the agent step is auto-skipped — so the
			// project step's back affordance exits the wizard entirely rather
			// than returning to a one-option screen.
			if (HAS_MULTIPLE_AGENT_HELPERS) {
				backToAgentSelection();
			} else {
				agentToAgentMode = false;
				agentToAgentStep = null;
				changeContext();
			}
		} else if (agentToAgentMode && agentToAgentStep === 'agent') {
			// From agent selection → back to context selection
			agentToAgentMode = false;
			agentToAgentStep = null;
			changeContext();
		} else if (agentToAgentMode && agentToAgentStep === 'chat') {
			// From chat with automation → back to context selection
			changeContext();
		} else {
			// From regular chat view → back to context selection
			changeContext();
		}
	}

	/**
	 * Helper function to create tracked timeouts that are automatically cleaned up on unmount.
	 * Prevents memory leaks when component unmounts with pending timeouts.
	 */
	function setTrackedTimeout(callback: () => void, delay: number): ReturnType<typeof setTimeout> {
		const id = setTimeout(() => {
			pendingTimeouts.delete(id);
			callback();
		}, delay);
		pendingTimeouts.add(id);
		return id;
	}

	function handleContextSelectionNavChange(view: 'primary' | 'project-selection') {
		contextSelectionView = view;
	}

	// Note: voice.isRecording is NOT included - clicking send while recording will
	// stop the recording and auto-send after transcription completes.
	// Streaming only blocks send on non-touch devices (touch uses Send & Stop).
	const hasSendableImageAttachments = $derived(
		imageAttachments.length > 0 &&
			imageAttachments.every(
				(attachment) =>
					Boolean(attachment.assetId) &&
					(attachment.status === 'ready' || attachment.status === 'deduped')
			)
	);
	const hasBlockedImageAttachments = $derived(
		imageAttachments.some(
			(attachment) =>
				attachment.status === 'hashing' ||
				attachment.status === 'uploading' ||
				attachment.status === 'processing' ||
				attachment.status === 'error'
		)
	);
	const isSendDisabled = $derived(
		agentToAgentMode ||
			!selectedContextType ||
			isSessionBusy ||
			activeRestoredTurnRunId !== null ||
			isStartingStream ||
			hasBlockedImageAttachments ||
			(!inputValue.trim() && !voice.isRecording && !hasSendableImageAttachments) || // Allow send if recording (will get transcribed text)
			(isStreaming && !isTouchDevice) ||
			voice.isInitializing ||
			voice.isStopping ||
			voice.isTranscribing ||
			voice.pendingSendAfterTranscription // Prevent double-clicks while waiting for transcription
	);

	function resetConversation(options: { preserveContext?: boolean } = {}) {
		const { preserveContext = true } = options;

		voice.stop();
		cancelSessionBootstrap();

		messages = [];
		currentSession = null;
		currentActivity = '';
		inputValue = '';
		imageAttachments = [];
		showExistingImagePicker = false;
		cancelQueuedImageUploads();
		revokeAllImagePreviewUrls();
		error = null;
		userHasScrolled = false;
		currentAssistantMessageId = null;
		currentAssistantMessageIndex = null;
		currentThinkingBlockId = null;
		isStreaming = false;
		// Reset ontology state
		lastTurnContext = null;
		ontologyLoaded = false;
		contextUsage = null;
		contextUsageOverheadTokens = 0;
		activeStreamTiming = null;
		_lastCompletedStreamTiming = null;
		pendingToolResults.clear();
		presenter.resetMutationTracking();
		voice.reset();
		showFocusSelector = false;
		showProjectActionSelector = false;
		agentLoopActive = false;
		agentMessageLoading = false;
		agentTurnBudget = 5;
		agentTurnsRemaining = 5;
		// Reset session resumption state
		sessionLoadError = null;
		activeRestoredTurnRunId = null;
		clearSessionRefreshTimeout();

		if (!preserveContext) {
			selectedContextType = null;
			selectedEntityId = undefined;
			selectedContextLabel = null;
			projectFocus = null;
			agentToAgentMode = false;
			agentToAgentStep = null;
			selectedAgentId = null;
			agentGoal = '';
			agentProjects = [];
			agentProjectsError = null;
			agentProjectsLoading = false;
		}
	}

	function handleContextSelect(selection: ContextSelectionDetail) {
		resetConversation();
		autoInitDismissed = true;

		if (selection.contextType === 'agent_to_agent') {
			agentToAgentMode = true;
			agentToAgentStep = 'agent';
			selectedAgentId = null;
			selectedContextType = null;
			selectedContextLabel = selection.label ?? 'BuildOS automation';
			projectFocus = null;
			showContextSelection = false;

			// With a single helper available the agent step is a forced click-through,
			// so auto-select and advance straight to picking a project.
			if (!HAS_MULTIPLE_AGENT_HELPERS) {
				selectAgentForBridge(RESEARCH_AGENT_ID);
			}
			return;
		}

		agentToAgentMode = false;
		agentToAgentStep = null;
		selectedAgentId = null;
		agentGoal = '';
		agentLoopActive = false;
		agentMessageLoading = false;
		selectedContextType = selection.contextType;
		selectedEntityId = selection.entityId;
		selectedContextLabel =
			selection.label ?? CONTEXT_DESCRIPTORS[selection.contextType]?.title ?? null;
		showContextSelection = false;

		if (isProjectContext(selection.contextType) && selection.entityId) {
			projectFocus = buildProjectWideFocus(selection.entityId, selection.label);
		} else {
			projectFocus = null;
			showFocusSelector = false;
		}

		// If user picked a project from the generic flow, funnel them through the shared action selector
		showProjectActionSelector = selection.contextType === 'project';
	}

	function changeContext() {
		if (isStreaming) return;
		voice.stop();
		autoInitDismissed = true;
		// Clear the conversation but keep user in context selection mode
		// This allows them to navigate back through the selection screens
		resetConversation({ preserveContext: false });
		showContextSelection = true;
		showProjectActionSelector = false;
	}

	function openFocusSelector() {
		if (!isProjectContext(selectedContextType) || !selectedEntityId) return;
		showFocusSelector = true;
	}

	function handleFocusSelection(newFocus: ProjectFocus) {
		// Check if we're starting fresh (from action selector) before updating state
		const isStartingFresh = showProjectActionSelector;

		projectFocus = newFocus;
		logFocusActivity('Focus updated', newFocus);
		// Move into project chat with the chosen focus
		selectedContextType = 'project';
		selectedContextLabel = buildContextLabelForAction('workspace', newFocus.projectName);
		showProjectActionSelector = false;
		showFocusSelector = false;
		showContextSelection = false;

		// Starting fresh from the action selector means we want a clean message
		// list. The empty-state card in AgentMessageList branches its suggestions
		// off `selectedContextType` + `resolvedProjectFocus`, so the user lands
		// on focus-aware prompts without a preseeded assistant bubble.
		if (isStartingFresh) {
			messages = [];
		}
	}

	function handleFocusClear() {
		if (!defaultProjectFocus) return;
		projectFocus = defaultProjectFocus;
		logFocusActivity('Focus reset', defaultProjectFocus);
	}

	function mapActionToContextType(_action: ProjectAction): ChatContextType {
		return 'project';
	}

	function buildContextLabelForAction(
		_action: ProjectAction,
		projectName?: string | null
	): string {
		return projectName?.trim() || 'Project';
	}

	function applyProjectAction(
		action: ProjectAction,
		projectId: string,
		projectName?: string | null,
		options: { skipReset?: boolean } = {}
	) {
		if (!projectId) return;
		if (!options.skipReset) {
			resetConversation({ preserveContext: false });
		}

		const contextType = mapActionToContextType(action);
		const label = buildContextLabelForAction(action, projectName);

		selectedContextType = contextType;
		selectedEntityId = projectId;
		selectedContextLabel = label;
		projectFocus = buildProjectWideFocus(projectId, projectName ?? label);
		showContextSelection = false;
		showProjectActionSelector = false;
		showFocusSelector = false;
		agentToAgentMode = false;
		agentToAgentStep = null;
	}

	function primeProjectContext(projectId: string, projectName: string | null | undefined) {
		if (!projectId) return;
		resetConversation({ preserveContext: false });
		selectedContextType = 'project';
		selectedEntityId = projectId;
		selectedContextLabel = buildContextLabelForAction('workspace', projectName);
		projectFocus = buildProjectWideFocus(projectId, projectName);
		showContextSelection = false;
		showProjectActionSelector = true;
		showFocusSelector = false;
		agentToAgentMode = false;
		agentToAgentStep = null;
	}

	function handleProjectActionSelect(action: ProjectAction) {
		if (!selectedEntityId) return;
		const projectName = projectFocus?.projectName ?? selectedContextLabel;
		applyProjectAction(action, selectedEntityId, projectName, { skipReset: false });
	}

	function initializeFromAutoInit(config: AutoInitProjectConfig) {
		if (!config?.projectId) return;

		const showSelector = config.showActionSelector ?? true;
		const action = config.initialAction ?? 'workspace';

		lastAutoInitProjectId = config.projectId;
		autoInitDismissed = false;

		if (showSelector && !config.initialAction) {
			primeProjectContext(config.projectId, config.projectName);
			return;
		}

		resetConversation({ preserveContext: false });
		applyProjectAction(action, config.projectId, config.projectName, { skipReset: true });
	}

	const selectedAgentLabel = $derived(selectedAgentId ? 'Actionable Insight' : 'Select a helper');

	async function loadAgentProjects(force = false) {
		if (agentProjectsLoading || (!force && agentProjects.length > 0)) return;
		agentProjectsLoading = true;
		agentProjectsError = null;
		try {
			const response = await fetch('/api/onto/projects', {
				method: 'GET',
				credentials: 'same-origin',
				cache: 'no-store',
				headers: { Accept: 'application/json' }
			});
			const payload = await response.json();
			if (!response.ok || payload?.success === false) {
				agentProjectsError = payload?.error || 'Failed to load projects';
				agentProjects = [];
				return;
			}
			const fetched = payload?.data?.projects ?? payload?.projects ?? [];
			agentProjects = fetched.map((project: any) => ({
				id: project.id,
				name: project.name ?? 'Untitled project',
				description: project.description ?? null
			}));
		} catch (err) {
			console.error('[AgentChat] Failed to load projects for agent bridge', err);
			agentProjectsError = 'Failed to load projects';
		} finally {
			agentProjectsLoading = false;
		}
	}

	function selectAgentForBridge(agentId: string) {
		selectedAgentId = agentId;
		agentToAgentStep = 'project';
		loadAgentProjects(true);
	}

	function selectAgentProject(project: AgentProjectSummary) {
		selectedContextType = 'project';
		selectedEntityId = project.id;
		selectedContextLabel = project.name;
		projectFocus = buildProjectWideFocus(project.id, project.name);
		agentToAgentStep = 'goal';
	}

	function backToAgentSelection() {
		agentToAgentStep = 'agent';
		agentLoopActive = false;
	}

	function backToAgentProjectSelection() {
		agentToAgentStep = 'project';
		agentLoopActive = false;
	}

	function updateAgentTurnBudget(value: number) {
		const sanitized = Math.max(1, Math.min(50, Math.round(value)));
		agentTurnBudget = sanitized;
		if (!agentLoopActive && !agentMessageLoading && !isStreaming) {
			agentTurnsRemaining = sanitized;
		}
	}

	function buildAgentToAgentHistory(): AgentToAgentMessageHistory[] {
		return messages
			.filter((message) => message.type === 'agent_peer' || message.type === 'assistant')
			.map((message) => ({
				role: message.type === 'assistant' ? ('buildos' as const) : ('agent' as const),
				content: message.content
			}))
			.filter((item) => item.content?.trim());
	}

	async function runAgentToAgentTurn() {
		if (!agentToAgentMode || !agentLoopActive || agentMessageLoading) return;
		if (!selectedAgentId) {
			error = 'Select a helper to continue.';
			return;
		}
		if (!selectedEntityId || selectedContextType !== 'project') {
			error = 'Select a project for the automation loop.';
			return;
		}
		if (!agentGoal.trim()) {
			error = 'Provide a goal for this automation.';
			return;
		}
		if (agentTurnsRemaining <= 0) {
			agentLoopActive = false;
			return;
		}
		if (isStreaming) return;

		agentMessageLoading = true;
		try {
			const history = buildAgentToAgentHistory();
			const response = await requestAgentToAgentMessage({
				agentId: selectedAgentId,
				projectId: selectedEntityId,
				goal: agentGoal.trim(),
				history
			});
			const agentMessage = response?.message?.trim();
			if (!agentMessage) {
				error = 'BuildOS did not receive an update from the helper.';
				agentLoopActive = false;
				return;
			}
			await sendMessage(agentMessage, { senderType: 'agent_peer', suppressInputClear: true });
		} catch (err) {
			console.error('[AgentChat] Failed to run agent-to-agent turn', err);
			error = 'Failed to fetch the helper update.';
			agentLoopActive = false;
		} finally {
			agentMessageLoading = false;
		}
	}

	async function startAgentToAgentChat() {
		if (isStreaming || agentMessageLoading) return;
		if (!selectedAgentId) {
			error = 'Select a helper to start.';
			return;
		}
		if (!selectedEntityId || selectedContextType !== 'project') {
			error = 'Select a project to start.';
			return;
		}
		if (!agentGoal.trim()) {
			error = 'Add a goal for BuildOS to pursue.';
			return;
		}
		if (agentTurnBudget <= 0) {
			error = 'Set at least 1 turn before starting.';
			return;
		}

		resetConversation({ preserveContext: true });
		agentLoopActive = true;
		agentToAgentMode = true;
		agentToAgentStep = 'chat';
		agentTurnsRemaining = agentTurnBudget;
		error = null;
		await runAgentToAgentTurn();
	}

	function stopAgentLoop() {
		agentLoopActive = false;
	}

	// Auto-initialize the modal when launched with a context preset or project preset
	$effect(() => {
		if (!browser) return;

		if (!isOpen) {
			if (wasOpen) {
				// In embedded mode, trigger full close cleanup since there's no Modal.onClose
				if (embedded) {
					handleClose();
				}
				wasOpen = false;
				autoInitDismissed = false;
				lastAutoInitProjectId = null;
				lastLoadedSessionId = null; // Reset to allow reloading same session
				showProjectActionSelector = false;
				prewarm.reset();
				cancelSessionBootstrap();
				clearSessionRefreshTimeout();
				activeRestoredTurnRunId = null;
				if (sessionLoadController) {
					sessionLoadController.abort();
					sessionLoadController = null;
				}
				isLoadingSession = false;
			}
			return;
		}

		if (!wasOpen) {
			wasOpen = true;
			hasFinalizedSession = false;
			hasSentMessage = false;

			// If resuming a session, skip any auto-init flows that would create a new one
			if (initialChatSessionId) {
				return;
			}

			// Handle direct context initialization (e.g., project_create)
			// Skip context selection and go directly to chat
			if (_initialContextType && _initialContextType !== 'global' && !autoInitProject) {
				resetConversation({ preserveContext: false });
				selectedContextType = _initialContextType;
				selectedEntityId = _initialEntityId;
				selectedContextLabel = CONTEXT_DESCRIPTORS[_initialContextType]?.title ?? null;
				showContextSelection = false;
				showProjectActionSelector = false;
				return;
			}
		}

		if (!autoInitProject) {
			return;
		}

		// If resuming a session, do not auto-init a new project chat
		if (initialChatSessionId) {
			return;
		}

		const projectId = autoInitProject.projectId;
		if (!projectId) return;

		if (autoInitDismissed && projectId === lastAutoInitProjectId) {
			return;
		}

		const selectorActiveForProject =
			showProjectActionSelector && selectedEntityId === projectId && !showContextSelection;
		const contextMatchesProject =
			isProjectContext(selectedContextType) &&
			selectedEntityId === projectId &&
			!showContextSelection;

		if (
			lastAutoInitProjectId === projectId &&
			(selectorActiveForProject || contextMatchesProject)
		) {
			return;
		}

		initializeFromAutoInit(autoInitProject);
	});

	$effect(() => prewarm.orchestrateTransportWarmup());

	$effect(() => prewarm.orchestrate());

	$effect(() => {
		prewarm.invalidateIfStale();
	});

	// Handle initialProjectFocus prop - when opening chat focused on a specific ontology entity
	$effect(() => {
		if (!isOpen || !initialProjectFocus) return;

		// Skip if already initialized with this focus
		if (
			wasOpen &&
			projectFocus?.focusEntityId === initialProjectFocus.focusEntityId &&
			projectFocus?.projectId === initialProjectFocus.projectId
		) {
			return;
		}

		// Reset and set up for entity-focused chat
		resetConversation({ preserveContext: false });
		selectedContextType = 'project';
		selectedEntityId = initialProjectFocus.projectId;
		projectFocus = initialProjectFocus;

		// Build context label based on focus type
		const focusName = initialProjectFocus.focusEntityName;
		const projectName = initialProjectFocus.projectName || 'Project';
		selectedContextLabel =
			initialProjectFocus.focusType === 'project-wide'
				? projectName
				: focusName
					? `${focusName} (${projectName})`
					: projectName;

		showContextSelection = false;
		showProjectActionSelector = false;
	});

	// Handle initialChatSessionId prop - when resuming a previous chat session from history
	$effect(() => {
		if (!isOpen || !initialChatSessionId) return;

		// Only load once per session
		if (lastLoadedSessionId === initialChatSessionId) {
			return; // Already loaded this session
		}

		loadChatSession(initialChatSessionId);
	});

	// Load a chat session and restore its messages for resumption
	async function loadChatSession(
		sessionId: string,
		options: { backgroundRefresh?: boolean } = {}
	) {
		const backgroundRefresh = options.backgroundRefresh === true;
		sessionLoadRequestId += 1;
		const requestId = sessionLoadRequestId;
		cancelSessionBootstrap();
		if (sessionLoadController) {
			sessionLoadController.abort();
		}
		const controller = new AbortController();
		sessionLoadController = controller;

		if (!backgroundRefresh) {
			isLoadingSession = true;
			clearSessionRefreshTimeout();
		}
		sessionLoadError = null;
		if (!backgroundRefresh) {
			// Immediately hide context selection when loading a session to prevent flash
			showContextSelection = false;
			showProjectActionSelector = false;
			// Clear any prior session state to avoid bleed-through while loading
			resetConversation({ preserveContext: false });
		}

		try {
			const snapshot = await loadAgentChatSessionSnapshot(sessionId, {
				signal: controller.signal
			});

			if (requestId !== sessionLoadRequestId) {
				return;
			}

			const nextActiveTurnRun = snapshot.activeTurnRun ?? null;
			currentSession = snapshot.session;
			lastLoadedSessionId = sessionId;
			contextUsage = null;
			contextUsageOverheadTokens = 0;
			selectedContextType = snapshot.contextType;
			selectedEntityId = snapshot.selectedEntityId;
			selectedContextLabel = snapshot.selectedContextLabel;
			projectFocus = snapshot.projectFocus;
			messages = snapshot.messages;
			voice.hydrateNotesByGroupId(snapshot.voiceNotesByGroupId);
			activeRestoredTurnRunId = nextActiveTurnRun?.id ?? null;
			if (nextActiveTurnRun) {
				currentActivity = 'BuildOS is still finishing the latest response...';
				scheduleActiveTurnSessionRefresh(sessionId);
			} else {
				clearSessionRefreshTimeout();
				currentActivity = '';
			}
		} catch (err: any) {
			if (controller.signal.aborted || requestId !== sessionLoadRequestId) {
				return;
			}
			console.error('Failed to load chat session:', err);
			sessionLoadError = err.message || 'Failed to load chat session';
			error = sessionLoadError;
		} finally {
			if (requestId === sessionLoadRequestId) {
				isLoadingSession = false;
				sessionLoadController = null;
			}
		}
	}

	// Helper: Check if user is scrolled to bottom (within threshold)
	function isScrolledToBottom(container: HTMLElement, threshold = 100): boolean {
		const scrollPosition = container.scrollTop + container.clientHeight;
		const scrollHeight = container.scrollHeight;
		return scrollHeight - scrollPosition < threshold;
	}

	// Helper: Scroll to bottom without jarring shifts.
	// Called from $effect after messageCount changes (not during streaming
	// content updates), so layout thrashing isn't a concern here.
	// Scrolling synchronously in the effect (which runs after DOM update
	// but before paint) eliminates the one-frame jump that rAF would cause.
	function scrollToBottomIfNeeded() {
		if (!messagesContainer) return;

		// Only auto-scroll if user hasn't manually scrolled up
		// This allows users to freely read earlier messages during streaming
		if (!userHasScrolled) {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}
	}

	// Track manual scrolling by user
	function handleScroll() {
		if (!messagesContainer) return;
		// If user is at bottom, reset the flag
		if (isScrolledToBottom(messagesContainer)) {
			userHasScrolled = false;
		} else {
			// User has scrolled up manually
			userHasScrolled = true;
		}
	}

	// Track when new messages are added (not content changes during streaming)
	// This prevents constant scroll interruptions during streaming
	const messageCount = $derived(messages.length);

	// Auto-scroll only when new messages are added, not during streaming content updates
	// This allows users to scroll freely during streaming without being snapped back
	$effect(() => {
		if (messageCount > 0) {
			scrollToBottomIfNeeded();
		}
	});

	$effect(() => {
		if (!browser) return;
		if (agentToAgentMode && agentToAgentStep === 'project') {
			loadAgentProjects();
		}
	});

	$effect(() => {
		if (!browser) return;
		// Auto-run the next turn when the loop is active and idle
		if (
			agentToAgentMode &&
			agentLoopActive &&
			!agentMessageLoading &&
			!isStreaming &&
			agentTurnsRemaining > 0
		) {
			runAgentToAgentTurn();
		}
	});

	// Keyboard avoiding for mobile - sets --keyboard-height CSS var so the modal
	// container shrinks via calc(100dvh - var(--keyboard-height, 0px)), keeping the
	// composer visible above the iOS keyboard.
	// In embedded mode, isOpen may stay false — treat embedded as always "open".
	$effect(() => {
		const isActive = embedded || isOpen;
		if (!browser || !isActive || !composerContainer) {
			if (keyboardAvoidingCleanup) {
				keyboardAvoidingCleanup();
				keyboardAvoidingCleanup = null;
			}
			return;
		}

		keyboardAvoidingCleanup = initKeyboardAvoiding({
			element: composerContainer,
			applyTransform: false,
			setCSSProperty: true,
			onKeyboardChange: (isVisible) => {
				if (!isVisible || !messagesContainer || userHasScrolled) return;
				const syncScrollToBottom = () => {
					if (!messagesContainer || userHasScrolled) return;
					messagesContainer.scrollTop = messagesContainer.scrollHeight;
				};
				if (typeof requestAnimationFrame === 'function') {
					requestAnimationFrame(syncScrollToBottom);
					return;
				}
				setTrackedTimeout(syncScrollToBottom, 0);
			}
		});

		return () => {
			if (keyboardAvoidingCleanup) {
				keyboardAvoidingCleanup();
				keyboardAvoidingCleanup = null;
			}
		};
	});

	// ========================================================================
	// Tool Display Presenter (extracted — see agent-chat-tool-presenter.ts)
	// ========================================================================

	const presenter: ToolPresenter = createToolPresenter({
		getContextType: () => selectedContextType,
		getEntityId: () => selectedEntityId,
		getContextLabel: () => selectedContextLabel,
		getProjectFocus: () => projectFocus,
		getResolvedProjectFocus: () => resolvedProjectFocus,
		toast: {
			success: (msg) => toastService.success(msg),
			error: (msg) => toastService.error(msg)
		},
		isDev: dev
	});

	$effect(() => {
		if (resolvedProjectFocus?.projectId && resolvedProjectFocus.projectName) {
			presenter.cacheEntityName(
				'project',
				resolvedProjectFocus.projectId,
				resolvedProjectFocus.projectName
			);
		}
		if (
			resolvedProjectFocus?.focusType &&
			resolvedProjectFocus.focusType !== 'project-wide' &&
			resolvedProjectFocus.focusEntityId &&
			resolvedProjectFocus.focusEntityName
		) {
			presenter.cacheEntityName(
				resolvedProjectFocus.focusType as OntologyEntityKind,
				resolvedProjectFocus.focusEntityId,
				resolvedProjectFocus.focusEntityName
			);
		}
		if (selectedEntityId && selectedContextLabel) {
			const inferredKind = isProjectContext(selectedContextType) ? 'project' : 'entity';
			presenter.cacheEntityName(inferredKind, selectedEntityId, selectedContextLabel);
		}
	});

	// ========================================================================
	// Thinking Block Management Functions
	// ========================================================================

	function createThinkingBlock(): string {
		const blockId = crypto.randomUUID();
		const thinkingBlock: ThinkingBlockMessage = {
			id: blockId,
			type: 'thinking_block',
			activities: [],
			status: 'active',
			agentState: 'thinking',
			isCollapsed: false,
			content: 'BuildOS thinking...',
			timestamp: new Date()
		};
		messages = [...messages, thinkingBlock];
		currentThinkingBlockId = blockId;
		return blockId;
	}

	function ensureThinkingBlock(): string {
		if (currentThinkingBlockId) return currentThinkingBlockId;
		return createThinkingBlock();
	}

	function updateThinkingBlock(
		blockId: string | null,
		updater: (block: ThinkingBlockMessage) => ThinkingBlockMessage | null | undefined
	) {
		if (!blockId) return;
		const index = messages.findIndex(
			(msg) => msg.id === blockId && msg.type === 'thinking_block'
		);
		if (index === -1) return;

		const block = messages[index] as ThinkingBlockMessage;
		const nextBlock = updater(block);
		if (!nextBlock || nextBlock === block) return;

		const nextMessages = [...messages];
		nextMessages[index] = nextBlock;
		messages = nextMessages;
	}

	function addActivityToThinkingBlock(
		content: string,
		activityType: ActivityType,
		metadata?: Record<string, any>,
		status?: ActivityEntry['status']
	) {
		const blockId = ensureThinkingBlock();
		const activity: ActivityEntry = {
			id: crypto.randomUUID(),
			content,
			timestamp: new Date(),
			activityType,
			metadata,
			status
		};

		updateThinkingBlock(blockId, (block) => ({
			...block,
			activities: [...block.activities, activity]
		}));
	}

	function upsertSkillActivityInThinkingBlock(event: SkillActivityEvent) {
		const blockId = ensureThinkingBlock();
		updateThinkingBlock(blockId, (block) => ({
			...block,
			activities: upsertSkillActivityEntries(block.activities, event)
		}));
	}

	function upsertOperationActivityInThinkingBlock(
		operation: Record<string, unknown>,
		format: {
			message: string;
			activityStatus: ActivityEntry['status'];
		}
	) {
		const blockId = ensureThinkingBlock();
		updateThinkingBlock(blockId, (block) => ({
			...block,
			activities: upsertOperationActivityEntries(block.activities, operation, format)
		}));
	}

	function updateThinkingBlockState(state: AgentLoopState, details?: string) {
		updateThinkingBlock(currentThinkingBlockId, (block) => ({
			...block,
			agentState: state,
			content: details || AGENT_STATE_MESSAGES[state]
		}));
	}

	function finalizeThinkingBlock(
		status: 'completed' | 'interrupted' | 'cancelled' | 'error' = 'completed',
		note?: string
	) {
		if (!currentThinkingBlockId) return;

		updateThinkingBlock(currentThinkingBlockId, (block) => ({
			...block,
			status,
			content:
				note ??
				(status === 'interrupted'
					? 'Interrupted'
					: status === 'cancelled'
						? 'Cancelled'
						: status === 'error'
							? 'Error'
							: 'Complete')
		}));

		currentThinkingBlockId = null;
	}

	function toggleThinkingBlockCollapse(blockId: string) {
		updateThinkingBlock(blockId, (block) => ({
			...block,
			isCollapsed: !block.isCollapsed
		}));
	}

	interface ActivityUpdateResult {
		matched: boolean;
		toolName?: string;
		args?: string | Record<string, unknown>;
	}

	function updateActivityStatus(
		toolCallId: string,
		status: 'completed' | 'failed',
		errorMessage?: string
	): ActivityUpdateResult {
		if (!currentThinkingBlockId) return { matched: false };

		let matchFound = false;
		let foundToolName: string | undefined;
		let foundArgs: string | Record<string, unknown> | undefined;

		updateThinkingBlock(currentThinkingBlockId, (block) => {
			const activityIndex = block.activities.findIndex(
				(activity) =>
					activity.toolCallId === toolCallId && activity.activityType === 'tool_call'
			);

			if (activityIndex === -1) {
				return block;
			}

			matchFound = true;
			const activity = block.activities[activityIndex]!;
			const toolName = activity.metadata?.toolName || 'unknown';
			const args =
				(activity.metadata?.arguments as string | Record<string, unknown> | undefined) ??
				'';
			foundToolName = toolName;
			foundArgs = args;
			const newContent = presenter.formatToolMessage(toolName, args, status, errorMessage);
			const skillActivity =
				toolName === 'skill_load' && status === 'completed'
					? buildSkillLoadActivityEvent('loaded', args)
					: null;

			const updatedActivity: ActivityEntry = {
				...activity,
				id: activity.id,
				timestamp: activity.timestamp,
				activityType: activity.activityType,
				content: newContent,
				status,
				metadata: {
					...activity.metadata,
					status,
					...(errorMessage ? { error: errorMessage } : {}),
					...(skillActivity
						? {
								skillActivity,
								skillPath: skillActivity.path,
								skillVia: skillActivity.via,
								skillAction: skillActivity.action
							}
						: {})
				}
			};

			const nextActivities = [...block.activities];
			nextActivities[activityIndex] = updatedActivity;

			return {
				...block,
				activities: nextActivities
			};
		});

		if (dev && !matchFound) {
			const thinkingBlock = findThinkingBlockById(currentThinkingBlockId, messages);
			console.warn(
				`[AgentChat] No matching tool_call found for tool_call_id: ${toolCallId}`,
				{
					currentThinkingBlockId,
					status,
					activitiesInBlock: thinkingBlock?.activities.map((a) => ({
						id: a.id,
						toolCallId: a.toolCallId,
						type: a.activityType
					}))
				}
			);
		}

		return { matched: matchFound, toolName: foundToolName, args: foundArgs };
	}

	function finalizeSession(reason: 'close' | 'destroy') {
		if (hasFinalizedSession) return;
		const session = currentSession;
		if (!session?.id) return;
		const sessionId = session.id;

		const contextType =
			selectedContextType ?? normalizeSessionContextType(session.context_type);
		const entityId = selectedEntityId ?? session.entity_id ?? null;

		hasFinalizedSession = true;

		const fallbackQueueClassification = () => {
			if (!hasSentMessage) return;
			fetch(`/api/chat/sessions/${sessionId}/classify`, {
				method: 'POST',
				keepalive: true
			}).catch((err) => {
				if (dev) console.warn('[AgentChat] Session classify fallback failed:', err);
			});
		};

		fetch(`/api/chat/sessions/${sessionId}/close`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			keepalive: true,
			body: JSON.stringify({
				context_type: contextType,
				entity_id: entityId,
				reason,
				has_messages_sent: hasSentMessage
			})
		})
			.then((response) => {
				if (!response.ok) {
					if (dev) {
						console.warn(
							`[AgentChat] Session finalize returned ${response.status} for ${sessionId}`
						);
					}
					fallbackQueueClassification();
				}
			})
			.catch((err) => {
				if (dev) console.warn('[AgentChat] Session finalize failed:', err);
				fallbackQueueClassification();
			});
	}

	function handleClose() {
		finalizeSession('close');
		voice.stop();
		cancelSessionBootstrap();
		clearSessionRefreshTimeout();
		activeRestoredTurnRunId = null;
		if (currentStreamController && isStreaming) {
			detachActiveStream();
		} else if (currentStreamController) {
			currentStreamController.abort();
			currentStreamController = null;
			activeTransportStreamRunId = null;
			activeClientTurnId = null;
		}
		voice.cleanup();
		imageAttachments = [];
		cancelQueuedImageUploads();
		revokeAllImagePreviewUrls();

		// Clear any pending tool results to prevent memory leaks
		pendingToolResults.clear();
		hiddenToolCallIds.clear();

		const summary = presenter.buildMutationSummary({
			hasMessagesSent: hasSentMessage,
			sessionId: currentSession?.id ?? null
		});
		if (summary.hasChanges && isProjectContext(selectedContextType) && selectedEntityId) {
			void createProjectInvalidation(selectedEntityId)
				.all()
				.catch((err) => {
					if (dev) {
						console.warn('[AgentChat] Project invalidation failed on close:', err);
					}
				});
		}

		presenter.resetMutationTracking();

		if (onClose) onClose(summary);
	}

	function resolveAttachmentProjectId(): string | null {
		return attachmentProjectId;
	}

	function updateImageAttachment(attachmentId: string, patch: Partial<AgentChatImageAttachment>) {
		imageAttachments = imageAttachments.map((attachment) =>
			attachment.id === attachmentId ? { ...attachment, ...patch } : attachment
		);
	}

	function hasImageAttachment(attachmentId: string): boolean {
		return imageAttachments.some((attachment) => attachment.id === attachmentId);
	}

	function revokePreviewUrl(url: string | null | undefined) {
		if (!url || !activeImagePreviewUrls.has(url)) return;
		URL.revokeObjectURL(url);
		activeImagePreviewUrls.delete(url);
	}

	function revokeAllImagePreviewUrls() {
		for (const url of activeImagePreviewUrls) {
			URL.revokeObjectURL(url);
		}
		activeImagePreviewUrls.clear();
	}

	function cancelQueuedImageUploads() {
		imageAttachmentUploadGeneration += 1;
		imageUploadQueue.length = 0;
	}

	function scheduleNextImageUpload() {
		if (activeImageUploadCount >= AGENT_CHAT_MAX_CONCURRENT_IMAGE_UPLOADS) return;
		const nextUpload = imageUploadQueue.shift();
		if (!nextUpload) return;

		activeImageUploadCount += 1;
		void nextUpload()
			.catch((err) => {
				if (dev) console.warn('[AgentChat] Image attachment upload failed:', err);
			})
			.finally(() => {
				activeImageUploadCount = Math.max(0, activeImageUploadCount - 1);
				scheduleNextImageUpload();
			});
	}

	function enqueueImageUpload(task: () => Promise<void>) {
		imageUploadQueue.push(task);
		scheduleNextImageUpload();
	}

	function removeImageAttachment(attachmentId: string) {
		const attachment = imageAttachments.find((item) => item.id === attachmentId);
		revokePreviewUrl(attachment?.previewUrl);
		imageAttachments = imageAttachments.filter((item) => item.id !== attachmentId);
	}

	function compactAttachmentText(value: unknown, maxChars = 1200): string | null {
		if (typeof value !== 'string') return null;
		const normalized = value.replace(/\s+/g, ' ').trim();
		if (!normalized) return null;
		return normalized.length <= maxChars
			? normalized
			: `${normalized.slice(0, Math.max(0, maxChars - 3))}...`;
	}

	function isTerminalOcrStatus(status: unknown): boolean {
		return status === 'complete' || status === 'failed' || status === 'skipped';
	}

	function shouldPollOcrStatus(status: unknown): boolean {
		return !isTerminalOcrStatus(status);
	}

	function describeAttachmentOcrStatus(status: unknown): string {
		switch (status) {
			case 'complete':
				return 'OCR ready';
			case 'failed':
				return 'OCR failed';
			case 'skipped':
				return 'OCR skipped';
			case 'processing':
				return 'Extracting text...';
			case 'pending':
				return 'OCR queued';
			default:
				return 'OCR queued';
		}
	}

	function applyImageAttachmentAssetSnapshot(attachmentId: string, asset: Record<string, any>) {
		const current = imageAttachments.find((attachment) => attachment.id === attachmentId);
		if (!current || current.assetId !== asset.id) return;
		updateImageAttachment(attachmentId, {
			status: current.status === 'deduped' ? 'deduped' : 'ready',
			statusLabel: describeAttachmentOcrStatus(asset.ocr_status),
			ocrStatus: asset.ocr_status ?? current.ocrStatus ?? 'pending',
			extractionSummary: compactAttachmentText(asset.extraction_summary, 700),
			extractedTextPreview: compactAttachmentText(asset.extracted_text)
		});
		applyMessageAttachmentAssetSnapshot(asset);
	}

	function assetRenderPreviewUrl(assetId: string): string {
		return `/api/onto/assets/${assetId}/render?width=160`;
	}

	function applyMessageAttachmentAssetSnapshot(asset: Record<string, any>) {
		if (!asset?.id) return;
		const assetId = String(asset.id);
		messages = messages.map((message) => {
			if (!message.attachments?.length) return message;
			let messageDidUpdate = false;
			const attachments = message.attachments.map((attachment) => {
				if (attachment.asset_id !== assetId) return attachment;
				messageDidUpdate = true;
				return {
					...attachment,
					file_name: asset.original_filename ?? attachment.file_name ?? null,
					content_type: asset.content_type ?? attachment.content_type ?? null,
					file_size_bytes: asset.file_size_bytes ?? attachment.file_size_bytes ?? null,
					width: asset.width ?? attachment.width ?? null,
					height: asset.height ?? attachment.height ?? null,
					checksum_sha256: asset.checksum_sha256 ?? attachment.checksum_sha256 ?? null,
					ocr_status: asset.ocr_status ?? attachment.ocr_status ?? null,
					extraction_summary:
						compactAttachmentText(asset.extraction_summary, 700) ??
						attachment.extraction_summary ??
						null,
					extracted_text_preview:
						compactAttachmentText(asset.extracted_text) ??
						attachment.extracted_text_preview ??
						null,
					metadata: {
						...(attachment.metadata ?? {}),
						preview_url: assetRenderPreviewUrl(assetId)
					}
				};
			});
			return messageDidUpdate ? { ...message, attachments } : message;
		});
	}

	function scheduleImageAttachmentOcrPoll(
		attachmentId: string,
		assetId: string,
		ocrStatus: unknown,
		attempt = 0
	) {
		if (!browser || !assetId || !shouldPollOcrStatus(ocrStatus)) return;
		if (attempt >= AGENT_CHAT_OCR_POLL_MAX_ATTEMPTS) {
			updateImageAttachment(attachmentId, {
				statusLabel: 'OCR still running'
			});
			return;
		}

		const delay = Math.min(
			AGENT_CHAT_OCR_POLL_MAX_DELAY_MS,
			AGENT_CHAT_OCR_POLL_INITIAL_DELAY_MS + attempt * 1000
		);
		setTrackedTimeout(() => {
			void pollImageAttachmentOcrStatus(attachmentId, assetId, attempt + 1);
		}, delay);
	}

	async function pollImageAttachmentOcrStatus(
		attachmentId: string,
		assetId: string,
		attempt: number
	) {
		const current = imageAttachments.find((attachment) => attachment.id === attachmentId);
		if (!current || current.assetId !== assetId || !shouldPollOcrStatus(current.ocrStatus)) {
			return;
		}

		try {
			const response = await fetch(`/api/onto/assets/${assetId}`);
			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(payload?.error ?? 'Failed to refresh attachment OCR');
			}
			const asset = payload?.data?.asset;
			if (!asset?.id || asset.id !== assetId) return;
			applyImageAttachmentAssetSnapshot(attachmentId, asset);
			scheduleImageAttachmentOcrPoll(attachmentId, assetId, asset.ocr_status, attempt);
		} catch {
			scheduleImageAttachmentOcrPoll(attachmentId, assetId, current.ocrStatus, attempt);
		}
	}

	function scheduleMessageAttachmentOcrPoll(
		messageId: string,
		assetId: string,
		ocrStatus: unknown,
		attempt = 0
	) {
		if (!browser || !messageId || !assetId || !shouldPollOcrStatus(ocrStatus)) return;
		if (attempt >= AGENT_CHAT_OCR_POLL_MAX_ATTEMPTS) return;
		const delay = Math.min(
			AGENT_CHAT_OCR_POLL_MAX_DELAY_MS,
			AGENT_CHAT_OCR_POLL_INITIAL_DELAY_MS + attempt * 1000
		);
		setTrackedTimeout(() => {
			void pollMessageAttachmentOcrStatus(messageId, assetId, attempt + 1);
		}, delay);
	}

	async function pollMessageAttachmentOcrStatus(
		messageId: string,
		assetId: string,
		attempt: number
	) {
		const message = messages.find((item) => item.id === messageId);
		const attachment = message?.attachments?.find((item) => item.asset_id === assetId);
		if (!attachment || !shouldPollOcrStatus(attachment.ocr_status)) return;

		try {
			const response = await fetch(`/api/onto/assets/${assetId}`);
			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(payload?.error ?? 'Failed to refresh attachment OCR');
			}
			const asset = payload?.data?.asset;
			if (!asset?.id || asset.id !== assetId) return;
			applyMessageAttachmentAssetSnapshot(asset);
			scheduleMessageAttachmentOcrPoll(messageId, assetId, asset.ocr_status, attempt);
		} catch {
			scheduleMessageAttachmentOcrPoll(messageId, assetId, attachment.ocr_status, attempt);
		}
	}

	async function computeSha256(file: File): Promise<string> {
		const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
		return Array.from(new Uint8Array(digest))
			.map((byte) => byte.toString(16).padStart(2, '0'))
			.join('');
	}

	async function readImageDimensions(
		file: File
	): Promise<{ width: number; height: number } | null> {
		if (typeof createImageBitmap !== 'undefined') {
			const bitmap = await createImageBitmap(file);
			const dimensions = { width: bitmap.width, height: bitmap.height };
			bitmap.close();
			return dimensions;
		}
		return null;
	}

	function isDuplicateAttachmentChecksum(attachmentId: string, checksum: string): boolean {
		return imageAttachments.some(
			(attachment) => attachment.id !== attachmentId && attachment.checksumSha256 === checksum
		);
	}

	async function uploadImageAttachment(
		attachmentId: string,
		file: File,
		projectId: string | null
	) {
		try {
			if (!hasImageAttachment(attachmentId)) return;
			updateImageAttachment(attachmentId, {
				status: 'hashing',
				statusLabel: 'Preparing image...'
			});

			const [checksumSha256, dimensions] = await Promise.all([
				computeSha256(file),
				readImageDimensions(file).catch(() => null)
			]);

			if (!hasImageAttachment(attachmentId)) return;
			if (isDuplicateAttachmentChecksum(attachmentId, checksumSha256)) {
				updateImageAttachment(attachmentId, {
					status: 'error',
					statusLabel: 'Duplicate image',
					error: 'This image is already attached to the draft.',
					checksumSha256
				});
				return;
			}

			if (!hasImageAttachment(attachmentId)) return;
			updateImageAttachment(attachmentId, {
				status: 'uploading',
				statusLabel: 'Uploading...',
				checksumSha256,
				width: dimensions?.width ?? null,
				height: dimensions?.height ?? null
			});

			const createResponse = await fetch('/api/agent/chat-attachments', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					project_id: projectId ?? null,
					file_name: file.name || 'image',
					content_type: file.type || 'image/jpeg',
					file_size_bytes: file.size,
					checksum_sha256: checksumSha256,
					width: dimensions?.width ?? null,
					height: dimensions?.height ?? null,
					metadata: {
						source_component: 'agent_chat_composer'
					}
				})
			});
			const createPayload = await createResponse.json().catch(() => null);
			if (!createResponse.ok) {
				throw new Error(createPayload?.error ?? 'Failed to create image attachment');
			}

			const asset = createPayload?.data?.asset;
			if (!asset?.id) {
				throw new Error('Attachment asset metadata missing from server response');
			}

			if (createPayload?.data?.upload?.signed_url) {
				const uploadResponse = await fetch(createPayload.data.upload.signed_url, {
					method: 'PUT',
					headers: {
						'Content-Type': file.type || 'application/octet-stream'
					},
					body: file
				});
				if (!uploadResponse.ok) {
					throw new Error('Storage upload failed');
				}

				if (!asset.project_id || asset.kind === 'temporary_file') {
					updateImageAttachment(attachmentId, {
						status: 'ready',
						statusLabel: 'Ready to analyze',
						attachmentKind: 'temporary_file',
						assetId: asset.id,
						projectId: null,
						storageBucket: asset.storage_bucket ?? null,
						storagePath: asset.storage_path ?? null,
						ocrStatus: asset.ocr_status ?? 'skipped',
						expiresAt: asset.expires_at ?? null
					});
					return;
				}

				updateImageAttachment(attachmentId, {
					status: 'processing',
					statusLabel: 'Queueing OCR...',
					attachmentKind: 'onto_asset',
					assetId: asset.id,
					projectId: asset.project_id,
					storageBucket: asset.storage_bucket ?? null,
					storagePath: asset.storage_path ?? null,
					ocrStatus: asset.ocr_status ?? 'pending'
				});

				const completeResponse = await fetch(`/api/onto/assets/${asset.id}/complete`, {
					method: 'POST'
				});
				const completePayload = await completeResponse.json().catch(() => null);
				if (!completeResponse.ok) {
					throw new Error(completePayload?.error ?? 'Failed to queue OCR');
				}

				const completedAsset = completePayload?.data?.asset ?? asset;
				updateImageAttachment(attachmentId, {
					status: 'ready',
					statusLabel: describeAttachmentOcrStatus(completedAsset.ocr_status),
					attachmentKind: 'onto_asset',
					assetId: completedAsset.id,
					projectId: completedAsset.project_id,
					storageBucket: completedAsset.storage_bucket ?? null,
					storagePath: completedAsset.storage_path ?? null,
					ocrStatus: completedAsset.ocr_status ?? 'pending',
					extractionSummary: compactAttachmentText(
						completedAsset.extraction_summary,
						700
					),
					extractedTextPreview: compactAttachmentText(completedAsset.extracted_text)
				});
				scheduleImageAttachmentOcrPoll(
					attachmentId,
					completedAsset.id,
					completedAsset.ocr_status ?? 'pending'
				);
				return;
			}

			updateImageAttachment(attachmentId, {
				status: 'deduped',
				statusLabel:
					asset.ocr_status === 'complete'
						? 'Existing OCR ready'
						: describeAttachmentOcrStatus(asset.ocr_status),
				attachmentKind: 'onto_asset',
				assetId: asset.id,
				projectId: asset.project_id,
				storageBucket: asset.storage_bucket ?? null,
				storagePath: asset.storage_path ?? null,
				ocrStatus: asset.ocr_status ?? 'pending',
				extractionSummary: compactAttachmentText(asset.extraction_summary, 700),
				extractedTextPreview: compactAttachmentText(asset.extracted_text)
			});
			scheduleImageAttachmentOcrPoll(attachmentId, asset.id, asset.ocr_status ?? 'pending');
		} catch (err) {
			const message =
				err instanceof Error ? err.message : 'Failed to upload image attachment';
			updateImageAttachment(attachmentId, {
				status: 'error',
				statusLabel: 'Upload failed',
				error: message
			});
			toastService.error(message);
		}
	}

	function handleImageAttachmentFiles(files: File[]) {
		if (!browser) return;
		const projectId = resolveAttachmentProjectId();

		const imageFiles = files.filter((file) => file.type.startsWith('image/'));
		if (imageFiles.length === 0) {
			toastService.error('Drop an image file to attach it.');
			return;
		}
		if (imageFiles.length < files.length) {
			toastService.error(
				'Only image files can be attached here; unsupported files were skipped.'
			);
		}

		const remaining = AGENT_CHAT_MAX_IMAGE_ATTACHMENTS - imageAttachments.length;
		if (remaining <= 0) {
			toastService.error(
				`Attach up to ${AGENT_CHAT_MAX_IMAGE_ATTACHMENTS} images per message.`
			);
			return;
		}

		const accepted = imageFiles.slice(0, remaining);
		if (imageFiles.length > accepted.length) {
			toastService.error(
				`Only ${AGENT_CHAT_MAX_IMAGE_ATTACHMENTS} images can be attached at once.`
			);
		}

		for (const file of accepted) {
			if (file.size > AGENT_CHAT_MAX_IMAGE_BYTES) {
				toastService.error(`${file.name || 'Image'} exceeds the 25MB limit.`);
				continue;
			}

			const previewUrl = URL.createObjectURL(file);
			activeImagePreviewUrls.add(previewUrl);
			const attachmentId = crypto.randomUUID();
			const uploadGeneration = imageAttachmentUploadGeneration;
			imageAttachments = [
				...imageAttachments,
				{
					id: attachmentId,
					fileName: file.name || 'image',
					contentType: file.type || 'image/jpeg',
					fileSizeBytes: file.size,
					previewUrl,
					status: 'hashing',
					statusLabel: 'Preparing image...'
				}
			];
			enqueueImageUpload(async () => {
				if (uploadGeneration !== imageAttachmentUploadGeneration) return;
				await uploadImageAttachment(attachmentId, file, projectId);
			});
		}
	}

	function handleAttachExistingImage(asset: OntologyImageAsset) {
		if (!asset?.id) return;
		if (imageAttachments.length >= AGENT_CHAT_MAX_IMAGE_ATTACHMENTS) {
			toastService.error(
				`Attach up to ${AGENT_CHAT_MAX_IMAGE_ATTACHMENTS} images per message.`
			);
			return;
		}
		if (imageAttachments.some((attachment) => attachment.assetId === asset.id)) {
			toastService.error('This image is already attached to the draft.');
			return;
		}

		const attachmentId = crypto.randomUUID();
		const previewUrl = assetRenderPreviewUrl(asset.id);
		imageAttachments = [
			...imageAttachments,
			{
				id: attachmentId,
				fileName: asset.original_filename || asset.caption || 'Project image',
				contentType: asset.content_type || 'image/jpeg',
				fileSizeBytes: Number(asset.file_size_bytes ?? 0),
				previewUrl,
				status: 'ready',
				statusLabel: describeAttachmentOcrStatus(asset.ocr_status),
				attachmentKind: 'onto_asset',
				assetId: asset.id,
				projectId: asset.project_id,
				storageBucket: asset.storage_bucket ?? null,
				storagePath: asset.storage_path ?? null,
				checksumSha256: asset.checksum_sha256 ?? undefined,
				width: asset.width ?? null,
				height: asset.height ?? null,
				ocrStatus: asset.ocr_status ?? 'pending',
				extractionSummary: compactAttachmentText(asset.extraction_summary, 700),
				extractedTextPreview: compactAttachmentText(asset.extracted_text)
			}
		];
		showExistingImagePicker = false;
		scheduleImageAttachmentOcrPoll(attachmentId, asset.id, asset.ocr_status ?? 'pending');
	}

	function imageAttachmentToRef(
		attachment: AgentChatImageAttachment,
		index: number,
		includePreviewUrl = false
	): ChatAttachmentRef {
		const isTemporary = attachment.attachmentKind === 'temporary_file' || !attachment.projectId;
		const previewUrl =
			includePreviewUrl && attachment.assetId
				? isTemporary
					? attachment.previewUrl
					: assetRenderPreviewUrl(attachment.assetId)
				: null;
		return {
			attachment_kind: isTemporary ? 'temporary_file' : 'onto_asset',
			media_type: 'image',
			asset_id: isTemporary ? undefined : attachment.assetId,
			temporary_attachment_id: isTemporary ? attachment.assetId : undefined,
			project_id: isTemporary ? null : (attachment.projectId ?? resolveAttachmentProjectId()),
			storage_bucket: isTemporary ? (attachment.storageBucket ?? null) : null,
			storage_path: isTemporary ? (attachment.storagePath ?? null) : null,
			file_name: attachment.fileName,
			content_type: attachment.contentType,
			file_size_bytes: attachment.fileSizeBytes,
			width: attachment.width ?? null,
			height: attachment.height ?? null,
			checksum_sha256: attachment.checksumSha256 ?? null,
			ocr_status: attachment.ocrStatus ?? null,
			extraction_summary: attachment.extractionSummary ?? null,
			extracted_text_preview: attachment.extractedTextPreview ?? null,
			role: 'analysis_target',
			display_order: index,
			expires_at: attachment.expiresAt ?? null,
			metadata: previewUrl ? { preview_url: previewUrl } : null
		};
	}

	function buildReadyImageAttachmentRefs(includePreviewUrl = false): ChatAttachmentRef[] {
		return imageAttachments
			.filter(
				(attachment) =>
					Boolean(attachment.assetId) &&
					(attachment.status === 'ready' || attachment.status === 'deduped')
			)
			.map((attachment, index) => imageAttachmentToRef(attachment, index, includePreviewUrl));
	}

	function handleSelectSuggestion(text: string) {
		if (isStreaming || isSessionBusy) return;
		inputValue = text;
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape' && isStreaming) {
			event.preventDefault();
			void handleStopGeneration('user_cancelled');
			return;
		}

		// On touch/mobile devices, Enter should insert a newline (natural typing behavior)
		// Only desktop users can send with Enter; mobile users use the send button
		if (event.key === 'Enter' && !event.shiftKey && !isTouchDevice) {
			event.preventDefault();
			// If streaming, sendMessage will stop current run first
			// Use handleSendMessage to properly handle "send while recording" flow
			if (!isSendDisabled || isStreaming || voice.isRecording) {
				handleSendMessage();
			}
		}
	}

	// Handles "send while recording" - stops recording and auto-sends after transcription
	async function handleSendMessage() {
		// Haptic feedback for message send action (mobile)
		haptic('medium');

		// If currently recording, stop and queue auto-send after transcription
		if (voice.isRecording) {
			voice.pendingSendAfterTranscription = true;
			await voice.stop();
			return; // The $effect below will auto-send when transcription completes
		}
		sendMessage();
	}

	// Auto-send after transcription completes (when user clicked send while recording)
	$effect(() => {
		if (!browser) return;
		if (!voice.pendingSendAfterTranscription) return;
		if (voice.isRecording || voice.isStopping || voice.isTranscribing || voice.isInitializing) {
			return;
		}

		if (inputValue.trim() || hasSendableImageAttachments) {
			voice.pendingSendAfterTranscription = false;
			sendMessage();
			return;
		}

		voice.pendingSendAfterTranscription = false;
	});

	async function sendMessage(
		contentOverride?: string,
		options: { senderType?: 'user' | 'agent_peer'; suppressInputClear?: boolean } = {}
	) {
		const { senderType = 'user', suppressInputClear = false } = options;
		const trimmed = (contentOverride ?? inputValue).trim();
		const streamAttachmentRefs =
			senderType === 'user' ? buildReadyImageAttachmentRefs(false) : [];
		const optimisticAttachmentRefs =
			senderType === 'user' ? buildReadyImageAttachmentRefs(true) : [];
		const sentImageAttachments = imageAttachments;
		const activeVoiceNoteGroupId = voice.noteGroupId;
		if (
			(!trimmed && streamAttachmentRefs.length === 0) ||
			voice.isInitializing ||
			voice.isStopping ||
			voice.isTranscribing
		) {
			return;
		}
		if (senderType === 'user' && imageAttachments.length > streamAttachmentRefs.length) {
			error = 'Wait for image upload and OCR queueing to finish, or remove failed images.';
			return;
		}
		if (!selectedContextType) {
			error = 'Select a focus before starting the conversation.';
			return;
		}
		if (isLoadingSession) {
			error = 'Wait for the existing session to finish loading.';
			return;
		}
		if (activeRestoredTurnRunId) {
			error = 'BuildOS is still finishing the latest response.';
			return;
		}
		if (isStartingStream) return;

		isStartingStream = true;
		let userMessage: UIMessage | null = null;
		let runId: number | null = null;
		let streamController: AbortController | null = null;

		try {
			if (isStreaming) {
				await handleStopGeneration('superseded', { awaitCancelHint: true });
			}

			const requestContextType = selectedContextType;
			const requestEntityId = selectedEntityId;
			const requestProjectFocus = resolvedProjectFocus;
			let sessionForTurn = currentSession;
			if (!sessionForTurn?.id) {
				try {
					sessionForTurn = await ensureSessionReady(
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
					error =
						sessionError instanceof Error
							? sessionError.message
							: 'Unable to prepare a chat session right now.';
					return;
				}
			}

			if (!sessionForTurn?.id) {
				error = 'Unable to prepare a chat session right now.';
				return;
			}

			const now = new Date();
			const clientTurnId = crypto.randomUUID();
			const transportStreamRunId = crypto.randomUUID();

			// Add user message
			userMessage = {
				id: crypto.randomUUID(),
				session_id: sessionForTurn.id,
				user_id: undefined, // Will be set by backend
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

			messages = [...messages, userMessage];
			for (const attachment of optimisticAttachmentRefs) {
				if (attachment.asset_id) {
					scheduleMessageAttachmentOcrPoll(
						userMessage.id,
						attachment.asset_id,
						attachment.ocr_status ?? 'pending'
					);
				}
			}
			hasSentMessage = true;
			if (!suppressInputClear) {
				inputValue = '';
				imageAttachments = [];
				showExistingImagePicker = false;
			}
			if (activeVoiceNoteGroupId) {
				voice.noteGroupId = null;
			}
			error = null;

			// Increment run id for stale-stream guard
			activeStreamRunId = activeStreamRunId + 1;
			runId = activeStreamRunId;
			activeTransportStreamRunId = transportStreamRunId;
			activeClientTurnId = clientTurnId;
			activeStreamTiming = buildClientStreamTimingState(runId);

			isStreaming = true;
			pendingToolResults.clear();
			hiddenToolCallIds.clear();

			createThinkingBlock();

			currentActivity = 'Analyzing request...';
			updateThinkingBlockState('thinking', 'BuildOS is processing your request...');

			// NOTE: Do NOT reset lastTurnContext here - it should be preserved and sent with the next request
			// for conversation continuity. The server will generate fresh context after each turn.

			// Reset scroll flag so we always scroll to show new user message
			userHasScrolled = false;

			let receivedStreamEvent = false;

			streamController = new AbortController();
			currentStreamController = streamController;
			isStartingStream = false;

			const matchingPrewarmedContext = prewarm.matchingFreshContext(
				prewarm.resolveCurrentKey()
			);
			const matchingPreparedPrompt = prewarm.matchingFreshPreparedPrompt(
				prewarm.resolveCurrentKey()
			);
			prewarm.clearPreparedPrompt();

			const response = await fetch('/api/agent/v2/stream', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				signal: streamController.signal,
				body: JSON.stringify({
					message: trimmed,
					session_id: sessionForTurn.id,
					context_type: requestContextType,
					entity_id: requestEntityId,
					attachments: streamAttachmentRefs,
					projectFocus: requestProjectFocus,
					lastTurnContext: lastTurnContext, // Pass last turn context for conversation continuity
					stream_run_id: transportStreamRunId,
					client_turn_id: clientTurnId,
					voiceNoteGroupId: activeVoiceNoteGroupId,
					prewarmedContext: matchingPrewarmedContext,
					preparedPromptKey: matchingPreparedPrompt?.key ?? null
				})
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const callbacks: StreamCallbacks = {
				onProgress: (data: any) => {
					if (runId !== activeStreamRunId) {
						if (!currentSession?.id && data?.type === 'session' && data?.session) {
							hydrateSessionFromEvent(data.session as ChatSession);
						}
						return;
					}
					receivedStreamEvent = true;
					recordClientStreamEvent(
						runId,
						(data?.type as AgentSSEMessage['type']) ?? 'text'
					);
					handleSSEMessage(data as AgentSSEMessage);
				},
				onError: (err) => {
					if (runId !== activeStreamRunId) return;
					recordClientStreamEvent(runId, 'transport_error');
					console.error('SSE error:', err);
					error =
						typeof err === 'string' ? err : 'Connection error occurred while streaming';
					isStreaming = false;
					currentActivity = '';
					currentStreamController = null;
					activeTransportStreamRunId = null;
					activeClientTurnId = null;
					finalizeThinkingBlock('error');
					flushAssistantText();
					finalizeAssistantMessage();
					finalizeClientStreamTiming(runId, 'error', 'error');
				},
				onComplete: () => {
					if (runId !== activeStreamRunId) return;
					isStreaming = false;
					currentActivity = '';
					currentStreamController = null;
					activeClientTurnId = null;
					if (!receivedStreamEvent && !error) {
						error = 'BuildOS did not return a response. Please try again.';
					}
					activeTransportStreamRunId = null;
					finalizeThinkingBlock('completed');
					flushAssistantText();
					finalizeAssistantMessage();
					finalizeClientStreamTiming(runId, error ? 'error' : 'completed');
				}
			};

			await SSEProcessor.processStream(response, callbacks, {
				timeout: 0, // Disable inactivity timeouts for long-running streams
				parseJSON: true,
				signal: streamController.signal
			});
		} catch (err) {
			currentStreamController = null;
			if ((err as DOMException)?.name === 'AbortError') {
				if (runId === null || runId !== activeStreamRunId) {
					// This stream was superseded; ignore abort cleanup
					return;
				}
				isStreaming = false;
				currentActivity = '';
				activeTransportStreamRunId = null;
				activeClientTurnId = null;
				finalizeThinkingBlock('interrupted', 'Stopped');
				flushAssistantText();
				finalizeAssistantMessage();
				finalizeClientStreamTiming(runId, 'aborted');
				return;
			}

			console.error('Failed to send message:', err);
			error = 'Failed to send message. Please try again.';
			isStreaming = false;
			currentActivity = '';
			activeTransportStreamRunId = null;
			activeClientTurnId = null;
			finalizeThinkingBlock('error'); // Ensure thinking block is closed on error
			flushAssistantText();
			finalizeAssistantMessage();
			if (runId !== null) {
				finalizeClientStreamTiming(runId, 'error', 'error');
			}

			// Remove user message on error
			const failedUserMessageId = userMessage?.id;
			if (failedUserMessageId) {
				messages = messages.filter((m) => m.id !== failedUserMessageId);
			}
			inputValue = trimmed;
			if (!suppressInputClear && sentImageAttachments.length > 0) {
				imageAttachments = sentImageAttachments;
			}
		} finally {
			isStartingStream = false;
			if (currentStreamController === streamController) {
				currentStreamController = null;
			}
		}
	}

	function hydrateSessionFromEvent(sessionEvent: ChatSession) {
		currentSession = sessionEvent;
		const sessionTitle = deriveSessionTitle(sessionEvent);
		const normalizedSessionContext = normalizeSessionContextType(sessionEvent.context_type);
		if (!selectedContextType) {
			selectedContextType = normalizedSessionContext;
			selectedEntityId = sessionEvent.entity_id ?? undefined;
			selectedContextLabel =
				sessionTitle ||
				CONTEXT_DESCRIPTORS[normalizedSessionContext]?.title ||
				selectedContextLabel;
			showContextSelection = false;
		} else if (sessionTitle) {
			// Update the label when the session already exists but now has a better title
			selectedContextLabel = sessionTitle;
		}

		if (normalizedSessionContext === 'project' && sessionEvent.entity_id && !projectFocus) {
			projectFocus = buildProjectWideFocus(
				sessionEvent.entity_id,
				sessionTitle ?? selectedContextLabel
			);
		}

		const metadataFocus = (
			(sessionEvent.agent_metadata as { focus?: ProjectFocus | null }) ?? null
		)?.focus;
		if (metadataFocus) {
			projectFocus = metadataFocus;
		}
	}

	const sseHandlerDeps: SSEHandlerDeps = {
		presenter,
		thinking: {
			ensure: ensureThinkingBlock,
			update: updateThinkingBlock,
			addActivity: addActivityToThinkingBlock,
			updateState: updateThinkingBlockState,
			upsertSkillActivity: upsertSkillActivityInThinkingBlock,
			upsertOperationActivity: upsertOperationActivityInThinkingBlock,
			updateActivityStatus,
			finalize: finalizeThinkingBlock,
			getCurrentBlockId: () => currentThinkingBlockId
		},
		state: {
			getMessages: () => messages,
			getInputValue: () => inputValue,
			getCurrentSession: () => currentSession,
			getSelectedContextLabel: () => selectedContextLabel,
			getActiveStreamRunId: () => activeStreamRunId,
			isAgentToAgentMode: () => agentToAgentMode,
			getAgentLoopActive: () => agentLoopActive,
			getAgentTurnsRemaining: () => agentTurnsRemaining,
			setContextUsage: (usage, overheadTokens) => {
				contextUsage = usage;
				contextUsageOverheadTokens = overheadTokens;
			},
			setLastTurnContext: (ctx) => {
				lastTurnContext = ctx;
			},
			setProjectFocus: (focus) => {
				projectFocus = focus;
			},
			setCurrentActivity: (label) => {
				currentActivity = label;
			},
			setIsStreaming: (value) => {
				isStreaming = value;
			},
			setError: (message) => {
				error = message;
			},
			setSelectedContext: ({ contextType, entityId, label }) => {
				selectedContextType = contextType;
				selectedEntityId = entityId;
				selectedContextLabel = label;
			},
			setShowFocusSelector: (value) => {
				showFocusSelector = value;
			},
			setShowProjectActionSelector: (value) => {
				showProjectActionSelector = value;
			},
			setCurrentSession: (session) => {
				currentSession = session;
			},
			setAgentLoopActive: (value) => {
				agentLoopActive = value;
			},
			setAgentTurnsRemaining: (value) => {
				agentTurnsRemaining = value;
			}
		},
		hydrateSessionFromEvent,
		attachServerTiming,
		bufferAssistantText,
		flushAssistantText,
		finalizeAssistantMessage,
		hiddenToolCallIds,
		pendingToolResults,
		addClarifyingQuestionsMessage,
		logFocusActivity,
		isDev: dev
	};

	const handleSSEMessage = createSSEHandler(sseHandlerDeps);

	function describeFocus(focus: ProjectFocus | null): string {
		if (!focus) return 'project workspace';
		if (focus.focusType === 'project-wide') {
			return `${focus.projectName} (project-wide)`;
		}
		const entityName = focus.focusEntityName ?? 'Selected entity';
		return `${entityName} (${focus.focusType})`;
	}

	function logFocusActivity(action: string, focus: ProjectFocus | null) {
		const details = focus ? describeFocus(focus) : 'project workspace';
		addActivityToThinkingBlock(`${action}: ${details}`, 'context_shift', {
			focus
		});
	}

	function addClarifyingQuestionsMessage(questions: unknown) {
		const normalizedQuestions = Array.isArray(questions)
			? questions
					.map((question) => (typeof question === 'string' ? question.trim() : ''))
					.filter((question) => question.length > 0)
			: [];

		if (normalizedQuestions.length === 0) {
			return;
		}

		const clarificationMessage: UIMessage = {
			id: crypto.randomUUID(),
			type: 'clarification',
			content:
				normalizedQuestions.length === 1
					? 'I need one quick clarification before I continue:'
					: 'I have a few clarifying questions before I continue:',
			data: { questions: normalizedQuestions },
			timestamp: new Date()
		};

		messages = [...messages, clarificationMessage];
	}

	function normalizeMessageContent(value: unknown): string {
		if (typeof value === 'string') {
			return value;
		}

		if (value == null) {
			return '';
		}

		if (Array.isArray(value)) {
			return value.map((segment) => normalizeMessageContent(segment)).join('');
		}

		if (typeof value === 'object') {
			const maybeText = (value as { text?: unknown }).text;
			if (typeof maybeText === 'string') {
				return maybeText;
			}

			const maybeContent = (value as { content?: unknown }).content;
			if (typeof maybeContent === 'string') {
				return maybeContent;
			}

			try {
				return JSON.stringify(value, null, 2);
			} catch {
				return String(value);
			}
		}

		return String(value);
	}

	function scheduleAssistantTextFlush() {
		if (pendingAssistantTextFlushHandle !== null) return;
		if (!browser) {
			flushAssistantText();
			return;
		}

		const raf =
			typeof requestAnimationFrame === 'function'
				? requestAnimationFrame
				: (cb: FrameRequestCallback) => setTimeout(cb, 16);

		pendingAssistantTextFlushHandle = raf(() => {
			pendingAssistantTextFlushHandle = null;
			flushAssistantText();
		});
	}

	function bufferAssistantText(content: unknown) {
		const normalized = normalizeMessageContent(content);
		if (!normalized) return;
		pendingAssistantText += normalized;
		scheduleAssistantTextFlush();
	}

	function flushAssistantText() {
		if (
			pendingAssistantTextFlushHandle !== null &&
			typeof cancelAnimationFrame === 'function'
		) {
			cancelAnimationFrame(pendingAssistantTextFlushHandle);
			pendingAssistantTextFlushHandle = null;
		}
		if (!pendingAssistantText) return;
		const payload = pendingAssistantText;
		pendingAssistantText = '';
		addOrUpdateAssistantMessage(payload);
	}

	function addOrUpdateAssistantMessage(content: unknown) {
		const normalizedContent = normalizeMessageContent(content);

		if (currentAssistantMessageId && currentAssistantMessageIndex !== null) {
			const existing = messages[currentAssistantMessageIndex];
			if (existing?.id === currentAssistantMessageId) {
				const nextMessages = [...messages];
				nextMessages[currentAssistantMessageIndex] = {
					...existing,
					content: existing.content + normalizedContent
				};
				messages = nextMessages;
				return;
			}
		}

		if (currentAssistantMessageId) {
			let updatedIndex: number | null = null;
			messages = messages.map((m, idx) => {
				if (m.id === currentAssistantMessageId) {
					updatedIndex = idx;
					return { ...m, content: m.content + normalizedContent };
				}
				return m;
			});
			currentAssistantMessageIndex = updatedIndex;
		} else {
			// Create new assistant message
			currentAssistantMessageId = crypto.randomUUID();
			const assistantMessage: UIMessage = {
				id: currentAssistantMessageId,
				type: 'assistant',
				role: 'assistant' as ChatRole,
				content: normalizedContent,
				timestamp: new Date(),
				created_at: new Date().toISOString()
			};
			currentAssistantMessageIndex = messages.length;
			messages = [...messages, assistantMessage];
		}
	}

	function finalizeAssistantMessage() {
		currentAssistantMessageId = null;
		currentAssistantMessageIndex = null;
	}

	function markAssistantInterrupted(
		reason: 'user_cancelled' | 'superseded' | 'error',
		streamRunId = activeTransportStreamRunId
	) {
		if (!currentAssistantMessageId) return;
		messages = messages.map((msg) =>
			msg.id === currentAssistantMessageId
				? {
						...msg,
						metadata: {
							...msg.metadata,
							interrupted: true,
							interrupted_reason: reason,
							...(streamRunId ? { stream_run_id: streamRunId } : {})
						}
					}
				: msg
		);
	}

	async function reportStreamCancellationReason(
		reason: 'user_cancelled' | 'superseded',
		streamRunId: string,
		options: { awaitAck?: boolean } = {}
	): Promise<void> {
		const payload = {
			session_id: currentSession?.id,
			stream_run_id: streamRunId,
			client_turn_id: activeClientTurnId ?? undefined,
			reason
		};
		const request = fetch('/api/agent/v2/stream/cancel', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			keepalive: true,
			body: JSON.stringify(payload)
		}).catch((cancelError) => {
			if (dev) {
				console.debug(
					'[AgentChat] Failed to report stream cancellation reason',
					cancelError
				);
			}
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

	function detachActiveStream() {
		if (!currentStreamController) return;

		const runId = activeStreamRunId;
		const streamController = currentStreamController;

		flushAssistantText();
		finalizeClientStreamTiming(runId, 'aborted');
		activeStreamRunId = activeStreamRunId + 1;
		activeTransportStreamRunId = null;
		activeClientTurnId = null;

		try {
			streamController.abort();
		} catch (abortError) {
			if (dev) {
				console.debug('Stream detach failed (already closed)', abortError);
			}
		}

		if (currentStreamController === streamController) {
			currentStreamController = null;
		}
		finalizeAssistantMessage();
		isStreaming = false;
		currentActivity = '';
	}

	async function handleStopGeneration(
		reason: 'user_cancelled' | 'superseded' | 'error' = 'user_cancelled',
		options: { awaitCancelHint?: boolean } = {}
	) {
		if (!isStreaming || !currentStreamController) return;

		// Haptic feedback for stop action (mobile) - only for user-initiated stops
		if (reason === 'user_cancelled') {
			haptic('heavy');
		}

		const runId = activeStreamRunId;
		const streamRunId = activeTransportStreamRunId;
		const shouldReportReason = reason === 'user_cancelled' || reason === 'superseded';
		const cancellationReasonPromise =
			shouldReportReason && streamRunId
				? reportStreamCancellationReason(reason, streamRunId, {
						awaitAck: Boolean(options.awaitCancelHint)
					})
				: null;

		// Flush any buffered tokens first so interruption metadata lands on the final visible partial.
		flushAssistantText();
		markAssistantInterrupted(reason, streamRunId);
		finalizeClientStreamTiming(
			runId,
			'cancelled',
			reason === 'user_cancelled' || reason === 'superseded' ? reason : null
		);
		// Invalidate the active run id so late SSE chunks are dropped
		activeStreamRunId = activeStreamRunId + 1;
		activeTransportStreamRunId = null;
		activeClientTurnId = null;

		if (cancellationReasonPromise && options.awaitCancelHint) {
			await cancellationReasonPromise;
		}

		try {
			currentStreamController.abort();
		} catch (abortError) {
			if (dev) {
				console.debug('Abort failed (already closed)', abortError);
			}
		}
		currentStreamController = null;

		finalizeThinkingBlock(
			reason === 'superseded' ? 'cancelled' : 'interrupted',
			reason === 'user_cancelled' ? 'Stopped by you' : 'Stopped'
		);
		finalizeAssistantMessage();

		if (cancellationReasonPromise && !options.awaitCancelHint) {
			void cancellationReasonPromise;
		}

		isStreaming = false;
		currentActivity = '';
	}

	onDestroy(() => {
		// Clear all pending timeouts to prevent memory leaks
		pendingTimeouts.forEach((id) => clearTimeout(id));
		pendingTimeouts.clear();

		if (
			pendingAssistantTextFlushHandle !== null &&
			typeof cancelAnimationFrame === 'function'
		) {
			cancelAnimationFrame(pendingAssistantTextFlushHandle);
			pendingAssistantTextFlushHandle = null;
		}
		pendingAssistantText = '';

		if (sessionLoadController) {
			sessionLoadController.abort();
			sessionLoadController = null;
		}
		cancelSessionBootstrap();
		clearSessionRefreshTimeout();
		finalizeSession('destroy');
		voice.stop();
		if (currentStreamController && isStreaming) {
			detachActiveStream();
		} else if (currentStreamController) {
			currentStreamController.abort();
			currentStreamController = null;
			activeTransportStreamRunId = null;
			activeClientTurnId = null;
		}
		voice.cleanup();
		imageAttachments = [];
		cancelQueuedImageUploads();
		revokeAllImagePreviewUrls();
	});
</script>

{#snippet chatConversationPane(
	showSessionLoadingState: boolean,
	showSessionLoadErrorState: boolean,
	retrySessionId: string | null
)}
	{#if showSessionLoadingState}
		<div
			class="flex flex-1 items-center justify-center bg-muted px-6 py-12 text-center sm:py-16"
		>
			<div class="max-w-sm space-y-3">
				<div class="flex justify-center">
					<span
						class="inline-flex h-8 w-8 animate-spin rounded-full border-[3px] border-muted-foreground/30 border-t-accent"
					></span>
				</div>
				<p class="text-sm font-semibold text-foreground">
					{sessionStatusLabel ?? 'Loading conversation'}
				</p>
				<p class="text-xs text-muted-foreground">
					Restoring the conversation before the next turn.
				</p>
			</div>
		</div>
	{:else if showSessionLoadErrorState}
		<div
			class="flex flex-1 items-center justify-center bg-muted px-6 py-12 text-center sm:py-16"
		>
			<div
				class="max-w-sm space-y-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 shadow-ink tx tx-static tx-weak"
				role="alert"
			>
				<p class="text-sm font-semibold text-destructive">Couldn't load this chat</p>
				<p class="text-xs text-destructive">
					{sessionLoadError}
				</p>
				{#if retrySessionId}
					<button
						type="button"
						class="inline-flex items-center justify-center rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground shadow-ink transition pressable hover:border-accent hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						onclick={() => loadChatSession(retrySessionId)}
					>
						Try again
					</button>
				{/if}
			</div>
		</div>
	{:else}
		<AgentMessageList
			{messages}
			{displayContextLabel}
			{selectedContextType}
			{resolvedProjectFocus}
			onToggleThinkingBlock={toggleThinkingBlockCollapse}
			bind:container={messagesContainer}
			onScroll={handleScroll}
			voiceNotesByGroupId={voice.notesByGroupId}
			onDeleteVoiceNote={voice.removeNoteFromGroup.bind(voice)}
			onSelectSuggestion={handleSelectSuggestion}
		/>
	{/if}

	{#if error && !showSessionLoadErrorState}
		<div
			class="border-t border-destructive/30 bg-destructive/10 p-2 text-xs font-semibold text-destructive tx tx-static tx-weak sm:p-2.5"
			role="alert"
			aria-live="assertive"
		>
			{error}
		</div>
	{/if}
{/snippet}

{#snippet chatComposerFooter()}
	<div
		bind:this={composerContainer}
		class="flex-shrink-0 overflow-visible bg-background/60 px-4 pt-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-5 sm:pt-3"
	>
		{#if showExistingImagePicker && attachmentProjectId}
			<div
				class="mb-2 max-h-72 overflow-y-auto rounded-xl border border-border bg-card p-3 shadow-ink tx tx-grid tx-weak"
				aria-label="Attach existing project image"
			>
				<ProjectImageLibrary
					projectId={attachmentProjectId}
					limit={50}
					compact={true}
					pickerMode={true}
					selectLabel="Attach"
					excludedAssetIds={selectedAttachmentAssetIds}
					showHeader={true}
					title="Project images"
					emptyMessage="No project images available yet."
					onSelectAsset={handleAttachExistingImage}
				/>
			</div>
		{/if}
		<AgentComposer
			bind:voiceInputRef={voice.ref}
			bind:inputValue
			bind:isVoiceRecording={voice.isRecording}
			bind:isVoiceInitializing={voice.isInitializing}
			bind:isVoiceStopping={voice.isStopping}
			bind:isVoiceTranscribing={voice.isTranscribing}
			bind:voiceErrorMessage={voice.errorMessage}
			bind:voiceRecordingDuration={voice.recordingDuration}
			bind:voiceSupportsLiveTranscript={voice.supportsLiveTranscript}
			bind:voiceNoteGroupId={voice.noteGroupId}
			{isStreaming}
			{isSendDisabled}
			allowSendWhileStreaming={isTouchDevice}
			{displayContextLabel}
			disabled={isSessionBusy}
			disabledReason={sessionStatusLabel}
			vocabularyTerms={chatComposerVocabularyTerms}
			{imageAttachments}
			attachmentLimit={AGENT_CHAT_MAX_IMAGE_ATTACHMENTS}
			onAttachmentFiles={handleImageAttachmentFiles}
			canAttachExistingImages={canAttachExistingProjectImages}
			onAttachExistingImages={() => {
				if (!attachmentProjectId) return;
				showExistingImagePicker = !showExistingImagePicker;
			}}
			onRemoveAttachment={removeImageAttachment}
			onVoiceNoteSegmentSaved={voice.handleSegmentSaved.bind(voice)}
			onVoiceNoteSegmentError={voice.handleSegmentError.bind(voice)}
			onKeyDownHandler={handleKeyDown}
			onSend={handleSendMessage}
			onStop={() => void handleStopGeneration('user_cancelled')}
		/>
	</div>
{/snippet}

{#if embedded}
	<!-- Embedded mode: render chat content directly without Modal wrapper.
	     The host surface owns the header chrome; session actions are exposed
	     to it via onSessionChange + ChatSessionAuditActions. -->
	<div class="flex h-full flex-col overflow-hidden bg-card">
		<!-- Embedded chat content area -->
		<div class="relative z-10 flex flex-1 flex-col overflow-hidden bg-card">
			<div class="flex h-full min-h-0 flex-col">
				{@render chatConversationPane(
					isSessionBusy && messages.length === 0,
					!!sessionLoadError && messages.length === 0,
					null
				)}
				{@render chatComposerFooter()}
			</div>
		</div>
	</div>
{:else}
	<Modal
		{isOpen}
		onClose={handleClose}
		size="xl"
		variant="bottom-sheet"
		enableGestures={false}
		showDragHandle={false}
		closeOnBackdrop={false}
		showCloseButton={false}
		ariaLabel="BuildOS chat assistant dialog"
		customClasses="agent-chat-keyboard-modal lg:!max-w-6xl xl:!max-w-7xl !h-[100dvh] !max-h-[100dvh] sm:!h-[90dvh] sm:!max-h-[95dvh] !rounded-none sm:!rounded-lg !overscroll-none"
	>
		{#snippet header()}
			<!-- INKPRINT header bar with Frame texture -->
			<!-- pt = safe-area-inset-top (notch/Dynamic Island height, detected per-device)
			     + a small constant gap so the header clears the floating Island instead of
			     butting right up against it. Reset to 0 on sm+ where there's no system bar. -->
			<div
				class="relative z-20 border-b border-border bg-card pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] sm:pt-0 tx tx-frame tx-weak"
			>
				<AgentChatHeader
					{selectedContextType}
					{displayContextLabel}
					{displayContextSubtitle}
					{isStreaming}
					showBackButton={shouldShowBackButton}
					onBack={handleBackNavigation}
					onClose={handleClose}
					projectId={selectedEntityId}
					{resolvedProjectFocus}
					onChangeFocus={openFocusSelector}
					onClearFocus={handleFocusClear}
					{ontologyLoaded}
					hasActiveThinkingBlock={!!currentThinkingBlockId}
					{currentActivity}
					{sessionStatusLabel}
					contextUsage={displayContextUsage}
					sessionId={currentSession?.id ?? null}
				/>
			</div>
		{/snippet}

		{#snippet children()}
			<!-- INKPRINT panel container - fills modal content area -->
			<div class="relative z-10 flex h-full flex-col overflow-hidden bg-card">
				<!-- Keep context selection mounted so Back returns to prior step -->
				<div
					class={`flex h-full min-h-0 flex-col ${showContextSelection ? '' : 'hidden'}`}
					aria-hidden={!showContextSelection}
				>
					<ContextSelectionScreen
						bind:this={contextSelectionRef}
						inModal
						onSelect={handleContextSelect}
						onNavigationChange={handleContextSelectionNavChange}
					/>
				</div>

				<!-- Chat / wizard view - Same height constraint as selection -->
				<div class={`${showContextSelection ? 'hidden' : 'flex'} h-full min-h-0 flex-col`}>
					{#if showProjectActionSelector}
						<ProjectActionSelector
							projectId={selectedEntityId || ''}
							projectName={projectFocus?.projectName ??
								selectedContextLabel ??
								'Project'}
							onSelectAction={(action) => handleProjectActionSelect(action)}
							onSelectFocus={handleFocusSelection}
						/>
					{:else if showFocusSelector && isProjectContext(selectedContextType) && selectedEntityId && resolvedProjectFocus}
						<ProjectFocusSelector
							projectId={selectedEntityId}
							projectName={resolvedProjectFocus.projectName}
							currentFocus={resolvedProjectFocus}
							onSelect={handleFocusSelection}
						/>
					{:else if agentToAgentMode && agentToAgentStep !== 'chat'}
						<AgentAutomationWizard
							step={agentToAgentStep ?? 'agent'}
							{agentProjects}
							{agentProjectsLoading}
							{agentProjectsError}
							{agentGoal}
							{agentTurnBudget}
							{selectedAgentLabel}
							{selectedContextLabel}
							hasMultipleHelpers={HAS_MULTIPLE_AGENT_HELPERS}
							onUseActionableInsight={() => selectAgentForBridge(RESEARCH_AGENT_ID)}
							onProjectSelect={(project) => selectAgentProject(project)}
							onStartChat={startAgentToAgentChat}
							onExit={() => {
								agentToAgentMode = false;
								agentToAgentStep = null;
								changeContext();
							}}
							onGoalChange={(value) => (agentGoal = value)}
							onTurnBudgetChange={updateAgentTurnBudget}
							onJumpToStep={(target) => {
								if (target === 'agent') backToAgentSelection();
								else if (target === 'project') backToAgentProjectSelection();
							}}
						/>
					{:else}
						{@render chatConversationPane(
							shouldShowSessionLoadingState,
							shouldShowSessionLoadErrorState,
							initialChatSessionId
						)}
					{/if}

					{#if !showContextSelection && !showProjectActionSelector && agentToAgentMode}
						<!-- INKPRINT automation footer with Thread texture -->
						<div
							class="border-t border-border bg-muted px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] tx tx-thread tx-weak sm:px-4 sm:py-2.5"
						>
							<div
								class="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2"
							>
								<div class="space-y-0.5">
									<p class="text-xs font-semibold text-foreground">
										Automation loop is {agentLoopActive ? 'active' : 'paused'}.
									</p>
									<p
										class="text-[0.65rem] uppercase tracking-[0.15em] text-muted-foreground"
									>
										Helper: {selectedAgentLabel} • Project: {selectedContextLabel ??
											'Select a project'} • Goal: {agentGoal || 'Add a goal'}
									</p>
									<p
										class="text-[0.65rem] uppercase tracking-[0.15em] text-muted-foreground"
									>
										Turns remaining: {agentTurnsRemaining} / {agentTurnBudget}
									</p>
								</div>
								<!-- INKPRINT tactile buttons -->
								<div class="flex flex-wrap items-center gap-2">
									<button
										type="button"
										class="inline-flex items-center justify-center rounded-lg bg-accent px-3 py-2 text-[0.65rem] font-bold uppercase tracking-[0.15em] text-accent-foreground shadow-ink transition pressable disabled:cursor-not-allowed disabled:opacity-60"
										disabled={isStreaming ||
											agentMessageLoading ||
											agentTurnsRemaining <= 0}
										onclick={() => {
											agentLoopActive = true;
											runAgentToAgentTurn();
										}}
									>
										{agentLoopActive ? 'Run next turn' : 'Resume loop'}
									</button>
									<button
										type="button"
										class="inline-flex items-center justify-center rounded-lg border border-border bg-transparent px-3 py-2 text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-muted-foreground transition pressable hover:border-accent hover:bg-card hover:text-foreground"
										onclick={stopAgentLoop}
									>
										Stop
									</button>
								</div>
							</div>
							<!-- INKPRINT micro-label controls -->
							<div
								class="mt-1.5 flex flex-wrap items-center gap-2 text-[0.65rem] uppercase tracking-[0.15em] text-muted-foreground"
							>
								<label class="flex items-center gap-1.5">
									<span class="font-bold">Turn limit</span>
									<input
										type="number"
										min="1"
										max="50"
										class="w-16 rounded-lg border border-border bg-background px-2 py-1 text-[0.65rem] font-semibold text-foreground shadow-ink-inner focus:border-accent focus:outline-none focus:ring-ring"
										value={agentTurnBudget}
										disabled={agentLoopActive ||
											agentMessageLoading ||
											isStreaming}
										oninput={(e) =>
											updateAgentTurnBudget(
												Number((e.target as HTMLInputElement).value)
											)}
									/>
								</label>
								{#if agentTurnsRemaining <= 0}
									<!-- INKPRINT warning badge with Static texture -->
									<span
										class="rounded-lg bg-warning/10 px-2.5 py-1.5 text-[0.65rem] font-semibold text-warning tx tx-static tx-weak"
									>
										Turn limit reached — adjust and resume.
									</span>
								{/if}
							</div>
							{#if agentMessageLoading}
								<p
									class="mt-1 text-[0.65rem] uppercase tracking-[0.15em] text-muted-foreground"
								>
									Fetching the next update...
								</p>
							{/if}
						</div>
					{:else if shouldShowComposer}
						<!-- INKPRINT composer footer -->
						{@render chatComposerFooter()}
					{/if}
				</div>
			</div>
		{/snippet}
	</Modal>
{/if}

<style>
	@media (max-width: 639px) {
		:global(.agent-chat-keyboard-modal) {
			height: calc(100dvh - var(--keyboard-height, 0px)) !important;
			max-height: calc(100dvh - var(--keyboard-height, 0px)) !important;
			min-height: calc(100dvh - var(--keyboard-height, 0px)) !important;
			margin-bottom: var(--keyboard-height, 0px) !important;
			border-bottom-left-radius: 0 !important;
			border-bottom-right-radius: 0 !important;
		}

		:global(.agent-chat-keyboard-modal .modal-content) {
			min-height: 0;
			flex: 1 1 auto;
		}

		@supports (padding-bottom: env(safe-area-inset-bottom, 0px)) {
			:global(.agent-chat-keyboard-modal) {
				height: calc(
					100dvh + env(safe-area-inset-bottom, 0px) - var(--keyboard-height, 0px)
				) !important;
				max-height: calc(
					100dvh + env(safe-area-inset-bottom, 0px) - var(--keyboard-height, 0px)
				) !important;
				min-height: calc(
					100dvh + env(safe-area-inset-bottom, 0px) - var(--keyboard-height, 0px)
				) !important;
				margin-bottom: calc(
					var(--keyboard-height, 0px) - env(safe-area-inset-bottom, 0px)
				) !important;
			}
		}
	}

	@media (min-width: 640px) {
		:global(.agent-chat-keyboard-modal) {
			margin-bottom: 1rem !important;
		}
	}

	.agent-resp-div p {
		margin-bottom: 0.2rem;
	}

	/* INKPRINT Scrollbar Styling - Ink on Paper aesthetic */
	.agent-chat-scroll {
		scrollbar-gutter: stable;
		scrollbar-width: thin;
		scrollbar-color: hsl(var(--muted-foreground) / 0.3) hsl(var(--muted));
	}

	:global(.agent-chat-scroll::-webkit-scrollbar) {
		width: 8px;
	}

	:global(.agent-chat-scroll::-webkit-scrollbar-track) {
		background: hsl(var(--muted));
		border-radius: 0.5rem; /* 8px - rounded-md */
	}

	:global(.agent-chat-scroll::-webkit-scrollbar-thumb) {
		background: hsl(var(--muted-foreground) / 0.3);
		border-radius: 0.5rem; /* 8px - rounded-md */
	}

	:global(.agent-chat-scroll::-webkit-scrollbar-thumb:hover) {
		background: hsl(var(--muted-foreground) / 0.5);
	}

	:global(.dark .agent-chat-scroll::-webkit-scrollbar-track) {
		background: hsl(var(--muted));
	}

	:global(.dark .agent-chat-scroll::-webkit-scrollbar-thumb) {
		background: hsl(var(--muted-foreground) / 0.4);
	}

	:global(.dark .agent-chat-scroll::-webkit-scrollbar-thumb:hover) {
		background: hsl(var(--accent));
	}

	/* Compact spacing for landscape mobile (short viewport) */
	@media (orientation: landscape) and (max-height: 500px) {
		:global(.agent-chat-scroll::-webkit-scrollbar) {
			width: 4px;
		}
	}
</style>
