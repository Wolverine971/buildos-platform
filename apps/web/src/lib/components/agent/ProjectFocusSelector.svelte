<!-- apps/web/src/lib/components/agent/ProjectFocusSelector.svelte -->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import type { FocusEntitySummary, ProjectFocus } from '@buildos/shared-types';

	type FocusEntityType = FocusEntitySummary['type'];

	interface Props {
		isOpen: boolean;
		projectId: string;
		projectName: string;
		currentFocus: ProjectFocus | null;
		onSelect: (focus: ProjectFocus) => void;
		onClose: () => void;
	}

	let { isOpen, projectId, projectName, currentFocus, onSelect, onClose }: Props = $props();

	const focusTypes: Array<{ value: FocusEntityType; label: string; icon: string }> = [
		{ value: 'task', label: 'Tasks', icon: '📝' },
		{ value: 'goal', label: 'Goals', icon: '🎯' },
		{ value: 'plan', label: 'Plans', icon: '📋' },
		{ value: 'document', label: 'Documents', icon: '📄' },
		{ value: 'output', label: 'Outputs', icon: '📦' },
		{ value: 'milestone', label: 'Milestones', icon: '🏁' }
	];

	let selectedType = $state<FocusEntityType>('task');
	let entities = $state<FocusEntitySummary[]>([]);
	let loading = $state(false);
	let errorMessage = $state<string | null>(null);
	let searchTerm = $state('');
	let appliedSearch = $state('');
	// Use a regular variable instead of $state to avoid triggering effect re-runs
	let abortController: AbortController | null = null;

	async function loadEntities(type: FocusEntityType, searchValue: string) {
		if (!projectId) return;

		// Cancel previous request to prevent race conditions
		if (abortController) {
			abortController.abort();
		}

		abortController = new AbortController();
		loading = true;
		errorMessage = null;

		try {
			const params = new URLSearchParams({ type });
			if (searchValue.trim().length > 0) {
				params.set('search', searchValue.trim());
			}
			const response = await fetch(
				`/api/onto/projects/${projectId}/entities?${params.toString()}`,
				{ signal: abortController.signal }
			);
			if (!response.ok) {
				throw new Error(`Failed with status ${response.status}`);
			}
			const payload = await response.json();
			const data = payload?.data ?? payload ?? [];
			entities = Array.isArray(data) ? data : [];
		} catch (error) {
			// Ignore aborted requests (user changed tabs/search)
			if ((error as Error)?.name === 'AbortError') {
				return;
			}
			console.error('[ProjectFocusSelector] Failed to load entities:', error);
			errorMessage = 'Unable to load entities for this project.';
			entities = [];
		} finally {
			loading = false;
		}
	}

	function handleSelect(entity: FocusEntitySummary) {
		if (!projectId) return;
		onSelect({
			focusType: selectedType,
			focusEntityId: entity.id,
			focusEntityName: entity.name,
			projectId,
			projectName
		});
		onClose();
	}

	function handleProjectWide() {
		if (!projectId) return;
		onSelect({
			focusType: 'project-wide',
			focusEntityId: null,
			focusEntityName: null,
			projectId,
			projectName
		});
		onClose();
	}

	function handleSearch(event: Event) {
		event.preventDefault();
		appliedSearch = searchTerm.trim();
	}

	$effect(() => {
		if (!isOpen || !projectId) return;
		loadEntities(selectedType, appliedSearch);
	});

	const isActive = (entity: FocusEntitySummary) => {
		return (
			!!currentFocus &&
			currentFocus.focusType === selectedType &&
			currentFocus.focusEntityId === entity.id
		);
	};

	// Cleanup in-flight requests when component is destroyed to prevent memory leaks
	onDestroy(() => {
		if (abortController) {
			abortController.abort();
		}
	});
</script>

<Modal {isOpen} {onClose} title="Focus on..." size="lg">
	<!-- Modal content with proper padding -->
	<div class="space-y-4 px-4 py-5 sm:space-y-5 sm:px-6 sm:py-6">
		<!-- Type Filter Pills -->
		<div class="flex flex-wrap gap-1.5 sm:gap-2">
			{#each focusTypes as type}
				<button
					type="button"
					class={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all duration-200 sm:gap-2 sm:px-3.5 ${selectedType === type.value ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-200 dark:ring-blue-800' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 hover:shadow-sm dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'}`}
					onclick={() => (selectedType = type.value)}
					aria-pressed={selectedType === type.value}
				>
					<span class="text-base">{type.icon}</span>
					<span class="hidden sm:inline">{type.label}</span>
				</button>
			{/each}
		</div>

		<!-- Search and Project Overview -->
		<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
			<form class="flex flex-1 items-center gap-2" onsubmit={handleSearch}>
				<input
					type="text"
					placeholder={`Search ${selectedType}s...`}
					class="flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-blue-400"
					bind:value={searchTerm}
					aria-label={`Search ${selectedType}s`}
				/>
				<Button type="submit" size="sm" class="shrink-0">Search</Button>
			</form>
			<Button
				variant="ghost"
				size="sm"
				onclick={handleProjectWide}
				class="w-full sm:w-auto sm:whitespace-nowrap"
			>
				Project overview
			</Button>
		</div>

		<!-- Loading State -->
		{#if loading}
			<div class="flex flex-col items-center justify-center gap-3 py-12">
				<div
					class="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600 dark:border-slate-700 dark:border-t-blue-400"
				></div>
				<p class="text-sm text-slate-500 dark:text-slate-400">Loading {selectedType}s...</p>
			</div>

			<!-- Error State -->
		{:else if errorMessage}
			<div
				class="rounded-xl border border-red-200 bg-gradient-to-br from-red-50 to-rose-50 px-4 py-4 text-sm text-red-700 shadow-sm dark:border-red-900/40 dark:from-red-900/20 dark:to-rose-900/10 dark:text-red-200"
				role="alert"
			>
				<p class="font-semibold">Error</p>
				<p class="mt-1">{errorMessage}</p>
			</div>

			<!-- Empty State -->
		{:else if entities.length === 0}
			<div class="flex flex-col items-center justify-center gap-3 py-12 text-center">
				<div
					class="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-3xl dark:bg-slate-800"
				>
					{focusTypes.find((t) => t.value === selectedType)?.icon || '📭'}
				</div>
				<div>
					<p class="font-medium text-slate-700 dark:text-slate-200">
						No {selectedType}s found
					</p>
					<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
						This project doesn't have any {selectedType}s yet.
					</p>
				</div>
			</div>

			<!-- Entity List -->
		{:else}
			<div class="entity-list-scroll max-h-[400px] overflow-y-auto rounded-lg pr-1">
				<div class="grid gap-2.5 sm:gap-3" role="list">
					{#each entities as entity}
						<Card
							class={`cursor-pointer transition-all duration-200 hover:border-blue-400 hover:shadow-md dark:hover:border-blue-500 ${isActive(entity) ? 'border-blue-500 bg-gradient-to-br from-blue-50/90 to-indigo-50/70 shadow-md ring-2 ring-blue-200 dark:border-blue-400 dark:from-blue-900/30 dark:to-indigo-900/20 dark:ring-blue-800/40' : ''}`}
						>
						<CardBody padding="sm">
							<button
								type="button"
								class="w-full text-left transition-opacity hover:opacity-80"
								onclick={() => handleSelect(entity)}
								aria-pressed={isActive(entity)}
							>
								<p
									class="truncate text-sm font-semibold text-slate-900 dark:text-white"
									title={entity.name}
								>
									{entity.name}
								</p>
								<div class="mt-1 flex flex-wrap items-center gap-2">
									{#if entity.metadata?.state_key}
										<span
											class="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300"
										>
											{entity.metadata.state_key}
										</span>
									{/if}
									{#if entity.metadata?.due_at}
										<span class="text-xs text-slate-500 dark:text-slate-400">
											Due {new Date(entity.metadata.due_at).toLocaleDateString()}
										</span>
									{/if}
								</div>
							</button>
						</CardBody>
					</Card>
				{/each}
			</div>
		</div>
		{/if}
	</div>
</Modal>

<style>
	/* Custom scrollbar for entity list */
	.entity-list-scroll {
		scrollbar-width: thin;
		scrollbar-color: rgb(203 213 225) rgb(248 250 252);
	}

	.entity-list-scroll::-webkit-scrollbar {
		width: 6px;
	}

	.entity-list-scroll::-webkit-scrollbar-track {
		background: rgb(248 250 252); /* slate-50 */
		border-radius: 4px;
	}

	.entity-list-scroll::-webkit-scrollbar-thumb {
		background: rgb(203 213 225); /* slate-300 */
		border-radius: 4px;
	}

	.entity-list-scroll::-webkit-scrollbar-thumb:hover {
		background: rgb(148 163 184); /* slate-400 */
	}

	/* Dark mode adjustments */
	:global(.dark) .entity-list-scroll {
		scrollbar-color: rgb(71 85 105) rgb(15 23 42);
	}

	:global(.dark) .entity-list-scroll::-webkit-scrollbar-track {
		background: rgb(15 23 42); /* slate-950 */
	}

	:global(.dark) .entity-list-scroll::-webkit-scrollbar-thumb {
		background: rgb(71 85 105); /* slate-600 */
	}

	:global(.dark) .entity-list-scroll::-webkit-scrollbar-thumb:hover {
		background: rgb(100 116 139); /* slate-500 */
	}
</style>
