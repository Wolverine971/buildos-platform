<!-- apps/web/src/routes/(public)/p/[slug]/+page.svelte -->
<script lang="ts">
	import SEOHead from '$lib/components/SEOHead.svelte';
	import { getProseClasses, renderMarkdown } from '$lib/utils/markdown';

	let { data } = $props();
	const page = data.page;

	const title = page.title || 'Public Page';
	const description = page.summary || page.description || 'Public page from BuildOS';
	const canonical = `https://build-os.com/p/${page.slug}`;
	const updatedAt = page.last_updated_at || page.published_at;
</script>

<SEOHead
	{title}
	{description}
	{canonical}
	ogType="article"
	noindex={page.noindex === true}
	jsonLd={{
		'@context': 'https://schema.org',
		'@type': 'Article',
		headline: title,
		description,
		url: canonical,
		datePublished: page.published_at || undefined,
		dateModified: updatedAt || undefined,
		author: page.author_name ? { '@type': 'Person', name: page.author_name } : undefined
	}}
/>

<main class="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
	<header class="mb-6 border-b border-border pb-4">
		<h1 class="text-3xl font-bold text-foreground">{title}</h1>
		{#if description}
			<p class="mt-2 text-sm text-muted-foreground">{description}</p>
		{/if}
	</header>

	<article class={getProseClasses('base')}>
		{@html renderMarkdown(page.content)}
	</article>

	{#if Array.isArray(page.citations) && page.citations.length > 0}
		<section class="mt-8 border-t border-border pt-4">
			<h2 class="text-base font-semibold text-foreground">Sources</h2>
			<ul class="mt-2 space-y-1 text-sm text-muted-foreground">
				{#each page.citations as citation, index}
					<li>
						<a
							class="text-accent underline underline-offset-2"
							href={citation.url}
							target="_blank"
							rel="noopener noreferrer"
						>
							{citation.label ||
								citation.title ||
								citation.url ||
								`Source ${index + 1}`}
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<footer class="mt-10 border-t border-border pt-4 text-xs text-muted-foreground space-y-1">
		{#if page.author_name}
			<p>Created by {page.author_name}</p>
		{/if}
		{#if updatedAt}
			<p>Last updated {new Date(updatedAt).toLocaleString()}</p>
		{/if}
		{#if page.project_name}
			<p>From project {page.project_name}</p>
		{/if}
	</footer>
</main>
