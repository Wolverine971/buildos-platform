<!-- apps/web/src/lib/components/ontology/doc-tree/DocTreeUpdateNotification.svelte -->
<!--
	Notification shown when the document tree has been
	updated externally (detected via polling)
-->
<script lang="ts">
	import { RefreshCw, X } from '$lib/icons/lucide';

	interface Props {
		onRefresh: () => void;
		onDismiss: () => void;
	}

	let { onRefresh, onDismiss }: Props = $props();
</script>

<div
	class="mb-2 flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm"
	role="status"
	aria-live="polite"
>
	<RefreshCw class="w-4 h-4 text-accent flex-shrink-0" />
	<span class="min-w-0 flex-1 text-foreground">Document tree has been updated.</span>
	<div class="flex items-center gap-1">
		<button
			type="button"
			onclick={onRefresh}
			class="inline-flex min-h-[44px] items-center rounded-md px-2 text-xs font-medium text-accent transition-colors hover:bg-accent/10 hover:text-accent/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none pressable"
		>
			Refresh
		</button>
		<button
			type="button"
			onclick={onDismiss}
			class="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none pressable"
			aria-label="Dismiss document tree update"
		>
			<X class="w-3.5 h-3.5" />
		</button>
	</div>
</div>
