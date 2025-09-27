import { writable, derived, get } from 'svelte/store';
import type { StreamingStatus, StreamingBriefData } from '$lib/types/daily-brief';

export interface UnifiedBriefGenerationState {
	// Core generation state
	isGenerating: boolean;
	isCheckingExisting: boolean;
	currentStep: string;
	message: string;

	// Progress tracking
	progress: {
		projects: {
			completed: number;
			total: number;
		};
		percentage: number;
		smoothedPercentage: number; // For interpolated progress
	};

	// Data
	streamingData: StreamingBriefData;

	// Error handling
	error?: string;

	// Metadata
	generationMethod: 'railway' | 'sse' | 'none';
	lastUpdateSource: 'railway' | 'sse' | 'realtime' | 'manual' | null;
	lastUpdateTime: number;
}

const initialState: UnifiedBriefGenerationState = {
	isGenerating: false,
	isCheckingExisting: false,
	currentStep: 'idle',
	message: '',
	progress: {
		projects: {
			completed: 0,
			total: 0
		},
		percentage: 0,
		smoothedPercentage: 0
	},
	streamingData: {
		mainBrief: undefined,
		projectBriefs: []
	},
	error: undefined,
	generationMethod: 'none',
	lastUpdateSource: null,
	lastUpdateTime: 0
};

class UnifiedBriefGenerationStore {
	private store = writable<UnifiedBriefGenerationState>(initialState);
	private updateDebounceTimers: Map<string, NodeJS.Timeout> = new Map();
	private progressAnimationFrame: number | null = null;
	private targetProgress = 0;

	// Expose readable store
	public subscribe = this.store.subscribe;

	// Derived stores for backward compatibility
	public streamingStatus = derived(this.store, ($state) => ({
		isGenerating: $state.isGenerating,
		currentStep: $state.currentStep,
		message: $state.message,
		progress: {
			projects: $state.progress.projects
		},
		error: $state.error
	}));

	public streamingBriefData = derived(this.store, ($state) => $state.streamingData);

	// Unified update method with debouncing and source tracking
	public update(
		updates: Partial<UnifiedBriefGenerationState>,
		source: 'railway' | 'sse' | 'realtime' | 'manual' = 'manual',
		debounceMs = 100
	): void {
		const debounceKey = `${source}-update`;

		// Clear existing debounce timer for this source
		if (this.updateDebounceTimers.has(debounceKey)) {
			clearTimeout(this.updateDebounceTimers.get(debounceKey)!);
		}

		// Special handling for critical state changes (no debounce)
		if (updates.isGenerating !== undefined || updates.error !== undefined) {
			this.applyUpdate(updates, source);
			return;
		}

		// Debounce other updates
		const timer = setTimeout(() => {
			this.applyUpdate(updates, source);
			this.updateDebounceTimers.delete(debounceKey);
		}, debounceMs);

		this.updateDebounceTimers.set(debounceKey, timer);
	}

	private applyUpdate(
		updates: Partial<UnifiedBriefGenerationState>,
		source: 'railway' | 'sse' | 'realtime' | 'manual'
	): void {
		this.store.update((state) => {
			const newState = { ...state };

			// Prevent conflicting updates from lower-priority sources
			if (!this.shouldApplyUpdate(state, source)) {
				return state;
			}

			// Apply updates
			Object.assign(newState, updates);

			// Update metadata
			newState.lastUpdateSource = source;
			newState.lastUpdateTime = Date.now();

			// Calculate percentage if projects data is updated
			if (updates.progress?.projects) {
				let { completed, total } = updates.progress.projects;

				// Validate and sanitize progress values
				total = Math.max(0, total); // Ensure non-negative
				completed = Math.max(0, Math.min(completed, total)); // Ensure 0 <= completed <= total

				// Update the sanitized values
				newState.progress.projects.completed = completed;
				newState.progress.projects.total = total;

				// Calculate percentage with bounds checking
				const rawPercentage = total > 0 ? (completed / total) * 100 : 0;
				newState.progress.percentage = Math.max(
					0,
					Math.min(100, Math.round(rawPercentage))
				);

				// Update target for smooth animation
				this.targetProgress = newState.progress.percentage;
				this.animateProgress();
			}

			return newState;
		});
	}

	private shouldApplyUpdate(
		currentState: UnifiedBriefGenerationState,
		source: 'railway' | 'sse' | 'realtime' | 'manual'
	): boolean {
		// Always allow manual updates
		if (source === 'manual') return true;

		// If not generating, allow all updates
		if (!currentState.isGenerating) return true;

		// Priority order: sse > railway > realtime
		const sourcePriority = { sse: 3, railway: 2, realtime: 1, manual: 4 };
		const lastSourcePriority = sourcePriority[currentState.lastUpdateSource || 'manual'];
		const newSourcePriority = sourcePriority[source];

		// Allow updates from same or higher priority sources
		// Or if last update was more than 500ms ago (stale)
		const isStale = Date.now() - currentState.lastUpdateTime > 500;
		return newSourcePriority >= lastSourcePriority || isStale;
	}

	// Smooth progress animation with safeguards
	private animateProgress(): void {
		if (this.progressAnimationFrame) {
			cancelAnimationFrame(this.progressAnimationFrame);
		}

		const startTime = Date.now();
		const MAX_ANIMATION_DURATION = 5000; // Maximum 5 seconds for animation
		const MAX_ITERATIONS = 100; // Maximum iterations to prevent infinite loops
		let iterations = 0;

		const animate = () => {
			iterations++;
			const elapsedTime = Date.now() - startTime;

			// Safety checks to prevent infinite loops
			if (iterations > MAX_ITERATIONS || elapsedTime > MAX_ANIMATION_DURATION) {
				console.warn('Animation loop exceeded limits, forcing completion');
				this.store.update((state) => ({
					...state,
					progress: {
						...state.progress,
						smoothedPercentage: Math.max(0, Math.min(100, this.targetProgress))
					}
				}));
				this.progressAnimationFrame = null;
				return;
			}

			this.store.update((state) => {
				const current = state.progress.smoothedPercentage;
				const target = Math.max(0, Math.min(100, this.targetProgress)); // Ensure target is bounded

				// Check if we're close enough to the target
				if (Math.abs(current - target) < 0.5) {
					this.progressAnimationFrame = null; // Clear the animation frame
					return {
						...state,
						progress: { ...state.progress, smoothedPercentage: target }
					};
				}

				// Smooth interpolation with bounds checking
				const step = (target - current) * 0.1;
				const newSmoothed = Math.max(0, Math.min(100, current + step));

				// Only continue if we haven't reached the target
				if (Math.abs(newSmoothed - target) >= 0.5) {
					this.progressAnimationFrame = requestAnimationFrame(animate);
				} else {
					this.progressAnimationFrame = null;
				}

				return {
					...state,
					progress: { ...state.progress, smoothedPercentage: newSmoothed }
				};
			});
		};

		animate();
	}

	// State management methods
	public startChecking(): void {
		this.update(
			{
				isCheckingExisting: true,
				isGenerating: false,
				currentStep: 'checking',
				message: 'Checking for existing generation...',
				error: undefined
			},
			'manual',
			0
		);
	}

	public startGeneration(method: 'railway' | 'sse'): void {
		// Don't reset if already generating (smooth transition)
		const currentState = get(this.store);
		if (currentState.isGenerating && currentState.generationMethod === method) {
			return;
		}

		this.update(
			{
				isCheckingExisting: false,
				isGenerating: true,
				currentStep: 'initializing',
				message: 'Starting brief generation...',
				generationMethod: method,
				error: undefined,
				// Don't reset progress if transitioning from checking
				progress: currentState.isCheckingExisting
					? currentState.progress
					: { projects: { completed: 0, total: 0 }, percentage: 0, smoothedPercentage: 0 }
			},
			'manual',
			0
		);
	}

	public updateProgress(
		completed: number,
		total: number,
		message: string,
		source: 'railway' | 'sse' | 'realtime' = 'sse'
	): void {
		this.update(
			{
				progress: {
					projects: { completed, total },
					percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
					smoothedPercentage: get(this.store).progress.smoothedPercentage
				},
				message,
				currentStep: 'generating_project_briefs'
			},
			source
		);
	}

	public complete(): void {
		const finalState = get(this.store);
		this.update(
			{
				isGenerating: false,
				currentStep: 'completed',
				message: 'Brief generation completed!',
				progress: {
					...finalState.progress,
					percentage: 100,
					smoothedPercentage: 100
				}
			},
			'manual',
			0
		);

		// Clean up after a delay
		setTimeout(() => this.reset(), 2000);
	}

	public setError(error: string): void {
		this.update(
			{
				isGenerating: false,
				isCheckingExisting: false,
				currentStep: 'error',
				message: '',
				error
			},
			'manual',
			0
		);
	}

	public reset(): void {
		// Clear all debounce timers
		this.updateDebounceTimers.forEach((timer) => clearTimeout(timer));
		this.updateDebounceTimers.clear();

		// Cancel animation
		if (this.progressAnimationFrame) {
			cancelAnimationFrame(this.progressAnimationFrame);
			this.progressAnimationFrame = null;
		}

		this.store.set(initialState);
	}

	// Cleanup on destroy
	public destroy(): void {
		this.reset();
	}
}

// Create singleton instance
export const unifiedBriefGenerationStore = new UnifiedBriefGenerationStore();

// Export derived stores for backward compatibility
export const streamingStatus = unifiedBriefGenerationStore.streamingStatus;
export const streamingBriefData = unifiedBriefGenerationStore.streamingBriefData;

// Writable store for brief generation completion events (original payload preserved)
export const briefGenerationCompletedWritable = writable<{
	briefDate: string;
	timestamp: number;
} | null>(null);
export const briefGenerationCompleted = briefGenerationCompletedWritable;
