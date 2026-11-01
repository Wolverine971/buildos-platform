// apps/web/src/lib/components/builder-profile/editor/drag-reorder.ts
//
// Drag to reorder a list by its grip handle: mouse, touch, or the arrow keys on the
// focused grip. Put `{@attach dragHandle(() => ({ index, onmove }))}` on the grip button
// and `data-reorder-item` on each row; rows must share one parent. `onmove(from, to)` is
// called live as the pointer crosses a neighbour's middle, so the list itself moves.
//
// The params come through a getter so a changing `index` does not re-create the
// attachment (which would drop a drag in progress); handlers read the latest values.

import { tick } from 'svelte';
import type { Attachment } from 'svelte/attachments';

export interface DragHandleParams {
	index: number;
	onmove: (from: number, to: number) => void;
}

export function dragHandle(params: () => DragHandleParams): Attachment<HTMLElement> {
	return (node) => attachDragHandle(node, params);
}

function attachDragHandle(node: HTMLElement, params: () => DragHandleParams) {
	let dragIndex = -1;
	let item: HTMLElement | null = null;

	const rows = () => {
		const parent = item?.parentElement;
		return parent
			? (Array.from(parent.children).filter((el) =>
					el.hasAttribute('data-reorder-item')
				) as HTMLElement[])
			: [];
	};

	function onPointerDown(event: PointerEvent) {
		if (event.button !== 0) return;
		item = node.closest('[data-reorder-item]');
		if (!item) return;
		event.preventDefault();
		dragIndex = params().index;
		node.setPointerCapture(event.pointerId);
		item.dataset.dragging = 'true';
	}

	function onPointerMove(event: PointerEvent) {
		if (dragIndex < 0 || !item) return;
		const list = rows();
		let target = dragIndex;
		for (let i = 0; i < list.length; i++) {
			if (i === dragIndex) continue;
			const rect = list[i]!.getBoundingClientRect();
			const middle = rect.top + rect.height / 2;
			if (i < dragIndex && event.clientY < middle) target = Math.min(target, i);
			if (i > dragIndex && event.clientY > middle) target = Math.max(target, i);
		}
		if (target !== dragIndex) {
			params().onmove(dragIndex, target);
			dragIndex = target;
		}
	}

	function end(event: PointerEvent) {
		if (dragIndex < 0) return;
		if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
		if (item) delete item.dataset.dragging;
		dragIndex = -1;
		item = null;
	}

	async function onKeyDown(event: KeyboardEvent) {
		const delta = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
		if (!delta) return;
		event.preventDefault();
		const { index, onmove } = params();
		onmove(index, index + delta);
		// The row moved in the DOM, which can drop focus; put it back on this grip.
		await tick();
		node.focus();
	}

	node.addEventListener('pointerdown', onPointerDown);
	node.addEventListener('pointermove', onPointerMove);
	node.addEventListener('pointerup', end);
	node.addEventListener('pointercancel', end);
	node.addEventListener('keydown', onKeyDown);
	node.style.touchAction = 'none';

	return () => {
		node.removeEventListener('pointerdown', onPointerDown);
		node.removeEventListener('pointermove', onPointerMove);
		node.removeEventListener('pointerup', end);
		node.removeEventListener('pointercancel', end);
		node.removeEventListener('keydown', onKeyDown);
	};
}
