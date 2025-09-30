// apps/web/src/lib/stores/navigation.store.ts
import { writable } from 'svelte/store';
import { goto } from '$app/navigation';
import { browser } from '$app/environment';

interface NavigationRequest {
	url: string;
	timestamp: number;
}

function createNavigationStore() {
	const { subscribe, set, update } = writable<NavigationRequest | null>(null);

	return {
		subscribe,
		navigateTo: (url: string) => {
			console.log('[NavigationStore] Request to navigate to:', url);

			if (!browser) {
				console.error('[NavigationStore] Not in browser context');
				return;
			}

			// Just set the navigation request - let subscribers handle the actual navigation
			set({ url, timestamp: Date.now() });

			// Clear after a delay
			setTimeout(() => set(null), 500);
		},
		clear: () => set(null)
	};
}

export const navigationStore = createNavigationStore();
