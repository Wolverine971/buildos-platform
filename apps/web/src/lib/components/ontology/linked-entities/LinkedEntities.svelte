<!-- apps/web/src/lib/components/ontology/linked-entities/LinkedEntities.svelte -->
<!--
	Self-contained component for displaying and managing entity relationships.

	Performance optimizations:
	- Accepts optional initialLinkedEntities prop from parent /full endpoint
	- Defers available entities fetching until user clicks "Add"
	- Caches loaded available entities per kind

	Documentation: /apps/web/docs/features/ontology/LINKED_ENTITIES_COMPONENT.md

	Usage:
	<LinkedEntities
		sourceId={task.id}
		sourceKind="task"
		projectId={projectId}
		initialLinkedEntities={dataFromFullEndpoint?.linkedEntities}
		onEntityClick={(kind, id) => openModal(kind, id)}
		onLinksChanged={() => refreshParent()}
	/>
-->
<script lang="ts">
	import { toastService } from '$lib/stores/toast.store';
	import type {
		EntityKind,
		LinkedEntitiesResult,
		LinkedEntity,
		AvailableEntity
	} from './linked-entities.types';
	import { ENTITY_SECTIONS } from './linked-entities.types';
	import {
		fetchLinkedEntities,
		fetchAvailableEntities,
		linkEntities,
		unlinkEntity
	} from './linked-entities.service';
	import LinkedEntitiesSection from './LinkedEntitiesSection.svelte';
	import LinkPickerModal from './LinkPickerModal.svelte';

	interface Props {
		sourceId: string;
		sourceKind: EntityKind;
		projectId: string;
		/** Pre-loaded linked entities from parent /full endpoint - skips initial fetch */
		initialLinkedEntities?: LinkedEntitiesResult;
		onEntityClick?: (kind: EntityKind, id: string) => void;
		onLinksChanged?: () => void;
		allowedEntityTypes?: EntityKind[];
		readOnly?: boolean;
	}

	let {
		sourceId,
		sourceKind,
		projectId,
		initialLinkedEntities,
		onEntityClick,
		onLinksChanged,
		allowedEntityTypes,
		readOnly = false
	}: Props = $props();

	// State
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let linkedEntities = $state<LinkedEntitiesResult>({
		tasks: [],
		plans: [],
		goals: [],
		milestones: [],
		documents: [],
		risks: [],
		events: []
	});

	// Track which kinds have been loaded for available entities
	let loadedAvailableKinds = $state<Set<EntityKind>>(new Set());
	let availableEntitiesCache = $state<Record<EntityKind, AvailableEntity[]>>({
		task: [],
		plan: [],
		goal: [],
		milestone: [],
		document: [],
		risk: [],
		event: []
	});
	let loadingAvailableKind = $state<EntityKind | null>(null);

	// Link picker modal state
	let showLinkPicker = $state(false);
	let linkPickerKind = $state<EntityKind>('task');

	// Filter sections based on allowedEntityTypes and exclude self-type unless explicitly allowed
	const visibleSections = $derived.by(() => {
		let sections = ENTITY_SECTIONS;

		// Filter by allowed types if specified
		if (allowedEntityTypes && allowedEntityTypes.length > 0) {
			sections = sections.filter((s) => allowedEntityTypes.includes(s.kind));
		}

		// Don't show the same kind as the source (except tasks/documents can self-link)
		const allowsSelfLink = sourceKind === 'task' || sourceKind === 'document';
		if (!allowsSelfLink) {
			sections = sections.filter((s) => s.kind !== sourceKind);
		}

		return sections;
	});

	// Reactive mapping of entities by kind - fixes Svelte 5 reactivity with function calls
	const entitiesByKind = $derived.by(() => ({
		task: linkedEntities.tasks,
		plan: linkedEntities.plans,
		goal: linkedEntities.goals,
		milestone: linkedEntities.milestones,
		document: linkedEntities.documents,
		risk: linkedEntities.risks,
		event: linkedEntities.events
	}));

	// Reactive mapping of available counts by kind
	const availableCountByKind = $derived.by(() => {
		const counts: Record<EntityKind, number> = {
			task: -1,
			plan: -1,
			goal: -1,
			milestone: -1,
			document: -1,
			risk: -1,
			event: -1
		};
		for (const kind of [
			'task',
			'plan',
			'goal',
			'milestone',
			'document',
			'risk',
			'event'
		] as EntityKind[]) {
			if (!loadedAvailableKinds.has(kind)) {
				counts[kind] = -1;
			} else {
				const available = availableEntitiesCache[kind] || [];
				counts[kind] = available.filter((e) => !e.isLinked).length;
			}
		}
		return counts;
	});

	// Load data on mount and when source changes
	$effect(() => {
		if (sourceId && sourceKind && projectId) {
			// Reset available entities cache when source changes
			loadedAvailableKinds = new Set();
			availableEntitiesCache = {
				task: [],
				plan: [],
				goal: [],
				milestone: [],
				document: [],
				risk: [],
				event: []
			};

			// Use initial data if provided, otherwise fetch
			if (initialLinkedEntities) {
				// Merge with defaults to ensure all properties are arrays (not undefined)
				linkedEntities = {
					tasks: initialLinkedEntities.tasks ?? [],
					plans: initialLinkedEntities.plans ?? [],
					goals: initialLinkedEntities.goals ?? [],
					milestones: initialLinkedEntities.milestones ?? [],
					documents: initialLinkedEntities.documents ?? [],
					risks: initialLinkedEntities.risks ?? [],
					events: initialLinkedEntities.events ?? []
				};
				isLoading = false;
				error = null;
			} else {
				loadData();
			}
		}
	});

	async function loadData() {
		isLoading = true;
		error = null;

		try {
			// Performance: skip fetching available entities on initial load
			const result = await fetchLinkedEntities(sourceId, sourceKind, projectId, {
				includeAvailable: false
			});
			linkedEntities = result.linkedEntities;
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to load linked entities';
			error = message;
			console.error('[LinkedEntities] Load error:', err);
		} finally {
			isLoading = false;
		}
	}

	/**
	 * Lazy-load available entities for a specific kind when user clicks "Add"
	 */
	async function loadAvailableForKind(kind: EntityKind): Promise<AvailableEntity[]> {
		// Return cached if already loaded
		if (loadedAvailableKinds.has(kind)) {
			return availableEntitiesCache[kind];
		}

		loadingAvailableKind = kind;

		try {
			// Get IDs of already-linked entities of this kind
			const linkedIds = entitiesByKind[kind].map((e) => e.id);

			const entities = await fetchAvailableEntities(
				sourceId,
				sourceKind,
				projectId,
				kind,
				linkedIds
			);

			// Cache the results
			availableEntitiesCache[kind] = entities;
			loadedAvailableKinds = new Set([...loadedAvailableKinds, kind]);

			return entities;
		} catch (err) {
			const message =
				err instanceof Error ? err.message : 'Failed to load available entities';
			toastService.error(message);
			console.error('[LinkedEntities] Load available error:', err);
			return [];
		} finally {
			loadingAvailableKind = null;
		}
	}

	async function handleAddClick(kind: EntityKind) {
		linkPickerKind = kind;

		// Load available entities for this kind if not already loaded
		if (!loadedAvailableKinds.has(kind)) {
			await loadAvailableForKind(kind);
		}

		showLinkPicker = true;
	}

	async function handleRemoveLink(entity: LinkedEntity, kind: EntityKind) {
		// Optimistic update: find and remove the entity
		const backup = { ...linkedEntities };

		// Remove from all arrays
		for (const key of Object.keys(linkedEntities) as (keyof LinkedEntitiesResult)[]) {
			linkedEntities[key] = linkedEntities[key].filter((e) => e.edge_id !== entity.edge_id);
		}

		try {
			await unlinkEntity({
				sourceId,
				sourceKind,
				projectId,
				linkedEntity: entity,
				linkedKind: kind
			});
			toastService.success('Link removed');
			// Invalidate available cache since something was unlinked
			loadedAvailableKinds = new Set();
			onLinksChanged?.();
		} catch (err) {
			// Revert on error
			linkedEntities = backup;
			const message = err instanceof Error ? err.message : 'Failed to remove link';
			toastService.error(message);
		}
	}

	async function handleLinksAdded(targetIds: string[]) {
		if (targetIds.length === 0) return;

		try {
			await linkEntities({
				sourceId,
				sourceKind,
				targetIds,
				targetKind: linkPickerKind,
				projectId
			});
			toastService.success(
				`Linked ${targetIds.length} ${targetIds.length === 1 ? 'item' : 'items'}`
			);

			// Reload linked entities to get fresh data with edge IDs
			await loadData();
			// Invalidate available cache since something was linked
			loadedAvailableKinds = new Set();
			onLinksChanged?.();
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to create links';
			toastService.error(message);
		}

		showLinkPicker = false;
	}

	// Reactive getter for available entities (used by modal)
	const availableForSelectedKind = $derived(availableEntitiesCache[linkPickerKind] || []);
</script>

<div class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden">
	<!-- Header -->
	<div class="px-3 py-2 border-b border-border bg-muted/30">
		<h3
			class="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2"
		>
			<span class="w-1.5 h-1.5 bg-purple-500 rounded-full"></span>
			Linked Entities
		</h3>
	</div>

	<!-- Content -->
	<div class="divide-y divide-border">
		{#if isLoading}
			<!-- Skeleton Loading State -->
			{#each visibleSections as section (section.kind)}
				<div class="px-3 py-2 flex items-center justify-between animate-pulse">
					<div class="flex items-center gap-2">
						<div class="w-3.5 h-3.5 rounded bg-muted"></div>
						<div class="w-3.5 h-3.5 rounded bg-muted"></div>
						<div class="h-4 w-16 rounded bg-muted"></div>
						<div class="h-3 w-6 rounded bg-muted"></div>
					</div>
					<div class="w-5 h-5 rounded bg-muted"></div>
				</div>
			{/each}
		{:else if error}
			<!-- Error State -->
			<div class="px-4 py-6 text-center">
				<p class="text-sm text-destructive">{error}</p>
				<button
					type="button"
					class="mt-2 text-xs text-accent hover:underline"
					onclick={() => loadData()}
				>
					Try again
				</button>
			</div>
		{:else}
			<!-- Loaded State -->
			{#each visibleSections as section (section.kind)}
				<LinkedEntitiesSection
					config={section}
					entities={entitiesByKind[section.kind]}
					availableToLinkCount={availableCountByKind[section.kind]}
					isLoadingAvailable={loadingAvailableKind === section.kind}
					{readOnly}
					onAdd={handleAddClick}
					onRemove={handleRemoveLink}
					{onEntityClick}
				/>
			{/each}
		{/if}
	</div>
</div>

<!-- Link Picker Modal -->
{#if showLinkPicker}
	<LinkPickerModal
		kind={linkPickerKind}
		availableEntities={availableForSelectedKind}
		onClose={() => (showLinkPicker = false)}
		onConfirm={handleLinksAdded}
	/>
{/if}
