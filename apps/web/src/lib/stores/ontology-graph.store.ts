// apps/web/src/lib/stores/ontology-graph.store.ts
import { writable } from 'svelte/store';
import type {
	GraphData,
	GraphSourceData,
	GraphStats,
	ViewMode
} from '$lib/components/ontology/graph/lib/graph.types';

type Status = 'idle' | 'loading' | 'ready' | 'error';

export interface OntologyGraphState {
	status: Status;
	data: GraphSourceData | null;
	graph: GraphData | null;
	stats: GraphStats | null;
	metadata: {
		viewMode: ViewMode;
		generatedAt: string;
	} | null;
	error: string | null;
}

const initialState: OntologyGraphState = {
	status: 'idle',
	data: null,
	graph: null,
	stats: null,
	metadata: null,
	error: null
};

interface LoadOptions {
	viewMode?: ViewMode;
	force?: boolean;
}

export function createOntologyGraphStore() {
	const { subscribe, update, set } = writable<OntologyGraphState>(initialState);
	let controller: AbortController | null = null;

	async function load(options: LoadOptions = {}) {
		const viewMode = options.viewMode ?? 'full';
		let shouldLoad = true;

		update((state) => {
			if (state.status === 'loading') {
				shouldLoad = false;
				return state;
			}
			if (state.status === 'ready' && !options.force) {
				shouldLoad = false;
				return state;
			}
			return {
				...state,
				status: 'loading',
				error: null
			};
		});

		if (!shouldLoad) return;

		if (controller) {
			controller.abort();
		}
		controller = new AbortController();

		try {
			const start = typeof performance !== 'undefined' ? performance.now() : 0;
			const response = await fetch(`/api/onto/graph?viewMode=${viewMode}`, {
				signal: controller.signal,
				headers: {
					Accept: 'application/json'
				}
			});

			if (!response.ok) {
				const errorPayload = await response.json().catch(() => null);
				const message =
					errorPayload?.message ||
					`Failed to load ontology graph (status ${response.status})`;
				set({
					...initialState,
					status: 'error',
					error: message
				});

				if (typeof window !== 'undefined') {
					window.dispatchEvent(
						new CustomEvent('ontology-graph.error', {
							detail: {
								viewMode,
								status: response.status,
								message
							}
						})
					);
				}

				return;
			}

			const payload = await response.json();

			set({
				status: 'ready',
				data: payload.data?.source ?? null,
				graph: payload.data?.graph ?? null,
				stats: payload.data?.stats ?? null,
				metadata: payload.data?.metadata ?? null,
				error: null
			});

			if (typeof window !== 'undefined') {
				const duration =
					typeof performance !== 'undefined' && start ? performance.now() - start : null;
				window.dispatchEvent(
					new CustomEvent('ontology-graph.loaded', {
						detail: {
							viewMode,
							nodeCount: payload.data?.graph?.nodes?.length ?? 0,
							edgeCount: payload.data?.graph?.edges?.length ?? 0,
							durationMs: duration,
							metadata: payload.data?.metadata ?? null
						}
					})
				);
			}
		} catch (err) {
			if ((err as Error)?.name === 'AbortError') {
				return;
			}

			console.error('[Ontology Graph Store] Failed to load graph', err);
			set({
				...initialState,
				status: 'error',
				error: 'Unexpected error fetching ontology graph'
			});

			if (typeof window !== 'undefined') {
				window.dispatchEvent(
					new CustomEvent('ontology-graph.error', {
						detail: {
							viewMode,
							status: 'network',
							message: (err as Error)?.message ?? 'Unexpected error'
						}
					})
				);
			}
		}
	}

	function reset() {
		if (controller) {
			controller.abort();
			controller = null;
		}
		set(initialState);
	}

	return {
		subscribe,
		load,
		reset
	};
}

export const ontologyGraphStore = createOntologyGraphStore();
