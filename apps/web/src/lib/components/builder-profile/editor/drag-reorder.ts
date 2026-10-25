// apps/web/src/lib/components/builder-profile/editor/drag-reorder.ts
//
// Drag to reorder a list by its grip handle: mouse, touch, or the arrow keys on the
// focused grip. Put `use:dragHandle={{ index, onmove }}` on the grip button and
// `data-reorder-item` on each row; rows must share one parent. `onmove(from, to)` is
// called live as the pointer crosses a neighbour's middle, so the list itself moves.

import { tick } from 'svelte';

export interface DragHandleParams {
	index: number;
	onmove: (from: number, to: number) => void;
}

export function dragHandle(node: HTMLElement, params: DragHandleParams) {
	let current = params;
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
		dragIndex = current.index;
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
			current.onmove(dragIndex, target);
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
		current.onmove(current.index, current.index + delta);
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

	return {
		update(next: DragHandleParams) {
			current = next;
			if (dragIndex >= 0) dragIndex = next.index;
		},
		destroy() {
			node.removeEventListener('pointerdown', onPointerDown);
			node.removeEventListener('pointermove', onPointerMove);
			node.removeEventListener('pointerup', end);
			node.removeEventListener('pointercancel', end);
			node.removeEventListener('keydown', onKeyDown);
		}
	};
}
