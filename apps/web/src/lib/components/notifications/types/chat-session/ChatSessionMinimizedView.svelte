<!-- apps/web/src/lib/components/notifications/types/chat-session/ChatSessionMinimizedView.svelte -->
<svelte:options runes={true} />

<script lang="ts">
	import {
		LoaderCircle,
		CheckCircle,
		AlertTriangle,
		MessageSquare,
		Pause,
		X
	} from 'lucide-svelte';
	import type { ChatSessionNotification } from '$lib/types/notification.types';

	let { notification }: { notification: ChatSessionNotification } = $props();

	let subtitle = $derived(
		notification.status === 'success'
			? (notification.data.responsePreview ?? 'Response ready — tap to review')
			: notification.progress?.type !== 'steps' && notification.progress?.message
				? notification.progress.message
				: ''
	);

	// The wrapper card's click reopens the chat; keep dismiss from bubbling
	// into that (both for pointer and keyboard activation).
	function handleDismiss(event: Event) {
		event.stopPropagation();
		notification.actions?.dismiss?.();
	}

	function handleDismissKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.stopPropagation();
		}
	}
</script>

<div class="p-4 flex items-center gap-3">
	<!-- Status icon -->
	<div class="flex-shrink-0">
		{#if notification.status === 'processing'}
			<LoaderCircle class="w-5 h-5 text-info animate-spin motion-reduce:animate-none" />
		{:else if notification.status === 'success'}
			<CheckCircle class="w-5 h-5 text-success" />
		{:else if notification.status === 'warning' || notification.status === 'error'}
			<AlertTriangle class="w-5 h-5 text-warning" />
		{:else}
			<Pause class="w-5 h-5 text-muted-foreground" />
		{/if}
	</div>

	<!-- Content -->
	<div class="flex-1 min-w-0">
		<div class="flex items-center gap-1.5">
			<MessageSquare class="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
			<span class="text-sm font-medium text-foreground truncate">
				{notification.data.title}
			</span>
		</div>
		{#if subtitle}
			<div class="text-xs text-muted-foreground truncate mt-0.5">{subtitle}</div>
		{/if}
	</div>

	<!-- Dismiss (= end this chat) -->
	<button
		type="button"
		onclick={handleDismiss}
		onkeydown={handleDismissKeydown}
		class="flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		aria-label="End chat"
		title="End chat"
	>
		<X class="w-3.5 h-3.5" />
	</button>
</div>
