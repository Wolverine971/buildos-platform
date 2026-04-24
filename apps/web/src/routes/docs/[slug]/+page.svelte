<!-- apps/web/src/routes/docs/[slug]/+page.svelte -->
<script lang="ts">
	import type { ComponentType } from 'svelte';
	import { ArrowLeft, Clock, History } from 'lucide-svelte';
	import SEOHead from '$lib/components/SEOHead.svelte';
	import DocsPrevNext from '$lib/components/docs/DocsPrevNext.svelte';
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
</script>

<SEOHead
	title="{data.doc.title} — BuildOS Docs"
	description={data.doc.summary}
	canonical="https://build-os.com/docs/{data.doc.slug}"
	keywords="BuildOS, {data.doc.title.toLowerCase()}, thinking environment, project memory, structured work, documentation"
/>

<article>
	<!-- Breadcrumb -->
	<nav
		class="flex items-center gap-1.5 text-xs text-muted-foreground mb-4"
		aria-label="Breadcrumb"
	>
		<a href="/docs" class="hover:text-accent transition-colors">Docs</a>
		<span aria-hidden="true">/</span>
		<span class="text-foreground">{data.doc.title}</span>
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

		<div class="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
			{#if data.doc.lastUpdated}
				<span class="flex items-center gap-1">
					<History class="w-3 h-3" />
					Updated {data.doc.lastUpdated}
				</span>
			{/if}
			<span class="flex items-center gap-1">
				<Clock class="w-3 h-3" />
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
			prose-code:text-foreground prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:before:content-none prose-code:after:content-none
			prose-pre:bg-muted prose-pre:border prose-pre:border-border prose-pre:rounded-lg
			prose-hr:border-border
			prose-img:rounded-lg prose-img:shadow-ink
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
			class="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-accent transition-colors"
		>
			<ArrowLeft class="w-3 h-3" />
			All docs
		</a>
	</div>
</article>
