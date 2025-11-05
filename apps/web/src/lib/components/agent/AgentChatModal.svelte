<!-- apps/web/src/lib/components/agent/AgentChatModal.svelte -->
<!--
  AgentChatModal Component

  Multi-agent chat interface showing planner-executor conversations.
  Displays agent activity, plan steps, and iterative conversations.

  Design: High-end Apple-inspired UI with responsive layout, dark mode,
  and high information density following BuildOS Style Guide.
-->

<script lang="ts">
	import { tick, onMount } from 'svelte';
	import {
		X,
		Send,
		Loader,
		MessageSquare,
		Zap,
		BrainCircuit,
		Sparkles,
		CircleCheck,
		Mic,
		MicOff,
		LoaderCircle
	} from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import ContextSelectionScreen from '$lib/components/chat/ContextSelectionScreen.svelte';
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
			title: 'Project context',
			subtitle: 'Focus on a single project’s goals, tasks, and insights.'
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
			subtitle: 'Legacy mode – use global instead.'
		},
		project_create: {
			title: 'New project flow',
			subtitle: 'Guide creation of a structured project from a spark of an idea.'
		},
		project_update: {
			title: 'Project update',
			subtitle: 'Review progress, make adjustments, and capture new work.'
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
		project_update:
			'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
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
	let clarifyingQuestions = $state<string[]>([]);
	let showClarifyingDialog = $state(false);
	let ontologyLoaded = $state(false);
	let ontologySummary = $state<string | null>(null);

	interface AgentMessage {
		id: string;
		type: 'user' | 'assistant' | 'activity' | 'plan' | 'step' | 'executor';
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
				label: 'Preparing microphone…',
				disabled: true,
				isLoading: true,
				variant: 'loading' as const
			};
		}

		if (isTranscribing) {
			return {
				icon: LoaderCircle,
				label: 'Transcribing…',
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
				label: 'Wait for agents…',
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
				return 'bg-gradient-to-br from-rose-500 to-orange-500 text-white shadow-[0_16px_32px_-20px_rgba(244,63,94,0.6)] animate-pulse';
			case 'loading':
				return 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300';
			case 'prompt':
				return 'border border-blue-400/40 bg-blue-50/80 text-blue-600 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300';
			case 'muted':
				return 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500';
			default:
				return 'bg-gradient-to-br from-blue-500 to-indigo-500 text-white shadow-[0_12px_32px_-20px_rgba(59,130,246,0.55)] hover:scale-105 hover:shadow-[0_20px_40px_-18px_rgba(59,130,246,0.5)] dark:from-blue-500 dark:to-indigo-500';
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

	function resetConversation() {
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
		clarifyingQuestions = [];
		showClarifyingDialog = false;
		ontologyLoaded = false;
		ontologySummary = null;
		voiceError = '';
		hasAttemptedVoice = false;
	}

	function handleContextSelect(event: CustomEvent<ContextSelectionDetail>) {
		const detail = event.detail;
		selectedContextType = detail.contextType;
		selectedEntityId = detail.entityId;
		selectedContextLabel =
			detail.label ?? CONTEXT_DESCRIPTORS[detail.contextType]?.title ?? null;
		resetConversation();
	}

	function changeContext() {
		if (isStreaming) return;
		if (isCurrentlyRecording || isInitializingRecording) {
			stopVoiceRecording();
		}
		selectedContextType = null;
		selectedEntityId = undefined;
		selectedContextLabel = null;
		resetConversation();
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
				},
				onComplete: () => {
					isStreaming = false;
					currentActivity = '';
				}
			};

			await SSEProcessor.processStream(response, callbacks, {
				timeout: 120000, // 2 minutes for agent conversations
				parseJSON: true
			});
		} catch (err) {
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
				addActivityMessage(`📊 ${ontologySummary}`);
				break;

			case 'last_turn_context':
				// Store last turn context for next message
				lastTurnContext = data.context;
				console.log('[AgentChat] Stored last turn context:', lastTurnContext);
				break;

			case 'strategy_selected':
				// Strategy was selected by planner
				currentStrategy = data.strategy;
				strategyConfidence = data.confidence || 0;
				const strategyName = data.strategy?.replace(/_/g, ' ') || 'unknown';
				const confidencePercent = Math.round((data.confidence || 0) * 100);
				addActivityMessage(
					`🎯 Strategy: ${strategyName} (${confidencePercent}% confidence)`
				);
				break;

			case 'clarifying_questions':
				// Agent needs clarification
				clarifyingQuestions = data.questions || [];
				if (clarifyingQuestions.length > 0) {
					showClarifyingDialog = true;
					addActivityMessage(`❓ ${clarifyingQuestions.length} clarifying questions`);
				}
				break;

			case 'executor_instructions':
				// Executor instructions generated
				addActivityMessage(`📋 Generated executor instructions`);
				break;

			case 'analysis':
				// Planner is analyzing the request
				currentActivity = 'Planner analyzing request...';
				addActivityMessage(
					`Strategy: ${data.analysis?.strategy || 'unknown'} - ${data.analysis?.reasoning || ''}`
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
				addActivityMessage(`🤖 Executor spawned for: ${data.task?.description}`);
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
				addActivityMessage(`🔧 Using tool: ${toolName}`);
				break;

			case 'tool_result':
				// Tool result received
				addActivityMessage(`✅ Tool completed`);
				break;

			case 'executor_result':
				// Executor finished
				const success = data.result?.success ? '✅' : '❌';
				addActivityMessage(
					`${success} Executor ${data.result?.success ? 'completed' : 'failed'}`
				);
				break;

			case 'step_complete':
				// Step completed
				addActivityMessage(`✓ Step ${data.step?.stepNumber} complete`);
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

	function addOrUpdateAssistantMessage(content: string) {
		if (currentAssistantMessageId) {
			// Update existing message
			messages = messages.map((m) => {
				if (m.id === currentAssistantMessageId) {
					return { ...m, content: m.content + content };
				}
				return m;
			});
		} else {
			// Create new assistant message
			currentAssistantMessageId = crypto.randomUUID();
			const assistantMessage: AgentMessage = {
				id: currentAssistantMessageId,
				type: 'assistant',
				content,
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
		class="relative z-50 border-b border-slate-200/60 bg-white/90 px-6 py-5 backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/85"
	>
		<div class="flex flex-col gap-4">
			<div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
				<div class="flex items-start gap-4">
					<div
						class="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500/15 via-pink-500/12 to-indigo-500/15 shadow-[0_12px_30px_-18px_rgba(168,85,247,0.55)] dark:from-purple-400/18 dark:via-pink-400/12 dark:to-indigo-400/18"
					>
						<Sparkles class="h-5 w-5 text-purple-600 dark:text-purple-300" />
					</div>
					<div class="flex flex-col gap-1">
						<h2 class="text-lg font-semibold text-gray-900 dark:text-white">
							Multi-Agent Assistant
						</h2>
						<div
							class="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400"
						>
							<Badge
								size="sm"
								class="!rounded-full border border-slate-200/60 bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-700 shadow-sm backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/80 dark:text-gray-200"
							>
								<BrainCircuit class="mr-1.5 h-3 w-3" />
								Planner + Executor
							</Badge>
							<span>Adaptive orchestration across BuildOS</span>
						</div>
					</div>
				</div>
				<div class="flex items-center gap-2">
					{#if selectedContextType}
						<Button
							variant="ghost"
							size="sm"
							class="rounded-full border border-slate-200/60 bg-white/70 px-3 py-2 text-sm font-medium text-slate-600 shadow-sm backdrop-blur transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-900/90"
							disabled={isStreaming}
							onclick={changeContext}
						>
							{isStreaming ? 'Focus locked while running…' : 'Change focus'}
						</Button>
					{/if}
					<Button
						variant="ghost"
						size="sm"
						icon={X}
						class="rounded-full border border-slate-200/60 bg-white/70 px-3 py-2 text-sm font-medium text-gray-700 shadow-sm backdrop-blur hover:bg-white/90 dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-gray-200 dark:hover:bg-slate-900/90"
						aria-label="Close chat"
						onclick={handleClose}
					/>
				</div>
			</div>
			<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<div class="flex flex-wrap items-center gap-2">
					<span
						class={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${contextBadgeClass}`}
					>
						<Sparkles class="h-3.5 w-3.5" />
						{displayContextLabel}
					</span>
					{#if displayContextSubtitle}
						<span class="text-xs text-slate-600 dark:text-slate-400">
							{displayContextSubtitle}
						</span>
					{/if}
				</div>
				<div class="flex flex-wrap items-center gap-2">
					{#if ontologyLoaded}
						<Badge
							size="sm"
							class="!rounded-full border border-emerald-200/60 bg-emerald-50/90 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:border-emerald-700/60 dark:bg-emerald-900/40 dark:text-emerald-300"
						>
							📊 Ontology
						</Badge>
					{/if}
					{#if currentStrategy}
						<Badge
							size="sm"
							class="!rounded-full border border-blue-200/60 bg-blue-50/90 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:border-blue-700/60 dark:bg-blue-900/40 dark:text-blue-300"
						>
							🎯 {currentStrategy.replace(/_/g, ' ')}
						</Badge>
					{/if}
					{#if currentActivity}
						<div
							class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"
						>
							<div class="h-2 w-2 animate-pulse rounded-full bg-blue-500"></div>
							<span>{currentActivity}</span>
						</div>
					{/if}
				</div>
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
			<!-- Messages Container -->
			<div
				bind:this={messagesContainer}
				onscroll={handleScroll}
				class="agent-chat-scroll flex-1 space-y-3 overflow-y-auto bg-gradient-to-b from-slate-50/50 to-white/80 px-4 py-6 backdrop-blur-sm dark:from-slate-900/50 dark:to-slate-900/80 sm:px-6"
			>
				{#if messages.length === 0}
					<div class="space-y-5">
						<div
							class="rounded-3xl border border-slate-200/60 bg-white/85 p-6 shadow-sm backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/70"
						>
							<div class="flex items-start gap-3">
								<div
									class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/15 via-sky-500/10 to-indigo-500/15 text-blue-600 dark:text-blue-300"
								>
									<BrainCircuit class="h-5 w-5" />
								</div>
								<div class="flex-1">
									<h3
										class="mb-1 text-sm font-semibold text-slate-900 dark:text-white"
									>
										Context aligned
									</h3>
									<p class="text-sm text-slate-600 dark:text-slate-400">
										{displayContextSubtitle}
									</p>
								</div>
							</div>
						</div>
						<div
							class="rounded-3xl border border-slate-200/60 bg-white/85 p-6 shadow-sm backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/70"
						>
							<p
								class="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400"
							>
								Try asking
							</p>
							<div class="mt-4 space-y-2.5">
								<div class="flex items-start gap-3">
									<div
										class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500/20 to-indigo-500/20 text-xs font-bold text-blue-600 dark:text-blue-300"
									>
										1
									</div>
									<p class="text-sm text-slate-700 dark:text-slate-300">
										"Outline the next steps for this focus."
									</p>
								</div>
								<div class="flex items-start gap-3">
									<div
										class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 text-xs font-bold text-purple-600 dark:text-purple-300"
									>
										2
									</div>
									<p class="text-sm text-slate-700 dark:text-slate-300">
										"What should we prepare before moving forward?"
									</p>
								</div>
							</div>
						</div>
					</div>
				{:else}
					{#each messages as message (message.id)}
						<div
							class="flex gap-3"
							class:justify-end={message.type === 'user'}
							class:justify-start={message.type !== 'user'}
						>
							{#if message.type === 'user'}
								<!-- User Message -->
								<div
									class="group max-w-[85%] rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 px-4 py-3 shadow-[0_8px_24px_-12px_rgba(59,130,246,0.4)] transition-all duration-200 hover:shadow-[0_12px_32px_-10px_rgba(79,70,229,0.5)] sm:max-w-[75%]"
								>
									<div
										class="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-white"
									>
										{message.content}
									</div>
									<div class="mt-1.5 text-xs text-blue-100/75">
										{formatTime(message.timestamp)}
									</div>
								</div>
							{:else if message.type === 'assistant'}
								<!-- Assistant Message -->
								<div class="flex max-w-[85%] gap-3 sm:max-w-[75%]">
									<div class="flex-shrink-0">
										<div
											class="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-purple-500/15 to-pink-500/15 shadow-sm dark:from-purple-400/20 dark:to-pink-400/20"
										>
											<MessageSquare
												class="h-4 w-4 text-purple-600 dark:text-purple-400"
											/>
										</div>
									</div>
									<div
										class="rounded-2xl border border-slate-200/60 bg-white/90 px-4 py-3 shadow-sm backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-900/80"
									>
										{#if shouldRenderAsMarkdown(message.content)}
											<!-- Markdown content -->
											<div class="agent-markdown {proseClasses}">
												{@html renderMarkdown(message.content)}
											</div>
										{:else}
											<!-- Plain text content -->
											<div
												class="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-gray-900 dark:text-gray-100"
											>
												{message.content}
											</div>
										{/if}
										<div
											class="mt-1.5 text-xs text-gray-500 dark:text-gray-400"
										>
											{formatTime(message.timestamp)}
										</div>
									</div>
								</div>
							{:else if message.type === 'activity'}
								<!-- Activity Message -->
								<div class="flex w-full justify-center">
									<div
										class="flex items-center gap-2.5 rounded-full border border-slate-200/60 bg-white/80 px-4 py-2 shadow-sm backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-900/70"
									>
										<div class="relative flex h-3.5 w-3.5">
											<span
												class="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"
											></span>
											<span
												class="relative inline-flex h-3.5 w-3.5 rounded-full bg-blue-500"
											></span>
										</div>
										<span
											class="text-xs font-medium text-gray-700 dark:text-gray-300"
											>{message.content}</span
										>
									</div>
								</div>
							{:else if message.type === 'plan'}
								<!-- Plan Created -->
								<div
									class="w-full rounded-2xl border border-purple-200/60 bg-gradient-to-br from-purple-50/90 via-pink-50/80 to-indigo-50/90 p-4 shadow-sm backdrop-blur-sm dark:border-purple-800/60 dark:from-purple-950/40 dark:via-pink-950/40 dark:to-indigo-950/40"
								>
									<div class="mb-3 flex items-center gap-2.5">
										<div
											class="flex h-8 w-8 items-center justify-center rounded-full bg-purple-500/15 shadow-sm dark:bg-purple-400/20"
										>
											<BrainCircuit
												class="h-4 w-4 text-purple-700 dark:text-purple-300"
											/>
										</div>
										<span
											class="text-sm font-semibold text-purple-900 dark:text-purple-100"
											>Plan Created</span
										>
									</div>
									{#if message.data?.steps}
										<div class="space-y-2">
											{#each message.data.steps as step}
												<div
													class="flex items-center gap-3 rounded-xl border border-purple-200/40 bg-white/60 px-3 py-2 backdrop-blur-sm transition-colors dark:border-purple-700/40 dark:bg-purple-900/20"
												>
													<div
														class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full {step.status ===
														'completed'
															? 'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/20 dark:text-emerald-300'
															: 'bg-purple-500/15 text-purple-700 dark:bg-purple-400/20 dark:text-purple-300'}"
													>
														{#if step.status === 'completed'}
															<CircleCheck class="h-3.5 w-3.5" />
														{:else}
															<span class="text-xs font-bold"
																>{step.stepNumber}</span
															>
														{/if}
													</div>
													<span
														class="text-sm font-medium text-gray-800 dark:text-gray-200"
														>{step.description}</span
													>
												</div>
											{/each}
										</div>
									{/if}
								</div>
							{/if}
						</div>
					{/each}
				{/if}

				<!-- Current Activity Indicator -->
				{#if isStreaming && currentActivity}
					<div class="flex w-full justify-center">
						<div
							class="flex items-center gap-2.5 rounded-full border border-blue-200/60 bg-gradient-to-r from-blue-50/90 to-indigo-50/90 px-5 py-2.5 shadow-sm backdrop-blur-sm dark:border-blue-800/60 dark:from-blue-950/40 dark:to-indigo-950/40"
						>
							<Zap
								class="h-4 w-4 animate-pulse text-blue-600 drop-shadow-sm dark:text-blue-400"
							/>
							<span class="text-sm font-semibold text-blue-900 dark:text-blue-100"
								>{currentActivity}</span
							>
						</div>
					</div>
				{/if}
			</div>

			<!-- Error Message -->
			{#if error}
				<div
					class="border-t border-rose-200/60 bg-gradient-to-r from-rose-50/90 to-red-50/90 px-4 py-3 backdrop-blur-sm dark:border-rose-800/50 dark:from-rose-900/20 dark:to-red-900/20"
				>
					<p class="text-sm font-medium text-rose-800 dark:text-rose-300">{error}</p>
				</div>
			{/if}

			<!-- Input Area -->
			<div
				class="border-t border-slate-200/60 bg-white/85 px-4 py-5 backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-900/85 sm:px-6"
			>
				<form
					onsubmit={(e) => {
						e.preventDefault();
						sendMessage();
					}}
					class="space-y-3"
				>
					<div class="relative space-y-2">
						<div
							class="relative rounded-[28px] border border-slate-200/60 bg-white/90 shadow-[0_12px_32px_-20px_rgba(15,23,42,0.4)] transition duration-200 ease-out focus-within:border-purple-300 focus-within:shadow-[0_20px_48px_-24px_rgba(168,85,247,0.45)] focus-within:ring-1 focus-within:ring-purple-200/40 dark:border-slate-700/60 dark:bg-slate-900/80 dark:shadow-[0_20px_40px_-24px_rgba(15,23,42,0.6)] dark:focus-within:border-purple-500/40 dark:focus-within:ring-purple-500/20"
						>
							<Textarea
								bind:value={inputValue}
								class="border-none bg-transparent px-6 py-4 pr-36 text-[15px] leading-relaxed text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0 dark:text-gray-100 dark:placeholder:text-gray-500"
								placeholder={`Share the next thing about ${displayContextLabel.toLowerCase()}...`}
								autoResize
								rows={1}
								maxRows={6}
								disabled={isStreaming}
								onkeydown={handleKeyDown}
							/>

							<div class="absolute inset-y-1 right-2 flex items-center gap-2">
								<button
									type="button"
									class={`flex h-11 w-11 items-center justify-center rounded-full border border-transparent transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-400 disabled:cursor-not-allowed disabled:opacity-60 sm:h-12 sm:w-12 ${voiceButtonClasses}`}
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
									class="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-pink-500 text-white shadow-[0_16px_32px_-20px_rgba(168,85,247,0.55)] transition-all duration-200 hover:scale-105 hover:shadow-[0_20px_40px_-18px_rgba(236,72,153,0.6)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-400 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 dark:from-purple-400 dark:to-pink-400"
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
								<div class="pointer-events-none absolute bottom-4 left-6 right-28">
									<div
										class="pointer-events-auto max-h-24 overflow-y-auto rounded-xl border border-purple-300/60 bg-gradient-to-r from-purple-50/80 to-pink-50/80 px-4 py-2 text-sm text-purple-700 shadow-[0_8px_24px_-18px_rgba(168,85,247,0.45)] backdrop-blur dark:border-purple-500/40 dark:from-purple-950/40 dark:to-pink-950/40 dark:text-purple-200"
									>
										<p class="m-0 whitespace-pre-wrap leading-relaxed">
											{liveTranscriptPreview}
										</p>
									</div>
								</div>
							{/if}
						</div>
					</div>

					<div
						class="flex flex-wrap items-center justify-between gap-3 text-xs font-medium text-gray-500 dark:text-gray-400"
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
									<span class="flex items-center gap-1">
										Listening
										<span class="font-semibold tracking-wide"
											>{formatDuration(recordingDuration)}</span
										>
									</span>
								</span>
							{:else if isTranscribing}
								<span class="flex items-center gap-2">
									<LoaderCircle class="h-4 w-4 animate-spin" />
									<span>Transcribing your voice note…</span>
								</span>
							{:else}
								<span class="hidden sm:inline"
									>Press Enter to send · Shift + Enter for new line</span
								>
								<span class="sm:hidden">Enter to send · Shift + Enter for line</span
								>
							{/if}

							{#if canUseLiveTranscript && isCurrentlyRecording}
								<span
									class="hidden rounded-full border border-blue-200/40 bg-blue-50/60 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-blue-500 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300 sm:inline"
								>
									Live transcript
								</span>
							{/if}
						</div>

						<div class="flex flex-wrap items-center gap-3">
							{#if voiceError}
								<span
									role="alert"
									class="flex items-center gap-2 rounded-full bg-rose-50/80 px-3 py-1 text-rose-500 dark:bg-rose-900/20 dark:text-rose-300"
								>
									{voiceError}
								</span>
							{/if}

							{#if isStreaming}
								<div
									class="flex items-center gap-2 rounded-full border border-emerald-200/40 bg-emerald-50/60 px-3 py-1 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
								>
									<div
										class="h-2 w-2 animate-pulse rounded-full bg-emerald-500"
									></div>
									<span class="text-xs font-semibold">Agents working...</span>
								</div>
							{/if}
						</div>
					</div>
				</form>
			</div>
		{/if}
	</div>

	<!-- Clarifying Questions Dialog -->
	{#if showClarifyingDialog}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
			onclick={() => (showClarifyingDialog = false)}
			onkeydown={(e) => {
				if (e.key === 'Escape') {
					showClarifyingDialog = false;
				}
			}}
			role="dialog"
			aria-modal="true"
			aria-labelledby="clarifying-dialog-title"
			tabindex="-1"
		>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="relative mx-4 w-full max-w-lg rounded-2xl border border-slate-200/60 bg-white/95 p-6 shadow-2xl backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-900/95"
				onclick={(e) => e.stopPropagation()}
				onkeydown={(e) => e.stopPropagation()}
			>
				<div class="mb-4 flex items-start justify-between">
					<div>
						<h3
							id="clarifying-dialog-title"
							class="text-lg font-semibold text-gray-900 dark:text-white"
						>
							Clarifying Questions
						</h3>
						<p class="mt-1 text-sm text-slate-600 dark:text-slate-400">
							The assistant needs more information to help you better
						</p>
					</div>
					<button
						onclick={() => (showClarifyingDialog = false)}
						class="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
					>
						<X class="h-5 w-5" />
					</button>
				</div>

				<div class="space-y-3">
					{#each clarifyingQuestions as question, i}
						<div
							class="rounded-lg border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-800/50"
						>
							<div class="flex items-start gap-3">
								<span
									class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-xs font-semibold text-blue-600 dark:bg-blue-500/20 dark:text-blue-400"
								>
									{i + 1}
								</span>
								<p class="flex-1 text-sm text-gray-700 dark:text-gray-200">
									{question}
								</p>
							</div>
						</div>
					{/each}
				</div>

				<div class="mt-6 flex flex-col gap-2">
					<p class="text-xs text-slate-500 dark:text-slate-400">
						Answer these questions in your next message to get a more helpful response.
					</p>
					<Button
						variant="primary"
						size="md"
						class="w-full"
						onclick={() => (showClarifyingDialog = false)}
					>
						Got it, I'll provide more details
					</Button>
				</div>
			</div>
		</div>
	{/if}
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

	/* Markdown Prose Styling for Agent Messages */
	:global(.agent-markdown) {
		font-size: 15px;
		line-height: 1.6;
	}

	/* Paragraphs */
	:global(.agent-markdown p) {
		margin: 0.75em 0;
		color: rgb(17 24 39);
	}

	:global(.dark .agent-markdown p) {
		color: rgb(243 244 246);
	}

	:global(.agent-markdown p:first-child) {
		margin-top: 0;
	}

	:global(.agent-markdown p:last-child) {
		margin-bottom: 0;
	}

	/* Headings */
	:global(.agent-markdown h1, .agent-markdown h2, .agent-markdown h3) {
		margin: 1em 0 0.5em;
		font-weight: 600;
		line-height: 1.3;
		color: rgb(17 24 39);
	}

	:global(.dark .agent-markdown h1, .dark .agent-markdown h2, .dark .agent-markdown h3) {
		color: rgb(255 255 255);
	}

	:global(
		.agent-markdown h1:first-child,
		.agent-markdown h2:first-child,
		.agent-markdown h3:first-child
	) {
		margin-top: 0;
	}

	:global(.agent-markdown h1) {
		font-size: 1.5em;
	}

	:global(.agent-markdown h2) {
		font-size: 1.3em;
	}

	:global(.agent-markdown h3) {
		font-size: 1.15em;
	}

	/* Lists */
	:global(.agent-markdown ul, .agent-markdown ol) {
		margin: 0.75em 0;
		padding-left: 1.75em;
	}

	:global(.agent-markdown li) {
		margin: 0.35em 0;
		color: rgb(55 65 81);
	}

	:global(.dark .agent-markdown li) {
		color: rgb(229 231 235);
	}

	:global(.agent-markdown ul) {
		list-style-type: disc;
	}

	:global(.agent-markdown ol) {
		list-style-type: decimal;
	}

	:global(.agent-markdown ul ul, .agent-markdown ol ul) {
		list-style-type: circle;
	}

	:global(.agent-markdown ol ol, .agent-markdown ul ol) {
		list-style-type: lower-alpha;
	}

	/* Inline Code */
	:global(.agent-markdown code) {
		background-color: rgb(243 244 246);
		color: rgb(239 68 68);
		padding: 0.15em 0.4em;
		border-radius: 0.25em;
		font-size: 0.9em;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-weight: 500;
	}

	:global(.dark .agent-markdown code) {
		background-color: rgb(31 41 55);
		color: rgb(252 165 165);
	}

	/* Code Blocks */
	:global(.agent-markdown pre) {
		margin: 1em 0;
		padding: 1em;
		border-radius: 0.75em;
		overflow-x: auto;
		background-color: rgb(17 24 39);
		border: 1px solid rgb(75 85 99);
	}

	:global(.dark .agent-markdown pre) {
		background-color: rgb(15 23 42);
		border-color: rgb(51 65 85);
	}

	:global(.agent-markdown pre code) {
		background-color: transparent;
		color: rgb(229 231 235);
		padding: 0;
		font-size: 0.875em;
		font-weight: 400;
	}

	/* Blockquotes */
	:global(.agent-markdown blockquote) {
		margin: 1em 0;
		padding-left: 1em;
		border-left: 3px solid rgb(168 85 247);
		color: rgb(75 85 99);
		font-style: italic;
	}

	:global(.dark .agent-markdown blockquote) {
		border-left-color: rgb(192 132 252);
		color: rgb(156 163 175);
	}

	/* Links */
	:global(.agent-markdown a) {
		color: rgb(168 85 247);
		text-decoration: underline;
		text-decoration-color: rgb(168 85 247 / 0.3);
		text-underline-offset: 2px;
		transition: all 150ms ease;
	}

	:global(.agent-markdown a:hover) {
		color: rgb(147 51 234);
		text-decoration-color: rgb(147 51 234 / 0.5);
	}

	:global(.dark .agent-markdown a) {
		color: rgb(192 132 252);
		text-decoration-color: rgb(192 132 252 / 0.3);
	}

	:global(.dark .agent-markdown a:hover) {
		color: rgb(216 180 254);
		text-decoration-color: rgb(216 180 254 / 0.5);
	}

	/* Strong/Bold */
	:global(.agent-markdown strong) {
		font-weight: 600;
		color: rgb(17 24 39);
	}

	:global(.dark .agent-markdown strong) {
		color: rgb(255 255 255);
	}

	/* Emphasis/Italic */
	:global(.agent-markdown em) {
		font-style: italic;
	}

	/* Horizontal Rules */
	:global(.agent-markdown hr) {
		margin: 1.5em 0;
		border: none;
		border-top: 1px solid rgb(229 231 235);
	}

	:global(.dark .agent-markdown hr) {
		border-top-color: rgb(55 65 81);
	}

	/* Tables */
	:global(.agent-markdown table) {
		margin: 1em 0;
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9em;
	}

	:global(.agent-markdown th, .agent-markdown td) {
		padding: 0.5em 0.75em;
		border: 1px solid rgb(229 231 235);
		text-align: left;
	}

	:global(.dark .agent-markdown th, .dark .agent-markdown td) {
		border-color: rgb(55 65 81);
	}

	:global(.agent-markdown th) {
		background-color: rgb(243 244 246);
		font-weight: 600;
		color: rgb(17 24 39);
	}

	:global(.dark .agent-markdown th) {
		background-color: rgb(31 41 55);
		color: rgb(255 255 255);
	}

	/* Images */
	:global(.agent-markdown img) {
		max-width: 100%;
		height: auto;
		border-radius: 0.5em;
		margin: 1em 0;
	}
</style>
