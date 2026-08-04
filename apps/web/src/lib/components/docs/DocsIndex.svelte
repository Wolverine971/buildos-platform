<!-- apps/web/src/lib/components/docs/DocsIndex.svelte -->
<script lang="ts">
	import {
		ArrowRight,
		Bell,
		BookOpen,
		Brain,
		Calendar,
		FolderOpen,
		Layers,
		Mail,
		MessageSquare,
		Plug,
		Zap,
		type Icon
	} from '$lib/icons/lucide';
	import type { DocSectionMeta } from '$lib/utils/docs';

	let { sections }: { sections: DocSectionMeta[] } = $props();

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

	type FeaturedPath = {
		label: string;
		title: string;
		description: string;
		href: string;
		icon: Icon;
		primarySlug: string;
		secondarySlugs: string[];
		texture?: string;
	};

	const FEATURED_PATHS: FeaturedPath[] = [
		{
			label: 'First steps',
			title: 'New to BuildOS',
			description: 'Create your first project and learn the model that connects your work.',
			href: '/docs/getting-started',
			icon: Zap,
			primarySlug: 'getting-started',
			secondarySlugs: ['ontology'],
			texture: 'tx tx-bloom tx-weak'
		},
		{
			label: 'Daily work',
			title: 'Move work forward',
			description:
				'Capture messy thinking, work with the agent, plan tasks, and protect time.',
			href: '/docs/brain-dump',
			icon: Brain,
			primarySlug: 'brain-dump',
			secondarySlugs: ['agentic-chat', 'projects-tasks-plans', 'calendar', 'daily-briefs']
		},
		{
			label: 'Agents & API',
			title: 'Connect external agents',
			description: 'Give Claude Code, OpenClaw, or a custom client scoped project context.',
			href: '/docs/connect-agents',
			icon: Plug,
			primarySlug: 'connect-agents',
			secondarySlugs: ['reference'],
			texture: 'tx tx-thread tx-weak'
		}
	];

	type SectionGroup = {
		title: string;
		description: string;
		slugs: string[];
	};

	const SECTION_GROUPS: SectionGroup[] = [
		{
			title: 'Start here',
			description: 'Create your first project and understand how BuildOS organizes it.',
			slugs: ['getting-started', 'ontology']
		},
		{
			title: 'Everyday workflows',
			description: 'Capture work, move it forward, and keep the loop visible.',
			slugs: [
				'brain-dump',
				'agentic-chat',
				'projects-tasks-plans',
				'calendar',
				'daily-briefs',
				'notifications'
			]
		},
		{
			title: 'Extend & reference',
			description: 'Connect agents and find supporting reference material.',
			slugs: ['connect-agents', 'reference']
		}
	];

	const bySlug = $derived(new Map(sections.map((section) => [section.slug, section])));

	function sectionFor(slug: string): DocSectionMeta | undefined {
		return bySlug.get(slug);
	}

	function sectionsFor(group: SectionGroup): DocSectionMeta[] {
		return group.slugs
			.map((slug) => bySlug.get(slug))
			.filter((section): section is DocSectionMeta => Boolean(section));
	}

	function secondarySectionsFor(path: FeaturedPath): DocSectionMeta[] {
		return path.secondarySlugs
			.map((slug) => bySlug.get(slug))
			.filter((section): section is DocSectionMeta => Boolean(section));
	}
</script>

<header
	class="mb-10 rounded-lg border border-border bg-card p-5 shadow-ink tx tx-frame tx-weak sm:p-8"
>
	<div class="flex flex-col items-start gap-5 sm:flex-row sm:gap-6">
		<div
			class="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent sm:h-14 sm:w-14"
		>
			<BookOpen class="h-6 w-6 sm:h-7 sm:w-7" aria-hidden="true" />
		</div>

		<div class="min-w-0 max-w-3xl">
			<p class="micro-label mb-3 text-accent">BuildOS documentation</p>
			<h1
				class="text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl md:text-5xl"
			>
				Start with a project. Learn the model when you need it.
			</h1>
			<p class="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
				Turn messy project context into structured work, operate on it with the agent, and
				connect outside tools when the work needs more leverage.
			</p>

			<a
				href="/docs/getting-started"
				class="pressable mt-6 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-accent bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow-ink transition-colors hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card motion-reduce:transition-none"
			>
				Read getting started
				<ArrowRight class="h-4 w-4 shrink-0" aria-hidden="true" />
			</a>
		</div>
	</div>
</header>

<section class="mb-10" aria-labelledby="paths-heading">
	<header class="mb-5 max-w-2xl">
		<p class="micro-label mb-2 text-accent">Find your path</p>
		<h2 id="paths-heading" class="text-2xl font-semibold text-foreground sm:text-3xl">
			What are you trying to do?
		</h2>
		<p class="mt-2 text-sm text-muted-foreground sm:text-base">
			Start at the top if you are new, or jump straight to the workflow you need.
		</p>
	</header>

	<div class="grid grid-cols-1 gap-3 lg:grid-cols-3">
		{#each FEATURED_PATHS as path (path.href)}
			{@const PathIcon = path.icon}
			{@const primarySection = sectionFor(path.primarySlug)}
			{@const secondarySections = secondarySectionsFor(path)}
			<article
				class="flex h-full flex-col rounded-lg border border-border bg-card p-5 shadow-ink {path.texture ??
					''}"
			>
				<div class="mb-4 flex items-start justify-between gap-4">
					<div class="min-w-0">
						<p class="micro-label mb-2 text-accent">{path.label}</p>
						<h3 class="text-lg font-semibold text-foreground">{path.title}</h3>
					</div>
					<span
						class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent"
					>
						<PathIcon class="h-5 w-5" aria-hidden="true" />
					</span>
				</div>

				<p class="mb-4 text-sm leading-relaxed text-muted-foreground">{path.description}</p>

				<a
					href={path.href}
					class="pressable inline-flex min-h-[44px] w-full items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
				>
					<span class="truncate">{primarySection?.title ?? 'Open guide'}</span>
					<ArrowRight class="h-4 w-4 shrink-0" aria-hidden="true" />
				</a>

				{#if secondarySections.length > 0}
					<div class="mt-4 border-t border-border pt-3">
						<p class="micro-label mb-1.5">Then explore</p>
						<div class="flex flex-wrap gap-1">
							{#each secondarySections as section (section.slug)}
								<a
									href={'/docs/' + section.slug}
									class="inline-flex min-h-[44px] min-w-0 items-center rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
								>
									<span class="truncate">{section.title}</span>
								</a>
							{/each}
						</div>
					</div>
				{/if}
			</article>
		{/each}
	</div>
</section>

<section aria-labelledby="sections-heading">
	<header class="mb-6 max-w-2xl">
		<p class="micro-label mb-2 text-accent">Documentation library</p>
		<h2 id="sections-heading" class="text-2xl font-semibold text-foreground sm:text-3xl">
			All guides
		</h2>
		<p class="mt-2 text-sm text-muted-foreground sm:text-base">
			Every guide is organized around something you can understand or change.
		</p>
	</header>

	<div class="space-y-8">
		{#each SECTION_GROUPS as group (group.title)}
			{@const groupSections = sectionsFor(group)}
			<div>
				<header class="mb-3">
					<h3 class="text-base font-semibold text-foreground sm:text-lg">
						{group.title}
					</h3>
					<p class="mt-1 text-sm text-muted-foreground">{group.description}</p>
				</header>

				<div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
					{#each groupSections as section (section.slug)}
						{@const SectionIcon = ICONS[section.icon] ?? BookOpen}
						<a
							href={'/docs/' + section.slug}
							class="group flex min-h-[76px] min-w-0 items-start gap-3 rounded-lg border border-border bg-card p-3.5 transition-colors hover:border-accent/40 hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none"
						>
							<span
								class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-foreground transition-colors group-hover:bg-accent/10 group-hover:text-accent motion-reduce:transition-none"
							>
								<SectionIcon class="h-4 w-4" aria-hidden="true" />
							</span>
							<span class="min-w-0 flex-1">
								<span
									class="block truncate text-sm font-semibold text-foreground transition-colors group-hover:text-accent motion-reduce:transition-none"
								>
									{section.title}
								</span>
								<span
									class="mt-0.5 block line-clamp-2 text-xs leading-snug text-muted-foreground"
								>
									{section.summary}
								</span>
							</span>
							<ArrowRight
								class="mt-1 h-4 w-4 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-accent motion-reduce:transition-none"
								aria-hidden="true"
							/>
						</a>
					{/each}
				</div>
			</div>
		{/each}
	</div>
</section>
