<!-- apps/web/src/routes/home-a/+page.svelte -->
<!-- Homepage version A ("The Desk"), a review preview. Not indexed; / still serves the live page. -->
<script lang="ts">
	import { BRAND_DESCRIPTION } from '$lib/constants/brand';
	import HomeVariantA from '$lib/components/landing/home-variants/HomeVariantA.svelte';
	import HomeVariantSwitcher from '$lib/components/landing/home-variants/HomeVariantSwitcher.svelte';
</script>

<svelte:head>
	<title>BuildOS · Homepage A</title>
	<meta name="description" content={BRAND_DESCRIPTION} />
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<HomeVariantA />
<HomeVariantSwitcher />
