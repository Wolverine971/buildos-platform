<!-- apps/web/src/lib/components/inbox/InboxManagerBriefControls.svelte -->
<script lang="ts">
	import { Check, Clock3, MessageCircle, X } from '$lib/icons/lucide';
	import Button from '$lib/components/ui/Button.svelte';

	let {
		pending = false,
		canApprove = false,
		canDismiss = true,
		canChat = false,
		openingChat = false,
		layout = 'dashboard',
		onApprove,
		onDismiss,
		onSnooze,
		onChat
	}: {
		pending?: boolean;
		canApprove?: boolean;
		canDismiss?: boolean;
		canChat?: boolean;
		openingChat?: boolean;
		layout?: 'dashboard' | 'project';
		onApprove?: () => void;
		onDismiss: () => void;
		onSnooze: () => void;
		onChat: () => void;
	} = $props();
</script>

<div class="grid w-full shrink-0 grid-cols-2 gap-2 sm:w-52 {layout === 'project' ? 'sm:w-48' : ''}">
	{#if canApprove && onApprove}
		<Button
			variant="primary"
			size="sm"
			loading={pending}
			disabled={pending}
			onclick={onApprove}
			class="col-span-2 min-h-11"
		>
			<Check class="mr-2 h-4 w-4" aria-hidden="true" />
			Go with recommendation
		</Button>
	{/if}
	<Button
		variant={canApprove ? 'outline' : 'primary'}
		size="sm"
		loading={openingChat}
		disabled={pending || openingChat || !canChat}
		onclick={onChat}
		class="col-span-2 min-h-11"
	>
		<MessageCircle class="mr-2 h-4 w-4" aria-hidden="true" />
		Discuss decision
	</Button>
	{#if canDismiss}
		<Button
			variant="outline"
			size="sm"
			disabled={pending || openingChat}
			onclick={onDismiss}
			class="min-h-11"
		>
			<X class="mr-1.5 h-4 w-4" aria-hidden="true" />
			Dismiss
		</Button>
	{/if}
	<Button
		variant="outline"
		size="sm"
		disabled={pending || openingChat}
		onclick={onSnooze}
		class="min-h-11 {canDismiss ? '' : 'col-span-2'}"
	>
		<Clock3 class="mr-1.5 h-4 w-4" aria-hidden="true" />
		Snooze
	</Button>
</div>
