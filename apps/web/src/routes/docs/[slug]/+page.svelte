<!-- apps/web/src/routes/docs/[slug]/+page.svelte -->
<script lang="ts">
	import type { ComponentType } from 'svelte';
	import { ArrowLeft, Clock, History } from '$lib/icons/lucide';
	import SEOHead from '$lib/components/SEOHead.svelte';
	import DocsPrevNext from '$lib/components/docs/DocsPrevNext.svelte';
	import {
		DEFAULT_ORGANIZATION_ID,
		DEFAULT_WEBSITE_ID,
		SITE_NAME,
		SITE_URL
	} from '$lib/constants/seo';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type DocContentModule = {
		default: ComponentType;
	};

	const docModules = import.meta.glob('/src/content/docs/*.md', {
		eager: true
	}) as Record<string, DocContentModule>;

	const contentComponent = $derived(
		docModules[`/src/content/docs/${data.doc.slug}.md`]?.default ?? null
	);
	const canonical = $derived(`${SITE_URL}/docs/${data.doc.slug}`);
	const seoTitle = $derived(data.doc.seoTitle ?? `${data.doc.title} — BuildOS Docs`);
	const seoDescription = $derived(data.doc.seoDescription ?? data.doc.summary);
	const seoKeywords = $derived(
		data.doc.seoKeywords ??
			`BuildOS, ${data.doc.title.toLowerCase()}, thinking environment, project memory, structured work, documentation`
	);
	const formattedLastUpdated = $derived(
		data.doc.lastUpdated
			? new Intl.DateTimeFormat('en-US', {
					month: 'short',
					day: 'numeric',
					year: 'numeric',
					timeZone: 'UTC'
				}).format(new Date(data.doc.lastUpdated))
			: null
	);
	const seoAdditionalMeta = $derived.by(() => {
		const meta = [{ property: 'article:section', content: 'Documentation' }];
		if (data.doc.lastUpdated) {
			meta.push({ property: 'article:modified_time', content: data.doc.lastUpdated });
		}
		return meta;
	});
	const docJsonLd = $derived.by(() => ({
		'@context': 'https://schema.org',
		'@graph': [
			{
				'@type': 'TechArticle',
				'@id': `${canonical}#article`,
				headline: data.doc.title,
				description: seoDescription,
				url: canonical,
				dateModified: data.doc.lastUpdated,
				author: {
					'@type': 'Person',
					name: 'DJ Wayne',
					url: `${SITE_URL}/about`
				},
				publisher: {
					'@type': 'Organization',
					'@id': DEFAULT_ORGANIZATION_ID,
					name: SITE_NAME,
					url: SITE_URL
				},
				mainEntityOfPage: {
					'@type': 'WebPage',
					'@id': canonical
				},
				isPartOf: {
					'@type': 'WebSite',
					'@id': DEFAULT_WEBSITE_ID,
					name: `${SITE_NAME} Docs`,
					url: `${SITE_URL}/docs`
				},
				keywords: seoKeywords,
				timeRequired: `PT${data.doc.readingTime}M`,
				inLanguage: 'en-US'
			},
			{
				'@type': 'BreadcrumbList',
				'@id': `${canonical}#breadcrumb`,
				itemListElement: [
					{
						'@type': 'ListItem',
						position: 1,
						name: 'Docs',
						item: `${SITE_URL}/docs`
					},
					{
						'@type': 'ListItem',
						position: 2,
						name: data.doc.title
					}
				]
			}
		]
	}));
</script>

<SEOHead
	title={seoTitle}
	description={seoDescription}
	{canonical}
	keywords={seoKeywords}
	ogType="article"
	jsonLd={docJsonLd}
	additionalMeta={seoAdditionalMeta}
/>

<article class="max-w-4xl">
	<!-- Breadcrumb -->
	<nav
		class="mb-3 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
		aria-label="Breadcrumb"
	>
		<a
			href="/docs"
			class="inline-flex min-h-[44px] shrink-0 items-center rounded-md px-1.5 transition-colors hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
			>Docs</a
		>
		<span aria-hidden="true">/</span>
		<span class="truncate text-foreground" aria-current="page">{data.doc.title}</span>
	</nav>

	<header class="pb-6 border-b border-border">
		<h1
			class="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground tracking-tight leading-tight"
		>
			{data.doc.title}
		</h1>
		<p class="mt-3 text-base text-muted-foreground leading-relaxed max-w-3xl">
			{data.doc.summary}
		</p>

		<div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
			{#if data.doc.lastUpdated && formattedLastUpdated}
				<span class="flex items-center gap-1">
					<History class="h-4 w-4 shrink-0" aria-hidden="true" />
					<time datetime={data.doc.lastUpdated}>Updated {formattedLastUpdated}</time>
				</span>
			{/if}
			<span class="flex items-center gap-1">
				<Clock class="h-4 w-4 shrink-0" aria-hidden="true" />
				{data.doc.readingTime} min read
			</span>
		</div>
	</header>

	<div
		class="prose prose-neutral dark:prose-invert max-w-none py-8 sm:py-10
			prose-headings:text-foreground prose-headings:tracking-tight
			prose-p:text-foreground/90 prose-p:leading-relaxed
			prose-li:text-foreground/90
			prose-strong:text-foreground prose-strong:font-semibold
			prose-a:text-accent prose-a:no-underline hover:prose-a:underline
			prose-blockquote:text-muted-foreground prose-blockquote:border-accent/30 prose-blockquote:not-italic
			prose-code:text-foreground prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded-md prose-code:text-sm prose-code:before:content-none prose-code:after:content-none
			prose-pre:bg-muted prose-pre:border prose-pre:border-border prose-pre:rounded-lg prose-pre:overflow-x-auto
			prose-hr:border-border
			prose-img:rounded-lg prose-img:shadow-ink
			prose-table:block prose-table:max-w-full prose-table:overflow-x-auto
			prose-th:text-foreground prose-td:text-foreground/90
			prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg"
	>
		{#if !contentComponent}
			<div class="text-center py-12">
				<p class="text-sm text-destructive">Documentation content was not found.</p>
			</div>
		{:else}
			{@const Content = contentComponent}
			<Content />
		{/if}
	</div>

	<hr class="border-border" />

	<div class="py-6 space-y-4">
		<DocsPrevNext prev={data.prev} next={data.next} />

		<a
			href="/docs"
			class="inline-flex min-h-[44px] items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
		>
			<ArrowLeft class="h-4 w-4 shrink-0" aria-hidden="true" />
			All docs
		</a>
	</div>
</article>
