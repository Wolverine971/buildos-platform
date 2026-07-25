<!-- apps/web/src/lib/components/briefs/BriefChatModal.svelte -->
<!--
	BriefChatModal - Two-pane modal for Daily Brief + Agent Chat

	Layout:
	- Desktop (≥768px): Split pane — brief left (flex-1, min 400px), chat right (w-[420px])
	- Mobile (<768px): Bottom-sheet with tabbed view — Brief tab / Chat tab

	Mobile UX:
	- Bottom-sheet slide-up animation with drag handle
	- Swipe-to-dismiss gesture (120px threshold)
	- Safe area insets for iPhone notch/home indicator
	- 44px WCAG AA touch targets on tabs
	- Landscape-optimized compact layout
	- Overscroll containment on all panes

	Design: INKPRINT texture-based design language
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { X, FileText, MessageCircle } from 'lucide-svelte';
	import { renderMarkdown } from '$lib/utils/markdown';
	import AgentChatModal from '$lib/components/agent/AgentChatModal.svelte';
	import ChatSessionAuditActions from '$lib/components/agent/ChatSessionAuditActions.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import type { DailyBrief } from '$lib/types/daily-brief';
	import type { DataMutationSummary } from '$lib/components/agent/agent-chat.types';

	interface Props {
		isOpen?: boolean;
		brief: DailyBrief;
		title?: string;
		initialTab?: 'brief' | 'chat';
		initialChatSessionId?: string | null;
		onClose?: (summary?: DataMutationSummary) => void;
	}

	let {
		isOpen = $bindable(false),
		brief,
		title,
		initialTab = 'chat',
		initialChatSessionId = null,
		onClose
	}: Props = $props();

	let activeTab = $state<'brief' | 'chat'>('chat');
	let lastSummary = $state<DataMutationSummary | undefined>(undefined);
	// Active chat session id, mirrored up from the embedded AgentChatModal so
	// session actions (Logs / Export) can live in this modal's header bar.
	let chatSessionId = $state<string | null>(untrack(() => initialChatSessionId));
	let briefChatEntityId = $derived(brief.chat_brief_id || brief.id);
	let displayTitle = $derived(title ?? `Daily Brief — ${formatBriefDate(brief.brief_date)}`);

	// Tab badge state
	let chatTabHasUnread = $state(false);
	let briefTabHasUpdates = $state(false);

	function handleChatClose(summary?: DataMutationSummary) {
		lastSummary = summary;
		onClose?.(summary);
	}

	function requestClose() {
		isOpen = false;
		if (!lastSummary) {
			onClose?.();
		}
	}

	function switchTab(tab: 'brief' | 'chat') {
		activeTab = tab;
		// Clear badge when switching to that tab
		if (tab === 'chat') chatTabHasUnread = false;
		if (tab === 'brief') briefTabHasUpdates = false;
	}

	function formatBriefDate(dateStr: string): string {
		try {
			const date = new Date(dateStr + 'T00:00:00');
			return date.toLocaleDateString('en-US', {
				weekday: 'long',
				year: 'numeric',
				month: 'long',
				day: 'numeric'
			});
		} catch {
			return dateStr;
		}
	}

	// Reset state when modal opens
	$effect(() => {
		if (isOpen) {
			lastSummary = undefined;
			activeTab = initialTab;
			chatTabHasUnread = false;
			briefTabHasUpdates = false;
			chatSessionId = initialChatSessionId;
		}
	});
</script>

<Modal
	bind:isOpen
	onClose={requestClose}
	size="full"
	variant="bottom-sheet"
	presentation="immersive"
	contentScrollable={false}
	ariaLabel="Brief Chat"
>
	{#snippet header()}
		<div
			class="brief-header flex h-11 md:h-12 items-center justify-between gap-3 px-3 md:px-4
							border-b border-border bg-muted flex-shrink-0"
		>
			<h2 class="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
				{displayTitle}
			</h2>
			<div class="flex shrink-0 items-center gap-1.5 sm:gap-2">
				<ChatSessionAuditActions sessionId={chatSessionId} />
				<button
					type="button"
					onclick={requestClose}
					class="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg
									border border-border bg-card text-muted-foreground shadow-ink
									transition-all pressable tx-button
									hover:border-destructive/50 hover:text-destructive
									focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					aria-label="Close dialog"
				>
					<X class="h-4 w-4" />
				</button>
			</div>
		</div>
	{/snippet}

	<!-- Mobile tab selector -->
	<div class="brief-tabs flex md:hidden border-b border-border bg-muted/50 flex-shrink-0">
		<button
			type="button"
			class="brief-tab flex-1 flex items-center justify-center gap-1.5 h-11 text-sm font-semibold transition-colors relative
								{activeTab === 'brief'
				? 'text-foreground border-b-2 border-accent'
				: 'text-muted-foreground hover:text-foreground'}"
			onclick={() => switchTab('brief')}
		>
			<FileText class="h-4 w-4 landscape-only-icon" />
			<span>Brief</span>
			{#if briefTabHasUpdates}
				<span class="absolute top-2 right-[calc(50%-24px)] w-2 h-2 rounded-full bg-accent"
				></span>
			{/if}
		</button>
		<button
			type="button"
			class="brief-tab flex-1 flex items-center justify-center gap-1.5 h-11 text-sm font-semibold transition-colors relative
								{activeTab === 'chat'
				? 'text-foreground border-b-2 border-accent'
				: 'text-muted-foreground hover:text-foreground'}"
			onclick={() => switchTab('chat')}
		>
			<MessageCircle class="h-4 w-4 landscape-only-icon" />
			<span>Chat</span>
			{#if chatTabHasUnread}
				<span class="absolute top-2 right-[calc(50%-20px)] w-2 h-2 rounded-full bg-accent"
				></span>
			{/if}
		</button>
	</div>

	<!-- Content area: two panes -->
	<div class="flex min-h-0 min-w-0 flex-1 overflow-hidden">
		<!-- Left pane: Brief content -->
		<div
			class="min-w-0 flex-col overflow-y-auto border-border bg-card md:border-r
								brief-scroll brief-pane
								{activeTab === 'brief' ? 'flex' : 'hidden'} md:flex
								md:flex-1"
			style="touch-action: pan-y;"
		>
			<div class="px-3 py-3 md:px-4 md:py-4">
				<div
					class="prose prose-sm max-w-none overflow-x-auto break-words
										prose-headings:text-foreground prose-p:text-foreground prose-li:text-foreground
										prose-strong:text-foreground prose-a:text-accent prose-blockquote:text-muted-foreground
										prose-blockquote:border-border prose-code:bg-muted prose-code:text-foreground
										prose-pre:bg-muted prose-pre:text-foreground prose-hr:border-border"
				>
					{@html renderMarkdown(brief.summary_content)}
				</div>
			</div>
		</div>

		<!-- Right pane: Chat -->
		<div
			class="brief-pane min-h-0 min-w-0 flex-col
								{activeTab === 'chat' ? 'flex' : 'hidden'} md:flex
								w-full md:w-[340px] lg:w-[420px] md:flex-shrink-0"
			style="touch-action: pan-y;"
		>
			<AgentChatModal
				embedded={true}
				{isOpen}
				contextType="daily_brief"
				entityId={briefChatEntityId}
				{initialChatSessionId}
				onClose={handleChatClose}
				onSessionChange={(sessionId) => (chatSessionId = sessionId)}
			/>
		</div>
	</div>
</Modal>

<style>
	/* ==================== Tab Styling ==================== */

	.brief-tab {
		touch-action: manipulation;
	}

	/* In landscape with short viewport, hide tab text and show icons only */
	@media (orientation: landscape) and (max-height: 500px) {
		.brief-tab span {
			display: none;
		}
		/* :global needed because class is applied on Svelte component props */
		.brief-tab :global(.landscape-only-icon) {
			width: 1.25rem;
			height: 1.25rem;
		}
	}

	/* ==================== Content Panes ==================== */

	.brief-pane {
		overscroll-behavior: contain;
	}

	/* ==================== Brief Scroll Pane ==================== */

	.brief-scroll {
		overscroll-behavior: contain;
		scrollbar-gutter: stable;
		scrollbar-width: thin;
		scrollbar-color: hsl(var(--muted-foreground) / 0.3) hsl(var(--muted));
	}

	:global(.brief-scroll::-webkit-scrollbar) {
		width: 8px;
	}

	:global(.brief-scroll::-webkit-scrollbar-track) {
		background: hsl(var(--muted));
		border-radius: 0.5rem;
	}

	:global(.brief-scroll::-webkit-scrollbar-thumb) {
		background: hsl(var(--muted-foreground) / 0.3);
		border-radius: 0.5rem;
	}

	:global(.brief-scroll::-webkit-scrollbar-thumb:hover) {
		background: hsl(var(--muted-foreground) / 0.5);
	}

	/* ==================== Landscape Optimization ==================== */

	@media (orientation: landscape) and (max-height: 500px) {
		.brief-header {
			/* Compact header in landscape */
			height: 2.5rem;
		}

		.brief-tabs {
			/* Shorter tabs in landscape */
			height: 2.5rem;
		}

		.brief-tab {
			height: 2.5rem;
		}
	}
</style>
