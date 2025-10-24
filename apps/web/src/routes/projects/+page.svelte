<!-- apps/web/src/routes/projects/+page.svelte -->
<script lang="ts">
	import { FolderOpen, FileText, Plus } from 'lucide-svelte';
	import { enhance } from '$app/forms';
	import { toastService } from '$lib/stores/toast.store';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import type { PageData } from './$types';
	import type { ActionResult } from '@sveltejs/kit';

	// Core components - loaded immediately
	import TabNav from '$lib/components/ui/TabNav.svelte';
	import ProjectsFilterBar from '$lib/components/projects/ProjectsFilterBar.svelte';
	import ProjectsEmptyState from '$lib/components/projects/ProjectsEmptyState.svelte';
	import ProjectsGrid from '$lib/components/projects/ProjectsGrid.svelte';
	import BriefsGrid from '$lib/components/projects/BriefsGrid.svelte';
	import ProjectStats from '$lib/components/projects/ProjectStats.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ProjectsGridSkeleton from '$lib/components/ui/skeletons/ProjectsGridSkeleton.svelte';
	import ProjectStatsSkeleton from '$lib/components/ui/skeletons/ProjectStatsSkeleton.svelte';
	import DailyBriefSection from '$lib/components/briefs/DailyBriefSection.svelte';
	import DailyBriefsTab from '$lib/components/briefs/DailyBriefsTab.svelte';
	import {
		brainDumpV2Store,
		isModalOpen as brainDumpModalIsOpen
	} from '$lib/stores/brain-dump-v2.store';

	// Modal components - loaded dynamically
	let NewProjectModal = $state<any>(null);
	let ProjectBriefModal = $state<any>(null);
	let DailyBriefModal = $state<any>(null);
	let QuickProjectModal = $state<any>(null);

	// Utils and types
	import {
		filterProjects,
		filterBriefs,
		calculateFilterCounts,
		debounce
	} from '$lib/utils/projects-filters';
	import type { TabType, ProjectsFilterState } from '$lib/types/projects-page';
	import { ProjectService } from '$lib/services/projectService';
	let { data }: { data: PageData } = $props();
	// export let data: PageData;

	// Project data state
	let projects = $state<any[]>([]);
	let projectsLoaded = $state(false);
	let loadingProjects = $state(false);
	let projectsError = $state<string | null>(null);
	let projectBriefsMap = $state<Map<string, any>>(new Map());

	// State management - organized into logical groups
	let activeTab = $state<TabType>('projects');

	// Check URL params for initial tab
	$effect(() => {
		if (!browser) return;

		const urlParams = new URLSearchParams($page.url.search);
		const tabParam = urlParams.get('tab');
		if (tabParam === 'briefs') {
			if (activeTab !== 'briefs') {
				activeTab = 'briefs';
			}
			if (!briefsLoaded) {
				loadBriefs();
			}
		}
	});

	// Check URL params for brief modal on load
	$effect(() => {
		if (!browser) return;

		const urlParams = new URLSearchParams($page.url.search);
		const briefDateParam = urlParams.get('briefDate');

		// Open modal if briefDate in URL and modal not already open
		if (briefDateParam && !briefModalOpen) {
			// Validate date format (YYYY-MM-DD)
			if (/^\d{4}-\d{2}-\d{2}$/.test(briefDateParam)) {
				// Use IIFE for async operation in effect (Svelte 5 pattern)
				(async () => {
					await loadDailyBriefModal();
					selectedBriefDate = briefDateParam;
					briefModalOpen = true;
				})();
			}
		}

		// Close modal if briefDate removed from URL
		if (!briefDateParam && briefModalOpen) {
			briefModalOpen = false;
			selectedBriefDate = null;
		}
	});
	const filters = $state<ProjectsFilterState>({
		projectFilter: 'all',
		briefDateRange: 'week',
		selectedProjectFilter: 'all',
		searchQuery: ''
	});

	// Brief management
	let projectBriefs = $state<any[]>([]);
	let briefsLoaded = $state(false);
	let loadingBriefs = $state(false);
	let todayProjectBriefs = $state<any[]>([]);

	// Modal state
	let selectedBrief = $state<any>(null);
	let showBriefModal = $state(false);
	let briefModalOpen = $state(false); // Daily brief modal
	let selectedBriefDate = $state<string | null>(null); // Date for daily brief modal
	let showNewProjectModal = $state(false);
	let showQuickProjectModal = $state(false);
	let creatingProject = $state(false);
	const showBrainDumpModal = $derived($brainDumpModalIsOpen);
	let brainDumpModalWasOpen = false;
	let pendingBrainDumpRefresh = false;

	$effect(() => {
		const isOpen = showBrainDumpModal;
		const storeSnapshot = $brainDumpV2Store;
		const activeCount =
			storeSnapshot?.activeBrainDumps instanceof Map
				? storeSnapshot.activeBrainDumps.size
				: 0;
		const processingPhase = storeSnapshot?.processing?.phase ?? 'idle';
		const handoffActive = activeCount > 0 || processingPhase !== 'idle';

		if (!isOpen && brainDumpModalWasOpen) {
			if (handoffActive) {
				pendingBrainDumpRefresh = true;
			} else {
				pendingBrainDumpRefresh = false;
				handleBrainDumpClose();
			}
		}

		if (pendingBrainDumpRefresh && !handoffActive) {
			pendingBrainDumpRefresh = false;
			handleBrainDumpClose();
		}

		brainDumpModalWasOpen = isOpen;
	});

	// Navigation state
	let currentPath = '';

	// Form reference
	let createProjectForm: HTMLFormElement;

	// Dynamic component loading functions
	async function loadNewProjectModal() {
		if (!NewProjectModal) {
			NewProjectModal = (await import('$lib/components/projects/NewProjectModal.svelte'))
				.default;
		}
		return NewProjectModal;
	}

	async function loadProjectBriefModal() {
		if (!ProjectBriefModal) {
			ProjectBriefModal = (await import('$lib/components/briefs/ProjectBriefModal.svelte'))
				.default;
		}
		return ProjectBriefModal;
	}

	async function loadDailyBriefModal() {
		if (!DailyBriefModal) {
			DailyBriefModal = (await import('$lib/components/briefs/DailyBriefModal.svelte'))
				.default;
		}
		return DailyBriefModal;
	}

	async function loadQuickProjectModal() {
		if (!QuickProjectModal) {
			QuickProjectModal = (await import('$lib/components/project/QuickProjectModal.svelte'))
				.default;
		}
		return QuickProjectModal;
	}

	// Computed values with memoization
	const filteredProjects = $derived(
		filterProjects(projects, filters.projectFilter, filters.searchQuery)
	);

	const filteredBriefs = $derived(
		filterBriefs(
			projectBriefs,
			filters.briefDateRange,
			filters.selectedProjectFilter,
			filters.searchQuery
		)
	);

	const filterCounts = $derived(calculateFilterCounts(projects));

	// Always show filter bar to prevent layout shift, but adjust visibility of search
	const showSearch = $derived(
		(activeTab === 'projects' && projects.length > 5) ||
			(activeTab === 'briefs' && projectBriefs.length > 5)
	);

	// Always show filter bar container, but conditionally show controls
	const showFilterControls = $derived(
		(activeTab === 'projects' && projectsLoaded) || (activeTab === 'briefs' && briefsLoaded)
	);

	const hasActiveFilters = $derived(
		Boolean(filters.searchQuery) ||
			(activeTab === 'projects' && filters.projectFilter !== 'all') ||
			(activeTab === 'briefs' &&
				(filters.briefDateRange !== 'all' || filters.selectedProjectFilter !== 'all'))
	);

	const tabs = $derived([
		{
			id: 'projects',
			label: 'Projects',
			icon: FolderOpen,
			count: projectsLoaded ? projects.length : undefined
		},
		{
			id: 'briefs',
			label: 'Daily Briefs',
			icon: FileText,
			count: briefsLoaded ? projectBriefs.length : undefined
		}
	]);

	// Optimized search handler with debouncing
	const handleSearchChange = debounce((value: string) => {
		filters.searchQuery = value;
	}, 300);

	// Event handlers
	function handleTabChange(tabId: string) {
		activeTab = tabId as TabType;
		filters.searchQuery = '';

		// Update URL parameter for browser history and bookmarking
		if (browser) {
			const url = new URL(window.location.href);
			if (tabId === 'briefs') {
				url.searchParams.set('tab', 'briefs');
			} else {
				url.searchParams.delete('tab');
			}
			window.history.pushState({}, '', url);
		}

		if (tabId === 'briefs' && !briefsLoaded) {
			loadBriefs();
		}
	}

	// API calls
	async function loadProjects() {
		if (projectsLoaded || loadingProjects) return;

		loadingProjects = true;
		projectsError = null;

		try {
			const response = await fetch('/api/projects/list');
			if (!response.ok) {
				throw new Error('Failed to load projects');
			}

			const result = await response.json();

			if (result.success) {
				projects = result.data.projects || [];
				projectsLoaded = true;
				// Load today's project briefs after projects are loaded
				loadTodayProjectBriefs();
			} else {
				throw new Error(result.error || 'Failed to load projects');
			}
		} catch (error) {
			console.error('Error loading projects:', error);
			projectsError = error instanceof Error ? error.message : 'Failed to load projects';
			toastService.error(projectsError);
		} finally {
			loadingProjects = false;
		}
	}

	async function loadProjectsWithCacheBust() {
		if (loadingProjects) return;

		loadingProjects = true;
		projectsError = null;

		try {
			// Force fresh data with cache-busting headers
			const response = await fetch('/api/projects/list', {
				headers: {
					'Cache-Control': 'no-cache',
					Pragma: 'no-cache'
				},
				cache: 'no-store'
			});

			if (!response.ok) {
				throw new Error('Failed to load projects');
			}

			const result = await response.json();
			if (result.success) {
				projects = result.data.projects || [];
				projectsLoaded = true;
				// Load today's project briefs after projects are loaded
				loadTodayProjectBriefs();
			} else {
				throw new Error(result.error || 'Failed to load projects');
			}
		} catch (error) {
			console.error('Error loading projects:', error);
			projectsError = error instanceof Error ? error.message : 'Failed to load projects';
			toastService.error(projectsError);
		} finally {
			loadingProjects = false;
		}
	}

	async function loadTodayProjectBriefs() {
		if (!browser || projects.length === 0) return;

		try {
			// Get today's date in user's timezone
			const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
			const formatter = new Intl.DateTimeFormat('en-CA', {
				timeZone: timezone,
				year: 'numeric',
				month: '2-digit',
				day: '2-digit'
			});
			const todayDate = formatter.format(new Date());

			const params = new URLSearchParams();
			params.set('date', todayDate);

			const response = await fetch(`/api/project-briefs?${params.toString()}`);

			if (!response.ok) {
				throw new Error(`Failed to load today's project briefs (HTTP ${response.status})`);
			}

			const result = await response.json();
			if (!result.success) {
				throw new Error(result.error || "Failed to load today's project briefs");
			}

			todayProjectBriefs = result.data?.briefs || [];
			projectBriefsMap = new Map();
			for (const brief of todayProjectBriefs) {
				if (brief.project_id) {
					projectBriefsMap.set(brief.project_id, brief);
				}
			}
		} catch (error) {
			console.error("Error loading today's project briefs:", error);
		}
	}

	async function loadBriefs() {
		if (briefsLoaded || loadingBriefs) return;

		loadingBriefs = true;
		try {
			const response = await fetch('/api/project-briefs');
			if (!response.ok) {
				throw new Error(`Failed to load project briefs (HTTP ${response.status})`);
			}

			const result = await response.json();
			if (!result.success) {
				throw new Error(result.error || 'Failed to load project briefs');
			}

			projectBriefs = result.data?.briefs || [];
			briefsLoaded = true;
		} catch (error) {
			console.error('Error loading briefs:', error);
			toastService.error('Failed to load briefs');
		} finally {
			loadingBriefs = false;
		}
	}

	// Modal handlers
	async function handleNewProject() {
		await loadNewProjectModal();
		showNewProjectModal = true;
	}

	async function handleBrainDump() {
		showNewProjectModal = false;
		const newProjectSelection = { id: 'new', name: 'New Project / Note', isProject: false };
		brainDumpV2Store.openModal({ project: newProjectSelection });
	}

	async function handleCreateEmptyProject() {
		if (creatingProject) return;

		creatingProject = true;
		showNewProjectModal = false;

		if (createProjectForm) {
			createProjectForm.requestSubmit();
		}
	}

	async function handleQuickForm() {
		await loadQuickProjectModal();
		showNewProjectModal = false;
		showQuickProjectModal = true;
	}

	function handleQuickProjectClose() {
		showQuickProjectModal = false;
		// Refresh projects after successful creation
		projectsLoaded = false;
		loadProjectsWithCacheBust();
	}

	function clearFilters() {
		filters.searchQuery = '';
		if (activeTab === 'projects') {
			filters.projectFilter = 'all';
		} else {
			filters.briefDateRange = 'all';
			filters.selectedProjectFilter = 'all';
		}
	}

	async function openBriefModal(brief: any) {
		await loadProjectBriefModal();
		selectedBrief = brief;
		showBriefModal = true;
	}

	// Daily brief modal handlers
	async function handleViewBrief(data: { briefId: string | null; briefDate: string }) {
		const { briefDate } = data;
		await loadDailyBriefModal();
		selectedBriefDate = briefDate;
		briefModalOpen = true;
		updateBriefUrl(briefDate);
	}

	function closeDailyBriefModal() {
		briefModalOpen = false;
		selectedBriefDate = null;
		updateBriefUrl(null);
	}

	function updateBriefUrl(briefDate: string | null) {
		if (!browser) return;

		const url = new URL(window.location.href);

		if (briefDate) {
			url.searchParams.set('briefDate', briefDate);
		} else {
			url.searchParams.delete('briefDate');
		}

		// Use goto() instead of pushState to trigger Svelte reactivity
		goto(url.pathname + url.search, { replaceState: false, noScroll: true, keepFocus: true });
	}

	function handleBrainDumpClose() {
		// Clear ALL cache layers
		if (typeof window !== 'undefined' && browser) {
			const projectService = ProjectService.getInstance();
			projectService.clearCache();
		}

		// Reset component state
		projectsLoaded = false;

		// Force fresh data with cache-busting
		loadProjectsWithCacheBust();
	}

	// Form enhancement
	const createProjectEnhancement = () => {
		return async ({ result }: { result: ActionResult }) => {
			creatingProject = false;

			if (result.type === 'redirect') {
				toastService.success('Project created successfully!');
				goto(result.location);
			} else if (result.type === 'failure') {
				const error = result.data?.error || 'Failed to create project';
				toastService.error(error);
				showNewProjectModal = true;
			}
		};
	};

	// Track path changes with $effect (Svelte 5 pattern)
	$effect(() => {
		if (!browser) return;

		const newPath = $page?.url?.pathname;
		if (newPath !== currentPath) {
			currentPath = newPath;
		}
	});

	// Lifecycle
	onMount(() => {
		if (!browser) return;

		// Check if we need to force refresh (e.g., after deletion)
		if ($page.url.searchParams.get('refresh') === 'true') {
			// Clear any cached state and force fresh load
			projectsLoaded = false;
			loadProjectsWithCacheBust();

			// Clean up the URL to remove the refresh param
			const cleanUrl = new URL(window.location.href);
			cleanUrl.searchParams.delete('refresh');
			window.history.replaceState({}, '', cleanUrl.toString());
		} else {
			// Load projects normally
			loadProjects();
		}

		// Handle browser back/forward buttons for brief modal
		async function handlePopState() {
			if (!browser) return;

			const urlParams = new URLSearchParams(window.location.search);
			const briefDateParam = urlParams.get('briefDate');

			if (briefDateParam && !briefModalOpen) {
				// Open modal when navigating forward to a URL with briefDate
				if (/^\d{4}-\d{2}-\d{2}$/.test(briefDateParam)) {
					await loadDailyBriefModal();
					selectedBriefDate = briefDateParam;
					briefModalOpen = true;
				}
			} else if (!briefDateParam && briefModalOpen) {
				// Close modal when navigating back to a URL without briefDate
				briefModalOpen = false;
				selectedBriefDate = null;
			}
		}

		window.addEventListener('popstate', handlePopState);

		return () => {
			window.removeEventListener('popstate', handlePopState);
		};
	});

	onDestroy(() => {
		if (!browser) return;

		// Cleanup to prevent memory retention
		projectBriefs = [];
		selectedBrief = null;
	});
</script>

<!-- Hidden form for project creation -->
<form
	bind:this={createProjectForm}
	method="POST"
	action="?/createProject"
	use:enhance={createProjectEnhancement}
	style="display: none;"
>
	<!-- Empty form - the action doesn't need any data -->
</form>

<svelte:head>
	<title>Projects - BuildOS | Organize Your Work & Personal Projects</title>
	<meta
		name="description"
		content="Organize and track your work and personal projects with BuildOS. View daily briefs, manage tasks, and build context for AI collaboration across all your projects."
	/>
	<meta
		name="keywords"
		content="project management, task organization, daily briefs, AI context building, productivity dashboard, project tracking"
	/>
	<link rel="canonical" href="https://build-os.com/projects" />

	<!-- Open Graph / Facebook -->
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://build-os.com/projects" />
	<meta
		property="og:title"
		content="Projects - BuildOS | Organize Your Work & Personal Projects"
	/>
	<meta
		property="og:description"
		content="Organize and track your work and personal projects with BuildOS. View daily briefs, manage tasks, and build context for AI collaboration."
	/>
	<meta property="og:image" content="https://build-os.com/brain-bolt.png" />

	<!-- Twitter -->
	<meta property="twitter:card" content="summary_large_image" />
	<meta property="twitter:url" content="https://build-os.com/projects" />
	<meta
		property="twitter:title"
		content="Projects - BuildOS | Organize Your Work & Personal Projects"
	/>
	<meta
		property="twitter:description"
		content="Organize and track your work and personal projects with BuildOS. View daily briefs and manage tasks efficiently."
	/>
	<meta property="twitter:image" content="https://build-os.com/brain-bolt.png" />

	<!-- Additional Meta Tags -->
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<meta name="robots" content="noindex, nofollow" />
	<meta name="author" content="DJ Wayne" />
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
	<div class="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 md:py-8">
		<!-- Page header - Apple-style refined -->
		<div class="mb-4 sm:mb-6">
			<!-- Header section with improved spacing -->
			<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-6">
				<div>
					<h1
						class="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-1 sm:mb-2 tracking-tight"
					>
						Projects
					</h1>
					<p class="text-sm sm:text-base text-gray-600 dark:text-gray-400">
						{#if projectsLoaded}
							{projects.length} active {projects.length === 1
								? 'project'
								: 'projects'}
						{:else}
							Loading projects...
						{/if}
					</p>
				</div>

				<!-- Button group for desktop and mobile -->
				<div class="flex gap-2 mt-4 sm:mt-0">
					<!-- Brain Dump Button -->

					<!-- New Project Button -->
					<Button
						on:click={handleNewProject}
						variant="outline"
						disabled={creatingProject}
						class="flex-1 sm:flex-initial"
						icon={Plus}
					>
						{creatingProject ? 'Creating...' : 'New Project'}
					</Button>
				</div>
			</div>

			<!-- Tab Navigation -->
			<TabNav
				{tabs}
				{activeTab}
				on:change={(e) => handleTabChange(e.detail)}
				ariaLabel="Project content tabs"
			/>
		</div>

		<!-- Search and Filter Controls - Always reserve space to prevent layout shift -->
		{#if activeTab == 'briefs'}
			<div class="filter-bar-container">
				{#if showFilterControls}
					<ProjectsFilterBar
						{showSearch}
						searchQuery={filters.searchQuery}
						{activeTab}
						projectFilter={filters.projectFilter}
						briefDateRange={filters.briefDateRange}
						selectedProjectFilter={filters.selectedProjectFilter}
						{filterCounts}
						{projects}
						{briefsLoaded}
						on:searchChange={(e) => handleSearchChange(e.detail)}
						on:projectFilterChange={(e) => (filters.projectFilter = e.detail)}
						on:briefDateRangeChange={(e) => (filters.briefDateRange = e.detail)}
						on:selectedProjectChange={(e) => (filters.selectedProjectFilter = e.detail)}
					/>
				{:else}
					<!-- Skeleton/placeholder to maintain height -->
					<div class="filter-bar-skeleton"></div>
				{/if}
			</div>
		{/if}

		<!-- Daily Brief Section (only for projects tab) -->
		{#if activeTab === 'projects' && filteredProjects?.length}
			<DailyBriefSection user={data.user} onViewBrief={handleViewBrief} />
		{/if}

		<!-- Tab Content with smooth transitions -->
		<div class="tab-content-container">
			{#if activeTab === 'projects'}
				<!-- Projects Tab Content -->
				<div class="content-transition">
					{#if loadingProjects && !projectsLoaded}
						<!-- Show skeleton while loading -->
						<div class="fade-in">
							<ProjectsGridSkeleton count={6} />
						</div>
					{:else if projectsError}
						<!-- Show error state -->
						<div class="text-center py-12 fade-in">
							<p class="text-red-500 dark:text-red-400 mb-4">{projectsError}</p>
							<Button on:click={loadProjectsWithCacheBust} variant="outline"
								>Retry</Button
							>
						</div>
					{:else if filteredProjects.length > 0}
						<div class="fade-in">
							<ProjectsGrid
								projects={filteredProjects}
								{projectBriefsMap}
								on:viewBrief={(e) => openBriefModal(e.detail)}
							/>
						</div>
					{:else}
						<div class="fade-in">
							<ProjectsEmptyState
								type="projects"
								hasFilters={hasActiveFilters}
								on:clearFilters={clearFilters}
								on:createProject={handleNewProject}
							/>
						</div>
					{/if}
				</div>
			{:else}
				<!-- Briefs Tab Content - Full briefs functionality -->
				<div class="content-transition fade-in">
					<DailyBriefsTab user={data.user} onViewBrief={handleViewBrief} />
				</div>
			{/if}
		</div>

		<!-- Project Stats Footer - Always show for projects tab to prevent layout shift -->
		{#if activeTab === 'projects'}
			{#if projectsLoaded && projects.length > 0}
				<div class="fade-in">
					<ProjectStats {filterCounts} totalProjects={projects.length} />
				</div>
			{:else if loadingProjects || (!projectsLoaded && !projectsError)}
				<ProjectStatsSkeleton />
			{/if}
		{/if}
	</div>
</div>

<!-- Modals - Lazy loaded -->
{#if NewProjectModal}
	<NewProjectModal
		isOpen={showNewProjectModal}
		{creatingProject}
		isFirstProject={projects.length === 0}
		on:close={() => (showNewProjectModal = false)}
		on:createEmpty={handleCreateEmptyProject}
		on:brainDump={handleBrainDump}
		on:quickForm={handleQuickForm}
	/>
{/if}

{#if ProjectBriefModal}
	<ProjectBriefModal
		brief={selectedBrief}
		isOpen={showBriefModal}
		on:close={() => {
			showBriefModal = false;
			selectedBrief = null;
		}}
	/>
{/if}

{#if DailyBriefModal}
	<DailyBriefModal
		isOpen={briefModalOpen}
		briefDate={selectedBriefDate}
		onClose={closeDailyBriefModal}
	/>
{/if}
{#if QuickProjectModal}
	<QuickProjectModal isOpen={showQuickProjectModal} on:close={handleQuickProjectClose} />
{/if}

<!-- Brain Dump Processing Notification moved to +layout.svelte for global persistence -->

<style>
	/* Filter bar container - prevent layout shift */
	.filter-bar-container {
		min-height: 60px; /* Reserve space for filter controls */
		transition: all 0.2s ease-out;
		display: flex;
		flex-direction: column;
		justify-content: center;
	}

	.filter-bar-skeleton {
		height: 52px; /* Matches typical filter bar height */
		background: transparent;
		border-radius: 0.5rem;
		animation: fade-in 0.3s ease-out;
	}

	/* Tab content transitions - Apple-style smooth animations */
	.tab-content-container {
		min-height: 400px; /* Reserve minimum space to prevent layout shift */
		transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94); /* Apple's easeOutQuad */
	}

	.content-transition {
		transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
	}

	/* Smooth fade-in animation for content */
	.fade-in {
		animation: smooth-fade-in 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
	}

	/* Enhanced fade-in with subtle upward motion (Apple-style) */
	@keyframes smooth-fade-in {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* Basic fade-in for simpler cases */
	@keyframes fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	/* Reduce motion for accessibility */
	@media (prefers-reduced-motion: reduce) {
		.fade-in,
		.content-transition,
		.tab-content-container,
		.filter-bar-container {
			animation: none;
			transition: none;
		}

		@keyframes smooth-fade-in {
			from {
				opacity: 0;
			}
			to {
				opacity: 1;
			}
		}
	}
</style>
