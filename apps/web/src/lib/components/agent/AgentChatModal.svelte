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
		ChatMessage,
		ChatRole,
		AgentSSEMessage,
		ContextUsageSnapshot
	} from '@buildos/shared-types';
	import {
		requestAgentToAgentMessage,
		type AgentToAgentMessageHistory
	} from '$lib/services/agentic-chat/agent-to-agent-service';
	import { RailwayWorkerService } from '$lib/services/railwayWorker.service';
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
		type ThinkingBlockMessage,
		type UIMessage
	} from './agent-chat.types';
	import { formatTime, shouldRenderAsMarkdown } from './agent-chat-formatters';

	type ProjectAction = 'workspace' | 'audit' | 'forecast';

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
		onClose?: () => void;
		autoInitProject?: AutoInitProjectConfig | null;
		initialBraindump?: InitialBraindump | null;
		initialChatSessionId?: string | null;
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
		initialChatSessionId = null
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

	// Conversation state
	let messages = $state<UIMessage[]>([]);
	let currentSession = $state<ChatSession | null>(null);
	let isStreaming = $state(false);
	let currentStreamController: AbortController | null = null;
	let inputValue = $state('');
	let error = $state<string | null>(null);
	// Track current plan for potential future UI enhancements
	let currentPlan = $state<any>(null);
	let currentActivity = $state<string>('');
	let userHasScrolled = $state(false);
	let currentAssistantMessageId = $state<string | null>(null);
	let currentThinkingBlockId = $state<string | null>(null); // NEW: Track current thinking block
	let messagesContainer = $state<HTMLElement | undefined>(undefined);
	let contextUsage = $state<ContextUsageSnapshot | null>(null);

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
	let agentStateDetails = $state<string | null>(null);
	const agentStateLabel = $derived.by(() => {
		if (!agentState) return null;
		return agentStateDetails ?? AGENT_STATE_MESSAGES[agentState];
	});

	let voiceInputRef = $state<TextareaWithVoiceComponent | null>(null);
	let isVoiceRecording = $state(false);
	let isVoiceInitializing = $state(false);
	let isVoiceTranscribing = $state(false);
	let voiceErrorMessage = $state('');
	let voiceSupportsLiveTranscript = $state(false);
	let voiceRecordingDuration = $state(0);

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

	function handleContextSelectionNavChange(view: 'primary' | 'projectHub' | 'project-selection') {
		contextSelectionView = view;
	}

	// ✅ Svelte 5: Use $derived for computed values
	const isSendDisabled = $derived(
		agentToAgentMode ||
			!selectedContextType ||
			!inputValue.trim() ||
			isStreaming ||
			isVoiceRecording ||
			isVoiceInitializing ||
			isVoiceTranscribing
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
		currentThinkingBlockId = null; // NEW: Reset thinking block tracking
		isStreaming = false;
		// Reset ontology state
		lastTurnContext = null;
		agentState = null;
		agentStateDetails = null;
		ontologyLoaded = false;
		ontologySummary = null;
		contextUsage = null;
		voiceErrorMessage = '';
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

			// Success - close modal or return to context selection
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

		// Use setTimeout to ensure state updates before sending
		setTimeout(() => {
			sendMessage();
		}, 0);
	}

	function cancelBraindumpOptions() {
		braindumpMode = 'input';
		// Keep the content in the input for editing
		inputValue = pendingBraindumpContent;
		pendingBraindumpContent = '';
	}

	function handleContextSelect(event: CustomEvent<ContextSelectionDetail>) {
		resetConversation();
		autoInitDismissed = true;

		const detail = event.detail;
		if (detail.contextType === 'agent_to_agent') {
			agentToAgentMode = true;
			agentToAgentStep = 'agent';
			selectedAgentId = null;
			selectedContextType = null;
			selectedContextLabel = detail.label ?? 'BuildOS automation';
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
		selectedContextType = detail.contextType;
		selectedEntityId = detail.entityId;
		selectedContextLabel =
			detail.label ?? CONTEXT_DESCRIPTORS[detail.contextType]?.title ?? null;
		showContextSelection = false;

		if (isProjectContext(detail.contextType) && detail.entityId) {
			projectFocus = buildProjectWideFocus(detail.entityId, detail.label);
		} else {
			projectFocus = null;
			showFocusSelector = false;
		}

		// If user picked a project from the generic flow, funnel them through the shared action selector
		showProjectActionSelector = detail.contextType === 'project';

		// Seed the chat with an initial message for contexts that go directly to chat
		// (not 'project' which shows the action selector first)
		if (detail.contextType !== 'project') {
			seedInitialMessage(detail.contextType, detail.label);
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

	function mapActionToContextType(action: ProjectAction): ChatContextType {
		switch (action) {
			case 'audit':
				return 'project_audit';
			case 'forecast':
				return 'project_forecast';
			default:
				return 'project';
		}
	}

	function buildContextLabelForAction(
		action: ProjectAction,
		projectName?: string | null
	): string {
		const name = projectName?.trim() || 'Project';
		if (action === 'audit') return `${name} (Audit)`;
		if (action === 'forecast') return `${name} (Forecast)`;
		return name;
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
				wasOpen = false;
				autoInitDismissed = false;
				lastAutoInitProjectId = null;
				lastLoadedSessionId = null; // Reset to allow reloading same session
				showProjectActionSelector = false;
			}
			return;
		}

		if (!wasOpen) {
			wasOpen = true;

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

		// Use setTimeout to ensure state updates before sending
		setTimeout(() => {
			sendMessage();
		}, 0);
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
		if (isLoadingSession) return;

		isLoadingSession = true;
		sessionLoadError = null;
		// Clear any prior session state to avoid bleed-through while loading
		resetConversation({ preserveContext: false });

		try {
			const response = await fetch(`/api/chat/sessions/${sessionId}`);
			const result = await response.json();

			if (!response.ok || !result.success) {
				throw new Error(result.error || 'Failed to load chat session');
			}

			const { session, messages: loadedMessages, truncated } = result.data;

			// Set session and context
			currentSession = session;
			lastLoadedSessionId = sessionId;

			// Map context type - handle 'general' alias
			const contextType =
				session.context_type === 'general' ? 'global' : session.context_type;
			selectedContextType = contextType as ChatContextType;
			selectedEntityId = session.entity_id || undefined;
			selectedContextLabel = session.title || session.auto_title || 'Resumed Chat';

			// Set up project focus if applicable
			if (isProjectContext(selectedContextType) && selectedEntityId) {
				projectFocus = buildProjectWideFocus(selectedEntityId, selectedContextLabel);
			}

			showContextSelection = false;
			showProjectActionSelector = false;

			// Convert loaded messages to UIMessages
			const restoredMessages: UIMessage[] = loadedMessages.map((msg: any) => ({
				id: msg.id,
				session_id: msg.session_id,
				user_id: msg.user_id,
				type: msg.role === 'user' ? 'user' : 'assistant',
				role: msg.role as ChatRole,
				content: msg.content,
				timestamp: new Date(msg.created_at),
				created_at: msg.created_at,
				tool_calls: msg.tool_calls,
				tool_call_id: msg.tool_call_id
			}));

			messages = restoredMessages;

			// Add a system message if conversation was truncated
			if (truncated) {
				const truncationNote: UIMessage = {
					id: crypto.randomUUID(),
					type: 'activity',
					role: 'assistant' as ChatRole,
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
				role: 'assistant' as ChatRole,
				content: session.summary
					? `Resuming your conversation. Here's where we left off:\n\n**Summary:** ${session.summary}\n\nHow can I help you continue?`
					: "Welcome back! I've restored your previous conversation. How can I help you continue?",
				timestamp: new Date(),
				created_at: new Date().toISOString()
			};
			messages = [...messages, welcomeMessage];
		} catch (err: any) {
			console.error('Failed to load chat session:', err);
			sessionLoadError = err.message || 'Failed to load chat session';
			error = sessionLoadError;
		} finally {
			isLoadingSession = false;
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

		// Only scroll if user hasn't manually scrolled up
		if (!userHasScrolled || isScrolledToBottom(messagesContainer)) {
			// Use requestAnimationFrame to batch with browser's paint cycle
			// This prevents layout thrashing during rapid streaming updates
			requestAnimationFrame(() => {
				if (messagesContainer) {
					// Use instant scroll during streaming to avoid animation lag
					// The CSS overflow-anchor handles visual stability
					messagesContainer.scrollTop = messagesContainer.scrollHeight;
					userHasScrolled = false;
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

	// Derive a "scroll trigger" value that changes when:
	// 1. New messages are added (messages.length changes)
	// 2. Content is streamed into the last message (content length changes during streaming)
	const scrollTrigger = $derived.by(() => {
		if (messages.length === 0) return 0;
		const lastMessage = messages[messages.length - 1];
		// Track both message count and last message content length
		// This triggers scroll during streaming when content grows
		return messages.length * 10000 + (lastMessage?.content?.length ?? 0);
	});

	// Sticky scroll behavior: Auto-scroll when new messages arrive OR when streaming content grows
	// Only scrolls if user hasn't manually scrolled up
	$effect(() => {
		if (scrollTrigger > 0) {
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

	// ========================================================================
	// Tool Display Formatters
	// ========================================================================

	/**
	 * Formats tool messages with meaningful context from arguments
	 */
	const TOOL_DISPLAY_FORMATTERS: Record<
		string,
		(args: any) => { action: string; target?: string }
	> = {
		create_onto_task: (args) => ({
			action: 'Creating task',
			target: args.name || args.task_name
		}),
		update_onto_task: (args) => ({
			action: 'Updating task',
			target: args.name || args.task_name
		}),
		delete_onto_task: (args) => ({
			action: 'Deleting task',
			target: args.name || args.task_name
		}),
		create_onto_plan: (args) => ({
			action: 'Creating plan',
			target: args.name
		}),
		update_onto_plan: (args) => ({
			action: 'Updating plan',
			target: args.name
		}),
		create_onto_goal: (args) => ({
			action: 'Creating goal',
			target: args.name
		}),
		fetch_project_data: (args) => ({
			action: 'Fetching project',
			target: args.project_name || args.project_id
		}),
		search_tasks: (args) => ({
			action: 'Searching tasks',
			target: args.query
		}),
		get_calendar_events: (args) => ({
			action: 'Loading calendar',
			target: args.date
		})
	};

	/**
	 * Formats a tool message based on tool name, arguments, and status
	 */
	function formatToolMessage(
		toolName: string,
		argsJson: string | Record<string, any>,
		status: 'pending' | 'completed' | 'failed'
	): string {
		const formatter = TOOL_DISPLAY_FORMATTERS[toolName];

		if (!formatter) {
			// Fallback for unknown tools
			if (status === 'pending') return `Using tool: ${toolName}`;
			if (status === 'completed') return `Tool ${toolName} completed`;
			return `Tool ${toolName} failed`;
		}

		try {
			const args = typeof argsJson === 'string' ? JSON.parse(argsJson) : argsJson;
			const { action, target } = formatter(args);

			// If no target name, use simplified format
			if (!target) {
				if (status === 'pending') {
					return `${action}...`;
				} else if (status === 'completed') {
					// Convert "Creating task" → "Task created"
					const noun = action.split(' ').slice(1).join(' '); // "Creating task" → "task"
					return `${noun.charAt(0).toUpperCase() + noun.slice(1)} created`;
				} else {
					return `Failed to ${action.toLowerCase()}`;
				}
			}

			// With target name, use detailed format
			if (status === 'pending') {
				return `${action}: "${target}"`;
			} else if (status === 'completed') {
				// Convert "Creating" → "Created", "Updating" → "Updated"
				const pastTense = action.replace(/ing$/, 'ed').replace(/ching$/, 'ched');
				return `${pastTense}: "${target}"`;
			} else {
				return `Failed to ${action.toLowerCase()}: "${target}"`;
			}
		} catch (e) {
			if (dev) {
				console.error('[AgentChat] Error parsing tool arguments:', e);
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
		metadata?: Record<string, any>
	) {
		const blockId = ensureThinkingBlock();
		const activity: ActivityEntry = {
			id: crypto.randomUUID(),
			content,
			timestamp: new Date(),
			activityType,
			metadata
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

	function finalizeThinkingBlock() {
		if (!currentThinkingBlockId) return;

		updateThinkingBlock(currentThinkingBlockId, (block) => ({
			...block,
			status: 'completed',
			content: 'Complete'
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
	function updatePlanStepStatus(stepNumber: number | undefined, status: string) {
		if (!stepNumber || !currentPlan || !currentThinkingBlockId) return;

		updateThinkingBlock(currentThinkingBlockId, (block) => {
			// Find the plan activity
			const updatedActivities = block.activities.map((activity) => {
				if (
					activity.activityType === 'plan_created' &&
					activity.metadata?.plan?.id === currentPlan?.id
				) {
					// Update the plan steps with new status
					const updatedPlan = {
						...activity.metadata.plan,
						steps: activity.metadata.plan.steps.map((step: any) =>
							step.stepNumber === stepNumber ? { ...step, status } : step
						)
					};

					return {
						...activity,
						metadata: {
							...activity.metadata,
							plan: updatedPlan,
							currentStep:
								status === 'executing' ? stepNumber : activity.metadata.currentStep
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

	function updateActivityStatus(toolCallId: string, status: 'completed' | 'failed') {
		if (!currentThinkingBlockId) return;

		let matchFound = false;

		updateThinkingBlock(currentThinkingBlockId, (block) => {
			const activityIndex = block.activities.findIndex(
				(activity) =>
					activity.toolCallId === toolCallId && activity.activityType === 'tool_call'
			);

			if (activityIndex === -1) {
				return block;
			}

			matchFound = true;
			const activity = block.activities[activityIndex];
			const toolName = activity.metadata?.toolName || 'unknown';
			const args = activity.metadata?.arguments || '';
			const newContent = formatToolMessage(toolName, args, status);

			const updatedActivity: ActivityEntry = {
				...activity,
				id: activity.id || crypto.randomUUID(),
				timestamp: activity.timestamp || new Date(),
				activityType: activity.activityType || 'tool_call',
				content: newContent,
				status,
				metadata: {
					...activity.metadata,
					status
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
	}

	function handleClose() {
		stopVoiceInput();
		if (currentStreamController) {
			currentStreamController.abort();
			currentStreamController = null;
		}
		cleanupVoiceInput();

		// Trigger chat session classification in the background (fire-and-forget)
		// Only classify if we have a session with messages
		if (currentSession?.id && currentSession.user_id && messages.length > 1) {
			// Don't await - let it run in background
			RailwayWorkerService.queueChatSessionClassification(
				currentSession.id,
				currentSession.user_id
			).catch((err) => {
				// Silently ignore errors - classification is a background task
				if (dev) console.warn('Chat classification queue failed:', err);
			});
		}

		if (onClose) onClose();
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			if (!isSendDisabled) {
				sendMessage();
			}
		}
	}

	// ✅ Svelte 5: Wrapper function for AgentComposer callback
	function handleSendMessage() {
		sendMessage();
	}

	async function sendMessage(
		contentOverride?: string,
		options: { senderType?: 'user' | 'agent_peer'; suppressInputClear?: boolean } = {}
	) {
		const { senderType = 'user', suppressInputClear = false } = options;
		const trimmed = (contentOverride ?? inputValue).trim();
		if (
			!trimmed ||
			isStreaming ||
			isVoiceRecording ||
			isVoiceInitializing ||
			isVoiceTranscribing
		)
			return;
		if (!selectedContextType) {
			error = 'Select a focus before starting the conversation.';
			return;
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
			created_at: now.toISOString()
		};

		// Convert existing messages to conversation history format (only user/assistant messages)
		const conversationHistory: Partial<ChatMessage>[] = messages
			.filter((msg) => msg.role === 'user' || msg.role === 'assistant')
			.map((msg) => ({
				id: msg.id,
				session_id: currentSession?.id || 'pending',
				role: msg.role as ChatRole,
				content: msg.content,
				created_at: msg.created_at || msg.timestamp.toISOString(),
				tool_calls: msg.tool_calls,
				tool_call_id: msg.tool_call_id
			}));

		messages = [...messages, userMessage];
		if (!suppressInputClear) {
			inputValue = '';
		}
		error = null;
		isStreaming = true;

		// NEW: Create thinking block for agent activity
		createThinkingBlock();

		currentActivity = 'Analyzing request...';
		agentState = 'thinking';
		agentStateDetails = 'BuildOS is processing your request...';
		updateThinkingBlockState('thinking', 'BuildOS is processing your request...');

		currentPlan = null;
		// NOTE: Do NOT reset lastTurnContext here - it should be preserved and sent with the next request
		// for conversation continuity. The server will generate fresh context after each turn.

		// Reset scroll flag so we always scroll to show new user message
		userHasScrolled = false;

		let streamController: AbortController | null = null;
		let receivedStreamEvent = false;

		try {
			if (currentStreamController) {
				currentStreamController.abort();
				currentStreamController = null;
			}
			streamController = new AbortController();
			currentStreamController = streamController;

			// Determine ontology entity type from context
			let ontologyEntityType: 'task' | 'plan' | 'goal' | 'document' | 'output' | undefined;
			if (selectedContextType === 'task' || selectedContextType === 'task_update') {
				ontologyEntityType = 'task';
			} else if (isProjectContext(selectedContextType)) {
				// For project contexts, don't set a specific entity type - let the backend determine
				ontologyEntityType = undefined;
			}
			// Additional mappings can be added as needed

			const response = await fetch('/api/agent/stream', {
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
					conversation_history: conversationHistory, // Pass conversation history for compression
					ontologyEntityType: ontologyEntityType, // Pass entity type for ontology loading
					projectFocus: resolvedProjectFocus,
					lastTurnContext: lastTurnContext // Pass last turn context for conversation continuity
				})
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const callbacks: StreamCallbacks = {
				onProgress: (data: any) => {
					receivedStreamEvent = true;
					handleSSEMessage(data as AgentSSEMessage);
				},
				onError: (err) => {
					console.error('SSE error:', err);
					error =
						typeof err === 'string' ? err : 'Connection error occurred while streaming';
					isStreaming = false;
					currentActivity = '';
					currentStreamController = null;
					agentState = null;
					agentStateDetails = null;
					finalizeThinkingBlock();
					finalizeAssistantMessage();
				},
				onComplete: () => {
					isStreaming = false;
					currentActivity = '';
					currentStreamController = null;
					agentState = null;
					agentStateDetails = null;
					if (!receivedStreamEvent && !error) {
						error = 'BuildOS did not return a response. Please try again.';
					}
					finalizeThinkingBlock();
					finalizeAssistantMessage();
				}
			};

			await SSEProcessor.processStream(response, callbacks, {
				timeout: 240000, // 4 minutes for complex agent conversations
				parseJSON: true,
				signal: streamController.signal
			});
		} catch (err) {
			currentStreamController = null;
			if ((err as DOMException)?.name === 'AbortError') {
				if (dev) {
					console.debug('[AgentChat] Stream aborted');
				}
				isStreaming = false;
				currentActivity = '';
				agentState = null;
				agentStateDetails = null;
				finalizeThinkingBlock(); // Ensure thinking block is closed on abort
				return;
			}

			console.error('Failed to send message:', err);
			error = 'Failed to send message. Please try again.';
			isStreaming = false;
			currentActivity = '';
			agentState = null;
			agentStateDetails = null;
			finalizeThinkingBlock(); // Ensure thinking block is closed on error

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
		switch (event.type) {
			case 'session':
				// Session hydration
				if (event.session) {
					currentSession = event.session;
					const sessionContextType =
						(event.session.context_type as ChatContextType) ?? 'global';
					const normalizedSessionContext =
						sessionContextType === 'general' ? 'global' : sessionContextType;
					if (!selectedContextType) {
						selectedContextType = normalizedSessionContext;
						selectedEntityId = event.session.entity_id ?? undefined;
						selectedContextLabel =
							CONTEXT_DESCRIPTORS[normalizedSessionContext]?.title ??
							selectedContextLabel;
						showContextSelection = false;
					}

					if (
						normalizedSessionContext === 'project' &&
						event.session.entity_id &&
						!projectFocus
					) {
						projectFocus = buildProjectWideFocus(
							event.session.entity_id,
							event.session.title ?? selectedContextLabel
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

			// case 'ontology_loaded':
			// 	// Ontology context was loaded
			// 	ontologyLoaded = true;
			// 	ontologySummary = event.summary || 'Ontology context loaded';
			// 	addActivityToThinkingBlock(
			// 		`Ontology context: ${ontologySummary}`,
			// 		'ontology_loaded',
			// 		{
			// 			summary: ontologySummary
			// 		}
			// 	);
			// 	break;

			case 'last_turn_context':
				// Store last turn context for next message
				lastTurnContext = event.context;
				if (dev) {
					console.debug('[AgentChat] Stored last turn context:', lastTurnContext);
				}
				break;

			case 'context_usage':
				contextUsage = event.usage ?? null;
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
				agentStateDetails = event.details ?? null;
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
					agentStateDetails = 'Waiting on your clarifications to continue...';
					updateThinkingBlockState(
						'waiting_on_user',
						'Waiting on your clarifications to continue...'
					);
				}
				break;
			}

			case 'executor_instructions':
				// Executor instructions generated
				addActivityToThinkingBlock('Executor instructions generated', 'general');
				break;

			case 'plan_created':
				// Plan created with steps - enrich metadata for visualization
				currentPlan = event.plan;
				currentActivity = `Executing plan with ${event.plan?.steps?.length || 0} steps...`;
				agentState = 'executing_plan';
				agentStateDetails = currentActivity;
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
				currentActivity = 'Waiting on your feedback about the plan...';
				agentState = 'waiting_on_user';
				agentStateDetails = summary;
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
				agentStateDetails = currentActivity;
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
					agentStateDetails = currentActivity;
					updateThinkingBlockState('executing_plan', currentActivity);
				} else {
					agentState = 'waiting_on_user';
					agentStateDetails = currentActivity;
					updateThinkingBlockState('waiting_on_user', currentActivity);
				}
				break;
			}

			case 'text':
				// Streaming text (could be from planner or executor)
				if (event.content) {
					addOrUpdateAssistantMessage(event.content);
				}
				break;

			case 'tool_call':
				// Tool being called - parse arguments for meaningful display
				const toolName = event.tool_call?.function?.name || 'unknown';
				const toolCallId = event.tool_call?.id;
				const args = event.tool_call?.function?.arguments || '';

				if (dev) {
					console.log('[AgentChat] Tool call:', {
						toolName,
						toolCallId,
						args: args.substring(0, 100) // Log first 100 chars of args
					});
				}

				// Format message with parsed arguments
				const displayMessage = formatToolMessage(toolName, args, 'pending');

				const activity: ActivityEntry = {
					id: crypto.randomUUID(),
					content: displayMessage,
					timestamp: new Date(),
					activityType: 'tool_call',
					status: 'pending',
					toolCallId,
					metadata: {
						toolName,
						toolCallId,
						arguments: args,
						status: 'pending',
						toolCall: event.tool_call
					}
				};

				const blockId = ensureThinkingBlock();
				updateThinkingBlock(blockId, (block) => ({
					...block,
					activities: [...block.activities, activity]
				}));
				break;

			case 'tool_result': {
				// Tool result received - update matching tool call activity
				const toolResult = event.result;
				const resultToolCallId = toolResult?.toolCallId;
				const success = toolResult?.success ?? true;
				const toolError = toolResult?.error;

				if (dev) {
					console.log('[AgentChat] Tool result:', {
						resultToolCallId,
						success,
						hasError: !!toolError
					});
				}

				if (resultToolCallId) {
					// Update the matching activity status
					updateActivityStatus(resultToolCallId, success ? 'completed' : 'failed');
				} else {
					// No matching tool call ID - log warning but don't add duplicate message
					if (dev) {
						console.warn(
							'[AgentChat] Tool result without matching tool_call_id:',
							event
						);
					}
				}
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
				updatePlanStepStatus(event.step?.stepNumber, 'completed');
				addActivityToThinkingBlock(
					`Step ${event.step?.stepNumber} complete`,
					'step_complete',
					{
						stepNumber: event.step?.stepNumber,
						result: event.step?.result,
						planId: currentPlan?.id
					}
				);
				break;
			case 'done':
				// All done - clear activity and re-enable input
				currentActivity = '';
				agentState = null;
				agentStateDetails = null;
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
					runAgentToAgentTurn();
				}
				break;

			case 'error':
				error = event.error || 'An error occurred';
				isStreaming = false;
				currentActivity = '';
				agentState = null;
				agentStateDetails = null;
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

	// ✅ Svelte 5: Properly reassign array for reactivity
	function addOrUpdateAssistantMessage(content: unknown) {
		const normalizedContent = normalizeMessageContent(content);

		if (currentAssistantMessageId) {
			// ✅ Update existing message - creates new array reference
			messages = messages.map((m) => {
				if (m.id === currentAssistantMessageId) {
					return { ...m, content: m.content + normalizedContent };
				}
				return m;
			});
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
			messages = [...messages, assistantMessage];
		}
	}

	function finalizeAssistantMessage() {
		currentAssistantMessageId = null;
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
				return "Tell me about the project you want to create. What are your goals, key milestones, and tasks you're thinking about?";

			case 'project':
				return `What would you like to do with ${name}? I can help you explore goals, update tasks, or answer questions about the project.`;

			case 'project_audit':
				return `Let's audit ${name}. I'll help you identify gaps, risks, and areas that need attention.`;

			case 'project_forecast':
				return `Let's explore timelines and scenarios for ${name}. What aspects would you like to forecast?`;

			case 'task':
			case 'task_update':
				return 'What would you like to know or update about this task?';

			case 'calendar':
				return 'What would you like to plan or review on your calendar?';

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
		stopVoiceInput();
		if (currentStreamController) {
			currentStreamController.abort();
			currentStreamController = null;
		}
		cleanupVoiceInput();
	});
</script>

<Modal
	{isOpen}
	onClose={handleClose}
	size="xl"
	variant="bottom-sheet"
	enableGestures={true}
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
				{agentStateLabel}
				{currentActivity}
				{contextUsage}
			/>
		</div>
	{/snippet}

	{#snippet children()}
		<!-- INKPRINT panel container with Frame texture -->
		<div
			class="relative z-10 flex h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-ink tx tx-frame tx-weak sm:h-[75vh] sm:min-h-[500px]"
		>
			<!-- Keep context selection mounted so Back returns to prior step -->
			<div
				class={`flex h-full min-h-0 flex-col ${showContextSelection ? '' : 'hidden'}`}
				aria-hidden={!showContextSelection}
			>
				<ContextSelectionScreen
					bind:this={contextSelectionRef}
					inModal
					on:select={handleContextSelect}
					onNavigationChange={handleContextSelectionNavChange}
				/>
			</div>

			<!-- Chat / wizard view - Same height constraint as selection -->
			<div class={`${showContextSelection ? 'hidden' : 'flex'} h-full min-h-0 flex-col`}>
				{#if showProjectActionSelector}
					<ProjectActionSelector
						projectId={selectedEntityId || ''}
						projectName={projectFocus?.projectName ?? selectedContextLabel ?? 'Project'}
						onSelectAction={(action) => handleProjectActionSelect(action)}
						onOpenFocusSelector={openFocusSelector}
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
								onKeyDownHandler={(e) => {
									if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
										e.preventDefault();
										handleBraindumpSubmit();
									}
								}}
								onSend={handleBraindumpSubmit}
							/>
						</div>
						<p class="mt-2 text-center text-xs text-muted-foreground">
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
							<p class="text-xs uppercase tracking-wide text-muted-foreground mb-2">
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
					/>
				{/if}

				{#if !showContextSelection && !showProjectActionSelector && isStreaming && currentActivity}
					<!-- INKPRINT activity indicator with Grain texture -->
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
					<div class="border-t border-border bg-muted p-2 tx tx-thread tx-weak sm:p-2.5">
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
									class="inline-flex items-center justify-center rounded-lg bg-accent px-3 py-1.5 text-[0.65rem] font-bold uppercase tracking-[0.15em] text-accent-foreground shadow-ink transition pressable disabled:cursor-not-allowed disabled:opacity-60"
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
									class="inline-flex items-center justify-center rounded-lg border border-border bg-card px-3 py-1.5 text-[0.65rem] font-bold uppercase tracking-[0.15em] text-foreground shadow-ink transition pressable hover:border-accent hover:bg-muted"
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
									class="w-16 rounded-lg border border-border bg-background px-1.5 py-0.5 text-[0.65rem] font-semibold text-foreground shadow-ink-inner focus:border-accent focus:outline-none focus:ring-ring"
									value={agentTurnBudget}
									disabled={agentLoopActive || agentMessageLoading || isStreaming}
									oninput={(e) =>
										updateAgentTurnBudget(
											Number((e.target as HTMLInputElement).value)
										)}
								/>
							</label>
							{#if agentTurnsRemaining <= 0}
								<!-- INKPRINT warning badge with Static texture -->
								<span
									class="rounded-lg bg-amber-100 px-1.5 py-0.5 text-[0.65rem] font-semibold text-amber-700 tx tx-static tx-weak dark:bg-amber-900/30 dark:text-amber-300"
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
					<div class="border-t border-border bg-card p-2 sm:p-2.5">
						<AgentComposer
							bind:voiceInputRef
							bind:inputValue
							bind:isVoiceRecording
							bind:isVoiceInitializing
							bind:isVoiceTranscribing
							bind:voiceErrorMessage
							bind:voiceRecordingDuration
							bind:voiceSupportsLiveTranscript
							{isStreaming}
							{isSendDisabled}
							{displayContextLabel}
							onKeyDownHandler={handleKeyDown}
							onSend={handleSendMessage}
						/>
					</div>
				{/if}
			</div>
		</div>
	{/snippet}
</Modal>

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
		border-radius: 4px;
	}

	:global(.agent-chat-scroll::-webkit-scrollbar-thumb) {
		background: hsl(var(--muted-foreground) / 0.3);
		border-radius: 4px;
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
</style>
