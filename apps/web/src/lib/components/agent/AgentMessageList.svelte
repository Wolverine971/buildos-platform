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

	// ✅ Svelte 5: Use $bindable() for two-way binding
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
	class="agent-chat-scroll flex-1 min-h-0 space-y-2 overflow-y-auto overscroll-contain bg-muted px-3 py-3 sm:px-4 sm:py-4"
	style="overflow-anchor: none; -webkit-overflow-scrolling: touch;"
>
	{#if messages.length === 0}
		<!-- INKPRINT empty state card with Bloom texture -->
		<div
			class="rounded-lg border-2 border-dashed border-border bg-card px-4 py-3 tx tx-bloom tx-weak shadow-ink sm:px-5 sm:py-4"
		>
			<div class="space-y-2">
				<!-- INKPRINT micro-label heading -->
				<p class="text-[0.65rem] font-bold uppercase tracking-[0.15em] text-accent">
					READY TO OPERATE
				</p>
				<!-- Body text -->
				<p class="text-sm font-medium leading-relaxed text-muted-foreground">
					Ask BuildOS to plan, explain, or take the next step for
					{displayContextLabel.toLowerCase()}.
				</p>
				<!-- Suggestion list -->
				<ul class="space-y-1.5 text-sm font-medium text-muted-foreground">
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
						class="max-w-[88%] min-w-0 overflow-hidden rounded-lg border border-accent/30 bg-accent/5 px-3 py-2.5 text-sm font-medium text-foreground shadow-ink sm:max-w-[85%] sm:px-4 sm:py-3"
					>
						<div
							class="whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed"
						>
							{message.content}
						</div>
						<!-- INKPRINT: Timestamp -->
						<div
							class="mt-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-accent"
						>
							{formatTime(message.timestamp)}
						</div>
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
				<div class="flex sm:gap-3">
					<!-- INKPRINT avatar badge - DESKTOP ONLY -->
					<div
						class="hidden sm:flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-foreground text-[0.65rem] font-bold uppercase tracking-[0.1em] text-background shadow-ink"
					>
						OS
					</div>
					<div
						class="agent-resp-div clarity-zone min-w-0 overflow-hidden rounded-lg border border-border bg-card px-3 py-2.5 text-sm font-medium leading-relaxed text-foreground shadow-ink tx tx-frame tx-weak sm:max-w-[85%] sm:px-4 sm:py-3"
					>
						{#if shouldRenderAsMarkdown(message.content)}
							<div
								class="{proseClasses} overflow-x-auto break-words [&>*:nth-child(2)]:mt-0"
							>
								<!-- INKPRINT avatar badge - MOBILE ONLY (floated inside BFC for text wrap) -->
								<div
									class="sm:hidden float-left mr-2.5 mb-1 flex h-6 w-6 items-center justify-center rounded-md border border-border bg-foreground text-[0.5rem] font-bold uppercase tracking-[0.05em] text-background shadow-ink"
								>
									OS
								</div>
								{@html renderMarkdown(message.content)}
							</div>
						{:else}
							<div class="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
								<!-- INKPRINT avatar badge - MOBILE ONLY (floated for text wrap) -->
								<div
									class="sm:hidden float-left mr-2.5 mb-1 flex h-6 w-6 items-center justify-center rounded-md border border-border bg-foreground text-[0.5rem] font-bold uppercase tracking-[0.05em] text-background shadow-ink"
								>
									OS
								</div>
								{message.content}
							</div>
						{/if}
						{#if message.metadata?.interrupted}
							<div
								class="mt-1 text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-amber-600 dark:text-amber-400"
								role="status"
								aria-live="polite"
							>
								Response interrupted
							</div>
						{/if}
						<!-- INKPRINT micro-label timestamp -->
						<div
							class="mt-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-muted-foreground"
						>
							{formatTime(message.timestamp)}
						</div>
					</div>
				</div>
			{:else if message.type === 'agent_peer'}
				<!-- INKPRINT agent peer message with Thread texture -->
				<div class="flex gap-2 sm:gap-3">
					<div
						class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-amber-600/30 bg-amber-50 text-[0.65rem] font-bold uppercase tracking-[0.1em] text-amber-700 shadow-ink tx tx-thread tx-weak dark:bg-amber-950/30 dark:text-amber-400 sm:h-9 sm:w-9"
					>
						AI↔
					</div>
					<div
						class="max-w-[88%] min-w-0 overflow-hidden rounded-lg border border-amber-600/20 bg-amber-50/50 px-3 py-2.5 text-sm font-medium leading-relaxed text-foreground shadow-ink tx tx-thread tx-weak dark:bg-amber-950/10 sm:max-w-[85%] sm:px-4 sm:py-3"
					>
						{#if shouldRenderAsMarkdown(message.content)}
							<div class="{proseClasses} overflow-x-auto break-words">
								{@html renderMarkdown(message.content)}
							</div>
						{:else}
							<div class="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
								{message.content}
							</div>
						{/if}
						<!-- INKPRINT micro-label timestamp -->
						<div
							class="mt-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-amber-600 dark:text-amber-400"
						>
							{formatTime(message.timestamp)}
						</div>
					</div>
				</div>
			{:else if message.type === 'thinking_block'}
				<ThinkingBlock
					block={message as ThinkingBlockMessage}
					onToggleCollapse={onToggleThinkingBlock}
				/>
			{:else if message.type === 'clarification'}
				<!-- INKPRINT clarification message with Bloom texture -->
				<div class="flex gap-2 sm:gap-3">
					<div
						class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-600/30 bg-emerald-50 text-[0.65rem] font-bold uppercase tracking-[0.1em] text-emerald-700 shadow-ink tx tx-bloom tx-weak dark:bg-emerald-950/30 dark:text-emerald-400 sm:h-9 sm:w-9"
					>
						AI
					</div>
					<div
						class="max-w-[90%] min-w-0 overflow-hidden rounded-lg border border-emerald-600/20 bg-emerald-50/50 px-3 py-3 text-sm font-medium leading-relaxed text-foreground shadow-ink tx tx-bloom tx-weak dark:bg-emerald-950/10 sm:max-w-[88%] sm:px-4 sm:py-3.5"
					>
						<!-- INKPRINT micro-label heading -->
						<p
							class="text-[0.65rem] font-bold uppercase tracking-[0.15em] text-foreground"
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
						<div
							class="mt-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-emerald-600 dark:text-emerald-400"
						>
							{formatTime(message.timestamp)}
						</div>
					</div>
				</div>
			{:else if message.type === 'plan'}
				{#if dev}
					<div
						class="rounded-lg border border-amber-600/30 bg-amber-50 px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-amber-700 tx tx-static tx-weak dark:bg-amber-950/20 dark:text-amber-400"
					>
						⚠️ Dev Warning: Legacy plan message
					</div>
				{/if}
				<!-- Legacy plan with INKPRINT styling -->
				<div class="flex gap-1.5 text-[0.65rem] text-muted-foreground">
					<div class="w-12 shrink-0 pt-[2px] font-mono uppercase tracking-[0.1em]">
						{formatTime(message.timestamp)}
					</div>
					<div
						class="max-w-[75%] rounded-lg border border-border bg-card px-2 py-1.5 text-sm leading-snug text-foreground shadow-ink"
					>
						<p
							class="text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-muted-foreground"
						>
							Plan
						</p>
						<p class="mt-0.5 text-foreground">
							{message.content}
						</p>
						{#if message.data?.steps}
							<ol class="mt-1 space-y-0.5 text-sm text-muted-foreground">
								{#each message.data.steps as step}
									<li class="flex gap-1.5 leading-tight">
										<span class="w-3 text-right font-semibold">
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
						class="rounded-lg border border-amber-600/30 bg-amber-50 px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-amber-700 tx tx-static tx-weak dark:bg-amber-950/20 dark:text-amber-400"
					>
						⚠️ Dev Warning: Legacy activity message
					</div>
				{/if}
				<!-- Legacy activity with INKPRINT styling -->
				<div class="flex gap-1.5 text-[0.65rem] text-muted-foreground">
					<div class="w-12 shrink-0 pt-[2px] font-mono uppercase tracking-[0.1em]">
						{formatTime(message.timestamp)}
					</div>
					<div
						class="max-w-[65%] rounded-lg border border-border bg-muted px-2 py-1 text-sm font-medium italic leading-tight text-muted-foreground shadow-ink"
					>
						<p class="leading-snug">{message.content}</p>
					</div>
				</div>
			{:else}
				<!-- Default message with INKPRINT styling -->
				<div class="flex gap-1.5 text-[0.65rem] text-muted-foreground">
					<div class="w-12 shrink-0 pt-[2px] font-mono uppercase tracking-[0.1em]">
						{formatTime(message.timestamp)}
					</div>
					<div
						class="max-w-[65%] rounded-lg border border-border bg-muted px-2 py-1 text-sm font-medium italic leading-tight text-muted-foreground shadow-ink"
					>
						<p class="leading-snug">{message.content}</p>
					</div>
				</div>
			{/if}
		{/each}
	{/if}
</div>
