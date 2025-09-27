<!-- src/lib/components/dashboard/Dashboard.svelte -->
<script lang="ts">
	import {
		FolderOpen,
		CheckCircle2,
		ArrowRight,
		Calendar,
		TrendingUp,
		Loader2,
		AlertTriangle
	} from 'lucide-svelte';
	import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { formatFullDate, differenceInHours } from '$lib/utils/date-utils';
	import { toastService } from '$lib/stores/toast.store';
	import type { Task } from '$lib/types/project';
	import type {
		User,
		DashboardStats,
		UserFamiliarity,
		NudgeCard,
		PrimaryCTA,
		BottomSectionsData
	} from '$lib/types/dashboard';
	import type { DashboardData } from '$lib/services/dashboardData.service';
	import { dashboardStore } from '$lib/stores/dashboard.store';
	import { dashboardDataService } from '$lib/services/dashboardData.service';
	// REMOVED: Real-time dashboard service imports - not needed for dashboard functionality

	// Components
	import DailyBriefCard from '$lib/components/dashboard/DailyBriefCard.svelte';
	import TaskDetailsCard from '$lib/components/dashboard/TaskDetailsCard.svelte';
	import MobileTaskTabs from '$lib/components/dashboard/MobileTaskTabs.svelte';
	import WeeklyTaskCalendar from '$lib/components/dashboard/WeeklyTaskCalendar.svelte';
	import FirstTimeBrainDumpCard from '$lib/components/dashboard/FirstTimeBrainDumpCard.svelte';
	import BrainDumpModal from '$lib/components/brain-dump/BrainDumpModal.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	// Lazy-loaded modal components
	let TaskModal: any = null;
	let DailyBriefModal: any = null;
	// BrainDumpModal is imported directly, not lazy loaded

	// Props with proper types
	export let user: User;
	export let initialData: DashboardData | null = null;
	export let isLoadingDashboard: boolean = false;
	export let dashboardError: string | null = null;

	// Event dispatcher
	const dispatch = createEventDispatcher();

	// ============================================
	// STATE MANAGEMENT
	// ============================================

	// Core data state - now using reactive store
	let dashboardData: DashboardData | null = initialData;
	console.log('[Dashboard] Initial data:', initialData);

	// Use initial data until store is initialized
	$: pastDueTasks = $dashboardStore.initialized
		? $dashboardStore.pastDueTasks
		: initialData?.pastDueTasks || [];
	$: todaysTasks = $dashboardStore.initialized
		? $dashboardStore.todaysTasks
		: initialData?.todaysTasks || [];
	$: tomorrowsTasks = $dashboardStore.initialized
		? $dashboardStore.tomorrowsTasks
		: initialData?.tomorrowsTasks || [];
	$: weeklyTasks = $dashboardStore.initialized
		? $dashboardStore.weeklyTasks
		: initialData?.weeklyTasks || [];
	$: weeklyTasksByDate = $dashboardStore.initialized
		? $dashboardStore.weeklyTasksByDate
		: initialData?.weeklyTasksByDate || {};
	$: activeProjects = $dashboardStore.initialized
		? $dashboardStore.activeProjects
		: initialData?.activeProjects || [];
	$: calendarStatus = $dashboardStore.initialized
		? $dashboardStore.calendarStatus
		: initialData?.calendarStatus
			? {
					isConnected: initialData.calendarStatus.isConnected || false,
					loading: false,
					error: null
				}
			: { isConnected: false, loading: false, error: null };
	$: dashboardStats = $dashboardStore.initialized
		? $dashboardStore.stats
		: initialData?.stats || {
				totalProjects: 0,
				activeTasks: 0,
				completedToday: 0,
				upcomingDeadlines: 0
			};
	$: storeLoading = $dashboardStore.loading;
	$: storeError = $dashboardStore.error;
	$: storeInitialized = $dashboardStore.initialized;

	// Debug calendar status
	$: console.log(
		'[Dashboard] Calendar status:',
		calendarStatus,
		'Store initialized:',
		storeInitialized
	);

	// Modal states
	let showTaskModal = false;
	let selectedTask: any = null;
	let taskModalLoading = false;
	let showDailyBriefModal = false;
	let selectedBrief: any = null;
	let showBrainDumpModal = false;
	let selectedBrainDumpProject: any = null;

	// Lazy loading states
	let loadingBottomSections = false;
	let bottomSectionsLoaded = false;
	let bottomSectionsData: BottomSectionsData = {};
	let lazyLoadError: string | null = null;
	let todaysBrief: any = null;
	let loadingBrief = false;

	// Lazy-loaded components
	let BraindumpWeekView: any = null;
	let PhaseCalendarView: any = null;

	// Modal loading states
	let loadingTaskModal = false;
	let loadingDailyBriefModal = false;

	// Performance optimization states
	let lazyLoadTrigger: HTMLElement;
	let intersectionObserver: IntersectionObserver | null = null;
	let invalidationTimeout: number | null = null;
	let cachedStats: DashboardStats | null = null;
	let lastStatsUpdate = 0;

	// ============================================
	// DATA EXTRACTION & COMPUTED PROPERTIES
	// ============================================

	// Initialize store helper function
	function initializeStore(data: DashboardData) {
		if (!data) return;

		console.log('[Dashboard] Initializing store with data:', data);
		const mappedCalendarStatus = data.calendarStatus
			? {
					// Map isConnected from API to connected for store
					isConnected: data.calendarStatus.isConnected || false,
					loading: false,
					error: null
				}
			: {
					isConnected: false,
					loading: false,
					error: null
				};

		console.log('[Dashboard] Mapped calendar status for store:', mappedCalendarStatus);

		dashboardStore.updateState({
			pastDueTasks: data.pastDueTasks || [],
			todaysTasks: data.todaysTasks || [],
			tomorrowsTasks: data.tomorrowsTasks || [],
			weeklyTasks: data.weeklyTasks || [],
			weeklyTasksByDate: data.weeklyTasksByDate || {},
			activeProjects: data.activeProjects || [],
			recentBriefs: data.recentBriefs || [],
			stats: data.stats || {
				totalProjects: 0,
				activeTasks: 0,
				completedToday: 0,
				upcomingDeadlines: 0
			},
			calendarStatus: mappedCalendarStatus,
			timezone: data.timezone || 'UTC',
			initialized: true
		});
	}

	// Computed stats with caching - use store data when available
	$: {
		const currentTime = Date.now();
		const dataChanged =
			!cachedStats || currentTime - lastStatsUpdate > 1000 || storeInitialized;

		if (dataChanged && (storeInitialized || initialData)) {
			const source = storeInitialized
				? {
						activeProjects,
						pastDueTasks,
						todaysTasks,
						tomorrowsTasks,
						weeklyTasks,
						stats: dashboardStats
					}
				: initialData;

			cachedStats = {
				activeProjects: source.activeProjects || [],
				pastDueTasks: source.pastDueTasks || [],
				todaysTasks: source.todaysTasks || [],
				tomorrowsTasks: source.tomorrowsTasks || [],
				weeklyTasks: source.weeklyTasks || [],
				weeklyProgress: source.stats?.weeklyProgress || { completed: 0, total: 0 },
				lastUpdated: new Date().toISOString()
			};
			lastStatsUpdate = currentTime;
		}
	}

	$: stats = cachedStats || {
		activeProjects: initialData?.activeProjects || [],
		pastDueTasks: initialData?.pastDueTasks || [],
		todaysTasks: initialData?.todaysTasks || [],
		tomorrowsTasks: initialData?.tomorrowsTasks || [],
		weeklyTasks: initialData?.weeklyTasks || [],
		weeklyProgress: initialData?.stats?.weeklyProgress || { completed: 0, total: 0 }
	};

	// User familiarity calculations
	$: userFamiliarity = calculateUserFamiliarity();
	$: showWelcomeMessages = shouldShowWelcomeMessages();
	$: primaryCTA = getPrimaryCTA();
	$: nudgeCards = initialData ? calculateNudgeCards() : null;

	// Display mode calculation for progressive disclosure
	$: displayMode = calculateDisplayMode();
	$: showBrainDumpCard = displayMode === 'first-time'; // Only show for brand new users
	$: showTaskCards = displayMode !== 'first-time';
	$: showWeeklyCalendar =
		displayMode === 'experienced' ||
		(displayMode === 'intermediate' && weeklyTasks?.length > 0);
	$: showStatsGrid = displayMode !== 'first-time';
	$: isCompactBrainDumpCard = false; // Never show compact version
	$: showLazyLoadedSections = displayMode !== 'first-time'; // Hide bottom sections for new users

	// Progress metrics
	$: productivityScore = calculateProductivityScore(stats?.weeklyProgress);
	$: weeklyProgressText = getWeeklyProgressText(stats?.weeklyProgress);

	// ============================================
	// LIFECYCLE HOOKS
	// ============================================

	onMount(async () => {
		// Initialize store with existing data if available, otherwise load fresh
		if (initialData) {
			console.log('[Dashboard] Using initial data from +page.ts');
			initializeStore(initialData);
		} else {
			// Fallback: load fresh data with correct timezone
			const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
			console.log('[Dashboard] No initial data, loading fresh with timezone:', timezone);
			await dashboardDataService.loadDashboardData(timezone);
		}

		// Setup lazy loading for bottom sections
		setupLazyLoading();

		// REMOVED: Automatic initialization of real-time dashboard updates
		// Real-time updates are not needed for the dashboard - data is loaded on mount
		// and can be manually refreshed by the user if needed
	});

	onDestroy(async () => {
		if (intersectionObserver) {
			intersectionObserver.disconnect();
			intersectionObserver = null;
		}
		if (invalidationTimeout) {
			clearTimeout(invalidationTimeout);
			invalidationTimeout = null;
		}

		// REMOVED: Real-time subscription cleanup (service is no longer initialized)
	});

	// ============================================
	// DATA LOADING FUNCTIONS
	// ============================================

	async function loadBottomSections() {
		if (loadingBottomSections || bottomSectionsLoaded) return;

		loadingBottomSections = true;
		lazyLoadError = null;

		try {
			const [componentsResult, dataResult] = await Promise.allSettled([
				Promise.all([
					import('$lib/components/dashboard/BraindumpWeekView.svelte'),
					import('$lib/components/dashboard/PhaseCalendarView.svelte')
				]),
				fetch('/api/dashboard/bottom-sections').then((res) => res.json())
			]);

			if (componentsResult.status === 'fulfilled') {
				const [braindumpModule, phaseModule] = componentsResult.value;
				BraindumpWeekView = braindumpModule.default;
				PhaseCalendarView = phaseModule.default;
			}

			if (dataResult.status === 'fulfilled') {
				const result = dataResult.value;
				const data = result.success && result.data ? result.data : result;
				if (!result.error) {
					bottomSectionsData = data;
					// Set todaysBrief from bottom sections data
					if (data.todaysBrief) {
						todaysBrief = data.todaysBrief;
					}
					bottomSectionsLoaded = true;
					if (data.stats) {
						cachedStats = { ...cachedStats, ...data.stats };
						lastStatsUpdate = Date.now();
					}
					if (intersectionObserver) {
						intersectionObserver.disconnect();
					}
				}
			}
		} catch (error) {
			console.error('Error loading bottom sections:', error);
			lazyLoadError = 'Failed to load additional content. Please refresh the page.';
		} finally {
			loadingBottomSections = false;
		}
	}

	function setupLazyLoading() {
		if (typeof window === 'undefined') return;

		// Don't setup lazy loading for first-time users
		if (displayMode === 'first-time') return;

		intersectionObserver = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					if (entry.isIntersecting && !bottomSectionsLoaded && !loadingBottomSections) {
						// Double-check we should load these sections
						if (displayMode !== 'first-time') {
							loadBottomSections();
						}
					}
				});
			},
			{ rootMargin: '400px' } // Increased margin for earlier loading
		);

		if (lazyLoadTrigger) {
			intersectionObserver.observe(lazyLoadTrigger);
		}
	}

	async function loadTaskModal() {
		if (TaskModal || loadingTaskModal) return;
		loadingTaskModal = true;
		try {
			const module = await import('$lib/components/project/TaskModal.svelte');
			TaskModal = module.default;
		} catch (error) {
			console.error('Failed to load TaskModal:', error);
		} finally {
			loadingTaskModal = false;
		}
	}

	async function loadDailyBriefModal() {
		if (DailyBriefModal || loadingDailyBriefModal) return;
		loadingDailyBriefModal = true;
		try {
			const module = await import('$lib/components/briefs/DailyBriefModal.svelte');
			DailyBriefModal = module.default;
		} catch (error) {
			console.error('Failed to load DailyBriefModal:', error);
		} finally {
			loadingDailyBriefModal = false;
		}
	}

	// ============================================
	// USER EXPERIENCE CALCULATIONS
	// ============================================

	function calculateUserFamiliarity(): UserFamiliarity {
		const projectCount = activeProjects?.length || 0;
		const taskCount =
			(pastDueTasks?.length || 0) +
			(todaysTasks?.length || 0) +
			(tomorrowsTasks?.length || 0) +
			(weeklyTasks?.length || 0);
		const lastActivityHours = calculateLastActivityHours();
		const isStale = lastActivityHours > 48;
		const isVeryStale = lastActivityHours > 168;

		if (projectCount === 0) {
			return { tier: 1, level: 'brand-new', projectCount, taskCount, isStale, isVeryStale };
		}
		if (projectCount === 1) {
			return {
				tier: 2,
				level: 'getting-started',
				projectCount,
				taskCount,
				isStale,
				isVeryStale
			};
		}
		return { tier: 3, level: 'experienced', projectCount, taskCount, isStale, isVeryStale };
	}

	function calculateLastActivityHours() {
		const dates = [];
		if (user?.updated_at) dates.push(new Date(user.updated_at));
		activeProjects?.forEach((p) => {
			if (p.updated_at) dates.push(new Date(p.updated_at));
		});
		if (dates.length === 0) return 0;
		const mostRecent = new Date(Math.max(...dates.map((d) => d.getTime())));
		return differenceInHours(new Date(), mostRecent);
	}

	function shouldShowWelcomeMessages() {
		if (!userFamiliarity) return false;
		return userFamiliarity.tier === 1 || userFamiliarity.isVeryStale;
	}

	function calculateNudgeCards(): NudgeCard[] {
		if (!userFamiliarity) return [];
		const cards = [];

		// Calendar connection nudge
		if (!calendarStatus?.isConnected && (todaysTasks.length > 0 || weeklyTasks.length > 0)) {
			cards.push({
				type: 'calendar-connection',
				title: 'Connect Calendar',
				description: 'Schedule tasks automatically',
				action: { text: 'Connect', href: '/profile?tab=calendar' },
				icon: Calendar,
				color: 'blue'
			});
		}

		return cards;
	}

	function getPrimaryCTA(): PrimaryCTA | null {
		if (!userFamiliarity || userFamiliarity.tier > 1) return null;

		return {
			title: 'Welcome to BuildOS!',
			subtitle: 'Your personal operating system for projects',
			description: 'Start by creating your first project. Include goals, dates, and tasks.',
			primaryAction: {
				text: 'Create Project',
				href: '/projects',
				icon: FolderOpen
			}
		};
	}

	function calculateProductivityScore(
		progress: { completed: number; total: number } | undefined
	): number {
		if (!progress || progress.total === 0) return 0;
		return Math.round((progress.completed / progress.total) * 100);
	}

	function getWeeklyProgressText(
		progress: { completed: number; total: number } | undefined
	): string {
		if (!progress || progress.total === 0) return 'No tasks this week';
		return `${progress.completed}/${progress.total} completed`;
	}

	function calculateDisplayMode() {
		const hasProjects = (activeProjects?.length || 0) > 0;
		const hasTasks =
			(pastDueTasks?.length || 0) +
				(todaysTasks?.length || 0) +
				(tomorrowsTasks?.length || 0) +
				(weeklyTasks?.length || 0) >
			0;
		const hasBrainDumps = bottomSectionsData?.braindumps?.length > 0;

		if (!hasProjects && !hasBrainDumps && !hasTasks) {
			return 'first-time'; // Stage 1: No data at all
		} else if (hasProjects && activeProjects.length <= 1) {
			return 'getting-started'; // Stage 2: First project created
		} else if (activeProjects.length <= 2) {
			return 'intermediate'; // Stage 3: 2 projects
		} else {
			return 'experienced'; // Stage 4: 3+ projects
		}
	}

	// ============================================
	// EVENT HANDLERS
	// ============================================

	async function requestRefresh() {
		// Refresh dashboard data using the service
		const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		console.log('[Dashboard] Manual refresh requested');
		await dashboardDataService.loadDashboardData(timezone);
	}

	function handleBrainDumpSuccess(event: CustomEvent) {
		requestRefresh();
		toastService?.success?.('Brain dump saved successfully!');
	}

	async function handleTaskClick(task: any) {
		selectedTask = task;
		await loadTaskModal();
		showTaskModal = true;
	}

	async function handleOpenBrief(event: CustomEvent) {
		selectedBrief = event.detail.brief;
		await loadDailyBriefModal();
		showDailyBriefModal = true;
	}

	function handleCloseBriefModal() {
		showDailyBriefModal = false;
		selectedBrief = null;
	}

	function handleStartBrainDump() {
		console.log('[Dashboard] Opening brain dump modal');
		showBrainDumpModal = true;
		selectedBrainDumpProject = null; // Let user select project in modal
	}

	async function handleBrainDumpClose() {
		showBrainDumpModal = false;
		selectedBrainDumpProject = null;
		// Refresh dashboard data after brain dump
		await requestRefresh();
	}

	async function handleBrainDumpNavigate(event: CustomEvent) {
		const { url } = event.detail;
		showBrainDumpModal = false;
		selectedBrainDumpProject = null;
		await tick();
		if (url) {
			await goto(url);
		}
	}

	function handleCloseTaskModal() {
		showTaskModal = false;
		selectedTask = null;
		taskModalLoading = false;
	}

	async function handleTaskUpdate(updatedTask: Task) {
		if (!updatedTask || !updatedTask.id) {
			handleCloseTaskModal();
			return;
		}

		// Ensure we have project_id from either the updated task or the selected task
		const projectId = updatedTask.project_id || selectedTask?.project_id;
		if (!projectId) {
			toastService?.error?.('Cannot update task: project information missing');
			handleCloseTaskModal();
			return;
		}

		// Add project_id to the update if not present
		const taskToUpdate = { ...updatedTask, project_id: projectId };

		taskModalLoading = true;
		try {
			// Use the dashboard service for optimistic updates, passing projectId separately
			const result = await dashboardDataService.updateTask(
				taskToUpdate.id,
				taskToUpdate,
				projectId
			);

			if (!result.success) {
				throw new Error(result.error || result.message || 'Failed to update task');
			}

			dispatch('taskUpdated', result.data);
			toastService?.success?.('Task updated successfully');

			// Refresh bottom sections if loaded
			if (bottomSectionsLoaded) {
				await loadBottomSections();
			}
		} catch (error: any) {
			console.error('Error updating task:', error);
			toastService?.error?.(error.message || 'Failed to update task');
		} finally {
			taskModalLoading = false;
			handleCloseTaskModal();
		}
	}

	async function handleTaskDelete(taskId: string) {
		if (!taskId || !selectedTask?.project_id) {
			handleCloseTaskModal();
			return;
		}
		taskModalLoading = true;
		try {
			// Use the dashboard service for optimistic delete
			const result = await dashboardDataService.deleteTask(taskId);

			if (!result.success) {
				throw new Error(result.error || 'Failed to delete task');
			}

			dispatch('taskDeleted', taskId);
			toastService?.success?.('Task deleted successfully');

			// Refresh bottom sections if loaded
			if (bottomSectionsLoaded) {
				await loadBottomSections();
			}
		} catch (error: any) {
			console.error('Error deleting task:', error);
			toastService?.error?.(error.message || 'Failed to delete task');
		} finally {
			taskModalLoading = false;
			handleCloseTaskModal();
		}
	}

	// No longer needed - the store handles all state updates
	// Kept for backward compatibility but can be removed
	function updateLocalTaskState(task: any, action: 'update' | 'delete') {
		// The dashboard store now handles all optimistic updates
		// This function is no longer needed but kept for backward compatibility
	}

	// Display name helper
	$: displayName = user?.name || user?.email?.split('@')[0] || 'there';
</script>

<main
	class="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 transition-colors"
>
	<div class="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10 max-w-7xl">
		<!-- Header Section with Apple-style typography -->
		<header class="mb-8 sm:mb-10">
			<h1
				class="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-2 tracking-tight bg-gradient-to-br from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent"
			>
				Welcome back, {displayName}
			</h1>
			<p class="text-sm sm:text-base text-gray-500 dark:text-gray-400 font-medium">
				<time datetime={new Date().toISOString()}>
					{formatFullDate(new Date())}
				</time>
			</p>
		</header>

		<!-- Error State -->
		{#if dashboardError}
			<div
				class="mb-6 sm:mb-8 bg-red-50 dark:bg-red-900/20 rounded-xl p-4 sm:p-6 border border-red-200 dark:border-red-800 transition-colors"
			>
				<div class="text-center">
					<AlertTriangle class="h-8 w-8 text-red-500 dark:text-red-400 mx-auto mb-3" />
					<p class="text-red-600 dark:text-red-400 mb-4">{dashboardError}</p>
					<Button on:click={requestRefresh} variant="danger" size="sm">Try Again</Button>
				</div>
			</div>
		{/if}

		<!-- Loading State -->
		{#if isLoadingDashboard && !initialData}
			<div
				class="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-8 sm:p-12 transition-colors"
			>
				<div class="flex flex-col items-center justify-center">
					<Loader2 class="h-10 w-10 text-blue-600 dark:text-blue-400 animate-spin mb-4" />
					<p class="text-gray-600 dark:text-gray-400">Loading your dashboard...</p>
				</div>
			</div>
		{:else if initialData}
			<!-- Brain Dump Card for First-Time Users -->
			{#if showBrainDumpCard}
				<section class="mb-6 sm:mb-8">
					<FirstTimeBrainDumpCard
						isCompact={isCompactBrainDumpCard}
						on:startBrainDump={handleStartBrainDump}
					/>
				</section>
			{/if}

			<!-- Quick Actions - Only show if bottom sections are loaded and there's a daily brief -->
			{#if bottomSectionsLoaded && todaysBrief && initialData?.activeProjects && displayMode !== 'first-time'}
				<section class="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
					<!-- Daily Brief -->
					<DailyBriefCard brief={todaysBrief} on:openBrief={handleOpenBrief} />
				</section>
			{/if}

			<!-- Welcome Message with modern gradient -->
			{#if showWelcomeMessages && primaryCTA && displayMode !== 'first-time'}
				<div
					class="mb-6 sm:mb-8 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-2xl p-5 sm:p-6 border border-blue-200/50 dark:border-blue-800/50 shadow-sm backdrop-blur-sm"
				>
					<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
						<div class="flex-1">
							<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
								{primaryCTA.title}
							</h3>
							<p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
								{primaryCTA.description}
							</p>
							<a
								href={primaryCTA.primaryAction.href}
								class="inline-flex items-center px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl shadow-md hover:shadow-lg transition-all text-sm font-semibold"
							>
								<svelte:component
									this={primaryCTA.primaryAction.icon}
									class="h-4 w-4 mr-2"
								/>
								{primaryCTA.primaryAction.text}
							</a>
						</div>
					</div>
				</div>
			{/if}

			<!-- Nudge Cards -->
			{#if nudgeCards?.length}
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 sm:mb-8">
					{#each nudgeCards as card}
						<div
							class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-all"
						>
							<div class="flex items-start space-x-3">
								<div
									class="p-2 bg-{card.color}-100 dark:bg-{card.color}-900/30 rounded-lg"
								>
									<svelte:component
										this={card.icon}
										class="h-4 w-4 text-{card.color}-600 dark:text-{card.color}-400"
									/>
								</div>
								<div class="flex-1">
									<h4
										class="text-sm font-semibold text-gray-900 dark:text-white mb-1"
									>
										{card.title}
									</h4>
									<p class="text-xs text-gray-600 dark:text-gray-400 mb-3">
										{card.description}
									</p>
									<a
										href={card.action.href}
										class="inline-flex items-center text-xs font-medium text-{card.color}-600 dark:text-{card.color}-400 hover:text-{card.color}-700 dark:hover:text-{card.color}-300"
									>
										{card.action.text}
										<ArrowRight class="h-3 w-3 ml-1" />
									</a>
								</div>
							</div>
						</div>
					{/each}
				</div>
			{/if}

			<!-- Task Cards - Mobile Tabs / Desktop Grid -->
			{#if showTaskCards}
				<!-- Mobile: Tab view -->
				<section class="sm:hidden mb-6">
					{#key [pastDueTasks, todaysTasks, tomorrowsTasks]}
						<MobileTaskTabs
							{pastDueTasks}
							{todaysTasks}
							{tomorrowsTasks}
							{calendarStatus}
							onTaskClick={handleTaskClick}
						/>
					{/key}
				</section>

				<!-- Desktop: Grid view -->
				<section
					class="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-5 mb-6 sm:mb-8"
				>
					{#key pastDueTasks}
						<TaskDetailsCard
							title="Past Due"
							tasks={pastDueTasks || []}
							{calendarStatus}
							onTaskClick={handleTaskClick}
							emptyMessage="No overdue tasks"
							emptyIcon={CheckCircle2}
						/>
					{/key}
					{#key todaysTasks}
						<TaskDetailsCard
							title="Today"
							tasks={todaysTasks || []}
							{calendarStatus}
							onTaskClick={handleTaskClick}
							emptyMessage="No tasks for today"
							emptyIcon={CheckCircle2}
						/>
					{/key}
					{#key tomorrowsTasks}
						<TaskDetailsCard
							title="Tomorrow"
							tasks={tomorrowsTasks || []}
							{calendarStatus}
							onTaskClick={handleTaskClick}
							emptyMessage="No tasks for tomorrow"
							emptyIcon={Calendar}
						/>
					{/key}
				</section>
			{/if}

			<!-- Weekly Calendar -->
			{#if showWeeklyCalendar && weeklyTasks && weeklyTasks.length > 0}
				<section class="mb-6 sm:mb-8">
					{#key weeklyTasksByDate}
						<WeeklyTaskCalendar
							tasksByDate={weeklyTasksByDate}
							{calendarStatus}
							onTaskClick={handleTaskClick}
						/>
					{/key}
				</section>
			{/if}

			<!-- Stats Grid -->
			{#if showStatsGrid}
				<section class="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
					<!-- Weekly Progress with glass effect -->
					<div
						class="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/10 dark:to-indigo-900/10 rounded-2xl p-5 sm:p-6 border border-blue-200/50 dark:border-blue-800/50 shadow-sm backdrop-blur-sm"
					>
						<div class="flex items-center justify-between mb-5">
							<div class="flex items-center">
								<div class="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl mr-3">
									<TrendingUp class="h-5 w-5 text-blue-600 dark:text-blue-400" />
								</div>
								<h3
									class="text-lg font-semibold text-gray-900 dark:text-white tracking-tight"
								>
									Weekly Progress
								</h3>
							</div>
							<span
								class="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent"
							>
								{productivityScore}%
							</span>
						</div>
						<div class="space-y-3">
							<p class="text-sm text-gray-600 dark:text-gray-400">
								{weeklyProgressText}
							</p>
							<div
								class="w-full bg-gray-200/50 dark:bg-gray-700/50 rounded-full h-3 overflow-hidden"
							>
								<div
									class="bg-gradient-to-r from-blue-500 to-indigo-600 h-3 rounded-full transition-all duration-700 ease-out shadow-sm"
									style="width: {productivityScore}%"
								/>
							</div>
						</div>
					</div>

					<!-- Active Projects with modern card style -->
					<div
						class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200/50 dark:border-gray-700/50 p-5 sm:p-6 shadow-sm backdrop-blur-sm"
					>
						<div class="flex items-center justify-between mb-5">
							<div class="flex items-center">
								<div class="p-2 bg-green-100 dark:bg-green-900/30 rounded-xl mr-3">
									<FolderOpen
										class="h-5 w-5 text-green-600 dark:text-green-400"
									/>
								</div>
								<h3
									class="text-lg font-semibold text-gray-900 dark:text-white tracking-tight"
								>
									Active Projects
								</h3>
							</div>
							<span
								class="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 dark:from-green-400 dark:to-emerald-400 bg-clip-text text-transparent"
							>
								{activeProjects?.length || 0}
							</span>
						</div>
						{#if activeProjects && activeProjects.length > 0}
							<div class="space-y-2">
								{#each activeProjects.slice(0, 3) as project}
									<a
										href="/projects/{project.id}"
										class="block p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all hover:shadow-sm group border border-transparent hover:border-gray-200/50 dark:hover:border-gray-700/50"
									>
										<div class="flex items-center justify-between">
											<span
												class="text-sm text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white transition-colors"
											>
												{project.name}
											</span>
											<ArrowRight
												class="h-4 w-4 text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors"
											/>
										</div>
									</a>
								{/each}
								{#if activeProjects.length > 3}
									<a
										href="/projects"
										class="block text-center py-2 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm font-medium transition-colors"
									>
										View all {activeProjects.length} projects
										<ArrowRight class="inline h-4 w-4 ml-1" />
									</a>
								{/if}
							</div>
						{:else}
							<div class="text-center py-4">
								<p class="text-gray-500 dark:text-gray-400 mb-3 text-sm">
									No active projects yet
								</p>
								<a
									href="/projects"
									class="inline-flex items-center text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm font-medium transition-colors"
								>
									Create your first project
									<ArrowRight class="h-4 w-4 ml-1" />
								</a>
							</div>
						{/if}
					</div>
				</section>
			{/if}

			<!-- Lazy load trigger - positioned before lazy loaded sections for earlier loading -->
			{#if showLazyLoadedSections}
				<div bind:this={lazyLoadTrigger} class="h-px opacity-0" />
			{/if}

			<!-- Lazy loaded sections -->
			{#if showLazyLoadedSections && bottomSectionsLoaded}
				{#if BraindumpWeekView}
					<section class="mb-6 sm:mb-8">
						<svelte:component this={BraindumpWeekView} data={bottomSectionsData} />
					</section>
				{/if}

				{#if PhaseCalendarView}
					<section class="mb-6 sm:mb-8">
						<svelte:component this={PhaseCalendarView} data={bottomSectionsData} />
					</section>
				{/if}
			{/if}

			<!-- Loading indicator for lazy sections -->
			{#if showLazyLoadedSections && loadingBottomSections}
				<div class="text-center py-8">
					<Loader2
						class="h-6 w-6 text-gray-400 dark:text-gray-600 animate-spin mx-auto"
					/>
				</div>
			{/if}

			<!-- Error state for lazy sections -->
			{#if showLazyLoadedSections && lazyLoadError}
				<div class="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
					{lazyLoadError}
				</div>
			{/if}
		{/if}
	</div>
</main>

<!-- Modals - Lazy Loaded -->

{#if TaskModal && showTaskModal && selectedTask}
	<svelte:component
		this={TaskModal}
		isOpen={showTaskModal}
		task={selectedTask}
		projectId={selectedTask?.project_id}
		project={activeProjects.find((p) => p.id === selectedTask?.project_id)}
		{calendarStatus}
		onClose={handleCloseTaskModal}
		onUpdate={handleTaskUpdate}
		onDelete={handleTaskDelete}
		isDashboardContext={true}
	/>
{/if}

{#if DailyBriefModal}
	<svelte:component
		this={DailyBriefModal}
		isOpen={showDailyBriefModal}
		brief={selectedBrief}
		onClose={handleCloseBriefModal}
	/>
{/if}

<BrainDumpModal
	isOpen={showBrainDumpModal}
	project={selectedBrainDumpProject}
	showNavigationOnSuccess={true}
	on:close={handleBrainDumpClose}
	on:navigateAndClose={handleBrainDumpNavigate}
	onNavigateToProject={async (url: string) => {
		showBrainDumpModal = false;
		selectedBrainDumpProject = null;
		await tick();
		if (url) {
			await goto(url);
		}
	}}
/>
