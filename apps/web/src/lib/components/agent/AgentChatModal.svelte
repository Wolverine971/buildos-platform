<!-- apps/web/src/lib/components/agent/AgentChatModal.svelte -->
<!--
  AgentChatModal Component

  Multi-agent chat interface showing planner-executor conversations.
  Displays agent activity, plan steps, and iterative conversations.

  Design: High-end Apple-inspired UI with responsive layout, dark mode,
  and high information density following BuildOS Style Guide.
-->

<script lang="ts">
	import { tick, onMount, onDestroy } from 'svelte';
	import { dev } from '$app/environment';
	import { X, Send, Loader, Mic, MicOff, LoaderCircle } from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import ContextSelectionScreen from '../chat/ContextSelectionScreen.svelte';
	import { SSEProcessor, type StreamCallbacks } from '$lib/utils/sse-processor';
	import type { ChatSession, ChatContextType } from '@buildos/shared-types';
	import { renderMarkdown, getProseClasses, hasMarkdownFormatting } from '$lib/utils/markdown';
	// Add ontology integration imports
	import type { LastTurnContext } from '$lib/types/agent-chat-enhancement';
	import {
		voiceRecordingService,
		type TranscriptionService
	} from '$lib/services/voiceRecording.service';
	import { liveTranscript } from '$lib/utils/voice';

	interface Props {
		isOpen?: boolean;
		contextType?: ChatContextType;
		entityId?: string;
		onClose?: () => void;
	}

	interface ContextSelectionDetail {
		contextType: ChatContextType;
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

	// Conversation state
	let messages = $state<AgentMessage[]>([]);
	let currentSession = $state<ChatSession | null>(null);
	let isStreaming = $state(false);
	let currentStreamController: AbortController | null = null;
	let inputValue = $state('');
	let error = $state<string | null>(null);
	let currentPlan = $state<any>(null);
	let currentActivity = $state<string>('');
	let userHasScrolled = $state(false);
	let currentAssistantMessageId = $state<string | null>(null);
	let messagesContainer = $state<HTMLElement | undefined>(undefined);

	// Ontology integration state
	let lastTurnContext = $state<LastTurnContext | null>(null);
	let currentStrategy = $state<string | null>(null);
	let strategyConfidence = $state<number>(0);
	let ontologyLoaded = $state(false);
	let ontologySummary = $state<string | null>(null);

	interface AgentMessage {
		id: string;
		type: 'user' | 'assistant' | 'activity' | 'plan' | 'step' | 'executor' | 'clarification';
		content: string;
		data?: any;
		timestamp: Date;
	}

	const agentTranscriptionService: TranscriptionService = {
		async transcribeAudio(audioFile: File) {
			const formData = new FormData();
			formData.append('audio', audioFile);

			const response = await fetch('/api/transcribe', {
				method: 'POST',
				body: formData
			});

			if (!response.ok) {
				let errorMessage = `Transcription failed: ${response.status}`;
				try {
					const errorPayload = await response.json();
					if (errorPayload?.error) {
						errorMessage = errorPayload.error;
					}
				} catch {
					// Ignore JSON parse errors and use default message
				}
				throw new Error(errorMessage);
			}

			const result = await response.json();
			if (result?.success && result?.data?.transcript) {
				return { transcript: result.data.transcript };
			}

			if (result?.transcript) {
				return { transcript: result.transcript };
			}

			throw new Error('No transcript returned from transcription service');
		}
	};

	// Voice recording state
	let isVoiceSupported = $state(false);
	let isCurrentlyRecording = $state(false);
	let isInitializingRecording = $state(false);
	let isTranscribing = $state(false);
	let voiceError = $state('');
	let microphonePermissionGranted = $state(false);
	let canUseLiveTranscript = $state(false);
	let recordingDuration = $state(0);
	let hasAttemptedVoice = $state(false);
	let liveTranscriptPreview = $state('');

	const isLiveTranscribing = $derived(
		isCurrentlyRecording && liveTranscriptPreview.trim().length > 0
	);

	const isSendDisabled = $derived(
		!selectedContextType ||
			!inputValue.trim() ||
			isStreaming ||
			isCurrentlyRecording ||
			isInitializingRecording ||
			isTranscribing
	);

	const voiceButtonState = $derived.by(() => {
		if (!isVoiceSupported) {
			return {
				icon: MicOff,
				label: 'Voice capture unavailable',
				disabled: true,
				isLoading: false,
				variant: 'muted' as const
			};
		}

		if (isCurrentlyRecording) {
			return {
				icon: MicOff,
				label: 'Stop recording',
				disabled: false,
				isLoading: false,
				variant: 'recording' as const
			};
		}

		if (isInitializingRecording) {
			return {
				icon: LoaderCircle,
				label: 'Preparing microphone...',
				disabled: true,
				isLoading: true,
				variant: 'loading' as const
			};
		}

		if (isTranscribing) {
			return {
				icon: LoaderCircle,
				label: 'Transcribing...',
				disabled: true,
				isLoading: true,
				variant: 'loading' as const
			};
		}

		if (!microphonePermissionGranted && (hasAttemptedVoice || voiceError)) {
			return {
				icon: Mic,
				label: 'Enable microphone',
				disabled: false,
				isLoading: false,
				variant: 'prompt' as const
			};
		}

		if (isStreaming) {
			return {
				icon: Mic,
				label: 'Wait for agents...',
				disabled: true,
				isLoading: false,
				variant: 'muted' as const
			};
		}

		return {
			icon: Mic,
			label: 'Record voice note',
			disabled: false,
			isLoading: false,
			variant: 'ready' as const
		};
	});

	const voiceButtonClasses = $derived.by(() => {
		switch (voiceButtonState.variant) {
			case 'recording':
				return 'border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200';
			case 'loading':
				return 'border border-slate-200 bg-white text-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300';
			case 'prompt':
				return 'border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:border-blue-500/50 dark:bg-blue-500/10 dark:text-blue-200';
			case 'muted':
				return 'border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500';
			default:
				return 'border border-transparent bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200';
		}
	});

	function formatDuration(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	onMount(() => {
		isVoiceSupported = voiceRecordingService.isVoiceSupported();
		canUseLiveTranscript = voiceRecordingService.isLiveTranscriptSupported();

		voiceRecordingService.initialize(
			{
				onTextUpdate: (text: string) => {
					inputValue = text;
					voiceError = '';
				},
				onError: (error: string) => {
					voiceError = error;
					isCurrentlyRecording = false;
					isInitializingRecording = false;
				},
				onPhaseChange: (phase: 'idle' | 'transcribing') => {
					isTranscribing = phase === 'transcribing';
				},
				onPermissionGranted: () => {
					microphonePermissionGranted = true;
					voiceError = '';
				},
				onCapabilityUpdate: (update: { canUseLiveTranscript: boolean }) => {
					canUseLiveTranscript = update.canUseLiveTranscript;
				}
			},
			agentTranscriptionService
		);

		const durationStore = voiceRecordingService.getRecordingDuration();
		const unsubscribeDuration = durationStore.subscribe((value) => {
			recordingDuration = value;
		});

		const unsubscribeTranscript = liveTranscript.subscribe((value) => {
			liveTranscriptPreview = value;
		});

		return () => {
			unsubscribeDuration();
			unsubscribeTranscript();
			voiceRecordingService.cleanup();
			isCurrentlyRecording = false;
			isInitializingRecording = false;
			isTranscribing = false;
			liveTranscriptPreview = '';
		};
	});

	async function startVoiceRecording() {
		if (
			!isVoiceSupported ||
			isStreaming ||
			isInitializingRecording ||
			isCurrentlyRecording ||
			isTranscribing
		) {
			return;
		}

		hasAttemptedVoice = true;
		voiceError = '';
		liveTranscriptPreview = '';
		isInitializingRecording = true;

		try {
			await voiceRecordingService.startRecording(inputValue);
			isInitializingRecording = false;
			isCurrentlyRecording = true;
			microphonePermissionGranted = true;
		} catch (error) {
			console.error('Failed to start voice recording:', error);
			const message =
				error instanceof Error
					? error.message
					: 'Unable to access microphone. Please check permissions.';
			voiceError = message;
			microphonePermissionGranted = false;
			isInitializingRecording = false;
			isCurrentlyRecording = false;
		}
	}

	async function stopVoiceRecording() {
		if (!isCurrentlyRecording && !isInitializingRecording) {
			return;
		}

		try {
			await voiceRecordingService.stopRecording(inputValue);
		} catch (error) {
			console.error('Failed to stop voice recording:', error);
			const message =
				error instanceof Error ? error.message : 'Failed to stop recording. Try again.';
			voiceError = message;
		} finally {
			liveTranscriptPreview = '';
			isCurrentlyRecording = false;
			isInitializingRecording = false;
		}
	}

	async function handleVoiceToggle() {
		if (!isVoiceSupported) return;

		if (isCurrentlyRecording || isInitializingRecording) {
			await stopVoiceRecording();
		} else {
			await startVoiceRecording();
		}
	}

	function resetConversation(options: { preserveContext?: boolean } = {}) {
		const { preserveContext = true } = options;

		messages = [];
		currentSession = null;
		currentPlan = null;
		currentActivity = '';
		inputValue = '';
		error = null;
		userHasScrolled = false;
		currentAssistantMessageId = null;
		isStreaming = false;
		// Reset ontology state
		lastTurnContext = null;
		currentStrategy = null;
		strategyConfidence = 0;
		ontologyLoaded = false;
		ontologySummary = null;
		voiceError = '';
		hasAttemptedVoice = false;

		if (!preserveContext) {
			selectedContextType = null;
			selectedEntityId = undefined;
			selectedContextLabel = null;
		}
	}

	function handleContextSelect(event: CustomEvent<ContextSelectionDetail>) {
		resetConversation();

		const detail = event.detail;
		selectedContextType = detail.contextType;
		selectedEntityId = detail.entityId;
		selectedContextLabel =
			detail.label ?? CONTEXT_DESCRIPTORS[detail.contextType]?.title ?? null;
	}

	function changeContext() {
		if (isStreaming) return;
		if (isCurrentlyRecording || isInitializingRecording) {
			stopVoiceRecording();
		}
		resetConversation({ preserveContext: false });
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

	// Sticky scroll behavior: only scroll if user is at bottom
	$effect(() => {
		if (messages.length > 0) {
			scrollToBottomIfNeeded();
		}
	});

	function handleClose() {
		if (isCurrentlyRecording || isInitializingRecording) {
			stopVoiceRecording();
		}
		if (currentStreamController) {
			currentStreamController.abort();
			currentStreamController = null;
		}
		voiceRecordingService.cleanup();
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

	async function sendMessage() {
		const trimmed = inputValue.trim();
		if (
			!trimmed ||
			isStreaming ||
			isCurrentlyRecording ||
			isInitializingRecording ||
			isTranscribing
		)
			return;
		if (!selectedContextType) {
			error = 'Select a focus before starting the conversation.';
			return;
		}

		const now = new Date();

		// Add user message
		const userMessage: AgentMessage = {
			id: crypto.randomUUID(),
			type: 'user',
			content: trimmed,
			timestamp: now
		};

		// Convert existing messages to conversation history format (only user/assistant messages)
		const conversationHistory = messages
			.filter((msg) => msg.type === 'user' || msg.type === 'assistant')
			.map((msg) => ({
				id: msg.id,
				chat_session_id: currentSession?.id || 'pending',
				role: msg.type === 'user' ? 'user' : 'assistant',
				content: msg.content,
				created_at: msg.timestamp.toISOString()
			}));

		messages = [...messages, userMessage];
		inputValue = '';
		liveTranscriptPreview = '';
		error = null;
		isStreaming = true;
		currentActivity = 'Analyzing request...';
		currentPlan = null;

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
			}
			// Could add more mappings here for other entity types

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
					lastTurnContext: lastTurnContext, // Pass last turn context for continuity
					ontologyEntityType: ontologyEntityType // Pass entity type for ontology loading
				})
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const callbacks: StreamCallbacks = {
				onProgress: (data: any) => {
					handleSSEMessage(data);
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
				timeout: 120000, // 2 minutes for agent conversations
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

	function handleSSEMessage(data: any) {
		switch (data.type) {
			case 'session':
				// Session hydration
				if (data.session) {
					currentSession = data.session;
					const sessionContextType =
						(data.session.context_type as ChatContextType) ?? 'global';
					const normalizedSessionContext =
						sessionContextType === 'general' ? 'global' : sessionContextType;
					if (!selectedContextType) {
						selectedContextType = normalizedSessionContext;
						selectedEntityId = data.session.entity_id ?? undefined;
						selectedContextLabel =
							CONTEXT_DESCRIPTORS[normalizedSessionContext]?.title ??
							selectedContextLabel;
					}
				}
				break;

			case 'ontology_loaded':
				// Ontology context was loaded
				ontologyLoaded = true;
				ontologySummary = data.summary || 'Ontology context loaded';
				addActivityMessage(`Ontology context: ${ontologySummary}`);
				break;

			case 'last_turn_context':
				// Store last turn context for next message
				lastTurnContext = data.context;
				if (dev) {
					console.debug('[AgentChat] Stored last turn context:', lastTurnContext);
				}
				break;

			case 'strategy_selected':
				// Strategy was selected by planner
				currentStrategy = data.strategy;
				strategyConfidence = data.confidence || 0;
				const strategyName = data.strategy?.replace(/_/g, ' ') || 'unknown';
				const confidencePercent = Math.round((data.confidence || 0) * 100);
				addActivityMessage(
					`Strategy selected: ${strategyName} (${confidencePercent}% confidence)`
				);
				break;

			case 'clarifying_questions': {
				addClarifyingQuestionsMessage(data.questions);
				const questionCount = Array.isArray(data.questions)
					? data.questions.filter(
							(question: unknown) => typeof question === 'string' && question.trim()
						).length
					: 0;
				if (questionCount > 0) {
					addActivityMessage(`Clarifying questions requested (${questionCount})`);
					currentActivity = 'Waiting on your clarifications to continue...';
				}
				break;
			}

			case 'executor_instructions':
				// Executor instructions generated
				addActivityMessage('Executor instructions generated');
				break;

			case 'analysis':
				// Planner is analyzing the request
				currentActivity = 'Planner analyzing request...';
				debugger;
				addActivityMessage(
					`Strategy: ${data.analysis?.primary_strategy || 'unknown'} - ${data.analysis?.reasoning || ''}`
				);
				break;

			case 'plan_created':
				// Plan created with steps
				currentPlan = data.plan;
				currentActivity = `Executing plan with ${data.plan?.steps?.length || 0} steps...`;
				addPlanMessage(data.plan);
				break;

			case 'step_start':
				// Starting a plan step
				currentActivity = `Step ${data.step?.stepNumber}: ${data.step?.description}`;
				addActivityMessage(`Starting: ${data.step?.description}`);
				break;

			case 'executor_spawned':
				// Executor agent spawned
				currentActivity = `Executor working on task...`;
				addActivityMessage(`Executor started for: ${data.task?.description}`);
				break;

			case 'text':
				// Streaming text (could be from planner or executor)
				if (data.content) {
					addOrUpdateAssistantMessage(data.content);
				}
				break;

			case 'tool_call':
				// Tool being called
				const toolName = data.tool_call?.function?.name || 'unknown';
				addActivityMessage(`Using tool: ${toolName}`);
				break;

			case 'tool_result':
				// Tool result received
				addActivityMessage('Tool execution completed');
				break;

			case 'context_shift': {
				const shift = data.context_shift;
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
					addActivityMessage(activityMessage);
				}
				break;
			}

			case 'executor_result':
				// Executor finished
				addActivityMessage(
					data.result?.success ? 'Executor completed successfully' : 'Executor failed'
				);
				break;

			case 'step_complete':
				// Step completed
				addActivityMessage(`Step ${data.step?.stepNumber} complete`);
				break;
			case 'done':
				// All done - clear activity and re-enable input
				currentActivity = '';
				finalizeAssistantMessage();
				// Note: isStreaming will be set to false by onComplete callback
				// But we can also set it here for immediate UI response
				isStreaming = false;
				break;

			case 'error':
				error = data.error || 'An error occurred';
				isStreaming = false;
				currentActivity = '';
				break;
		}
	}

	function addActivityMessage(content: string) {
		const activityMessage: AgentMessage = {
			id: crypto.randomUUID(),
			type: 'activity',
			content,
			timestamp: new Date()
		};
		messages = [...messages, activityMessage];
	}

	function addPlanMessage(plan: any) {
		const planMessage: AgentMessage = {
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

		const clarificationMessage: AgentMessage = {
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
			const assistantMessage: AgentMessage = {
				id: currentAssistantMessageId,
				type: 'assistant',
				content: normalizedContent,
				timestamp: new Date()
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

	// Check if content should be rendered as markdown
	function shouldRenderAsMarkdown(content: string): boolean {
		return hasMarkdownFormatting(content);
	}

	// Get prose classes for markdown rendering
	const proseClasses = getProseClasses('sm');
	onDestroy(() => {
		if (isCurrentlyRecording || isInitializingRecording) {
			stopVoiceRecording().catch((err) =>
				console.error('[AgentChat] Failed to stop recording during cleanup', err)
			);
		}
		if (currentStreamController) {
			currentStreamController.abort();
			currentStreamController = null;
		}
		voiceRecordingService.cleanup();
	});
</script>

<Modal
	{isOpen}
	onClose={handleClose}
	size="xl"
	showCloseButton={false}
	ariaLabel="Multi-agent chat assistant dialog"
>
	<div
		slot="header"
		class="border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900"
	>
		<div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
			<div class="space-y-2">
				<p
					class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
				>
					Agent chat
				</p>
				<div class="flex flex-wrap items-center gap-2">
					<h2 class="text-lg font-semibold text-slate-900 dark:text-white">
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
				{#if ontologyLoaded || currentStrategy || currentActivity}
					<div
						class="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400"
					>
						{#if ontologyLoaded}
							<span
								class="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide dark:bg-slate-800 dark:text-slate-200"
							>
								Ontology ready
							</span>
						{/if}
						{#if currentStrategy}
							<span
								class="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide dark:bg-slate-800 dark:text-slate-200"
							>
								Strategy · {currentStrategy.replace(/_/g, ' ')}
							</span>
						{/if}
						{#if currentActivity}
							<span class="flex items-center gap-2">
								<span
									class="inline-flex h-2 w-2 animate-pulse rounded-full bg-emerald-500"
								></span>
								{currentActivity}
							</span>
						{/if}
					</div>
				{/if}
			</div>
			<div class="flex items-center gap-2">
				{#if selectedContextType}
					<Button
						variant="ghost"
						size="sm"
						class="rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
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
					class="rounded-full px-2 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
					aria-label="Close chat"
					onclick={handleClose}
				/>
			</div>
		</div>
	</div>

	<div
		class="relative z-10 flex h-[min(82vh,820px)] flex-col overflow-hidden rounded-3xl border border-slate-200/60 bg-white/95 shadow-[0_28px_70px_-40px_rgba(15,23,42,0.5)] backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-900/90"
	>
		{#if !selectedContextType}
			<div class="flex h-full flex-col overflow-hidden">
				<ContextSelectionScreen inModal on:select={handleContextSelect} />
			</div>
		{:else}
			<div
				bind:this={messagesContainer}
				onscroll={handleScroll}
				class="agent-chat-scroll flex-1 min-h-0 space-y-4 overflow-y-auto bg-slate-50/70 px-4 py-6 dark:bg-slate-900/40 sm:px-6"
			>
				{#if messages.length === 0}
					<div
						class="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-6 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
					>
						<p class="font-semibold text-slate-900 dark:text-white">
							You're set to chat.
						</p>
						<p class="mt-2">
							Ask the agent to plan, explain, or take the next step for
							{displayContextLabel.toLowerCase()}.
						</p>
						<ul class="mt-4 space-y-1 text-slate-500 dark:text-slate-400">
							<li>- Summarize where this stands</li>
							<li>- Draft the next update</li>
							<li>- What should we do next?</li>
						</ul>
					</div>
				{:else}
					{#each messages as message (message.id)}
						{#if message.type === 'user'}
							<div class="flex justify-end">
								<div
									class="max-w-[80%] rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white shadow-sm dark:bg-slate-100 dark:text-slate-900"
								>
									<div class="whitespace-pre-wrap break-words leading-relaxed">
										{message.content}
									</div>
									<div class="mt-1 text-xs text-white/70 dark:text-slate-500">
										{formatTime(message.timestamp)}
									</div>
								</div>
							</div>
						{:else if message.type === 'assistant'}
							<div class="flex gap-3">
								<div
									class="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-semibold uppercase text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
								>
									AI
								</div>
								<div
									class="max-w-[85%] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
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
									<div class="mt-1 text-xs text-slate-500 dark:text-slate-400">
										{formatTime(message.timestamp)}
									</div>
								</div>
							</div>
						{:else if message.type === 'clarification'}
							<div class="flex gap-3">
								<div
									class="flex h-9 w-9 items-center justify-center rounded-full border border-blue-200 bg-white text-xs font-semibold uppercase text-blue-600 dark:border-blue-500/40 dark:bg-slate-800 dark:text-blue-300"
								>
									AI
								</div>
								<div
									class="max-w-[85%] rounded-2xl border border-blue-200 bg-blue-50/80 px-4 py-4 text-sm leading-relaxed text-slate-900 shadow-sm dark:border-blue-500/40 dark:bg-blue-500/5 dark:text-slate-100"
								>
									<p class="text-sm font-semibold text-slate-900 dark:text-white">
										{message.content}
									</p>

									{#if message.data?.questions?.length}
										<ol
											class="mt-3 space-y-2 text-[15px] text-slate-700 dark:text-slate-200"
										>
											{#each message.data.questions as question, i}
												<li class="flex gap-3 font-medium leading-snug">
													<span
														class="flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-semibold text-blue-600 shadow dark:bg-slate-900 dark:text-blue-300"
													>
														{i + 1}
													</span>
													<span class="flex-1">{question}</span>
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
					class="border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300 sm:px-6"
				>
					<span class="inline-flex items-center gap-2">
						<span class="inline-flex h-2 w-2 animate-pulse rounded-full bg-emerald-500"
						></span>
						{currentActivity}
					</span>
				</div>
			{/if}

			{#if error}
				<div
					class="border-t border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300 sm:px-6"
				>
					{error}
				</div>
			{/if}

			<div
				class="border-t border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900 sm:px-6"
			>
				<form
					onsubmit={(e) => {
						e.preventDefault();
						sendMessage();
					}}
					class="space-y-3"
				>
					<div
						class="relative rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
					>
						<Textarea
							bind:value={inputValue}
							class="border-none bg-transparent px-4 py-3 pr-32 text-[15px] leading-relaxed text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0 dark:text-slate-100 dark:placeholder:text-slate-500"
							placeholder={`Share the next thing about ${displayContextLabel.toLowerCase()}...`}
							autoResize
							rows={1}
							maxRows={6}
							disabled={isStreaming}
							onkeydown={handleKeyDown}
						/>

						<div class="absolute bottom-2 right-2 flex items-center gap-2">
							<button
								type="button"
								class={`flex h-10 w-10 items-center justify-center rounded-full transition ${voiceButtonClasses}`}
								onclick={handleVoiceToggle}
								aria-label={voiceButtonState.label}
								title={voiceButtonState.label}
								aria-pressed={isCurrentlyRecording}
								disabled={voiceButtonState.disabled}
							>
								{#if voiceButtonState.isLoading}
									<LoaderCircle class="h-5 w-5 animate-spin" />
								{:else}
									{@const VoiceIcon = voiceButtonState.icon}
									<VoiceIcon class="h-5 w-5" />
								{/if}
							</button>

							<button
								type="submit"
								class="flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
								aria-label="Send message"
								disabled={isSendDisabled}
							>
								{#if isStreaming}
									<Loader class="h-5 w-5 animate-spin" />
								{:else}
									<Send class="h-5 w-5" />
								{/if}
							</button>
						</div>

						{#if isLiveTranscribing && canUseLiveTranscript}
							<div class="pointer-events-none absolute bottom-3 left-4 right-28">
								<div
									class="pointer-events-auto max-h-24 overflow-y-auto rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-sm text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-200"
								>
									<p class="m-0 whitespace-pre-wrap leading-relaxed">
										{liveTranscriptPreview}
									</p>
								</div>
							</div>
						{/if}
					</div>

					<div
						class="flex flex-wrap items-center justify-between gap-3 text-xs font-medium text-slate-500 dark:text-slate-400"
					>
						<div class="flex flex-wrap items-center gap-3">
							{#if isCurrentlyRecording}
								<span
									class="flex items-center gap-2 text-rose-500 dark:text-rose-400"
								>
									<span
										class="relative flex h-2.5 w-2.5 items-center justify-center"
									>
										<span
											class="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400/70"
										></span>
										<span
											class="relative inline-flex h-2 w-2 rounded-full bg-rose-500"
										></span>
									</span>
									Listening
									<span class="font-semibold"
										>{formatDuration(recordingDuration)}</span
									>
								</span>
							{:else if isTranscribing}
								<span class="flex items-center gap-2">
									<LoaderCircle class="h-4 w-4 animate-spin" />
									Transcribing...
								</span>
							{:else}
								<span class="hidden sm:inline"
									>Enter to send · Shift + Enter for new line</span
								>
								<span class="sm:hidden">Enter to send</span>
							{/if}

							{#if canUseLiveTranscript && isCurrentlyRecording}
								<span
									class="hidden rounded-full border border-blue-200 bg-blue-50 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-blue-600 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-300 sm:inline"
								>
									Live transcript
								</span>
							{/if}
						</div>

						<div class="flex flex-wrap items-center gap-3">
							{#if voiceError}
								<span
									role="alert"
									class="flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-rose-600 dark:bg-rose-900/20 dark:text-rose-300"
								>
									{voiceError}
								</span>
							{/if}

							{#if isStreaming}
								<div
									class="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-200"
								>
									<div
										class="h-2 w-2 animate-pulse rounded-full bg-emerald-500"
									></div>
									<span class="text-xs font-semibold">Agents working</span>
								</div>
							{/if}
						</div>
					</div>
				</form>
			</div>
		{/if}
	</div>
</Modal>

<style>
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
