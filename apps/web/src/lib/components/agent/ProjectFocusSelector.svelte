<!-- apps/web/src/lib/components/agent/ProjectFocusSelector.svelte -->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import {
		CheckSquare,
		Target,
		ListTree,
		FileText,
		Flag,
		AlertTriangle,
		Search,
		Loader,
		CircleCheck,
		LayoutGrid,
		X
	} from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import type { FocusEntitySummary, ProjectFocus } from '@buildos/shared-types';
	import {
		DEFAULT_PROJECT_ENTITY_RESULT_LIMIT,
		MAX_PROJECT_ENTITY_RESULT_LIMIT,
		PROJECT_ENTITY_SEARCH_DEBOUNCE_MS,
		fetchProjectEntities,
		normalizeEntitySearch,
		type FocusEntityType
	} from './project-entity-browser';

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
		{ value: 'milestone', label: 'Milestones', icon: Flag, color: 'indigo' },
		{ value: 'risk', label: 'Risks', icon: AlertTriangle, color: 'red' }
	];

	let selectedType = $state<FocusEntityType>('task');
	let entities = $state<FocusEntitySummary[]>([]);
	let loading = $state(false);
	let errorMessage = $state<string | null>(null);
	let searchTerm = $state('');
	let abortController: AbortController | null = null;
	let entityRequestId = 0;
	let isSearchActive = $derived(normalizeEntitySearch(searchTerm).length > 0);

	async function loadEntities(type: FocusEntityType, searchValue = searchTerm) {
		if (!projectId) return;
		entityRequestId += 1;
		const requestId = entityRequestId;

		if (abortController) {
			abortController.abort();
		}

		abortController = new AbortController();
		loading = true;
		errorMessage = null;

		try {
			entities = await fetchProjectEntities({
				projectId,
				type,
				search: searchValue,
				limit: normalizeEntitySearch(searchValue)
					? MAX_PROJECT_ENTITY_RESULT_LIMIT
					: DEFAULT_PROJECT_ENTITY_RESULT_LIMIT,
				signal: abortController.signal
			});
		} catch (error) {
			if ((error as Error)?.name === 'AbortError' || requestId !== entityRequestId) {
				return;
			}
			console.error('[ProjectFocusSelector] Failed to load entities:', error);
			errorMessage = 'Unable to load entities for this project.';
			entities = [];
		} finally {
			if (requestId === entityRequestId) {
				loading = false;
			}
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

	$effect(() => {
		if (!browser) return;
		if (!isOpen || !projectId) return;
		const timeoutId = setTimeout(
			() => void loadEntities(selectedType, searchTerm),
			normalizeEntitySearch(searchTerm) ? PROJECT_ENTITY_SEARCH_DEBOUNCE_MS : 0
		);
		return () => clearTimeout(timeoutId);
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
		<!-- INKPRINT Compact Filter Bar -->
		<div class="border-b border-border bg-muted px-4 py-3 tx tx-frame tx-weak">
			<div class="mb-2 flex items-center justify-between">
				<div class="flex flex-wrap gap-2">
					{#each focusTypes as type}
						{@const IconComponent = type.icon}
						{@const isSelected = selectedType === type.value}
						<button
							type="button"
							onclick={() => (selectedType = type.value)}
							aria-pressed={isSelected}
							class={`
								group inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold
								shadow-ink transition-all duration-200 pressable
								${
									isSelected
										? 'border-accent bg-accent/10 text-accent'
										: 'border-border bg-card text-muted-foreground hover:border-accent hover:text-foreground'
								}
							`}
						>
							<IconComponent class="h-3.5 w-3.5" />
							<span>{type.label}</span>
						</button>
					{/each}
				</div>
				<Button variant="ghost" size="sm" onclick={handleProjectWide} class="shrink-0">
					<LayoutGrid class="h-4 w-4 shrink-0" />
					<span class="hidden sm:inline">Overview</span>
				</Button>
			</div>

			<!-- INKPRINT Search Bar -->
			<div class="flex items-center gap-2">
				<div class="relative flex-1">
					<Search
						class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
					/>
					<input
						type="text"
						inputmode="search"
						enterkeyhint="search"
						placeholder={`Search ${selectedType}s...`}
						class="w-full rounded-lg border border-border bg-background py-2 pl-10 pr-3 text-xs text-foreground shadow-ink-inner transition-colors placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring"
						bind:value={searchTerm}
						aria-label={`Search ${selectedType}s`}
					/>
					{#if isSearchActive}
						<button
							type="button"
							class="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							onclick={() => (searchTerm = '')}
							aria-label="Clear search"
						>
							<X class="h-3.5 w-3.5" />
						</button>
					{/if}
				</div>
			</div>
		</div>

		<!-- Content Area -->
		<div class="flex-1 overflow-y-auto p-4">
			{#if loading}
				<!-- INKPRINT Loading State -->
				<div class="flex items-center justify-center py-16">
					<Loader class="h-6 w-6 animate-spin text-muted-foreground" />
				</div>
			{:else if errorMessage}
				<!-- INKPRINT Error State with Static texture -->
				<div
					class="mx-auto max-w-md rounded-lg border border-red-600/30 bg-red-50 px-4 py-3 shadow-ink tx tx-static tx-weak dark:bg-red-950/20"
					role="alert"
				>
					<p class="text-xs font-semibold text-red-700 dark:text-red-300">Error</p>
					<p class="mt-0.5 text-xs text-red-600 dark:text-red-400">{errorMessage}</p>
				</div>
			{:else if entities.length === 0}
				{@const currentType = focusTypes.find((t) => t.value === selectedType)}
				<!-- INKPRINT Empty State with Bloom texture -->
				<div class="flex flex-col items-center justify-center py-16 text-center">
					{#if currentType}
						{@const IconComponent = currentType.icon}
						<div
							class="mb-3 flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground shadow-ink tx tx-bloom tx-weak"
							aria-hidden="true"
						>
							<IconComponent class="h-6 w-6" />
						</div>
					{/if}
					<p class="text-sm font-semibold text-foreground">
						{#if isSearchActive}No matches{:else}No {selectedType}s found{/if}
					</p>
					<p class="mt-1 text-xs text-muted-foreground">
						{#if isSearchActive}
							No {selectedType}s match "{normalizeEntitySearch(searchTerm)}"
						{:else}
							This project doesn't have any {selectedType}s yet.
						{/if}
					</p>
				</div>
			{:else}
				<!-- INKPRINT Entity List -->
				<div class="space-y-2" role="list">
					{#each entities as entity (entity.id)}
						<button
							type="button"
							onclick={() => handleSelect(entity)}
							aria-pressed={isActive(entity)}
							class={`
								group w-full rounded-lg border p-3 text-left shadow-ink transition-all duration-200 pressable
								${
									isActive(entity)
										? 'border-accent bg-accent/5 ring-1 ring-accent/30'
										: 'border-border bg-card hover:border-accent hover:bg-muted/50 hover:shadow-ink-strong'
								}
							`}
						>
							<div class="flex items-start justify-between gap-2">
								<div class="min-w-0 flex-1">
									<p
										class="truncate text-sm font-semibold text-foreground"
										title={entity.name}
									>
										{entity.name}
									</p>
									<div class="mt-1 flex flex-wrap items-center gap-2">
										{#if entity.metadata?.state_key}
											<span
												class="inline-flex items-center rounded-lg border border-border bg-muted p-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground"
											>
												{entity.metadata.state_key}
											</span>
										{/if}
										{#if entity.metadata?.due_at}
											<span
												class="text-[10px] font-medium text-muted-foreground"
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
									<CircleCheck class="h-4 w-4 shrink-0 text-accent" />
								{/if}
							</div>
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</Modal>
