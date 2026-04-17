<!-- apps/web/src/lib/components/public-page/AuthorIndex.svelte -->
<!--
	Stub author-index page: renders when someone visits /p/{user_name}
	without a slug_base. Lists the author's live public documents.

	Intentionally minimal in Phase 1 — full aggregation + styling lives in
	a later phase (the public gallery at /gallery or /showcase).
-->
<script lang="ts">
	import { FileText } from 'lucide-svelte';

	interface AuthorIndexPage {
		id: string;
		slug: string;
		slug_prefix: string | null;
		slug_base: string;
		url_path: string;
		title: string;
		summary: string | null;
		published_at: string | null;
		last_updated_at: string | null;
		view_count_all: number;
		project_name: string | null;
	}

	interface AuthorIndexData {
		author: {
			slug_prefix: string;
			name: string | null;
			page_count: number;
		};
		pages: AuthorIndexPage[];
	}

	interface Props {
		data: AuthorIndexData;
	}

	let { data }: Props = $props();
	const author = data.author;
	const pages = data.pages;

	const displayName = author.name || author.slug_prefix;
	const initials = (displayName || '?')
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((p) => p[0]?.toUpperCase() ?? '')
		.join('');

	function formatDate(iso: string | null): string | null {
		if (!iso) return null;
		return new Date(iso).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	function formatViews(count: number): string {
		if (count < 1000) return `${count}`;
		if (count < 1_000_000) return `${(count / 1000).toFixed(count < 10_000 ? 1 : 0)}k`;
		return `${(count / 1_000_000).toFixed(1)}M`;
	}
</script>

<main class="min-h-screen rounded-lg bg-card">
	<div class="mx-auto px-4 py-6 sm:px-8 sm:py-10">
		<header class="mb-8 flex items-center gap-3">
			<span
				aria-hidden="true"
				class="inline-flex h-10 w-10 items-center justify-center rounded-full bg-accent/15 text-accent text-sm font-bold shrink-0"
			>
				{initials || '?'}
			</span>
			<div>
				<h1 class="text-xl font-bold leading-tight text-foreground sm:text-2xl">
					{displayName}
				</h1>
				<p class="text-[12px] text-muted-foreground mt-0.5">
					{author.page_count}
					{author.page_count === 1 ? 'public page' : 'public pages'}
				</p>
			</div>
		</header>

		<ul class="divide-y divide-border border-y border-border">
			{#each pages as page (page.id)}
				<li>
					<a
						href={page.url_path}
						class="flex items-start gap-3 px-3 py-4 hover:bg-accent/5 transition-colors"
					>
						<FileText class="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
						<div class="min-w-0 flex-1">
							<p class="text-sm font-semibold text-foreground truncate">
								{page.title}
							</p>
							{#if page.summary}
								<p class="text-[12px] text-muted-foreground mt-0.5 line-clamp-2">
									{page.summary}
								</p>
							{/if}
							<div
								class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground"
							>
								{#if page.project_name}
									<span>{page.project_name}</span>
									<span class="text-border text-xs">·</span>
								{/if}
								{#if page.published_at}
									<span>{formatDate(page.published_at)}</span>
								{/if}
								{#if page.view_count_all >= 10}
									<span class="text-border text-xs">·</span>
									<span>{formatViews(page.view_count_all)} views</span>
								{/if}
							</div>
						</div>
					</a>
				</li>
			{/each}
		</ul>

		<footer class="mt-8 border-t border-border pt-4 pb-2">
			<a
				href="https://build-os.com/?utm_source=author-index&utm_medium=attribution&utm_campaign=made-with"
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
		</footer>
	</div>
</main>
