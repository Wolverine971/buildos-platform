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
	import { SSEProcessor, type StreamCallbacks } from '$lib/utils/sse-processor';
	import type {
		ChatSession,
		ChatContextType,
		ChatRole,
		AgentSSEMessage,
		ContextUsageSnapshot,
		AgentPlan
	} from '@buildos/shared-types';
	import {
		requestAgentToAgentMessage,
		type AgentToAgentMessageHistory
	} from '$lib/services/agentic-chat/agent-to-agent-service';
	// Add ontology integration imports
	import type { LastTurnContext, ProjectFocus } from '$lib/types/agent-chat-enhancement';
	import type TextareaWithVoiceComponent from '$lib/components/ui/TextareaWithVoice.svelte';
	import {
		CONTEXT_BADGE_CLASSES,
		CONTEXT_DESCRIPTORS,
		DEFAULT_CONTEXT_BADGE_CLASS
	} from './agent-chat.constants';
	import {
		findThinkingBlockById,
		type ActivityEntry,
		type ActivityType,
		type AgentLoopState,
		type DataMutationSummary,
		type ThinkingBlockMessage,
		type UIMessage
	} from './agent-chat.types';
	import { formatTime, shouldRenderAsMarkdown } from './agent-chat-formatters';
	import { toastService } from '$lib/stores/toast.store';
	import { haptic } from '$lib/utils/haptic';
	import { initKeyboardAvoiding } from '$lib/utils/keyboard-avoiding';
	import { createProjectInvalidation } from '$lib/utils/invalidation';
	import type { VoiceNote } from '$lib/types/voice-notes';

	type ProjectAction = 'workspace';

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
	const ENABLE_V2_PREWARM = false;

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

	const isProjectContext = (context: ChatContextType | null | undefined) =>
		context === 'project' || context === 'project_audit' || context === 'project_forecast';

	function buildProjectWideFocus(projectId: string, projectName?: string | null): ProjectFocus {
		return {
			focusType: 'project-wide',
			focusEntityId: null,
			focusEntityName: null,
			projectId,
			projectName: projectName ?? 'Project'
		};
	}

	function normalizeProjectFocusClient(focus?: ProjectFocus | null): ProjectFocus | null {
		if (!focus || !focus.projectId) return null;
		return {
			focusType: focus.focusType ?? 'project-wide',
			focusEntityId: focus.focusEntityId ?? null,
			focusEntityName: focus.focusEntityName ?? null,
			projectId: focus.projectId,
			projectName: focus.projectName ?? 'Project'
		};
	}

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

	function buildPrewarmKey(
		sessionId: string | null | undefined,
		contextType: ChatContextType | null,
		entityId?: string,
		focus?: ProjectFocus | null
	): string | null {
		if (!contextType) return null;
		const sessionKey = sessionId ?? 'new';
		const focusKey = focus?.focusType
			? `${focus.focusType}:${focus.focusEntityId ?? 'project-wide'}`
			: 'none';
		return [sessionKey, contextType, entityId ?? 'global', focusKey].join('|');
	}

	async function prewarmAgentContext(payload: {
		session_id?: string;
		context_type: ChatContextType;
		entity_id?: string;
		projectFocus?: ProjectFocus | null;
	}): Promise<ChatSession | null> {
		try {
			const response = await fetch('/api/agent/prewarm', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(payload)
			});
			if (!response.ok) {
				return null;
			}

			const result = await response.json();
			if (!result?.success) {
				return null;
			}

			const session = result?.data?.session ?? null;
			return session as ChatSession | null;
		} catch (err) {
			if (dev) {
				console.warn('[AgentChat] Prewarm failed:', err);
			}
			return null;
		}
	}

	// Chat session title helpers - avoid showing placeholder titles when auto titles exist
	const DEFAULT_CHAT_SESSION_TITLES = [
		'Agent Session',
		'Project Assistant',
		'Calendar Assistant',
		'Brief Chat',
		'General Assistant',
		'New Project Creation',
		'Project Audit',
		'Project Forecast',
		'Daily Brief Settings',
		'Chat session',
		'Untitled Chat'
	].map((title) => title.toLowerCase());

	function isPlaceholderSessionTitle(title?: string | null): boolean {
		const normalized = title?.trim().toLowerCase();
		if (!normalized) return true;
		return DEFAULT_CHAT_SESSION_TITLES.includes(normalized);
	}

	function deriveSessionTitle(session: ChatSession | null | undefined): string | null {
		if (!session) return null;
		const rawTitle = session.title?.trim() ?? '';
		const autoTitle = session.auto_title?.trim() ?? '';

		// Prefer user/custom titles that are not placeholders
		if (rawTitle && !isPlaceholderSessionTitle(rawTitle)) {
			return rawTitle;
		}

		// Fall back to auto-generated title when the stored title is generic
		if (autoTitle) {
			return autoTitle;
		}

		// As a last resort return whatever raw title exists (even if placeholder)
		return rawTitle || null;
	}

	function parseIsoTimestamp(value?: string | null): number | null {
		if (!value) return null;
		const parsed = Date.parse(value);
		return Number.isNaN(parsed) ? null : parsed;
	}

	// Device detection for mobile UX
	// On mobile/touch devices, Enter should not send messages (allows natural line breaks)
	const isTouchDevice = $derived(
		browser &&
			('ontouchstart' in window ||
				navigator.maxTouchPoints > 0 ||
				(navigator as any).msMaxTouchPoints > 0)
	);

	// Conversation state
	let messages = $state<UIMessage[]>([]);
	let currentSession = $state<ChatSession | null>(null);
	let isStreaming = $state(false);
	let currentStreamController: AbortController | null = null;
	let activeStreamRunId = $state(0);
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
	let currentThinkingBlockId = $state<string | null>(null); // NEW: Track current thinking block
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
	let contextUsage = $state<ContextUsageSnapshot | null>(null);
	let keyboardAvoidingCleanup = $state<(() => void) | null>(null);
	let hasFinalizedSession = false;

	// Ontology integration state
	let lastTurnContext = $state<LastTurnContext | null>(null);
	let ontologyLoaded = $state(false);
	let ontologySummary = $state<string | null>(null);

	// ✅ Svelte 5: Remove duplicate type declaration (imported from agent-chat.types.ts)
	const AGENT_STATE_MESSAGES: Record<AgentLoopState, string> = {
		thinking: 'BuildOS is thinking...',
		executing_plan: 'BuildOS is executing...',
		waiting_on_user: 'Waiting on your direction...'
	};

	// Actionable Insight agent identifier (used for agent-to-agent bridge)
	const RESEARCH_AGENT_ID = 'actionable_insight_agent';

	type AgentToAgentStep = 'agent' | 'project' | 'goal' | 'chat';

	interface AgentProjectSummary {
		id: string;
		name: string;
		description: string | null;
	}

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

	let agentState = $state<AgentLoopState | null>(null);

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
	let sessionLoadError = $state<string | null>(null);
	let lastLoadedSessionId = $state<string | null>(null);
	let sessionLoadRequestId = 0;
	let sessionLoadController: AbortController | null = null;

	// Helper to check if we're in braindump context
	const isBraindumpContext = $derived(selectedContextType === 'brain_dump');

	// Controls whether the context selection screen is visible (keeps state alive for back nav)
	let showContextSelection = $state(true);
	let contextSelectionView = $state<'primary' | 'projectHub' | 'project-selection'>('primary');
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

	function handleContextSelectionNavChange(view: 'primary' | 'projectHub' | 'project-selection') {
		contextSelectionView = view;
	}

	// ✅ Svelte 5: Use $derived for computed values
	// Note: isVoiceRecording is NOT included - clicking send while recording will
	// stop the recording and auto-send after transcription completes.
	// Streaming only blocks send on non-touch devices (touch uses Send & Stop).
	const isSendDisabled = $derived(
		agentToAgentMode ||
			!selectedContextType ||
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

		messages = [];
		currentSession = null;
		currentPlan = null;
		currentActivity = '';
		inputValue = '';
		error = null;
		userHasScrolled = false;
		currentAssistantMessageId = null;
		currentAssistantMessageIndex = null;
		currentThinkingBlockId = null; // NEW: Reset thinking block tracking
		isStreaming = false;
		// Reset ontology state
		lastTurnContext = null;
		agentState = null;
		ontologyLoaded = false;
		ontologySummary = null;
		contextUsage = null;
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

	// ✅ Svelte 5: Callback pattern for ContextSelectionScreen
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
		const prewarmSessionId = currentSession?.id ?? initialChatSessionId ?? null;
		const prewarmEntityId = selectedEntityId ?? resolvedProjectFocus?.projectId;
		if (isProjectContext(selectedContextType) && !prewarmEntityId) return;
		const key = buildPrewarmKey(
			prewarmSessionId,
			selectedContextType,
			prewarmEntityId,
			resolvedProjectFocus
		);
		if (!key || key === lastPrewarmKey) return;
		lastPrewarmKey = key;

		void (async () => {
			const session = await prewarmAgentContext({
				session_id: prewarmSessionId ?? undefined,
				context_type: selectedContextType,
				entity_id: prewarmEntityId,
				projectFocus: resolvedProjectFocus
			});

			if (session) {
				currentSession = session;
				// Use prewarmEntityId (captured at effect time) to match the key
				// computed in the effect body — selectedEntityId may differ when
				// it's undefined and the fallback resolvedProjectFocus.projectId is used
				const refreshedKey = buildPrewarmKey(
					session.id,
					selectedContextType,
					prewarmEntityId,
					resolvedProjectFocus
				);
				if (refreshedKey) {
					lastPrewarmKey = refreshedKey;
				}
			}
		})();
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
			const response = await fetch(`/api/chat/sessions/${sessionId}?includeVoiceNotes=1`, {
				signal: controller.signal
			});
			const result = await response.json().catch(() => null);

			if (requestId !== sessionLoadRequestId) {
				return;
			}

			if (!response.ok || !result?.success) {
				throw new Error(result?.error || 'Failed to load chat session');
			}

			const { session, messages: loadedMessages, truncated, voiceNotes = [] } = result.data;

			// Set session and context
			currentSession = session;
			lastLoadedSessionId = sessionId;

			// Map context type - handle 'general' alias
			const contextType =
				session.context_type === 'general' ? 'global' : session.context_type;
			selectedContextType = contextType as ChatContextType;
			selectedEntityId = session.entity_id || undefined;
			const sessionTitle = deriveSessionTitle(session);
			selectedContextLabel = sessionTitle || 'Resumed Chat';

			const metadataFocus = normalizeProjectFocusClient(
				(session.agent_metadata as { focus?: ProjectFocus | null })?.focus
			);

			// Set up project focus if applicable (prefer stored metadata focus)
			if (isProjectContext(selectedContextType)) {
				if (metadataFocus) {
					projectFocus = metadataFocus;
					selectedEntityId = metadataFocus.projectId || selectedEntityId;
				} else if (selectedEntityId) {
					projectFocus = buildProjectWideFocus(selectedEntityId, selectedContextLabel);
				} else {
					projectFocus = null;
				}
			} else {
				projectFocus = null;
			}

			// Note: showContextSelection and showProjectActionSelector were already
			// set to false at the start of loadChatSession to prevent flash

			// Convert loaded messages to UIMessages
			const filteredMessages = (loadedMessages || []).filter(
				(msg: any) => msg.role === 'user' || msg.role === 'assistant'
			);

			const restoredMessages: UIMessage[] = filteredMessages.map((msg: any) => ({
				id: msg.id,
				session_id: msg.session_id,
				user_id: msg.user_id,
				type: msg.role === 'user' ? 'user' : 'assistant',
				role: msg.role as ChatRole,
				content: msg.content,
				timestamp: new Date(msg.created_at),
				created_at: msg.created_at,
				metadata: msg.metadata as Record<string, any> | undefined,
				tool_calls: msg.tool_calls,
				tool_call_id: msg.tool_call_id
			}));

			messages = restoredMessages;

			const notesByGroup: Record<string, VoiceNote[]> = {};
			for (const note of voiceNotes as VoiceNote[]) {
				if (!note.group_id) continue;
				const existing = notesByGroup[note.group_id] ?? [];
				existing.push(note);
				notesByGroup[note.group_id] = existing;
			}
			for (const groupId of Object.keys(notesByGroup)) {
				notesByGroup[groupId] = notesByGroup[groupId]!.sort((a, b) => {
					const aIndex = a.segment_index ?? 0;
					const bIndex = b.segment_index ?? 0;
					if (aIndex !== bIndex) return aIndex - bIndex;
					return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
				});
			}
			voiceNotesByGroupId = notesByGroup;

			// Add a system message if conversation was truncated
			if (truncated) {
				const truncationNote: UIMessage = {
					id: crypto.randomUUID(),
					type: 'activity',
					role: 'system' as ChatRole,
					content:
						'Note: This conversation has been truncated to show the most recent messages.',
					timestamp: new Date(),
					created_at: new Date().toISOString()
				};
				messages = [truncationNote, ...messages];
			}

			// Add a welcome-back message
			const welcomeMessage: UIMessage = {
				id: crypto.randomUUID(),
				type: 'assistant',
				// System role keeps this out of future conversation_history payloads
				role: 'system' as ChatRole,
				content: session.summary
					? `Resuming your conversation. Here's where we left off:\n\n**Summary:** ${session.summary}\n\nHow can I help you continue?`
					: "Welcome back! I've restored your previous conversation. How can I help you continue?",
				timestamp: new Date(),
				created_at: new Date().toISOString()
			};
			messages = [...messages, welcomeMessage];
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

	// Helper: Scroll to bottom without jarring shifts during streaming
	// Uses requestAnimationFrame for smooth updates and avoids layout thrashing
	function scrollToBottomIfNeeded() {
		if (!messagesContainer) return;

		// Only auto-scroll if user hasn't manually scrolled up
		// This allows users to freely read earlier messages during streaming
		if (!userHasScrolled) {
			// Use requestAnimationFrame to batch with browser's paint cycle
			// This prevents layout thrashing during rapid streaming updates
			requestAnimationFrame(() => {
				if (messagesContainer) {
					// Use instant scroll during streaming to avoid animation lag
					messagesContainer.scrollTop = messagesContainer.scrollHeight;
				}
			});
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

	// Keyboard avoiding for mobile - keeps composer visible when keyboard opens
	$effect(() => {
		if (!browser || !isOpen || !composerContainer) {
			// Cleanup when modal closes or container unavailable
			if (keyboardAvoidingCleanup) {
				keyboardAvoidingCleanup();
				keyboardAvoidingCleanup = null;
			}
			return;
		}

		// Initialize keyboard avoiding when composer is mounted
		keyboardAvoidingCleanup = initKeyboardAvoiding({
			element: composerContainer,
			applyTransform: false, // Don't transform, just track state
			onKeyboardChange: (isVisible) => {
				// When keyboard appears, scroll messages to bottom to keep input visible
				if (isVisible && messagesContainer) {
					// Small delay to let layout settle
					setTrackedTimeout(() => {
						messagesContainer?.scrollTo({
							top: messagesContainer.scrollHeight,
							behavior: 'smooth'
						});
					}, 100);
				}
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
		| 'requirement'
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
		requirement: 'requirement',
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
		requirements: 'requirement',
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
			'requirement',
			'requirements',
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

	const HIDDEN_THINKING_TOOLS = new Set(['tool_help']);
	const GATEWAY_OP_TOOL_OVERRIDES: Record<string, string> = {
		'onto.search': 'search_ontology',
		'onto.document.tree.get': 'get_document_tree',
		'onto.document.tree.move': 'move_document_in_tree',
		'onto.document.path.get': 'get_document_path',
		'onto.entity.relationships.get': 'get_entity_relationships',
		'onto.entity.links.get': 'get_linked_entities',
		'onto.task.docs.list': 'list_task_documents',
		'onto.task.docs.create_or_attach': 'create_task_document',
		'onto.edge.link': 'link_onto_entities',
		'onto.edge.unlink': 'unlink_onto_edge',
		'onto.project.graph.reorganize': 'reorganize_onto_project_graph',
		'onto.project.graph.get': 'get_onto_project_graph',
		'util.schema.field_info': 'get_field_info',
		'util.web.search': 'web_search',
		'util.web.visit': 'web_visit',
		'util.buildos.overview': 'get_buildos_overview',
		'util.buildos.usage_guide': 'get_buildos_usage_guide',
		'cal.event.list': 'list_calendar_events',
		'cal.event.get': 'get_calendar_event_details',
		'cal.event.create': 'create_calendar_event',
		'cal.event.update': 'update_calendar_event',
		'cal.event.delete': 'delete_calendar_event',
		'cal.project.get': 'get_project_calendar',
		'cal.project.set': 'set_project_calendar'
	};
	const ONTO_ENTITY_PLURALS: Record<string, string> = {
		project: 'projects',
		task: 'tasks',
		goal: 'goals',
		plan: 'plans',
		document: 'documents',
		milestone: 'milestones',
		risk: 'risks',
		requirement: 'requirements',
		event: 'events'
	};

	function toOntologyPlural(entity: string): string {
		return ONTO_ENTITY_PLURALS[entity] ?? `${entity}s`;
	}

	function mapGatewayOpToToolName(op: string): string | undefined {
		const normalized = op.trim();
		if (!normalized) return undefined;
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

	const TOOL_DISPLAY_FORMATTERS: Record<
		string,
		(args: any) => { action: string; target?: string }
	> = {
		search_ontology: (args) => ({
			action: 'Searching workspace',
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
		list_onto_requirements: (args) => ({
			action: 'Listing requirements',
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
		get_onto_requirement_details: (args) => ({
			action: 'Loading requirement',
			target: resolveEntityName('requirement', args?.requirement_id)
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
		update_onto_requirement: (args) => ({
			action: 'Updating requirement',
			target: buildEntityTarget(
				args?.requirement_text ?? args?.text,
				args?.requirement_id,
				'requirement'
			)
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
			target: resolveEntityName('project', args?.project_id) || args?.calendar_scope
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
				(typeof opArgs.search === 'string' && opArgs.search) ||
				(typeof opArgs.query === 'string' && opArgs.query) ||
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
		Running: 'Ran'
	};

	function toPastTenseAction(action: string): string {
		const [verb, ...rest] = action.split(' ');
		if (!verb) return action;
		const pastVerb =
			TOOL_ACTION_PAST_TENSE[verb] ??
			(verb.endsWith('ing') ? `${verb.slice(0, -3)}ed` : verb);
		return [pastVerb, ...rest].join(' ');
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
					return `Failed to ${action.toLowerCase()}${errorSuffix}`;
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
				return `Failed to ${action.toLowerCase()}: "${target}"${errorSuffix}`;
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

	// ✅ Svelte 5: Properly create new array reference for reactivity
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
		'update_onto_requirement',
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
			data?.requirement?.project_id ??
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
				const message = target
					? `Failed to ${action.toLowerCase()}: "${target}"`
					: `Failed to ${action.toLowerCase()}`;
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
		if (currentStreamController && isStreaming) {
			handleStopGeneration('user_cancelled');
		} else if (currentStreamController) {
			currentStreamController.abort();
			currentStreamController = null;
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

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape' && isStreaming) {
			event.preventDefault();
			handleStopGeneration('user_cancelled');
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

	// ✅ Svelte 5: Wrapper function for AgentComposer callback
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

		if (isStreaming) {
			handleStopGeneration('superseded');
		}

		const now = new Date();

		// Add user message
		const userMessage: UIMessage = {
			id: crypto.randomUUID(),
			session_id: currentSession?.id,
			user_id: undefined, // Will be set by backend
			type: senderType as UIMessage['type'],
			role: 'user' as ChatRole,
			content: trimmed,
			timestamp: now,
			created_at: now.toISOString(),
			metadata: activeVoiceNoteGroupId
				? { voice_note_group_id: activeVoiceNoteGroupId }
				: undefined
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

		isStreaming = true;
		pendingToolResults.clear();
		hiddenToolCallIds.clear();

		// NEW: Create thinking block for agent activity
		createThinkingBlock();

		currentActivity = 'Analyzing request...';
		agentState = 'thinking';
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
			if (resolvedProjectFocus && resolvedProjectFocus.focusType !== 'project-wide') {
				ontologyEntityType = resolvedProjectFocus.focusType;
			}

			const response = await fetch('/api/agent/v2/stream', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				signal: streamController.signal,
				body: JSON.stringify({
					message: trimmed,
					session_id: currentSession?.id,
					context_type: selectedContextType,
					entity_id: selectedEntityId,
					ontologyEntityType: ontologyEntityType, // Pass entity type for ontology loading
					projectFocus: resolvedProjectFocus,
					lastTurnContext: lastTurnContext, // Pass last turn context for conversation continuity
					stream_run_id: runId,
					voiceNoteGroupId: activeVoiceNoteGroupId
				})
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const callbacks: StreamCallbacks = {
				onProgress: (data: any) => {
					if (runId !== activeStreamRunId) return; // Drop stale chunks
					receivedStreamEvent = true;
					handleSSEMessage(data as AgentSSEMessage);
				},
				onError: (err) => {
					if (runId !== activeStreamRunId) return;
					console.error('SSE error:', err);
					error =
						typeof err === 'string' ? err : 'Connection error occurred while streaming';
					isStreaming = false;
					currentActivity = '';
					currentStreamController = null;
					agentState = null;
					finalizeThinkingBlock('error');
					flushAssistantText();
					finalizeAssistantMessage();
				},
				onComplete: () => {
					if (runId !== activeStreamRunId) return;
					isStreaming = false;
					currentActivity = '';
					currentStreamController = null;
					agentState = null;
					if (!receivedStreamEvent && !error) {
						error = 'BuildOS did not return a response. Please try again.';
					}
					finalizeThinkingBlock('completed');
					flushAssistantText();
					finalizeAssistantMessage();
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
				agentState = null;
				finalizeThinkingBlock('interrupted', 'Stopped');
				flushAssistantText();
				finalizeAssistantMessage();
				return;
			}

			console.error('Failed to send message:', err);
			error = 'Failed to send message. Please try again.';
			isStreaming = false;
			currentActivity = '';
			agentState = null;
			finalizeThinkingBlock('error'); // Ensure thinking block is closed on error
			flushAssistantText();
			finalizeAssistantMessage();

			// Remove user message on error
			messages = messages.filter((m) => m.id !== userMessage.id);
			inputValue = trimmed;
		} finally {
			if (currentStreamController === streamController) {
				currentStreamController = null;
			}
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
					currentSession = event.session;
					const sessionTitle = deriveSessionTitle(event.session);
					const sessionContextType =
						(event.session.context_type as ChatContextType) ?? 'global';
					const normalizedSessionContext =
						sessionContextType === 'general' ? 'global' : sessionContextType;
					if (!selectedContextType) {
						selectedContextType = normalizedSessionContext;
						selectedEntityId = event.session.entity_id ?? undefined;
						selectedContextLabel =
							sessionTitle ||
							CONTEXT_DESCRIPTORS[normalizedSessionContext]?.title ||
							selectedContextLabel;
						showContextSelection = false;
					} else if (sessionTitle) {
						// Update the label when the session already exists but now has a better title
						selectedContextLabel = sessionTitle;
					}

					if (
						normalizedSessionContext === 'project' &&
						event.session.entity_id &&
						!projectFocus
					) {
						projectFocus = buildProjectWideFocus(
							event.session.entity_id,
							sessionTitle ?? selectedContextLabel
						);
					}

					const metadataFocus = (
						(event.session.agent_metadata as { focus?: ProjectFocus | null }) ?? null
					)?.focus;
					if (metadataFocus) {
						projectFocus = metadataFocus;
					}
				}
				break;

			case 'last_turn_context':
				// Store last turn context for next message
				lastTurnContext = event.context;
				if (dev) {
					console.debug('[AgentChat] Stored last turn context:', lastTurnContext);
				}
				break;

			case 'context_usage':
				if (!event.usage) {
					contextUsage = null;
					break;
				}

				if (!contextUsage) {
					contextUsage = event.usage;
					break;
				}

				{
					const currentCompressedAt = parseIsoTimestamp(contextUsage.lastCompressedAt);
					const nextCompressedAt = parseIsoTimestamp(event.usage.lastCompressedAt);

					if (currentCompressedAt === null && nextCompressedAt === null) {
						contextUsage = event.usage;
						break;
					}

					if (currentCompressedAt === null && nextCompressedAt !== null) {
						contextUsage = event.usage;
						break;
					}

					if (
						currentCompressedAt !== null &&
						nextCompressedAt !== null &&
						nextCompressedAt >= currentCompressedAt
					) {
						contextUsage = event.usage;
					}
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
				agentState = state;
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
					agentState = 'waiting_on_user';
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
				agentState = 'executing_plan';
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
				agentState = 'waiting_on_user';
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
				agentState = 'executing_plan';
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
					agentState = 'executing_plan';
					updateThinkingBlockState('executing_plan', currentActivity);
				} else {
					agentState = 'waiting_on_user';
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
				agentState = null;
				finalizeAssistantMessage();
				finalizeThinkingBlock(); // NEW: Close thinking block
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
				agentState = null;
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

	function addPlanMessage(plan: any) {
		const planMessage: UIMessage = {
			id: crypto.randomUUID(),
			type: 'plan',
			content: `Plan created with ${plan.steps?.length || 0} steps`,
			data: plan,
			timestamp: new Date()
		};
		messages = [...messages, planMessage];
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

	// ✅ Svelte 5: Properly reassign array for reactivity
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
			// ✅ Create new assistant message - uses spread for new array reference
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
		runId = activeStreamRunId
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
							stream_run_id: runId
						}
					}
				: msg
		);
	}

	function handleStopGeneration(
		reason: 'user_cancelled' | 'superseded' | 'error' = 'user_cancelled'
	) {
		if (!isStreaming || !currentStreamController) return;

		// Haptic feedback for stop action (mobile) - only for user-initiated stops
		if (reason === 'user_cancelled') {
			haptic('heavy');
		}

		const runId = activeStreamRunId;
		markAssistantInterrupted(reason, runId);
		// Invalidate the active run id so late SSE chunks are dropped
		activeStreamRunId = activeStreamRunId + 1;

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
		flushAssistantText();
		finalizeAssistantMessage();

		isStreaming = false;
		currentActivity = '';
		agentState = null;
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
				return 'What would you like to know about your projects? I can help you explore tasks, check timelines, or answer questions across your workspace.';

			case 'project_create':
				return "What are you working on? Tell me anything — even half-formed ideas — and I'll help you shape it into a project with clear goals, milestones, and next steps.";

			case 'project':
				return `What would you like to do with ${name}? I can help you explore goals, update tasks, or answer questions about the project.`;

			case 'calendar':
				return 'What would you like to plan or review on your calendar?';

			case 'daily_brief':
				return 'I have your brief context ready. What would you like to update first?';

			case 'daily_brief_update':
				return 'What would you like to adjust in your daily brief settings?';

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
		finalizeSession('destroy');
		stopVoiceInput();
		if (currentStreamController && isStreaming) {
			handleStopGeneration('user_cancelled');
		} else if (currentStreamController) {
			currentStreamController.abort();
			currentStreamController = null;
		}
		cleanupVoiceInput();
	});
</script>

{#if embedded}
	<!-- Embedded mode: render chat content directly without Modal wrapper -->
	<div class="flex h-full flex-col overflow-hidden bg-card">
		<!-- Embedded chat content area -->
		<div class="relative z-10 flex flex-1 flex-col overflow-hidden bg-card">
			<div class="flex h-full min-h-0 flex-col">
				<AgentMessageList
					{messages}
					{displayContextLabel}
					onToggleThinkingBlock={toggleThinkingBlockCollapse}
					bind:container={messagesContainer}
					onScroll={handleScroll}
					{voiceNotesByGroupId}
					onDeleteVoiceNote={removeVoiceNoteFromGroup}
				/>

				{#if isStreaming && currentActivity && !currentThinkingBlockId}
					<div
						class="border-t border-border bg-muted p-2 text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-muted-foreground tx tx-grain tx-weak sm:p-2.5"
					>
						<span class="inline-flex items-center gap-1.5">
							<span
								class="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-accent"
								aria-hidden="true"
							></span>
							<span role="status" aria-live="polite">{currentActivity}</span>
						</span>
					</div>
				{/if}

				{#if error}
					<div
						class="border-t border-red-600/30 bg-red-50 p-2 text-xs font-semibold text-red-700 tx tx-static tx-weak dark:bg-red-950/20 dark:text-red-400 sm:p-2.5"
						role="alert"
						aria-live="assertive"
					>
						{error}
					</div>
				{/if}

				<div
					bind:this={composerContainer}
					class="border-t border-border bg-card p-2 sm:p-2.5 tx tx-grain tx-weak"
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
						vocabularyTerms={resolvedProjectFocus?.projectName ?? displayContextLabel}
						onVoiceNoteSegmentSaved={handleVoiceNoteSegmentSaved}
						onVoiceNoteSegmentError={handleVoiceNoteSegmentError}
						onKeyDownHandler={handleKeyDown}
						onSend={handleSendMessage}
						onStop={() => handleStopGeneration('user_cancelled')}
					/>
				</div>
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
	>
		{#snippet header()}
			<!-- INKPRINT header bar with Frame texture -->
			<div class="border-b border-border bg-card tx tx-frame tx-weak">
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
					{contextUsage}
				/>
			</div>
		{/snippet}

		{#snippet children()}
			<!-- INKPRINT panel container with Frame texture -->
			<!-- Height strategy:
			 - Portrait mobile: Full height minus header space (8rem/128px for modal chrome)
			 - Landscape mobile: Reduced height to fit short viewport, no min-height
			 - Tablet/Desktop (sm+): 75vh with 500px min for comfortable reading
			 - Uses dvh (dynamic viewport height) for better mobile keyboard handling
		-->
			<div
				class="relative z-10 flex h-[calc(100dvh-8rem)] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-ink tx tx-frame tx-weak landscape:h-[calc(100dvh-4rem)] sm:h-[75dvh] sm:min-h-[500px] sm:landscape:min-h-0"
			>
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

					{#if !showContextSelection && !showProjectActionSelector && isStreaming && currentActivity && !currentThinkingBlockId}
						<!-- INKPRINT activity indicator with Grain texture -->
						<!-- NOTE: Hidden when thinking block is active to prevent duplicate status displays -->
						<div
							class="border-t border-border bg-muted p-2 text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-muted-foreground tx tx-grain tx-weak sm:p-2.5"
						>
							<span class="inline-flex items-center gap-1.5">
								<span
									class="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-accent"
									aria-hidden="true"
								></span>
								<span role="status" aria-live="polite">{currentActivity}</span>
							</span>
						</div>
					{/if}

					{#if !showContextSelection && !showProjectActionSelector && error}
						<!-- INKPRINT error message with Static texture -->
						<div
							class="border-t border-red-600/30 bg-red-50 p-2 text-xs font-semibold text-red-700 tx tx-static tx-weak dark:bg-red-950/20 dark:text-red-400 sm:p-2.5"
							role="alert"
							aria-live="assertive"
						>
							{error}
						</div>
					{/if}

					{#if !showContextSelection && !showProjectActionSelector && agentToAgentMode}
						<!-- INKPRINT automation footer with Thread texture -->
						<div
							class="border-t border-border bg-muted p-2 tx tx-thread tx-weak sm:p-2.5"
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
					{:else if !showContextSelection && !showProjectActionSelector && !(isBraindumpContext && (braindumpMode === 'input' || braindumpMode === 'options'))}
						<!-- INKPRINT composer footer - hidden for braindump input/options modes -->
						<div
							bind:this={composerContainer}
							class="border-t border-border bg-card p-2 sm:p-2.5 tx tx-grain tx-weak"
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
								vocabularyTerms={resolvedProjectFocus?.projectName ??
									displayContextLabel}
								onVoiceNoteSegmentSaved={handleVoiceNoteSegmentSaved}
								onVoiceNoteSegmentError={handleVoiceNoteSegmentError}
								onKeyDownHandler={handleKeyDown}
								onSend={handleSendMessage}
								onStop={() => handleStopGeneration('user_cancelled')}
							/>
						</div>
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

	/* ==================== Landscape Orientation Support ==================== */

	/* Compact spacing for landscape mobile (short viewport) */
	@media (orientation: landscape) and (max-height: 500px) {
		/* Reduce header padding in landscape */
		:global(.agent-chat-header) {
			padding-top: 0.25rem;
			padding-bottom: 0.25rem;
		}

		/* Compact composer in landscape */
		:global(.agent-chat-composer) {
			padding: 0.375rem;
		}

		/* Smaller scrollbar in landscape to maximize content */
		:global(.agent-chat-scroll::-webkit-scrollbar) {
			width: 4px;
		}
	}
</style>
