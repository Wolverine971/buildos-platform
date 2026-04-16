// apps/web/src/lib/stores/ontology-graph.store.ts
import { writable } from 'svelte/store';
import type {
	GraphData,
	GraphSourceData,
	GraphStats,
	ViewMode
} from '$lib/components/ontology/graph/lib/graph.types';
import {
	appendGraphScopeFilterParams,
	buildGraphRequestKey,
	normalizeGraphScopeFilters,
	type GraphScopeCounts,
	type GraphScopeFilters
} from '$lib/components/ontology/graph/lib/graph.filters';

type Status = 'idle' | 'loading' | 'ready' | 'error';

export interface OntologyGraphState {
	status: Status;
	data: GraphSourceData | null;
	graph: GraphData | null;
	stats: GraphStats | null;
	metadata: {
		viewMode: ViewMode;
		generatedAt: string;
		projectId?: string;
		queryPattern?: string;
		requestKey?: string;
		scopeKey?: string;
		filters?: GraphScopeFilters;
		scopeCounts?: GraphScopeCounts;
		projectScope?: {
			type: 'actor-project-access';
			actorId: string;
			projectCount: number;
			ownedProjectCount: number;
			memberProjectCount: number;
		};
		truncated?: boolean;
		requestedNodeLimit?: number;
		originalNodeCount?: number;
		originalEdgeCount?: number;
		returnedNodeCount?: number;
		returnedEdgeCount?: number;
		omittedNodeCount?: number;
		omittedEdgeCount?: number;
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
	scopeFilters?: Partial<GraphScopeFilters>;
	scopeKey?: string | null;
	force?: boolean;
}

function buildScopedGraphRequestKey(
	viewMode: ViewMode,
	filters: GraphScopeFilters,
	scopeKey?: string | null
): string {
	const baseKey = buildGraphRequestKey(viewMode, filters);
	return scopeKey ? `${scopeKey}|${baseKey}` : baseKey;
}

export function createOntologyGraphStore() {
	const { subscribe, update, set } = writable<OntologyGraphState>(initialState);
	let controller: AbortController | null = null;
	let activeRequestKey: string | null = null;

	async function load(options: LoadOptions = {}) {
		const viewMode = options.viewMode ?? 'full';
		const scopeFilters = normalizeGraphScopeFilters(options.scopeFilters);
		const scopeKey = options.scopeKey ?? null;
		const requestKey = buildScopedGraphRequestKey(viewMode, scopeFilters, scopeKey);
		let shouldLoad = true;

		update((state) => {
			if (state.status === 'loading' && activeRequestKey === requestKey) {
				shouldLoad = false;
				return state;
			}
			if (
				state.status === 'ready' &&
				state.metadata?.requestKey === requestKey &&
				!options.force
			) {
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
		activeRequestKey = requestKey;

		try {
			const start = typeof performance !== 'undefined' ? performance.now() : 0;
			const params = appendGraphScopeFilterParams(
				new URLSearchParams({ viewMode }),
				scopeFilters
			);
			const response = await fetch(`/api/onto/graph?${params.toString()}`, {
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
				if (activeRequestKey === requestKey) {
					activeRequestKey = null;
				}

				if (typeof window !== 'undefined') {
					window.dispatchEvent(
						new CustomEvent('ontology-graph.error', {
							detail: {
								viewMode,
								requestKey,
								status: response.status,
								message
							}
						})
					);
				}

				return;
			}

			const payload = await response.json();
			const metadata = {
				...(payload.data?.metadata ?? {}),
				viewMode,
				filters: payload.data?.metadata?.filters ?? scopeFilters,
				...(scopeKey ? { scopeKey } : {}),
				requestKey
			};

			set({
				status: 'ready',
				data: payload.data?.source ?? null,
				graph: payload.data?.graph ?? null,
				stats: payload.data?.stats ?? null,
				metadata,
				error: null
			});
			if (activeRequestKey === requestKey) {
				activeRequestKey = null;
			}

			if (typeof window !== 'undefined') {
				const duration =
					typeof performance !== 'undefined' && start ? performance.now() - start : null;
				window.dispatchEvent(
					new CustomEvent('ontology-graph.loaded', {
						detail: {
							viewMode,
							requestKey,
							nodeCount: payload.data?.graph?.nodes?.length ?? 0,
							edgeCount: payload.data?.graph?.edges?.length ?? 0,
							durationMs: duration,
							metadata
						}
					})
				);
			}
		} catch (err) {
			if ((err as Error)?.name === 'AbortError') {
				return;
			}

			console.error('[Ontology Graph Store] Failed to load graph', err);
			if (activeRequestKey === requestKey) {
				activeRequestKey = null;
			}
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
							requestKey,
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
		activeRequestKey = null;
		set(initialState);
	}

	return {
		subscribe,
		load,
		reset
	};
}

export const ontologyGraphStore = createOntologyGraphStore();
