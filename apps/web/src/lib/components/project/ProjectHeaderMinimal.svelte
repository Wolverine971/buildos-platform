<!-- apps/web/src/lib/components/project/ProjectHeaderMinimal.svelte -->
<script lang="ts">
	import {
		Settings,
		FileText,
		ChevronDown,
		Calendar,
		Tag,
		BarChart3,
		ArrowLeft,
		MoreHorizontal,
		Trash2,
		GitBranch
	} from 'lucide-svelte';
	import { onMount } from 'svelte';
	import { renderMarkdown } from '$lib/utils/markdown';
	import { format } from 'date-fns/format';
	import type { Project } from '$lib/types/project';
	import Button from '$lib/components/ui/Button.svelte';
	import { slide, fade, scale } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { isFeatureEnabled } from '$lib/config/features';

	// Import the v2 store
	import { projectStoreV2 } from '$lib/stores/project.store';

	// Props - callbacks and configuration
	let {
		onEdit = undefined,
		onDelete = undefined,
		onViewHistory = undefined,
		onCalendarSettings = undefined,
		onConnectCalendar = undefined,
		defaultExpanded = false
	}: {
		onEdit?: ((project: Project) => void) | undefined;
		onDelete?: (() => void) | undefined;
		onViewHistory?: (() => void) | undefined;
		onCalendarSettings?: (() => void) | undefined;
		onConnectCalendar?: (() => void) | undefined;
		defaultExpanded?: boolean;
	} = $props();

	// State management - default to collapsed
	let isExpanded = $state(false);
	let contentHeight = $state(0);
	let showMobileMenu = $state(false);
	let showDesktopMenu = $state(false);
	let contentElement: HTMLDivElement | undefined;
	let headerElement: HTMLDivElement | undefined;

	// Load user preference
	onMount(() => {
		// Always start collapsed, ignore saved preference
		isExpanded = false;

		// Measure content height for smooth animation
		if (contentElement) {
			const resizeObserver = new ResizeObserver(() => {
				contentHeight = contentElement?.scrollHeight || 0;
			});
			resizeObserver.observe(contentElement);

			return () => resizeObserver.disconnect();
		}
	});

	// Direct reactive access to store
	let storeState = $derived($projectStoreV2);
	let project = $derived(storeState?.project);
	let projectCalendar = $derived(storeState?.projectCalendar);
	let calendarStatus = $derived(storeState?.calendarStatus);
	let phases = $derived(storeState?.phases || []);
	let tasks = $derived(storeState?.tasks || []);
	let currentTaskStats = $derived(
		storeState?.stats || {
			total: 0,
			completed: 0,
			active: 0,
			inProgress: 0,
			blocked: 0
		}
	);

	// Computed values
	let completionRate = $derived(
		currentTaskStats && currentTaskStats.total > 0
			? Math.round((currentTaskStats.completed / currentTaskStats.total) * 100)
			: 0
	);

	let hasPhases = $derived(phases.length > 0);
	let isCalendarConnected = $derived(calendarStatus?.isConnected === true);
	let showCalendarSettings = $derived(
		onCalendarSettings &&
			project &&
			isCalendarConnected &&
			isFeatureEnabled('projectCalendars', project?.user_id)
	);
	let hasProjectCalendar = $derived(!!projectCalendar);
	let showConnectButton = $derived(!isCalendarConnected && !!onConnectCalendar);
	let showCustomizeButton = $derived(showCalendarSettings && !hasProjectCalendar);

	// Functions
	function toggleExpanded(event?: MouseEvent) {
		// Prevent expansion if clicking on action buttons
		if (event) {
			const target = event.target as HTMLElement;
			// Check if the click is on a button or within the action-buttons area
			if (
				target.closest('.action-buttons') ||
				target.closest('button:not(.header-clickable)')
			) {
				return;
			}
		}
		isExpanded = !isExpanded;
		localStorage.setItem('projectHeaderExpanded', String(isExpanded));
	}

	function handleEditContext() {
		if (onEdit && project) {
			onEdit(project);
		}
	}

	function handleDelete() {
		if (onDelete) {
			onDelete();
		}
	}

	function handleViewHistory() {
		if (onViewHistory) {
			onViewHistory();
		}
	}

	function handleCalendarSettings() {
		if (onCalendarSettings) {
			onCalendarSettings();
		}
	}

	function handleConnectCalendar() {
		if (onConnectCalendar) {
			onConnectCalendar();
		}
	}

	function toggleDesktopMenu() {
		showDesktopMenu = !showDesktopMenu;
	}

	function closeDesktopMenu() {
		showDesktopMenu = false;
	}

	function toggleMobileMenu() {
		showMobileMenu = !showMobileMenu;
	}

	function closeMobileMenu() {
		showMobileMenu = false;
	}

	function formatDateShort(dateStr: string): string {
		if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
			return format(new Date(dateStr + 'T12:00:00'), 'MMM d, yyyy');
		}
		return format(new Date(dateStr), 'MMM d, yyyy');
	}

	function getStatusColor(status: string): string {
		switch (status) {
			case 'active':
				return 'bg-green-500';
			case 'paused':
				return 'bg-yellow-500';
			case 'completed':
				return 'bg-blue-500';
			default:
				return 'bg-gray-500';
		}
	}

	function getStatusLabel(status: string): string {
		return status.charAt(0).toUpperCase() + status.slice(1);
	}

	// Click outside handler
	$effect(() => {
		if (typeof window === 'undefined') return;

		function handleClickOutside(event: MouseEvent) {
			const target = event.target as Node;

			// Close desktop menu if clicking outside
			if (showDesktopMenu && headerElement && !headerElement.contains(target)) {
				closeDesktopMenu();
			}

			// Close mobile menu if clicking outside
			if (showMobileMenu && headerElement && !headerElement.contains(target)) {
				closeMobileMenu();
			}
		}

		window.addEventListener('click', handleClickOutside);
		return () => window.removeEventListener('click', handleClickOutside);
	});

	// Lazy load timeline components only when expanded
	let TimelineVisualization: any = null;

	$effect(() => {
		if (isExpanded && !TimelineVisualization) {
			// We'll implement this as a separate component later
			// For now, we'll use a simplified version
		}
	});
</script>

{#if project}
	<!-- Back button - outside of the collapsible header -->
	<nav aria-label="Project navigation" class="mb-4">
		<a
			href="/projects"
			class="inline-flex items-center text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors group"
			aria-label="Return to projects list"
		>
			<ArrowLeft
				class="w-4 h-4 mr-1 group-hover:-translate-x-0.5 transition-transform"
				aria-hidden="true"
			/>
			Back to Projects
		</a>
	</nav>

	<!-- Minimalist Project Header -->
	<header
		bind:this={headerElement}
		class="project-header-minimal {isExpanded ? 'expanded' : 'collapsed'}"
		aria-labelledby="project-title"
	>
		<!-- Always Visible Header Bar (clickable to expand) -->
		<button
			class="header-bar header-clickable"
			on:click={toggleExpanded}
			aria-expanded={isExpanded}
			aria-controls="header-content"
			aria-label="{isExpanded ? 'Collapse' : 'Expand'} project details"
		>
			<!-- Left side: Project title -->
			<h1
				id="project-title"
				class="project-title"
				data-project-name
				style="--project-name: project-name-{project?.id};"
			>
				{project?.name}
			</h1>

			<!-- Right side: Action buttons (always interactive) -->
			<div class="action-buttons" on:click|stopPropagation>
				<!-- Desktop buttons -->
				<div class="hidden sm:flex items-center gap-2">
					{#if onEdit}
						<Button
							on:click={handleEditContext}
							variant="outline"
							size="sm"
							class="min-h-0 p-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
							aria-label="Edit project context"
							title="Edit Context"
						>
							Context
							<FileText class="w-4 h-4" aria-hidden="true" />
						</Button>
					{/if}

					<!-- More menu -->
					<div class="relative">
						<Button
							on:click={toggleDesktopMenu}
							variant="ghost"
							size="sm"
							style="postion: relative;"
							class="min-h-0 p-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
							aria-label="Project settings"
							aria-expanded={showDesktopMenu}
							aria-haspopup="true"
						>
							<Settings class="w-4 h-4" aria-hidden="true" />
						</Button>

						{#if showDesktopMenu}
							<div
								transition:scale={{ duration: 150, start: 0.95 }}
								class="absolute right-0 top-[calc(100%+0.5rem)] min-w-[12rem] bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1"
								style="z-index: 9999;"
								role="menu"
							>
								{#if showConnectButton}
									<button
										on:click={() => {
											handleConnectCalendar();
											closeDesktopMenu();
										}}
										class="w-full flex items-center px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
										role="menuitem"
									>
										<Calendar class="w-4 h-4 mr-3" />
										Connect Calendar
									</button>
								{:else if showCalendarSettings}
									<button
										on:click={() => {
											handleCalendarSettings();
											closeDesktopMenu();
										}}
										class="w-full flex items-center px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
										role="menuitem"
									>
										<Calendar class="w-4 h-4 mr-3" />
										{hasProjectCalendar
											? 'Calendar Settings'
											: 'Customize Calendar'}
									</button>
								{/if}

								{#if onViewHistory}
									<button
										on:click={() => {
											handleViewHistory();
											closeDesktopMenu();
										}}
										class="w-full flex items-center px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
										role="menuitem"
									>
										<GitBranch class="w-4 h-4 mr-3" />
										View History
									</button>
								{/if}

								{#if onDelete}
									<div
										class="border-t border-gray-200 dark:border-gray-700 my-1"
									></div>
									<button
										on:click={() => {
											handleDelete();
											closeDesktopMenu();
										}}
										class="w-full flex items-center px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-left"
										role="menuitem"
									>
										<Trash2 class="w-4 h-4 mr-3" />
										Delete Project
									</button>
								{/if}
							</div>
						{/if}
					</div>
				</div>

				<!-- Mobile buttons -->
				<div class="sm:hidden flex items-center gap-2">
					{#if onEdit}
						<Button
							on:click={handleEditContext}
							variant="ghost"
							size="sm"
							class="min-h-0 p-2 text-gray-600 dark:text-gray-300"
							aria-label="Edit project context"
						>
							<FileText class="w-4 h-4" />
						</Button>
					{/if}

					<Button
						on:click={toggleMobileMenu}
						variant="ghost"
						size="sm"
						class="min-h-0 p-2 text-gray-600 dark:text-gray-300"
						aria-label="Project settings"
					>
						<MoreHorizontal class="w-4 h-4" />
					</Button>

					{#if showMobileMenu}
						<div
							transition:slide={{ duration: 200 }}
							class="absolute right-2 top-[calc(100%+0.5rem)] min-w-[12rem] bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1"
							style="z-index: 9999;"
							role="menu"
						>
							{#if showConnectButton || showCalendarSettings}
								<button
									on:click={() => {
										showConnectButton
											? handleConnectCalendar()
											: handleCalendarSettings();
										closeMobileMenu();
									}}
									class="w-full flex items-center px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
									role="menuitem"
								>
									<Calendar class="w-4 h-4 mr-3" />
									{showConnectButton
										? 'Connect Calendar'
										: hasProjectCalendar
											? 'Calendar'
											: 'Customize'}
								</button>
							{/if}

							{#if onViewHistory}
								<button
									on:click={() => {
										handleViewHistory();
										closeMobileMenu();
									}}
									class="w-full flex items-center px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
									role="menuitem"
								>
									<GitBranch class="w-4 h-4 mr-3" />
									View History
								</button>
							{/if}

							{#if onDelete}
								<div
									class="border-t border-gray-200 dark:border-gray-700 my-1"
								></div>
								<button
									on:click={() => {
										handleDelete();
										closeMobileMenu();
									}}
									class="w-full flex items-center px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-left"
									role="menuitem"
								>
									<Trash2 class="w-4 h-4 mr-3" />
									Delete Project
								</button>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		</button>

		<!-- Subtle dropdown indicator bar -->
		<div class="dropdown-bar" on:click={toggleExpanded}>
			<div class="dropdown-indicator">
				<ChevronDown
					class="dropdown-arrow {isExpanded ? 'rotate-180' : ''}"
					aria-hidden="true"
				/>
			</div>
		</div>

		<!-- Expandable Content -->
		{#if isExpanded}
			<div
				bind:this={contentElement}
				id="header-content"
				class="expandable-content"
				transition:slide={{ duration: 350, easing: cubicOut }}
			>
				<!-- Description -->
				{#if project?.description}
					<div
						class="prose prose-sm prose-gray dark:prose-invert max-w-none mb-4"
						in:fade={{ duration: 200, delay: 100 }}
					>
						{@html renderMarkdown(project.description)}
					</div>
				{/if}

				<!-- Key Metrics Grid -->
				<div
					class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4"
					in:fade={{ duration: 200, delay: 150 }}
				>
					<!-- Status -->
					{#if project?.status}
						<div class="metric-card">
							<div class="metric-label">Status</div>
							<div class="flex items-center gap-2">
								<div
									class="w-2 h-2 rounded-full {getStatusColor(project.status)}"
								></div>
								<span class="metric-value">{getStatusLabel(project.status)}</span>
							</div>
						</div>
					{/if}

					<!-- Progress -->
					{#if currentTaskStats.total > 0}
						<div class="metric-card">
							<div class="metric-label">Progress</div>
							<div class="flex items-baseline gap-1">
								<span class="metric-value">{completionRate}%</span>
								<span class="text-xs text-gray-500 dark:text-gray-400"
									>complete</span
								>
							</div>
						</div>
					{/if}

					<!-- Due Date -->
					{#if project?.end_date}
						{@const daysRemaining = Math.ceil(
							(new Date(project.end_date).getTime() - new Date().getTime()) /
								(1000 * 60 * 60 * 24)
						)}
						<div class="metric-card">
							<div class="metric-label">Due</div>
							<div class="metric-value">
								{#if daysRemaining > 0}
									{daysRemaining}d
									<span
										class="text-xs font-normal text-gray-500 dark:text-gray-400"
										>left</span
									>
								{:else if daysRemaining === 0}
									Today
								{:else}
									<span class="text-red-600 dark:text-red-400"
										>{Math.abs(daysRemaining)}d over</span
									>
								{/if}
							</div>
						</div>
					{/if}

					<!-- Active Tasks -->
					{#if currentTaskStats.active > 0 || currentTaskStats.inProgress > 0}
						<div class="metric-card">
							<div class="metric-label">Active</div>
							<div class="metric-value">
								{currentTaskStats.active + currentTaskStats.inProgress}
								<span class="text-xs font-normal text-gray-500 dark:text-gray-400"
									>tasks</span
								>
							</div>
						</div>
					{/if}
				</div>

				<!-- Tags -->
				{#if project?.tags?.length}
					<div
						class="flex items-start gap-2 mb-4"
						in:fade={{ duration: 200, delay: 200 }}
					>
						<Tag class="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
						<div class="flex flex-wrap gap-1">
							{#each project.tags as tag}
								<span class="tag-item">{tag}</span>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Progress Bar -->
				{#if currentTaskStats.total > 0}
					<div class="progress-section" in:fade={{ duration: 200, delay: 250 }}>
						<div class="flex items-center justify-between mb-2">
							<span class="text-xs font-medium text-gray-600 dark:text-gray-400">
								Overall Progress
							</span>
							<span class="text-xs font-medium text-gray-900 dark:text-white">
								{currentTaskStats.completed} / {currentTaskStats.total} tasks
							</span>
						</div>
						<div class="progress-bar-container">
							<div class="progress-bar-fill" style="width: {completionRate}%"></div>
						</div>
					</div>
				{/if}

				<!-- Timeline Visualization (Lazy Loaded) -->
				<!-- Show timeline when expanded AND there are tasks, regardless of phases -->
				{#if tasks.length > 0}
					<div class="timeline-section" in:fade={{ duration: 200, delay: 300 }}>
						{#await import('./ProjectTimelineCompact.svelte') then { default: TimelineComponent }}
							<TimelineComponent {phases} {tasks} {project} />
						{:catch}
							<div class="timeline-placeholder">
								<div class="text-xs text-gray-400">Failed to load timeline</div>
							</div>
						{/await}
					</div>
				{/if}
			</div>
		{/if}
	</header>
{:else}
	<!-- Loading skeleton -->
	<div class="project-header-minimal collapsed">
		<div class="header-bar">
			<div class="expand-trigger">
				<div class="h-6 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
			</div>
			<div class="action-buttons">
				<div class="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
				<div class="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
			</div>
		</div>
	</div>
{/if}

<style>
	.project-header-minimal {
		--timing-function: cubic-bezier(0.25, 0.46, 0.45, 0.94);
		--transition-duration: 350ms;

		position: relative;
		background: rgba(255, 255, 255, 0.85);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);

		border: 1px solid rgba(0, 0, 0, 0.1);
		border-radius: 12px;

		transition: all var(--transition-duration) var(--timing-function);
		overflow: visible; /* Allow dropdowns to show outside container */

		margin-bottom: 1.5rem;
		border-left: none;

		/* remove rounding on the left corners */
		border-top-left-radius: 0;
		border-bottom-left-radius: 0;
	}

	/* Only hide overflow for the expandable content */
	.project-header-minimal.collapsed .expandable-content {
		overflow: hidden;
		max-height: 0;
		opacity: 0;
		transition: all var(--transition-duration) var(--timing-function);
	}

	.project-header-minimal.expanded .expandable-content {
		overflow: visible;
		max-height: 2000px; /* Large enough for content */
		opacity: 1;
	}

	.project-header-minimal.expanded {
		box-shadow:
			0 4px 6px rgba(0, 0, 0, 0.05),
			0 10px 40px rgba(0, 0, 0, 0.1);
	}

	.project-header-minimal.collapsed {
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
	}

	/* Subtle visual feedback on hover for expandable state */
	.project-header-minimal.collapsed:hover {
		box-shadow:
			0 1px 3px rgba(0, 0, 0, 0.06),
			0 2px 8px rgba(0, 0, 0, 0.04);
		background: rgba(255, 255, 255, 0.95);
	}

	:global(.dark) .project-header-minimal.collapsed:hover {
		background: rgba(17, 24, 39, 0.95);
	}

	:global(.dark) .project-header-minimal {
		background: rgba(17, 24, 39, 0.85);
		border-color: rgba(255, 255, 255, 0.1);
	}

	.header-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 12px;
		min-height: 44px;
		gap: 12px;
		width: 100%;
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		color: inherit;
		position: relative;
	}

	.project-title {
		font-size: 1.75rem;
		font-weight: 600;
		color: rgb(17 24 39);
		margin: 0;
		line-height: 1.2;
		flex: 1;
	}

	:global(.dark) .project-title {
		color: rgb(255 255 255);
	}

	/* Subtle dropdown bar positioned at bottom */
	.dropdown-bar {
		position: absolute;
		bottom: 0;
		left: 50%;
		transform: translateX(-50%);
		width: 100%;
		height: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: opacity 0.2s ease;
		opacity: 0.3;
		/* pointer-events: none; */
		cursor: pointer;
	}

	/* Show more prominently on header hover */
	.project-header-minimal.collapsed:hover .dropdown-bar {
		opacity: 0.7;
	}

	.project-header-minimal.expanded .dropdown-bar {
		opacity: 0.5;
	}

	.dropdown-indicator {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1px 12px;
		border-radius: 2px;
		width: 100%;
		transition: all 0.2s ease;

		/* subtle gradient bottom → top */
		background: linear-gradient(to top, rgba(0, 0, 0, 0.15), transparent);
	}

	.dropdown-indicator:hover {
		/* slightly darker on hover */
		background: linear-gradient(to top, rgba(0, 0, 0, 0.25), transparent);
	}

	/* Dark mode base */
	:global(.dark) .dropdown-indicator {
		background: linear-gradient(to top, rgba(255, 255, 255, 0.12), transparent);
	}

	:global(.dark) .dropdown-indicator:hover {
		background: linear-gradient(to top, rgba(255, 255, 255, 0.2), transparent);
	}

	/* Collapsed state still enlarges padding */
	.project-header-minimal.collapsed:hover .dropdown-indicator {
		padding: 1px 16px;
	}

	.dropdown-arrow {
		width: 10px;
		height: 10px;
		color: rgb(107 114 128);
		transition: transform 0.3s var(--timing-function);
		opacity: 0.8;
	}

	:global(.dark) .dropdown-arrow {
		color: rgb(156 163 175);
	}

	.dropdown-arrow.rotate-180 {
		transform: rotate(180deg);
	}

	.action-buttons {
		display: flex;
		align-items: center;
		gap: 4px;
		position: relative;
		z-index: 100;
	}

	/* Reset cursor for action buttons */
	.action-buttons button {
		cursor: pointer;
	}

	.expandable-content {
		padding: 0 12px 12px;
		border-top: 1px solid rgba(0, 0, 0, 0.05);
		/* position: relative; */
	}

	:global(.dark) .expandable-content {
		border-top-color: rgba(255, 255, 255, 0.05);
	}

	.metric-card {
		background: rgba(249, 250, 251, 0.5);
		border: 1px solid rgba(229, 231, 235, 0.5);
		border-radius: 8px;
		padding: 8px 12px;
	}

	:global(.dark) .metric-card {
		background: rgba(31, 41, 55, 0.5);
		border-color: rgba(75, 85, 99, 0.5);
	}

	.metric-label {
		font-size: 0.625rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: rgb(107 114 128);
		margin-bottom: 2px;
	}

	:global(.dark) .metric-label {
		color: rgb(156 163 175);
	}

	.metric-value {
		font-size: 0.875rem;
		font-weight: 600;
		color: rgb(17 24 39);
	}

	:global(.dark) .metric-value {
		color: rgb(255 255 255);
	}

	.tag-item {
		padding: 2px 8px;
		background: rgba(229, 231, 235, 0.5);
		color: rgb(55 65 81);
		border-radius: 6px;
		font-size: 0.75rem;
		font-weight: 500;
	}

	:global(.dark) .tag-item {
		background: rgba(55, 65, 81, 0.5);
		color: rgb(209 213 219);
	}

	.progress-section {
		margin-top: 1rem;
	}

	.progress-bar-container {
		width: 100%;
		height: 6px;
		background: rgba(229, 231, 235, 0.5);
		border-radius: 3px;
		overflow: hidden;
	}

	:global(.dark) .progress-bar-container {
		background: rgba(55, 65, 81, 0.5);
	}

	.progress-bar-fill {
		height: 100%;
		background: linear-gradient(90deg, rgb(59, 130, 246), rgb(147, 51, 234));
		border-radius: 3px;
		transition: width 0.5s var(--timing-function);
	}

	.timeline-section {
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid rgba(0, 0, 0, 0.05);
	}

	:global(.dark) .timeline-section {
		border-top-color: rgba(255, 255, 255, 0.05);
	}

	.timeline-placeholder {
		background: rgba(249, 250, 251, 0.5);
		border: 1px dashed rgba(229, 231, 235, 0.5);
		border-radius: 8px;
		padding: 24px;
		text-align: center;
	}

	:global(.dark) .timeline-placeholder {
		background: rgba(31, 41, 55, 0.5);
		border-color: rgba(75, 85, 99, 0.5);
	}

	/* Mobile optimizations */
	@media (max-width: 640px) {
		.project-header-minimal {
			border-radius: 0;
			border-left: none;
			border-right: none;
			margin-left: -1rem;
			margin-right: -1rem;
		}

		.header-bar {
			padding: 8px 16px;
		}

		.expandable-content {
			padding: 0 16px 12px;
		}

		.project-title {
			font-size: 1rem;
		}
	}

	/* Reduced motion support */
	@media (prefers-reduced-motion: reduce) {
		.project-header-minimal,
		.expand-trigger,
		.expand-icon,
		.progress-bar-fill {
			transition: none;
		}
	}
</style>
