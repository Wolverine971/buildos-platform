<!-- apps/web/src/lib/components/inbox/InboxDecisionControls.svelte -->
<script lang="ts">
	import { Check, LoaderCircle, MessageCircle, X } from 'lucide-svelte';

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
		<button
			type="button"
			class="pressable inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-success/30 bg-success/10 px-2.5 py-1.5 text-center text-[12px] font-semibold leading-tight text-success hover:bg-success/15 disabled:opacity-50"
			onclick={() => onApprove?.()}
			disabled={pending}
		>
			{#if pending}
				<LoaderCircle class="h-3.5 w-3.5 animate-spin" />
			{:else}
				<Check class="h-3.5 w-3.5" />
			{/if}
			Accept
		</button>
		<button
			type="button"
			class="pressable inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-center text-[12px] font-semibold leading-tight text-muted-foreground hover:bg-muted disabled:opacity-50"
			onclick={() => onReject?.()}
			disabled={pending}
		>
			<X class="h-3.5 w-3.5" />
			Dismiss
		</button>
		{#if canChat}
			<button
				type="button"
				class="pressable inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-2.5 py-1.5 text-[12px] font-semibold text-accent hover:bg-accent/15 disabled:opacity-50"
				onclick={() => onChat?.()}
				disabled={pending || openingChat}
			>
				{#if openingChat}
					<LoaderCircle class="h-3.5 w-3.5 animate-spin" />
				{:else}
					<MessageCircle class="h-3.5 w-3.5" />
				{/if}
				Chat
			</button>
		{/if}
	</div>
</div>
