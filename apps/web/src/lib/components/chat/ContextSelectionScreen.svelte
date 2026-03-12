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
		Sparkles,
		LoaderCircle,
		PenLine,
		Search,
		X
	} from 'lucide-svelte';
	import type { ChatContextType } from '@buildos/shared-types';

	interface OntologyProjectSummary {
		id: string;
		name: string;
		description: string | null;
		typeKey: string;
		stateKey: string;
		facetContext: string | null;
		facetScale: string | null;
		facetStage: string | null;
		createdAt: string;
		updatedAt: string;
		taskCount: number;
	}

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
	let projects = $state<OntologyProjectSummary[]>([]);
	let isLoadingProjects = $state(false);
	let projectsError = $state<string | null>(null);
	let hasLoadedProjects = $state(false);
	let projectSearchTerm = $state('');
	let projectListController: AbortController | null = null;
	let lastProjectQuery = $state('');
	let lastProjectLimit = $state(0);
	let projectListRequestId = 0;

	const INACTIVE_PROJECT_STATE_KEYS = new Set(['archived', 'completed', 'retired', 'closed']);
	const PROJECT_LIST_LIMIT = 24;
	const PROJECT_SEARCH_LIMIT = 50;
	const PROJECT_SEARCH_DEBOUNCE_MS = 180;
	const normalizedProjectSearch = $derived(projectSearchTerm.trim());
	const isProjectSearchActive = $derived(normalizedProjectSearch.length > 0);

	async function loadProjects(
		options: { force?: boolean; search?: string; limit?: number } = {}
	) {
		const { force = false } = options;
		const search = (options.search ?? projectSearchTerm).trim();
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
			const params = new URLSearchParams();
			params.set('limit', String(limit));
			if (search) {
				params.set('search', search);
			}

			const response = await fetch(`/api/onto/projects?${params.toString()}`, {
				method: 'GET',
				credentials: 'same-origin',
				cache: 'no-store',
				signal: projectListController.signal,
				headers: {
					Accept: 'application/json'
				}
			});
			const payload = await response.json();

			if (requestId !== projectListRequestId) {
				return;
			}

			if (!response.ok || payload?.success === false) {
				projectsError = payload?.error || 'Failed to load ontology projects';
				projects = [];
				hasLoadedProjects = true;
				return;
			}

			const fetchedProjects = payload?.data?.projects ?? payload?.projects ?? [];
			const processedProjects: OntologyProjectSummary[] = fetchedProjects.map(
				(project: any) => ({
					id: project.id,
					name: project.name ?? 'Untitled project',
					description: project.description ?? null,
					typeKey: project.type_key ?? project.typeKey ?? 'project.generic',
					stateKey: project.state_key ?? project.stateKey ?? 'planning',
					facetContext: project.facet_context ?? project.facetContext ?? null,
					facetScale: project.facet_scale ?? project.facetScale ?? null,
					facetStage: project.facet_stage ?? project.facetStage ?? null,
					createdAt: project.created_at ?? project.createdAt ?? '',
					updatedAt: project.updated_at ?? project.updatedAt ?? '',
					taskCount: project.task_count ?? project.taskCount ?? 0
				})
			);
			projects = processedProjects;
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
			normalizedProjectSearch ? PROJECT_SEARCH_DEBOUNCE_MS : 0
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
		onSelect?.({ contextType: 'global', label: 'General Chat' });
	}

	function selectAgentToAgent() {
		onSelect?.({ contextType: 'agent_to_agent', label: 'Agent to BuildOS chat' });
	}

	function selectProjectCreate() {
		onSelect?.({ contextType: 'project_create', label: 'New project flow' });
	}

	function selectBraindump() {
		onSelect?.({ contextType: 'brain_dump', label: 'Brain Dump' });
	}

	function goToProjectSelection() {
		selectedView = 'project-selection';
	}

	// Project selection - Svelte 5 callback pattern
	function selectProject(project: OntologyProjectSummary) {
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

	function getFacetSummary(project: OntologyProjectSummary) {
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
						Welcome to BuildOS
					</h2>
					<p class="text-xs text-muted-foreground sm:text-sm">
						Create your first project to unlock the full assistant.
					</p>
				{:else}
					<h2
						class="mb-1 text-lg font-semibold tracking-tight text-foreground sm:text-2xl sm:mb-1.5"
					>
						How would you like to work today?
					</h2>
					<p class="text-xs text-muted-foreground sm:text-sm">
						Pick a focus and we'll tailor the assistant around it.
					</p>
				{/if}
			</div>

			{#if isNewUser}
				<!-- NEW USER: No projects yet — guide to first project creation -->
				<div class="flex flex-col items-center gap-5 sm:gap-6">
					<!-- Primary CTA: Create first project -->
					<button
						onclick={selectProjectCreate}
						class="group w-full max-w-md flex flex-col rounded-xl border-2 border-purple-400/40 bg-card p-4 text-left shadow-ink-strong transition-all duration-200 hover:border-purple-500 hover:shadow-ink-strong active:scale-[0.99] dark:border-purple-500/30 sm:p-5 sm:hover:-translate-y-0.5"
					>
						<div class="flex items-center gap-3">
							<div
								class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400"
							>
								<FolderPlus class="h-5 w-5" />
							</div>
							<div class="min-w-0 flex-1">
								<h3 class="text-base font-semibold text-foreground">
									Create your first project
								</h3>
								<p class="mt-0.5 text-xs text-muted-foreground">
									Guided setup to define goals, milestones, and structure.
								</p>
							</div>
							<ChevronRight
								class="h-5 w-5 shrink-0 text-purple-500 transition-transform group-hover:translate-x-1"
							/>
						</div>
					</button>

					<!-- Disabled options with explanation -->
					<div class="w-full max-w-md">
						<p
							class="mb-2.5 text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
						>
							Available after your first project
						</p>
						<div class="flex flex-col gap-1.5 pointer-events-none opacity-40">
							<div
								class="flex items-center gap-2.5 rounded-lg border border-border bg-card p-2.5"
							>
								<div
									class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent"
								>
									<MessagesSquare class="h-3.5 w-3.5" />
								</div>
								<span class="text-sm text-foreground">General Chat</span>
							</div>
							<div
								class="flex items-center gap-2.5 rounded-lg border border-border bg-card p-2.5"
							>
								<div
									class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-violet-500/10 text-violet-600 dark:text-violet-400"
								>
									<PenLine class="h-3.5 w-3.5" />
								</div>
								<span class="text-sm text-foreground">Brain Dump</span>
							</div>
						</div>
					</div>
				</div>
			{:else}
				<!-- Mobile: compact stacked list | Desktop: 2x2 grid -->
				<div class="flex flex-col gap-2 sm:grid sm:grid-cols-2 sm:gap-4">
					<!-- General Chat — multi-project, open scope -->
					<button
						onclick={selectGlobal}
						class="group flex flex-col rounded-lg border border-border bg-card p-2.5 text-left shadow-ink transition-all duration-200 hover:border-accent/50 hover:shadow-ink-strong active:scale-[0.99] sm:rounded-xl sm:p-4 sm:hover:-translate-y-0.5"
					>
						<div class="flex items-center gap-2 sm:gap-3">
							<div
								class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent sm:h-10 sm:w-10 sm:rounded-lg"
							>
								<MessagesSquare class="h-3.5 w-3.5 sm:h-5 sm:w-5" />
							</div>
							<h3 class="flex-1 text-sm font-semibold text-foreground">
								General Chat
							</h3>
							<ChevronRight
								class="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-accent sm:hidden"
							/>
						</div>
						<p
							class="mt-1.5 text-xs leading-snug text-muted-foreground pl-9 sm:pl-0 sm:mt-2"
						>
							Talk across all your projects, calendar, and tasks — no specific focus
							needed.
						</p>
						<div
							class="hidden items-center justify-between pt-3 mt-auto text-xs font-medium text-accent sm:flex"
						>
							<span>Open conversation</span>
							<ChevronRight
								class="h-4 w-4 transition-transform group-hover:translate-x-1"
							/>
						</div>
					</button>

					<!-- Project Chat — pick a project, chat about it -->
					<button
						onclick={goToProjectSelection}
						class="group flex flex-col rounded-lg border border-border bg-card p-2.5 text-left shadow-ink transition-all duration-200 hover:border-emerald-500/50 hover:shadow-ink-strong active:scale-[0.99] disabled:opacity-60 disabled:shadow-ink sm:rounded-xl sm:p-4 sm:hover:-translate-y-0.5 sm:disabled:translate-y-0"
					>
						<div class="flex items-center gap-2 sm:gap-3">
							<div
								class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 sm:h-10 sm:w-10 sm:rounded-lg"
							>
								<FolderOpen class="h-3.5 w-3.5 sm:h-5 sm:w-5" />
							</div>
							<h3 class="flex-1 text-sm font-semibold text-foreground">
								Project Chat
							</h3>
							<ChevronRight
								class="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-emerald-500 sm:hidden"
							/>
						</div>
						<p
							class="mt-1.5 text-xs leading-snug text-muted-foreground pl-9 sm:pl-0 sm:mt-2"
						>
							Pick a project and get focused help — plan, update, or review.
						</p>
						<div
							class="hidden items-center justify-between pt-3 mt-auto text-xs font-medium text-emerald-600 dark:text-emerald-400 sm:flex"
						>
							<span
								>{#if hasLoadedProjects && hasProjects}{activeProjects.length} active
									projects{:else}Browse projects{/if}</span
							>
							<ChevronRight
								class="h-4 w-4 transition-transform group-hover:translate-x-1"
							/>
						</div>
					</button>

					<!-- Agent to BuildOS chat (dev only) -->
					{#if dev}
						<button
							onclick={selectAgentToAgent}
							class="group flex flex-col rounded-lg border border-border bg-card p-2.5 text-left shadow-ink transition-all duration-200 hover:border-accent/50 hover:shadow-ink-strong active:scale-[0.99] sm:rounded-xl sm:p-4 sm:hover:-translate-y-0.5"
						>
							<div class="flex items-center gap-2 sm:gap-3">
								<div
									class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-violet-500/10 text-violet-600 dark:text-violet-400 sm:h-10 sm:w-10 sm:rounded-lg"
								>
									<Sparkles class="h-3.5 w-3.5 sm:h-5 sm:w-5" />
								</div>
								<h3 class="flex-1 text-sm font-semibold text-foreground">
									Agent to BuildOS
								</h3>
								<ChevronRight
									class="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-violet-500 sm:hidden"
								/>
							</div>
							<p
								class="mt-1.5 text-xs leading-snug text-muted-foreground pl-9 sm:pl-0 sm:mt-2"
							>
								Hand the BuildOS chat to another AI agent with a clear goal.
							</p>
							<div
								class="hidden items-center justify-between pt-3 mt-auto text-xs font-medium text-violet-600 dark:text-violet-400 sm:flex"
							>
								<span>Agent-to-BuildOS</span>
								<ChevronRight
									class="h-4 w-4 transition-transform group-hover:translate-x-1"
								/>
							</div>
						</button>
					{/if}

					<!-- Start a Project — guided creation -->
					<button
						onclick={selectProjectCreate}
						class="group flex flex-col rounded-lg border border-border bg-card p-2.5 text-left shadow-ink transition-all duration-200 hover:border-purple-500/50 hover:shadow-ink-strong active:scale-[0.99] sm:rounded-xl sm:p-4 sm:hover:-translate-y-0.5"
					>
						<div class="flex items-center gap-2 sm:gap-3">
							<div
								class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 sm:h-10 sm:w-10 sm:rounded-lg"
							>
								<FolderPlus class="h-3.5 w-3.5 sm:h-5 sm:w-5" />
							</div>
							<h3 class="flex-1 text-sm font-semibold text-foreground">
								Start a Project
							</h3>
							<ChevronRight
								class="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-purple-500 sm:hidden"
							/>
						</div>
						<p
							class="mt-1.5 text-xs leading-snug text-muted-foreground pl-9 sm:pl-0 sm:mt-2"
						>
							Guided setup to define goals, milestones, and structure.
						</p>
						<div
							class="hidden items-center justify-between pt-3 mt-auto text-xs font-medium text-purple-600 dark:text-purple-400 sm:flex"
						>
							<span>New project</span>
							<ChevronRight
								class="h-4 w-4 transition-transform group-hover:translate-x-1"
							/>
						</div>
					</button>

					<!-- Brain Dump — one-way capture -->
					<button
						onclick={selectBraindump}
						class="group flex flex-col rounded-lg border border-border bg-card p-2.5 text-left shadow-ink transition-all duration-200 hover:border-violet-500/50 hover:shadow-ink-strong active:scale-[0.99] sm:rounded-xl sm:p-4 sm:hover:-translate-y-0.5"
					>
						<div class="flex items-center gap-2 sm:gap-3">
							<div
								class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-violet-500/10 text-violet-600 dark:text-violet-400 sm:h-10 sm:w-10 sm:rounded-lg"
							>
								<PenLine class="h-3.5 w-3.5 sm:h-5 sm:w-5" />
							</div>
							<h3 class="flex-1 text-sm font-semibold text-foreground">Brain Dump</h3>
							<ChevronRight
								class="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-violet-500 sm:hidden"
							/>
						</div>
						<p
							class="mt-1.5 text-xs leading-snug text-muted-foreground pl-9 sm:pl-0 sm:mt-2"
						>
							Jot down thoughts or ideas — quick notes, no conversation needed.
						</p>
						<div
							class="hidden items-center justify-between pt-3 mt-auto text-xs font-medium text-violet-600 dark:text-violet-400 sm:flex"
						>
							<span>Quick capture</span>
							<ChevronRight
								class="h-4 w-4 transition-transform group-hover:translate-x-1"
							/>
						</div>
					</button>
				</div>

				{#if hasProjects}
					<div
						class="mt-4 flex items-center justify-center gap-4 text-xs text-muted-foreground sm:mt-6"
					>
						<div class="flex items-center gap-2">
							<div class="h-1.5 w-1.5 rounded-full bg-emerald-500"></div>
							<span>{activeProjects.length} projects ready for deep work</span>
						</div>
					</div>
				{/if}
			{/if}
		</div>
	{/if}

	<!-- PROJECT SELECTION VIEW -->
	{#if selectedView === 'project-selection'}
		<div class="flex h-full min-h-0 flex-col">
			<!-- Header - compact on mobile -->
			<div class="border-b border-border bg-card/80 px-3 py-2.5 backdrop-blur-sm sm:p-4">
				<h2 class="text-base font-semibold text-foreground sm:text-lg">Select a Project</h2>
				<p class="text-xs text-muted-foreground">Choose which project to work with</p>
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
								class="group flex flex-col rounded-lg border border-border bg-card p-2.5 text-left shadow-ink transition-all duration-200 hover:border-accent/50 hover:shadow-ink-strong active:scale-[0.99] sm:rounded-xl sm:p-3 sm:hover:-translate-y-0.5"
							>
								<!-- Mobile: title row with chevron -->
								<div class="flex items-center gap-2">
									<h3
										class="flex-1 truncate text-sm font-semibold text-foreground"
										title={project.name}
									>
										{project.name}
									</h3>
									<ChevronRight
										class="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
									/>
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
							{#if isProjectSearchActive}No matching projects{:else}No Ontology
								Projects{/if}
						</h3>
						<p class="max-w-xs text-xs text-muted-foreground sm:text-sm">
							{#if isProjectSearchActive}
								No projects match "{normalizedProjectSearch}".
							{:else}
								Instantiate your first ontology project to get started
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
