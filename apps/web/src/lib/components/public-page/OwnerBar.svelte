<!-- apps/web/src/lib/components/public-page/OwnerBar.svelte -->
<!--
	Author-only action bar rendered at the top of a public page when the
	signed-in viewer is the author. Invisible to everyone else.

	Desktop: inline sticky bar with all actions.
	Mobile: status pill + three-dot overflow that opens a bottom sheet.
-->
<script lang="ts">
	import { ArrowLeft, ExternalLink, Globe, Link, MoreHorizontal, Pencil, X } from 'lucide-svelte';
	import { toastService } from '$lib/stores/toast.store';
	import { buildAbsolutePublicPageUrl, copyTextToClipboard } from '$lib/utils/public-page-url';

	interface OwnerBarPage {
		id: string;
		slug: string;
		slug_prefix: string | null;
		slug_base: string;
		url_path: string;
		project_id: string;
		document_id: string;
		public_status: 'not_public' | 'pending_confirmation' | 'live' | 'unpublished' | 'archived';
		visibility: 'public' | 'unlisted';
		live_sync_enabled: boolean;
		view_count_all: number;
	}

	interface Props {
		page: OwnerBarPage;
	}

	let { page }: Props = $props();

	let mobileSheetOpen = $state(false);
	let actionLoading = $state(false);
	let currentPage = $state<OwnerBarPage>({ ...page });
	// Re-sync when the parent passes new data (e.g. after toggle).
	$effect(() => {
		currentPage = { ...page };
	});

	const statusLabel = $derived.by(() => {
		if (currentPage.public_status === 'live') {
			return currentPage.visibility === 'unlisted' ? 'Unlisted' : 'Live';
		}
		if (currentPage.public_status === 'unpublished') return 'Unpublished';
		if (currentPage.public_status === 'pending_confirmation') return 'Pending';
		if (currentPage.public_status === 'archived') return 'Archived';
		return currentPage.public_status;
	});

	const statusColor = $derived.by(() => {
		if (currentPage.public_status === 'live') {
			return currentPage.visibility === 'unlisted'
				? 'bg-muted/70 text-muted-foreground'
				: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-400';
		}
		if (currentPage.public_status === 'unpublished')
			return 'bg-rose-500/10 text-rose-800 dark:text-rose-400';
		if (currentPage.public_status === 'pending_confirmation')
			return 'bg-amber-500/15 text-amber-800 dark:text-amber-400';
		return 'bg-muted/70 text-muted-foreground';
	});

	async function handleCopyLink() {
		const absolute = buildAbsolutePublicPageUrl({
			slug: currentPage.slug,
			slug_prefix: currentPage.slug_prefix,
			slug_base: currentPage.slug_base,
			url_path: currentPage.url_path
		});
		if (!absolute) return;
		const ok = await copyTextToClipboard(absolute);
		if (ok) {
			toastService.success('Link copied');
		} else {
			toastService.error('Failed to copy link');
		}
	}

	function handleEditOriginal() {
		if (typeof window === 'undefined') return;
		const href = `/projects/${currentPage.project_id}?doc=${currentPage.document_id}&openPublish=true`;
		window.location.href = href;
	}

	function handleOpenInProject() {
		if (typeof window === 'undefined') return;
		const href = `/projects/${currentPage.project_id}?doc=${currentPage.document_id}`;
		window.location.href = href;
	}

	async function handleToggleLiveSync() {
		if (actionLoading) return;
		const nextEnabled = !currentPage.live_sync_enabled;
		actionLoading = true;
		try {
			const res = await fetch(
				`/api/onto/documents/${currentPage.document_id}/public-page/live-sync`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ live_sync_enabled: nextEnabled })
				}
			);
			const payload = await res.json().catch(() => null);
			if (!res.ok) {
				throw new Error(payload?.error || 'Failed to update live sync');
			}
			currentPage = { ...currentPage, live_sync_enabled: nextEnabled };
			toastService.success(nextEnabled ? 'Live sync enabled' : 'Live sync paused');
		} catch (e) {
			toastService.error(e instanceof Error ? e.message : 'Failed to update live sync');
		} finally {
			actionLoading = false;
		}
	}

	async function handleUnpublish() {
		if (actionLoading) return;
		const confirmed =
			typeof window !== 'undefined'
				? window.confirm(
						'Unpublish this page? The public link will 404. You can republish at the same URL any time.'
					)
				: true;
		if (!confirmed) return;
		actionLoading = true;
		try {
			const res = await fetch(
				`/api/onto/documents/${currentPage.document_id}/public-page/unpublish`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' }
				}
			);
			const payload = await res.json().catch(() => null);
			if (!res.ok) {
				throw new Error(payload?.error || 'Failed to unpublish page');
			}
			toastService.success('Unpublished. The link will now 404.');
			// Redirect the author to the project page; the public URL is about
			// to 404, no point in keeping them here.
			if (typeof window !== 'undefined') {
				setTimeout(() => {
					window.location.href = `/projects/${currentPage.project_id}?doc=${currentPage.document_id}`;
				}, 500);
			}
		} catch (e) {
			toastService.error(e instanceof Error ? e.message : 'Failed to unpublish page');
		} finally {
			actionLoading = false;
		}
	}
</script>

<aside
	aria-label="Author controls"
	class="sticky top-0 z-30 -mx-4 mb-4 border-b border-border bg-card/95 backdrop-blur-sm sm:-mx-8"
>
	<div class="mx-auto flex items-center gap-2 px-4 py-2 sm:px-8">
		<!-- Status pill -->
		<span
			class={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusColor}`}
		>
			<Globe class="w-2.5 h-2.5" />
			{statusLabel}
		</span>

		{#if currentPage.view_count_all > 0}
			<span class="hidden sm:inline text-[11px] text-muted-foreground">
				{currentPage.view_count_all.toLocaleString()} views
			</span>
		{/if}

		<div class="flex-1"></div>

		<!-- Desktop: inline actions -->
		<div class="hidden sm:flex items-center gap-1">
			<button
				type="button"
				onclick={handleCopyLink}
				class="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:bg-accent/10 transition-colors pressable"
			>
				<Link class="w-3 h-3" />
				Copy link
			</button>
			<button
				type="button"
				onclick={handleEditOriginal}
				class="inline-flex min-h-[32px] items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-foreground hover:bg-accent/10 transition-colors pressable"
			>
				<Pencil class="w-3 h-3" />
				Edit original
			</button>
			<button
				type="button"
				onclick={handleOpenInProject}
				class="inline-flex min-h-[32px] items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-foreground hover:bg-accent/10 transition-colors pressable"
			>
				<ArrowLeft class="w-3 h-3" />
				View in project
			</button>
			{#if currentPage.public_status === 'live'}
				<button
					type="button"
					onclick={handleToggleLiveSync}
					disabled={actionLoading}
					class="inline-flex min-h-[32px] items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium hover:bg-accent/10 transition-colors pressable disabled:opacity-50 {currentPage.live_sync_enabled
						? 'text-emerald-800 dark:text-emerald-400'
						: 'text-muted-foreground'}"
				>
					Live sync {currentPage.live_sync_enabled ? 'on' : 'off'}
				</button>
				<button
					type="button"
					onclick={handleUnpublish}
					disabled={actionLoading}
					class="inline-flex min-h-[32px] items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-rose-800 dark:text-rose-400 hover:bg-rose-500/10 transition-colors pressable disabled:opacity-50"
				>
					Unpublish
				</button>
			{/if}
		</div>

		<!-- Mobile: overflow trigger -->
		<button
			type="button"
			onclick={() => (mobileSheetOpen = true)}
			aria-label="Owner actions"
			class="sm:hidden inline-flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-accent/10 transition-colors pressable"
		>
			<MoreHorizontal class="w-4 h-4" />
		</button>
	</div>
</aside>

<!-- Mobile bottom sheet -->
{#if mobileSheetOpen}
	<div
		role="dialog"
		aria-modal="true"
		aria-label="Owner actions"
		class="fixed inset-0 z-50 sm:hidden"
	>
		<button
			type="button"
			aria-label="Close actions"
			class="absolute inset-0 bg-black/40"
			onclick={() => (mobileSheetOpen = false)}
		></button>
		<div
			class="absolute inset-x-0 bottom-0 rounded-t-xl bg-card border-t border-border shadow-ink-strong overflow-hidden"
			style="padding-bottom: env(safe-area-inset-bottom);"
		>
			<div class="flex items-center justify-between border-b border-border px-4 py-3">
				<p class="text-sm font-semibold text-foreground">Owner actions</p>
				<button
					type="button"
					onclick={() => (mobileSheetOpen = false)}
					class="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent/10 transition-colors"
					aria-label="Close"
				>
					<X class="w-4 h-4" />
				</button>
			</div>
			<div class="flex flex-col">
				<button
					type="button"
					onclick={() => {
						mobileSheetOpen = false;
						void handleCopyLink();
					}}
					class="flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-accent/10 transition-colors"
				>
					<Link class="w-4 h-4" />
					Copy link
				</button>
				<button
					type="button"
					onclick={() => {
						mobileSheetOpen = false;
						handleEditOriginal();
					}}
					class="flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-accent/10 transition-colors"
				>
					<Pencil class="w-4 h-4" />
					Edit original
				</button>
				<button
					type="button"
					onclick={() => {
						mobileSheetOpen = false;
						handleOpenInProject();
					}}
					class="flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-accent/10 transition-colors"
				>
					<ArrowLeft class="w-4 h-4" />
					View in project
				</button>
				<button
					type="button"
					onclick={() => {
						if (typeof window !== 'undefined') {
							window.open(currentPage.url_path, '_blank', 'noopener,noreferrer');
						}
						mobileSheetOpen = false;
					}}
					class="flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-accent/10 transition-colors"
				>
					<ExternalLink class="w-4 h-4" />
					Open in new tab
				</button>
				{#if currentPage.public_status === 'live'}
					<button
						type="button"
						onclick={() => {
							mobileSheetOpen = false;
							void handleToggleLiveSync();
						}}
						disabled={actionLoading}
						class="flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-accent/10 transition-colors disabled:opacity-50"
					>
						<Globe class="w-4 h-4" />
						Live sync {currentPage.live_sync_enabled
							? 'on (tap to pause)'
							: 'off (tap to enable)'}
					</button>
					<button
						type="button"
						onclick={() => {
							mobileSheetOpen = false;
							void handleUnpublish();
						}}
						disabled={actionLoading}
						class="flex items-center gap-3 px-4 py-3 text-sm text-rose-800 dark:text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-50 border-t border-border"
					>
						<X class="w-4 h-4" />
						Unpublish
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}
