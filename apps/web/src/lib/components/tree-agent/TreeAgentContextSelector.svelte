<!-- apps/web/src/lib/components/tree-agent/TreeAgentContextSelector.svelte -->
<script lang="ts">
	interface Project {
		id: string;
		name: string;
	}

	interface ContextSelectorProps {
		currentContextType?: 'global' | 'project';
		currentProjectId?: string | null;
		onContextChange?: (context: {
			context_type: 'global' | 'project';
			context_project_id: string | null;
		}) => void;
		onClose?: () => void;
		isOpen?: boolean;
	}

	let {
		currentContextType = 'global',
		currentProjectId = null,
		onContextChange,
		onClose,
		isOpen = false
	}: ContextSelectorProps = $props();

	let projects = $state<Project[]>([]);
	let isLoading = $state(false);
	let selectedContextType = $state<'global' | 'project'>(currentContextType);
	let selectedProjectId = $state<string | null>(currentProjectId);
	let error = $state<string | null>(null);

	$effect(() => {
		if (isOpen && selectedContextType === 'project' && projects.length === 0) {
			loadProjects();
		}
	});

	async function loadProjects() {
		isLoading = true;
		error = null;

		try {
			const response = await fetch('/api/projects?limit=100&status=active');
			if (!response.ok) {
				error = 'Failed to load projects';
				return;
			}

			const result = await response.json();

			// Handle different response formats
			if (result.success && result.data?.projects) {
				projects = result.data.projects;
			} else if (Array.isArray(result)) {
				projects = result;
			} else if (result.data && Array.isArray(result.data)) {
				projects = result.data;
			}
		} catch (err) {
			console.error('Failed to load projects:', err);
			error = 'Failed to load projects';
		} finally {
			isLoading = false;
		}
	}

	function handleContextTypeChange(type: 'global' | 'project') {
		selectedContextType = type;
		if (type === 'global') {
			selectedProjectId = null;
		}
	}

	function handleSubmit() {
		if (onContextChange) {
			onContextChange({
				context_type: selectedContextType,
				context_project_id: selectedContextType === 'project' ? selectedProjectId : null
			});
		}
		// Don't close here - let parent handle that
	}

	function handleClose() {
		// Reset to current state when closing
		selectedContextType = currentContextType;
		selectedProjectId = currentProjectId;
		onClose?.();
	}
</script>

{#if isOpen}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
		<div
			class="w-full max-w-md rounded-xl border border-border bg-card shadow-ink-strong tx tx-frame tx-weak overflow-hidden animate-in fade-in duration-200 sp-block"
		>
			<!-- Header -->
			<div class="border-b border-border bg-muted/30 px-4 py-3">
				<h2 class="text-lg font-semibold text-foreground">Chat Context</h2>
				<p class="mt-1 text-sm text-muted-foreground">
					Choose where you want to focus your conversation
				</p>
			</div>

			<!-- Body -->
			<div class="space-y-4 px-4 py-4">
				<!-- Context Type Selection -->
				<div class="space-y-2">
					<label class="block text-sm font-medium text-foreground">Context Type</label>

					<div class="space-y-2">
						<!-- Global Option -->
						<button
							onclick={() => handleContextTypeChange('global')}
							class:ring-2={selectedContextType === 'global'}
							class:ring-accent={selectedContextType === 'global'}
							class="w-full rounded-lg border border-border bg-card p-3 text-left transition-all hover:bg-muted/50 focus:ring-1 focus:ring-ring focus:border-accent tx tx-grain tx-weak wt-paper sp-block"
						>
							<div class="flex items-start gap-3">
								<div
									class="mt-1 flex h-4 w-4 items-center justify-center rounded border border-border"
								>
									{#if selectedContextType === 'global'}
										<div class="h-2 w-2 rounded-full bg-accent"></div>
									{/if}
								</div>
								<div class="flex-1">
									<div class="font-semibold text-foreground">
										🌐 Global Context
									</div>
									<div class="mt-1 text-sm text-muted-foreground">
										Chat about all projects
									</div>
								</div>
							</div>
						</button>

						<!-- Project Option -->
						<button
							onclick={() => handleContextTypeChange('project')}
							class:ring-2={selectedContextType === 'project'}
							class:ring-accent={selectedContextType === 'project'}
							class="w-full rounded-lg border border-border bg-card p-3 text-left transition-all hover:bg-muted/50 focus:ring-1 focus:ring-ring focus:border-accent tx tx-grain tx-weak wt-paper sp-block"
						>
							<div class="flex items-start gap-3">
								<div
									class="mt-1 flex h-4 w-4 items-center justify-center rounded border border-border"
								>
									{#if selectedContextType === 'project'}
										<div class="h-2 w-2 rounded-full bg-accent"></div>
									{/if}
								</div>
								<div class="flex-1">
									<div class="font-semibold text-foreground">
										📁 Project Context
									</div>
									<div class="mt-1 text-sm text-muted-foreground">
										Focus on a specific project
									</div>
								</div>
							</div>
						</button>
					</div>
				</div>

				<!-- Project Selection (only shown for project context) -->
				{#if selectedContextType === 'project'}
					<div class="space-y-2 border-t border-border pt-4">
						<label
							for="project-select"
							class="block text-sm font-medium text-foreground"
						>
							Select Project
						</label>

						{#if isLoading}
							<div class="flex items-center justify-center py-6">
								<div
									class="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-accent"
								></div>
							</div>
						{:else if error}
							<div
								class="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 p-3 text-sm text-red-700 dark:text-red-200 tx tx-static tx-weak"
							>
								{error}
							</div>
						{:else if projects.length === 0}
							<div
								class="rounded-lg border border-border bg-muted/30 p-3 text-center text-sm text-muted-foreground tx tx-frame tx-weak"
							>
								No projects available
							</div>
						{:else}
							<select
								id="project-select"
								bind:value={selectedProjectId}
								class="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-ring tx tx-grain tx-weak wt-paper"
							>
								<option value="">-- Choose a project --</option>
								{#each projects as project}
									<option value={project.id}>{project.name}</option>
								{/each}
							</select>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Footer -->
			<div class="border-t border-border bg-muted/30 px-4 py-3 flex gap-2 justify-end">
				<button
					onclick={handleClose}
					class="rounded-lg border border-border px-4 py-2 font-medium text-foreground transition-colors hover:bg-muted/50 focus:ring-1 focus:ring-ring focus:border-accent pressable tx tx-frame tx-weak wt-paper"
				>
					Cancel
				</button>
				<button
					onclick={handleSubmit}
					disabled={selectedContextType === 'project' && !selectedProjectId}
					class="rounded-lg bg-accent px-4 py-2 font-medium text-accent-foreground transition-colors hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed shadow-ink pressable focus:ring-1 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background tx tx-grain tx-weak wt-paper"
				>
					Set Context
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	:global {
		@keyframes in {
			from {
				opacity: 0;
				transform: scale(0.95);
			}
			to {
				opacity: 1;
				transform: scale(1);
			}
		}

		.animate-in {
			animation: in 0.2s ease-out;
		}

		.fade-in {
			animation: fadeIn 0.2s ease-out;
		}

		@keyframes fadeIn {
			from {
				opacity: 0;
			}
			to {
				opacity: 1;
			}
		}
	}
</style>
