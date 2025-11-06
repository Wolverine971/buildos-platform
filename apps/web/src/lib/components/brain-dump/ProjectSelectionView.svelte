<!-- apps/web/src/lib/components/brain-dump/ProjectSelectionView.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import {
		Plus,
		FolderOpen,
		FileText,
		Clock,
		Edit3,
		ChevronRight,
		Sparkles
	} from 'lucide-svelte';

	export let projects: any[] = [];
	export let recentDumps: any[] = [];
	export let newProjectDraftCount: number = 0;
	export let inModal = false;
	export let processingProjectIds: Set<string> = new Set();

	const dispatch = createEventDispatcher();

	function handleProjectSelection(project: any) {
		// Prevent selection if project is being processed
		const projectId = project.id === 'new' ? 'new' : project.id;
		if (processingProjectIds.has(projectId)) {
			return;
		}
		dispatch('selectProject', project);
	}

	// Check if a project is being processed
	function isProjectProcessing(projectId: string): boolean {
		const id = projectId === 'new' ? 'new' : projectId;
		return processingProjectIds.has(id);
	}

	function formatDate(dateString: string): string {
		const date = new Date(dateString);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffMins < 1) return 'Just now';
		if (diffMins < 60) return `${diffMins}m ago`;
		if (diffHours < 24) return `${diffHours}h ago`;
		if (diffDays < 7) return `${diffDays}d ago`;

		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	// Group projects by activity
	$: activeProjects = projects.filter(
		(p) => p.taskCount > 0 || p.noteCount > 0 || p.draftCount > 0
	);
	$: inactiveProjects = projects.filter(
		(p) => p.taskCount === 0 && p.noteCount === 0 && p.draftCount === 0
	);
</script>

<div
	class="h-full flex flex-col bg-gradient-to-br from-gray-50/50 to-gray-100/30 dark:from-gray-900/50 dark:to-gray-800/30 overflow-hidden {inModal
		? 'bg-white dark:bg-gray-800 h-auto min-h-[400px] max-h-[70vh]'
		: ''}"
>
	<div class="flex-1 overflow-y-auto p-4 sm:p-6 max-w-6xl w-full mx-auto">
		<!-- Primary Action -->
		<section class="mb-8">
			<button
				onclick={() => handleProjectSelection({ id: 'new', name: 'New Project / Note' })}
				disabled={isProjectProcessing('new')}
				class="w-full flex items-center justify-between p-4 sm:p-5 bg-gradient-to-r from-purple-50/30 to-pink-50/30 dark:from-purple-900/10 dark:to-pink-900/10 backdrop-blur-sm border-2 border-dashed {isProjectProcessing(
					'new'
				)
					? 'border-orange-400/50 dark:border-orange-500/50 opacity-60 cursor-not-allowed'
					: newProjectDraftCount > 0
						? 'border-purple-400/50 dark:border-purple-500/50'
						: 'border-gray-300/50 dark:border-gray-600/50 hover:border-purple-300/50 dark:hover:border-purple-600/50'} rounded-xl transition-all duration-200 {!isProjectProcessing(
					'new'
				)
					? 'hover:shadow-lg active:scale-[0.99]'
					: ''} group"
			>
				<div class="flex items-center gap-4">
					<div
						class="w-12 h-12 flex items-center justify-center bg-gradient-to-br {newProjectDraftCount >
						0
							? 'from-purple-100/70 to-pink-100/70 dark:from-purple-800/40 dark:to-pink-800/40'
							: 'from-gray-100/70 to-gray-200/50 dark:from-gray-700/50 dark:to-gray-800/50'} rounded-xl transition-transform duration-200 group-hover:scale-105 shadow-sm"
					>
						<Plus class="w-6 h-6 text-purple-600 dark:text-purple-400" />
					</div>
					<div class="text-left">
						<h3 class="text-base font-semibold text-gray-900 dark:text-white mb-1">
							Start New Brain Dump
						</h3>
						<p class="text-sm text-gray-600 dark:text-gray-400">
							{#if isProjectProcessing('new')}
								<span class="text-orange-600 dark:text-orange-400 font-medium">
									Processing new project brain dump...
								</span>
							{:else if newProjectDraftCount > 0}
								<span class="text-primary-600 dark:text-primary-400 font-medium">
									{newProjectDraftCount} unsaved draft{newProjectDraftCount > 1
										? 's'
										: ''}
								</span>
							{:else}
								Create a new project or capture notes
							{/if}
						</p>
					</div>
				</div>
				<ChevronRight class="w-5 h-5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
			</button>
		</section>

		<!-- Active Projects -->
		{#if activeProjects.length > 0}
			<section class="mb-8">
				<header class="mb-4">
					<h2
						class="flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider"
					>
						<span class="w-2 h-2 bg-blue-500 rounded-full"></span>
						<span>Active Projects</span>
						<span
							class="text-xs px-2 py-0.5 bg-gray-200/50 dark:bg-gray-700/50 rounded-full font-medium"
						>
							{activeProjects.length}
						</span>
					</h2>
				</header>

				<div
					class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3"
				>
					{#each activeProjects as project}
						<button
							onclick={() => handleProjectSelection(project)}
							disabled={isProjectProcessing(project.id)}
							class="relative flex flex-col p-3 sm:p-4 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border {isProjectProcessing(
								project.id
							)
								? 'border-orange-300/50 dark:border-orange-600/50 opacity-60 cursor-not-allowed'
								: project.draftCount > 0
									? 'border-blue-300/50 dark:border-blue-600/50 bg-gradient-to-br from-blue-50/30 to-indigo-50/30 dark:from-blue-900/20 dark:to-indigo-900/20'
									: 'border-gray-200/50 dark:border-gray-700/50'} rounded-xl text-left {!isProjectProcessing(
								project.id
							)
								? 'hover:border-gray-300/70 dark:hover:border-gray-600/70 hover:shadow-lg active:scale-[0.99]'
								: ''} transition-all duration-200 min-h-[5rem] sm:min-h-[5.5rem]"
						>
							{#if isProjectProcessing(project.id)}
								<div
									class="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 bg-orange-500 dark:bg-orange-600 text-white rounded text-xs font-medium"
								>
									<Sparkles class="w-3 h-3 animate-pulse" />
									<span>Processing</span>
								</div>
							{:else if project.draftCount > 0}
								<div
									class="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 bg-primary-600 dark:bg-primary-500 text-white rounded text-xs font-medium"
								>
									<Edit3 class="w-3 h-3" />
									<span>{project.draftCount}</span>
								</div>
							{/if}

							<div class="flex-1 min-w-0">
								<h3
									class="text-sm font-semibold text-gray-900 dark:text-white mb-1 truncate"
									title={project.name}
								>
									{project.name}
								</h3>
								{#if project.description}
									<p
										class="text-xs text-gray-600 dark:text-gray-400 line-clamp-2"
										title={project.description}
									>
										{project.description}
									</p>
								{/if}
							</div>

							{#if project.taskCount > 0 || project.noteCount > 0}
								<div
									class="flex items-center gap-1.5 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400"
								>
									{#if project.taskCount > 0}
										<span>
											{project.taskCount} task{project.taskCount !== 1
												? 's'
												: ''}
										</span>
									{/if}
									{#if project.taskCount > 0 && project.noteCount > 0}
										<span class="opacity-50">•</span>
									{/if}
									{#if project.noteCount > 0}
										<span>
											{project.noteCount} note{project.noteCount !== 1
												? 's'
												: ''}
										</span>
									{/if}
								</div>
							{/if}
						</button>
					{/each}
				</div>
			</section>
		{/if}

		<!-- Inactive Projects -->
		{#if inactiveProjects.length > 0}
			<section class="mb-8">
				<header class="mb-4">
					<h2
						class="flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider"
					>
						<span class="w-2 h-2 bg-gray-400 rounded-full"></span>
						<span>Other Projects</span>
						<span
							class="text-xs px-2 py-0.5 bg-gray-100/50 dark:bg-gray-800/50 rounded-full font-medium"
						>
							{inactiveProjects.length}
						</span>
					</h2>
				</header>

				<div class="flex flex-col gap-1">
					{#each inactiveProjects as project}
						<button
							onclick={() => handleProjectSelection(project)}
							disabled={isProjectProcessing(project.id)}
							class="flex items-center justify-between w-full p-3 bg-white dark:bg-gray-800 border {isProjectProcessing(
								project.id
							)
								? 'border-orange-300 dark:border-orange-600 opacity-60 cursor-not-allowed'
								: 'border-gray-200 dark:border-gray-700'} rounded-lg {!isProjectProcessing(
								project.id
							)
								? 'hover:bg-gray-50 dark:hover:bg-gray-750'
								: ''} transition-all duration-200"
						>
							<div class="flex items-center gap-3 min-w-0">
								<FolderOpen
									class="w-5 h-5 text-gray-400 dark:text-gray-500 flex-shrink-0"
								/>
								<span
									class="text-sm font-medium text-gray-700 dark:text-gray-300 truncate"
								>
									{project.name}
								</span>
							</div>
							{#if isProjectProcessing(project.id)}
								<span
									class="text-xs text-orange-600 dark:text-orange-400 font-medium flex-shrink-0"
								>
									Processing...
								</span>
							{:else}
								<ChevronRight
									class="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0"
								/>
							{/if}
						</button>
					{/each}
				</div>
			</section>
		{/if}

		<!-- Recent Brain Dumps -->
		{#if recentDumps.length > 0}
			<section class="mb-8">
				<header class="mb-4">
					<h2
						class="flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider"
					>
						<span class="w-2 h-2 bg-violet-500 rounded-full"></span>
						<span>Recent Brain Dumps</span>
					</h2>
				</header>

				<div class="flex flex-col gap-3">
					{#each recentDumps.slice(0, 3) as dump}
						<div
							class="flex gap-3 p-4 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-xl hover:shadow-lg transition-all duration-200"
						>
							<FileText
								class="w-5 h-5 text-gray-400 dark:text-gray-500 flex-shrink-0 mt-0.5"
							/>
							<div class="flex-1 min-w-0">
								<div class="flex items-start justify-between gap-2 mb-2">
									<h4
										class="text-sm font-semibold text-gray-900 dark:text-white truncate"
										title={dump.title || 'Brain Dump'}
									>
										{dump.title || 'Untitled Brain Dump'}
									</h4>
									{#if dump.status === 'saved'}
										<span
											class="flex-shrink-0 px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded text-xs font-medium"
										>
											Saved
										</span>
									{/if}
								</div>
								<p
									class="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mb-2"
								>
									{dump.ai_summary ||
										dump.content?.substring(0, 100) ||
										'No content'}
								</p>
								<div
									class="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400"
								>
									<Clock class="w-3 h-3" />
									<span>{formatDate(dump.created_at)}</span>
								</div>
							</div>
						</div>
					{/each}
				</div>
			</section>
		{/if}

		<!-- Empty State -->
		{#if projects.length === 0 && recentDumps.length === 0}
			<div class="flex flex-col items-center justify-center py-16 text-center">
				<div
					class="w-20 h-20 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-full mb-6"
				>
					<FolderOpen class="w-10 h-10 text-gray-400 dark:text-gray-500" />
				</div>
				<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
					Ready to start building?
				</h3>
				<p class="text-sm text-gray-600 dark:text-gray-400 max-w-xs">
					Create your first brain dump to organize your thoughts into projects
				</p>
			</div>
		{/if}
	</div>
</div>

<style>
	/* Minimal custom styles for scrollbar only */
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
		-webkit-box-orient: vertical;
	}
</style>
