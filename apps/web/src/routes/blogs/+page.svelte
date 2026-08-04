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
	import { ArrowRight, Calendar, Clock, Search, SlidersHorizontal, X } from '$lib/icons/lucide';
	import type { PageData } from './$types';
	import Button from '$lib/components/ui/Button.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import {
		formatBlogDate,
		getContentPostPath,
		getContentPostUrl,
		type BlogCategory,
		type BlogPost
	} from '$lib/utils/blog';
	import { escapeSerializedJsonLd } from '$lib/utils/json-ld';

	let { data }: { data: PageData } = $props();
	const INITIAL_GRID_POSTS = 12;

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
				url: getContentPostUrl(SITE_URL, post),
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
	let filtersOpen = $state(false);
	let showAllPosts = $state(false);

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
	let visibleGridPosts = $derived(
		hasActiveSearch || activeCategory !== 'all' || showAllPosts
			? gridPosts
			: gridPosts.slice(0, INITIAL_GRID_POSTS)
	);
	let hasCollapsedPosts = $derived(visibleGridPosts.length < gridPosts.length);
	let selectedCategoryName = $derived(
		activeCategory === 'all' ? null : data.categories[activeCategory].name
	);

	// Only show categories that have posts
	let activeCategories = $derived(
		(Object.entries(data.categoryCounts) as [BlogCategory, number][]).filter(
			([, count]) => count > 0
		)
	);

	let jsonLdString = $derived(generateBlogJsonLd(data.allPosts));
	let jsonLdScriptHtml = $derived(
		'<' +
			'script type="application/ld+json">' +
			escapeSerializedJsonLd(jsonLdString) +
			'</' +
			'script>'
	);

	function selectCategory(category: BlogCategory | 'all') {
		activeCategory = category;
		filtersOpen = false;
	}

	function clearSearch() {
		searchQuery = '';
	}

	// URL search params are request-specific, so only read them after the prerendered page hydrates.
	// The effect also resets a local search draft when client-side navigation changes the URL.
	$effect(() => {
		searchQuery = page.url.searchParams.get('q')?.trim() ?? '';
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
		{@html jsonLdScriptHtml}
	{/if}
</svelte:head>

<div class="min-h-screen bg-background">
	<!-- Hero -->
	<header class="border-b border-border bg-card tx tx-bloom tx-weak">
		<div class="mx-auto max-w-7xl px-2 py-8 text-center sm:px-4 sm:py-10 lg:px-6">
			<h1
				class="text-3xl font-semibold leading-[1.1] tracking-tight text-foreground sm:text-4xl"
			>
				BuildOS Blog
			</h1>
			<p
				class="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base"
			>
				Guides, insights, and the thinking behind turning messy ideas into structured work.
			</p>

			<div class="relative mx-auto mt-5 max-w-md">
				<div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
					<Search class="h-4 w-4 text-muted-foreground" aria-hidden="true" />
				</div>
				<TextInput
					type="text"
					bind:value={searchQuery}
					placeholder="Search articles..."
					aria-label="Search articles"
					size="md"
					class="pl-10"
				/>
			</div>
		</div>
	</header>

	<div class="mx-auto max-w-7xl px-2 sm:px-4 lg:px-6">
		<!-- Category filters -->
		<div class="border-b border-border py-3 sm:py-4">
			<div class="md:hidden">
				<Button
					variant="outline"
					size="sm"
					fullWidth
					btnType="container"
					onclick={() => (filtersOpen = !filtersOpen)}
					aria-expanded={filtersOpen}
					aria-controls="mobile-blog-filters"
				>
					<span class="flex w-full min-w-0 items-center gap-2">
						<SlidersHorizontal class="h-4 w-4 shrink-0" aria-hidden="true" />
						<span>Filters</span>
						<span class="ml-auto truncate text-xs font-normal text-muted-foreground">
							{selectedCategoryName ?? 'All categories'}
						</span>
					</span>
				</Button>

				{#if filtersOpen}
					<div
						id="mobile-blog-filters"
						class="mt-2 grid grid-cols-2 gap-2 rounded-lg border border-border bg-card p-2 shadow-ink-inner"
						role="group"
						aria-label="Filter articles by category"
					>
						<button
							onclick={() => selectCategory('all')}
							aria-pressed={activeCategory === 'all'}
							class="flex min-h-11 min-w-0 items-center justify-between gap-2 rounded-md px-3 text-left text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none {activeCategory ===
							'all'
								? 'bg-foreground text-background'
								: 'bg-muted text-muted-foreground hover:text-foreground'}"
						>
							<span class="truncate">All</span>
							<span class="shrink-0 text-2xs opacity-80">{data.totalPosts}</span>
						</button>
						{#each activeCategories as [categoryKey, count] (categoryKey)}
							<button
								onclick={() => selectCategory(categoryKey)}
								aria-pressed={activeCategory === categoryKey}
								class="flex min-h-11 min-w-0 items-center justify-between gap-2 rounded-md px-3 text-left text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none {activeCategory ===
								categoryKey
									? 'bg-foreground text-background'
									: 'bg-muted text-muted-foreground hover:text-foreground'}"
							>
								<span class="truncate">{data.categories[categoryKey].name}</span>
								<span class="shrink-0 text-2xs opacity-80">{count}</span>
							</button>
						{/each}
					</div>
				{/if}

				{#if selectedCategoryName && !filtersOpen}
					<button
						onclick={() => selectCategory('all')}
						class="mt-2 inline-flex min-h-11 min-w-0 items-center gap-2 rounded-full bg-accent/10 px-3 text-sm font-medium text-accent transition-colors hover:bg-accent/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
						aria-label={`Clear ${selectedCategoryName} category filter`}
					>
						<span class="truncate">{selectedCategoryName}</span>
						<X class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
					</button>
				{/if}
			</div>

			<div
				class="hidden flex-wrap gap-2 md:flex"
				role="group"
				aria-label="Filter articles by category"
			>
				<button
					onclick={() => selectCategory('all')}
					aria-pressed={activeCategory === 'all'}
					class="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none {activeCategory ===
					'all'
						? 'bg-foreground text-background'
						: 'bg-muted text-muted-foreground hover:text-foreground'}"
				>
					All
					<span class="ml-1 text-2xs opacity-80">{data.totalPosts}</span>
				</button>
				{#each activeCategories as [categoryKey, count] (categoryKey)}
					<button
						onclick={() => selectCategory(categoryKey)}
						aria-pressed={activeCategory === categoryKey}
						class="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none {activeCategory ===
						categoryKey
							? 'bg-foreground text-background'
							: 'bg-muted text-muted-foreground hover:text-foreground'}"
					>
						{data.categories[categoryKey].name}
						<span class="ml-1 text-2xs opacity-80">{count}</span>
					</button>
				{/each}
			</div>
		</div>

		{#if hasActiveSearch}
			<div class="flex min-w-0 items-center justify-between gap-3 pt-4">
				<p class="min-w-0 truncate text-sm text-muted-foreground" role="status">
					{filteredPosts.length} result{filteredPosts.length !== 1 ? 's' : ''} for "{searchQuery}"
				</p>
				<Button variant="ghost" size="sm" class="shrink-0 px-3" onclick={clearSearch}>
					Clear search
				</Button>
			</div>
		{/if}

		<!-- Featured post (latest, only when no filter/search active) -->
		{#if featuredPost}
			<article class="group pt-6">
				<a
					href={getContentPostPath(featuredPost)}
					class="pressable block overflow-hidden bg-card transition-colors hover:border-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none tx tx-frame tx-weak wt-card"
				>
					<div class="p-5 sm:p-6">
						<div
							class="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground mb-3"
						>
							<span class="micro-label shrink-0 font-semibold text-accent"
								>Latest</span
							>
							<span
								class="shrink-0 rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground"
							>
								{data.categories[featuredPost.category as BlogCategory]?.name ??
									featuredPost.category}
							</span>
							<span class="flex shrink-0 items-center gap-1">
								<Calendar class="h-3 w-3" aria-hidden="true" />
								{formatBlogDate(featuredPost.date)}
							</span>
							<span class="flex shrink-0 items-center gap-1">
								<Clock class="h-3 w-3" aria-hidden="true" />
								{featuredPost.readingTime} min read
							</span>
						</div>

						<h2
							class="mb-2 text-xl font-bold text-foreground transition-colors group-hover:text-accent motion-reduce:transition-none sm:text-2xl"
						>
							{featuredPost.title}
						</h2>

						<p class="text-sm sm:text-base text-muted-foreground leading-relaxed mb-4">
							{featuredPost.description}
						</p>

						<span
							class="inline-flex items-center gap-1 text-sm font-medium text-accent"
						>
							Read latest <ArrowRight class="h-3.5 w-3.5" aria-hidden="true" />
						</span>
					</div>
				</a>
			</article>
		{/if}

		<!-- Posts grid -->
		{#if gridPosts.length > 0}
			<section class="py-6" aria-labelledby="articles-heading">
				<div class="mb-3 flex min-w-0 items-end justify-between gap-4">
					<div class="min-w-0">
						<p class="micro-label mb-1">{featuredPost ? 'Keep reading' : 'Browse'}</p>
						<h2
							id="articles-heading"
							class="truncate text-lg font-semibold text-foreground"
						>
							{featuredPost ? 'More articles' : (selectedCategoryName ?? 'Articles')}
						</h2>
					</div>
					<span class="shrink-0 text-xs text-muted-foreground">
						{gridPosts.length} article{gridPosts.length !== 1 ? 's' : ''}
					</span>
				</div>
				<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
					{#each visibleGridPosts as post (post.slug)}
						{@const categoryName =
							data.categories[post.category as BlogCategory]?.name ?? post.category}

						<article class="group">
							<a
								href={getContentPostPath(post)}
								class="pressable flex h-full min-w-0 flex-col overflow-hidden bg-card transition-colors hover:border-accent/40 hover:shadow-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none tx tx-frame tx-weak wt-paper"
							>
								<div class="flex flex-1 flex-col p-4 sm:p-5">
									<div
										class="mb-3 flex min-w-0 items-center gap-2 text-xs text-muted-foreground"
									>
										<span
											class="truncate rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground"
										>
											{categoryName}
										</span>
										<span class="flex shrink-0 items-center gap-1">
											<Calendar class="h-3 w-3" aria-hidden="true" />
											{formatBlogDate(post.date)}
										</span>
									</div>

									<h3
										class="mb-2 line-clamp-2 text-base font-semibold text-foreground transition-colors group-hover:text-accent motion-reduce:transition-none"
									>
										{post.title}
									</h3>

									<p
										class="mb-3 line-clamp-2 flex-1 text-sm text-muted-foreground sm:line-clamp-3"
									>
										{post.description}
									</p>

									<div class="mt-auto flex items-center justify-between">
										<span
											class="flex items-center gap-1 text-xs text-muted-foreground"
										>
											<Clock class="h-3 w-3" aria-hidden="true" />
											{post.readingTime} min
										</span>
										<span
											class="text-xs text-accent font-medium flex items-center gap-1"
										>
											Read <ArrowRight class="h-3 w-3" aria-hidden="true" />
										</span>
									</div>
								</div>
							</a>
						</article>
					{/each}
				</div>

				{#if activeCategory === 'all' && !hasActiveSearch && gridPosts.length > INITIAL_GRID_POSTS}
					<div class="mt-5 flex justify-center">
						<Button
							variant="outline"
							size="sm"
							onclick={() => (showAllPosts = !showAllPosts)}
							aria-expanded={showAllPosts}
						>
							{hasCollapsedPosts
								? `Show all ${gridPosts.length} more articles`
								: 'Show fewer articles'}
						</Button>
					</div>
				{/if}
			</section>
		{:else if hasActiveSearch}
			<div class="py-16 text-center">
				<h2 class="mb-1 text-lg font-semibold text-foreground">No matching articles</h2>
				<p class="text-sm text-muted-foreground">Try a different search term.</p>
			</div>
		{:else}
			<div class="py-16 text-center">
				<h2 class="mb-1 text-lg font-semibold text-foreground">No articles yet</h2>
				<p class="text-sm text-muted-foreground">We're working on it. Check back soon.</p>
			</div>
		{/if}
	</div>
</div>
