<!-- apps/web/src/lib/components/chat/ContextSelectionScreen.svelte -->
<!--
  Context Selection Screen - Pre-chat context selector

  Allows users to choose their chat context before starting a conversation.
  Supports 3-tier selection for project-based contexts.
-->

<script lang="ts">
	import { onDestroy } from 'svelte';
	import { browser, dev } from '$app/environment';
	import {
		MessagesSquare,
		FolderPlus,
		FolderOpen,
		ChevronRight,
		LoaderCircle,
		Search,
		X
	} from 'lucide-svelte';
	import type { ChatContextType } from '@buildos/shared-types';
	import {
		DEFAULT_PROJECT_SELECTOR_LIMIT,
		MAX_PROJECT_SELECTOR_LIMIT,
		PROJECT_SELECTOR_SEARCH_DEBOUNCE_MS,
		fetchProjectSelectionSummaries,
		normalizeProjectSelectionSearch,
		type ProjectSelectionSummary
	} from './project-selector-browser';

	export interface ContextSelection {
		contextType: ChatContextType | 'agent_to_agent';
		entityId?: string;
		label?: string;
	}

	interface Props {
		inModal?: boolean;
		onNavigationChange?: (view: 'primary' | 'project-selection') => void;
		onSelect?: (selection: ContextSelection) => void;
	}

	// Props - Svelte 5 callback pattern
	let { inModal = true, onNavigationChange, onSelect }: Props = $props();

	// State
	let selectedView: 'primary' | 'project-selection' = $state('primary');
	let projects = $state<ProjectSelectionSummary[]>([]);
	let isLoadingProjects = $state(false);
	let projectsError = $state<string | null>(null);
	let hasLoadedProjects = $state(false);
	let projectSearchTerm = $state('');
	let projectListController: AbortController | null = null;
	let lastProjectQuery = $state('');
	let lastProjectLimit = $state(0);
	let projectListRequestId = 0;

	const INACTIVE_PROJECT_STATE_KEYS = new Set(['archived', 'completed', 'retired', 'closed']);
	const PROJECT_LIST_LIMIT = DEFAULT_PROJECT_SELECTOR_LIMIT;
	const PROJECT_SEARCH_LIMIT = MAX_PROJECT_SELECTOR_LIMIT;
	const normalizedProjectSearch = $derived(normalizeProjectSelectionSearch(projectSearchTerm));
	const isProjectSearchActive = $derived(normalizedProjectSearch.length > 0);

	async function loadProjects(
		options: { force?: boolean; search?: string; limit?: number } = {}
	) {
		const { force = false } = options;
		const search = normalizeProjectSelectionSearch(options.search ?? projectSearchTerm);
		const limit = options.limit ?? (search ? PROJECT_SEARCH_LIMIT : PROJECT_LIST_LIMIT);
		if (
			!force &&
			hasLoadedProjects &&
			search === lastProjectQuery &&
			limit === lastProjectLimit &&
			(projects.length > 0 || !projectsError)
		) {
			return;
		}

		projectListRequestId += 1;
		const requestId = projectListRequestId;
		if (projectListController) {
			projectListController.abort();
		}
		projectListController = new AbortController();

		isLoadingProjects = true;
		projectsError = null;

		try {
			const fetchedProjects = await fetchProjectSelectionSummaries({
				search,
				limit,
				signal: projectListController.signal
			});

			if (requestId !== projectListRequestId) {
				return;
			}

			projects = fetchedProjects;
			hasLoadedProjects = true;
			lastProjectQuery = search;
			lastProjectLimit = limit;
		} catch (err) {
			if ((err as Error)?.name === 'AbortError' || requestId !== projectListRequestId) {
				return;
			}
			console.error('Failed to load ontology projects:', err);
			projectsError = 'Failed to load ontology projects';
			hasLoadedProjects = true;
		} finally {
			if (requestId === projectListRequestId) {
				isLoadingProjects = false;
				projectListController = null;
			}
		}
	}

	$effect(() => {
		if (!browser) return;
		if (selectedView !== 'project-selection') return;
		const timeoutId = setTimeout(
			() => void loadProjects({ search: projectSearchTerm }),
			normalizedProjectSearch ? PROJECT_SELECTOR_SEARCH_DEBOUNCE_MS : 0
		);
		return () => clearTimeout(timeoutId);
	});

	// Notify parent of navigation changes for header back button
	$effect(() => {
		onNavigationChange?.(selectedView);
	});

	onDestroy(() => {
		if (projectListController) {
			projectListController.abort();
			projectListController = null;
		}
	});

	// Primary actions - Svelte 5 callback pattern
	function selectGlobal() {
		onSelect?.({ contextType: 'global', label: 'General chat' });
	}

	function selectAgentToAgent() {
		onSelect?.({ contextType: 'agent_to_agent', label: 'Agent handoff' });
	}

	function selectProjectCreate() {
		onSelect?.({ contextType: 'project_create', label: 'Project setup' });
	}

	function goToProjectSelection() {
		selectedView = 'project-selection';
	}

	// Project selection - Svelte 5 callback pattern
	function selectProject(project: ProjectSelectionSummary) {
		onSelect?.({
			contextType: 'project',
			entityId: project.id,
			label: project.name
		});
	}

	function backToPrimary() {
		const shouldRestoreDefaultProjects = lastProjectQuery !== '';
		projectSearchTerm = '';
		selectedView = 'primary';
		if (shouldRestoreDefaultProjects) {
			void loadProjects({ force: true, search: '', limit: PROJECT_LIST_LIMIT });
		}
	}

	// Public function for parent to trigger back navigation
	export function handleBackNavigation() {
		if (selectedView === 'project-selection') {
			backToPrimary();
		}
	}

	function formatKeyLabel(value?: string | null) {
		if (!value) return '';
		return value
			.split(/[._]/)
			.filter(Boolean)
			.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
			.join(' ');
	}

	function getFacetSummary(project: ProjectSelectionSummary) {
		return [project.facetContext, project.facetScale, project.facetStage]
			.filter(Boolean)
			.map((value) => formatKeyLabel(value))
			.join(' • ');
	}

	const activeProjects = $derived(
		projects.filter((project) => {
			const state = project.stateKey?.toLowerCase();
			return !state || !INACTIVE_PROJECT_STATE_KEYS.has(state);
		})
	);
	const hasProjects = $derived(projects.length > 0);
	const isNewUser = $derived(
		hasLoadedProjects && lastProjectQuery === '' && !hasProjects && !projectsError
	);
	const optionCardBaseClasses =
		'group flex flex-col rounded-lg border border-border bg-card p-3 text-left shadow-ink pressable transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:p-4';
	const primaryChatCardClasses = `${optionCardBaseClasses} tx tx-frame tx-weak hover:border-accent/40`;
	const projectChatCardClasses = `${optionCardBaseClasses} tx tx-thread tx-weak hover:border-accent/40`;
	const setupCardClasses = `${optionCardBaseClasses} tx tx-strip tx-weak hover:border-accent/30`;
	const projectListItemClasses =
		'group flex flex-col rounded-lg border border-border bg-card p-3 text-left shadow-ink tx tx-frame tx-weak pressable transition-colors duration-150 hover:border-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:p-3';
	const optionIconClasses =
		'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-foreground shadow-ink-inner sm:h-10 sm:w-10';
</script>

<div class="flex h-full min-h-0 flex-col overflow-hidden bg-background">
	<!-- PRIMARY SELECTION VIEW -->
	{#if selectedView === 'primary'}
		<div class="mx-auto w-full max-w-5xl flex-1 min-h-0 overflow-y-auto px-3 py-3 sm:p-5">
			<!-- Header - compact on mobile -->
			<div class="mb-4 text-center sm:mb-6">
				{#if isNewUser}
					<h2
						class="mb-1 text-lg font-semibold tracking-tight text-foreground sm:text-2xl sm:mb-1.5"
					>
						Start with your first project
					</h2>
					<p class="text-xs text-muted-foreground sm:text-sm">
						Set up the project once, then return here for focused project chat and
						workspace-wide help.
					</p>
				{:else}
					<h2
						class="mb-1 text-lg font-semibold tracking-tight text-foreground sm:text-2xl sm:mb-1.5"
					>
						Choose a working context
					</h2>
					<p class="text-xs text-muted-foreground sm:text-sm">
						Start in general chat, work inside a project, or create a new project.
					</p>
				{/if}
			</div>

			{#if isNewUser}
				<!-- NEW USER: No projects yet — guide to first project creation -->
				<div class="flex flex-col items-center gap-4 sm:gap-5">
					<!-- Primary CTA: Create first project -->
					<button
						onclick={selectProjectCreate}
						class={`${setupCardClasses} w-full max-w-xl`}
					>
						<div class="flex items-start gap-3">
							<div class={optionIconClasses}>
								<FolderPlus class="h-5 w-5" />
							</div>
							<div class="min-w-0 flex-1">
								<p class="micro-label mb-1">SETUP</p>
								<h3 class="text-base font-semibold text-foreground">
									Start your first project
								</h3>
								<p
									class="mt-1 text-xs leading-snug text-muted-foreground sm:text-sm"
								>
									Define the objective, create the project shell, and give the
									assistant something stable to work with.
								</p>
							</div>
							<ChevronRight class="h-4 w-4 shrink-0 text-muted-foreground" />
						</div>
					</button>

					<div
						class="w-full max-w-xl rounded-lg border border-border bg-card p-3 shadow-ink tx tx-frame tx-weak"
					>
						<p class="micro-label mb-2">AVAILABLE AFTER SETUP</p>
						<div class="grid gap-2 sm:grid-cols-2">
							<div
								class="flex items-center gap-2.5 rounded-lg border border-border bg-background p-2.5 text-muted-foreground"
							>
								<div
									class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted"
								>
									<MessagesSquare class="h-3.5 w-3.5" />
								</div>
								<div>
									<p class="text-sm font-medium text-foreground">General chat</p>
									<p class="text-[11px] leading-snug">
										Workspace-wide questions and planning.
									</p>
								</div>
							</div>
							<div
								class="flex items-center gap-2.5 rounded-lg border border-border bg-background p-2.5 text-muted-foreground"
							>
								<div
									class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted"
								>
									<FolderOpen class="h-3.5 w-3.5" />
								</div>
								<div>
									<p class="text-sm font-medium text-foreground">Project chat</p>
									<p class="text-[11px] leading-snug">
										Focused work inside a single project.
									</p>
								</div>
							</div>
						</div>
					</div>
				</div>
			{:else}
				<div class="space-y-4">
					<div class="space-y-2">
						<div class="flex items-center justify-between gap-3">
							<p class="micro-label">PRIMARY</p>
							<p class="text-xs text-muted-foreground">Start in chat</p>
						</div>
						<div class="grid gap-2 sm:grid-cols-2 sm:gap-3">
							<button onclick={selectGlobal} class={primaryChatCardClasses}>
								<div class="flex items-start gap-3">
									<div class={optionIconClasses}>
										<MessagesSquare class="h-4 w-4 sm:h-5 sm:w-5" />
									</div>
									<div class="min-w-0 flex-1">
										<p class="micro-label mb-1">GENERAL CHAT</p>
										<h3
											class="text-sm font-semibold text-foreground sm:text-base"
										>
											Open-ended chat
										</h3>
										<p
											class="mt-1 text-xs leading-snug text-muted-foreground sm:text-sm"
										>
											Work across your workspace when you do not need to start
											inside one project.
										</p>
									</div>
									<ChevronRight class="h-4 w-4 shrink-0 text-muted-foreground" />
								</div>
								<div
									class="mt-3 border-t border-border pt-2 text-xs text-muted-foreground"
								>
									Best for questions, planning, and cross-project context.
								</div>
							</button>

							<button onclick={goToProjectSelection} class={projectChatCardClasses}>
								<div class="flex items-start gap-3">
									<div class={optionIconClasses}>
										<FolderOpen class="h-4 w-4 sm:h-5 sm:w-5" />
									</div>
									<div class="min-w-0 flex-1">
										<p class="micro-label mb-1">PROJECT CHAT</p>
										<h3
											class="text-sm font-semibold text-foreground sm:text-base"
										>
											Work inside a project
										</h3>
										<p
											class="mt-1 text-xs leading-snug text-muted-foreground sm:text-sm"
										>
											Choose a project and get focused help with planning,
											reviewing, and next steps.
										</p>
									</div>
									<ChevronRight class="h-4 w-4 shrink-0 text-muted-foreground" />
								</div>
								<div
									class="mt-3 border-t border-border pt-2 text-xs text-muted-foreground"
								>
									{#if hasLoadedProjects && hasProjects}
										{activeProjects.length} active project{activeProjects.length !==
										1
											? 's'
											: ''} ready
									{:else}
										Browse your current project list
									{/if}
								</div>
							</button>
						</div>
					</div>

					<div class="space-y-2">
						<div class="flex items-center justify-between gap-3">
							<p class="micro-label">SECONDARY</p>
							<p class="text-xs text-muted-foreground">Project setup</p>
						</div>
						<div
							class={`grid gap-2 sm:gap-3 ${dev ? 'sm:grid-cols-2' : 'sm:grid-cols-1'}`}
						>
							<button onclick={selectProjectCreate} class={setupCardClasses}>
								<div class="flex items-start gap-3">
									<div class={optionIconClasses}>
										<FolderPlus class="h-4 w-4 sm:h-5 sm:w-5" />
									</div>
									<div class="min-w-0 flex-1">
										<p class="micro-label mb-1">PROJECT SETUP</p>
										<h3
											class="text-sm font-semibold text-foreground sm:text-base"
										>
											Start a project
										</h3>
										<p
											class="mt-1 text-xs leading-snug text-muted-foreground sm:text-sm"
										>
											Create structure first, then move into focused work.
										</p>
									</div>
									<ChevronRight class="h-4 w-4 shrink-0 text-muted-foreground" />
								</div>
							</button>

							{#if dev}
								<button onclick={selectAgentToAgent} class={setupCardClasses}>
									<div class="flex items-start gap-3">
										<div class={optionIconClasses}>
											<MessagesSquare class="h-4 w-4 sm:h-5 sm:w-5" />
										</div>
										<div class="min-w-0 flex-1">
											<p class="micro-label mb-1">DEV TOOL</p>
											<h3
												class="text-sm font-semibold text-foreground sm:text-base"
											>
												Agent handoff
											</h3>
											<p
												class="mt-1 text-xs leading-snug text-muted-foreground sm:text-sm"
											>
												Hand the conversation to another agent with a
												defined goal.
											</p>
										</div>
										<ChevronRight
											class="h-4 w-4 shrink-0 text-muted-foreground"
										/>
									</div>
								</button>
							{/if}
						</div>
					</div>

					{#if hasProjects}
						<div
							class="flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground shadow-ink tx tx-strip tx-weak"
						>
							<div class="h-1.5 w-1.5 rounded-full bg-accent"></div>
							<span>{activeProjects.length} projects ready for focused chat</span>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/if}

	<!-- PROJECT SELECTION VIEW -->
	{#if selectedView === 'project-selection'}
		<div class="flex h-full min-h-0 flex-col">
			<!-- Header - compact on mobile -->
			<div class="border-b border-border bg-card px-3 py-2.5 tx tx-strip tx-weak sm:p-4">
				<h2 class="text-base font-semibold text-foreground sm:text-lg">
					Choose a project context
				</h2>
				<p class="text-xs text-muted-foreground">Start chat inside a specific project</p>
				<div class="relative mt-3">
					<Search
						class="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
					/>
					<input
						type="text"
						inputmode="search"
						enterkeyhint="search"
						placeholder="Search projects..."
						class="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-8 text-xs text-foreground shadow-ink-inner transition-colors placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring"
						bind:value={projectSearchTerm}
						aria-label="Search projects"
					/>
					{#if isProjectSearchActive}
						<button
							type="button"
							class="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							onclick={() => (projectSearchTerm = '')}
							aria-label="Clear project search"
						>
							<X class="h-3.5 w-3.5" />
						</button>
					{/if}
				</div>
			</div>

			<!-- Projects List -->
			<div class="mx-auto w-full max-w-4xl flex-1 min-h-0 overflow-y-auto px-3 py-3 sm:p-4">
				{#if isLoadingProjects}
					<div class="flex items-center justify-center py-12 sm:py-16">
						<LoaderCircle
							class="h-6 w-6 animate-spin text-muted-foreground sm:h-8 sm:w-8"
						/>
					</div>
				{:else if projectsError}
					<div
						class="flex flex-col items-center justify-center py-12 text-center sm:py-16"
					>
						<p class="mb-3 text-sm text-destructive">{projectsError}</p>
						<button
							onclick={() => loadProjects()}
							class="text-sm font-medium text-accent hover:underline"
						>
							Try again
						</button>
					</div>
				{:else if activeProjects.length > 0}
					<!-- Mobile: compact stacked list | Desktop: grid -->
					<div class="flex flex-col gap-2 sm:grid sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
						{#each activeProjects as project (project.id)}
							{@const facetSummary = getFacetSummary(project)}
							<button
								onclick={() => selectProject(project)}
								class={projectListItemClasses}
							>
								<!-- Mobile: title row with chevron -->
								<div class="flex items-center gap-2">
									<h3
										class="flex-1 truncate text-sm font-semibold text-foreground"
										title={project.name}
									>
										{project.name}
									</h3>
									<ChevronRight class="h-4 w-4 shrink-0 text-muted-foreground" />
								</div>
								<!-- Metadata row - compact -->
								{#if project.stateKey || project.typeKey}
									<div
										class="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-[11px]"
									>
										{#if project.stateKey}
											<span
												class="rounded-full border border-border px-1.5 py-0.5"
											>
												{formatKeyLabel(project.stateKey)}
											</span>
										{/if}
										{#if project.typeKey}
											<span>{formatKeyLabel(project.typeKey)}</span>
										{/if}
									</div>
								{/if}
								{#if facetSummary}
									<p class="mt-1 text-[11px] text-muted-foreground sm:text-xs">
										{facetSummary}
									</p>
								{/if}
								{#if project.description}
									<p
										class="mt-1.5 line-clamp-2 text-xs text-muted-foreground hidden sm:block"
									>
										{project.description}
									</p>
								{/if}
								{#if project.taskCount > 0}
									<div
										class="mt-2 border-t border-border pt-1.5 text-[11px] text-muted-foreground sm:text-xs"
									>
										<span>
											{project.taskCount} task{project.taskCount !== 1
												? 's'
												: ''}
										</span>
									</div>
								{/if}
							</button>
						{/each}
					</div>
				{:else}
					<div
						class="flex flex-col items-center justify-center py-12 text-center sm:py-16"
					>
						<div
							class="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted sm:mb-6 sm:h-20 sm:w-20"
						>
							<FolderOpen class="h-7 w-7 text-muted-foreground sm:h-10 sm:w-10" />
						</div>
						<h3
							class="mb-1.5 text-base font-semibold text-foreground sm:text-lg sm:mb-2"
						>
							{#if isProjectSearchActive}No matching projects{:else}No projects yet{/if}
						</h3>
						<p class="max-w-xs text-xs text-muted-foreground sm:text-sm">
							{#if isProjectSearchActive}
								No projects match "{normalizedProjectSearch}".
							{:else}
								Start a project first, then return here for focused project chat.
							{/if}
						</p>
						{#if isProjectSearchActive}
							<button
								type="button"
								class="mt-3 text-xs font-semibold text-accent hover:underline"
								onclick={() => (projectSearchTerm = '')}
							>
								Clear search
							</button>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	/* Scrollbar styling - uses CSS custom properties for theme compatibility */
	.overflow-y-auto {
		scrollbar-width: thin;
		scrollbar-color: hsl(var(--border)) transparent;
	}

	.overflow-y-auto::-webkit-scrollbar {
		width: 6px;
	}

	.overflow-y-auto::-webkit-scrollbar-track {
		background: transparent;
	}

	.overflow-y-auto::-webkit-scrollbar-thumb {
		background: hsl(var(--border));
		border-radius: 3px;
	}

	.overflow-y-auto::-webkit-scrollbar-thumb:hover {
		background: hsl(var(--muted-foreground) / 0.5);
	}

	/* Line clamp utility */
	.line-clamp-2 {
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}
</style>
