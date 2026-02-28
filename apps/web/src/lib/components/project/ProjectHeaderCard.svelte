<!-- apps/web/src/lib/components/project/ProjectHeaderCard.svelte -->
<script lang="ts">
	import { ArrowLeft, MoreHorizontal } from 'lucide-svelte';
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

	let {
		project,
		showMobileMenu,
		onBack,
		onOpenMenu,
		onEntityClick,
		onNextStepGenerated
	}: {
		project: HeaderProject;
		showMobileMenu: boolean;
		onBack: () => void;
		onOpenMenu: (position: MenuPosition) => void;
		onEntityClick: (ref: EntityReference) => void;
		onNextStepGenerated: () => void | Promise<void>;
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

<header class="mx-auto max-w-screen-2xl px-2 sm:px-4 lg:px-6 pt-2 sm:pt-4">
	<div
		class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak p-3 sm:p-4 space-y-1 sm:space-y-3"
	>
		<div class="flex items-center justify-between gap-1.5 sm:gap-2">
			<div class="flex items-center gap-1.5 sm:gap-3 min-w-0">
				<button
					onclick={onBack}
					class="flex items-center justify-center p-1 sm:p-2 rounded-lg hover:bg-muted transition-colors shrink-0 pressable"
					aria-label="Back to projects"
				>
					<ArrowLeft class="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
				</button>
				<ProjectIcon
					svg={project.icon_svg ?? null}
					concept={project.icon_concept ?? null}
					size="md"
				/>
				<div class="min-w-0">
					<h1
						class="text-sm sm:text-xl font-semibold text-foreground leading-tight line-clamp-1 sm:line-clamp-2"
						style:view-transition-name="project-title-{project.id}"
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
				<button
					onclick={handleOpenMenu}
					class="p-1.5 rounded-lg hover:bg-muted transition-colors pressable"
					aria-label="Project options"
					aria-expanded={showMobileMenu}
				>
					<MoreHorizontal class="w-5 h-5 text-muted-foreground" />
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
