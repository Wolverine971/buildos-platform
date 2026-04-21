<!-- apps/web/src/lib/components/docs/DocsIndex.svelte -->
<script lang="ts">
	import {
		ArrowRight,
		Bell,
		BookOpen,
		Brain,
		Calendar,
		CalendarClock,
		FolderOpen,
		Layers,
		Mail,
		MessageSquare,
		Network,
		Plug,
		Puzzle,
		Sparkles,
		Zap,
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

	type CapabilityGroup = {
		title: string;
		icon: typeof IconType;
		items: string[];
	};

	const CAPABILITY_GROUPS: CapabilityGroup[] = [
		{
			title: 'Capture',
			icon: Brain,
			items: [
				'Plain-language project creation',
				'Brain dumps and voice notes',
				'Files, images, and OCR-backed assets'
			]
		},
		{
			title: 'Organize',
			icon: Network,
			items: [
				'Goals, milestones, plans, tasks, and documents',
				'Risks, events, and people connected to the work',
				'Task and document hierarchy inside each project'
			]
		},
		{
			title: 'Execute',
			icon: CalendarClock,
			items: [
				'Calendar-aware scheduling and rescheduling',
				'Daily briefs by app, email, and SMS',
				'Notifications across the channels that matter'
			]
		},
		{
			title: 'Think',
			icon: Sparkles,
			items: [
				'Project health audits',
				'Forecasting for risk and slippage',
				'Web research when outside context is needed'
			]
		},
		{
			title: 'Extend',
			icon: Puzzle,
			items: [
				'Claude Code, OpenClaw, or custom agents',
				'Scoped JSON-RPC access',
				'Read-only or read-write keys by project'
			]
		}
	];

	type FeaturedPath = {
		label: string;
		title: string;
		description: string;
		href: string;
		icon: typeof IconType;
		primarySlug?: string;
		secondarySlugs: string[];
		texture?: string;
	};

	const FEATURED_PATHS: FeaturedPath[] = [
		{
			label: 'Start',
			title: 'New to BuildOS',
			description:
				'Create your first project and learn the graph model that everything uses.',
			href: '/docs/getting-started',
			icon: Zap,
			primarySlug: 'getting-started',
			secondarySlugs: ['ontology'],
			texture: 'tx tx-bloom tx-weak'
		},
		{
			label: 'Operate',
			title: 'Move real work forward',
			description:
				'Capture messy thinking, work with the agent, plan tasks, and protect time.',
			href: '/docs/brain-dump',
			icon: Brain,
			primarySlug: 'brain-dump',
			secondarySlugs: ['agentic-chat', 'projects-tasks-plans', 'calendar', 'daily-briefs']
		},
		{
			label: 'Extend',
			title: 'Connect external agents',
			description:
				'Let Claude Code, OpenClaw, or a custom client work against your ontology.',
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
			description: 'The shortest path to understanding the product and the graph model.',
			slugs: ['getting-started', 'ontology']
		},
		{
			title: 'Everyday workflows',
			description: 'Capture work, move it forward, and let BuildOS keep the loop visible.',
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
			description:
				'Plug external agents into your ontology and find supporting reference material.',
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

<!-- Hero -->
<header class="mb-10 sm:mb-12 rounded-lg border border-border bg-muted atmo atmo-med rim-accent">
	<div class="px-5 py-8 sm:px-8 sm:py-10 text-center">
		<div class="flex justify-center mb-5">
			<div
				class="flex-shrink-0 rounded-lg border border-border bg-card shadow-ink w-16 h-16 flex items-center justify-center tx tx-bloom tx-weak"
			>
				<video
					src="/onboarding-assets/animations/brain-bolt-electric.mp4"
					class="w-12 h-12"
					autoplay
					loop
					muted
					playsinline
					aria-label="BuildOS Icon"
				></video>
			</div>
		</div>

		<p class="text-xs sm:text-sm font-semibold text-accent mb-3">BuildOS documentation</p>
		<h1
			class="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground tracking-tight leading-tight max-w-4xl mx-auto"
		>
			Start with the model. Then choose the workflow.
		</h1>
		<p
			class="mt-4 text-sm sm:text-base text-muted-foreground leading-relaxed max-w-2xl mx-auto"
		>
			Use these docs to turn messy project context into a working graph, operate on it with
			AI, and connect outside agents when the work needs more leverage.
		</p>

		<div
			class="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3"
		>
			<a
				href="/docs/getting-started"
				class="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground shadow-ink pressable transition-opacity hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
			>
				<Zap class="w-4 h-4" aria-hidden="true" />
				Start here
			</a>
			<a
				href="/docs/ontology"
				class="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground shadow-ink pressable transition-colors hover:border-accent hover:bg-accent/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
			>
				<Layers class="w-4 h-4" aria-hidden="true" />
				Learn the ontology
			</a>
		</div>
	</div>
</header>

<!-- Choose a path -->
<section class="mb-10 sm:mb-12" aria-labelledby="paths-heading">
	<header class="text-center mb-6">
		<h2 id="paths-heading" class="text-2xl sm:text-3xl font-bold text-foreground mb-2">
			Choose the path you need
		</h2>
		<p class="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto">
			Start at the top if you are new. Jump to the workflow when you already know what you are
			trying to do.
		</p>
	</header>

	<div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
		{#each FEATURED_PATHS as path}
			{@const PathIcon = path.icon}
			{@const primarySection = path.primarySlug ? sectionFor(path.primarySlug) : undefined}
			<article class="p-5 sm:p-6 wt-card sp-block {path.texture ?? ''}">
				<div class="flex items-start justify-between gap-4 mb-4">
					<div>
						<p class="text-xs font-semibold text-accent mb-2">{path.label}</p>
						<h3 class="text-lg font-bold text-foreground">{path.title}</h3>
					</div>
					<span
						class="inline-flex w-10 h-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent"
					>
						<PathIcon class="w-5 h-5" aria-hidden="true" />
					</span>
				</div>

				<p class="text-sm text-muted-foreground leading-relaxed mb-4">{path.description}</p>

				<a
					href={path.href}
					class="inline-flex items-center gap-2 text-sm font-semibold text-foreground hover:text-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
				>
					{primarySection?.title ?? 'Open guide'}
					<ArrowRight class="w-3.5 h-3.5" aria-hidden="true" />
				</a>

				{#if secondarySectionsFor(path).length > 0}
					<div class="mt-4 flex flex-wrap gap-2">
						{#each secondarySectionsFor(path) as section}
							<a
								href={'/docs/' + section.slug}
								class="rounded border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-accent/40 hover:text-foreground"
							>
								{section.title}
							</a>
						{/each}
					</div>
				{/if}
			</article>
		{/each}
	</div>
</section>

<!-- What BuildOS can do -->
<section class="mb-10 sm:mb-12" aria-labelledby="capabilities-heading">
	<header class="text-center mb-6">
		<h2 id="capabilities-heading" class="text-2xl sm:text-3xl font-bold text-foreground mb-2">
			Capability map
		</h2>
		<p class="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto">
			BuildOS is one project graph with several ways to capture, organize, execute, think, and
			extend.
		</p>
	</header>

	<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
		{#each CAPABILITY_GROUPS as group}
			{@const GroupIcon = group.icon}
			<article class="p-4 wt-paper sp-inline">
				<div class="flex items-center gap-2 mb-3">
					<span
						class="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-accent/10 text-accent"
					>
						<GroupIcon class="w-4 h-4" aria-hidden="true" />
					</span>
					<h3 class="text-sm font-semibold text-foreground">{group.title}</h3>
				</div>
				<ul class="space-y-1.5">
					{#each group.items as item}
						<li class="flex gap-2 text-xs text-muted-foreground leading-relaxed">
							<span
								class="text-accent/70 flex-shrink-0 select-none"
								aria-hidden="true">•</span
							>
							<span>{item}</span>
						</li>
					{/each}
				</ul>
			</article>
		{/each}
	</div>
</section>

<!-- Sections, grouped -->
<section aria-labelledby="sections-heading">
	<header class="text-center mb-6">
		<h2 id="sections-heading" class="text-2xl sm:text-3xl font-bold text-foreground mb-2">
			Read the docs
		</h2>
		<p class="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto">
			Every guide is organized around what you are trying to understand or change.
		</p>
	</header>

	<div class="space-y-8">
		{#each SECTION_GROUPS as group}
			<div>
				<header class="mb-3">
					<h3 class="text-base sm:text-lg font-semibold text-foreground">
						{group.title}
					</h3>
					<p class="text-sm text-muted-foreground">{group.description}</p>
				</header>

				<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
					{#each sectionsFor(group) as section}
						{@const Icon = ICONS[section.icon] ?? BookOpen}
						<a
							href={'/docs/' + section.slug}
							class="group flex items-start gap-3 bg-card border border-border rounded-lg hover:shadow-ink hover:border-accent/40 transition-all duration-200 p-3.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
						>
							<span
								class="flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded bg-muted text-foreground group-hover:bg-accent/10 group-hover:text-accent transition-colors"
							>
								<Icon class="w-4 h-4" aria-hidden="true" />
							</span>
							<span class="min-w-0 flex-1">
								<span
									class="block text-sm font-semibold text-foreground group-hover:text-accent transition-colors truncate"
								>
									{section.title}
								</span>
								<span
									class="block text-xs text-muted-foreground leading-snug line-clamp-2 mt-0.5"
								>
									{section.summary}
								</span>
							</span>
							<ArrowRight
								class="w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0 mt-1 group-hover:text-accent group-hover:translate-x-0.5 transition-all"
							/>
						</a>
					{/each}
				</div>
			</div>
		{/each}
	</div>
</section>
