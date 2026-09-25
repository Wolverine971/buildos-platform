<!-- apps/web/src/lib/components/agent/AgentChatModal.svelte -->
<!--
  AgentChatModal Component - INKPRINT Design System

  BuildOS chat interface showing planner-executor conversations.
  Displays BuildOS activity, plan steps, and iterative conversations.

  README: apps/web/docs/features/agentic-chat/README.md
  Design: INKPRINT texture-based design language - ink on paper,
  semantic textures, high information density, tactile controls.
-->

<script module lang="ts">
	// Capability flags are a UI hint (admission rechecks every submission) and
	// only change with a deploy or cohort edit, so fetch them once per page load
	// instead of on every open/unhide — the late answer used to push the review
	// chips in above the composer after first paint. A failure is not cached.
	type AgentChatCapabilities = { projectReview: boolean; documentOrganization: boolean };
	let capabilitiesRequest: Promise<AgentChatCapabilities> | null = null;

	function loadAgentChatCapabilities(): Promise<AgentChatCapabilities> {
		capabilitiesRequest ??= fetch('/api/agent/v2/capabilities', { cache: 'no-store' })
			.then(async (response) => {
				const body = response.ok ? await response.json() : null;
				if (body?.success !== true) throw new Error('Chat capabilities unavailable');
				return {
					projectReview: body.data?.projectReview === true,
					documentOrganization: body.data?.documentOrganization === true
				};
			})
			.catch((error: unknown) => {
				capabilitiesRequest = null;
				throw error;
			});
		return capabilitiesRequest;
	}
</script>

<script lang="ts">
	import { onDestroy, getAbortSignal, getContext, tick, untrack } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
	import type {
		ContextSelectionEventV1,
		Database,
		FreshnessCardPayloadV1
	} from '@buildos/shared-types';
	import { browser, dev } from '$app/environment';
	import { createSupabaseBrowser } from '$lib/supabase';
	import Modal from '$lib/components/ui/Modal.svelte';
	import ContextSelectionScreen from '../chat/ContextSelectionScreen.svelte';
	import ProjectFocusSelector from './ProjectFocusSelector.svelte';
	import ProjectActionSelector from './ProjectActionSelector.svelte';
	import AgentChatHeader from './AgentChatHeader.svelte';
	import AgentComposer from './AgentComposer.svelte';
	import AgentMessageList from './AgentMessageList.svelte';
	import AgentChatActivityTabs from './AgentChatActivityTabs.svelte';
	import BrainDumpContextPanel from './BrainDumpContextPanel.svelte';
	import AgentRunDock from './AgentRunDock.svelte';
	import { agentRunsStore, type AgentRunRow } from '$lib/services/agentRunsRealtime.service';
	import { notificationStore } from '$lib/stores/notification.store';
	import {
		parkChatSession,
		resolveParkedChatSession
	} from '$lib/services/chat-session-notification.bridge';
	import { get } from 'svelte/store';
	import ProjectImageLibrary from '$lib/components/ontology/ProjectImageLibrary.svelte';
	import type { OntologyImageAsset } from '$lib/components/ontology/image-assets/types';
	import type {
		ChatSession,
		ChatContextType,
		ChatRole,
		AgentSSEMessage,
		AgenticChatReconcileAssistantMessageV1,
		ContextUsageSnapshot,
		SkillActivityEvent,
		ChatTurnStatusV1,
		TurnHandleV1
	} from '@buildos/shared-types';
	import type { LastTurnContext, ProjectFocus } from '$lib/types/agent-chat-enhancement';
	import type {
		AgenticChatWorkerCommand,
		PublishedSpecialistSelection
	} from '$lib/services/agentic-chat-v2/worker-transport-client';
	import { CONTEXT_DESCRIPTORS } from './agent-chat.constants';
	import {
		resolveInitialReview,
		type ChatReviewCapabilities,
		type ChatReviewIntent
	} from './agent-chat-initial-review';
	import { buildLiveContextUsageSnapshot } from './agent-chat-formatters';
	import { mergeToolProgressStep, type ToolProgressStep } from './agent-chat-tool-progress';
	import {
		CAPTURE_RECEIPT_COLUMNS,
		type CaptureReceiptRow,
		buildCaptureReceiptUIMessage,
		upsertCaptureReceipt
	} from './capture-receipt';
	import {
		findThinkingBlockById,
		type ActivityEntry,
		type ActivityType,
		type AgentBrainDumpContext,
		type AgentChatHeaderAction,
		type AgentLoopState,
		type AgentChatPanelTab,
		type AgentChatResolutionAction,
		type AgentTimelineItem,
		type CreatedEntityRef,
		type DataMutationSummary,
		type DocumentMutationEvent,
		type ProjectAction,
		type ThinkingBlockMessage,
		type UIMessage
	} from './agent-chat.types';
	import {
		buildTimelineItemQuestionDraft,
		mergeAgentTimelineItems,
		timelineItemsFromMessages
	} from './agent-chat-timeline';
	import {
		buildFreshnessCardUIMessage,
		freshnessScanIdFromMetadata,
		reviewDeeperPromptFor
	} from './freshness-radar-card';
	import { toastService } from '$lib/stores/toast.store';
	import { haptic } from '$lib/utils/haptic';
	import { initKeyboardAvoiding } from '$lib/utils/keyboard-avoiding';
	import { notifyDataMutation } from '$lib/stores/projectDataMutations';
	import {
		buildProjectWideFocus,
		deriveSessionTitle,
		type AgentChatSessionSnapshot,
		isProjectContext,
		loadAgentChatSessionSnapshot,
		normalizeSessionContextType,
		prewarmAgentContext,
		probeActiveTurnRun,
		warmAgentChatStreamTransport
	} from './agent-chat-session';
	import {
		buildSkillLoadActivityEvent,
		upsertSkillActivityEntries
	} from './agent-chat-skill-activity';
	import {
		createToolPresenter,
		type OntologyEntityKind,
		type ToolPresenter
	} from './agent-chat-tool-presenter';
	import {
		createSSEHandler,
		sanitizeToolResultForActivityMetadata,
		type ActivityUpdateResult,
		type AgentSSEMessageHandler,
		type PendingToolStatus,
		type SSEHandlerDeps
	} from './agent-chat-sse-handler';
	import {
		buildDocumentChangeCards,
		showDocumentChangeToast,
		type DocumentChangeCard,
		type DocumentChangeReceipt
	} from './document-change-cards';
	import { createVoiceAdapter } from './agent-chat-voice.svelte';
	import { createPrewarmController } from './agent-chat-prewarm.svelte';
	import {
		createAgentChatStreamController,
		type ClientTurnTimingSummary
	} from './agent-chat-stream-controller.svelte';
	import {
		createAgenticChatWorkerRealtimeRuntime,
		type AgenticChatWorkerRealtimeRuntimeClient
	} from '$lib/services/agentic-chat-v2/worker-realtime-runtime';
	import {
		AgenticChatWorkerTurnAdoption,
		parseAdmissionResponse
	} from '$lib/services/agentic-chat-v2/worker-turn-adoption';
	import { createAgentChatWorkerUiAdapter } from './agent-chat-worker-ui-adapter';
	import { carryRenderKeys } from './agent-chat-render-keys';
	import { captureEvent } from '$lib/services/posthog';
	import { workerActivityForStatus } from './agent-chat-worker-status';
	import {
		appendUniqueThinkingActivity,
		finalizeWorkerThinkingBlock,
		upsertWorkerThinkingBlock
	} from './agent-chat-thinking-state';
	import {
		downloadAgentChatStepsMarkdown,
		downloadAgentChatSupportPacketMarkdown
	} from './agent-chat-step-export';
	import {
		AGENT_CHAT_MAX_IMAGE_ATTACHMENTS,
		createAttachmentController
	} from './agent-chat-attachments.svelte';
	import type { AgentClientActionCompletion } from './agent-chat-client-actions';
	import {
		createAgentChatShellRouter,
		type AutoInitProjectConfig,
		type ContextSelectionDetail
	} from './agent-chat-shell-router.svelte';

	interface Props {
		isOpen?: boolean;
		/** Keep-alive park: the component stays mounted (stream, messages, and
		 * realtime all live) but the Modal chrome is closed — no scroll lock,
		 * no ESC handling, no DOM. Flipping back to false is a seamless resume. */
		hidden?: boolean;
		contextType?: ChatContextType;
		entityId?: string;
		onClose?: (summary?: DataMutationSummary) => void;
		/** Immediate successful document mutation for document-scoped hosts. */
		onDocumentMutation?: (event: DocumentMutationEvent) => void;
		/** Provided by launch surfaces that can host a hidden keep-alive
		 * instance (Navigation). When set, minimize parks without teardown. */
		onParked?: (sessionId: string) => void;
		autoInitProject?: AutoInitProjectConfig | null;
		initialChatSessionId?: string | null;
		initialBrainDumpContext?: AgentBrainDumpContext | null;
		initialProjectFocus?: ProjectFocus | null;
		initialDraft?: string | null;
		/** Send initialDraft automatically once it lands in the composer (i.e. the
		 * user's submit already happened on the launching surface). Only meaningful
		 * with a selector-free context — with 'global' the draft waits on the
		 * context selector and sends after the user picks one. */
		autoSendInitialDraft?: boolean;
		/** Run initialDraft as this durable review (the same selection the in-chat
		 * Review / Organize documents toggles make). The draft waits for the
		 * capability check and is never sent as ordinary chat. Project context
		 * with project-wide focus only. */
		initialReviewIntent?: ChatReviewIntent | null;
		/** Called instead of sending when initialReviewIntent cannot run here. */
		onInitialReviewUnavailable?: (message: string) => void;
		/** Submit a voice turn when the user stops recording from the composer. */
		autoSendVoiceOnStop?: boolean;
		embedded?: boolean;
		/** Conversation-first embedded surface: messages and composer only. */
		conversationOnly?: boolean;
		/** Optional host-specific composer placeholder for focused embedded chats. */
		composerPlaceholder?: string;
		/** Explicit version for document reviews in this host; ordinary chat is unchanged. */
		publishedSpecialist?:
			| (PublishedSpecialistSelection & {
					name: string;
			  })
			| null;
		inboxResolutionActions?: AgentChatResolutionAction[];
		/** Reports the active chat session id so embedding surfaces can render
		 * session-level chrome (e.g. ChatSessionAuditActions) in their own header. */
		onSessionChange?: (sessionId: string | null) => void;
	}

	let {
		isOpen = false,
		hidden = false,
		contextType: _initialContextType = 'global',
		entityId: _initialEntityId,
		onClose,
		onDocumentMutation,
		onParked,
		autoInitProject = null,
		initialChatSessionId = null,
		initialBrainDumpContext = null,
		initialProjectFocus = null,
		initialDraft = null,
		autoSendInitialDraft = false,
		initialReviewIntent = null,
		onInitialReviewUnavailable,
		autoSendVoiceOnStop = false,
		embedded = false,
		conversationOnly = false,
		composerPlaceholder,
		publishedSpecialist = null,
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
		logFocusActivity: (label, focus) => logFocusActivity(label, focus)
	});
	// Bumped whenever the agent shifts us into a (new) project context — drives a
	// one-shot title cue so landing on a freshly created project is not a silent
	// label swap.
	let contextShiftPulse = $state(0);
	// Plain (non-reactive) edge-detection flag: it is only read and written by
	// the open/close effect below, and making it $state made that effect
	// schedule itself a second time on every open and close.
	let wasOpen = false;
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

	// "Is this surface live?" — embedded hosts may keep isOpen=false while the
	// chat is visible, so recovery loops (turn probe, reconcile) must not gate
	// on isOpen alone or they'd wedge send with activeRestoredTurnRunId set
	// and no timer armed.
	const isSurfaceActive = $derived(embedded || isOpen);

	// Conversation state.
	//
	// `messages` is $state.raw: every update path replaces the array (and any
	// changed message/activity object) rather than mutating in place, so deep
	// proxying would only add per-property signal overhead on the streaming
	// hot path — including proxying large tool-result payloads stored in
	// thinking-block activity metadata. The copy-on-update invariant is also
	// what makes the timeline memoization in agent-chat-timeline.ts sound;
	// never mutate a message or activity object in place.
	let messages = $state.raw<UIMessage[]>([]);
	let persistedTimelineItems = $state.raw<AgentTimelineItem[]>([]);
	let activeChatTab = $state<AgentChatPanelTab>('chat');
	// Seeded from the launch prop, still assignable (session hydration, reset).
	let brainDumpContext = $derived<AgentBrainDumpContext | null>(
		initialBrainDumpContext?.id ? initialBrainDumpContext : null
	);
	let currentSession = $state<ChatSession | null>(null);
	// Worker reconciliation can replay a fresh session object on every receipt.
	// Effects that own session-scoped resources must depend on the stable scalar
	// identity, not the object assignment, or the replay tears down and re-adopts
	// the same worker observer between reconcile ticks.
	const currentSessionId = $derived(currentSession?.id ?? null);
	// Checkpoint capture receipts (tasker/95) live beside the conversation, not in
	// it: they come from chat_capture_checkpoints, render as chips in the list,
	// and never enter the timeline, exports or model history.
	let captureReceipts = $state.raw<UIMessage[]>([]);
	const displayMessages = $derived(
		captureReceipts.reduce((list, receipt) => upsertCaptureReceipt(list, receipt), messages)
	);
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

	// ── Agent Work: in-chat run dock + completion-message reload (UI-P4) ──
	const ACTIVE_AGENT_RUN_STATUSES = [
		'queued',
		'running',
		'paused',
		'needs_input',
		'proposal_ready'
	];
	let sessionAgentRuns = $derived.by(() => {
		const sid = currentSessionId;
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
	type WorkerTurnHandle = Extract<TurnHandleV1, { executionMode: 'worker_realtime' }>;
	// A public-page layout can mount before its client exists, then survive
	// sign-in without providing context. Resolve the shared browser singleton
	// here as well so an accepted turn always has a UI observer.
	const supabaseClient =
		getContext<SupabaseClient | undefined>('supabase') ??
		(browser ? createSupabaseBrowser() : undefined);
	let workerAdoption: AgenticChatWorkerTurnAdoption | null = null;
	let workerRealtimeUserId: string | null = null;
	const workerRealtime = supabaseClient
		? createAgenticChatWorkerRealtimeRuntime({
				client: supabaseClient as unknown as AgenticChatWorkerRealtimeRuntimeClient,
				onUserChange: (userId) => {
					const changedAuthenticatedUser =
						workerRealtimeUserId !== null && workerRealtimeUserId !== userId;
					workerRealtimeUserId = userId;
					// Initial authentication establishes ownership; it must not race and
					// erase a same-mount discovery result. Actual identity changes and
					// sign-out always invalidate every adopted handle.
					if (changedAuthenticatedUser) workerAdoption?.clear('auth_changed');
				},
				onError: (error) => {
					if (dev) console.warn('[AgentChat] Worker Realtime runtime degraded', error);
				}
			})
		: null;
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
		// Freshness radar card (Tasker 88): one card per scan, rendered as a card.
		const freshnessScanId = freshnessScanIdFromMetadata(row.metadata);
		if (freshnessScanId) {
			const seen = messages.some(
				(m) =>
					m.id === row.id || freshnessScanIdFromMetadata(m.metadata) === freshnessScanId
			);
			if (!seen) messages = [...messages, buildFreshnessCardUIMessage(row)];
			return;
		}
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
		const sid = currentSessionId;
		if (sid) subscribeSessionMessages(sid);
	});

	// Capture receipts for the active session: earlier ones on open, new and
	// undone ones live.
	$effect(() => {
		const sid = currentSessionId;
		captureReceipts = [];
		if (!browser || !supabaseClient || !sid) return;
		const client = supabaseClient;
		const apply = (row: unknown) => {
			const record = row as Partial<CaptureReceiptRow> | null;
			if (record?.session_id !== sid) return;
			const receipt = buildCaptureReceiptUIMessage(record);
			if (receipt) captureReceipts = upsertCaptureReceipt(captureReceipts, receipt);
		};
		const channel = client.channel(`chat-capture-receipts:${sid}`);
		channel.on(
			'postgres_changes',
			{
				event: '*',
				schema: 'public',
				table: 'chat_capture_checkpoints',
				filter: `session_id=eq.${sid}`
			},
			(payload) => apply(payload.new)
		);
		void channel.subscribe();
		void client
			.from('chat_capture_checkpoints')
			.select(CAPTURE_RECEIPT_COLUMNS)
			.eq('session_id', sid)
			.in('status', ['captured', 'undone'])
			.order('created_at', { ascending: true })
			.limit(50)
			.then(({ data }) => {
				for (const row of data ?? []) apply(row);
			});
		return () => {
			void client.removeChannel(channel);
		};
	});

	// Establish the standing per-user worker delivery path at chat-surface mount.
	// The runtime is intentionally handle-free until server-authoritative worker
	// admission lands; mounting it cannot change the worker Send path.
	$effect(() => {
		if (!browser || !isSurfaceActive || !workerRealtime) return;
		void workerRealtime.start();
		return () => {
			void workerRealtime.stop();
		};
	});

	// Owned active-session discovery is the only reload/second-tab adoption path.
	// It cannot select worker transport or construct a handle from local state.
	$effect(() => {
		const sessionId = currentSessionId;
		if (!browser || !isSurfaceActive || !sessionId || !workerAdoption) return;
		const signal = getAbortSignal();
		void workerAdoption.discoverSession(sessionId, { signal }).catch((error) => {
			if (signal.aborted) return;
			if (dev) console.warn('[AgentChat] Worker turn discovery degraded', error);
		});
		return () => {
			workerAdoption?.releaseSession(sessionId);
		};
	});

	// Detect newly-terminal session runs and arm the fallback reload.
	$effect(() => {
		const runs = $agentRunsStore;
		const sid = currentSessionId;
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

	const AGENT_RUN_FALLBACK_MAX_ATTEMPTS = 5;

	function scheduleAgentRunMessageFallback(sid: string, runId: string, attempt = 0): void {
		const existing = agentRunFallbackTimers.get(runId);
		if (existing) clearTimeout(existing);
		const timer = setTimeout(() => {
			agentRunFallbackTimers.delete(runId);
			if (currentSession?.id !== sid) return;
			// Realtime already delivered it — nothing to do.
			if (messageHasAgentRun(runId)) return;
			// Don't clobber an in-flight streamed turn; retry a few times, then
			// give up — the realtime INSERT or the close-time refresh will
			// surface the message. (Uncapped, a long streamed turn kept this
			// timer respawning every 2.5s for its whole duration.)
			if (stream.isStreaming) {
				if (attempt + 1 < AGENT_RUN_FALLBACK_MAX_ATTEMPTS) {
					scheduleAgentRunMessageFallback(sid, runId, attempt + 1);
				}
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
	let projectReviewAvailable = $state(false);
	let documentOrganizationAvailable = $state(false);
	// Whether the two flags above are an answer yet; a launched review waits on it.
	let reviewCapabilitiesStatus = $state<ChatReviewCapabilities['status']>('loading');
	let reviewSelection = $state<{
		projectId: string;
		sessionId: string | null;
		intent: NonNullable<AgenticChatWorkerCommand['reviewIntent']>;
	} | null>(null);
	const reviewProjectId = $derived(
		shellRouter.selectedContextType === 'project' &&
			(!resolvedProjectFocus || resolvedProjectFocus.focusType === 'project-wide')
			? attachmentProjectId
			: null
	);
	const selectedReviewIntent = $derived.by(() => {
		if (
			!reviewSelection ||
			reviewSelection.projectId !== reviewProjectId ||
			(reviewSelection.sessionId !== (currentSession?.id ?? null) && !stream.isStartingStream)
		)
			return null;
		const available =
			reviewSelection.intent === 'document_organization'
				? documentOrganizationAvailable
				: projectReviewAvailable;
		return available ? reviewSelection.intent : null;
	});
	const reviewSelected = $derived(selectedReviewIntent === 'project_review');
	const documentOrganizationSelected = $derived(selectedReviewIntent === 'document_organization');

	$effect(() => {
		if (!browser || !(isOpen || embedded) || hidden) return;
		let active = true;
		void loadAgentChatCapabilities()
			.then((capabilities) => {
				if (!active) return;
				projectReviewAvailable = capabilities.projectReview;
				documentOrganizationAvailable = capabilities.documentOrganization;
				reviewCapabilitiesStatus = 'ready';
			})
			.catch(() => {
				if (!active) return;
				projectReviewAvailable = false;
				documentOrganizationAvailable = false;
				reviewCapabilitiesStatus = 'failed';
			});
		return () => {
			active = false;
		};
	});

	$effect(() => {
		if (
			reviewSelection &&
			(reviewSelection.projectId !== reviewProjectId ||
				(reviewSelection.intent === 'document_organization'
					? !documentOrganizationAvailable
					: !projectReviewAvailable) ||
				(reviewSelection.sessionId !== (currentSession?.id ?? null) &&
					!stream.isStartingStream))
		) {
			reviewSelection = null;
		}
	});
	// Plain flags: only the initial-draft effect reads/writes them.
	let appliedInitialDraftKey = '';
	let autoSentDraftKey = '';
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
	/** Display-only live answer preview for the streaming worker turn; never stored on a message. */
	let workerLivePreview = $state<{ turnRunId: string; text: string } | null>(null);
	let pendingAssistantText = '';
	let pendingAssistantTextFlushHandle: number | null = null;
	let currentThinkingBlockId = $state<string | null>(null);
	const pendingToolResults = new Map<string, PendingToolStatus>(); // Tool results that arrive before tool_call
	const processedToolCallIds = new Set<string>();
	const processedToolResultIds = new Set<string>();

	const selectedAttachmentAssetIds = $derived.by(() => attachments.selectedAttachmentAssetIds);

	// Track setTimeout IDs for cleanup to prevent memory leaks
	const pendingTimeouts = new Set<ReturnType<typeof setTimeout>>();

	let messagesContainer = $state<HTMLElement | undefined>(undefined);
	let hasFinalizedSession = false;

	// Ontology integration state
	let lastTurnContext = $state<LastTurnContext | null>(null);
	let contextUsage = $state<ContextUsageSnapshot | null>(null);
	let contextUsageOverheadTokens = $state(0);
	let prewarm: ReturnType<typeof createPrewarmController>;
	let handleSSEMessage: AgentSSEMessageHandler = Object.assign(
		(_event: AgentSSEMessage) => {
			/* assigned after SSE deps are created */
		},
		{ resetTurnState: () => {} }
	);

	// Let embedding surfaces (e.g. BriefChatModal) mirror the active session id
	// into their own header chrome.
	$effect(() => {
		onSessionChange?.(currentSessionId);
	});

	const displayContextUsage = $derived.by(() => {
		// The header's context-usage pill only renders in dev — skip the
		// O(conversation) token estimate per keystroke in prod.
		if (!dev) return null;
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
		thinking: 'Thinking…',
		waiting_on_user: 'Waiting on your direction…'
	};

	const ACTIVE_TURN_PROBE_BASE_MS = 2000;
	const ACTIVE_TURN_PROBE_MAX_MS = 10_000;
	let activeTurnProbeAttempt = 0;

	// Voice recording adapter — see agent-chat-voice.svelte.ts
	const voice = createVoiceAdapter({
		toastError: (msg) => toastService.error(msg),
		logWarn: (msg, err) => {
			console.error(msg, err);
		}
	});

	const stream = createAgentChatStreamController({
		getInputValue: () => inputValue,
		requestWorkerReconciliation: (turnRunId) =>
			workerRealtime?.coordinator.inbox.requestReconciliation(turnRunId, 'reconcile_hint'),
		getReviewIntent: () => selectedReviewIntent,
		getPublishedSpecialist: () => publishedSpecialist,
		onReviewAdmitted: () => {
			reviewSelection = null;
		},
		setInputValue: (value) => {
			inputValue = value;
		},
		getSelectedContextType: () => shellRouter.selectedContextType,
		getSelectedEntityId: () => shellRouter.selectedEntityId,
		getResolvedProjectFocus: () => resolvedProjectFocus,
		getCurrentSession: () => currentSession,
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
			},
			update: (messageId, patch) => {
				const index = messages.findIndex((message) => message.id === messageId);
				if (index < 0) return;
				const nextMessages = [...messages];
				nextMessages[index] = { ...messages[index]!, ...patch };
				messages = nextMessages;
			}
		},
		thinking: {
			create: (options) => createThinkingBlock(options),
			updateState: (state, details) => updateThinkingBlockState(state, details),
			finalize: (status, note) => finalizeThinkingBlock(status, note),
			discard: () => discardThinkingBlock()
		},
		assistant: {
			flushText: () => flushAssistantText(),
			finalizeMessage: () => finalizeAssistantMessage()
		},
		clearPendingToolState: () => {
			pendingToolResults.clear();
			processedToolCallIds.clear();
			processedToolResultIds.clear();
			// Also drop the SSE handler's created-entities buffer: a cancelled
			// turn never receives done/error, and without this reset its
			// entity chips would flush into the next turn's card.
			handleSSEMessage.resetTurnState();
		},
		adoptWorkerAdmissionResponse: async (value) => {
			if (!workerAdoption) {
				throw new Error('Worker admission runtime is unavailable');
			}
			const { descriptor } = parseAdmissionResponse(value);
			if (!currentSession) {
				// A new chat's first turn (and every raw review) creates its session
				// inside admission. The response carries the row; older servers
				// don't, so fall back to one snapshot read.
				const projectId = reviewProjectId;
				const session =
					admittedSessionFromResponse(value, descriptor.handle.sessionId) ??
					(await loadAgentChatSessionSnapshot(descriptor.handle.sessionId)).session;
				if (currentSession || projectId !== reviewProjectId) {
					throw new Error('Chat focus changed while the turn was starting');
				}
				hydrateSessionFromEvent(session);
			}
			return workerAdoption.adoptAdmissionResponse(value);
		},
		discoverWorkerSession: async (sessionId) => {
			if (!workerAdoption) return [];
			return workerAdoption.discoverSession(sessionId);
		},
		setUserHasScrolled: (value) => {
			userHasScrolled = value;
		},
		setExistingImagePickerOpen: (value) => {
			showExistingImagePicker = value;
		},
		haptic: (style) => haptic(style),
		captureTurnTiming: (summary) => captureTurnTiming(summary),
		logError: (message, err) => console.error(message, err),
		logDebug: (message, data) => {
			if (dev) {
				console.debug(message, data);
			}
		}
	});

	// Session resumption state
	let isLoadingSession = $state(false);
	let sessionLoadError = $state<string | null>(null);
	let lastLoadedSessionId = $state<string | null>(null);
	let sessionLoadRequestId = 0;
	let sessionLoadController: AbortController | null = null;
	let sessionRefreshTimeout: ReturnType<typeof setTimeout> | null = null;
	let activeRestoredTurnRunId = $state<string | null>(null);
	const inboxHeaderActions = $derived.by<AgentChatHeaderAction[]>(() =>
		inboxResolutionActions.map((action) => ({
			...action,
			disabled: action.disabled || isLoadingSession || stream.isStreaming,
			onClick: () => handleInboxResolutionAction(action)
		}))
	);
	const canAttachExistingProjectImages = $derived(
		Boolean(attachmentProjectId) && !isLoadingSession && !stream.isStreaming
	);
	const sessionStatusLabel = $derived.by(() => {
		if (isLoadingSession) return 'Loading session';
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
		// Sub-selectors (project action / focus) keep their
		// back affordance so users can return to the step before them.
		if (shellRouter.showProjectActionSelector || shellRouter.showFocusSelector) {
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
		if (!isLoadingSession || messages.length > 0) return false;
		if (
			shellRouter.showContextSelection ||
			shellRouter.showProjectActionSelector ||
			shellRouter.showFocusSelector
		) {
			return false;
		}
		return true;
	});

	const shouldShowSessionLoadErrorState = $derived.by(() => {
		if (!sessionLoadError || isLoadingSession || messages.length > 0) return false;
		if (
			shellRouter.showContextSelection ||
			shellRouter.showProjectActionSelector ||
			shellRouter.showFocusSelector
		) {
			return false;
		}
		return true;
	});

	const isFocusPickerOpen = $derived(
		shellRouter.showFocusSelector &&
			isProjectContext(shellRouter.selectedContextType) &&
			Boolean(shellRouter.selectedEntityId) &&
			Boolean(resolvedProjectFocus)
	);
	const isChatPickerOpen = $derived(shellRouter.showProjectActionSelector || isFocusPickerOpen);

	const shouldShowComposer = $derived(
		!shellRouter.showContextSelection &&
			!shellRouter.showProjectActionSelector &&
			!shellRouter.showFocusSelector
	);

	const chatComposerVocabularyTerms = $derived(
		resolvedProjectFocus?.projectName ?? displayContextLabel
	);

	const canPrimeActiveChatSession = $derived.by(() => {
		if (!shellRouter.selectedContextType || !isOpen || currentSession?.id) return false;
		if (shellRouter.showContextSelection || shellRouter.showProjectActionSelector) return false;
		return true;
	});

	// Memoized draft-presence flag for the prewarm orchestrator. The effect must
	// track this boolean — not the raw input string — or every keystroke would
	// rerun it and abort/reissue the in-flight prewarm.
	const hasDraftInput = $derived(inputValue.trim().length > 0);

	// Prewarm controller — owns the context-cache prewarm lifecycle.
	// See agent-chat-prewarm.svelte.ts.
	prewarm = createPrewarmController({
		getIsOpen: () => isOpen,
		getIsBrowser: () => browser,
		getSelectedContextType: () => shellRouter.selectedContextType,
		getSelectedEntityId: () => shellRouter.selectedEntityId,
		getResolvedProjectFocus: () => resolvedProjectFocus,
		getIsProjectReview: () => selectedReviewIntent !== null,
		// A worker turn keeps its handle until terminal truth arrives. Include that
		// authoritative ownership so adoption/reconciliation transitions can never
		// restart prewarm while the worker is still active.
		getIsTurnActive: () =>
			stream.isStartingStream ||
			stream.isStreaming ||
			stream.activeTurnHandle !== null ||
			activeRestoredTurnRunId !== null,
		getCurrentSession: () => currentSession,
		getCanPrimeActiveChatSession: () => canPrimeActiveChatSession,
		getHasDraftInput: () => hasDraftInput,
		getIsVoiceBusy: () => voice.isBusy,
		getIsVoicePending: () => voice.pendingSendAfterTranscription,
		getLastTurnContext: () => lastTurnContext,
		prewarmAgentContext: (payload, options) => prewarmAgentContext(payload, options),
		warmStreamTransport: (options) => warmAgentChatStreamTransport(options),
		hydrateSessionFromEvent: (session) => hydrateSessionFromEvent(session),
		logWarn: (msg, err) => {
			if (dev) {
				console.warn(msg, err);
			}
		}
	});

	$effect(() => {
		const draft = initialDraft?.trim() ?? '';
		if (!isOpen) {
			appliedInitialDraftKey = '';
			autoSentDraftKey = '';
			return;
		}
		if (!draft) return;
		// Hold the draft while a context/action selector is up: choosing a context
		// runs resetConversation (which clears the composer), so applying early gets
		// wiped. These flags are reactive — the effect re-runs once the user lands
		// in the actual chat surface and the draft applies to the fresh composer.
		if (shellRouter.showContextSelection || shellRouter.showProjectActionSelector) return;

		const draftKey = [
			draft,
			initialChatSessionId ?? '',
			_initialContextType,
			_initialEntityId ?? '',
			initialReviewIntent ?? ''
		].join('|');
		if (appliedInitialDraftKey === draftKey) return;
		if (inputValue.trim() || messages.length > 0 || stream.isStreaming || isLoadingSession)
			return;

		// A launched review runs as that review or not at all — never as ordinary chat.
		const review = initialReviewIntent
			? resolveInitialReview({
					intent: initialReviewIntent,
					capabilities:
						reviewCapabilitiesStatus === 'ready'
							? {
									status: 'ready',
									projectReview: projectReviewAvailable,
									documentOrganization: documentOrganizationAvailable
								}
							: { status: reviewCapabilitiesStatus },
					reviewProjectId
				})
			: null;
		if (review?.kind === 'wait') return;
		if (review?.kind === 'unavailable') {
			// The composer stays empty so the question cannot go out as ordinary chat.
			appliedInitialDraftKey = draftKey;
			onInitialReviewUnavailable?.(review.message);
			return;
		}

		inputValue = draft;
		appliedInitialDraftKey = draftKey;
		if (review?.kind === 'ready') {
			reviewSelection = { ...review.selection, sessionId: currentSession?.id ?? null };
		}

		// The launching surface already collected the user's submit; sending here is
		// the equivalent of them pressing Enter the moment the composer is ready.
		if (autoSendInitialDraft && autoSentDraftKey !== draftKey) {
			autoSentDraftKey = draftKey;
			void stream.handleSendMessage();
		}
	});

	function clearSessionRefreshTimeout() {
		if (!sessionRefreshTimeout) return;
		clearTimeout(sessionRefreshTimeout);
		sessionRefreshTimeout = null;
	}

	// While a restored turn is running, poll a lightweight turn-run probe with
	// backoff (2s → 4s → 8s → 10s cap) and reload the full session snapshot
	// only once, when the turn goes terminal. The old behavior re-fetched the
	// entire snapshot (~8 server queries incl. 1000-row scans) every 2s for
	// the whole life of the detached turn (up to ~285s).
	function scheduleActiveTurnSessionRefresh(sessionId: string) {
		clearSessionRefreshTimeout();
		if (!browser || !isSurfaceActive) return;

		const delay = Math.min(
			ACTIVE_TURN_PROBE_BASE_MS * 2 ** activeTurnProbeAttempt,
			ACTIVE_TURN_PROBE_MAX_MS
		);
		sessionRefreshTimeout = setTimeout(() => {
			sessionRefreshTimeout = null;
			if (!isSurfaceActive) return;
			void probeActiveTurnAndRefresh(sessionId);
		}, delay);
	}

	async function probeActiveTurnAndRefresh(sessionId: string): Promise<void> {
		if (currentSession?.id !== sessionId || !activeRestoredTurnRunId) return;
		activeTurnProbeAttempt += 1;
		let probe: Awaited<ReturnType<typeof probeActiveTurnRun>> = null;
		try {
			probe = await probeActiveTurnRun(sessionId);
		} catch {
			probe = null; // aborted — treat as unknown
		}
		if (!isSurfaceActive || currentSession?.id !== sessionId || !activeRestoredTurnRunId) {
			return;
		}
		if (probe && !probe.hasActiveTurnRun) {
			// Turn went terminal — one full reload picks up the persisted result.
			await loadChatSession(sessionId, { backgroundRefresh: true });
			// On success applyChatSessionSnapshot either clears the restored-turn
			// state or re-arms the timer itself. If the reload failed, both are
			// untouched — re-arm so the loop doesn't stall with send blocked.
			if (
				isSurfaceActive &&
				currentSession?.id === sessionId &&
				activeRestoredTurnRunId &&
				!sessionRefreshTimeout
			) {
				scheduleActiveTurnSessionRefresh(sessionId);
			}
			return;
		}
		// Still running (or probe failed) — keep polling with backoff.
		scheduleActiveTurnSessionRefresh(sessionId);
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
	// While a response is running, a typed or dictated follow-up is queued (it
	// sends on its own when the response finishes); images wait for idle.
	const hasSendableImageAttachments = $derived(attachments.hasSendableImageAttachments);
	const hasBlockedImageAttachments = $derived(attachments.hasPendingOrFailedImageAttachments);
	const reviewDisabled = $derived(
		isLoadingSession ||
			stream.isStartingStream ||
			stream.isStreaming ||
			activeRestoredTurnRunId !== null ||
			voice.isBusy ||
			voice.noteGroupId !== null ||
			attachments.imageAttachments.length > 0
	);
	const isSendDisabled = $derived(
		!shellRouter.selectedContextType ||
			isLoadingSession ||
			hasBlockedImageAttachments ||
			(!inputValue.trim() && !voice.isRecording && !hasSendableImageAttachments) || // Allow send if recording (will get transcribed text)
			(stream.isTurnBusy && hasSendableImageAttachments) ||
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

	/** Freshness radar card "Fix in chat": pre-fill the composer; the user sends it. */
	function handleFreshnessDraftInChat(text: string) {
		reviewSelection = null;
		const existingDraft = inputValue.trim();
		inputValue = existingDraft ? `${existingDraft}\n\n${text}` : text;
		handleChatTabChange('chat');
		haptic('light');
	}

	function toggleWorkflowReview(intent: NonNullable<AgenticChatWorkerCommand['reviewIntent']>) {
		if (selectedReviewIntent === intent) {
			reviewSelection = null;
			return;
		}
		const available =
			intent === 'document_organization'
				? documentOrganizationAvailable
				: projectReviewAvailable;
		if (!available || !reviewProjectId || reviewDisabled) return;
		reviewSelection = {
			projectId: reviewProjectId,
			sessionId: currentSession?.id ?? null,
			intent
		};
		showExistingImagePicker = false;
		if (!inputValue.trim())
			inputValue =
				intent === 'document_organization'
					? 'Suggest how to organize this project’s documents. Identify overlap, gaps, and a clear document structure.'
					: 'Review this project’s progress, priorities, and risks. What needs attention next?';
	}

	function handleReviewDeeper(card: FreshnessCardPayloadV1) {
		if (!projectReviewAvailable || card.projectId !== reviewProjectId || reviewDisabled) return;
		const draft = reviewDeeperPromptFor(card);
		const existingDraft = inputValue.trim();
		inputValue = existingDraft ? `${existingDraft}\n\n${draft}` : draft;
		reviewSelection = {
			projectId: card.projectId,
			sessionId: currentSession?.id ?? null,
			intent: 'project_review'
		};
		showExistingImagePicker = false;
		handleChatTabChange('chat');
		haptic('light');
		toastService.success('Project review ready in the composer');
	}

	/**
	 * Global chat "Looking in" chip: continue this conversation inside the project. Mirrors a
	 * server context shift; the next message carries the project context, so the session moves
	 * there (resolveSession) and the project prompt, with START HERE, loads. History is kept.
	 */
	function handleContinueInProject(project: { id: string; name: string }) {
		if (stream.isStreaming) return;
		const { shiftedToNewProject } = shellRouter.setSelectedContext({
			contextType: 'project',
			entityId: project.id,
			label: project.name
		});
		if (shiftedToNewProject) contextShiftPulse += 1;
		shellRouter.projectFocus = buildProjectWideFocus(project.id, project.name);
		if (currentSession)
			currentSession = { ...currentSession, context_type: 'project', entity_id: project.id };
		haptic('light');
		toastService.success(`Continuing in ${project.name}`);
	}

	function handleAskAboutTimelineItem(item: AgentTimelineItem) {
		const draft = buildTimelineItemQuestionDraft(item);
		const existingDraft = inputValue.trim();
		inputValue = existingDraft ? `${existingDraft}\n\n${draft}` : draft;
		handleChatTabChange('chat');
		haptic('light');
		toastService.success('Added step context to composer');
	}

	// The chat pane stays mounted behind `hidden` when another tab is active,
	// but some browsers clamp a display:none scroller's scrollTop to 0 — save
	// and restore it explicitly across tab switches.
	let savedChatScrollTop = 0;

	function handleChatTabChange(tab: AgentChatPanelTab) {
		if (tab === activeChatTab) return;
		if (activeChatTab === 'chat' && messagesContainer) {
			savedChatScrollTop = messagesContainer.scrollTop;
		}
		activeChatTab = tab;
		if (tab === 'chat' && browser) {
			requestAnimationFrame(() => {
				if (activeChatTab !== 'chat' || !messagesContainer) return;
				if (userHasScrolled) messagesContainer.scrollTop = savedChatScrollTop;
				else messageListRef?.scrollToLatest();
			});
		}
	}

	function resetConversation(options: { preserveContext?: boolean } = {}) {
		const { preserveContext = true } = options;
		reviewSelection = null;

		voice.stop();

		if (currentSession?.id) workerAdoption?.releaseSession(currentSession.id);
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
		contextUsage = null;
		contextUsageOverheadTokens = 0;
		pendingToolResults.clear();
		processedToolCallIds.clear();
		processedToolResultIds.clear();
		handleSSEMessage.resetTurnState();
		presenter.resetMutationTracking();
		voice.reset();
		shellRouter.resetConversationState({ preserveContext });
		// Reset session resumption state
		sessionLoadError = null;
		activeRestoredTurnRunId = null;
		clearSessionRefreshTimeout();
	}

	/**
	 * After a picker hands off to the chat, put the cursor in the composer on
	 * desktop (the clicked card just disappeared, so focus would otherwise be
	 * lost). Touch devices keep focus off the textarea so no keyboard pops.
	 */
	async function focusComposerAfterPicker() {
		await tick();
		voice.ref?.focusIfFinePointer();
	}

	function handleContextSelect(selection: ContextSelectionDetail) {
		shellRouter.handleContextSelect(selection);
		void focusComposerAfterPicker();
	}

	function openFocusSelector() {
		shellRouter.openFocusSelector();
	}

	function handleFocusSelection(newFocus: ProjectFocus) {
		shellRouter.handleFocusSelection(newFocus);
		void focusComposerAfterPicker();
	}

	function handleFocusClear() {
		shellRouter.handleFocusClear();
	}

	function handleProjectActionSelect(action: ProjectAction) {
		shellRouter.handleProjectActionSelect(action);
		void focusComposerAfterPicker();
	}

	function initializeFromAutoInit(config: AutoInitProjectConfig) {
		shellRouter.initializeFromAutoInit(config);
	}

	// Auto-initialize the modal when launched with a context preset or project preset
	$effect(() => {
		if (!browser) return;

		if (!isOpen) {
			if (wasOpen) {
				if (embedded) {
					// Embedded mode has no Modal.onClose — run the full close path
					// including the host's onClose callback contract.
					handleClose();
				} else {
					// Programmatic close (parent flipped isOpen without the close
					// button): run the same teardown so the live stream, session
					// finalize/classification, and mutation broadcast aren't
					// skipped. Button-initiated closes re-enter here harmlessly.
					releaseSessionResources('close');
				}
				wasOpen = false;
				shellRouter.autoInitDismissed = false;
				shellRouter.lastAutoInitProjectId = null;
				shellRouter.resetInitialProjectFocus();
				lastLoadedSessionId = null; // Reset to allow reloading same session
				shellRouter.showProjectActionSelector = false;
				prewarm.reset();
			}
			return;
		}

		if (!wasOpen) {
			wasOpen = true;
			hasFinalizedSession = false;
			stream.hasSentMessage = false;
			// Reopening a still-mounted modal with the same session: the
			// subscribe effect keys on currentSession.id (unchanged), so
			// resubscribe the realtime channel released by the close teardown.
			if (currentSession?.id) {
				subscribeSessionMessages(currentSession.id);
			}

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
		if (!isOpen || initialChatSessionId || !initialProjectFocus) return;
		const focus = initialProjectFocus;
		// Launch props initialize once per entity/open, not whenever live focus changes.
		untrack(() => shellRouter.initializeFromProjectFocus(focus));
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
		// The chat is on screen again — drop any parked stack card for it (covers
		// reopen paths the card click didn't initiate, e.g. the history page).
		resolveParkedChatSession(sessionId);
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
		// Persisted rows replace live/optimistic ones under new ids; keep their
		// on-screen identity so the thread updates in place instead of remounting.
		messages = carryRenderKeys(messages, snapshot.messages);
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
			// Fresh snapshot evidence of a running turn — restart probe backoff.
			activeTurnProbeAttempt = 0;
			scheduleActiveTurnSessionRefresh(sessionId);
		} else {
			clearSessionRefreshTimeout();
			stream.currentActivity = '';
		}
	}

	async function loadChatSession(
		sessionId: string,
		options: { backgroundRefresh?: boolean } = {}
	) {
		const backgroundRefresh = options.backgroundRefresh === true;
		sessionLoadRequestId += 1;
		const requestId = sessionLoadRequestId;
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
			// Silent background refreshes (active-turn poll, agent-run fallback)
			// must not surface an error banner mid-conversation — the caller
			// retries or the close-time refresh picks the data up.
			if (!backgroundRefresh) {
				sessionLoadError = err.message || 'Failed to load chat session';
				stream.error = sessionLoadError;
			}
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

	// Conversation scroll policy (pin the new turn to the top, reply fills
	// downward, "jump to latest" when content is below the fold) lives in
	// AgentMessageList. The modal only asks it to reveal the latest content when
	// the mobile keyboard opens.
	let messageListRef = $state<
		{ scrollToLatest: (options?: { smooth?: boolean }) => void } | undefined
	>(undefined);

	// Keyboard avoiding for mobile - sets --keyboard-height CSS var so the modal
	// container shrinks via calc(100dvh - var(--keyboard-height, 0px)), keeping the
	// composer visible above the iOS keyboard. Attached to the composer footer.
	// In embedded mode, isOpen may stay false — treat embedded as always "open".
	const keyboardAvoid: Attachment<HTMLElement> = (element) => {
		if (!browser || !(embedded || isOpen)) return;
		return initKeyboardAvoiding({
			element,
			applyTransform: false,
			setCSSProperty: true,
			onKeyboardChange: (isVisible) => {
				if (!isVisible || userHasScrolled) return;
				requestAnimationFrame(() => {
					if (!userHasScrolled) messageListRef?.scrollToLatest();
				});
			}
		});
	};

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
			error: (msg) => toastService.error(msg),
			documentChange: (change) => {
				showDocumentChangeToast(change);
			}
		},
		onDocumentMutation: (event) => onDocumentMutation?.(event),
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

	function createThinkingBlock(options: { renderKey?: string } = {}): string {
		const blockId = crypto.randomUUID();
		const thinkingBlock: ThinkingBlockMessage = {
			id: blockId,
			...(options.renderKey ? { renderKey: options.renderKey } : {}),
			type: 'thinking_block',
			activities: [],
			status: 'active',
			agentState: 'thinking',
			isCollapsed: false,
			content: 'Thinking…',
			timestamp: new Date()
		};
		messages = [...messages, thinkingBlock];
		currentThinkingBlockId = blockId;
		return blockId;
	}

	/** Drop the current thinking block (its turn was proven never admitted). */
	function discardThinkingBlock() {
		const blockId = currentThinkingBlockId;
		if (!blockId) return;
		currentThinkingBlockId = null;
		messages = messages.filter((message) => message.id !== blockId);
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
			activities: appendUniqueThinkingActivity(block.activities, activity)
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

	function appendToolProgress(toolCallId: string, step: ToolProgressStep): boolean {
		if (!currentThinkingBlockId) return false;
		let matched = false;
		updateThinkingBlock(currentThinkingBlockId, (block) => {
			const index = block.activities.findIndex(
				(activity) =>
					activity.toolCallId === toolCallId && activity.activityType === 'tool_call'
			);
			if (index === -1) return block;
			matched = true;
			const activity = block.activities[index]!;
			const activities = [...block.activities];
			activities[index] = {
				...activity,
				metadata: {
					...activity.metadata,
					progressSteps: mergeToolProgressStep(activity.metadata?.progressSteps, step)
				}
			};
			return { ...block, activities };
		});
		return matched;
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
			const resultPayload = toolResult?.result ?? toolResult;
			const responsePayload = toolResult
				? sanitizeToolResultForActivityMetadata(toolResult)
				: undefined;
			const durationMs =
				typeof toolResult?.duration_ms === 'number' ? toolResult.duration_ms : undefined;
			const tokensConsumed =
				typeof toolResult?.tokens_consumed === 'number'
					? toolResult.tokens_consumed
					: undefined;
			const resultCount =
				typeof toolResult?.result_count === 'number' ? toolResult.result_count : undefined;
			const zeroResult =
				typeof toolResult?.zero_result === 'boolean' ? toolResult.zero_result : undefined;
			const requiresUserAction =
				typeof toolResult?.requires_user_action === 'boolean'
					? toolResult.requires_user_action
					: undefined;
			const streamEventCount =
				typeof responsePayload?.stream_event_count === 'number'
					? responsePayload.stream_event_count
					: undefined;
			const streamEventsPreview = Array.isArray(responsePayload?.stream_events_preview)
				? responsePayload.stream_events_preview
				: undefined;
			const affectedEntities = Array.isArray(toolResult?.affected_entities)
				? toolResult.affected_entities
				: undefined;
			const toolCategory =
				typeof toolResult?.tool_category === 'string'
					? toolResult.tool_category
					: undefined;
			const gatewayOp =
				typeof toolResult?.gateway_op === 'string' ? toolResult.gateway_op : undefined;
			const helpPath =
				typeof toolResult?.help_path === 'string' ? toolResult.help_path : undefined;

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
								response: responsePayload
							}
						: {}),
					...(durationMs !== undefined ? { durationMs } : {}),
					...(tokensConsumed !== undefined ? { tokensConsumed } : {}),
					...(resultCount !== undefined ? { resultCount } : {}),
					...(zeroResult !== undefined ? { zeroResult } : {}),
					...(requiresUserAction !== undefined ? { requiresUserAction } : {}),
					...(affectedEntities !== undefined ? { affectedEntities } : {}),
					...(streamEventCount !== undefined ? { streamEventCount } : {}),
					...(streamEventsPreview !== undefined ? { streamEventsPreview } : {}),
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

	/**
	 * Single teardown path shared by the close button (handleClose), programmatic
	 * close (parent flips isOpen without the button), and unmount. Finalizes the
	 * session (close + classification), stops the live stream, releases realtime
	 * and timer resources, and broadcasts the mutation summary. Every step is
	 * idempotent, so overlapping close paths re-enter harmlessly (the summary
	 * drains on first build).
	 */
	function releaseSessionResources(reason: 'close' | 'destroy'): DataMutationSummary {
		finalizeSession(reason);
		voice.stop();
		clearSessionRefreshTimeout();
		activeRestoredTurnRunId = null;
		if (sessionLoadController) {
			sessionLoadController.abort();
			sessionLoadController = null;
		}
		isLoadingSession = false;
		workerAdoption?.clear('teardown');
		void workerRealtime?.stop();
		voice.cleanup();
		attachments.cleanup();
		void unsubscribeSessionMessages();
		for (const timer of agentRunFallbackTimers.values()) clearTimeout(timer);
		agentRunFallbackTimers.clear();
		seenTerminalAgentRunIds.clear();

		// Clear per-turn tool state to prevent memory leaks
		pendingToolResults.clear();
		processedToolCallIds.clear();
		processedToolResultIds.clear();
		handleSSEMessage.resetTurnState();

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
		return summary;
	}

	function closeChat() {
		const summary = releaseSessionResources('close');
		if (onClose) onClose(summary);
	}

	function buildParkPayload(session: ChatSession) {
		return {
			sessionId: session.id,
			title: deriveSessionTitle(session) ?? displayContextLabel ?? 'Chat',
			contextType:
				shellRouter.selectedContextType ??
				normalizeSessionContextType(session.context_type),
			entityId: shellRouter.selectedEntityId ?? session.entity_id ?? null,
			projectId: resolvedProjectFocus?.projectId ?? null,
			contextLabel: resolvedProjectFocus?.projectName ?? displayContextLabel ?? 'Workspace',
			hasActiveTurn:
				stream.isStartingStream || stream.isStreaming || Boolean(activeRestoredTurnRunId),
			hasSentMessage: stream.hasSentMessage
		};
	}

	/**
	 * Park the chat into the notification stack instead of ending it. When the
	 * launch surface can host a hidden keep-alive instance (`onParked`
	 * provided), nothing is torn down: the SSE stream keeps rendering into
	 * component state and reopening is a seamless unhide. Otherwise falls back
	 * to a hard park (card + full teardown; resume rebuilds from the DB).
	 */
	export function minimizeToStack() {
		const session = currentSession;
		if (!session?.id) {
			// No session yet (context selection screen) — nothing to park.
			closeChat();
			return;
		}
		if (!embedded && onParked) {
			parkChatSession(buildParkPayload(session));
			voice.stop();
			// Broadcast applied changes now — the usual close-time broadcast
			// won't run until the chat is actually ended.
			const summary = presenter.buildMutationSummary({
				hasMessagesSent: stream.hasSentMessage,
				sessionId: session.id
			});
			if (summary.hasChanges) notifyDataMutation(summary);
			presenter.resetMutationTracking();
			onParked(session.id);
			return;
		}
		hardParkAndClose();
	}

	/**
	 * Park the card but fully tear this instance down, skipping session
	 * finalize (the card's dismiss action owns close + classify). Used by the
	 * launch surface when it needs the singleton instance for a different
	 * session; the parked chat resumes via the DB-snapshot path.
	 */
	export function hardParkAndClose() {
		const session = currentSession;
		if (!session?.id) {
			closeChat();
			return;
		}
		parkChatSession(buildParkPayload(session));
		// Park ≠ end: mark the session finalized so the shared teardown skips
		// close + classify — the card's dismiss action owns those now.
		hasFinalizedSession = true;
		closeChat();
	}

	/**
	 * Mark the session finalized without closing. The launch surface calls
	 * this before unmounting a hidden keep-alive instance whose card was
	 * dismissed — the bridge already closed the session server-side.
	 */
	export function markSessionFinalized() {
		hasFinalizedSession = true;
	}

	// Reopening a hidden keep-alive instance: the chat is on screen again, so
	// drop its parked stack card.
	let wasHiddenWhileParked = false;
	$effect(() => {
		if (!browser) return;
		if (hidden) {
			wasHiddenWhileParked = true;
			return;
		}
		if (wasHiddenWhileParked) {
			wasHiddenWhileParked = false;
			const sessionId = currentSession?.id;
			if (sessionId) resolveParkedChatSession(sessionId);
		}
	});

	function handleClose() {
		// Closing mid-turn parks instead of discarding: the server finishes the
		// detached turn either way, so keep a visible handle to the result.
		if (
			!embedded &&
			currentSession?.id &&
			(stream.isStartingStream || stream.isStreaming || Boolean(activeRestoredTurnRunId))
		) {
			minimizeToStack();
			return;
		}
		closeChat();
	}

	async function handleInboxResolutionAction(action: AgentChatResolutionAction) {
		if (action.disabled || action.loading || stream.isStreaming || isLoadingSession) return;
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
		if (stream.isStreaming || isLoadingSession) return;
		inputValue = text;
	}

	async function handleClientActionComplete(completion: AgentClientActionCompletion) {
		const sameAccount =
			completion.requestedEmailAddress.toLowerCase() ===
			completion.connectedEmailAddress.toLowerCase();
		toastService.success(`${completion.connectedEmailAddress} connected to Gmail`);

		const followUp = sameAccount
			? `Google OAuth completed for ${completion.connectedEmailAddress}. Re-check get_external_account_status for that exact address, then continue with the inbox or calendar options I requested.`
			: `Google OAuth completed. I requested ${completion.requestedEmailAddress}, but the Google account actually connected was ${completion.connectedEmailAddress}. Re-check get_external_account_status for ${completion.connectedEmailAddress} and tell me about the mismatch before continuing.`;
		if (isLoadingSession) {
			inputValue = followUp;
			toastService.info('Gmail connected. Send the prepared follow-up when the chat loads.');
			return;
		}

		// Mid-response this queues and goes out on its own when the response ends.
		await stream.sendMessage(followUp, { suppressInputClear: true });
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
			// Mid-response this queues the follow-up; handleSendMessage also owns the
			// "send while recording" flow.
			if (!isSendDisabled || voice.isRecording) {
				void stream.handleSendMessage();
			}
		}
	}

	$effect(() => {
		if (!browser) return;
		void stream.handlePendingSendAfterTranscription(hasSendableImageAttachments);
	});

	// A follow-up queued mid-response goes out the moment the conversation is idle.
	$effect(() => {
		if (!stream.queuedMessage || stream.isTurnBusy || isLoadingSession) return;
		untrack(() => void stream.flushQueuedMessage());
	});

	/** The session row admission returns when it created the session inline. */
	function admittedSessionFromResponse(value: unknown, sessionId: string): ChatSession | null {
		const session = (value as { data?: { session?: unknown } } | null)?.data?.session;
		if (!session || typeof session !== 'object') return null;
		const id = (session as { id?: unknown }).id;
		return typeof id === 'string' && id.toLowerCase() === sessionId.toLowerCase()
			? (session as ChatSession)
			: null;
	}

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
			updateActivityStatus,
			appendToolProgress,
			finalize: finalizeThinkingBlock,
			getCurrentBlockId: () => currentThinkingBlockId
		},
		state: {
			getMessages: () => messages,
			getInputValue: () => inputValue,
			getCurrentSession: () => currentSession,
			getSelectedContextLabel: () => shellRouter.selectedContextLabel,
			getActiveStreamRunId: () => stream.activeStreamRunId,
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
			}
		},
		hydrateSessionFromEvent,
		attachServerTiming: (runId, timing) => stream.attachServerTiming(runId, timing),
		bufferAssistantText,
		flushAssistantText,
		markAssistantCompletion,
		finalizeAssistantMessage,
		pendingToolResults,
		processedToolCallIds,
		processedToolResultIds,
		addCreatedEntitiesMessage,
		addDocumentChangesMessage,
		attachContextSelection,
		isDev: dev
	};

	handleSSEMessage = createSSEHandler(sseHandlerDeps);

	workerAdoption = workerRealtime
		? new AgenticChatWorkerTurnAdoption({
				runtime: workerRealtime,
				createObserver: ({ handle, onTerminal }) =>
					createAgentChatWorkerUiAdapter({
						handle,
						onTerminal,
						port: {
							beginGeneration: beginWorkerGeneration,
							replaceAssistantSnapshot: replaceWorkerAssistantSnapshot,
							appendAssistantText: appendWorkerAssistantText,
							applySemanticEvent: (event) => handleSSEMessage(event),
							updateTurnState: ({ handle: workerHandle, status, currentActivity }) =>
								stream.updateWorkerTurnState(workerHandle, status, currentActivity),
							finishTurn: finishWorkerTurn,
							setAssistantPreview: setWorkerAssistantPreview,
							onError: (error) => {
								if (dev)
									console.warn(
										'[AgentChat] Worker UI projection degraded',
										error
									);
							}
						}
					}),
				onAdopted: ({ descriptor }) => {
					if (descriptor.handle.sessionId !== currentSession?.id) return;
					stream.adoptWorkerTurn(descriptor.handle, descriptor.status);
				},
				onReleased: ({ handle }) => stream.releaseWorkerTurn(handle),
				onError: (error) => {
					if (dev) console.warn('[AgentChat] Worker handle adoption degraded', error);
				}
			})
		: null;

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

	/** "Working from" chips ride on the turn's user message; the latest selection wins. */
	function attachContextSelection(selection: ContextSelectionEventV1) {
		const index = messages.findLastIndex(
			(message) =>
				message.type === 'user' &&
				message.metadata?.client_turn_id === selection.client_turn_id
		);
		if (index === -1) return;
		const target = messages[index]!;
		// Replace, never mutate: the timeline cache keys on message identity.
		const next = [...messages];
		next[index] = {
			...target,
			metadata: { ...(target.metadata ?? {}), context_selection: selection }
		};
		messages = next;
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

	function addDocumentChangesMessage(receipts: DocumentChangeReceipt[]) {
		// Same replay guard as created-entity chips: a card already shown is never repeated.
		const shownIds = new Set<string>();
		for (const message of messages) {
			if (message.type !== 'document_changes') continue;
			for (const card of (message.data?.changes ?? []) as DocumentChangeCard[]) {
				if (card?.id) shownIds.add(card.id);
			}
		}
		const fresh = buildDocumentChangeCards(receipts).filter((card) => !shownIds.has(card.id));
		if (fresh.length === 0) return;
		messages = [
			...messages,
			{
				id: crypto.randomUUID(),
				type: 'document_changes',
				content: '',
				data: { changes: fresh },
				timestamp: new Date()
			}
		];
	}

	/**
	 * Undo from a change card succeeded: keep "Undone" on the card across re-renders
	 * and report the write like any chat mutation, so an open document view reloads
	 * now and the close-time broadcast refreshes the project surfaces.
	 */
	function handleDocumentChangeUndone(
		messageId: string,
		card: DocumentChangeCard,
		document: Record<string, unknown> | null
	) {
		messages = messages.map((message) =>
			message.id === messageId && message.type === 'document_changes'
				? {
						...message,
						data: {
							...message.data,
							changes: ((message.data?.changes ?? []) as DocumentChangeCard[]).map(
								(entry) =>
									entry.id === card.id ? { ...entry, undone: true } : entry
							)
						}
					}
				: message
		);
		presenter.recordDataMutation(
			'update_onto_document',
			{ document_id: card.documentId, project_id: card.projectId },
			true,
			{
				result: {
					document: document ?? { id: card.documentId, project_id: card.projectId }
				}
			},
			{ turnId: null }
		);
	}

	function beginWorkerGeneration(input: {
		handle: WorkerTurnHandle;
		executionGeneration: number;
		status: ChatTurnStatusV1;
	}) {
		flushAssistantText();
		pendingToolResults.clear();
		processedToolCallIds.clear();
		processedToolResultIds.clear();
		handleSSEMessage.resetTurnState();

		const blockId = `worker-thinking:${input.handle.turnRunId}:${input.executionGeneration}`;
		const thinkingBlock: ThinkingBlockMessage = {
			id: blockId,
			type: 'thinking_block',
			role: 'assistant',
			content: workerActivityForStatus(input.status),
			activities: [],
			status: 'active',
			agentState: 'thinking',
			isCollapsed: false,
			timestamp: new Date(),
			created_at: new Date().toISOString(),
			metadata: {
				turn_run_id: input.handle.turnRunId,
				stream_run_id: input.handle.streamRunId,
				client_turn_id: input.handle.clientTurnId,
				execution_generation: input.executionGeneration,
				execution_mode: 'worker_realtime'
			}
		};
		messages = upsertWorkerThinkingBlock(messages, currentThinkingBlockId, thinkingBlock);
		currentThinkingBlockId = blockId;
	}

	function replaceWorkerAssistantSnapshot(input: {
		handle: WorkerTurnHandle;
		executionGeneration: number;
		text: string;
		assistantMessage: AgenticChatReconcileAssistantMessageV1 | null;
		status: ChatTurnStatusV1;
	}) {
		flushAssistantText();
		const existingIndex = messages.findIndex(
			(message) =>
				message.role === 'assistant' &&
				message.type === 'assistant' &&
				message.metadata?.turn_run_id === input.handle.turnRunId
		);
		if (existingIndex < 0 && !input.text && !input.assistantMessage) {
			currentAssistantMessageId = `worker-assistant:${input.handle.turnRunId}`;
			currentAssistantMessageIndex = null;
			return;
		}

		const existing = existingIndex >= 0 ? messages[existingIndex] : null;
		const messageId =
			input.assistantMessage?.id ??
			existing?.id ??
			`worker-assistant:${input.handle.turnRunId}`;
		const createdAt =
			input.assistantMessage?.created_at ?? existing?.created_at ?? new Date().toISOString();
		const nextMessage: UIMessage = {
			...(existing ?? {}),
			id: messageId,
			// Stable across the placeholder → persisted id swap (no remount).
			renderKey: existing?.renderKey ?? `turn:${input.handle.turnRunId}:assistant`,
			session_id: input.handle.sessionId,
			role: 'assistant',
			type: 'assistant',
			content: input.text,
			created_at: createdAt ?? undefined,
			timestamp: createdAt ? new Date(createdAt) : new Date(),
			metadata: {
				...(existing?.metadata ?? {}),
				...(input.assistantMessage?.metadata ?? {}),
				turn_run_id: input.handle.turnRunId,
				stream_run_id: input.handle.streamRunId,
				client_turn_id: input.handle.clientTurnId,
				execution_generation: input.executionGeneration,
				execution_mode: 'worker_realtime'
			}
		};
		if (existingIndex >= 0) {
			const nextMessages = [...messages];
			nextMessages[existingIndex] = nextMessage;
			messages = nextMessages;
			currentAssistantMessageIndex = existingIndex;
		} else {
			currentAssistantMessageIndex = messages.length;
			messages = [...messages, nextMessage];
		}
		if (input.text) noteWorkerTextStarted();
		currentAssistantMessageId = messageId;
		if (input.status !== 'queued' && input.status !== 'running') {
			currentAssistantMessageId = null;
			currentAssistantMessageIndex = null;
		}
	}

	function appendWorkerAssistantText(input: {
		handle: WorkerTurnHandle;
		executionGeneration: number;
		text: string;
	}) {
		const existingIndex = messages.findIndex(
			(message) =>
				message.role === 'assistant' &&
				message.type === 'assistant' &&
				message.metadata?.turn_run_id === input.handle.turnRunId
		);
		if (existingIndex >= 0) {
			const existing = messages[existingIndex]!;
			const nextMessages = [...messages];
			nextMessages[existingIndex] = { ...existing, content: existing.content + input.text };
			messages = nextMessages;
			currentAssistantMessageId = existing.id;
			currentAssistantMessageIndex = existingIndex;
			if (input.text) noteWorkerTextStarted();
			return;
		}
		replaceWorkerAssistantSnapshot({
			...input,
			text: input.text,
			assistantMessage: null,
			status: 'running'
		});
	}

	/**
	 * Live answer preview (display-only): rendered after the durable text of the
	 * turn's streaming bubble. A bubble created only to hold a preview is dropped
	 * again when the preview ends before any durable text arrived.
	 */
	function setWorkerAssistantPreview(input: {
		handle: WorkerTurnHandle;
		executionGeneration: number;
		text: string | null;
	}) {
		const turnRunId = input.handle.turnRunId;
		const placeholderId = `worker-assistant:${turnRunId}`;
		const existingIndex = messages.findIndex(
			(message) =>
				message.role === 'assistant' &&
				message.type === 'assistant' &&
				message.metadata?.turn_run_id === turnRunId
		);
		if (!input.text) {
			if (workerLivePreview?.turnRunId === turnRunId) workerLivePreview = null;
			const existing = existingIndex >= 0 ? messages[existingIndex] : null;
			if (existing && existing.id === placeholderId && !existing.content) {
				messages = messages.filter((_, index) => index !== existingIndex);
				currentAssistantMessageIndex = null;
			}
			return;
		}
		if (existingIndex >= 0) {
			currentAssistantMessageId = messages[existingIndex]!.id;
			currentAssistantMessageIndex = existingIndex;
		} else {
			const createdAt = new Date().toISOString();
			currentAssistantMessageIndex = messages.length;
			messages = [
				...messages,
				{
					id: placeholderId,
					renderKey: `turn:${turnRunId}:assistant`,
					session_id: input.handle.sessionId,
					role: 'assistant',
					type: 'assistant',
					content: '',
					created_at: createdAt,
					timestamp: new Date(createdAt),
					metadata: {
						turn_run_id: turnRunId,
						stream_run_id: input.handle.streamRunId,
						client_turn_id: input.handle.clientTurnId,
						execution_generation: input.executionGeneration,
						execution_mode: 'worker_realtime'
					}
				}
			];
			currentAssistantMessageId = placeholderId;
		}
		workerLivePreview = { turnRunId, text: input.text };
		noteWorkerTextStarted();
	}

	/**
	 * First reply text for the live turn: the thinking block switches from
	 * "Thinking…" to "Writing the response…" and the client clock records time
	 * to first text (send press → words on screen, the number users feel).
	 */
	function noteWorkerTextStarted() {
		const timing = stream.activeStreamTiming;
		if (timing && timing.firstTextAtMs === null) {
			stream.recordClientStreamEvent(timing.runId, 'text_delta');
		}
		const blockId = currentThinkingBlockId;
		if (!blockId) return;
		updateThinkingBlock(blockId, (block) =>
			block.status === 'active' && block.content !== WRITING_RESPONSE_STATUS
				? { ...block, content: WRITING_RESPONSE_STATUS }
				: block
		);
	}

	const WRITING_RESPONSE_STATUS = 'Writing the response…';

	function captureTurnTiming(summary: ClientTurnTimingSummary) {
		void captureEvent('agentic_chat_turn_client_timing', {
			time_to_admitted_ms: summary.timeToAdmittedMs,
			time_to_first_text_ms: summary.timeToFirstTextMs,
			total_turn_ms: summary.totalStreamMs,
			inline_session: summary.inlineSession,
			prepared_prompt_used: summary.preparedPromptUsed,
			terminal_state: summary.terminalState,
			context_type: shellRouter.selectedContextType
		});
	}

	function finishWorkerTurn(input: {
		handle: WorkerTurnHandle;
		status: 'completed' | 'failed' | 'cancelled';
		finishedReason: string | null;
		failureCode: string | null;
	}) {
		currentAssistantMessageId = null;
		currentAssistantMessageIndex = null;
		const finalizedThinking = finalizeWorkerThinkingBlock(
			messages,
			input.handle.turnRunId,
			input.status
		);
		messages = finalizedThinking.messages;
		if (currentThinkingBlockId === finalizedThinking.blockId) {
			currentThinkingBlockId = null;
		}
		stream.finishWorkerTurn(
			input.handle,
			input.status,
			input.finishedReason,
			input.failureCode
		);
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

	// Screen-reader announcement for completed replies. The streaming bubble
	// itself is deliberately NOT a live region (per-token announcements are
	// unusable); instead a single polite note fires when a reply finishes.
	let srAnnouncement = $state('');

	function announceForScreenReader(text: string) {
		// Clear-then-set so consecutive identical announcements still fire.
		srAnnouncement = '';
		setTrackedTimeout(() => {
			srAnnouncement = text;
		}, 30);
	}

	function finalizeAssistantMessage() {
		if (currentAssistantMessageId) {
			announceForScreenReader('BuildOS replied');
		}
		currentAssistantMessageId = null;
		currentAssistantMessageIndex = null;
	}

	function markAssistantCompletion(
		completionStatus?: 'completed' | 'completed_degraded' | 'failed',
		answerSource?: 'model' | 'partial_model' | 'deterministic_evidence' | 'precise_no_evidence'
	) {
		if (!currentAssistantMessageId || completionStatus !== 'completed_degraded') return;
		messages = messages.map((msg) =>
			msg.id === currentAssistantMessageId
				? {
						...msg,
						metadata: {
							...msg.metadata,
							completion_status: completionStatus,
							answer_source: answerSource ?? 'deterministic_evidence',
							...(answerSource === 'partial_model'
								? {
										interrupted: true,
										interrupted_reason: 'synthesis_recovered'
									}
								: {})
						}
					}
				: msg
		);
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

		releaseSessionResources('destroy');
	});
</script>

{#snippet messageList(compact: boolean)}
	<AgentMessageList
		bind:this={messageListRef}
		messages={displayMessages}
		{displayContextLabel}
		selectedContextType={shellRouter.selectedContextType}
		{resolvedProjectFocus}
		streamingMessageId={currentAssistantMessageId}
		livePreview={workerLivePreview}
		onToggleThinkingBlock={toggleThinkingBlockCollapse}
		bind:container={messagesContainer}
		onScroll={handleScroll}
		voiceNotesByGroupId={voice.notesByGroupId}
		onDeleteVoiceNote={voice.removeNoteFromGroup.bind(voice)}
		onSelectSuggestion={handleSelectSuggestion}
		onClientActionComplete={handleClientActionComplete}
		onDraftInChat={handleFreshnessDraftInChat}
		onDocumentChangeUndone={handleDocumentChangeUndone}
		onReviewDeeper={projectReviewAvailable ? handleReviewDeeper : undefined}
		onContinueInProject={handleContinueInProject}
		{reviewProjectId}
		{reviewDisabled}
		{compact}
	/>
{/snippet}

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
						class="inline-flex items-center justify-center rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground shadow-ink pressable hover:border-accent hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
				{#if !conversationOnly}
					<AgentChatActivityTabs
						activeTab={activeChatTab}
						timelineItems={agentTimelineItems}
						onTabChange={handleChatTabChange}
						onAskAboutItem={handleAskAboutTimelineItem}
					/>
				{/if}
				<!-- Kept mounted (hidden, not unmounted) when another tab is active:
				     unmounting reset the scroll position to the top of the whole
				     conversation and replayed every entrance animation on return. -->
				{#if conversationOnly}
					<div
						class="flex min-h-0 flex-1 flex-col"
						role="region"
						aria-label="Document conversation"
					>
						{@render messageList(true)}
					</div>
				{:else}
					<div
						class={`${activeChatTab === 'chat' ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col`}
						role="tabpanel"
						id="agent-chat-panel-chat"
						tabindex="0"
						aria-labelledby="agent-chat-tab-chat"
					>
						{@render messageList(false)}
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

	<!-- Polite announcement when a streamed reply completes (see
	     announceForScreenReader) — the streaming bubble has no live region. -->
	<div class="sr-only" role="status" aria-live="polite">{srAnnouncement}</div>

	{#if stream.error && !showSessionLoadErrorState}
		<div
			class="border-t border-destructive/30 bg-destructive/10 p-2 text-xs font-semibold text-destructive tx tx-static tx-weak sm:p-2.5"
			role="alert"
			aria-live="assertive"
		>
			{stream.error}
		</div>
	{/if}

	{#if !conversationOnly}
		<AgentRunDock
			runs={sessionAgentRuns}
			activeCount={activeSessionAgentRunCount}
			onOpen={openAgentRun}
		/>
	{/if}
{/snippet}

{#snippet chatComposerFooter()}
	<div
		{@attach keyboardAvoid}
		class="flex-shrink-0 overflow-visible bg-background/60 {conversationOnly
			? 'border-t border-border/60 px-2 py-2 sm:px-3'
			: 'px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5 sm:pt-3'}"
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
		{#if publishedSpecialist}
			<p class="mb-2 text-xs text-muted-foreground">
				Document reviews use <strong class="font-medium text-foreground"
					>{publishedSpecialist.name} · v{publishedSpecialist.version}</strong
				>. Choose Organize documents for each document review. Other messages use project
				chat.
			</p>
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
			isStartingStream={stream.isStartingStream}
			contextType={shellRouter.selectedContextType}
			reviewAvailable={projectReviewAvailable && Boolean(reviewProjectId)}
			documentOrganizationAvailable={documentOrganizationAvailable &&
				Boolean(reviewProjectId)}
			{reviewSelected}
			{documentOrganizationSelected}
			{reviewDisabled}
			onToggleReview={() => toggleWorkflowReview('project_review')}
			onToggleDocumentOrganization={() => toggleWorkflowReview('document_organization')}
			{isSendDisabled}
			queuedMessage={stream.queuedMessage}
			onEditQueued={() => stream.returnQueuedMessageToComposer()}
			autofocus={!isTouchDevice}
			{displayContextLabel}
			placeholderOverride={composerPlaceholder}
			disabled={isLoadingSession}
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
			onVoiceStopRequested={autoSendVoiceOnStop
				? () => (voice.pendingSendAfterTranscription = true)
				: undefined}
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
					isLoadingSession && messages.length === 0,
					!!sessionLoadError && messages.length === 0,
					null
				)}
				{@render chatComposerFooter()}
			</div>
		</div>
	</div>
{:else}
	<Modal
		isOpen={isOpen && !hidden}
		onClose={handleClose}
		size="full"
		variant="bottom-sheet"
		presentation="immersive"
		enableGestures={false}
		showDragHandle={false}
		closeOnBackdrop={false}
		showCloseButton={false}
		ariaLabel="BuildOS chat assistant dialog"
		customClasses="overscroll-none"
		keepMounted
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
					backDisabled={stream.isStartingStream}
					onBack={handleBackNavigation}
					onClose={handleClose}
					onMinimize={currentSession?.id && messages.length > 0
						? minimizeToStack
						: undefined}
					projectId={shellRouter.selectedEntityId}
					{resolvedProjectFocus}
					onChangeFocus={openFocusSelector}
					onClearFocus={handleFocusClear}
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
						active={shellRouter.showContextSelection && isOpen && !hidden}
						onSelect={handleContextSelect}
						onNavigationChange={handleContextSelectionNavChange}
					/>
				</div>

				<!-- Chat view - Same height constraint as selection -->
				<div
					class={`${shellRouter.showContextSelection ? 'hidden' : 'flex'} relative h-full min-h-0 flex-col`}
				>
					<!-- The conversation stays mounted (and laid out) under the project
					     action/focus pickers: unmounting it lost the reader's place and
					     replayed the whole thread when the picker closed. -->
					<div
						class="flex min-h-0 flex-1 flex-col"
						aria-hidden={isChatPickerOpen}
						inert={isChatPickerOpen}
					>
						{@render chatConversationPane(
							shouldShowSessionLoadingState,
							shouldShowSessionLoadErrorState,
							initialChatSessionId
						)}
					</div>
					{#if shellRouter.showProjectActionSelector}
						<div class="absolute inset-0 z-10 flex flex-col overflow-hidden bg-card">
							<ProjectActionSelector
								projectId={shellRouter.selectedEntityId || ''}
								projectName={shellRouter.projectFocus?.projectName ??
									shellRouter.selectedContextLabel ??
									'Project'}
								onSelectAction={(action) => handleProjectActionSelect(action)}
								onSelectFocus={handleFocusSelection}
							/>
						</div>
					{:else if isFocusPickerOpen && shellRouter.selectedEntityId && resolvedProjectFocus}
						<div class="absolute inset-0 z-10 flex flex-col overflow-hidden bg-card">
							<ProjectFocusSelector
								projectId={shellRouter.selectedEntityId}
								projectName={resolvedProjectFocus.projectName}
								currentFocus={resolvedProjectFocus}
								onSelect={handleFocusSelection}
							/>
						</div>
					{/if}
					{#if shouldShowComposer}
						<!-- INKPRINT composer footer -->
						{@render chatComposerFooter()}
					{/if}
				</div>
			</div>
		{/snippet}
	</Modal>
{/if}
