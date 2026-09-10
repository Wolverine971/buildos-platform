<!-- apps/web/src/routes/landing-v2/+page.svelte -->
<script lang="ts">
	import { BRAND_TAGLINE, BRAND_DESCRIPTION } from '$lib/constants/brand';
	import HomepageV2 from '$lib/components/landing/HomepageV2.svelte';
</script>

<svelte:head>
	<title>BuildOS — {BRAND_TAGLINE}</title>
	<meta name="description" content={BRAND_DESCRIPTION} />
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<HomepageV2 />
