<!-- apps/web/src/routes/admin/chat/sessions/+page.svelte -->
<script lang="ts">
	import {
		MessageSquare,
		Filter,
		Search,
		RefreshCw,
		CheckCircle,
		XCircle,
		Clock,
		Bot,
		Sparkles,
		AlertCircle,
		ChevronDown,
		ChevronUp,
		Timer,
		Zap
	} from 'lucide-svelte';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import SessionDetailModal from '$lib/components/admin/SessionDetailModal.svelte';
	import { browser } from '$app/environment';

	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let selectedSessionId = $state<string | null>(null);

	// Filters
	let searchQuery = $state('');
	let selectedStatus = $state<string>('all');
	let selectedContextType = $state<string>('all');
	let selectedTimeframe = $state<'24h' | '7d' | '30d'>('7d');
	let showFilters = $state(false);

	// Timing metrics type
	interface TimingMetrics {
		ttfr_ms: number | null;
		ttfe_ms: number | null;
		context_build_ms: number | null;
		tool_selection_ms: number | null;
		clarification_ms: number | null;
		plan_creation_ms: number | null;
		plan_execution_ms: number | null;
		plan_step_count: number | null;
		plan_status: string | null;
	}

	// Sessions data
	let sessions = $state<
		Array<{
			id: string;
			title: string;
			user: { id: string; email: string; name: string };
			message_count: number;
			total_tokens: number;
			tool_call_count: number;
			context_type: string;
			status: string;
			created_at: string;
			updated_at: string;
			has_agent_plan: boolean;
			has_compression: boolean;
			has_errors: boolean;
			cost_estimate: number;
			timing: TimingMetrics | null;
		}>
	>([]);

	// View mode (list or timing)
	let viewMode = $state<'list' | 'timing'>('list');

	let totalSessions = $state(0);
	let currentPage = $state(1);
	let pageSize = $state(20);

	// Load data on mount and when filters change
	$effect(() => {
		if (!browser) return;
		selectedTimeframe;
		selectedStatus;
		selectedContextType;
		currentPage;
		loadSessions();
	});

	async function loadSessions() {
		if (!browser) return;
		isLoading = true;
		error = null;

		try {
			const params = new URLSearchParams({
				timeframe: selectedTimeframe,
				page: currentPage.toString(),
				limit: pageSize.toString()
			});

			if (selectedStatus !== 'all') params.append('status', selectedStatus);
			if (selectedContextType !== 'all') params.append('context_type', selectedContextType);
			if (searchQuery) params.append('search', searchQuery);

			const response = await fetch(`/api/admin/chat/sessions?${params}`);

			if (!response.ok) {
				throw new Error('Failed to load sessions');
			}

			const data = await response.json();

			if (data.success) {
				sessions = data.data.sessions;
				totalSessions = data.data.total;
			} else {
				throw new Error(data.message || 'Failed to load sessions');
			}
		} catch (err) {
			console.error('Error loading sessions:', err);
			error = err instanceof Error ? err.message : 'Failed to load sessions';
		} finally {
			isLoading = false;
		}
	}

	function formatNumber(num: number): string {
		return new Intl.NumberFormat().format(num);
	}

	function formatCurrency(num: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 2
		}).format(num);
	}

	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleString();
	}

	function formatMs(ms: number | null | undefined): string {
		if (ms === null || ms === undefined) return '-';
		if (ms < 1000) return `${Math.round(ms)}ms`;
		return `${(ms / 1000).toFixed(2)}s`;
	}

	function getTtfrWarning(ms: number | null): 'normal' | 'warning' | 'critical' {
		if (ms === null) return 'normal';
		if (ms > 10000) return 'critical';
		if (ms > 5000) return 'warning';
		return 'normal';
	}

	function getStatusColor(status: string): string {
		switch (status) {
			case 'active':
				return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
			case 'archived':
				return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
			case 'compressed':
				return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
			default:
				return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
		}
	}

	function getStatusIcon(status: string) {
		switch (status) {
			case 'active':
				return Clock;
			case 'archived':
				return CheckCircle;
			case 'compressed':
				return Sparkles;
			default:
				return MessageSquare;
		}
	}

	function viewSession(sessionId: string) {
		selectedSessionId = sessionId;
	}

	function closeModal() {
		selectedSessionId = null;
	}

	function handleSearch(event: Event) {
		event.preventDefault();
		currentPage = 1;
		loadSessions();
	}

	function nextPage() {
		if (currentPage * pageSize < totalSessions) {
			currentPage++;
		}
	}

	function previousPage() {
		if (currentPage > 1) {
			currentPage--;
		}
	}
</script>

<svelte:head>
	<title>Chat Sessions - Admin - BuildOS</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="admin-page">
	<!-- Header -->
	<AdminPageHeader
		title="Chat Sessions"
		description="View and analyze all chat conversations"
		icon={MessageSquare}
		showBack={true}
	>
		<div slot="actions" class="flex flex-wrap items-center gap-3">
			<!-- Timeframe -->
			<Select
				bind:value={selectedTimeframe}
				onchange={(e) => (selectedTimeframe = e.detail)}
				size="md"
				placeholder="Last 7 Days"
				aria-label="Select time range"
			>
				<option value="24h">Last 24 Hours</option>
				<option value="7d">Last 7 Days</option>
				<option value="30d">Last 30 Days</option>
			</Select>

			<!-- View Toggle -->
			<div class="flex items-center border border-border rounded-lg overflow-hidden">
				<button
					onclick={() => (viewMode = 'list')}
					class="px-3 py-1.5 text-sm font-medium transition-colors {viewMode === 'list'
						? 'bg-accent text-accent-foreground'
						: 'bg-card text-muted-foreground hover:text-foreground'}"
				>
					List
				</button>
				<button
					onclick={() => (viewMode = 'timing')}
					class="px-3 py-1.5 text-sm font-medium transition-colors {viewMode === 'timing'
						? 'bg-accent text-accent-foreground'
						: 'bg-card text-muted-foreground hover:text-foreground'}"
				>
					Timing
				</button>
			</div>

			<!-- Refresh -->
			<Button
				onclick={loadSessions}
				disabled={isLoading}
				variant="secondary"
				size="sm"
				icon={RefreshCw}
				loading={isLoading}
				class="pressable"
			>
				Refresh
			</Button>
		</div>
	</AdminPageHeader>

	<!-- Search and Filters -->
	<div class="bg-card border border-border rounded-lg p-4 shadow-ink mb-6">
		<!-- Search Bar -->
		<form onsubmit={handleSearch} class="mb-4">
			<div class="flex items-center gap-2">
				<div class="flex-1 relative">
					<Search
						class="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground"
					/>
					<input
						type="text"
						bind:value={searchQuery}
						placeholder="Search sessions by user email or session ID..."
						class="w-full pl-10 pr-4 py-2 text-sm bg-background border border-border rounded-lg shadow-ink-inner focus:ring-2 focus:ring-ring focus:border-accent text-foreground placeholder:text-muted-foreground"
						aria-label="Search sessions"
					/>
				</div>
				<Button type="submit" variant="primary" size="md" class="pressable">Search</Button>
			</div>
		</form>

		<!-- Filter Toggle -->
		<button
			onclick={() => (showFilters = !showFilters)}
			class="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring rounded"
			aria-expanded={showFilters}
		>
			<Filter class="h-4 w-4" />
			<span>Filters</span>
			{#if showFilters}
				<ChevronUp class="h-4 w-4" />
			{:else}
				<ChevronDown class="h-4 w-4" />
			{/if}
		</button>

		<!-- Filters -->
		{#if showFilters}
			<div class="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
				<!-- Status Filter -->
				<div>
					<label
						for="session-status-filter"
						class="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1"
					>
						Status
					</label>
					<Select
						id="session-status-filter"
						bind:value={selectedStatus}
						onchange={(e) => (selectedStatus = e.detail)}
						size="md"
					>
						<option value="all">All Statuses</option>
						<option value="active">Active</option>
						<option value="archived">Archived</option>
						<option value="compressed">Compressed</option>
					</Select>
				</div>

				<!-- Context Type Filter -->
				<div>
					<label
						for="session-context-filter"
						class="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1"
					>
						Context Type
					</label>
					<Select
						id="session-context-filter"
						bind:value={selectedContextType}
						onchange={(e) => (selectedContextType = e.detail)}
						size="md"
					>
						<option value="all">All Contexts</option>
						<option value="global">Global</option>
						<option value="general">General</option>
						<option value="project">Project workspace</option>
						<option value="project_create">Project Create</option>
						<option value="project_audit">Project Audit</option>
						<option value="project_forecast">Project Forecast</option>
						<option value="calendar">Calendar</option>
						<option value="daily_brief_update">Daily Brief Update</option>
						<option value="brain_dump">Braindump</option>
						<option value="ontology">Ontology</option>
					</Select>
				</div>
			</div>
		{/if}
	</div>

	{#if error}
		<div
			class="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-6 tx tx-static tx-weak"
			role="alert"
		>
			<div class="flex items-center gap-2">
				<AlertCircle class="h-5 w-5 text-red-500 shrink-0" />
				<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
			</div>
		</div>
	{/if}

	<!-- Sessions List -->
	{#if isLoading}
		<div class="space-y-3">
			{#each Array(5) as _}
				<div class="bg-card border border-border rounded-lg p-4 shadow-ink animate-pulse">
					<div class="h-4 bg-muted rounded w-3/4 mb-4"></div>
					<div class="h-3 bg-muted rounded w-1/2"></div>
				</div>
			{/each}
		</div>
	{:else if sessions.length === 0}
		<div
			class="bg-card border border-border rounded-lg p-12 text-center shadow-ink tx tx-frame tx-weak"
		>
			<MessageSquare class="h-12 w-12 text-muted-foreground mx-auto mb-4" />
			<h3 class="text-base font-medium text-foreground mb-2">No sessions found</h3>
			<p class="text-sm text-muted-foreground">Try adjusting your filters or search query.</p>
		</div>
	{:else}
		<div class="space-y-3">
			{#each sessions as session}
				{@const StatusIcon = getStatusIcon(session.status)}
				<button
					onclick={() => viewSession(session.id)}
					class="w-full bg-card border border-border rounded-lg p-4 shadow-ink hover:shadow-ink-strong hover:border-accent transition-all text-left pressable focus:outline-none focus:ring-2 focus:ring-ring tx tx-frame tx-weak"
				>
					<!-- Header -->
					<div class="flex items-start justify-between mb-3">
						<div class="flex-1 min-w-0">
							<div class="flex flex-wrap items-center gap-2 mb-2">
								<h3 class="text-sm font-semibold text-foreground truncate">
									{session.title || 'Untitled Session'}
								</h3>
								<span
									class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium {getStatusColor(
										session.status
									)}"
								>
									<StatusIcon class="h-3 w-3 mr-1" />
									{session.status}
								</span>
							</div>
							<div
								class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
							>
								<span class="truncate max-w-[200px]">{session.user.email}</span>
								<span>•</span>
								<span>{formatDate(session.created_at)}</span>
								<span>•</span>
								<span class="capitalize">{session.context_type}</span>
							</div>
						</div>
					</div>

					<!-- Metrics -->
					{#if viewMode === 'list'}
						<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
							<div>
								<div class="text-xs text-muted-foreground">Messages</div>
								<div class="text-base font-semibold text-foreground">
									{formatNumber(session.message_count)}
								</div>
							</div>
							<div>
								<div class="text-xs text-muted-foreground">Tokens</div>
								<div class="text-base font-semibold text-foreground">
									{formatNumber(session.total_tokens)}
								</div>
							</div>
							<div>
								<div class="text-xs text-muted-foreground">Tool Calls</div>
								<div class="text-base font-semibold text-foreground">
									{formatNumber(session.tool_call_count)}
								</div>
							</div>
							<div>
								<div class="text-xs text-muted-foreground">Cost</div>
								<div class="text-base font-semibold text-foreground">
									{formatCurrency(session.cost_estimate)}
								</div>
							</div>
						</div>
					{:else}
						<!-- Timing Metrics View -->
						<div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-3">
							<div>
								<div class="text-xs text-muted-foreground flex items-center gap-1">
									<Clock class="h-3 w-3" /> TTFR
								</div>
								<div
									class="text-base font-semibold {getTtfrWarning(
										session.timing?.ttfr_ms
									) === 'critical'
										? 'text-red-500'
										: getTtfrWarning(session.timing?.ttfr_ms) === 'warning'
											? 'text-amber-500'
											: 'text-foreground'}"
								>
									{formatMs(session.timing?.ttfr_ms)}
								</div>
							</div>
							<div>
								<div class="text-xs text-muted-foreground flex items-center gap-1">
									<Zap class="h-3 w-3" /> TTFE
								</div>
								<div class="text-base font-semibold text-foreground">
									{formatMs(session.timing?.ttfe_ms)}
								</div>
							</div>
							<div>
								<div class="text-xs text-muted-foreground">Context</div>
								<div class="text-base font-semibold text-foreground">
									{formatMs(session.timing?.context_build_ms)}
								</div>
							</div>
							<div>
								<div class="text-xs text-muted-foreground">Tool Sel.</div>
								<div
									class="text-base font-semibold {(session.timing
										?.tool_selection_ms ?? 0) > 2000
										? 'text-red-500'
										: (session.timing?.tool_selection_ms ?? 0) > 1000
											? 'text-amber-500'
											: 'text-foreground'}"
								>
									{formatMs(session.timing?.tool_selection_ms)}
								</div>
							</div>
							<div>
								<div class="text-xs text-muted-foreground">Plan</div>
								<div class="text-base font-semibold text-foreground">
									{formatMs(session.timing?.plan_creation_ms)}
								</div>
							</div>
							<div>
								<div class="text-xs text-muted-foreground">Exec</div>
								<div
									class="text-base font-semibold {(session.timing
										?.plan_execution_ms ?? 0) > 10000
										? 'text-red-500'
										: (session.timing?.plan_execution_ms ?? 0) > 5000
											? 'text-amber-500'
											: 'text-foreground'}"
								>
									{formatMs(session.timing?.plan_execution_ms)}
								</div>
							</div>
						</div>
					{/if}

					<!-- Badges -->
					<div class="flex flex-wrap items-center gap-2">
						{#if session.has_agent_plan}
							<span
								class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400"
							>
								<Bot class="h-3 w-3 mr-1" />
								Multi-Agent
							</span>
						{/if}
						{#if session.has_compression}
							<span
								class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
							>
								<Sparkles class="h-3 w-3 mr-1" />
								Compressed
							</span>
						{/if}
						{#if session.has_errors}
							<span
								class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-600 dark:text-red-400"
							>
								<AlertCircle class="h-3 w-3 mr-1" />
								Has Errors
							</span>
						{/if}
						{#if session.timing?.ttfr_ms && session.timing.ttfr_ms > 5000}
							<span
								class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium {session
									.timing.ttfr_ms > 10000
									? 'bg-red-500/10 text-red-600 dark:text-red-400'
									: 'bg-amber-500/10 text-amber-600 dark:text-amber-400'}"
							>
								<Timer class="h-3 w-3 mr-1" />
								Slow ({formatMs(session.timing.ttfr_ms)})
							</span>
						{/if}
						{#if session.timing?.plan_step_count}
							<span
								class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-500/10 text-cyan-600 dark:text-cyan-400"
							>
								{session.timing.plan_step_count} steps
							</span>
						{/if}
					</div>
				</button>
			{/each}
		</div>

		<!-- Pagination -->
		<div class="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
			<div class="text-sm text-muted-foreground">
				Showing {(currentPage - 1) * pageSize + 1} to {Math.min(
					currentPage * pageSize,
					totalSessions
				)} of {formatNumber(totalSessions)} sessions
			</div>
			<div class="flex items-center gap-2">
				<Button
					onclick={previousPage}
					disabled={currentPage === 1}
					variant="secondary"
					size="sm"
					class="pressable"
				>
					Previous
				</Button>
				<span class="text-sm text-muted-foreground px-2">
					Page {currentPage} of {Math.ceil(totalSessions / pageSize)}
				</span>
				<Button
					onclick={nextPage}
					disabled={currentPage * pageSize >= totalSessions}
					variant="secondary"
					size="sm"
					class="pressable"
				>
					Next
				</Button>
			</div>
		</div>
	{/if}
</div>

<!-- Session Detail Modal -->
<SessionDetailModal sessionId={selectedSessionId} onClose={closeModal} />
