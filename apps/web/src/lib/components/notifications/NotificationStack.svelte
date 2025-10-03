<!-- apps/web/src/lib/components/notifications/NotificationStack.svelte -->
<script lang="ts">
	/**
	 * Notification Stack
	 *
	 * Renders the stack of minimized notifications in the bottom-right corner.
	 * - Shows max 5 visible notifications
	 * - Collapses older notifications into "+N more" badge
	 * - Each notification is clickable to expand
	 */

	import { fly } from 'svelte/transition';
	import type { Notification } from '$lib/types/notification.types';
	import MinimizedNotification from './MinimizedNotification.svelte';

	// Props
	let {
		stack,
		notifications,
		expandedId
	}: {
		stack: string[];
		notifications: Map<string, Notification>;
		expandedId: string | null;
	} = $props();

	// Show max 5 notifications, collapse older ones
	const MAX_VISIBLE = 5;
	let visibleStack = $derived(stack.slice(-MAX_VISIBLE));
	let hiddenCount = $derived(Math.max(0, stack.length - MAX_VISIBLE));

</script>

{#if visibleStack.length > 0 || hiddenCount > 0}
	<div
		class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
		role="region"
		aria-label="Notification stack"
	>
		<!-- Hidden notifications count badge -->
		{#if hiddenCount > 0}
			<div
				class="bg-gray-800 dark:bg-gray-700 text-white px-3 py-1 rounded-md text-sm font-medium shadow-lg pointer-events-auto"
				transition:fly={{ y: 20, duration: 200 }}
			>
				+{hiddenCount} more
			</div>
		{/if}

		<!-- Visible notifications (bottom to top) -->
		{#each visibleStack as notificationId (notificationId)}
			{@const notification = notifications.get(notificationId)}
			{#if notification && notificationId !== expandedId}
				<div transition:fly={{ y: 20, duration: 300 }}>
					<MinimizedNotification {notification} />
				</div>
			{/if}
		{/each}
	</div>
{/if}
