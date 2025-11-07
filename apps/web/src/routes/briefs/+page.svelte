<!-- apps/web/src/routes/briefs/+page.svelte -->
<script lang="ts">
	import { onMount, onDestroy, getContext } from 'svelte';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { replaceState } from '$app/navigation';
	import { PUBLIC_RAILWAY_WORKER_URL } from '$env/static/public';
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
		Menu
	} from 'lucide-svelte';
	import {
		BriefClientService,
		streamingStatus,
		streamingBriefData,
		briefGenerationCompleted
	} from '$lib/services/briefClient.service';
	import type { DailyBrief, StreamingBriefData, StreamingStatus } from '$lib/types/daily-brief';
	import { renderMarkdown } from '$lib/utils/markdown';
	import BriefAnalyticsDashboard from '$lib/components/analytics/BriefAnalyticsDashboard.svelte';
	import ProjectBriefGrid from '$lib/components/briefs/ProjectBriefGrid.svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import SEOHead from '$lib/components/SEOHead.svelte';
	import type { PageData } from './$types';
	import { RailwayWorkerService } from '$lib/services/railwayWorker.service';
	import { RealtimeBriefService } from '$lib/services/realtimeBrief.service';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import BriefsSettingsModal from '$lib/components/briefs/BriefsSettingsModal.svelte';
	import { Settings } from 'lucide-svelte';

	let { data } = $props<{ data: PageData }>();

	// Get supabase client from context (set by layout)
	// Note: getContext must be called during component initialization
	let supabaseClient: any = null;
	try {
		supabaseClient = getContext('supabase');
	} catch (e) {
		// Context might not be available in some cases
		console.warn('Supabase context not available, will skip realtime service:', e);
		// We can still generate briefs without realtime updates
	}

	// Initialize with minimal data from server
	let currentDate = $state('');
	let selectedView = $state<'single' | 'list' | 'analytics'>('single');
	let userTimezone = $state('');

	// Brief data - initially empty
	let dailyBrief = $state<DailyBrief | null>(null);
	let projectBriefs = $state<any[]>([]);
	let briefHistory = $state<DailyBrief[]>([]);
	let isToday = $state(false);

	// Component state
	let isInitialLoading = $state(true);
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let showMobileMenu = $state(false);
	let isRefreshing = $state(false);

	// Search and filter state
	let searchQuery = $state('');
	let selectedDateRange = $state<'today' | 'week' | 'month' | 'custom'>('today');
	let customStartDate = $state('');
	let customEndDate = $state('');
	let showFilters = $state(false);
	let filteredBriefs = $state<DailyBrief[]>([]);

	// Modal state
	let showDeleteConfirmation = $state(false);
	let briefToDelete = $state<DailyBrief | null>(null);
	let showSettingsModal = $state(false);

	// Reactive streaming data
	let currentStreamingStatus = $state<StreamingStatus | null>(null);
	let currentStreamingData = $state<StreamingBriefData | null>(null);
	let wasGenerating = $state(false);

	let checkingExistingGeneration = $state(false);
	let railwayWorkerAvailable = $state(false);

	// Next scheduled brief state
	let nextScheduledBrief = $state<{ scheduledFor: string; status: string } | null>(null);
	let isLoadingNextBrief = $state(true);

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

	// Function to fetch the next scheduled brief time
	async function fetchNextScheduledBrief() {
		if (!browser) return;

		isLoadingNextBrief = true;

		try {
			const response = await fetch('/api/brief-jobs/next-scheduled');

			const payload = await response.json();

			if (!response.ok) {
				throw new Error(
					payload?.error || payload?.message || 'Failed to fetch next scheduled brief'
				);
			}

			nextScheduledBrief =
				payload?.data?.nextScheduledBrief ?? payload?.nextScheduledBrief ?? null;
		} catch (err) {
			console.error('Error fetching next scheduled brief:', err);
			nextScheduledBrief = null;
		} finally {
			isLoadingNextBrief = false;
		}
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

				// Update URL if needed
				const url = new URL($page.url);
				if (currentDate && currentDate !== url.searchParams.get('date')) {
					url.searchParams.set('date', currentDate);
				}
				if (selectedView !== url.searchParams.get('view')) {
					url.searchParams.set('view', selectedView);
				}

				// Use replaceState to update URL without navigation
				if (browser) {
					replaceState(url.toString(), {});
				}
			} else {
				throw new Error(result.error || 'Failed to load brief data');
			}
		} catch (err) {
			console.error('Error fetching brief data:', err);
			error = err instanceof Error ? err.message : 'Failed to load brief data';
		} finally {
			isLoading = false;
			isInitialLoading = false;
		}
	}

	// Helper function to format date/time in user's timezone
	function formatDateTime(dateString: string, format: 'date' | 'time' | 'full' = 'time'): string {
		if (!dateString) return '';

		const date = new Date(dateString);
		const options: Intl.DateTimeFormatOptions = {
			timeZone: userTimezone
		};

		switch (format) {
			case 'date':
				options.year = 'numeric';
				options.month = 'short';
				options.day = 'numeric';
				break;
			case 'time':
				options.hour = 'numeric';
				options.minute = '2-digit';
				options.hour12 = true;
				break;
			case 'full':
				options.year = 'numeric';
				options.month = 'short';
				options.day = 'numeric';
				options.hour = 'numeric';
				options.minute = '2-digit';
				options.hour12 = true;
				break;
		}

		return new Intl.DateTimeFormat('en-US', options).format(date);
	}

	// Subscribe to streaming stores
	const unsubscribeStatus = streamingStatus.subscribe(async (status) => {
		const previousStatus = currentStreamingStatus;
		currentStreamingStatus = status;

		// Track if we were generating
		if (status.isGenerating) {
			wasGenerating = true;
		}

		// Handle completion - when isGenerating goes from true to false and currentStep is 'completed'
		if (
			wasGenerating &&
			!status.isGenerating &&
			status.currentStep === 'completed' &&
			previousStatus?.isGenerating
		) {
			console.log('Generation completed, refreshing data...');
			wasGenerating = false;
		}

		// Handle errors
		if (status.error && status.currentStep === 'error') {
			wasGenerating = false;
			error = status.error;
		}
	});

	const unsubscribeData = streamingBriefData.subscribe((data) => {
		currentStreamingData = data;
	});

	// Subscribe to completion events
	const unsubscribeCompletion = briefGenerationCompleted.subscribe(async (event) => {
		if (event && event.briefDate === currentDate) {
			console.log('Brief generation completed event received');
			await handleGenerationComplete();
		}
	});

	// Handle generation completion
	async function handleGenerationComplete() {
		if (isRefreshing) return;

		isRefreshing = true;

		try {
			// Add a delay to ensure database writes are complete
			await new Promise((resolve) => setTimeout(resolve, 1000));

			// Refresh the page data
			await refreshPageData();

			// If still no data, try once more after a longer delay
			if (!dailyBrief && isToday) {
				console.log('No data after first refresh, trying again...');
				await new Promise((resolve) => setTimeout(resolve, 2000));
				await refreshPageData();
			}
		} finally {
			isRefreshing = false;
		}
	}

	// Reactive statements for filtering
	$effect(() => {
		if (briefHistory.length > 0) {
			filterBriefs();
		}
	});

	// Initialize on mount
	onMount(async () => {
		// Get user's timezone from browser
		userTimezone = getUserTimezone();

		// Parse initial URL params
		const urlParams = new URLSearchParams($page.url.search);
		const dateParam = urlParams.get('date');
		const viewParam = urlParams.get('view');

		// Set initial view
		selectedView = (viewParam as 'single' | 'list' | 'analytics') || 'single';

		// If no date was provided, use today in user's timezone
		currentDate = dateParam || getTodayInTimezone(userTimezone);

		// Fetch initial data with proper timezone
		await fetchBriefData();

		// Fetch next scheduled brief time
		await fetchNextScheduledBrief();

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
			checkingExistingGeneration = true;
			try {
				if (railwayWorkerAvailable) {
					const user = data.user;
					if (user) {
						const { isGenerating, job } = await RailwayWorkerService.isBriefGenerating(
							user.id,
							currentDate
						);
						if (isGenerating) {
							error = `Brief generation is in progress${job ? ` (${job.status})` : ''}. The brief will appear when complete.`;
						}
					}
				} else {
					const isCurrentlyGenerating = await BriefClientService.isGenerating(
						currentDate,
						data.user
					);
					if (isCurrentlyGenerating) {
						error =
							'Brief generation is currently in progress. The brief will appear when complete.';
					}
				}
			} catch (err) {
				console.error('Error checking existing generation:', err);
			} finally {
				checkingExistingGeneration = false;
			}
		}
	});

	onDestroy(() => {
		unsubscribeStatus();
		unsubscribeData();
		unsubscribeCompletion();
		BriefClientService.cancelGeneration();
		// Clean up realtime service when leaving the page
		RealtimeBriefService.cleanup();
	});

	async function generateDailyBrief(forceRegenerate = false) {
		if (currentStreamingStatus?.isGenerating || checkingExistingGeneration) return;

		error = null;

		try {
			// Pass timezone and supabase client along with other options
			await BriefClientService.startStreamingGeneration({
				briefDate: currentDate,
				forceRegenerate,
				user: data.user,
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
			console.log('Refreshing page data...');
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
		showMobileMenu = false;
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

	// Calculate overall progress percentage
	let overallProgress = $derived(
		currentStreamingStatus
			? Math.round(
					(currentStreamingStatus.progress.projects.completed /
						Math.max(1, currentStreamingStatus.progress.projects.total)) *
						100
				)
			: 0
	);

	// View configurations
	const viewConfigs = [
		{ id: 'single' as const, label: 'Today', icon: FileText },
		{ id: 'list' as const, label: 'History', icon: Calendar },
		{ id: 'analytics' as const, label: 'Analytics', icon: TrendingUp }
	];

	// Show generated brief from streaming data ONLY while actively generating
	let displayDailyBrief = $derived(
		isToday &&
			currentStreamingData?.mainBrief &&
			currentStreamingStatus?.isGenerating &&
			dailyBrief
			? {
					...dailyBrief,
					id: currentStreamingData.mainBrief.id,
					summary_content: currentStreamingData.mainBrief.content,
					priority_actions: currentStreamingData.mainBrief.priority_actions,
					generation_completed_at: new Date().toISOString()
				}
			: dailyBrief
	);

	// Show project briefs from streaming data ONLY while actively generating
	let displayProjectBriefs = $derived(
		isToday &&
			currentStreamingData?.projectBriefs?.length > 0 &&
			currentStreamingStatus?.isGenerating
			? currentStreamingData.projectBriefs
			: projectBriefs
	);
</script>

<SEOHead
	title="Daily Briefs - BuildOS | AI-Generated Project Insights & Priority Actions"
	description="Stay on top of your projects and goals with AI-generated daily briefs. Get personalized insights, priority actions, and project updates delivered to your inbox."
	canonical="https://build-os.com/briefs"
	keywords="BuildOS daily briefs, AI project summaries, productivity insights, task prioritization, project updates"
	noindex={true}
/>

<!-- Show loading state for initial load -->
{#if isInitialLoading}
	<div class="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
		<div class="text-center">
			<Loader2 class="w-8 h-8 text-blue-600 animate-spin mx-auto mb-4" />
			<p class="text-sm text-gray-600 dark:text-gray-400">Loading briefs...</p>
		</div>
	</div>
{:else}
	<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
		<div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
			<!-- Improved Header -->
			<div class="mb-6">
				<!-- Main Header -->
				<div class="flex items-center justify-between mb-6">
					<div class="flex items-center">
						<Calendar class="w-8 h-8 mr-3 text-blue-600 dark:text-blue-400" />
						<div>
							<h1 class="text-3xl font-bold text-gray-900 dark:text-white">
								Daily Briefs
							</h1>
							<p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
								AI-generated insights and priority actions
							</p>
						</div>
					</div>
					<div class="flex items-center space-x-2">
						<!-- Next Scheduled Brief Display -->
						{#if isLoadingNextBrief}
							<div
								class="hidden sm:flex items-center text-sm text-gray-500 dark:text-gray-400"
							>
								<Loader2 class="w-4 h-4 mr-2 animate-spin" />
								<span>Loading...</span>
							</div>
						{:else if nextScheduledBrief}
							<div
								class="hidden sm:flex items-center text-sm text-gray-600 dark:text-gray-300 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-lg border border-blue-200 dark:border-blue-800"
							>
								<Clock class="w-4 h-4 mr-2 text-blue-600 dark:text-blue-400" />
								<span class="font-medium">Next Brief:</span>
								<span class="ml-1"
									>{formatDateTime(nextScheduledBrief.scheduledFor, 'full')}</span
								>
							</div>
						{/if}

						<Button
							type="button"
							onclick={() => (showSettingsModal = true)}
							variant="ghost"
							size="sm"
							class="hidden sm:flex items-center gap-2 px-3 py-2"
							icon={Settings}
						>
							Settings
						</Button>
						<Button
							type="button"
							onclick={() => (showMobileMenu = !showMobileMenu)}
							variant="ghost"
							size="sm"
							class="sm:hidden p-2"
							icon={Menu}
						></Button>
					</div>
				</div>

				<!-- Desktop Navigation Bar -->
				<div class="hidden sm:block">
					<div
						class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4"
					>
						<div class="flex items-center justify-between">
							<!-- View Tabs -->
							<div class="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
								{#each viewConfigs as view}
									<Button
										type="button"
										onclick={() => changeView(view.id)}
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
											onclick={goToToday}
											variant="primary"
											size="sm"
											class="bg-blue-600 text-white hover:bg-blue-700"
										>
											Today
										</Button>
									{/if}

									<div
										class="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg"
									>
										<Button
											type="button"
											onclick={() => navigateDate('prev')}
											variant="ghost"
											size="sm"
											class="p-2 rounded-l-lg rounded-r-none hover:bg-gray-200 dark:hover:bg-gray-600"
											aria-label="Previous day"
											icon={ChevronLeft}
										></Button>

										<div class="px-4 py-2 min-w-[140px] text-center">
											<span
												class="text-sm font-medium text-gray-900 dark:text-white"
											>
												{BriefClientService.formatDisplayDate(currentDate)}
											</span>
										</div>

										<Button
											type="button"
											onclick={() => navigateDate('next')}
											variant="ghost"
											size="sm"
											class="p-2 rounded-r-lg rounded-l-none hover:bg-gray-200 dark:hover:bg-gray-600"
											disabled={isToday}
											aria-label="Next day"
											icon={ChevronRight}
										></Button>
									</div>
								</div>
							{:else if selectedView === 'list'}
								<Button
									type="button"
									onclick={() => (showFilters = !showFilters)}
									variant="ghost"
									size="sm"
									class="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
									title="Toggle filters"
									icon={Filter}
								></Button>
							{/if}
						</div>
					</div>
				</div>

				<!-- Mobile View Navigation -->
				{#if showMobileMenu}
					<div class="sm:hidden mt-4 space-y-2">
						<!-- Mobile Next Scheduled Brief Display -->
						{#if isLoadingNextBrief}
							<div
								class="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm border border-gray-200 dark:border-gray-700"
							>
								<div
									class="flex items-center text-sm text-gray-500 dark:text-gray-400"
								>
									<Loader2 class="w-4 h-4 mr-2 animate-spin" />
									<span>Loading next brief...</span>
								</div>
							</div>
						{:else if nextScheduledBrief}
							<div
								class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 shadow-sm border border-blue-200 dark:border-blue-800"
							>
								<div
									class="flex items-center text-sm text-gray-600 dark:text-gray-300"
								>
									<Clock class="w-4 h-4 mr-2 text-blue-600 dark:text-blue-400" />
									<span class="font-medium">Next Brief:</span>
									<span class="ml-1"
										>{formatDateTime(
											nextScheduledBrief.scheduledFor,
											'full'
										)}</span
									>
								</div>
							</div>
						{/if}

						<div
							class="flex flex-col space-y-2 bg-white dark:bg-gray-800 rounded-lg p-2 shadow-sm border border-gray-200 dark:border-gray-700"
						>
							{#each viewConfigs as view}
								<Button
									type="button"
									onclick={() => changeView(view.id)}
									variant={selectedView === view.id ? 'primary' : 'ghost'}
									size="md"
									class={selectedView === view.id
										? 'bg-blue-600 text-white shadow-sm justify-start'
										: 'justify-start'}
									icon={view.icon}
								>
									{view.label}
								</Button>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Mobile Date Navigation (for single view) -->
				{#if selectedView === 'single'}
					<div class="sm:hidden mt-4">
						<div
							class="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-2"
						>
							<Button
								type="button"
								onclick={() => navigateDate('prev')}
								variant="ghost"
								size="sm"
								class="p-2"
								aria-label="Previous day"
								icon={ChevronLeft}
							></Button>

							<div class="flex-1 text-center">
								<span class="text-sm font-medium text-gray-900 dark:text-white">
									{BriefClientService.formatDisplayDate(currentDate)}
								</span>
							</div>

							<Button
								type="button"
								onclick={() => navigateDate('next')}
								variant="ghost"
								size="sm"
								class="p-2"
								disabled={isToday}
								aria-label="Next day"
								icon={ChevronRight}
							></Button>
						</div>

						{#if !isToday}
							<Button
								type="button"
								onclick={goToToday}
								variant="primary"
								size="sm"
								class="w-full mt-2 bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-300 dark:hover:bg-blue-800"
							>
								Go to Today
							</Button>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Mobile-Optimized Streaming Progress -->
			{#if currentStreamingStatus?.isGenerating}
				<div
					class="bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-800 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6 shadow-sm"
				>
					<div class="flex items-center justify-between mb-3">
						<div class="flex items-center flex-1">
							<Loader2
								class="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 animate-spin mr-2 sm:mr-3 flex-shrink-0"
							/>
							<div class="min-w-0">
								<h3
									class="text-sm sm:text-base font-semibold text-gray-900 dark:text-white truncate"
								>
									Generating Brief
								</h3>
								<p
									class="text-xs sm:text-sm text-blue-600 dark:text-blue-400 truncate"
								>
									{currentStreamingStatus.message}
								</p>
							</div>
						</div>
						<Button
							type="button"
							onclick={cancelGeneration}
							variant="ghost"
							size="sm"
							class="p-1 sm:p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 ml-2"
							title="Cancel"
							icon={X}
						></Button>
					</div>

					{#if currentStreamingStatus.progress.projects.total > 0}
						<div class="space-y-2">
							<div
								class="flex justify-between text-xs text-gray-600 dark:text-gray-400"
							>
								<span
									>Progress: {currentStreamingStatus.progress.projects
										.completed}/{currentStreamingStatus.progress.projects
										.total}</span
								>
								<span>{overallProgress}%</span>
							</div>
							<div
								class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 sm:h-2"
							>
								<div
									class="bg-blue-600 h-1.5 sm:h-2 rounded-full transition-all duration-500"
									style="width: {overallProgress}%"
								></div>
							</div>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Mobile-Optimized Error Display -->
			{#if error || currentStreamingStatus?.error}
				<div
					class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-4 sm:mb-6"
				>
					<div class="flex items-start">
						<AlertCircle
							class="w-4 h-4 mr-2 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5"
						/>
						<p class="text-xs sm:text-sm text-red-800 dark:text-red-200 flex-1">
							{error || currentStreamingStatus?.error}
						</p>
						<Button
							type="button"
							onclick={() => (error = null)}
							variant="ghost"
							size="sm"
							class="ml-2 p-0 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-200"
							icon={X}
						></Button>
					</div>
				</div>
			{/if}

			<!-- Main Content -->
			{#if selectedView === 'analytics'}
				<BriefAnalyticsDashboard />
			{:else if selectedView === 'list'}
				<!-- Mobile-Optimized Filters Panel -->
				{#if showFilters}
					<div
						class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-3 sm:p-4 mb-4 sm:mb-6 border border-gray-200 dark:border-gray-700"
					>
						<div class="space-y-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:space-y-0">
							<div class="sm:col-span-3 md:col-span-1">
								<div
									class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
								>
									Search
								</div>
								<TextInput
									type="text"
									bind:value={searchQuery}
									placeholder="Search briefs..."
									size="sm"
								/>
							</div>

							<FormField label="Date Range" labelFor="dateRange">
								<Select id="dateRange" bind:value={selectedDateRange} size="sm">
									<option value="today">Today</option>
									<option value="week">Last Week</option>
									<option value="month">Last Month</option>
									<option value="custom">Custom Range</option>
								</Select>
							</FormField>

							{#if selectedDateRange === 'custom'}
								<div class="grid grid-cols-2 gap-2 sm:col-span-3 md:col-span-1">
									<FormField label="Start" labelFor="customStartDate" size="sm">
										<TextInput
											id="customStartDate"
											type="date"
											bind:value={customStartDate}
											size="sm"
										/>
									</FormField>
									<FormField label="End" labelFor="customEndDate" size="sm">
										<TextInput
											id="customEndDate"
											type="date"
											bind:value={customEndDate}
											size="sm"
										/>
									</FormField>
								</div>
							{/if}
						</div>
					</div>
				{/if}

				<!-- Mobile-Optimized Brief History List -->
				{#if isLoading}
					<div class="space-y-3 sm:space-y-4">
						{#each Array(3) as _}
							<div
								class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-3 sm:p-4 animate-pulse"
							>
								<div
									class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-2"
								></div>
								<div
									class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-3"
								></div>
								<div class="space-y-2">
									<div class="h-2 bg-gray-200 dark:bg-gray-700 rounded"></div>
									<div
										class="h-2 bg-gray-200 dark:bg-gray-700 rounded w-5/6"
									></div>
								</div>
							</div>
						{/each}
					</div>
				{:else if filteredBriefs.length > 0}
					<div class="space-y-3 sm:space-y-4">
						{#each filteredBriefs as brief}
							<div
								class="bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 border border-gray-200 dark:border-gray-700"
							>
								<div class="p-3 sm:p-4">
									<div
										class="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3"
									>
										<div class="mb-2 sm:mb-0">
											<h3
												class="text-sm sm:text-base font-semibold text-gray-900 dark:text-white"
											>
												{BriefClientService.formatDisplayDate(
													brief.brief_date
												)}
											</h3>
											<div
												class="flex items-center text-xs text-gray-500 dark:text-gray-400"
											>
												<Clock class="mr-1 h-3 w-3" />
												{formatDateTime(
													brief.generation_completed_at || '',
													'time'
												)}
											</div>
										</div>

										<div class="flex items-center space-x-1 sm:space-x-1">
											<Button
												type="button"
												onclick={() => selectBriefDate(brief.brief_date)}
												variant="ghost"
												size="sm"
												class="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
												title="View"
												icon={Eye}
											></Button>
											<Button
												type="button"
												onclick={() => copyBrief(brief)}
												variant="ghost"
												size="sm"
												class="p-1.5 text-gray-400 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20"
												title="Copy"
												icon={Copy}
											></Button>
											<Button
												type="button"
												onclick={() => exportBrief(brief)}
												variant="ghost"
												size="sm"
												class="p-1.5 text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20"
												title="Export"
												icon={Download}
											></Button>
											<Button
												type="button"
												onclick={() => showDeleteBriefConfirmation(brief)}
												variant="ghost"
												size="sm"
												class="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
												title="Delete"
												icon={Trash2}
											></Button>
										</div>
									</div>

									<div
										class="text-xs sm:text-sm text-gray-700 dark:text-gray-300 line-clamp-2 mb-3"
									>
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
							</div>
						{/each}
					</div>
				{:else}
					<div class="text-center py-8 sm:py-12">
						<div
							class="bg-white dark:bg-gray-800 rounded-lg p-4 sm:p-6 max-w-md mx-auto border border-gray-200 dark:border-gray-700"
						>
							<Calendar
								class="h-10 w-10 sm:h-12 sm:w-12 text-gray-400 mx-auto mb-3"
							/>
							<h3
								class="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-2"
							>
								No Briefs Found
							</h3>
							<p class="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
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
					<!-- Mobile-Optimized Empty State -->
					<div class="text-center py-8 sm:py-12">
						<div
							class="bg-white dark:bg-gray-800 rounded-lg p-4 sm:p-6 max-w-lg mx-auto border border-gray-200 dark:border-gray-700"
						>
							<div
								class="bg-blue-100 dark:bg-blue-900/20 rounded-full w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center mx-auto mb-4"
							>
								<Sparkles
									class="h-7 w-7 sm:h-8 sm:w-8 text-blue-600 dark:text-blue-400"
								/>
							</div>
							<h3
								class="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white mb-3"
							>
								No Brief Available
							</h3>
							<p class="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-6">
								{isToday
									? "Generate your daily brief to get started with today's priorities and insights."
									: 'No brief was generated for this date.'}
							</p>

							{#if isToday}
								<Button
									type="button"
									onclick={() => generateDailyBrief()}
									disabled={currentStreamingStatus?.isGenerating ||
										checkingExistingGeneration}
									loading={checkingExistingGeneration ||
										currentStreamingStatus?.isGenerating}
									variant="primary"
									size="md"
									class="shadow-sm w-full sm:w-auto"
									btnType="container"
								>
									{#if checkingExistingGeneration}
										Checking...
									{:else if currentStreamingStatus?.isGenerating}
										Generating...
									{:else}
										<Plus class="mr-2 h-4 w-4" />
										Generate Brief
									{/if}
								</Button>
							{/if}
						</div>
					</div>
				{:else if displayDailyBrief}
					<!-- Mobile-Optimized Main Brief Card -->
					<div
						class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 sm:p-6 mb-4 sm:mb-6 border border-gray-200 dark:border-gray-700"
					>
						<div
							class="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4"
						>
							<h2
								class="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mb-2 sm:mb-0"
							>
								Daily Brief
							</h2>
							<div
								class="flex items-center justify-between sm:justify-end sm:space-x-2"
							>
								<div
									class="flex items-center text-xs text-gray-500 dark:text-gray-400"
								>
									<Clock class="w-3 h-3 mr-1" />
									{displayDailyBrief.generation_completed_at
										? formatDateTime(
												displayDailyBrief.generation_completed_at,
												'time'
											)
										: 'Just now'}
								</div>
								<div class="flex items-center space-x-1 ml-3 sm:ml-0">
									<Button
										type="button"
										onclick={() => exportBrief(displayDailyBrief)}
										variant="ghost"
										size="sm"
										class="p-1.5 text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20"
										title="Export"
										icon={Download}
									></Button>
									<Button
										type="button"
										onclick={() => copyBrief(displayDailyBrief)}
										variant="ghost"
										size="sm"
										class="p-1.5 text-gray-400 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20"
										title="Copy"
										icon={Copy}
									></Button>
									<Button
										type="button"
										onclick={() => generateDailyBrief(true)}
										disabled={currentStreamingStatus?.isGenerating}
										variant="ghost"
										size="sm"
										class="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
										title="Regenerate"
										icon={currentStreamingStatus?.isGenerating
											? Loader2
											: RefreshCw}
									></Button>
								</div>
							</div>
						</div>

						<div
							class="prose prose-gray dark:prose-invert max-w-none prose-sm
							prose-headings:text-gray-900 prose-p:text-gray-700 prose-li:text-gray-700
							prose-strong:text-gray-900 prose-a:text-blue-600 prose-blockquote:text-gray-700
							dark:prose-headings:text-white dark:prose-p:text-gray-300 dark:prose-li:text-gray-300
							dark:prose-strong:text-white dark:prose-a:text-blue-400 dark:prose-blockquote:text-gray-300
							prose-headings:text-base sm:prose-headings:text-lg
							prose-p:text-sm sm:prose-p:text-base
							prose-li:text-sm sm:prose-li:text-base"
						>
							{@html renderMarkdown(displayDailyBrief.summary_content)}
						</div>

						{#if displayDailyBrief.priority_actions?.length}
							<div
								class="mt-4 sm:mt-6 p-3 sm:p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800"
							>
								<h3
									class="font-medium text-blue-900 dark:text-blue-200 mb-2 sm:mb-3 flex items-center text-sm"
								>
									<ArrowRight class="w-3 h-3 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
									Priority Actions
								</h3>
								<ul class="space-y-1.5 sm:space-y-2">
									{#each displayDailyBrief.priority_actions as action}
										<li
											class="flex items-start text-xs sm:text-sm text-blue-800 dark:text-blue-300"
										>
											<ArrowRight
												class="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-1.5 sm:mr-2 mt-0.5 flex-shrink-0"
											/>
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
	</div>
{/if}

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
	user={data.user}
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
