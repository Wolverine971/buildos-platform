<!-- apps/web/src/routes/history/+page.svelte -->
<!--
  History Page - INKPRINT Design System

  Unified history view showing both captures and chat sessions.
  Users can view, filter, and resume previous conversations.

  PERFORMANCE:
  - Small capped skeleton set renders immediately
  - Full history data streams from a bounded RPC
  - Search is debounced and kept on the indexed 3+ character path

  PRIVACY: the search query is posted to the `search` action and kept in component state,
  never written to the URL (analytics page views, browser history, request logs).
-->

<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { deserialize } from '$app/forms';
	import { goto, invalidate, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import {
		Lightbulb,
		Search,
		AlertCircle,
		LoaderCircle,
		MessageSquare,
		X,
		MessagesSquare,
		FileText,
		Folder,
		FolderOpen,
		RotateCw,
		Trash2
	} from '$lib/icons/lucide';
	// Lazy: the chat chunk stays out of this page's bundle. Navigation warms the
	// shared loader on idle, so opening a session is still instant in practice.
	import { loadAgentChatModal } from '$lib/components/agent/load-agent-chat-modal';
	import HistoryListSkeleton from '$lib/components/history/HistoryListSkeleton.svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import type {
		AgentBrainDumpContext,
		DataMutationSummary
	} from '$lib/components/agent/agent-chat.types';
	import type { HistoryItem } from './+page.server';
	import { compactHistoryCount } from './history-display';
	import { legacyHistoryChatResumeUrl } from './history-chat-links';

	/** Streamed history data structure */
	interface HistoryDataResult {
		items: HistoryItem[];
		totalItems: number;
		totalItemsExact: boolean;
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
	const initialFilters = untrack(() => data.filters);

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

	// Active search, applied through the `search` action instead of the URL.
	let activeSearch = $state(initialFilters.search);
	let searchResult = $state<HistoryDataResult | null>(null);
	let searchOffset = $state(0);
	let searchLoading = $state(Boolean(initialFilters.search));
	let searchError = $state<string | null>(null);
	let searchVersion = 0;

	// A legacy `?search=` link was already applied by the load; show that result as the
	// search view and drop the param from the address bar.
	if (initialFilters.search) {
		untrack(() => data.historyData).then(
			(result) => {
				if (searchVersion !== 0) return;
				searchResult = result;
				searchLoading = false;
			},
			() => {
				if (searchVersion !== 0) return;
				searchError = 'Failed to load history';
				searchLoading = false;
			}
		);
	}

	onMount(() => {
		if (!page.url.searchParams.has('search')) return;
		const url = new URL(page.url);
		url.searchParams.delete('search');
		goto(`${url.pathname}${url.search}`, {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	});

	async function runSearch(offset: number) {
		const version = ++searchVersion;
		searchLoading = true;
		searchError = null;

		const body = new FormData();
		body.set('search', activeSearch);
		body.set('offset', String(offset));
		body.set('limit', String(limit));
		if (statusFilter) body.set('status', statusFilter);
		if (typeFilter !== 'all') body.set('type', typeFilter);

		try {
			const response = await fetch('/history?/search', {
				method: 'POST',
				body,
				headers: { 'x-sveltekit-action': 'true' }
			});
			const result = deserialize(await response.text());
			if (version !== searchVersion) return;
			if (result.type !== 'success' || !result.data?.historyData) {
				throw new Error('Search failed');
			}
			searchResult = result.data.historyData as HistoryDataResult;
			searchOffset = offset;
		} catch (err) {
			if (version !== searchVersion) return;
			searchError = err instanceof Error ? err.message : 'Search failed';
		} finally {
			if (version === searchVersion) searchLoading = false;
		}
	}

	function endSearch() {
		searchVersion++;
		activeSearch = '';
		searchResult = null;
		searchOffset = 0;
		searchLoading = false;
		searchError = null;
	}

	// Local filter state
	let searchInput = $state(initialFilters.search);
	let statusFilter = $state<string>(initialFilters.status || '');
	let typeFilter = $state<'all' | 'braindumps' | 'chats'>(initialFilters.typeFilter || 'all');
	let isAgentModalOpen = $state(false);
	let selectedChatSessionId = $state<string | null>(null);
	let selectedBrainDumpContext = $state<AgentBrainDumpContext | null>(null);
	let chatClassificationState = $state<Record<string, 'loading' | 'queued' | 'error'>>({});
	let openingBraindumpId = $state<string | null>(null);
	let pendingDeleteItem = $state<HistoryItem | null>(null);
	let deletingBraindumpId = $state<string | null>(null);
	let lastAutoOpenedSelection = $state<string | null>(null);
	let historyLinksReady = $state(false);
	onMount(() => {
		// Router shallow/history writes are available just after hydration completes.
		queueMicrotask(() => (historyLinksReady = true));
	});
	const MIN_SEARCH_LENGTH = 3;
	const MAX_SEARCH_LENGTH = 120;

	// Older History links still work, but ordinary chats share Navigation's host.
	$effect(() => {
		if (resolvedData?.selectedItem && historyLinksReady) {
			const selectionKey = `${resolvedData.selectedItem.type}:${resolvedData.selectedItem.id}`;
			if (selectionKey === lastAutoOpenedSelection) return;
			lastAutoOpenedSelection = selectionKey;
			if (resolvedData.selectedItem.type === 'braindump') {
				openBraindumpChat(resolvedData.selectedItem);
			} else if (resolvedData.selectedItem.type === 'chat_session') {
				const url = legacyHistoryChatResumeUrl(
					new URL(window.location.href),
					resolvedData.selectedItem.id,
					page.state
				);
				if (url) {
					// Navigation awaits its own cleanup before opening/pushing the chat.
					void goto(`${url.pathname}${url.search}${url.hash}`, {
						replaceState: true,
						keepFocus: true,
						noScroll: true,
						state: page.state
					});
				}
			}
		}
	});

	// Derived states from the search result or the URL-driven streamed data
	const viewData = $derived(activeSearch ? searchResult : resolvedData);
	const viewLoading = $derived(activeSearch ? searchLoading : historyLoading);
	const viewError = $derived(activeSearch ? searchError : historyError);
	const items = $derived(viewData?.items ?? []);
	const stats = $derived(
		viewData?.stats ?? {
			totalBraindumps: braindumpCount,
			processedBraindumps: 0,
			pendingBraindumps: 0,
			totalChatSessions: chatSessionCount,
			chatSessionsWithSummary: 0
		}
	);
	const hasMore = $derived(viewData?.hasMore ?? false);
	const currentOffset = $derived(activeSearch ? searchOffset : data.filters.offset);
	const limit = $derived(data.filters.limit);
	const totalItems = $derived(viewData?.totalItems ?? itemCount);
	const totalItemsExact = $derived(viewData?.totalItemsExact ?? true);
	const visibleItemCount = $derived(currentOffset + items.length);

	// Show skeletons while loading if we have items to show
	const showSkeletons = $derived(viewLoading && itemCount > 0);

	/** Dot colour for statuses that need a look; done items stay quiet (null). */
	function getStatusDot(status: string): string | null {
		switch (status) {
			case 'processed':
			case 'completed':
			case 'done':
				return null;
			case 'processing':
				return 'bg-muted-foreground animate-pulse motion-reduce:animate-none';
			case 'queued':
			case 'pending':
				return 'bg-warning';
			case 'failed':
				return 'bg-destructive';
			default:
				return 'bg-muted-foreground/60';
		}
	}

	function getEffectiveDisplayStatus(
		item: HistoryItem,
		classifyStatus: 'loading' | 'queued' | 'error' | 'idle'
	) {
		if (item.type !== 'chat_session') return item.displayStatus ?? item.status;
		if (classifyStatus === 'loading') return 'processing';
		if (classifyStatus === 'queued') return 'queued';
		if (classifyStatus === 'error') return 'failed';
		return item.displayStatus ?? item.status;
	}

	function getEffectiveStatusLabel(
		item: HistoryItem,
		classifyStatus: 'loading' | 'queued' | 'error' | 'idle'
	) {
		if (item.type !== 'chat_session') {
			if (item.status === 'processed') return 'Done';
			return item.status.charAt(0).toUpperCase() + item.status.slice(1);
		}

		if (classifyStatus === 'loading') return 'Summarizing';
		if (classifyStatus === 'queued') return 'Queued';
		if (classifyStatus === 'error') return 'Summary failed';
		return item.statusLabel ?? 'Needs summary';
	}

	function canQueueChatSummary(
		item: HistoryItem,
		classifyStatus: 'loading' | 'queued' | 'error' | 'idle'
	) {
		if (item.type !== 'chat_session' || !item.needsClassification) return false;
		if (classifyStatus === 'loading' || classifyStatus === 'queued') return false;
		return item.canQueueSummary || classifyStatus === 'error';
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
		if (statusFilter) params.set('status', statusFilter);
		if (typeFilter !== 'all') params.set('type', typeFilter);
		const url = params.toString() ? `/history?${params.toString()}` : '/history';
		const normalizedSearch = searchInput.trim().slice(0, MAX_SEARCH_LENGTH);

		if (normalizedSearch.length < MIN_SEARCH_LENGTH) {
			endSearch();
			goto(url);
			return;
		}

		activeSearch = normalizedSearch;
		if (`${page.url.pathname}${page.url.search}` !== url) {
			goto(url, { keepFocus: true, noScroll: true });
		}
		void runSearch(0);
	}

	function setTypeFilter(newFilter: 'all' | 'braindumps' | 'chats') {
		typeFilter = newFilter;
		applyFilters();
	}

	function clearFilters() {
		searchInput = '';
		statusFilter = '';
		typeFilter = 'all';
		endSearch();
		goto('/history');
	}

	function loadMore() {
		if (activeSearch) {
			void runSearch(currentOffset + limit);
			return;
		}
		const params = new URLSearchParams(page.url.searchParams);
		params.set('offset', String(currentOffset + limit));
		goto(`/history?${params.toString()}`);
	}

	async function openBraindumpChat(item: HistoryItem) {
		if (item.type !== 'braindump') return;
		openingBraindumpId = item.id;
		try {
			const response = await fetch(`/api/onto/braindumps/${item.id}/chat-session`, {
				method: 'POST'
			});
			const result = await response.json().catch(() => null);
			if (!response.ok || !result?.success || !result?.data?.chat_session_id) {
				throw new Error(result?.error || 'Failed to open Brain Dump chat');
			}
			selectedChatSessionId = result.data.chat_session_id;
			selectedBrainDumpContext = result.data.braindump as AgentBrainDumpContext;
			isAgentModalOpen = true;
			void invalidate('/history');
		} catch (error) {
			console.error('Failed to open Brain Dump chat:', error);
		} finally {
			if (openingBraindumpId === item.id) {
				openingBraindumpId = null;
			}
		}
	}

	function openItem(item: HistoryItem) {
		if (item.type === 'braindump') {
			void openBraindumpChat(item);
		} else {
			window.dispatchEvent(
				new CustomEvent('buildos:open-agent-chat', {
					detail: { sessionId: item.id }
				})
			);
			return;
		}
		// Brain Dump selection retains its dedicated context and local host.
		const params = new URLSearchParams(page.url.searchParams);
		params.set('id', item.id);
		params.set('itemType', item.type);
		goto(`/history?${params.toString()}`, { replaceState: true });
	}

	function closeAgentModal(summary?: DataMutationSummary) {
		isAgentModalOpen = false;
		selectedChatSessionId = null;
		selectedBrainDumpContext = null;
		// Remove selection from URL
		const url = new URL(window.location.href);
		url.searchParams.delete('id');
		url.searchParams.delete('itemType');
		replaceState(url, { ...page.state });
		if (summary?.hasMessagesSent) {
			void invalidate('history:data');
			if (activeSearch) void runSearch(searchOffset);
		}
	}

	// Debounced search so it auto-applies like the status <select>, instead of
	// requiring a separate "Go" button (one submit model for the whole row).
	let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined;

	function onSearchInput() {
		clearTimeout(searchDebounceTimer);
		const normalizedSearch = searchInput.trim();
		if (
			normalizedSearch.length > 0 &&
			normalizedSearch.length < MIN_SEARCH_LENGTH &&
			!activeSearch
		) {
			return;
		}
		searchDebounceTimer = setTimeout(() => applyFilters(), 400);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			clearTimeout(searchDebounceTimer);
			applyFilters();
		}
	}

	function withoutItem(
		result: HistoryDataResult | null,
		item: HistoryItem
	): HistoryDataResult | null {
		if (!result?.items.some((entry) => entry.id === item.id)) return result;
		return {
			...result,
			items: result.items.filter((entry) => entry.id !== item.id),
			totalItems: Math.max(0, result.totalItems - 1),
			stats: {
				...result.stats,
				totalBraindumps: Math.max(0, result.stats.totalBraindumps - 1),
				processedBraindumps: Math.max(
					0,
					result.stats.processedBraindumps - (item.status === 'processed' ? 1 : 0)
				),
				pendingBraindumps: Math.max(
					0,
					result.stats.pendingBraindumps - (item.status === 'pending' ? 1 : 0)
				)
			}
		};
	}

	// Soft delete: the capture leaves History now and is erased 30 days later.
	async function deletePendingBraindump() {
		const item = pendingDeleteItem;
		if (!item || deletingBraindumpId) return;
		deletingBraindumpId = item.id;
		try {
			const response = await fetch(`/api/onto/braindumps/${item.id}`, { method: 'DELETE' });
			// 404: already deleted elsewhere; the list outcome is the same.
			if (!response.ok && response.status !== 404) {
				const payload = await response.json().catch(() => null);
				throw new Error(payload?.error || 'Could not delete this capture');
			}
			resolvedData = withoutItem(resolvedData, item);
			searchResult = withoutItem(searchResult, item);
			pendingDeleteItem = null;
			toastService.success('Capture deleted');
			// Pages are offset-based: refetch so the next item moves up into this page.
			if (activeSearch ? searchResult?.hasMore : resolvedData?.hasMore) {
				if (activeSearch) void runSearch(searchOffset);
				else void invalidate('history:data');
			}
		} catch (error) {
			toastService.error(
				error instanceof Error ? error.message : 'Could not delete this capture'
			);
		} finally {
			deletingBraindumpId = null;
		}
	}

	async function classifyChatSession(item: HistoryItem) {
		if (item.type !== 'chat_session') return;
		if (chatClassificationState[item.id] === 'loading') return;

		chatClassificationState = { ...chatClassificationState, [item.id]: 'loading' };

		try {
			const response = await fetch(`/api/chat/sessions/${item.id}/classify`, {
				method: 'POST'
			});
			const payload = await response.json().catch(() => null);

			if (!response.ok || !payload?.success) {
				throw new Error(payload?.error || 'Failed to queue chat classification');
			}

			chatClassificationState = { ...chatClassificationState, [item.id]: 'queued' };
		} catch (error) {
			console.error('Failed to classify chat session:', error);
			chatClassificationState = { ...chatClassificationState, [item.id]: 'error' };
		}
	}
</script>

<svelte:head>
	<title>History | BuildOS</title>
	<meta name="description" content="View and explore your captures and chat conversations" />
</svelte:head>

<div class="min-h-screen bg-background">
	<div class="mx-auto max-w-7xl space-y-4 px-4 py-4 lg:px-6 lg:py-6">
		<header class="flex items-center gap-3">
			<h1 class="text-2xl font-medium text-foreground">History</h1>
			{#if viewLoading}
				<LoaderCircle
					class="h-4 w-4 animate-spin text-muted-foreground motion-reduce:animate-none"
				/>
			{/if}
		</header>

		<div>
			<!-- Type filters use three fixed mobile columns; no hidden horizontal scroll. -->
			<div class="mb-4 grid grid-cols-3 border-b border-border sm:flex sm:gap-2">
				{#each [{ key: 'all', label: 'All', count: stats.totalBraindumps + stats.totalChatSessions, Icon: null, aria: 'All history' }, { key: 'braindumps', label: 'Captures', count: stats.totalBraindumps, Icon: Lightbulb, aria: 'Captures' }, { key: 'chats', label: 'Chats', count: stats.totalChatSessions, Icon: MessagesSquare, aria: 'Chats' }] as tab (tab.key)}
					{@const active = typeFilter === tab.key}
					<button
						onclick={() => setTypeFilter(tab.key as 'all' | 'braindumps' | 'chats')}
						aria-pressed={active}
						aria-label={`${tab.aria}, ${tab.count} entries`}
						class="relative inline-flex min-w-0 items-center justify-center gap-2 px-2 py-2 text-sm font-medium transition-colors pressable focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:px-3 {active
							? 'text-foreground'
							: 'text-muted-foreground hover:text-foreground'}"
					>
						{#if tab.Icon}
							<tab.Icon class="hidden h-4 w-4 shrink-0 sm:block" />
						{/if}
						<span class="min-w-0 truncate">{tab.label}</span>
						<span
							class="shrink-0 font-mono text-xs font-normal tabular-nums text-muted-foreground"
						>
							{compactHistoryCount(tab.count, 9999)}
						</span>
						{#if active}
							<span class="absolute bottom-0 left-0 right-0 h-0.5 bg-accent"></span>
						{/if}
					</button>
				{/each}
			</div>

			<div class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
				<div class="relative flex-1">
					<Search
						class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
					/>
					<input
						type="text"
						placeholder="Search history"
						aria-label="Search history"
						maxlength={MAX_SEARCH_LENGTH}
						bind:value={searchInput}
						oninput={onSearchInput}
						onkeydown={handleKeydown}
						class="w-full rounded-lg border border-border bg-background py-2 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
					/>
				</div>
				<div class="flex items-center gap-2">
					<select
						bind:value={statusFilter}
						onchange={applyFilters}
						aria-label="Status"
						class="flex-1 rounded-lg border border-border bg-background py-2 pl-3 pr-8 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20 sm:flex-none"
					>
						<option value="">Any status</option>
						<option value="processed">Done</option>
						<option value="pending">Pending</option>
						<option value="processing">Processing</option>
						<option value="failed">Failed</option>
					</select>
					{#if searchInput || statusFilter || typeFilter !== 'all'}
						<button
							onclick={clearFilters}
							aria-label="Clear filters"
							class="rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted/50 hover:text-foreground pressable focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
						>
							<X class="h-4 w-4" />
						</button>
					{/if}
				</div>
			</div>

			{#if showSkeletons}
				<!-- Show a bounded skeleton set while streamed history data resolves. -->
				<HistoryListSkeleton count={itemCount} />
			{:else if viewError}
				<div
					class="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-16 text-center"
				>
					<AlertCircle class="mb-3 h-6 w-6 text-destructive" />
					<h3 class="mb-1 text-base font-medium text-foreground">
						Couldn't load your history
					</h3>
					<p class="mb-4 text-sm text-muted-foreground">{viewError}</p>
					<button
						onclick={() => location.reload()}
						class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent/90 pressable focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
					>
						Try again
					</button>
				</div>
			{:else if items.length === 0}
				<div class="flex flex-col items-center justify-center py-16 text-center">
					<h3 class="mb-1 text-base font-medium text-foreground">
						{searchInput || statusFilter ? 'Nothing matches' : 'Nothing here yet'}
					</h3>
					<p class="text-sm text-muted-foreground">
						{#if searchInput || statusFilter}
							Try a different search or status
						{:else if typeFilter === 'braindumps'}
							Things you capture show up here
						{:else if typeFilter === 'chats'}
							Your chats with BuildOS show up here
						{:else}
							Your captures and chats show up here
						{/if}
					</p>
				</div>
			{:else}
				<!-- Responsive grid: 2 cols mobile for density, 2 cols tablet, 3 cols desktop -->
				<div class="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-3">
					{#each items as item (item.id)}
						{@const classifyStatus = chatClassificationState[item.id] ?? 'idle'}
						{@const displayStatus = getEffectiveDisplayStatus(item, classifyStatus)}
						{@const statusLabel = getEffectiveStatusLabel(item, classifyStatus)}
						{@const canSummarize = canQueueChatSummary(item, classifyStatus)}
						{@const dot = getStatusDot(displayStatus)}
						<div
							class={`group relative flex h-full flex-col rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-foreground/20 focus-within:border-foreground/20 tx tx-frame tx-weak pressable sm:p-4 ${
								openingBraindumpId === item.id || deletingBraindumpId === item.id
									? 'pointer-events-none opacity-70'
									: ''
							}`}
						>
							<!-- Stretched primary action: makes the whole card a real
							     <button> (native Enter/Space + focus ring) without nesting
							     the Summarize button inside a button. -->
							<button
								type="button"
								onclick={() => openItem(item)}
								aria-busy={openingBraindumpId === item.id}
								aria-label={`Open ${item.title}`}
								class="absolute inset-0 z-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
							></button>

							<!-- Content sits above the stretched button but is itself
							     pointer-events-none so taps fall through to it; interactive
							     children (Summarize) re-enable pointer events + raise z. -->
							<div class="pointer-events-none relative z-[1] flex flex-1 flex-col">
								<!-- Where it lived on the left (a chat's projects, or Workspace);
								     anything that needs attention on the right. -->
								<div class="mb-2 flex min-h-6 items-center justify-between gap-2">
									{#if item.type === 'chat_session' && item.projects?.length}
										{@const projects = item.projects}
										{@const shown = projects.slice(0, 3)}
										<!-- Phone: first project + count. Wider: up to three, each
										     shrinking with its own ellipsis, then +N. -->
										<span
											class="inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground"
										>
											<Folder class="h-3 w-3 shrink-0" />
											{#each shown as project, index (project.id)}
												{#if index > 0}
													<span
														class="hidden shrink-0 text-muted-foreground/60 sm:inline"
														aria-hidden="true">·</span
													>
												{/if}
												<span
													class={`min-w-0 truncate ${index > 0 ? 'hidden sm:inline' : ''}`}
													>{project.name}</span
												>
											{/each}
											{#if projects.length > 1}
												<span
													class="shrink-0 font-mono tabular-nums sm:hidden"
													>+{projects.length - 1}</span
												>
											{/if}
											{#if projects.length > 3}
												<span
													class="hidden shrink-0 font-mono tabular-nums sm:inline"
													>+{projects.length - 3}</span
												>
											{/if}
										</span>
									{:else if item.type === 'chat_session'}
										<span
											class="inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground"
										>
											<FolderOpen class="h-3 w-3 shrink-0" />
											<span class="truncate"
												>{item.scopeLabel ?? 'Workspace chat'}</span
											>
										</span>
									{:else}
										<span
											class="inline-flex items-center gap-1 text-xs text-muted-foreground"
										>
											<Lightbulb class="h-3 w-3 shrink-0" />
											<span class="hidden sm:inline">Capture</span>
										</span>
									{/if}
									<div class="flex shrink-0 items-center gap-2">
										{#if dot && !(canSummarize && displayStatus === 'needs_summary')}
											<span
												class="inline-flex items-center gap-1 text-xs text-muted-foreground"
												title={statusLabel}
											>
												<span
													class="h-1.5 w-1.5 shrink-0 rounded-full {dot}"
												></span>
												<span class="hidden whitespace-nowrap sm:inline"
													>{statusLabel}</span
												>
												<span class="sr-only sm:hidden">{statusLabel}</span>
											</span>
										{/if}
										{#if canSummarize}
											<button
												type="button"
												onclick={() => classifyChatSession(item)}
												disabled={classifyStatus === 'loading' ||
													classifyStatus === 'queued'}
												class="pointer-events-auto relative z-[2] inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors pressable hover:bg-muted/50 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-70"
												aria-label={classifyStatus === 'error'
													? 'Retry summary'
													: 'Summarize chat session'}
											>
												{#if classifyStatus === 'error'}
													<RotateCw class="h-3 w-3" />
													<span class="hidden sm:inline">Retry</span>
												{:else}
													<FileText class="h-3 w-3" />
													<span class="hidden sm:inline">Summarize</span>
												{/if}
											</button>
										{/if}
										{#if item.type === 'braindump'}
											<button
												type="button"
												onclick={() => (pendingDeleteItem = item)}
												class="pointer-events-auto relative z-[2] inline-flex items-center justify-center rounded-lg p-1 text-muted-foreground transition-colors pressable hover:bg-muted/50 hover:text-destructive focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
												aria-label={`Delete ${item.title}`}
												title="Delete capture"
											>
												<Trash2 class="h-3 w-3 sm:h-4 sm:w-4" />
											</button>
										{/if}
									</div>
								</div>

								<h3
									class="mb-1 line-clamp-2 text-sm font-medium text-foreground sm:mb-2 sm:text-base"
								>
									{item.title}
								</h3>

								<!-- Preview / Summary - clamped to one line on mobile (compact,
								     don't hide: this is the card's most informative field) -->
								<p
									class="mb-2 line-clamp-1 flex-1 text-xs text-muted-foreground sm:mb-3 sm:line-clamp-3 sm:text-sm"
								>
									{item.preview}
								</p>

								{#if item.topics && item.topics.length > 0}
									<p
										class="mb-2 truncate text-xs text-muted-foreground/80 sm:mb-3"
									>
										{item.topics.slice(0, 3).join(' · ')}
										{#if item.topics.length > 3}
											<span class="ml-1 font-mono tabular-nums"
												>+{item.topics.length - 3}</span
											>
										{/if}
									</p>
								{/if}

								<div
									class="mt-auto flex items-center justify-between gap-2 text-xs text-muted-foreground"
								>
									<span class="truncate">{formatDate(item.createdAt)}</span>
									{#if item.type === 'chat_session' && item.messageCount}
										<span
											class="flex shrink-0 items-center gap-1 font-mono tabular-nums"
											title={`${item.messageCount} messages`}
										>
											<MessageSquare class="h-3 w-3" />
											{item.messageCount}
										</span>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>

				{#if hasMore}
					<div class="mt-6 flex justify-center">
						<button
							onclick={loadMore}
							class="rounded-lg border border-border px-6 py-2 text-sm font-medium text-foreground hover:bg-muted/50 pressable focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
						>
							Load more
						</button>
					</div>
				{/if}

				<div class="mt-4 text-center text-xs text-muted-foreground">
					{#if totalItemsExact}
						Showing {Math.min(visibleItemCount, totalItems)} of {totalItems}
					{:else if hasMore}
						Showing {visibleItemCount}+
					{:else}
						Showing {visibleItemCount}
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>

<ConfirmationModal
	isOpen={pendingDeleteItem !== null}
	title="Delete capture?"
	confirmText="Delete"
	confirmVariant="danger"
	icon="danger"
	loading={deletingBraindumpId !== null}
	loadingText="Deleting…"
	onconfirm={deletePendingBraindump}
	oncancel={() => (pendingDeleteItem = null)}
>
	{#snippet content()}
		<p class="text-sm text-muted-foreground">
			<span class="font-medium text-foreground">"{pendingDeleteItem?.title}"</span>
			leaves your history now and is erased for good after 30 days. Chats you started from it stay
			until you delete them.
		</p>
	{/snippet}
</ConfirmationModal>

<!-- Brain Dump chats retain their capture-specific context and local host. -->
{#if isAgentModalOpen && selectedChatSessionId}
	{#await loadAgentChatModal() then { default: AgentChatModal }}
		<AgentChatModal
			isOpen={isAgentModalOpen}
			onClose={closeAgentModal}
			initialChatSessionId={selectedChatSessionId}
			initialBrainDumpContext={selectedBrainDumpContext}
		/>
	{/await}
{/if}
