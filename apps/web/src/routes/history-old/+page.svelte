<!-- apps/web/src/routes/history-old/+page.svelte -->
<script lang="ts">
	import {
		Brain,
		Search,
		X,
		LoaderCircle,
		Calendar,
		ChevronLeft,
		ChevronRight,
		Plus
	} from 'lucide-svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import SearchCombobox from '$lib/components/SearchCombobox.svelte';
	import { goto, replaceState } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { format } from 'date-fns';
	import ContributionChart from '$lib/components/history/ContributionChart.svelte';
	import BraindumpHistoryCard from '$components/history/BraindumpHistoryCard.svelte';
	import BraindumpModal from '$lib/components/history/BraindumpModalHistory.svelte';
	import BraindumpHistoryDeleteModal from '$lib/components/history/BraindumpHistoryDeleteModal.svelte';
	import { toastService, TOAST_DURATION } from '$lib/stores/toast.store';
	import './history.css';
	import type { PageData } from './$types';

	export let data: PageData;

	// Reactive data
	$: contributionData = data.contributionData;
	$: dayBraindumps = data.dayBraindumps || [];
	$: recentBraindumps = data.recentBraindumps || [];
	$: availableYears = data.availableYears || [];
	$: filters = data.filters || {};
	$: stats = data.stats || {};
	$: urlBraindump = data.urlBraindump;
	$: urlBraindumpInResults = data.urlBraindumpInResults;
	$: userId = data.user?.id || '';

	// State
	let searchQuery = filters?.searchQuery || '';
	let selectedYear = filters?.selectedYear || new Date().getFullYear();
	let selectedDay = filters?.selectedDay || '';
	let braindumpId = filters?.braindumpId || '';
	let isLoading = false;
	let selectedBraindump: any = null;
	let showBraindumpModal = false;
	let isFetchingBraindump = false;

	// Delete dialog state
	let showDeleteDialog = false;
	let braindumpToDelete: any = null;
	let isDeletingBraindump = false;

	// Display data
	$: displayBraindumps = selectedDay ? dayBraindumps : recentBraindumps;
	$: hasSearchResults = searchQuery && displayBraindumps.length > 0;
	$: searchMatchDates = searchQuery
		? contributionData.contributions?.filter((c) => c.count > 0).map((c) => c.date)
		: [];

	// Debounced URL update
	let urlUpdateTimeout: number;
	function updateUrl(newBraindumpId: string | null) {
		clearTimeout(urlUpdateTimeout);
		urlUpdateTimeout = setTimeout(() => {
			const params = new URLSearchParams($page.url.searchParams);

			if (newBraindumpId) {
				params.set('braindump', newBraindumpId);
			} else {
				params.delete('braindump');
			}

			const newUrl = `${$page.url.pathname}?${params.toString()}`;
			replaceState(newUrl, {});
		}, 100);
	}

	// Fetch individual braindump
	async function fetchBraindump(id: string): Promise<any> {
		isFetchingBraindump = true;
		try {
			const response = await fetch(`/api/braindumps/${id}`);
			if (!response.ok) {
				if (response.status === 404) {
					return null;
				}
				throw new Error('Failed to fetch braindump');
			}

			const result = await response.json();
			// Handle standardized response format
			const data = result.success && result.data ? result.data : result;

			// Enrich the braindump with the same properties as server-side
			const braindump = data.braindump;
			const links = data.linkedData || {};

			// Basic enrichment (simplified version of server logic)
			const isUnlinked = !braindump.project_id;
			const linkedTypes = [];
			if (links.projects?.length > 0) linkedTypes.push('project');
			if (links.tasks?.length > 0) linkedTypes.push('task');
			if (links.notes?.length > 0) linkedTypes.push('note');

			return {
				...braindump,
				isNote: isUnlinked,
				isNewProject: false, // We can't easily determine this client-side
				linkedProject: links.projects?.[0] || null,
				linkedTypes,
				brain_dump_links: [] // Not used in modal display
			};
		} catch (error) {
			console.error('Error fetching braindump:', error);
			return null;
		} finally {
			isFetchingBraindump = false;
		}
	}

	// Handle braindump URL parameter on mount and page updates
	async function handleBraindumpUrlParam() {
		const currentBraindumpId = $page.url.searchParams.get('braindump');

		if (!currentBraindumpId) {
			showBraindumpModal = false;
			selectedBraindump = null;
			return;
		}

		// Check if we already have this braindump loaded
		if (urlBraindump && urlBraindump.id === currentBraindumpId) {
			selectedBraindump = urlBraindump;
			showBraindumpModal = true;

			// Show warning if braindump is not in current results
			if (!urlBraindumpInResults && (searchQuery || selectedDay)) {
				const searchParams = new URLSearchParams();
				searchParams.set('braindump', currentBraindumpId);
				const properUrl = `${$page.url.pathname}?${searchParams.toString()}`;

				toastService.warning(
					`This braindump is outside your current search filters. <a href="${properUrl}" class="underline">View without filters</a>`,
					{ duration: TOAST_DURATION.EXTENDED }
				);
			}
			return;
		}

		// Check if braindump is in current results
		const braindumpInResults = displayBraindumps.find((b) => b.id === currentBraindumpId);
		if (braindumpInResults) {
			selectedBraindump = braindumpInResults;
			showBraindumpModal = true;
			return;
		}

		// Need to fetch the braindump
		const fetchedBraindump = await fetchBraindump(currentBraindumpId);

		if (!fetchedBraindump) {
			// Braindump doesn't exist
			toastService.error("Braindump not found or you don't have permission to view it.");

			// Remove the invalid braindump parameter
			const params = new URLSearchParams($page.url.searchParams);
			params.delete('braindump');
			await goto(`?${params.toString()}`, { replaceState: true });
			return;
		}

		// Braindump exists but not in current results
		selectedBraindump = fetchedBraindump;
		showBraindumpModal = true;

		// Show warning about filters
		if (searchQuery || selectedDay) {
			const searchParams = new URLSearchParams();
			searchParams.set('braindump', currentBraindumpId);
			const properUrl = `${$page.url.pathname}?${searchParams.toString()}`;

			toastService.warning(
				`This braindump is outside your current search filters. <a href="${properUrl}" class="underline">View without filters</a>`,
				{ duration: TOAST_DURATION.EXTENDED }
			);
		}
	}

	// Navigation handlers
	async function navigateToYear(year: number) {
		selectedYear = year;
		isLoading = true;

		const params = new URLSearchParams($page.url.searchParams);
		params.set('year', year.toString());

		await goto(`?${params.toString()}`, { replaceState: true });
		isLoading = false;
	}

	async function handleSearch() {
		isLoading = true;

		const params = new URLSearchParams($page.url.searchParams);
		if (searchQuery.trim()) {
			params.set('search', searchQuery.trim());
		} else {
			params.delete('search');
		}

		// Reset day selection when searching
		params.delete('day');
		selectedDay = '';

		await goto(`?${params.toString()}`, { replaceState: true });
		isLoading = false;
	}

	async function clearSearch() {
		searchQuery = '';
		isLoading = true;

		const params = new URLSearchParams($page.url.searchParams);
		params.delete('search');
		params.delete('day');
		selectedDay = '';

		await goto(`?${params.toString()}`, { replaceState: true });
		isLoading = false;
	}

	async function selectDay(date: string) {
		selectedDay = date;
		isLoading = true;

		const params = new URLSearchParams($page.url.searchParams);
		// Clear search and braindump parameters when selecting a day
		params.delete('search');
		params.delete('braindump');
		params.set('day', date);

		// Clear search query state
		searchQuery = '';

		await goto(`?${params.toString()}`, { replaceState: true });
		isLoading = false;
	}

	async function clearDaySelection() {
		selectedDay = '';
		isLoading = true;

		const params = new URLSearchParams($page.url.searchParams);
		params.delete('day');

		await goto(`?${params.toString()}`, { replaceState: true });
		isLoading = false;
	}

	function handleBraindumpClick(braindump: any) {
		selectedBraindump = braindump;
		showBraindumpModal = true;
		updateUrl(braindump.id);
	}

	function handleCloseModal() {
		showBraindumpModal = false;
		// Keep braindump in URL as requested
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter' && searchQuery.trim()) {
			handleSearch();
		}
	}

	// Delete handlers
	function handleDeleteRequest(event: CustomEvent) {
		braindumpToDelete = event.detail.braindump;
		showDeleteDialog = true;
	}

	async function handleConfirmDelete() {
		if (!braindumpToDelete) return;

		isDeletingBraindump = true;
		try {
			const response = await fetch(`/api/braindumps/${braindumpToDelete.id}`, {
				method: 'DELETE',
				headers: {
					'Content-Type': 'application/json'
				}
			});

			if (!response.ok) {
				throw new Error('Failed to delete braindump');
			}

			const result = await response.json();

			// Remove braindump from the displayed list
			if (selectedDay) {
				dayBraindumps = dayBraindumps.filter((b) => b.id !== braindumpToDelete.id);
			} else {
				recentBraindumps = recentBraindumps.filter((b) => b.id !== braindumpToDelete.id);
			}

			// Close modal if deleting the currently viewed braindump
			if (selectedBraindump?.id === braindumpToDelete.id) {
				showBraindumpModal = false;
				selectedBraindump = null;
				// Clear URL parameter
				const params = new URLSearchParams($page.url.searchParams);
				params.delete('braindump');
				await goto(`?${params.toString()}`, { replaceState: true });
			}

			// Show success message with details
			const deleted = result.data?.deleted || result.deleted;
			let message = `Successfully deleted "${deleted?.title || 'braindump'}"`;
			if (deleted?.links_cleared > 0 || deleted?.questions_affected > 0) {
				const details = [];
				if (deleted.links_cleared > 0) {
					details.push(
						`${deleted.links_cleared} link${deleted.links_cleared !== 1 ? 's' : ''} cleared`
					);
				}
				if (deleted.questions_affected > 0) {
					details.push(
						`${deleted.questions_affected} question${deleted.questions_affected !== 1 ? 's' : ''} unlinked`
					);
				}
				message += ` (${details.join(', ')})`;
			}
			toastService.success(message);

			// Close delete dialog
			showDeleteDialog = false;
			braindumpToDelete = null;
		} catch (error) {
			console.error('Error deleting braindump:', error);
			toastService.error('Failed to delete braindump. Please try again.');
		} finally {
			isDeletingBraindump = false;
		}
	}

	function handleCancelDelete() {
		showDeleteDialog = false;
		braindumpToDelete = null;
	}

	// Utility functions
	function formatDate(dateStr: string): string {
		return format(new Date(dateStr), 'MMMM d, yyyy');
	}

	function getDayOfWeek(dateStr: string): string {
		return format(new Date(dateStr), 'EEEE');
	}

	// Handle page updates
	$: {
		// Update local state when data changes
		searchQuery = filters?.searchQuery || '';
		selectedYear = filters?.selectedYear || new Date().getFullYear();
		selectedDay = filters?.selectedDay || '';
		braindumpId = filters?.braindumpId || '';

		// Handle braindump URL parameter
		handleBraindumpUrlParam();
	}

	onMount(() => {
		// Handle initial braindump URL parameter
		handleBraindumpUrlParam();
	});
</script>

<svelte:head>
	<title>Braindump History - BuildOS | Track Your Thinking Evolution</title>
	<meta
		name="description"
		content="View your complete braindump history and idea evolution over time. Track your thinking patterns, search past insights, and visualize your productivity journey with BuildOS."
	/>
	<meta
		name="keywords"
		content="braindump history, thinking evolution, idea tracking, productivity insights, BuildOS history, thought patterns, brain dump timeline"
	/>
	<link rel="canonical" href="https://build-os.com/history" />

	<!-- Open Graph / Facebook -->
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://build-os.com/history" />
	<meta
		property="og:title"
		content="Braindump History - BuildOS | Track Your Thinking Evolution"
	/>
	<meta
		property="og:description"
		content="View your complete braindump history and idea evolution over time. Track your thinking patterns and visualize your productivity journey."
	/>
	<meta property="og:image" content="https://build-os.com/og-history.jpg" />

	<!-- Twitter -->
	<meta property="twitter:card" content="summary_large_image" />
	<meta property="twitter:url" content="https://build-os.com/history" />
	<meta
		property="twitter:title"
		content="Braindump History - BuildOS | Track Your Thinking Evolution"
	/>
	<meta
		property="twitter:description"
		content="View your complete braindump history and idea evolution over time with BuildOS."
	/>
	<meta property="twitter:image" content="https://build-os.com/og-history.jpg" />

	<!-- Additional Meta Tags -->
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<meta name="robots" content="index, follow" />
	<meta name="author" content="BuildOS" />

	<!-- JSON-LD Structured Data -->
	<script type="application/ld+json">
		{
			"@context": "https://schema.org",
			"@type": "WebPage",
			"name": "Braindump History",
			"description": "Track your thinking evolution and braindump history with BuildOS",
			"url": "https://build-os.com/history",
			"isPartOf": {
				"@type": "WebSite",
				"name": "BuildOS",
				"url": "https://build-os.com"
			},
			"mainEntity": {
				"@type": "SoftwareApplication",
				"name": "BuildOS",
				"applicationCategory": "Productivity Software",
				"description": "AI-native productivity platform for context building and braindump tracking"
			}
		}
	</script>
</svelte:head>

<!-- Main container -->
<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
	<div class="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 md:py-8">
		<!-- Page header -->
		<div class="mb-8">
			<div class="flex items-center justify-between mb-6">
				<div>
					<h1
						class="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white flex items-center mb-1 sm:mb-2 tracking-tight"
					>
						<Brain class="w-8 h-8 mr-3 text-purple-600 dark:text-purple-400" />
						Braindump History
					</h1>
					<p class="text-sm sm:text-base text-gray-600 dark:text-gray-400">
						Your thinking history and idea evolution over time
					</p>
				</div>

				<!-- Quick stats -->
				<div class="text-right">
					<div class="text-2xl font-bold text-purple-600 dark:text-purple-400">
						{stats.totalBraindumps || 0}
					</div>
					<div class="text-sm text-gray-600 dark:text-gray-400">Total braindumps</div>
				</div>
			</div>

			<!-- Enhanced Global Search with SearchCombobox -->
			<div class="mb-6">
				<div class="lg:col-span-1">
					<SearchCombobox {userId} />
				</div>
			</div>

			<!-- History Filter (optional, for filtering the timeline view) -->
			<details class="mb-6">
				<summary
					class="cursor-pointer text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
				>
					Advanced: Filter history timeline
				</summary>
				<div class="mt-4 flex flex-col sm:flex-row gap-4">
					<!-- Filter search input -->
					<div class="flex-1 relative">
						<div
							class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"
						>
							<Search class="h-4 w-4 text-gray-400" />
						</div>
						<TextInput
							type="text"
							bind:value={searchQuery}
							onkeydown={handleKeyDown}
							placeholder="Filter timeline by keyword..."
							class="pl-10 pr-12"
							size="md"
						/>
						{#if searchQuery}
							<Button
								onclick={clearSearch}
								variant="ghost"
								size="sm"
								class="absolute inset-y-0 right-0 pr-3 flex items-center min-h-0"
								icon={X}
							></Button>
						{/if}
					</div>

					<!-- Filter button -->
					<Button
						onclick={handleSearch}
						disabled={!searchQuery.trim() || isLoading}
						variant="secondary"
						size="md"
						loading={isLoading}
						icon={Search}
					>
						Filter Timeline
					</Button>
				</div>
			</details>

			<!-- Active filters display -->
			{#if searchQuery || selectedDay}
				<div class="flex items-center gap-2 mb-4">
					<span class="text-sm text-gray-600 dark:text-gray-400">Active filters:</span>

					{#if searchQuery}
						<div
							class="flex items-center gap-1 px-3 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 rounded-full text-sm"
						>
							<Search class="w-3 h-3" />
							<span>"{searchQuery}"</span>
							<Button
								onclick={clearSearch}
								variant="ghost"
								size="sm"
								class="ml-1 p-0 min-h-0"
								icon={X}
							></Button>
						</div>
					{/if}

					{#if selectedDay}
						<div
							class="flex items-center gap-1 px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded-full text-sm"
						>
							<Calendar class="w-3 h-3" />
							<span>{formatDate(selectedDay)}</span>
							<Button
								onclick={clearDaySelection}
								variant="ghost"
								size="sm"
								class="ml-1 p-0 min-h-0"
								icon={X}
							></Button>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Year navigation -->
		<div class="mb-6">
			<div
				class="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4"
			>
				<div class="flex items-center space-x-4">
					<h2 class="text-lg font-semibold text-gray-900 dark:text-white">
						{selectedYear} Activity
					</h2>
					{#if stats.daysWithActivity}
						<span class="text-sm text-gray-600 dark:text-gray-400">
							{stats.daysWithActivity} days active • {stats.totalBraindumps} braindumps
						</span>
					{/if}
				</div>

				<!-- Year navigation controls -->
				<div class="flex items-center space-x-2">
					{#if availableYears.length > 1}
						<Button
							onclick={() => navigateToYear(selectedYear - 1)}
							disabled={selectedYear <= Math.min(...availableYears) || isLoading}
							variant="ghost"
							size="sm"
							class="p-2"
							icon={ChevronLeft}
						></Button>

						<Select
							bind:value={selectedYear}
							onchange={(e) => {
								selectedYear = e.detail;
								navigateToYear(parseInt(e.detail));
							}}
							disabled={isLoading}
							size="sm"
						>
							{#each availableYears as year}
								<option value={year}>{year}</option>
							{/each}
						</Select>

						<Button
							onclick={() => navigateToYear(selectedYear + 1)}
							disabled={selectedYear >= Math.max(...availableYears) || isLoading}
							variant="ghost"
							size="sm"
							class="p-2"
							icon={ChevronRight}
						></Button>
					{/if}
				</div>
			</div>
		</div>

		<!-- Contribution chart -->
		<div class="mb-8">
			<ContributionChart
				contributions={contributionData.contributions || []}
				{searchMatchDates}
				{selectedDay}
				onDayClick={selectDay}
				{isLoading}
			/>
		</div>

		<!-- Braindumps display -->
		<div>
			<!-- Section header -->
			<div class="flex items-center justify-between mb-6">
				<h3 class="text-xl font-semibold text-gray-900 dark:text-white">
					{#if selectedDay}
						Braindumps from {formatDate(selectedDay)}
						<span class="text-sm font-normal text-gray-600 dark:text-gray-400 ml-2">
							({getDayOfWeek(selectedDay)})
						</span>
					{:else if searchQuery}
						Search Results
					{:else}
						Recent Braindumps
					{/if}
				</h3>

				{#if displayBraindumps.length > 0}
					<span class="text-sm text-gray-600 dark:text-gray-400">
						{displayBraindumps.length} braindump{displayBraindumps.length !== 1
							? 's'
							: ''}
					</span>
				{/if}
			</div>

			<!-- Loading state -->
			{#if isLoading}
				<div class="flex items-center justify-center py-12">
					<LoaderCircle
						class="w-8 h-8 animate-spin text-purple-600 dark:text-purple-400"
					/>
				</div>

				<!-- Braindumps grid -->
			{:else if displayBraindumps.length > 0}
				<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
					{#each displayBraindumps as braindump (braindump.id)}
						<BraindumpHistoryCard
							{braindump}
							onClick={() => handleBraindumpClick(braindump)}
							highlightSearch={searchQuery}
							on:delete={handleDeleteRequest}
						/>
					{/each}
				</div>

				<!-- Empty states -->
			{:else}
				<!-- No search results -->
				{#if searchQuery}
					<div class="text-center py-12">
						<Search class="w-12 h-12 text-gray-400 mx-auto mb-4" />
						<h4 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
							No braindumps found
						</h4>
						<p class="text-gray-500 dark:text-gray-400 mb-6">
							No braindumps match your search for "{searchQuery}"
						</p>
						<Button onclick={clearSearch} variant="outline" size="md">
							Clear search
						</Button>
					</div>

					<!-- No braindumps for selected day -->
				{:else if selectedDay}
					<div class="text-center py-12">
						<Calendar class="w-12 h-12 text-gray-400 mx-auto mb-4" />
						<h4 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
							No braindumps on this day
						</h4>
						<p class="text-gray-500 dark:text-gray-400 mb-6">
							No braindumps were recorded on {formatDate(selectedDay)}
						</p>
						<Button onclick={clearDaySelection} variant="outline" size="md">
							View recent braindumps
						</Button>
					</div>

					<!-- No braindumps at all -->
				{:else}
					<div class="text-center py-12">
						<Brain class="w-16 h-16 text-gray-400 mx-auto mb-4" />
						<h4 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
							No braindumps yet
						</h4>
						<p class="text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
							Start capturing your thoughts and ideas. Your braindumps will appear
							here and create a visual history of your thinking over time.
						</p>
						<Button variant="primary" size="md" icon={Plus}>
							Create your first braindump
						</Button>
					</div>
				{/if}
			{/if}
		</div>
	</div>
</div>

<!-- Braindump detail modal -->
{#if showBraindumpModal && selectedBraindump}
	<BraindumpModal
		braindump={selectedBraindump}
		isOpen={showBraindumpModal}
		onClose={handleCloseModal}
		on:delete={handleDeleteRequest}
	/>
{/if}

<!-- Delete confirmation modal -->
<BraindumpHistoryDeleteModal
	isOpen={showDeleteDialog}
	braindump={braindumpToDelete}
	isDeleting={isDeletingBraindump}
	on:confirm={handleConfirmDelete}
	on:cancel={handleCancelDelete}
/>

<!-- Loading overlay for fetching individual braindumps -->
{#if isFetchingBraindump}
	<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
		<div class="bg-white dark:bg-gray-800 rounded-lg p-6 flex items-center space-x-3">
			<LoaderCircle class="w-5 h-5 animate-spin text-purple-600 dark:text-purple-400" />
			<span class="text-gray-900 dark:text-white">Loading braindump...</span>
		</div>
	</div>
{/if}
