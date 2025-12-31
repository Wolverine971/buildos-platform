<!-- apps/web/src/lib/components/agent/ProjectModeSelectionView.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import {
		Globe,
		Plus,
		FolderOpen,
		Search,
		Target,
		TrendingUp,
		ChevronRight,
		ChevronLeft,
		Sparkles
	} from 'lucide-svelte';
	import type { ChatContextType } from '@buildos/shared-types';

	// Props using Svelte 5 syntax
	interface Props {
		projects?: any[];
		inModal?: boolean;
	}

	let { projects = [], inModal = true }: Props = $props();

	// State
	let selectedView: 'primary' | 'project-selection' | 'mode-selection' = $state('primary');
	let selectedProject: any | null = $state(null);

	const dispatch = createEventDispatcher<{
		select: { contextType: ChatContextType; entityId?: string };
	}>();

	// Primary actions
	function selectGlobal() {
		dispatch('select', { contextType: 'global' });
	}

	function selectProjectCreate() {
		dispatch('select', { contextType: 'project_create' });
	}

	function showProjectSelection() {
		selectedView = 'project-selection';
	}

	// Project selection
	function selectProject(project: any) {
		selectedProject = project;
		selectedView = 'mode-selection';
	}

	function backToPrimary() {
		selectedView = 'primary';
		selectedProject = null;
	}

	function backToProjectSelection() {
		selectedView = 'project-selection';
		selectedProject = null;
	}

	// Mode selection
	function selectMode(mode: 'project' | 'project_audit' | 'project_forecast') {
		if (!selectedProject) return;
		dispatch('select', { contextType: mode, entityId: selectedProject.id });
	}

	// Computed
	const activeProjects = $derived(
		projects.filter((p) => p.status === 'active' || p.status === 'planning')
	);
</script>

<div
	class="flex h-full flex-col overflow-hidden bg-background {inModal
		? 'max-h-[70vh] min-h-[400px]'
		: ''}"
>
	<!-- PRIMARY SELECTION VIEW -->
	{#if selectedView === 'primary'}
		<div class="mx-auto w-full max-w-4xl flex-1 overflow-y-auto p-4 sm:p-6">
			<!-- Header -->
			<div class="mb-4 text-center sm:mb-6">
				<h2 class="mb-1 text-lg font-bold text-foreground sm:mb-2 sm:text-2xl">
					What would you like to do?
				</h2>
				<p class="text-xs text-muted-foreground sm:text-sm">
					Choose how you want to interact with your BuildOS agent
				</p>
			</div>

			<!-- Primary Actions Grid -->
			<div class="grid gap-3 sm:grid-cols-3 sm:gap-4">
				<!-- Option 1: Chat Globally -->
				<button
					onclick={selectGlobal}
					class="group flex items-center gap-3 rounded-lg border border-border bg-card p-3 text-left shadow-ink transition-all pressable hover:border-accent hover:bg-accent/5 sm:flex-col sm:items-center sm:gap-4 sm:p-6 sm:text-center"
				>
					<div
						class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 shadow-ink transition-transform duration-200 group-hover:scale-105 dark:bg-blue-900/40 sm:h-16 sm:w-16 sm:rounded-xl"
					>
						<Globe class="h-5 w-5 text-blue-600 dark:text-blue-400 sm:h-8 sm:w-8" />
					</div>
					<div class="min-w-0 flex-1">
						<h3 class="text-sm font-semibold text-foreground sm:mb-1 sm:text-base">
							Chat Globally
						</h3>
						<p class="text-xs text-muted-foreground">
							General assistant without project context
						</p>
					</div>
					<ChevronRight class="h-4 w-4 shrink-0 text-muted-foreground sm:h-5 sm:w-5" />
				</button>

				<!-- Option 2: Create New Project -->
				<button
					onclick={selectProjectCreate}
					class="group flex items-center gap-3 rounded-lg border border-border bg-card p-3 text-left shadow-ink transition-all pressable hover:border-accent hover:bg-accent/5 sm:flex-col sm:items-center sm:gap-4 sm:p-6 sm:text-center"
				>
					<div
						class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-100 shadow-ink transition-transform duration-200 group-hover:scale-105 dark:bg-purple-900/40 sm:h-16 sm:w-16 sm:rounded-xl"
					>
						<Plus class="h-5 w-5 text-purple-600 dark:text-purple-400 sm:h-8 sm:w-8" />
					</div>
					<div class="min-w-0 flex-1">
						<h3 class="text-sm font-semibold text-foreground sm:mb-1 sm:text-base">
							Create New Project
						</h3>
						<p class="text-xs text-muted-foreground">
							Guided conversation to build a project
						</p>
					</div>
					<ChevronRight class="h-4 w-4 shrink-0 text-muted-foreground sm:h-5 sm:w-5" />
				</button>

				<!-- Option 3: Existing Project -->
				<button
					onclick={showProjectSelection}
					disabled={projects.length === 0}
					class="group flex items-center gap-3 rounded-lg border border-border bg-card p-3 text-left shadow-ink transition-all pressable hover:border-accent hover:bg-accent/5 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-col sm:items-center sm:gap-4 sm:p-6 sm:text-center"
				>
					<div
						class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 shadow-ink transition-transform duration-200 group-hover:scale-105 dark:bg-emerald-900/40 sm:h-16 sm:w-16 sm:rounded-xl"
					>
						<FolderOpen
							class="h-5 w-5 text-emerald-600 dark:text-emerald-400 sm:h-8 sm:w-8"
						/>
					</div>
					<div class="min-w-0 flex-1">
						<h3 class="text-sm font-semibold text-foreground sm:mb-1 sm:text-base">
							Existing Project
						</h3>
						<p class="text-xs text-muted-foreground">
							{#if projects.length === 0}
								No projects yet
							{:else}
								Open a project workspace, audit, or forecast
							{/if}
						</p>
					</div>
					<ChevronRight class="h-4 w-4 shrink-0 text-muted-foreground sm:h-5 sm:w-5" />
				</button>
			</div>

			<!-- Quick Stats -->
			{#if projects.length > 0}
				<div
					class="mt-4 flex items-center justify-center gap-6 text-xs text-muted-foreground sm:mt-8"
				>
					<div class="flex items-center gap-2">
						<div class="h-2 w-2 rounded-full bg-emerald-500"></div>
						<span>{activeProjects.length} active projects</span>
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- PROJECT SELECTION VIEW -->
	{#if selectedView === 'project-selection'}
		<div class="flex h-full flex-col">
			<!-- Header with Back Button -->
			<div class="border-b border-border bg-card px-4 py-3">
				<button
					onclick={backToPrimary}
					class="mb-2 flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
				>
					<ChevronLeft class="h-4 w-4" />
					<span>Back</span>
				</button>
				<h2 class="text-lg font-semibold text-foreground">Select a Project</h2>
				<p class="text-xs text-muted-foreground">Choose which project to work with</p>
			</div>

			<!-- Projects List -->
			<div class="mx-auto w-full max-w-4xl flex-1 overflow-y-auto p-4">
				{#if activeProjects.length > 0}
					<div class="grid gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
						{#each activeProjects as project}
							<button
								onclick={() => selectProject(project)}
								class="group flex items-center gap-3 rounded-lg border border-border bg-card p-3 text-left shadow-ink transition-all pressable hover:border-accent hover:bg-accent/5"
							>
								<div class="min-w-0 flex-1">
									<h3
										class="truncate text-sm font-semibold text-foreground"
										title={project.name}
									>
										{project.name}
									</h3>
									{#if project.description}
										<p class="line-clamp-1 text-xs text-muted-foreground">
											{project.description}
										</p>
									{/if}
									{#if project.taskCount > 0}
										<p class="mt-1 text-xs text-muted-foreground">
											{project.taskCount} task{project.taskCount !== 1
												? 's'
												: ''}
										</p>
									{/if}
								</div>
								<ChevronRight class="h-4 w-4 shrink-0 text-muted-foreground" />
							</button>
						{/each}
					</div>
				{:else}
					<div
						class="flex flex-col items-center justify-center py-12 text-center sm:py-16"
					>
						<div
							class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted sm:mb-6 sm:h-20 sm:w-20"
						>
							<FolderOpen class="h-8 w-8 text-muted-foreground sm:h-10 sm:w-10" />
						</div>
						<h3 class="mb-2 text-base font-semibold text-foreground sm:text-lg">
							No Active Projects
						</h3>
						<p class="max-w-xs text-xs text-muted-foreground sm:text-sm">
							Create your first project to get started
						</p>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- MODE SELECTION VIEW -->
	{#if selectedView === 'mode-selection' && selectedProject}
		<div class="flex h-full flex-col">
			<!-- Header with Back Button -->
			<div class="border-b border-border bg-card px-4 py-3">
				<button
					onclick={backToProjectSelection}
					class="mb-2 flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
				>
					<ChevronLeft class="h-4 w-4" />
					<span>Back to Projects</span>
				</button>
				<h2 class="truncate text-lg font-semibold text-foreground">
					{selectedProject.name}
				</h2>
				<p class="text-xs text-muted-foreground">Choose what you'd like to do</p>
			</div>

			<!-- Mode Options -->
			<div class="mx-auto w-full max-w-3xl flex-1 overflow-y-auto p-4 sm:p-6">
				<div class="grid gap-3 sm:grid-cols-3 sm:gap-4">
					<!-- Project Workspace -->
					<button
						onclick={() => selectMode('project')}
						class="group flex items-center gap-3 rounded-lg border border-border bg-card p-3 text-left shadow-ink transition-all pressable hover:border-accent hover:bg-accent/5 sm:flex-col sm:items-center sm:gap-4 sm:p-6 sm:text-center"
					>
						<div
							class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 shadow-ink transition-transform duration-200 group-hover:scale-105 dark:bg-blue-900/40 sm:h-14 sm:w-14 sm:rounded-xl"
						>
							<Sparkles
								class="h-5 w-5 text-blue-600 dark:text-blue-400 sm:h-7 sm:w-7"
							/>
						</div>
						<div class="min-w-0 flex-1">
							<h3 class="text-sm font-semibold text-foreground sm:mb-1">
								Project workspace
							</h3>
							<p class="text-xs text-muted-foreground">
								Ask questions, explore, or make updates
							</p>
						</div>
						<ChevronRight class="h-4 w-4 shrink-0 text-muted-foreground sm:hidden" />
					</button>

					<!-- Project Audit -->
					<button
						onclick={() => selectMode('project_audit')}
						class="group flex items-center gap-3 rounded-lg border border-border bg-card p-3 text-left shadow-ink transition-all pressable hover:border-accent hover:bg-accent/5 sm:flex-col sm:items-center sm:gap-4 sm:p-6 sm:text-center"
					>
						<div
							class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 shadow-ink transition-transform duration-200 group-hover:scale-105 dark:bg-amber-900/40 sm:h-14 sm:w-14 sm:rounded-xl"
						>
							<Search
								class="h-5 w-5 text-amber-600 dark:text-amber-400 sm:h-7 sm:w-7"
							/>
						</div>
						<div class="min-w-0 flex-1">
							<h3 class="text-sm font-semibold text-foreground sm:mb-1">
								Audit Project
							</h3>
							<p class="text-xs text-muted-foreground">
								Critical review across dimensions
							</p>
						</div>
						<ChevronRight class="h-4 w-4 shrink-0 text-muted-foreground sm:hidden" />
					</button>

					<!-- Project Forecast -->
					<button
						onclick={() => selectMode('project_forecast')}
						class="group flex items-center gap-3 rounded-lg border border-border bg-card p-3 text-left shadow-ink transition-all pressable hover:border-accent hover:bg-accent/5 sm:flex-col sm:items-center sm:gap-4 sm:p-6 sm:text-center"
					>
						<div
							class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 shadow-ink transition-transform duration-200 group-hover:scale-105 dark:bg-emerald-900/40 sm:h-14 sm:w-14 sm:rounded-xl"
						>
							<TrendingUp
								class="h-5 w-5 text-emerald-600 dark:text-emerald-400 sm:h-7 sm:w-7"
							/>
						</div>
						<div class="min-w-0 flex-1">
							<h3 class="text-sm font-semibold text-foreground sm:mb-1">
								Forecast Project
							</h3>
							<p class="text-xs text-muted-foreground">
								Scenario planning and outcomes
							</p>
						</div>
						<ChevronRight class="h-4 w-4 shrink-0 text-muted-foreground sm:hidden" />
					</button>
				</div>

				<!-- Mode Descriptions - hidden on mobile to save space -->
				<div
					class="mt-4 hidden space-y-2 rounded-lg border border-border bg-muted/50 p-3 sm:mt-6 sm:block sm:space-y-3 sm:p-4"
				>
					<div class="flex gap-3 text-xs">
						<Target class="h-4 w-4 shrink-0 text-muted-foreground" />
						<div>
							<span class="font-semibold text-foreground">Workspace</span>
							<span class="text-muted-foreground">
								- Ask questions, explore data, or make updates
							</span>
						</div>
					</div>
					<div class="flex gap-3 text-xs">
						<Search class="h-4 w-4 shrink-0 text-muted-foreground" />
						<div>
							<span class="font-semibold text-foreground">Audit</span>
							<span class="text-muted-foreground">
								- Identify gaps, risks, and improvement opportunities
							</span>
						</div>
					</div>
					<div class="flex gap-3 text-xs">
						<TrendingUp class="h-4 w-4 shrink-0 text-muted-foreground" />
						<div>
							<span class="font-semibold text-foreground">Forecast</span>
							<span class="text-muted-foreground">
								- Explore scenarios and predict outcomes
							</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	/* Minimal custom styles for scrollbar */
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

	/* Line clamp utility */
	.line-clamp-1 {
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 1;
		line-clamp: 1;
		-webkit-box-orient: vertical;
	}
</style>
