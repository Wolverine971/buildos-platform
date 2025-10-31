<!-- apps/web/src/lib/components/agent/ChatInterface.svelte -->
<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher } from 'svelte';
	import { marked } from 'marked';
	import Button from '$lib/components/ui/Button.svelte';
	import LoadingSpinner from '$lib/components/icons/LoadingSpinner.svelte';
	import type { AgentChatType, AgentSSEMessage, ChatOperation } from '@buildos/shared-types';

	// Props using Svelte 5 syntax
	interface Props {
		chatType: AgentChatType;
		entityId: string | null;
		sessionId: string | null;
		autoAcceptOperations: boolean;
	}

	let { chatType, entityId, sessionId, autoAcceptOperations }: Props = $props();

	// State using Svelte 5 $state rune for reactivity
	let messages = $state<Array<{ role: 'user' | 'assistant' | 'system'; content: string }>>([]);
	let input = $state('');
	let isStreaming = $state(false);
	let currentPhase = $state('gathering_info');
	let streamController = $state<AbortController | null>(null);

	// Dispatcher
	const dispatch = createEventDispatcher();

	// Initialize welcome message
	onMount(() => {
		if (!sessionId) {
			// Add welcome message based on chat type
			messages = [
				{
					role: 'assistant',
					content: getWelcomeMessage(chatType)
				}
			];
		}
	});

	onDestroy(() => {
		// Cleanup stream if active
		if (streamController) {
			streamController.abort();
		}
	});

	// Get welcome message based on chat type
	function getWelcomeMessage(type: AgentChatType): string {
		switch (type) {
			case 'project_create':
				return "What project are you working on? Tell me everything that's on your mind about it.";
			case 'project_update':
				return "What's new with your project? What would you like to update?";
			case 'project_audit':
				return 'Let me review your project with a critical eye. What concerns you most?';
			case 'project_forecast':
				return "Let's forecast scenarios for your project. What situation should we analyze?";
			default:
				return 'How can I help you with your projects today?';
		}
	}

	// Send message
	async function sendMessage() {
		if (!input.trim() || isStreaming) return;

		const userMessage = input.trim();
		input = '';

		// Convert existing messages to conversation history format (excluding welcome message)
		const conversationHistory = messages
			.filter((msg) => msg.role !== 'system') // Exclude system messages
			.map((msg, index) => ({
				id: `temp-${index}`, // Temporary ID for context
				chat_session_id: sessionId || 'pending',
				role: msg.role,
				content: msg.content,
				created_at: new Date().toISOString()
			}));

		// Add user message to chat
		messages = [...messages, { role: 'user', content: userMessage }];

		// Start streaming
		isStreaming = true;
		streamController = new AbortController();

		try {
			// Create assistant message placeholder
			let assistantMessage = { role: 'assistant' as const, content: '' };
			messages = [...messages, assistantMessage];
			const assistantIndex = messages.length - 1;

			// Make SSE request
			const response = await fetch('/api/agent/stream', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					message: userMessage,
					session_id: sessionId,
					chat_type: chatType,
					entity_id: entityId,
					auto_accept: autoAcceptOperations,
					conversation_history: conversationHistory // Pass conversation history for compression
				}),
				signal: streamController.signal
			});

			if (!response.ok) {
				throw new Error(`Error: ${response.status}`);
			}

			// Read SSE stream
			const reader = response.body?.getReader();
			if (!reader) throw new Error('No response body');

			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					if (line.startsWith('data: ')) {
						const data = line.slice(6);
						if (data === '[DONE]') continue;

						try {
							const event: AgentSSEMessage = JSON.parse(data);
							handleSSEEvent(event, assistantIndex);
						} catch (e) {
							console.error('Failed to parse SSE event:', e);
						}
					}
				}
			}
		} catch (error) {
			if (error.name !== 'AbortError') {
				console.error('Stream error:', error);
				messages = [
					...messages,
					{
						role: 'system',
						content: 'An error occurred. Please try again.'
					}
				];
			}
		} finally {
			isStreaming = false;
			streamController = null;
		}
	}

	// Handle SSE events
	function handleSSEEvent(event: AgentSSEMessage, assistantIndex: number) {
		switch (event.type) {
			case 'session':
				if (!sessionId && event.sessionId) {
					sessionId = event.sessionId;
					dispatch('sessionCreated', event.sessionId);
				}
				break;

			case 'text':
				// Update assistant message
				messages[assistantIndex].content += event.content;
				messages = messages;
				break;

			case 'operation':
				dispatch('operation', event.operation);
				break;

			case 'queue_update':
				dispatch('queue', event.operations);
				break;

			case 'phase_update':
				currentPhase = event.phase;
				if (event.message) {
					messages = [
						...messages,
						{
							role: 'system',
							content: `*${event.message}*`
						}
					];
				}
				break;

			case 'dimension_update':
				// Could show dimension updates in UI
				break;

			case 'error':
				messages = [
					...messages,
					{
						role: 'system',
						content: `Error: ${event.error}`
					}
				];
				break;
		}
	}

	// Handle Enter key
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			sendMessage();
		}
	}

	// Format message with markdown
	function formatMessage(content: string): string {
		return marked(content, { breaks: true });
	}

	// Get phase indicator
	function getPhaseIndicator(phase: string): string {
		const indicators: Record<string, string> = {
			gathering_info: '👂 Listening',
			clarifying: '❓ Asking Questions',
			finalizing: '✨ Finalizing',
			completed: '✅ Complete',
			partial_failure: '⚠️ Partial Success'
		};
		return indicators[phase] || phase;
	}
</script>

<div class="flex h-full flex-col">
	<!-- Phase Indicator -->
	<div
		class="border-b border-slate-200/60 bg-gradient-to-r from-blue-50/50 to-indigo-50/50 px-4 py-2 backdrop-blur-sm dark:border-slate-700/60 dark:from-blue-950/30 dark:to-indigo-950/30"
	>
		<span
			class="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-sm font-medium text-slate-700 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-200"
		>
			{getPhaseIndicator(currentPhase)}
		</span>
	</div>

	<!-- Messages -->
	<div class="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
		{#each messages as message}
			<div class="flex {message.role === 'user' ? 'justify-end' : 'justify-start'}">
				{#if message.role === 'user'}
					<div
						class="max-w-[80%] rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-3 text-white shadow-sm"
					>
						<p class="break-words text-sm leading-relaxed">{message.content}</p>
					</div>
				{:else if message.role === 'assistant'}
					<div
						class="max-w-[80%] rounded-2xl border border-slate-200/60 bg-white/85 px-4 py-3 text-slate-800 shadow-sm backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-slate-200"
					>
						<div class="prose prose-sm dark:prose-invert max-w-none">
							{@html formatMessage(message.content)}
						</div>
					</div>
				{:else if message.role === 'system'}
					<div class="w-full text-center">
						<p
							class="inline-block rounded-lg bg-slate-100 px-3 py-1 text-xs italic text-slate-600 dark:bg-slate-800 dark:text-slate-400"
						>
							{@html formatMessage(message.content)}
						</p>
					</div>
				{/if}
			</div>
		{/each}

		{#if isStreaming}
			<div class="flex justify-start">
				<div
					class="flex items-center gap-2 rounded-2xl border border-slate-200/60 bg-white/85 px-4 py-3 text-slate-700 backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-slate-200"
				>
					<LoadingSpinner size="small" />
					<span class="text-sm">Thinking...</span>
				</div>
			</div>
		{/if}
	</div>

	<!-- Input Area -->
	<div
		class="border-t border-slate-200/60 bg-white/85 p-3 backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-900/70 sm:p-4"
	>
		<div class="flex flex-col gap-2 sm:gap-3">
			<textarea
				bind:value={input}
				on:keydown={handleKeydown}
				placeholder={isStreaming ? 'Please wait...' : 'Type your message...'}
				disabled={isStreaming}
				rows="3"
				class="w-full resize-none rounded-lg border border-slate-200/60 bg-white/90 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 dark:border-slate-600/60 dark:bg-slate-800/90 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-blue-400 dark:disabled:bg-slate-900"
			/>
			<div class="flex justify-end">
				<Button
					on:click={sendMessage}
					disabled={!input.trim() || isStreaming}
					variant="primary"
					size="md"
				>
					{isStreaming ? 'Sending...' : 'Send'}
				</Button>
			</div>
		</div>
	</div>
</div>
