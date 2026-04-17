<!-- apps/web/src/routes/blogs/[category]/[slug]/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		DEFAULT_ORGANIZATION_LOGO_URL,
		DEFAULT_ORGANIZATION_ID,
		DEFAULT_ORGANIZATION_SOCIAL_PROFILES,
		DEFAULT_SOCIAL_IMAGE_ALT,
		DEFAULT_SOCIAL_IMAGE_HEIGHT,
		DEFAULT_SOCIAL_IMAGE_TYPE,
		DEFAULT_SOCIAL_IMAGE_URL,
		DEFAULT_SOCIAL_IMAGE_WIDTH,
		DEFAULT_TWITTER_CREATOR,
		DEFAULT_TWITTER_SITE,
		SITE_URL,
		SITE_NAME
	} from '$lib/constants/seo';
	import type { PageData } from './$types';
	import type { ComponentType } from 'svelte';
	import { ArrowLeft, Calendar, Clock, History, Tag } from 'lucide-svelte';
	import { formatBlogDate, parseBlogDate } from '$lib/utils/blog';

	let { data }: { data: PageData } = $props();

	let contentComponent = $state<ComponentType | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	const publishedDate = parseBlogDate(data.post.date);
	const formattedDate = formatBlogDate(data.post.date, 'MMMM dd, yyyy');
	const formattedLastmod = formatBlogDate(data.post.lastmod || data.post.date, 'MMMM dd, yyyy');
	const showUpdatedDate = (data.post.lastmod || data.post.date) !== data.post.date;
	const categoryDisplayName = data.post.category
		.replace('-', ' ')
		.replace(/\b\w/g, (l) => l.toUpperCase());

	const articleUrl = `${SITE_URL}/blogs/${data.post.category}/${data.post.slug}`;

	const graphItems: Record<string, unknown>[] = [
		{
			'@type': 'BlogPosting',
			'@id': `${articleUrl}#article`,
			headline: data.post.title,
			description: data.post.description,
			image: {
				'@type': 'ImageObject',
				url: DEFAULT_SOCIAL_IMAGE_URL,
				width: DEFAULT_SOCIAL_IMAGE_WIDTH,
				height: DEFAULT_SOCIAL_IMAGE_HEIGHT
			},
			url: articleUrl,
			datePublished: data.post.date,
			dateModified: data.post.lastmod || data.post.date,
			author: {
				'@type': 'Person',
				name: data.post.author || 'BuildOS Team',
				url: `${SITE_URL}/about`,
				sameAs: ['https://twitter.com/djwayne3', 'https://www.linkedin.com/in/djwayne3']
			},
			publisher: {
				'@type': 'Organization',
				'@id': DEFAULT_ORGANIZATION_ID,
				name: SITE_NAME,
				url: SITE_URL,
				logo: {
					'@type': 'ImageObject',
					url: DEFAULT_ORGANIZATION_LOGO_URL
				},
				sameAs: [...DEFAULT_ORGANIZATION_SOCIAL_PROFILES]
			},
			mainEntityOfPage: {
				'@type': 'WebPage',
				'@id': articleUrl
			},
			keywords: data.post.tags.join(', '),
			wordCount: data.post.readingTime * 200,
			timeRequired: `PT${data.post.readingTime}M`,
			articleSection: categoryDisplayName,
			inLanguage: 'en-US',
			copyrightYear: publishedDate?.getFullYear(),
			copyrightHolder: {
				'@id': DEFAULT_ORGANIZATION_ID
			},
			speakable: {
				'@type': 'SpeakableSpecification',
				cssSelector: ['[data-speakable="headline"]', '[data-speakable="description"]']
			},
			isPartOf: {
				'@type': 'Blog',
				'@id': `${SITE_URL}/blogs#blog`,
				name: `${SITE_NAME} Blog`,
				url: `${SITE_URL}/blogs`
			}
		},
		{
			'@type': 'BreadcrumbList',
			'@id': `${articleUrl}#breadcrumb`,
			itemListElement: [
				{
					'@type': 'ListItem',
					position: 1,
					name: 'Blog',
					item: `${SITE_URL}/blogs`
				},
				{
					'@type': 'ListItem',
					position: 2,
					name: categoryDisplayName,
					item: `${SITE_URL}/blogs/${data.post.category}`
				},
				{
					'@type': 'ListItem',
					position: 3,
					name: data.post.title
				}
			]
		}
	];

	if (data.post.faq?.length) {
		graphItems.push({
			'@type': 'FAQPage',
			'@id': `${articleUrl}#faq`,
			mainEntity: data.post.faq.map((item) => ({
				'@type': 'Question',
				name: item.q,
				acceptedAnswer: {
					'@type': 'Answer',
					text: item.a
				}
			}))
		});
	}

	const jsonLd = {
		'@context': 'https://schema.org',
		'@graph': graphItems
	};

	onMount(async () => {
		try {
			const module = await import(
				`../../../../content/blogs/${data.post.category}/${data.post.slug}.md`
			);
			contentComponent = module.default;
		} catch (_err) {
			error = 'Failed to load blog content';
		} finally {
			loading = false;
		}
	});
</script>

<svelte:head>
	<title>{data.post.title} | BuildOS</title>
	<meta name="description" content={data.post.description} />
	<meta name="author" content={data.post.author || 'BuildOS Team'} />
	<meta
		name="keywords"
		content="{data.post.tags.join(
			', '
		)}, BuildOS, thinking environment, project memory, structured work, {categoryDisplayName.toLowerCase()}"
	/>
	<link rel="canonical" href="https://build-os.com/blogs/{data.post.category}/{data.post.slug}" />

	<!-- Open Graph / Facebook -->
	<meta property="og:type" content="article" />
	<meta
		property="og:url"
		content="https://build-os.com/blogs/{data.post.category}/{data.post.slug}"
	/>
	<meta property="og:title" content="{data.post.title} | BuildOS" />
	<meta property="og:description" content={data.post.description} />
	<meta property="og:image" content={DEFAULT_SOCIAL_IMAGE_URL} />
	<meta property="og:image:secure_url" content={DEFAULT_SOCIAL_IMAGE_URL} />
	<meta property="og:image:type" content={DEFAULT_SOCIAL_IMAGE_TYPE} />
	<meta property="og:image:width" content={String(DEFAULT_SOCIAL_IMAGE_WIDTH)} />
	<meta property="og:image:height" content={String(DEFAULT_SOCIAL_IMAGE_HEIGHT)} />
	<meta property="og:image:alt" content={DEFAULT_SOCIAL_IMAGE_ALT} />
	<meta property="og:site_name" content="BuildOS" />
	<meta property="og:locale" content="en_US" />
	<link rel="image_src" href={DEFAULT_SOCIAL_IMAGE_URL} />

	<!-- Article specific Open Graph -->
	<meta property="article:author" content={data.post.author || 'BuildOS Team'} />
	<meta property="article:published_time" content={data.post.date} />
	<meta property="article:modified_time" content={data.post.lastmod || data.post.date} />
	<meta property="article:section" content={categoryDisplayName} />
	{#each data.post.tags as tag}
		<meta property="article:tag" content={tag} />
	{/each}

	<!-- Twitter -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta
		name="twitter:url"
		content="https://build-os.com/blogs/{data.post.category}/{data.post.slug}"
	/>
	<meta name="twitter:site" content={DEFAULT_TWITTER_SITE} />
	<meta name="twitter:creator" content={DEFAULT_TWITTER_CREATOR} />
	<meta name="twitter:title" content="{data.post.title} | BuildOS" />
	<meta name="twitter:description" content={data.post.description} />
	<meta name="twitter:image" content={DEFAULT_SOCIAL_IMAGE_URL} />
	<meta name="twitter:image:alt" content={DEFAULT_SOCIAL_IMAGE_ALT} />

	<!-- Additional Meta Tags -->
	<meta name="robots" content="index, follow" />

	<!-- JSON-LD Structured Data -->
	{@html '<script type="application/ld+json">' + JSON.stringify(jsonLd) + '</script>'}
</svelte:head>

<div class="min-h-screen bg-background">
	<div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
		<!-- Breadcrumb -->
		<nav
			class="flex items-center gap-1.5 text-xs text-muted-foreground py-4 border-b border-border"
		>
			<a href="/blogs" class="hover:text-accent transition-colors">Blog</a>
			<span>/</span>
			<a href="/blogs/{data.post.category}" class="hover:text-accent transition-colors">
				{categoryDisplayName}
			</a>
		</nav>

		<!-- Article Header -->
		<header class="pt-8 sm:pt-12 pb-6 sm:pb-8">
			<div class="flex items-center gap-3 text-xs text-muted-foreground mb-4">
				<span
					class="px-2 py-0.5 bg-accent/10 text-accent rounded-full font-medium border border-accent/20"
				>
					{categoryDisplayName}
				</span>
				<span class="flex items-center gap-1">
					<Calendar class="w-3 h-3" />
					Published {formattedDate}
				</span>
				<span class="flex items-center gap-1">
					<History class="w-3 h-3" />
					{showUpdatedDate ? 'Updated' : 'Last reviewed'}
					{formattedLastmod}
				</span>
				<span class="flex items-center gap-1">
					<Clock class="w-3 h-3" />
					{data.post.readingTime} min read
				</span>
			</div>

			<h1
				class="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground tracking-tight leading-tight"
				data-speakable="headline"
			>
				{data.post.title}
			</h1>

			<p
				class="mt-3 text-base sm:text-lg text-muted-foreground leading-relaxed"
				data-speakable="description"
			>
				{data.post.description}
			</p>

			<div class="mt-4 flex items-center justify-between">
				<span class="text-xs text-muted-foreground">
					By <span class="font-medium text-foreground"
						>{data.post.author || 'BuildOS Team'}</span
					>
				</span>

				{#if data.post.tags.length > 0}
					<div class="flex flex-wrap gap-1.5">
						{#each data.post.tags as tag}
							<span
								class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground"
							>
								<Tag class="w-2.5 h-2.5 mr-0.5" />
								{tag}
							</span>
						{/each}
					</div>
				{/if}
			</div>
		</header>

		<!-- Divider -->
		<hr class="border-border" />

		<!-- Content -->
		<article class="py-8 sm:py-10">
			<div
				class="prose prose-neutral max-w-none
				prose-headings:text-foreground prose-headings:tracking-tight
				prose-p:text-foreground/90 prose-p:leading-relaxed
				prose-li:text-foreground/90
				prose-strong:text-foreground prose-strong:font-semibold
				prose-a:text-accent prose-a:no-underline hover:prose-a:underline
				prose-blockquote:text-muted-foreground prose-blockquote:border-accent/30 prose-blockquote:not-italic
				prose-code:text-foreground prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:before:content-none prose-code:after:content-none
				prose-pre:bg-muted prose-pre:border prose-pre:border-border prose-pre:rounded-lg
				prose-hr:border-border
				prose-img:rounded-lg prose-img:shadow-ink
				prose-th:text-foreground prose-td:text-foreground/90
				prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg"
			>
				{#if loading}
					<div class="flex items-center justify-center py-12">
						<div
							class="animate-spin rounded-full h-6 w-6 border-2 border-accent border-t-transparent"
						></div>
						<span class="ml-3 text-sm text-muted-foreground">Loading...</span>
					</div>
				{:else if error}
					<div class="text-center py-12">
						<p class="text-sm text-destructive">{error}</p>
						<p class="text-xs text-muted-foreground mt-1">
							Please try refreshing the page.
						</p>
					</div>
				{:else if contentComponent}
					{@const MarkdownContent = contentComponent}
					<MarkdownContent />
				{:else}
					<div class="text-center py-12">
						<p class="text-sm text-muted-foreground">Content not available.</p>
					</div>
				{/if}
			</div>
		</article>

		<!-- Divider -->
		<hr class="border-border" />

		<!-- Footer Navigation -->
		<div class="py-6 flex flex-col sm:flex-row gap-3">
			<a
				href="/blogs/{data.post.category}"
				class="flex-1 inline-flex items-center justify-center gap-2 bg-muted text-foreground text-sm font-medium px-4 py-2.5 rounded-lg border border-border hover:border-accent/40 transition-colors shadow-ink pressable"
			>
				<ArrowLeft class="w-3.5 h-3.5" />
				More {categoryDisplayName}
			</a>
			<a
				href="/blogs"
				class="flex-1 inline-flex items-center justify-center gap-2 bg-accent text-accent-foreground text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-accent/90 transition-colors shadow-ink pressable"
			>
				All Articles
			</a>
		</div>
	</div>

	<!-- Related Articles -->
	{#if data.relatedPosts && data.relatedPosts.length > 0}
		<section class="border-t border-border bg-muted/30 py-8 sm:py-10">
			<div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
				<h2 class="text-base font-semibold text-foreground mb-4">Related Articles</h2>

				<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
					{#each data.relatedPosts as relatedPost}
						<a
							href="/blogs/{relatedPost.category}/{relatedPost.slug}"
							class="group block bg-card border border-border rounded-lg p-4 hover:shadow-ink hover:border-accent/40 transition-all duration-200 pressable"
						>
							<span
								class="flex items-center gap-1 text-[10px] text-muted-foreground mb-2"
							>
								<Calendar class="w-2.5 h-2.5" />
								{formatBlogDate(relatedPost.date)}
							</span>

							<h3
								class="text-sm font-medium text-foreground mb-1.5 line-clamp-2 group-hover:text-accent transition-colors"
							>
								{relatedPost.title}
							</h3>

							<p class="text-xs text-muted-foreground line-clamp-2">
								{relatedPost.description}
							</p>
						</a>
					{/each}
				</div>
			</div>
		</section>
	{/if}
</div>
