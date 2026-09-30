<!-- apps/web/src/lib/components/project/ProjectChildrenSection.svelte -->
<!--
	"Inside this project" on a hub's Overview: one row per sub-project the viewer
	can open (state + next step), linking to it. Hidden when there are none.
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { ChevronRight, FolderKanban } from '$lib/icons/lucide';
	import { normalizeProjectState, PROJECT_STATE_META } from '$lib/config/project-states';
	import { formatProjectResumeCue } from '$lib/components/projects/project-list';
	import type { ProjectFamilyChildV1 } from '@buildos/shared-types';

	let {
		subProjects,
		totalCount,
		projectId,
		canEdit = false
	}: {
		/** Sub-projects the viewer can open. */
		subProjects: ProjectFamilyChildV1[];
		/** Every sub-project, including ones the viewer can't open. */
		totalCount: number;
		projectId?: string;
		canEdit?: boolean;
	} = $props();

	const hiddenCount = $derived(Math.max(0, totalCount - subProjects.length));
</script>

{#if subProjects.length > 0}
	<section class="min-w-0 border-t border-border pt-4" aria-labelledby="overview-children-title">
		<header class="flex min-w-0 items-center justify-between gap-3 px-1 pb-3">
			<div class="flex min-w-0 items-center gap-2">
				<FolderKanban class="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
				<h2 id="overview-children-title" class="text-sm font-semibold text-foreground">
					Inside this project
				</h2>
			</div>
			<span class="stamp shrink-0 text-2xs font-medium text-muted-foreground">
				{subProjects.length}
			</span>
		</header>

		<ul class="grid gap-1 sm:grid-cols-2">
			{#each subProjects as child (child.id)}
				{@const stateLabel =
					PROJECT_STATE_META[normalizeProjectState(child.state_key)].label}
				{@const nextStep = formatProjectResumeCue(child.next_step_short)}
				<li class="min-w-0">
					<a
						href={resolve('/projects/[id]', { id: child.id })}
						class="flex min-h-11 w-full min-w-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset motion-reduce:transition-none pressable"
					>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-semibold text-foreground">
								{child.name || 'Untitled project'}
							</p>
							<p
								class="truncate text-xs text-muted-foreground"
								title={nextStep || undefined}
							>
								{stateLabel}{#if nextStep}<span aria-hidden="true"> · </span><span
										class="sr-only"
										>. Next step:
									</span>{nextStep}{/if}
							</p>
						</div>
						<ChevronRight
							class="h-4 w-4 shrink-0 text-muted-foreground"
							aria-hidden="true"
						/>
					</a>
					{#if projectId && canEdit}
						<a
							href={`${resolve('/projects/[id]/organize', { id: projectId })}?with=${child.id}`}
							class="ml-2.5 inline-flex min-h-9 items-center rounded px-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
							aria-label={`Organize with ${child.name}`}>Organize with…</a
						>
					{/if}
				</li>
			{/each}
		</ul>

		{#if hiddenCount > 0}
			<p class="px-2.5 pt-1 text-xs text-muted-foreground">
				{hiddenCount} more you don't have access to.
			</p>
		{/if}
	</section>
{/if}
