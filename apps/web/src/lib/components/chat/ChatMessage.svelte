<!-- apps/web/src/lib/components/chat/ChatMessage.svelte -->
<!--
  ChatMessage Component

  Displays individual chat messages with support for different roles,
  tool calls, and streaming content.
-->

<script lang="ts">
	import { User, Bot, Settings, Wrench, MessageSquare, RefreshCw } from 'lucide-svelte';
	import type { ChatMessage } from '@buildos/shared-types';
	import { renderMarkdown as renderSafeMarkdown, getProseClasses } from '$lib/utils/markdown';

	interface Props {
		message: ChatMessage;
		isStreaming?: boolean;
		onRetry?: () => void;
	}

	let { message, isStreaming = false, onRetry }: Props = $props();

	// Get icon for message role
	function getRoleIcon(role: string) {
		switch (role) {
			case 'user':
				return User;
			case 'assistant':
				return Bot;
			case 'system':
				return Settings;
			case 'tool':
				return Wrench;
			default:
				return MessageSquare;
		}
	}

	// Get role label
	function getRoleLabel(role: string): string {
		switch (role) {
			case 'user':
				return 'You';
			case 'assistant':
				return 'Assistant';
			case 'system':
				return 'System';
			case 'tool':
				return 'Tool Result';
			default:
				return role;
		}
	}

	// Format timestamp
	function formatTime(timestamp: string): string {
		const date = new Date(timestamp);
		return date.toLocaleTimeString('en-US', {
			hour: 'numeric',
			minute: '2-digit',
			hour12: true
		});
	}

	const proseClasses = getProseClasses('sm');

	// Derive the role icon from the message role
	let RoleIcon = $derived(getRoleIcon(message.role));
</script>

<div class={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}>
	<!-- Avatar -->
	<div
		class={`flex h-8 w-8 items-center justify-center rounded-full ${
			message.role === 'user'
				? 'bg-primary-100 text-primary-600 dark:bg-primary-900 dark:text-primary-400'
				: message.role === 'assistant'
					? 'bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-400'
					: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
		}`}
	>
		<RoleIcon class="w-4 h-4" />
	</div>

	<!-- Message content -->
	<div class={`flex-1 ${message.role === 'user' ? 'text-right' : ''}`}>
		<!-- Role and timestamp -->
		<div class="mb-1 flex items-center gap-2 text-xs text-gray-500">
			{#if message.role !== 'user'}
				<span class="font-medium">{getRoleLabel(message.role)}</span>
			{/if}
			{#if message.created_at}
				<span>{formatTime(message.created_at)}</span>
			{/if}
			{#if isStreaming}
				<span class="flex items-center gap-1 text-primary-500">
					<div class="h-1.5 w-1.5 animate-pulse rounded-full bg-current"></div>
					<span>typing...</span>
				</span>
			{/if}
		</div>

		<!-- Message bubble -->
		<div
			class={`inline-block max-w-[85%] rounded-lg px-4 py-2 ${
				message.role === 'user'
					? 'bg-primary-500 text-white'
					: message.role === 'tool'
						? 'bg-gray-50 font-mono text-xs text-gray-700 dark:bg-gray-900 dark:text-gray-300'
						: 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100'
			}`}
		>
			{#if message.role === 'tool'}
				<!-- Tool result (show as code) -->
				<pre class="whitespace-pre-wrap">{message.content}</pre>
			{:else if message.role === 'assistant' || message.role === 'system'}
				<!-- Rendered markdown for assistant/system messages -->
				<div class={proseClasses}>
					{@html renderSafeMarkdown(message.content)}
				</div>
			{:else}
				<!-- Plain text for user messages -->
				<div class="whitespace-pre-wrap">{message.content}</div>
			{/if}

			<!-- Tool calls indicator -->
			{#if message.tool_calls && message.tool_calls.length > 0}
				<div class="mt-2 border-t border-gray-200 pt-2 dark:border-gray-700">
					<div class="flex items-center gap-1 text-xs text-gray-500">
						<Wrench class="w-3 h-3" />
						<span
							>Used {message.tool_calls.length} tool{message.tool_calls.length > 1
								? 's'
								: ''}</span
						>
					</div>
				</div>
			{/if}
		</div>

		<!-- Error state with retry -->
		{#if message.error_message}
			<div class="mt-2 flex items-center gap-2">
				<div
					class="flex-1 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
				>
					{message.error_message}
				</div>
				{#if onRetry}
					<Button
						onclick={onRetry}
						class="rounded-lg p-1.5 text-red-600 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900/20"
					>
						<RefreshCw class="w-3.5 h-3.5" />
					</Button>
				{/if}
			</div>
		{/if}

		<!-- Token usage (for debugging) -->
		{#if message.total_tokens}
			<div class="mt-1 text-xs text-gray-400">
				{message.total_tokens} tokens
			</div>
		{/if}
	</div>
</div>

<style>
	/* Override prose styles for better chat appearance */
	:global(.prose) {
		--tw-prose-body: inherit;
		--tw-prose-headings: inherit;
		--tw-prose-links: rgb(var(--color-primary-600));
		--tw-prose-code: inherit;
		--tw-prose-pre-bg: rgb(var(--color-gray-900));
		--tw-prose-pre-code: rgb(var(--color-gray-100));
	}

	:global(.prose p) {
		margin: 0.5em 0;
	}

	:global(.prose p:first-child) {
		margin-top: 0;
	}

	:global(.prose p:last-child) {
		margin-bottom: 0;
	}

	:global(.prose ul, .prose ol) {
		margin: 0.5em 0;
		padding-left: 1.5em;
	}

	:global(.prose li) {
		margin: 0.25em 0;
	}

	:global(.prose code) {
		background-color: rgba(0, 0, 0, 0.05);
		padding: 0.125em 0.25em;
		border-radius: 0.25em;
		font-size: 0.875em;
	}

	:global(.dark .prose code) {
		background-color: rgba(255, 255, 255, 0.05);
	}

	:global(.prose pre) {
		margin: 0.5em 0;
		padding: 0.5em;
		border-radius: 0.375em;
		font-size: 0.875em;
	}

	:global(.prose h1, .prose h2, .prose h3, .prose h4, .prose h5, .prose h6) {
		margin: 0.75em 0 0.5em;
		font-weight: 600;
	}

	:global(.prose h1:first-child, .prose h2:first-child, .prose h3:first-child) {
		margin-top: 0;
	}
</style>
