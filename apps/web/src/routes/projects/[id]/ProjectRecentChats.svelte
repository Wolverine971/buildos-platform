<!-- apps/web/src/routes/projects/[id]/ProjectRecentChats.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { AlertCircle, ArrowUpRight, MessageSquare } from '$lib/icons/lucide';
	import {
		fetchProjectRecentChats,
		type ProjectRecentChatSummary
	} from '$lib/components/project/project-page-data-controller';

	interface Props {
		projectId: string;
		onOpenChat: (sessionId: string) => void;
	}

	let { projectId, onOpenChat }: Props = $props();

	let chats = $state.raw<ProjectRecentChatSummary[]>([]);
	let loading = $state(true);
	let loadingMore = $state(false);
	let error = $state<string | null>(null);
	let total = $state(0);
	let hasMore = $state(false);
	let showAll = $state(false);

	const pageSize = 6;
	const visibleChats = $derived(showAll ? chats : chats.slice(0, 3));

	async function loadChats(append = false) {
		if (append) {
			if (loadingMore || !hasMore) return;
			loadingMore = true;
		} else {
			loading = true;
		}
		error = null;

		try {
			const result = await fetchProjectRecentChats({
				projectId,
				limit: pageSize,
				offset: append ? chats.length : 0
			});
			chats = append ? [...chats, ...result.chats] : result.chats;
			total = result.total;
			hasMore = result.hasMore;
		} catch (loadError) {
			error = loadError instanceof Error ? loadError.message : 'Failed to load recent chats';
		} finally {
			loading = false;
			loadingMore = false;
		}
	}

	function formatActivityDate(value: string | null | undefined): string {
		if (!value) return 'No activity yet';
		const date = new Date(value);
		if (!Number.isFinite(date.getTime())) return 'No activity yet';
		const diffMs = Math.max(0, Date.now() - date.getTime());
		const diffMinutes = Math.floor(diffMs / 60_000);
		if (diffMinutes < 1) return 'just now';
		if (diffMinutes < 60) return `${diffMinutes}m ago`;
		const diffHours = Math.floor(diffMinutes / 60);
		if (diffHours < 24) return `${diffHours}h ago`;
		const diffDays = Math.floor(diffHours / 24);
		if (diffDays < 7) return `${diffDays}d ago`;
		return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	onMount(() => {
		void loadChats();
	});
</script>

<section class="recent-chats-section" aria-labelledby="recent-project-chats-title">
	<header class="flex min-h-11 items-center justify-between gap-2">
		<h2 id="recent-project-chats-title" class="text-sm font-semibold">Recent chats</h2>
		{#if !loading && !error && chats.length > 0}
			<Button
				variant="ghost"
				size="sm"
				aria-expanded={showAll}
				aria-controls="recent-project-chat-list"
				onclick={() => (showAll = !showAll)}
				>{showAll ? 'Show fewer chats' : 'View chats'}</Button
			>
		{/if}
	</header>
	{#if loading}
		<div
			class="h-11 animate-pulse rounded-md bg-muted/40 motion-reduce:animate-none"
			aria-label="Loading recent project chats"
		></div>
	{:else if error}
		<div class="flex min-h-11 items-center justify-between gap-3 py-2">
			<p class="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
				<AlertCircle class="h-4 w-4 shrink-0 text-destructive" />Unable to load recent chats
			</p>
			<Button variant="ghost" size="sm" onclick={() => void loadChats()}>Retry</Button>
		</div>
	{:else if chats.length === 0}
		<p class="py-2 text-sm text-muted-foreground">No project chats yet.</p>
	{:else}
		<div
			id="recent-project-chat-list"
			class="recent-chat-list"
			class:recent-chats-collapsed={!showAll}
		>
			{#each visibleChats as chat (chat.id)}
				<button
					type="button"
					class="recent-chat-row group pressable"
					aria-label={`Reopen chat: ${chat.title}`}
					onclick={() => onOpenChat(chat.id)}
				>
					<div class="flex min-w-0 items-center gap-2">
						<MessageSquare class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
						<span class="min-w-0 flex-1 truncate text-sm font-medium">{chat.title}</span
						>
						<span class="stamp shrink-0 text-2xs text-muted-foreground"
							>{formatActivityDate(chat.last_activity_at)}</span
						>
						<ArrowUpRight class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
					</div>
					{#if showAll}
						<p
							class="mt-1 line-clamp-2 pl-5 text-xs leading-relaxed text-muted-foreground"
						>
							{chat.summary ??
								(chat.message_count > 0
									? `${chat.message_count} messages in this conversation.`
									: 'Continue this project conversation.')}
						</p>
						{#if chat.focus_label || chat.chat_topics.length > 0}
							<p class="mt-1 truncate pl-5 text-2xs text-muted-foreground">
								{chat.focus_label ?? chat.chat_topics[0]}
							</p>
						{/if}
					{/if}
				</button>
			{/each}
		</div>
		{#if showAll && hasMore}
			<div class="flex justify-center pt-2">
				<Button
					variant="ghost"
					size="sm"
					loading={loadingMore}
					onclick={() => void loadChats(true)}
					>Load more chats ({chats.length}/{total})</Button
				>
			</div>
		{/if}
	{/if}
</section>

<style>
	.recent-chats-section {
		min-width: 0;
		border-bottom: 1px solid hsl(var(--border));
		padding-bottom: 0.75rem;
	}
	.recent-chat-list {
		display: grid;
		min-width: 0;
		gap: 0.25rem;
	}
	.recent-chat-row {
		display: block;
		min-height: 44px;
		min-width: 0;
		width: 100%;
		border-radius: 0.375rem;
		padding: 0.625rem;
		text-align: left;
		transition: background-color 120ms ease;
	}
	.recent-chat-row:hover {
		background: hsl(var(--muted) / 0.42);
	}
	.recent-chat-row:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: -2px;
	}
	@media (max-width: 639px) {
		.recent-chats-collapsed .recent-chat-row:not(:first-child) {
			display: none;
		}
	}
	@media (min-width: 640px) {
		.recent-chats-collapsed {
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: 0.75rem;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.recent-chat-row {
			transition: none;
		}
	}
</style>
