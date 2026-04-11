<!-- apps/web/src/routes/admin/llm-usage/+page.svelte -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	onMount(() => {
		void goto('/admin/chat#llm-usage', { replaceState: true });
	});
</script>

<svelte:head>
	<title>Redirecting - Admin - BuildOS</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="admin-page">
	<p class="text-sm text-muted-foreground">Redirecting to chat monitoring...</p>
</div>
