<!-- apps/web/src/lib/components/agent/ProjectFocusSelector.svelte -->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import {
		CheckSquare,
		Target,
		ListTree,
		FileText,
		Package,
		Flag,
		Search,
		Loader,
		CircleCheck,
		LayoutGrid
	} from 'lucide-svelte';
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

	const focusTypes: Array<{
		value: FocusEntityType;
		label: string;
		icon: typeof CheckSquare;
		color: string;
	}> = [
		{ value: 'task', label: 'Tasks', icon: CheckSquare, color: 'blue' },
		{ value: 'goal', label: 'Goals', icon: Target, color: 'purple' },
		{ value: 'plan', label: 'Plans', icon: ListTree, color: 'emerald' },
		{ value: 'document', label: 'Documents', icon: FileText, color: 'amber' },
		{ value: 'output', label: 'Outputs', icon: Package, color: 'rose' },
		{ value: 'milestone', label: 'Milestones', icon: Flag, color: 'indigo' }
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
		if (!browser) return;
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

<Modal {isOpen} {onClose} title="Focus on {projectName}" size="lg">
	<div class="flex h-full min-h-[500px] max-h-[70vh] flex-col">
		<!-- Compact Filter Bar -->
		<div
			class="border-b border-slate-200/60 bg-gradient-to-r from-slate-50/50 to-white/50 px-4 py-3 dark:border-slate-700/60 dark:from-slate-900/50 dark:to-slate-800/50"
		>
			<div class="mb-2 flex items-center justify-between">
				<div class="flex flex-wrap gap-1.5">
					{#each focusTypes as type}
						{@const IconComponent = type.icon}
						{@const isSelected = selectedType === type.value}
						{@const colorClasses = {
							blue: isSelected
								? 'bg-blue-500/10 text-blue-700 ring-1 ring-blue-500/30 dark:bg-blue-900/20 dark:text-blue-300 dark:ring-blue-400/30'
								: '',
							purple: isSelected
								? 'bg-purple-500/10 text-purple-700 ring-1 ring-purple-500/30 dark:bg-purple-900/20 dark:text-purple-300 dark:ring-purple-400/30'
								: '',
							emerald: isSelected
								? 'bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/30 dark:bg-emerald-900/20 dark:text-emerald-300 dark:ring-emerald-400/30'
								: '',
							amber: isSelected
								? 'bg-amber-500/10 text-amber-700 ring-1 ring-amber-500/30 dark:bg-amber-900/20 dark:text-amber-300 dark:ring-amber-400/30'
								: '',
							rose: isSelected
								? 'bg-rose-500/10 text-rose-700 ring-1 ring-rose-500/30 dark:bg-rose-900/20 dark:text-rose-300 dark:ring-rose-400/30'
								: '',
							indigo: isSelected
								? 'bg-indigo-500/10 text-indigo-700 ring-1 ring-indigo-500/30 dark:bg-indigo-900/20 dark:text-indigo-300 dark:ring-indigo-400/30'
								: ''
						}}
						<button
							type="button"
							onclick={() => (selectedType = type.value)}
							aria-pressed={isSelected}
							class={`
								group inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium
								transition-all duration-200
								${
									isSelected
										? colorClasses[type.color as keyof typeof colorClasses]
										: 'bg-slate-100/50 text-slate-600 hover:bg-slate-200/70 dark:bg-slate-800/50 dark:text-slate-400 dark:hover:bg-slate-700/70'
								}
							`}
						>
							<IconComponent class="h-3.5 w-3.5" />
							<span>{type.label}</span>
						</button>
					{/each}
				</div>
				<Button variant="ghost" size="sm" onclick={handleProjectWide} class="shrink-0">
					<LayoutGrid class="h-4 w-4" />
					<span class="hidden sm:inline">Overview</span>
				</Button>
			</div>

			<!-- Compact Search Bar -->
			<form onsubmit={handleSearch} class="flex items-center gap-2">
				<div class="relative flex-1">
					<Search
						class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
					/>
					<input
						type="text"
						inputmode="search"
						enterkeyhint="search"
						placeholder={`Search ${selectedType}s...`}
						class="w-full rounded-md border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs transition-colors placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-blue-400"
						bind:value={searchTerm}
						aria-label={`Search ${selectedType}s`}
					/>
				</div>
				<Button type="submit" size="sm" variant="ghost" class="shrink-0 px-2">
					Search
				</Button>
			</form>
		</div>

		<!-- Content Area -->
		<div class="flex-1 overflow-y-auto p-4">
			{#if loading}
				<!-- Loading State -->
				<div class="flex items-center justify-center py-16">
					<Loader class="h-6 w-6 animate-spin text-slate-400 dark:text-slate-500" />
				</div>
			{:else if errorMessage}
				<!-- Error State -->
				<div
					class="mx-auto max-w-md rounded-lg border border-red-200 bg-gradient-to-br from-red-50/50 to-rose-50/30 dither-soft px-4 py-3 dark:border-red-900/40 dark:from-red-900/20 dark:to-rose-900/10"
					role="alert"
				>
					<p class="text-xs font-semibold text-red-700 dark:text-red-300">Error</p>
					<p class="mt-0.5 text-xs text-red-600 dark:text-red-400">{errorMessage}</p>
				</div>
			{:else if entities.length === 0}
				{@const currentType = focusTypes.find((t) => t.value === selectedType)}
				<!-- Empty State -->
				<div class="flex flex-col items-center justify-center py-16 text-center">
					{#if currentType}
						{@const IconComponent = currentType.icon}
						<div
							class="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
							aria-hidden="true"
						>
							<IconComponent class="h-6 w-6" />
						</div>
					{/if}
					<p class="text-sm font-medium text-slate-700 dark:text-slate-300">
						No {selectedType}s found
					</p>
					<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
						This project doesn't have any {selectedType}s yet.
					</p>
				</div>
			{:else}
				<!-- Entity List - Condensed -->
				<div class="space-y-1" role="list">
					{#each entities as entity (entity.id)}
						<button
							type="button"
							onclick={() => handleSelect(entity)}
							aria-pressed={isActive(entity)}
							class={`
								group w-full rounded-lg border px-3 py-2 text-left transition-all duration-200
								${
									isActive(entity)
										? 'border-blue-500 bg-gradient-to-r from-blue-50/80 to-indigo-50/60 dither-soft shadow-sm ring-1 ring-blue-200 dark:border-blue-400 dark:from-blue-900/30 dark:to-indigo-900/20 dark:ring-blue-800/40'
										: 'border-slate-200/50 bg-gradient-to-br from-white/70 via-slate-50/30 to-white/60 dither-subtle dither-fade-hover hover:border-slate-300 hover:shadow-sm dark:border-slate-700/50 dark:from-slate-900/70 dark:via-slate-900/40 dark:to-slate-900/60 dark:hover:border-slate-600'
								}
							`}
						>
							<div class="flex items-start justify-between gap-2">
								<div class="min-w-0 flex-1">
									<p
										class="truncate text-sm font-semibold text-slate-900 dark:text-white"
										title={entity.name}
									>
										{entity.name}
									</p>
									<div class="mt-1 flex flex-wrap items-center gap-1.5">
										{#if entity.metadata?.state_key}
											<span
												class="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-600 dark:bg-slate-700/70 dark:text-slate-300"
											>
												{entity.metadata.state_key}
											</span>
										{/if}
										{#if entity.metadata?.due_at}
											<span
												class="text-[10px] text-slate-500 dark:text-slate-400"
											>
												Due {new Date(
													entity.metadata.due_at
												).toLocaleDateString('en-US', {
													month: 'short',
													day: 'numeric'
												})}
											</span>
										{/if}
									</div>
								</div>
								{#if isActive(entity)}
									<CircleCheck
										class="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400"
									/>
								{/if}
							</div>
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</Modal>
