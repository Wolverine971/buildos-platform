// apps/web/src/lib/components/projects/desktop/useDesktopDrag.svelte.test.ts
// @vitest-environment jsdom
//
// While a tile is dragged the pointer moves many times a second. Only the ghost may follow
// every move: whatever reads `dragging` or `over` (every tile's drop styling, the dock, the
// page-wide drag class) must run again only when a drag starts or ends, or the target changes.
import { flushSync } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDesktopDrag } from './useDesktopDrag.svelte';

function element(data: Record<string, string>) {
	const node = document.createElement('div');
	Object.assign(node.dataset, data);
	document.body.append(node);
	return node;
}

function pointer(type: string, x: number, y: number) {
	return Object.assign(new Event(type, { cancelable: true }), {
		pointerId: 1,
		pointerType: 'mouse',
		button: 0,
		clientX: x,
		clientY: y
	}) as unknown as PointerEvent;
}

describe('createDesktopDrag', () => {
	afterEach(() => {
		document.body.replaceChildren();
		vi.restoreAllMocks();
	});

	it('re-runs readers of `dragging` and `over` on a change, not on every pointer move', () => {
		const source = element({ dragKind: 'project', dragId: 'p1' });
		const first = element({ dropKind: 'project', dropId: 'p2' });
		const second = element({ dropKind: 'project', dropId: 'p3' });
		let under: Element = first;
		document.elementFromPoint = () => under;
		window.scrollBy = vi.fn();

		const drag = createDesktopDrag({
			verdict: () => ({ ok: true }) as never,
			onDrop: vi.fn(),
			onRefused: vi.fn()
		});
		const runs = { dragging: 0, over: 0, ghost: 0 };
		const stop = $effect.root(() => {
			$effect(() => {
				void drag.dragging;
				runs.dragging += 1;
			});
			$effect(() => {
				void drag.over;
				runs.over += 1;
			});
			$effect(() => {
				void drag.ghost;
				runs.ghost += 1;
			});
		});
		flushSync();
		expect(runs).toEqual({ dragging: 1, over: 1, ghost: 1 });

		drag.pointerdown({
			button: 0,
			target: source,
			pointerId: 1,
			pointerType: 'mouse',
			clientX: 100,
			clientY: 100
		} as unknown as PointerEvent);
		// Twenty moves over the same tile.
		for (let step = 1; step <= 20; step++) {
			window.dispatchEvent(pointer('pointermove', 100 + step * 10, 300));
			flushSync();
		}
		expect(drag.dragging).toBe(true);
		expect(drag.over).toEqual({ key: 'project:p2', ok: true });
		// One more run each: the drag started, and it came over a tile. The ghost followed.
		expect(runs.dragging).toBe(2);
		expect(runs.over).toBe(2);
		expect(runs.ghost).toBe(21);

		// Over another tile: `over` changes once, `dragging` not at all.
		under = second;
		for (let step = 1; step <= 5; step++) {
			window.dispatchEvent(pointer('pointermove', 400 + step, 300));
			flushSync();
		}
		expect(drag.over).toEqual({ key: 'project:p3', ok: true });
		expect(runs.dragging).toBe(2);
		expect(runs.over).toBe(3);

		window.dispatchEvent(pointer('pointerup', 405, 300));
		flushSync();
		expect(drag.dragging).toBe(false);
		expect(runs.dragging).toBe(3);
		stop();
	});
});
