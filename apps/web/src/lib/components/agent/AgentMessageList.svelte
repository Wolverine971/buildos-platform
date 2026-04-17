<!-- apps/web/src/lib/components/agent/AgentMessageList.svelte -->
<!-- INKPRINT Design System: Message list with semantic textures -->
<script lang="ts">
	import ThinkingBlock from './ThinkingBlock.svelte';
	import { renderMarkdown, getProseClasses } from '$lib/utils/markdown';
	import type { UIMessage, ThinkingBlockMessage } from './agent-chat.types';
	import { shouldRenderAsMarkdown, formatTime } from './agent-chat-formatters';
	import { dev } from '$app/environment';
	import VoiceNoteGroupPanel from '$lib/components/voice-notes/VoiceNoteGroupPanel.svelte';
	import type { VoiceNote } from '$lib/types/voice-notes';

	interface Props {
		messages: UIMessage[];
		onToggleThinkingBlock: (blockId: string) => void;
		onScroll: () => void;
		displayContextLabel: string;
		container?: HTMLElement;
		voiceNotesByGroupId?: Record<string, VoiceNote[]>;
		onDeleteVoiceNote?: (groupId: string, noteId: string) => void;
	}

	let {
		messages,
		onToggleThinkingBlock,
		onScroll,
		displayContextLabel,
		container = $bindable(),
		voiceNotesByGroupId = {},
		onDeleteVoiceNote
	}: Props = $props();

	const proseClasses = getProseClasses('sm');

	const USER_MESSAGE_PREVIEW_LINES = 10;
	const USER_MESSAGE_COLLAPSE_CHAR_THRESHOLD = 800;

	let expandedUserMessages = $state<Record<string, boolean>>({});

	function getLineCount(content: string): number {
		return content.split(/\r\n|\r|\n/).length;
	}

	function isCollapsibleUserMessage(message: UIMessage): boolean {
		if (message.type !== 'user') return false;
		const content = message.content?.trim() ?? '';
		if (!content) return false;
		return (
			getLineCount(content) > USER_MESSAGE_PREVIEW_LINES ||
			content.length > USER_MESSAGE_COLLAPSE_CHAR_THRESHOLD
		);
	}

	function isUserMessageExpanded(messageId: string): boolean {
		return expandedUserMessages[messageId] ?? false;
	}

	function toggleUserMessageExpansion(messageId: string): void {
		expandedUserMessages = {
			...expandedUserMessages,
			[messageId]: !(expandedUserMessages[messageId] ?? false)
		};
	}
</script>

<!-- INKPRINT message container with muted background -->
<!--
	Mobile scroll fix: We disable native scroll anchoring (overflow-anchor: none)
	to allow users to freely scroll up/down during streaming without being
	snapped back to the bottom. Auto-scroll is handled manually by the parent
	component via the scrollToBottomIfNeeded() function, which respects the
	userHasScrolled flag.
-->
<div
	bind:this={container}
	onscroll={onScroll}
	class="agent-chat-scroll flex-1 min-h-0 space-y-3 overflow-y-auto overscroll-contain bg-muted p-3 sm:p-4 lg:px-6 lg:py-4"
	style="overflow-anchor: none; -webkit-overflow-scrolling: touch;"
>
	{#if messages.length === 0}
		<!-- INKPRINT empty state card with Bloom texture -->
		<div
			class="rounded-lg border border-dashed border-border bg-card p-3 tx tx-bloom tx-weak shadow-ink sm:p-4"
		>
			<div class="space-y-2">
				<!-- INKPRINT micro-label heading -->
				<p class="text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-accent">
					READY TO OPERATE
				</p>
				<!-- Body text -->
				<p class="text-sm font-medium leading-relaxed text-muted-foreground">
					Ask BuildOS to plan, explain, or take the next step for
					{displayContextLabel.toLowerCase()}.
				</p>
				<!-- Suggestion list -->
				<ul class="space-y-2 text-sm font-medium text-muted-foreground">
					<li class="flex items-start gap-2">
						<span class="mt-0.5 text-accent">▸</span>
						<span>Summarize where this stands</span>
					</li>
					<li class="flex items-start gap-2">
						<span class="mt-0.5 text-accent">▸</span>
						<span>Draft the next update</span>
					</li>
					<li class="flex items-start gap-2">
						<span class="mt-0.5 text-accent">▸</span>
						<span>What should we do next?</span>
					</li>
				</ul>
			</div>
		</div>
	{:else}
		{#each messages as message (message.id)}
			{#if message.type === 'user'}
				<!-- INKPRINT user message with accent border -->
				<!-- Flex column: message bubble + voice panel (when expanded, takes full width) -->
				<div class="flex flex-col items-end gap-1.5">
					<!-- Message bubble -->
					<div
						class="max-w-[88%] min-w-0 overflow-hidden rounded-lg border border-accent/30 bg-accent/5 p-3 text-sm font-medium text-foreground shadow-ink sm:max-w-[85%] sm:p-4"
					>
						<div
							class="whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed"
							class:user-message-content-collapsed={isCollapsibleUserMessage(
								message
							) && !isUserMessageExpanded(message.id)}
						>
							{message.content}
						</div>
						{#if isCollapsibleUserMessage(message)}
							<button
								type="button"
								class="mt-2 text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-accent transition-opacity hover:opacity-80"
								onclick={() => toggleUserMessageExpansion(message.id)}
								aria-expanded={isUserMessageExpanded(message.id)}
							>
								{isUserMessageExpanded(message.id) ? 'Less' : 'More'}
							</button>
						{/if}
						<span
							class="mt-0.5 block text-right text-[0.55rem] leading-none tabular-nums text-accent/50"
						>
							{formatTime(message.timestamp)}
						</span>
					</div>
					<!-- Voice notes panel (outside bubble, can take full width when expanded) -->
					{#if message.metadata?.voice_note_group_id}
						{@const groupId = message.metadata.voice_note_group_id as string}
						<VoiceNoteGroupPanel
							{groupId}
							voiceNotes={voiceNotesByGroupId[groupId] ?? []}
							onDeleteNote={onDeleteVoiceNote}
							inline
						/>
					{/if}
				</div>
			{:else if message.type === 'assistant'}
				<!-- INKPRINT assistant message with Frame texture -->
				<div
					class="agent-resp-div clarity-zone min-w-0 overflow-hidden rounded-lg border border-border bg-card p-3 text-sm font-medium leading-relaxed text-foreground shadow-ink tx tx-frame tx-weak sm:p-4"
				>
					<div class="flex min-w-0 items-start gap-2 sm:gap-3">
						<!-- INKPRINT avatar badge -->
						<div
							class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-foreground text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-background shadow-ink sm:h-9 sm:w-9"
						>
							OS
						</div>
						<div class="min-w-0 flex-1">
							{#if shouldRenderAsMarkdown(message.content)}
								<div
									class="agent-markdown {proseClasses} overflow-x-auto break-words"
								>
									{@html renderMarkdown(message.content)}
								</div>
							{:else}
								<div
									class="whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed"
								>
									{message.content}
								</div>
							{/if}
						</div>
					</div>
					{#if message.metadata?.interrupted}
						<div
							class="mt-1 text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-amber-600 dark:text-amber-400"
							role="status"
							aria-live="polite"
						>
							Response interrupted
						</div>
					{/if}
					<span
						class="mt-0.5 block text-right text-[0.55rem] leading-none tabular-nums text-muted-foreground/50"
					>
						{formatTime(message.timestamp)}
					</span>
				</div>
			{:else if message.type === 'agent_peer'}
				<!-- INKPRINT agent peer message with Thread texture -->
				<div class="flex min-w-0 gap-2 sm:gap-3">
					<div
						class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-amber-600/30 bg-amber-50 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-amber-700 shadow-ink tx tx-thread tx-weak dark:bg-amber-950/30 dark:text-amber-400 sm:h-9 sm:w-9"
					>
						AI↔
					</div>
					<div
						class="max-w-[88%] min-w-0 overflow-hidden rounded-lg border border-amber-600/20 bg-amber-50/50 p-3 text-sm font-medium leading-relaxed text-foreground shadow-ink tx tx-thread tx-weak dark:bg-amber-950/10 sm:max-w-[85%] sm:p-4"
					>
						{#if shouldRenderAsMarkdown(message.content)}
							<div class="agent-markdown {proseClasses} overflow-x-auto break-words">
								{@html renderMarkdown(message.content)}
							</div>
						{:else}
							<div class="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
								{message.content}
							</div>
						{/if}
						<span
							class="mt-0.5 block text-right text-[0.55rem] leading-none tabular-nums text-amber-600/50 dark:text-amber-400/50"
						>
							{formatTime(message.timestamp)}
						</span>
					</div>
				</div>
			{:else if message.type === 'thinking_block'}
				<ThinkingBlock
					block={message as ThinkingBlockMessage}
					onToggleCollapse={onToggleThinkingBlock}
				/>
			{:else if message.type === 'clarification'}
				<!-- INKPRINT clarification message with Bloom texture -->
				<div class="flex min-w-0 gap-2 sm:gap-3">
					<div
						class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-600/30 bg-emerald-50 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-emerald-700 shadow-ink tx tx-bloom tx-weak dark:bg-emerald-950/30 dark:text-emerald-400 sm:h-9 sm:w-9"
					>
						AI
					</div>
					<div
						class="max-w-[90%] min-w-0 overflow-hidden rounded-lg border border-emerald-600/20 bg-emerald-50/50 p-3 text-sm font-medium leading-relaxed text-foreground shadow-ink tx tx-bloom tx-weak dark:bg-emerald-950/10 sm:max-w-[88%] sm:p-4"
					>
						<!-- INKPRINT micro-label heading -->
						<p
							class="text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-foreground"
						>
							{message.content}
						</p>

						{#if message.data?.questions?.length}
							<!-- INKPRINT questions list -->
							<ol class="mt-3 space-y-2 text-sm text-foreground">
								{#each message.data.questions as question, i}
									<li class="flex gap-2 font-medium leading-relaxed sm:gap-2.5">
										<!-- INKPRINT number badge -->
										<span
											class="flex h-5 w-5 shrink-0 items-center justify-center rounded-lg bg-foreground text-[0.65rem] font-bold text-background shadow-ink"
										>
											{i + 1}
										</span>
										<span class="min-w-0 flex-1">{question}</span>
									</li>
								{/each}
							</ol>
						{/if}

						<!-- INKPRINT hint -->
						<p
							class="mt-3 text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-muted-foreground"
						>
							Share the answers in your next message to continue
						</p>
						<span
							class="mt-0.5 block text-right text-[0.55rem] leading-none tabular-nums text-emerald-600/50 dark:text-emerald-400/50"
						>
							{formatTime(message.timestamp)}
						</span>
					</div>
				</div>
			{:else if message.type === 'activity'}
				{#if dev}
					<div
						class="rounded-lg border border-amber-600/30 bg-amber-50 px-2.5 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-amber-700 tx tx-static tx-weak dark:bg-amber-950/20 dark:text-amber-400"
					>
						⚠️ Dev Warning: Legacy activity message
					</div>
				{/if}
				<!-- Legacy activity with INKPRINT styling -->
				<div class="flex gap-1.5 text-[0.65rem] text-muted-foreground">
					<div class="w-12 shrink-0 pt-1 font-mono uppercase tracking-[0.1em]">
						{formatTime(message.timestamp)}
					</div>
					<div
						class="max-w-[65%] rounded-lg border border-border bg-muted px-2.5 py-1.5 text-sm font-medium italic leading-tight text-muted-foreground shadow-ink"
					>
						<p class="leading-snug">{message.content}</p>
					</div>
				</div>
			{:else}
				<!-- Default message with INKPRINT styling -->
				<div class="flex gap-1.5 text-[0.65rem] text-muted-foreground">
					<div class="w-12 shrink-0 pt-1 font-mono uppercase tracking-[0.1em]">
						{formatTime(message.timestamp)}
					</div>
					<div
						class="max-w-[65%] rounded-lg border border-border bg-muted px-2.5 py-1.5 text-sm font-medium italic leading-tight text-muted-foreground shadow-ink"
					>
						<p class="leading-snug">{message.content}</p>
					</div>
				</div>
			{/if}
		{/each}
	{/if}
</div>

<style>
	/* Skip rendering off-screen chat messages for scroll performance.
	   `auto 120px` tells the browser to remember the last rendered height
	   (falling back to 120px for never-rendered items), which prevents
	   layout estimation jumps when messages first appear on screen. */
	.agent-chat-scroll > :global(*) {
		content-visibility: auto;
		contain-intrinsic-size: auto 120px;
	}

	.user-message-content-collapsed {
		max-height: calc(10 * 1.625em);
		overflow: hidden;
	}

	.agent-markdown {
		color: hsl(var(--foreground));
		overflow-wrap: anywhere;
	}

	.agent-markdown :global(> :first-child) {
		margin-top: 0;
	}

	.agent-markdown :global(> :last-child) {
		margin-bottom: 0;
	}

	.agent-markdown :global(p) {
		margin-top: 0.4rem;
		margin-bottom: 0.4rem;
	}

	.agent-markdown :global(ul),
	.agent-markdown :global(ol) {
		margin-top: 0.5rem;
		margin-bottom: 0.5rem;
		padding-left: 1.35rem;
	}

	.agent-markdown :global(li) {
		margin-top: 0.18rem;
		margin-bottom: 0.18rem;
	}

	.agent-markdown :global(pre) {
		margin-top: 0.75rem;
		margin-bottom: 0.75rem;
		border: 1px solid hsl(var(--border));
		border-radius: 0.5rem;
	}

	.agent-markdown :global(pre code) {
		white-space: pre;
		overflow-wrap: normal;
	}

	.agent-markdown :global(table) {
		width: 100%;
		min-width: 46rem;
		margin-top: 0.75rem;
		margin-bottom: 0.75rem;
		border-collapse: separate;
		border-spacing: 0;
		overflow: hidden;
		border: 1px solid hsl(var(--border));
		border-radius: 0.5rem;
		font-size: 0.8rem;
		line-height: 1.45;
		table-layout: auto;
	}

	.agent-markdown :global(th),
	.agent-markdown :global(td) {
		border-right: 1px solid hsl(var(--border));
		border-bottom: 1px solid hsl(var(--border));
		min-width: 7rem;
		padding: 0.65rem 0.9rem;
		text-align: left;
		vertical-align: top;
		white-space: normal;
	}

	.agent-markdown :global(th:first-child),
	.agent-markdown :global(td:first-child) {
		min-width: 14rem;
	}

	.agent-markdown :global(th:nth-child(2)),
	.agent-markdown :global(td:nth-child(2)) {
		min-width: 18rem;
	}

	.agent-markdown :global(th) {
		background: hsl(var(--muted) / 0.75);
		color: hsl(var(--foreground));
		font-weight: 700;
	}

	.agent-markdown :global(td) {
		background: hsl(var(--card) / 0.86);
		color: hsl(var(--foreground));
	}

	.agent-markdown :global(tbody tr:nth-child(even) td) {
		background: hsl(var(--muted) / 0.32);
	}

	.agent-markdown :global(th:last-child),
	.agent-markdown :global(td:last-child) {
		border-right: 0;
	}

	.agent-markdown :global(tbody tr:last-child td) {
		border-bottom: 0;
	}

	.agent-markdown :global(th[align='center']),
	.agent-markdown :global(td[align='center']) {
		text-align: center;
	}

	.agent-markdown :global(th[align='right']),
	.agent-markdown :global(td[align='right']) {
		text-align: right;
	}
</style>
