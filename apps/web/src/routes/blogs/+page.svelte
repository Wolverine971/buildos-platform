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
		ArrowRight,
		Search
	} from 'lucide-svelte';
	import type { PageData } from './$types';
	import TextInput from '$lib/components/ui/TextInput.svelte';

	let { data }: { data: PageData } = $props();

	const categoryIcons: Record<string, typeof Brain> = {
		'getting-started': Brain,
		'productivity-tips': TrendingUp,
		'product-updates': FolderOpen,
		'case-studies': Users,
		'advanced-guides': Target,
		philosophy: Lightbulb
	};

	function getCategoryColorClasses(category: string) {
		const isPrimary = category === 'getting-started';
		return {
			bg: isPrimary ? 'bg-accent/10' : 'bg-muted',
			text: isPrimary ? 'text-accent' : 'text-foreground',
			iconBg: isPrimary ? 'bg-accent/10' : 'bg-muted',
			iconText: isPrimary ? 'text-accent' : 'text-foreground',
			linkText: 'text-accent'
		};
	}

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

	let searchQuery = $state('');
	let showSearch = $state(false);

	let allPosts = $derived(
		data.totalPosts < 10
			? Object.values(data.categorizedPosts)
					.flat()
					.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
			: []
	);

	let showDirectPosts = $derived(data.totalPosts < 10);

	let jsonLdString = $derived(generateBlogJsonLd(data.categorizedPosts));
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

<div class="min-h-screen bg-background">
	<!-- Hero -->
	<header class="border-b border-border bg-card tx tx-bloom tx-weak">
		<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 text-center">
			<h1 class="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground tracking-tight">
				BuildOS Blog
			</h1>
			<p class="mt-3 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto">
				Practical guides, productivity insights, and the latest from the BuildOS team.
			</p>

			{#if !showDirectPosts || data.totalPosts > 5}
				<div class="relative max-w-lg mx-auto mt-6">
					<div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
						<Search class="h-4 w-4 text-muted-foreground" />
					</div>
					<TextInput
						type="text"
						bind:value={searchQuery}
						onfocus={() => (showSearch = true)}
						onblur={() => setTimeout(() => (showSearch = false), 200)}
						placeholder="Search articles..."
						size="md"
						class="pl-10"
					/>
				</div>
			{/if}
		</div>
	</header>

	{#if showDirectPosts}
		<!-- Direct Posts Display (< 10 total posts) -->
		<section class="py-8 sm:py-12">
			<div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
				{#if allPosts.length > 0}
					<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
						{#each allPosts as post}
							{@const colors = getCategoryColorClasses(post.category)}
							{@const categoryName = data.categories[post.category].name}

							<article class="group">
								<a
									href="/blogs/{post.category}/{post.slug}"
									class="block bg-card border border-border rounded-lg shadow-ink hover:shadow-ink-strong hover:border-accent/40 transition-all duration-200 tx tx-frame tx-weak wt-paper overflow-hidden"
								>
									<div class="p-4 sm:p-5">
										<div class="flex items-center gap-2 text-xs text-muted-foreground mb-3">
											<span
												class="px-2 py-0.5 {colors.bg} {colors.text} rounded-full font-medium"
											>
												{categoryName}
											</span>
											<span class="flex items-center gap-1">
												<Calendar class="w-3 h-3" />
												{format(new Date(post.date), 'MMM dd, yyyy')}
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

										<div class="flex items-center justify-between">
											{#if post.tags.length > 0}
												<div class="flex flex-wrap gap-1">
													{#each post.tags.slice(0, 2) as tag}
														<span
															class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground"
														>
															{tag}
														</span>
													{/each}
												</div>
											{:else}
												<div></div>
											{/if}
											<span
												class="flex items-center gap-1 text-xs text-muted-foreground"
											>
												<Clock class="w-3 h-3" />
												{post.readingTime} min
											</span>
										</div>
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
							<Brain class="w-6 h-6 text-muted-foreground" />
						</div>
						<h3 class="text-lg font-semibold text-foreground mb-1">No articles yet</h3>
						<p class="text-sm text-muted-foreground">
							We're working on creating valuable content. Check back soon!
						</p>
					</div>
				{/if}
			</div>
		</section>
	{:else}
		<!-- Categories Overview (>= 10 total posts) -->
		<section class="py-8 sm:py-12">
			<div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
				<div class="text-center mb-8">
					<h2 class="text-2xl font-bold text-foreground mb-2">Explore by Category</h2>
					<p class="text-sm text-muted-foreground">
						Find exactly what you need to level up your productivity
					</p>
				</div>

				<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
					{#each Object.entries(data.categorizedPosts) as [categoryKey, posts]}
						{@const category = data.categories[categoryKey]}
						{@const IconComponent = categoryIcons[categoryKey]}
						{@const colors = getCategoryColorClasses(categoryKey)}

						{#if posts?.length}
							<a
								href="/blogs/{categoryKey}"
								class="group bg-card border border-border rounded-lg p-5 shadow-ink hover:shadow-ink-strong hover:border-accent/40 transition-all duration-200 tx tx-frame tx-weak wt-paper pressable"
							>
								<div
									class="flex items-center justify-center w-10 h-10 {colors.iconBg} rounded-lg mb-3 group-hover:scale-105 transition-transform"
								>
									<IconComponent class="w-5 h-5 {colors.iconText}" />
								</div>

								<h3 class="text-base font-semibold text-foreground mb-1">
									{category.name}
								</h3>

								<p class="text-sm text-muted-foreground mb-3 line-clamp-2">
									{category.description}
								</p>

								<div class="flex items-center justify-between text-xs">
									<span class="text-muted-foreground">
										{posts.length} article{posts.length !== 1 ? 's' : ''}
									</span>
									<span class="flex items-center gap-1 text-accent font-medium">
										View all <ArrowRight class="w-3 h-3" />
									</span>
								</div>
							</a>
						{/if}
					{/each}
				</div>
			</div>
		</section>

		<!-- Recent Posts by Category -->
		<section class="py-8 sm:py-12 bg-muted/30 border-t border-border">
			<div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
				{#each Object.entries(data.categorizedPosts) as [categoryKey, posts]}
					{@const category = data.categories[categoryKey]}
					{@const colors = getCategoryColorClasses(categoryKey)}

					{#if posts.length > 0}
						<div class="mb-10 last:mb-0">
							<div class="flex items-center justify-between mb-4">
								<h2 class="text-lg font-bold text-foreground">
									Latest from {category.name}
								</h2>
								{#if posts.length > 5}
									<a
										href="/blogs/{categoryKey}"
										class="flex items-center gap-1 text-accent text-sm font-medium hover:underline"
									>
										View all <ArrowRight class="w-3 h-3" />
									</a>
								{/if}
							</div>

							<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
								{#each posts.slice(0, 5) as post}
									<article class="group">
										<a
											href="/blogs/{post.category}/{post.slug}"
											class="block bg-card border border-border rounded-lg overflow-hidden hover:shadow-ink hover:border-accent/40 transition-all duration-200"
										>
											<div class="p-4">
												<div
													class="flex items-center gap-2 text-xs text-muted-foreground mb-2"
												>
													<span
														class="px-2 py-0.5 {colors.bg} {colors.text} rounded-full font-medium"
													>
														{category.name}
													</span>
													<span class="flex items-center gap-1">
														<Calendar class="w-3 h-3" />
														{format(new Date(post.date), 'MMM dd, yyyy')}
													</span>
												</div>

												<h3
													class="text-sm font-semibold text-foreground mb-2 line-clamp-2 group-hover:text-accent transition-colors"
												>
													{post.title}
												</h3>

												<p
													class="text-xs text-muted-foreground mb-3 line-clamp-2"
												>
													{post.description}
												</p>

												<div class="flex items-center justify-between">
													<span
														class="flex items-center gap-1 text-xs text-muted-foreground"
													>
														<Clock class="w-3 h-3" />
														{post.readingTime} min
													</span>

													<span
														class="text-xs text-accent font-medium flex items-center gap-1"
													>
														Read <ArrowRight class="w-3 h-3" />
													</span>
												</div>
											</div>
										</a>
									</article>
								{/each}
							</div>
						</div>
					{/if}
				{/each}
			</div>
		</section>
	{/if}
</div>
