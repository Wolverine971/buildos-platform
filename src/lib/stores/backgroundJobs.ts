// src/lib/stores/backgroundJobs.ts
import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';
import {
	backgroundBrainDumpService,
	type BackgroundJob
} from '$lib/services/braindump-background.service';

function createBackgroundJobsStore() {
	const { subscribe, set, update } = writable<BackgroundJob[]>([]);

	// Initialize from service
	if (browser) {
		set(backgroundBrainDumpService.getAllJobs());

		// Subscribe to service updates
		backgroundBrainDumpService.subscribe((job) => {
			update((jobs) => {
				const index = jobs.findIndex((j) => j.id === job.id);
				if (index >= 0) {
					jobs[index] = job;
				} else {
					jobs.push(job);
				}
				return [...jobs];
			});
		});

		// Clean up old jobs periodically
		setInterval(() => {
			backgroundBrainDumpService.clearCompletedJobs();
			set(backgroundBrainDumpService.getAllJobs());
		}, 60000); // Every minute
	}

	return {
		subscribe,
		refresh: () => {
			if (browser) {
				set(backgroundBrainDumpService.getAllJobs());
			}
		}
	};
}

export const backgroundJobs = createBackgroundJobsStore();

// Derived stores for different job states
export const activeBackgroundJobs = derived(backgroundJobs, ($jobs) =>
	$jobs.filter((job) => job.status === 'pending' || job.status === 'processing')
);

export const processingJobs = derived(backgroundJobs, ($jobs) =>
	$jobs.filter((job) => job.status === 'processing')
);

export const completedJobs = derived(backgroundJobs, ($jobs) =>
	$jobs.filter((job) => job.status === 'completed')
);

export const failedJobs = derived(backgroundJobs, ($jobs) =>
	$jobs.filter((job) => job.status === 'failed')
);
