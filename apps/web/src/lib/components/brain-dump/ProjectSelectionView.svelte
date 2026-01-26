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
	class="h-full flex flex-col bg-muted overflow-hidden {inModal
		? 'bg-card h-auto min-h-[400px] max-h-[70vh]'
		: ''}"
>
	<div class="flex-1 overflow-y-auto p-4 sm:p-6 max-w-6xl w-full mx-auto">
		<!-- Primary Action -->
		<section class="mb-8">
			<button
				onclick={() => handleProjectSelection({ id: 'new', name: 'New Project / Note' })}
				disabled={isProjectProcessing('new')}
				class="w-full flex items-center justify-between p-4 sm:p-5 bg-accent/10 border-2 border-dashed {isProjectProcessing(
					'new'
				)
					? 'border-orange-500 opacity-60 cursor-not-allowed'
					: newProjectDraftCount > 0
						? 'border-accent'
						: 'border-border hover:border-accent'} rounded-xl transition-all duration-200 {!isProjectProcessing(
					'new'
				)
					? 'hover:shadow-ink-strong active:scale-[0.99]'
					: ''} group shadow-ink tx tx-frame tx-weak"
			>
				<div class="flex items-center gap-4">
					<div
						class="w-12 h-12 flex items-center justify-center {newProjectDraftCount > 0
							? 'bg-accent/15'
							: 'bg-muted'} rounded-xl transition-transform duration-200 group-hover:scale-105 shadow-ink"
					>
						<Plus class="w-6 h-6 text-accent" />
					</div>
					<div class="text-left">
						<h3 class="text-base font-semibold text-foreground mb-1">
							Start New Brain Dump
						</h3>
						<p class="text-sm text-muted-foreground">
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
				<ChevronRight class="w-5 h-5 text-muted-foreground flex-shrink-0" />
			</button>
		</section>

		<!-- Active Projects -->
		{#if activeProjects.length > 0}
			<section class="mb-8">
				<header class="mb-4">
					<h2
						class="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider"
					>
						<span class="w-2 h-2 bg-blue-500 rounded-full"></span>
						<span>Active Projects</span>
						<span class="text-xs px-2 py-0.5 bg-muted rounded-full font-medium">
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
							class="relative flex flex-col p-3 sm:p-4 bg-card border {isProjectProcessing(
								project.id
							)
								? 'border-orange-500 opacity-60 cursor-not-allowed'
								: project.draftCount > 0
									? 'border-primary bg-primary/5'
									: 'border-border'} rounded-xl text-left {!isProjectProcessing(
								project.id
							)
								? 'hover:border-accent hover:shadow-ink-strong active:scale-[0.99]'
								: ''} transition-all duration-200 min-h-[5rem] sm:min-h-[5.5rem] shadow-ink tx tx-frame tx-weak"
						>
							{#if isProjectProcessing(project.id)}
								<div
									class="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 bg-orange-500 text-white rounded text-xs font-medium shadow-ink"
								>
									<Sparkles class="w-3 h-3 animate-pulse" />
									<span>Processing</span>
								</div>
							{:else if project.draftCount > 0}
								<div
									class="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 bg-primary text-white rounded text-xs font-medium shadow-ink"
								>
									<Edit3 class="w-3 h-3" />
									<span>{project.draftCount}</span>
								</div>
							{/if}

							<div class="flex-1 min-w-0">
								<h3
									class="text-sm font-semibold text-foreground mb-1 truncate"
									title={project.name}
								>
									{project.name}
								</h3>
								{#if project.description}
									<p
										class="text-xs text-muted-foreground line-clamp-2"
										title={project.description}
									>
										{project.description}
									</p>
								{/if}
							</div>

							{#if project.taskCount > 0 || project.noteCount > 0}
								<div
									class="flex items-center gap-1.5 mt-3 pt-3 border-t border-border text-xs text-muted-foreground"
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
						class="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider"
					>
						<span class="w-2 h-2 bg-muted-foreground rounded-full"></span>
						<span>Other Projects</span>
						<span class="text-xs px-2 py-0.5 bg-muted rounded-full font-medium">
							{inactiveProjects.length}
						</span>
					</h2>
				</header>

				<div class="flex flex-col gap-1">
					{#each inactiveProjects as project}
						<button
							onclick={() => handleProjectSelection(project)}
							disabled={isProjectProcessing(project.id)}
							class="flex items-center justify-between w-full p-3 bg-card border {isProjectProcessing(
								project.id
							)
								? 'border-orange-500 opacity-60 cursor-not-allowed'
								: 'border-border'} rounded-lg {!isProjectProcessing(project.id)
								? 'hover:bg-muted'
								: ''} transition-all duration-200 shadow-ink"
						>
							<div class="flex items-center gap-3 min-w-0">
								<FolderOpen class="w-5 h-5 text-muted-foreground flex-shrink-0" />
								<span class="text-sm font-medium text-foreground truncate">
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
								<ChevronRight class="w-4 h-4 text-muted-foreground flex-shrink-0" />
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
						class="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider"
					>
						<span class="w-2 h-2 bg-violet-500 rounded-full"></span>
						<span>Recent Brain Dumps</span>
					</h2>
				</header>

				<div class="flex flex-col gap-3">
					{#each recentDumps.slice(0, 3) as dump}
						<div
							class="flex gap-3 p-4 bg-card border border-border rounded-xl hover:shadow-ink-strong transition-all duration-200 shadow-ink tx tx-frame tx-weak"
						>
							<FileText class="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
							<div class="flex-1 min-w-0">
								<div class="flex items-start justify-between gap-2 mb-2">
									<h4
										class="text-sm font-semibold text-foreground truncate"
										title={dump.title || 'Brain Dump'}
									>
										{dump.title || 'Untitled Brain Dump'}
									</h4>
									{#if dump.status === 'saved'}
										<span
											class="flex-shrink-0 px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-400 rounded text-xs font-medium shadow-ink"
										>
											Saved
										</span>
									{/if}
								</div>
								<p class="text-xs text-muted-foreground line-clamp-2 mb-2">
									{dump.ai_summary ||
										dump.content?.substring(0, 100) ||
										'No content'}
								</p>
								<div
									class="flex items-center gap-1.5 text-xs text-muted-foreground"
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
					class="w-20 h-20 flex items-center justify-center bg-muted rounded-full mb-6 shadow-ink tx tx-bloom tx-weak"
				>
					<FolderOpen class="w-10 h-10 text-muted-foreground" />
				</div>
				<h3 class="text-lg font-semibold text-foreground mb-2">Ready to start building?</h3>
				<p class="text-sm text-muted-foreground max-w-xs">
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
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}
</style>
