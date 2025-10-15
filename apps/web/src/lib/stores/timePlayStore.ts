// apps/web/src/lib/stores/timePlayStore.ts
import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import type { TimeAllocation, TimeBlockWithProject } from '@buildos/shared-types';
import type { SlotFinderConfig } from '$lib/types/time-play';
import { DEFAULT_SLOT_FINDER_CONFIG } from '$lib/types/time-play';

interface TimePlayState {
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

function sortBlocks(blocks: TimeBlockWithProject[]): TimeBlockWithProject[] {
	return [...blocks].sort(
		(a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
	);
}

function createDefaultDateRange(): { start: Date; end: Date } {
	const start = new Date();
	const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
	return { start, end };
}

function loadSlotFinderConfig(): SlotFinderConfig {
	if (!browser) return DEFAULT_SLOT_FINDER_CONFIG;

	try {
		const saved = localStorage.getItem('timeplay-slot-finder-config');
		if (saved) {
			return { ...DEFAULT_SLOT_FINDER_CONFIG, ...JSON.parse(saved) };
		}
	} catch (error) {
		console.error('[TimePlayStore] Failed to load slot finder config:', error);
	}

	return DEFAULT_SLOT_FINDER_CONFIG;
}

function createTimePlayStore() {
	const initialState: TimePlayState = {
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

	const internalStore = writable<TimePlayState>(initialState);
	let currentState = initialState;

	internalStore.subscribe((value) => {
		currentState = value;
	});

	const { subscribe, set, update } = internalStore;

	async function requestBlocks(
		rangeStart: Date,
		rangeEnd: Date
	): Promise<TimeBlockWithProject[]> {
		const response = await fetch(
			`/api/time-play/blocks?start_date=${rangeStart.toISOString()}&end_date=${rangeEnd.toISOString()}`
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
			`/api/time-play/allocation?start_date=${rangeStart.toISOString()}&end_date=${rangeEnd.toISOString()}`
		);
		const payload = await response.json().catch(() => ({}));

		if (!response.ok) {
			throw new Error(payload?.error ?? 'Failed to load time allocation');
		}

		return payload?.data?.allocation ?? null;
	}

	return {
		subscribe,

		async loadBlocks(startDate?: Date, endDate?: Date) {
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
						console.error(
							'[TimePlayStore] Failed to load allocation:',
							allocationError
						);
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
				console.error('[TimePlayStore] loadBlocks failed:', error);
				update((state) => ({
					...state,
					isLoading: false,
					isAllocationLoading: false,
					error: error instanceof Error ? error.message : 'Failed to load time blocks'
				}));
			}
		},

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
				console.error('[TimePlayStore] loadBlocksOnly failed:', error);
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

				const response = await fetch('/api/time-play/create', {
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

				update((state) => ({
					...state,
					isCreating: false,
					blocks: sortBlocks([...state.blocks, newBlock])
				}));

				await this.refreshAllocation();

				return newBlock;
			} catch (error) {
				console.error('[TimePlayStore] createBlock failed:', error);
				update((state) => ({
					...state,
					isCreating: false,
					error: error instanceof Error ? error.message : 'Failed to create time block'
				}));
				throw error;
			}
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
				const response = await fetch(`/api/time-play/blocks/${blockId}/suggestions`, {
					method: 'POST'
				});

				if (!response.ok) {
					const payload = await response.json().catch(() => ({}));
					throw new Error(payload?.error ?? 'Failed to refresh suggestions');
				}

				const { data } = await response.json();
				const updatedBlock: TimeBlockWithProject = data.time_block;

				update((state) => ({
					...state,
					blocks: sortBlocks(
						state.blocks.map((block) => (block.id === blockId ? updatedBlock : block))
					),
					regeneratingIds: state.regeneratingIds.filter((id) => id !== blockId)
				}));

				return updatedBlock;
			} catch (error) {
				console.error('[TimePlayStore] regenerateSuggestions failed:', error);
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
				const response = await fetch(`/api/time-play/delete/${blockId}`, {
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

				await this.refreshAllocation();
			} catch (error) {
				console.error('[TimePlayStore] deleteBlock failed:', error);
				update((state) => ({
					...state,
					error: error instanceof Error ? error.message : 'Failed to delete time block'
				}));
				throw error;
			}
		},

		async refreshAllocation(startDate?: Date, endDate?: Date) {
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
				console.error('[TimePlayStore] refreshAllocation failed:', error);
				update((state) => ({
					...state,
					isAllocationLoading: false
				}));
			}
		},

		setDateRange(start: Date, end: Date) {
			update((state) => ({
				...state,
				selectedDateRange: { start, end }
			}));
			this.loadBlocks(start, end);
		},

		updateSlotFinderConfig(updates: Partial<SlotFinderConfig>) {
			update((state) => {
				const newConfig = { ...state.slotFinderConfig, ...updates };

				// Save to localStorage
				if (browser) {
					try {
						localStorage.setItem(
							'timeplay-slot-finder-config',
							JSON.stringify(newConfig)
						);
					} catch (error) {
						console.error('[TimePlayStore] Failed to save slot finder config:', error);
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
		}
	};
}

export const timePlayStore = createTimePlayStore();
