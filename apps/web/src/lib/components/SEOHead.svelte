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

	let {
		title = 'BuildOS - Turn Messy Thinking into Structured Work',
		description = 'BuildOS is a thinking environment for people making complex things. Bring rough ideas, notes, and research, then turn them into structured projects with memory and a clear next move.',
		canonical = 'https://build-os.com/',
		keywords = 'thinking environment, project memory, creator workflow, author workflow, YouTube workflow, task organization, daily briefs, voice notes',
		ogType = 'website',
		ogImage = DEFAULT_SOCIAL_IMAGE_URL,
		ogImageAlt = DEFAULT_SOCIAL_IMAGE_ALT,
		ogImageWidth = DEFAULT_SOCIAL_IMAGE_WIDTH,
		ogImageHeight = DEFAULT_SOCIAL_IMAGE_HEIGHT,
		ogImageType = DEFAULT_SOCIAL_IMAGE_TYPE,
		twitterImage = null,
		twitterImageAlt = null,
		twitterCardType = 'summary_large_image',
		author = 'DJ Wayne',
		twitterSite = DEFAULT_TWITTER_SITE,
		twitterCreator = DEFAULT_TWITTER_CREATOR,
		jsonLd = null,
		noindex = false,
		additionalMeta = []
	}: {
		title?: string;
		description?: string;
		canonical?: string;
		keywords?: string;
		ogType?: string;
		ogImage?: string;
		ogImageAlt?: string;
		ogImageWidth?: number;
		ogImageHeight?: number;
		ogImageType?: string;
		twitterImage?: string | null;
		twitterImageAlt?: string | null;
		twitterCardType?: 'summary' | 'summary_large_image';
		author?: string;
		twitterSite?: string;
		twitterCreator?: string;
		jsonLd?: Record<string, any> | null;
		noindex?: boolean;
		additionalMeta?: Array<{ name?: string; property?: string; content: string }>;
	} = $props();

	let resolvedTwitterImage = $derived(twitterImage ?? ogImage);
	let resolvedTwitterImageAlt = $derived(twitterImageAlt ?? ogImageAlt);
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
