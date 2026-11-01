<!-- apps/web/src/routes/home-b/+page.svelte -->
<!-- Homepage version B ("Try it"), a review preview. Not indexed; / still serves the live page. -->
<script lang="ts">
	import { BRAND_DESCRIPTION } from '$lib/constants/brand';
	import HomeVariantB from '$lib/components/landing/home-variants/HomeVariantB.svelte';
	import HomeVariantSwitcher from '$lib/components/landing/home-variants/HomeVariantSwitcher.svelte';
</script>

<svelte:head>
	<title>BuildOS · Homepage B</title>
	<meta name="description" content={BRAND_DESCRIPTION} />
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<HomeVariantB />
<HomeVariantSwitcher />
