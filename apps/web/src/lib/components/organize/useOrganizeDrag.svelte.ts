// apps/web/src/lib/components/organize/useOrganizeDrag.svelte.ts
import { buildDropZone, detectZoneType } from '$lib/components/ontology/doc-tree/drop-geometry';
import {
	flattenDocumentTree,
	visibleDocumentTree,
	type OrganizeMove,
	type OrganizeProject,
	type OrganizeRef
} from './organize-plan';

export function createOrganizeDrag(options: {
	getProjects: () => OrganizeProject[];
	onDrop: (move: OrganizeMove) => void;
}) {
	let active = $state<OrganizeRef | null>(null);
	let target = $state<OrganizeMove | null>(null);
	let pending: { ref: OrganizeRef; x: number; y: number; pointer: number } | null = null;

	function cancel() {
		pending = null;
		active = null;
		target = null;
	}
	function start(event: PointerEvent, ref: OrganizeRef) {
		// Touch keeps native scrolling. The same rows expose a Move to… sheet.
		if (event.button !== 0 || event.pointerType === 'touch') return;
		pending = { ref, x: event.clientX, y: event.clientY, pointer: event.pointerId };
	}
	function move(event: PointerEvent) {
		if (!pending || pending.pointer !== event.pointerId) return;
		if (!active && Math.hypot(event.clientX - pending.x, event.clientY - pending.y) < 5) return;
		active = pending.ref;
		event.preventDefault();
		const element = document
			.elementFromPoint(event.clientX, event.clientY)
			?.closest<HTMLElement>('[data-organize-drop]');
		target = null;
		if (!element) return;
		const project = options
			.getProjects()
			.find((project) => project.id === element.dataset.projectId);
		if (!project?.can_write) return;
		let parent_id: string | null = null;
		let position = active.kind === 'task' ? 0 : visibleDocumentTree(project).length;
		if (active.kind === 'document' && element.dataset.documentId) {
			const rows = flattenDocumentTree(project);
			const row = rows.find((row) => row.node.id === element.dataset.documentId);
			if (!row) return;
			const rect = element.getBoundingClientRect();
			const drop = buildDropZone(
				detectZoneType(event.clientY - rect.top, rect.height),
				row.node,
				{
					getParentId: () => row.parent_id,
					getNodeIndex: () => row.index
				}
			);
			parent_id = drop.parentId;
			position = drop.position;
		}
		target = { ...active, destination_project_id: project.id, parent_id, position };
	}
	function end(event: PointerEvent) {
		if (!pending || pending.pointer !== event.pointerId) return;
		// Resolve again at release: the last pointermove may precede a scroll or layout change.
		if (active) move(event);
		const drop = target;
		cancel();
		if (drop) options.onDrop(drop);
	}
	return {
		get active() {
			return active;
		},
		get target() {
			return target;
		},
		start,
		move,
		end,
		cancel
	};
}
