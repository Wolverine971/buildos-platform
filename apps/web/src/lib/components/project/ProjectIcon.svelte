<!-- apps/web/src/lib/components/project/ProjectIcon.svelte -->
<script lang="ts">
	import { FolderOpen } from 'lucide-svelte';

	type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

	interface Props {
		svg?: string | null;
		concept?: string | null;
		size?: IconSize;
		class?: string;
	}

	let { svg = null, concept = null, size = 'md', class: className = '' }: Props = $props();

	const sizeClasses = $derived.by(() => {
		switch (size) {
			case 'xs':
				return { wrapper: 'h-6 w-6 rounded-md', icon: 'h-3.5 w-3.5' };
			case 'sm':
				return { wrapper: 'h-7 w-7 rounded-md', icon: 'h-4 w-4' };
			case 'lg':
				return { wrapper: 'h-12 w-12 rounded-xl', icon: 'h-6 w-6' };
			case 'xl':
				return { wrapper: 'h-16 w-16 rounded-xl', icon: 'h-8 w-8' };
			case 'md':
			default:
				return { wrapper: 'h-9 w-9 rounded-lg', icon: 'h-5 w-5' };
		}
	});

	const safeSvg = $derived.by(() => {
		if (!svg) return null;
		const trimmed = svg.trim();

		if (!trimmed.startsWith('<svg') || !trimmed.endsWith('</svg>')) {
			return null;
		}

		const blockedPattern = /<script|<foreignObject|on[a-z]+\s*=|javascript:/i;
		if (blockedPattern.test(trimmed)) {
			return null;
		}

		return trimmed;
	});
</script>

<div
	class="project-icon inline-flex items-center justify-center shrink-0 overflow-hidden border border-border/70 bg-muted/30 text-foreground/90 {sizeClasses.wrapper} {className}"
	title={concept ?? 'Project icon'}
	aria-hidden="true"
>
	{#if safeSvg}
		<span class="project-icon-svg" aria-hidden="true">
			{@html safeSvg}
		</span>
	{:else}
		<FolderOpen class="{sizeClasses.icon} text-muted-foreground" aria-hidden="true" />
	{/if}
</div>

<style>
	.project-icon-svg {
		display: inline-flex;
		width: 100%;
		height: 100%;
		align-items: center;
		justify-content: center;
		color: hsl(var(--foreground) / 0.95);
	}

	.project-icon-svg :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
