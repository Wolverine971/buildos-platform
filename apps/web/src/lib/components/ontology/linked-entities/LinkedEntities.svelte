<!-- apps/web/src/lib/components/ontology/linked-entities/LinkedEntities.svelte -->
<!--
	Self-contained component for displaying and managing entity relationships.
	Fetches its own data and handles loading states with skeleton UI.

	Documentation: /apps/web/docs/features/ontology/LINKED_ENTITIES_COMPONENT.md

	Usage:
	<LinkedEntities
		sourceId={task.id}
		sourceKind="task"
		projectId={projectId}
		onEntityClick={(kind, id) => openModal(kind, id)}
		onLinksChanged={() => refreshParent()}
	/>
-->
<script lang="ts">
	import { toastService } from '$lib/stores/toast.store';
	import type {
		EntityKind,
		LinkedEntitiesResult,
		AvailableEntitiesResult
	} from './linked-entities.types';
	import { ENTITY_SECTIONS } from './linked-entities.types';
	import { fetchLinkedEntities, deleteEdge, createEdges } from './linked-entities.service';
	import LinkedEntitiesSection from './LinkedEntitiesSection.svelte';
	import LinkPickerModal from './LinkPickerModal.svelte';

	interface Props {
		sourceId: string;
		sourceKind: EntityKind;
		projectId: string;
		onEntityClick?: (kind: EntityKind, id: string) => void;
		onLinksChanged?: () => void;
		allowedEntityTypes?: EntityKind[];
		readOnly?: boolean;
	}

	let {
		sourceId,
		sourceKind,
		projectId,
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
		outputs: [],
		risks: []
	});
	let availableEntities = $state<AvailableEntitiesResult>({
		tasks: [],
		plans: [],
		goals: [],
		milestones: [],
		documents: [],
		outputs: [],
		risks: []
	});

	// Link picker modal state
	let showLinkPicker = $state(false);
	let linkPickerKind = $state<EntityKind>('task');

	// Filter sections based on allowedEntityTypes and exclude self-type for non-tasks
	const visibleSections = $derived.by(() => {
		let sections = ENTITY_SECTIONS;

		// Filter by allowed types if specified
		if (allowedEntityTypes && allowedEntityTypes.length > 0) {
			sections = sections.filter((s) => allowedEntityTypes.includes(s.kind));
		}

		// Don't show the same kind as the source (except tasks can link to tasks)
		if (sourceKind !== 'task') {
			sections = sections.filter((s) => s.kind !== sourceKind);
		}

		return sections;
	});

	// Load data on mount and when source changes
	$effect(() => {
		if (sourceId && sourceKind && projectId) {
			loadData();
		}
	});

	async function loadData() {
		isLoading = true;
		error = null;

		try {
			const result = await fetchLinkedEntities(sourceId, sourceKind, projectId);
			linkedEntities = result.linkedEntities;
			availableEntities = result.availableEntities;
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to load linked entities';
			error = message;
			console.error('[LinkedEntities] Load error:', err);
		} finally {
			isLoading = false;
		}
	}

	function handleAddClick(kind: EntityKind) {
		linkPickerKind = kind;
		showLinkPicker = true;
	}

	async function handleRemoveLink(edgeId: string) {
		// Optimistic update: find and remove the entity
		const backup = { ...linkedEntities };

		// Remove from all arrays
		for (const key of Object.keys(linkedEntities) as (keyof LinkedEntitiesResult)[]) {
			linkedEntities[key] = linkedEntities[key].filter((e) => e.edge_id !== edgeId);
		}

		try {
			await deleteEdge(edgeId);
			toastService.success('Link removed');
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
			await createEdges(sourceId, sourceKind, targetIds, linkPickerKind);
			toastService.success(
				`Linked ${targetIds.length} ${targetIds.length === 1 ? 'item' : 'items'}`
			);

			// Reload to get fresh data with edge IDs
			await loadData();
			onLinksChanged?.();
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to create links';
			toastService.error(message);
		}

		showLinkPicker = false;
	}

	function getEntitiesForKind(kind: EntityKind) {
		return linkedEntities[`${kind}s` as keyof LinkedEntitiesResult] || [];
	}

	function getAvailableForKind(kind: EntityKind) {
		return availableEntities[`${kind}s` as keyof AvailableEntitiesResult] || [];
	}

	function getAvailableCountForKind(kind: EntityKind): number {
		const available = getAvailableForKind(kind);
		// Count only unlinked entities
		return available.filter((e) => !e.isLinked).length;
	}
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
					entities={getEntitiesForKind(section.kind)}
					availableToLinkCount={getAvailableCountForKind(section.kind)}
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
		availableEntities={getAvailableForKind(linkPickerKind)}
		onClose={() => (showLinkPicker = false)}
		onConfirm={handleLinksAdded}
	/>
{/if}
