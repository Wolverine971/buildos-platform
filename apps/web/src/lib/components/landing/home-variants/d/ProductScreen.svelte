<!-- Real, theme-matched product captures. Phones get a phone capture when one exists;
     otherwise narrow screens pan the desktop capture or open the original. -->
<script lang="ts">
	import { Maximize2 } from '$lib/icons/lucide';

	type PhoneCapture = { name: string; width: number; height: number };

	let {
		name,
		alt,
		width,
		height,
		caption,
		eager = false,
		minimumWidth = 640,
		dir = '/home/d',
		ext = 'png',
		phone
	}: {
		name: string;
		alt: string;
		width: number;
		height: number;
		caption: string;
		eager?: boolean;
		minimumWidth?: number;
		/** Folder and file type of the captures. D's are 2x PNGs in /home/d. */
		dir?: string;
		ext?: string;
		/** A 390px-wide capture shown below 640px instead of panning the desktop one. */
		phone?: PhoneCapture;
	} = $props();

	const PHONE_MEDIA = '(max-width: 639px)';
	const themes = [
		{ scheme: 'light', imgClass: 'dark:hidden' },
		{ scheme: 'dark', imgClass: 'hidden dark:block' }
	] as const;
</script>

<figure class="min-w-0">
	<!-- Keyboard users focus the overflow region to pan the screenshot with arrow keys. -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<div
		role="region"
		aria-label={`${caption}. Scroll horizontally to explore the screenshot.`}
		tabindex="0"
		class="overflow-x-auto overscroll-x-contain rounded-lg border border-border bg-background shadow-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
	>
		<div
			class={['screen-frame', { 'has-phone': Boolean(phone) }]}
			style:--min-w="{minimumWidth}px"
		>
			{#each themes as theme (theme.scheme)}
				<picture>
					{#if phone}
						<source
							media={PHONE_MEDIA}
							srcset="{dir}/{phone.name}-{theme.scheme}.{ext}"
							width={phone.width}
							height={phone.height}
						/>
					{/if}
					<img
						src="{dir}/{name}-{theme.scheme}.{ext}"
						{alt}
						{width}
						{height}
						loading={eager ? 'eager' : 'lazy'}
						fetchpriority={eager && theme.scheme === 'light' ? 'high' : 'auto'}
						class="block h-auto w-full {theme.imgClass}"
					/>
				</picture>
			{/each}
		</div>
	</div>
	<figcaption
		class="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-0 text-sm text-foreground"
	>
		<span
			>{caption}{#if !phone}<span class="block text-xs sm:hidden"
					>Swipe to explore the screen.</span
				>{/if}</span
		>
		{#each themes as theme (theme.scheme)}
			<a
				href="{dir}/{name}-{theme.scheme}.{ext}"
				target="_blank"
				rel="noopener noreferrer"
				class="min-h-11 items-center gap-2 rounded-md font-medium underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring {theme.scheme ===
				'light'
					? 'inline-flex dark:hidden'
					: 'hidden dark:inline-flex'}"
				aria-label={`Open full-size screenshot: ${caption} (new tab)`}
				>Full size<Maximize2 class="h-3.5 w-3.5" aria-hidden="true" /></a
			>
		{/each}
	</figcaption>
</figure>

<style>
	.screen-frame {
		min-width: var(--min-w);
	}
	/* With a phone capture there is nothing to pan on small screens. */
	@media (max-width: 639px) {
		.screen-frame.has-phone {
			min-width: 0;
		}
	}
</style>
