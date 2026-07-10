import { get, writable } from 'svelte/store';

export type AiInboxCountState = {
	total: number;
	account: number;
	projectCount: number;
	loading: boolean;
	loaded: boolean;
	error: string | null;
};

type AiInboxCountPayload = {
	total?: number;
	account?: number;
	by_project?: Record<string, number>;
};

const INITIAL_STATE: AiInboxCountState = {
	total: 0,
	account: 0,
	projectCount: 0,
	loading: false,
	loaded: false,
	error: null
};

export const aiInboxCountStore = writable<AiInboxCountState>({ ...INITIAL_STATE });

let requestToken = 0;
let abortController: AbortController | null = null;
let loadPromise: Promise<void> | null = null;

function count(value: unknown): number {
	const numeric = Number(value ?? 0);
	return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : 0;
}

export function resetAiInboxCount(): void {
	requestToken += 1;
	abortController?.abort();
	abortController = null;
	loadPromise = null;
	aiInboxCountStore.set({ ...INITIAL_STATE });
}

export function setAiInboxRemainingCount(total: number): void {
	aiInboxCountStore.update((current) => ({
		...current,
		total: count(total),
		loaded: true,
		error: null
	}));
}

export function loadAiInboxCount(options: { force?: boolean } = {}): Promise<void> {
	const force = options.force ?? false;
	const current = get(aiInboxCountStore);
	if (!force && current.loaded && !current.error) return Promise.resolve();
	if (!force && loadPromise) return loadPromise;

	if (force) abortController?.abort();
	const controller = new AbortController();
	abortController = controller;
	const token = ++requestToken;

	aiInboxCountStore.update((state) => ({ ...state, loading: true, error: null }));

	const request = (async () => {
		try {
			const response = await fetch('/api/inbox/count?status=pending&limit=1000', {
				signal: controller.signal,
				headers: { accept: 'application/json' }
			});
			const payload = await response.json().catch(() => null);
			if (token !== requestToken || controller.signal.aborted) return;
			if (!response.ok || !payload?.success) {
				throw new Error(payload?.error || 'Failed to load inbox count');
			}

			const data = (payload.data ?? {}) as AiInboxCountPayload;
			aiInboxCountStore.set({
				total: count(data.total),
				account: count(data.account),
				projectCount: Object.keys(data.by_project ?? {}).length,
				loading: false,
				loaded: true,
				error: null
			});
		} catch (error) {
			if (controller.signal.aborted || token !== requestToken) return;
			aiInboxCountStore.update((state) => ({
				...state,
				loading: false,
				loaded: true,
				error: error instanceof Error ? error.message : 'Failed to load inbox count'
			}));
		} finally {
			if (token === requestToken) {
				abortController = null;
				loadPromise = null;
			}
		}
	})();

	loadPromise = request;
	return request;
}
