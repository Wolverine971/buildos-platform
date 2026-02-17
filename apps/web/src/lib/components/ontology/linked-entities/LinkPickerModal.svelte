<!-- apps/web/src/lib/components/ontology/linked-entities/LinkPickerModal.svelte -->
<!--
	Modal for selecting entities to link via multi-select with search.

	Documentation: /apps/web/docs/features/ontology/LINKED_ENTITIES_COMPONENT.md
-->
<script lang="ts">
	import { Search, Check } from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import type { EntityKind, AvailableEntity } from './linked-entities.types';
	import { ENTITY_SECTIONS, getEntityDisplayName } from './linked-entities.types';
	import { filterEntities } from './linked-entities.service';

	interface Props {
		kind: EntityKind;
		availableEntities: AvailableEntity[];
		onClose: () => void;
		onConfirm: (selectedIds: string[]) => void;
	}

	let { kind, availableEntities, onClose, onConfirm }: Props = $props();

	let searchQuery = $state('');
	let selectedIds = $state<Set<string>>(new Set());
	let isOpen = $state(true);

	// Get section config for display
	const sectionConfig = $derived(ENTITY_SECTIONS.find((s) => s.kind === kind));
	const title = $derived(`Link ${sectionConfig?.labelPlural || 'Entities'}`);

	// Filter entities by search and separate linked vs available
	const filteredEntities = $derived(filterEntities(availableEntities, searchQuery));
	const unlinkedEntities = $derived(filteredEntities.filter((e) => !e.isLinked));
	const linkedEntities = $derived(filteredEntities.filter((e) => e.isLinked));

	const selectedCount = $derived(selectedIds.size);
	const availableCount = $derived(unlinkedEntities.length);

	function toggleSelection(id: string) {
		const newSet = new Set(selectedIds);
		if (newSet.has(id)) {
			newSet.delete(id);
		} else {
			newSet.add(id);
		}
		selectedIds = newSet;
	}

	function handleConfirm() {
		onConfirm(Array.from(selectedIds));
	}

	function handleClose() {
		isOpen = false;
		onClose();
	}

	// Debounce search input
	let searchTimeout: ReturnType<typeof setTimeout>;
	function handleSearchInput(e: Event) {
		const target = e.target as HTMLInputElement;
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			searchQuery = target.value;
		}, 150);
	}
</script>

<Modal bind:isOpen size="sm" onClose={handleClose}>
	{#snippet header()}
		<div class="px-4 py-3 border-b border-border tx tx-strip tx-weak">
			<h2 class="text-base font-semibold text-foreground">{title}</h2>
		</div>
	{/snippet}

	{#snippet children()}
		<div class="flex flex-col" style="max-height: 60vh;">
			<!-- Search Input -->
			<div class="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-border tx tx-grain tx-weak">
				<div class="relative">
					<Search
						class="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground pointer-events-none"
					/>
					<input
						type="text"
						placeholder="Search {sectionConfig?.labelPlural.toLowerCase() ||
							'entities'}..."
						class="w-full pl-8 sm:pl-9 pr-3 py-1.5 sm:py-2 text-xs sm:text-sm bg-muted border border-border rounded-md
							placeholder:text-muted-foreground
							focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50 transition-colors"
						oninput={handleSearchInput}
					/>
				</div>
			</div>

			<!-- Entity List -->
			<div
				class="flex-1 overflow-y-auto min-h-[150px] sm:min-h-[200px] max-h-[250px] sm:max-h-[300px]"
			>
				{#if filteredEntities.length === 0}
					<div
						class="px-3 sm:px-4 py-6 sm:py-8 text-center text-muted-foreground text-xs sm:text-sm tx tx-bloom tx-weak"
					>
						{#if searchQuery}
							No matching {sectionConfig?.labelPlural.toLowerCase() || 'entities'} found
						{:else}
							No {sectionConfig?.labelPlural.toLowerCase() || 'entities'} available to
							link
						{/if}
					</div>
				{:else}
					<!-- Already linked items (shown first, disabled) -->
					{#each linkedEntities as entity (entity.id)}
						<div
							class="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5 border-b border-border/50 opacity-50 cursor-not-allowed"
						>
							<div
								class="w-4 h-4 sm:w-5 sm:h-5 rounded border border-border bg-muted flex items-center justify-center"
							>
								<Check class="w-3 h-3 sm:w-3.5 sm:h-3.5 text-muted-foreground" />
							</div>
							<div class="flex-1 min-w-0">
								<span class="text-xs sm:text-sm text-foreground truncate block">
									{getEntityDisplayName(entity)}
								</span>
								<span class="text-[10px] sm:text-xs text-muted-foreground"
									>Already linked</span
								>
							</div>
						</div>
					{/each}

					<!-- Available items (can be selected) -->
					{#each unlinkedEntities as entity (entity.id)}
						{@const isSelected = selectedIds.has(entity.id)}
						<button
							type="button"
							class="w-full flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5 border-b border-border/50
								hover:bg-muted transition-colors text-left pressable
								focus:outline-none focus-visible:bg-muted"
							onclick={() => toggleSelection(entity.id)}
						>
							<div
								class="w-4 h-4 sm:w-5 sm:h-5 rounded border transition-colors duration-[120ms] flex items-center justify-center
									{isSelected ? 'border-accent bg-accent' : 'border-border bg-background hover:border-accent/50'}"
							>
								{#if isSelected}
									<Check
										class="w-3 h-3 sm:w-3.5 sm:h-3.5 text-accent-foreground"
									/>
								{/if}
							</div>
							<div class="flex-1 min-w-0">
								<span class="text-xs sm:text-sm text-foreground truncate block">
									{getEntityDisplayName(entity)}
								</span>
								{#if entity.state_key}
									<span class="text-[10px] sm:text-xs text-muted-foreground"
										>{entity.state_key}</span
									>
								{/if}
							</div>
						</button>
					{/each}
				{/if}
			</div>

			<!-- Footer Info -->
			<div
				class="px-3 sm:px-4 py-1.5 sm:py-2 border-t border-border bg-muted text-[10px] sm:text-xs text-muted-foreground"
			>
				{selectedCount} of {availableCount} available selected
			</div>
		</div>
	{/snippet}

	{#snippet footer()}
		<div
			class="flex items-center justify-end gap-1.5 sm:gap-2 px-3 sm:px-4 py-3 border-t border-border bg-muted/50"
		>
			<Button variant="ghost" size="sm" onclick={handleClose} class="pressable">Cancel</Button
			>
			<Button
				variant="primary"
				size="sm"
				onclick={handleConfirm}
				disabled={selectedCount === 0}
				class="pressable"
			>
				Add Selected ({selectedCount})
			</Button>
		</div>
	{/snippet}
</Modal>
