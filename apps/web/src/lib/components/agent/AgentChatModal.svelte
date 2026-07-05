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
	import { onDestroy, getContext, untrack } from 'svelte';
	import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
	import type { Database } from '@buildos/shared-types';
	import { browser, dev } from '$app/environment';
	import Modal from '$lib/components/ui/Modal.svelte';
	import ContextSelectionScreen from '../chat/ContextSelectionScreen.svelte';
	import ProjectFocusSelector from './ProjectFocusSelector.svelte';
	import ProjectActionSelector from './ProjectActionSelector.svelte';
	import AgentChatHeader from './AgentChatHeader.svelte';
	import AgentComposer from './AgentComposer.svelte';
	import AgentAutomationWizard from './AgentAutomationWizard.svelte';
	import AgentMessageList from './AgentMessageList.svelte';
	import AgentChatActivityTabs from './AgentChatActivityTabs.svelte';
	import BrainDumpContextPanel from './BrainDumpContextPanel.svelte';
	import AgentRunDock from './AgentRunDock.svelte';
	import { agentRunsStore, type AgentRunRow } from '$lib/services/agentRunsRealtime.service';
	import { notificationStore } from '$lib/stores/notification.store';
	import { get } from 'svelte/store';
	import ProjectImageLibrary from '$lib/components/ontology/ProjectImageLibrary.svelte';
	import type { OntologyImageAsset } from '$lib/components/ontology/image-assets/types';
	import type {
		ChatSession,
		ChatContextType,
		ChatRole,
		AgentSSEMessage,
		ContextUsageSnapshot,
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
		type AgentBrainDumpContext,
		type AgentChatHeaderAction,
		type AgentLoopState,
		type AgentChatPanelTab,
		type AgentProjectSummary,
		type AgentChatResolutionAction,
		type AgentTimelineItem,
		type CreatedEntityRef,
		type DataMutationSummary,
		type ProjectAction,
		type ThinkingBlockMessage,
		type UIMessage
	} from './agent-chat.types';
	import {
		buildTimelineItemQuestionDraft,
		mergeAgentTimelineItems,
		timelineItemsFromMessages
	} from './agent-chat-timeline';
	import { toastService } from '$lib/stores/toast.store';
	import { haptic } from '$lib/utils/haptic';
	import { initKeyboardAvoiding } from '$lib/utils/keyboard-avoiding';
	import { notifyDataMutation } from '$lib/stores/projectDataMutations';
	import {
		deriveSessionTitle,
		type AgentChatSessionSnapshot,
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
	import {
		createAgentChatStreamController,
		type SessionBootstrapTarget,
		type StreamTurnReconcileRequest
	} from './agent-chat-stream-controller.svelte';
	import {
		downloadAgentChatStepsMarkdown,
		downloadAgentChatSupportPacketMarkdown
	} from './agent-chat-step-export';
	import {
		AGENT_CHAT_MAX_IMAGE_ATTACHMENTS,
		createAttachmentController
	} from './agent-chat-attachments.svelte';
	import {
		createAgentChatShellRouter,
		type AutoInitProjectConfig,
		type ContextSelectionDetail
	} from './agent-chat-shell-router.svelte';

	interface Props {
		isOpen?: boolean;
		contextType?: ChatContextType;
		entityId?: string;
		onClose?: (summary?: DataMutationSummary) => void;
		autoInitProject?: AutoInitProjectConfig | null;
		initialChatSessionId?: string | null;
		initialBrainDumpContext?: AgentBrainDumpContext | null;
		initialProjectFocus?: ProjectFocus | null;
		embedded?: boolean;
		inboxResolutionActions?: AgentChatResolutionAction[];
		/** Reports the active chat session id so embedding surfaces can render
		 * session-level chrome (e.g. ChatSessionAuditActions) in their own header. */
		onSessionChange?: (sessionId: string | null) => void;
	}

	let {
		isOpen = false,
		contextType: _initialContextType = 'global',
		entityId: _initialEntityId,
		onClose,
		autoInitProject = null,
		initialChatSessionId = null,
		initialBrainDumpContext = null,
		initialProjectFocus = null,
		embedded = false,
		inboxResolutionActions = [],
		onSessionChange
	}: Props = $props();

	const shellRouter = createAgentChatShellRouter({
		resetConversation: (options) => resetConversation(options),
		clearMessages: () => {
			messages = [];
		},
		stopVoice: () => voice.stop(),
		isStreaming: () => stream.isStreaming,
		logFocusActivity: (label, focus) => logFocusActivity(label, focus),
		logError: (message, err) => console.error(message, err),
		hasMultipleAgentHelpers: false,
		researchAgentId: 'actionable_insight_agent'
	});
	// Bumped whenever the agent shifts us into a (new) project context — drives a
	// one-shot glimmer on the header title so landing on a freshly created project
	// feels like a small moment of magic rather than a silent label swap.
	let contextShiftPulse = $state(0);
	let wasOpen = $state(false);
	// Prewarm state lives in the PrewarmController instance created below,
	// once all dependent state and helpers are declared.

	const displayContextLabel = $derived.by(() => {
		return shellRouter.displayContextLabel;
	});

	const displayContextSubtitle = $derived.by(() => {
		return shellRouter.displayContextSubtitle;
	});

	const resolvedProjectFocus = $derived.by<ProjectFocus | null>(() => {
		return shellRouter.resolvedProjectFocus;
	});

	const attachmentProjectId = $derived.by(() => {
		return (
			resolvedProjectFocus?.projectId ??
			(isProjectContext(shellRouter.selectedContextType)
				? shellRouter.selectedEntityId
				: null) ??
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
	let persistedTimelineItems = $state<AgentTimelineItem[]>([]);
	let activeChatTab = $state<AgentChatPanelTab>('chat');
	let brainDumpContext = $state<AgentBrainDumpContext | null>(null);
	let currentSession = $state<ChatSession | null>(null);
	const liveTimelineItems = $derived.by(() =>
		timelineItemsFromMessages(currentSession?.id ?? 'local-session', messages)
	);
	const agentTimelineItems = $derived.by(() =>
		mergeAgentTimelineItems(persistedTimelineItems, liveTimelineItems)
	);
	const exportableStepCount = $derived.by(
		() => agentTimelineItems.filter((item) => item.kind !== 'message').length
	);
	const canExportAgentSteps = $derived(messages.length > 0);
	const canExportSupportPacket = $derived(
		messages.length > 0 || agentTimelineItems.length > 0 || Boolean(currentSession?.id)
	);

	$effect(() => {
		if (initialBrainDumpContext?.id) {
			brainDumpContext = initialBrainDumpContext;
		}
	});

	// ── Agent Work: in-chat run dock + completion-message reload (UI-P4) ──
	const ACTIVE_AGENT_RUN_STATUSES = [
		'queued',
		'running',
		'paused',
		'needs_input',
		'proposal_ready'
	];
	let sessionAgentRuns = $derived.by(() => {
		const sid = currentSession?.id;
		if (!sid) return [] as AgentRunRow[];
		return Array.from($agentRunsStore.values())
			.filter((r) => r.parent_session_id === sid)
			.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
	});
	let activeSessionAgentRunCount = $derived(
		sessionAgentRuns.filter((r) => ACTIVE_AGENT_RUN_STATUSES.includes(r.status)).length
	);

	// Render worker-injected completion messages (01 §7) after the SSE turn ended.
	// Fast path: a chat_messages realtime subscription appends the message the
	// instant it lands. Fallback: when a session run goes terminal, a delayed
	// check reloads the thread only if realtime didn't deliver the message — so
	// the result always shows even if chat_messages isn't in the publication.
	type ChatMessageRow = Database['public']['Tables']['chat_messages']['Row'];
	const supabaseClient = getContext<SupabaseClient | undefined>('supabase');
	let chatMessagesChannel: RealtimeChannel | null = null;
	let subscribedSessionId: string | null = null;
	const seenTerminalAgentRunIds = new Set<string>();
	const agentRunFallbackTimers = new Map<string, ReturnType<typeof setTimeout>>();

	function messageHasAgentRun(runId: string): boolean {
		return messages.some((m) => (m.metadata as any)?.agent_run_id === runId);
	}

	function appendInjectedAgentMessage(row: ChatMessageRow): void {
		if (!row?.id || row.role !== 'assistant') return;
		if (row.session_id !== currentSession?.id) return;
		const agentRunId = (row.metadata as any)?.agent_run_id;
		if (!agentRunId) return; // only agent-run injected messages flow through here
		if (messages.some((m) => m.id === row.id) || messageHasAgentRun(agentRunId)) return;
		messages = [
			...messages,
			{
				id: row.id,
				session_id: row.session_id,
				user_id: row.user_id ?? undefined,
				role: 'assistant',
				type: 'assistant',
				content: row.content ?? '',
				created_at: row.created_at ?? undefined,
				timestamp: row.created_at ? new Date(row.created_at) : new Date(),
				metadata: (row.metadata as Record<string, any>) ?? undefined
			} as UIMessage
		];
	}

	async function unsubscribeSessionMessages(): Promise<void> {
		const channel = chatMessagesChannel;
		chatMessagesChannel = null;
		subscribedSessionId = null;
		if (channel && supabaseClient) {
			try {
				await supabaseClient.removeChannel(channel);
			} catch {
				/* noop */
			}
		}
	}

	function subscribeSessionMessages(sid: string): void {
		if (!browser || !supabaseClient) return;
		if (subscribedSessionId === sid && chatMessagesChannel) return;
		void unsubscribeSessionMessages();
		subscribedSessionId = sid;
		const channel = supabaseClient.channel(`chat-messages:${sid}`);
		channel.on(
			'postgres_changes',
			{
				event: 'INSERT',
				schema: 'public',
				table: 'chat_messages',
				filter: `session_id=eq.${sid}`
			},
			(payload) => appendInjectedAgentMessage(payload.new as ChatMessageRow)
		);
		void channel.subscribe();
		chatMessagesChannel = channel;
	}

	// Keep the realtime subscription pinned to the active session.
	$effect(() => {
		const sid = currentSession?.id;
		if (sid) subscribeSessionMessages(sid);
	});

	// Detect newly-terminal session runs and arm the fallback reload.
	$effect(() => {
		const runs = $agentRunsStore;
		const sid = currentSession?.id;
		if (!sid) return;
		for (const r of runs.values()) {
			if (r.parent_session_id !== sid) continue;
			if (
				!ACTIVE_AGENT_RUN_STATUSES.includes(r.status) &&
				!seenTerminalAgentRunIds.has(r.id)
			) {
				seenTerminalAgentRunIds.add(r.id);
				scheduleAgentRunMessageFallback(sid, r.id);
			}
		}
	});

	function scheduleAgentRunMessageFallback(sid: string, runId: string): void {
		const existing = agentRunFallbackTimers.get(runId);
		if (existing) clearTimeout(existing);
		const timer = setTimeout(() => {
			agentRunFallbackTimers.delete(runId);
			if (currentSession?.id !== sid) return;
			// Realtime already delivered it — nothing to do.
			if (messageHasAgentRun(runId)) return;
			// Don't clobber an in-flight streamed turn; retry shortly.
			if (stream.isStreaming) {
				scheduleAgentRunMessageFallback(sid, runId);
				return;
			}
			void loadChatSession(sid, { backgroundRefresh: true });
		}, 2500);
		agentRunFallbackTimers.set(runId, timer);
	}

	function openAgentRun(runId: string) {
		const state = get(notificationStore);
		for (const n of state.notifications.values()) {
			if (n.type === 'agent-run' && n.data.runId === runId) {
				notificationStore.expand(n.id);
				return;
			}
		}
	}
	let inputValue = $state('');
	const attachments = createAttachmentController({
		getBrowser: () => browser,
		getProjectId: () => attachmentProjectId,
		getMessages: () => messages,
		setMessages: (updater) => {
			messages = updater(messages);
		},
		toastError: (message) => toastService.error(message),
		logWarn: (message, err) => {
			if (dev) {
				console.warn(message, err);
			}
		}
	});
	let showExistingImagePicker = $state(false);
	let userHasScrolled = $state(false);
	let currentAssistantMessageId = $state<string | null>(null);
	let currentAssistantMessageIndex = $state<number | null>(null);
	let pendingAssistantText = '';
	let pendingAssistantTextFlushHandle: number | null = null;
	let currentThinkingBlockId = $state<string | null>(null);
	const pendingToolResults = new Map<string, PendingToolStatus>(); // Tool results that arrive before tool_call
	const hiddenToolCallIds = new Set<string>();
	const processedToolCallIds = new Set<string>();
	const processedToolResultIds = new Set<string>();

	const selectedAttachmentAssetIds = $derived.by(() => attachments.selectedAttachmentAssetIds);

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
	let prewarm: ReturnType<typeof createPrewarmController>;
	let handleSSEMessage: (event: AgentSSEMessage) => void = () => {
		/* assigned after SSE deps are created */
	};

	// Let embedding surfaces (e.g. BriefChatModal) mirror the active session id
	// into their own header chrome.
	$effect(() => {
		onSessionChange?.(currentSession?.id ?? null);
	});

	const displayContextUsage = $derived.by(() => {
		if (!shellRouter.selectedContextType) {
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

	const AGENT_STATE_MESSAGES: Record<AgentLoopState, string> = {
		thinking: 'BuildOS is thinking...',
		waiting_on_user: 'Waiting on your direction...'
	};

	const ACTIVE_TURN_SESSION_REFRESH_MS = 2000;
	const TURN_RECONCILE_RETRY_MS = 1200;
	const TURN_RECONCILE_MAX_ATTEMPTS = 8;
	let turnReconciliationRequestId = 0;

	// Voice recording adapter — see agent-chat-voice.svelte.ts
	const voice = createVoiceAdapter({
		toastError: (msg) => toastService.error(msg),
		logWarn: (msg, err) => {
			console.error(msg, err);
		}
	});

	const stream = createAgentChatStreamController({
		getInputValue: () => inputValue,
		setInputValue: (value) => {
			inputValue = value;
		},
		getSelectedContextType: () => shellRouter.selectedContextType,
		getSelectedEntityId: () => shellRouter.selectedEntityId,
		getResolvedProjectFocus: () => resolvedProjectFocus,
		getCurrentSession: () => currentSession,
		ensureSessionReady: (target) => ensureSessionReady(target),
		getLastTurnContext: () => lastTurnContext,
		getIsLoadingSession: () => isLoadingSession,
		getActiveRestoredTurnRunId: () => activeRestoredTurnRunId,
		getPrewarm: () => prewarm,
		attachments: {
			buildReadyRefs: (includePreviewUrl) => attachments.buildReadyRefs(includePreviewUrl),
			getDraftSnapshot: () => attachments.imageAttachments,
			clearDraft: () => attachments.clearDraft(),
			restoreDraft: (snapshot) => attachments.restoreDraft(snapshot),
			scheduleMessageOcrPoll: (messageId, assetId, status) =>
				attachments.scheduleMessageOcrPoll(messageId, assetId, status)
		},
		voice,
		messages: {
			append: (message) => {
				messages = [...messages, message];
			},
			removeById: (messageId) => {
				messages = messages.filter((message) => message.id !== messageId);
			}
		},
		thinking: {
			create: () => createThinkingBlock(),
			updateState: (state, details) => updateThinkingBlockState(state, details),
			finalize: (status, note) => finalizeThinkingBlock(status, note)
		},
		assistant: {
			flushText: () => flushAssistantText(),
			finalizeMessage: () => finalizeAssistantMessage(),
			markInterrupted: (reason, streamRunId) => markAssistantInterrupted(reason, streamRunId)
		},
		clearPendingToolState: () => {
			pendingToolResults.clear();
			hiddenToolCallIds.clear();
			processedToolCallIds.clear();
			processedToolResultIds.clear();
		},
		handleSSEMessage: (event) => handleSSEMessage(event),
		hydrateSessionFromEvent: (session) => hydrateSessionFromEvent(session),
		reconcileTurnFromSession: (request) => reconcileTurnFromSession(request),
		setUserHasScrolled: (value) => {
			userHasScrolled = value;
		},
		setExistingImagePickerOpen: (value) => {
			showExistingImagePicker = value;
		},
		haptic: (style) => haptic(style),
		logError: (message, err) => console.error(message, err),
		logDebug: (message, data) => {
			if (dev) {
				console.debug(message, data);
			}
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
	let sessionBootstrapRequestId = 0;
	let sessionBootstrapController: AbortController | null = null;
	let sessionBootstrapPromise: Promise<ChatSession | null> | null = null;
	const isSessionBusy = $derived(isLoadingSession || isPreparingSession);
	const inboxHeaderActions = $derived.by<AgentChatHeaderAction[]>(() =>
		inboxResolutionActions.map((action) => ({
			...action,
			disabled: action.disabled || isSessionBusy || stream.isStreaming,
			onClick: () => handleInboxResolutionAction(action)
		}))
	);
	const canAttachExistingProjectImages = $derived(
		Boolean(attachmentProjectId) && !isSessionBusy && !stream.isStreaming
	);
	const sessionStatusLabel = $derived.by(() => {
		if (isLoadingSession) return 'Loading session';
		if (isPreparingSession) return 'Preparing session';
		return null;
	});

	// Unified back navigation logic
	const shouldShowBackButton = $derived.by(() => {
		// Show back button when in context selection sub-views (not primary)
		if (shellRouter.showContextSelection && shellRouter.contextSelectionView !== 'primary') {
			return true;
		}
		// Show back button in all other views except the initial context selection primary view
		if (shellRouter.showContextSelection && shellRouter.contextSelectionView === 'primary') {
			return false;
		}
		// Sub-selectors (project action / focus / automation wizard) keep their
		// back affordance so users can return to the step before them.
		if (
			shellRouter.showProjectActionSelector ||
			shellRouter.showFocusSelector ||
			shellRouter.agentToAgentMode
		) {
			return true;
		}
		// Once the conversation is underway there's no "back" within a live chat —
		// users exit via the close button instead. The header gracefully collapses
		// the back button away to reclaim the space.
		if (stream.hasSentMessage || messages.length > 0) {
			return false;
		}
		return true;
	});

	const shouldShowSessionLoadingState = $derived.by(() => {
		if (!isSessionBusy || messages.length > 0) return false;
		if (
			shellRouter.showContextSelection ||
			shellRouter.showProjectActionSelector ||
			shellRouter.showFocusSelector
		) {
			return false;
		}
		if (shellRouter.agentToAgentMode && shellRouter.agentToAgentStep !== 'chat') return false;
		return true;
	});

	const shouldShowSessionLoadErrorState = $derived.by(() => {
		if (!sessionLoadError || isSessionBusy || messages.length > 0) return false;
		if (
			shellRouter.showContextSelection ||
			shellRouter.showProjectActionSelector ||
			shellRouter.showFocusSelector
		) {
			return false;
		}
		if (shellRouter.agentToAgentMode && shellRouter.agentToAgentStep !== 'chat') return false;
		return true;
	});

	const shouldShowComposer = $derived(
		!shellRouter.showContextSelection &&
			!shellRouter.showProjectActionSelector &&
			!shellRouter.showFocusSelector &&
			!shellRouter.agentToAgentMode
	);

	const chatComposerVocabularyTerms = $derived(
		resolvedProjectFocus?.projectName ?? displayContextLabel
	);

	const canPrimeActiveChatSession = $derived.by(() => {
		if (!shellRouter.selectedContextType || !isOpen || currentSession?.id) return false;
		if (shellRouter.showContextSelection || shellRouter.showProjectActionSelector) return false;
		if (shellRouter.agentToAgentMode && shellRouter.agentToAgentStep !== 'chat') return false;
		return true;
	});

	// Prewarm controller — owns the context-cache prewarm lifecycle.
	// See agent-chat-prewarm.svelte.ts.
	prewarm = createPrewarmController({
		getIsOpen: () => isOpen,
		getIsBrowser: () => browser,
		getSelectedContextType: () => shellRouter.selectedContextType,
		getSelectedEntityId: () => shellRouter.selectedEntityId,
		getResolvedProjectFocus: () => resolvedProjectFocus,
		getIsPreparingSession: () => isPreparingSession,
		getIsTurnActive: () =>
			stream.isStartingStream || stream.isStreaming || activeRestoredTurnRunId !== null,
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
		shellRouter.handleBackNavigation();
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
		shellRouter.handleContextSelectionNavChange(view);
	}

	// Note: voice.isRecording is NOT included - clicking send while recording will
	// stop the recording and auto-send after transcription completes.
	// Streaming only blocks send on non-touch devices (touch uses Send & Stop).
	const hasSendableImageAttachments = $derived(attachments.hasSendableImageAttachments);
	const hasBlockedImageAttachments = $derived(attachments.hasPendingOrFailedImageAttachments);
	const isSendDisabled = $derived(
		shellRouter.agentToAgentMode ||
			!shellRouter.selectedContextType ||
			isSessionBusy ||
			activeRestoredTurnRunId !== null ||
			stream.isStartingStream ||
			hasBlockedImageAttachments ||
			(!inputValue.trim() && !voice.isRecording && !hasSendableImageAttachments) || // Allow send if recording (will get transcribed text)
			(stream.isStreaming && !isTouchDevice) ||
			voice.isInitializing ||
			voice.isStopping ||
			voice.isTranscribing ||
			voice.pendingSendAfterTranscription // Prevent double-clicks while waiting for transcription
	);

	function handleExportAgentSteps() {
		if (!browser) return;
		if (!canExportAgentSteps) {
			toastService.error('No agent steps to export yet');
			return;
		}

		try {
			downloadAgentChatStepsMarkdown({
				messages,
				timelineItems: agentTimelineItems,
				sessionId: currentSession?.id ?? null,
				contextLabel: displayContextLabel,
				contextType: shellRouter.selectedContextType,
				entityId: shellRouter.selectedEntityId ?? null,
				projectFocus: resolvedProjectFocus
			});
			toastService.success('Agent steps exported');
		} catch (exportError) {
			console.error('[AgentChatModal] Failed to export agent steps', exportError);
			toastService.error('Could not export agent steps');
		}
	}

	function handleExportSupportPacket() {
		if (!browser) return;
		if (!canExportSupportPacket) {
			toastService.error('No chat data to export yet');
			return;
		}

		try {
			downloadAgentChatSupportPacketMarkdown({
				messages,
				timelineItems: agentTimelineItems,
				sessionId: currentSession?.id ?? null,
				contextLabel: displayContextLabel,
				contextType: shellRouter.selectedContextType,
				entityId: shellRouter.selectedEntityId ?? null,
				projectFocus: resolvedProjectFocus
			});
			toastService.success('Support packet exported');
		} catch (exportError) {
			console.error('[AgentChatModal] Failed to export support packet', exportError);
			toastService.error('Could not export support packet');
		}
	}

	function handleAskAboutTimelineItem(item: AgentTimelineItem) {
		const draft = buildTimelineItemQuestionDraft(item);
		const existingDraft = inputValue.trim();
		inputValue = existingDraft ? `${existingDraft}\n\n${draft}` : draft;
		activeChatTab = 'chat';
		haptic('light');
		toastService.success('Added step context to composer');
	}

	function resetConversation(options: { preserveContext?: boolean } = {}) {
		const { preserveContext = true } = options;

		voice.stop();
		cancelSessionBootstrap();
		turnReconciliationRequestId += 1;

		messages = [];
		persistedTimelineItems = [];
		activeChatTab = 'chat';
		brainDumpContext = null;
		currentSession = null;
		stream.currentActivity = '';
		inputValue = '';
		showExistingImagePicker = false;
		attachments.cleanup();
		stream.error = null;
		userHasScrolled = false;
		currentAssistantMessageId = null;
		currentAssistantMessageIndex = null;
		currentThinkingBlockId = null;
		stream.reset();
		// Reset ontology state
		lastTurnContext = null;
		ontologyLoaded = false;
		contextUsage = null;
		contextUsageOverheadTokens = 0;
		pendingToolResults.clear();
		hiddenToolCallIds.clear();
		processedToolCallIds.clear();
		processedToolResultIds.clear();
		presenter.resetMutationTracking();
		voice.reset();
		shellRouter.resetConversationState({ preserveContext });
		// Reset session resumption state
		sessionLoadError = null;
		activeRestoredTurnRunId = null;
		clearSessionRefreshTimeout();
	}

	function handleContextSelect(selection: ContextSelectionDetail) {
		shellRouter.handleContextSelect(selection);
	}

	function changeContext() {
		shellRouter.changeContext();
	}

	function openFocusSelector() {
		shellRouter.openFocusSelector();
	}

	function handleFocusSelection(newFocus: ProjectFocus) {
		shellRouter.handleFocusSelection(newFocus);
	}

	function handleFocusClear() {
		shellRouter.handleFocusClear();
	}

	function handleProjectActionSelect(action: ProjectAction) {
		shellRouter.handleProjectActionSelect(action);
	}

	function initializeFromAutoInit(config: AutoInitProjectConfig) {
		shellRouter.initializeFromAutoInit(config);
	}

	function selectAgentForBridge(agentId: string) {
		shellRouter.selectAgentForBridge(agentId);
	}

	function selectAgentProject(project: AgentProjectSummary) {
		shellRouter.selectAgentProject(project);
	}

	function backToAgentSelection() {
		shellRouter.backToAgentSelection();
	}

	function backToAgentProjectSelection() {
		shellRouter.backToAgentProjectSelection();
	}

	function updateAgentTurnBudget(value: number) {
		shellRouter.updateAgentTurnBudget(value);
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
		if (
			!shellRouter.agentToAgentMode ||
			!shellRouter.agentLoopActive ||
			shellRouter.agentMessageLoading
		)
			return;
		if (!shellRouter.selectedAgentId) {
			stream.error = 'Select a helper to continue.';
			return;
		}
		if (!shellRouter.selectedEntityId || shellRouter.selectedContextType !== 'project') {
			stream.error = 'Select a project for the automation loop.';
			return;
		}
		if (!shellRouter.agentGoal.trim()) {
			stream.error = 'Provide a goal for this automation.';
			return;
		}
		if (shellRouter.agentTurnsRemaining <= 0) {
			shellRouter.agentLoopActive = false;
			return;
		}
		if (stream.isStreaming) return;

		shellRouter.agentMessageLoading = true;
		try {
			const history = buildAgentToAgentHistory();
			const response = await requestAgentToAgentMessage({
				agentId: shellRouter.selectedAgentId,
				projectId: shellRouter.selectedEntityId,
				goal: shellRouter.agentGoal.trim(),
				history
			});
			const agentMessage = response?.message?.trim();
			if (!agentMessage) {
				stream.error = 'BuildOS did not receive an update from the helper.';
				shellRouter.agentLoopActive = false;
				return;
			}
			await stream.sendMessage(agentMessage, {
				senderType: 'agent_peer',
				suppressInputClear: true
			});
		} catch (err) {
			console.error('[AgentChat] Failed to run agent-to-agent turn', err);
			stream.error = 'Failed to fetch the helper update.';
			shellRouter.agentLoopActive = false;
		} finally {
			shellRouter.agentMessageLoading = false;
		}
	}

	async function startAgentToAgentChat() {
		const validationError = shellRouter.beginAgentToAgentChat();
		if (validationError) {
			stream.error = validationError;
			return;
		}
		stream.error = null;
		await runAgentToAgentTurn();
	}

	function stopAgentLoop() {
		shellRouter.stopAgentLoop();
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
				shellRouter.autoInitDismissed = false;
				shellRouter.lastAutoInitProjectId = null;
				lastLoadedSessionId = null; // Reset to allow reloading same session
				shellRouter.showProjectActionSelector = false;
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
			stream.hasSentMessage = false;

			// If resuming a session, skip any auto-init flows that would create a new one
			if (initialChatSessionId) {
				return;
			}

			// Handle direct context initialization (e.g., project_create)
			// Skip context selection and go directly to chat
			if (_initialContextType && _initialContextType !== 'global' && !autoInitProject) {
				resetConversation({ preserveContext: false });
				shellRouter.setDirectContext({
					contextType: _initialContextType,
					entityId: _initialEntityId,
					label: CONTEXT_DESCRIPTORS[_initialContextType]?.title ?? null,
					showContextSelection: false,
					showProjectActionSelector: false
				});
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

		if (shellRouter.autoInitDismissed && projectId === shellRouter.lastAutoInitProjectId) {
			return;
		}

		const selectorActiveForProject =
			shellRouter.showProjectActionSelector &&
			shellRouter.selectedEntityId === projectId &&
			!shellRouter.showContextSelection;
		const contextMatchesProject =
			isProjectContext(shellRouter.selectedContextType) &&
			shellRouter.selectedEntityId === projectId &&
			!shellRouter.showContextSelection;

		if (
			shellRouter.lastAutoInitProjectId === projectId &&
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
			shellRouter.projectFocus?.focusEntityId === initialProjectFocus.focusEntityId &&
			shellRouter.projectFocus?.projectId === initialProjectFocus.projectId
		) {
			return;
		}

		// Reset and set up for entity-focused chat
		resetConversation({ preserveContext: false });

		// Build context label based on focus type
		const focusName = initialProjectFocus.focusEntityName;
		const projectName = initialProjectFocus.projectName || 'Project';
		const label =
			initialProjectFocus.focusType === 'project-wide'
				? projectName
				: focusName
					? `${focusName} (${projectName})`
					: projectName;
		shellRouter.setDirectContext({
			contextType: 'project',
			entityId: initialProjectFocus.projectId,
			label,
			projectFocus: initialProjectFocus,
			showContextSelection: false,
			showProjectActionSelector: false
		});
	});

	// Handle initialChatSessionId prop - when resuming a previous chat session from history
	$effect(() => {
		const sessionId = initialChatSessionId;
		if (!isOpen || !sessionId) return;

		// Only load once per session
		if (lastLoadedSessionId === sessionId) {
			return; // Already loaded this session
		}

		void untrack(() => loadChatSession(sessionId));
	});

	// Load a chat session and restore its messages for resumption
	async function hydrateBrainDumpContextFromSession(session: ChatSession): Promise<void> {
		const metadata = (session.agent_metadata ?? {}) as Record<string, unknown>;
		const braindumpId =
			typeof metadata.braindump_id === 'string'
				? metadata.braindump_id
				: typeof metadata.source_id === 'string' && metadata.source === 'onto_braindump'
					? metadata.source_id
					: null;
		if (!braindumpId || brainDumpContext?.id === braindumpId) return;

		try {
			const response = await fetch(`/api/onto/braindumps/${braindumpId}`);
			const result = await response.json().catch(() => null);
			if (response.ok && result?.success && result?.data?.braindump) {
				brainDumpContext = result.data.braindump as AgentBrainDumpContext;
			}
		} catch (err) {
			if (dev) {
				console.warn('[AgentChatModal] Failed to hydrate Brain Dump context', err);
			}
		}
	}

	function applyChatSessionSnapshot(sessionId: string, snapshot: AgentChatSessionSnapshot): void {
		const nextActiveTurnRun = snapshot.activeTurnRun ?? null;
		currentSession = snapshot.session;
		lastLoadedSessionId = sessionId;
		contextUsage = null;
		contextUsageOverheadTokens = 0;
		shellRouter.hydrateFromSession({
			contextType: snapshot.contextType,
			entityId: snapshot.selectedEntityId,
			label: snapshot.selectedContextLabel,
			projectFocus: snapshot.projectFocus
		});
		messages = snapshot.messages;
		persistedTimelineItems = snapshot.timelineItems;
		if (initialBrainDumpContext?.id) {
			brainDumpContext = initialBrainDumpContext;
		} else {
			void hydrateBrainDumpContextFromSession(snapshot.session);
		}
		voice.hydrateNotesByGroupId(snapshot.voiceNotesByGroupId);
		activeRestoredTurnRunId = nextActiveTurnRun?.id ?? null;
		if (nextActiveTurnRun) {
			stream.currentActivity = 'BuildOS is still finishing the latest response...';
			scheduleActiveTurnSessionRefresh(sessionId);
		} else {
			clearSessionRefreshTimeout();
			stream.currentActivity = '';
		}
	}

	function turnRunMatchesRequest(
		run: { stream_run_id?: string | null; client_turn_id?: string | null },
		request: StreamTurnReconcileRequest
	): boolean {
		return (
			run.stream_run_id === request.streamRunId ||
			(Boolean(request.clientTurnId) && run.client_turn_id === request.clientTurnId)
		);
	}

	function messageMatchesReconciledTurn(
		message: UIMessage,
		request: StreamTurnReconcileRequest
	): boolean {
		const metadata = message.metadata as Record<string, unknown> | undefined;
		return (
			metadata?.stream_run_id === request.streamRunId ||
			(Boolean(request.clientTurnId) && metadata?.client_turn_id === request.clientTurnId)
		);
	}

	function snapshotHasReconciledTurnEvidence(
		snapshot: AgentChatSessionSnapshot,
		request: StreamTurnReconcileRequest
	): boolean {
		return snapshot.messages.some((message) => messageMatchesReconciledTurn(message, request));
	}

	async function reconcileTurnFromSession(
		request: StreamTurnReconcileRequest,
		attempt = 0,
		requestId = ++turnReconciliationRequestId
	): Promise<void> {
		if (!browser || !isOpen) return;
		if (requestId !== turnReconciliationRequestId) return;

		activeRestoredTurnRunId = `reconcile:${request.streamRunId}`;
		stream.error = null;
		stream.currentActivity = 'Restoring latest response...';

		try {
			const snapshot = await loadAgentChatSessionSnapshot(request.sessionId);
			if (requestId !== turnReconciliationRequestId || !isOpen) return;

			const matchingTurnRun =
				snapshot.turnRuns.find((run) => turnRunMatchesRequest(run, request)) ?? null;
			const hasEvidence = snapshotHasReconciledTurnEvidence(snapshot, request);
			const shouldHydrate = Boolean(matchingTurnRun || snapshot.activeTurnRun || hasEvidence);

			if (!shouldHydrate && attempt < TURN_RECONCILE_MAX_ATTEMPTS) {
				setTrackedTimeout(() => {
					void reconcileTurnFromSession(request, attempt + 1, requestId);
				}, TURN_RECONCILE_RETRY_MS);
				return;
			}

			if (shouldHydrate) {
				applyChatSessionSnapshot(request.sessionId, snapshot);
				return;
			}

			activeRestoredTurnRunId = null;
			stream.currentActivity = '';
			stream.error = 'Connection lost before the latest response could be restored.';
		} catch (err) {
			if (requestId !== turnReconciliationRequestId || !isOpen) return;
			if (attempt < TURN_RECONCILE_MAX_ATTEMPTS) {
				setTrackedTimeout(() => {
					void reconcileTurnFromSession(request, attempt + 1, requestId);
				}, TURN_RECONCILE_RETRY_MS);
				return;
			}
			activeRestoredTurnRunId = null;
			stream.currentActivity = '';
			stream.error =
				err instanceof Error
					? err.message
					: 'Connection lost before the latest response could be restored.';
		}
	}

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
			shellRouter.showContextSelection = false;
			shellRouter.showProjectActionSelector = false;
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

			applyChatSessionSnapshot(sessionId, snapshot);
		} catch (err: any) {
			if (controller.signal.aborted || requestId !== sessionLoadRequestId) {
				return;
			}
			console.error('Failed to load chat session:', err);
			sessionLoadError = err.message || 'Failed to load chat session';
			stream.error = sessionLoadError;
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
		if (shellRouter.agentToAgentMode && shellRouter.agentToAgentStep === 'project') {
			void shellRouter.loadAgentProjects();
		}
	});

	$effect(() => {
		if (!browser) return;
		// Auto-run the next turn when the loop is active and idle
		if (
			shellRouter.agentToAgentMode &&
			shellRouter.agentLoopActive &&
			!shellRouter.agentMessageLoading &&
			!stream.isStreaming &&
			shellRouter.agentTurnsRemaining > 0
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
		getContextType: () => shellRouter.selectedContextType,
		getEntityId: () => shellRouter.selectedEntityId,
		getContextLabel: () => shellRouter.selectedContextLabel,
		getProjectFocus: () => shellRouter.projectFocus,
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
		if (shellRouter.selectedEntityId && shellRouter.selectedContextLabel) {
			const inferredKind = isProjectContext(shellRouter.selectedContextType)
				? 'project'
				: 'entity';
			presenter.cacheEntityName(
				inferredKind,
				shellRouter.selectedEntityId,
				shellRouter.selectedContextLabel
			);
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
		errorMessage?: string,
		toolResult?: Record<string, any>
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
			const resultPayload =
				toolResult?.result ?? toolResult?.data ?? toolResult?.tool_result ?? toolResult;
			const durationMs =
				typeof toolResult?.duration_ms === 'number'
					? toolResult.duration_ms
					: typeof toolResult?.durationMs === 'number'
						? toolResult.durationMs
						: undefined;
			const tokensConsumed =
				typeof toolResult?.tokens_consumed === 'number'
					? toolResult.tokens_consumed
					: typeof toolResult?.tokensConsumed === 'number'
						? toolResult.tokensConsumed
						: undefined;
			const resultCount =
				typeof toolResult?.result_count === 'number'
					? toolResult.result_count
					: typeof toolResult?.resultCount === 'number'
						? toolResult.resultCount
						: undefined;
			const zeroResult =
				typeof toolResult?.zero_result === 'boolean'
					? toolResult.zero_result
					: typeof toolResult?.zeroResult === 'boolean'
						? toolResult.zeroResult
						: undefined;
			const requiresUserAction =
				typeof toolResult?.requires_user_action === 'boolean'
					? toolResult.requires_user_action
					: typeof toolResult?.requiresUserAction === 'boolean'
						? toolResult.requiresUserAction
						: undefined;
			const streamEvents = Array.isArray(toolResult?.stream_events)
				? toolResult.stream_events
				: Array.isArray(toolResult?.streamEvents)
					? toolResult.streamEvents
					: undefined;
			const toolCategory =
				typeof toolResult?.tool_category === 'string'
					? toolResult.tool_category
					: typeof toolResult?.toolCategory === 'string'
						? toolResult.toolCategory
						: undefined;
			const gatewayOp =
				typeof toolResult?.gateway_op === 'string'
					? toolResult.gateway_op
					: typeof toolResult?.gatewayOp === 'string'
						? toolResult.gatewayOp
						: undefined;
			const helpPath =
				typeof toolResult?.help_path === 'string'
					? toolResult.help_path
					: typeof toolResult?.helpPath === 'string'
						? toolResult.helpPath
						: undefined;

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
					...(toolResult !== undefined
						? {
								result: resultPayload,
								response: toolResult
							}
						: {}),
					...(durationMs !== undefined ? { durationMs } : {}),
					...(tokensConsumed !== undefined ? { tokensConsumed } : {}),
					...(resultCount !== undefined ? { resultCount } : {}),
					...(zeroResult !== undefined ? { zeroResult } : {}),
					...(requiresUserAction !== undefined ? { requiresUserAction } : {}),
					...(streamEvents !== undefined ? { streamEvents } : {}),
					...(toolCategory !== undefined ? { toolCategory } : {}),
					...(gatewayOp !== undefined ? { gatewayOp } : {}),
					...(helpPath !== undefined ? { helpPath } : {}),
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
			shellRouter.selectedContextType ?? normalizeSessionContextType(session.context_type);
		const entityId = shellRouter.selectedEntityId ?? session.entity_id ?? null;

		hasFinalizedSession = true;

		const fallbackQueueClassification = () => {
			if (!stream.hasSentMessage) return;
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
				has_messages_sent: stream.hasSentMessage
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
		turnReconciliationRequestId += 1;
		clearSessionRefreshTimeout();
		activeRestoredTurnRunId = null;
		stream.disposeActiveStream({ reconcile: false });
		voice.cleanup();
		attachments.cleanup();

		// Clear any pending tool results to prevent memory leaks
		pendingToolResults.clear();
		hiddenToolCallIds.clear();
		processedToolCallIds.clear();
		processedToolResultIds.clear();

		const summary = presenter.buildMutationSummary({
			hasMessagesSent: stream.hasSentMessage,
			sessionId: currentSession?.id ?? null
		});
		// Broadcast mutations globally so any surface showing this data (project page,
		// dashboard, embedded edit modals, …) can refetch itself. This works regardless
		// of launch surface or chat context — unlike the old per-project `invalidate()`
		// path, which was inert because the pages refresh via their own client refetch.
		if (summary.hasChanges) {
			notifyDataMutation(summary);
		}

		presenter.resetMutationTracking();

		if (onClose) onClose(summary);
	}

	async function handleInboxResolutionAction(action: AgentChatResolutionAction) {
		if (action.disabled || action.loading || stream.isStreaming || isSessionBusy) return;
		const summary = presenter.buildMutationSummary({
			hasMessagesSent: stream.hasSentMessage,
			sessionId: currentSession?.id ?? null
		});
		const shouldClose = await action.onResolve(summary);
		if (shouldClose !== false) {
			handleClose();
		}
	}

	function handleImageAttachmentFiles(files: File[]) {
		attachments.handleFiles(files);
	}

	function handleAttachExistingImage(asset: OntologyImageAsset) {
		if (attachments.attachExistingImage(asset)) {
			showExistingImagePicker = false;
		}
	}

	function removeImageAttachment(attachmentId: string) {
		attachments.remove(attachmentId);
	}

	function handleSelectSuggestion(text: string) {
		if (stream.isStreaming || isSessionBusy) return;
		inputValue = text;
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape' && stream.isStreaming) {
			event.preventDefault();
			void stream.stopGeneration('user_cancelled');
			return;
		}

		// On touch/mobile devices, Enter should insert a newline (natural typing behavior)
		// Only desktop users can send with Enter; mobile users use the send button
		if (event.key === 'Enter' && !event.shiftKey && !isTouchDevice) {
			event.preventDefault();
			// If streaming, sendMessage will stop current run first
			// Use handleSendMessage to properly handle "send while recording" flow
			if (!isSendDisabled || stream.isStreaming || voice.isRecording) {
				void stream.handleSendMessage();
			}
		}
	}

	$effect(() => {
		if (!browser) return;
		void stream.handlePendingSendAfterTranscription(hasSendableImageAttachments);
	});

	function hydrateSessionFromEvent(sessionEvent: ChatSession) {
		currentSession = sessionEvent;
		const sessionTitle = deriveSessionTitle(sessionEvent);
		const normalizedSessionContext = normalizeSessionContextType(sessionEvent.context_type);
		const metadataFocus = (
			(sessionEvent.agent_metadata as { focus?: ProjectFocus | null }) ?? null
		)?.focus;
		shellRouter.hydrateSessionEvent({
			contextType: normalizedSessionContext,
			entityId: sessionEvent.entity_id ?? undefined,
			sessionTitle,
			metadataFocus
		});
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
			getSelectedContextLabel: () => shellRouter.selectedContextLabel,
			getActiveStreamRunId: () => stream.activeStreamRunId,
			isAgentToAgentMode: () => shellRouter.agentToAgentMode,
			getAgentLoopActive: () => shellRouter.agentLoopActive,
			getAgentTurnsRemaining: () => shellRouter.agentTurnsRemaining,
			setContextUsage: (usage, overheadTokens) => {
				contextUsage = usage;
				contextUsageOverheadTokens = overheadTokens;
			},
			setLastTurnContext: (ctx) => {
				lastTurnContext = ctx;
			},
			setProjectFocus: (focus) => {
				shellRouter.projectFocus = focus;
			},
			setCurrentActivity: (label) => {
				stream.currentActivity = label;
			},
			setIsStreaming: (value) => {
				stream.isStreaming = value;
			},
			setError: (message) => {
				stream.error = message;
			},
			setSelectedContext: ({ contextType, entityId, label }) => {
				const { shiftedToNewProject } = shellRouter.setSelectedContext({
					contextType,
					entityId,
					label
				});
				if (shiftedToNewProject) {
					contextShiftPulse += 1;
				}
			},
			setShowFocusSelector: (value) => {
				shellRouter.showFocusSelector = value;
			},
			setShowProjectActionSelector: (value) => {
				shellRouter.showProjectActionSelector = value;
			},
			setCurrentSession: (session) => {
				currentSession = session;
			},
			setAgentLoopActive: (value) => {
				shellRouter.agentLoopActive = value;
			},
			setAgentTurnsRemaining: (value) => {
				shellRouter.agentTurnsRemaining = value;
			}
		},
		hydrateSessionFromEvent,
		attachServerTiming: (runId, timing) => stream.attachServerTiming(runId, timing),
		bufferAssistantText,
		flushAssistantText,
		finalizeAssistantMessage,
		hiddenToolCallIds,
		pendingToolResults,
		processedToolCallIds,
		processedToolResultIds,
		addClarifyingQuestionsMessage,
		addCreatedEntitiesMessage,
		logFocusActivity,
		isDev: dev
	};

	handleSSEMessage = createSSEHandler(sseHandlerDeps);

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

	function addCreatedEntitiesMessage(entities: CreatedEntityRef[]) {
		if (!entities || entities.length === 0) return;
		// Global dedupe: never show a chip for an entity already surfaced in the
		// conversation (guards against a turn's results being re-emitted).
		const shownIds = new Set<string>();
		for (const message of messages) {
			if (message.type !== 'created_entities') continue;
			for (const entity of (message.data?.entities ?? []) as CreatedEntityRef[]) {
				if (entity?.id) shownIds.add(entity.id);
			}
		}
		const fresh = entities.filter((e) => e.id && !shownIds.has(e.id));
		if (fresh.length === 0) return;

		const createdMessage: UIMessage = {
			id: crypto.randomUUID(),
			type: 'created_entities',
			content: '',
			data: { entities: fresh },
			timestamp: new Date()
		};
		messages = [...messages, createdMessage];
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
		streamRunId: string | null
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

	onDestroy(() => {
		// Clear all pending timeouts to prevent memory leaks
		pendingTimeouts.forEach((id) => clearTimeout(id));
		pendingTimeouts.clear();

		for (const timer of agentRunFallbackTimers.values()) clearTimeout(timer);
		agentRunFallbackTimers.clear();
		void unsubscribeSessionMessages();

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
		turnReconciliationRequestId += 1;
		cancelSessionBootstrap();
		clearSessionRefreshTimeout();
		finalizeSession('destroy');
		voice.stop();
		stream.disposeActiveStream({ reconcile: false });
		voice.cleanup();
		attachments.cleanup();
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
						class="inline-flex h-8 w-8 animate-spin rounded-full border-[3px] border-muted-foreground/30 border-t-accent motion-reduce:animate-none"
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
		<div class={`flex min-h-0 flex-1 flex-col ${brainDumpContext ? 'lg:flex-row' : ''}`}>
			<div class="flex min-h-0 flex-1 flex-col">
				<AgentChatActivityTabs
					activeTab={activeChatTab}
					timelineItems={agentTimelineItems}
					onTabChange={(tab) => {
						activeChatTab = tab;
					}}
					onAskAboutItem={handleAskAboutTimelineItem}
				/>
				{#if activeChatTab === 'chat'}
					<div
						class="flex min-h-0 flex-1 flex-col"
						role="tabpanel"
						id="agent-chat-panel-chat"
						aria-labelledby="agent-chat-tab-chat"
					>
						<AgentMessageList
							{messages}
							{displayContextLabel}
							selectedContextType={shellRouter.selectedContextType}
							{resolvedProjectFocus}
							onToggleThinkingBlock={toggleThinkingBlockCollapse}
							bind:container={messagesContainer}
							onScroll={handleScroll}
							voiceNotesByGroupId={voice.notesByGroupId}
							onDeleteVoiceNote={voice.removeNoteFromGroup.bind(voice)}
							onSelectSuggestion={handleSelectSuggestion}
						/>
					</div>
				{/if}
			</div>
			{#if brainDumpContext}
				<BrainDumpContextPanel
					context={brainDumpContext}
					timelineItems={agentTimelineItems}
				/>
			{/if}
		</div>
	{/if}

	{#if stream.error && !showSessionLoadErrorState}
		<div
			class="border-t border-destructive/30 bg-destructive/10 p-2 text-xs font-semibold text-destructive tx tx-static tx-weak sm:p-2.5"
			role="alert"
			aria-live="assertive"
		>
			{stream.error}
		</div>
	{/if}

	<AgentRunDock
		runs={sessionAgentRuns}
		activeCount={activeSessionAgentRunCount}
		onOpen={openAgentRun}
	/>
{/snippet}

{#snippet chatComposerFooter()}
	<div
		bind:this={composerContainer}
		class="flex-shrink-0 overflow-visible bg-background/60 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5 sm:pt-3"
	>
		{#if showExistingImagePicker && attachmentProjectId}
			<div
				class="mb-2 max-h-72 overflow-y-auto rounded-lg border border-border bg-card p-3 shadow-ink tx tx-grid tx-weak"
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
			isStreaming={stream.isStreaming}
			{isSendDisabled}
			allowSendWhileStreaming={isTouchDevice}
			{displayContextLabel}
			disabled={isSessionBusy}
			disabledReason={sessionStatusLabel}
			vocabularyTerms={chatComposerVocabularyTerms}
			imageAttachments={attachments.imageAttachments}
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
			onSend={() => void stream.handleSendMessage()}
			onStop={() => void stream.stopGeneration('user_cancelled')}
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
					selectedContextType={shellRouter.selectedContextType}
					{displayContextLabel}
					{displayContextSubtitle}
					isStreaming={stream.isStreaming}
					showBackButton={shouldShowBackButton}
					onBack={handleBackNavigation}
					onClose={handleClose}
					projectId={shellRouter.selectedEntityId}
					{resolvedProjectFocus}
					onChangeFocus={openFocusSelector}
					onClearFocus={handleFocusClear}
					{ontologyLoaded}
					hasActiveThinkingBlock={!!currentThinkingBlockId}
					currentActivity={stream.currentActivity}
					{sessionStatusLabel}
					contextUsage={displayContextUsage}
					sessionId={currentSession?.id ?? null}
					{contextShiftPulse}
					onExportSteps={handleExportAgentSteps}
					canExportSteps={canExportAgentSteps}
					{exportableStepCount}
					onExportSupportPacket={handleExportSupportPacket}
					{canExportSupportPacket}
					headerActions={inboxHeaderActions}
				/>
			</div>
		{/snippet}

		{#snippet children()}
			<!-- INKPRINT panel container - fills modal content area -->
			<div class="relative z-10 flex h-full flex-col overflow-hidden bg-card">
				<!-- Keep context selection mounted so Back returns to prior step -->
				<div
					class={`flex h-full min-h-0 flex-col ${shellRouter.showContextSelection ? '' : 'hidden'}`}
					aria-hidden={!shellRouter.showContextSelection}
				>
					<ContextSelectionScreen
						bind:this={shellRouter.contextSelectionRef}
						onSelect={handleContextSelect}
						onNavigationChange={handleContextSelectionNavChange}
					/>
				</div>

				<!-- Chat / wizard view - Same height constraint as selection -->
				<div
					class={`${shellRouter.showContextSelection ? 'hidden' : 'flex'} h-full min-h-0 flex-col`}
				>
					{#if shellRouter.showProjectActionSelector}
						<ProjectActionSelector
							projectId={shellRouter.selectedEntityId || ''}
							projectName={shellRouter.projectFocus?.projectName ??
								shellRouter.selectedContextLabel ??
								'Project'}
							onSelectAction={(action) => handleProjectActionSelect(action)}
							onSelectFocus={handleFocusSelection}
						/>
					{:else if shellRouter.showFocusSelector && isProjectContext(shellRouter.selectedContextType) && shellRouter.selectedEntityId && resolvedProjectFocus}
						<ProjectFocusSelector
							projectId={shellRouter.selectedEntityId}
							projectName={resolvedProjectFocus.projectName}
							currentFocus={resolvedProjectFocus}
							onSelect={handleFocusSelection}
						/>
					{:else if shellRouter.agentToAgentMode && shellRouter.agentToAgentStep !== 'chat'}
						<AgentAutomationWizard
							step={shellRouter.agentToAgentStep ?? 'agent'}
							agentProjects={shellRouter.agentProjects}
							agentProjectsLoading={shellRouter.agentProjectsLoading}
							agentProjectsError={shellRouter.agentProjectsError}
							agentGoal={shellRouter.agentGoal}
							agentTurnBudget={shellRouter.agentTurnBudget}
							selectedAgentLabel={shellRouter.selectedAgentLabel}
							selectedContextLabel={shellRouter.selectedContextLabel}
							hasMultipleHelpers={shellRouter.hasMultipleAgentHelpers}
							onUseActionableInsight={() =>
								selectAgentForBridge(shellRouter.researchAgentId)}
							onProjectSelect={(project) => selectAgentProject(project)}
							onStartChat={startAgentToAgentChat}
							onExit={() => {
								shellRouter.agentToAgentMode = false;
								shellRouter.agentToAgentStep = null;
								changeContext();
							}}
							onGoalChange={(value) => (shellRouter.agentGoal = value)}
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

					{#if !shellRouter.showContextSelection && !shellRouter.showProjectActionSelector && shellRouter.agentToAgentMode}
						<!-- INKPRINT automation footer with Thread texture -->
						<div
							class="border-t border-border bg-muted px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] tx tx-thread tx-weak sm:px-4 sm:py-2.5"
						>
							<div
								class="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3"
							>
								<div class="min-w-0 space-y-1">
									<p class="text-xs font-semibold text-foreground">
										Automation loop is {shellRouter.agentLoopActive
											? 'active'
											: 'paused'}.
									</p>
									<div class="space-y-0.5">
										<div class="flex min-w-0 items-baseline gap-1.5">
											<span
												class="micro-label flex-shrink-0 text-muted-foreground"
												>Helper</span
											>
											<span
												class="min-w-0 flex-1 truncate text-xs font-medium text-foreground"
												>{shellRouter.selectedAgentLabel}</span
											>
										</div>
										<div class="flex min-w-0 items-baseline gap-1.5">
											<span
												class="micro-label flex-shrink-0 text-muted-foreground"
												>Project</span
											>
											<span
												class="min-w-0 flex-1 truncate text-xs font-medium text-foreground"
												>{shellRouter.selectedContextLabel ??
													'Select a project'}</span
											>
										</div>
										<div class="flex min-w-0 items-baseline gap-1.5">
											<span
												class="micro-label flex-shrink-0 text-muted-foreground"
												>Goal</span
											>
											<span
												class="min-w-0 flex-1 truncate text-xs font-medium text-foreground"
												>{shellRouter.agentGoal || 'Add a goal'}</span
											>
										</div>
										<div class="flex items-baseline gap-1.5">
											<span
												class="micro-label flex-shrink-0 text-muted-foreground"
												>Turns left</span
											>
											<span
												class="text-xs font-semibold tabular-nums text-foreground"
												>{shellRouter.agentTurnsRemaining} / {shellRouter.agentTurnBudget}</span
											>
										</div>
									</div>
								</div>
								<!-- INKPRINT tactile buttons -->
								<div class="flex flex-wrap items-center gap-2">
									<button
										type="button"
										class="micro-label inline-flex items-center justify-center rounded-lg bg-accent px-3 py-2 font-bold text-accent-foreground shadow-ink transition pressable disabled:cursor-not-allowed disabled:opacity-60"
										disabled={stream.isStreaming ||
											shellRouter.agentMessageLoading ||
											shellRouter.agentTurnsRemaining <= 0}
										onclick={() => {
											shellRouter.agentLoopActive = true;
											runAgentToAgentTurn();
										}}
									>
										{shellRouter.agentLoopActive
											? 'Run next turn'
											: 'Resume loop'}
									</button>
									<button
										type="button"
										class="micro-label inline-flex items-center justify-center rounded-lg border border-border bg-transparent px-3 py-2 font-semibold text-muted-foreground transition pressable hover:border-accent hover:bg-card hover:text-foreground"
										onclick={stopAgentLoop}
									>
										Stop
									</button>
								</div>
							</div>
							<!-- INKPRINT micro-label controls -->
							<div
								class="micro-label mt-1.5 flex flex-wrap items-center gap-2 text-muted-foreground"
							>
								<label class="flex items-center gap-1.5">
									<span class="font-bold">Turn limit</span>
									<input
										type="number"
										min="1"
										max="50"
										class="w-16 rounded-lg border border-border bg-background px-2 py-1 text-[0.65rem] font-semibold text-foreground shadow-ink-inner focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										value={shellRouter.agentTurnBudget}
										disabled={shellRouter.agentLoopActive ||
											shellRouter.agentMessageLoading ||
											stream.isStreaming}
										oninput={(e) =>
											updateAgentTurnBudget(
												Number((e.target as HTMLInputElement).value)
											)}
									/>
								</label>
								{#if shellRouter.agentTurnsRemaining <= 0}
									<!-- INKPRINT warning badge with Static texture -->
									<span
										class="rounded-lg bg-warning/10 px-2.5 py-1.5 text-[0.65rem] font-semibold text-warning tx tx-static tx-weak"
									>
										Turn limit reached — adjust and resume.
									</span>
								{/if}
							</div>
							{#if shellRouter.agentMessageLoading}
								<p class="micro-label mt-1 text-muted-foreground">
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
</style>
