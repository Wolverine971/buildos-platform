<!-- apps/web/src/routes/history/+page.svelte -->
<!--
  History Page - INKPRINT Design System

  Unified history view showing both braindumps and chat sessions.
  Users can view, filter, and resume previous conversations.

  PERFORMANCE (Dec 2024):
  - itemCount returned IMMEDIATELY for instant skeleton rendering
  - Full history data streamed in background
  - Zero layout shift - exact number of skeleton cards rendered from start
-->

<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import {
		Lightbulb,
		Search,
		Filter,
		Clock,
		CheckCircle,
		AlertCircle,
		Loader2,
		MessageSquare,
		Tag,
		ChevronRight,
		X,
		Brain,
		MessagesSquare
	} from 'lucide-svelte';
	import AgentChatModal from '$lib/components/agent/AgentChatModal.svelte';
	import HistoryListSkeleton from '$lib/components/history/HistoryListSkeleton.svelte';
	import type { HistoryItem } from './+page.server';

	interface OntoBraindump {
		id: string;
		content: string;
		title: string | null;
		topics: string[] | null;
		summary: string | null;
		status: 'pending' | 'processing' | 'processed' | 'failed';
		chat_session_id: string | null;
		metadata: Record<string, unknown> | null;
		processed_at: string | null;
		error_message: string | null;
		created_at: string;
		updated_at: string;
	}

	/** Streamed history data structure */
	interface HistoryDataResult {
		items: HistoryItem[];
		totalItems: number;
		stats: {
			totalBraindumps: number;
			processedBraindumps: number;
			pendingBraindumps: number;
			totalChatSessions: number;
			chatSessionsWithSummary: number;
		};
		selectedItem: HistoryItem | null;
		hasMore: boolean;
	}

	interface PageData {
		// Immediate data for skeleton rendering
		itemCount: number;
		braindumpCount: number;
		chatSessionCount: number;
		filters: {
			limit: number;
			offset: number;
			typeFilter: 'all' | 'braindumps' | 'chats';
			status: string | null;
			search: string;
			selectedId: string | null;
			selectedType: string | null;
		};
		user: { id: string };
		// Streamed data
		historyData: Promise<HistoryDataResult>;
	}

	let { data }: { data: PageData } = $props();

	// Immediate counts for skeleton rendering
	const itemCount = $derived(data.itemCount);
	const braindumpCount = $derived(data.braindumpCount);
	const chatSessionCount = $derived(data.chatSessionCount);

	// Local state for resolved streamed data
	let resolvedData = $state<HistoryDataResult | null>(null);
	let historyLoading = $state(true);
	let historyError = $state<string | null>(null);

	// Version token to guard against stale Promise resolution during rapid filter changes
	let historyResolveVersion = 0;

	// Resolve streamed data with staleness guard
	$effect(() => {
		const currentVersion = ++historyResolveVersion;
		historyLoading = true;
		historyError = null;
		data.historyData
			.then((result) => {
				// Discard stale results from previous filter/pagination changes
				if (currentVersion !== historyResolveVersion) return;
				resolvedData = result;
				historyLoading = false;
			})
			.catch((err) => {
				// Discard stale errors from previous filter/pagination changes
				if (currentVersion !== historyResolveVersion) return;
				historyError = err?.message || 'Failed to load history';
				historyLoading = false;
			});
	});

	// Local filter state
	let searchInput = $state(data.filters.search);
	let statusFilter = $state<string>(data.filters.status || '');
	let typeFilter = $state<'all' | 'braindumps' | 'chats'>(data.filters.typeFilter || 'all');
	let isAgentModalOpen = $state(false);
	let selectedBraindumpForChat = $state<OntoBraindump | null>(null);
	let selectedChatSessionId = $state<string | null>(null);
	let isLoadingChatSession = $state(false);

	// Open modal if we have a selectedItem from streamed data
	$effect(() => {
		if (resolvedData?.selectedItem && browser) {
			if (resolvedData.selectedItem.type === 'braindump') {
				selectedBraindumpForChat = resolvedData.selectedItem.originalData as OntoBraindump;
				selectedChatSessionId = null;
				isAgentModalOpen = true;
			} else if (resolvedData.selectedItem.type === 'chat_session') {
				selectedChatSessionId = resolvedData.selectedItem.id;
				selectedBraindumpForChat = null;
				isAgentModalOpen = true;
			}
		}
	});

	// Derived states from resolved data
	const items = $derived(resolvedData?.items ?? []);
	const stats = $derived(
		resolvedData?.stats ?? {
			totalBraindumps: braindumpCount,
			processedBraindumps: 0,
			pendingBraindumps: 0,
			totalChatSessions: chatSessionCount,
			chatSessionsWithSummary: 0
		}
	);
	const hasMore = $derived(resolvedData?.hasMore ?? false);
	const currentOffset = $derived(data.filters.offset);
	const limit = $derived(data.filters.limit);
	const totalItems = $derived(resolvedData?.totalItems ?? itemCount);

	// Show skeletons while loading if we have items to show
	const showSkeletons = $derived(historyLoading && itemCount > 0);

	function getStatusIcon(status: string) {
		switch (status) {
			case 'processed':
			case 'active':
			case 'completed':
				return CheckCircle;
			case 'processing':
				return Loader2;
			case 'pending':
				return Clock;
			case 'failed':
				return AlertCircle;
			default:
				return Clock;
		}
	}

	function getStatusColor(status: string) {
		switch (status) {
			case 'processed':
			case 'active':
			case 'completed':
				return 'text-emerald-500';
			case 'processing':
				return 'text-accent animate-spin';
			case 'pending':
				return 'text-amber-500';
			case 'failed':
				return 'text-destructive';
			default:
				return 'text-muted-foreground';
		}
	}

	function getTypeIcon(type: HistoryItem['type']) {
		return type === 'chat_session' ? MessagesSquare : Brain;
	}

	function getTypeColor(type: HistoryItem['type']) {
		return type === 'chat_session'
			? 'bg-accent/15 text-accent'
			: 'bg-purple-500/15 text-purple-600 dark:text-purple-400';
	}

	function formatDate(dateStr: string) {
		const date = new Date(dateStr);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

		if (diffDays === 0) {
			return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
		} else if (diffDays === 1) {
			return `Yesterday at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
		} else if (diffDays < 7) {
			return `${diffDays} days ago`;
		} else {
			return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
		}
	}

	function applyFilters() {
		const params = new URLSearchParams();
		if (searchInput) params.set('search', searchInput);
		if (statusFilter) params.set('status', statusFilter);
		if (typeFilter !== 'all') params.set('type', typeFilter);
		goto(`/history?${params.toString()}`);
	}

	function setTypeFilter(newFilter: 'all' | 'braindumps' | 'chats') {
		typeFilter = newFilter;
		applyFilters();
	}

	function clearFilters() {
		searchInput = '';
		statusFilter = '';
		typeFilter = 'all';
		goto('/history');
	}

	function loadMore() {
		const params = new URLSearchParams($page.url.searchParams);
		params.set('offset', String(currentOffset + limit));
		goto(`/history?${params.toString()}`);
	}

	function openItem(item: HistoryItem) {
		if (item.type === 'braindump') {
			selectedBraindumpForChat = item.originalData as OntoBraindump;
			selectedChatSessionId = null;
		} else {
			selectedChatSessionId = item.id;
			selectedBraindumpForChat = null;
		}
		isAgentModalOpen = true;
		// Update URL to reflect selection
		const params = new URLSearchParams($page.url.searchParams);
		params.set('id', item.id);
		params.set('itemType', item.type);
		goto(`/history?${params.toString()}`, { replaceState: true });
	}

	function closeAgentModal() {
		isAgentModalOpen = false;
		selectedBraindumpForChat = null;
		selectedChatSessionId = null;
		// Remove selection from URL
		const params = new URLSearchParams($page.url.searchParams);
		params.delete('id');
		params.delete('itemType');
		const newUrl = params.toString() ? `/history?${params.toString()}` : '/history';
		goto(newUrl, { replaceState: true });
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			applyFilters();
		}
	}
</script>

<svelte:head>
	<title>History | BuildOS</title>
	<meta name="description" content="View and explore your braindumps and chat conversations" />
</svelte:head>

<div class="min-h-screen bg-background">
	<!-- Header -->
	<div class="border-b border-border bg-card tx tx-frame tx-weak">
		<div class="mx-auto max-w-6xl px-2 sm:px-4 lg:px-8 py-3 sm:py-6">
			<div class="flex items-center gap-2 sm:gap-3">
				<div class="rounded-md sm:rounded-lg bg-accent/15 p-1.5 sm:p-2">
					<Lightbulb class="h-4 w-4 sm:h-6 sm:w-6 text-accent" />
				</div>
				<div class="min-w-0 flex-1">
					<div class="flex items-center gap-2">
						<h1 class="text-lg sm:text-2xl font-bold text-foreground">History</h1>
						{#if historyLoading}
							<Loader2
								class="h-4 w-4 sm:h-5 sm:w-5 animate-spin text-muted-foreground"
							/>
						{/if}
					</div>
					<p class="text-xs sm:text-sm text-muted-foreground hidden sm:block">
						Your braindumps and chat conversations
					</p>
				</div>
			</div>
		</div>
	</div>

	<!-- Main content -->
	<div class="mx-auto max-w-6xl px-2 sm:px-4 lg:px-8 py-3 sm:py-6">
		<!-- Stats cards - compact on mobile -->
		<div class="mb-3 sm:mb-6 grid grid-cols-4 gap-1.5 sm:gap-4">
			<div
				class="rounded-md sm:rounded-lg border border-border bg-card p-2 sm:p-4 shadow-ink tx tx-frame tx-weak"
			>
				<div class="text-base sm:text-2xl font-bold text-foreground">
					{stats.totalBraindumps + stats.totalChatSessions}
				</div>
				<div class="text-[9px] sm:text-sm text-muted-foreground">Total</div>
			</div>
			<div
				class="rounded-md sm:rounded-lg border border-border bg-card p-2 sm:p-4 shadow-ink tx tx-frame tx-weak"
			>
				<div class="flex items-center gap-1 sm:gap-2">
					<Brain class="h-3 w-3 sm:h-5 sm:w-5 text-purple-500 hidden sm:block" />
					<span class="text-base sm:text-2xl font-bold text-purple-500">
						{stats.totalBraindumps}
					</span>
				</div>
				<div class="text-[9px] sm:text-sm text-muted-foreground">Dumps</div>
			</div>
			<div
				class="rounded-md sm:rounded-lg border border-border bg-card p-2 sm:p-4 shadow-ink tx tx-frame tx-weak"
			>
				<div class="flex items-center gap-1 sm:gap-2">
					<MessagesSquare class="h-3 w-3 sm:h-5 sm:w-5 text-accent hidden sm:block" />
					<span class="text-base sm:text-2xl font-bold text-accent">
						{stats.totalChatSessions}
					</span>
				</div>
				<div class="text-[9px] sm:text-sm text-muted-foreground">Chats</div>
			</div>
			<div
				class="rounded-md sm:rounded-lg border border-border bg-card p-2 sm:p-4 shadow-ink tx tx-frame tx-weak"
			>
				<div class="text-base sm:text-2xl font-bold text-emerald-500">
					{stats.processedBraindumps + stats.chatSessionsWithSummary}
				</div>
				<div class="text-[9px] sm:text-sm text-muted-foreground">Done</div>
			</div>
		</div>

		<!-- Type filter tabs - compact on mobile -->
		<div class="mb-2 sm:mb-4 flex gap-0.5 sm:gap-2 border-b border-border overflow-x-auto">
			<button
				onclick={() => setTypeFilter('all')}
				class="relative px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium transition-colors pressable whitespace-nowrap {typeFilter ===
				'all'
					? 'text-foreground'
					: 'text-muted-foreground hover:text-foreground'}"
			>
				All
				{#if typeFilter === 'all'}
					<span class="absolute bottom-0 left-0 right-0 h-0.5 bg-accent"></span>
				{/if}
			</button>
			<button
				onclick={() => setTypeFilter('braindumps')}
				class="relative flex items-center gap-1 sm:gap-1.5 px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium transition-colors pressable whitespace-nowrap {typeFilter ===
				'braindumps'
					? 'text-foreground'
					: 'text-muted-foreground hover:text-foreground'}"
			>
				<Brain class="h-3 w-3 sm:h-4 sm:w-4" />
				<span class="hidden sm:inline">Braindumps</span>
				<span class="sm:hidden">Dumps</span>
				<span
					class="rounded-full bg-purple-500/15 px-1 sm:px-1.5 py-0.5 text-[9px] sm:text-xs text-purple-600 dark:text-purple-400"
				>
					{stats.totalBraindumps}
				</span>
				{#if typeFilter === 'braindumps'}
					<span class="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-500"></span>
				{/if}
			</button>
			<button
				onclick={() => setTypeFilter('chats')}
				class="relative flex items-center gap-1 sm:gap-1.5 px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium transition-colors pressable whitespace-nowrap {typeFilter ===
				'chats'
					? 'text-foreground'
					: 'text-muted-foreground hover:text-foreground'}"
			>
				<MessagesSquare class="h-3 w-3 sm:h-4 sm:w-4" />
				Chats
				<span
					class="rounded-full bg-accent/15 px-1 sm:px-1.5 py-0.5 text-[9px] sm:text-xs text-accent"
				>
					{stats.totalChatSessions}
				</span>
				{#if typeFilter === 'chats'}
					<span class="absolute bottom-0 left-0 right-0 h-0.5 bg-accent"></span>
				{/if}
			</button>
		</div>

		<!-- Search and filters - compact on mobile -->
		<div class="mb-3 sm:mb-6 flex flex-col gap-2 sm:gap-4 sm:flex-row sm:items-center">
			<div class="relative flex-1">
				<Search
					class="absolute left-2.5 sm:left-3 top-1/2 h-3.5 w-3.5 sm:h-4 sm:w-4 -translate-y-1/2 text-muted-foreground"
				/>
				<input
					type="text"
					placeholder="Search..."
					bind:value={searchInput}
					onkeydown={handleKeydown}
					class="w-full rounded-md sm:rounded-lg border border-border bg-background py-1.5 sm:py-2 pl-8 sm:pl-10 pr-3 sm:pr-4 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
				/>
			</div>
			<div class="flex items-center gap-1.5 sm:gap-2">
				<Filter class="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground hidden sm:block" />
				<select
					bind:value={statusFilter}
					onchange={applyFilters}
					class="flex-1 sm:flex-none rounded-md sm:rounded-lg border border-border bg-background px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
				>
					<option value="">All</option>
					<option value="processed">Done</option>
					<option value="pending">Pending</option>
					<option value="processing">Processing</option>
					<option value="failed">Failed</option>
				</select>
				<button
					onclick={applyFilters}
					class="rounded-md sm:rounded-lg bg-accent px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-accent-foreground hover:bg-accent/90 shadow-ink pressable"
				>
					Go
				</button>
				{#if searchInput || statusFilter || typeFilter !== 'all'}
					<button
						onclick={clearFilters}
						class="rounded-md sm:rounded-lg border border-border p-1.5 sm:px-3 sm:py-2 text-sm text-muted-foreground hover:bg-muted pressable"
					>
						<X class="h-3.5 w-3.5 sm:h-4 sm:w-4" />
					</button>
				{/if}
			</div>
		</div>

		<!-- History items list -->
		{#if showSkeletons}
			<!-- Show skeletons while loading - exact count for zero layout shift -->
			<HistoryListSkeleton count={itemCount} />
		{:else if historyError}
			<!-- Error state -->
			<div
				class="flex flex-col items-center justify-center rounded-lg border border-dashed border-destructive/30 bg-destructive/5 py-16 tx tx-static tx-weak"
			>
				<AlertCircle class="mb-4 h-12 w-12 text-destructive" />
				<h3 class="mb-2 text-lg font-medium text-foreground">Failed to load history</h3>
				<p class="mb-4 text-center text-sm text-muted-foreground">{historyError}</p>
				<button
					onclick={() => location.reload()}
					class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent/90 shadow-ink pressable"
				>
					Retry
				</button>
			</div>
		{:else if items.length === 0}
			<div
				class="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/50 py-16 tx tx-bloom tx-weak"
			>
				<Lightbulb class="mb-4 h-12 w-12 text-muted-foreground" />
				<h3 class="mb-2 text-lg font-medium text-foreground">No history found</h3>
				<p class="mb-4 text-center text-sm text-muted-foreground">
					{#if typeFilter === 'braindumps'}
						You haven't captured any braindumps yet.<br />
						Use the Braindump context in agent chat to get started.
					{:else if typeFilter === 'chats'}
						You haven't had any chat sessions yet.<br />
						Start a conversation with BuildOS to see it here.
					{:else}
						Your braindumps and chat sessions will appear here.
					{/if}
				</p>
			</div>
		{:else}
			<!-- Responsive grid: 2 cols mobile for density, 2 cols tablet, 3 cols desktop -->
			<div class="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-3">
				{#each items as item (item.id)}
					{@const TypeIcon = getTypeIcon(item.type)}
					{@const StatusIcon = getStatusIcon(item.status)}
					<button
						onclick={() => openItem(item)}
						class="group flex h-full flex-col rounded-md sm:rounded-lg border border-border bg-card p-2 sm:p-4 text-left shadow-ink transition-all hover:border-accent/50 hover:shadow-ink-strong tx tx-frame tx-weak pressable"
					>
						<!-- Header: Type badge and status -->
						<div class="mb-1 sm:mb-2 flex items-center justify-between">
							<span
								class="inline-flex items-center gap-0.5 sm:gap-1 rounded-full px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-xs font-medium {getTypeColor(
									item.type
								)}"
							>
								<TypeIcon class="h-2.5 w-2.5 sm:h-3 sm:w-3" />
								<span class="hidden sm:inline"
									>{item.type === 'chat_session' ? 'Chat' : 'Braindump'}</span
								>
							</span>
							<StatusIcon
								class="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0 {getStatusColor(
									item.status
								)}"
							/>
						</div>

						<!-- Title -->
						<h3
							class="mb-1 sm:mb-2 line-clamp-2 text-xs sm:text-base font-medium text-foreground"
						>
							{item.title}
						</h3>

						<!-- Preview / Summary - hidden on mobile for density -->
						<p
							class="hidden sm:block mb-3 line-clamp-3 flex-1 text-sm text-muted-foreground"
						>
							{item.preview}
						</p>

						<!-- Topics (compact) - show fewer on mobile -->
						{#if item.topics && item.topics.length > 0}
							<div class="mb-1.5 sm:mb-3 flex flex-wrap gap-0.5 sm:gap-1">
								{#each item.topics.slice(0, 2) as topic}
									<span
										class="inline-flex items-center rounded-full bg-muted px-1 sm:px-1.5 py-0.5 text-[8px] sm:text-[10px] text-muted-foreground truncate max-w-[60px] sm:max-w-none"
									>
										{topic}
									</span>
								{/each}
								{#if item.topics.length > 2}
									<span class="text-[8px] sm:text-[10px] text-muted-foreground">
										+{item.topics.length - 2}
									</span>
								{/if}
							</div>
						{/if}

						<!-- Footer: Metadata - compact on mobile -->
						<div
							class="mt-auto flex items-center justify-between border-t border-border pt-1.5 sm:pt-3 text-[9px] sm:text-xs text-muted-foreground"
						>
							<span class="flex items-center gap-0.5 sm:gap-1 truncate">
								<Clock class="h-2.5 w-2.5 sm:h-3 sm:w-3 flex-shrink-0" />
								<span class="truncate">{formatDate(item.createdAt)}</span>
							</span>
							<div class="flex items-center gap-1 sm:gap-2 flex-shrink-0">
								{#if item.type === 'chat_session' && item.messageCount}
									<span class="flex items-center gap-0.5">
										<MessageSquare class="h-2.5 w-2.5 sm:h-3 sm:w-3" />
										{item.messageCount}
									</span>
								{/if}
								<ChevronRight
									class="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground transition-colors group-hover:text-accent"
								/>
							</div>
						</div>
					</button>
				{/each}
			</div>

			<!-- Load more -->
			{#if hasMore}
				<div class="mt-6 flex justify-center">
					<button
						onclick={loadMore}
						class="rounded-lg border border-border px-6 py-2 text-sm font-medium text-foreground hover:bg-muted pressable"
					>
						Load more
					</button>
				</div>
			{/if}

			<!-- Results info -->
			<div class="mt-4 text-center text-sm text-muted-foreground">
				Showing {Math.min(currentOffset + items.length, totalItems)} of {totalItems} items
			</div>
		{/if}
	</div>
</div>

<!-- Agent Chat Modal for braindumps -->
{#if isAgentModalOpen && selectedBraindumpForChat}
	<AgentChatModal
		isOpen={isAgentModalOpen}
		contextType="brain_dump"
		onClose={closeAgentModal}
		initialBraindump={selectedBraindumpForChat}
	/>
{/if}

<!-- Agent Chat Modal for chat sessions - need to pass session ID -->
{#if isAgentModalOpen && selectedChatSessionId}
	<AgentChatModal
		isOpen={isAgentModalOpen}
		onClose={closeAgentModal}
		initialChatSessionId={selectedChatSessionId}
	/>
{/if}
