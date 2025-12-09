// apps/web/src/lib/components/ontology/linked-entities/index.ts
/**
 * LinkedEntities component exports.
 *
 * Usage:
 * ```svelte
 * <script>
 *   import LinkedEntities from '$lib/components/ontology/linked-entities';
 * </script>
 *
 * <LinkedEntities
 *   sourceId={task.id}
 *   sourceKind="task"
 *   projectId={projectId}
 *   onEntityClick={(kind, id) => openModal(kind, id)}
 * />
 * ```
 *
 * Documentation: /apps/web/docs/features/ontology/LINKED_ENTITIES_COMPONENT.md
 */

export { default } from './LinkedEntities.svelte';
export { default as LinkedEntities } from './LinkedEntities.svelte';
export { default as LinkedEntitiesSection } from './LinkedEntitiesSection.svelte';
export { default as LinkedEntitiesItem } from './LinkedEntitiesItem.svelte';
export { default as LinkPickerModal } from './LinkPickerModal.svelte';

export * from './linked-entities.types';
export * from './linked-entities.service';
