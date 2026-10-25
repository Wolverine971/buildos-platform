<!-- apps/web/src/lib/components/builder-profile/YourPageCard.svelte -->
<!-- Profile > People & agents > Your page: a small summary of build-os.com/@handle
     (photo, status, what's on it) with a way into the editor at /profile/page. -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { ExternalLink, Globe, Pencil } from '$lib/icons/lucide';
	import SettingsCard from '$lib/components/profile/_shared/SettingsCard.svelte';
	import type { BuilderProfileView } from '$lib/builder-profile/types';
	import { initialsOf } from '$lib/builder-profile/format';

	let view = $state<BuilderProfileView | null>(null);
	let origin = $state('');
	let loading = $state(true);

	const live = $derived(view?.status === 'published');
	const address = $derived.by(() => {
		if (!view) return null;
		try {
			return `${new URL(origin).host}/@${view.profile.handle}`;
		} catch {
			return `build-os.com/@${view.profile.handle}`;
		}
	});
	const summary = $derived.by(() => {
		if (!view) return '';
		const parts = [
			`${view.projects.length} project${view.projects.length === 1 ? '' : 's'}`,
			`${view.links.length} link${view.links.length === 1 ? '' : 's'}`
		];
		if (live && view.stats) parts.push(`${view.stats.views_7d} views this week`);
		return parts.join(' · ');
	});

	onMount(async () => {
		try {
			const res = await fetch('/api/profile/builder/preview', { credentials: 'same-origin' });
			const payload = await res.json().catch(() => null);
			view = payload?.data?.view ?? null;
			origin = payload?.data?.origin ?? window.location.origin;
		} finally {
			loading = false;
		}
	});
</script>

<SettingsCard
	title="Your page"
	description="A public page for you and what you're building. Private until you publish."
	icon={Globe}
	labelledById="hub-your-page-heading"
>
	{#if loading}
		<div
			class="h-[76px] animate-pulse rounded-xl bg-muted motion-reduce:animate-none"
			aria-busy="true"
		></div>
	{:else}
		<div
			class="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3 sm:flex-nowrap"
		>
			{#if view?.profile.avatar_url}
				<img
					src={view.profile.avatar_url}
					alt=""
					referrerpolicy="no-referrer"
					class="h-12 w-12 shrink-0 rounded-full bg-muted object-cover"
				/>
			{:else}
				<span
					class="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-foreground text-sm font-semibold text-background"
					aria-hidden="true"
					>{view ? initialsOf(view.profile.name, view.profile.handle) : '@'}</span
				>
			{/if}
			<div class="min-w-0 flex-1">
				{#if view}
					<div class="flex items-center gap-2">
						<p class="truncate text-sm font-semibold text-foreground">{address}</p>
						<span
							class="inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px text-2xs font-semibold {live
								? 'border-success/50 text-success'
								: 'border-border-strong text-muted-foreground'}"
							>{live ? 'Live' : 'Draft'}</span
						>
					</div>
					<p class="mt-0.5 truncate text-xs text-muted-foreground">{summary}</p>
				{:else}
					<p class="text-sm font-semibold text-foreground">Make your page</p>
					<p class="mt-0.5 text-xs text-muted-foreground">
						Your links, socials and the projects you choose, at build-os.com/@you.
					</p>
				{/if}
			</div>
			<div class="flex w-full items-center gap-2 sm:w-auto">
				<a
					href="/profile/page"
					class="tx-button tx-button-accent inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-md px-3.5 text-sm font-semibold sm:flex-none"
					><Pencil class="h-4 w-4" aria-hidden="true" />{view
						? 'Edit page'
						: 'Set it up'}</a
				>
				{#if view}
					<a
						href="/@{view.profile.handle}"
						target="_blank"
						rel="noopener"
						class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border-strong bg-background text-foreground hover:bg-muted"
						aria-label="Open your page in a new tab"
						><ExternalLink class="h-4 w-4" aria-hidden="true" /></a
					>
				{/if}
			</div>
		</div>
	{/if}
</SettingsCard>
