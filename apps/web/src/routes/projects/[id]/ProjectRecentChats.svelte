<!-- apps/web/src/routes/projects/[id]/ProjectRecentChats.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import {
		AlertCircle,
		ArrowUpRight,
		Clock,
		MessageSquare,
		MessagesSquare
	} from '$lib/icons/lucide';
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
	<header class="flex flex-wrap items-center justify-between gap-2 px-1 pb-3">
		<div class="flex min-w-0 items-center gap-3">
			<div class="section-icon bg-accent/10">
				<MessagesSquare class="h-4 w-4 text-accent" />
			</div>
			<div class="min-w-0">
				<h2 id="recent-project-chats-title" class="text-sm font-semibold">Recent chats</h2>
				<p class="text-xs text-muted-foreground">
					Reopen conversations held in this project.
				</p>
			</div>
		</div>
		{#if !loading && !error && total > 0}
			<span class="text-2xs font-medium text-muted-foreground">
				{total}
				{total === 1 ? 'chat' : 'chats'}
			</span>
		{/if}
	</header>

	{#if loading}
		<div class="recent-chat-rail" aria-label="Loading recent project chats">
			{#each Array(3) as _, index (index)}
				<div
					class="h-28 min-w-[82%] animate-pulse snap-start rounded-md border border-border bg-muted/40 motion-reduce:animate-none sm:min-w-0"
				></div>
			{/each}
		</div>
	{:else if error}
		<div class="flex min-h-20 flex-wrap items-center justify-between gap-3 px-2 py-3">
			<div class="flex min-w-0 items-start gap-2">
				<AlertCircle class="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
				<div>
					<p class="text-sm font-semibold text-foreground">Unable to load recent chats</p>
					<p class="text-xs text-muted-foreground">{error}</p>
				</div>
			</div>
			<Button variant="ghost" size="sm" onclick={() => void loadChats()}>Retry</Button>
		</div>
	{:else if chats.length === 0}
		<div class="flex min-h-20 items-center gap-3 px-2 py-3 text-muted-foreground">
			<MessageSquare class="h-5 w-5 shrink-0" />
			<div>
				<p class="text-sm font-semibold text-foreground">No project chats yet</p>
				<p class="text-xs">Conversations will appear here after the first project chat.</p>
			</div>
		</div>
	{:else}
		<div class="recent-chat-rail">
			{#each visibleChats as chat (chat.id)}
				<button
					type="button"
					class="recent-chat-card group pressable"
					aria-label={`Reopen chat: ${chat.title}`}
					onclick={() => onOpenChat(chat.id)}
				>
					<div class="flex min-w-0 items-start justify-between gap-2">
						<div class="flex min-w-0 items-center gap-2">
							<MessageSquare class="h-3.5 w-3.5 shrink-0 text-accent" />
							<p class="truncate text-sm font-semibold text-foreground">
								{chat.title}
							</p>
						</div>
						<ArrowUpRight
							class="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-accent motion-reduce:transition-none"
						/>
					</div>

					<p class="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
						{chat.summary ??
							(chat.message_count > 0
								? `${chat.message_count} messages in this conversation.`
								: 'Continue this project conversation.')}
					</p>

					<div
						class="mt-auto flex min-w-0 items-center gap-2 pt-3 text-2xs text-muted-foreground"
					>
						<span class="inline-flex shrink-0 items-center gap-1">
							<Clock class="h-3 w-3" />
							{formatActivityDate(chat.last_activity_at)}
						</span>
						{#if chat.focus_label}
							<span class="truncate">· {chat.focus_label}</span>
						{:else if chat.chat_topics.length > 0}
							<span class="truncate">· {chat.chat_topics[0]}</span>
						{/if}
					</div>
				</button>
			{/each}
		</div>

		{#if chats.length > 3 || hasMore}
			<div class="flex justify-center pt-2">
				{#if !showAll}
					<Button variant="ghost" size="sm" onclick={() => (showAll = true)}>
						Show all recent chats
					</Button>
				{:else if hasMore}
					<Button
						variant="ghost"
						size="sm"
						loading={loadingMore}
						onclick={() => void loadChats(true)}
					>
						Load more chats
					</Button>
				{:else}
					<Button variant="ghost" size="sm" onclick={() => (showAll = false)}>
						Show fewer chats
					</Button>
				{/if}
			</div>
		{/if}
	{/if}
</section>

<style>
	.section-icon {
		display: flex;
		height: 2.25rem;
		width: 2.25rem;
		flex-shrink: 0;
		align-items: center;
		justify-content: center;
		border-radius: 0.5rem;
	}

	.recent-chats-section {
		min-width: 0;
		border-top: 1px solid hsl(var(--border));
		border-bottom: 1px solid hsl(var(--border));
		padding: 1rem 0;
	}

	.recent-chat-rail {
		display: flex;
		min-width: 0;
		gap: 0.75rem;
		overflow-x: auto;
		scroll-snap-type: x mandatory;
		overscroll-behavior-inline: contain;
		padding: 0.125rem 0.25rem 0.375rem;
	}

	.recent-chat-card {
		display: flex;
		min-height: 7rem;
		min-width: 82%;
		scroll-snap-align: start;
		flex-direction: column;
		border-right: 1px solid hsl(var(--border));
		border-radius: 0.5rem;
		padding: 0.75rem;
		text-align: left;
		transition:
			background-color 120ms ease,
			border-color 120ms ease;
	}

	.recent-chat-card:hover {
		background: hsl(var(--muted) / 0.42);
		border-color: hsl(var(--accent) / 0.35);
	}

	.recent-chat-card:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: -2px;
	}

	@media (min-width: 640px) {
		.recent-chat-rail {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			overflow: visible;
		}

		.recent-chat-card {
			min-width: 0;
		}
	}

	@media (min-width: 1024px) {
		.recent-chat-rail {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.recent-chat-card {
			transition: none;
		}
	}
</style>
