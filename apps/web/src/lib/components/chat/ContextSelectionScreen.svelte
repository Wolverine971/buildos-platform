<!-- apps/web/src/lib/components/chat/ContextSelectionScreen.svelte -->
<!--
  Context Selection Screen - Pre-chat context selector

  Allows users to choose their chat context before starting a conversation.
  Supports 3-tier selection for project-based contexts.
-->

<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { browser } from '$app/environment';
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
		formatRelativeProjectUpdate,
		groupProjectsByRecency,
		normalizeProjectSelectionSearch,
		type ProjectSelectionSummary
	} from './project-selector-browser';

	export interface ContextSelection {
		contextType: ChatContextType;
		entityId?: string;
		label?: string;
	}

	interface Props {
		/**
		 * Whether the screen is actually on screen. Hosts that keep it mounted
		 * while hidden pass false so the project list is fetched only once it
		 * is shown (default true).
		 */
		active?: boolean;
		onNavigationChange?: (view: 'primary' | 'project-selection') => void;
		onSelect?: (selection: ContextSelection) => void;
	}

	// Props - Svelte 5 callback pattern
	let { active = true, onNavigationChange, onSelect }: Props = $props();

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
	// Non-reactive bookkeeping for the re-activation refresh below.
	let hasBeenActive = false;
	let lastProjectsLoadedAt = 0;

	// Hide paused, cancelled (treated as deleted), and archived projects. The API already
	// filters `archived_at IS NULL`, but we keep `archived` here defensively.
	const INACTIVE_PROJECT_STATE_KEYS = new Set(['archived', 'cancelled', 'paused']);
	const PROJECT_LIST_LIMIT = DEFAULT_PROJECT_SELECTOR_LIMIT;
	const PROJECT_SEARCH_LIMIT = MAX_PROJECT_SELECTOR_LIMIT;
	const PROJECT_REACTIVATION_REFRESH_MS = 15_000;
	const normalizedProjectSearch = $derived(normalizeProjectSelectionSearch(projectSearchTerm));
	const isProjectSearchActive = $derived(normalizedProjectSearch.length > 0);

	async function loadProjects(
		options: { force?: boolean; silent?: boolean; search?: string; limit?: number } = {}
	) {
		// `silent`: background refresh — keep the current list on screen (no
		// spinner) and keep it on failure instead of swapping in an error.
		const { force = false, silent = false } = options;
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

		if (!silent) {
			isLoadingProjects = true;
			projectsError = null;
		}

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
			projectsError = null;
			hasLoadedProjects = true;
			lastProjectQuery = search;
			lastProjectLimit = limit;
			lastProjectsLoadedAt = Date.now();
		} catch (err) {
			if ((err as Error)?.name === 'AbortError' || requestId !== projectListRequestId) {
				return;
			}
			console.error('Failed to load ontology projects:', err);
			if (silent) return;
			projectsError = 'Failed to load ontology projects';
			hasLoadedProjects = true;
		} finally {
			if (requestId === projectListRequestId) {
				isLoadingProjects = false;
				projectListController = null;
			}
		}
	}

	// Load projects on both the primary and project-selection views, but only
	// while the screen is active (hosts keep it mounted behind `hidden`).
	// Primary view needs the project count to (a) render the new-user empty
	// state via `isNewUser` and (b) show the active-project count on the
	// project-chat card. Cache short-circuit in loadProjects() keeps this
	// from re-fetching unnecessarily when switching views.
	$effect(() => {
		if (!browser || !active) return;
		if (!normalizedProjectSearch) {
			// The default list needs no debounce: load in the same tick so a warm
			// cache resolves before first paint (no one-frame skeleton flash).
			untrack(() => void loadProjects({ search: '' }));
			return;
		}
		const timeoutId = setTimeout(
			() => void loadProjects({ search: projectSearchTerm }),
			PROJECT_SELECTOR_SEARCH_DEBOUNCE_MS
		);
		return () => clearTimeout(timeoutId);
	});

	// Coming back to an already-loaded screen: quietly refresh a stale list
	// (e.g. a project was created in chat meanwhile). No skeleton/spinner, and
	// fetchProjectSelectionSummaries' short-lived cache absorbs rapid toggles.
	$effect(() => {
		if (!browser || !active) return;
		untrack(() => {
			const isStale = Date.now() - lastProjectsLoadedAt > PROJECT_REACTIVATION_REFRESH_MS;
			if (hasBeenActive && hasLoadedProjects && !isLoadingProjects && isStale) {
				void loadProjects({ force: true, silent: true });
			}
			hasBeenActive = true;
		});
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

	function selectProjectCreate() {
		onSelect?.({ contextType: 'project_create', label: 'Create a project' });
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

	const activeProjectsByRecency = $derived(groupProjectsByRecency(activeProjects));
	const isNewUser = $derived(
		hasLoadedProjects && lastProjectQuery === '' && !hasProjects && !projectsError
	);
	// Until the first list arrives we can't tell a new user (single "first
	// project" card) from a returning one (three cards), so hold a skeleton of
	// the common layout instead of rendering one and flipping to the other.
	const showPrimarySkeleton = $derived(!hasLoadedProjects);
	const optionCardBaseClasses =
		'group flex flex-col rounded-lg border border-border bg-card p-3 text-left shadow-ink pressable transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:p-4';
	// Canonical texture mapping (see INKPRINT design system §3.4):
	//   General chat   → Frame  (canonical / primary surface)
	//   Project chat   → Grain  (active execution)
	//   Project setup  → Bloom  (new / creation)
	const primaryChatCardClasses = `${optionCardBaseClasses} tx tx-frame tx-weak hover:border-accent/40`;
	const projectChatCardClasses = `${optionCardBaseClasses} tx tx-grain tx-weak hover:border-accent/40`;
	const setupCardClasses = `${optionCardBaseClasses} tx tx-bloom tx-weak hover:border-accent/40`;
	const projectListItemClasses =
		'group flex flex-col rounded-lg border border-border bg-card p-3 text-left shadow-ink tx tx-frame tx-weak pressable transition-colors duration-150 hover:border-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:p-3';
	const optionIconClasses =
		'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-foreground shadow-ink-inner sm:h-10 sm:w-10';
</script>

<div class="flex h-full min-h-0 flex-col overflow-hidden bg-muted">
	<!-- PRIMARY SELECTION VIEW -->
	{#if selectedView === 'primary'}
		<!-- Screen header band (matches other selection screens) -->
		<div class="border-b border-border bg-card px-3 py-2.5 tx tx-strip tx-weak sm:p-4">
			{#if showPrimarySkeleton}
				<!-- Same line boxes as the real header so nothing shifts when it loads -->
				<div class="animate-pulse motion-reduce:animate-none" aria-hidden="true">
					<div class="flex h-6 items-center sm:h-7">
						<div class="h-4 w-48 rounded bg-muted sm:h-5 sm:w-64"></div>
					</div>
					<!-- Subtitle wraps to two lines on phones -->
					<div class="mt-0.5 flex h-8 flex-col justify-around sm:h-5">
						<div class="h-3 w-full max-w-sm rounded bg-muted sm:w-80"></div>
						<div class="h-3 w-40 rounded bg-muted sm:hidden"></div>
					</div>
				</div>
			{:else if isNewUser}
				<h2 class="text-base font-semibold text-foreground sm:text-lg">
					Start with your first project
				</h2>
				<p class="mt-0.5 text-xs text-muted-foreground sm:text-sm">
					Set up the project once, then return here for project chat and workspace-wide
					help.
				</p>
			{:else}
				<h2 class="text-base font-semibold text-foreground sm:text-lg">
					What do you want to work on?
				</h2>
				<p class="mt-0.5 text-xs text-muted-foreground sm:text-sm">
					Pick a starting point — switch later from the arrow in the top-left.
				</p>
			{/if}
		</div>

		<div class="mx-auto w-full max-w-5xl flex-1 min-h-0 overflow-y-auto px-3 py-3 sm:p-5">
			{#if showPrimarySkeleton}
				<!-- Mirrors the returning-user layout: two chat cards + one setup card -->
				<div
					class="space-y-5 animate-pulse motion-reduce:animate-none sm:space-y-6"
					role="status"
					aria-label="Loading your projects"
				>
					{#each [2, 1] as cardCount, groupIndex (groupIndex)}
						<section class="space-y-2.5" aria-hidden="true">
							<div class="flex items-center gap-3">
								<div class="h-3 w-24 rounded bg-muted"></div>
								<span class="h-px flex-1 bg-border"></span>
							</div>
							<div
								class={`grid gap-2 sm:gap-3 ${cardCount === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-1'}`}
							>
								{#each Array.from({ length: cardCount }, (_, index) => index) as cardIndex (cardIndex)}
									<div
										class="flex items-start gap-3 rounded-lg border border-border bg-card p-3 shadow-ink sm:p-4"
									>
										<div
											class="h-9 w-9 shrink-0 rounded-md border border-border bg-muted sm:h-10 sm:w-10"
										></div>
										<div class="min-w-0 flex-1 space-y-2 py-0.5">
											<div class="h-2.5 w-20 rounded bg-muted"></div>
											<div class="h-3.5 w-36 rounded bg-muted"></div>
											<div class="h-3 w-full max-w-xs rounded bg-muted"></div>
										</div>
									</div>
								{/each}
							</div>
						</section>
					{/each}
				</div>
			{:else if isNewUser}
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
									Define the objective, create the shell, and give the assistant
									something stable to work with.
								</p>
							</div>
							<ChevronRight class="h-4 w-4 shrink-0 text-muted-foreground" />
						</div>
					</button>

					<!-- Informational preview — clearly NOT clickable (no shadow, no card bg) -->
					<div class="w-full max-w-xl px-1">
						<p
							class="mb-2 text-center text-2xs font-semibold uppercase tracking-[0.15em] text-muted-foreground"
						>
							Once a project exists, you can also
						</p>
						<dl
							class="grid gap-x-4 gap-y-1.5 text-xs text-muted-foreground sm:grid-cols-2"
						>
							<div class="flex items-start gap-2">
								<MessagesSquare
									class="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/70"
								/>
								<div>
									<dt class="font-semibold text-foreground">General chat</dt>
									<dd class="text-2xs leading-snug">
										Ask workspace-wide questions.
									</dd>
								</div>
							</div>
							<div class="flex items-start gap-2">
								<FolderOpen
									class="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/70"
								/>
								<div>
									<dt class="font-semibold text-foreground">Project chat</dt>
									<dd class="text-2xs leading-snug">
										Focused help inside one project.
									</dd>
								</div>
							</div>
						</dl>
					</div>
				</div>
			{:else}
				<div class="space-y-5 sm:space-y-6">
					<!-- Group 1: Start chatting -->
					<section class="space-y-2.5">
						<div class="flex items-center gap-3">
							<h3
								class="text-xs font-semibold uppercase tracking-[0.15em] text-foreground"
							>
								Start a chat
							</h3>
							<span class="h-px flex-1 bg-border"></span>
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
											Workspace-wide questions, planning, or cross-project
											context.
										</p>
									</div>
									<ChevronRight class="h-4 w-4 shrink-0 text-muted-foreground" />
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
											Chat inside a project
										</h3>
										<p
											class="mt-1 text-xs leading-snug text-muted-foreground sm:text-sm"
										>
											{#if hasLoadedProjects && hasProjects}
												Pick from {activeProjects.length} active project{activeProjects.length !==
												1
													? 's'
													: ''} and get focused help.
											{:else}
												Pick a project and get focused help with planning
												and next steps.
											{/if}
										</p>
									</div>
									<ChevronRight class="h-4 w-4 shrink-0 text-muted-foreground" />
								</div>
							</button>
						</div>
					</section>

					<!-- Group 2: Set something up -->
					<section class="space-y-2.5">
						<div class="flex items-center gap-3">
							<h3
								class="text-xs font-semibold uppercase tracking-[0.15em] text-foreground"
							>
								Or set something up
							</h3>
							<span class="h-px flex-1 bg-border"></span>
						</div>
						<div class="grid gap-2 sm:grid-cols-1 sm:gap-3">
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
											Start a new project
										</h3>
										<p
											class="mt-1 text-xs leading-snug text-muted-foreground sm:text-sm"
										>
											Create the structure first, then move into focused work.
										</p>
									</div>
									<ChevronRight class="h-4 w-4 shrink-0 text-muted-foreground" />
								</div>
							</button>
						</div>
					</section>
				</div>
			{/if}
		</div>
	{/if}

	<!-- PROJECT SELECTION VIEW -->
	{#if selectedView === 'project-selection'}
		<div class="flex h-full min-h-0 flex-col">
			<!-- Screen header band (matches other selection screens) -->
			<div class="border-b border-border bg-card px-3 py-2.5 tx tx-strip tx-weak sm:p-4">
				<h2 class="text-base font-semibold text-foreground sm:text-lg">
					Pick a project to chat in
				</h2>
				<p class="mt-0.5 text-xs text-muted-foreground sm:text-sm">
					Chat will be scoped to this project — search or pick a recent one below.
				</p>
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
					{#snippet projectCard(project: ProjectSelectionSummary)}
						{@const facetSummary = getFacetSummary(project)}
						{@const relativeUpdated = formatRelativeProjectUpdate(project.updatedAt)}
						{@const absoluteUpdated = project.updatedAt
							? new Date(project.updatedAt).toLocaleString(undefined, {
									month: 'short',
									day: 'numeric',
									year: 'numeric',
									hour: 'numeric',
									minute: '2-digit'
								})
							: ''}
						<button
							onclick={() => selectProject(project)}
							class={projectListItemClasses}
						>
							<div class="flex items-start gap-2">
								<h3
									class="min-w-0 flex-1 truncate text-sm font-semibold text-foreground"
									title={project.name}
								>
									{project.name}
								</h3>
								<ChevronRight
									class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
								/>
							</div>
							{#if project.stateKey || project.typeKey}
								<div
									class="mt-1.5 flex flex-wrap items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground sm:text-2xs"
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
								<p class="mt-1 text-2xs text-muted-foreground sm:text-xs">
									{facetSummary}
								</p>
							{/if}
							{#if project.description}
								<p
									class="mt-1.5 hidden line-clamp-2 text-xs text-muted-foreground sm:block"
								>
									{project.description}
								</p>
							{/if}
							<div
								class="mt-2 flex items-center justify-between gap-2 border-t border-border pt-1.5 text-2xs text-muted-foreground sm:text-xs"
							>
								<span>
									{project.taskCount} task{project.taskCount !== 1 ? 's' : ''}
								</span>
								{#if project.updatedAt}
									<time
										datetime={project.updatedAt}
										title={absoluteUpdated}
										class="whitespace-nowrap font-medium"
									>
										Updated {relativeUpdated}
									</time>
								{/if}
							</div>
						</button>
					{/snippet}

					{#snippet groupHeader(label: string, count: number, isFirst: boolean)}
						<div
							class={`project-recency-separator ${isFirst ? 'project-recency-separator--first' : ''}`}
						>
							<span>{label}</span>
							<span class="project-recency-count">{count}</span>
						</div>
					{/snippet}

					<div class="space-y-4 sm:space-y-5">
						{#if activeProjectsByRecency.recent.length > 0}
							<section>
								{@render groupHeader(
									'Last 7 days',
									activeProjectsByRecency.recent.length,
									true
								)}
								<div
									class="flex flex-col gap-2 sm:grid sm:grid-cols-2 sm:gap-3 lg:grid-cols-3"
								>
									{#each activeProjectsByRecency.recent as project (project.id)}
										{@render projectCard(project)}
									{/each}
								</div>
							</section>
						{/if}

						{#if activeProjectsByRecency.olderThan7Days.length > 0}
							<section>
								{@render groupHeader(
									'8–30 days ago',
									activeProjectsByRecency.olderThan7Days.length,
									activeProjectsByRecency.recent.length === 0
								)}
								<div
									class="flex flex-col gap-2 sm:grid sm:grid-cols-2 sm:gap-3 lg:grid-cols-3"
								>
									{#each activeProjectsByRecency.olderThan7Days as project (project.id)}
										{@render projectCard(project)}
									{/each}
								</div>
							</section>
						{/if}

						{#if activeProjectsByRecency.olderThan30Days.length > 0}
							<section>
								{@render groupHeader(
									'Over 30 days ago',
									activeProjectsByRecency.olderThan30Days.length,
									activeProjectsByRecency.recent.length === 0 &&
										activeProjectsByRecency.olderThan7Days.length === 0
								)}
								<div
									class="flex flex-col gap-2 sm:grid sm:grid-cols-2 sm:gap-3 lg:grid-cols-3"
								>
									{#each activeProjectsByRecency.olderThan30Days as project (project.id)}
										{@render projectCard(project)}
									{/each}
								</div>
							</section>
						{/if}
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

	/* Recency group headers — mirrors styling on /projects page */
	.project-recency-separator {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin-bottom: 0.625rem;
		padding-top: 0.75rem;
		border-top: 1px solid hsl(var(--border));
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: hsl(var(--muted-foreground) / 0.85);
	}

	.project-recency-separator--first {
		padding-top: 0;
		border-top: 0;
	}

	.project-recency-count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 1.5rem;
		padding: 0 0.4rem;
		border: 1px solid hsl(var(--border));
		border-radius: 9999px;
		background: hsl(var(--card));
		font-size: 0.625rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		color: hsl(var(--muted-foreground));
	}
</style>
