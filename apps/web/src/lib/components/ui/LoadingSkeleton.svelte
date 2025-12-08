<!-- apps/web/src/lib/components/ui/LoadingSkeleton.svelte -->
<script lang="ts">
	import { LoaderCircle } from 'lucide-svelte';

	export let message: string = 'Loading...';
	export let height: string = '400px';
</script>

<div class="flex items-center justify-center" style="min-height: {height}">
	<div class="text-center">
		<LoaderCircle class="w-8 h-8 animate-spin text-accent mx-auto mb-3" />
		<p class="text-muted-foreground">{message}</p>
	</div>
</div>
