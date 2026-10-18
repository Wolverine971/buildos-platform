// apps/web/src/lib/components/agent/agent-chat-pending-change.svelte.ts
//
// State for the "didn't finish from earlier" strip above the composer. The
// session snapshot hydrates it (no extra request on open). After a completed
// turn it re-reads only when the strip is showing or a step failed, since only
// those turns can add or clear an owed change. Dismiss hides the strip at once
// and restores it if the server refuses.
import type { PendingChangeViewV1 } from '$lib/services/agentic-chat-v2/pending-change';
import type { ActivityEntry } from './agent-chat.types';

type PendingChangeControllerDeps = {
	fetch?: typeof fetch;
	onDismissed?: () => void;
	onError?: (message: string) => void;
};

type ApiEnvelope = {
	success?: boolean;
	error?: string;
	data?: { pendingChange?: PendingChangeViewV1 | null };
	details?: { pendingChange?: PendingChangeViewV1 | null };
};

/** A failed step is the only turn evidence that a new owed change may exist. */
export function turnHadFailedStep(activities: readonly ActivityEntry[] | undefined): boolean {
	return Boolean(activities?.some((activity) => activity.status === 'failed'));
}

export class PendingChangeController {
	current = $state.raw<PendingChangeViewV1 | null>(null);
	busy = $state(false);

	#sessionId: string | null = null;
	#requestId = 0;
	#deps: PendingChangeControllerDeps;

	constructor(deps: PendingChangeControllerDeps = {}) {
		this.#deps = deps;
	}

	hydrate(sessionId: string | null, view: PendingChangeViewV1 | null | undefined): void {
		this.#requestId += 1;
		this.#sessionId = sessionId;
		this.current = view ?? null;
		this.busy = false;
	}

	reset(): void {
		this.hydrate(null, null);
	}

	async refreshAfterTurn(sessionId: string, options: { hadFailedStep: boolean }): Promise<void> {
		if (this.#sessionId && this.#sessionId !== sessionId) return;
		if (!this.current && !options.hadFailedStep) return;
		await this.refresh(sessionId);
	}

	async refresh(sessionId: string): Promise<void> {
		const requestId = ++this.#requestId;
		this.#sessionId = sessionId;
		try {
			const response = await this.#request(
				`/api/chat/sessions/${encodeURIComponent(sessionId)}?probe=pending-change`,
				{ cache: 'no-store' }
			);
			const payload = (await response.json().catch(() => null)) as ApiEnvelope | null;
			if (requestId !== this.#requestId || !response.ok || payload?.success !== true) return;
			this.current = payload.data?.pendingChange ?? null;
		} catch {
			// A failed re-read keeps what is on screen; the next turn or open retries.
		}
	}

	async dismiss(): Promise<void> {
		const view = this.current;
		const sessionId = this.#sessionId;
		if (!view || !sessionId || this.busy) return;
		const requestId = ++this.#requestId;
		this.busy = true;
		this.current = null;
		try {
			const response = await this.#request(
				`/api/chat/sessions/${encodeURIComponent(sessionId)}/pending-change?key=${encodeURIComponent(view.key)}`,
				{ method: 'DELETE' }
			);
			const payload = (await response.json().catch(() => null)) as ApiEnvelope | null;
			if (requestId !== this.#requestId) return;
			if (response.ok && payload?.success === true) {
				this.#deps.onDismissed?.();
				return;
			}
			// A newer owed change replaced the one on screen: show it instead.
			const newer = payload?.details?.pendingChange;
			this.current = newer !== undefined ? newer : view;
			this.#deps.onError?.(payload?.error ?? 'Could not dismiss these changes.');
		} catch {
			if (requestId !== this.#requestId) return;
			this.current = view;
			this.#deps.onError?.('Could not dismiss these changes.');
		} finally {
			if (requestId === this.#requestId) this.busy = false;
		}
	}

	#request(url: string, init: RequestInit): Promise<Response> {
		// A plain call: window.fetch throws "Illegal invocation" when called as a method.
		const request = this.#deps.fetch ?? fetch;
		return request(url, init);
	}
}
