<!-- apps/web/src/lib/components/SEOHead.svelte -->
<script lang="ts">
	export let title = 'BuildOS - AI-First Project Organization for Chaotic Minds';
	export let description =
		'Brain dump and let AI build structure. Perfect for ADHD minds, founders, and creators. Calendar sync, project phases, daily briefs. Try 14 days free.';
	export let canonical = 'https://build-os.com/';
	export let keywords =
		'AI project management, ADHD productivity tool, brain dump app, task organization, Google Calendar sync, daily briefs, voice notes, context management';
	export let ogType = 'website';
	export let ogImage = 'https://build-os.com/brain-bolt.png';
	export let twitterImage = 'https://build-os.com/twitter_card_light.webp';
	export let twitterImageAlt = 'BuildOS - AI-First Project Organization Platform';
	export let twitterCardType: 'summary' | 'summary_large_image' = 'summary_large_image';
	export let author = 'DJ Wayne';
	export let twitterSite = '@build_os';
	export let twitterCreator = '@djwayne3';
	export let jsonLd: Record<string, any> | null = null;
	export let noindex = false;
	export let additionalMeta: Array<{ name?: string; property?: string; content: string }> = [];
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
	<meta property="og:site_name" content="BuildOS" />
	<meta property="og:locale" content="en_US" />

	<!-- Twitter/X Card Tags (using name attribute as per X documentation) -->
	<meta name="twitter:card" content={twitterCardType} />
	<meta name="twitter:site" content={twitterSite} />
	<meta name="twitter:creator" content={twitterCreator} />
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content={twitterImage} />
	<meta name="twitter:image:alt" content={twitterImageAlt} />
	<meta name="twitter:url" content={canonical} />

	<!-- Additional Meta Tags -->
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
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
		{@html `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`}
	{/if}
</svelte:head>
