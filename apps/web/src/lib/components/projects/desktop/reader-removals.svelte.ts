// apps/web/src/lib/components/projects/desktop/reader-removals.svelte.ts
//
// Archive and delete from the reader feel instant: the item leaves every list
// at once, an Undo toast shows for a few seconds, and only then is the change
// sent. Nothing reaches the server inside the Undo window, so Undo needs no
// restore call (and a task's calendar events are never touched by an undone
// archive). Leaving the page sends whatever is still waiting.
import { SvelteSet } from 'svelte/reactivity';
import { toastService } from '$lib/stores/toast.store';

export const UNDO_WINDOW_MS = 6000;
/** How long a sent removal stays hidden: long enough for every list to re-read. */
const HIDE_AFTER_SENT_MS = 15000;

/** Ids archived or deleted in this tab that a list may still hold. */
export const removedIds = new SvelteSet<string>();

/** The list without anything just archived or deleted here. */
export function withoutRemoved<T extends { id: string }>(items: readonly T[]): T[] {
	if (removedIds.size === 0) return items as T[];
	return items.filter((entry) => !removedIds.has(entry.id));
}

type TreeNode = { id: string; children?: TreeNode[] | null };

/** A doc tree without removed docs; a removed doc's children take its place. */
export function treeWithoutRemoved<T extends TreeNode>(nodes: readonly T[]): T[] {
	if (removedIds.size === 0) return nodes as T[];
	const out: T[] = [];
	for (const node of nodes) {
		const children = node.children ? treeWithoutRemoved(node.children as T[]) : node.children;
		if (removedIds.has(node.id)) {
			out.push(...((children ?? []) as T[]));
		} else {
			out.push(children === node.children ? node : { ...node, children });
		}
	}
	return out;
}

export type RemovalRequest = { url: string; method: 'DELETE' | 'PATCH'; body?: unknown };

type Pending = {
	request: RemovalRequest;
	toastId: string;
	timer: ReturnType<typeof setTimeout>;
	failMessage: string;
	onSent?: () => void;
};
const pending = new Map<string, Pending>();

let listening = false;
function sendAllOnLeave() {
	if (listening || typeof window === 'undefined') return;
	listening = true;
	window.addEventListener('pagehide', () => {
		for (const id of [...pending.keys()]) void send(id);
	});
}

/**
 * Hide an item now, show "<message> · Undo", and send the request when the
 * window closes. Undo puts the item back and sends nothing.
 */
export function removeWithUndo(options: {
	id: string;
	message: string;
	failMessage: string;
	request: RemovalRequest;
	/** Undo was pressed: the item is back in its lists. */
	onUndo?: () => void;
	/** The server took it: lists can re-read. */
	onSent?: () => void;
}): void {
	const { id } = options;
	if (pending.has(id)) return;
	removedIds.add(id);
	sendAllOnLeave();
	const toastId = toastService.success(options.message, {
		duration: UNDO_WINDOW_MS,
		action: {
			label: 'Undo',
			onClick: () => {
				if (!undo(id)) return;
				options.onUndo?.();
			}
		}
	});
	pending.set(id, {
		request: options.request,
		toastId,
		timer: setTimeout(() => void send(id), UNDO_WINDOW_MS),
		failMessage: options.failMessage,
		onSent: options.onSent
	});
}

/** Put a waiting item back. False once it has been sent. */
export function undo(id: string): boolean {
	const entry = pending.get(id);
	if (!entry) return false;
	pending.delete(id);
	clearTimeout(entry.timer);
	toastService.remove(entry.toastId);
	removedIds.delete(id);
	return true;
}

async function send(id: string): Promise<void> {
	const entry = pending.get(id);
	if (!entry) return;
	pending.delete(id);
	clearTimeout(entry.timer);
	toastService.remove(entry.toastId);
	const { url, method, body } = entry.request;
	try {
		const response = await fetch(url, {
			method,
			headers: { 'Content-Type': 'application/json' },
			body: body === undefined ? undefined : JSON.stringify(body),
			keepalive: true
		});
		if (!response.ok) throw new Error(String(response.status));
		entry.onSent?.();
		setTimeout(() => removedIds.delete(id), HIDE_AFTER_SENT_MS);
	} catch {
		removedIds.delete(id);
		toastService.error(entry.failMessage);
	}
}

/** Send everything still waiting now (tests, and a host closing for good). */
export function sendPendingRemovals(): Promise<void[]> {
	return Promise.all([...pending.keys()].map((id) => send(id)));
}
