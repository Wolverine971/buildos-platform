<!-- apps/web/src/routes/projects/+layout.svelte -->
<script lang="ts">
	let { children } = $props();
</script>

<div class="min-h-screen min-h-[100dvh] bg-background">
	<!-- Main content -->
	<main
		class="relative overflow-y-auto bg-background [scrollbar-gutter:stable_both-edges]"
	>
		{@render children()}
	</main>
</div>
