<!-- apps/web/src/lib/components/briefs/DailyBriefsTab.svelte -->
<script lang="ts">
	import { onMount, onDestroy, getContext } from 'svelte';
	import { browser } from '$app/environment';
	import {
		Calendar,
		Clock,
		ArrowRight,
		RefreshCw,
		Sparkles,
		ChevronLeft,
		ChevronRight,
		Filter,
		Download,
		Eye,
		Trash2,
		Copy,
		X,
		AlertCircle,
		Loader2,
		TrendingUp,
		FileText,
		Plus,
		Settings
	} from 'lucide-svelte';
	import {
		BriefClientService,
		streamingStatus,
		streamingBriefData,
		briefGenerationCompleted
	} from '$lib/services/briefClient.service';
	import { unifiedBriefGenerationStore } from '$lib/stores/unifiedBriefGeneration.store';
	import type { DailyBrief, StreamingBriefData, StreamingStatus } from '$lib/types/daily-brief';
	import { renderMarkdown } from '$lib/utils/markdown';
	import BriefAnalyticsDashboard from '$lib/components/analytics/BriefAnalyticsDashboard.svelte';
	import ProjectBriefGrid from '$lib/components/briefs/ProjectBriefGrid.svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import { RailwayWorkerService } from '$lib/services/railwayWorker.service';
	import { RealtimeBriefService } from '$lib/services/realtimeBrief.service';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import BriefsSettingsModal from '$lib/components/briefs/BriefsSettingsModal.svelte';
	import { PUBLIC_RAILWAY_WORKER_URL } from '$env/static/public';

	export let user: { id: string; email: string; is_admin: boolean } | null = null;

	// Get supabase client from context
	let supabaseClient: any = null;
	try {
		supabaseClient = getContext('supabase');
	} catch (e) {
		console.warn('Supabase context not available');
	}

	// Initialize with minimal data
	let currentDate = '';
	let selectedView: 'single' | 'list' | 'analytics' = 'single';
	let userTimezone = '';

	// Brief data
	let dailyBrief: DailyBrief | null = null;
	let projectBriefs: any[] = [];
	let briefHistory: DailyBrief[] = [];
	let isToday = false;

	// Component state
	let isLoading = false;
	let error: string | null = null;
	let isRefreshing = false;

	// Search and filter state
	let searchQuery = '';
	let selectedDateRange: 'today' | 'week' | 'month' | 'custom' = 'today';
	let customStartDate = '';
	let customEndDate = '';
	let showFilters = false;
	let filteredBriefs: DailyBrief[] = [];

	// Modal state
	let showDeleteConfirmation = false;
	let briefToDelete: DailyBrief | null = null;
	let showSettingsModal = false;

	// Reactive streaming data
	let currentStreamingStatus: StreamingStatus;
	let currentStreamingData: StreamingBriefData;
	let unifiedGenerationState: any;
	let checkingExistingGeneration = false;
	let railwayWorkerAvailable = false;

	// Subscribe to stores
	const unsubscribeStatus = streamingStatus.subscribe((value) => {
		currentStreamingStatus = value;
	});

	const unsubscribeData = streamingBriefData.subscribe((value) => {
		currentStreamingData = value;
	});

	const unsubscribeUnified = unifiedBriefGenerationStore.subscribe((value) => {
		unifiedGenerationState = value;
		// Update local checkingExistingGeneration from unified state
		if (value.isCheckingExisting !== undefined) {
			checkingExistingGeneration = value.isCheckingExisting;
		}
	});

	const unsubscribeCompletion = briefGenerationCompleted.subscribe((value) => {
		if (value) {
			refreshPageData();
		}
	});

	// Function to get user's timezone
	function getUserTimezone(): string {
		return Intl.DateTimeFormat().resolvedOptions().timeZone;
	}

	// Function to get today's date in user's timezone
	function getTodayInTimezone(timezone: string): string {
		const formatter = new Intl.DateTimeFormat('en-CA', {
			timeZone: timezone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		});
		return formatter.format(new Date());
	}

	// Function to fetch brief data with proper timezone
	async function fetchBriefData(date?: string, view?: string) {
		if (!browser) return;

		isLoading = true;
		error = null;

		try {
			const params = new URLSearchParams();

			// Use provided values or current state
			const fetchDate = date !== undefined ? date : currentDate;
			const fetchView = view !== undefined ? view : selectedView;

			if (fetchDate) {
				params.set('date', fetchDate);
			}
			params.set('view', fetchView);
			params.set('timezone', userTimezone);

			const response = await fetch(`/briefs?${params.toString()}`);

			if (!response.ok) {
				throw new Error('Failed to fetch brief data');
			}

			const result = await response.json();

			if (result.success) {
				// Update all the data
				currentDate = result.data.currentDate;
				selectedView = result.data.selectedView;
				dailyBrief = result.data.dailyBrief;
				projectBriefs = result.data.projectBriefs || [];
				briefHistory = result.data.briefHistory || [];
				isToday = result.data.isToday;
			} else {
				throw new Error(result.error || 'Failed to fetch brief data');
			}
		} catch (err) {
			console.error('Error fetching brief data:', err);
			error = err instanceof Error ? err.message : 'Failed to fetch briefs';
		} finally {
			isLoading = false;
		}
	}

	// Generate daily brief
	async function generateDailyBrief(forceRegenerate = false) {
		if (!browser || !user || currentStreamingStatus?.isGenerating || checkingExistingGeneration)
			return;

		error = null;

		try {
			// Pass timezone and supabase client along with other options
			await BriefClientService.startStreamingGeneration({
				briefDate: currentDate,
				forceRegenerate,
				user,
				timezone: userTimezone,
				supabaseClient
			});
		} catch (err) {
			console.error('Error starting generation:', err);
			const errorMessage =
				err instanceof Error ? err.message : 'Failed to start brief generation';
			toastService.error(errorMessage);
		}
	}

	function cancelGeneration() {
		BriefClientService.cancelGeneration();
		error = null;
	}

	async function refreshPageData() {
		try {
			await fetchBriefData();
		} catch (err) {
			console.error('Error refreshing page data:', err);
			toastService.error('Failed to refresh page data');
		}
	}

	function filterBriefs() {
		let filtered = [...briefHistory];

		// Filter by search query
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase();
			filtered = filtered.filter(
				(brief) =>
					brief.summary_content.toLowerCase().includes(query) ||
					brief.insights?.toLowerCase().includes(query) ||
					brief.priority_actions?.some((action) => action.toLowerCase().includes(query))
			);
		}

		// Filter by date range
		if (selectedDateRange !== 'today') {
			const now = new Date();
			let startDate: Date;

			switch (selectedDateRange) {
				case 'week':
					startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
					break;
				case 'month':
					startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
					break;
				case 'custom':
					if (customStartDate && customEndDate) {
						filtered = filtered.filter(
							(brief) =>
								brief.brief_date >= customStartDate &&
								brief.brief_date <= customEndDate
						);
					}
					filteredBriefs = filtered;
					return;
				default:
					filteredBriefs = filtered;
					return;
			}

			const startDateString = startDate.toISOString().split('T')[0];
			filtered = filtered.filter((brief) => brief.brief_date >= startDateString);
		}

		filteredBriefs = filtered;
	}

	function navigateDate(direction: 'prev' | 'next') {
		const date = new Date(currentDate);
		if (direction === 'prev') {
			date.setDate(date.getDate() - 1);
		} else {
			date.setDate(date.getDate() + 1);
		}
		const newDate = date.toISOString().split('T')[0];

		currentDate = newDate;
		fetchBriefData(newDate);
	}

	function goToToday() {
		const todayDate = getTodayInTimezone(userTimezone);
		currentDate = todayDate;
		fetchBriefData(todayDate);
	}

	function changeView(newView: 'single' | 'list' | 'analytics') {
		selectedView = newView;
		fetchBriefData(currentDate, newView);
	}

	function selectBriefDate(briefDate: string) {
		currentDate = briefDate;
		selectedView = 'single';
		fetchBriefData(briefDate, 'single');
	}

	async function exportBrief(brief: DailyBrief) {
		try {
			await BriefClientService.exportBrief(brief);
			toastService.success('Brief exported successfully');
		} catch (err) {
			console.error('Error exporting brief:', err);
			toastService.error('Failed to export brief');
		}
	}

	async function copyBrief(brief: DailyBrief) {
		try {
			await BriefClientService.copyBrief(brief);
			toastService.success('Brief copied to clipboard');
		} catch (err) {
			console.error('Error copying brief:', err);
			toastService.error('Failed to copy brief');
		}
	}

	function showDeleteBriefConfirmation(brief: DailyBrief) {
		briefToDelete = brief;
		showDeleteConfirmation = true;
	}

	async function confirmDeleteBrief() {
		if (!briefToDelete) return;

		try {
			await BriefClientService.deleteBrief(briefToDelete.id);
			await refreshPageData();
			toastService.success('Brief deleted successfully');
		} catch (err) {
			console.error('Error deleting brief:', err);
			toastService.error('Failed to delete brief');
		} finally {
			showDeleteConfirmation = false;
			briefToDelete = null;
		}
	}

	function cancelDeleteBrief() {
		showDeleteConfirmation = false;
		briefToDelete = null;
	}

	// Format date time
	function formatDateTime(dateString: string, format: 'time' | 'full' = 'time'): string {
		const date = new Date(dateString);
		const options: Intl.DateTimeFormatOptions =
			format === 'time'
				? { hour: '2-digit', minute: '2-digit' }
				: {
						weekday: 'short',
						month: 'short',
						day: 'numeric',
						hour: '2-digit',
						minute: '2-digit'
					};
		return date.toLocaleString('en-US', options);
	}

	// Calculate overall progress percentage - use smoothed progress from unified store
	$: overallProgress =
		unifiedGenerationState?.progress?.smoothedPercentage ||
		(currentStreamingStatus
			? Math.round(
					(currentStreamingStatus.progress.projects.completed /
						Math.max(1, currentStreamingStatus.progress.projects.total)) *
						100
				)
			: 0);

	// View configurations
	const viewConfigs = [
		{ id: 'single', label: 'Today', icon: FileText },
		{ id: 'list', label: 'History', icon: Calendar },
		{ id: 'analytics', label: 'Analytics', icon: TrendingUp }
	];

	// Show generated brief from streaming data ONLY while actively generating
	$: displayDailyBrief =
		isToday && currentStreamingData?.mainBrief && currentStreamingStatus?.isGenerating
			? {
					...dailyBrief,
					id: currentStreamingData.mainBrief.id,
					summary_content: currentStreamingData.mainBrief.content,
					priority_actions: currentStreamingData.mainBrief.priority_actions,
					generation_completed_at: new Date().toISOString()
				}
			: dailyBrief;

	// Show project briefs from streaming data ONLY while actively generating
	$: displayProjectBriefs =
		isToday &&
		currentStreamingData?.projectBriefs?.length > 0 &&
		currentStreamingStatus?.isGenerating
			? currentStreamingData.projectBriefs
			: projectBriefs;

	// Watch for search query and date range changes
	$: if (selectedView === 'list') {
		filterBriefs();
	}

	onMount(async () => {
		if (browser) {
			userTimezone = getUserTimezone();
			currentDate = getTodayInTimezone(userTimezone);
			await fetchBriefData();

			// Check Railway worker availability
			try {
				const response = await fetch(`${PUBLIC_RAILWAY_WORKER_URL}/health`, {
					method: 'GET'
				});
				railwayWorkerAvailable = response.ok;
			} catch (err) {
				railwayWorkerAvailable = false;
			}

			// Check for existing generation
			if (isToday) {
				// Use unified store for checking state
				unifiedBriefGenerationStore.startChecking();
				try {
					if (railwayWorkerAvailable && user) {
						const { isGenerating, job } = await RailwayWorkerService.isBriefGenerating(
							user.id,
							currentDate
						);
						if (isGenerating) {
							error = `Brief generation is in progress${job ? ` (${job.status})` : ''}. The brief will appear when complete.`;
						}
					} else if (user) {
						const isCurrentlyGenerating = await BriefClientService.isGenerating(
							currentDate,
							user
						);
						if (isCurrentlyGenerating) {
							error =
								'Brief generation is currently in progress. The brief will appear when complete.';
						}
					}
				} catch (err) {
					console.error('Error checking existing generation:', err);
				} finally {
					// Reset checking state through unified store
					unifiedBriefGenerationStore.update(
						{
							isCheckingExisting: false
						},
						'manual',
						0
					);
				}
			}
		}
	});

	onDestroy(() => {
		unsubscribeStatus();
		unsubscribeData();
		unsubscribeCompletion();
		unsubscribeUnified();
		BriefClientService.cancelGeneration();
		// Clean up realtime service when leaving the component
		RealtimeBriefService.cleanup();
	});
</script>

<div class="space-y-4">
	<!-- View Navigation Bar -->
	<div
		class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4"
	>
		<div class="flex items-center justify-between">
			<!-- View Tabs -->
			<div class="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
				{#each viewConfigs as view}
					<Button
						type="button"
						on:click={() => changeView(view.id)}
						variant={selectedView === view.id ? 'primary' : 'ghost'}
						size="sm"
						class={selectedView === view.id
							? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm'
							: 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}
						icon={view.icon}
					>
						{view.label}
					</Button>
				{/each}
			</div>

			{#if selectedView === 'single'}
				<!-- Date Navigation -->
				<div class="flex items-center gap-3">
					{#if !isToday}
						<Button
							type="button"
							on:click={goToToday}
							variant="outline"
							size="sm"
							class="text-blue-600 dark:text-blue-400"
						>
							Go to Today
						</Button>
					{/if}
					<div class="flex items-center">
						<Button
							type="button"
							on:click={() => navigateDate('prev')}
							variant="ghost"
							size="sm"
							class="p-2"
							aria-label="Previous day"
							icon={ChevronLeft}
						></Button>
						<span class="mx-3 text-sm font-medium text-gray-900 dark:text-white">
							{BriefClientService.formatDisplayDate(currentDate)}
						</span>
						<Button
							type="button"
							on:click={() => navigateDate('next')}
							variant="ghost"
							size="sm"
							class="p-2"
							disabled={isToday}
							aria-label="Next day"
							icon={ChevronRight}
						></Button>
					</div>
				</div>
			{:else if selectedView === 'list'}
				<!-- Filter button for list view -->
				<Button
					type="button"
					on:click={() => (showFilters = !showFilters)}
					variant="ghost"
					size="sm"
					class="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
					title="Toggle filters"
					icon={Filter}
				></Button>
			{/if}

			<!-- Settings Button -->
			<Button
				type="button"
				on:click={() => (showSettingsModal = true)}
				variant="ghost"
				size="sm"
				class="flex items-center gap-2 px-3 py-2"
				icon={Settings}
			>
				Settings
			</Button>
		</div>
	</div>

	<!-- Filters for list view -->
	{#if selectedView === 'list' && showFilters}
		<div
			class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4"
		>
			<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
				<FormField label="Search">
					<TextInput
						bind:value={searchQuery}
						placeholder="Search briefs..."
						on:input={() => filterBriefs()}
					/>
				</FormField>

				<FormField label="Date Range">
					<Select
						bind:value={selectedDateRange}
						on:change={() => filterBriefs()}
						options={[
							{ value: 'today', label: 'Today' },
							{ value: 'week', label: 'Last 7 days' },
							{ value: 'month', label: 'Last 30 days' },
							{ value: 'custom', label: 'Custom range' }
						]}
					/>
				</FormField>

				{#if selectedDateRange === 'custom'}
					<FormField label="Start Date">
						<TextInput
							type="date"
							bind:value={customStartDate}
							on:change={() => filterBriefs()}
						/>
					</FormField>
					<FormField label="End Date">
						<TextInput
							type="date"
							bind:value={customEndDate}
							on:change={() => filterBriefs()}
						/>
					</FormField>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Streaming Progress -->
	{#if currentStreamingStatus?.isGenerating || unifiedGenerationState?.isCheckingExisting}
		<div
			class="bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-800 rounded-lg p-4 shadow-sm"
		>
			<div class="flex items-center justify-between mb-3">
				<div class="flex items-center flex-1">
					<Loader2 class="w-5 h-5 text-blue-600 animate-spin mr-3 flex-shrink-0" />
					<div class="min-w-0">
						<h3 class="text-base font-semibold text-gray-900 dark:text-white truncate">
							{unifiedGenerationState?.isCheckingExisting
								? 'Checking...'
								: 'Generating Brief'}
						</h3>
						<p class="text-sm text-blue-600 dark:text-blue-400 truncate">
							{unifiedGenerationState?.message || currentStreamingStatus.message}
						</p>
					</div>
				</div>
				<Button
					type="button"
					on:click={cancelGeneration}
					variant="ghost"
					size="sm"
					class="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 ml-2"
					title="Cancel"
					icon={X}
				></Button>
			</div>

			{#if currentStreamingStatus.progress.projects.total > 0}
				<div class="space-y-2">
					<div class="flex justify-between text-xs text-gray-600 dark:text-gray-400">
						<span
							>Progress: {currentStreamingStatus.progress.projects
								.completed}/{currentStreamingStatus.progress.projects.total}</span
						>
						<span>{overallProgress}%</span>
					</div>
					<div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
						<div
							class="bg-blue-600 h-2 rounded-full transition-all duration-500"
							style="width: {overallProgress}%"
						></div>
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Error Display -->
	{#if error || currentStreamingStatus?.error}
		<div
			class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3"
		>
			<div class="flex items-start">
				<AlertCircle
					class="w-4 h-4 mr-2 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5"
				/>
				<p class="text-sm text-red-800 dark:text-red-200 flex-1">
					{error || currentStreamingStatus?.error}
				</p>
				<Button
					type="button"
					on:click={() => (error = null)}
					variant="ghost"
					size="sm"
					class="ml-2 p-0 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-200"
					icon={X}
				></Button>
			</div>
		</div>
	{/if}

	<!-- Main Content -->
	{#if isLoading}
		<div class="flex justify-center items-center py-12">
			<Loader2 class="w-8 h-8 text-blue-600 animate-spin" />
		</div>
	{:else if selectedView === 'analytics'}
		<BriefAnalyticsDashboard />
	{:else if selectedView === 'list'}
		<!-- List View -->
		{#if filteredBriefs.length > 0}
			<div class="grid gap-4">
				{#each filteredBriefs as brief}
					<div
						class="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow cursor-pointer"
						on:click={() => selectBriefDate(brief.brief_date)}
						on:keydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								selectBriefDate(brief.brief_date);
							}
						}}
						role="button"
						tabindex="0"
					>
						<div class="flex items-start justify-between mb-2">
							<div>
								<h3 class="font-semibold text-gray-900 dark:text-white">
									{BriefClientService.formatDisplayDate(brief.brief_date)}
								</h3>
								<div
									class="flex items-center text-xs text-gray-500 dark:text-gray-400 mt-1"
								>
									<Clock class="w-3 h-3 mr-1" />
									{formatDateTime(
										brief.generation_completed_at || brief.created_at
									)}
								</div>
							</div>
							<div class="flex items-center space-x-1">
								<Button
									type="button"
									on:click={(e) => {
										e.stopPropagation();
										selectBriefDate(brief.brief_date);
									}}
									variant="ghost"
									size="sm"
									class="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
									title="View"
									icon={Eye}
								></Button>
								<Button
									type="button"
									on:click={(e) => {
										e.stopPropagation();
										exportBrief(brief);
									}}
									variant="ghost"
									size="sm"
									class="p-1.5 text-gray-400 hover:text-purple-600 dark:hover:text-purple-400"
									title="Export"
									icon={Download}
								></Button>
								<Button
									type="button"
									on:click={(e) => {
										e.stopPropagation();
										showDeleteBriefConfirmation(brief);
									}}
									variant="ghost"
									size="sm"
									class="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400"
									title="Delete"
									icon={Trash2}
								></Button>
							</div>
						</div>

						<div class="text-sm text-gray-700 dark:text-gray-300 line-clamp-2 mb-3">
							{brief.summary_content.substring(0, 200)}
							{brief.summary_content.length > 200 ? '...' : ''}
						</div>

						{#if brief.priority_actions && brief.priority_actions.length > 0}
							<div class="flex flex-wrap gap-1">
								{#each brief.priority_actions.slice(0, 3) as action}
									<span
										class="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-800 rounded dark:bg-blue-900 dark:text-blue-300"
									>
										{action.length > 30
											? action.substring(0, 30) + '...'
											: action}
									</span>
								{/each}
								{#if brief.priority_actions.length > 3}
									<span
										class="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded dark:bg-gray-700 dark:text-gray-400"
									>
										+{brief.priority_actions.length - 3}
									</span>
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{:else}
			<div class="text-center py-12">
				<div
					class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md mx-auto border border-gray-200 dark:border-gray-700"
				>
					<Calendar class="h-12 w-12 text-gray-400 mx-auto mb-3" />
					<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
						No Briefs Found
					</h3>
					<p class="text-sm text-gray-600 dark:text-gray-400">
						{searchQuery
							? 'Try adjusting your search or filters.'
							: 'Generate some daily briefs to see them here.'}
					</p>
				</div>
			</div>
		{/if}
	{:else}
		<!-- Single Day View -->
		{#if !displayDailyBrief && !currentStreamingStatus?.isGenerating && !isRefreshing}
			<!-- Empty State -->
			<div class="text-center py-12">
				<div
					class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-lg mx-auto border border-gray-200 dark:border-gray-700"
				>
					<div
						class="bg-blue-100 dark:bg-blue-900/20 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4"
					>
						<Sparkles class="h-8 w-8 text-blue-600 dark:text-blue-400" />
					</div>
					<h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-3">
						No Brief Available
					</h3>
					<p class="text-sm text-gray-600 dark:text-gray-400 mb-6">
						{isToday
							? "Generate your daily brief to get started with today's priorities and insights."
							: 'No brief was generated for this date.'}
					</p>

					{#if isToday}
						<Button
							type="button"
							on:click={() => generateDailyBrief()}
							disabled={currentStreamingStatus?.isGenerating ||
								checkingExistingGeneration ||
								!user}
							loading={checkingExistingGeneration ||
								currentStreamingStatus?.isGenerating}
							variant="primary"
							size="md"
							class="shadow-sm"
							icon={Plus}
						>
							{#if checkingExistingGeneration}
								Checking...
							{:else if currentStreamingStatus?.isGenerating}
								Generating...
							{:else}
								Generate Brief
							{/if}
						</Button>
					{/if}
				</div>
			</div>
		{:else if displayDailyBrief}
			<!-- Main Brief Card -->
			<div
				class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-6 border border-gray-200 dark:border-gray-700"
			>
				<div class="flex items-center justify-between mb-4">
					<h2 class="text-xl font-bold text-gray-900 dark:text-white">Daily Brief</h2>
					<div class="flex items-center space-x-2">
						<div class="flex items-center text-xs text-gray-500 dark:text-gray-400">
							<Clock class="w-3 h-3 mr-1" />
							{displayDailyBrief.generation_completed_at
								? formatDateTime(displayDailyBrief.generation_completed_at, 'time')
								: 'Just now'}
						</div>
						<div class="flex items-center space-x-1">
							<Button
								type="button"
								on:click={() => exportBrief(displayDailyBrief)}
								variant="ghost"
								size="sm"
								class="p-1.5 text-gray-400 hover:text-purple-600 dark:hover:text-purple-400"
								title="Export"
								icon={Download}
							></Button>
							<Button
								type="button"
								on:click={() => copyBrief(displayDailyBrief)}
								variant="ghost"
								size="sm"
								class="p-1.5 text-gray-400 hover:text-green-600 dark:hover:text-green-400"
								title="Copy"
								icon={Copy}
							></Button>
							<Button
								type="button"
								on:click={() => generateDailyBrief(true)}
								disabled={currentStreamingStatus?.isGenerating}
								variant="ghost"
								size="sm"
								class="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
								title="Regenerate"
								icon={currentStreamingStatus?.isGenerating ? Loader2 : RefreshCw}
							></Button>
						</div>
					</div>
				</div>

				<div
					class="prose prose-gray dark:prose-invert max-w-none
					prose-headings:text-gray-900 prose-p:text-gray-700 prose-li:text-gray-700
					prose-strong:text-gray-900 prose-a:text-blue-600
					dark:prose-headings:text-white dark:prose-p:text-gray-300 dark:prose-li:text-gray-300
					dark:prose-strong:text-white dark:prose-a:text-blue-400"
				>
					{@html renderMarkdown(displayDailyBrief.summary_content)}
				</div>

				{#if displayDailyBrief.priority_actions?.length}
					<div
						class="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800"
					>
						<h3
							class="font-medium text-blue-900 dark:text-blue-200 mb-3 flex items-center"
						>
							<ArrowRight class="w-4 h-4 mr-2" />
							Priority Actions
						</h3>
						<ul class="space-y-2">
							{#each displayDailyBrief.priority_actions as action}
								<li
									class="flex items-start text-sm text-blue-800 dark:text-blue-300"
								>
									<ArrowRight class="w-3 h-3 mr-2 mt-0.5 flex-shrink-0" />
									<span class="flex-1">{action}</span>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			</div>

			<!-- Project Briefs -->
			{#if displayProjectBriefs && displayProjectBriefs.length > 0}
				<ProjectBriefGrid
					briefs={displayProjectBriefs}
					title="Project Briefs"
					showTitle={true}
				/>
			{/if}
		{:else if isRefreshing}
			<!-- Show loading state while refreshing -->
			<div class="flex justify-center items-center py-12">
				<Loader2 class="w-8 h-8 text-blue-600 animate-spin" />
			</div>
		{/if}
	{/if}
</div>

<!-- Delete Confirmation Modal -->
<ConfirmationModal
	isOpen={showDeleteConfirmation}
	title="Delete Brief"
	confirmText="Delete"
	cancelText="Cancel"
	confirmVariant="danger"
	icon="danger"
	on:confirm={confirmDeleteBrief}
	on:cancel={cancelDeleteBrief}
>
	<div slot="content">
		<p class="text-sm text-gray-500 dark:text-gray-400">
			Are you sure you want to delete this brief? This action cannot be undone.
		</p>
	</div>
	<div slot="details" class="mt-2">
		<p class="text-xs text-gray-400 dark:text-gray-500">
			Brief: {briefToDelete?.brief_date}
		</p>
	</div>
</ConfirmationModal>

<!-- Briefs Settings Modal -->
<BriefsSettingsModal
	isOpen={showSettingsModal}
	{user}
	onClose={() => (showSettingsModal = false)}
	on:save={() => {
		toastService.success('Brief settings updated successfully');
		showSettingsModal = false;
	}}
	on:reset={() => {
		toastService.success('Brief settings reset to defaults');
		showSettingsModal = false;
	}}
/>

<style>
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
