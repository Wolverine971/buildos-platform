<!-- apps/web/src/lib/components/inbox/InboxFindingControls.svelte -->
<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import { Check, Clock, MessageCircle, X } from '$lib/icons/lucide';

	type Layout = 'project' | 'dashboard';

	let {
		idPrefix,
		note = '',
		pending = false,
		canChat = false,
		openingChat = false,
		layout = 'project',
		onNoteChange,
		onAddress,
		onReject,
		onSnooze,
		onChat
	}: {
		idPrefix: string;
		note?: string;
		pending?: boolean;
		canChat?: boolean;
		openingChat?: boolean;
		layout?: Layout;
		onNoteChange?: (value: string) => void;
		onAddress?: (value: string) => void;
		onReject?: () => void;
		onSnooze?: () => void;
		onChat?: () => void;
	} = $props();

	const containerClass = $derived(
		layout === 'dashboard'
			? 'w-full shrink-0 space-y-2 sm:w-72'
			: 'w-full shrink-0 space-y-2 sm:w-64'
	);
	const canOpenChat = $derived(canChat && Boolean(onChat));
	const canAddress = $derived(Boolean(note.trim()) && !pending);

	function handleInput(event: Event) {
		onNoteChange?.((event.currentTarget as HTMLInputElement).value);
	}
</script>

<div class={containerClass}>
	<div>
		<label for={`${idPrefix}-address-note`} class="micro-label text-muted-foreground">
			One-line response
		</label>
		<input
			id={`${idPrefix}-address-note`}
			type="text"
			value={note}
			maxlength="1000"
			disabled={pending}
			oninput={handleInput}
			placeholder="Record the context that resolves this"
			class="mt-1 h-11 w-full rounded-md border border-border-strong bg-background px-3 text-xs text-foreground shadow-ink-inner outline-none transition-colors placeholder:text-muted-foreground focus:border-accent focus:ring-1 focus:ring-accent/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-60"
		/>
	</div>
	<div class="grid w-full grid-cols-2 gap-2">
		<Button
			variant="success"
			size="sm"
			icon={Check}
			loading={pending}
			onclick={() => onAddress?.(note.trim())}
			disabled={!canAddress}
			class="min-h-11 w-full text-xs"
		>
			Address
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
	{#if canOpenChat || onSnooze}
		<div class="grid w-full gap-2 {canOpenChat && onSnooze ? 'grid-cols-2' : 'grid-cols-1'}">
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
