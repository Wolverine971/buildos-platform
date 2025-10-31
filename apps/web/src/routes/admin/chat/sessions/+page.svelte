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
		ChevronUp
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
		}>
	>([]);

	let totalSessions = $state(0);
	let currentPage = $state(1);
	let pageSize = $state(20);

	// Load data on mount and when filters change
	$effect(() => {
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

<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
	<div class="container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
		<!-- Header -->
		<AdminPageHeader
			title="Chat Sessions"
			description="View and analyze all chat conversations"
			icon={MessageSquare}
			showBack={true}
		>
			<div slot="actions" class="flex items-center space-x-4">
				<!-- Timeframe -->
				<Select
					bind:value={selectedTimeframe}
					on:change={(e) => (selectedTimeframe = e.detail)}
					size="md"
					placeholder="Last 7 Days"
				>
					<option value="24h">Last 24 Hours</option>
					<option value="7d">Last 7 Days</option>
					<option value="30d">Last 30 Days</option>
				</Select>

				<!-- Refresh -->
				<Button
					on:click={loadSessions}
					disabled={isLoading}
					variant="secondary"
					size="sm"
					icon={RefreshCw}
					loading={isLoading}
				>
					Refresh
				</Button>
			</div>
		</AdminPageHeader>

		<!-- Search and Filters -->
		<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-6">
			<!-- Search Bar -->
			<form on:submit={handleSearch} class="mb-4">
				<div class="flex items-center space-x-2">
					<div class="flex-1 relative">
						<Search
							class="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400"
						/>
						<input
							type="text"
							bind:value={searchQuery}
							placeholder="Search sessions by user email or session ID..."
							class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
						/>
					</div>
					<Button type="submit" variant="primary" size="md">Search</Button>
				</div>
			</form>

			<!-- Filter Toggle -->
			<button
				on:click={() => (showFilters = !showFilters)}
				class="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
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
							class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
						>
							Status
						</label>
						<Select
							bind:value={selectedStatus}
							on:change={(e) => (selectedStatus = e.detail)}
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
							class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
						>
							Context Type
						</label>
						<Select
							bind:value={selectedContextType}
							on:change={(e) => (selectedContextType = e.detail)}
							size="md"
						>
							<option value="all">All Contexts</option>
							<option value="global">Global</option>
							<option value="general">General</option>
							<option value="project">Project</option>
							<option value="project_create">Project Create</option>
							<option value="project_update">Project Update</option>
							<option value="project_audit">Project Audit</option>
							<option value="project_forecast">Project Forecast</option>
							<option value="task">Task</option>
							<option value="task_update">Task Update</option>
							<option value="calendar">Calendar</option>
							<option value="daily_brief_update">Daily Brief Update</option>
						</Select>
					</div>
				</div>
			{/if}
		</div>

		{#if error}
			<div
				class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 dark:bg-red-900/20 dark:border-red-800"
			>
				<div class="flex items-center">
					<AlertCircle class="h-5 w-5 text-red-600 mr-2" />
					<p class="text-red-800 dark:text-red-200">{error}</p>
				</div>
			</div>
		{/if}

		<!-- Sessions List -->
		{#if isLoading}
			<div class="space-y-4">
				{#each Array(5) as _}
					<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 animate-pulse">
						<div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-4"></div>
						<div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
					</div>
				{/each}
			</div>
		{:else if sessions.length === 0}
			<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
				<MessageSquare class="h-12 w-12 text-gray-400 mx-auto mb-4" />
				<h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
					No sessions found
				</h3>
				<p class="text-gray-600 dark:text-gray-400">
					Try adjusting your filters or search query.
				</p>
			</div>
		{:else}
			<div class="space-y-4">
				{#each sessions as session}
					<button
						on:click={() => viewSession(session.id)}
						class="w-full bg-white dark:bg-gray-800 rounded-lg shadow p-6 hover:shadow-lg transition-shadow text-left"
					>
						<!-- Header -->
						<div class="flex items-start justify-between mb-4">
							<div class="flex-1">
								<div class="flex items-center space-x-3 mb-2">
									<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
										{session.title || 'Untitled Session'}
									</h3>
									<span
										class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium {getStatusColor(
											session.status
										)}"
									>
										<svelte:component
											this={getStatusIcon(session.status)}
											class="h-3 w-3 mr-1"
										/>
										{session.status}
									</span>
								</div>
								<div
									class="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400"
								>
									<span>{session.user.email}</span>
									<span>•</span>
									<span>{formatDate(session.created_at)}</span>
									<span>•</span>
									<span class="capitalize">{session.context_type}</span>
								</div>
							</div>
						</div>

						<!-- Metrics -->
						<div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
							<div>
								<div class="text-xs text-gray-500 dark:text-gray-400">Messages</div>
								<div class="text-lg font-semibold text-gray-900 dark:text-white">
									{formatNumber(session.message_count)}
								</div>
							</div>
							<div>
								<div class="text-xs text-gray-500 dark:text-gray-400">Tokens</div>
								<div class="text-lg font-semibold text-gray-900 dark:text-white">
									{formatNumber(session.total_tokens)}
								</div>
							</div>
							<div>
								<div class="text-xs text-gray-500 dark:text-gray-400">
									Tool Calls
								</div>
								<div class="text-lg font-semibold text-gray-900 dark:text-white">
									{formatNumber(session.tool_call_count)}
								</div>
							</div>
							<div>
								<div class="text-xs text-gray-500 dark:text-gray-400">Cost</div>
								<div class="text-lg font-semibold text-gray-900 dark:text-white">
									{formatCurrency(session.cost_estimate)}
								</div>
							</div>
						</div>

						<!-- Badges -->
						<div class="flex items-center space-x-2">
							{#if session.has_agent_plan}
								<span
									class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
								>
									<Bot class="h-3 w-3 mr-1" />
									Multi-Agent
								</span>
							{/if}
							{#if session.has_compression}
								<span
									class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
								>
									<Sparkles class="h-3 w-3 mr-1" />
									Compressed
								</span>
							{/if}
							{#if session.has_errors}
								<span
									class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
								>
									<AlertCircle class="h-3 w-3 mr-1" />
									Has Errors
								</span>
							{/if}
						</div>
					</button>
				{/each}
			</div>

			<!-- Pagination -->
			<div class="mt-6 flex items-center justify-between">
				<div class="text-sm text-gray-600 dark:text-gray-400">
					Showing {(currentPage - 1) * pageSize + 1} to {Math.min(
						currentPage * pageSize,
						totalSessions
					)} of {formatNumber(totalSessions)} sessions
				</div>
				<div class="flex items-center space-x-2">
					<Button
						on:click={previousPage}
						disabled={currentPage === 1}
						variant="secondary"
						size="sm"
					>
						Previous
					</Button>
					<span class="text-sm text-gray-600 dark:text-gray-400">
						Page {currentPage} of {Math.ceil(totalSessions / pageSize)}
					</span>
					<Button
						on:click={nextPage}
						disabled={currentPage * pageSize >= totalSessions}
						variant="secondary"
						size="sm"
					>
						Next
					</Button>
				</div>
			</div>
		{/if}
	</div>
</div>

<!-- Session Detail Modal -->
<SessionDetailModal sessionId={selectedSessionId} onClose={closeModal} />
