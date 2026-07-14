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
	} from '$lib/icons/lucide';
	import type { ChatSessionNotification } from '$lib/types/notification.types';

	let { notification }: { notification: ChatSessionNotification } = $props();

	let subtitle = $derived(
		notification.status === 'success'
			? (notification.data.responsePreview ?? 'Response ready — tap to review')
			: notification.progress?.type !== 'steps' && notification.progress?.message
				? notification.progress.message
				: ''
	);
	let contextLabel = $derived(
		notification.data.contextLabel ??
			(notification.data.contextType === 'global'
				? 'Workspace'
				: notification.data.contextType
					? 'Project'
					: 'Chat')
	);

	function handleOpen(event: Event) {
		event.stopPropagation();
		notification.actions?.view?.();
	}

	// The wrapper card's click reopens the chat; keep dismiss from bubbling
	// into that (both for pointer and keyboard activation).
	function handleDismiss(event: Event) {
		event.stopPropagation();
		notification.actions?.dismiss?.();
	}
</script>

<div class="flex items-center gap-2 p-3">
	<!-- Status icon -->
	<div class="flex-shrink-0" aria-hidden="true">
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

	<!-- Open chat -->
	<button
		type="button"
		onclick={handleOpen}
		class="min-h-11 min-w-0 flex-1 rounded-md px-1.5 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		aria-label={`Open chat in ${contextLabel}: ${notification.data.title}${subtitle ? `. ${subtitle}` : ''}`}
	>
		<span class="block truncate text-sm font-semibold text-foreground">{contextLabel}</span>
		<span class="mt-0.5 flex items-center gap-1.5">
			<MessageSquare class="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
			<span class="truncate text-xs font-medium text-foreground">
				{notification.data.title}
			</span>
		</span>
		{#if subtitle}
			<span class="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{subtitle}</span>
		{/if}
	</button>

	<!-- Dismiss (= end this chat) -->
	<button
		type="button"
		onclick={handleDismiss}
		class="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		aria-label={`End chat: ${notification.data.title}`}
		title="End chat"
	>
		<X class="w-3.5 h-3.5" />
	</button>
</div>
