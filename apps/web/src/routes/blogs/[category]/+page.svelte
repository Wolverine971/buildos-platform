<!-- apps/web/src/routes/blogs/[category]/+page.svelte -->
<script lang="ts">
	import {
		DEFAULT_ORGANIZATION_ID,
		DEFAULT_SOCIAL_IMAGE_ALT,
		DEFAULT_SOCIAL_IMAGE_HEIGHT,
		DEFAULT_SOCIAL_IMAGE_TYPE,
		DEFAULT_SOCIAL_IMAGE_URL,
		DEFAULT_SOCIAL_IMAGE_WIDTH,
		DEFAULT_TWITTER_CREATOR,
		DEFAULT_TWITTER_SITE,
		DEFAULT_WEBSITE_ID,
		SITE_NAME,
		SITE_URL
	} from '$lib/constants/seo';
	import {
		ArrowLeft,
		Calendar,
		Clock,
		ArrowRight,
		Brain,
		Target,
		FolderOpen,
		TrendingUp,
		GitCompareArrows,
		Lightbulb,
		BookOpen
	} from '$lib/icons/lucide';
	import type { PageData } from './$types';
	import {
		formatBlogDate,
		getContentCollectionPath,
		getContentCollectionUrl,
		getContentPostPath,
		getContentPostUrl
	} from '$lib/utils/blog';
	import { escapeSerializedJsonLd } from '$lib/utils/json-ld';

	let { data }: { data: PageData } = $props();

	const categoryIcons: Record<string, typeof Brain> = {
		'getting-started': Brain,
		'productivity-tips': TrendingUp,
		'product-updates': FolderOpen,
		'case-studies': GitCompareArrows,
		'advanced-guides': Target,
		philosophy: Lightbulb,
		'agent-skills': Brain,
		'source-analyses': BookOpen
	};

	let categoryKey = $derived(data.categoryKey);
	let categoryUrl = $derived(getContentCollectionUrl(SITE_URL, categoryKey));
	let IconComponent = $derived(categoryIcons[categoryKey] ?? Brain);
	let isSkillRepo = $derived(categoryKey === 'agent-skills');

	function generateCategoryJsonLd(category: any, posts: any[], categoryKey: string) {
		if (!category || !posts) return '';
		const collectionUrl = getContentCollectionUrl(SITE_URL, categoryKey);

		const jsonLd = {
			'@context': 'https://schema.org',
			'@type': 'CollectionPage',
			'@id': collectionUrl,
			name: category.name,
			description: category.description,
			url: collectionUrl,
			publisher: {
				'@type': 'Organization',
				'@id': DEFAULT_ORGANIZATION_ID,
				name: SITE_NAME,
				url: SITE_URL
			},
			mainEntity: {
				'@type': 'ItemList',
				numberOfItems: posts.length,
				itemListElement: posts.map((post, index) => ({
					'@type': 'ListItem',
					position: index + 1,
					item: {
						'@type': 'BlogPosting',
						headline: post.title,
						description: post.description,
						url: getContentPostUrl(SITE_URL, post),
						datePublished: post.date,
						author: {
							'@type': 'Person',
							name: post.author || 'BuildOS Team'
						}
					}
				}))
			},
			isPartOf:
				categoryKey === 'agent-skills'
					? {
							'@id': DEFAULT_WEBSITE_ID
						}
					: {
							'@type': 'Blog',
							'@id': `${SITE_URL}/blogs#blog`,
							name: `${SITE_NAME} Blog`,
							url: `${SITE_URL}/blogs`,
							isPartOf: {
								'@id': DEFAULT_WEBSITE_ID
							}
						}
		};

		return JSON.stringify(jsonLd, null, 2);
	}

	let jsonLdString = $derived(generateCategoryJsonLd(data.category, data.posts, categoryKey));
	// SEO <title>: keep under ~60 chars. Long blog suffix was pushing every
	// category name over the limit, so the blog branch is trimmed to "<name> | BuildOS Blog".
	let pageTitle = $derived(
		isSkillRepo
			? `${data.category.name} - BuildOS | Agent Skill Library`
			: `${data.category.name} | BuildOS Blog`
	);
	let ogTitle = $derived(
		`${data.category.name} - BuildOS${
			isSkillRepo ? ' Agent Skill Library' : ' Blog | Thinking Environment'
		}`
	);
	let twitterTitle = $derived(
		`${data.category.name} - BuildOS${isSkillRepo ? ' Skill Library' : ' Blog'}`
	);
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<meta
		name="description"
		content="{data.category.description} - {data.posts
			.length} articles available. Turn messy thinking into structured work with practical guides."
	/>
	<meta
		name="keywords"
		content="{data.category.name.toLowerCase()}, BuildOS blog, thinking environment, {categoryKey.replace(
			'-',
			' '
		)}, project memory, structured work"
	/>
	<link rel="canonical" href={categoryUrl} />

	<!-- Open Graph / Facebook -->
	<meta property="og:type" content="website" />
	<meta property="og:url" content={categoryUrl} />
	<meta property="og:title" content={ogTitle} />
	<meta
		property="og:description"
		content="{data.category.description} - {data.posts
			.length} articles about turning messy thinking into structured work."
	/>
	<meta property="og:image" content={DEFAULT_SOCIAL_IMAGE_URL} />
	<meta property="og:image:secure_url" content={DEFAULT_SOCIAL_IMAGE_URL} />
	<meta property="og:image:type" content={DEFAULT_SOCIAL_IMAGE_TYPE} />
	<meta property="og:image:width" content={String(DEFAULT_SOCIAL_IMAGE_WIDTH)} />
	<meta property="og:image:height" content={String(DEFAULT_SOCIAL_IMAGE_HEIGHT)} />
	<meta property="og:image:alt" content={DEFAULT_SOCIAL_IMAGE_ALT} />
	<meta property="og:site_name" content="BuildOS" />
	<meta property="og:locale" content="en_US" />
	<link rel="image_src" href={DEFAULT_SOCIAL_IMAGE_URL} />

	<!-- Twitter -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:url" content={categoryUrl} />
	<meta name="twitter:site" content={DEFAULT_TWITTER_SITE} />
	<meta name="twitter:creator" content={DEFAULT_TWITTER_CREATOR} />
	<meta name="twitter:title" content={twitterTitle} />
	<meta
		name="twitter:description"
		content="{data.category
			.description} - Practical guides for structured work and durable project memory."
	/>
	<meta name="twitter:image" content={DEFAULT_SOCIAL_IMAGE_URL} />
	<meta name="twitter:image:alt" content={DEFAULT_SOCIAL_IMAGE_ALT} />

	<!-- Additional Meta Tags -->
	<meta name="robots" content="index, follow" />
	<meta name="author" content="BuildOS Team" />

	<!-- JSON-LD Structured Data -->
	{#if jsonLdString}
		{@html `<script type="application/ld+json">${escapeSerializedJsonLd(jsonLdString)}</script>`}
	{/if}
</svelte:head>

<div class="min-h-screen bg-background">
	<!-- Header -->
	<header class="border-b border-border bg-card tx tx-bloom tx-weak">
		<div class="mx-auto max-w-7xl px-2 py-8 sm:px-4 sm:py-12 lg:px-6">
			<a
				href="/blogs"
				class="group mb-6 inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-accent hover:bg-accent/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				<ArrowLeft
					class="mr-1.5 h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5 motion-reduce:transition-none"
					aria-hidden="true"
				/>
				All Articles
			</a>

			<div class="flex items-start gap-4">
				<div
					class="flex items-center justify-center w-12 h-12 bg-muted rounded-lg shrink-0"
				>
					<IconComponent class="w-6 h-6 text-foreground" />
				</div>
				<div class="min-w-0">
					<h1
						class="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground tracking-tight leading-[1.1]"
					>
						{data.category.name}
					</h1>
					<p class="mt-1 text-sm sm:text-base text-muted-foreground">
						{data.category.description}
					</p>
					<p class="mt-2 text-xs text-muted-foreground">
						{data.posts.length} article{data.posts.length !== 1 ? 's' : ''}
					</p>
				</div>
			</div>
			{#if isSkillRepo}
				<div
					class="mt-6 rounded-lg border border-border bg-background/70 p-4 text-sm text-muted-foreground"
				>
					<p>
						Each skill guide includes a portable <code>SKILL.md</code> pattern, recommended
						metadata, and operating rules an agent can use directly.
					</p>
				</div>
			{/if}
		</div>
	</header>

	<!-- Articles Grid -->
	<section class="py-8 sm:py-12">
		<div class="mx-auto max-w-7xl px-2 sm:px-4 lg:px-6">
			{#if data.posts.length > 0}
				<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
					{#each data.posts as post}
						<article class="group">
							<a
								href={getContentPostPath(post)}
								class="pressable flex h-full flex-col overflow-hidden border border-border bg-card shadow-ink transition-colors hover:border-accent/40 hover:shadow-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none tx tx-frame tx-weak wt-paper"
							>
								<div class="flex flex-1 flex-col p-4 sm:p-5">
									<div
										class="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-muted-foreground mb-3"
									>
										<span class="flex shrink-0 items-center gap-1">
											<Calendar class="h-3 w-3" aria-hidden="true" />
											{formatBlogDate(post.date)}
										</span>
										<span class="flex shrink-0 items-center gap-1">
											<Clock class="h-3 w-3" aria-hidden="true" />
											{post.readingTime} min
										</span>
									</div>

									<h3
										class="mb-2 line-clamp-2 text-base font-semibold text-foreground transition-colors group-hover:text-accent motion-reduce:transition-none"
									>
										{post.title}
									</h3>

									<p class="text-sm text-muted-foreground mb-3 line-clamp-3">
										{post.description}
									</p>

									{#if post.tags.length > 0}
										<div class="flex flex-wrap gap-1 mb-3">
											{#each post.tags.slice(0, 3) as tag}
												<span
													class="inline-flex items-center rounded-full bg-muted px-2 py-1 text-2xs font-medium text-muted-foreground"
												>
													{tag}
												</span>
											{/each}
										</div>
									{/if}

									<span
										class="mt-auto inline-flex items-center gap-1 text-xs text-accent font-medium"
									>
										Read article <ArrowRight
											class="h-3 w-3"
											aria-hidden="true"
										/>
									</span>
								</div>
							</a>
						</article>
					{/each}
				</div>
			{:else}
				<div class="text-center py-12">
					<div
						class="flex items-center justify-center w-12 h-12 bg-muted rounded-lg mx-auto mb-4"
					>
						<IconComponent class="w-6 h-6 text-foreground" />
					</div>
					<h3 class="text-lg font-semibold text-foreground mb-1">No articles yet</h3>
					<p class="text-sm text-muted-foreground mb-6">
						We're working on creating valuable content for this category.
					</p>
					<a
						href="/blogs"
						class="pressable inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground shadow-ink transition-colors hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
					>
						Explore Other Categories
					</a>
				</div>
			{/if}
		</div>
	</section>

	<!-- Related Categories -->
	{#if data.posts.length > 0}
		<section class="py-8 sm:py-10 bg-muted/30 border-t border-border">
			<div class="mx-auto max-w-7xl px-2 sm:px-4 lg:px-6">
				<h2 class="text-base font-semibold text-foreground mb-4">
					More to explore beyond {data.category.name}
				</h2>

				<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
					{#each Object.entries(data.allCategories) as [key, category]}
						{#if key !== categoryKey && (data.categoryCounts?.[key] ?? 0) > 0}
							{@const OtherIconComponent =
								categoryIcons[key as keyof typeof categoryIcons] ?? Brain}

							<a
								href={getContentCollectionPath(key)}
								class="pressable group flex min-h-11 items-start gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-accent/40 hover:shadow-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
							>
								<div
									class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted transition-transform group-hover:scale-105 motion-reduce:transition-none"
								>
									<OtherIconComponent class="w-4 h-4 text-foreground" />
								</div>
								<div class="min-w-0">
									<h3 class="text-sm font-medium text-foreground">
										{category.name}
									</h3>
									<p class="text-xs text-muted-foreground line-clamp-1 mt-0.5">
										{category.description}
									</p>
								</div>
							</a>
						{/if}
					{/each}
				</div>
			</div>
		</section>
	{/if}
</div>
