// apps/web/src/lib/stores/timeBlocksStore.ts
import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import type {
	TimeAllocation,
	TimeBlockSuggestionsState,
	TimeBlockWithProject
} from '@buildos/shared-types';
import type { SlotFinderConfig } from '$lib/types/time-blocks';
import { DEFAULT_SLOT_FINDER_CONFIG } from '$lib/types/time-blocks';

interface TimeBlocksState {
	blocks: TimeBlockWithProject[];
	selectedDateRange: { start: Date; end: Date };
	isLoading: boolean;
	isCreating: boolean;
	isAllocationLoading: boolean;
	allocation: TimeAllocation | null;
	regeneratingIds: string[];
	error: string | null;
	slotFinderConfig: SlotFinderConfig;
}

function normalizeBlock(block: TimeBlockWithProject): TimeBlockWithProject {
	if (block.suggestions_state && typeof block.suggestions_state.status === 'string') {
		return block;
	}

	const fallbackState: TimeBlockSuggestionsState =
		Array.isArray(block.ai_suggestions) && block.ai_suggestions.length > 0
			? {
					status: 'completed',
					startedAt: block.suggestions_generated_at ?? block.created_at,
					completedAt: block.suggestions_generated_at ?? block.updated_at
				}
			: {
					status: 'pending',
					startedAt: block.created_at
				};

	return {
		...block,
		suggestions_state: fallbackState
	};
}

function sortBlocks(blocks: TimeBlockWithProject[]): TimeBlockWithProject[] {
	return [...blocks]
		.map((block) => normalizeBlock(block))
		.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
}

function createDefaultDateRange(): { start: Date; end: Date } {
	const start = new Date();
	const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
	return { start, end };
}

function loadSlotFinderConfig(): SlotFinderConfig {
	if (!browser) return DEFAULT_SLOT_FINDER_CONFIG;

	try {
		const saved = localStorage.getItem('timeblocks-slot-finder-config');
		if (saved) {
			return { ...DEFAULT_SLOT_FINDER_CONFIG, ...JSON.parse(saved) };
		}
	} catch (error) {
		console.error('[TimeBlocksStore] Failed to load slot finder config:', error);
	}

	return DEFAULT_SLOT_FINDER_CONFIG;
}

function createTimeBlocksStore() {
	const initialState: TimeBlocksState = {
		blocks: [],
		selectedDateRange: createDefaultDateRange(),
		isLoading: false,
		isCreating: false,
		isAllocationLoading: false,
		allocation: null,
		regeneratingIds: [],
		error: null,
		slotFinderConfig: loadSlotFinderConfig()
	};

	const internalStore = writable<TimeBlocksState>(initialState);
	let currentState = initialState;

	// Store unsubscribe function to prevent memory leak
	const unsubscribe = internalStore.subscribe((value) => {
		currentState = value;
	});

	const { subscribe, set, update } = internalStore;

	async function requestBlocks(
		rangeStart: Date,
		rangeEnd: Date
	): Promise<TimeBlockWithProject[]> {
		const response = await fetch(
			`/api/time-blocks/blocks?start_date=${rangeStart.toISOString()}&end_date=${rangeEnd.toISOString()}`
		);
		const payload = await response.json().catch(() => ({}));

		if (!response.ok) {
			throw new Error(payload?.error ?? 'Failed to load time blocks');
		}

		return sortBlocks(payload?.data?.blocks ?? []);
	}

	async function requestAllocation(
		rangeStart: Date,
		rangeEnd: Date
	): Promise<TimeAllocation | null> {
		const response = await fetch(
			`/api/time-blocks/allocation?start_date=${rangeStart.toISOString()}&end_date=${rangeEnd.toISOString()}`
		);
		const payload = await response.json().catch(() => ({}));

		if (!response.ok) {
			throw new Error(payload?.error ?? 'Failed to load time allocation');
		}

		return payload?.data?.allocation ?? null;
	}

	// Define refreshAllocation as a separate function so it can be called internally
	async function refreshAllocation(startDate?: Date, endDate?: Date) {
		if (!browser) return;

		const rangeStart = startDate ?? currentState.selectedDateRange.start;
		const rangeEnd = endDate ?? currentState.selectedDateRange.end;

		update((state) => ({
			...state,
			isAllocationLoading: true
		}));

		try {
			const allocation = await requestAllocation(rangeStart, rangeEnd);

			update((state) => ({
				...state,
				allocation: allocation ?? state.allocation,
				selectedDateRange: { start: rangeStart, end: rangeEnd },
				isAllocationLoading: false
			}));
		} catch (error) {
			console.error('[TimeBlocksStore] refreshAllocation failed:', error);
			update((state) => ({
				...state,
				isAllocationLoading: false
			}));
		}
	}

	// Define loadBlocks as a separate function so it can be called internally
	async function loadBlocks(startDate?: Date, endDate?: Date) {
		if (!browser) return;

		const rangeStart = startDate ?? currentState.selectedDateRange.start;
		const rangeEnd = endDate ?? currentState.selectedDateRange.end;

		update((state) => ({
			...state,
			isLoading: true,
			isAllocationLoading: true,
			error: null
		}));

		try {
			const [blocks, allocation] = await Promise.all([
				requestBlocks(rangeStart, rangeEnd),
				requestAllocation(rangeStart, rangeEnd).catch((allocationError) => {
					console.error('[TimeBlocksStore] Failed to load allocation:', allocationError);
					return null;
				})
			]);

			update((state) => ({
				...state,
				blocks,
				allocation: allocation ?? state.allocation,
				selectedDateRange: { start: rangeStart, end: rangeEnd },
				isLoading: false,
				isAllocationLoading: false
			}));
		} catch (error) {
			console.error('[TimeBlocksStore] loadBlocks failed:', error);
			update((state) => ({
				...state,
				isLoading: false,
				isAllocationLoading: false,
				error: error instanceof Error ? error.message : 'Failed to load time blocks'
			}));
		}
	}

	return {
		subscribe,

		// Reference the extracted loadBlocks function
		loadBlocks,

		async loadBlocksOnly(startDate?: Date, endDate?: Date) {
			if (!browser) return;

			const rangeStart = startDate ?? currentState.selectedDateRange.start;
			const rangeEnd = endDate ?? currentState.selectedDateRange.end;

			update((state) => ({
				...state,
				isLoading: true,
				error: null
			}));

			try {
				const blocks = await requestBlocks(rangeStart, rangeEnd);

				update((state) => ({
					...state,
					blocks,
					isLoading: false
				}));
			} catch (error) {
				console.error('[TimeBlocksStore] loadBlocksOnly failed:', error);
				update((state) => ({
					...state,
					isLoading: false,
					error: error instanceof Error ? error.message : 'Failed to load time blocks'
				}));
			}
		},

		async createBlock(
			blockType: 'project' | 'build',
			projectId: string | null,
			startTime: Date,
			endTime: Date,
			options?: { timezone?: string }
		) {
			if (!browser) {
				throw new Error('Cannot create blocks during server-side rendering');
			}

			update((state) => ({
				...state,
				isCreating: true,
				error: null
			}));

			try {
				const payload: Record<string, unknown> = {
					block_type: blockType,
					project_id: projectId,
					start_time: startTime.toISOString(),
					end_time: endTime.toISOString()
				};

				if (options?.timezone) {
					payload.timezone = options.timezone;
				}

				const response = await fetch('/api/time-blocks/create', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(payload)
				});

				if (!response.ok) {
					const payload = await response.json().catch(() => ({}));
					throw new Error(payload?.error ?? 'Failed to create time block');
				}

				const { data } = await response.json();
				const newBlock: TimeBlockWithProject = data.time_block;
				const normalizedBlock = normalizeBlock(newBlock);

				update((state) => ({
					...state,
					isCreating: false,
					blocks: sortBlocks([...state.blocks, normalizedBlock])
				}));

				// Await to prevent race condition
				await refreshAllocation();

				return normalizedBlock;
			} catch (error) {
				console.error('[TimeBlocksStore] createBlock failed:', error);
				update((state) => ({
					...state,
					isCreating: false,
					error: error instanceof Error ? error.message : 'Failed to create time block'
				}));
				throw error;
			}
		},

		upsertBlock(block: TimeBlockWithProject) {
			const normalized = normalizeBlock(block);

			update((state) => {
				const hasExisting = state.blocks.some((existing) => existing.id === normalized.id);
				const nextBlocks = hasExisting
					? state.blocks.map((existing) =>
							existing.id === normalized.id ? normalized : existing
						)
					: [...state.blocks, normalized];

				return {
					...state,
					blocks: sortBlocks(nextBlocks)
				};
			});
		},

		updateBlockSuggestionsState(blockId: string, suggestionsState: TimeBlockSuggestionsState) {
			update((state) => ({
				...state,
				blocks: state.blocks.map((block) =>
					block.id === blockId
						? normalizeBlock({ ...block, suggestions_state: suggestionsState })
						: block
				)
			}));
		},

		async regenerateSuggestions(blockId: string) {
			if (!browser) {
				throw new Error('Cannot regenerate suggestions during server-side rendering');
			}

			update((state) => ({
				...state,
				error: null,
				regeneratingIds: state.regeneratingIds.includes(blockId)
					? state.regeneratingIds
					: [...state.regeneratingIds, blockId]
			}));

			try {
				const response = await fetch(`/api/time-blocks/blocks/${blockId}/suggestions`, {
					method: 'POST'
				});

				if (!response.ok) {
					const payload = await response.json().catch(() => ({}));
					throw new Error(payload?.error ?? 'Failed to refresh suggestions');
				}

				const { data } = await response.json();
				const updatedBlock: TimeBlockWithProject = normalizeBlock(data.time_block);

				update((state) => ({
					...state,
					blocks: sortBlocks(
						state.blocks.map((block) => (block.id === blockId ? updatedBlock : block))
					),
					regeneratingIds: state.regeneratingIds.filter((id) => id !== blockId)
				}));

				return updatedBlock;
			} catch (error) {
				console.error('[TimeBlocksStore] regenerateSuggestions failed:', error);
				update((state) => ({
					...state,
					regeneratingIds: state.regeneratingIds.filter((id) => id !== blockId),
					error:
						error instanceof Error
							? error.message
							: 'Failed to refresh suggestions for this block'
				}));
				throw error;
			}
		},

		async deleteBlock(blockId: string) {
			if (!browser) {
				throw new Error('Cannot delete blocks during server-side rendering');
			}

			update((state) => ({
				...state,
				regeneratingIds: state.regeneratingIds.filter((id) => id !== blockId),
				error: null
			}));

			try {
				const response = await fetch(`/api/time-blocks/delete/${blockId}`, {
					method: 'DELETE'
				});

				if (!response.ok) {
					const payload = await response.json().catch(() => ({}));
					throw new Error(payload?.error ?? 'Failed to delete time block');
				}

				update((state) => ({
					...state,
					blocks: state.blocks.filter((block) => block.id !== blockId)
				}));

				await refreshAllocation();
			} catch (error) {
				console.error('[TimeBlocksStore] deleteBlock failed:', error);
				update((state) => ({
					...state,
					error: error instanceof Error ? error.message : 'Failed to delete time block'
				}));
				throw error;
			}
		},

		async updateBlock(blockId: string, params: any) {
			if (!browser) {
				throw new Error('Cannot update blocks during server-side rendering');
			}

			update((state) => ({
				...state,
				error: null
			}));

			try {
				const response = await fetch(`/api/time-blocks/blocks/${blockId}`, {
					method: 'PATCH',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify(params)
				});

				if (!response.ok) {
					const payload = await response.json().catch(() => ({}));
					throw new Error(payload?.error ?? 'Failed to update time block');
				}

				const updatedBlock = await response.json();

				update((state) => ({
					...state,
					blocks: state.blocks.map((block) =>
						block.id === blockId ? updatedBlock : block
					)
				}));

				await refreshAllocation();
			} catch (error) {
				console.error('[TimeBlocksStore] updateBlock failed:', error);
				update((state) => ({
					...state,
					error: error instanceof Error ? error.message : 'Failed to update time block'
				}));
				throw error;
			}
		},

		// Reference the extracted refreshAllocation function
		refreshAllocation,

		setDateRange(start: Date, end: Date) {
			update((state) => ({
				...state,
				selectedDateRange: { start, end }
			}));
			loadBlocks(start, end);
		},

		updateSlotFinderConfig(updates: Partial<SlotFinderConfig>) {
			update((state) => {
				const newConfig = { ...state.slotFinderConfig, ...updates };

				// Save to localStorage
				if (browser) {
					try {
						localStorage.setItem(
							'timeblocks-slot-finder-config',
							JSON.stringify(newConfig)
						);
					} catch (error) {
						console.error(
							'[TimeBlocksStore] Failed to save slot finder config:',
							error
						);
					}
				}

				return {
					...state,
					slotFinderConfig: newConfig
				};
			});
		},

		reset() {
			set({
				...initialState,
				selectedDateRange: createDefaultDateRange(),
				slotFinderConfig: loadSlotFinderConfig()
			});
		},

		destroy() {
			if (unsubscribe) {
				unsubscribe();
			}
		}
	};
}

export const timeBlocksStore = createTimeBlocksStore();
