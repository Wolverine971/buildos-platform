<!-- apps/web/src/lib/components/admin/chat/ConversationMessageBubble.svelte -->
<script lang="ts">
	import {
		formatDateTime,
		formatNumber,
		truncateText
	} from '$lib/services/admin/chat-session-audit-formatters';
	import { conversationMessageIsLong } from '$lib/services/admin/chat-session-audit-conversation';
	import { conversationMessageTargetId } from '$lib/services/admin/chat-session-flow-targets';
	import type { ConversationMessage } from '$lib/services/admin/chat-session-audit-types';

	type MessageVariant = 'user' | 'assistant' | 'other';

	let {
		message,
		variant
	}: {
		message: ConversationMessage;
		variant: MessageVariant;
	} = $props();

	let domId = $derived(conversationMessageTargetId(message.id));
</script>

{#if variant === 'user'}
	<div
		id={domId}
		class="flex justify-end rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		tabindex="-1"
	>
		<div
			class="max-w-[88%] min-w-0 overflow-hidden rounded-lg border border-accent/30 bg-accent/5 p-3 text-sm font-medium text-foreground shadow-ink sm:max-w-[85%]"
		>
			<div
				class="mb-1 flex items-center justify-between gap-2 text-2xs font-semibold uppercase tracking-wide text-accent"
			>
				<span>{message.roleLabel}</span>
				<span class="font-normal normal-case tracking-normal text-accent/60">
					{formatDateTime(message.timestamp)}
				</span>
			</div>
			{#if conversationMessageIsLong(message)}
				<details>
					<summary class="cursor-pointer list-none space-y-2">
						<div
							class="line-clamp-4 whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed"
						>
							{truncateText(message.content || '(empty message)', 420)}
						</div>
						<div class="text-2xs font-semibold uppercase tracking-wide text-accent">
							Expand message
						</div>
					</summary>
					<div
						class="mt-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed"
					>
						{message.content || '(empty message)'}
					</div>
				</details>
			{:else}
				<div
					class="whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed"
				>
					{message.content || '(empty message)'}
				</div>
			{/if}
			{#if message.errorMessage || message.totalTokens > 0}
				<div class="mt-2 flex flex-wrap items-center gap-2 text-2xs text-foreground/60">
					{#if message.totalTokens > 0}
						<span>{formatNumber(message.totalTokens)} tokens</span>
					{/if}
					{#if message.errorMessage}
						<span class="text-destructive">{message.errorMessage}</span>
					{/if}
				</div>
			{/if}
		</div>
	</div>
{:else if variant === 'assistant'}
	<div
		id={domId}
		class="flex min-w-0 gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-3"
		tabindex="-1"
	>
		<div
			class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-foreground text-2xs font-semibold uppercase tracking-wide text-background shadow-ink sm:h-9 sm:w-9"
		>
			OS
		</div>
		<div
			class="max-w-[90%] min-w-0 overflow-hidden rounded-lg border border-border bg-card p-3 text-sm font-medium leading-relaxed text-foreground shadow-ink tx tx-frame tx-weak sm:max-w-[88%]"
		>
			<div
				class="mb-1 flex items-center justify-between gap-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground"
			>
				<span>{message.roleLabel}</span>
				<span class="font-normal normal-case tracking-normal text-muted-foreground/60">
					{formatDateTime(message.timestamp)}
				</span>
			</div>
			{#if conversationMessageIsLong(message)}
				<details>
					<summary class="cursor-pointer list-none space-y-2">
						<div
							class="line-clamp-4 whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
						>
							{truncateText(message.content || '(empty message)', 420)}
						</div>
						<div
							class="text-2xs font-semibold uppercase tracking-wide text-muted-foreground"
						>
							Expand message
						</div>
					</summary>
					<div class="mt-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
						{message.content || '(empty message)'}
					</div>
				</details>
			{:else}
				<div class="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
					{message.content || '(empty message)'}
				</div>
			{/if}
			{#if message.errorMessage || message.totalTokens > 0}
				<div class="mt-2 flex flex-wrap items-center gap-2 text-2xs text-muted-foreground">
					{#if message.totalTokens > 0}
						<span>{formatNumber(message.totalTokens)} tokens</span>
					{/if}
					{#if message.errorMessage}
						<span class="text-destructive">{message.errorMessage}</span>
					{/if}
				</div>
			{/if}
		</div>
	</div>
{:else}
	<div
		id={domId}
		class="flex min-w-0 justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		tabindex="-1"
	>
		<div
			class="max-w-[92%] rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground"
		>
			<span class="font-semibold text-foreground">{message.roleLabel}:</span>
			{message.content || '(empty message)'}
		</div>
	</div>
{/if}
