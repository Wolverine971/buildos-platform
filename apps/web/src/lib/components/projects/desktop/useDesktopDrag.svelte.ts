// apps/web/src/lib/components/projects/desktop/useDesktopDrag.svelte.ts
//
// Pointer-event drag for the Projects desktop (HTML5 drag-and-drop never fires
// on touch). Draggables carry `data-drag-kind`/`data-drag-id` (+ `data-drag-project`
// for docs and tasks); drop targets carry `data-drop-kind` (+ `data-drop-id`).
// A mouse picks an item up after a few pixels of movement; a finger after a
// long press that hasn't moved, so ordinary scrolling still works. Elements
// inside a draggable marked `data-nodrag` (buttons) never start a drag.
import type { DesktopItem, DropTarget, DropVerdict } from './desktop-rules';

const LONG_PRESS_MS = 360;
const TOUCH_SLOP_PX = 9;
const MOUSE_SLOP_PX = 5;
const EDGE_PX = 36;

export type DragGhost = { x: number; y: number; item: DesktopItem; reason: string };
type Allowed = Extract<NonNullable<DropVerdict>, { ok: true }>;

export function itemKey(item: DesktopItem): string {
	return `${item.kind}:${item.id}`;
}

export function targetKey(target: DropTarget): string {
	return target.kind === 'desktop' ? 'desktop' : `project:${target.id}`;
}

export function readItem(element: HTMLElement): DesktopItem | null {
	const { dragKind: kind, dragId: id, dragProject: projectId } = element.dataset;
	if (!id) return null;
	if (kind === 'project') return { kind, id };
	if ((kind === 'document' || kind === 'task') && projectId) return { kind, id, projectId };
	return null;
}

export function readTarget(element: HTMLElement): DropTarget | null {
	const { dropKind: kind, dropId: id } = element.dataset;
	if (kind === 'desktop') return { kind: 'desktop' };
	if (kind === 'project' && id) return { kind: 'project', id };
	return null;
}

type Session = {
	item: DesktopItem;
	source: HTMLElement;
	pointerId: number;
	touch: boolean;
	x0: number;
	y0: number;
	x: number;
	y: number;
	started: boolean;
	timer: ReturnType<typeof setTimeout> | null;
	target: DropTarget | null;
	targetElement: HTMLElement | null;
	verdict: DropVerdict;
};

export function createDesktopDrag(options: {
	verdict: (item: DesktopItem, target: DropTarget) => DropVerdict;
	onDrop: (item: DesktopItem, target: DropTarget, verdict: Allowed, anchor: HTMLElement) => void;
	onRefused: (reason: string) => void;
	/** The element under the pointer changed (spring-loaded folders, prefetch). */
	onOver?: (item: DesktopItem, target: DropTarget | null, element: HTMLElement | null) => void;
	onStart?: (item: DesktopItem) => void;
	/** A started drag ended; `dropped` when a confirm follows (onDrop runs next). */
	onEnd?: (dropped: boolean) => void;
}) {
	let ghost = $state<DragGhost | null>(null);
	let over = $state<{ key: string; ok: boolean } | null>(null);
	let lifted = $state<string | null>(null);
	let session: Session | null = null;
	let suppressClicksUntil = 0;

	function pointerdown(event: PointerEvent) {
		if (event.button !== 0 || session) return;
		const origin = event.target instanceof Element ? event.target : null;
		if (!origin || origin.closest('[data-nodrag]')) return;
		const source = origin.closest<HTMLElement>('[data-drag-kind]');
		const item = source ? readItem(source) : null;
		if (!source || !item) return;
		session = {
			item,
			source,
			pointerId: event.pointerId,
			touch: event.pointerType !== 'mouse',
			x0: event.clientX,
			y0: event.clientY,
			x: event.clientX,
			y: event.clientY,
			started: false,
			timer: null,
			target: null,
			targetElement: null,
			verdict: null
		};
		if (session.touch) {
			session.timer = setTimeout(() => {
				if (session && !session.started) start();
			}, LONG_PRESS_MS);
		}
		window.addEventListener('pointermove', move, { passive: false });
		window.addEventListener('pointerup', up);
		window.addEventListener('pointercancel', cancel);
		document.addEventListener('touchmove', blockScroll, { passive: false });
		document.addEventListener('contextmenu', blockMenu);
	}

	function blockScroll(event: TouchEvent) {
		if (session?.started) event.preventDefault();
	}

	function blockMenu(event: Event) {
		if (session?.touch) event.preventDefault();
	}

	function move(event: PointerEvent) {
		const current = session;
		if (!current || event.pointerId !== current.pointerId) return;
		current.x = event.clientX;
		current.y = event.clientY;
		if (!current.started) {
			const distance = Math.hypot(current.x - current.x0, current.y - current.y0);
			if (current.touch) {
				// Moving before the long press means the finger is scrolling.
				if (distance > TOUCH_SLOP_PX) finish();
				return;
			}
			if (distance < MOUSE_SLOP_PX) return;
			start();
		}
		event.preventDefault();
		track();
	}

	function start() {
		const current = session;
		if (!current) return;
		current.started = true;
		lifted = itemKey(current.item);
		options.onStart?.(current.item);
		track();
	}

	function track() {
		const current = session;
		if (!current?.started) return;
		const hit = document.elementFromPoint(current.x, current.y);
		let element = hit instanceof Element ? hit.closest<HTMLElement>('[data-drop-kind]') : null;
		if (element === current.source) element = null;
		const target = element ? readTarget(element) : null;
		const verdict = target ? options.verdict(current.item, target) : null;
		if (element !== current.targetElement) {
			current.targetElement = element;
			options.onOver?.(current.item, target, element);
		}
		current.target = target;
		current.verdict = verdict;
		over = target && verdict ? { key: targetKey(target), ok: verdict.ok } : null;
		ghost = {
			x: current.x,
			y: current.y,
			item: current.item,
			reason: verdict && !verdict.ok ? verdict.reason : ''
		};
		autoscroll(current.x, current.y, hit);
	}

	function autoscroll(x: number, y: number, hit: Element | null) {
		const scroller = hit?.closest<HTMLElement>('[data-autoscroll]');
		if (scroller) {
			const box = scroller.getBoundingClientRect();
			if (scroller.scrollHeight > scroller.clientHeight) {
				if (y < box.top + EDGE_PX) scroller.scrollTop -= 10;
				else if (y > box.bottom - EDGE_PX) scroller.scrollTop += 10;
			}
			if (scroller.scrollWidth > scroller.clientWidth) {
				if (x < box.left + EDGE_PX) scroller.scrollLeft -= 10;
				else if (x > box.right - EDGE_PX) scroller.scrollLeft += 10;
			}
		}
		if (y < EDGE_PX) window.scrollBy(0, -12);
		else if (y > window.innerHeight - EDGE_PX) window.scrollBy(0, 12);
	}

	function up(event: PointerEvent) {
		const current = session;
		if (!current || event.pointerId !== current.pointerId) return;
		finish();
		if (!current.started) return;
		suppressClicksUntil = performance.now() + 120;
		const { target, verdict, targetElement } = current;
		const dropped = Boolean(verdict?.ok && target && targetElement);
		options.onEnd?.(dropped);
		if (verdict?.ok && target && targetElement)
			options.onDrop(current.item, target, verdict, targetElement);
		else if (verdict && !verdict.ok) options.onRefused(verdict.reason);
	}

	function cancel() {
		const started = session?.started ?? false;
		finish();
		if (started) options.onEnd?.(false);
	}

	function finish() {
		if (session?.timer) clearTimeout(session.timer);
		session = null;
		ghost = null;
		over = null;
		lifted = null;
		window.removeEventListener('pointermove', move);
		window.removeEventListener('pointerup', up);
		window.removeEventListener('pointercancel', cancel);
		document.removeEventListener('touchmove', blockScroll);
		document.removeEventListener('contextmenu', blockMenu);
	}

	return {
		get ghost() {
			return ghost;
		},
		get over() {
			return over;
		},
		get lifted() {
			return lifted;
		},
		get dragging() {
			return ghost !== null;
		},
		/** A finger is down on a draggable: its long press belongs to the drag, not a menu. */
		get touchPressed() {
			return session?.touch ?? false;
		},
		pointerdown,
		cancel,
		/** Re-run hit testing after the DOM under the pointer changed (a folder sprang open). */
		retrack() {
			if (session) session.targetElement = null;
			track();
		},
		/** The click that follows a drop must not also open what was dropped. */
		swallowsClick() {
			return performance.now() < suppressClicksUntil;
		}
	};
}
