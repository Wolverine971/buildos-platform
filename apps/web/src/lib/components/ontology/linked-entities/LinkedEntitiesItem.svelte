<!-- apps/web/src/lib/components/ontology/linked-entities/LinkedEntitiesItem.svelte -->
<!--
	Single linked entity item row with click navigation and remove button.

	Documentation: /apps/web/docs/features/ontology/LINKED_ENTITIES_COMPONENT.md
-->
<script lang="ts">
	import { X } from 'lucide-svelte';
	import type { LinkedEntity, EntityKind } from './linked-entities.types';
	import { getEntityDisplayName, formatRelationshipLabel } from './linked-entities.types';
	import {
		RELATIONSHIP_DIRECTIONS,
		getRelationshipLabel,
		type RelationshipType
	} from '$lib/services/ontology/edge-direction';

	interface Props {
		entity: LinkedEntity;
		kind: EntityKind;
		readOnly?: boolean;
		onRemove?: (entity: LinkedEntity, kind: EntityKind) => void;
		onClick?: (kind: EntityKind, id: string) => void;
	}

	let { entity, kind, readOnly = false, onRemove, onClick }: Props = $props();

	const displayName = $derived(getEntityDisplayName(entity));
	const relationshipLabel = $derived(() => {
		const rel = entity.edge_rel || '';
		if (rel in RELATIONSHIP_DIRECTIONS) {
			const label = getRelationshipLabel(
				rel as RelationshipType,
				entity.edge_direction === 'outgoing'
			);
			return label ? label.charAt(0).toLowerCase() + label.slice(1) : '';
		}
		return formatRelationshipLabel(rel);
	});

	function handleClick() {
		onClick?.(kind, entity.id);
	}

	function handleRemove(e: MouseEvent) {
		e.stopPropagation();
		onRemove?.(entity, kind);
	}
</script>

<div
	class="group flex items-center justify-between gap-2 px-4 py-2 hover:bg-muted/30 transition-colors"
>
	<button
		type="button"
		class="flex-1 min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 rounded"
		onclick={handleClick}
	>
		<span
			class="block text-sm text-foreground group-hover:text-accent truncate transition-colors"
		>
			{displayName}
		</span>
		<div class="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
			<span>{relationshipLabel}</span>
			{#if entity.state_key}
				<span class="text-muted-foreground/60">·</span>
				<span>{entity.state_key}</span>
			{/if}
			{#if entity.due_at}
				<span class="text-muted-foreground/60">·</span>
				<span>
					{new Date(entity.due_at).toLocaleDateString(undefined, {
						month: 'short',
						day: 'numeric'
					})}
				</span>
			{/if}
		</div>
	</button>

	{#if !readOnly}
		<button
			type="button"
			class="p-1 rounded opacity-0 group-hover:opacity-100
				text-muted-foreground hover:text-destructive hover:bg-destructive/10
				transition-all duration-150 focus:opacity-100 focus:outline-none
				focus-visible:ring-2 focus-visible:ring-destructive"
			onclick={handleRemove}
			aria-label="Remove link to {displayName}"
		>
			<X class="w-3.5 h-3.5" />
		</button>
	{/if}
</div>
