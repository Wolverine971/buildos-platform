<!-- apps/web/src/routes/history/thoughts/+page.svelte -->
<!--
  Thoughts History Page - INKPRINT Design System

  Lists braindumps captured via the agent chat braindump context.
  Users can view their thought captures and re-open them in the AgentChatModal
  to continue exploring with AI assistance.
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
		Sparkles
	} from 'lucide-svelte';
	import AgentChatModal from '$lib/components/agent/AgentChatModal.svelte';

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

	interface PageData {
		braindumps: OntoBraindump[];
		total: number;
		stats: {
			total: number;
			processed: number;
			pending: number;
			processing: number;
			failed: number;
		};
		filters: {
			limit: number;
			offset: number;
			status: OntoBraindump['status'] | null;
			search: string;
			selectedId: string | null;
		};
		selectedBraindump: OntoBraindump | null;
		hasMore: boolean;
	}

	let { data }: { data: PageData } = $props();

	// Local state
	let searchInput = $state(data.filters.search);
	let statusFilter = $state<OntoBraindump['status'] | ''>(data.filters.status || '');
	let isAgentModalOpen = $state(false);
	let selectedBraindumpForChat = $state<OntoBraindump | null>(null);

	// Open modal if we have a selectedBraindump from URL
	$effect(() => {
		if (data.selectedBraindump && browser) {
			selectedBraindumpForChat = data.selectedBraindump;
			isAgentModalOpen = true;
		}
	});

	// Derived states
	const braindumps = $derived(data.braindumps);
	const stats = $derived(data.stats);
	const hasMore = $derived(data.hasMore);
	const currentOffset = $derived(data.filters.offset);
	const limit = $derived(data.filters.limit);

	function getStatusIcon(status: OntoBraindump['status']) {
		switch (status) {
			case 'processed':
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

	function getStatusColor(status: OntoBraindump['status']) {
		switch (status) {
			case 'processed':
				return 'text-emerald-600 dark:text-emerald-400';
			case 'processing':
				return 'text-blue-600 dark:text-blue-400 animate-spin';
			case 'pending':
				return 'text-amber-600 dark:text-amber-400';
			case 'failed':
				return 'text-red-600 dark:text-red-400';
			default:
				return 'text-muted-foreground';
		}
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

	function truncateContent(content: string, maxLength: number = 150) {
		if (content.length <= maxLength) return content;
		return content.slice(0, maxLength).trim() + '...';
	}

	function applyFilters() {
		const params = new URLSearchParams();
		if (searchInput) params.set('search', searchInput);
		if (statusFilter) params.set('status', statusFilter);
		goto(`/history/thoughts?${params.toString()}`);
	}

	function clearFilters() {
		searchInput = '';
		statusFilter = '';
		goto('/history/thoughts');
	}

	function loadMore() {
		const params = new URLSearchParams($page.url.searchParams);
		params.set('offset', String(currentOffset + limit));
		goto(`/history/thoughts?${params.toString()}`);
	}

	function openBraindumpChat(braindump: OntoBraindump) {
		selectedBraindumpForChat = braindump;
		isAgentModalOpen = true;
		// Update URL to reflect selection (for sharing/bookmarking)
		const params = new URLSearchParams($page.url.searchParams);
		params.set('id', braindump.id);
		goto(`/history/thoughts?${params.toString()}`, { replaceState: true });
	}

	function closeAgentModal() {
		isAgentModalOpen = false;
		selectedBraindumpForChat = null;
		// Remove id from URL
		const params = new URLSearchParams($page.url.searchParams);
		params.delete('id');
		const newUrl = params.toString()
			? `/history/thoughts?${params.toString()}`
			: '/history/thoughts';
		goto(newUrl, { replaceState: true });
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			applyFilters();
		}
	}
</script>

<svelte:head>
	<title>Thoughts History | BuildOS</title>
	<meta name="description" content="View and explore your captured braindumps and thoughts" />
</svelte:head>

<div class="min-h-screen bg-background">
	<!-- Header -->
	<div class="border-b border-border bg-card">
		<div class="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
			<div class="flex items-center gap-3">
				<div class="rounded-lg bg-violet-100 p-2 dark:bg-violet-900/30">
					<Lightbulb class="h-6 w-6 text-violet-600 dark:text-violet-400" />
				</div>
				<div>
					<h1 class="text-2xl font-bold text-foreground">Thoughts History</h1>
					<p class="text-sm text-muted-foreground">
						Your captured braindumps and thought explorations
					</p>
				</div>
			</div>
		</div>
	</div>

	<!-- Main content -->
	<div class="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
		<!-- Stats cards -->
		<div class="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
			<div class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak">
				<div class="text-2xl font-bold text-foreground">{stats.total}</div>
				<div class="text-sm text-muted-foreground">Total Thoughts</div>
			</div>
			<div class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak">
				<div class="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
					{stats.processed}
				</div>
				<div class="text-sm text-muted-foreground">Processed</div>
			</div>
			<div class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak">
				<div class="text-2xl font-bold text-amber-600 dark:text-amber-400">
					{stats.pending + stats.processing}
				</div>
				<div class="text-sm text-muted-foreground">Pending</div>
			</div>
			<div class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak">
				<div class="text-2xl font-bold text-red-600 dark:text-red-400">{stats.failed}</div>
				<div class="text-sm text-muted-foreground">Failed</div>
			</div>
		</div>

		<!-- Filters -->
		<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center">
			<div class="relative flex-1">
				<Search
					class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
				/>
				<input
					type="text"
					placeholder="Search thoughts..."
					bind:value={searchInput}
					onkeydown={handleKeydown}
					class="w-full rounded-lg border border-border bg-background py-2 pl-10 pr-4 text-foreground placeholder:text-muted-foreground focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
				/>
			</div>
			<div class="flex items-center gap-2">
				<Filter class="h-4 w-4 text-muted-foreground" />
				<select
					bind:value={statusFilter}
					onchange={applyFilters}
					class="rounded-lg border border-border bg-background px-3 py-2 text-foreground focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
				>
					<option value="">All statuses</option>
					<option value="processed">Processed</option>
					<option value="pending">Pending</option>
					<option value="processing">Processing</option>
					<option value="failed">Failed</option>
				</select>
				<button
					onclick={applyFilters}
					class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 pressable"
				>
					Search
				</button>
				{#if searchInput || statusFilter}
					<button
						onclick={clearFilters}
						class="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted pressable"
					>
						<X class="h-4 w-4" />
					</button>
				{/if}
			</div>
		</div>

		<!-- Braindumps list -->
		{#if braindumps.length === 0}
			<div
				class="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/50 py-16 tx tx-bloom tx-weak"
			>
				<Lightbulb class="mb-4 h-12 w-12 text-muted-foreground" />
				<h3 class="mb-2 text-lg font-medium text-foreground">No thoughts captured yet</h3>
				<p class="mb-4 text-center text-sm text-muted-foreground">
					Use the Braindump context in the agent chat to capture<br />
					your raw thoughts and explore them with AI.
				</p>
				<button
					onclick={() => {
						// Could open the agent chat modal here
					}}
					class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 pressable"
				>
					Start a Braindump
				</button>
			</div>
		{:else}
			<div class="space-y-4">
				{#each braindumps as braindump (braindump.id)}
					<button
						onclick={() => openBraindumpChat(braindump)}
						class="group w-full rounded-lg border border-border bg-card p-4 text-left shadow-ink transition-all hover:border-violet-500/50 hover:shadow-ink-strong tx tx-frame tx-weak pressable"
					>
						<div class="flex items-start justify-between gap-4">
							<div class="flex-1 min-w-0">
								<!-- Title and status -->
								<div class="mb-2 flex items-center gap-2">
									<svelte:component
										this={getStatusIcon(braindump.status)}
										class="h-4 w-4 flex-shrink-0 {getStatusColor(braindump.status)}"
									/>
									<h3 class="truncate font-medium text-foreground">
										{braindump.title || 'Untitled thought'}
									</h3>
								</div>

								<!-- Summary or content preview -->
								<p class="mb-3 text-sm text-muted-foreground line-clamp-2">
									{braindump.summary || truncateContent(braindump.content)}
								</p>

								<!-- Topics -->
								{#if braindump.topics && braindump.topics.length > 0}
									<div class="mb-3 flex flex-wrap gap-2">
										{#each braindump.topics.slice(0, 5) as topic}
											<span
												class="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
											>
												<Tag class="h-3 w-3" />
												{topic}
											</span>
										{/each}
										{#if braindump.topics.length > 5}
											<span class="text-xs text-muted-foreground">
												+{braindump.topics.length - 5} more
											</span>
										{/if}
									</div>
								{/if}

								<!-- Metadata -->
								<div class="flex items-center gap-4 text-xs text-muted-foreground">
									<span class="flex items-center gap-1">
										<Clock class="h-3 w-3" />
										{formatDate(braindump.created_at)}
									</span>
									{#if braindump.chat_session_id}
										<span class="flex items-center gap-1">
											<MessageSquare class="h-3 w-3" />
											Has chat session
										</span>
									{/if}
								</div>
							</div>

							<!-- Action indicator -->
							<div
								class="flex items-center gap-2 text-muted-foreground group-hover:text-violet-600 dark:group-hover:text-violet-400"
							>
								<span class="hidden text-sm sm:inline">Explore</span>
								<ChevronRight class="h-5 w-5" />
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
						Load more thoughts
					</button>
				</div>
			{/if}

			<!-- Results info -->
			<div class="mt-4 text-center text-sm text-muted-foreground">
				Showing {Math.min(currentOffset + braindumps.length, data.total)} of {data.total} thoughts
			</div>
		{/if}
	</div>
</div>

<!-- Agent Chat Modal for exploring braindumps -->
{#if isAgentModalOpen && selectedBraindumpForChat}
	<AgentChatModal
		isOpen={isAgentModalOpen}
		contextType="brain_dump"
		onClose={closeAgentModal}
		initialBraindump={selectedBraindumpForChat}
	/>
{/if}
