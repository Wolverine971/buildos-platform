<!-- apps/web/src/routes/(public)/p/[slug]/+page.svelte -->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import SEOHead from '$lib/components/SEOHead.svelte';
	import { getProseClasses, renderMarkdown } from '$lib/utils/markdown';
	import OwnerBar from '$lib/components/public-page/OwnerBar.svelte';
	import AuthorIndex from '$lib/components/public-page/AuthorIndex.svelte';
	import PublicPageComments from '$lib/components/public-page/PublicPageComments.svelte';

	let { data } = $props();

	// Early branch: this slug is actually a username-only URL (/p/{user_name})
	// and we're rendering the author's public-pages index instead of a page.
	const authorIndexData = data.authorIndex;

	const page = data.page;
	const currentUser = data.currentUser ?? null;
	const signInHref =
		typeof window !== 'undefined'
			? `/signup?return_to=${encodeURIComponent(window.location.pathname)}`
			: '/signup';

	const title = page?.title || 'Public Page';
	const description = page?.summary || page?.description || 'Public page from BuildOS';
	const canonical = page
		? `https://build-os.com${page.url_path || `/p/${page.slug}`}`
		: 'https://build-os.com';
	const updatedAt = page?.last_updated_at || page?.published_at;
	const viewCount = typeof page?.view_count_all === 'number' ? page.view_count_all : 0;
	const authorInitials = (page?.author_name || page?.author_slug_prefix || '?')
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part: string) => part[0]?.toUpperCase() ?? '')
		.join('');

	// Scroll to hash + log a view (fire-and-forget; server filters crawlers & dedups)
	onMount(async () => {
		if (!page) return;
		const hash = window.location.hash;
		if (hash) {
			await tick();
			const el = document.querySelector(hash);
			el?.scrollIntoView({ behavior: 'smooth' });
		}
		void logView();
	});

	function formatViews(count: number): string {
		if (count < 1000) return `${count}`;
		if (count < 1_000_000) return `${(count / 1000).toFixed(count < 10_000 ? 1 : 0)}k`;
		return `${(count / 1_000_000).toFixed(1)}M`;
	}

	async function logView() {
		if (!page) return;
		if (typeof navigator !== 'undefined' && (navigator as any).doNotTrack === '1') return;
		try {
			await fetch(`/api/public/pages/${page.slug}/view`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'same-origin',
				body: '{}',
				keepalive: true
			});
		} catch {
			// View logging is best-effort; never block the page on it.
		}
	}

	const formattedDate = updatedAt
		? new Date(updatedAt).toLocaleDateString('en-US', {
				year: 'numeric',
				month: 'long',
				day: 'numeric'
			})
		: null;
</script>

{#if authorIndexData}
	<AuthorIndex data={authorIndexData} />
{:else if page}
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
			{#if page.is_author}
				<OwnerBar {page} />
			{/if}

			<!-- Header -->
			<header class="mb-6">
				{#if page.author_name || page.author_slug_prefix}
					<div class="mb-3 flex items-center gap-2">
						<span
							aria-hidden="true"
							class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-accent/15 text-accent text-[11px] font-bold shrink-0"
						>
							{authorInitials || '?'}
						</span>
						<div class="min-w-0 flex-1">
							{#if page.author_slug_prefix}
								<a
									href={`/p/${page.author_slug_prefix}`}
									class="block text-sm font-semibold text-foreground hover:text-accent transition-colors truncate"
								>
									{page.author_name || page.author_slug_prefix}
								</a>
							{:else if page.author_name}
								<p class="text-sm font-semibold text-foreground truncate">
									{page.author_name}
								</p>
							{/if}
							{#if formattedDate}
								<p class="text-[11px] text-muted-foreground">{formattedDate}</p>
							{/if}
						</div>
					</div>
				{:else if formattedDate}
					<div class="mb-2">
						<span class="micro-label">{formattedDate}</span>
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

			{#if page.document_id && page.project_id}
				<PublicPageComments
					projectId={page.project_id}
					documentId={page.document_id}
					isAuthor={page.is_author === true}
					{currentUser}
					{signInHref}
				/>
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
					{#if viewCount >= 10}
						<span class="text-border text-xs">·</span>
						<span
							class="micro-label text-muted-foreground"
							title={`${viewCount.toLocaleString()} views`}
						>
							{formatViews(viewCount)} views
						</span>
					{/if}
				</div>
			</footer>
		</div>
	</main>
{/if}

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
