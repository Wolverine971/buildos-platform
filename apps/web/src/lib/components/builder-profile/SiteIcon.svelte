<!-- apps/web/src/lib/components/builder-profile/SiteIcon.svelte -->
<!-- A website's own icon in a small tile (via /api/public/site-icon), or the first
     letter of its name when the site has none or the icon fails to load. -->
<script lang="ts">
	import { onMount } from 'svelte';

	let {
		url,
		label,
		size = 'md'
	}: {
		url: string | null | undefined;
		/** The name the letter tile falls back to. */
		label: string;
		size?: 'sm' | 'md' | 'lg';
	} = $props();

	function hostOf(value: string | null | undefined): string | null {
		if (!value) return null;
		try {
			const parsed = new URL(value);
			if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
			return parsed.hostname.toLowerCase().replace(/^www\./, '');
		} catch {
			return null;
		}
	}

	const host = $derived(hostOf(url));
	let failed = $state(false);
	let img = $state<HTMLImageElement | null>(null);

	const box = $derived(
		size === 'sm'
			? 'h-6 w-6 rounded-md'
			: size === 'lg'
				? 'h-12 w-12 rounded-xl'
				: 'h-9 w-9 rounded-lg'
	);
	const glyph = $derived(size === 'sm' ? 14 : size === 'lg' ? 28 : 20);

	onMount(() => {
		// An icon that failed before the page hydrated never fired our error handler.
		if (img && img.complete && img.naturalWidth === 0) failed = true;
	});
</script>

{#if host && !failed}
	<span
		class="grid shrink-0 place-items-center border border-border bg-white {box}"
		aria-hidden="true"
	>
		<img
			bind:this={img}
			src="/api/public/site-icon?host={encodeURIComponent(host)}"
			alt=""
			width={glyph}
			height={glyph}
			loading="lazy"
			decoding="async"
			onerror={() => (failed = true)}
		/>
	</span>
{:else}
	<span
		class="grid shrink-0 place-items-center bg-muted font-semibold uppercase text-foreground {box} {size ===
		'sm'
			? 'text-2xs'
			: size === 'lg'
				? 'text-lg'
				: 'text-sm'}"
		aria-hidden="true">{label.trim().slice(0, 1) || '·'}</span
	>
{/if}
