<!-- apps/web/src/routes/blogs/[category]/+page.svelte -->
<script lang="ts">
	import { page } from '$app/stores';
	import { format } from 'date-fns';
	import {
		ArrowLeft,
		Calendar,
		Clock,
		Tag,
		ArrowRight,
		Brain,
		Target,
		FolderOpen,
		TrendingUp,
		Users,
		Lightbulb
	} from 'lucide-svelte';
	import type { PageData } from './$types';

	export let data: PageData;

	const categoryIcons = {
		'getting-started': Brain,
		'productivity-tips': TrendingUp,
		'product-updates': FolderOpen,
		'case-studies': Users,
		'advanced-guides': Target,
		philosophy: Lightbulb
	};

	const categoryColors = {
		'getting-started': 'purple',
		'productivity-tips': 'blue',
		'product-updates': 'green',
		'case-studies': 'orange',
		'advanced-guides': 'red',
		philosophy: 'indigo'
	};

	$: categoryKey = $page.params.category;
	$: IconComponent = categoryIcons[categoryKey as keyof typeof categoryIcons];
	$: color = categoryColors[categoryKey as keyof typeof categoryColors];

	function getCategoryColorClasses(category: string) {
		const color = categoryColors[category as keyof typeof categoryColors];
		return {
			bg: `bg-${color}-100 dark:bg-${color}-900/30`,
			text: `text-${color}-600 dark:text-${color}-400`,
			iconBg: `bg-${color}-100 dark:bg-${color}-900/30`,
			iconText: `text-${color}-600 dark:text-${color}-400`,
			linkText: `text-${color}-600 dark:text-${color}-400`,
			gradient: `from-${color}-600 to-${color}-700`
		};
	}

	// Function to generate JSON-LD structured data for category page
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

	$: colors = getCategoryColorClasses(categoryKey);

	// Generate JSON-LD string reactively
	$: jsonLdString = generateCategoryJsonLd(data.category, data.posts, categoryKey);
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

<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
	<!-- Header -->
	<div class="bg-white dark:bg-gray-800 py-16">
		<div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
			<a
				href="/blogs"
				class="inline-flex items-center text-blue-600 dark:text-blue-400 hover:underline mb-8 group"
			>
				<ArrowLeft class="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
				Back to Blog
			</a>

			<div class="flex items-center mb-6">
				<div
					class="flex items-center justify-center w-16 h-16 {colors.iconBg} rounded-2xl mr-6"
				>
					<IconComponent class="w-8 h-8 {colors.iconText}" />
				</div>
				<div>
					<h1 class="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-2">
						{data.category.name}
					</h1>
					<p class="text-xl text-gray-600 dark:text-gray-400">
						{data.category.description}
					</p>
				</div>
			</div>

			<div class="text-sm text-gray-500 dark:text-gray-400">
				{data.posts.length} article{data.posts.length !== 1 ? 's' : ''} in this category
			</div>
		</div>
	</div>

	<!-- Articles Grid -->
	<section class="py-16">
		<div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
			{#if data.posts.length > 0}
				<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
					{#each data.posts as post}
						<article
							class="bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
						>
							<div class="p-6">
								<div
									class="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400 mb-4"
								>
									<div class="flex items-center">
										<Calendar class="w-4 h-4 mr-1" />
										{format(new Date(post.date), 'MMM dd, yyyy')}
									</div>
									<div class="flex items-center">
										<Clock class="w-4 h-4 mr-1" />
										{post.readingTime} min read
									</div>
								</div>

								<h3
									class="text-xl font-bold text-gray-900 dark:text-white mb-3 line-clamp-2"
								>
									{post.title}
								</h3>

								<p class="text-gray-600 dark:text-gray-400 mb-6 line-clamp-3">
									{post.description}
								</p>

								{#if post.tags.length > 0}
									<div class="flex flex-wrap gap-2 mb-6">
										{#each post.tags.slice(0, 3) as tag}
											<span
												class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs text-center font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
											>
												<Tag class="w-3 h-3 mr-1" />
												{tag}
											</span>
										{/each}
									</div>
								{/if}

								<a
									href="/blogs/{post.category}/{post.slug}"
									class="inline-flex items-center {colors.linkText} font-medium hover:underline"
								>
									Read article <ArrowRight class="w-4 h-4 ml-1" />
								</a>
							</div>
						</article>
					{/each}
				</div>
			{:else}
				<!-- Empty State -->
				<div class="text-center py-16">
					<div
						class="flex items-center justify-center w-16 h-16 {colors.iconBg} rounded-2xl mx-auto mb-6"
					>
						<IconComponent class="w-8 h-8 {colors.iconText}" />
					</div>
					<h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-2">
						No articles yet
					</h3>
					<p class="text-gray-600 dark:text-gray-400 mb-8">
						We're working on creating valuable content for this category. Check back
						soon!
					</p>
					<a
						href="/blogs"
						class="inline-flex items-center justify-center px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
					>
						Explore Other Categories
					</a>
				</div>
			{/if}
		</div>
	</section>

	<!-- Related Categories -->
	{#if data.posts.length > 0}
		<section class="py-16 bg-white dark:bg-gray-800">
			<div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
				<h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-8 text-center">
					Explore Other Categories
				</h2>

				<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
					{#each Object.entries(data.allCategories) as [key, category]}
						{#if key !== categoryKey}
							{@const OtherIconComponent =
								categoryIcons[key as keyof typeof categoryIcons]}
							{@const otherColors = getCategoryColorClasses(key)}

							<a
								href="/blogs/{key}"
								class="group bg-gray-50 dark:bg-gray-900 rounded-xl p-6 hover:shadow-lg transition-all duration-300"
							>
								<div
									class="flex items-center justify-center w-10 h-10 {otherColors.iconBg} rounded-lg mb-4 group-hover:scale-110 transition-transform"
								>
									<OtherIconComponent class="w-5 h-5 {otherColors.iconText}" />
								</div>

								<h3 class="font-semibold text-gray-900 dark:text-white mb-2">
									{category.name}
								</h3>

								<p class="text-sm text-gray-600 dark:text-gray-400">
									{category.description}
								</p>
							</a>
						{/if}
					{/each}
				</div>
			</div>
		</section>
	{/if}
</div>
