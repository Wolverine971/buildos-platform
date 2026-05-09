<!-- apps/web/src/lib/components/project/RecentProjectChatsModal.svelte -->
<script lang="ts">
	import {
		AlertCircle,
		ChevronRight,
		Clock,
		LoaderCircle,
		MessageSquare,
		MessagesSquare
	} from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import {
		fetchProjectRecentChats,
		type ProjectRecentChatSummary
	} from '$lib/components/project/project-page-data-controller';

	interface Props {
		isOpen?: boolean;
		projectId: string;
		projectName?: string | null;
		onClose: () => void;
		onSelectChat: (sessionId: string) => void;
	}

	let { isOpen = false, projectId, projectName, onClose, onSelectChat }: Props = $props();

	let chats = $state<ProjectRecentChatSummary[]>([]);
	let loaded = $state(false);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let hasMore = $state(false);
	let total = $state(0);
	let loadedProjectId = $state<string | null>(null);
	const pageSize = 10;

	async function loadChats(reset = false) {
		if (loading) return;
		loading = true;
		error = null;
		try {
			const page = await fetchProjectRecentChats({
				projectId,
				limit: pageSize,
				offset: reset ? 0 : chats.length
			});
			chats = reset ? page.chats : [...chats, ...page.chats];
			hasMore = page.hasMore;
			total = page.total;
			loaded = true;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load recent chats';
			loaded = true;
		} finally {
			loading = false;
		}
	}

	function formatActivityDate(value: string | null | undefined): string {
		if (!value) return 'No activity yet';
		const date = new Date(value);
		const diffMs = Date.now() - date.getTime();
		const diffMin = Math.round(diffMs / 60000);
		if (diffMin < 1) return 'just now';
		if (diffMin < 60) return `${diffMin}m ago`;
		const diffHr = Math.round(diffMin / 60);
		if (diffHr < 24) return `${diffHr}h ago`;
		const diffDay = Math.round(diffHr / 24);
		if (diffDay < 7) return `${diffDay}d ago`;
		return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	function handleSelect(chat: ProjectRecentChatSummary) {
		onSelectChat(chat.id);
	}

	$effect(() => {
		if (projectId === loadedProjectId) return;
		loadedProjectId = projectId;
		chats = [];
		loaded = false;
		loading = false;
		error = null;
		hasMore = false;
		total = 0;
	});

	$effect(() => {
		if (isOpen && !loaded && !loading) {
			void loadChats(true);
		}
	});
</script>

<Modal
	{isOpen}
	{onClose}
	title="Recent chats"
	size="md"
	variant="bottom-sheet"
	ariaLabel="Recent project chats"
>
	<div class="p-3 sm:p-4 space-y-3">
		<div class="flex items-center gap-2 text-xs text-muted-foreground">
			<MessagesSquare class="h-3.5 w-3.5 text-accent" />
			<span class="truncate">{projectName ?? 'Project'}</span>
			{#if loaded && total > 0}
				<span
					class="shrink-0 rounded-full border border-border bg-muted/60 px-1.5 py-0.5 text-[10px]"
				>
					{total}
				</span>
			{/if}
		</div>

		{#if loading && chats.length === 0}
			<div class="flex items-center justify-center py-10">
				<LoaderCircle class="h-5 w-5 animate-spin text-muted-foreground" />
			</div>
		{:else if error}
			<div class="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
				<div class="flex items-start gap-2">
					<AlertCircle class="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
					<div class="min-w-0">
						<p class="text-sm font-medium text-destructive">Unable to load chats</p>
						<p class="mt-0.5 text-xs text-destructive/80">{error}</p>
					</div>
				</div>
				<button
					type="button"
					onclick={() => loadChats(true)}
					class="mt-3 rounded-md border border-destructive/30 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 pressable"
				>
					Retry
				</button>
			</div>
		{:else if loaded && chats.length === 0}
			<div
				class="rounded-lg border border-dashed border-border bg-muted/40 px-4 py-8 text-center"
			>
				<MessagesSquare class="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
				<p class="text-sm font-medium text-foreground">No recent chats yet</p>
				<p class="mt-1 text-xs text-muted-foreground">
					Project conversations will appear here after you start chatting.
				</p>
			</div>
		{:else}
			<div class="space-y-1.5">
				{#each chats as chat (chat.id)}
					<button
						type="button"
						onclick={() => handleSelect(chat)}
						class="group w-full rounded-lg border border-border bg-background px-3 py-2.5 text-left transition-colors hover:border-accent/40 hover:bg-muted/35 pressable"
					>
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2 min-w-0">
									<MessageSquare class="h-3.5 w-3.5 shrink-0 text-accent" />
									<p class="truncate text-sm font-semibold text-foreground">
										{chat.title}
									</p>
								</div>
								{#if chat.summary}
									<p
										class="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground"
									>
										{chat.summary}
									</p>
								{/if}
								<div
									class="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground"
								>
									<span class="inline-flex items-center gap-1">
										<Clock class="h-2.5 w-2.5" />
										{formatActivityDate(chat.last_activity_at)}
									</span>
									{#if chat.message_count > 0}
										<span>{chat.message_count} messages</span>
									{/if}
									{#if chat.focus_label}
										<span
											class="rounded border border-border/70 bg-muted/40 px-1.5 py-0.5"
										>
											{chat.focus_label}
										</span>
									{/if}
								</div>
								{#if chat.chat_topics.length > 0}
									<div class="mt-2 flex flex-wrap gap-1">
										{#each chat.chat_topics.slice(0, 3) as topic}
											<span
												class="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
											>
												{topic}
											</span>
										{/each}
									</div>
								{/if}
							</div>
							<ChevronRight
								class="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-accent"
							/>
						</div>
					</button>
				{/each}
			</div>

			{#if hasMore}
				<button
					type="button"
					onclick={() => loadChats(false)}
					disabled={loading}
					class="w-full rounded-md px-3 py-2 text-xs font-medium text-foreground/80 transition-colors hover:bg-muted/50 pressable disabled:cursor-not-allowed disabled:opacity-60"
				>
					{loading ? 'Loading...' : 'Load more chats'}
				</button>
			{/if}
		{/if}
	</div>
</Modal>
