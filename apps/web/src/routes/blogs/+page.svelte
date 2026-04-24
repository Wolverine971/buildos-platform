<!-- apps/web/src/routes/blogs/+page.svelte -->
<script lang="ts">
	import { page } from '$app/state';
	import {
		DEFAULT_ORGANIZATION_ID,
		DEFAULT_ORGANIZATION_LOGO_IMAGE,
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
	import { Calendar, Clock, ArrowRight, Search } from 'lucide-svelte';
	import type { PageData } from './$types';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import { formatBlogDate, type BlogCategory, type BlogPost } from '$lib/utils/blog';
	import { escapeSerializedJsonLd } from '$lib/utils/json-ld';

	let { data }: { data: PageData } = $props();

	function generateBlogJsonLd(posts: BlogPost[]) {
		if (!posts.length) return '';

		const recentPosts = posts.slice(0, 5);

		const jsonLd = {
			'@context': 'https://schema.org',
			'@type': 'Blog',
			'@id': `${SITE_URL}/blogs#blog`,
			name: `${SITE_NAME} Blog`,
			description:
				'Practical guides, productivity insights, and the philosophy behind turning messy thinking into structured work.',
			url: `${SITE_URL}/blogs`,
			publisher: {
				'@type': 'Organization',
				'@id': DEFAULT_ORGANIZATION_ID,
				name: SITE_NAME,
				url: SITE_URL,
				logo: DEFAULT_ORGANIZATION_LOGO_IMAGE
			},
			isPartOf: {
				'@id': DEFAULT_WEBSITE_ID
			},
			blogPost: recentPosts.map((post) => ({
				'@type': 'BlogPosting',
				headline: post.title,
				description: post.description,
				url: `${SITE_URL}/blogs/${post.category}/${post.slug}`,
				datePublished: post.date,
				author: {
					'@type': 'Person',
					name: post.author || 'BuildOS Team'
				},
				keywords: post.tags?.join(', ') || ''
			})),
			mainEntityOfPage: {
				'@type': 'WebPage',
				'@id': `${SITE_URL}/blogs`
			}
		};

		return JSON.stringify(jsonLd, null, 2);
	}

	function matchesSearch(post: BlogPost, query: string) {
		if (!query) return true;
		const haystack = [
			post.title,
			post.description,
			post.excerpt ?? '',
			post.category,
			...(post.tags ?? [])
		]
			.join(' ')
			.toLowerCase();
		return haystack.includes(query);
	}

	let searchQuery = $state('');
	let normalizedSearchQuery = $derived(searchQuery.trim().toLowerCase());
	let hasActiveSearch = $derived(normalizedSearchQuery.length > 0);

	let activeCategory = $state<BlogCategory | 'all'>('all');

	let filteredPosts = $derived.by(() => {
		let posts = data.allPosts;

		if (activeCategory !== 'all') {
			posts = posts.filter((p) => p.category === activeCategory);
		}

		if (hasActiveSearch) {
			posts = posts.filter((p) => matchesSearch(p, normalizedSearchQuery));
		}

		return posts;
	});

	let featuredPost = $derived(
		!hasActiveSearch && activeCategory === 'all' ? data.allPosts[0] : null
	);
	let gridPosts = $derived(featuredPost ? filteredPosts.slice(1) : filteredPosts);

	// Only show categories that have posts
	let activeCategories = $derived(
		(Object.entries(data.categoryCounts) as [BlogCategory, number][]).filter(
			([, count]) => count > 0
		)
	);

	let jsonLdString = $derived(generateBlogJsonLd(data.allPosts));

	const urlSearchQuery = $derived(page.url.searchParams.get('q')?.trim() ?? '');

	$effect(() => {
		searchQuery = urlSearchQuery;
	});
</script>

<svelte:head>
	<title>Blog - BuildOS | Productivity Insights & Guides</title>
	<meta
		name="description"
		content="Practical guides, productivity insights, and the philosophy behind turning messy thinking into structured work."
	/>
	<meta
		name="keywords"
		content="BuildOS blog, thinking environment, project memory, structured work, creator workflow, daily briefs"
	/>
	<link rel="canonical" href="https://build-os.com/blogs" />

	<!-- Open Graph / Facebook -->
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://build-os.com/blogs" />
	<meta property="og:title" content="Blog - BuildOS | Productivity Insights & Guides" />
	<meta
		property="og:description"
		content="Practical guides, productivity insights, and the philosophy behind turning messy thinking into structured work."
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
	<meta name="twitter:url" content="https://build-os.com/blogs" />
	<meta name="twitter:site" content={DEFAULT_TWITTER_SITE} />
	<meta name="twitter:creator" content={DEFAULT_TWITTER_CREATOR} />
	<meta name="twitter:title" content="Blog - BuildOS | Productivity Insights" />
	<meta
		name="twitter:description"
		content="Practical guides, productivity insights, and the philosophy behind turning messy thinking into structured work."
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
	<!-- Hero -->
	<header class="border-b border-border bg-card tx tx-bloom tx-weak">
		<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 text-center">
			<h1 class="text-3xl sm:text-4xl font-bold text-foreground tracking-tight leading-[1.1]">
				BuildOS Blog
			</h1>
			<p class="mt-2 text-base text-muted-foreground max-w-xl mx-auto">
				Guides, insights, and the thinking behind turning messy ideas into structured work.
			</p>

			<div class="relative max-w-md mx-auto mt-5">
				<div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
					<Search class="h-4 w-4 text-muted-foreground" />
				</div>
				<TextInput
					type="text"
					bind:value={searchQuery}
					placeholder="Search articles..."
					size="md"
					class="pl-10"
				/>
			</div>
		</div>
	</header>

	<div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
		<!-- Category filter pills -->
		<nav class="flex flex-wrap gap-2 py-5 border-b border-border">
			<button
				onclick={() => (activeCategory = 'all')}
				class="px-3 py-1.5 text-sm font-medium rounded-full transition-colors {activeCategory ===
				'all'
					? 'bg-foreground text-background'
					: 'bg-muted text-muted-foreground hover:text-foreground'}"
			>
				All
				<span class="ml-1 text-xs opacity-70">{data.totalPosts}</span>
			</button>
			{#each activeCategories as [categoryKey, count]}
				<button
					onclick={() => (activeCategory = categoryKey)}
					class="px-3 py-1.5 text-sm font-medium rounded-full transition-colors {activeCategory ===
					categoryKey
						? 'bg-foreground text-background'
						: 'bg-muted text-muted-foreground hover:text-foreground'}"
				>
					{data.categories[categoryKey].name}
					<span class="ml-1 text-xs opacity-70">{count}</span>
				</button>
			{/each}
		</nav>

		{#if hasActiveSearch}
			<div class="pt-5 pb-2">
				<p class="text-sm text-muted-foreground">
					{filteredPosts.length} result{filteredPosts.length !== 1 ? 's' : ''} for "{searchQuery}"
				</p>
			</div>
		{/if}

		<!-- Featured post (latest, only when no filter/search active) -->
		{#if featuredPost}
			<article class="group pt-6 pb-2">
				<a
					href="/blogs/{featuredPost.category}/{featuredPost.slug}"
					class="block bg-card border border-border rounded-lg shadow-ink hover:shadow-ink-strong hover:border-accent/40 transition-all duration-200 tx tx-frame tx-weak wt-paper overflow-hidden"
				>
					<div class="p-5 sm:p-7">
						<div class="flex items-center gap-3 text-xs text-muted-foreground mb-3">
							<span
								class="px-2 py-0.5 bg-accent/10 text-accent rounded-full font-medium"
							>
								{data.categories[featuredPost.category as BlogCategory]?.name ??
									featuredPost.category}
							</span>
							<span class="flex items-center gap-1">
								<Calendar class="w-3 h-3" />
								{formatBlogDate(featuredPost.date)}
							</span>
							<span class="flex items-center gap-1">
								<Clock class="w-3 h-3" />
								{featuredPost.readingTime} min read
							</span>
						</div>

						<h2
							class="text-xl sm:text-2xl font-bold text-foreground mb-2 group-hover:text-accent transition-colors"
						>
							{featuredPost.title}
						</h2>

						<p class="text-sm sm:text-base text-muted-foreground mb-4 max-w-2xl">
							{featuredPost.description}
						</p>

						<span
							class="inline-flex items-center gap-1 text-sm text-accent font-medium"
						>
							Read article <ArrowRight class="w-3.5 h-3.5" />
						</span>
					</div>
				</a>
			</article>
		{/if}

		<!-- Posts grid -->
		{#if gridPosts.length > 0}
			<section class="py-6">
				<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
					{#each gridPosts as post}
						{@const categoryName =
							data.categories[post.category as BlogCategory]?.name ?? post.category}

						<article class="group">
							<a
								href="/blogs/{post.category}/{post.slug}"
								class="flex flex-col h-full bg-card border border-border rounded-lg shadow-ink hover:shadow-ink-strong hover:border-accent/40 transition-all duration-200 tx tx-frame tx-weak wt-paper overflow-hidden"
							>
								<div class="p-4 sm:p-5 flex flex-col flex-1">
									<div
										class="flex items-center gap-2 text-xs text-muted-foreground mb-3"
									>
										<span
											class="px-2 py-0.5 bg-muted text-muted-foreground rounded-full font-medium"
										>
											{categoryName}
										</span>
										<span class="flex items-center gap-1">
											<Calendar class="w-3 h-3" />
											{formatBlogDate(post.date)}
										</span>
									</div>

									<h3
										class="text-base font-semibold text-foreground mb-2 line-clamp-2 group-hover:text-accent transition-colors"
									>
										{post.title}
									</h3>

									<p
										class="text-sm text-muted-foreground mb-4 line-clamp-3 flex-1"
									>
										{post.description}
									</p>

									<div class="flex items-center justify-between mt-auto">
										<span
											class="flex items-center gap-1 text-xs text-muted-foreground"
										>
											<Clock class="w-3 h-3" />
											{post.readingTime} min
										</span>
										<span
											class="text-xs text-accent font-medium flex items-center gap-1"
										>
											Read article <ArrowRight class="w-3 h-3" />
										</span>
									</div>
								</div>
							</a>
						</article>
					{/each}
				</div>
			</section>
		{:else if hasActiveSearch}
			<div class="text-center py-16">
				<h3 class="text-lg font-semibold text-foreground mb-1">No matching articles</h3>
				<p class="text-sm text-muted-foreground">
					Try a different search term or clear the filter.
				</p>
			</div>
		{:else}
			<div class="text-center py-16">
				<h3 class="text-lg font-semibold text-foreground mb-1">No articles yet</h3>
				<p class="text-sm text-muted-foreground">We're working on it. Check back soon.</p>
			</div>
		{/if}
	</div>
</div>
