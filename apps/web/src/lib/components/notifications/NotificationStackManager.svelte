<!-- apps/web/src/lib/components/notifications/NotificationStackManager.svelte -->
<script lang="ts">
	/**
	 * Notification Stack Manager
	 *
	 * Top-level orchestrator for the generic notification system.
	 * - Renders minimized notification stack (bottom-right)
	 * - Manages expanded modal (only one at a time)
	 * - Handles keyboard shortcuts (ESC to minimize)
	 *
	 * 📚 Documentation:
	 * - Component hierarchy: /generic-stackable-notification-system-spec.md#5-component-hierarchy
	 * - Architecture: /NOTIFICATION_SYSTEM_IMPLEMENTATION.md#architecture
	 * - Usage: Add to +layout.svelte (see /NOTIFICATION_SYSTEM_IMPLEMENTATION.md#2-integration)
	 */

	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { notificationStore } from '$lib/stores/notification.store';
	import NotificationStack from './NotificationStack.svelte';
	import NotificationModal from './NotificationModal.svelte';

	// Subscribe to store state
	let storeState = $derived($notificationStore);
	let notifications = $derived(storeState.notifications);
	let stack = $derived(storeState.stack);
	let expandedId = $derived(storeState.expandedId);

	// Get expanded notification
	let expandedNotification = $derived(expandedId ? notifications.get(expandedId) : null);

	// Keyboard shortcuts
	function handleKeyDown(event: KeyboardEvent) {
		// ESC key minimizes expanded notification
		if (event.key === 'Escape' && expandedId) {
			event.preventDefault();
			notificationStore.minimize(expandedId);
		}
	}

	onMount(() => {
		if (browser && typeof window !== 'undefined') {
			// Add global keyboard listener
			window.addEventListener('keydown', handleKeyDown);
		}
	});

	onDestroy(() => {
		if (browser && typeof window !== 'undefined') {
			// Clean up keyboard listener
			window.removeEventListener('keydown', handleKeyDown);
		}
	});
</script>

<!-- Minimized stack (bottom-right corner) -->
<NotificationStack {stack} {notifications} {expandedId} />

<!-- Expanded modal (only one at a time) -->
{#if expandedNotification}
	<NotificationModal notification={expandedNotification} />
{/if}
