// apps/web/src/lib/components/project/entity-modal-data.ts
import { browser } from '$app/environment';

type EntityModalKind = 'task' | 'document' | 'goal';
type PendingLoad = {
	controller: AbortController;
	response: Promise<Response>;
	timer: ReturnType<typeof setTimeout>;
};

// A short-lived handoff from the click handler to the lazy editor, not a cache.
// Every opening starts a fresh read; the editor consumes it exactly once.
const pendingLoads = new Map<string, PendingLoad>();
const MAX_PENDING_LOADS = 4;
const HANDOFF_TIMEOUT_MS = 10_000;

function endpoint(kind: EntityModalKind, id: string) {
	return `/api/onto/${kind}s/${id}/full?include_linked=false`;
}

function discard(key: string) {
	const pending = pendingLoads.get(key);
	if (!pending) return;
	pendingLoads.delete(key);
	clearTimeout(pending.timer);
	pending.controller.abort();
}

/** Start the read on click, before waiting for the dynamic import. */
export function prepareEntityModalData(kind: string, id: string): void {
	if (!browser || !id || !['task', 'document', 'goal'].includes(kind)) return;
	const key = endpoint(kind as EntityModalKind, id);
	discard(key);
	if (pendingLoads.size >= MAX_PENDING_LOADS) discard(pendingLoads.keys().next().value!);
	const controller = new AbortController();
	const response = fetch(key, { signal: controller.signal });
	const pending: PendingLoad = {
		controller,
		response,
		timer: setTimeout(() => discard(key), HANDOFF_TIMEOUT_MS)
	};
	pendingLoads.set(key, pending);
	// Import failure or navigation may leave this promise without a consumer.
	void response.catch(() => {
		if (pendingLoads.get(key) === pending) discard(key);
	});
}

export function fetchEntityModalData(
	kind: EntityModalKind,
	id: string,
	signal?: AbortSignal
): Promise<Response> {
	const key = endpoint(kind, id);
	const pending = pendingLoads.get(key);
	if (!pending) return fetch(key, signal ? { signal } : undefined);
	pendingLoads.delete(key);
	clearTimeout(pending.timer);
	const abort = () => pending.controller.abort();
	if (signal?.aborted) abort();
	else signal?.addEventListener('abort', abort, { once: true });
	// Keep cancellation connected while the editor reads the response body too.
	// Both controllers are local to this handoff and become collectible together.
	return pending.response;
}
