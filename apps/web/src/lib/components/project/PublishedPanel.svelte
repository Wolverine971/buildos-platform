<!-- apps/web/src/lib/components/project/PublishedPanel.svelte -->
<!--
	Published — a standalone insight panel showing live public pages for the
	project. Visually matches the insight-rail patterns but runs its own data
	fetch so it doesn't need to plug into the generic insight-panel machinery.

	Data: GET /api/onto/projects/{projectId}/public-pages
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import { ChevronDown, ExternalLink, Globe, Link, LoaderCircle } from 'lucide-svelte';
	import { toastService } from '$lib/stores/toast.store';
	import {
		buildAbsolutePublicPageUrl,
		buildPublicPageUrlPath,
		copyTextToClipboard
	} from '$lib/utils/public-page-url';

	interface PublicPageRow {
		id: string;
		document_id: string;
		slug: string;
		slug_prefix: string | null;
		slug_base: string;
		url_path: string;
		title: string;
		summary: string | null;
		visibility: 'public' | 'unlisted';
		public_status: 'not_public' | 'pending_confirmation' | 'live' | 'unpublished' | 'archived';
		status: string;
		published_at: string | null;
		last_updated_at: string | null;
		view_count_all: number;
		view_count_30d: number;
		live_sync_enabled: boolean;
	}

	interface Props {
		projectId: string;
		expanded?: boolean;
		onOpenDocument?: (documentId: string) => void;
	}

	let { projectId, expanded = true, onOpenDocument }: Props = $props();

	let pages = $state<PublicPageRow[]>([]);
	let loading = $state(false);
	let loaded = $state(false);
	let error = $state<string | null>(null);
	let isExpanded = $state(expanded);

	const liveCount = $derived(pages.filter((p) => p.public_status === 'live').length);

	async function fetchPages() {
		loading = true;
		error = null;
		try {
			const response = await fetch(`/api/onto/projects/${projectId}/public-pages`);
			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to load published pages');
			}
			const data = payload?.data?.pages;
			pages = Array.isArray(data) ? (data as PublicPageRow[]) : [];
			loaded = true;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load published pages';
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		void fetchPages();
	});

	// Expose a refresh entry point for the parent page to call after publish/unpublish.
	export function refresh() {
		void fetchPages();
	}

	function toggleExpanded() {
		isExpanded = !isExpanded;
	}

	async function handleCopyLink(row: PublicPageRow) {
		const absolute = buildAbsolutePublicPageUrl({
			slug: row.slug,
			slug_prefix: row.slug_prefix,
			slug_base: row.slug_base,
			url_path: row.url_path
		});
		if (!absolute) return;
		const ok = await copyTextToClipboard(absolute);
		if (ok) {
			toastService.success('Link copied');
		} else {
			toastService.error('Failed to copy link');
		}
	}

	function handleOpenLive(row: PublicPageRow) {
		const path = buildPublicPageUrlPath({
			slug: row.slug,
			slug_prefix: row.slug_prefix,
			slug_base: row.slug_base,
			url_path: row.url_path
		});
		if (!path || typeof window === 'undefined') return;
		window.open(path, '_blank', 'noopener,noreferrer');
	}

	function formatViews(count: number): string {
		if (count < 1000) return `${count}`;
		if (count < 1_000_000) return `${(count / 1000).toFixed(count < 10_000 ? 1 : 0)}k`;
		return `${(count / 1_000_000).toFixed(1)}M`;
	}
</script>

<section
	class="rounded-lg border border-border bg-card shadow-ink overflow-hidden"
	aria-label="Published public pages"
>
	<button
		type="button"
		onclick={toggleExpanded}
		class="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-accent/5 transition-colors pressable"
		aria-expanded={isExpanded}
	>
		<div class="flex items-center gap-2 min-w-0">
			<Globe class="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
			<span class="text-sm font-semibold text-foreground">Published</span>
			{#if loaded && liveCount > 0}
				<span
					class="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[10px] font-semibold"
				>
					{liveCount}
				</span>
			{/if}
		</div>
		<ChevronDown
			class="w-4 h-4 text-muted-foreground transition-transform duration-150 {isExpanded
				? ''
				: '-rotate-90'}"
		/>
	</button>

	{#if isExpanded}
		<div transition:slide={{ duration: 150 }} class="border-t border-border">
			{#if loading && !loaded}
				<div
					class="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground"
				>
					<LoaderCircle class="w-3.5 h-3.5 animate-spin" />
					Loading…
				</div>
			{:else if error}
				<div class="px-3 py-4 text-xs text-destructive">
					{error}
					<button
						type="button"
						class="ml-2 underline underline-offset-2 hover:text-foreground"
						onclick={fetchPages}
					>
						Retry
					</button>
				</div>
			{:else if pages.length === 0}
				<div class="px-3 py-4 text-xs text-muted-foreground leading-relaxed">
					No public pages yet. Open any document and click
					<span class="font-semibold text-foreground">Share publicly</span> to put it at a
					shareable URL.
				</div>
			{:else}
				<ul class="divide-y divide-border">
					{#each pages as row (row.id)}
						<li class="group relative px-3 py-2 hover:bg-accent/5 transition-colors">
							<div class="flex items-start justify-between gap-2">
								<button
									type="button"
									onclick={() => onOpenDocument?.(row.document_id)}
									class="flex-1 min-w-0 text-left pressable"
								>
									<p class="text-sm font-medium text-foreground truncate">
										{row.title}
									</p>
									<p
										class="mt-0.5 text-[11px] text-muted-foreground font-mono truncate"
									>
										{row.url_path}
									</p>
									<div
										class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground"
									>
										{#if row.public_status !== 'live'}
											<span
												class="inline-flex items-center rounded px-1 py-0.5 bg-amber-500/10 text-amber-800 dark:text-amber-400 font-semibold text-[9px] uppercase tracking-wide"
											>
												{row.public_status.replace('_', ' ')}
											</span>
										{/if}
										{#if row.visibility === 'unlisted'}
											<span
												class="inline-flex items-center rounded px-1 py-0.5 bg-muted/50 text-muted-foreground font-semibold text-[9px] uppercase tracking-wide"
											>
												Unlisted
											</span>
										{/if}
										{#if row.view_count_all > 0}
											<span>{formatViews(row.view_count_all)} views</span>
										{/if}
									</div>
								</button>
								<div
									class="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0"
								>
									<button
										type="button"
										onclick={() => handleCopyLink(row)}
										aria-label="Copy link"
										title="Copy link"
										class="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent/10 hover:text-foreground transition-colors"
									>
										<Link class="w-3.5 h-3.5" />
									</button>
									<button
										type="button"
										onclick={() => handleOpenLive(row)}
										aria-label="Open public page"
										title="Open public page"
										class="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent/10 hover:text-foreground transition-colors"
									>
										<ExternalLink class="w-3.5 h-3.5" />
									</button>
								</div>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</section>

<style>
	/* Always show row actions on touch devices (hover states don't apply) */
	@media (hover: none) {
		section :global(.group button[aria-label='Copy link']),
		section :global(.group button[aria-label='Open public page']) {
			opacity: 1 !important;
		}
	}
</style>
