// apps/web/src/lib/stores/searchStore.ts

import { writable, derived } from 'svelte/store';
import type { SearchState, SearchResult, GroupedSearchResults } from '$lib/types/search';

function createSearchStore() {
	const initialState: SearchState = {
		query: '',
		results: {
			braindumps: [],
			projects: [],
			tasks: []
		},
		isLoading: false,
		error: null,
		hasMore: {
			braindumps: false,
			projects: false,
			tasks: false
		}
	};

	const { subscribe, set, update } = writable<SearchState>(initialState);

	let searchTimeout: NodeJS.Timeout;

	return {
		subscribe,

		// Debounced search function
		search: async (query: string, userId: string) => {
			clearTimeout(searchTimeout);

			if (!query || query.trim().length < 2) {
				set(initialState);
				return;
			}

			// Set loading state immediately
			update((state) => ({ ...state, query, isLoading: true, error: null }));

			// Debounce the actual search
			searchTimeout = setTimeout(async () => {
				try {
					const response = await fetch('/api/search', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ query: query.trim(), userId })
					});

					if (!response.ok) {
						throw new Error('Search failed');
					}

					const result = await response.json();
					const data = result?.data;

					update((state) => ({
						...state,
						results: groupResults(data.results),
						isLoading: false,
						hasMore: data.hasMore || {
							braindumps:
								data.results.filter(
									(r: SearchResult) => r.item_type === 'braindump'
								).length >= 5,
							projects:
								data.results.filter((r: SearchResult) => r.item_type === 'project')
									.length >= 5,
							tasks:
								data.results.filter((r: SearchResult) => r.item_type === 'task')
									.length >= 5
						}
					}));
				} catch (error) {
					update((state) => ({
						...state,
						isLoading: false,
						error: error instanceof Error ? error.message : 'Search failed'
					}));
				}
			}, 300); // 300ms debounce
		},

		// Load more results for a specific type
		loadMore: async (
			type: 'braindump' | 'project' | 'task',
			query: string,
			userId: string,
			offset: number
		) => {
			try {
				const response = await fetch('/api/search/more', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ query, userId, type, offset })
				});

				if (!response.ok) {
					throw new Error('Failed to load more results');
				}

				const result = await response.json();

				const data = result?.data;

				update((state) => {
					const newResults = { ...state.results };
					const typeKey =
						type === 'braindump'
							? 'braindumps'
							: type === 'project'
								? 'projects'
								: 'tasks';

					newResults[typeKey] = [...newResults[typeKey], ...data.results];

					return {
						...state,
						results: newResults,
						hasMore: {
							...state.hasMore,
							[typeKey]: data.hasMore
						}
					};
				});
			} catch (error) {
				update((state) => ({
					...state,
					error: error instanceof Error ? error.message : 'Failed to load more'
				}));
			}
		},

		reset: () => {
			clearTimeout(searchTimeout);
			set(initialState);
		},

		destroy: () => {
			clearTimeout(searchTimeout);
		}
	};
}

// Helper function to group results by type
function groupResults(results: SearchResult[]): GroupedSearchResults {
	return {
		braindumps: results.filter((r) => r.item_type === 'braindump'),
		projects: results.filter((r) => r.item_type === 'project'),
		tasks: results.filter((r) => r.item_type === 'task')
	};
}

export const searchStore = createSearchStore();

// Derived store for total result count
export const totalResultCount = derived(
	searchStore,
	($searchStore) =>
		$searchStore.results.braindumps.length +
		$searchStore.results.projects.length +
		$searchStore.results.tasks.length
);
