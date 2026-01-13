<!-- apps/web/src/lib/components/ontology/linked-entities/LinkedEntitiesSection.svelte -->
<!--
	Collapsible section for a single entity type within LinkedEntities.

	Documentation: /apps/web/docs/features/ontology/LINKED_ENTITIES_COMPONENT.md
-->
<script lang="ts">
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import {
		ChevronRight,
		Plus,
		ListChecks,
		Layers,
		Target,
		Flag,
		FileText,
		AlertTriangle,
		Calendar,
		Loader
	} from 'lucide-svelte';
	import type { LinkedEntity, EntityKind, EntitySectionConfig } from './linked-entities.types';
	import LinkedEntitiesItem from './LinkedEntitiesItem.svelte';

	interface Props {
		config: EntitySectionConfig;
		entities: LinkedEntity[];
		availableToLinkCount?: number;
		isLoadingAvailable?: boolean;
		readOnly?: boolean;
		onAdd?: (kind: EntityKind) => void;
		onRemove?: (entity: LinkedEntity, kind: EntityKind) => void;
		onEntityClick?: (kind: EntityKind, id: string) => void;
	}

	let {
		config,
		entities,
		availableToLinkCount = -1,
		isLoadingAvailable = false,
		readOnly = false,
		onAdd,
		onRemove,
		onEntityClick
	}: Props = $props();

	let expanded = $state(false);

	// Defensive: handle undefined entities prop gracefully
	const safeEntities = $derived(entities ?? []);
	const linkedCount = $derived(safeEntities.length);
	const hasLinkedEntities = $derived(linkedCount > 0);

	// -1 means unknown (not loaded yet), treat as potentially having items
	const hasAvailableToLink = $derived(availableToLinkCount === -1 || availableToLinkCount > 0);

	// Can expand if there are linked entities to show
	const canExpand = $derived(hasLinkedEntities);

	// Section is disabled only if there's nothing to show AND confirmed nothing to add
	const isDisabled = $derived(!hasLinkedEntities && availableToLinkCount === 0);

	// Show add button if not readOnly and there may be entities available to link
	const showAddButton = $derived(!readOnly && hasAvailableToLink);

	// Icon component lookup
	const iconComponents: Record<EntityKind, typeof ListChecks> = {
		task: ListChecks,
		plan: Layers,
		goal: Target,
		milestone: Flag,
		document: FileText,
		risk: AlertTriangle,
		event: Calendar
	};

	const IconComponent = $derived(iconComponents[config.kind]);

	function toggleExpand() {
		if (canExpand) {
			expanded = !expanded;
		}
	}

	function handleAddClick(e: MouseEvent) {
		e.stopPropagation();
		onAdd?.(config.kind);
	}
</script>

<div class="border-b border-border last:border-b-0">
	<!-- Section Header -->
	<div class="w-full px-2 sm:px-3 py-1.5 sm:py-2 flex items-center justify-between">
		<button
			type="button"
			class="flex-1 flex items-center gap-1.5 sm:gap-2 min-w-0 transition-colors text-left rounded
				{isDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted/50 cursor-pointer pressable'}
				focus:outline-none focus-visible:bg-muted/50"
			onclick={toggleExpand}
			disabled={isDisabled}
			aria-expanded={expanded}
			aria-controls="section-{config.kind}"
		>
			<!-- Left side: chevron, icon, label, count -->
			<ChevronRight
				class="w-3 h-3 sm:w-3.5 sm:h-3.5 text-muted-foreground transition-transform duration-[120ms] flex-shrink-0
					{expanded ? 'rotate-90' : ''} {!canExpand ? 'opacity-30' : ''}"
			/>
			<IconComponent class="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0 {config.iconColor}" />
			<span class="text-xs sm:text-sm text-foreground">{config.labelPlural}</span>
			<span class="text-[10px] sm:text-xs text-muted-foreground">({linkedCount})</span>
		</button>

		<!-- Right side: add button or loading indicator -->
		{#if isLoadingAvailable}
			<div class="p-0.5 sm:p-1">
				<Loader class="w-3 h-3 sm:w-3.5 sm:h-3.5 text-muted-foreground animate-spin" />
			</div>
		{:else if showAddButton}
			<button
				type="button"
				class="p-0.5 sm:p-1 rounded text-muted-foreground hover:text-accent hover:bg-accent/10
					transition-colors duration-[120ms] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent pressable"
				onclick={handleAddClick}
				aria-label="Add {config.label.toLowerCase()}"
			>
				<Plus class="w-3 h-3 sm:w-3.5 sm:h-3.5" />
			</button>
		{/if}
	</div>

	<!-- Expanded Content -->
	{#if expanded && hasLinkedEntities}
		<div
			id="section-{config.kind}"
			class="border-t border-border/50"
			transition:slide={{ duration: 120, easing: cubicOut }}
		>
			{#each safeEntities as entity (entity.id)}
				<LinkedEntitiesItem
					{entity}
					kind={config.kind}
					{readOnly}
					{onRemove}
					onClick={onEntityClick}
				/>
			{/each}
		</div>
	{/if}
</div>
