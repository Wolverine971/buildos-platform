<!-- apps/web/src/lib/components/inbox/InboxDecisionControls.svelte -->
<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import { Check, Clock, MessageCircle, X } from '$lib/icons/lucide';

	type Layout = 'project' | 'dashboard';

	let {
		pending = false,
		canChat = false,
		openingChat = false,
		layout = 'project',
		onApprove,
		onReject,
		onSnooze,
		onChat
	}: {
		pending?: boolean;
		canChat?: boolean;
		openingChat?: boolean;
		layout?: Layout;
		onApprove?: () => void;
		onReject?: () => void;
		onSnooze?: () => void;
		onChat?: () => void;
	} = $props();

	const containerClass = $derived(
		layout === 'dashboard'
			? 'flex shrink-0 flex-col items-stretch gap-2 sm:w-56 sm:items-end'
			: 'flex shrink-0 flex-col items-stretch gap-2 sm:w-52'
	);
	const canOpenChat = $derived(canChat && Boolean(onChat));
	const hasSecondaryActions = $derived(Boolean(onSnooze || canOpenChat));
</script>

<div class={containerClass}>
	<div class="grid w-full grid-cols-2 gap-2">
		<Button
			variant="success"
			size="sm"
			icon={Check}
			loading={pending}
			onclick={() => onApprove?.()}
			disabled={pending}
			class="min-h-11 w-full text-xs"
		>
			Accept
		</Button>
		<Button
			variant="outline"
			size="sm"
			icon={X}
			onclick={() => onReject?.()}
			disabled={pending}
			class="min-h-11 w-full text-xs"
		>
			Dismiss
		</Button>
	</div>
	{#if hasSecondaryActions}
		<div class="grid w-full gap-2 {onSnooze && canOpenChat ? 'grid-cols-2' : 'grid-cols-1'}">
			{#if canOpenChat}
				<Button
					variant="accent"
					size="sm"
					icon={MessageCircle}
					loading={openingChat}
					onclick={() => onChat?.()}
					disabled={pending || openingChat}
					class="min-h-11 w-full text-xs"
				>
					Chat
				</Button>
			{/if}
			{#if onSnooze}
				<Button
					variant="outline"
					size="sm"
					icon={Clock}
					onclick={() => onSnooze?.()}
					disabled={pending}
					title="Snooze until tomorrow"
					class="min-h-11 w-full text-xs"
				>
					Snooze
				</Button>
			{/if}
		</div>
	{/if}
</div>
