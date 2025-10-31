<!-- apps/web/src/lib/components/agent/AgentChatModal.svelte -->
<!--
  AgentChatModal Component

  Multi-agent chat interface showing planner-executor conversations.
  Displays agent activity, plan steps, and iterative conversations.

  Design: High-end Apple-inspired UI with responsive layout, dark mode,
  and high information density following BuildOS Style Guide.
-->

<script lang="ts">
	import { tick } from 'svelte';
	import {
		X,
		Send,
		Loader,
		MessageSquare,
		Zap,
		BrainCircuit,
		Sparkles,
		CheckCircle
	} from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import ContextSelectionScreen from '$lib/components/chat/ContextSelectionScreen.svelte';
	import { SSEProcessor, type StreamCallbacks } from '$lib/utils/sse-processor';
	import type { ChatSession, ChatContextType } from '@buildos/shared-types';
	import { renderMarkdown, getProseClasses, hasMarkdownFormatting } from '$lib/utils/markdown';

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
	let messagesContainer: HTMLElement;

	interface AgentMessage {
		id: string;
		type: 'user' | 'assistant' | 'activity' | 'plan' | 'step' | 'executor';
		content: string;
		data?: any;
		timestamp: Date;
	}

	const isSendDisabled = $derived(!selectedContextType || !inputValue.trim() || isStreaming);

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
		if (onClose) onClose();
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			sendMessage();
		}
	}

	async function sendMessage() {
		const trimmed = inputValue.trim();
		if (!trimmed || isStreaming) return;
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
		error = null;
		isStreaming = true;
		currentActivity = 'Analyzing request...';
		currentPlan = null;

		// Reset scroll flag so we always scroll to show new user message
		userHasScrolled = false;

		try {
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
					conversation_history: conversationHistory // Pass conversation history for compression
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
							on:click={changeContext}
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
						on:click={handleClose}
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
				{#if currentActivity}
					<div class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
						<div class="h-2 w-2 animate-pulse rounded-full bg-blue-500"></div>
						<span>{currentActivity}</span>
					</div>
				{/if}
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
															<CheckCircle class="h-3.5 w-3.5" />
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
					<div class="relative">
						<div
							class="relative rounded-[28px] border border-slate-200/60 bg-white/90 shadow-[0_12px_32px_-20px_rgba(15,23,42,0.4)] transition duration-200 ease-out focus-within:border-purple-300 focus-within:shadow-[0_20px_48px_-24px_rgba(168,85,247,0.45)] focus-within:ring-1 focus-within:ring-purple-200/40 dark:border-slate-700/60 dark:bg-slate-900/80 dark:shadow-[0_20px_40px_-24px_rgba(15,23,42,0.6)] dark:focus-within:border-purple-500/40 dark:focus-within:ring-purple-500/20"
						>
							<Textarea
								bind:value={inputValue}
								class="border-none bg-transparent px-6 py-4 pr-20 text-[15px] leading-relaxed text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0 dark:text-gray-100 dark:placeholder:text-gray-500"
								placeholder={`Share the next thing about ${displayContextLabel.toLowerCase()}...`}
								autoResize
								rows={1}
								maxRows={6}
								disabled={isStreaming}
								onkeydown={handleKeyDown}
							/>

							<div class="absolute inset-y-1 right-2 flex items-end">
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
						</div>
					</div>

					<div
						class="flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-gray-500 dark:text-gray-400"
					>
						<span class="hidden sm:inline"
							>Press Enter to send · Shift + Enter for new line</span
						>
						<span class="sm:hidden">Enter to send · Shift + Enter for line</span>
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
