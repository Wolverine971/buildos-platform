<!-- apps/web/src/lib/components/landing/home-variants/a/LiveProject.svelte -->
<!--
  Homepage A: the live, read-only Fading Crown project (PublicProjectView). The component and
  its two API calls load only when this section comes near the viewport, so the page's first
  screen makes no requests for it.
-->
<script lang="ts">
	import type { Component } from 'svelte';
	import ErrorBoundary from '$lib/components/ui/ErrorBoundary.svelte';
	import { FADING_CROWN_PROJECT_ID } from '../fading-crown';

	type PublicProjectViewProps = { initialProjectId?: string; embedded?: boolean };

	let LiveProjectView = $state<Component<PublicProjectViewProps> | null>(null);
	let loadFailed = $state(false);
	let loadStarted = false;

	async function loadLiveProject() {
		if (loadStarted) return;
		loadStarted = true;
		try {
			const module = await import(
				'$lib/components/landing/public-project-preview/PublicProjectView.svelte'
			);
			LiveProjectView = module.default as Component<PublicProjectViewProps>;
		} catch (error) {
			console.error('[HomeVariantA] Failed to load the live example project:', error);
			loadFailed = true;
			loadStarted = false;
		}
	}

	function retry() {
		loadFailed = false;
		void loadLiveProject();
	}

	/** Starts loading once the section is within a screen or so of the viewport. */
	function loadWhenNear(node: HTMLElement) {
		if (typeof IntersectionObserver === 'undefined') {
			void loadLiveProject();
			return;
		}
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					observer.disconnect();
					void loadLiveProject();
				}
			},
			{ rootMargin: '600px 0px' }
		);
		observer.observe(node);
		return () => observer.disconnect();
	}
</script>

<div
	{@attach loadWhenNear}
	class="overflow-hidden rounded-lg border border-border bg-card shadow-ink"
>
	{#if LiveProjectView}
		<ErrorBoundary area="home-a-live-project">
			<LiveProjectView initialProjectId={FADING_CROWN_PROJECT_ID} embedded />
		</ErrorBoundary>
	{:else if loadFailed}
		<div class="px-5 py-16 text-center">
			<p class="text-sm text-muted-foreground">The example project didn't load.</p>
			<button
				type="button"
				onclick={retry}
				class="mt-3 inline-flex min-h-11 items-center rounded-md border border-border-strong bg-background px-4 text-sm font-semibold text-foreground hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				Try again
			</button>
		</div>
	{:else}
		<div class="space-y-5 p-5 sm:p-6" aria-busy="true" aria-label="Loading example project">
			<div class="space-y-2">
				<div
					class="h-6 w-48 rounded bg-muted animate-pulse motion-reduce:animate-none"
				></div>
				<div
					class="h-4 w-full max-w-xl rounded bg-muted/70 animate-pulse motion-reduce:animate-none"
				></div>
			</div>
			<div class="grid gap-3 sm:grid-cols-3">
				<div
					class="h-24 rounded-md bg-muted/60 animate-pulse motion-reduce:animate-none"
				></div>
				<div
					class="h-24 rounded-md bg-muted/60 animate-pulse motion-reduce:animate-none"
				></div>
				<div
					class="h-24 rounded-md bg-muted/60 animate-pulse motion-reduce:animate-none"
				></div>
			</div>
			<div class="h-48 rounded-md bg-muted/50 animate-pulse motion-reduce:animate-none"></div>
		</div>
	{/if}
</div>
