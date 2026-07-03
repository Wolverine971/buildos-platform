<!-- apps/web/src/lib/components/inbox/InboxDecisionControls.svelte -->
<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import { Check, MessageCircle, X } from '$lib/icons/lucide';

	type Layout = 'project' | 'dashboard';

	let {
		pending = false,
		canChat = false,
		openingChat = false,
		layout = 'project',
		onApprove,
		onReject,
		onChat
	}: {
		pending?: boolean;
		canChat?: boolean;
		openingChat?: boolean;
		layout?: Layout;
		onApprove?: () => void;
		onReject?: () => void;
		onChat?: () => void;
	} = $props();

	const containerClass = $derived(
		layout === 'dashboard'
			? 'flex shrink-0 flex-col items-stretch gap-2 sm:w-56 sm:items-end'
			: 'flex shrink-0 flex-col items-stretch gap-2 sm:w-52'
	);
</script>

<div class={containerClass}>
	<div class="flex flex-wrap items-center justify-end gap-2">
		<Button
			variant="success"
			size="sm"
			icon={Check}
			loading={pending}
			onclick={() => onApprove?.()}
			disabled={pending}
			class="min-w-[6.5rem] flex-1 text-xs"
		>
			Accept
		</Button>
		<Button
			variant="outline"
			size="sm"
			icon={X}
			onclick={() => onReject?.()}
			disabled={pending}
			class="min-w-[6.5rem] flex-1 text-xs"
		>
			Dismiss
		</Button>
		{#if canChat}
			<Button
				variant="accent"
				size="sm"
				icon={MessageCircle}
				loading={openingChat}
				onclick={() => onChat?.()}
				disabled={pending || openingChat}
				class="min-w-[6.5rem] flex-1 text-xs"
			>
				Chat
			</Button>
		{/if}
	</div>
</div>
