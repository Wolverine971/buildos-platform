<!-- apps/web/src/lib/components/SEOHead.svelte -->
<script lang="ts">
	import {
		DEFAULT_SOCIAL_IMAGE_ALT,
		DEFAULT_SOCIAL_IMAGE_HEIGHT,
		DEFAULT_SOCIAL_IMAGE_TYPE,
		DEFAULT_SOCIAL_IMAGE_URL,
		DEFAULT_SOCIAL_IMAGE_WIDTH,
		DEFAULT_TWITTER_CREATOR,
		DEFAULT_TWITTER_SITE
	} from '$lib/constants/seo';
	import { serializeJsonLd } from '$lib/utils/json-ld';

	export let title = 'BuildOS - Turn Messy Thinking into Structured Work';
	export let description =
		'BuildOS is a thinking environment for people making complex things. Bring rough ideas, notes, and research, then turn them into structured projects with memory and a clear next move.';
	export let canonical = 'https://build-os.com/';
	export let keywords =
		'thinking environment, project memory, creator workflow, author workflow, YouTube workflow, task organization, daily briefs, voice notes';
	export let ogType = 'website';
	export let ogImage = DEFAULT_SOCIAL_IMAGE_URL;
	export let ogImageAlt = DEFAULT_SOCIAL_IMAGE_ALT;
	export let ogImageWidth = DEFAULT_SOCIAL_IMAGE_WIDTH;
	export let ogImageHeight = DEFAULT_SOCIAL_IMAGE_HEIGHT;
	export let ogImageType = DEFAULT_SOCIAL_IMAGE_TYPE;
	export let twitterImage: string | null = null;
	export let twitterImageAlt: string | null = null;
	export let twitterCardType: 'summary' | 'summary_large_image' = 'summary_large_image';
	export let author = 'DJ Wayne';
	export let twitterSite = DEFAULT_TWITTER_SITE;
	export let twitterCreator = DEFAULT_TWITTER_CREATOR;
	export let jsonLd: Record<string, any> | null = null;
	export let noindex = false;
	export let additionalMeta: Array<{ name?: string; property?: string; content: string }> = [];

	let resolvedTwitterImage = twitterImage ?? ogImage;
	let resolvedTwitterImageAlt = twitterImageAlt ?? ogImageAlt;

	$: resolvedTwitterImage = twitterImage ?? ogImage;
	$: resolvedTwitterImageAlt = twitterImageAlt ?? ogImageAlt;
</script>

<svelte:head>
	<!-- Primary Meta Tags -->
	<title>{title}</title>
	<meta name="title" content={title} />
	<meta name="description" content={description} />
	<meta name="keywords" content={keywords} />
	<meta name="author" content={author} />
	<link rel="canonical" href={canonical} />

	<!-- Open Graph / Facebook -->
	<meta property="og:type" content={ogType} />
	<meta property="og:url" content={canonical} />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:image" content={ogImage} />
	<meta property="og:image:secure_url" content={ogImage} />
	<meta property="og:image:type" content={ogImageType} />
	<meta property="og:image:width" content={String(ogImageWidth)} />
	<meta property="og:image:height" content={String(ogImageHeight)} />
	<meta property="og:image:alt" content={ogImageAlt} />
	<meta property="og:site_name" content="BuildOS" />
	<meta property="og:locale" content="en_US" />
	<link rel="image_src" href={ogImage} />

	<!-- Twitter/X Card Tags (using name attribute as per X documentation) -->
	<meta name="twitter:card" content={twitterCardType} />
	<meta name="twitter:site" content={twitterSite} />
	<meta name="twitter:creator" content={twitterCreator} />
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content={resolvedTwitterImage} />
	<meta name="twitter:image:alt" content={resolvedTwitterImageAlt} />
	<meta name="twitter:url" content={canonical} />

	<!-- Additional Meta Tags -->
	<meta name="robots" content={noindex ? 'noindex, nofollow' : 'index, follow'} />

	<!-- Additional custom meta tags -->
	{#each additionalMeta as meta}
		{#if meta.name}
			<meta name={meta.name} content={meta.content} />
		{:else if meta.property}
			<meta property={meta.property} content={meta.content} />
		{/if}
	{/each}

	<!-- Structured Data (JSON-LD) for better SEO -->
	{#if jsonLd}
		{@html `<script type="application/ld+json">${serializeJsonLd(jsonLd)}</script>`}
	{/if}
</svelte:head>
