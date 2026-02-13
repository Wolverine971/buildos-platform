<!-- apps/web/src/routes/blogs/[category]/+page.svelte -->
<script lang="ts">
	import { page } from '$app/stores';
	import { format } from 'date-fns';
	import {
		ArrowLeft,
		Calendar,
		Clock,
		ArrowRight,
		Brain,
		Target,
		FolderOpen,
		TrendingUp,
		Users,
		Lightbulb
	} from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const categoryIcons: Record<string, typeof Brain> = {
		'getting-started': Brain,
		'productivity-tips': TrendingUp,
		'product-updates': FolderOpen,
		'case-studies': Users,
		'advanced-guides': Target,
		philosophy: Lightbulb
	};

	let categoryKey = $derived($page.params.category);
	let IconComponent = $derived(categoryIcons[categoryKey as keyof typeof categoryIcons]);

	function getCategoryColorClasses(category: string) {
		const isPrimary = category === 'getting-started';
		return {
			bg: isPrimary ? 'bg-accent/10' : 'bg-muted',
			text: isPrimary ? 'text-accent' : 'text-foreground',
			iconBg: isPrimary ? 'bg-accent/10' : 'bg-muted',
			iconText: isPrimary ? 'text-accent' : 'text-foreground'
		};
	}

	function generateCategoryJsonLd(category: any, posts: any[], categoryKey: string) {
		if (!category || !posts) return '';

		const jsonLd = {
			'@context': 'https://schema.org',
			'@type': 'CollectionPage',
			name: category.name,
			description: category.description,
			url: `https://build-os.com/blogs/${categoryKey}`,
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
						url: `https://build-os.com/blogs/${post.category}/${post.slug}`,
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
				name: 'BuildOS Blog',
				url: 'https://build-os.com/blogs'
			}
		};

		return JSON.stringify(jsonLd, null, 2);
	}

	let colors = $derived(getCategoryColorClasses(categoryKey));

	let jsonLdString = $derived(generateCategoryJsonLd(data.category, data.posts, categoryKey));
</script>

<svelte:head>
	<title>{data.category.name} - BuildOS Blog | AI-Native Productivity Insights</title>
	<meta
		name="description"
		content="{data.category.description} - {data.posts
			.length} articles available. Master your personal operating system with expert insights and practical guides."
	/>
	<meta
		name="keywords"
		content="{data.category.name.toLowerCase()}, BuildOS blog, AI productivity, {categoryKey.replace(
			'-',
			' '
		)}, productivity tips, personal operating system"
	/>
	<link rel="canonical" href="https://build-os.com/blogs/{categoryKey}" />

	<!-- Open Graph / Facebook -->
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://build-os.com/blogs/{categoryKey}" />
	<meta
		property="og:title"
		content="{data.category.name} - BuildOS Blog | AI-Native Productivity"
	/>
	<meta
		property="og:description"
		content="{data.category.description} - {data.posts
			.length} articles to help you master your personal operating system."
	/>
	<meta property="og:image" content="https://build-os.com/og-blog-{categoryKey}.jpg" />

	<!-- Twitter -->
	<meta property="twitter:card" content="summary_large_image" />
	<meta property="twitter:url" content="https://build-os.com/blogs/{categoryKey}" />
	<meta property="twitter:title" content="{data.category.name} - BuildOS Blog" />
	<meta
		property="twitter:description"
		content="{data.category
			.description} - Expert insights and practical guides for AI-native productivity."
	/>
	<meta property="twitter:image" content="https://build-os.com/og-blog-{categoryKey}.jpg" />

	<!-- Additional Meta Tags -->
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<meta name="robots" content="index, follow" />
	<meta name="author" content="BuildOS Team" />

	<!-- JSON-LD Structured Data -->
	{#if jsonLdString}
		{@html `<script type="application/ld+json">${jsonLdString}</script>`}
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
					class="flex items-center justify-center w-12 h-12 {colors.iconBg} rounded-lg shrink-0"
				>
					<IconComponent class="w-6 h-6 {colors.iconText}" />
				</div>
				<div class="min-w-0">
					<h1
						class="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground tracking-tight"
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
											{format(new Date(post.date), 'MMM dd, yyyy')}
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
													class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground"
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
						class="flex items-center justify-center w-12 h-12 {colors.iconBg} rounded-lg mx-auto mb-4"
					>
						<IconComponent class="w-6 h-6 {colors.iconText}" />
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
							{@const otherColors = getCategoryColorClasses(key)}

							<a
								href="/blogs/{key}"
								class="group flex items-start gap-3 bg-card border border-border rounded-lg p-3 hover:shadow-ink hover:border-accent/40 transition-all duration-200 pressable"
							>
								<div
									class="flex items-center justify-center w-8 h-8 {otherColors.iconBg} rounded-md shrink-0 group-hover:scale-105 transition-transform"
								>
									<OtherIconComponent class="w-4 h-4 {otherColors.iconText}" />
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
