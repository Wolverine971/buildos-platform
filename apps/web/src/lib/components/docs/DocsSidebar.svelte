<!-- apps/web/src/lib/components/docs/DocsSidebar.svelte -->
<script lang="ts">
	import {
		Bell,
		BookOpen,
		Brain,
		Calendar,
		ChevronDown,
		FolderOpen,
		Layers,
		Mail,
		MessageSquare,
		Plug,
		Zap,
		type Icon
	} from '$lib/icons/lucide';
	import type { DocSectionMeta } from '$lib/utils/docs';

	let {
		sections,
		activeSlug = null
	}: { sections: DocSectionMeta[]; activeSlug?: string | null } = $props();

	const ICONS: Record<string, Icon> = {
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

	const activeTitle = $derived(
		activeSlug
			? (sections.find((section) => section.slug === activeSlug)?.title ?? 'Docs')
			: 'Overview'
	);
</script>

{#snippet sectionLinks()}
	<ul class="space-y-0.5">
		<li>
			<a
				href="/docs"
				class="flex min-h-[44px] min-w-0 items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none {activeSlug ===
				null
					? 'bg-accent/10 font-medium text-accent'
					: 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
				aria-current={activeSlug === null ? 'page' : undefined}
			>
				<BookOpen class="h-4 w-4 shrink-0" aria-hidden="true" />
				<span class="truncate">Overview</span>
			</a>
		</li>
		{#each sections as section (section.slug)}
			{@const SectionIcon = ICONS[section.icon] ?? BookOpen}
			{@const isActive = section.slug === activeSlug}
			<li>
				<a
					href={'/docs/' + section.slug}
					class="flex min-h-[44px] min-w-0 items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none {isActive
						? 'bg-accent/10 font-medium text-accent'
						: 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
					aria-current={isActive ? 'page' : undefined}
				>
					<SectionIcon class="h-4 w-4 shrink-0" aria-hidden="true" />
					<span class="truncate">{section.title}</span>
				</a>
			</li>
		{/each}
	</ul>
{/snippet}

<details class="group rounded-lg border border-border bg-card shadow-ink lg:hidden">
	<summary
		class="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset [&::-webkit-details-marker]:hidden"
	>
		<span class="flex min-w-0 items-center gap-3">
			<span
				class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent"
			>
				<BookOpen class="h-4 w-4" aria-hidden="true" />
			</span>
			<span class="min-w-0">
				<span class="micro-label block">Browse docs</span>
				<span class="mt-0.5 block truncate text-sm font-semibold text-foreground"
					>{activeTitle}</span
				>
			</span>
		</span>
		<ChevronDown
			class="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
			aria-hidden="true"
		/>
	</summary>
	<nav aria-label="Documentation sections" class="border-t border-border p-2">
		{@render sectionLinks()}
	</nav>
</details>

<nav
	aria-label="Documentation sections"
	class="relative hidden rounded-lg border border-border bg-card p-3 shadow-ink tx tx-frame tx-weak lg:block"
>
	<p class="micro-label mb-2 px-2.5">Documentation</p>
	{@render sectionLinks()}
</nav>
