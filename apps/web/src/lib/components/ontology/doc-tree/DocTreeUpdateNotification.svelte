<!-- apps/web/src/lib/components/ontology/doc-tree/DocTreeUpdateNotification.svelte -->
<!--
	Notification shown when the document tree has been
	updated externally (detected via polling)
-->
<script lang="ts">
	import { RefreshCw, X } from 'lucide-svelte';

	interface Props {
		onRefresh: () => void;
		onDismiss: () => void;
	}

	let { onRefresh, onDismiss }: Props = $props();
</script>

<div
	class="flex items-center gap-3 px-3 py-2 mb-2 bg-accent/10 border border-accent/30 rounded-lg text-sm"
>
	<RefreshCw class="w-4 h-4 text-accent flex-shrink-0" />
	<span class="flex-1 text-foreground">Document tree has been updated.</span>
	<div class="flex items-center gap-1">
		<button
			type="button"
			onclick={onRefresh}
			class="px-2 py-1 text-xs font-medium text-accent hover:text-accent/80 hover:bg-accent/10 rounded transition-colors"
		>
			Refresh
		</button>
		<button
			type="button"
			onclick={onDismiss}
			class="p-1 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded transition-colors"
			aria-label="Dismiss"
		>
			<X class="w-3.5 h-3.5" />
		</button>
	</div>
</div>
