<!-- apps/web/src/lib/components/ui/LoadingSkeleton.svelte -->
<script lang="ts">
	import { LoaderCircle } from 'lucide-svelte';

	interface Props {
		message?: string;
		height?: string;
	}

	let { message = 'Loading...', height = '400px' }: Props = $props();
</script>

<div class="flex items-center justify-center" style="min-height: {height}">
	<div class="text-center">
		<LoaderCircle class="w-8 h-8 animate-spin text-accent mx-auto mb-3" />
		<p class="text-muted-foreground">{message}</p>
	</div>
</div>
