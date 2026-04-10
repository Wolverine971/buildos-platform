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
	import { page } from '$app/stores';
	import { browser, dev } from '$app/environment';
	import Modal from '$lib/components/ui/Modal.svelte';
	import ContextSelectionScreen from '../chat/ContextSelectionScreen.svelte';
	import ProjectFocusSelector from './ProjectFocusSelector.svelte';
	import ProjectActionSelector from './ProjectActionSelector.svelte';
	import AgentChatHeader from './AgentChatHeader.svelte';
	import AgentComposer from './AgentComposer.svelte';
	import AgentAutomationWizard from './AgentAutomationWizard.svelte';
	import AgentMessageList from './AgentMessageList.svelte';
	import { SSEProcessor, type StreamCallbacks } from '$lib/utils/sse-processor';
	import type {
		ChatSession,
		ChatContextType,
		ChatRole,
		AgentSSEMessage,
		AgentPlan,
		ContextUsageSnapshot,
		AgentTimingSummary,
		SkillActivityEvent
	} from '@buildos/shared-types';
	import {
		requestAgentToAgentMessage,
		type AgentToAgentMessageHistory
	} from '$lib/services/agentic-chat/agent-to-agent-service';
	import type { LastTurnContext, ProjectFocus } from '$lib/types/agent-chat-enhancement';
	import type TextareaWithVoiceComponent from '$lib/components/ui/TextareaWithVoice.svelte';
	import { CONTEXT_DESCRIPTORS } from './agent-chat.constants';
	import {
		buildLiveContextUsageSnapshot,
		deriveContextOverheadTokens
	} from './agent-chat-formatters';
	import {
		findThinkingBlockById,
		type ActivityEntry,
		type ActivityType,
		type AgentLoopState,
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
	import type { VoiceNote } from '$lib/types/voice-notes';
	import { normalizeGatewayOpName } from '$lib/services/agentic-chat/tools/registry/gateway-op-aliases';
	import { getToolRegistry } from '$lib/services/agentic-chat/tools/registry/tool-registry';
	import {
		buildFastChatContextCacheKey,
		isFastChatContextCacheFresh,
		type FastChatContextCache
	} from '$lib/services/agentic-chat-v2/context-cache';
	import {
		buildProjectWideFocus,
		deriveSessionTitle,
		isProjectContext,
		loadAgentChatSessionSnapshot,
		prewarmAgentContext
	} from './agent-chat-session';
	import { upsertSkillActivityEntries } from './agent-chat-skill-activity';
	import {
		downloadChatSessionAuditMarkdown,
		fetchChatSessionAuditPayload
	} from '$lib/services/admin/chat-session-audit-export';

	interface AutoInitProjectConfig {
		projectId: string;
		projectName: string;
		showActionSelector?: boolean;
		initialAction?: ProjectAction;
	}

	interface InitialBraindump {
		id: string;
		content: string;
		title: string | null;
		topics: string[] | null;
		summary: string | null;
		status: string;
	}

	interface Props {
		isOpen?: boolean;
		contextType?: ChatContextType;
		entityId?: string;
		onClose?: (summary?: DataMutationSummary) => void;
		autoInitProject?: AutoInitProjectConfig | null;
		initialBraindump?: InitialBraindump | null;
		initialChatSessionId?: string | null;
		initialProjectFocus?: ProjectFocus | null;
		embedded?: boolean;
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
		initialBraindump = null,
		initialChatSessionId = null,
		initialProjectFocus = null,
		embedded = false
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
	let lastPrewarmKey = $state<string | null>(null);
	let prewarmedContext = $state<FastChatContextCache | null>(null);
	const ENABLE_V2_PREWARM = true;

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

	// Device detection for mobile UX
	// On mobile/touch devices, Enter should not send messages (allows natural line breaks)
	const isTouchDevice = $derived(
		browser && ('ontouchstart' in window || navigator.maxTouchPoints > 0)
	);

	// Conversation state
	let messages = $state<UIMessage[]>([]);
	let currentSession = $state<ChatSession | null>(null);
	let isExportingAudit = $state(false);
	let isStreaming = $state(false);
	let currentStreamController: AbortController | null = null;
	let activeStreamRunId = $state(0);
	let activeTransportStreamRunId = $state<string | null>(null);
	let activeClientTurnId = $state<string | null>(null);
	let inputValue = $state('');
	let error = $state<string | null>(null);
	// Track current plan for potential future UI enhancements
	let currentPlan = $state<AgentPlan | null>(null);
	let currentActivity = $state<string>('');
	let userHasScrolled = $state(false);
	let currentAssistantMessageId = $state<string | null>(null);
	let currentAssistantMessageIndex = $state<number | null>(null);
	let pendingAssistantText = '';
	let pendingAssistantTextFlushHandle: number | null = null;
	let currentThinkingBlockId = $state<string | null>(null);
	let hasSentMessage = $state(false);
	const pendingToolResults = new Map<
		string,
		{ status: 'completed' | 'failed'; errorMessage?: string }
	>(); // Tool results that arrive before tool_call
	const hiddenToolCallIds = new Set<string>();

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

	const isAdminUser = $derived(Boolean($page.data?.user?.is_admin));

	const adminSessionHref = $derived.by(() => {
		const sessionId = currentSession?.id;
		if (!sessionId) return null;
		return `/admin/chat/sessions?chat_session_id=${encodeURIComponent(sessionId)}`;
	});

	const showAdminDebugActions = $derived.by(
		() => isAdminUser && Boolean(currentSession?.id) && Boolean(adminSessionHref)
	);

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
		executing_plan: 'BuildOS is executing...',
		waiting_on_user: 'Waiting on your direction...'
	};

	// Actionable Insight agent identifier (used for agent-to-agent bridge)
	const RESEARCH_AGENT_ID = 'actionable_insight_agent';

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

	let voiceInputRef = $state<TextareaWithVoiceComponent | null>(null);
	let isVoiceRecording = $state(false);
	let isVoiceInitializing = $state(false);
	let isVoiceTranscribing = $state(false);
	let voiceErrorMessage = $state('');
	let voiceSupportsLiveTranscript = $state(false);
	let voiceRecordingDuration = $state(0);
	let voiceNoteGroupId = $state<string | null>(null);
	let voiceNotesByGroupId = $state<Record<string, VoiceNote[]>>({});
	// When user clicks send while recording, we stop recording and auto-send after transcription
	let pendingSendAfterTranscription = $state(false);

	// Braindump context state
	type BraindumpMode = 'input' | 'options' | 'chat';
	let braindumpMode = $state<BraindumpMode>('input');
	let pendingBraindumpContent = $state('');
	let isSavingBraindump = $state(false);
	let braindumpSaveError = $state<string | null>(null);

	// Session resumption state
	let isLoadingSession = $state(false);
	let isPreparingSession = $state(false);
	let sessionLoadError = $state<string | null>(null);
	let lastLoadedSessionId = $state<string | null>(null);
	let sessionLoadRequestId = 0;
	let sessionLoadController: AbortController | null = null;
	let sessionBootstrapRequestId = 0;
	let sessionBootstrapController: AbortController | null = null;
	let sessionBootstrapPromise: Promise<ChatSession | null> | null = null;
	const isSessionBusy = $derived(isLoadingSession || isPreparingSession);
	const sessionStatusLabel = $derived.by(() => {
		if (isLoadingSession) return 'Loading session';
		if (isPreparingSession) return 'Preparing session';
		return null;
	});

	// Helper to check if we're in braindump context
	const isBraindumpContext = $derived(selectedContextType === 'brain_dump');

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
		if (showContextSelection || showProjectActionSelector) return false;
		if (agentToAgentMode && agentToAgentStep !== 'chat') return false;
		if (isBraindumpContext && (braindumpMode === 'input' || braindumpMode === 'options')) {
			return false;
		}
		return true;
	});

	const shouldShowSessionLoadErrorState = $derived.by(() => {
		if (!sessionLoadError || isSessionBusy || messages.length > 0) return false;
		if (showContextSelection || showProjectActionSelector) return false;
		if (agentToAgentMode && agentToAgentStep !== 'chat') return false;
		if (isBraindumpContext && (braindumpMode === 'input' || braindumpMode === 'options')) {
			return false;
		}
		return true;
	});

	const shouldShowComposer = $derived(
		!showContextSelection &&
			!showProjectActionSelector &&
			!agentToAgentMode &&
			!(isBraindumpContext && (braindumpMode === 'input' || braindumpMode === 'options'))
	);

	const chatComposerVocabularyTerms = $derived(
		resolvedProjectFocus?.projectName ?? displayContextLabel
	);

	const canPrimeActiveChatSession = $derived.by(() => {
		if (!selectedContextType || !isOpen || currentSession?.id) return false;
		if (showContextSelection || showProjectActionSelector) return false;
		if (agentToAgentMode && agentToAgentStep !== 'chat') return false;
		if (isBraindumpContext && braindumpMode !== 'chat') return false;
		return true;
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
			if (warmed.prewarmedContext && isFastChatContextCacheFresh(warmed.prewarmedContext)) {
				prewarmedContext = warmed.prewarmedContext;
				lastPrewarmKey = warmed.prewarmedContext.key;
			}

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
		stopVoiceInput();

		// Handle braindump modes
		if (isBraindumpContext && braindumpMode === 'options') {
			cancelBraindumpOptions();
			return;
		}
		if (isBraindumpContext && braindumpMode === 'chat') {
			// From chat mode back to input mode (reset conversation)
			braindumpMode = 'input';
			messages = [];
			inputValue = '';
			return;
		}

		// Handle back based on current view state
		if (showContextSelection && contextSelectionView !== 'primary') {
			// Delegate to ContextSelectionScreen's internal navigation
			contextSelectionRef?.handleBackNavigation?.();
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
			// From project step → back to agent selection
			backToAgentSelection();
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

	// Note: isVoiceRecording is NOT included - clicking send while recording will
	// stop the recording and auto-send after transcription completes.
	// Streaming only blocks send on non-touch devices (touch uses Send & Stop).
	const isSendDisabled = $derived(
		agentToAgentMode ||
			!selectedContextType ||
			isSessionBusy ||
			(!inputValue.trim() && !isVoiceRecording) || // Allow send if recording (will get transcribed text)
			(isStreaming && !isTouchDevice) ||
			isVoiceInitializing ||
			isVoiceTranscribing ||
			pendingSendAfterTranscription // Prevent double-clicks while waiting for transcription
	);

	async function stopVoiceInput() {
		try {
			await voiceInputRef?.stopRecording?.();
		} catch (error) {
			console.error('Failed to stop voice input', error);
		}
	}

	async function cleanupVoiceInput() {
		try {
			await voiceInputRef?.cleanup?.();
		} catch (error) {
			console.error('Failed to cleanup voice input', error);
		}
	}

	function upsertVoiceNoteInGroup(note: VoiceNote) {
		if (!note.group_id) return;
		const groupId = note.group_id;
		const existing = voiceNotesByGroupId[groupId] ?? [];
		const next = [...existing.filter((entry) => entry.id !== note.id), note].sort((a, b) => {
			const aIndex = a.segment_index ?? 0;
			const bIndex = b.segment_index ?? 0;
			if (aIndex !== bIndex) return aIndex - bIndex;
			return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
		});
		voiceNotesByGroupId = { ...voiceNotesByGroupId, [groupId]: next };
	}

	function removeVoiceNoteFromGroup(groupId: string, noteId: string) {
		const existing = voiceNotesByGroupId[groupId];
		if (!existing) return;
		const next = existing.filter((entry) => entry.id !== noteId);
		if (next.length === 0) {
			const { [groupId]: _removed, ...rest } = voiceNotesByGroupId;
			voiceNotesByGroupId = rest;
			return;
		}
		voiceNotesByGroupId = { ...voiceNotesByGroupId, [groupId]: next };
	}

	function handleVoiceNoteSegmentSaved(note: VoiceNote) {
		upsertVoiceNoteInGroup(note);
	}

	function handleVoiceNoteSegmentError(message: string) {
		if (!message) return;
		toastService.error(message);
	}

	function resetConversation(options: { preserveContext?: boolean } = {}) {
		const { preserveContext = true } = options;

		stopVoiceInput();
		cancelSessionBootstrap();

		messages = [];
		currentSession = null;
		currentPlan = null;
		currentActivity = '';
		inputValue = '';
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
		resetMutationTracking();
		voiceErrorMessage = '';
		voiceNoteGroupId = null;
		voiceNotesByGroupId = {};
		pendingSendAfterTranscription = false;
		showFocusSelector = false;
		showProjectActionSelector = false;
		agentLoopActive = false;
		// Reset braindump state
		braindumpMode = 'input';
		pendingBraindumpContent = '';
		isSavingBraindump = false;
		braindumpSaveError = null;
		agentMessageLoading = false;
		agentTurnBudget = 5;
		agentTurnsRemaining = 5;
		// Reset session resumption state
		sessionLoadError = null;

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

	// Braindump handlers
	function handleBraindumpSubmit() {
		const trimmed = inputValue.trim();
		if (!trimmed || isVoiceRecording || isVoiceInitializing || isVoiceTranscribing) return;

		pendingBraindumpContent = trimmed;
		braindumpMode = 'options';
	}

	async function saveBraindump() {
		if (!pendingBraindumpContent.trim() || isSavingBraindump) return;

		isSavingBraindump = true;
		braindumpSaveError = null;

		try {
			const response = await fetch('/api/onto/braindumps', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					content: pendingBraindumpContent,
					metadata: {
						source: 'agent_chat_modal',
						voice_recorded: voiceRecordingDuration > 0
					}
				})
			});

			const result = await response.json();

			if (!response.ok || !result.success) {
				throw new Error(result.error || 'Failed to save braindump');
			}

			// Success - show toast and close modal
			toastService.success('Brain dump saved');
			pendingBraindumpContent = '';
			inputValue = '';
			braindumpMode = 'input';

			// Close the modal after successful save
			if (onClose) {
				onClose();
			}
		} catch (err: any) {
			console.error('Failed to save braindump:', err);
			braindumpSaveError = err.message || 'Failed to save braindump';
		} finally {
			isSavingBraindump = false;
		}
	}

	function chatAboutBraindump() {
		// Transition to chat mode with the braindump as the first message
		braindumpMode = 'chat';

		// Add a system context message explaining this is a braindump exploration
		const systemNote: UIMessage = {
			id: crypto.randomUUID(),
			type: 'activity',
			role: 'assistant' as ChatRole,
			content:
				"Starting braindump exploration. I'll help you clarify and organize your thoughts.",
			timestamp: new Date(),
			created_at: new Date().toISOString()
		};
		messages = [systemNote];

		// Set the input to the braindump content and send it
		inputValue = pendingBraindumpContent;
		pendingBraindumpContent = '';

		// Use setTrackedTimeout to ensure state updates before sending
		setTrackedTimeout(() => {
			sendMessage();
		}, 0);
	}

	function cancelBraindumpOptions() {
		braindumpMode = 'input';
		// Keep the content in the input for editing
		inputValue = pendingBraindumpContent;
		pendingBraindumpContent = '';
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
			// No initial message for agent-to-agent mode
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

		// Seed the chat with an initial message for contexts that go directly to chat
		// (not 'project' which shows the action selector first)
		if (selection.contextType !== 'project') {
			seedInitialMessage(selection.contextType, selection.label);
		}
	}

	function changeContext() {
		if (isStreaming) return;
		stopVoiceInput();
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
		// Move into project workspace chat with the chosen focus
		selectedContextType = 'project';
		selectedContextLabel = buildContextLabelForAction('workspace', newFocus.projectName);
		showProjectActionSelector = false;
		showFocusSelector = false;
		showContextSelection = false;

		// Only seed initial message if we're starting a new chat (from action selector)
		if (isStartingFresh) {
			// Reset conversation to start fresh with the new focus
			messages = [];
			// Create a focused initial message
			const focusName = newFocus.focusEntityName || newFocus.focusType;
			const message =
				newFocus.focusType === 'project-wide'
					? `What would you like to do with ${newFocus.projectName}? I can help you explore goals, update tasks, or answer questions about the project.`
					: `Let's focus on "${focusName}" in ${newFocus.projectName}. What would you like to know or update?`;
			addInitialAssistantMessage(message);
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

		// Seed the chat with a contextual initial message
		seedInitialMessage(contextType, projectName);
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
				lastPrewarmKey = null;
				prewarmedContext = null;
				cancelSessionBootstrap();
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
				seedInitialMessage(_initialContextType, selectedContextLabel);
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

	$effect(() => {
		if (!ENABLE_V2_PREWARM) return;
		if (!browser || !isOpen || !selectedContextType) return;
		if (isPreparingSession) return;
		const prewarmEntityId = selectedEntityId ?? resolvedProjectFocus?.projectId;
		if (isProjectContext(selectedContextType) && !prewarmEntityId) return;
		const shouldPrewarmDraftContext =
			canPrimeActiveChatSession &&
			(inputValue.trim().length > 0 ||
				isVoiceRecording ||
				isVoiceInitializing ||
				isVoiceTranscribing ||
				pendingSendAfterTranscription);
		const key = buildFastChatContextCacheKey({
			contextType: selectedContextType,
			entityId: prewarmEntityId ?? null,
			projectFocus: resolvedProjectFocus
		});
		const hasFreshMatchingPrewarm =
			prewarmedContext &&
			prewarmedContext.key === key &&
			isFastChatContextCacheFresh(prewarmedContext);
		if (!key) return;

		// Keep draft-time prewarm cache-only. Creating a session while the user is typing
		// briefly disabled the composer, which caused mobile blur/keyboard thrash on the
		// first character. Session creation still happens on send.
		if (!currentSession?.id && !shouldPrewarmDraftContext) {
			return;
		}

		if (key === lastPrewarmKey && hasFreshMatchingPrewarm) return;
		lastPrewarmKey = key;
		const controller = new AbortController();

		void (async () => {
			try {
				const warmed = await prewarmAgentContext(
					{
						session_id: currentSession?.id ?? undefined,
						context_type: selectedContextType,
						entity_id: prewarmEntityId,
						projectFocus: resolvedProjectFocus,
						ensure_session: currentSession?.id ? undefined : false
					},
					{ signal: controller.signal }
				);

				if (controller.signal.aborted) return;
				if (warmed?.session) {
					hydrateSessionFromEvent(warmed.session);
				}
				if (
					warmed?.prewarmedContext &&
					warmed.prewarmedContext.key === key &&
					isFastChatContextCacheFresh(warmed.prewarmedContext)
				) {
					prewarmedContext = warmed.prewarmedContext;
				}
			} catch (err) {
				if ((err as DOMException)?.name !== 'AbortError' && dev) {
					console.warn('[AgentChat] Background prewarm failed:', err);
				}
			}
		})();

		return () => controller.abort();
	});

	$effect(() => {
		if (!selectedContextType || !prewarmedContext) return;
		const activeKey = buildFastChatContextCacheKey({
			contextType: selectedContextType,
			entityId: selectedEntityId ?? resolvedProjectFocus?.projectId ?? null,
			projectFocus: resolvedProjectFocus
		});
		if (prewarmedContext.key !== activeKey || !isFastChatContextCacheFresh(prewarmedContext)) {
			prewarmedContext = null;
		}
	});

	// Handle initialBraindump prop - when opening from history to explore an existing braindump
	$effect(() => {
		if (!isOpen || !initialBraindump) return;

		// Only initialize once per open
		if (wasOpen && selectedContextType === 'brain_dump' && braindumpMode === 'chat') {
			return; // Already initialized
		}

		// Reset and set up for braindump exploration
		resetConversation({ preserveContext: false });
		selectedContextType = 'brain_dump';
		selectedContextLabel = initialBraindump.title || 'Braindump Exploration';
		showContextSelection = false;
		showProjectActionSelector = false;
		braindumpMode = 'chat';

		// Add a system context message explaining this is a braindump exploration
		const systemNote: UIMessage = {
			id: crypto.randomUUID(),
			type: 'activity',
			role: 'assistant' as ChatRole,
			content: initialBraindump.summary
				? `Exploring your braindump: "${initialBraindump.title || 'Untitled'}"\n\n**Summary:** ${initialBraindump.summary}\n\nWhat would you like to explore or discuss about these thoughts?`
				: "Resuming braindump exploration. I'll help you clarify and organize your thoughts.",
			timestamp: new Date(),
			created_at: new Date().toISOString()
		};
		messages = [systemNote];

		// Set the input to the braindump content and send it as the first message
		inputValue = initialBraindump.content;

		// Use setTrackedTimeout to ensure state updates before sending
		setTrackedTimeout(() => {
			sendMessage();
		}, 0);
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

		// Seed with a focus-specific initial message
		const focusTypeLabel = initialProjectFocus.focusType.replace('-', ' ');
		const message =
			initialProjectFocus.focusType === 'project-wide'
				? `What would you like to do with ${projectName}? I can help you explore goals, update tasks, or answer questions about the project.`
				: `Let's focus on "${focusName}" in ${projectName}. What would you like to know or update about this ${focusTypeLabel}?`;
		addInitialAssistantMessage(message);
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
	async function loadChatSession(sessionId: string) {
		sessionLoadRequestId += 1;
		const requestId = sessionLoadRequestId;
		cancelSessionBootstrap();
		if (sessionLoadController) {
			sessionLoadController.abort();
		}
		const controller = new AbortController();
		sessionLoadController = controller;

		isLoadingSession = true;
		sessionLoadError = null;
		// Immediately hide context selection when loading a session to prevent flash
		showContextSelection = false;
		showProjectActionSelector = false;
		// Clear any prior session state to avoid bleed-through while loading
		resetConversation({ preserveContext: false });

		try {
			const snapshot = await loadAgentChatSessionSnapshot(sessionId, {
				signal: controller.signal
			});

			if (requestId !== sessionLoadRequestId) {
				return;
			}

			currentSession = snapshot.session;
			lastLoadedSessionId = sessionId;
			contextUsage = null;
			contextUsageOverheadTokens = 0;
			selectedContextType = snapshot.contextType;
			selectedEntityId = snapshot.selectedEntityId;
			selectedContextLabel = snapshot.selectedContextLabel;
			projectFocus = snapshot.projectFocus;
			messages = snapshot.messages;
			voiceNotesByGroupId = snapshot.voiceNotesByGroupId;
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
	// Tool Display Formatters
	// ========================================================================

	/**
	 * Formats tool messages with meaningful context from arguments
	 */
	type OntologyEntityKind =
		| 'project'
		| 'task'
		| 'goal'
		| 'plan'
		| 'document'
		| 'milestone'
		| 'risk'
		| 'event';

	const ENTITY_NAME_FIELDS = ['name', 'title', 'text', 'summary', 'label'] as const;
	const ENTITY_SINGULAR_KEYS: Record<string, OntologyEntityKind> = {
		project: 'project',
		task: 'task',
		goal: 'goal',
		plan: 'plan',
		document: 'document',
		milestone: 'milestone',
		risk: 'risk',
		event: 'event'
	};
	const ENTITY_PLURAL_KEYS: Record<string, OntologyEntityKind> = {
		projects: 'project',
		tasks: 'task',
		goals: 'goal',
		plans: 'plan',
		documents: 'document',
		milestones: 'milestone',
		risks: 'risk',
		events: 'event'
	};

	const entityNameCache = new Map<string, string>();

	function normalizeEntityLabel(value: unknown): string | undefined {
		if (typeof value !== 'string') return undefined;
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : undefined;
	}

	function cacheEntityName(kind: OntologyEntityKind | 'entity', id: string, name: string): void {
		const normalizedId = normalizeEntityLabel(id);
		const normalizedName = normalizeEntityLabel(name);
		if (!normalizedId || !normalizedName) return;
		if (normalizedId === normalizedName) return;
		entityNameCache.set(`${kind}:${normalizedId}`, normalizedName);
		entityNameCache.set(`entity:${normalizedId}`, normalizedName);
	}

	function getCachedEntityName(
		kind: OntologyEntityKind | 'entity' | undefined,
		id?: string
	): string | undefined {
		const normalizedId = normalizeEntityLabel(id);
		if (!normalizedId) return undefined;
		if (kind) {
			const typed = entityNameCache.get(`${kind}:${normalizedId}`);
			if (typed) return typed;
		}
		return entityNameCache.get(`entity:${normalizedId}`);
	}

	function resolveContextEntityName(
		kind: OntologyEntityKind | undefined,
		id?: string
	): string | undefined {
		const normalizedId = normalizeEntityLabel(id);
		if (!normalizedId) return undefined;

		if (kind === 'project' || isProjectContext(selectedContextType)) {
			if (
				resolvedProjectFocus?.projectId === normalizedId &&
				resolvedProjectFocus?.projectName
			) {
				return normalizeEntityLabel(resolvedProjectFocus.projectName);
			}
			if (
				isProjectContext(selectedContextType) &&
				selectedEntityId === normalizedId &&
				selectedContextLabel
			) {
				return normalizeEntityLabel(selectedContextLabel);
			}
		}

		if (
			projectFocus?.focusEntityId === normalizedId &&
			projectFocus?.focusEntityName &&
			projectFocus?.focusType &&
			projectFocus.focusType !== 'project-wide'
		) {
			return normalizeEntityLabel(projectFocus.focusEntityName);
		}

		if (selectedEntityId === normalizedId && selectedContextLabel) {
			return normalizeEntityLabel(selectedContextLabel);
		}

		return undefined;
	}

	function resolveEntityName(
		kind: OntologyEntityKind | undefined,
		id?: string,
		candidateName?: string
	): string | undefined {
		const direct = normalizeEntityLabel(candidateName);
		if (direct) return direct;
		if (!id) return undefined;
		return (
			resolveContextEntityName(kind, id) ||
			getCachedEntityName(kind, id) ||
			getCachedEntityName('entity', id)
		);
	}

	function extractEntityDisplayName(entity: Record<string, any>): string | undefined {
		for (const key of ENTITY_NAME_FIELDS) {
			const value = normalizeEntityLabel(entity[key]);
			if (value) return value;
		}
		return undefined;
	}

	function indexEntityRecord(kind: OntologyEntityKind, entity: Record<string, any>): void {
		const id =
			normalizeEntityLabel(entity.id) ||
			normalizeEntityLabel(entity[`${kind}_id`]) ||
			normalizeEntityLabel(entity.entity_id);
		const name = extractEntityDisplayName(entity);
		if (id && name) {
			cacheEntityName(kind, id, name);
		}

		const projectId = normalizeEntityLabel(entity.project_id);
		const projectName = normalizeEntityLabel(entity.project_name);
		if (projectId && projectName) {
			cacheEntityName('project', projectId, projectName);
		}
	}

	function indexEntityResults(results: unknown[]): void {
		for (const result of results) {
			if (!result || typeof result !== 'object') continue;
			const entry = result as Record<string, any>;
			const id = normalizeEntityLabel(entry.entity_id) || normalizeEntityLabel(entry.id);
			const kind =
				normalizeEntityLabel(entry.entity_type) || normalizeEntityLabel(entry.type);
			const name = normalizeEntityLabel(entry.entity_name) || extractEntityDisplayName(entry);
			if (id && name) {
				cacheEntityName((kind as OntologyEntityKind) ?? 'entity', id, name);
			}
		}
	}

	function indexEntitiesFromPayload(payload: Record<string, any>): void {
		if (!payload) return;

		const contextShift =
			payload.context_shift && typeof payload.context_shift === 'object'
				? (payload.context_shift as Record<string, any>)
				: null;
		if (contextShift) {
			const shiftId = normalizeEntityLabel(contextShift.entity_id);
			const shiftName = normalizeEntityLabel(contextShift.entity_name);
			const shiftType = normalizeEntityLabel(contextShift.entity_type);
			if (shiftId && shiftName) {
				cacheEntityName((shiftType as OntologyEntityKind) ?? 'entity', shiftId, shiftName);
			}
		}

		if (payload.project_id && payload.project_name) {
			cacheEntityName('project', payload.project_id, payload.project_name);
		}

		for (const [key, kind] of Object.entries(ENTITY_SINGULAR_KEYS)) {
			const entity = payload[key];
			if (entity && typeof entity === 'object') {
				indexEntityRecord(kind, entity as Record<string, any>);
			}
		}

		for (const [key, kind] of Object.entries(ENTITY_PLURAL_KEYS)) {
			const entities = payload[key];
			if (Array.isArray(entities)) {
				for (const entity of entities) {
					if (entity && typeof entity === 'object') {
						indexEntityRecord(kind, entity as Record<string, any>);
					}
				}
			}
		}

		if (Array.isArray(payload.results)) {
			indexEntityResults(payload.results);
		}

		const nestedResult = payload.result;
		if (nestedResult && typeof nestedResult === 'object' && nestedResult !== payload) {
			indexEntitiesFromPayload(nestedResult as Record<string, any>);
		}
	}

	function extractToolResultPayload(toolResult: unknown): Record<string, any> | null {
		if (!toolResult || typeof toolResult !== 'object') return null;
		const record = toolResult as Record<string, any>;
		const candidate =
			(record.data && typeof record.data === 'object' && record.data) ||
			(record.result && typeof record.result === 'object' && record.result) ||
			(record.tool_result && typeof record.tool_result === 'object' && record.tool_result);
		if (candidate) return candidate as Record<string, any>;

		const fallbackKeys = [
			'project',
			'projects',
			'task',
			'tasks',
			'goal',
			'goals',
			'plan',
			'plans',
			'document',
			'documents',
			'milestone',
			'milestones',
			'risk',
			'risks',
			'results',
			'context_shift'
		];
		if (fallbackKeys.some((key) => key in record)) {
			return record;
		}
		return null;
	}

	function indexEntitiesFromToolResult(toolResult: unknown): void {
		const payload = extractToolResultPayload(toolResult);
		if (!payload) return;
		indexEntitiesFromPayload(payload);
	}

	function buildEntityTarget(
		name?: string,
		id?: string,
		kind?: OntologyEntityKind
	): string | undefined {
		return resolveEntityName(kind, id, name);
	}

	// Keep schema-discovery calls visible so users can see gateway activity.
	const HIDDEN_THINKING_TOOLS = new Set<string>();
	const GATEWAY_OP_TOOL_OVERRIDES: Record<string, string> = (() => {
		const registry = getToolRegistry();
		const entries = Object.values(registry.ops).map((op) => [op.op, op.tool_name] as const);
		return Object.fromEntries(entries);
	})();
	const ONTO_ENTITY_PLURALS: Record<string, string> = {
		project: 'projects',
		task: 'tasks',
		goal: 'goals',
		plan: 'plans',
		document: 'documents',
		milestone: 'milestones',
		risk: 'risks',
		event: 'events'
	};

	function toOntologyPlural(entity: string): string {
		return ONTO_ENTITY_PLURALS[entity] ?? `${entity}s`;
	}

	function mapGatewayOpToToolName(op: string): string | undefined {
		const requested = op.trim();
		if (!requested) return undefined;
		const normalized = normalizeGatewayOpName(requested);
		const override = GATEWAY_OP_TOOL_OVERRIDES[normalized];
		if (override) return override;

		const parts = normalized.split('.');
		if (parts.length !== 3 || parts[0] !== 'onto') {
			return undefined;
		}

		const entity = parts[1];
		const action = parts[2];
		if (!entity || !action) return undefined;

		switch (action) {
			case 'list':
				return `list_onto_${toOntologyPlural(entity)}`;
			case 'search':
				return `search_onto_${toOntologyPlural(entity)}`;
			case 'get':
				return `get_onto_${entity}_details`;
			case 'create':
				return `create_onto_${entity}`;
			case 'update':
				return `update_onto_${entity}`;
			case 'delete':
				return `delete_onto_${entity}`;
			default:
				return undefined;
		}
	}

	function normalizeToolDisplayPayload(
		toolName: string,
		argsJson: string | Record<string, any>
	): {
		hidden: boolean;
		toolName: string;
		args: string | Record<string, any>;
		gatewayOp?: string;
		originalToolName: string;
	} {
		if (HIDDEN_THINKING_TOOLS.has(toolName)) {
			return {
				hidden: true,
				toolName,
				args: argsJson,
				originalToolName: toolName
			};
		}

		if (toolName !== 'tool_exec') {
			return {
				hidden: false,
				toolName,
				args: argsJson,
				originalToolName: toolName
			};
		}

		const parsed = safeParseArgs(argsJson as string | Record<string, unknown>);
		const op = typeof parsed.op === 'string' ? parsed.op.trim() : '';
		const nestedArgs =
			parsed.args && typeof parsed.args === 'object' && !Array.isArray(parsed.args)
				? (parsed.args as Record<string, any>)
				: {};
		const mappedToolName = op ? mapGatewayOpToToolName(op) : undefined;

		return {
			hidden: false,
			toolName: mappedToolName ?? toolName,
			args: mappedToolName ? nestedArgs : parsed,
			gatewayOp: op || undefined,
			originalToolName: toolName
		};
	}

	$effect(() => {
		if (resolvedProjectFocus?.projectId && resolvedProjectFocus.projectName) {
			cacheEntityName(
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
			cacheEntityName(
				resolvedProjectFocus.focusType as OntologyEntityKind,
				resolvedProjectFocus.focusEntityId,
				resolvedProjectFocus.focusEntityName
			);
		}
		if (selectedEntityId && selectedContextLabel) {
			const inferredKind = isProjectContext(selectedContextType) ? 'project' : 'entity';
			cacheEntityName(inferredKind, selectedEntityId, selectedContextLabel);
		}
	});

	function formatListPreview(values: string[], limit = 2): string {
		const cleaned = values
			.map((value) => (typeof value === 'string' ? value.trim() : ''))
			.filter((value) => value.length > 0);
		if (cleaned.length === 0) return '';
		if (cleaned.length <= limit) return cleaned.join(', ');
		return `${cleaned.slice(0, limit).join(', ')} (+${cleaned.length - limit} more)`;
	}

	const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
	const DATE_TIME_REGEX = /T\d{2}:\d{2}/;
	const EXPLICIT_TIMEZONE_SUFFIX_REGEX = /(Z|[+-]\d{2}(?::?\d{2})?)$/i;
	const EXPLICIT_TIME_REGEX =
		/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}(?::?\d{2})?)$/i;

	function normalizeCalendarTimeZone(value: unknown): string | undefined {
		const tz = normalizeEntityLabel(value);
		if (!tz) return undefined;
		try {
			new Intl.DateTimeFormat('en-US', { timeZone: tz });
			return tz;
		} catch {
			return undefined;
		}
	}

	function formatDateOnlyLabel(raw: string): string {
		const [yearPart, monthPart, dayPart] = raw.split('-');
		const year = Number.parseInt(yearPart ?? '', 10);
		const month = Number.parseInt(monthPart ?? '', 10);
		const day = Number.parseInt(dayPart ?? '', 10);
		if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
			return raw;
		}

		const monthName = new Intl.DateTimeFormat('en-US', {
			month: 'short',
			timeZone: 'UTC'
		}).format(new Date(Date.UTC(2000, Math.max(0, month - 1), 1)));

		return `${monthName} ${day}, ${year}`;
	}

	function formatClockLabel(hour24: number, minute: number): string {
		const hour = ((hour24 % 24) + 24) % 24;
		const suffix = hour >= 12 ? 'PM' : 'AM';
		const hour12 = hour % 12 === 0 ? 12 : hour % 12;
		return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
	}

	function normalizeOffsetLabel(rawOffset: string): string {
		const upper = rawOffset.toUpperCase();
		if (upper === 'Z') {
			return 'UTC';
		}
		const normalized = upper.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
		return `UTC${normalized}`;
	}

	function formatExplicitTimezoneDateLabel(raw: string): string | undefined {
		const match = raw.match(EXPLICIT_TIME_REGEX);
		if (!match) {
			return undefined;
		}

		const yearPart = match[1];
		const monthPart = match[2];
		const dayPart = match[3];
		const hourPart = match[4];
		const minutePart = match[5];
		const offsetPart = match[6];
		if (!yearPart || !monthPart || !dayPart || !hourPart || !minutePart || !offsetPart) {
			return undefined;
		}

		const hour = Number.parseInt(hourPart, 10);
		const minute = Number.parseInt(minutePart, 10);
		if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
			return undefined;
		}

		const dateLabel = formatDateOnlyLabel(`${yearPart}-${monthPart}-${dayPart}`);
		const timeLabel = formatClockLabel(hour, minute);
		return `${dateLabel}, ${timeLabel} ${normalizeOffsetLabel(offsetPart)}`;
	}

	function formatCalendarDateLabel(value: unknown, timeZone?: string): string | undefined {
		const raw = normalizeEntityLabel(value);
		if (!raw) return undefined;

		if (DATE_ONLY_REGEX.test(raw)) {
			return formatDateOnlyLabel(raw);
		}

		const hasExplicitTimezone = EXPLICIT_TIMEZONE_SUFFIX_REGEX.test(raw);
		if (!timeZone && hasExplicitTimezone) {
			const explicitLabel = formatExplicitTimezoneDateLabel(raw);
			if (explicitLabel) {
				return explicitLabel;
			}
		}

		const parsed = new Date(raw);
		if (Number.isNaN(parsed.getTime())) {
			return raw;
		}

		return new Intl.DateTimeFormat('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
			...(timeZone ? { timeZone } : {})
		}).format(parsed);
	}

	function formatCalendarRangeTarget(args: Record<string, any> | undefined): string | undefined {
		if (!args || typeof args !== 'object') return undefined;

		const rawTimeMin = args.time_min ?? args.timeMin;
		const rawTimeMax = args.time_max ?? args.timeMax;
		const timeZone = normalizeCalendarTimeZone(args.timezone);
		const timeMin = formatCalendarDateLabel(rawTimeMin, timeZone);
		const timeMax = formatCalendarDateLabel(rawTimeMax, timeZone);
		if (!timeMin && !timeMax) return undefined;

		const rangeLabel = `${timeMin ?? 'Start: now'} to ${timeMax ?? 'End: open'}`;
		const details: string[] = [];

		const projectTarget = resolveEntityName('project', args.project_id ?? args.projectId);
		if (projectTarget) {
			details.push(projectTarget);
		} else {
			const scope =
				normalizeEntityLabel(args.calendar_scope) ??
				normalizeEntityLabel(args.calendarScope);
			if (scope) {
				details.push(`scope: ${scope}`);
			}
		}

		const query = normalizeEntityLabel(args.query) ?? normalizeEntityLabel(args.q);
		if (query) {
			details.push(`query: ${query}`);
		}
		const hasTimeBoundary =
			(typeof rawTimeMin === 'string' && DATE_TIME_REGEX.test(rawTimeMin)) ||
			(typeof rawTimeMax === 'string' && DATE_TIME_REGEX.test(rawTimeMax));
		if (timeZone && hasTimeBoundary) {
			details.push(`tz: ${timeZone}`);
		}

		if (details.length > 0) {
			return `${rangeLabel} · ${details.join(' · ')}`;
		}
		return rangeLabel;
	}

	const TOOL_DISPLAY_FORMATTERS: Record<
		string,
		(args: any) => { action: string; target?: string }
	> = {
		tool_help: (args) => ({
			action: 'Checking tool guidance',
			target:
				typeof args?.path === 'string' && args.path.trim().length > 0
					? args.path.trim()
					: 'root'
		}),
		tool_batch: (args) => {
			const ops = Array.isArray(args?.ops) ? args.ops : [];
			const helpPaths = ops
				.filter((op: any) => op?.type === 'help' && typeof op.path === 'string')
				.map((op: any) => op.path as string);
			const execOps = ops
				.filter((op: any) => op?.type === 'exec' && typeof op.op === 'string')
				.map((op: any) => op.op as string);

			if (helpPaths.length > 0 && execOps.length === 0) {
				return {
					action: 'Checking tool guidance',
					target: formatListPreview(helpPaths, 3)
				};
			}

			if (helpPaths.length > 0 && execOps.length > 0) {
				return {
					action: `Running tool batch (${ops.length} ops)`,
					target: `help: ${formatListPreview(helpPaths)}`
				};
			}

			if (execOps.length > 0) {
				return {
					action: `Running tool batch (${ops.length} ops)`,
					target: `exec: ${formatListPreview(execOps)}`
				};
			}

			return {
				action: 'Running tool batch',
				target: ops.length > 0 ? `${ops.length} ops` : undefined
			};
		},
		search_ontology: (args) => ({
			action: 'Searching workspace',
			target: args?.query || args?.search
		}),
		search_buildos: (args) => ({
			action: 'Searching BuildOS',
			target: args?.query || args?.search
		}),
		search_project: (args) => ({
			action: 'Searching project',
			target: args?.query || args?.search
		}),
		list_onto_projects: (args) => ({
			action: 'Listing projects',
			target: args?.search
		}),
		search_onto_projects: (args) => ({
			action: 'Searching projects',
			target: args?.search || args?.query
		}),
		get_onto_project_details: (args) => ({
			action: 'Loading project',
			target: resolveEntityName('project', args?.project_id)
		}),
		create_onto_project: (args) => ({
			action: 'Creating project',
			target: args?.project?.name
		}),
		update_onto_project: (args) => ({
			action: 'Updating project',
			target: buildEntityTarget(args?.project_name ?? args?.name, args?.project_id, 'project')
		}),
		list_onto_tasks: (args) => ({
			action: 'Listing tasks',
			target: resolveEntityName('project', args?.project_id)
		}),
		search_onto_tasks: (args) => ({
			action: 'Searching tasks',
			target: args?.query
		}),
		get_onto_task_details: (args) => ({
			action: 'Loading task',
			target: resolveEntityName('task', args?.task_id)
		}),
		create_onto_task: (args) => ({
			action: 'Creating task',
			target: args?.title || args?.task_name || args?.name
		}),
		update_onto_task: (args) => ({
			action: 'Updating task',
			target: buildEntityTarget(args?.task_title ?? args?.title, args?.task_id, 'task')
		}),
		delete_onto_task: (args) => ({
			action: 'Deleting task',
			target: resolveEntityName('task', args?.task_id)
		}),
		list_onto_goals: (args) => ({
			action: 'Listing goals',
			target: resolveEntityName('project', args?.project_id)
		}),
		get_onto_goal_details: (args) => ({
			action: 'Loading goal',
			target: resolveEntityName('goal', args?.goal_id)
		}),
		create_onto_goal: (args) => ({
			action: 'Creating goal',
			target: args?.name
		}),
		update_onto_goal: (args) => ({
			action: 'Updating goal',
			target: buildEntityTarget(args?.goal_name ?? args?.name, args?.goal_id, 'goal')
		}),
		delete_onto_goal: (args) => ({
			action: 'Deleting goal',
			target: resolveEntityName('goal', args?.goal_id)
		}),
		list_onto_plans: (args) => ({
			action: 'Listing plans',
			target: resolveEntityName('project', args?.project_id)
		}),
		get_onto_plan_details: (args) => ({
			action: 'Loading plan',
			target: resolveEntityName('plan', args?.plan_id)
		}),
		create_onto_plan: (args) => ({
			action: 'Creating plan',
			target: args?.name
		}),
		update_onto_plan: (args) => ({
			action: 'Updating plan',
			target: buildEntityTarget(args?.plan_name ?? args?.name, args?.plan_id, 'plan')
		}),
		delete_onto_plan: (args) => ({
			action: 'Deleting plan',
			target: resolveEntityName('plan', args?.plan_id)
		}),
		list_onto_documents: (args) => ({
			action: 'Listing documents',
			target: resolveEntityName('project', args?.project_id)
		}),
		list_onto_milestones: (args) => ({
			action: 'Listing milestones',
			target: resolveEntityName('project', args?.project_id)
		}),
		list_onto_risks: (args) => ({
			action: 'Listing risks',
			target: resolveEntityName('project', args?.project_id)
		}),
		search_onto_documents: (args) => ({
			action: 'Searching documents',
			target: args?.search || args?.query
		}),
		get_onto_document_details: (args) => ({
			action: 'Loading document',
			target: resolveEntityName('document', args?.document_id)
		}),
		get_onto_milestone_details: (args) => ({
			action: 'Loading milestone',
			target: resolveEntityName('milestone', args?.milestone_id)
		}),
		get_onto_risk_details: (args) => ({
			action: 'Loading risk',
			target: resolveEntityName('risk', args?.risk_id)
		}),
		create_onto_document: (args) => ({
			action: 'Creating document',
			target: args?.title || args?.name
		}),
		update_onto_document: (args) => ({
			action: 'Updating document',
			target: buildEntityTarget(
				args?.document_title ?? args?.title,
				args?.document_id,
				'document'
			)
		}),
		update_onto_milestone: (args) => ({
			action: 'Updating milestone',
			target: buildEntityTarget(
				args?.milestone_title ?? args?.title,
				args?.milestone_id,
				'milestone'
			)
		}),
		update_onto_risk: (args) => ({
			action: 'Updating risk',
			target: buildEntityTarget(args?.risk_title ?? args?.title, args?.risk_id, 'risk')
		}),
		delete_onto_document: (args) => ({
			action: 'Deleting document',
			target: resolveEntityName('document', args?.document_id)
		}),
		list_task_documents: (args) => ({
			action: 'Listing task documents',
			target: resolveEntityName('task', args?.task_id)
		}),
		create_task_document: (args) => ({
			action: 'Attaching document to task',
			target: resolveEntityName('task', args?.task_id)
		}),
		get_document_tree: (args) => ({
			action: 'Loading document tree',
			target: resolveEntityName('project', args?.project_id)
		}),
		move_document_in_tree: (args) => ({
			action: 'Reorganizing document tree',
			target: resolveEntityName('document', args?.document_id)
		}),
		get_document_path: (args) => ({
			action: 'Loading document path',
			target: resolveEntityName('document', args?.document_id)
		}),
		get_onto_project_graph: (args) => ({
			action: 'Loading project graph',
			target: resolveEntityName('project', args?.project_id)
		}),
		reorganize_onto_project_graph: (args) => ({
			action: 'Reorganizing project graph',
			target: resolveEntityName('project', args?.project_id)
		}),
		link_onto_entities: (args) => ({
			action: 'Linking entities',
			target: resolveEntityName(args?.src_kind as OntologyEntityKind, args?.src_id)
		}),
		unlink_onto_edge: (args) => ({
			action: 'Unlinking entities',
			target: resolveEntityName(args?.src_kind as OntologyEntityKind, args?.src_id)
		}),
		get_entity_relationships: (args) => ({
			action: 'Loading relationships',
			target: resolveEntityName(args?.entity_kind as OntologyEntityKind, args?.entity_id)
		}),
		get_linked_entities: (args) => ({
			action: 'Loading linked entities',
			target: resolveEntityName(args?.entity_kind as OntologyEntityKind, args?.entity_id)
		}),
		get_field_info: () => ({
			action: 'Loading field guidance'
		}),
		web_search: (args) => ({
			action: 'Running web search',
			target: args?.query
		}),
		get_buildos_overview: () => ({
			action: 'Loading BuildOS overview'
		}),
		get_buildos_usage_guide: () => ({
			action: 'Loading BuildOS usage guide'
		}),
		fetch_project_data: (args) => ({
			action: 'Fetching project',
			target: buildEntityTarget(args.project_name, args.project_id, 'project')
		}),
		search_tasks: (args) => ({
			action: 'Searching tasks',
			target: args.query
		}),
		get_calendar_events: (args) => ({
			action: 'Loading calendar',
			target: args.date
		}),
		list_calendar_events: (args) => ({
			action: 'Listing calendar events',
			target:
				formatCalendarRangeTarget(args) ||
				resolveEntityName('project', args?.project_id) ||
				args?.calendar_scope
		}),
		get_calendar_event_details: (args) => ({
			action: 'Loading calendar event',
			target: resolveEntityName('event', args?.onto_event_id || args?.event_id)
		}),
		create_calendar_event: (args) => ({
			action: 'Creating calendar event',
			target: args?.title
		}),
		update_calendar_event: (args) => ({
			action: 'Updating calendar event',
			target: resolveEntityName('event', args?.onto_event_id || args?.event_id)
		}),
		delete_calendar_event: (args) => ({
			action: 'Deleting calendar event',
			target: resolveEntityName('event', args?.onto_event_id || args?.event_id)
		}),
		get_project_calendar: (args) => ({
			action: 'Loading project calendar',
			target: resolveEntityName('project', args?.project_id)
		}),
		set_project_calendar: (args) => ({
			action: 'Updating project calendar',
			target: resolveEntityName('project', args?.project_id)
		}),
		tool_exec: (args) => {
			const op = typeof args?.op === 'string' ? args.op.trim() : '';
			const opArgs =
				args?.args && typeof args.args === 'object' && !Array.isArray(args.args)
					? (args.args as Record<string, any>)
					: {};
			const target =
				(typeof opArgs.query === 'string' && opArgs.query) ||
				(typeof opArgs.search === 'string' && opArgs.search) ||
				(typeof opArgs.title === 'string' && opArgs.title) ||
				(typeof opArgs.name === 'string' && opArgs.name) ||
				(typeof opArgs.url === 'string' && opArgs.url) ||
				undefined;
			return {
				action: op ? `Executing ${op}` : 'Executing tool operation',
				target
			};
		}
	};

	const TOOL_ACTION_PAST_TENSE: Record<string, string> = {
		Running: 'Ran',
		Setting: 'Set'
	};

	const TOOL_ACTION_BASE_FORM: Record<string, string> = {
		Running: 'run',
		Creating: 'create',
		Updating: 'update',
		Deleting: 'delete',
		Executing: 'execute',
		Loading: 'load',
		Checking: 'check',
		Searching: 'search',
		Listing: 'list',
		Reading: 'read',
		Setting: 'set'
	};

	function toPastTenseAction(action: string): string {
		const [verb, ...rest] = action.split(' ');
		if (!verb) return action;
		const pastVerb =
			TOOL_ACTION_PAST_TENSE[verb] ??
			(verb.endsWith('ing') ? `${verb.slice(0, -3)}ed` : verb);
		return [pastVerb, ...rest].join(' ');
	}

	function toFailureAction(action: string): string {
		const [verb, ...rest] = action.split(' ');
		if (!verb) return action.toLowerCase();
		const baseVerb =
			TOOL_ACTION_BASE_FORM[verb] ??
			(verb.toLowerCase().endsWith('ing')
				? verb.toLowerCase().slice(0, -3)
				: verb.toLowerCase());
		return [baseVerb, ...rest].join(' ').toLowerCase();
	}

	function formatErrorMessage(error: unknown, maxLength = 160): string | undefined {
		if (!error) return undefined;

		let message = '';
		if (typeof error === 'string') {
			message = error;
		} else if (error instanceof Error && error.message) {
			message = error.message;
		} else if (typeof error === 'object') {
			const candidate = (error as { message?: unknown }).message;
			if (typeof candidate === 'string') {
				message = candidate;
			} else {
				try {
					message = JSON.stringify(error);
				} catch {
					message = String(error);
				}
			}
		} else {
			message = String(error);
		}

		const trimmed = message.trim();
		if (!trimmed) return undefined;
		if (trimmed.length <= maxLength) return trimmed;
		return `${trimmed.slice(0, Math.max(0, maxLength - 3))}...`;
	}

	function formatErrorSuffix(errorMessage?: string): string {
		if (!errorMessage) return '';
		return ` - ${errorMessage}`;
	}

	function capitalizeWord(value: string): string {
		if (!value) return value;
		return value.charAt(0).toUpperCase() + value.slice(1);
	}

	const OPERATION_VERBS: Record<string, { present: string; past: string }> = {
		list: { present: 'Listing', past: 'Listed' },
		search: { present: 'Searching', past: 'Searched' },
		read: { present: 'Reading', past: 'Read' },
		create: { present: 'Creating', past: 'Created' },
		update: { present: 'Updating', past: 'Updated' },
		delete: { present: 'Deleting', past: 'Deleted' }
	};

	function formatOperationEvent(operation: Record<string, any>): {
		message: string;
		activityStatus: ActivityEntry['status'];
	} {
		const action = typeof operation?.action === 'string' ? operation.action : 'work';
		const status = typeof operation?.status === 'string' ? operation.status : 'start';
		const entityType =
			typeof operation?.entity_type === 'string'
				? operation.entity_type.replace(/_/g, ' ')
				: 'item';
		const entityName =
			typeof operation?.entity_name === 'string' ? operation.entity_name.trim() : '';
		const verbPair = OPERATION_VERBS[action] ?? {
			present: capitalizeWord(action),
			past: capitalizeWord(action)
		};
		const verb = status === 'success' ? verbPair.past : verbPair.present;
		const message = entityName
			? `${verb} ${entityType}: "${entityName}"`
			: `${verb} ${entityType}`;
		const activityStatus =
			status === 'success' ? 'completed' : status === 'error' ? 'failed' : 'pending';
		return { message, activityStatus };
	}

	/**
	 * Formats a tool message based on tool name, arguments, and status
	 */
	function formatToolMessage(
		toolName: string,
		argsJson: string | Record<string, any>,
		status: 'pending' | 'completed' | 'failed',
		errorMessage?: string
	): string {
		const errorSuffix = status === 'failed' ? formatErrorSuffix(errorMessage) : '';
		const formatter = TOOL_DISPLAY_FORMATTERS[toolName];

		if (!formatter) {
			// Fallback for unknown tools
			if (toolName === 'tool_exec') {
				if (status === 'pending') return 'Executing tool operation...';
				if (status === 'completed') return 'Executed tool operation';
				return `Tool operation failed${errorSuffix}`;
			}
			if (status === 'pending') return `Using tool: ${toolName}`;
			if (status === 'completed') return `Tool ${toolName} completed`;
			return `Tool ${toolName} failed${errorSuffix}`;
		}

		try {
			const args = typeof argsJson === 'string' ? JSON.parse(argsJson) : argsJson;
			const { action, target } = formatter(args);

			// If no target name, use simplified format
			if (!target) {
				if (status === 'pending') {
					return `${action}...`;
				} else if (status === 'completed') {
					return toPastTenseAction(action);
				} else {
					return `Failed to ${toFailureAction(action)}${errorSuffix}`;
				}
			}

			// With target name, use detailed format
			if (status === 'pending') {
				return `${action}: "${target}"`;
			} else if (status === 'completed') {
				// Convert "Creating" → "Created", "Updating" → "Updated"
				const pastTense = toPastTenseAction(action);
				return `${pastTense}: "${target}"`;
			} else {
				return `Failed to ${toFailureAction(action)}: "${target}"${errorSuffix}`;
			}
		} catch (e) {
			if (dev) {
				console.error('[AgentChat] Error parsing tool arguments:', e);
			}
			if (toolName === 'tool_exec') {
				return status === 'failed'
					? `Tool operation failed${errorSuffix}`
					: 'Executing tool operation...';
			}
			return `Using tool: ${toolName}`;
		}
	}

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

	// Update plan step status in thinking block
	function updatePlanStepStatus(
		stepNumber: number | undefined,
		status: string,
		stepUpdate?: { error?: string; result?: any }
	) {
		if (!stepNumber || !currentPlan || !currentThinkingBlockId) return;

		const stepPatch: Record<string, any> = { status };
		if (stepUpdate?.error !== undefined) {
			stepPatch.error = stepUpdate.error;
		}
		if (stepUpdate?.result !== undefined) {
			stepPatch.result = stepUpdate.result;
		}

		updateThinkingBlock(currentThinkingBlockId, (block) => {
			// Find the plan activity
			const updatedActivities = block.activities.map((activity) => {
				if (
					activity.activityType === 'plan_created' &&
					activity.metadata?.plan?.id === currentPlan?.id
				) {
					// Non-null assertion safe: we just verified metadata.plan.id exists above
					const existingMetadata = activity.metadata!;
					// Update the plan steps with new status
					const updatedPlan = {
						...existingMetadata.plan,
						steps: existingMetadata.plan.steps.map((step: any) =>
							step.stepNumber === stepNumber ? { ...step, ...stepPatch } : step
						)
					};

					return {
						...activity,
						metadata: {
							...existingMetadata,
							plan: updatedPlan,
							currentStep:
								status === 'executing' ? stepNumber : existingMetadata.currentStep
						}
					};
				}
				return activity;
			});

			return {
				...block,
				activities: updatedActivities
			};
		});
	}

	// Data mutation tools that should trigger toasts
	const DATA_MUTATION_TOOLS = new Set([
		'create_onto_project',
		'update_onto_project',
		'create_onto_task',
		'update_onto_task',
		'delete_onto_task',
		'create_onto_goal',
		'update_onto_goal',
		'delete_onto_goal',
		'create_onto_plan',
		'update_onto_plan',
		'delete_onto_plan',
		'create_onto_document',
		'update_onto_document',
		'delete_onto_document',
		'update_onto_milestone',
		'update_onto_risk',
		'create_calendar_event',
		'update_calendar_event',
		'delete_calendar_event',
		'set_project_calendar'
	]);

	const MUTATION_TRACKED_TOOLS = new Set([
		...DATA_MUTATION_TOOLS,
		'create_task_document',
		'link_onto_entities',
		'unlink_onto_edge'
	]);

	let mutationCount = 0;
	const mutatedProjectIds = new Set<string>();

	function resetMutationTracking() {
		mutationCount = 0;
		mutatedProjectIds.clear();
	}

	function safeParseArgs(argsJson: string | Record<string, unknown> | undefined) {
		if (!argsJson) return {};
		if (typeof argsJson === 'string') {
			try {
				return JSON.parse(argsJson) as Record<string, unknown>;
			} catch (e) {
				if (dev) {
					console.warn('[AgentChat] Failed to parse tool args for mutation tracking', e);
				}
				return {};
			}
		}
		return argsJson;
	}

	function resolveProjectId(
		args: Record<string, unknown>,
		toolResult?: { data?: any }
	): string | undefined {
		const argsProjectId = args?.project_id;
		if (typeof argsProjectId === 'string' && argsProjectId.length > 0) {
			return argsProjectId;
		}

		const data = toolResult?.data;
		const dataProjectId =
			data?.project_id ??
			data?.project?.id ??
			data?.task?.project_id ??
			data?.goal?.project_id ??
			data?.plan?.project_id ??
			data?.document?.project_id ??
			data?.milestone?.project_id ??
			data?.risk?.project_id ??
			data?.event?.project_id;
		if (typeof dataProjectId === 'string' && dataProjectId.length > 0) {
			return dataProjectId;
		}

		if (isProjectContext(selectedContextType) && selectedEntityId) {
			return selectedEntityId;
		}

		return undefined;
	}

	function recordDataMutation(
		toolName: string | undefined,
		argsJson: string | Record<string, unknown> | undefined,
		success: boolean,
		toolResult?: { data?: any }
	) {
		if (!toolName || !success || !MUTATION_TRACKED_TOOLS.has(toolName)) return;

		if (toolName === 'create_onto_project' && toolResult?.data?.clarifications?.length) {
			return;
		}

		const args = safeParseArgs(argsJson);
		const projectId = resolveProjectId(args, toolResult);

		mutationCount += 1;
		if (projectId) {
			mutatedProjectIds.add(projectId);
		}
	}

	function buildMutationSummary(): DataMutationSummary {
		return {
			hasChanges: mutationCount > 0,
			totalMutations: mutationCount,
			affectedProjectIds: Array.from(mutatedProjectIds),
			hasMessagesSent: hasSentMessage,
			sessionId: currentSession?.id ?? null,
			contextType: selectedContextType ?? null,
			entityId: selectedEntityId ?? null
		};
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
			const newContent = formatToolMessage(toolName, args, status, errorMessage);

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
					...(errorMessage ? { error: errorMessage } : {})
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

	function showToolResultToast(
		toolName: string,
		argsJson: string | Record<string, unknown>,
		success: boolean
	): void {
		// Only show toasts for data mutation tools
		if (!DATA_MUTATION_TOOLS.has(toolName)) return;

		const formatter = TOOL_DISPLAY_FORMATTERS[toolName];
		if (!formatter) return;

		try {
			const args = typeof argsJson === 'string' ? JSON.parse(argsJson) : argsJson;
			const { action, target } = formatter(args);
			const pastTense = toPastTenseAction(action);

			if (success) {
				const message = target ? `${pastTense}: "${target}"` : pastTense;
				toastService.success(message);
			} else {
				const failureAction = toFailureAction(action);
				const message = target
					? `Failed to ${failureAction}: "${target}"`
					: `Failed to ${failureAction}`;
				toastService.error(message);
			}
		} catch (e) {
			// Silently fail on parse errors - activity display already shows status
			if (dev) {
				console.error('[AgentChat] Error showing tool result toast:', e);
			}
		}
	}

	function finalizeSession(reason: 'close' | 'destroy') {
		if (hasFinalizedSession) return;
		const session = currentSession;
		if (!session?.id) return;
		const sessionId = session.id;

		const contextType =
			selectedContextType ??
			(session.context_type as ChatContextType | undefined) ??
			'global';
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
		stopVoiceInput();
		cancelSessionBootstrap();
		if (currentStreamController && isStreaming) {
			void handleStopGeneration('user_cancelled');
		} else if (currentStreamController) {
			currentStreamController.abort();
			currentStreamController = null;
			activeTransportStreamRunId = null;
			activeClientTurnId = null;
		}
		cleanupVoiceInput();

		// Clear any pending tool results to prevent memory leaks
		pendingToolResults.clear();
		hiddenToolCallIds.clear();

		const summary = buildMutationSummary();
		if (summary.hasChanges && isProjectContext(selectedContextType) && selectedEntityId) {
			void createProjectInvalidation(selectedEntityId)
				.all()
				.catch((err) => {
					if (dev) {
						console.warn('[AgentChat] Project invalidation failed on close:', err);
					}
				});
		}

		resetMutationTracking();

		if (onClose) onClose(summary);
	}

	async function exportCurrentSessionAudit() {
		if (!browser) return;

		const sessionId = currentSession?.id;
		if (!sessionId) {
			toastService.error('Start or resume a chat session before exporting the audit.');
			return;
		}

		isExportingAudit = true;
		try {
			const payload = await fetchChatSessionAuditPayload(sessionId);
			downloadChatSessionAuditMarkdown(payload);
			toastService.success('Session audit exported as markdown');
		} catch (err) {
			console.error('Failed exporting current session audit', err);
			toastService.error(
				err instanceof Error ? err.message : 'Failed to export session audit markdown'
			);
		} finally {
			isExportingAudit = false;
		}
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
			if (!isSendDisabled || isStreaming || isVoiceRecording) {
				handleSendMessage();
			}
		}
	}

	// Handles "send while recording" - stops recording and auto-sends after transcription
	async function handleSendMessage() {
		// Haptic feedback for message send action (mobile)
		haptic('medium');

		// If currently recording, stop and queue auto-send after transcription
		if (isVoiceRecording) {
			pendingSendAfterTranscription = true;
			await stopVoiceInput();
			return; // The $effect below will auto-send when transcription completes
		}
		sendMessage();
	}

	// Auto-send after transcription completes (when user clicked send while recording)
	$effect(() => {
		if (!pendingSendAfterTranscription) return;
		if (isVoiceRecording || isVoiceTranscribing || isVoiceInitializing) return;

		if (inputValue.trim()) {
			pendingSendAfterTranscription = false;
			sendMessage();
			return;
		}

		pendingSendAfterTranscription = false;
	});

	async function sendMessage(
		contentOverride?: string,
		options: { senderType?: 'user' | 'agent_peer'; suppressInputClear?: boolean } = {}
	) {
		const { senderType = 'user', suppressInputClear = false } = options;
		const trimmed = (contentOverride ?? inputValue).trim();
		const activeVoiceNoteGroupId = voiceNoteGroupId;
		if (!trimmed || isVoiceInitializing || isVoiceTranscribing) return;
		if (!selectedContextType) {
			error = 'Select a focus before starting the conversation.';
			return;
		}
		if (isLoadingSession) {
			error = 'Wait for the existing session to finish loading.';
			return;
		}

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
		const userMessage: UIMessage = {
			id: crypto.randomUUID(),
			session_id: sessionForTurn.id,
			user_id: undefined, // Will be set by backend
			type: senderType as UIMessage['type'],
			role: 'user' as ChatRole,
			content: trimmed,
			timestamp: now,
			created_at: now.toISOString(),
			metadata: {
				...(activeVoiceNoteGroupId ? { voice_note_group_id: activeVoiceNoteGroupId } : {}),
				client_turn_id: clientTurnId,
				stream_run_id: transportStreamRunId
			}
		};

		messages = [...messages, userMessage];
		hasSentMessage = true;
		if (!suppressInputClear) {
			inputValue = '';
		}
		if (activeVoiceNoteGroupId) {
			voiceNoteGroupId = null;
		}
		error = null;

		// Increment run id for stale-stream guard
		activeStreamRunId = activeStreamRunId + 1;
		const runId = activeStreamRunId;
		activeTransportStreamRunId = transportStreamRunId;
		activeClientTurnId = clientTurnId;
		activeStreamTiming = buildClientStreamTimingState(runId);

		isStreaming = true;
		pendingToolResults.clear();
		hiddenToolCallIds.clear();

		createThinkingBlock();

		currentActivity = 'Analyzing request...';
		updateThinkingBlockState('thinking', 'BuildOS is processing your request...');

		currentPlan = null;
		// NOTE: Do NOT reset lastTurnContext here - it should be preserved and sent with the next request
		// for conversation continuity. The server will generate fresh context after each turn.

		// Reset scroll flag so we always scroll to show new user message
		userHasScrolled = false;

		let streamController: AbortController | null = null;
		let receivedStreamEvent = false;

		try {
			streamController = new AbortController();
			currentStreamController = streamController;

			// Determine ontology entity type from context
			let ontologyEntityType:
				| 'task'
				| 'plan'
				| 'goal'
				| 'document'
				| 'milestone'
				| 'risk'
				| 'requirement'
				| undefined;
			if (requestProjectFocus && requestProjectFocus.focusType !== 'project-wide') {
				ontologyEntityType = requestProjectFocus.focusType;
			}
			const prewarmCacheKey =
				requestContextType &&
				buildFastChatContextCacheKey({
					contextType: requestContextType,
					entityId: requestEntityId ?? requestProjectFocus?.projectId ?? null,
					projectFocus: requestProjectFocus
				});
			const matchingPrewarmedContext =
				prewarmCacheKey &&
				prewarmedContext &&
				prewarmedContext.key === prewarmCacheKey &&
				isFastChatContextCacheFresh(prewarmedContext)
					? prewarmedContext
					: null;

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
					ontologyEntityType: ontologyEntityType, // Pass entity type for ontology loading
					projectFocus: requestProjectFocus,
					lastTurnContext: lastTurnContext, // Pass last turn context for conversation continuity
					stream_run_id: transportStreamRunId,
					client_turn_id: clientTurnId,
					voiceNoteGroupId: activeVoiceNoteGroupId,
					prewarmedContext: matchingPrewarmedContext
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
				if (runId !== activeStreamRunId) {
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
			finalizeClientStreamTiming(runId, 'error', 'error');

			// Remove user message on error
			messages = messages.filter((m) => m.id !== userMessage.id);
			inputValue = trimmed;
		} finally {
			if (currentStreamController === streamController) {
				currentStreamController = null;
			}
		}
	}

	function hydrateSessionFromEvent(sessionEvent: ChatSession) {
		currentSession = sessionEvent;
		const sessionTitle = deriveSessionTitle(sessionEvent);
		const sessionContextType =
			(sessionEvent.context_type as ChatContextType | undefined) ?? 'global';
		const normalizedSessionContext =
			sessionContextType === 'general' ? 'global' : sessionContextType;
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

	function handleSSEMessage(event: AgentSSEMessage) {
		if (event.type !== 'text' && event.type !== 'text_delta') {
			flushAssistantText();
		}
		switch (event.type) {
			case 'session':
				// Session hydration
				if (event.session) {
					hydrateSessionFromEvent(event.session);
				}
				break;

			case 'context_usage':
				contextUsage = event.usage ?? null;
				contextUsageOverheadTokens = event.usage
					? deriveContextOverheadTokens({
							serverSnapshot: event.usage,
							messages,
							draft: inputValue
						})
					: 0;
				break;

			case 'timing':
				attachServerTiming(activeStreamRunId, event.timing);
				break;

			case 'last_turn_context':
				// Store last turn context for next message
				lastTurnContext = event.context;
				if (dev) {
					console.debug(
						'[AgentChat] Stored last turn context:',
						$state.snapshot(lastTurnContext)
					);
				}
				break;

			case 'focus_active':
				projectFocus = event.focus;
				break;

			case 'focus_changed':
				projectFocus = event.focus;
				logFocusActivity('Focus changed', event.focus);
				break;

			case 'agent_state': {
				const state = event.state as AgentLoopState;
				updateThinkingBlockState(state, event.details);
				if (event.details) {
					addActivityToThinkingBlock(event.details, 'state_change', {
						state,
						details: event.details
					});
				}
				switch (state) {
					case 'waiting_on_user':
						currentActivity = 'Waiting on your direction...';
						break;
					case 'executing_plan':
						currentActivity = event.details ?? 'Executing plan...';
						break;
					case 'thinking':
					default:
						currentActivity = event.details ?? 'Analyzing request...';
						break;
				}
				break;
			}

			case 'clarifying_questions': {
				addClarifyingQuestionsMessage(event.questions);
				const questionCount = Array.isArray(event.questions)
					? event.questions.filter(
							(question: unknown) => typeof question === 'string' && question.trim()
						).length
					: 0;
				if (questionCount > 0) {
					addActivityToThinkingBlock(
						`Clarifying questions requested (${questionCount})`,
						'clarification',
						{
							questionCount,
							questions: event.questions
						}
					);
					currentActivity = 'Waiting on your clarifications to continue...';
					updateThinkingBlockState(
						'waiting_on_user',
						'Waiting on your clarifications to continue...'
					);
				}
				break;
			}

			case 'plan_created':
				// Plan created with steps - enrich metadata for visualization
				currentPlan = event.plan;
				currentActivity = `Executing plan with ${event.plan?.steps?.length || 0} steps...`;
				updateThinkingBlockState('executing_plan', currentActivity);

				// Extract rich metadata for enhanced visualization
				const enrichedMetadata = {
					plan: event.plan,
					stepCount: event.plan?.steps?.length || 0,
					totalTools: event.plan?.steps
						? [...new Set(event.plan.steps.flatMap((s) => s.tools || []))].length
						: 0,
					hasExecutors: event.plan?.steps?.some((s) => s.executorRequired),
					estimatedDuration: event.plan?.metadata?.estimatedDuration,
					hasDependencies: event.plan?.steps?.some(
						(s) => s.dependsOn && s.dependsOn.length > 0
					),
					currentStep: null // Will be updated as steps execute
				};

				addActivityToThinkingBlock(
					`Plan created with ${event.plan?.steps?.length || 0} steps`,
					'plan_created',
					enrichedMetadata
				);
				addPlanStatusAssistantMessage(
					`I drafted a plan with ${event.plan?.steps?.length || 0} steps and will start executing it.`
				);
				break;
			case 'plan_ready_for_review': {
				currentPlan = event.plan;
				const summary =
					event.summary ||
					'Plan drafted and waiting for your approval. Reply with any changes or say "run it".';

				// Extract rich metadata for enhanced visualization
				const reviewMetadata = {
					plan: event.plan,
					stepCount: event.plan?.steps?.length || 0,
					totalTools: event.plan?.steps
						? [...new Set(event.plan.steps.flatMap((s) => s.tools || []))].length
						: 0,
					hasExecutors: event.plan?.steps?.some((s) => s.executorRequired),
					estimatedDuration: event.plan?.metadata?.estimatedDuration,
					hasDependencies: event.plan?.steps?.some(
						(s) => s.dependsOn && s.dependsOn.length > 0
					),
					summary,
					currentStep: null
				};

				addActivityToThinkingBlock(
					`Plan ready for review: ${event.plan?.steps?.length || 0} steps`,
					'plan_created',
					reviewMetadata
				);
				addActivityToThinkingBlock(summary, 'general');
				addPlanStatusAssistantMessage(
					`I drafted a ${event.plan?.steps?.length || 0}-step plan. Review it and say "run it" or suggest changes.`
				);
				currentActivity = 'Waiting on your feedback about the plan...';
				updateThinkingBlockState('waiting_on_user', summary);
				break;
			}

			case 'step_start':
				// Starting a plan step - update visualization
				currentActivity = `Step ${event.step?.stepNumber}: ${event.step?.description}`;
				updatePlanStepStatus(event.step?.stepNumber, 'executing');
				addActivityToThinkingBlock(`Starting: ${event.step?.description}`, 'step_start', {
					stepNumber: event.step?.stepNumber,
					description: event.step?.description,
					planId: currentPlan?.id
				});
				break;

			case 'executor_spawned':
				// Executor agent spawned
				currentActivity = `Executor working on task...`;
				updateThinkingBlockState('executing_plan', currentActivity);
				addActivityToThinkingBlock(
					`Executor started for: ${event.task?.description}`,
					'executor_spawned',
					{
						task: event.task
					}
				);
				break;
			case 'plan_review': {
				const verdictCopy =
					event.verdict === 'approved'
						? 'Plan approved'
						: event.verdict === 'changes_requested'
							? 'Plan needs changes'
							: 'Plan rejected';
				const noteCopy = event.notes ? ` · ${event.notes}` : '';
				addActivityToThinkingBlock(`${verdictCopy}${noteCopy}`, 'plan_review', {
					verdict: event.verdict,
					notes: event.notes
				});
				currentActivity =
					event.verdict === 'approved'
						? 'Executing approved plan...'
						: 'Waiting on plan revisions...';
				if (event.verdict === 'approved') {
					updateThinkingBlockState('executing_plan', currentActivity);
				} else {
					updateThinkingBlockState('waiting_on_user', currentActivity);
				}
				break;
			}

			case 'text_delta':
			case 'text':
				// Streaming text (could be from planner or executor)
				if (event.content) {
					bufferAssistantText(event.content);
				}
				break;

			case 'tool_call':
				// Tool being called - parse arguments for meaningful display
				const rawToolName = event.tool_call?.function?.name || 'unknown';
				const toolCallId = event.tool_call?.id;
				const args = event.tool_call?.function?.arguments || '';
				const displayPayload = normalizeToolDisplayPayload(rawToolName, args);

				if (displayPayload.hidden) {
					if (toolCallId) {
						hiddenToolCallIds.add(toolCallId);
					}
					break;
				}

				if (dev) {
					console.log('[AgentChat] Tool call:', {
						toolName: rawToolName,
						toolCallId,
						args:
							typeof args === 'string'
								? args.substring(0, 100)
								: JSON.stringify(args).slice(0, 100)
					});
				}

				// Format message with parsed arguments
				const displayMessage = formatToolMessage(
					displayPayload.toolName,
					displayPayload.args,
					'pending'
				);

				const activity: ActivityEntry = {
					id: crypto.randomUUID(),
					content: displayMessage,
					timestamp: new Date(),
					activityType: 'tool_call',
					status: 'pending',
					toolCallId,
					metadata: {
						toolName: displayPayload.toolName,
						originalToolName: displayPayload.originalToolName,
						gatewayOp: displayPayload.gatewayOp,
						toolCallId,
						arguments: displayPayload.args,
						rawArguments: args,
						status: 'pending',
						toolCall: event.tool_call
					}
				};

				const blockId = ensureThinkingBlock();
				updateThinkingBlock(blockId, (block) => ({
					...block,
					activities: [...block.activities, activity]
				}));

				if (toolCallId && pendingToolResults.has(toolCallId)) {
					const pendingStatus = pendingToolResults.get(toolCallId);
					if (pendingStatus) {
						updateActivityStatus(
							toolCallId,
							pendingStatus.status,
							pendingStatus.errorMessage
						);
					}
					pendingToolResults.delete(toolCallId);
				}
				break;

			case 'tool_result': {
				// Tool result received - update matching tool call activity
				const toolResult = event.result;
				const resultToolCallId = toolResult?.toolCallId ?? toolResult?.tool_call_id;
				const rawResultToolName =
					(typeof toolResult?.toolName === 'string' && toolResult.toolName) ||
					(typeof toolResult?.tool_name === 'string' && toolResult.tool_name) ||
					undefined;
				const success = toolResult?.success ?? true;
				const toolError = toolResult?.error;
				const toolErrorMessage = success ? undefined : formatErrorMessage(toolError);
				let resolvedToolName: string | undefined;
				let resolvedArgs: string | Record<string, unknown> | undefined;

				if (dev) {
					console.log('[AgentChat] Tool result:', {
						resultToolCallId,
						success,
						hasError: !!toolError
					});
				}

				indexEntitiesFromToolResult(toolResult);

				if (resultToolCallId && hiddenToolCallIds.has(resultToolCallId)) {
					hiddenToolCallIds.delete(resultToolCallId);
					pendingToolResults.delete(resultToolCallId);
					break;
				}
				if (
					!resultToolCallId &&
					rawResultToolName &&
					HIDDEN_THINKING_TOOLS.has(rawResultToolName)
				) {
					break;
				}

				if (resultToolCallId) {
					// Update the matching activity status
					const result = updateActivityStatus(
						resultToolCallId,
						success ? 'completed' : 'failed',
						toolErrorMessage
					);

					if (!result.matched) {
						pendingToolResults.set(resultToolCallId, {
							status: success ? 'completed' : 'failed',
							errorMessage: toolErrorMessage
						});
					} else if (result.toolName && result.args !== undefined) {
						// Show toast for data mutation operations
						showToolResultToast(result.toolName, result.args, success);
						resolvedToolName = result.toolName;
						resolvedArgs = result.args;
					}
					resolvedToolName = resolvedToolName ?? rawResultToolName;
				} else {
					// No matching tool call ID - log warning but don't add duplicate message
					if (dev) {
						console.warn(
							'[AgentChat] Tool result without matching tool_call_id:',
							event
						);
					}
					resolvedToolName = rawResultToolName;
				}

				if (resolvedToolName === 'tool_exec') {
					const gatewayOp =
						toolResult?.data && typeof toolResult.data === 'object'
							? (toolResult.data as Record<string, unknown>).op
							: undefined;
					if (typeof gatewayOp === 'string' && gatewayOp.trim()) {
						resolvedToolName =
							mapGatewayOpToToolName(gatewayOp.trim()) ?? resolvedToolName;
					}
				}

				recordDataMutation(resolvedToolName, resolvedArgs, success, toolResult);
				break;
			}

			case 'skill_activity':
				if (dev) {
					upsertSkillActivityInThinkingBlock(event);
				}
				break;

			case 'operation': {
				const operationPayload =
					'operation' in event && event.operation ? event.operation : event;
				const { message: operationMessage, activityStatus } = formatOperationEvent(
					operationPayload as Record<string, any>
				);
				addActivityToThinkingBlock(
					operationMessage,
					'operation',
					{
						operation: operationPayload
					},
					activityStatus
				);
				break;
			}

			case 'entity_patch': {
				if (dev) {
					console.debug('[AgentChat] entity_patch received', event);
				}
				addActivityToThinkingBlock('State updated', 'operation', {
					patch: (event as { patch?: unknown }).patch
				});
				break;
			}
			case 'context_shift': {
				const shift = event.context_shift;
				if (shift) {
					const normalizedContext = (
						shift.new_context === 'general' ? 'global' : shift.new_context
					) as ChatContextType;
					selectedContextType = normalizedContext;
					selectedEntityId = shift.entity_id;
					selectedContextLabel =
						shift.entity_name ??
						CONTEXT_DESCRIPTORS[normalizedContext]?.title ??
						selectedContextLabel;

					if (shift.entity_id && shift.entity_name) {
						cacheEntityName(
							(shift.entity_type as OntologyEntityKind) ??
								(isProjectContext(normalizedContext) ? 'project' : 'entity'),
							shift.entity_id,
							shift.entity_name
						);
					}

					if (isProjectContext(normalizedContext) && shift.entity_id) {
						projectFocus = buildProjectWideFocus(
							shift.entity_id,
							shift.entity_name ?? selectedContextLabel
						);
					} else {
						projectFocus = null;
						showFocusSelector = false;
					}
					showProjectActionSelector = false;

					if (currentSession) {
						currentSession = {
							...currentSession,
							context_type: normalizedContext,
							entity_id: shift.entity_id
						};
					}

					const activityMessage =
						shift.message ??
						`Context updated to ${selectedContextLabel ?? normalizedContext}`;
					addActivityToThinkingBlock(activityMessage, 'context_shift', {
						contextShift: shift
					});
				}
				break;
			}

			case 'executor_result':
				// Executor finished - update step status if failed
				if (event.result && !event.result.success && event.result.stepNumber) {
					updatePlanStepStatus(event.result.stepNumber, 'failed');
				}
				addActivityToThinkingBlock(
					event.result?.success ? 'Executor completed successfully' : 'Executor failed',
					'executor_result',
					{
						result: event.result,
						planId: currentPlan?.id
					}
				);
				break;

			case 'step_complete':
				// Step completed - update visualization
				const stepStatus = event.step?.status ?? 'completed';
				const stepNumber = event.step?.stepNumber;
				const stepLabel = stepNumber ? `Step ${stepNumber}` : 'Step';
				const stepError = event.step?.error;
				const stepErrorSummary = formatErrorMessage(stepError, 200);
				updatePlanStepStatus(stepNumber, stepStatus, {
					error: stepError,
					result: event.step?.result
				});
				if (stepStatus === 'failed') {
					addActivityToThinkingBlock(
						`${stepLabel} failed${stepErrorSummary ? `: ${stepErrorSummary}` : ''}`,
						'step_complete',
						{
							stepNumber,
							error: stepError,
							planId: currentPlan?.id,
							status: stepStatus
						},
						'failed'
					);
				} else if (stepStatus === 'skipped') {
					addActivityToThinkingBlock(
						`${stepLabel} skipped${stepErrorSummary ? `: ${stepErrorSummary}` : ''}`,
						'step_complete',
						{
							stepNumber,
							error: stepError,
							planId: currentPlan?.id,
							status: stepStatus
						}
					);
				} else {
					addActivityToThinkingBlock(
						`${stepLabel} complete`,
						'step_complete',
						{
							stepNumber,
							result: event.step?.result,
							planId: currentPlan?.id,
							status: stepStatus
						},
						'completed'
					);
				}
				break;
			case 'done':
				// All done - clear activity and re-enable input
				currentActivity = '';
				finalizeAssistantMessage();
				finalizeThinkingBlock();
				// Note: isStreaming will be set to false by onComplete callback
				// But we can also set it here for immediate UI response
				isStreaming = false;
				if (agentToAgentMode && agentLoopActive) {
					if (agentTurnsRemaining > 0) {
						agentTurnsRemaining = Math.max(0, agentTurnsRemaining - 1);
					}
					if (agentTurnsRemaining <= 0) {
						agentLoopActive = false;
						currentActivity = 'Turn limit reached';
						break;
					}
				}
				break;

			case 'error':
				const streamErrorMessage = event.error || 'An error occurred';
				error = streamErrorMessage;
				isStreaming = false;
				currentActivity = '';
				if (currentThinkingBlockId) {
					addActivityToThinkingBlock(
						streamErrorMessage,
						'general',
						{ error: streamErrorMessage },
						'failed'
					);
					finalizeThinkingBlock('error');
				}
				break;
		}
	}

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

	function addPlanStatusAssistantMessage(content: string) {
		if (!content?.trim()) return;
		const planStatusMessage: UIMessage = {
			id: crypto.randomUUID(),
			type: 'assistant',
			role: 'assistant' as ChatRole,
			content,
			timestamp: new Date(),
			created_at: new Date().toISOString()
		};
		messages = [...messages, planStatusMessage];
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

	// ========================================================================
	// Initial Message Generation
	// ========================================================================

	/**
	 * Generates a contextual initial message based on the selected context type and project info.
	 * This seeds the conversation with the right tone and expectations.
	 */
	function generateInitialMessage(
		contextType: ChatContextType | null,
		projectName?: string | null
	): string | null {
		if (!contextType) return null;

		const name = projectName?.trim() || 'this project';

		switch (contextType) {
			case 'global':
				return "I've got context across all your projects, tasks, and calendar. What are you working through?";

			case 'project_create':
				return "What are you working on? Doesn't have to be clear yet — bring me the rough idea, the half-formed plan, whatever you've got. We'll turn it into something structured.";

			case 'project':
				return `${name === 'this project' ? 'Project' : name} is loaded up. What do you want to dig into?`;

			case 'calendar':
				return "Your calendar's pulled up. What needs sorting out?";

			case 'daily_brief':
				return "Your brief's ready with today's context. What do you want to tackle first?";

			case 'daily_brief_update':
				return "What's not landing right in your daily brief? Tell me what to change.";

			default:
				return null;
		}
	}

	/**
	 * Adds an initial assistant message to start the conversation.
	 * Called when transitioning to chat view after context selection.
	 */
	function addInitialAssistantMessage(content: string) {
		const initialMessage: UIMessage = {
			id: crypto.randomUUID(),
			type: 'assistant',
			role: 'assistant' as ChatRole,
			content,
			timestamp: new Date(),
			created_at: new Date().toISOString()
		};
		messages = [initialMessage];
	}

	/**
	 * Seeds the chat with an initial message based on current context.
	 * Should be called after context selection is complete and chat view is ready.
	 */
	function seedInitialMessage(contextType: ChatContextType | null, projectName?: string | null) {
		const message = generateInitialMessage(contextType, projectName);
		if (message) {
			addInitialAssistantMessage(message);
		}
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
		finalizeSession('destroy');
		stopVoiceInput();
		if (currentStreamController && isStreaming) {
			void handleStopGeneration('user_cancelled');
		} else if (currentStreamController) {
			currentStreamController.abort();
			currentStreamController = null;
			activeTransportStreamRunId = null;
			activeClientTurnId = null;
		}
		cleanupVoiceInput();
	});
</script>

{#snippet chatConversationPane(
	showSessionLoadingState: boolean,
	showSessionLoadErrorState: boolean,
	retrySessionId: string | null
)}
	{#if showSessionLoadingState}
		<div class="flex flex-1 items-center justify-center px-6 text-center">
			<div class="max-w-sm space-y-2">
				<div
					class="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-muted"
				>
					<span
						class="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent text-muted-foreground"
					></span>
				</div>
				<p class="text-sm font-semibold text-foreground">
					{sessionStatusLabel}
				</p>
				<p class="text-xs text-muted-foreground">
					Restoring the conversation before the next turn.
				</p>
			</div>
		</div>
	{:else if showSessionLoadErrorState}
		<div class="flex flex-1 items-center justify-center px-6 text-center">
			<div
				class="max-w-sm space-y-3 rounded-xl border border-red-600/20 bg-red-50 p-4 dark:bg-red-950/20"
			>
				<p class="text-sm font-semibold text-red-700 dark:text-red-300">
					Unable to load this chat
				</p>
				<p class="text-xs text-red-600 dark:text-red-400">
					{sessionLoadError}
				</p>
				{#if retrySessionId}
					<button
						type="button"
						class="inline-flex items-center justify-center rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground shadow-ink transition pressable hover:border-accent hover:bg-muted"
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
			onToggleThinkingBlock={toggleThinkingBlockCollapse}
			bind:container={messagesContainer}
			onScroll={handleScroll}
			{voiceNotesByGroupId}
			onDeleteVoiceNote={removeVoiceNoteFromGroup}
		/>
	{/if}

	{#if error && !showSessionLoadErrorState}
		<div
			class="border-t border-red-600/30 bg-red-50 p-2 text-xs font-semibold text-red-700 tx tx-static tx-weak dark:bg-red-950/20 dark:text-red-400 sm:p-2.5"
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
		<AgentComposer
			bind:voiceInputRef
			bind:inputValue
			bind:isVoiceRecording
			bind:isVoiceInitializing
			bind:isVoiceTranscribing
			bind:voiceErrorMessage
			bind:voiceRecordingDuration
			bind:voiceSupportsLiveTranscript
			bind:voiceNoteGroupId
			{isStreaming}
			{isSendDisabled}
			allowSendWhileStreaming={isTouchDevice}
			{displayContextLabel}
			mode="chat"
			disabled={isSessionBusy}
			vocabularyTerms={chatComposerVocabularyTerms}
			onVoiceNoteSegmentSaved={handleVoiceNoteSegmentSaved}
			onVoiceNoteSegmentError={handleVoiceNoteSegmentError}
			onKeyDownHandler={handleKeyDown}
			onSend={handleSendMessage}
			onStop={() => void handleStopGeneration('user_cancelled')}
		/>
	</div>
{/snippet}

{#if embedded}
	<!-- Embedded mode: render chat content directly without Modal wrapper -->
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
		customClasses="lg:!max-w-6xl xl:!max-w-7xl !max-h-[calc(100dvh_-_var(--keyboard-height,0px))] !h-[calc(100dvh_-_var(--keyboard-height,0px))] sm:!h-[90dvh] sm:!max-h-[95dvh] !rounded-none sm:!rounded-lg !overscroll-none"
	>
		{#snippet header()}
			<!-- INKPRINT header bar with Frame texture -->
			<!-- pt safe-area-inset-top keeps the header below the notch/Dynamic Island on fullscreen mobile -->
			<div
				class="border-b border-border bg-card pt-[env(safe-area-inset-top,0px)] sm:pt-0 tx tx-frame tx-weak"
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
					{showAdminDebugActions}
					{adminSessionHref}
					onExportAudit={exportCurrentSessionAudit}
					{isExportingAudit}
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
							onUseActionableInsight={() => selectAgentForBridge(RESEARCH_AGENT_ID)}
							onProjectSelect={(project) => selectAgentProject(project)}
							onBackAgent={backToAgentSelection}
							onBackProject={backToAgentProjectSelection}
							onStartChat={startAgentToAgentChat}
							onExit={() => {
								agentToAgentMode = false;
								agentToAgentStep = null;
								changeContext();
							}}
							onGoalChange={(value) => (agentGoal = value)}
							onTurnBudgetChange={updateAgentTurnBudget}
						/>
					{:else if isBraindumpContext && braindumpMode === 'input'}
						<!-- BRAINDUMP INPUT MODE - Simplified view with just textarea -->
						<div class="flex flex-1 flex-col min-h-0 p-4 sm:p-6">
							<div class="mb-4 text-center">
								<h2 class="text-lg font-semibold text-foreground">
									Capture your thoughts
								</h2>
								<p class="text-sm text-muted-foreground">
									Type or record whatever's on your mind. No structure needed.
								</p>
							</div>
							<div class="flex-1 min-h-0 overflow-hidden">
								<AgentComposer
									bind:voiceInputRef
									bind:inputValue
									bind:isVoiceRecording
									bind:isVoiceInitializing
									bind:isVoiceTranscribing
									bind:voiceErrorMessage
									bind:voiceRecordingDuration
									bind:voiceSupportsLiveTranscript
									mode="braindump"
									disabled={isSessionBusy}
									isStreaming={false}
									isSendDisabled={!inputValue.trim() ||
										isVoiceRecording ||
										isVoiceInitializing ||
										isVoiceTranscribing}
									displayContextLabel="your braindump"
									vocabularyTerms="braindump"
									onKeyDownHandler={(e) => {
										if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
											e.preventDefault();
											handleBraindumpSubmit();
										}
									}}
									onSend={handleBraindumpSubmit}
								/>
							</div>
							<!-- Desktop keyboard shortcut hint (hidden on mobile) -->
							<p
								class="mt-2 hidden text-center text-xs text-muted-foreground md:block"
							>
								Press Cmd/Ctrl + Enter to continue
							</p>
						</div>
					{:else if isBraindumpContext && braindumpMode === 'options'}
						<!-- BRAINDUMP OPTIONS MODE - Choose save or chat -->
						<div class="flex flex-1 flex-col min-h-0 p-4 sm:p-6">
							<div class="mb-6 text-center">
								<h2 class="text-lg font-semibold text-foreground">
									What would you like to do?
								</h2>
								<p class="text-sm text-muted-foreground">
									You can save this braindump for later or explore it with AI now.
								</p>
							</div>

							<!-- Preview of braindump content -->
							<div
								class="mb-6 rounded-lg border border-border bg-muted/50 p-4 max-h-48 overflow-y-auto"
							>
								<p
									class="text-xs uppercase tracking-wide text-muted-foreground mb-2"
								>
									Your braindump
								</p>
								<p class="text-sm text-foreground whitespace-pre-wrap">
									{pendingBraindumpContent}
								</p>
							</div>

							{#if braindumpSaveError}
								<div
									class="mb-4 rounded-lg border border-red-600/30 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/20 dark:text-red-400"
									role="alert"
								>
									{braindumpSaveError}
								</div>
							{/if}

							<div class="flex flex-col gap-3 sm:flex-row sm:justify-center">
								<button
									type="button"
									class="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-6 py-3 text-sm font-semibold text-foreground shadow-ink transition pressable hover:border-accent hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
									disabled={isSavingBraindump}
									onclick={saveBraindump}
								>
									{#if isSavingBraindump}
										<span
											class="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
										></span>
										Saving...
									{:else}
										Save braindump
									{/if}
								</button>
								<button
									type="button"
									class="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground shadow-ink transition pressable disabled:cursor-not-allowed disabled:opacity-60"
									disabled={isSavingBraindump}
									onclick={chatAboutBraindump}
								>
									Chat about this
								</button>
							</div>

							<button
								type="button"
								class="mt-4 text-sm text-muted-foreground hover:text-foreground transition"
								onclick={cancelBraindumpOptions}
							>
								← Edit braindump
							</button>
						</div>
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
										class="inline-flex items-center justify-center rounded-lg border border-border bg-card px-3 py-2 text-[0.65rem] font-bold uppercase tracking-[0.15em] text-foreground shadow-ink transition pressable hover:border-accent hover:bg-muted"
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
										class="rounded-lg bg-amber-100 px-2.5 py-1.5 text-[0.65rem] font-semibold text-amber-700 tx tx-static tx-weak dark:bg-amber-900/30 dark:text-amber-300"
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

{#if isProjectContext(selectedContextType) && selectedEntityId && resolvedProjectFocus}
	<ProjectFocusSelector
		isOpen={showFocusSelector}
		projectId={selectedEntityId}
		projectName={resolvedProjectFocus.projectName}
		currentFocus={resolvedProjectFocus}
		onSelect={handleFocusSelection}
		onClose={() => (showFocusSelector = false)}
	/>
{/if}

<style>
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
