<!-- apps/web/src/routes/(public)/p/[slug]/+page.svelte -->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import SEOHead from '$lib/components/SEOHead.svelte';
	import { getProseClasses, renderMarkdown } from '$lib/utils/markdown';

	let { data } = $props();

	// Scroll to hash anchor on page load (SvelteKit renders after hydration)
	onMount(async () => {
		const hash = window.location.hash;
		if (hash) {
			await tick();
			const el = document.querySelector(hash);
			el?.scrollIntoView({ behavior: 'smooth' });
		}
	});
	const page = data.page;

	const title = page.title || 'Public Page';
	const description = page.summary || page.description || 'Public page from BuildOS';
	const canonical = `https://build-os.com${page.url_path || `/p/${page.slug}`}`;
	const updatedAt = page.last_updated_at || page.published_at;

	const formattedDate = updatedAt
		? new Date(updatedAt).toLocaleDateString('en-US', {
				year: 'numeric',
				month: 'long',
				day: 'numeric'
			})
		: null;
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

<main class="min-h-screen rounded-lg bg-card">
	<div class="mx-auto px-4 py-6 sm:px-8 sm:py-10">
		<!-- Header -->
		<header class="mb-6">
			{#if page.author_name || formattedDate}
				<div class="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
					{#if page.author_name}
						<span class="micro-label text-accent">{page.author_name}</span>
					{/if}
					{#if page.author_name && formattedDate}
						<span class="text-border text-xs">·</span>
					{/if}
					{#if formattedDate}
						<span class="micro-label">{formattedDate}</span>
					{/if}
				</div>
			{/if}
			<h1 class="text-xl font-bold leading-tight text-foreground sm:text-2xl">
				{title}
			</h1>
			{#if description}
				<p class="mt-1.5 text-sm leading-relaxed text-muted-foreground">
					{description}
				</p>
			{/if}
		</header>

		<hr class="border-border mb-6" />

		<!-- Article body -->
		<div
			class="{getProseClasses('base')}
				prose-p:text-sm prose-p:leading-relaxed sm:prose-p:text-base sm:prose-p:leading-[1.75]
				prose-li:text-sm prose-li:leading-relaxed sm:prose-li:text-base sm:prose-li:leading-[1.75]
				prose-blockquote:border-l-2 prose-blockquote:pl-4
				prose-img:rounded-lg prose-img:border prose-img:border-border prose-img:shadow-ink"
		>
			{@html renderMarkdown(page.content)}
		</div>

		<!-- Citations -->
		{#if Array.isArray(page.citations) && page.citations.length > 0}
			<section class="mt-8 border-t border-border pt-4">
				<p class="micro-label text-muted-foreground mb-2">SOURCES</p>
				<ol class="space-y-1.5">
					{#each page.citations as citation, index}
						<li class="flex items-baseline gap-2 text-sm">
							<span class="text-xs text-muted-foreground tabular-nums shrink-0">
								{index + 1}.
							</span>
							<a
								class="text-accent underline underline-offset-2 decoration-accent/30
									hover:decoration-accent transition-colors break-all"
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
				</ol>
			</section>
		{/if}

		<!-- Footer -->
		<footer class="mt-8 border-t border-border pt-4 pb-2">
			<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
				{#if page.project_name}
					<span class="micro-label">{page.project_name}</span>
					<span class="text-border text-xs">·</span>
				{/if}
				<a
					href="https://build-os.com/?utm_source=public-page&utm_medium=attribution&utm_campaign=made-with"
					target="_blank"
					rel="noopener"
					class="group inline-flex items-center gap-1.5 text-[11px] font-medium tracking-wide uppercase text-muted-foreground hover:text-foreground transition-colors"
				>
					<span
						aria-hidden="true"
						class="inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm bg-foreground text-[8px] font-bold leading-none text-background group-hover:bg-accent transition-colors"
					>
						B
					</span>
					<span>Made with BuildOS</span>
				</a>
			</div>
		</footer>
	</div>
</main>

<style>
	/* Offset anchors so headings don't hide behind the top edge */
	main :global(h1[id]),
	main :global(h2[id]),
	main :global(h3[id]),
	main :global(h4[id]),
	main :global(h5[id]),
	main :global(h6[id]) {
		scroll-margin-top: 1.5rem;
	}
</style>
