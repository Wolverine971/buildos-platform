<!-- apps/web/src/lib/components/briefs/BriefChatModal.svelte -->
<!--
	BriefChatModal - Two-pane modal for Daily Brief + Agent Chat

	Layout:
	- Desktop (≥768px): Split pane — brief left (flex-1, min 400px), chat right (w-[420px])
	- Mobile (<768px): Tabbed view — Brief tab / Chat tab

	Design: INKPRINT texture-based design language
-->
<script lang="ts">
	import { fade } from 'svelte/transition';
	import { onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { X } from 'lucide-svelte';
	import { portal } from '$lib/actions/portal';
	import { lockBodyScroll, unlockBodyScroll } from '$lib/utils/body-scroll-lock';
	import { renderMarkdown } from '$lib/utils/markdown';
	import AgentChatModal from '$lib/components/agent/AgentChatModal.svelte';
	import type { DailyBrief } from '$lib/types/daily-brief';
	import type { DataMutationSummary } from '$lib/components/agent/agent-chat.types';

	interface Props {
		isOpen?: boolean;
		brief: DailyBrief;
		initialChatSessionId?: string | null;
		onClose?: (summary?: DataMutationSummary) => void;
	}

	let { isOpen = false, brief, initialChatSessionId = null, onClose }: Props = $props();

	let activeTab = $state<'brief' | 'chat'>('chat');
	let scrollLockHeld = $state(false);
	let lastSummary = $state<DataMutationSummary | undefined>(undefined);
	let briefChatEntityId = $derived(brief.chat_brief_id || brief.id);

	function handleChatClose(summary?: DataMutationSummary) {
		// Store the summary from AgentChatModal's handleClose
		lastSummary = summary;
		onClose?.(summary);
	}

	function handleBackdropClick(event: MouseEvent | TouchEvent) {
		if (event.target === event.currentTarget) {
			requestClose();
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (!isOpen) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			requestClose();
		}
	}

	function requestClose() {
		// Setting isOpen to false will cause the embedded AgentChatModal
		// to detect the transition and call handleClose() with the summary
		isOpen = false;
		// If the chat didn't fire its own close (e.g., no chat session was started),
		// still notify the parent
		if (!lastSummary) {
			onClose?.();
		}
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

	$effect(() => {
		if (browser && isOpen && !scrollLockHeld) {
			lockBodyScroll();
			scrollLockHeld = true;
		} else if (browser && !isOpen && scrollLockHeld) {
			unlockBodyScroll();
			scrollLockHeld = false;
		}
	});

	// Reset state when modal opens
	$effect(() => {
		if (isOpen) {
			lastSummary = undefined;
			activeTab = 'chat';
		}
	});

	onDestroy(() => {
		if (browser && scrollLockHeld) {
			unlockBodyScroll();
			scrollLockHeld = false;
		}
	});
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
	<div use:portal class="brief-chat-root" transition:fade={{ duration: 100 }} role="presentation">
		<!-- Backdrop -->
		<div
			class="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm z-[9998]"
			style="touch-action: none;"
			onclick={handleBackdropClick}
			aria-hidden="true"
		></div>

		<!-- Modal container -->
		<div class="fixed inset-0 z-[9999] overflow-hidden" style="touch-action: none;">
			<div class="flex h-full items-center justify-center p-2 sm:p-4" role="presentation">
				<!-- Modal content -->
				<div
					class="w-full max-w-7xl h-[calc(100dvh-1rem)] sm:h-[90dvh]
						bg-card border border-border rounded-lg shadow-ink-strong
						flex flex-col overflow-hidden
						tx tx-frame tx-weak animate-modal-scale"
					role="dialog"
					aria-modal="true"
					aria-label="Brief Chat"
				>
					<!-- Header bar -->
					<div
						class="flex h-12 items-center justify-between gap-3 px-4
							border-b border-border bg-muted flex-shrink-0"
					>
						<h2 class="text-sm font-semibold text-foreground truncate">
							Daily Brief — {formatBriefDate(brief.brief_date)}
						</h2>
						<button
							type="button"
							onclick={requestClose}
							class="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg
								border border-border bg-card text-muted-foreground shadow-ink
								transition-all pressable tx-button
								hover:border-red-600/50 hover:text-red-600
								focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
								dark:hover:border-red-400/50 dark:hover:text-red-400"
							aria-label="Close dialog"
						>
							<X class="h-4 w-4" />
						</button>
					</div>

					<!-- Mobile tab selector -->
					<div class="flex md:hidden border-b border-border bg-muted/50 flex-shrink-0">
						<button
							type="button"
							class="flex-1 px-4 py-2 text-sm font-semibold transition-colors
								{activeTab === 'brief'
								? 'text-foreground border-b-2 border-accent'
								: 'text-muted-foreground hover:text-foreground'}"
							onclick={() => (activeTab = 'brief')}
						>
							Brief
						</button>
						<button
							type="button"
							class="flex-1 px-4 py-2 text-sm font-semibold transition-colors
								{activeTab === 'chat'
								? 'text-foreground border-b-2 border-accent'
								: 'text-muted-foreground hover:text-foreground'}"
							onclick={() => (activeTab = 'chat')}
						>
							Chat
						</button>
					</div>

					<!-- Content area: two panes -->
					<div class="flex flex-1 min-h-0 overflow-hidden">
						<!-- Left pane: Brief content -->
						<div
							class="flex-col overflow-y-auto border-r border-border bg-card
								brief-scroll
								{activeTab === 'brief' ? 'flex' : 'hidden'} md:flex
								md:flex-1 md:min-w-[400px]"
						>
							<div class="px-4 sm:px-6 py-6">
								<div
									class="prose prose-sm dark:prose-invert max-w-none
										prose-headings:font-semibold prose-headings:text-foreground dark:prose-headings:text-white
										prose-p:text-muted-foreground dark:prose-p:text-muted-foreground
										prose-li:text-muted-foreground dark:prose-li:text-muted-foreground
										prose-strong:text-foreground dark:prose-strong:text-muted-foreground
										prose-blockquote:text-muted-foreground dark:prose-blockquote:text-muted-foreground
										prose-blockquote:border-border dark:prose-blockquote:border-gray-600
										prose-code:bg-muted dark:prose-code:bg-gray-800
										prose-code:text-foreground dark:prose-code:text-muted-foreground
										prose-pre:bg-muted dark:prose-pre:bg-gray-800"
								>
									{@html renderMarkdown(brief.summary_content)}
								</div>
							</div>
						</div>

						<!-- Right pane: Chat -->
						<div
							class="flex-col min-h-0
								{activeTab === 'chat' ? 'flex' : 'hidden'} md:flex
								w-full md:w-[340px] lg:w-[420px] md:flex-shrink-0"
						>
							<AgentChatModal
								embedded={true}
								{isOpen}
								contextType="daily_brief"
								entityId={briefChatEntityId}
								{initialChatSessionId}
								onClose={handleChatClose}
							/>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.brief-chat-root {
		overscroll-behavior: contain;
		z-index: 9999;
		position: relative;
	}

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
</style>
