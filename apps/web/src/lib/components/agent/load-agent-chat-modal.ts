// apps/web/src/lib/components/agent/load-agent-chat-modal.ts
//
// One memoized loader for the AgentChatModal chunk, shared by every launch
// surface (nav button, /today, /history, ...). Launch surfaces warm it on idle
// and on intent (hover / focus / press) so the first open doesn't wait on the
// network for the chat bundle.

type IdleWindow = Window & {
	requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
	cancelIdleCallback?: (handle: number) => void;
};

function importAgentChatModal() {
	return import('./AgentChatModal.svelte');
}

let agentChatModalPromise: ReturnType<typeof importAgentChatModal> | null = null;

/**
 * Resolve the AgentChatModal module (`{ default: AgentChatModal }`). The same
 * promise is returned on every call; a failed load is forgotten so the next
 * call retries.
 */
export function loadAgentChatModal() {
	return (agentChatModalPromise ??= importAgentChatModal().catch((error) => {
		agentChatModalPromise = null;
		throw error;
	}));
}

/**
 * Start loading the chunk right now (intent: pointerenter / focus / pointerdown).
 * Takes no arguments so it can be passed straight as an event handler; failures
 * are logged, not thrown — the real open path retries and surfaces errors.
 */
export function warmAgentChatModal(): void {
	if (typeof window === 'undefined') return;
	void loadAgentChatModal().catch((error) => {
		console.warn('[AgentChat] Failed to preload chat:', error);
	});
}

/**
 * Load the chunk when the browser is idle (falls back to a short timeout).
 * No-op during SSR. Returns a cancel function for component cleanup.
 */
export function preloadAgentChatModal(options: { timeout?: number } = {}): () => void {
	if (typeof window === 'undefined') return () => {};
	const { timeout = 3500 } = options;
	const idleWindow = window as IdleWindow;
	if (typeof idleWindow.requestIdleCallback === 'function') {
		const handle = idleWindow.requestIdleCallback(warmAgentChatModal, { timeout });
		return () => idleWindow.cancelIdleCallback?.(handle);
	}

	const timeoutId = window.setTimeout(warmAgentChatModal, Math.min(timeout, 2500));
	return () => window.clearTimeout(timeoutId);
}
