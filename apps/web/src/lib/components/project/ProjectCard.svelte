<!-- apps/web/src/lib/components/project/ProjectCard.svelte -->
<!--
	ProjectCard - Unified card for owned and shared projects

	Extracted from +page.svelte to eliminate ~200 lines of duplication.
	Handles both owned and shared project display with conditional badge.

	Features:
	- Responsive design (mobile compact, desktop full)
	- View transition support for smooth navigation
	- Non-zero stats only display
	- Shared badge with role indicator

	Usage:
	<ProjectCard {project} {onProjectClick} {getStateBadgeClasses} />
	<ProjectCard {project} isShared {onProjectClick} {getStateBadgeClasses} />
-->
<script lang="ts">
	import type { OntologyProjectSummary } from '$lib/services/ontology/ontology-projects.service';
	import ProjectCardNextStep from './ProjectCardNextStep.svelte';
	import ProjectIcon from './ProjectIcon.svelte';
	import { ListChecks, Target, Calendar, FileText } from 'lucide-svelte';

	interface Props {
		project: OntologyProjectSummary;
		isShared?: boolean;
		onProjectClick: (project: OntologyProjectSummary) => void;
		getStateBadgeClasses: (state: string) => string;
	}

	let { project, isShared = false, onProjectClick, getStateBadgeClasses }: Props = $props();

	// Build stats array with non-zero counts only
	const projectStats = $derived(
		[
			{ key: 'tasks', count: project.task_count, Icon: ListChecks },
			{ key: 'goals', count: project.goal_count, Icon: Target },
			{ key: 'plans', count: project.plan_count, Icon: Calendar },
			{ key: 'docs', count: project.document_count, Icon: FileText }
		].filter((s) => s.count > 0)
	);

	// Mobile: limit to 3 stats
	const mobileProjectStats = $derived(projectStats.slice(0, 3));

	// Texture class based on shared status
	const textureClass = $derived(isShared ? 'tx tx-thread tx-weak' : 'tx tx-frame tx-weak');
</script>

<a
	href="/projects/{project.id}"
	onclick={() => onProjectClick(project)}
	class="group relative flex h-full flex-col wt-paper p-2.5 sm:p-4 {textureClass} hover:border-accent/60 pressable"
	style="content-visibility: auto; contain-intrinsic-size: 0 220px;"
>
	<!-- Header - Mobile: Title + inline status, Desktop: Title + Badge -->
	<div class="mb-1.5 sm:mb-3 flex items-start justify-between gap-1.5 sm:gap-3">
		<div class="min-w-0 flex flex-1 items-start gap-2">
			<ProjectIcon svg={project.icon_svg} concept={project.icon_concept} size="sm" />
			<div class="min-w-0 flex-1">
				<h3
					class="text-xs sm:text-base font-semibold text-foreground line-clamp-2 transition-colors group-hover:text-accent leading-snug"
					style:view-transition-name="project-title-{project.id}"
				>
					{project.name}
				</h3>
				<!-- Mobile: Inline badges under title -->
				<div class="flex flex-wrap items-center gap-1 mt-1 sm:hidden">
					<span
						class="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold capitalize {getStateBadgeClasses(
							project.state_key
						)}"
					>
						{project.state_key}
					</span>
					{#if isShared}
						<span
							class="inline-flex items-center rounded-md px-1.5 py-0.5 text-[9px] font-semibold bg-accent/15 text-accent border border-accent/20"
						>
							Shared{project.access_role ? ` · ${project.access_role}` : ''}
						</span>
					{/if}
				</div>
			</div>
		</div>
		<!-- Desktop: Status badge (and shared badge if applicable) -->
		<div class="hidden sm:flex items-center gap-2">
			{#if isShared}
				<span
					class="inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-semibold bg-accent/15 text-accent border border-accent/20"
				>
					Shared{project.access_role ? ` · ${project.access_role}` : ''}
				</span>
			{/if}
			<span
				class="flex-shrink-0 rounded-md border px-2 py-0.5 text-xs font-semibold capitalize {getStateBadgeClasses(
					project.state_key
				)}"
			>
				{project.state_key}
			</span>
		</div>
	</div>

	<!-- Description - Hidden on mobile -->
	{#if project.description}
		<p class="hidden sm:block mb-3 line-clamp-2 text-sm text-muted-foreground leading-relaxed">
			{project.description.length > 120
				? project.description.slice(0, 120) + '...'
				: project.description}
		</p>
	{/if}

	<!-- Next Step - Hidden on mobile for density -->
	{#if project.next_step_short}
		<div class="hidden sm:block">
			<ProjectCardNextStep
				nextStepShort={project.next_step_short}
				nextStepLong={project.next_step_long}
				class="mb-3"
			/>
		</div>
	{/if}

	<!-- Footer Stats - Show non-zero counts, limit on mobile -->
	<div
		class="mt-auto flex items-center justify-between border-t border-border/60 pt-2 sm:pt-3 text-muted-foreground"
	>
		<!-- Mobile: Show up to 3 non-zero stats -->
		<div class="flex sm:hidden items-center gap-2.5 overflow-hidden">
			{#each mobileProjectStats as stat (stat.key)}
				{@const StatIcon = stat.Icon}
				<span class="flex items-center gap-1 shrink-0" title={stat.key}>
					<StatIcon class="h-3 w-3" />
					<span class="font-semibold text-[10px]">{stat.count}</span>
				</span>
			{/each}
			{#if projectStats.length > 3}
				<span class="text-[9px] text-muted-foreground/60">+{projectStats.length - 3}</span>
			{/if}
		</div>

		<!-- Desktop: Full stats (non-zero only) -->
		<div class="hidden sm:flex flex-col gap-1.5 w-full">
			<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
				{#each projectStats as stat (stat.key)}
					{@const StatIcon = stat.Icon}
					<span
						class="flex items-center gap-1"
						aria-label="{stat.key} count"
						title={stat.key}
					>
						<StatIcon class="h-3.5 w-3.5" />
						<span class="font-semibold text-xs">{stat.count}</span>
					</span>
				{/each}
			</div>
			<span class="text-xs text-muted-foreground/60">
				Updated {new Date(project.updated_at).toLocaleDateString()}
			</span>
		</div>
	</div>
</a>
