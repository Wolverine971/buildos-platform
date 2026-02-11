// apps/web/src/lib/utils/loadingStateManager.ts
/**
 * Unified Loading State Manager for Zero Layout Shift
 * Coordinates component loading, data loading, and UI state synchronization
 */

import { writable, derived, type Writable } from 'svelte/store';

export type LoadingState = 'idle' | 'loading' | 'success' | 'error' | 'refreshing';

export interface UnifiedTabState {
	/** API data loading state */
	data: LoadingState;
	/** Component import loading state */
	component: boolean;
	/** Current operation being performed */
	operation: string | null;
	/** Both component and data are ready */
	ready: boolean;
	/** Has existing data (prevents skeleton on refresh) */
	hasData: boolean;
	/** Is performing optimistic update */
	optimistic: boolean;
}

export interface LoadingStateConfig {
	/** Tab identifier */
	tab: string;
	/** Component name to track */
	componentName?: string;
	/** Data types to track */
	dataTypes: string[];
	/** Should show skeleton when loading */
	showSkeleton?: boolean;
}

export class LoadingStateManager {
	private tabStatesStore: Writable<Record<string, UnifiedTabState>>;
	private config = new Map<string, LoadingStateConfig>();

	constructor() {
		this.tabStatesStore = writable({});
		// Initialize default tab states
		this.initializeDefaultTabs();
	}

	// Getter for reactive access to tab states
	get tabStates() {
		return this.tabStatesStore;
	}

	private initializeDefaultTabs() {
		const defaultTabs = [
			{
				tab: 'overview',
				componentName: 'PhasesSection',
				dataTypes: ['phases', 'tasks'],
				showSkeleton: true
			},
			{
				tab: 'tasks',
				componentName: 'TasksList',
				dataTypes: ['tasks'],
				showSkeleton: true
			},
			{
				tab: 'notes',
				componentName: 'NotesSection',
				dataTypes: ['notes'],
				showSkeleton: true
			},
			{
				tab: 'briefs',
				componentName: undefined, // No lazy loading
				dataTypes: ['briefs'],
				showSkeleton: true
			},
			{
				tab: 'synthesis',
				componentName: 'ProjectSynthesis',
				dataTypes: ['synthesis'],
				showSkeleton: true
			}
		];

		const initialStates: Record<string, UnifiedTabState> = {};

		defaultTabs.forEach((tabConfig) => {
			this.config.set(tabConfig.tab, tabConfig);
			initialStates[tabConfig.tab] = {
				data: 'idle',
				component: false,
				operation: null,
				ready: false,
				hasData: false,
				optimistic: false
			};
		});

		this.tabStatesStore.set(initialStates);
	}

	/**
	 * Update data loading state for a tab
	 */
	setDataLoading(tab: string, state: LoadingState, hasExistingData = false) {
		this.tabStatesStore.update((states) => {
			if (!states[tab]) return states;

			return {
				...states,
				[tab]: {
					...states[tab],
					data: state,
					hasData: hasExistingData || states[tab].hasData,
					ready: this.calculateReadyState(tab, state, states[tab].component)
				}
			};
		});
	}

	/**
	 * Update component loading state for a tab
	 */
	setComponentLoading(tab: string, loading: boolean) {
		this.tabStatesStore.update((states) => {
			if (!states[tab]) return states;

			return {
				...states,
				[tab]: {
					...states[tab],
					component: loading,
					ready: this.calculateReadyState(tab, states[tab].data, loading)
				}
			};
		});
	}

	/**
	 * Set operation state (e.g., "creating", "updating", "deleting")
	 */
	setOperation(tab: string, operation: string | null) {
		this.tabStatesStore.update((states) => {
			if (!states[tab]) return states;
			return {
				...states,
				[tab]: { ...states[tab], operation }
			};
		});
	}

	/**
	 * Set optimistic update state
	 */
	setOptimistic(tab: string, optimistic: boolean) {
		this.tabStatesStore.update((states) => {
			if (!states[tab]) return states;
			return {
				...states,
				[tab]: { ...states[tab], optimistic }
			};
		});
	}

	/**
	 * Calculate if tab is ready to show content
	 */
	private calculateReadyState(
		tab: string,
		dataState: LoadingState,
		componentLoading: boolean
	): boolean {
		const config = this.config.get(tab);
		if (!config) return true;

		// If no component to load, only check data
		if (!config.componentName) {
			return dataState === 'success' || dataState === 'idle';
		}

		// Both component and data must be ready
		const componentReady = !componentLoading;
		const dataReady = dataState === 'success' || dataState === 'idle';

		return componentReady && dataReady;
	}

	/**
	 * Create derived store for skeleton visibility
	 */
	shouldShowSkeleton(tab: string) {
		return derived(this.tabStatesStore, (states) => {
			const state = states[tab];
			const config = this.config.get(tab);

			if (!state || !config?.showSkeleton) return false;

			// Don't show skeleton if we have data and are just refreshing
			if (state.hasData && (state.data === 'refreshing' || state.optimistic)) {
				return false;
			}

			// Show skeleton if not ready and no existing data
			return !state.ready && !state.hasData;
		});
	}

	/**
	 * Create derived store for loading indicator visibility
	 */
	shouldShowLoadingIndicator(tab: string) {
		return derived(this.tabStatesStore, (states) => {
			const state = states[tab];
			if (!state) return false;

			// Show loading indicator when refreshing existing data
			return state.hasData && (state.data === 'loading' || state.data === 'refreshing');
		});
	}

	/**
	 * Create derived store for tab state
	 */
	getTabState(tab: string) {
		return derived(this.tabStatesStore, (states) => states[tab] || null);
	}

	/**
	 * Create derived store for loading message
	 */
	getLoadingMessage(tab: string) {
		return derived(this.tabStatesStore, (states) => {
			const state = states[tab];
			if (!state) return 'Loading...';

			if (state.operation) {
				return `${state.operation}...`;
			}

			if (state.component && state.data !== 'loading') {
				return `Loading ${tab} component...`;
			}

			if (state.data === 'loading') {
				return `Loading ${tab} data...`;
			}

			if (state.data === 'refreshing') {
				return `Refreshing ${tab}...`;
			}

			return 'Loading...';
		});
	}

	/**
	 * Get current snapshot of tab states (non-reactive)
	 * Used when store subscriptions are not allowed (like in $derived)
	 */
	getTabStatesSnapshot(): Record<string, UnifiedTabState> {
		let snapshot: Record<string, UnifiedTabState> = {};
		const unsubscribe = this.tabStatesStore.subscribe((states) => {
			snapshot = states;
		});
		unsubscribe(); // Immediately unsubscribe after getting current value
		return snapshot;
	}

	/**
	 * Coordinate loading sequence for optimal UX
	 */
	async coordinateTabLoad(
		tab: string,
		dataLoader: () => Promise<void>,
		componentLoader?: () => Promise<void>
	): Promise<void> {
		// Start both in parallel
		const promises: Promise<void>[] = [];

		// Data loading
		this.setDataLoading(tab, 'loading');
		promises.push(
			dataLoader()
				.then(() => this.setDataLoading(tab, 'success', true))
				.catch(() => this.setDataLoading(tab, 'error'))
		);

		// Component loading if needed
		if (componentLoader) {
			this.setComponentLoading(tab, true);
			promises.push(
				componentLoader()
					.then(() => this.setComponentLoading(tab, false))
					.catch(() => this.setComponentLoading(tab, false))
			);
		}

		// Wait for both to complete
		await Promise.allSettled(promises);
	}

	/**
	 * Reset state for a tab
	 */
	resetTab(tab: string) {
		this.tabStatesStore.update((states) => {
			if (!states[tab]) return states;

			return {
				...states,
				[tab]: {
					data: 'idle',
					component: false,
					operation: null,
					ready: false,
					hasData: false,
					optimistic: false
				}
			};
		});
	}

	/**
	 * Reset all states
	 */
	resetAll() {
		this.tabStatesStore.update((states) => {
			const resetStates = { ...states };
			Object.keys(resetStates).forEach((tab) => {
				resetStates[tab] = {
					data: 'idle',
					component: false,
					operation: null,
					ready: false,
					hasData: false,
					optimistic: false
				};
			});
			return resetStates;
		});
	}
}

// Export singleton instance
export const loadingStateManager = new LoadingStateManager();
