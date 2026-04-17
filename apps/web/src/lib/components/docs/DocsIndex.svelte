<!-- apps/web/src/lib/components/docs/DocsIndex.svelte -->
<script lang="ts">
	import {
		Zap,
		Layers,
		Brain,
		MessageSquare,
		FolderOpen,
		Calendar,
		Mail,
		Bell,
		Plug,
		BookOpen,
		ArrowRight,
		type Icon as IconType
	} from 'lucide-svelte';
	import type { DocSectionMeta } from '$lib/utils/docs';

	let { sections }: { sections: DocSectionMeta[] } = $props();

	const ICONS: Record<string, typeof IconType> = {
		Zap,
		Layers,
		Brain,
		MessageSquare,
		FolderOpen,
		Calendar,
		Mail,
		Bell,
		Plug,
		BookOpen
	};
</script>

<header class="mb-8 sm:mb-10">
	<div class="flex items-center gap-3 mb-4">
		<div
			class="rounded-lg border border-border bg-card shadow-ink w-12 h-12 flex items-center justify-center"
		>
			<video
				src="/onboarding-assets/animations/brain-bolt-electric.mp4"
				class="w-10 h-10"
				autoplay
				loop
				muted
				playsinline
				aria-label="BuildOS Icon"
			></video>
		</div>
		<div>
			<p class="text-xs font-medium uppercase tracking-wider text-muted-foreground">
				BuildOS Docs
			</p>
			<h1 class="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
				Your guide to thinking in BuildOS
			</h1>
		</div>
	</div>
	<p class="text-base text-muted-foreground max-w-2xl">
		BuildOS is a thinking environment for people making complex things. Dump messy thinking,
		let the ontology organize it, and let the agent help you execute. These docs walk through
		every piece.
	</p>
</header>

<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
	{#each sections as section}
		{@const Icon = ICONS[section.icon] ?? BookOpen}
		<a
			href={'/docs/' + section.slug}
			class="group flex flex-col h-full bg-card border border-border rounded-lg shadow-ink hover:shadow-ink-strong hover:border-accent/40 transition-all duration-200 tx tx-frame tx-weak wt-paper p-4 sm:p-5"
		>
			<div class="flex items-center gap-2 text-xs text-muted-foreground mb-2">
				<span
					class="inline-flex items-center justify-center w-6 h-6 rounded bg-muted text-foreground"
				>
					<Icon class="w-3.5 h-3.5" />
				</span>
				<span class="uppercase tracking-wider text-[10px]">
					{String(section.order).padStart(2, '0')}
				</span>
			</div>

			<h2
				class="text-base font-semibold text-foreground mb-1.5 group-hover:text-accent transition-colors"
			>
				{section.title}
			</h2>

			<p class="text-sm text-muted-foreground leading-relaxed flex-1">
				{section.summary}
			</p>

			<span
				class="mt-3 inline-flex items-center gap-1 text-xs text-accent font-medium opacity-0 group-hover:opacity-100 transition-opacity"
			>
				Read <ArrowRight class="w-3 h-3" />
			</span>
		</a>
	{/each}
</div>
