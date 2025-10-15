<!-- apps/web/src/routes/admin/notifications/nlogs/+page.svelte -->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Eye, Bell, Send, RefreshCw } from 'lucide-svelte';
	import { browser } from '$app/environment';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import LogEventTable from '$lib/components/admin/notifications/LogEventTable.svelte';
	import LogDeliveryTable from '$lib/components/admin/notifications/LogDeliveryTable.svelte';
	import LogSystemTable from '$lib/components/admin/notifications/LogSystemTable.svelte';
	import LogFilters from '$lib/components/admin/notifications/LogFilters.svelte';
	import CorrelationViewer from '$lib/components/admin/notifications/CorrelationViewer.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	type Tab = 'events' | 'deliveries' | 'system';

	let activeTab = $state<Tab>('events');
	let loading = $state(false);
	let autoRefresh = $state(false);
	let refreshInterval: number | null = null;

	// Event Log State
	let events = $state([]);
	let eventFilters = $state({});
	let eventPagination = $state({ page: 1, limit: 50, total: 0, total_pages: 0 });

	// Delivery Log State
	let deliveries = $state([]);
	let deliveryFilters = $state({});
	let deliveryPagination = $state({ page: 1, limit: 50, total: 0, total_pages: 0 });

	// System Log State
	let systemLogs = $state([]);
	let systemFilters = $state({});
	let systemPagination = $state({ page: 1, limit: 100, total: 0, total_pages: 0 });

	// Correlation Viewer State
	let showCorrelationViewer = $state(false);
	let correlationId = $state<string | null>(null);
	let correlationData = $state(null);
	let correlationLoading = $state(false);

	onMount(() => {
		// Load initial data based on active tab
		loadData();

		// Setup real-time subscriptions could be added here
		// For now, we'll use auto-refresh
	});

	onDestroy(() => {
		if (refreshInterval) {
			clearInterval(refreshInterval);
		}
	});

	async function loadData() {
		switch (activeTab) {
			case 'events':
				await loadEvents();
				break;
			case 'deliveries':
				await loadDeliveries();
				break;
			case 'system':
				await loadSystemLogs();
				break;
		}
	}

	async function loadEvents() {
		if (!browser) return;

		loading = true;
		try {
			const params = new URLSearchParams({
				page: eventPagination.page.toString(),
				limit: eventPagination.limit.toString(),
				...eventFilters
			} as any);

			const response = await fetch(`/api/admin/notifications/nlogs/events?${params}`);
			const data = await response.json();

			if (data.success) {
				events = data.data.events;
				eventPagination = data.data.pagination;
			}
		} catch (error) {
			console.error('Failed to load events:', error);
		} finally {
			loading = false;
		}
	}

	async function loadDeliveries() {
		if (!browser) return;

		loading = true;
		try {
			const params = new URLSearchParams({
				page: deliveryPagination.page.toString(),
				limit: deliveryPagination.limit.toString(),
				...deliveryFilters
			} as any);

			const response = await fetch(`/api/admin/notifications/nlogs/deliveries?${params}`);
			const data = await response.json();

			if (data.success) {
				deliveries = data.data.deliveries;
				deliveryPagination = data.data.pagination;
			}
		} catch (error) {
			console.error('Failed to load deliveries:', error);
		} finally {
			loading = false;
		}
	}

	async function loadSystemLogs() {
		if (!browser) return;

		loading = true;
		try {
			const params = new URLSearchParams({
				page: systemPagination.page.toString(),
				limit: systemPagination.limit.toString(),
				...systemFilters
			} as any);

			const response = await fetch(`/api/admin/notifications/nlogs/system?${params}`);
			const data = await response.json();

			if (data.success) {
				systemLogs = data.data.logs;
				systemPagination = data.data.pagination;
			}
		} catch (error) {
			console.error('Failed to load system logs:', error);
		} finally {
			loading = false;
		}
	}

	async function loadCorrelationData(id: string) {
		if (!browser) return;

		correlationLoading = true;
		try {
			const response = await fetch(`/api/admin/notifications/nlogs/correlation/${id}`);
			const data = await response.json();

			if (data.success) {
				correlationData = data.data;
			}
		} catch (error) {
			console.error('Failed to load correlation data:', error);
		} finally {
			correlationLoading = false;
		}
	}

	function handleFilterChange(filters: any) {
		switch (activeTab) {
			case 'events':
				eventFilters = filters;
				eventPagination.page = 1;
				loadEvents();
				break;
			case 'deliveries':
				deliveryFilters = filters;
				deliveryPagination.page = 1;
				loadDeliveries();
				break;
			case 'system':
				systemFilters = filters;
				systemPagination.page = 1;
				loadSystemLogs();
				break;
		}
	}

	function handleClearFilters() {
		switch (activeTab) {
			case 'events':
				eventFilters = {};
				eventPagination.page = 1;
				loadEvents();
				break;
			case 'deliveries':
				deliveryFilters = {};
				deliveryPagination.page = 1;
				loadDeliveries();
				break;
			case 'system':
				systemFilters = {};
				systemPagination.page = 1;
				loadSystemLogs();
				break;
		}
	}

	function handleViewCorrelation(id: string) {
		correlationId = id;
		showCorrelationViewer = true;
		loadCorrelationData(id);
	}

	function handleCopyCorrelationId(id: string) {
		// Correlation ID already copied by component
		// Could show a toast notification here
		console.log('Copied correlation ID:', id);
	}

	function handleTabChange(tab: Tab) {
		activeTab = tab;
		loadData();
	}

	function toggleAutoRefresh() {
		autoRefresh = !autoRefresh;
		if (autoRefresh) {
			refreshInterval = setInterval(() => {
				loadData();
			}, 30000) as unknown as number; // Refresh every 30 seconds
		} else if (refreshInterval) {
			clearInterval(refreshInterval);
			refreshInterval = null;
		}
	}

	function handleRefresh() {
		loadData();
	}
</script>

<svelte:head>
	<title>Notification Logs - BuildOS Admin</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
	<div class="container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
		<!-- Header -->
		<AdminPageHeader
			title="Notification Logs"
			description="View event and delivery logs for all notifications"
			icon={Eye}
			showBack={true}
		/>

		<!-- Navigation Cards -->
		<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
			<a
				href="/admin/notifications"
				class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
			>
				<div class="flex items-center">
					<Bell class="h-8 w-8 text-blue-600 mr-3" />
					<div>
						<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
							Analytics
						</h3>
						<p class="text-sm text-gray-600 dark:text-gray-400">View dashboard</p>
					</div>
				</div>
			</a>

			<a
				href="/admin/notifications/test-bed"
				class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
			>
				<div class="flex items-center">
					<Send class="h-8 w-8 text-green-600 mr-3" />
					<div>
						<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
							Test Bed
						</h3>
						<p class="text-sm text-gray-600 dark:text-gray-400">
							Send test notifications
						</p>
					</div>
				</div>
			</a>

			<a
				href="/admin/notifications/nlogs"
				class="bg-purple-50 dark:bg-purple-900/20 border-2 border-purple-200 dark:border-purple-800 rounded-lg p-6 hover:shadow-lg transition-shadow"
			>
				<div class="flex items-center">
					<Eye class="h-8 w-8 text-purple-600 mr-3" />
					<div>
						<h3 class="text-lg font-semibold text-gray-900 dark:text-white">Logs</h3>
						<p class="text-sm text-gray-600 dark:text-gray-400">Current page</p>
					</div>
				</div>
			</a>
		</div>

		<!-- Auto Refresh Controls -->
		<div class="mb-6 flex items-center justify-between">
			<div class="flex items-center space-x-4">
				<label class="flex items-center space-x-2 cursor-pointer">
					<input
						type="checkbox"
						bind:checked={autoRefresh}
						onchange={toggleAutoRefresh}
						class="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 cursor-pointer dark:bg-gray-700"
					/>
					<span class="text-sm text-gray-600 dark:text-gray-400">Auto Refresh (30s)</span>
				</label>
			</div>
			<Button
				onclick={handleRefresh}
				disabled={loading}
				variant="secondary"
				size="sm"
				icon={RefreshCw}
				{loading}
			>
				Refresh
			</Button>
		</div>

		<!-- Tabs -->
		<div class="bg-white dark:bg-gray-800 rounded-lg shadow">
			<div class="border-b border-gray-200 dark:border-gray-700">
				<nav class="flex space-x-8 px-6" aria-label="Tabs">
					<button
						type="button"
						onclick={() => handleTabChange('events')}
						class="py-4 px-1 border-b-2 font-medium text-sm transition-colors {activeTab ===
						'events'
							? 'border-blue-500 text-blue-600 dark:text-blue-400'
							: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'}"
					>
						Event Log
					</button>
					<button
						type="button"
						onclick={() => handleTabChange('deliveries')}
						class="py-4 px-1 border-b-2 font-medium text-sm transition-colors {activeTab ===
						'deliveries'
							? 'border-blue-500 text-blue-600 dark:text-blue-400'
							: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'}"
					>
						Delivery Log
					</button>
					<button
						type="button"
						onclick={() => handleTabChange('system')}
						class="py-4 px-1 border-b-2 font-medium text-sm transition-colors {activeTab ===
						'system'
							? 'border-blue-500 text-blue-600 dark:text-blue-400'
							: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'}"
					>
						System Logs
					</button>
				</nav>
			</div>

			<div class="p-6 space-y-6">
				<!-- Filters -->
				{#if activeTab === 'events'}
					<LogFilters
						bind:filters={eventFilters}
						config={{
							showEventType: true,
							showDateRange: true,
							showSearch: false
						}}
						onFilterChange={handleFilterChange}
						onClear={handleClearFilters}
					/>
				{:else if activeTab === 'deliveries'}
					<LogFilters
						bind:filters={deliveryFilters}
						config={{
							showChannel: true,
							showStatus: true,
							showDateRange: true,
							showSearch: false
						}}
						onFilterChange={handleFilterChange}
						onClear={handleClearFilters}
					/>
				{:else if activeTab === 'system'}
					<LogFilters
						bind:filters={systemFilters}
						config={{
							showLevel: true,
							showNamespace: true,
							showDateRange: true,
							showSearch: true
						}}
						onFilterChange={handleFilterChange}
						onClear={handleClearFilters}
					/>
				{/if}

				<!-- Tables -->
				{#if activeTab === 'events'}
					<LogEventTable {events} {loading} />
				{:else if activeTab === 'deliveries'}
					<LogDeliveryTable {deliveries} {loading} />
				{:else if activeTab === 'system'}
					<LogSystemTable
						logs={systemLogs}
						{loading}
						onViewCorrelation={handleViewCorrelation}
						onCopyCorrelationId={handleCopyCorrelationId}
					/>
				{/if}

				<!-- Pagination -->
				{#if activeTab === 'events' && eventPagination.total_pages > 1}
					<div class="flex items-center justify-between">
						<div class="text-sm text-gray-600 dark:text-gray-400">
							Showing page {eventPagination.page} of {eventPagination.total_pages} ({eventPagination.total}
							total)
						</div>
						<div class="flex space-x-2">
							<Button
								disabled={eventPagination.page === 1}
								onclick={() => {
									eventPagination.page--;
									loadEvents();
								}}
								variant="secondary"
								size="sm"
							>
								Previous
							</Button>
							<Button
								disabled={eventPagination.page >= eventPagination.total_pages}
								onclick={() => {
									eventPagination.page++;
									loadEvents();
								}}
								variant="secondary"
								size="sm"
							>
								Next
							</Button>
						</div>
					</div>
				{:else if activeTab === 'deliveries' && deliveryPagination.total_pages > 1}
					<div class="flex items-center justify-between">
						<div class="text-sm text-gray-600 dark:text-gray-400">
							Showing page {deliveryPagination.page} of {deliveryPagination.total_pages}
							({deliveryPagination.total} total)
						</div>
						<div class="flex space-x-2">
							<Button
								disabled={deliveryPagination.page === 1}
								onclick={() => {
									deliveryPagination.page--;
									loadDeliveries();
								}}
								variant="secondary"
								size="sm"
							>
								Previous
							</Button>
							<Button
								disabled={deliveryPagination.page >= deliveryPagination.total_pages}
								onclick={() => {
									deliveryPagination.page++;
									loadDeliveries();
								}}
								variant="secondary"
								size="sm"
							>
								Next
							</Button>
						</div>
					</div>
				{:else if activeTab === 'system' && systemPagination.total_pages > 1}
					<div class="flex items-center justify-between">
						<div class="text-sm text-gray-600 dark:text-gray-400">
							Showing page {systemPagination.page} of {systemPagination.total_pages} ({systemPagination.total}
							total)
						</div>
						<div class="flex space-x-2">
							<Button
								disabled={systemPagination.page === 1}
								onclick={() => {
									systemPagination.page--;
									loadSystemLogs();
								}}
								variant="secondary"
								size="sm"
							>
								Previous
							</Button>
							<Button
								disabled={systemPagination.page >= systemPagination.total_pages}
								onclick={() => {
									systemPagination.page++;
									loadSystemLogs();
								}}
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
	</div>
</div>

<!-- Correlation Viewer Modal -->
{#if showCorrelationViewer && correlationId}
	<CorrelationViewer
		{correlationId}
		data={correlationData}
		loading={correlationLoading}
		onClose={() => {
			showCorrelationViewer = false;
			correlationId = null;
			correlationData = null;
		}}
	/>
{/if}
