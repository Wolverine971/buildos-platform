<!-- apps/web/src/lib/components/docs/DocsSidebar.svelte -->
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
		type Icon as IconType
	} from 'lucide-svelte';
	import type { DocSectionMeta } from '$lib/utils/docs';

	let {
		sections,
		activeSlug = null
	}: { sections: DocSectionMeta[]; activeSlug?: string | null } = $props();

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

<nav
	aria-label="Documentation sections"
	class="rounded-lg border border-border bg-card shadow-ink p-4 sm:p-5 relative tx tx-frame tx-weak"
>
	<h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
		Documentation
	</h2>
	<ul class="space-y-0.5">
		<li>
			<a
				href="/docs"
				class="flex items-center gap-2 px-2 py-1.5 text-sm rounded transition-colors {activeSlug ===
				null
					? 'bg-accent/10 text-accent font-medium'
					: 'text-muted-foreground hover:text-foreground hover:bg-muted'}"
			>
				<BookOpen class="w-3.5 h-3.5 flex-shrink-0" />
				Overview
			</a>
		</li>
		{#each sections as section}
			{@const Icon = ICONS[section.icon] ?? BookOpen}
			{@const isActive = section.slug === activeSlug}
			<li>
				<a
					href={'/docs/' + section.slug}
					class="flex items-center gap-2 px-2 py-1.5 text-sm rounded transition-colors {isActive
						? 'bg-accent/10 text-accent font-medium'
						: 'text-muted-foreground hover:text-foreground hover:bg-muted'}"
					aria-current={isActive ? 'page' : undefined}
				>
					<Icon class="w-3.5 h-3.5 flex-shrink-0" />
					<span class="truncate">{section.title}</span>
				</a>
			</li>
		{/each}
	</ul>
</nav>
