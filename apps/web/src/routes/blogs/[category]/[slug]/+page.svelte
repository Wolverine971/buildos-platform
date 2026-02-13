<!-- apps/web/src/routes/blogs/[category]/[slug]/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';
	import type { ComponentType } from 'svelte';
	import { format } from 'date-fns';
	import { ArrowLeft, Calendar, Clock, Tag, ArrowRight } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	let contentComponent = $state<ComponentType | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	const formattedDate = format(new Date(data.post.date), 'MMMM dd, yyyy');
	const categoryDisplayName = data.post.category
		.replace('-', ' ')
		.replace(/\b\w/g, (l) => l.toUpperCase());

	// Build JSON-LD structured data as a proper object
	const jsonLd = {
		'@context': 'https://schema.org',
		'@type': 'BlogPosting',
		headline: data.post.title,
		description: data.post.description,
		image: `https://build-os.com/og-blog-${data.post.category}-${data.post.slug}.jpg`,
		url: `https://build-os.com/blogs/${data.post.category}/${data.post.slug}`,
		datePublished: data.post.date,
		dateModified: data.post.lastmod || data.post.date,
		author: {
			'@type': 'Person',
			name: data.post.author || 'BuildOS Team'
		},
		publisher: {
			'@type': 'Organization',
			name: 'BuildOS',
			logo: {
				'@type': 'ImageObject',
				url: 'https://build-os.com/brain-bolt.png'
			}
		},
		mainEntityOfPage: {
			'@type': 'WebPage',
			'@id': `https://build-os.com/blogs/${data.post.category}/${data.post.slug}`
		},
		keywords: data.post.tags.join(', '),
		wordCount: data.post.readingTime * 200,
		timeRequired: `PT${data.post.readingTime}M`,
		articleSection: categoryDisplayName,
		isPartOf: {
			'@type': 'Blog',
			name: 'BuildOS Blog',
			url: 'https://build-os.com/blogs'
		}
	};

	onMount(async () => {
		try {
			// Dynamically import the content component
			const module = await import(
				`../../../../content/blogs/${data.post.category}/${data.post.slug}.md`
			);
			contentComponent = module.default;
		} catch (err) {
			error = 'Failed to load blog content';
			// Error loading blog content
		} finally {
			loading = false;
		}
	});
</script>

<svelte:head>
	<title>{data.post.title} - BuildOS Blog | AI-Native Productivity</title>
	<meta name="description" content={data.post.description} />
	<meta name="author" content={data.post.author || 'BuildOS Team'} />
	<meta
		name="keywords"
		content="{data.post.tags.join(
			', '
		)}, BuildOS, AI productivity, {categoryDisplayName.toLowerCase()}, personal operating system"
	/>
	<link rel="canonical" href="https://build-os.com/blogs/{data.post.category}/{data.post.slug}" />

	<!-- Open Graph / Facebook -->
	<meta property="og:type" content="article" />
	<meta
		property="og:url"
		content="https://build-os.com/blogs/{data.post.category}/{data.post.slug}"
	/>
	<meta property="og:title" content="{data.post.title} - BuildOS Blog" />
	<meta property="og:description" content={data.post.description} />
	<meta
		property="og:image"
		content="https://build-os.com/og-blog-{data.post.category}-{data.post.slug}.jpg"
	/>
	<meta property="og:site_name" content="BuildOS" />

	<!-- Article specific Open Graph -->
	<meta property="article:author" content={data.post.author || 'BuildOS Team'} />
	<meta property="article:published_time" content={data.post.date} />
	<meta property="article:modified_time" content={data.post.lastmod || data.post.date} />
	<meta property="article:section" content={categoryDisplayName} />
	{#each data.post.tags as tag}
		<meta property="article:tag" content={tag} />
	{/each}

	<!-- Twitter -->
	<meta property="twitter:card" content="summary_large_image" />
	<meta
		property="twitter:url"
		content="https://build-os.com/blogs/{data.post.category}/{data.post.slug}"
	/>
	<meta property="twitter:title" content="{data.post.title} - BuildOS Blog" />
	<meta property="twitter:description" content={data.post.description} />
	<meta
		property="twitter:image"
		content="https://build-os.com/og-blog-{data.post.category}-{data.post.slug}.jpg"
	/>
	<meta property="twitter:creator" content="@buildos_app" />

	<!-- Additional Meta Tags -->
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<meta name="robots" content="index, follow" />

	<!-- JSON-LD Structured Data -->
	{@html `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`}
</svelte:head>

<div class="min-h-screen bg-background">
	<!-- Header -->
	<div class="bg-card py-8 rounded-lg mb-4 shadow-ink border border-border tx tx-frame tx-weak">
		<div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="flex items-center space-x-4 mb-8">
				<a
					href="/blogs"
					class="inline-flex items-center text-accent hover:text-accent/80 group transition-colors"
				>
					<ArrowLeft
						class="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform"
					/>
					Blog
				</a>
				<span class="text-muted-foreground">/</span>
				<a
					href="/blogs/{data.post.category}"
					class="text-accent hover:text-accent/80 transition-colors"
				>
					{categoryDisplayName}
				</a>
			</div>

			<div class="mb-6">
				<div class="flex items-center space-x-4 text-sm text-muted-foreground mb-4">
					<span
						class="bg-accent/10 text-accent px-3 py-1 rounded-full font-medium border border-accent/20"
					>
						{categoryDisplayName}
					</span>
					<div class="flex items-center">
						<Calendar class="w-4 h-4 mr-1" />
						{formattedDate}
					</div>
					<div class="flex items-center">
						<Clock class="w-4 h-4 mr-1" />
						{data.post.readingTime} min read
					</div>
				</div>

				<h1 class="text-4xl md:text-5xl font-bold text-foreground mb-4">
					{data.post.title}
				</h1>

				<p class="text-xl text-muted-foreground mb-6">
					{data.post.description}
				</p>

				{#if data.post.tags.length > 0}
					<div class="flex flex-wrap gap-2">
						{#each data.post.tags as tag}
							<span
								class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs text-center font-medium bg-background text-muted-foreground border border-border"
							>
								<Tag class="w-3 h-3 mr-1" />
								{tag}
							</span>
						{/each}
					</div>
				{/if}
			</div>

			<div class="text-sm text-muted-foreground">
				By <span class="font-medium text-foreground"
					>{data.post.author || 'BuildOS Team'}</span
				>
			</div>
		</div>
	</div>

	<!-- Content -->
	<article class="">
		<div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
			<div
				class="prose prose-gray dark:prose-invert max-w-none
				prose-headings:text-foreground prose-p:text-foreground prose-li:text-foreground
				prose-strong:text-foreground prose-a:text-blue-600 prose-blockquote:text-foreground
				dark:prose-headings:text-white dark:prose-p:text-muted-foreground dark:prose-li:text-muted-foreground
				dark:prose-strong:text-white dark:prose-a:text-blue-400 dark:prose-blockquote:text-muted-foreground
				dark:prose-hr:border-gray-700"
			>
				{#if loading}
					<div class="flex items-center justify-center py-12">
						<div
							class="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"
						></div>
						<span class="ml-3 text-muted-foreground">Loading content...</span>
					</div>
				{:else if error}
					<div class="text-center py-12">
						<p class="text-destructive">{error}</p>
						<p class="text-muted-foreground mt-2">Please try refreshing the page.</p>
					</div>
				{:else if contentComponent}
					{@const MarkdownContent = contentComponent}
					<MarkdownContent />
				{:else}
					<div class="text-center py-12">
						<p class="text-muted-foreground">Content not available.</p>
					</div>
				{/if}
			</div>
		</div>
	</article>

	<!-- Related Articles -->
	{#if data.relatedPosts && data.relatedPosts.length > 0}
		<section class="py-8 bg-card rounded-lg mt-8 shadow-ink border border-border">
			<div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
				<h2 class="text-2xl font-bold text-foreground mb-8">Related Articles</h2>

				<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
					{#each data.relatedPosts as relatedPost}
						<article
							class="bg-muted rounded-lg p-6 shadow-ink border border-border hover:border-accent transition-all tx tx-frame tx-weak pressable"
						>
							<div class="flex items-center text-xs text-muted-foreground mb-3">
								<Calendar class="w-3 h-3 mr-1" />
								{format(new Date(relatedPost.date), 'MMM dd, yyyy')}
							</div>

							<h3 class="font-semibold text-foreground mb-2 line-clamp-2">
								{relatedPost.title}
							</h3>

							<p class="text-muted-foreground text-sm mb-4 line-clamp-2">
								{relatedPost.description}
							</p>

							<a
								href="/blogs/{relatedPost.category}/{relatedPost.slug}"
								class="inline-flex items-center text-accent text-sm font-medium hover:text-accent/80 transition-colors"
							>
								Read more <ArrowRight class="w-3 h-3 ml-1" />
							</a>
						</article>
					{/each}
				</div>
			</div>
		</section>
	{/if}

	<!-- Footer Navigation -->
	<div class="bg-card py-8 rounded-lg mt-2 border border-border shadow-ink">
		<div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="flex flex-col sm:flex-row gap-4">
				<a
					href="/blogs/{data.post.category}"
					class="flex-1 inline-flex items-center justify-center bg-muted text-foreground px-6 py-3 rounded-lg hover:bg-muted/80 border border-border hover:border-accent transition-colors shadow-ink pressable"
				>
					<ArrowLeft class="w-4 h-4 mr-2" />
					More {categoryDisplayName}
				</a>
				<a
					href="/blogs"
					class="flex-1 inline-flex items-center justify-center bg-accent text-accent-foreground px-6 py-3 rounded-lg hover:bg-accent/90 transition-colors shadow-ink pressable"
				>
					Explore All Articles
				</a>
			</div>
		</div>
	</div>
</div>
