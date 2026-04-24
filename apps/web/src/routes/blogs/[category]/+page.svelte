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
	import { page } from '$app/stores';
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
		Lightbulb
	} from 'lucide-svelte';
	import type { PageData } from './$types';
	import { formatBlogDate, type BlogCategory } from '$lib/utils/blog';
	import { escapeSerializedJsonLd } from '$lib/utils/json-ld';

	let { data }: { data: PageData } = $props();

	const categoryIcons: Record<string, typeof Brain> = {
		'getting-started': Brain,
		'productivity-tips': TrendingUp,
		'product-updates': FolderOpen,
		'case-studies': GitCompareArrows,
		'advanced-guides': Target,
		philosophy: Lightbulb
	};

	let categoryKey = $derived(($page.params.category ?? 'getting-started') as BlogCategory);
	let IconComponent = $derived(categoryIcons[categoryKey]);

	function generateCategoryJsonLd(category: any, posts: any[], categoryKey: string) {
		if (!category || !posts) return '';

		const jsonLd = {
			'@context': 'https://schema.org',
			'@type': 'CollectionPage',
			'@id': `${SITE_URL}/blogs/${categoryKey}`,
			name: category.name,
			description: category.description,
			url: `${SITE_URL}/blogs/${categoryKey}`,
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
						url: `${SITE_URL}/blogs/${post.category}/${post.slug}`,
						datePublished: post.date,
						author: {
							'@type': 'Person',
							name: post.author || 'BuildOS Team'
						}
					}
				}))
			},
			isPartOf: {
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
</script>

<svelte:head>
	<title>{data.category.name} - BuildOS Blog | Thinking Environment Insights</title>
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
	<link rel="canonical" href="https://build-os.com/blogs/{categoryKey}" />

	<!-- Open Graph / Facebook -->
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://build-os.com/blogs/{categoryKey}" />
	<meta
		property="og:title"
		content="{data.category.name} - BuildOS Blog | Thinking Environment"
	/>
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
	<meta name="twitter:url" content="https://build-os.com/blogs/{categoryKey}" />
	<meta name="twitter:site" content={DEFAULT_TWITTER_SITE} />
	<meta name="twitter:creator" content={DEFAULT_TWITTER_CREATOR} />
	<meta name="twitter:title" content="{data.category.name} - BuildOS Blog" />
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
		<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
			<a
				href="/blogs"
				class="inline-flex items-center text-sm text-accent hover:underline mb-6 group"
			>
				<ArrowLeft
					class="w-3.5 h-3.5 mr-1.5 group-hover:-translate-x-0.5 transition-transform"
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
		</div>
	</header>

	<!-- Articles Grid -->
	<section class="py-8 sm:py-12">
		<div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
			{#if data.posts.length > 0}
				<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
					{#each data.posts as post}
						<article class="group">
							<a
								href="/blogs/{post.category}/{post.slug}"
								class="block bg-card border border-border rounded-lg shadow-ink hover:shadow-ink-strong hover:border-accent/40 transition-all duration-200 tx tx-frame tx-weak wt-paper overflow-hidden"
							>
								<div class="p-4 sm:p-5">
									<div
										class="flex items-center gap-2 text-xs text-muted-foreground mb-3"
									>
										<span class="flex items-center gap-1">
											<Calendar class="w-3 h-3" />
											{formatBlogDate(post.date)}
										</span>
										<span class="flex items-center gap-1">
											<Clock class="w-3 h-3" />
											{post.readingTime} min
										</span>
									</div>

									<h3
										class="text-base font-semibold text-foreground mb-2 line-clamp-2 group-hover:text-accent transition-colors"
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
													class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground"
												>
													{tag}
												</span>
											{/each}
										</div>
									{/if}

									<span
										class="inline-flex items-center gap-1 text-xs text-accent font-medium"
									>
										Read article <ArrowRight class="w-3 h-3" />
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
						class="inline-flex items-center justify-center px-4 py-2 bg-accent text-accent-foreground text-sm font-medium rounded-lg hover:bg-accent/90 transition-colors shadow-ink pressable"
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
			<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
				<h2 class="text-base font-semibold text-foreground mb-4">
					Explore Other Categories
				</h2>

				<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
					{#each Object.entries(data.allCategories) as [key, category]}
						{#if key !== categoryKey}
							{@const OtherIconComponent =
								categoryIcons[key as keyof typeof categoryIcons]}

							<a
								href="/blogs/{key}"
								class="group flex items-start gap-3 bg-card border border-border rounded-lg p-3 hover:shadow-ink hover:border-accent/40 transition-all duration-200 pressable"
							>
								<div
									class="flex items-center justify-center w-8 h-8 bg-muted rounded-md shrink-0 group-hover:scale-105 transition-transform"
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
