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
	import { X, Send, Loader } from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import CardFooter from '$lib/components/ui/CardFooter.svelte';
	import TextareaWithVoice from '$lib/components/ui/TextareaWithVoice.svelte';
	import ContextSelectionScreen from '../chat/ContextSelectionScreen.svelte';
	import ThinkingBlock from './ThinkingBlock.svelte';
	import ProjectFocusIndicator from './ProjectFocusIndicator.svelte';
	import ProjectFocusSelector from './ProjectFocusSelector.svelte';
	import { SSEProcessor, type StreamCallbacks } from '$lib/utils/sse-processor';
	import type {
		ChatSession,
		ChatContextType,
		ChatMessage,
		ChatRole,
		AgentSSEMessage,
		ContextUsageSnapshot
	} from '@buildos/shared-types';
	import { renderMarkdown, getProseClasses, hasMarkdownFormatting } from '$lib/utils/markdown';
	import {
		requestAgentToAgentMessage,
		type AgentToAgentMessageHistory
	} from '$lib/services/agentic-chat/agent-to-agent-service';
	// Add ontology integration imports
	import type { LastTurnContext, ProjectFocus } from '$lib/types/agent-chat-enhancement';
	import type TextareaWithVoiceComponent from '$lib/components/ui/TextareaWithVoice.svelte';

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

	const CONTEXT_DESCRIPTORS: Record<ChatContextType, { title: string; subtitle: string }> = {
		global: {
			title: 'Global conversation',
			subtitle: 'Work across projects, tasks, and the calendar without constraints.'
		},
		project: {
			title: 'Project workspace',
			subtitle: 'Answer questions, explore insights, or update a selected project.'
		},
		task: {
			title: 'Task focus',
			subtitle: 'Dig into an individual task and its related work.'
		},
		calendar: {
			title: 'Calendar planning',
			subtitle: 'Coordinate schedules, availability, and time blocks.'
		},
		general: {
			title: 'Global conversation',
			subtitle: 'Legacy mode - use global instead.'
		},
		project_create: {
			title: 'New project flow',
			subtitle: 'Guide creation of a structured project from a spark of an idea.'
		},
		project_audit: {
			title: 'Project audit',
			subtitle: 'Stress-test the project for gaps, risks, and clarity.'
		},
		project_forecast: {
			title: 'Project forecast',
			subtitle: 'Explore timelines, what-ifs, and scenario planning.'
		},
		task_update: {
			title: 'Task spotlight',
			subtitle: 'Quick tune-ups, triage, and clarifications for tasks.'
		},
		daily_brief_update: {
			title: 'Daily brief tuning',
			subtitle: 'Adjust what surfaces in your daily brief and notifications.'
		}
	};

	const CONTEXT_BADGE_CLASSES: Partial<Record<ChatContextType, string>> = {
		global: 'bg-blue-500/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300',
		project: 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
		project_create:
			'bg-purple-500/10 text-purple-600 dark:bg-purple-500/15 dark:text-purple-300',
		project_audit: 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
		project_forecast: 'bg-teal-500/10 text-teal-600 dark:bg-teal-500/15 dark:text-teal-300',
		task_update: 'bg-orange-500/10 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300',
		task: 'bg-orange-500/10 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300',
		daily_brief_update: 'bg-rose-500/10 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300',
		calendar: 'bg-sky-500/10 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300'
	};

	const defaultBadgeClass =
		'bg-slate-500/10 text-slate-700 dark:bg-slate-500/20 dark:text-slate-200';

	const contextDescriptor = $derived(
		selectedContextType ? CONTEXT_DESCRIPTORS[selectedContextType] : null
	);

	const contextBadgeClass = $derived(
		selectedContextType
			? (CONTEXT_BADGE_CLASSES[selectedContextType] ?? defaultBadgeClass)
			: defaultBadgeClass
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

	// Activity types for thinking block log entries
	type ActivityType =
		| 'tool_call' // Tool being invoked
		| 'tool_result' // Tool execution completed
		| 'plan_created' // Plan generation
		| 'plan_review' // Plan approval/rejection
		| 'state_change' // Agent state transitions
		| 'step_start' // Plan step starting
		| 'step_complete' // Plan step finished
		| 'executor_spawned' // Executor agent created
		| 'executor_result' // Executor completed
		| 'context_shift' // Context/focus changed
		| 'template_request' // Template creation request
		| 'template_status' // Template creation status
		| 'ontology_loaded' // Ontology context loaded
		| 'clarification' // Clarifying questions
		| 'general'; // Generic activity

	// Individual activity entry in thinking block
	interface ActivityEntry {
		id: string;
		content: string;
		timestamp: Date;
		activityType: ActivityType;
		status?: 'pending' | 'completed' | 'failed'; // For tracking tool call progress
		toolCallId?: string; // For matching tool calls to their results
		metadata?: Record<string, any>;
	}

	// Enhanced message type for UI with optional ChatMessage fields
	interface UIMessage {
		id: string;
		session_id?: string;
		user_id?: string;
		role?: ChatRole;
		content: string;
		created_at?: string;
		updated_at?: string;
		// UI-specific fields
		type:
			| 'user'
			| 'assistant'
			| 'activity' // DEPRECATED - legacy activity messages
			| 'thinking_block' // NEW - consolidated thinking/activity block
			| 'plan' // DEPRECATED - now integrated into thinking_block
			| 'step'
			| 'executor'
			| 'clarification'
			| 'agent_peer';
		data?: any;
		timestamp: Date;
		// Optional ChatMessage fields
		tool_calls?: any;
		tool_call_id?: string;
	}

	// Thinking block message containing agent activity log
	interface ThinkingBlockMessage extends UIMessage {
		type: 'thinking_block';
		activities: ActivityEntry[];
		status: 'active' | 'completed';
		agentState?: AgentLoopState;
		isCollapsed?: boolean;
	}

	function isThinkingBlockMessage(message: UIMessage): message is ThinkingBlockMessage {
		return message.type === 'thinking_block';
	}

	function findThinkingBlockById(
		id: string | null,
		sourceMessages: UIMessage[]
	): ThinkingBlockMessage | undefined {
		if (!id) return undefined;
		return sourceMessages.find(
			(message): message is ThinkingBlockMessage =>
				message.id === id && isThinkingBlockMessage(message)
		);
	}

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
	const contextUsagePercent = $derived.by(() => Math.min(contextUsage?.usagePercent ?? 0, 120));
	const contextUsageBarClass = $derived.by(() => {
		if (!contextUsage) return 'bg-slate-300 dark:bg-slate-700';
		if (contextUsage.status === 'over_budget') return 'bg-rose-500';
		if (contextUsage.status === 'near_limit') return 'bg-amber-500';
		return 'bg-emerald-500';
	});

	// Ontology integration state
	let lastTurnContext = $state<LastTurnContext | null>(null);
	let ontologyLoaded = $state(false);
	let ontologySummary = $state<string | null>(null);

	type AgentLoopState = 'thinking' | 'executing_plan' | 'waiting_on_user';
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

	/**
	 * Creates a new thinking block when user sends a message
	 */
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

	/**
	 * Adds an activity entry to the current thinking block
	 */
	function addActivityToThinkingBlock(
		content: string,
		activityType: ActivityType,
		metadata?: Record<string, any>
	) {
		if (!currentThinkingBlockId) {
			// Fallback: create thinking block if none exists
			createThinkingBlock();
		}

		const activity: ActivityEntry = {
			id: crypto.randomUUID(),
			content,
			timestamp: new Date(),
			activityType,
			metadata
		};

		messages = messages.map((msg) => {
			if (msg.id === currentThinkingBlockId && msg.type === 'thinking_block') {
				const block = msg as ThinkingBlockMessage;
				return {
					...block,
					activities: [...block.activities, activity]
				};
			}
			return msg;
		});
	}

	/**
	 * Updates the agent state displayed in the thinking block header
	 */
	function updateThinkingBlockState(state: AgentLoopState, details?: string) {
		if (!currentThinkingBlockId) return;

		messages = messages.map((msg) => {
			if (msg.id === currentThinkingBlockId && msg.type === 'thinking_block') {
				return {
					...msg,
					agentState: state,
					content: details || AGENT_STATE_MESSAGES[state]
				};
			}
			return msg;
		});
	}

	/**
	 * Marks the thinking block as completed
	 */
	function finalizeThinkingBlock() {
		if (!currentThinkingBlockId) return;

		messages = messages.map((msg) => {
			if (msg.id === currentThinkingBlockId && msg.type === 'thinking_block') {
				return {
					...msg,
					status: 'completed',
					content: 'Complete'
				};
			}
			return msg;
		});

		currentThinkingBlockId = null;
	}

	/**
	 * Toggles collapse state of a thinking block
	 */
	function toggleThinkingBlockCollapse(blockId: string) {
		messages = messages.map((msg) => {
			if (msg.id === blockId && msg.type === 'thinking_block') {
				const block = msg as ThinkingBlockMessage;
				return {
					...block,
					isCollapsed: !block.isCollapsed
				};
			}
			return msg;
		});
	}

	/**
	 * Updates the status of an activity by tool call ID
	 * Also updates the content to show completion (Creating → Created)
	 */
	function updateActivityStatus(toolCallId: string, status: 'completed' | 'failed') {
		if (!currentThinkingBlockId) return;

		let matchFound = false;

		messages = messages.map((msg) => {
			if (msg.id === currentThinkingBlockId && msg.type === 'thinking_block') {
				const block = msg as ThinkingBlockMessage;
				return {
					...block,
					activities: block.activities.map((activity) => {
						if (
							activity.toolCallId === toolCallId &&
							activity.activityType === 'tool_call'
						) {
							matchFound = true;
							// Update content from "Creating task: X" to "Created task: X"
							const toolName = activity.metadata?.toolName || 'unknown';
							const args = activity.metadata?.arguments || '';
							const newContent = formatToolMessage(toolName, args, status);

							return {
								...activity,
								content: newContent,
								status,
								metadata: {
									...activity.metadata,
									status
								}
							};
						}
						return activity;
					})
				};
			}
			return msg;
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

		try {
			if (currentStreamController) {
				currentStreamController.abort();
				currentStreamController = null;
			}
			const streamController = new AbortController();
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
					handleSSEMessage(data as AgentSSEMessage);
				},
				onError: (err) => {
					console.error('SSE error:', err);
					error =
						typeof err === 'string' ? err : 'Connection error occurred while streaming';
					isStreaming = false;
					currentActivity = '';
					currentStreamController = null;
				},
				onComplete: () => {
					isStreaming = false;
					currentActivity = '';
					currentStreamController = null;
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

				messages = messages.map((msg) => {
					if (msg.id === currentThinkingBlockId && msg.type === 'thinking_block') {
						const block = msg as ThinkingBlockMessage;
						return {
							...block,
							activities: [...block.activities, activity]
						};
					}
					return msg;
				});
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

	function addOrUpdateAssistantMessage(content: unknown) {
		const normalizedContent = normalizeMessageContent(content);

		if (currentAssistantMessageId) {
			// Update existing message
			messages = messages.map((m) => {
				if (m.id === currentAssistantMessageId) {
					return { ...m, content: m.content + normalizedContent };
				}
				return m;
			});
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
			messages = [...messages, assistantMessage];
		}
	}

	function finalizeAssistantMessage() {
		currentAssistantMessageId = null;
	}

	function formatTime(date: Date): string {
		return date.toLocaleTimeString('en-US', {
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function formatTokensEstimate(value?: number | null): string {
		if (value === undefined || value === null || Number.isNaN(value)) return '0';
		if (value >= 10000) return `${Math.round(value / 1000)}k`;
		if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
		return Math.round(value).toLocaleString();
	}

	function formatCompressionTimestamp(timestamp?: string | null): string {
		if (!timestamp) return 'Not yet compressed';
		const parsed = new Date(timestamp);
		if (Number.isNaN(parsed.getTime())) return 'Unknown';
		const diffMs = Date.now() - parsed.getTime();
		const minutes = Math.floor(diffMs / 60000);
		if (minutes < 1) return 'Just now';
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.floor(minutes / 60);
		if (hours < 48) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		return `${days}d ago`;
	}

	// Check if content should be rendered as markdown
	function shouldRenderAsMarkdown(content: string): boolean {
		return hasMarkdownFormatting(content);
	}

	// Get prose classes for markdown rendering
	const proseClasses = getProseClasses('sm');
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
	<div
		slot="header"
		class="border-b border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900 sm:px-6 sm:py-5"
	>
		<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
			<div class="min-w-0 flex-1 space-y-2">
				<p
					class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
				>
					BuildOS chat
				</p>
				<div class="flex flex-wrap items-center gap-2">
					<h2 class="text-lg font-semibold text-slate-900 dark:text-white sm:text-xl">
						BuildOS Assistant
					</h2>
					{#if selectedContextType}
						<span
							class={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${contextBadgeClass}`}
						>
							{displayContextLabel}
						</span>
					{/if}
				</div>
				{#if displayContextSubtitle}
					<p class="text-sm text-slate-500 dark:text-slate-400">
						{displayContextSubtitle}
					</p>
				{/if}
				{#if resolvedProjectFocus}
					<ProjectFocusIndicator
						focus={resolvedProjectFocus}
						onChangeFocus={openFocusSelector}
						onClearFocus={handleFocusClear}
					/>
				{/if}
				{#if ontologyLoaded || agentStateLabel || currentActivity}
					<div
						class="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 sm:gap-3"
					>
						{#if ontologyLoaded}
							<span
								class="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide dark:bg-slate-800 dark:text-slate-200"
							>
								Ontology ready
							</span>
						{/if}
						{#if agentStateLabel}
							<span
								class="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide dark:bg-slate-800 dark:text-slate-200"
							>
								{agentStateLabel}
							</span>
						{/if}
						{#if currentActivity}
							<span class="flex items-center gap-2">
								<span
									class="inline-flex h-2 w-2 animate-pulse rounded-full bg-emerald-500"
								></span>
								<span class="truncate">{currentActivity}</span>
							</span>
						{/if}
					</div>
				{/if}
				{#if contextUsage}
					<div
						class="mt-2 rounded-2xl border border-slate-200/70 bg-white/70 p-3 text-xs text-slate-600 shadow-sm dark:border-slate-700/60 dark:bg-slate-800/70 dark:text-slate-200"
					>
						<div class="flex flex-wrap items-center justify-between gap-2">
							<div class="flex items-center gap-2">
								<span
									class="font-semibold uppercase tracking-wide text-[10px] text-slate-500 dark:text-slate-400"
								>
									Context usage (est.)
								</span>
								<span class="text-[11px] text-slate-600 dark:text-slate-300">
									{formatTokensEstimate(contextUsage.estimatedTokens)} /
									{formatTokensEstimate(contextUsage.tokenBudget)} tokens
								</span>
							</div>
							<span
								class={`text-[11px] font-semibold ${
									contextUsage.status === 'over_budget'
										? 'text-rose-600 dark:text-rose-400'
										: contextUsage.status === 'near_limit'
											? 'text-amber-600 dark:text-amber-400'
											: 'text-emerald-600 dark:text-emerald-400'
								}`}
							>
								{contextUsage.status === 'over_budget'
									? 'Over budget'
									: contextUsage.status === 'near_limit'
										? 'Near limit'
										: 'Healthy'}
							</span>
						</div>
						<div
							class="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
						>
							<div
								class={`h-full rounded-full transition-all duration-300 ${contextUsageBarClass}`}
								style={`width: ${contextUsagePercent}%;`}
							></div>
						</div>
						<div
							class="mt-2 flex flex-wrap justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400"
						>
							<span>
								≈{formatTokensEstimate(contextUsage.tokensRemaining)} tokens left in
								budget
							</span>
							<span>
								Last compressed: {formatCompressionTimestamp(
									contextUsage.lastCompressedAt
								)}
							</span>
						</div>
					</div>
				{/if}
			</div>
			<div class="flex shrink-0 items-center gap-2">
				{#if selectedContextType}
					<Button
						variant="ghost"
						size="sm"
						class="whitespace-nowrap rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
						disabled={isStreaming}
						onclick={changeContext}
					>
						{isStreaming ? 'Running...' : 'Change focus'}
					</Button>
				{/if}
				<Button
					variant="ghost"
					size="sm"
					icon={X}
					class="rounded-full px-2 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
					aria-label="Close chat"
					onclick={handleClose}
				/>
			</div>
		</div>
	</div>

	<div
		class="relative z-10 flex h-full flex-col overflow-hidden rounded-3xl border border-slate-200/60 bg-white/95 shadow-[0_28px_70px_-40px_rgba(15,23,42,0.5)] backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-900/90"
	>
		{#if agentToAgentMode && agentToAgentStep !== 'chat'}
			<div
				class="flex h-full min-h-0 flex-col gap-4 overflow-hidden bg-slate-50/70 p-4 sm:p-5 dark:bg-slate-900/40"
			>
				<div class="flex items-start justify-between gap-4">
					<div class="min-w-0 flex-1">
						<p
							class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
						>
							Automation loop
						</p>
						<h3 class="text-lg font-semibold text-slate-900 dark:text-white">
							{#if agentToAgentStep === 'agent'}
								Choose a BuildOS helper
							{:else if agentToAgentStep === 'project'}
								Choose a project
							{:else}
								Set the automation goal
							{/if}
						</h3>
						<p class="mt-1 text-sm text-slate-600 dark:text-slate-400">
							BuildOS will coordinate with Actionable Insight to keep work moving.
						</p>
					</div>
					<button
						type="button"
						class="text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-white shrink-0"
						onclick={() => {
							agentToAgentMode = false;
							agentToAgentStep = null;
							changeContext();
						}}
					>
						Exit
					</button>
				</div>
				{#if agentToAgentStep === 'agent'}
					<Card variant="elevated" class="flex-1 flex flex-col justify-center">
						<CardBody padding="md">
							<div class="space-y-3">
								<h4 class="text-base font-semibold text-slate-900 dark:text-white">
									Actionable Insight
								</h4>
								<p class="max-w-2xl text-sm text-slate-600 dark:text-slate-400">
									BuildOS will tap Actionable Insight to craft concise, actionable
									prompts and push the work forward in chat.
								</p>
								<div class="flex flex-wrap items-center gap-3">
									<Button
										variant="primary"
										size="sm"
										onclick={() => selectAgentForBridge(RESEARCH_AGENT_ID)}
									>
										Use Actionable Insight
									</Button>
									<span
										class="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"
									>
										Single option available
									</span>
								</div>
							</div>
						</CardBody>
					</Card>
				{:else if agentToAgentStep === 'project'}
					<div class="flex flex-1 flex-col gap-3 overflow-hidden">
						<div class="flex items-center justify-between">
							<h4 class="text-base font-semibold text-slate-900 dark:text-white">
								Select the project to work in
							</h4>
							<Button variant="ghost" size="sm" onclick={backToAgentSelection}>
								Back
							</Button>
						</div>
						<div class="flex-1 min-h-0 overflow-y-auto">
							{#if agentProjectsLoading}
								<Card variant="elevated">
									<CardBody padding="md">
										<p class="text-sm text-slate-600 dark:text-slate-300">
											Loading projects...
										</p>
									</CardBody>
								</Card>
							{:else if agentProjectsError}
								<Card
									variant="elevated"
									class="border-rose-200 dark:border-rose-900/40 bg-rose-50/50 dark:bg-rose-950/20"
								>
									<CardBody padding="sm">
										<p class="text-sm text-rose-700 dark:text-rose-300">
											{agentProjectsError}
										</p>
									</CardBody>
								</Card>
							{:else}
								<div class="grid gap-3 sm:grid-cols-2">
									{#each agentProjects as project}
										<Card variant="interactive" class="group h-full">
											<button
												type="button"
												class="w-full text-left focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 rounded-xl"
												onclick={() => selectAgentProject(project)}
												aria-label="Select {project.name} project"
											>
												<CardBody padding="sm">
													<div class="space-y-1.5">
														<div
															class="flex items-center justify-between gap-3"
														>
															<h5
																class="text-sm font-semibold text-slate-900 dark:text-white"
															>
																{project.name}
															</h5>
															<span
																class="text-xs font-semibold uppercase tracking-wide text-slate-400 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors"
															>
																Select
															</span>
														</div>
														<p
															class="text-xs text-slate-600 dark:text-slate-400 line-clamp-2"
														>
															{project.description ||
																'No description provided.'}
														</p>
													</div>
												</CardBody>
											</button>
										</Card>
									{/each}
								</div>
								{#if agentProjects.length === 0 && !agentProjectsLoading}
									<Card variant="outline" class="border-dashed">
										<CardBody padding="sm">
											<p
												class="text-sm text-center text-slate-500 dark:text-slate-400"
											>
												No projects found. Create one first.
											</p>
										</CardBody>
									</Card>
								{/if}
							{/if}
						</div>
					</div>
				{:else}
					<div class="flex flex-1 flex-col gap-3 overflow-hidden">
						<div class="flex items-center justify-between">
							<h4 class="text-base font-semibold text-slate-900 dark:text-white">
								What should BuildOS handle automatically?
							</h4>
							<Button variant="ghost" size="sm" onclick={backToAgentProjectSelection}>
								Back
							</Button>
						</div>
						<div class="flex-1 min-h-0 overflow-y-auto">
							<Card variant="elevated">
								<CardBody padding="md">
									<div class="space-y-3">
										<div
											class="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
										>
											<span
												class="rounded-full bg-indigo-100 px-2.5 py-1 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200"
											>
												Helper: {selectedAgentLabel}
											</span>
											{#if selectedContextLabel}
												<span
													class="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200"
												>
													Project: {selectedContextLabel}
												</span>
											{/if}
										</div>
										<div class="space-y-2">
											<label
												for="agent-goal-input"
												class="block text-sm font-medium text-slate-800 dark:text-slate-200"
											>
												Goal for BuildOS automation
											</label>
											<textarea
												id="agent-goal-input"
												class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-purple-600 dark:focus:ring-purple-600"
												rows="3"
												bind:value={agentGoal}
												placeholder="Describe what BuildOS should try to achieve..."
											></textarea>
											<div
												class="flex flex-col sm:flex-row sm:items-center gap-2"
											>
												<Button
													variant="primary"
													size="sm"
													onclick={startAgentToAgentChat}
													disabled={agentGoal.trim().length === 0}
												>
													Start automation
												</Button>
												<span
													class="text-xs text-slate-500 dark:text-slate-400"
												>
													BuildOS will coordinate turns automatically.
												</span>
											</div>
										</div>
									</div>
								</CardBody>
							</Card>
						</div>
					</div>
				{/if}
			</div>
		{:else if !selectedContextType}
			<div class="flex h-full min-h-0 flex-col overflow-hidden">
				<ContextSelectionScreen inModal on:select={handleContextSelect} />
			</div>
		{:else}
			<div
				bind:this={messagesContainer}
				onscroll={handleScroll}
				class="agent-chat-scroll flex-1 min-h-0 space-y-3 overflow-y-auto bg-slate-50/70 px-4 py-4 dark:bg-slate-900/40 sm:px-5 sm:py-5"
			>
				{#if messages.length === 0}
					<Card variant="outline" class="border-dashed">
						<CardBody padding="sm">
							<div class="space-y-3">
								<p class="font-semibold text-slate-900 dark:text-white text-sm">
									You're set to chat.
								</p>
								<p
									class="text-sm leading-relaxed text-slate-600 dark:text-slate-300"
								>
									Ask BuildOS to plan, explain, or take the next step for
									{displayContextLabel.toLowerCase()}.
								</p>
								<ul class="space-y-1.5 text-sm text-slate-500 dark:text-slate-400">
									<li class="flex items-start gap-2">
										<span class="mt-0.5 text-slate-400 dark:text-slate-500"
											>•</span
										>
										<span>Summarize where this stands</span>
									</li>
									<li class="flex items-start gap-2">
										<span class="mt-0.5 text-slate-400 dark:text-slate-500"
											>•</span
										>
										<span>Draft the next update</span>
									</li>
									<li class="flex items-start gap-2">
										<span class="mt-0.5 text-slate-400 dark:text-slate-500"
											>•</span
										>
										<span>What should we do next?</span>
									</li>
								</ul>
							</div>
						</CardBody>
					</Card>
				{:else}
					{#each messages as message (message.id)}
						{#if message.type === 'user'}
							<div class="flex justify-end">
								<div
									class="max-w-[85%] rounded-2xl border border-blue-200/50 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm dark:border-blue-500/40 dark:bg-slate-800/70 dark:text-slate-100 sm:max-w-[80%]"
								>
									<div class="whitespace-pre-wrap break-words leading-relaxed">
										{message.content}
									</div>
									<div class="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
										{formatTime(message.timestamp)}
									</div>
								</div>
							</div>
						{:else if message.type === 'assistant'}
							<div class="flex gap-2 sm:gap-3">
								<div
									class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-semibold uppercase text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 sm:h-9 sm:w-9"
								>
									OS
								</div>
								<div
									class="agent-resp-div max-w-[85%] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100 sm:max-w-[85%]"
								>
									{#if shouldRenderAsMarkdown(message.content)}
										<div class={proseClasses}>
											{@html renderMarkdown(message.content)}
										</div>
									{:else}
										<div class="whitespace-pre-wrap break-words">
											{message.content}
										</div>
									{/if}
									<div class="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
										{formatTime(message.timestamp)}
									</div>
								</div>
							</div>
						{:else if message.type === 'agent_peer'}
							<div class="flex gap-2 sm:gap-3">
								<div
									class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-indigo-200 bg-white text-[11px] font-semibold uppercase text-indigo-600 dark:border-indigo-500/50 dark:bg-slate-800 dark:text-indigo-300 sm:h-9 sm:w-9"
								>
									AI↔
								</div>
								<div
									class="max-w-[85%] rounded-2xl border border-indigo-200 bg-indigo-50/70 px-4 py-3 text-sm leading-relaxed text-slate-900 shadow-sm dark:border-indigo-500/40 dark:bg-indigo-500/5 dark:text-slate-100 sm:max-w-[85%]"
								>
									{#if shouldRenderAsMarkdown(message.content)}
										<div class={proseClasses}>
											{@html renderMarkdown(message.content)}
										</div>
									{:else}
										<div class="whitespace-pre-wrap break-words">
											{message.content}
										</div>
									{/if}
									<div
										class="mt-1.5 text-xs text-indigo-700/70 dark:text-indigo-200/80"
									>
										{formatTime(message.timestamp)}
									</div>
								</div>
							</div>
						{:else if message.type === 'thinking_block'}
							<ThinkingBlock
								block={message as ThinkingBlockMessage}
								onToggleCollapse={toggleThinkingBlockCollapse}
							/>
						{:else if message.type === 'clarification'}
							<div class="flex gap-2 sm:gap-3">
								<div
									class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-blue-200 bg-white text-xs font-semibold uppercase text-blue-600 dark:border-blue-500/40 dark:bg-slate-800 dark:text-blue-300 sm:h-9 sm:w-9"
								>
									AI
								</div>
								<div
									class="max-w-[90%] rounded-2xl border border-blue-200 bg-blue-50/80 px-4 py-4 text-sm leading-relaxed text-slate-900 shadow-sm dark:border-blue-500/40 dark:bg-blue-500/5 dark:text-slate-100 sm:max-w-[85%]"
								>
									<p class="text-sm font-semibold text-slate-900 dark:text-white">
										{message.content}
									</p>

									{#if message.data?.questions?.length}
										<ol
											class="mt-3 space-y-2.5 text-[15px] text-slate-700 dark:text-slate-200"
										>
											{#each message.data.questions as question, i}
												<li
													class="flex gap-2.5 font-medium leading-snug sm:gap-3"
												>
													<span
														class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-blue-600 shadow dark:bg-slate-900 dark:text-blue-300"
													>
														{i + 1}
													</span>
													<span class="min-w-0 flex-1">{question}</span>
												</li>
											{/each}
										</ol>
									{/if}

									<p class="mt-3 text-xs text-slate-600 dark:text-slate-400">
										Share the answers in your next message so I can keep going.
									</p>
									<div class="mt-2 text-xs text-slate-500 dark:text-slate-400">
										{formatTime(message.timestamp)}
									</div>
								</div>
							</div>
						{:else if message.type === 'plan'}
							{#if dev}
								<div
									class="rounded-md bg-amber-100 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300"
								>
									⚠️ Dev Warning: Legacy plan message (should be in thinking
									block)
								</div>
							{/if}
							<div class="flex gap-2 text-xs text-slate-500 dark:text-slate-400">
								<div
									class="w-14 shrink-0 pt-[2px] text-[10px] font-mono text-slate-400 dark:text-slate-500"
								>
									{formatTime(message.timestamp)}
								</div>
								<div
									class="max-w-[70%] rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-[12px] leading-snug text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100"
								>
									<p
										class="text-[11px] font-semibold uppercase tracking-wide text-slate-500"
									>
										Plan
									</p>
									<p class="mt-1 text-slate-800 dark:text-slate-50">
										{message.content}
									</p>
									{#if message.data?.steps}
										<ol
											class="mt-2 space-y-0.5 text-[12px] text-slate-600 dark:text-slate-300"
										>
											{#each message.data.steps as step}
												<li class="flex gap-2 leading-snug">
													<span
														class="w-4 text-right font-semibold text-slate-400"
													>
														{step.stepNumber}.
													</span>
													<span class="flex-1">
														{step.description}
													</span>
												</li>
											{/each}
										</ol>
									{/if}
								</div>
							</div>
						{:else if message.type === 'activity'}
							{#if dev}
								<div
									class="rounded-md bg-amber-100 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300"
								>
									⚠️ Dev Warning: Legacy activity message (should be in thinking
									block)
								</div>
							{/if}
							<div class="flex gap-2 text-[11px] text-slate-500 dark:text-slate-400">
								<div
									class="w-14 shrink-0 pt-[2px] font-mono text-slate-400 dark:text-slate-500"
								>
									{formatTime(message.timestamp)}
								</div>
								<div
									class="max-w-[60%] rounded-md border border-slate-200/70 bg-slate-50/70 px-3 py-1.5 text-[12px] font-medium italic leading-snug text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300"
								>
									<p class="leading-relaxed">{message.content}</p>
								</div>
							</div>
						{:else}
							<div class="flex gap-2 text-[11px] text-slate-500 dark:text-slate-400">
								<div
									class="w-14 shrink-0 pt-[2px] font-mono text-slate-400 dark:text-slate-500"
								>
									{formatTime(message.timestamp)}
								</div>
								<div
									class="max-w-[60%] rounded-md border border-slate-200/70 bg-slate-50/70 px-3 py-1.5 text-[12px] font-medium italic leading-snug text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300"
								>
									<p class="leading-relaxed">{message.content}</p>
								</div>
							</div>
						{/if}
					{/each}
				{/if}
			</div>

			{#if isStreaming && currentActivity}
				<div
					class="border-t border-slate-200 bg-slate-50 p-4 sm:p-6 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300"
				>
					<span class="inline-flex items-center gap-2">
						<span
							class="inline-flex h-2 w-2 animate-pulse rounded-full bg-emerald-500"
							aria-hidden="true"
						></span>
						<span role="status" aria-live="polite">{currentActivity}</span>
					</span>
				</div>
			{/if}

			{#if error}
				<div
					class="border-t border-rose-100 bg-rose-50 p-4 sm:p-6 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300"
					role="alert"
					aria-live="assertive"
				>
					{error}
				</div>
			{/if}

			{#if agentToAgentMode}
				<div
					class="border-t border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-slate-900"
				>
					<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div class="space-y-1">
							<p class="text-sm font-semibold text-slate-900 dark:text-white">
								Automation loop is {agentLoopActive ? 'active' : 'paused'}.
							</p>
							<p class="text-xs text-slate-600 dark:text-slate-400">
								Helper: {selectedAgentLabel} • Project: {selectedContextLabel ??
									'Select a project'} • Goal: {agentGoal || 'Add a goal'}
							</p>
							<p class="text-xs text-slate-600 dark:text-slate-400">
								Turns remaining: {agentTurnsRemaining} / {agentTurnBudget}
							</p>
						</div>
						<div class="flex flex-wrap items-center gap-2">
							<button
								type="button"
								class="inline-flex items-center justify-center rounded-full bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
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
								class="inline-flex items-center justify-center rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
								onclick={stopAgentLoop}
							>
								Stop
							</button>
						</div>
					</div>
					<div
						class="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-400"
					>
						<label class="flex items-center gap-2">
							<span class="font-semibold">Turn limit</span>
							<input
								type="number"
								min="1"
								max="50"
								class="w-20 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-slate-500 dark:focus:ring-slate-700"
								value={agentTurnBudget}
								disabled={agentLoopActive || agentMessageLoading || isStreaming}
								oninput={(e) =>
									updateAgentTurnBudget(
										Number((e.target as HTMLInputElement).value)
									)}
							/>
						</label>
						{#if agentTurnsRemaining <= 0}
							<span
								class="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
							>
								Turn limit reached — adjust and resume to continue.
							</span>
						{/if}
					</div>
					{#if agentMessageLoading}
						<p class="mt-2 text-xs text-slate-500 dark:text-slate-400">
							Fetching the next update...
						</p>
					{/if}
				</div>
			{:else}
				<div
					class="border-t border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-slate-900"
				>
					<form
						onsubmit={(e) => {
							e.preventDefault();
							sendMessage();
						}}
						class="space-y-2"
					>
						<TextareaWithVoice
							bind:this={voiceInputRef}
							bind:value={inputValue}
							bind:isRecording={isVoiceRecording}
							bind:isInitializing={isVoiceInitializing}
							bind:isTranscribing={isVoiceTranscribing}
							bind:voiceError={voiceErrorMessage}
							bind:recordingDuration={voiceRecordingDuration}
							bind:canUseLiveTranscript={voiceSupportsLiveTranscript}
							class="w-full"
							containerClass="rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-700/80 dark:bg-slate-900"
							textareaClass="border-none bg-transparent px-4 py-3 text-[15px] leading-relaxed text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0 dark:text-slate-100 dark:placeholder:text-slate-500"
							placeholder={`Share the next thing about ${displayContextLabel.toLowerCase()}...`}
							autoResize
							rows={1}
							maxRows={6}
							disabled={isStreaming}
							voiceBlocked={isStreaming}
							voiceBlockedLabel="Wait for BuildOS..."
							idleHint="Enter to send · Shift + Enter for new line"
							voiceButtonLabel="Record voice note"
							listeningLabel="Listening"
							transcribingLabel="Transcribing..."
							preparingLabel="Preparing microphone…"
							liveTranscriptLabel="Live transcript"
							showStatusRow={true}
							showLiveTranscriptPreview={true}
							onkeydown={handleKeyDown}
						>
							{#snippet actions()}
								<button
									type="submit"
									class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-900/80 bg-slate-900 text-white shadow-sm transition-all duration-200 hover:bg-slate-800 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-100/80 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 dark:focus:ring-offset-slate-900"
									aria-label="Send message"
									disabled={isSendDisabled}
								>
									{#if isStreaming}
										<Loader class="h-5 w-5 animate-spin" />
									{:else}
										<Send class="h-5 w-5" />
									{/if}
								</button>
							{/snippet}
						</TextareaWithVoice>

						<!-- Additional status indicators -->
						{#if voiceErrorMessage || isStreaming}
							<div
								class="flex flex-wrap items-center justify-between gap-2 px-1 text-xs font-medium"
							>
								<div class="flex flex-wrap items-center gap-2">
									{#if voiceErrorMessage}
										<span
											role="alert"
											class="flex items-center gap-2 rounded-md bg-gradient-to-r from-rose-50 to-red-50 px-2.5 py-1 text-[11px] font-medium text-rose-700 dark:from-rose-900/30 dark:to-red-900/20 dark:text-rose-300"
										>
											{voiceErrorMessage}
										</span>
									{/if}

									{#if isStreaming}
										<div
											class="flex items-center gap-2 rounded-md border border-emerald-200/60 bg-gradient-to-r from-emerald-50 to-green-50 px-2.5 py-1 text-emerald-700 dark:border-emerald-500/40 dark:from-emerald-900/30 dark:to-green-900/20 dark:text-emerald-300"
										>
											<div
												class="h-2 w-2 animate-pulse rounded-full bg-emerald-600 dark:bg-emerald-400"
											></div>
											<span class="text-xs font-semibold">Working...</span>
										</div>
									{/if}
								</div>
							</div>
						{/if}
					</form>
				</div>
			{/if}
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
