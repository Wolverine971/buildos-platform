<!-- apps/web/src/lib/components/project/ProjectHeaderCard.svelte -->
<script lang="ts">
	import { ArrowLeftRight, MoreHorizontal } from 'lucide-svelte';
	import NextStepDisplay from '$lib/components/project/NextStepDisplay.svelte';
	import ProjectIcon from '$lib/components/project/ProjectIcon.svelte';
	import type { Project } from '$lib/types/onto';
	import type { EntityReference } from '@buildos/shared-types';

	type HeaderProject = Pick<
		Project,
		| 'id'
		| 'name'
		| 'description'
		| 'icon_svg'
		| 'icon_concept'
		| 'next_step_short'
		| 'next_step_long'
		| 'next_step_source'
		| 'next_step_updated_at'
	>;

	type MenuPosition = {
		top: number;
		right: number;
	};

	type ViewToggle = {
		label: string;
		href: string;
		title?: string;
	};

	let {
		project,
		showMobileMenu,
		onOpenMenu,
		onEntityClick,
		onNextStepGenerated,
		viewToggle
	}: {
		project: HeaderProject;
		showMobileMenu: boolean;
		onOpenMenu: (position: MenuPosition) => void;
		onEntityClick: (ref: EntityReference) => void;
		onNextStepGenerated: () => void | Promise<void>;
		/** Optional toggle link rendered next to the menu button (e.g. "Classic view"). */
		viewToggle?: ViewToggle;
	} = $props();

	function handleOpenMenu(event: MouseEvent) {
		const button = event.currentTarget as HTMLButtonElement | null;
		if (!button || typeof window === 'undefined') return;
		const rect = button.getBoundingClientRect();
		onOpenMenu({
			top: rect.bottom + 4,
			right: window.innerWidth - rect.right
		});
	}
</script>

<header class="mx-auto max-w-7xl px-2 sm:px-4 lg:px-6 pt-2 sm:pt-4 lg:pt-6">
	<div
		class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak p-3 sm:p-4 space-y-1 sm:space-y-3"
	>
		<div class="flex items-center justify-between gap-1.5 sm:gap-2">
			<div class="flex items-center gap-1.5 sm:gap-3 min-w-0">
				<ProjectIcon
					svg={project.icon_svg ?? null}
					concept={project.icon_concept ?? null}
					size="md"
				/>
				<div class="min-w-0">
					<h1
						class="text-lg sm:text-xl font-semibold text-foreground leading-tight line-clamp-1 sm:line-clamp-2"
						style:view-transition-name="project-title-{project.id}"
						style:view-transition-class="project-title"
					>
						{project.name || 'Untitled Project'}
					</h1>
					{#if project.description}
						<p
							class="text-xs text-muted-foreground mt-0.5 line-clamp-2 hidden sm:block"
							title={project.description}
						>
							{project.description}
						</p>
					{/if}
				</div>
			</div>

			<div class="flex items-center gap-1.5 shrink-0">
				{#if viewToggle}
					<a
						href={viewToggle.href}
						title={viewToggle.title ?? viewToggle.label}
						class="hidden sm:inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-border/60 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted/40 transition-colors pressable focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<ArrowLeftRight class="w-4 h-4" />
						{viewToggle.label}
					</a>
					<a
						href={viewToggle.href}
						title={viewToggle.title ?? viewToggle.label}
						aria-label={viewToggle.title ?? viewToggle.label}
						class="sm:hidden inline-flex items-center justify-center h-8 w-8 rounded-lg hover:bg-muted transition-colors pressable text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<ArrowLeftRight class="w-4 h-4" />
					</a>
				{/if}
				<button
					onclick={handleOpenMenu}
					class="inline-flex items-center justify-center h-8 w-8 rounded-lg hover:bg-muted transition-colors pressable text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					aria-label="Project options"
					aria-haspopup="menu"
					aria-expanded={showMobileMenu}
				>
					<MoreHorizontal class="w-4 h-4" />
				</button>
			</div>
		</div>

		<NextStepDisplay
			projectId={project.id}
			nextStepShort={project.next_step_short}
			nextStepLong={project.next_step_long}
			nextStepSource={project.next_step_source}
			nextStepUpdatedAt={project.next_step_updated_at}
			{onEntityClick}
			{onNextStepGenerated}
		/>
	</div>
</header>
