<!-- apps/web/src/lib/components/agent/AgentChatModal.svelte -->
<!--
  AgentChatModal Component

  BuildOS chat interface showing planner-executor conversations.
  Displays BuildOS activity, plan steps, and iterative conversations.

  Design: High-end Apple-inspired UI with responsive layout, dark mode,
  and high information density following BuildOS Style Guide.
-->

<script lang="ts">
	import { tick, onDestroy } from 'svelte';
	import { dev } from '$app/environment';
	import Modal from '$lib/components/ui/Modal.svelte';
	import ContextSelectionScreen from '../chat/ContextSelectionScreen.svelte';
	import ProjectFocusSelector from './ProjectFocusSelector.svelte';
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

	interface Props {
		isOpen?: boolean;
		contextType?: ChatContextType;
		entityId?: string;
		onClose?: () => void;
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
		onClose
	}: Props = $props();

	// Context selection state
	let selectedContextType = $state<ChatContextType | null>(null);
	let selectedEntityId = $state<string | undefined>(undefined);
	let selectedContextLabel = $state<string | null>(null);
	let projectFocus = $state<ProjectFocus | null>(null);
	let showFocusSelector = $state(false);

	const contextDescriptor = $derived(
		selectedContextType ? CONTEXT_DESCRIPTORS[selectedContextType] : null
	);

	const contextBadgeClass = $derived(
		selectedContextType
			? (CONTEXT_BADGE_CLASSES[selectedContextType] ?? DEFAULT_CONTEXT_BADGE_CLASS)
			: DEFAULT_CONTEXT_BADGE_CLASS
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
		if (selectedContextType === 'project' && selectedEntityId) {
			return buildProjectWideFocus(selectedEntityId, selectedContextLabel);
		}
		return null;
	});

	const resolvedProjectFocus = $derived.by<ProjectFocus | null>(() => {
		if (selectedContextType !== 'project') {
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
		agentLoopActive = false;
		agentMessageLoading = false;
		agentTurnBudget = 5;
		agentTurnsRemaining = 5;

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

	function handleContextSelect(event: CustomEvent<ContextSelectionDetail>) {
		resetConversation();

		const detail = event.detail;
		if (detail.contextType === 'agent_to_agent') {
			agentToAgentMode = true;
			agentToAgentStep = 'agent';
			selectedAgentId = null;
			selectedContextType = null;
			selectedContextLabel = detail.label ?? 'BuildOS automation';
			projectFocus = null;
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

		if (detail.contextType === 'project' && detail.entityId) {
			projectFocus = buildProjectWideFocus(detail.entityId, detail.label);
		} else {
			projectFocus = null;
			showFocusSelector = false;
		}
	}

	function changeContext() {
		if (isStreaming) return;
		stopVoiceInput();
		resetConversation({ preserveContext: false });
	}

	function openFocusSelector() {
		if (selectedContextType !== 'project' || !selectedEntityId) return;
		showFocusSelector = true;
	}

	function handleFocusSelection(newFocus: ProjectFocus) {
		projectFocus = newFocus;
		logFocusActivity('Focus updated', newFocus);
	}

	function handleFocusClear() {
		if (!defaultProjectFocus) return;
		projectFocus = defaultProjectFocus;
		logFocusActivity('Focus reset', defaultProjectFocus);
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

	// Helper: Check if user is scrolled to bottom (within threshold)
	function isScrolledToBottom(container: HTMLElement, threshold = 100): boolean {
		const scrollPosition = container.scrollTop + container.clientHeight;
		const scrollHeight = container.scrollHeight;
		return scrollHeight - scrollPosition < threshold;
	}

	// Helper: Smooth scroll to bottom without jarring shifts
	function scrollToBottomIfNeeded() {
		if (!messagesContainer) return;

		// Only scroll if user hasn't manually scrolled up
		if (!userHasScrolled || isScrolledToBottom(messagesContainer)) {
			tick().then(() => {
				if (messagesContainer) {
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

	// Sticky scroll behavior: Only auto-scroll on new messages, not on scroll position changes
	// This effect tracks messages.length, so it only triggers when new messages arrive
	$effect(() => {
		if (messages.length > 0) {
			scrollToBottomIfNeeded();
		}
	});

	$effect(() => {
		if (agentToAgentMode && agentToAgentStep === 'project') {
			loadAgentProjects();
		}
	});

	$effect(() => {
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
		lastTurnContext = null;

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
			} else if (
				selectedContextType === 'project' ||
				selectedContextType === 'project_audit' ||
				selectedContextType === 'project_forecast'
			) {
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
					projectFocus: resolvedProjectFocus
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
				return;
			}

			console.error('Failed to send message:', err);
			error = 'Failed to send message. Please try again.';
			isStreaming = false;
			currentActivity = '';

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
				// Plan created with steps
				currentPlan = event.plan;
				currentActivity = `Executing plan with ${event.plan?.steps?.length || 0} steps...`;
				agentState = 'executing_plan';
				agentStateDetails = currentActivity;
				updateThinkingBlockState('executing_plan', currentActivity);
				addActivityToThinkingBlock(
					`Plan created with ${event.plan?.steps?.length || 0} steps`,
					'plan_created',
					{
						plan: event.plan,
						stepCount: event.plan?.steps?.length || 0
					}
				);
				break;
			case 'plan_ready_for_review': {
				currentPlan = event.plan;
				const summary =
					event.summary ||
					'Plan drafted and waiting for your approval. Reply with any changes or say "run it".';
				addActivityToThinkingBlock(
					`Plan ready for review: ${event.plan?.steps?.length || 0} steps`,
					'plan_created',
					{
						plan: event.plan,
						stepCount: event.plan?.steps?.length || 0,
						summary
					}
				);
				addActivityToThinkingBlock(summary, 'general');
				currentActivity = 'Waiting on your feedback about the plan...';
				agentState = 'waiting_on_user';
				agentStateDetails = summary;
				updateThinkingBlockState('waiting_on_user', summary);
				break;
			}

			case 'step_start':
				// Starting a plan step
				currentActivity = `Step ${event.step?.stepNumber}: ${event.step?.description}`;
				addActivityToThinkingBlock(`Starting: ${event.step?.description}`, 'step_start', {
					stepNumber: event.step?.stepNumber,
					description: event.step?.description
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
			case 'template_creation_request': {
				const request = event.request;
				const realmLabel = request?.realm_suggestion || 'new realm';
				addActivityToThinkingBlock(
					`Escalating template creation (${realmLabel})...`,
					'template_request',
					{
						request
					}
				);
				break;
			}
			case 'template_creation_status':
				addActivityToThinkingBlock(
					`Template creation status: ${event.status.replace(/_/g, ' ')}${
						event.message ? ` · ${event.message}` : ''
					}`,
					'template_status',
					{
						status: event.status,
						message: event.message
					}
				);
				break;
			case 'template_created': {
				const template = event.template;
				addActivityToThinkingBlock(
					`Template ready: ${template?.name || 'Untitled'} (${template?.type_key})`,
					'template_status',
					{
						template
					}
				);
				break;
			}
			case 'template_creation_failed':
				addActivityToThinkingBlock(
					`Template creation failed: ${event.error || 'Unknown error'}`,
					'template_status',
					{
						error: event.error
					}
				);
				error = event.error || 'Template creation failed. Please adjust the request.';
				break;

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

					if (normalizedContext === 'project' && shift.entity_id) {
						projectFocus = buildProjectWideFocus(
							shift.entity_id,
							shift.entity_name ?? selectedContextLabel
						);
					} else {
						projectFocus = null;
						showFocusSelector = false;
					}

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
				// Executor finished
				addActivityToThinkingBlock(
					event.result?.success ? 'Executor completed successfully' : 'Executor failed',
					'executor_result',
					{
						result: event.result
					}
				);
				break;

			case 'step_complete':
				// Step completed
				addActivityToThinkingBlock(
					`Step ${event.step?.stepNumber} complete`,
					'step_complete',
					{
						stepNumber: event.step?.stepNumber
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
	showCloseButton={false}
	ariaLabel="BuildOS chat assistant dialog"
>
	<!-- ✅ Ultra-tight header: px-2 py-2 (8px) → px-3 py-2.5 on desktop -->
	<div
		slot="header"
		class="border-b border-slate-200 bg-white px-2 py-2 dark:border-slate-800 dark:bg-slate-900 sm:px-3 sm:py-2.5"
	>
		<AgentChatHeader
			{selectedContextType}
			{displayContextLabel}
			{displayContextSubtitle}
			{contextBadgeClass}
			{isStreaming}
			onChangeContext={changeContext}
			onClose={handleClose}
			{resolvedProjectFocus}
			onChangeFocus={openFocusSelector}
			onClearFocus={handleFocusClear}
			{ontologyLoaded}
			{agentStateLabel}
			{currentActivity}
			{contextUsage}
		/>
	</div>

	<div
		class="relative z-10 flex h-full flex-col overflow-hidden rounded-3xl border border-slate-200/60 bg-white/95 shadow-[0_28px_70px_-40px_rgba(15,23,42,0.5)] backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-900/90"
	>
		{#if agentToAgentMode && agentToAgentStep !== 'chat'}
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
		{:else if !selectedContextType}
			<div class="flex h-full min-h-0 flex-col overflow-hidden">
				<ContextSelectionScreen inModal on:select={handleContextSelect} />
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
		{#if isStreaming && currentActivity}
			<!-- ✅ Compact activity indicator: p-2, h-1.5 w-1.5 dot, text-[11px] -->
			<div
				class="border-t border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300 sm:p-2.5"
			>
				<span class="inline-flex items-center gap-1">
					<span
						class="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500"
						aria-hidden="true"
					></span>
					<span role="status" aria-live="polite">{currentActivity}</span>
				</span>
			</div>
		{/if}

		{#if error}
			<!-- ✅ Compact error message: p-2, text-xs -->
			<div
				class="border-t border-rose-100 bg-rose-50 p-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300 sm:p-2.5"
				role="alert"
				aria-live="assertive"
			>
				{error}
			</div>
		{/if}

		{#if agentToAgentMode}
			<!-- ✅ Compact automation footer: p-2 sm:p-2.5 -->
			<div
				class="border-t border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900 sm:p-2.5"
			>
				<div
					class="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2"
				>
					<div class="space-y-0.5">
						<!-- ✅ Compact text: text-xs -->
						<p class="text-xs font-semibold text-slate-900 dark:text-white">
							Automation loop is {agentLoopActive ? 'active' : 'paused'}.
						</p>
						<p class="text-[11px] text-slate-600 dark:text-slate-400">
							Helper: {selectedAgentLabel} • Project: {selectedContextLabel ??
								'Select a project'} • Goal: {agentGoal || 'Add a goal'}
						</p>
						<p class="text-[11px] text-slate-600 dark:text-slate-400">
							Turns remaining: {agentTurnsRemaining} / {agentTurnBudget}
						</p>
					</div>
					<!-- ✅ Compact buttons: gap-1, px-2 py-1, text-[11px] -->
					<div class="flex flex-wrap items-center gap-1">
						<button
							type="button"
							class="inline-flex items-center justify-center rounded-full bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
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
							class="inline-flex items-center justify-center rounded-full border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
							onclick={stopAgentLoop}
						>
							Stop
						</button>
					</div>
				</div>
				<!-- ✅ Compact controls: mt-1.5, gap-2, text-[11px] -->
				<div
					class="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400"
				>
					<label class="flex items-center gap-1.5">
						<span class="font-semibold">Turn limit</span>
						<input
							type="number"
							min="1"
							max="50"
							class="w-16 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-slate-500 dark:focus:ring-slate-700"
							value={agentTurnBudget}
							disabled={agentLoopActive || agentMessageLoading || isStreaming}
							oninput={(e) =>
								updateAgentTurnBudget(Number((e.target as HTMLInputElement).value))}
						/>
					</label>
					{#if agentTurnsRemaining <= 0}
						<!-- ✅ Compact warning badge: px-1.5 py-0.5, text-[10px] -->
						<span
							class="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
						>
							Turn limit reached — adjust and resume.
						</span>
					{/if}
				</div>
				{#if agentMessageLoading}
					<!-- ✅ Compact loading message: mt-1, text-[11px] -->
					<p class="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
						Fetching the next update...
					</p>
				{/if}
			</div>
		{:else}
			<!-- ✅ Compact composer footer: p-2 sm:p-2.5 -->
			<div
				class="border-t border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900 sm:p-2.5"
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
					{isStreaming}
					{isSendDisabled}
					{displayContextLabel}
					onKeyDownHandler={handleKeyDown}
					onSend={handleSendMessage}
				/>
			</div>
		{/if}
	</div>
</Modal>

{#if selectedContextType === 'project' && selectedEntityId && resolvedProjectFocus}
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
	/* Scrollbar Styling */
	.agent-chat-scroll {
		scrollbar-gutter: stable;
	}

	:global(.agent-chat-scroll::-webkit-scrollbar) {
		width: 8px;
	}

	:global(.agent-chat-scroll::-webkit-scrollbar-track) {
		background: rgb(248 250 252);
	}

	:global(.agent-chat-scroll::-webkit-scrollbar-thumb) {
		background: rgb(203 213 225);
		border-radius: 4px;
	}

	:global(.dark .agent-chat-scroll::-webkit-scrollbar-track) {
		background: rgb(15 23 42);
	}

	:global(.dark .agent-chat-scroll::-webkit-scrollbar-thumb) {
		background: rgb(71 85 105);
	}

	:global(.agent-chat-scroll::-webkit-scrollbar-thumb:hover) {
		background: rgb(148 163 184);
	}

	:global(.dark .agent-chat-scroll::-webkit-scrollbar-thumb:hover) {
		background: rgb(100 116 139);
	}
</style>
