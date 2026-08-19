<!-- apps/web/src/routes/projects-old/+layout.svelte -->
<script lang="ts">
	let { children } = $props();
</script>

<div class="min-h-screen bg-background rounded-md">
	{@render children()}
</div>
