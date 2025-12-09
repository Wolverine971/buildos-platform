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
	class="flex h-full flex-col overflow-hidden bg-gradient-to-br from-gray-50/50 to-gray-100/30 dither-surface dark:from-gray-900/50 dark:to-gray-800/30 {inModal
		? 'max-h-[70vh] min-h-[400px] bg-white dark:bg-gray-800'
		: ''}"
>
	<!-- PRIMARY SELECTION VIEW -->
	{#if selectedView === 'primary'}
		<div class="mx-auto w-full max-w-4xl flex-1 overflow-y-auto p-4 sm:p-6">
			<!-- Header -->
			<div class="mb-6 text-center">
				<h2 class="mb-2 text-2xl font-bold text-gray-900 dark:text-white">
					What would you like to do?
				</h2>
				<p class="text-sm text-gray-600 dark:text-gray-400">
					Choose how you want to interact with your BuildOS agent
				</p>
			</div>

			<!-- Primary Actions Grid -->
			<div class="grid gap-4 sm:grid-cols-3">
				<!-- Option 1: Chat Globally -->
				<button
					onclick={selectGlobal}
					class="group flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-gray-300/50 bg-gradient-to-br from-blue-50/30 to-indigo-50/30 dither-soft dither-fade-hover p-6 text-center transition-all duration-200 hover:scale-[1.02] hover:border-blue-300/50 hover:shadow-lg active:scale-[0.99] dark:border-gray-600/50 dark:from-blue-900/10 dark:to-indigo-900/10 dark:hover:border-blue-600/50"
				>
					<div
						class="flex h-16 w-16 items-center justify-center rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 dither-subtle shadow-sm transition-transform duration-200 group-hover:scale-105 dark:from-blue-800/40 dark:to-indigo-800/40"
					>
						<Globe class="h-8 w-8 text-blue-600 dark:text-blue-400" />
					</div>
					<div>
						<h3 class="mb-1 text-base font-semibold text-gray-900 dark:text-white">
							Chat Globally
						</h3>
						<p class="text-xs text-gray-600 dark:text-gray-400">
							General assistant without project context
						</p>
					</div>
					<ChevronRight class="h-5 w-5 text-gray-400 dark:text-gray-500" />
				</button>

				<!-- Option 2: Create New Project -->
				<button
					onclick={selectProjectCreate}
					class="group flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-purple-300/50 bg-gradient-to-br from-purple-50/30 to-pink-50/30 dither-soft dither-fade-hover p-6 text-center transition-all duration-200 hover:scale-[1.02] hover:border-purple-400/50 hover:shadow-lg active:scale-[0.99] dark:border-purple-600/50 dark:from-purple-900/10 dark:to-pink-900/10 dark:hover:border-purple-500/50"
				>
					<div
						class="flex h-16 w-16 items-center justify-center rounded-xl bg-gradient-to-br from-purple-100 to-pink-100 dither-subtle shadow-sm transition-transform duration-200 group-hover:scale-105 dark:from-purple-800/40 dark:to-pink-800/40"
					>
						<Plus class="h-8 w-8 text-purple-600 dark:text-purple-400" />
					</div>
					<div>
						<h3 class="mb-1 text-base font-semibold text-gray-900 dark:text-white">
							Create New Project
						</h3>
						<p class="text-xs text-gray-600 dark:text-gray-400">
							Guided conversation to build a project
						</p>
					</div>
					<ChevronRight class="h-5 w-5 text-gray-400 dark:text-gray-500" />
				</button>

				<!-- Option 3: Existing Project -->
				<button
					onclick={showProjectSelection}
					disabled={projects.length === 0}
					class="group flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-emerald-300/50 bg-gradient-to-br from-emerald-50/30 to-teal-50/30 dither-soft dither-fade-hover p-6 text-center transition-all duration-200 hover:scale-[1.02] hover:border-emerald-400/50 hover:shadow-lg active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 dark:border-emerald-600/50 dark:from-emerald-900/10 dark:to-teal-900/10 dark:hover:border-emerald-500/50"
				>
					<div
						class="flex h-16 w-16 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100 dither-subtle shadow-sm transition-transform duration-200 group-hover:scale-105 dark:from-emerald-800/40 dark:to-teal-800/40"
					>
						<FolderOpen class="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
					</div>
					<div>
						<h3 class="mb-1 text-base font-semibold text-gray-900 dark:text-white">
							Existing Project
						</h3>
						<p class="text-xs text-gray-600 dark:text-gray-400">
							{#if projects.length === 0}
								No projects yet
							{:else}
								Open a project workspace, audit, or forecast
							{/if}
						</p>
					</div>
					<ChevronRight class="h-5 w-5 text-gray-400 dark:text-gray-500" />
				</button>
			</div>

			<!-- Quick Stats -->
			{#if projects.length > 0}
				<div
					class="mt-8 flex items-center justify-center gap-6 text-xs text-gray-500 dark:text-gray-400"
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
			<div
				class="border-b border-gray-200/60 bg-white/80 px-4 py-3 backdrop-blur-sm dark:border-gray-700/60 dark:bg-gray-900/80"
			>
				<button
					onclick={backToPrimary}
					class="mb-2 flex items-center gap-2 text-sm text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
				>
					<ChevronLeft class="h-4 w-4" />
					<span>Back</span>
				</button>
				<h2 class="text-lg font-semibold text-gray-900 dark:text-white">
					Select a Project
				</h2>
				<p class="text-xs text-gray-600 dark:text-gray-400">
					Choose which project to work with
				</p>
			</div>

			<!-- Projects List -->
			<div class="mx-auto w-full max-w-4xl flex-1 overflow-y-auto p-4">
				{#if activeProjects.length > 0}
					<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
						{#each activeProjects as project}
							<button
								onclick={() => selectProject(project)}
								class="group flex flex-col rounded-xl border border-gray-200/50 bg-white/70 p-4 text-left backdrop-blur-sm transition-all duration-200 hover:scale-[1.02] hover:border-gray-300/70 hover:shadow-lg active:scale-[0.99] dark:border-gray-700/50 dark:bg-gray-800/70 dark:hover:border-gray-600/70"
							>
								<div class="mb-3 flex items-start justify-between">
									<h3
										class="flex-1 truncate text-sm font-semibold text-gray-900 dark:text-white"
										title={project.name}
									>
										{project.name}
									</h3>
									<ChevronRight
										class="h-4 w-4 flex-shrink-0 text-gray-400 dark:text-gray-500"
									/>
								</div>
								{#if project.description}
									<p
										class="mb-3 line-clamp-2 text-xs text-gray-600 dark:text-gray-400"
									>
										{project.description}
									</p>
								{/if}
								{#if project.taskCount > 0}
									<div
										class="mt-auto border-t border-gray-100 pt-2 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400"
									>
										{project.taskCount} task{project.taskCount !== 1 ? 's' : ''}
									</div>
								{/if}
							</button>
						{/each}
					</div>
				{:else}
					<div class="flex flex-col items-center justify-center py-16 text-center">
						<div
							class="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800"
						>
							<FolderOpen class="h-10 w-10 text-gray-400 dark:text-gray-500" />
						</div>
						<h3 class="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
							No Active Projects
						</h3>
						<p class="max-w-xs text-sm text-gray-600 dark:text-gray-400">
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
			<div
				class="border-b border-gray-200/60 bg-white/80 px-4 py-3 backdrop-blur-sm dark:border-gray-700/60 dark:bg-gray-900/80"
			>
				<button
					onclick={backToProjectSelection}
					class="mb-2 flex items-center gap-2 text-sm text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
				>
					<ChevronLeft class="h-4 w-4" />
					<span>Back to Projects</span>
				</button>
				<h2 class="text-lg font-semibold text-gray-900 dark:text-white">
					{selectedProject.name}
				</h2>
				<p class="text-xs text-gray-600 dark:text-gray-400">Choose what you'd like to do</p>
			</div>

			<!-- Mode Options -->
			<div class="mx-auto w-full max-w-3xl flex-1 overflow-y-auto p-6">
				<div class="grid gap-4 sm:grid-cols-3">
					<!-- Project Workspace -->
					<Button
						onclick={() => selectMode('project')}
						class="group flex flex-col items-center gap-4 rounded-xl border-2 border-blue-200/50 bg-gradient-to-br from-blue-50/50 to-indigo-50/50 dither-soft dither-fade-hover p-6 text-center transition-all duration-200 hover:scale-[1.02] hover:border-blue-300 hover:shadow-lg active:scale-[0.99] dark:border-blue-800/50 dark:from-blue-900/20 dark:to-indigo-900/20 dark:hover:border-blue-700"
					>
						<div
							class="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 dither-subtle shadow-sm transition-transform duration-200 group-hover:scale-105 dark:from-blue-800/40 dark:to-indigo-800/40"
						>
							<Sparkles class="h-7 w-7 text-blue-600 dark:text-blue-400" />
						</div>
						<div>
							<h3 class="mb-1 text-sm font-semibold text-gray-900 dark:text-white">
								Project workspace
							</h3>
							<p class="text-xs text-gray-600 dark:text-gray-400">
								Ask questions, explore, or make updates
							</p>
						</div>
					</Button>

					<!-- Project Audit -->
					<Button
						onclick={() => selectMode('project_audit')}
						class="group flex flex-col items-center gap-4 rounded-xl border-2 border-amber-200/50 bg-gradient-to-br from-amber-50/50 to-orange-50/50 dither-soft dither-fade-hover p-6 text-center transition-all duration-200 hover:scale-[1.02] hover:border-amber-300 hover:shadow-lg active:scale-[0.99] dark:border-amber-800/50 dark:from-amber-900/20 dark:to-orange-900/20 dark:hover:border-amber-700"
					>
						<div
							class="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 dither-subtle shadow-sm transition-transform duration-200 group-hover:scale-105 dark:from-amber-800/40 dark:to-orange-800/40"
						>
							<Search class="h-7 w-7 text-amber-600 dark:text-amber-400" />
						</div>
						<div>
							<h3 class="mb-1 text-sm font-semibold text-gray-900 dark:text-white">
								Audit Project
							</h3>
							<p class="text-xs text-gray-600 dark:text-gray-400">
								Critical review across dimensions
							</p>
						</div>
					</Button>

					<!-- Project Forecast -->
					<Button
						onclick={() => selectMode('project_forecast')}
						class="group flex flex-col items-center gap-4 rounded-xl border-2 border-emerald-200/50 bg-gradient-to-br from-emerald-50/50 to-teal-50/50 dither-soft dither-fade-hover p-6 text-center transition-all duration-200 hover:scale-[1.02] hover:border-emerald-300 hover:shadow-lg active:scale-[0.99] dark:border-emerald-800/50 dark:from-emerald-900/20 dark:to-teal-900/20 dark:hover:border-emerald-700"
					>
						<div
							class="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100 dither-subtle shadow-sm transition-transform duration-200 group-hover:scale-105 dark:from-emerald-800/40 dark:to-teal-800/40"
						>
							<TrendingUp class="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
						</div>
						<div>
							<h3 class="mb-1 text-sm font-semibold text-gray-900 dark:text-white">
								Forecast Project
							</h3>
							<p class="text-xs text-gray-600 dark:text-gray-400">
								Scenario planning and outcomes
							</p>
						</div>
					</Button>
				</div>

				<!-- Mode Descriptions -->
				<div class="mt-6 space-y-3 rounded-xl bg-white/50 p-4 dark:bg-gray-800/50">
					<div class="flex gap-3 text-xs">
						<Target class="h-4 w-4 flex-shrink-0 text-gray-400 dark:text-gray-500" />
						<div>
							<span class="font-semibold text-gray-900 dark:text-white">
								Workspace
							</span>
							<span class="text-gray-600 dark:text-gray-400">
								- Ask questions, explore data, or make updates
							</span>
						</div>
					</div>
					<div class="flex gap-3 text-xs">
						<Search class="h-4 w-4 flex-shrink-0 text-gray-400 dark:text-gray-500" />
						<div>
							<span class="font-semibold text-gray-900 dark:text-white"> Audit </span>
							<span class="text-gray-600 dark:text-gray-400">
								- Identify gaps, risks, and improvement opportunities
							</span>
						</div>
					</div>
					<div class="flex gap-3 text-xs">
						<TrendingUp
							class="h-4 w-4 flex-shrink-0 text-gray-400 dark:text-gray-500"
						/>
						<div>
							<span class="font-semibold text-gray-900 dark:text-white">
								Forecast
							</span>
							<span class="text-gray-600 dark:text-gray-400">
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
		scrollbar-color: theme('colors.gray.300') transparent;
	}

	.overflow-y-auto::-webkit-scrollbar {
		width: 8px;
	}

	.overflow-y-auto::-webkit-scrollbar-track {
		background: transparent;
	}

	.overflow-y-auto::-webkit-scrollbar-thumb {
		background: theme('colors.gray.300');
		border-radius: 4px;
	}

	:global(.dark) .overflow-y-auto {
		scrollbar-color: theme('colors.gray.600') transparent;
	}

	:global(.dark) .overflow-y-auto::-webkit-scrollbar-thumb {
		background: theme('colors.gray.600');
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
