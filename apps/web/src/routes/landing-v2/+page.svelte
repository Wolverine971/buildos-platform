<!-- apps/web/src/routes/landing-v2/+page.svelte -->
<script lang="ts">
	import HomepageV2 from '$lib/components/landing/HomepageV2.svelte';
</script>

<svelte:head>
	<title>BuildOS — Talk to BuildOS, see your thoughts organized.</title>
	<meta
		name="description"
		content="BuildOS is a thinking environment for creators. Talk to BuildOS, see your projects organized. Same context for you and your agents — both make progress, in parallel."
	/>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<HomepageV2 />
