// apps/web/src/lib/stores/brainDumpPreferences.ts
import { writable, type Writable } from 'svelte/store';
import { browser } from '$app/environment';

const STORAGE_KEY = 'brain-dump-auto-accept';

interface BrainDumpAutoAcceptStore extends Writable<boolean> {
	enable: () => void;
	disable: () => void;
	toggle: () => void;
	shouldAutoAccept: (operationCount?: number, hasErrors?: boolean) => boolean;
}

// Simple local storage store for auto-accept preference
function createBrainDumpPreferencesStore(): BrainDumpAutoAcceptStore {
	// Initialize from local storage
	const stored = browser ? localStorage.getItem(STORAGE_KEY) === 'true' : false;

	const { subscribe, set, update } = writable<boolean>(stored);

	return {
		subscribe,
		set,
		update,

		// Enable auto-accept
		enable: () => {
			if (browser) {
				localStorage.setItem(STORAGE_KEY, 'true');
				set(true);
			}
		},

		// Disable auto-accept
		disable: () => {
			if (browser) {
				localStorage.setItem(STORAGE_KEY, 'false');
				set(false);
			}
		},

		// Toggle auto-accept
		toggle: () => {
			if (browser) {
				const current = localStorage.getItem(STORAGE_KEY) === 'true';
				const newValue = !current;
				localStorage.setItem(STORAGE_KEY, String(newValue));
				set(newValue);
			}
		},

		// Check if should auto-accept (can add more logic here if needed)
		shouldAutoAccept: (operationCount: number = 0, hasErrors: boolean = false): boolean => {
			const enabled = browser ? localStorage.getItem(STORAGE_KEY) === 'true' : false;

			// Simple logic: auto-accept if enabled, no errors, and reasonable operation count
			if (!enabled) return false;
			if (hasErrors) return false;
			if (operationCount > 20) return false; // Safety limit

			return true;
		}
	};
}

export const brainDumpAutoAccept: BrainDumpAutoAcceptStore = createBrainDumpPreferencesStore();
