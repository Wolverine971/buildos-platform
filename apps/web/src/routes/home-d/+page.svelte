<!-- apps/web/src/routes/home-d/+page.svelte -->
<!-- Homepage version D ("Clear pitch"), a review preview. Not indexed; / still serves the live page. -->
<script lang="ts">
	import { BRAND_DESCRIPTION } from '$lib/constants/brand';
	import HomeVariantD from '$lib/components/landing/home-variants/HomeVariantD.svelte';
	import HomeVariantSwitcher from '$lib/components/landing/home-variants/HomeVariantSwitcher.svelte';
</script>

<svelte:head>
	<title>BuildOS · Homepage D</title>
	<meta name="description" content={BRAND_DESCRIPTION} />
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<HomeVariantD />
<HomeVariantSwitcher dismissible />
