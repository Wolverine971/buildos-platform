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
		Network,
		ClipboardList,
		CalendarClock,
		Sparkles,
		Puzzle,
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
				'Project creation from a plain-language description',
				'Brain dumps and voice notes that write into the graph',
				'Assets (files, images with OCR) attached to the work'
			]
		},
		{
			title: 'Organize',
			icon: Network,
			items: [
				'Project graph: goals, milestones, plans, tasks, documents, risks, events, members',
				'Planning and task structuring from outcomes down to dependencies',
				'Document workspace with project and task-level hierarchy'
			]
		},
		{
			title: 'Execute',
			icon: CalendarClock,
			items: [
				'Calendar management — availability, scheduling, rescheduling',
				'Daily briefs by in-app, email, and SMS',
				'Notifications across in-app, push, email, and SMS'
			]
		},
		{
			title: 'Think',
			icon: Sparkles,
			items: [
				'Project audit — health, blockers, coverage gaps',
				'Project forecast — trajectory, slippage, assumptions',
				'Web research and URL inspection when external context is needed'
			]
		},
		{
			title: 'Extend',
			icon: Puzzle,
			items: [
				'External agents — Claude Code, OpenClaw, or a custom client via JSON-RPC',
				'Per-key scope: read-only or read-write, project-scoped, op-whitelisted',
				'People and profile context for personalization and relationships'
			]
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
			description: 'What BuildOS is, and the model you work with every day.',
			slugs: ['getting-started', 'ontology']
		},
		{
			title: 'Everyday workflows',
			description: 'Capture work, move it forward, and let BuildOS keep you in the loop.',
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
				'Plug external agents into your ontology and find the rest when you need it.',
			slugs: ['connect-agents', 'reference']
		}
	];

	function sectionsFor(group: SectionGroup): DocSectionMeta[] {
		const bySlug = new Map(sections.map((section) => [section.slug, section]));
		return group.slugs
			.map((slug) => bySlug.get(slug))
			.filter((section): section is DocSectionMeta => Boolean(section));
	}
</script>

<!-- Hero -->
<header class="mb-10 sm:mb-12">
	<div class="flex items-start gap-4 mb-5">
		<div
			class="flex-shrink-0 rounded-lg border border-border bg-card shadow-ink w-12 h-12 flex items-center justify-center"
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
		<div class="min-w-0">
			<p class="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
				BuildOS Docs
			</p>
			<h1
				class="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground tracking-tight leading-tight"
			>
				A thinking environment for people making complex things.
			</h1>
		</div>
	</div>

	<div class="max-w-3xl space-y-3 text-base text-muted-foreground leading-relaxed">
		<p>
			BuildOS is a <strong class="text-foreground"
				>graph-based project collaboration system</strong
			>. Every project is a connected graph of goals, milestones, plans, tasks, documents,
			risks, events, and the people involved — one coherent model, not a stack of loose tools.
		</p>
		<p>
			You capture work in plain language. BuildOS structures it into that graph and an in-app
			agent helps you operate on it — auditing health, forecasting risk, scheduling, searching
			the web, and writing back into your projects. External agents like Claude Code can do
			the same through a scoped JSON-RPC gateway.
		</p>
	</div>
</header>

<!-- What BuildOS can do -->
<section class="mb-10 sm:mb-12" aria-labelledby="capabilities-heading">
	<div class="flex items-baseline justify-between mb-4">
		<h2
			id="capabilities-heading"
			class="text-sm font-semibold uppercase tracking-wider text-muted-foreground"
		>
			What BuildOS can do
		</h2>
		<span class="text-xs text-muted-foreground/70">Capability surface</span>
	</div>

	<div class="rounded-lg border border-border bg-card shadow-ink tx tx-grain tx-weak p-5 sm:p-6">
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
			{#each CAPABILITY_GROUPS as group}
				{@const GroupIcon = group.icon}
				<div>
					<div class="flex items-center gap-2 mb-2">
						<span
							class="inline-flex items-center justify-center w-6 h-6 rounded bg-accent/10 text-accent"
						>
							<GroupIcon class="w-3.5 h-3.5" />
						</span>
						<h3 class="text-sm font-semibold text-foreground">{group.title}</h3>
					</div>
					<ul class="space-y-1.5">
						{#each group.items as item}
							<li class="flex gap-2 text-xs text-muted-foreground leading-relaxed">
								<span
									class="text-accent/60 flex-shrink-0 select-none"
									aria-hidden="true">•</span
								>
								<span>{item}</span>
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>
	</div>
</section>

<!-- Sections, grouped -->
<section aria-labelledby="sections-heading">
	<h2
		id="sections-heading"
		class="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4"
	>
		Read the docs
	</h2>

	<div class="space-y-6">
		{#each SECTION_GROUPS as group}
			<div>
				<div class="flex items-baseline justify-between mb-2">
					<h3 class="text-base font-semibold text-foreground">{group.title}</h3>
					<span class="text-xs text-muted-foreground hidden sm:block">
						{group.description}
					</span>
				</div>
				<p class="text-xs text-muted-foreground mb-3 sm:hidden">{group.description}</p>

				<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
					{#each sectionsFor(group) as section}
						{@const Icon = ICONS[section.icon] ?? BookOpen}
						<a
							href={'/docs/' + section.slug}
							class="group flex items-start gap-3 bg-card border border-border rounded-lg hover:shadow-ink hover:border-accent/40 transition-all duration-200 tx tx-frame tx-weak p-3.5"
						>
							<span
								class="flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded bg-muted text-foreground group-hover:bg-accent/10 group-hover:text-accent transition-colors"
							>
								<Icon class="w-4 h-4" />
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
