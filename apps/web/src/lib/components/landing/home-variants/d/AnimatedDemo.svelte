<!-- Home C's animation, loaded shortly before it becomes visible. No API requests. -->
<script lang="ts">
	import type { Component } from 'svelte';
	import ErrorBoundary from '$lib/components/ui/ErrorBoundary.svelte';

	let { onyourturn, ctaLabel }: { onyourturn: () => void; ctaLabel?: string } = $props();
	let Demo = $state<Component<{ onyourturn?: () => void; ctaLabel?: string }> | null>(null);
	let failed = $state(false);
	let started = false;

	async function load() {
		if (started) return;
		started = true;
		failed = false;
		try {
			Demo = (await import('../c/BrainDumpDemo.svelte')).default;
		} catch {
			failed = true;
			started = false;
		}
	}

	function loadWhenNear(node: HTMLElement) {
		const observer = new IntersectionObserver(
			([entry]) => {
				if (!entry?.isIntersecting) return;
				observer.disconnect();
				void load();
			},
			{ rootMargin: '400px 0px' }
		);
		observer.observe(node);
		return () => observer.disconnect();
	}
</script>

<div {@attach loadWhenNear}>
	{#if Demo}
		<ErrorBoundary area="home-d-animation"><Demo {onyourturn} {ctaLabel} /></ErrorBoundary>
	{:else}
		<div
			class="flex min-h-[830px] flex-col items-center justify-center rounded-xl border border-border bg-background px-6 text-center sm:min-h-[748px]"
			aria-busy={!failed}
		>
			<p role="status" class="text-base text-muted-foreground">
				{failed ? 'The demo could not load.' : 'Getting the demo ready…'}
			</p>
			{#if failed}<button
					type="button"
					onclick={load}
					class="mt-4 min-h-11 rounded-md border border-border-strong px-4 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>Try again</button
				>{/if}
		</div>
	{/if}
</div>
