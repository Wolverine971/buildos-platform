// apps/web/src/lib/stores/unifiedBriefGeneration.store.test.ts
import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { unifiedBriefGenerationStore } from './unifiedBriefGeneration.store';

function progress(completed: number, total = 4) {
	return { projects: { completed, total }, percentage: 0, smoothedPercentage: 0 };
}

describe('unifiedBriefGenerationStore.update debouncing', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubGlobal(
			'requestAnimationFrame',
			vi.fn(() => 1)
		);
		vi.stubGlobal('cancelAnimationFrame', vi.fn());
		unifiedBriefGenerationStore.reset();
	});

	afterEach(() => {
		unifiedBriefGenerationStore.reset();
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('applies progress while events keep arriving faster than the debounce window', () => {
		unifiedBriefGenerationStore.update({ progress: progress(1) }, 'sse');
		vi.advanceTimersByTime(60);
		unifiedBriefGenerationStore.update({ progress: progress(2) }, 'sse');
		vi.advanceTimersByTime(50);

		expect(get(unifiedBriefGenerationStore).progress.projects.completed).toBe(2);

		unifiedBriefGenerationStore.update({ progress: progress(3) }, 'sse');
		vi.advanceTimersByTime(60);
		unifiedBriefGenerationStore.update({ message: 'Project 4' }, 'sse');
		vi.advanceTimersByTime(50);

		const state = get(unifiedBriefGenerationStore);
		expect(state.progress.projects.completed).toBe(3);
		expect(state.message).toBe('Project 4');
	});

	it('flushes a pending update together with a critical one instead of dropping it', () => {
		unifiedBriefGenerationStore.update({ currentStep: 'projects' }, 'sse');
		unifiedBriefGenerationStore.update({ isGenerating: true }, 'sse');

		const state = get(unifiedBriefGenerationStore);
		expect(state.isGenerating).toBe(true);
		expect(state.currentStep).toBe('projects');

		vi.advanceTimersByTime(500);
		expect(get(unifiedBriefGenerationStore).currentStep).toBe('projects');
	});
});
