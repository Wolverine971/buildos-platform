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
	import Button from '$lib/components/ui/Button.svelte';
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
	let showAll = $state(false);
	let visibleStack = $derived(showAll ? stack : stack.slice(-MAX_VISIBLE));
	let hiddenCount = $derived(showAll ? 0 : Math.max(0, stack.length - MAX_VISIBLE));
	let canCollapse = $derived(showAll && stack.length > MAX_VISIBLE);

	$effect(() => {
		if (stack.length <= MAX_VISIBLE && showAll) showAll = false;
	});
</script>

{#if visibleStack.length > 0 || hiddenCount > 0}
	<div
		class="pointer-events-auto fixed inset-x-3 bottom-3 z-50 flex max-h-[calc(100dvh-1.5rem)] flex-col gap-2 overflow-y-auto overscroll-contain sm:left-auto sm:right-4 sm:bottom-4 sm:w-auto sm:max-h-[calc(100dvh-2rem)]"
		role="region"
		aria-label="Notification stack"
	>
		<!-- Older notifications are reachable instead of being a dead count badge. -->
		{#if hiddenCount > 0}
			<Button
				variant="outline"
				size="md"
				class="pointer-events-auto w-full shadow-ink-strong"
				aria-expanded="false"
				onclick={() => (showAll = true)}
			>
				Show {hiddenCount} older notification{hiddenCount === 1 ? '' : 's'}
			</Button>
		{:else if canCollapse}
			<Button
				variant="outline"
				size="md"
				class="pointer-events-auto w-full shadow-ink-strong"
				aria-expanded="true"
				onclick={() => (showAll = false)}
			>
				Show newest {MAX_VISIBLE}
			</Button>
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
