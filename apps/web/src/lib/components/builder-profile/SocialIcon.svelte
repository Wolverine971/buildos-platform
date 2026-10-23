<!-- apps/web/src/lib/components/builder-profile/SocialIcon.svelte -->
<!-- The icon for a social link, picked from the URL's host. Lucide where it has the
     brand; small monochrome glyphs for the rest. -->
<script lang="ts">
	import { Facebook, Github, Globe, Instagram, Linkedin, Youtube } from '$lib/icons/lucide';
	import type { SocialPlatform } from '$lib/builder-profile/links';

	let { platform, class: className = 'h-[18px] w-[18px]' }: { platform: SocialPlatform; class?: string } =
		$props();

	const lucide = {
		linkedin: Linkedin,
		instagram: Instagram,
		youtube: Youtube,
		github: Github,
		facebook: Facebook,
		website: Globe
	} as const;
	const LucideIcon = $derived(
		platform in lucide ? lucide[platform as keyof typeof lucide] : null
	);
</script>

{#if LucideIcon}
	<LucideIcon class={className} aria-hidden="true" />
{:else}
	<svg
		class={className}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		{#if platform === 'x'}
			<path d="M4 4l16 16M20 4L4 20" />
		{:else if platform === 'tiktok'}
			<path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5" /><path d="M14 3c.5 2.6 2.4 4.4 5 4.6" />
		{:else if platform === 'substack'}
			<path d="M5 4h14M5 8h14M5 12h14v8l-7-4-7 4z" />
		{:else if platform === 'threads'}
			<path
				d="M16.5 11.5c-.3-2.6-2-4-4.4-4-2.7 0-4.4 1.9-4.4 4.6 0 2.8 1.8 4.6 4.6 4.6 2.1 0 3.6-1 3.9-2.7.4-2.2-1.6-3.2-4-2.9-1.6.2-2.5 1-2.4 2"
			/><path d="M19 12c0 4.4-2.8 8-7 8s-7-3.4-7-8 2.8-8 7-8c3.2 0 5.5 1.8 6.4 4.6" />
		{:else if platform === 'bluesky'}
			<path d="M12 11c-1.5-3-5-6.5-7-6.5-1.5 0-1 3 0 6 .8 2.4 3 3 5 2.7-3 .6-4 2.3-2 4.3 2.5 2.4 3.6-.7 4-2.5.4 1.8 1.5 4.9 4 2.5 2-2 1-3.7-2-4.3 2 .3 4.2-.3 5-2.7 1-3 1.5-6 0-6-2 0-5.5 3.5-7 6.5z" />
		{:else if platform === 'medium'}
			<circle cx="7" cy="12" r="4" /><ellipse cx="15.5" cy="12" rx="2" ry="4" /><path d="M20.5 8v8" />
		{:else}
			<circle cx="12" cy="12" r="9" />
		{/if}
	</svg>
{/if}
