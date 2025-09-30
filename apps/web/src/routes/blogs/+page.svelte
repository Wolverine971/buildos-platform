<!-- apps/web/src/routes/blogs/+page.svelte -->
<script lang="ts">
	import { format } from 'date-fns';
	import {
		Brain,
		Target,
		FolderOpen,
		TrendingUp,
		Users,
		Lightbulb,
		Calendar,
		Clock,
		Tag,
		ArrowRight,
		Search
	} from 'lucide-svelte';
	import type { PageData } from './$types';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Button from '$lib/components/ui/Button.svelte';

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

	function getCategoryColorClasses(category: string) {
		const color = categoryColors[category as keyof typeof categoryColors];
		return {
			bg: `bg-${color}-100 dark:bg-${color}-900/30`,
			text: `text-${color}-600 dark:text-${color}-400`,
			iconBg: `bg-${color}-100 dark:bg-${color}-900/30`,
			iconText: `text-${color}-600 dark:text-${color}-400`,
			linkText: `text-${color}-600 dark:text-${color}-400`
		};
	}

	// Function to generate JSON-LD structured data
	function generateBlogJsonLd(categorizedPosts: any) {
		if (!categorizedPosts) return '';

		const allPosts = Object.values(categorizedPosts).flat();
		const recentPosts = allPosts
			.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
			.slice(0, 5);

		const jsonLd = {
			'@context': 'https://schema.org',
			'@type': 'Blog',
			name: 'BuildOS Blog',
			description:
				'Master your personal operating system with practical guides, productivity insights, and AI-native techniques',
			url: 'https://build-os.com/blogs',
			publisher: {
				'@type': 'Organization',
				name: 'BuildOS',
				logo: {
					'@type': 'ImageObject',
					url: 'https://build-os.com/brain-bolt.png'
				}
			},
			blogPost: recentPosts.map((post: any) => ({
				'@type': 'BlogPosting',
				headline: post.title,
				description: post.description,
				url: `https://build-os.com/blogs/${post.category}/${post.slug}`,
				datePublished: post.date,
				author: {
					'@type': 'Person',
					name: post.author || 'BuildOS Team'
				},
				keywords: post.tags?.join(', ') || ''
			})),
			mainEntityOfPage: {
				'@type': 'WebPage',
				'@id': 'https://build-os.com/blogs'
			}
		};

		return JSON.stringify(jsonLd, null, 2);
	}

	let searchQuery = '';
	let showSearch = false;

	// Get all posts for direct display when < 10 total
	$: allPosts =
		data.totalPosts < 10
			? Object.values(data.categorizedPosts)
					.flat()
					.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
			: [];

	$: showDirectPosts = data.totalPosts < 10;

	// Generate JSON-LD string reactively
	$: jsonLdString = generateBlogJsonLd(data.categorizedPosts);
</script>

<svelte:head>
	<title>Blog - BuildOS | AI-Native Productivity Insights & Guides</title>
	<meta
		name="description"
		content="Master your personal operating system with practical guides, productivity insights, and the latest updates from the BuildOS team. Learn AI-native productivity techniques and context building strategies."
	/>
	<meta
		name="keywords"
		content="BuildOS blog, AI productivity, personal operating system, productivity tips, braindump guide, context building, daily briefs, AI-native productivity"
	/>
	<link rel="canonical" href="https://build-os.com/blogs" />

	<!-- Open Graph / Facebook -->
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://build-os.com/blogs" />
	<meta property="og:title" content="Blog - BuildOS | AI-Native Productivity Insights & Guides" />
	<meta
		property="og:description"
		content="Master your personal operating system with practical guides, productivity insights, and the latest updates from BuildOS team."
	/>
	<meta property="og:image" content="https://build-os.com/og-blog.jpg" />

	<!-- Twitter -->
	<meta property="twitter:card" content="summary_large_image" />
	<meta property="twitter:url" content="https://build-os.com/blogs" />
	<meta property="twitter:title" content="Blog - BuildOS | AI-Native Productivity Insights" />
	<meta
		property="twitter:description"
		content="Expert insights and practical guides for mastering AI-native productivity with BuildOS."
	/>
	<meta property="twitter:image" content="https://build-os.com/og-blog.jpg" />

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
	<div class="bg-white dark:bg-gray-800 py-20">
		<div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
			<h1 class="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-6">
				BuildOS Blog
			</h1>
			<p class="text-xl text-gray-600 dark:text-gray-400 mb-8 max-w-3xl mx-auto">
				{#if showDirectPosts}
					Master your personal operating system with practical guides, productivity
					insights, and the latest updates from our team.
				{:else}
					Master your personal operating system with practical guides, productivity
					insights, and the latest updates from our team.
				{/if}
			</p>

			<!-- Search Bar - show for both cases -->
			{#if !showDirectPosts || data.totalPosts > 5}
				<div class="relative max-w-2xl mx-auto">
					<div
						class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"
					>
						<Search class="h-5 w-5 text-gray-400" />
					</div>
					<TextInput
						type="text"
						bind:value={searchQuery}
						on:focus={() => (showSearch = true)}
						on:blur={() => setTimeout(() => (showSearch = false), 200)}
						placeholder="Search articles..."
						size="md"
						class="pl-10"
					/>
				</div>
			{/if}
		</div>
	</div>

	{#if showDirectPosts}
		<!-- Direct Posts Display (< 10 total posts) -->
		<section class="py-16">
			<div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
				{#if allPosts.length > 0}
					<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
						{#each allPosts as post}
							{@const colors = getCategoryColorClasses(post.category)}
							{@const categoryName = data.categories[post.category].name}

							<article
								class="bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
							>
								<div class="p-6">
									<div
										class="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400 mb-4"
									>
										<span
											class="px-2.5 py-0.5 {colors.bg} {colors.text} rounded-full font-medium text-xs text-center"
										>
											{categoryName}
										</span>
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
							class="flex items-center justify-center w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl mx-auto mb-6"
						>
							<Brain class="w-8 h-8 text-gray-400" />
						</div>
						<h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-2">
							No articles yet
						</h3>
						<p class="text-gray-600 dark:text-gray-400">
							We're working on creating valuable content. Check back soon!
						</p>
					</div>
				{/if}
			</div>
		</section>
	{:else}
		<!-- Categories Overview (>= 10 total posts) -->
		<section class="py-20">
			<div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
				<div class="text-center mb-16">
					<h2 class="text-3xl font-bold text-gray-900 dark:text-white mb-4">
						Explore by Category
					</h2>
					<p class="text-lg text-gray-600 dark:text-gray-400">
						Find exactly what you need to level up your productivity
					</p>
				</div>

				<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
					{#each Object.entries(data.categorizedPosts) as [categoryKey, posts]}
						{@const category = data.categories[categoryKey]}
						{@const IconComponent = categoryIcons[categoryKey]}
						{@const colors = getCategoryColorClasses(categoryKey)}

						{#if posts?.length}
							<a
								href="/blogs/{categoryKey}"
								class="group bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
							>
								<div
									class="flex items-center justify-center w-12 h-12 {colors.iconBg} rounded-xl mb-6 group-hover:scale-110 transition-transform"
								>
									<IconComponent class="w-6 h-6 {colors.iconText}" />
								</div>

								<h3 class="text-xl font-bold text-gray-900 dark:text-white mb-3">
									{category.name}
								</h3>

								<p class="text-gray-600 dark:text-gray-400 mb-4">
									{category.description}
								</p>

								<div class="flex items-center justify-between">
									<span class="text-sm text-gray-500 dark:text-gray-400">
										{posts.length} article{posts.length !== 1 ? 's' : ''}
									</span>
									<div class="flex items-center {colors.linkText} font-medium">
										View all <ArrowRight class="w-4 h-4 ml-1" />
									</div>
								</div>
							</a>
						{/if}
					{/each}
				</div>
			</div>
		</section>

		<!-- Recent Posts by Category -->
		<section class="py-20 bg-white dark:bg-gray-800">
			<div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
				{#each Object.entries(data.categorizedPosts) as [categoryKey, posts]}
					{@const category = data.categories[categoryKey]}
					{@const colors = getCategoryColorClasses(categoryKey)}

					{#if posts.length > 0}
						<div class="mb-16 last:mb-0">
							<div class="flex items-center justify-between mb-8">
								<h2 class="text-2xl font-bold text-gray-900 dark:text-white">
									Latest from {category.name}
								</h2>
								{#if posts.length > 5}
									<a
										href="/blogs/{categoryKey}"
										class="flex items-center {colors.linkText} font-medium hover:underline"
									>
										View all <ArrowRight class="w-4 h-4 ml-1" />
									</a>
								{/if}
							</div>

							<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
								{#each posts.slice(0, 5) as post}
									<article
										class="bg-gray-50 dark:bg-gray-900 rounded-xl overflow-hidden hover:shadow-lg transition-shadow"
									>
										<div class="p-6">
											<div
												class="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400 mb-3"
											>
												<span
													class="px-2.5 py-0.5 {colors.bg} {colors.text} rounded-full font-medium text-xs text-center"
												>
													{category.name}
												</span>
												<div class="flex items-center">
													<Calendar class="w-3 h-3 mr-1" />
													{format(new Date(post.date), 'MMM dd, yyyy')}
												</div>
											</div>

											<h3
												class="font-semibold text-gray-900 dark:text-white mb-3 line-clamp-2"
											>
												{post.title}
											</h3>

											<p
												class="text-gray-600 dark:text-gray-400 text-sm mb-4 line-clamp-3"
											>
												{post.description}
											</p>

											<div class="flex items-center justify-between">
												<div
													class="flex items-center text-xs text-gray-500 dark:text-gray-400"
												>
													<Clock class="w-3 h-3 mr-1" />
													{post.readingTime} min read
												</div>

												<a
													href="/blogs/{post.category}/{post.slug}"
													class="flex items-center {colors.linkText} text-sm font-medium hover:underline"
												>
													Read more <ArrowRight class="w-3 h-3 ml-1" />
												</a>
											</div>

											{#if post.tags.length > 0}
												<div class="flex flex-wrap gap-1 mt-3">
													{#each post.tags.slice(0, 3) as tag}
														<span
															class="inline-flex items-center px-2 py-1 rounded text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
														>
															<Tag class="w-2 h-2 mr-1" />
															{tag}
														</span>
													{/each}
												</div>
											{/if}
										</div>
									</article>
								{/each}
							</div>
						</div>
					{/if}
				{/each}
			</div>
		</section>
	{/if}

	<!-- Newsletter CTA -->
	<!-- <section class="py-16 bg-gradient-to-r from-blue-600 to-purple-600">
		<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
			<div class="bg-white bg-opacity-10 rounded-2xl p-8">
				<h3 class="text-2xl font-bold text-white mb-4">Stay Updated with BuildOS</h3>
				<p class="text-blue-100 mb-6">
					Get the latest productivity tips, product updates, and exclusive insights
					delivered to your inbox.
				</p>
				<div class="flex flex-col sm:flex-row gap-4 max-w-md mx-auto">
					<input
						type="email"
						placeholder="Enter your email"
						class="flex-1 px-4 py-3 rounded-lg border-0 bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white"
					/>
					<Button
						variant="primary"
						size="md"
						class="px-6 py-3 bg-gray-900 text-white font-semibold rounded-lg hover:bg-gray-800 transition-colors"
					>
						Subscribe
					</Button>
				</div>
			</div>
		</div>
	</section> -->
</div>
