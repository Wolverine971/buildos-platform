// apps/web/src/lib/components/task-entities/task-knowledge-deps.ts
//
// The knowledge card popover (card, enrich dialog, research queue), in one chunk the task card
// imports only once a task has a name in the knowledge graph, so the reader and task modal don't
// carry it until then (tasker 160).
export { default as KnowledgeCardPopover } from '$lib/components/knowledge/KnowledgeCardPopover.svelte';
